
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'inventory_sales_secret';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('Missing DATABASE_URL. Please set it in .env to connect to Neon PostgreSQL.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = 'admin123';
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

function toFloat(v) {
  return Number.parseFloat(v ?? 0) || 0;
}

function toInt(v) {
  return Number.parseInt(v ?? 0, 10) || 0;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthBounds(month, year) {
  const m = toInt(month);
  const y = toInt(year);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  return { start, end };
}

function monthLabel(month, year) {
  return `${pad2(month)}/${year}`;
}

function formatVnd(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(toFloat(value));
}

function normalizeImportItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((i) => ({
      product_id: toInt(i.product_id),
      quantity: toInt(i.quantity),
    }))
    .filter((i) => i.product_id && i.quantity > 0);
}

function normalizeOrderItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((i) => ({
      product_id: toInt(i.product_id),
      quantity: toInt(i.quantity),
      unit_price: toFloat(i.unit_price),
    }))
    .filter((i) => i.product_id && i.quantity > 0);
}

async function resolveOrderCustomer(client, customer_id, customer_name, customer_phone, customer_address) {
  const cleanedName = String(customer_name || '').trim();
  const cleanedPhone = String(customer_phone || '').trim();
  const cleanedAddress = String(customer_address || '').trim();

  const resolvedCustomerId = customer_id ? toInt(customer_id) : null;
  if (resolvedCustomerId) {
    const c = await client.query('SELECT id FROM customers WHERE id = $1', [resolvedCustomerId]);
    if (!c.rowCount) throw new Error('Khách hàng không tồn tại.');
    return {
      customer_id: resolvedCustomerId,
      customer_name: cleanedName || 'Khách lẻ',
      customer_phone: cleanedPhone,
      customer_address: cleanedAddress,
    };
  }

  if (!cleanedName) {
    return {
      customer_id: null,
      customer_name: 'Khách lẻ',
      customer_phone: cleanedPhone,
      customer_address: cleanedAddress,
    };
  }

  const found = cleanedPhone
    ? await client.query('SELECT id FROM customers WHERE phone = $1 AND name = $2 LIMIT 1', [cleanedPhone, cleanedName])
    : null;

  if (found && found.rowCount) {
    return {
      customer_id: found.rows[0].id,
      customer_name: cleanedName,
      customer_phone: cleanedPhone,
      customer_address: cleanedAddress,
    };
  }

  const created = await client.query(
    `INSERT INTO customers (name, phone, address, is_walk_in) VALUES ($1, $2, $3, $4) RETURNING id`,
    [cleanedName, cleanedPhone || '', cleanedAddress || '', true]
  );

  return {
    customer_id: created.rows[0].id,
    customer_name: cleanedName,
    customer_phone: cleanedPhone,
    customer_address: cleanedAddress,
  };
}

function escapePdfText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

async function query(text, params) {
  return pool.query(text, params);
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function createSlugCode(prefix) {
  return `${prefix}${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 900 + 100)}`;
}

function authRequired(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Cần đăng nhập quản lý.' });
  }
  next();
}

function publicProductRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    sale_price: toFloat(row.sale_price),
    current_stock: toInt(row.current_stock),
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name VARCHAR(120) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'manager',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(50),
      address TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      phone VARCHAR(50),
      address TEXT,
      is_walk_in BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      code VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      sale_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      current_stock INTEGER NOT NULL DEFAULT 0,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS imports (
      id SERIAL PRIMARY KEY,
      import_code VARCHAR(80) UNIQUE NOT NULL,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      total_quantity INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS import_items (
      id SERIAL PRIMARY KEY,
      import_id INTEGER NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_code VARCHAR(80) UNIQUE NOT NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name VARCHAR(150) NOT NULL,
      customer_phone VARCHAR(50),
      customer_address TEXT,
      total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      is_paid BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name_snapshot VARCHAR(200) NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      quantity_delta INTEGER NOT NULL,
      ref_type VARCHAR(30) NOT NULL,
      ref_id INTEGER,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_imports_created_at ON imports(created_at);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at ON stock_movements(created_at);
  `);
}

async function addStockMovement(client, { product_id, quantity_delta, ref_type, ref_id = null, note = null }) {
  await client.query(
    `INSERT INTO stock_movements (product_id, quantity_delta, ref_type, ref_id, note)
     VALUES ($1, $2, $3, $4, $5)`,
    [product_id, quantity_delta, ref_type, ref_id, note]
  );
}

async function seedData() {
  const countRes = await query('SELECT COUNT(*)::int AS c FROM products');
  if (countRes.rows[0].c > 0) return;

  let adminUser = await query('SELECT id FROM users WHERE username = $1 LIMIT 1', ['admin']);
  if (adminUser.rowCount === 0) {
    await query(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'manager')`,
      ['admin', ADMIN_HASH, 'Quản lý']
    );
    adminUser = await query('SELECT id FROM users WHERE username = $1 LIMIT 1', ['admin']);
  }

  const supplierRows = await Promise.all([
    query(`INSERT INTO suppliers (name, phone, address) VALUES ($1, $2, $3) RETURNING id`, ['Công ty Minh Phát', '0901234567', 'Hà Nội']),
    query(`INSERT INTO suppliers (name, phone, address) VALUES ($1, $2, $3) RETURNING id`, ['ABC Trading', '0912345678', 'TP. Hồ Chí Minh']),
    query(`INSERT INTO suppliers (name, phone, address) VALUES ($1, $2, $3) RETURNING id`, ['Sakura Supply', '0923456789', 'Đà Nẵng']),
  ]);
  const supplierIds = supplierRows.map((r) => r.rows[0].id);

  const customerRows = await Promise.all([
    query(`INSERT INTO customers (name, phone, address, is_walk_in) VALUES ($1, $2, $3, $4) RETURNING id`, ['Nguyễn Văn An', '0981111111', 'Hà Nội', false]),
    query(`INSERT INTO customers (name, phone, address, is_walk_in) VALUES ($1, $2, $3, $4) RETURNING id`, ['Trần Thị Bình', '0982222222', 'Hải Phòng', false]),
    query(`INSERT INTO customers (name, phone, address, is_walk_in) VALUES ($1, $2, $3, $4) RETURNING id`, ['Khách lẻ', '', '', true]),
  ]);
  const customerId = customerRows[0].rows[0].id;

  const productSeeds = [
    { code: 'SP-001', name: 'Sữa rửa mặt dịu nhẹ', sale_price: 89000, stock: 120, supplier_id: supplierIds[0] },
    { code: 'SP-002', name: 'Kem dưỡng ẩm', sale_price: 125000, stock: 80, supplier_id: supplierIds[1] },
    { code: 'SP-003', name: 'Nước hoa hồng', sale_price: 99000, stock: 150, supplier_id: supplierIds[2] },
    { code: 'SP-004', name: 'Serum phục hồi', sale_price: 189000, stock: 60, supplier_id: supplierIds[0] },
  ];

  const createdProducts = [];
  for (const item of productSeeds) {
    const pr = await query(
      `INSERT INTO products (code, name, sale_price, current_stock, supplier_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [item.code, item.name, item.sale_price, 0, item.supplier_id]
    );
    const productId = pr.rows[0].id;
    createdProducts.push({ id: productId, ...item });

    await query(
      `UPDATE products SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2`,
      [item.stock, productId]
    );
    await query(
      `INSERT INTO stock_movements (product_id, quantity_delta, ref_type, ref_id, note)
       VALUES ($1, $2, $3, $4, $5)`,
      [productId, item.stock, 'seed_import', null, 'Dữ liệu mẫu ban đầu']
    );
    await query(
      `INSERT INTO imports (import_code, supplier_id, imported_by, total_quantity, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [createSlugCode('IM-'), item.supplier_id, adminUser.rows[0].id, item.stock, 'Nhập kho mẫu ban đầu']
    ).then(async (r) => {
      await query(
        `INSERT INTO import_items (import_id, product_id, quantity) VALUES ($1, $2, $3)`,
        [r.rows[0].id, productId, item.stock]
      );
    });
  }

  const orderProductA = createdProducts[0];
  const orderProductB = createdProducts[1];
  const total = orderProductA.sale_price * 2 + orderProductB.sale_price * 1;

  await withTx(async (client) => {
    const orderRes = await client.query(
      `INSERT INTO orders (order_code, customer_id, customer_name, customer_phone, customer_address, total_amount, is_paid, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [createSlugCode('DH-'), customerId, 'Nguyễn Văn An', '0981111111', 'Hà Nội', total, true, adminUser.rows[0].id]
    );
    const orderId = orderRes.rows[0].id;
    const items = [
      { product: orderProductA, qty: 2, price: orderProductA.sale_price },
      { product: orderProductB, qty: 1, price: orderProductB.sale_price },
    ];
    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name_snapshot, quantity, unit_price, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, item.product.id, item.product.name, item.qty, item.price, item.qty * item.price]
      );
      await client.query(
        `UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2`,
        [item.qty, item.product.id]
      );
      await addStockMovement(client, {
        product_id: item.product.id,
        quantity_delta: -item.qty,
        ref_type: 'order',
        ref_id: orderId,
        note: 'Bán mẫu',
      });
    }
  });
}

async function getUserById(id) {
  const r = await query('SELECT id, username, full_name, role FROM users WHERE id = $1', [id]);
  return r.rows[0] || null;
}

app.get('/api/auth/me', async (req, res) => {
  if (!req.session.user) {
    return res.json({ success: true, user: null });
  }
  const user = await getUserById(req.session.user.id);
  if (!user) {
    req.session.destroy(() => {});
    return res.json({ success: true, user: null });
  }
  res.json({ success: true, user });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Thiếu username hoặc password.' });
    }
    const result = await query('SELECT * FROM users WHERE username = $1 LIMIT 1', [username.trim()]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu.' });
    }
    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Sai tài khoản hoặc mật khẩu.' });
    }
    req.session.user = { id: user.id, username: user.username, full_name: user.full_name, role: user.role };
    res.json({
      success: true,
      user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/products', async (req, res) => {
  try {
    const search = (req.query.q || '').trim();
    const result = await query(
      `
      SELECT p.id, p.code, p.name, p.sale_price::float AS sale_price, p.current_stock, p.supplier_id,
             p.created_at, p.updated_at, COALESCE(s.name, '') AS supplier_name
      FROM products p
      LEFT JOIN suppliers s ON s.id = p.supplier_id
      WHERE ($1 = '' OR p.code ILIKE $2 OR p.name ILIKE $2 OR COALESCE(s.name, '') ILIKE $2)
      ORDER BY p.created_at DESC, p.id DESC
      `,
      [search, `%${search}%`]
    );
    res.json({ success: true, products: result.rows.map(publicProductRow) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/products', authRequired, async (req, res) => {
  try {
    const { code, name, sale_price, current_stock = 0, supplier_id = null } = req.body;
    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Mã và tên sản phẩm là bắt buộc.' });
    }
    const stock = toInt(current_stock);
    const price = toFloat(sale_price);
    const result = await withTx(async (client) => {
      const productRes = await client.query(
        `INSERT INTO products (code, name, sale_price, current_stock, supplier_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [code.trim(), name.trim(), price, stock, supplier_id || null]
      );
      const product = productRes.rows[0];
      if (stock !== 0) {
        await addStockMovement(client, {
          product_id: product.id,
          quantity_delta: stock,
          ref_type: 'product_create',
          ref_id: product.id,
          note: 'Khởi tạo tồn kho',
        });
      }
      return product;
    });
    res.json({ success: true, product: publicProductRow(result) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Mã sản phẩm đã tồn tại.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/products/:id', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const { code, name, sale_price, current_stock, supplier_id = null } = req.body;
    const oldRes = await query('SELECT * FROM products WHERE id = $1', [id]);
    const old = oldRes.rows[0];
    if (!old) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });

    const newStock = current_stock === undefined ? old.current_stock : toInt(current_stock);
    const stockDelta = newStock - toInt(old.current_stock);

    const result = await withTx(async (client) => {
      const updated = await client.query(
        `UPDATE products
         SET code = $1, name = $2, sale_price = $3, current_stock = $4, supplier_id = $5, updated_at = NOW()
         WHERE id = $6
         RETURNING *`,
        [
          (code || old.code).trim(),
          (name || old.name).trim(),
          sale_price !== undefined ? toFloat(sale_price) : toFloat(old.sale_price),
          newStock,
          supplier_id === undefined ? old.supplier_id : supplier_id || null,
          id,
        ]
      );
      if (stockDelta !== 0) {
        await addStockMovement(client, {
          product_id: id,
          quantity_delta: stockDelta,
          ref_type: 'product_adjust',
          ref_id: id,
          note: 'Điều chỉnh tồn kho',
        });
      }
      return updated.rows[0];
    });

    res.json({ success: true, product: publicProductRow(result) });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Mã sản phẩm đã tồn tại.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/products/:id', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const del = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
    if (!del.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy sản phẩm.' });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: 'Không thể xóa sản phẩm vì đang được dùng trong lịch sử nhập kho hoặc bán hàng.',
    });
  }
});

