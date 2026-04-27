
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const SESSION_SECRET = process.env.SESSION_SECRET || 'inventory_sales_secret';

if (!DATABASE_URL) {
  console.warn('Missing DATABASE_URL. Please set it in .env.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function i(value, fallback = 0) {
  const x = parseInt(value, 10);
  return Number.isFinite(x) ? x : fallback;
}

function text(value, fallback = '') {
  return String(value ?? fallback).trim();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>\"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

function money(value) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n(value)));
}

function pad2(num) {
  return String(num).padStart(2, '0');
}

function monthKeyFromDate(dt) {
  const d = new Date(dt);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function monthRange(month, year) {
  const m = i(month);
  const y = i(year);
  if (!m || !y) throw new Error('Tháng/năm không hợp lệ.');
  const start = `${y}-${pad2(m)}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad2(m + 1)}-01`;
  return { start, end: next, month: m, year: y };
}

function monthLabel(month, year) {
  return `${pad2(month)}/${year}`;
}

function code(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
}

const PDF_FONT_CANDIDATES = [
  'C:\\Windows\\Fonts\\arial.ttf',
  'C:\\Windows\\Fonts\\tahoma.ttf',
  'C:\\Windows\\Fonts\\segoeui.ttf',
  'C:\\Windows\\Fonts\\arialuni.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/Library/Fonts/Arial Unicode.ttf',
  '/System/Library/Fonts/Supplemental/Arial.ttf',
];

function resolvePdfFont() {
  for (const fontPath of PDF_FONT_CANDIDATES) {
    try {
      if (fs.existsSync(fontPath)) return fontPath;
    } catch (_) {}
  }
  return null;
}

const PDF_FONT_REGULAR = resolvePdfFont();
const PDF_FONT_BOLD = PDF_FONT_REGULAR;

function usePdfFont(doc, bold = false) {
  const fontPath = bold ? PDF_FONT_BOLD : PDF_FONT_REGULAR;
  if (fontPath) {
    doc.font(fontPath);
    return;
  }
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
}

function mergeItems(items) {
  const map = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const product_id = i(raw.product_id);
    const quantity = i(raw.quantity);
    if (!product_id || quantity <= 0) continue;
    const unit_price = raw.unit_price === undefined || raw.unit_price === null ? null : n(raw.unit_price);
    const existing = map.get(product_id) || { product_id, quantity: 0, unit_price: unit_price ?? 0 };
    existing.quantity += quantity;
    if (unit_price !== null) existing.unit_price = unit_price;
    map.set(product_id, existing);
  }
  return [...map.values()];
}

function parseDateValue(value) {
  const v = text(value);
  if (!v) return new Date();
  const date = new Date(v);
  if (Number.isNaN(date.getTime())) throw new Error('Ngày không hợp lệ.');
  return date;
}

function isManagerSession(req) {
  return Boolean(req.session && req.session.user && req.session.user.role === 'manager');
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Cần đăng nhập.' });
  }
  next();
}

function requireRole(roles = []) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Cần đăng nhập.' });
    }
    if (allowed.length && !allowed.includes(req.session.user.role)) {
      return res.status(403).json({ success: false, message: 'Không có quyền truy cập.' });
    }
    next();
  };
}

const requireManager = requireRole(['manager']);

async function q(sql, params = []) {
  return pool.query(sql, params);
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

async function logAction(client, payload) {
  const {
    action,
    entity_type,
    entity_id,
    old_data = null,
    new_data = null,
    actor_id = null,
  } = payload;
  await client.query(
    `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [action, entity_type, entity_id, old_data, new_data, actor_id]
  );
}

async function ensureSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(60) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name VARCHAR(120) NOT NULL DEFAULT '',
      role VARCHAR(30) NOT NULL DEFAULT 'manager',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      phone VARCHAR(60),
      address TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      phone VARCHAR(60),
      address TEXT,
      is_walk_in BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      code VARCHAR(120) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(120) NOT NULL DEFAULT '',
      unit VARCHAR(50) NOT NULL DEFAULT '',
      specification VARCHAR(120) NOT NULL DEFAULT '',
      sale_price NUMERIC(14,2) NOT NULL DEFAULT 0,
      current_stock INTEGER NOT NULL DEFAULT 0,
      supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      is_frequent BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS imports (
      id SERIAL PRIMARY KEY,
      import_code VARCHAR(120) UNIQUE NOT NULL,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
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
      order_code VARCHAR(120) UNIQUE NOT NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      customer_name VARCHAR(180) NOT NULL DEFAULT '',
      customer_phone VARCHAR(60),
      customer_address TEXT,
      note TEXT,
      total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      is_paid BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name_snapshot VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
      line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      action VARCHAR(30) NOT NULL,
      entity_type VARCHAR(60) NOT NULL,
      entity_id INTEGER,
      old_data JSONB,
      new_data JSONB,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await q(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_walk_in BOOLEAN NOT NULL DEFAULT FALSE`);
  await q(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(120) NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50) NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS specification VARCHAR(120) NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14,2) NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS current_stock INTEGER NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_frequent BOOLEAN NOT NULL DEFAULT FALSE`);
  await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await q(`ALTER TABLE imports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(180) NOT NULL DEFAULT ''`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14,2) NOT NULL DEFAULT 0`);
  await q(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_paid BOOLEAN NOT NULL DEFAULT FALSE`);
}

function rowProduct(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category || '',
    unit: row.unit || '',
    specification: row.specification || '',
    sale_price: n(row.sale_price),
    current_stock: i(row.current_stock),
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name || '',
    is_frequent: Boolean(row.is_frequent),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowSupplier(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    address: row.address || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowCustomer(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    address: row.address || '',
    is_walk_in: Boolean(row.is_walk_in),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowImport(row) {
  return {
    id: row.id,
    import_code: row.import_code,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name || '',
    imported_by: row.imported_by,
    imported_by_name: row.imported_by_name || '',
    note: row.note || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    items: [],
  };
}

function rowOrder(row) {
  return {
    id: row.id,
    order_code: row.order_code,
    customer_id: row.customer_id,
    customer_name: row.customer_name || '',
    customer_phone: row.customer_phone || '',
    customer_address: row.customer_address || '',
    note: row.note || '',
    total_amount: n(row.total_amount),
    is_paid: Boolean(row.is_paid),
    created_by: row.created_by,
    created_by_name: row.created_by_name || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    items: [],
  };
}

function rowLog(row) {
  return {
    id: row.id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    old_data: row.old_data,
    new_data: row.new_data,
    actor_id: row.actor_id,
    actor_name: row.actor_name || '',
    created_at: row.created_at,
  };
}

async function getProducts(filters = {}) {
  const where = [];
  const params = [];
  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(p.code ILIKE $${params.length} OR p.name ILIKE $${params.length} OR p.category ILIKE $${params.length})`);
  }
  if (filters.category && filters.category !== 'all') {
    params.push(filters.category);
    where.push(`p.category = $${params.length}`);
  }
  if (filters.frequent === 'true') where.push('p.is_frequent = TRUE');
  if (filters.frequent === 'false') where.push('p.is_frequent = FALSE');
  if (filters.supplier_id) {
    params.push(i(filters.supplier_id));
    where.push(`p.supplier_id = $${params.length}`);
  }
  const limit = filters.limit ? Math.max(1, i(filters.limit, 0)) : null;
  if (limit) {
    params.push(limit);
  }
  const sql = `
    SELECT p.*, COALESCE(s.name, '') AS supplier_name
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.is_frequent DESC, p.category ASC, p.name ASC
    ${limit ? `LIMIT $${params.length}` : ''}
  `;
  const { rows } = await q(sql, params);
  return rows.map(rowProduct);
}

