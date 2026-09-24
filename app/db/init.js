// สร้างตารางและใส่ข้อมูลตัวอย่าง: npm run db:init
const { pool, migrate } = require('./index');
const seed = require('./seed');

(async () => {
  await migrate();
  const seeded = await seed(pool);
  console.log(seeded ? 'Database created and seeded.' : 'Schema up to date (data already present, seed skipped).');
  await pool.end();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