app.get('/api/suppliers', authRequired, async (req, res) => {
  try {
    const r = await query('SELECT * FROM suppliers ORDER BY created_at DESC, id DESC');
    res.json({ success: true, suppliers: r.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/suppliers', authRequired, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Tên nhà cung ứng là bắt buộc.' });
    const r = await query(
      `INSERT INTO suppliers (name, phone, address) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), phone || '', address || '']
    );
    res.json({ success: true, supplier: r.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/suppliers/:id', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const { name, phone, address } = req.body;
    const r = await query(
      `UPDATE suppliers SET name = $1, phone = $2, address = $3 WHERE id = $4 RETURNING *`,
      [name.trim(), phone || '', address || '', id]
    );
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy nhà cung ứng.' });
    res.json({ success: true, supplier: r.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/suppliers/:id', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const r = await query('DELETE FROM suppliers WHERE id = $1 RETURNING id', [id]);
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy nhà cung ứng.' });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Không thể xóa vì nhà cung ứng đang được dùng.' });
  }
});

app.get('/api/customers', authRequired, async (req, res) => {
  try {
    const r = await query('SELECT * FROM customers ORDER BY created_at DESC, id DESC');
    res.json({ success: true, customers: r.rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/customers', authRequired, async (req, res) => {
  try {
    const { name, phone, address, is_walk_in = false } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Tên khách hàng là bắt buộc.' });
    const r = await query(
      `INSERT INTO customers (name, phone, address, is_walk_in) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), phone || '', address || '', !!is_walk_in]
    );
    res.json({ success: true, customer: r.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/customers/:id', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const { name, phone, address, is_walk_in = false } = req.body;
    const r = await query(
      `UPDATE customers SET name = $1, phone = $2, address = $3, is_walk_in = $4 WHERE id = $5 RETURNING *`,
      [name.trim(), phone || '', address || '', !!is_walk_in, id]
    );
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });
    res.json({ success: true, customer: r.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/customers/:id', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const r = await query('DELETE FROM customers WHERE id = $1 RETURNING id', [id]);
    if (!r.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy khách hàng.' });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: 'Không thể xóa vì khách hàng đang có hóa đơn.' });
  }
});

async function fetchImportById(id) {
  const result = await query(
    `
    SELECT i.id, i.import_code, i.supplier_id, s.name AS supplier_name, i.imported_by,
           u.full_name AS imported_by_name, i.total_quantity, i.note, i.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'product_id', ii.product_id,
                 'product_name', p.name,
                 'code', p.code,
                 'quantity', ii.quantity
               ) ORDER BY ii.id
             ) FILTER (WHERE ii.id IS NOT NULL),
             '[]'
           ) AS items
    FROM imports i
    JOIN suppliers s ON s.id = i.supplier_id
    LEFT JOIN users u ON u.id = i.imported_by
    LEFT JOIN import_items ii ON ii.import_id = i.id
    LEFT JOIN products p ON p.id = ii.product_id
    WHERE i.id = $1
    GROUP BY i.id, s.name, u.full_name
    `,
    [id]
  );
  if (!result.rowCount) return null;
  const row = result.rows[0];
  return {
    ...row,
    total_quantity: toInt(row.total_quantity),
    items: row.items,
  };
}

async function fetchImports() {
  const result = await query(
    `
    SELECT i.id, i.import_code, i.supplier_id, s.name AS supplier_name, i.imported_by,
           u.full_name AS imported_by_name, i.total_quantity, i.note, i.created_at,
           COALESCE(
             json_agg(
               json_build_object(
                 'product_id', ii.product_id,
                 'product_name', p.name,
                 'code', p.code,
                 'quantity', ii.quantity
               ) ORDER BY ii.id
             ) FILTER (WHERE ii.id IS NOT NULL),
             '[]'
           ) AS items
    FROM imports i
    JOIN suppliers s ON s.id = i.supplier_id
    LEFT JOIN users u ON u.id = i.imported_by
    LEFT JOIN import_items ii ON ii.import_id = i.id
    LEFT JOIN products p ON p.id = ii.product_id
    GROUP BY i.id, s.name, u.full_name
    ORDER BY i.created_at DESC, i.id DESC
    `,
    []
  );
  return result.rows.map((row) => ({
    ...row,
    total_quantity: toInt(row.total_quantity),
    items: row.items,
  }));
}

app.get('/api/imports', authRequired, async (req, res) => {
  try {
    const imports = await fetchImports();
    res.json({ success: true, imports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/imports', authRequired, async (req, res) => {
  try {
    let { supplier_id, product_id, quantity, items, note } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      items = [{ product_id, quantity }];
    }
    const cleanItems = normalizeImportItems(items);
    if (!supplier_id) return res.status(400).json({ success: false, message: 'Vui lòng chọn nhà cung ứng.' });
    if (cleanItems.length === 0) return res.status(400).json({ success: false, message: 'Vui lòng chọn sản phẩm và số lượng.' });

    const result = await withTx(async (client) => {
      const supplierCheck = await client.query('SELECT id FROM suppliers WHERE id = $1', [supplier_id]);
      if (!supplierCheck.rowCount) throw new Error('Nhà cung ứng không tồn tại.');

      const productIds = [...new Set(cleanItems.map((i) => i.product_id))];
      const prodsRes = await client.query(
        `SELECT id, name, current_stock FROM products WHERE id = ANY($1::int[]) FOR UPDATE`,
        [productIds]
      );
      if (prodsRes.rowCount !== productIds.length) throw new Error('Có sản phẩm không tồn tại.');

      const importCode = createSlugCode('IM-');
      const header = await client.query(
        `INSERT INTO imports (import_code, supplier_id, imported_by, total_quantity, note)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [importCode, supplier_id, req.session.user.id, cleanItems.reduce((s, i) => s + i.quantity, 0), note || '']
      );

      const importId = header.rows[0].id;
      for (const item of cleanItems) {
        const prod = prodsRes.rows.find((p) => p.id === item.product_id);
        await client.query(
          `INSERT INTO import_items (import_id, product_id, quantity) VALUES ($1, $2, $3)`,
          [importId, item.product_id, item.quantity]
        );
        await client.query(
          `UPDATE products SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2`,
          [item.quantity, item.product_id]
        );
        await addStockMovement(client, {
          product_id: item.product_id,
          quantity_delta: item.quantity,
          ref_type: 'import',
          ref_id: importId,
          note: `Nhập kho: ${prod.name}`,
        });
      }
      return header.rows[0];
    });

    const created = await fetchImportById(result.id);
    res.json({ success: true, import: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

async function fetchOrders(filter = {}) {
  const { status } = filter;
  const where = [];
  const params = [];
  if (status === 'paid') {
    where.push('o.is_paid = TRUE');
  } else if (status === 'unpaid') {
    where.push('o.is_paid = FALSE');
  }
  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await query(
    `
    SELECT o.id, o.order_code, o.customer_id, o.customer_name, o.customer_phone, o.customer_address,
           o.total_amount::float AS total_amount, o.is_paid, o.created_by, o.created_at,
           COALESCE(json_agg(
             json_build_object(
               'product_id', oi.product_id,
               'product_name', oi.product_name_snapshot,
               'quantity', oi.quantity,
               'unit_price', oi.unit_price::float,
               'line_total', oi.line_total::float
             ) ORDER BY oi.id
           ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    ${sqlWhere}
    GROUP BY o.id
    ORDER BY o.created_at DESC, o.id DESC
    `,
    params
  );
  return result.rows.map((row) => ({ ...row, items: row.items }));
}

app.get('/api/imports/:id', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const importData = await fetchImportById(id);
    if (!importData) return res.status(404).json({ success: false, message: 'Không tìm thấy phiếu nhập.' });
    res.json({ success: true, import: importData });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/imports/:id', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    let { supplier_id, product_id, quantity, items, note } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      items = [{ product_id, quantity }];
    }
    const cleanItems = normalizeImportItems(items);
    if (!supplier_id) return res.status(400).json({ success: false, message: 'Vui lòng chọn nhà cung ứng.' });
    if (cleanItems.length === 0) return res.status(400).json({ success: false, message: 'Vui lòng chọn sản phẩm và số lượng.' });

    await withTx(async (client) => {
      const currentImportRes = await client.query(
        `SELECT id, supplier_id, total_quantity, note FROM imports WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (!currentImportRes.rowCount) throw new Error('Không tìm thấy phiếu nhập.');

      const oldItemsRes = await client.query(
        `SELECT ii.id, ii.product_id, ii.quantity, p.name
         FROM import_items ii
         JOIN products p ON p.id = ii.product_id
         WHERE ii.import_id = $1
         ORDER BY ii.id`,
        [id]
      );
      const oldItems = oldItemsRes.rows;

      const supplierCheck = await client.query('SELECT id FROM suppliers WHERE id = $1', [supplier_id]);
      if (!supplierCheck.rowCount) throw new Error('Nhà cung ứng không tồn tại.');

      const productIds = [...new Set([...oldItems.map((i) => i.product_id), ...cleanItems.map((i) => i.product_id)])];
      const prodsRes = await client.query(
        `SELECT id, name, current_stock FROM products WHERE id = ANY($1::int[]) FOR UPDATE`,
        [productIds]
      );
      if (prodsRes.rowCount !== productIds.length) throw new Error('Có sản phẩm không tồn tại.');

      for (const oldItem of oldItems) {
        const prod = prodsRes.rows.find((p) => p.id === oldItem.product_id);
        if (toInt(prod.current_stock) < toInt(oldItem.quantity)) {
          throw new Error(`Không thể sửa phiếu nhập vì tồn kho hiện tại của "${prod.name}" không đủ để hoàn tác.`);
        }
      }

      for (const oldItem of oldItems) {
        const prod = prodsRes.rows.find((p) => p.id === oldItem.product_id);
        await client.query(
          `UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2`,
          [oldItem.quantity, oldItem.product_id]
        );
        await addStockMovement(client, {
          product_id: oldItem.product_id,
          quantity_delta: -toInt(oldItem.quantity),
          ref_type: 'import_revert',
          ref_id: id,
          note: `Hoàn tác phiếu nhập: ${prod.name}`,
        });
      }

      await client.query(
        `UPDATE imports SET supplier_id = $1, total_quantity = $2, note = $3 WHERE id = $4`,
        [supplier_id, cleanItems.reduce((s, i) => s + i.quantity, 0), note || '', id]
      );
      await client.query(`DELETE FROM import_items WHERE import_id = $1`, [id]);

      for (const item of cleanItems) {
        const prod = prodsRes.rows.find((p) => p.id === item.product_id);
        await client.query(
          `INSERT INTO import_items (import_id, product_id, quantity) VALUES ($1, $2, $3)`,
          [id, item.product_id, item.quantity]
        );
        await client.query(
          `UPDATE products SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2`,
          [item.quantity, item.product_id]
        );
        await addStockMovement(client, {
          product_id: item.product_id,
          quantity_delta: item.quantity,
          ref_type: 'import',
          ref_id: id,
          note: `Cập nhật phiếu nhập: ${prod.name}`,
        });
      }
    });

    const updated = await fetchImportById(id);
    res.json({ success: true, import: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.delete('/api/imports/:id', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    await withTx(async (client) => {
      const currentImportRes = await client.query(
        `SELECT id FROM imports WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (!currentImportRes.rowCount) throw new Error('Không tìm thấy phiếu nhập.');

      const oldItemsRes = await client.query(
        `SELECT ii.id, ii.product_id, ii.quantity, p.name
         FROM import_items ii
         JOIN products p ON p.id = ii.product_id
         WHERE ii.import_id = $1
         ORDER BY ii.id`,
        [id]
      );
      const oldItems = oldItemsRes.rows;

      const productIds = [...new Set(oldItems.map((i) => i.product_id))];
      const prodsRes = await client.query(
        `SELECT id, name, current_stock FROM products WHERE id = ANY($1::int[]) FOR UPDATE`,
        [productIds]
      );
      if (prodsRes.rowCount !== productIds.length) throw new Error('Có sản phẩm không tồn tại.');

      for (const oldItem of oldItems) {
        const prod = prodsRes.rows.find((p) => p.id === oldItem.product_id);
        if (toInt(prod.current_stock) < toInt(oldItem.quantity)) {
          throw new Error(`Không thể xóa phiếu nhập vì tồn kho hiện tại của "${prod.name}" không đủ để hoàn tác.`);
        }
      }

      for (const oldItem of oldItems) {
        const prod = prodsRes.rows.find((p) => p.id === oldItem.product_id);
        await client.query(
          `UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2`,
          [oldItem.quantity, oldItem.product_id]
        );
        await addStockMovement(client, {
          product_id: oldItem.product_id,
          quantity_delta: -toInt(oldItem.quantity),
          ref_type: 'import_revert',
          ref_id: id,
          note: `Xóa phiếu nhập: ${prod.name}`,
        });
      }

      await client.query(`DELETE FROM import_items WHERE import_id = $1`, [id]);
      await client.query(`DELETE FROM imports WHERE id = $1`, [id]);
    });

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
app.get('/api/orders', authRequired, async (req, res) => {
  try {
    const orders = await fetchOrders({ status: req.query.status });
    res.json({ success: true, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/orders/:id', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const orderRes = await query(
      `
      SELECT o.id, o.order_code, o.customer_id, o.customer_name, o.customer_phone, o.customer_address,
             o.total_amount::float AS total_amount, o.is_paid, o.created_by, o.created_at,
             c.name AS customer_db_name, c.phone AS customer_db_phone, c.address AS customer_db_address,
             COALESCE(json_agg(
               json_build_object(
                 'product_id', oi.product_id,
                 'product_name', oi.product_name_snapshot,
                 'quantity', oi.quantity,
                 'unit_price', oi.unit_price::float,
                 'line_total', oi.line_total::float
               ) ORDER BY oi.id
             ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = $1
      GROUP BY o.id, c.name, c.phone, c.address
      `,
      [id]
    );
    if (!orderRes.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn.' });
    res.json({ success: true, order: orderRes.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/orders', authRequired, async (req, res) => {
  try {
    let {
      customer_id = null,
      customer_name = '',
      customer_phone = '',
      customer_address = '',
      items = [],
    } = req.body;

    const cleanItems = normalizeOrderItems(items).map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price || 0,
    }));

    if (cleanItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng thêm ít nhất 1 sản phẩm.' });
    }

    const order = await withTx(async (client) => {
      const customer = await resolveOrderCustomer(client, customer_id, customer_name, customer_phone, customer_address);

      const productIds = [...new Set(cleanItems.map((i) => i.product_id))];
      const productsRes = await client.query(
        `SELECT id, code, name, sale_price::float AS sale_price, current_stock
         FROM products
         WHERE id = ANY($1::int[])
         FOR UPDATE`,
        [productIds]
      );
      if (productsRes.rowCount !== productIds.length) throw new Error('Có sản phẩm không tồn tại.');

      for (const item of cleanItems) {
        const prod = productsRes.rows.find((p) => p.id === item.product_id);
        if (prod.current_stock < item.quantity) {
          throw new Error(`Sản phẩm "${prod.name}" không đủ tồn kho.`);
        }
      }

      const orderCode = createSlugCode('DH-');
      const totalAmount = cleanItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

      const orderRes = await client.query(
        `INSERT INTO orders (order_code, customer_id, customer_name, customer_phone, customer_address, total_amount, is_paid, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          orderCode,
          customer.customer_id,
          customer.customer_name,
          customer.customer_phone,
          customer.customer_address,
          totalAmount,
          false,
          req.session.user.id,
        ]
      );
      const createdOrder = orderRes.rows[0];

      for (const item of cleanItems) {
        const prod = productsRes.rows.find((p) => p.id === item.product_id);
        const lineTotal = item.quantity * item.unit_price;
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name_snapshot, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [createdOrder.id, item.product_id, prod.name, item.quantity, item.unit_price, lineTotal]
        );
        await client.query(
          `UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2`,
          [item.quantity, item.product_id]
        );
        await addStockMovement(client, {
          product_id: item.product_id,
          quantity_delta: -item.quantity,
          ref_type: 'order',
          ref_id: createdOrder.id,
          note: `Bán hàng: ${createdOrder.order_code}`,
        });
      }

      return createdOrder;
    });

    const detail = await query(`SELECT * FROM orders WHERE id = $1`, [order.id]);
    res.json({ success: true, order: detail.rows[0] });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.put('/api/orders/:id', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    let {
      customer_id = null,
      customer_name = '',
      customer_phone = '',
      customer_address = '',
      items = [],
    } = req.body;

    const cleanItems = normalizeOrderItems(items).map((item) => ({
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price || 0,
    }));

    if (cleanItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng thêm ít nhất 1 sản phẩm.' });
    }

    await withTx(async (client) => {
      const currentOrderRes = await client.query(
        `SELECT id, order_code, customer_id, customer_name, customer_phone, customer_address, total_amount, is_paid
         FROM orders
         WHERE id = $1
         FOR UPDATE`,
        [id]
      );
      if (!currentOrderRes.rowCount) throw new Error('Không tìm thấy hóa đơn.');
      const currentOrder = currentOrderRes.rows[0];

      const oldItemsRes = await client.query(
        `SELECT id, product_id, quantity, unit_price, product_name_snapshot
         FROM order_items
         WHERE order_id = $1
         ORDER BY id`,
        [id]
      );
      const oldItems = oldItemsRes.rows;

      const customer = await resolveOrderCustomer(client, customer_id, customer_name, customer_phone, customer_address);

      const productIds = [...new Set([
        ...oldItems.map((i) => i.product_id),
        ...cleanItems.map((i) => i.product_id),
      ])];

      const productsRes = await client.query(
        `SELECT id, name, current_stock
         FROM products
         WHERE id = ANY($1::int[])
         FOR UPDATE`,
        [productIds]
      );
      if (productsRes.rowCount !== productIds.length) throw new Error('Có sản phẩm không tồn tại.');

      // Hoàn tác hóa đơn cũ để trả tồn kho về trạng thái trước khi cập nhật
      for (const oldItem of oldItems) {
        const prod = productsRes.rows.find((p) => p.id === oldItem.product_id);
        await client.query(
          `UPDATE products SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2`,
          [oldItem.quantity, oldItem.product_id]
        );
        await addStockMovement(client, {
          product_id: oldItem.product_id,
          quantity_delta: toInt(oldItem.quantity),
          ref_type: 'order_revert',
          ref_id: id,
          note: `Hoàn tác hóa đơn: ${currentOrder.order_code} - ${prod.name}`,
        });
      }

      for (const item of cleanItems) {
        const prod = productsRes.rows.find((p) => p.id === item.product_id);
        if (toInt(prod.current_stock) < item.quantity) {
          throw new Error(`Sản phẩm "${prod.name}" không đủ tồn kho.`);
        }
      }

      const totalAmount = cleanItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);

      await client.query(
        `UPDATE orders
         SET customer_id = $1,
             customer_name = $2,
             customer_phone = $3,
             customer_address = $4,
             total_amount = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [
          customer.customer_id,
          customer.customer_name,
          customer.customer_phone,
          customer.customer_address,
          totalAmount,
          id,
        ]
      );

      await client.query(`DELETE FROM order_items WHERE order_id = $1`, [id]);

      for (const item of cleanItems) {
        const prod = productsRes.rows.find((p) => p.id === item.product_id);
        const lineTotal = item.quantity * item.unit_price;
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name_snapshot, quantity, unit_price, line_total)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, item.product_id, prod.name, item.quantity, item.unit_price, lineTotal]
        );
        await client.query(
          `UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2`,
          [item.quantity, item.product_id]
        );
        await addStockMovement(client, {
          product_id: item.product_id,
          quantity_delta: -item.quantity,
          ref_type: 'order_update',
          ref_id: id,
          note: `Cập nhật hóa đơn: ${currentOrder.order_code}`,
        });
      }

      if (currentOrder.is_paid) {
        await client.query(`UPDATE orders SET is_paid = TRUE WHERE id = $1`, [id]);
      }
    });

    const detail = await query(`SELECT * FROM orders WHERE id = $1`, [id]);
    res.json({ success: true, order: detail.rows[0] });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.put('/api/orders/:id/pay', authRequired, async (req, res) => {
  try {
    const id = toInt(req.params.id);
    const current = await query('SELECT id, is_paid FROM orders WHERE id = $1', [id]);
    if (!current.rowCount) return res.status(404).json({ success: false, message: 'Không tìm thấy hóa đơn.' });
    const r = await query('UPDATE orders SET is_paid = TRUE WHERE id = $1 RETURNING *', [id]);
    res.json({ success: true, order: r.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/reports/monthly', authRequired, async (req, res) => {
  try {
    const month = toInt(req.query.month || new Date().getMonth() + 1);
    const year = toInt(req.query.year || new Date().getFullYear());
    const { start, end } = monthBounds(month, year);

    const orders = await query(
      `SELECT COUNT(*)::int AS total_orders,
              COALESCE(SUM(total_amount), 0)::float AS total_revenue,
              COALESCE(SUM(CASE WHEN is_paid THEN total_amount ELSE 0 END), 0)::float AS total_paid,
              COALESCE(SUM(CASE WHEN is_paid THEN 0 ELSE total_amount END), 0)::float AS total_unpaid
       FROM orders
       WHERE created_at >= $1 AND created_at < $2`,
      [start, end]
    );

    const imports = await query(
      `
      SELECT COALESCE(SUM(ii.quantity), 0)::int AS total_import_quantity
      FROM imports i
      LEFT JOIN import_items ii ON ii.import_id = i.id
      WHERE i.created_at >= $1 AND i.created_at < $2
      `,
      [start, end]
    );

    const sold = await query(
      `
      SELECT COALESCE(SUM(oi.quantity), 0)::int AS total_sold_quantity
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.created_at >= $1 AND o.created_at < $2
      `,
      [start, end]
    );

    const endStock = await query(
      `
      WITH stock AS (
        SELECT product_id, COALESCE(SUM(quantity_delta), 0)::int AS stock
        FROM stock_movements
        WHERE created_at < $1
        GROUP BY product_id
      )
      SELECT COALESCE(SUM(stock), 0)::int AS ending_stock
      FROM stock
      `,
      [end]
    );

    res.json({
      success: true,
      month,
      year,
      report: {
        total_orders: toInt(orders.rows[0].total_orders),
        total_revenue: toFloat(orders.rows[0].total_revenue),
        total_paid: toFloat(orders.rows[0].total_paid),
        total_unpaid: toFloat(orders.rows[0].total_unpaid),
        total_import_quantity: toInt(imports.rows[0].total_import_quantity),
        total_sold_quantity: toInt(sold.rows[0].total_sold_quantity),
        ending_stock: toInt(endStock.rows[0].ending_stock),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/reports/products', authRequired, async (req, res) => {
  try {
    const month = toInt(req.query.month || new Date().getMonth() + 1);
    const year = toInt(req.query.year || new Date().getFullYear());
    const { start, end } = monthBounds(month, year);

    const rows = await query(
      `
      WITH sold AS (
        SELECT oi.product_id, SUM(oi.quantity)::int AS sold_quantity
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.created_at >= $1 AND o.created_at < $2
        GROUP BY oi.product_id
      ),
      stock AS (
        SELECT sm.product_id, COALESCE(SUM(sm.quantity_delta), 0)::int AS ending_stock
        FROM stock_movements sm
        WHERE sm.created_at < $2
        GROUP BY sm.product_id
      )
      SELECT p.id, p.code, p.name, COALESCE(sold.sold_quantity, 0)::int AS sold_quantity,
             COALESCE(stock.ending_stock, 0)::int AS ending_stock
      FROM products p
      LEFT JOIN sold ON sold.product_id = p.id
      LEFT JOIN stock ON stock.product_id = p.id
      ORDER BY sold_quantity DESC, ending_stock DESC, p.name ASC
      `,
      [start, end]
    );

    const topSelling = rows.rows.reduce(
      (best, row) => (row.sold_quantity > (best?.sold_quantity || 0) ? row : best),
      null
    );
    const topStock = rows.rows.reduce(
      (best, row) => (row.ending_stock > (best?.ending_stock || 0) ? row : best),
      null
    );

    res.json({
      success: true,
      month,
      year,
      top_selling: topSelling,
      top_stock: topStock,
      items: rows.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

function buildPdfResponse(res, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
  doc.pipe(res);
  return doc;
}

function pdfHeader(doc, title, subtitle = '') {
  doc.font('Helvetica-Bold').fontSize(18).fillColor('#2f2a35').text(title, { align: 'left' });
  if (subtitle) {
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(10).fillColor('#7c7284').text(subtitle);
  }
  doc.moveDown(0.6);
}

function pdfSection(doc, title) {
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#a14b83').text(title);
  doc.moveDown(0.3);
}

function pdfStatBlock(doc, label, value, x, y, width) {
  doc.save();
  doc.roundedRect(x, y, width, 48, 10).fillAndStroke('#fff7fb', '#eadcea');
  doc.fillColor('#7c7284').font('Helvetica').fontSize(9).text(label, x + 10, y + 8, { width: width - 20 });
  doc.fillColor('#2f2a35').font('Helvetica-Bold').fontSize(12).text(value, x + 10, y + 22, { width: width - 20 });
  doc.restore();
}

function drawPdfTable(doc, columns, rows, startY = doc.y, rowHeight = 22) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const scale = totalWidth > pageWidth ? pageWidth / totalWidth : 1;
  const widths = columns.map((c) => c.width * scale);
  let y = startY;
  const x0 = doc.page.margins.left;
  const bottom = doc.page.height - doc.page.margins.bottom;

  const drawHeader = () => {
    let x = x0;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#7c7284');
    columns.forEach((col, idx) => {
      doc.rect(x, y, widths[idx], 22).fillAndStroke('#fde9f4', '#eadcea');
      doc.fillColor('#805f74').text(col.label, x + 6, y + 6, { width: widths[idx] - 12, align: col.align || 'left' });
      x += widths[idx];
    });
    y += 22;
  };

  drawHeader();

  rows.forEach((row) => {
    const rowHeights = columns.map((col, idx) => {
      const text = escapePdfText(row[idx]);
      return Math.max(rowHeight, doc.heightOfString(text, { width: widths[idx] - 12, fontSize: 9 }) + 10);
    });
    const h = Math.max(...rowHeights);
    if (y + h > bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
    let x = x0;
    columns.forEach((col, idx) => {
      doc.rect(x, y, widths[idx], h).stroke('#eadcea');
      doc.fillColor('#2f2a35').font('Helvetica').fontSize(9).text(escapePdfText(row[idx]), x + 6, y + 5, {
        width: widths[idx] - 12,
        align: col.align || 'left',
      });
      x += widths[idx];
    });
    y += h;
  });

  doc.moveDown(1);
  return y;
}

app.get('/api/reports/monthly/pdf', authRequired, async (req, res) => {
  try {
    const month = toInt(req.query.month || new Date().getMonth() + 1);
    const year = toInt(req.query.year || new Date().getFullYear());
    const { start, end } = monthBounds(month, year);
    const reportRes = await query(
      `SELECT COUNT(*)::int AS total_orders,
              COALESCE(SUM(total_amount), 0)::float AS total_revenue,
              COALESCE(SUM(CASE WHEN is_paid THEN total_amount ELSE 0 END), 0)::float AS total_paid,
              COALESCE(SUM(CASE WHEN is_paid THEN 0 ELSE total_amount END), 0)::float AS total_unpaid
       FROM orders
       WHERE created_at >= $1 AND created_at < $2`,
      [start, end]
    );
    const importRes = await query(
      `SELECT COALESCE(SUM(ii.quantity), 0)::int AS total_import_quantity
       FROM imports i
       LEFT JOIN import_items ii ON ii.import_id = i.id
       WHERE i.created_at >= $1 AND i.created_at < $2`,
      [start, end]
    );
    const soldRes = await query(
      `SELECT COALESCE(SUM(oi.quantity), 0)::int AS total_sold_quantity
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.created_at >= $1 AND o.created_at < $2`,
      [start, end]
    );
    const stockRes = await query(
      `WITH stock AS (
        SELECT product_id, COALESCE(SUM(quantity_delta), 0)::int AS stock
        FROM stock_movements
        WHERE created_at < $1
        GROUP BY product_id
      )
      SELECT COALESCE(SUM(stock), 0)::int AS ending_stock
      FROM stock`,
      [end]
    );
    const products = await query(
      `
      WITH sold AS (
        SELECT oi.product_id, SUM(oi.quantity)::int AS sold_quantity
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.created_at >= $1 AND o.created_at < $2
        GROUP BY oi.product_id
      ),
      stock AS (
        SELECT sm.product_id, COALESCE(SUM(sm.quantity_delta), 0)::int AS ending_stock
        FROM stock_movements sm
        WHERE sm.created_at < $2
        GROUP BY sm.product_id
      )
      SELECT p.code, p.name, COALESCE(sold.sold_quantity, 0)::int AS sold_quantity,
             COALESCE(stock.ending_stock, 0)::int AS ending_stock
      FROM products p
      LEFT JOIN sold ON sold.product_id = p.id
      LEFT JOIN stock ON stock.product_id = p.id
      ORDER BY sold_quantity DESC, ending_stock DESC, p.name ASC
      `,
      [start, end]
    );

    const doc = buildPdfResponse(res, `bao-cao-thang-${pad2(month)}-${year}.pdf`);
    pdfHeader(doc, `Báo cáo tháng ${pad2(month)}/${year}`, 'Dữ liệu tổng hợp từ Neon PostgreSQL');

    const s = reportRes.rows[0];
    const stats = [
      ['Tổng đơn hàng', String(toInt(s.total_orders))],
      ['Doanh thu', formatVnd(s.total_revenue)],
      ['Đã thu', formatVnd(s.total_paid)],
      ['Chưa thu', formatVnd(s.total_unpaid)],
      ['Tổng nhập kho', String(toInt(importRes.rows[0].total_import_quantity))],
      ['Tổng bán ra', String(toInt(soldRes.rows[0].total_sold_quantity))],
      ['Tồn cuối tháng', String(toInt(stockRes.rows[0].ending_stock))],
    ];
    const statW = 160;
    const statStartY = doc.y;
    stats.forEach((item, idx) => {
      const x = doc.page.margins.left + (idx % 2) * (statW + 20);
      const y = statStartY + Math.floor(idx / 2) * 60;
      pdfStatBlock(doc, item[0], item[1], x, y, statW);
    });
    doc.y = statStartY + Math.ceil(stats.length / 2) * 60 + 18;

    pdfSection(doc, 'Thống kê theo sản phẩm');
    drawPdfTable(doc, [
      { label: 'Mã SP', width: 85 },
      { label: 'Tên sản phẩm', width: 220 },
      { label: 'Đã bán', width: 70, align: 'right' },
      { label: 'Tồn cuối tháng', width: 90, align: 'right' },
    ], products.rows.slice(0, 40).map((p) => [p.code, p.name, p.sold_quantity, p.ending_stock]));

    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/reports/summary/pdf', authRequired, async (req, res) => {
  try {
    const totalRevenueRes = await query(
      `SELECT COUNT(*)::int AS total_orders,
              COALESCE(SUM(total_amount), 0)::float AS total_revenue,
              COALESCE(SUM(CASE WHEN is_paid THEN total_amount ELSE 0 END), 0)::float AS total_paid,
              COALESCE(SUM(CASE WHEN is_paid THEN 0 ELSE total_amount END), 0)::float AS total_unpaid
       FROM orders`
    );
    const totalsRes = await query(
      `SELECT COUNT(*)::int AS total_products,
              COALESCE(SUM(current_stock), 0)::int AS total_stock
       FROM products`
    );
    const byProduct = await query(
      `SELECT code, name, current_stock
       FROM products
       ORDER BY current_stock DESC, name ASC`
    );

    const doc = buildPdfResponse(res, `tong-quan-kho-doanh-thu.pdf`);
    pdfHeader(doc, 'Báo cáo tổng quan kho & doanh thu', 'Tổng hợp toàn bộ dữ liệu hiện có');

    const s = totalRevenueRes.rows[0];
    const t = totalsRes.rows[0];
    const stats = [
      ['Tổng đơn hàng', String(toInt(s.total_orders))],
      ['Tổng doanh thu', formatVnd(s.total_revenue)],
      ['Đã thu', formatVnd(s.total_paid)],
      ['Chưa thu', formatVnd(s.total_unpaid)],
      ['Tổng sản phẩm', String(toInt(t.total_products))],
      ['Tổng tồn kho', String(toInt(t.total_stock))],
    ];
    const statStartY = doc.y;
    stats.forEach((item, idx) => {
      const x = doc.page.margins.left + (idx % 2) * 180;
      const y = statStartY + Math.floor(idx / 2) * 60;
      pdfStatBlock(doc, item[0], item[1], x, y, 160);
    });
    doc.y = statStartY + Math.ceil(stats.length / 2) * 60 + 18;

    pdfSection(doc, 'Tồn kho theo sản phẩm');
    drawPdfTable(doc, [
      { label: 'Mã SP', width: 90 },
      { label: 'Tên sản phẩm', width: 260 },
      { label: 'Tồn hiện tại', width: 90, align: 'right' },
    ], byProduct.rows.slice(0, 50).map((p) => [p.code, p.name, p.current_stock]));

    doc.end();
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/dashboard/summary', authRequired, async (req, res) => {
  try {
    const now = new Date();
    const { start, end } = monthBounds(now.getUTCMonth() + 1, now.getUTCFullYear());
    const reportRes = await fetchMonthlySummary(start, end);
    res.json({ success: true, ...reportRes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

async function fetchMonthlySummary(start, end) {
  const orders = await query(
    `SELECT COUNT(*)::int AS total_orders,
            COALESCE(SUM(total_amount), 0)::float AS total_revenue,
            COALESCE(SUM(CASE WHEN is_paid THEN total_amount ELSE 0 END), 0)::float AS total_paid,
            COALESCE(SUM(CASE WHEN is_paid THEN 0 ELSE total_amount END), 0)::float AS total_unpaid
     FROM orders WHERE created_at >= $1 AND created_at < $2`,
    [start, end]
  );
  const products = await query(`SELECT COUNT(*)::int AS total_products, COALESCE(SUM(current_stock), 0)::int AS total_stock FROM products`);
  const suppliers = await query(`SELECT COUNT(*)::int AS total_suppliers FROM suppliers`);
  const customers = await query(`SELECT COUNT(*)::int AS total_customers FROM customers`);
  const imports = await query(
    `SELECT COALESCE(SUM(ii.quantity), 0)::int AS total_import_quantity
     FROM imports i LEFT JOIN import_items ii ON ii.import_id = i.id
     WHERE i.created_at >= $1 AND i.created_at < $2`,
    [start, end]
  );
  const sold = await query(
    `SELECT COALESCE(SUM(oi.quantity), 0)::int AS total_sold_quantity
     FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.created_at >= $1 AND o.created_at < $2`,
    [start, end]
  );

  return {
    summary: {
      total_orders: toInt(orders.rows[0].total_orders),
      total_revenue: toFloat(orders.rows[0].total_revenue),
      total_paid: toFloat(orders.rows[0].total_paid),
      total_unpaid: toFloat(orders.rows[0].total_unpaid),
      total_products: toInt(products.rows[0].total_products),
      total_stock: toInt(products.rows[0].total_stock),
      total_suppliers: toInt(suppliers.rows[0].total_suppliers),
      total_customers: toInt(customers.rows[0].total_customers),
      total_import_quantity: toInt(imports.rows[0].total_import_quantity),
      total_sold_quantity: toInt(sold.rows[0].total_sold_quantity),
    },
  };
}

app.get('/api/dashboard', authRequired, async (req, res) => {
  try {
    const now = new Date();
    const report = await fetchMonthlySummary(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    );
    const products = await query(
      `SELECT id, code, name, sale_price::float AS sale_price, current_stock
       FROM products ORDER BY current_stock DESC, name ASC LIMIT 5`
    );
    const invoices = await query(
      `SELECT o.id, o.order_code, o.customer_name, o.total_amount::float AS total_amount, o.is_paid, o.created_at
       FROM orders o ORDER BY o.created_at DESC LIMIT 5`
    );
    res.json({
      success: true,
      summary: report.summary,
      latest_products: products.rows,
      latest_orders: invoices.rows,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  try {
    await ensureSchema();
    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