async function getSuppliers() {
  const { rows } = await q(`SELECT * FROM suppliers ORDER BY name ASC`);
  return rows.map(rowSupplier);
}

async function getCustomers() {
  const { rows } = await q(`SELECT * FROM customers ORDER BY created_at DESC, name ASC`);
  return rows.map(rowCustomer);
}

async function getDashboardData() {
  const [{ rows: counts }, { rows: series }, { rows: lowStock }, { rows: logs }, { rows: recentOrders }, { rows: recentImports }] = await Promise.all([
    q(`
      SELECT
        (SELECT COUNT(*) FROM products)::int AS products,
        (SELECT COUNT(*) FROM suppliers)::int AS suppliers,
        (SELECT COUNT(*) FROM customers)::int AS customers,
        (SELECT COUNT(*) FROM imports)::int AS imports,
        (SELECT COUNT(*) FROM orders)::int AS orders,
        (SELECT COUNT(*) FROM orders WHERE is_paid = TRUE)::int AS paid_orders,
        (SELECT COUNT(*) FROM orders WHERE is_paid = FALSE)::int AS unpaid_orders,
        (SELECT COALESCE(SUM(current_stock),0)::int FROM products) AS stock_total,
        (SELECT COALESCE(SUM(total_amount),0) FROM orders)::numeric AS revenue_total
    `),
    q(`
      SELECT
        to_char(date_trunc('month', created_at), 'YYYY-MM') AS ym,
        COUNT(*)::int AS orders,
        COALESCE(SUM(total_amount),0)::numeric AS revenue
      FROM orders
      WHERE created_at >= (date_trunc('month', CURRENT_DATE) - INTERVAL '5 months')
      GROUP BY 1
      ORDER BY 1
    `),
    q(`
      SELECT id, code, name, category, unit, specification, current_stock, sale_price
      FROM products
      WHERE current_stock <= 10
      ORDER BY current_stock ASC, name ASC
      LIMIT 10
    `),
    q(`
      SELECT l.*, u.full_name AS actor_name
      FROM audit_logs l
      LEFT JOIN users u ON u.id = l.actor_id
      ORDER BY l.created_at DESC
      LIMIT 12
    `),
    q(`
      SELECT id, order_code, customer_name, total_amount, is_paid, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 6
    `),
    q(`
      SELECT i.id, i.import_code, i.created_at, s.name AS supplier_name
      FROM imports i
      LEFT JOIN suppliers s ON s.id = i.supplier_id
      ORDER BY i.created_at DESC
      LIMIT 6
    `),
  ]);

  const seriesMap = new Map();
  for (const row of series) {
    seriesMap.set(row.ym, {
      label: row.ym,
      orders: Number(row.orders || 0),
      revenue: Number(row.revenue || 0),
    });
  }

  return {
    counts: counts[0] || {},
    monthly_series: [...seriesMap.values()],
    low_stock: lowStock,
    recent_logs: logs.map(rowLog),
    recent_orders: recentOrders.rows || recentOrders, // safety
    recent_imports: recentImports.rows || recentImports,
  };
}

async function getMonthlyReport(month, year) {
  const range = monthRange(month, year);
  const paid = await q(
    `SELECT COALESCE(SUM(total_amount),0)::numeric AS v FROM orders WHERE created_at >= $1 AND created_at < $2 AND is_paid = TRUE`,
    [range.start, range.end]
  );
  const unpaid = await q(
    `SELECT COALESCE(SUM(total_amount),0)::numeric AS v FROM orders WHERE created_at >= $1 AND created_at < $2 AND is_paid = FALSE`,
    [range.start, range.end]
  );
  const ordersCount = await q(
    `SELECT COUNT(*)::int AS v FROM orders WHERE created_at >= $1 AND created_at < $2`,
    [range.start, range.end]
  );
  const revenue = await q(
    `SELECT COALESCE(SUM(total_amount),0)::numeric AS v FROM orders WHERE created_at >= $1 AND created_at < $2`,
    [range.start, range.end]
  );
  const importQty = await q(
    `SELECT COALESCE(SUM(ii.quantity),0)::int AS v
     FROM imports i
     JOIN import_items ii ON ii.import_id = i.id
     WHERE i.created_at >= $1 AND i.created_at < $2`,
    [range.start, range.end]
  );
  const soldQty = await q(
    `SELECT COALESCE(SUM(oi.quantity),0)::int AS v
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.created_at >= $1 AND o.created_at < $2`,
    [range.start, range.end]
  );
  const currentStock = await q(`SELECT COALESCE(SUM(current_stock),0)::int AS v FROM products`);
  const afterImports = await q(
    `SELECT COALESCE(SUM(ii.quantity),0)::int AS v
     FROM imports i
     JOIN import_items ii ON ii.import_id = i.id
     WHERE i.created_at >= $1`,
    [range.end]
  );
  const afterOrders = await q(
    `SELECT COALESCE(SUM(oi.quantity),0)::int AS v
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.created_at >= $1`,
    [range.end]
  );
  const topSold = await q(
    `WITH sold AS (
      SELECT oi.product_id, SUM(oi.quantity)::int AS qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= $1 AND o.created_at < $2
      GROUP BY oi.product_id
    )
    SELECT p.id, p.code, p.name, p.category, p.unit, p.specification, p.current_stock, COALESCE(s.qty,0)::int AS sold_qty
    FROM products p
    LEFT JOIN sold s ON s.product_id = p.id
    ORDER BY sold_qty DESC, p.current_stock DESC, p.name ASC
    LIMIT 10`,
    [range.start, range.end]
  );
  const topStock = await q(
    `SELECT id, code, name, category, unit, specification, current_stock
     FROM products
     ORDER BY current_stock DESC, name ASC
     LIMIT 10`
  );
  const byProduct = await q(
    `WITH sold AS (
      SELECT oi.product_id, SUM(oi.quantity)::int AS qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.created_at >= $1 AND o.created_at < $2
      GROUP BY oi.product_id
    )
    SELECT p.id, p.code, p.name, p.category, p.unit, p.specification, p.current_stock, COALESCE(s.qty,0)::int AS sold_qty
    FROM products p
    LEFT JOIN sold s ON s.product_id = p.id
    ORDER BY sold_qty DESC, p.name ASC`,
    [range.start, range.end]
  );

  return {
    month: range.month,
    year: range.year,
    month_label: monthLabel(range.month, range.year),
    total_orders: Number(ordersCount.rows[0].v || 0),
    total_revenue: Number(revenue.rows[0].v || 0),
    total_paid: Number(paid.rows[0].v || 0),
    total_unpaid: Number(unpaid.rows[0].v || 0),
    total_import_qty: Number(importQty.rows[0].v || 0),
    total_sold_qty: Number(soldQty.rows[0].v || 0),
    ending_stock: Number(currentStock.rows[0].v || 0) - Number(afterImports.rows[0].v || 0) + Number(afterOrders.rows[0].v || 0),
    top_sold: topSold.rows,
    top_stock: topStock.rows,
    by_product: byProduct.rows,
  };
}

