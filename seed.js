require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const ADMIN_PASSWORD = 'admin123';
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

async function ensureSchema() {
  await pool.query(`
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
  `);
}

async function seed() {
  try {
    await ensureSchema();

    const productCount = await pool.query('SELECT COUNT(*)::int AS c FROM products');
    if (productCount.rows[0].c > 0) {
      console.log('Database already has data. Seed skipped.');
      await pool.end();
      return;
    }

    await pool.query(`
      INSERT INTO users (username, password_hash, full_name, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username) DO UPDATE
      SET password_hash = EXCLUDED.password_hash,
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role
    `, ['admin', ADMIN_HASH, 'Quản lý hệ thống', 'manager']);

    await pool.query(`
      INSERT INTO suppliers (name, phone, address) VALUES
      ('Nhà cung ứng A', '0900000001', 'Hà Nội'),
      ('Nhà cung ứng B', '0900000002', 'TP. Hồ Chí Minh')
    `);

    await pool.query(`
      INSERT INTO customers (name, phone, address, is_walk_in) VALUES
      ('Cửa hàng Mẫu 1', '0911111111', 'Đà Nẵng', FALSE),
      ('Khách lẻ', '', '', TRUE)
    `);

    await pool.query(`
      INSERT INTO products (code, name, sale_price, current_stock, supplier_id) VALUES
      ('SP-001', 'Sản phẩm A', 120000, 30, 1),
      ('SP-002', 'Sản phẩm B', 85000, 40, 1),
      ('SP-003', 'Sản phẩm C', 150000, 25, 2),
      ('SP-004', 'Sản phẩm D', 99000, 15, 2)
    `);

    console.log('Seed completed successfully.');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
