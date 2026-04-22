require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env');
  process.exit(1);
}

const RESET = process.argv.includes('--reset');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.fixed.json'), 'utf8'));

function n(value, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function text(value, fallback = '') {
  const out = String(value ?? fallback).trim();
  return out;
}

function normalizeCode(value) {
  return text(value).replace(/\s+/g, '');
}

function pad2(num) {
  return String(num).padStart(2, '0');
}

function toDateOnly(value) {
  if (!value) {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return toDateOnly();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function code(prefix) {
  const stamp = new Date().getFullYear().toString() + pad2(new Date().getMonth() + 1) + pad2(new Date().getDate());
  const rand = Math.floor(Math.random() * 900 + 100);
  return `${prefix}-${stamp}-${rand}`;
}

function createUniqueCodeAllocator() {
  const counts = new Map();
  return (baseCode) => {
    const base = normalizeCode(baseCode);
    const current = counts.get(base) || 0;
    counts.set(base, current + 1);
    return current === 0 ? base : `${base}-${current + 1}`;
  };
}

async function ensureSchema() {
  await pool.query(`
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

  await pool.query(`ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_walk_in BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(120) NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50) NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS specification VARCHAR(120) NOT NULL DEFAULT ''`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_price NUMERIC(14,2) NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS current_stock INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_frequent BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE imports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
}

async function resetData() {
  await pool.query(`
    TRUNCATE TABLE
      audit_logs,
      order_items,
      orders,
      import_items,
      imports,
      products,
      customers,
      suppliers,
      users
    RESTART IDENTITY CASCADE
  `);
}

async function main() {
  await ensureSchema();

  const productCount = await pool.query(`SELECT COUNT(*)::int AS c FROM products`);
  if (!RESET && productCount.rows[0].c > 0) {
    console.log('Database already has data. Use --reset to rebuild the seed from scratch.');
    await pool.end();
    return;
  }

  if (RESET) {
    await resetData();
  }

  const users = seedData.users || [];
  const suppliers = seedData.suppliers || [];
  const products = seedData.products || [];
  const imports = seedData.imports || [];

  const userIdMap = new Map();
  const supplierIdMap = new Map();
  const productIdMap = new Map();

  const allocateProductCode = createUniqueCodeAllocator();
  const allocateImportItemCode = createUniqueCodeAllocator();

  for (const user of users) {
    const hash = bcrypt.hashSync(text(user.password), 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           full_name = EXCLUDED.full_name,
           role = EXCLUDED.role
       RETURNING id, username`,
      [text(user.username), hash, text(user.full_name), text(user.role, 'manager')]
    );
    userIdMap.set(rows[0].username, rows[0].id);
  }

  for (const supplier of suppliers) {
    const { rows } = await pool.query(
      `INSERT INTO suppliers (name, phone, address)
       VALUES ($1,$2,$3)
       RETURNING id, name`,
      [text(supplier.name), text(supplier.phone), text(supplier.address)]
    );
    supplierIdMap.set(rows[0].name, rows[0].id);
  }

  for (const product of products) {
    const normalizedCode = allocateProductCode(product.code);
    const supplierId = supplierIdMap.get(text(product.supplier_name)) || null;
    const { rows } = await pool.query(
      `INSERT INTO products (code, name, category, unit, specification, sale_price, current_stock, supplier_id, is_frequent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (code) DO UPDATE
       SET name = EXCLUDED.name,
           category = EXCLUDED.category,
           unit = EXCLUDED.unit,
           specification = EXCLUDED.specification,
           sale_price = EXCLUDED.sale_price,
           current_stock = EXCLUDED.current_stock,
           supplier_id = EXCLUDED.supplier_id,
           is_frequent = EXCLUDED.is_frequent,
           updated_at = NOW()
       RETURNING id, code`,
      [
        normalizedCode,
        text(product.name),
        text(product.category),
        text(product.unit),
        text(product.specification),
        n(product.price),
        n(product.stock),
        supplierId,
        Boolean(product.is_frequent),
      ]
    );
    productIdMap.set(rows[0].code, rows[0].id);
  }

  for (const imp of imports) {
    const supplierId = supplierIdMap.get(text(imp.supplier_name));
    const importedById = userIdMap.get(text(imp.imported_by)) || null;
    if (!supplierId) continue;

    const importCode = text(imp.import_code) || code('IMP');
    const { rows } = await pool.query(
      `INSERT INTO imports (import_code, supplier_id, imported_by, note, created_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (import_code) DO UPDATE
       SET supplier_id = EXCLUDED.supplier_id,
           imported_by = EXCLUDED.imported_by,
           note = EXCLUDED.note,
           created_at = EXCLUDED.created_at,
           updated_at = NOW()
       RETURNING id`,
      [importCode, supplierId, importedById, text(imp.note), toDateOnly(imp.created_at)]
    );
    const importId = rows[0].id;

    const items = Array.isArray(imp.items) ? imp.items : [];
    for (const item of items) {
      const normalizedItemCode = allocateImportItemCode(item.code);
      const quantity = n(item.quantity, 0);
      if (quantity <= 0) {
        continue;
      }

      const productId = productIdMap.get(normalizedItemCode);
      if (!productId) {
        continue;
      }

      await pool.query(
        `INSERT INTO import_items (import_id, product_id, quantity, created_at)
         VALUES ($1,$2,$3,$4)`,
        [importId, productId, quantity, toDateOnly(imp.created_at)]
      );
    }
  }

  console.log(`Seed complete: ${products.length} products, ${suppliers.length} suppliers, ${users.length} users, ${imports.length} imports.`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