async function getSummaryReport() {
  const totalRevenue = await q(`SELECT COALESCE(SUM(total_amount),0)::numeric AS v FROM orders`);
  const currentStock = await q(`SELECT COALESCE(SUM(current_stock),0)::int AS v FROM products`);
  const totalProducts = await q(`SELECT COUNT(*)::int AS v FROM products`);
  const paid = await q(`SELECT COALESCE(SUM(total_amount),0)::numeric AS v FROM orders WHERE is_paid = TRUE`);
  const unpaid = await q(`SELECT COALESCE(SUM(total_amount),0)::numeric AS v FROM orders WHERE is_paid = FALSE`);
  const topSold = await q(`
    WITH sold AS (
      SELECT oi.product_id, SUM(oi.quantity)::int AS qty
      FROM order_items oi
      GROUP BY oi.product_id
    )
    SELECT p.id, p.code, p.name, p.category, p.unit, p.specification, p.current_stock, COALESCE(s.qty,0)::int AS sold_qty
    FROM products p
    LEFT JOIN sold s ON s.product_id = p.id
    ORDER BY sold_qty DESC, p.current_stock DESC, p.name ASC
    LIMIT 10
  `);
  const topStock = await q(`
    SELECT id, code, name, category, unit, specification, current_stock
    FROM products
    ORDER BY current_stock DESC, name ASC
    LIMIT 10
  `);
  return {
    total_products: Number(totalProducts.rows[0].v || 0),
    total_revenue: Number(totalRevenue.rows[0].v || 0),
    total_paid: Number(paid.rows[0].v || 0),
    total_unpaid: Number(unpaid.rows[0].v || 0),
    total_stock: Number(currentStock.rows[0].v || 0),
    top_sold: topSold.rows,
    top_stock: topStock.rows,
  };
}

async function getImportItems(importIds) {
  if (!importIds.length) return [];
  const { rows } = await q(
    `SELECT ii.*, p.code, p.name, p.category, p.unit, p.specification
     FROM import_items ii
     JOIN products p ON p.id = ii.product_id
     WHERE ii.import_id = ANY($1::int[])
     ORDER BY ii.id ASC`,
    [importIds]
  );
  return rows;
}

async function getOrderItems(orderIds) {
  if (!orderIds.length) return [];
  const { rows } = await q(
    `SELECT oi.*, p.code, p.name, p.category, p.unit, p.specification
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ANY($1::int[])
     ORDER BY oi.id ASC`,
    [orderIds]
  );
  return rows;
}

async function listImports(filters = {}) {
  const params = [];
  const where = [];
  if (filters.from) {
    params.push(filters.from);
    where.push(`i.created_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`i.created_at < $${params.length}`);
  }
  const sql = `
    SELECT i.*, s.name AS supplier_name, u.full_name AS imported_by_name
    FROM imports i
    LEFT JOIN suppliers s ON s.id = i.supplier_id
    LEFT JOIN users u ON u.id = i.imported_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY i.created_at DESC, i.id DESC
  `;
  const { rows } = await q(sql, params);
  const imports = rows.map(rowImport);
  const items = await getImportItems(imports.map(x => x.id));
  const itemMap = new Map();
  for (const item of items) {
    const arr = itemMap.get(item.import_id) || [];
    arr.push({
      id: item.id,
      import_id: item.import_id,
      product_id: item.product_id,
      product_code: item.code,
      product_name: item.name,
      category: item.category,
      unit: item.unit,
      specification: item.specification,
      quantity: i(item.quantity),
    });
    itemMap.set(item.import_id, arr);
  }
  for (const row of imports) row.items = itemMap.get(row.id) || [];
  return imports;
}

async function listOrders(filters = {}) {
  const params = [];
  const where = [];

  if (filters.search) {
    params.push(`%${text(filters.search)}%`);
    where.push(`(o.order_code ILIKE $${params.length}
      OR o.customer_name ILIKE $${params.length}
      OR o.customer_phone ILIKE $${params.length}
      OR o.customer_address ILIKE $${params.length})`);
  }

  if (filters.customer_id && filters.customer_id !== 'all') {
    params.push(i(filters.customer_id));
    where.push(`o.customer_id = $${params.length}`);
  }

  if (filters.status === 'paid') where.push('o.is_paid = TRUE');
  if (filters.status === 'unpaid') where.push('o.is_paid = FALSE');

  if (filters.from) {
    params.push(filters.from);
    where.push(`o.created_at >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`o.created_at < $${params.length}`);
  }

  if (filters.amount_from) {
    params.push(n(filters.amount_from));
    where.push(`o.total_amount >= $${params.length}`);
  }
  if (filters.amount_to) {
    params.push(n(filters.amount_to));
    where.push(`o.total_amount <= $${params.length}`);
  }

  const sql = `
    SELECT o.*, u.full_name AS created_by_name
    FROM orders o
    LEFT JOIN users u ON u.id = o.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY o.created_at DESC, o.id DESC
  `;

  const { rows } = await q(sql, params);
  const orders = rows.map(rowOrder);
  const items = await getOrderItems(orders.map(x => x.id));

  const itemMap = new Map();
  for (const item of items) {
    const arr = itemMap.get(item.order_id) || [];
    arr.push({
      id: item.id,
      order_id: item.order_id,
      product_id: item.product_id,
      product_code: item.code,
      product_name: item.name,
      category: item.category,
      unit: item.unit,
      specification: item.specification,
      quantity: i(item.quantity),
      unit_price: n(item.unit_price),
      line_total: n(item.line_total),
    });
    itemMap.set(item.order_id, arr);
  }

  for (const row of orders) row.items = itemMap.get(row.id) || [];
  return orders;
}

async function getOrderById(id) {
  const orders = await listOrders({});
  return orders.find(x => x.id === i(id)) || null;
}

async function getImportById(id) {
  const imports = await listImports({});
  return imports.find(x => x.id === i(id)) || null;
}

async function resolveCustomer(client, payload) {
  const customer_id = payload.customer_id ? i(payload.customer_id) : null;
  const customer_name = text(payload.customer_name);
  const customer_phone = text(payload.customer_phone);
  const customer_address = text(payload.customer_address);

  if (customer_id) {
    const found = await client.query(`SELECT * FROM customers WHERE id = $1`, [customer_id]);
    if (!found.rowCount) throw new Error('Khách hàng không tồn tại.');
    return rowCustomer(found.rows[0]);
  }

  if (!customer_name) {
    return {
      id: null,
      name: 'Khách lẻ',
      phone: '',
      address: '',
      is_walk_in: true,
    };
  }

  const existing = await client.query(
    `SELECT * FROM customers
     WHERE lower(name) = lower($1)
       AND COALESCE(phone,'') = COALESCE($2,'')
     LIMIT 1`,
    [customer_name, customer_phone]
  );
  if (existing.rowCount) return rowCustomer(existing.rows[0]);

  const created = await client.query(
    `INSERT INTO customers (name, phone, address, is_walk_in)
     VALUES ($1,$2,$3,TRUE)
     RETURNING *`,
    [customer_name, customer_phone, customer_address]
  );
  return rowCustomer(created.rows[0]);
}

async function validateProductsForOrder(client, items) {
  if (!items.length) throw new Error('Phải có ít nhất 1 sản phẩm.');
  const ids = items.map(x => x.product_id);
  const result = await client.query(
    `SELECT id, name, current_stock, sale_price FROM products WHERE id = ANY($1::int[])`,
    [ids]
  );
  const map = new Map(result.rows.map(row => [row.id, row]));
  for (const item of items) {
    const product = map.get(item.product_id);
    if (!product) throw new Error(`Sản phẩm #${item.product_id} không tồn tại.`);
    if (i(product.current_stock) < item.quantity) {
      throw new Error(`Sản phẩm "${product.name}" không đủ tồn kho.`);
    }
  }
  return map;
}

