const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://bpcd:bpcd_pass@localhost:5432/bpcd_eportfolio'
});

async function migrate() {
  const { rows } = await pool.query('SHOW server_encoding');
  if (rows[0].server_encoding !== 'UTF8') {
    throw new Error(
      'ฐานข้อมูลใช้ encoding ' + rows[0].server_encoding + ' ซึ่งเก็บภาษาไทยไม่ได้ — สร้างฐานข้อมูลใหม่ด้วย: ' +
      "CREATE DATABASE bpcd_eportfolio ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';"
    );
  }
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

async function audit(userId, action, detail) {
  try {
    await pool.query('INSERT INTO audit_log(user_id,action,detail) VALUES($1,$2,$3)', [userId || null, action, detail || null]);
  } catch (e) {
    console.error('audit failed:', e.message);
  }
}

module.exports = { pool, migrate, audit };