async function applyStockDelta(client, items, delta, actorId, refType, refId, note) {
  for (const item of items) {
    await client.query(
      `UPDATE products SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2`,
      [delta * item.quantity, item.product_id]
    );
    await client.query(
      `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        'STOCK',
        'products',
        item.product_id,
        null,
        { delta: delta * item.quantity, refType, refId, note },
        actorId,
      ]
    );
  }
}

async function createOrUpdateImport(client, payload, existing = null, actorId = null) {
  const supplier_id = i(payload.supplier_id);
  if (!supplier_id) throw new Error('Vui lòng chọn nhà cung ứng.');
  const supplier = await client.query(`SELECT * FROM suppliers WHERE id = $1`, [supplier_id]);
  if (!supplier.rowCount) throw new Error('Nhà cung ứng không tồn tại.');

  const items = mergeItems(payload.items);
  if (!items.length) throw new Error('Phải có ít nhất 1 dòng nhập kho.');

  const productIds = items.map(x => x.product_id);
  const products = await client.query(`SELECT id, name FROM products WHERE id = ANY($1::int[])`, [productIds]);
  if (products.rowCount !== productIds.length) throw new Error('Có sản phẩm không tồn tại.');

  const createdAt = text(payload.created_at) ? parseDateValue(payload.created_at) : (existing ? new Date(existing.created_at) : new Date());
  const note = text(payload.note);

  const oldSnapshot = existing ? JSON.parse(JSON.stringify(existing)) : null;
  const oldItems = existing ? existing.items : [];

  if (existing) {
    for (const item of oldItems) {
      await client.query(`UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2`, [item.quantity, item.product_id]);
    }
    await client.query(`DELETE FROM import_items WHERE import_id = $1`, [existing.id]);
    await client.query(
      `UPDATE imports SET supplier_id = $1, note = $2, created_at = $3, updated_at = NOW() WHERE id = $4`,
      [supplier_id, note, createdAt, existing.id]
    );
    for (const item of items) {
      await client.query(`INSERT INTO import_items (import_id, product_id, quantity, created_at) VALUES ($1,$2,$3,$4)`, [existing.id, item.product_id, item.quantity, createdAt]);
      await client.query(`UPDATE products SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2`, [item.quantity, item.product_id]);
    }
    await logAction(client, {
      action: 'UPDATE',
      entity_type: 'imports',
      entity_id: existing.id,
      old_data: oldSnapshot,
      new_data: { ...existing, supplier_id, note, created_at: createdAt, items },
      actor_id: actorId,
    });
    return existing.id;
  }

  const importCode = code('IMP');
  const imported = await client.query(
    `INSERT INTO imports (import_code, supplier_id, imported_by, note, created_at)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [importCode, supplier_id, actorId, note, createdAt]
  );
  const importRow = imported.rows[0];
  for (const item of items) {
    await client.query(`INSERT INTO import_items (import_id, product_id, quantity, created_at) VALUES ($1,$2,$3,$4)`, [importRow.id, item.product_id, item.quantity, createdAt]);
    await client.query(`UPDATE products SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2`, [item.quantity, item.product_id]);
  }
  await logAction(client, {
    action: 'CREATE',
    entity_type: 'imports',
    entity_id: importRow.id,
    old_data: null,
    new_data: { import_code: importRow.import_code, supplier_id, note, created_at: createdAt, items },
    actor_id: actorId,
  });
  return importRow.id;
}

async function createOrUpdateOrder(client, payload, existing = null, actorId = null) {
  const items = mergeItems(payload.items);
  if (!items.length) throw new Error('Phải có ít nhất 1 dòng bán hàng.');

  const customer = await resolveCustomer(client, payload);
  const createdAt = text(payload.created_at)
    ? parseDateValue(payload.created_at)
    : (existing ? new Date(existing.created_at) : new Date());

  const isPaid = payload.is_paid === undefined || payload.is_paid === null
    ? (existing ? existing.is_paid : false)
    : Boolean(payload.is_paid);
  const payment = Boolean(isPaid);
  const note = text(payload.note);

  if (existing) {
    for (const item of existing.items) {
      await client.query(
        `UPDATE products SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }
  }

  const map = await validateProductsForOrder(client, items);

  const getUnitPrice = (item) => {
    const raw = item.unit_price;
    const hasPrice = !(raw === undefined || raw === null || raw === '');
    const product = map.get(item.product_id);
    return hasPrice ? n(raw) : n(product.sale_price);
  };

  if (existing) {
    await client.query(`DELETE FROM order_items WHERE order_id = $1`, [existing.id]);

    let total = 0;
    for (const item of items) {
      const product = map.get(item.product_id);
      const unitPrice = getUnitPrice(item);
      const lineTotal = unitPrice * item.quantity;
      total += lineTotal;

      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name_snapshot, quantity, unit_price, line_total, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [existing.id, item.product_id, product.name, item.quantity, unitPrice, lineTotal, createdAt]
      );

      await client.query(
        `UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      `UPDATE orders
       SET customer_id = $1,
           customer_name = $2,
           customer_phone = $3,
           customer_address = $4,
           note = $5,
           total_amount = $6,
           is_paid = $7,
           created_at = $8,
           updated_at = NOW()
       WHERE id = $9`,
      [customer.id, customer.name, customer.phone, customer.address, note, total, payment, createdAt, existing.id]
    );

    await logAction(client, {
      action: 'UPDATE',
      entity_type: 'orders',
      entity_id: existing.id,
      old_data: JSON.parse(JSON.stringify(existing)),
      new_data: {
        ...existing,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_address: customer.address,
        note,
        total_amount: total,
        is_paid: payment,
        created_at: createdAt,
        items,
      },
      actor_id: actorId,
    });
    return existing.id;
  }

  const orderCode = code('ORD');
  let orderTotal = 0;

  for (const item of items) {
    const product = map.get(item.product_id);
    const unitPrice = getUnitPrice(item);
    orderTotal += unitPrice * item.quantity;
  }

  const orderInsert = await client.query(
    `INSERT INTO orders (order_code, customer_id, customer_name, customer_phone, customer_address, note, total_amount, is_paid, created_by, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [orderCode, customer.id, customer.name, customer.phone, customer.address, note, orderTotal, payment, actorId, createdAt]
  );
  const orderRow = orderInsert.rows[0];

  for (const item of items) {
    const product = map.get(item.product_id);
    const unitPrice = getUnitPrice(item);
    const lineTotal = unitPrice * item.quantity;

    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name_snapshot, quantity, unit_price, line_total, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [orderRow.id, item.product_id, product.name, item.quantity, unitPrice, lineTotal, createdAt]
    );

    await client.query(
      `UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2`,
      [item.quantity, item.product_id]
    );
  }

  await logAction(client, {
    action: 'CREATE',
    entity_type: 'orders',
    entity_id: orderRow.id,
    old_data: null,
    new_data: {
      order_code: orderRow.order_code,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_phone: customer.phone,
      customer_address: customer.address,
      note,
      total_amount: orderTotal,
      is_paid: payment,
      created_at: createdAt,
      items,
    },
    actor_id: actorId,
  });

  return orderRow.id;
}

async function loadImportById(client, id) {
  const { rows } = await client.query(
    `SELECT i.*, s.name AS supplier_name, u.full_name AS imported_by_name
     FROM imports i
     LEFT JOIN suppliers s ON s.id = i.supplier_id
     LEFT JOIN users u ON u.id = i.imported_by
     WHERE i.id = $1`,
    [id]
  );
  if (!rows.length) return null;
  const imp = rowImport(rows[0]);
  const items = await client.query(
    `SELECT ii.*, p.code, p.name, p.category, p.unit, p.specification
     FROM import_items ii
     JOIN products p ON p.id = ii.product_id
     WHERE ii.import_id = $1
     ORDER BY ii.id ASC`,
    [id]
  );
  imp.items = items.rows.map(item => ({
    id: item.id,
    import_id: item.import_id,
    product_id: item.product_id,
    product_code: item.code,
    product_name: item.name,
    category: item.category,
    unit: item.unit,
    specification: item.specification,
    quantity: i(item.quantity),
  }));
  return imp;
}

async function loadOrderById(client, id) {
  const { rows } = await client.query(
    `SELECT o.*, u.full_name AS created_by_name
     FROM orders o
     LEFT JOIN users u ON u.id = o.created_by
     WHERE o.id = $1`,
    [id]
  );
  if (!rows.length) return null;
  const order = rowOrder(rows[0]);
  const items = await client.query(
    `SELECT oi.*, p.code, p.name, p.category, p.unit, p.specification
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id ASC`,
    [id]
  );
  order.items = items.rows.map(item => ({
    id: item.id,
    order_id: item.order_id,
    product_id: item.product_id,
    product_code: item.code,
    product_name: item.name,
    category: item.category,
    unit: item.unit,
    specification: item.specification,
    quantity: i(item.quantity),
    unit_price: n(item.unit_price),
    line_total: n(item.line_total),
  }));
  return order;
}


function pdfHeader(doc, title, subtitle = '') {
  usePdfFont(doc, true);
  doc.fontSize(18).fillColor('#333').text(title, { align: 'center' });
  if (subtitle) {
    usePdfFont(doc, false);
    doc.moveDown(0.3).fontSize(10).fillColor('#666').text(subtitle, { align: 'center' });
  }
  doc.moveDown();
  doc.strokeColor('#d7c0d0').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown();
}

function pdfKv(doc, label, value) {
  usePdfFont(doc, false);
  doc.fontSize(11).fillColor('#333').text(`${label}: `, { continued: true });
  usePdfFont(doc, true);
  doc.fillColor('#8b5c7d').text(String(value ?? ''));
}

function renderPdfList(doc, title, rows, mapper) {
  doc.moveDown();
  usePdfFont(doc, true);
  doc.fontSize(13).fillColor('#333').text(title);
  doc.moveDown(0.4);
  rows.forEach((row, idx) => {
    const textLine = mapper(row, idx);
    usePdfFont(doc, false);
    doc.fontSize(10).fillColor('#444').text(`${idx + 1}. ${textLine}`, { indent: 10 });
  });
}

function drawSummaryPill(doc, x, y, w, h, label, value) {
  doc.save();
  doc.roundedRect(x, y, w, h, 10).fillAndStroke('#fff6fb', '#ebcfe0');
  usePdfFont(doc, false);
  doc.fillColor('#7a5670').fontSize(9).text(label, x + 10, y + 8, { width: w - 20, align: 'left' });
  usePdfFont(doc, true);
  doc.fillColor('#2f2630').fontSize(14).text(String(value ?? ''), x + 10, y + 22, { width: w - 20, align: 'left' });
  doc.restore();
}

function sendMonthlyPdf(res, report) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  if (PDF_FONT_REGULAR) usePdfFont(doc, false);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="bao-cao-${report.month_label.replace('/', '-')}.pdf"`);
  doc.pipe(res);
  pdfHeader(doc, 'BÁO CÁO THÁNG', `Tháng ${report.month_label}`);
  const startX = 40;
  const gap = 12;
  const colW = (515 - gap) / 2;
  drawSummaryPill(doc, startX, doc.y, colW, 52, 'Tổng số đơn hàng', report.total_orders);
  drawSummaryPill(doc, startX + colW + gap, doc.y, colW, 52, 'Tổng doanh thu', `${money(report.total_revenue)} ₫`);
  doc.y += 66;
  drawSummaryPill(doc, startX, doc.y, colW, 52, 'Đã thu', `${money(report.total_paid)} ₫`);
  drawSummaryPill(doc, startX + colW + gap, doc.y, colW, 52, 'Chưa thu', `${money(report.total_unpaid)} ₫`);
  doc.y += 66;
  drawSummaryPill(doc, startX, doc.y, colW, 52, 'Tổng lượng nhập', report.total_import_qty);
  drawSummaryPill(doc, startX + colW + gap, doc.y, colW, 52, 'Tổng lượng bán', report.total_sold_qty);
  doc.y += 66;
  pdfKv(doc, 'Tồn kho cuối tháng', report.ending_stock);
  renderPdfList(doc, 'Top sản phẩm bán chạy', report.top_sold.slice(0, 10), (r) => `${r.code} - ${r.name} | SL bán: ${r.sold_qty}`);
  doc.addPage();
  pdfHeader(doc, 'THỐNG KÊ TỪNG SẢN PHẨM');
  renderPdfList(doc, 'Danh sách sản phẩm', report.by_product.slice(0, 25), (r) => `${r.code} - ${r.name} | Bán: ${r.sold_qty} | Tồn: ${r.current_stock}`);
  doc.end();
}

function sendSummaryPdf(res, summary) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  if (PDF_FONT_REGULAR) usePdfFont(doc, false);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="bao-cao-tong-quan.pdf"');
  doc.pipe(res);
  pdfHeader(doc, 'BÁO CÁO TỔNG QUAN');
  const startX = 40;
  const gap = 12;
  const colW = (515 - gap) / 2;
  drawSummaryPill(doc, startX, doc.y, colW, 52, 'Tổng số sản phẩm', summary.total_products);
  drawSummaryPill(doc, startX + colW + gap, doc.y, colW, 52, 'Tổng tồn kho', summary.total_stock);
  doc.y += 66;
  drawSummaryPill(doc, startX, doc.y, colW, 52, 'Tổng doanh thu', `${money(summary.total_revenue)} ₫`);
  drawSummaryPill(doc, startX + colW + gap, doc.y, colW, 52, 'Đã thu', `${money(summary.total_paid)} ₫`);
  doc.y += 66;
  drawSummaryPill(doc, startX, doc.y, colW, 52, 'Chưa thu', `${money(summary.total_unpaid)} ₫`);
  doc.y += 66;
  renderPdfList(doc, 'Top sản phẩm tồn nhiều', summary.top_stock.slice(0, 10), (r) => `${r.code} - ${r.name} | Tồn: ${r.current_stock}`);
  doc.addPage();
  pdfHeader(doc, 'Top sản phẩm bán nhiều');
  renderPdfList(doc, 'Top bán', summary.top_sold.slice(0, 10), (r) => `${r.code} - ${r.name} | Bán: ${r.sold_qty} | Tồn: ${r.current_stock}`);
  doc.end();
}


function reportCardHtml(title, value, sub = '') {
  return `
    <div class="report-card">
      <div class="report-card-label">${escapeHtml(title)}</div>
      <div class="report-card-value">${escapeHtml(value)}</div>
      ${sub ? `<div class="report-card-sub">${escapeHtml(sub)}</div>` : ''}
    </div>
  `;
}

function renderReportPageShell({ title, subtitle = '', cards = '', tables = '', extra = '' }) {
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root{
      --bg:#fff7fb; --panel:#fff; --line:#ecd7e4; --text:#2f2430; --muted:#7e6879; --pink:#e78cbc;
      --pink2:#f8e1ee; --shadow:0 18px 40px rgba(0,0,0,.08);
    }
    *{box-sizing:border-box}
    body{margin:0;font-family:Arial,Helvetica,sans-serif;background:linear-gradient(180deg,#fff 0%,#fff7fb 100%);color:var(--text)}
    .page{max-width:1120px;margin:0 auto;padding:28px 18px 44px}
    .head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;margin-bottom:18px}
    h1{margin:0;font-size:30px;letter-spacing:.02em}
    .sub{color:var(--muted);margin-top:8px}
    .toolbar{display:flex;gap:10px;flex-wrap:wrap}
    .btn{border:1px solid var(--line);background:#fff;border-radius:999px;padding:10px 16px;font-weight:700;cursor:pointer}
    .btn.primary{background:var(--pink2);border-color:#e5b4ce;color:#8e3f6d}
    .grid{display:grid;gap:14px}
    .grid.cards{grid-template-columns:repeat(4,minmax(0,1fr))}
    .report-card,.panel{background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow)}
    .report-card{padding:16px 18px}
    .report-card-label{font-size:13px;color:var(--muted);font-weight:700}
    .report-card-value{font-size:26px;font-weight:800;margin-top:6px}
    .report-card-sub{color:var(--muted);font-size:13px;margin-top:4px}
    .panel{padding:18px}
    .panel h2{margin:0 0 12px;font-size:20px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:12px 10px;border-bottom:1px solid #f3e9ef;text-align:left;vertical-align:top}
    th{font-size:13px;color:#7a6573}
    tbody tr:hover{background:#fff8fc}
    .list{display:grid;gap:10px}
    .list-item{padding:12px 14px;border:1px solid #f1e1eb;border-radius:14px}
    .list-item-title{font-weight:800}
    .list-item-sub{color:var(--muted);font-size:13px;margin-top:4px}
    .muted{color:var(--muted)}
    @media (max-width: 992px){
      .grid.cards{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media (max-width: 640px){
      .grid.cards{grid-template-columns:1fr}
      h1{font-size:24px}
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="head">
      <div>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}
      </div>
      <div class="toolbar">
        <button class="btn" onclick="window.print()">In / Lưu PDF</button>
        <button class="btn primary" onclick="window.close()">Đóng</button>
      </div>
    </div>
    ${cards ? `<div class="grid cards">${cards}</div>` : ''}
    ${tables || ''}
    ${extra || ''}
  </div>
</body>
</html>`;
}

function renderProductsTableHtml(rows, title = 'Sản phẩm') {
  return `
    <div class="panel" style="margin-top:18px">
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead>
          <tr>
            <th>#</th><th>Mã</th><th>Tên</th><th>Loại</th><th>DVT</th><th>Quy cách</th><th class="text-right">Tồn</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td><b>${escapeHtml(r.code)}</b></td>
              <td>${escapeHtml(r.name)}</td>
              <td>${escapeHtml(r.category || '—')}</td>
              <td>${escapeHtml(r.unit || '—')}</td>
              <td>${escapeHtml(r.specification || '—')}</td>
              <td><b>${money(r.current_stock)}</b></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderProductRankTable(rows, title, qtyLabel) {
  return `
    <div class="panel" style="margin-top:18px">
      <h2>${escapeHtml(title)}</h2>
      <div class="list">
        ${rows.map((r, idx) => `
          <div class="list-item">
            <div class="list-item-title">${idx + 1}. ${escapeHtml(r.code)} - ${escapeHtml(r.name)}</div>
            <div class="list-item-sub">${qtyLabel}: <b>${money(r.sold_qty ?? r.current_stock ?? 0)}</b> • Loại: ${escapeHtml(r.category || '—')} • DVT: ${escapeHtml(r.unit || '—')} • Quy cách: ${escapeHtml(r.specification || '—')}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderMonthlyPreviewHtml(report) {
  const cards = [
    reportCardHtml('Tổng đơn hàng', report.total_orders),
    reportCardHtml('Tổng doanh thu', `${money(report.total_revenue)} ₫`),
    reportCardHtml('Đã thu', `${money(report.total_paid)} ₫`),
    reportCardHtml('Chưa thu', `${money(report.total_unpaid)} ₫`),
    reportCardHtml('Tổng lượng nhập', report.total_import_qty),
    reportCardHtml('Tổng lượng bán', report.total_sold_qty),
    reportCardHtml('Tồn kho cuối tháng', report.ending_stock),
    reportCardHtml('Kỳ báo cáo', `Tháng ${report.month_label}`),
  ].join('');

  const tables = `
    ${renderProductRankTable((report.top_sold || []).slice(0, 10), 'Top sản phẩm bán nhiều nhất', 'SL bán')}
    ${renderProductRankTable((report.top_stock || []).slice(0, 10), 'Top sản phẩm tồn nhiều nhất', 'Tồn')}
    <div class="panel" style="margin-top:18px">
      <h2>Tổng số lượng từng sản phẩm đã bán</h2>
      <table>
        <thead>
          <tr><th>#</th><th>Mã</th><th>Tên</th><th>Đã bán</th><th>Tồn hiện tại</th></tr>
        </thead>
        <tbody>
          ${(report.by_product || []).map((r, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td><b>${escapeHtml(r.code)}</b></td>
              <td>${escapeHtml(r.name)}</td>
              <td><b>${Number(r.sold_qty || 0)}</b></td>
              <td><b>${Number(r.current_stock || 0)}</b></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  return renderReportPageShell({
    title: 'BÁO CÁO THÁNG',
    subtitle: `Tháng ${report.month_label}`,
    cards,
    tables,
  });
}

function renderSummaryPreviewHtml(summary) {
  const cards = [
    reportCardHtml('Tổng sản phẩm', summary.total_products),
    reportCardHtml('Tổng doanh thu', `${money(summary.total_revenue)} ₫`),
    reportCardHtml('Đã thu', `${money(summary.total_paid)} ₫`),
    reportCardHtml('Chưa thu', `${money(summary.total_unpaid)} ₫`),
    reportCardHtml('Tổng tồn kho', summary.total_stock),
  ].join('');

  const tables = `
    ${renderProductRankTable((summary.top_sold || []).slice(0, 10), 'Top sản phẩm bán nhiều nhất', 'SL bán')}
    ${renderProductRankTable((summary.top_stock || []).slice(0, 10), 'Top sản phẩm tồn nhiều nhất', 'Tồn')}
  `;
  return renderReportPageShell({
    title: 'BÁO CÁO TỔNG QUAN',
    subtitle: 'Tổng hợp kho và doanh thu',
    cards,
    tables,
  });
}

/* AUTH */
app.post('/api/auth/login', async (req, res) => {
  try {
    const username = text(req.body.username);
    const password = text(req.body.password);
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Thiếu tài khoản hoặc mật khẩu.' });
    }
    const { rows } = await q(`SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1`, [username]);
    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không đúng.' });
    }
    const user = rows[0];
    const storedPassword = String(user.password_hash || user.password || '');
    let ok = false;
    if (storedPassword.startsWith('$2')) {
      ok = await bcrypt.compare(password, storedPassword);
    } else {
      ok = password === storedPassword;
    }
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không đúng.' });
    }
    req.session.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
    };
    res.json({ success: true, data: req.session.user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Không thể đăng nhập.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ success: true, data: req.session.user || null });
});

/* PRODUCTS */
app.get('/api/products', async (req, res) => {
  try {
    const products = await getProducts({
      search: req.query.search || '',
      category: req.query.category || 'all',
      frequent: req.query.frequent || 'all',
      supplier_id: req.query.supplier_id || '',
      limit: req.query.limit || '',
    });
    res.json({ success: true, data: products });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Không thể tải sản phẩm.' });
  }
});

app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const codeValue = text(payload.code);
    const nameValue = text(payload.name);
    if (!codeValue || !nameValue) throw new Error('Mã và tên sản phẩm là bắt buộc.');
    const created = await q(
      `INSERT INTO products (code, name, category, unit, specification, sale_price, current_stock, supplier_id, is_frequent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        codeValue,
        nameValue,
        text(payload.category),
        text(payload.unit),
        text(payload.specification),
        n(payload.sale_price),
        i(payload.current_stock),
        payload.supplier_id ? i(payload.supplier_id) : null,
        Boolean(payload.is_frequent),
      ]
    );
    await q(
      `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
       VALUES ('CREATE','products',$1,$2,$3,$4)`,
      [created.rows[0].id, null, payload, req.session.user.id]
    );
    res.json({ success: true, data: rowProduct(created.rows[0]) });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể tạo sản phẩm.' });
  }
});

app.put('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const id = i(req.params.id);
    const old = await q(`SELECT * FROM products WHERE id = $1`, [id]);
    if (!old.rowCount) throw new Error('Sản phẩm không tồn tại.');
    const payload = req.body || {};
    const updated = await q(
      `UPDATE products
       SET code=$1, name=$2, category=$3, unit=$4, specification=$5, sale_price=$6, current_stock=$7, supplier_id=$8, is_frequent=$9, updated_at=NOW()
       WHERE id=$10
       RETURNING *`,
      [
        text(payload.code),
        text(payload.name),
        text(payload.category),
        text(payload.unit),
        text(payload.specification),
        n(payload.sale_price),
        i(payload.current_stock),
        payload.supplier_id ? i(payload.supplier_id) : null,
        Boolean(payload.is_frequent),
        id,
      ]
    );
    await q(
      `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
       VALUES ('UPDATE','products',$1,$2,$3,$4)`,
      [id, old.rows[0], payload, req.session.user.id]
    );
    res.json({ success: true, data: rowProduct(updated.rows[0]) });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể cập nhật sản phẩm.' });
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const id = i(req.params.id);
    const old = await q(`SELECT * FROM products WHERE id = $1`, [id]);
    if (!old.rowCount) throw new Error('Sản phẩm không tồn tại.');
    await q(`DELETE FROM products WHERE id = $1`, [id]);
    await q(
      `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
       VALUES ('DELETE','products',$1,$2,$3,$4)`,
      [id, old.rows[0], null, req.session.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: 'Không thể xóa sản phẩm. Có thể sản phẩm đang được dùng trong đơn nhập/bán.' });
  }
});

/* SUPPLIERS */
app.get('/api/suppliers', requireAuth, async (req, res) => {
  try {
    res.json({ success: true, data: await getSuppliers() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Không thể tải nhà cung ứng.' });
  }
});

app.post('/api/suppliers', requireManager, async (req, res) => {
  try {
    const payload = req.body || {};
    const nameValue = text(payload.name);
    if (!nameValue) throw new Error('Tên nhà cung ứng là bắt buộc.');
    const created = await q(
      `INSERT INTO suppliers (name, phone, address)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [nameValue, text(payload.phone), text(payload.address)]
    );
    await q(
      `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
       VALUES ('CREATE','suppliers',$1,$2,$3,$4)`,
      [created.rows[0].id, null, payload, req.session.user.id]
    );
    res.json({ success: true, data: rowSupplier(created.rows[0]) });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể tạo nhà cung ứng.' });
  }
});

app.put('/api/suppliers/:id', requireManager, async (req, res) => {
  try {
    const id = i(req.params.id);
    const old = await q(`SELECT * FROM suppliers WHERE id = $1`, [id]);
    if (!old.rowCount) throw new Error('Nhà cung ứng không tồn tại.');
    const payload = req.body || {};
    const updated = await q(
      `UPDATE suppliers SET name=$1, phone=$2, address=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
      [text(payload.name), text(payload.phone), text(payload.address), id]
    );
    await q(
      `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
       VALUES ('UPDATE','suppliers',$1,$2,$3,$4)`,
      [id, old.rows[0], payload, req.session.user.id]
    );
    res.json({ success: true, data: rowSupplier(updated.rows[0]) });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể cập nhật nhà cung ứng.' });
  }
});

app.delete('/api/suppliers/:id', requireManager, async (req, res) => {
  try {
    const id = i(req.params.id);
    const old = await q(`SELECT * FROM suppliers WHERE id = $1`, [id]);
    if (!old.rowCount) throw new Error('Nhà cung ứng không tồn tại.');
    await q(`DELETE FROM suppliers WHERE id = $1`, [id]);
    await q(
      `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
       VALUES ('DELETE','suppliers',$1,$2,$3,$4)`,
      [id, old.rows[0], null, req.session.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: 'Không thể xóa nhà cung ứng.' });
  }
});

/* CUSTOMERS */
app.get('/api/customers', requireAuth, async (req, res) => {
  try {
    res.json({ success: true, data: await getCustomers() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Không thể tải khách hàng.' });
  }
});

app.post('/api/customers', requireManager, async (req, res) => {
  try {
    const payload = req.body || {};
    const nameValue = text(payload.name);
    if (!nameValue) throw new Error('Tên khách hàng là bắt buộc.');
    const created = await q(
      `INSERT INTO customers (name, phone, address, is_walk_in)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [nameValue, text(payload.phone), text(payload.address), Boolean(payload.is_walk_in)]
    );
    await q(
      `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
       VALUES ('CREATE','customers',$1,$2,$3,$4)`,
      [created.rows[0].id, null, payload, req.session.user.id]
    );
    res.json({ success: true, data: rowCustomer(created.rows[0]) });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể tạo khách hàng.' });
  }
});

app.put('/api/customers/:id', requireManager, async (req, res) => {
  try {
    const id = i(req.params.id);
    const old = await q(`SELECT * FROM customers WHERE id = $1`, [id]);
    if (!old.rowCount) throw new Error('Khách hàng không tồn tại.');
    const payload = req.body || {};
    const updated = await q(
      `UPDATE customers SET name=$1, phone=$2, address=$3, is_walk_in=$4, updated_at=NOW() WHERE id=$5 RETURNING *`,
      [text(payload.name), text(payload.phone), text(payload.address), Boolean(payload.is_walk_in), id]
    );
    await q(
      `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
       VALUES ('UPDATE','customers',$1,$2,$3,$4)`,
      [id, old.rows[0], payload, req.session.user.id]
    );
    res.json({ success: true, data: rowCustomer(updated.rows[0]) });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể cập nhật khách hàng.' });
  }
});

app.delete('/api/customers/:id', requireManager, async (req, res) => {
  try {
    const id = i(req.params.id);
    const old = await q(`SELECT * FROM customers WHERE id = $1`, [id]);
    if (!old.rowCount) throw new Error('Khách hàng không tồn tại.');
    await q(`DELETE FROM customers WHERE id = $1`, [id]);
    await q(
      `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
       VALUES ('DELETE','customers',$1,$2,$3,$4)`,
      [id, old.rows[0], null, req.session.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: 'Không thể xóa khách hàng.' });
  }
});

/* IMPORTS */
app.get('/api/imports', requireAuth, async (req, res) => {
  try {
    res.json({ success: true, data: await listImports({ from: req.query.from, to: req.query.to }) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Không thể tải nhập kho.' });
  }
});

app.post('/api/imports', requireAuth, async (req, res) => {
  try {
    const id = await withTx((client) => createOrUpdateImport(client, req.body || {}, null, req.session.user.id));
    const created = await loadImportById(pool, id);
    res.json({ success: true, data: created });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể tạo phiếu nhập.' });
  }
});

app.put('/api/imports/:id', requireAuth, async (req, res) => {
  try {
    const id = i(req.params.id);
    const existing = await loadImportById(pool, id);
    if (!existing) throw new Error('Phiếu nhập không tồn tại.');
    await withTx((client) => createOrUpdateImport(client, req.body || {}, existing, req.session.user.id));
    const updated = await loadImportById(pool, id);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể cập nhật phiếu nhập.' });
  }
});

app.delete('/api/imports/:id', requireAuth, async (req, res) => {
  try {
    const id = i(req.params.id);
    const existing = await loadImportById(pool, id);
    if (!existing) throw new Error('Phiếu nhập không tồn tại.');
    await withTx(async (client) => {
      for (const item of existing.items) {
        await client.query(`UPDATE products SET current_stock = current_stock - $1, updated_at = NOW() WHERE id = $2`, [item.quantity, item.product_id]);
      }
      await client.query(`DELETE FROM imports WHERE id = $1`, [id]);
      await logAction(client, {
        action: 'DELETE',
        entity_type: 'imports',
        entity_id: id,
        old_data: existing,
        new_data: null,
        actor_id: req.session.user.id,
      });
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể xóa phiếu nhập.' });
  }
});

/* ORDERS */
app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const data = await listOrders({
      search: req.query.search,
      customer_id: req.query.customer_id,
      status: req.query.status,
      from: req.query.from,
      to: req.query.to,
      amount_from: req.query.amount_from,
      amount_to: req.query.amount_to,
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Không thể tải hóa đơn.' });
  }
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const order = await loadOrderById(pool, i(req.params.id));
    if (!order) return res.status(404).json({ success: false, message: 'Hóa đơn không tồn tại.' });
    res.json({ success: true, data: order });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Không thể tải hóa đơn.' });
  }
});

app.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const id = await withTx((client) => createOrUpdateOrder(client, req.body || {}, null, req.session.user.id));
    const order = await loadOrderById(pool, id);
    res.json({ success: true, data: order });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể tạo hóa đơn.' });
  }
});

app.put('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const id = i(req.params.id);
    const existing = await loadOrderById(pool, id);
    if (!existing) throw new Error('Hóa đơn không tồn tại.');
    await withTx((client) => createOrUpdateOrder(client, req.body || {}, existing, req.session.user.id));
    const order = await loadOrderById(pool, id);
    res.json({ success: true, data: order });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể cập nhật hóa đơn.' });
  }
});

app.put('/api/orders/:id/pay', requireAuth, async (req, res) => {
  try {
    const id = i(req.params.id);
    const isPaid = req.body && typeof req.body.is_paid !== 'undefined' ? Boolean(req.body.is_paid) : true;
    const old = await loadOrderById(pool, id);
    if (!old) throw new Error('Hóa đơn không tồn tại.');
    await q(`UPDATE orders SET is_paid = $1, updated_at = NOW() WHERE id = $2`, [isPaid, id]);
    await q(
      `INSERT INTO audit_logs (action, entity_type, entity_id, old_data, new_data, actor_id)
       VALUES ('UPDATE','orders',$1,$2,$3,$4)`,
      [id, old, { ...old, is_paid: isPaid }, req.session.user.id]
    );
    const order = await loadOrderById(pool, id);
    res.json({ success: true, data: order });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể cập nhật thanh toán.' });
  }
});

app.delete('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const id = i(req.params.id);
    const existing = await loadOrderById(pool, id);
    if (!existing) throw new Error('Hóa đơn không tồn tại.');
    await withTx(async (client) => {
      for (const item of existing.items) {
        await client.query(`UPDATE products SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2`, [item.quantity, item.product_id]);
      }
      await client.query(`DELETE FROM orders WHERE id = $1`, [id]);
      await logAction(client, {
        action: 'DELETE',
        entity_type: 'orders',
        entity_id: id,
        old_data: existing,
        new_data: null,
        actor_id: req.session.user.id,
      });
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể xóa hóa đơn.' });
  }
});

/* REPORTS */
app.get('/api/reports/monthly', requireAuth, async (req, res) => {
  try {
    const report = await getMonthlyReport(req.query.month, req.query.year);
    res.json({ success: true, data: report });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể tải báo cáo.' });
  }
});

app.get('/api/reports/products', requireAuth, async (req, res) => {
  try {
    const report = await getMonthlyReport(req.query.month, req.query.year);
    res.json({
      success: true,
      data: {
        month: report.month,
        year: report.year,
        month_label: report.month_label,
        top_sold: report.top_sold,
        top_stock: report.top_stock,
        by_product: report.by_product,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể tải thống kê sản phẩm.' });
  }
});

app.get('/api/reports/monthly/pdf', requireAuth, async (req, res) => {
  try {
    const report = await getMonthlyReport(req.query.month, req.query.year);
    sendMonthlyPdf(res, report);
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể xuất PDF.' });
  }
});

app.get('/api/reports/summary/pdf', requireAuth, async (req, res) => {
  try {
    const summary = await getSummaryReport();
    sendSummaryPdf(res, summary);
  } catch (error) {
    console.error(error);
    res.status(400).json({ success: false, message: error.message || 'Không thể xuất PDF.' });
  }
});

app.get('/reports/monthly/preview', requireAuth, async (req, res) => {
  try {
    const report = await getMonthlyReport(req.query.month, req.query.year);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderMonthlyPreviewHtml(report));
  } catch (error) {
    console.error(error);
    res.status(400).send(`<pre>${escapeHtml(error.message || 'Không thể tải báo cáo.')}</pre>`);
  }
});

app.get('/reports/summary/preview', requireAuth, async (req, res) => {
  try {
    const summary = await getSummaryReport();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderSummaryPreviewHtml(summary));
  } catch (error) {
    console.error(error);
    res.status(400).send(`<pre>${escapeHtml(error.message || 'Không thể tải báo cáo tổng quan.')}</pre>`);
  }
});

/* LOGS */
app.get('/api/logs', requireManager, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, i(req.query.limit || 100)));
    const { rows } = await q(
      `SELECT l.*, u.full_name AS actor_name
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.actor_id
       ORDER BY l.created_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ success: true, data: rows.map(rowLog) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Không thể tải lịch sử.' });
  }
});

/* DASHBOARD */
app.get('/api/dashboard', requireManager, async (req, res) => {
  try {
    const data = await getDashboardData();
    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Không thể tải dashboard.' });
  }
});

app.get('/api/reports/summary', requireAuth, async (req, res) => {
  try {
    const data = await getSummaryReport();
    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Không thể tải báo cáo tổng quan.' });
  }
});

/* START */
async function start() {
  try {
    await ensureSchema();
    const { rows } = await q(`SELECT COUNT(*)::int AS c FROM users`);
    if (!rows.length) {
      console.warn('Warning: no users table?');
    }
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
