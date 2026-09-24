const bcrypt = require('bcryptjs');

// ข้อมูลตัวอย่างจากต้นแบบ (BPCD e-Portfolio v2)
const WORKS = [
  ['โครงการพัฒนาสมรรถนะครูอาชีวศึกษาด้านดิจิทัล (Digital Competency) รุ่นที่ 1–4', 'โครงการ', 'คำสั่ง สอศ. ที่ 1234/2568', 'พ.ย. 68 – มี.ค. 69', 'ครูผ่านการอบรม 412 คน จากเป้าหมาย 400 คน', 'KPI 1, 2, 3', 'รับรองแล้ว'],
  ['จัดทำแผนพัฒนาบุคลากรรายบุคคล (ID Plan) ประจำปีงบประมาณ 2569', 'งานประจำ', 'บันทึกข้อความ ที่ ศธ 0606/112', 'ต.ค. – ธ.ค. 68', 'บุคลากรจัดทำ ID Plan ครบร้อยละ 100', 'KPI 5', 'รับรองแล้ว'],
  ['พัฒนาหลักสูตรอบรมออนไลน์ “AI เพื่อการจัดการเรียนรู้สายอาชีพ”', 'วิชาการ', 'คำสั่ง สอศ. ที่ 0457/2569', 'ม.ค. – พ.ค. 69', 'หลักสูตร 6 หน่วย 12 ชั่วโมง เผยแพร่บน Thai MOOC', 'KPI 2', 'รอตรวจสอบ'],
  ['ประชุมเชิงปฏิบัติการจัดทำมาตรฐานสมรรถนะครูผู้สอนสาขาช่างอุตสาหกรรม', 'ยุทธศาสตร์', 'แผนปฏิบัติราชการ 2569', 'มิ.ย. – ส.ค. 69', 'ร่างมาตรฐานสมรรถนะ 5 สาขางาน', 'KPI 1', 'กำลังดำเนินการ'],
  ['รายงานผลการพัฒนาบุคลากรรอบ 6 เดือน เสนอผู้บริหาร', 'งานประจำ', 'บันทึกข้อความ ที่ ศธ 0606/389', 'เม.ย. 69', 'เสนอรายงานภายในกำหนด ผู้บริหารใช้ประกอบการตัดสินใจ', 'KPI 4', 'รับรองแล้ว'],
  ['ประสานงานระบบ R-HRD ลงทะเบียนและติดตามผู้เข้ารับการอบรม', 'บริการ', 'มอบหมายโดยผู้อำนวยการกลุ่ม', 'ตลอดปีงบประมาณ', 'ลงทะเบียนผู้เข้าอบรม 1,286 รายการ', 'KPI 1', 'รอหลักฐาน'],
  ['สรุปข้อมูลครูผู้ผ่านการพัฒนาตามนโยบายเร่งด่วนของกระทรวงศึกษาธิการ', 'เร่งด่วน', 'หนังสือด่วนที่สุด ที่ ศธ 0606/ว 77', 'ก.พ. 69', 'จัดส่งข้อมูลภายใน 3 วันทำการ', 'KPI 4', 'รับรองแล้ว']
];

// [name, kind, date, work index, status, checker]
const EVIDENCE = [
  ['คำสั่ง สอศ. ที่ 1234/2568 แต่งตั้งคณะทำงาน', 'PDF', '8 พ.ย. 68', 0, 'ตรวจแล้ว', 'ผอ.กลุ่ม'],
  ['รายชื่อผู้ผ่านการอบรม 412 คน', 'XLSX', '28 มี.ค. 69', 0, 'ตรวจแล้ว', 'ผอ.กลุ่ม'],
  ['ภาพกิจกรรมรุ่นที่ 1–4 (48 ภาพ)', 'ภาพ', '30 มี.ค. 69', 0, 'ตรวจแล้ว', 'ผอ.กลุ่ม'],
  ['รายงานสรุปผลโครงการ', 'PDF', '10 เม.ย. 69', 0, 'ตรวจแล้ว', 'ผอ.สำนัก'],
  ['บทเรียนออนไลน์บน Thai MOOC', 'URL', '20 พ.ค. 69', 2, 'รอตรวจสอบ', '—'],
  ['แบบประเมินความพึงพอใจ (Google Forms)', 'URL', '30 มี.ค. 69', 0, 'ตรวจแล้ว', 'ผอ.กลุ่ม'],
  ['บันทึกข้อความเสนอรายงานรอบ 6 เดือน', 'PDF', '22 เม.ย. 69', 4, 'ตรวจแล้ว', 'ผอ.สำนัก'],
  ['คลิปสรุปการประชุมเชิงปฏิบัติการ', 'วิดีโอ', '14 ก.ค. 69', 3, 'รอตรวจสอบ', '—']
];

const KPIS = [
  ['ร้อยละความสำเร็จของการจัดอบรมตามแผน', 'แผนปฏิบัติราชการ / R-HRD', 30, '100%', '96%', 96, 4.6],
  ['จำนวนครูที่ผ่านการพัฒนาสมรรถนะดิจิทัล', 'รายชื่อผู้ผ่านการอบรม', 25, '400 คน', '412 คน', 100, 5],
  ['ระดับความพึงพอใจของผู้เข้ารับการอบรม', 'แบบประเมินออนไลน์', 15, '4.00', '4.52', 100, 5],
  ['ความทันเวลาในการรายงานผล', 'ระบบสารบรรณ', 15, '100%', '90%', 90, 4],
  ['ร้อยละของบุคลากรที่มี ID Plan', 'ระบบ IDPlan', 15, '100%', '100%', 100, 5]
];

const COMPS = [
  ['หลัก', 'การมุ่งผลสัมฤทธิ์', 3, 4],
  ['หลัก', 'การบริการที่ดี', 3, 3],
  ['หลัก', 'การสั่งสมความเชี่ยวชาญในงานอาชีพ', 3, 4],
  ['หลัก', 'การยึดมั่นในความถูกต้องและจริยธรรม', 3, 3],
  ['หลัก', 'การทำงานเป็นทีม', 3, 4],
  ['ตำแหน่ง', 'การคิดวิเคราะห์', 3, 3],
  ['ตำแหน่ง', 'การพัฒนาศักยภาพคน', 3, 2],
  ['ดิจิทัล', 'การใช้เทคโนโลยีดิจิทัลในงาน', 3, 4]
];

const DUTIES = [
  'วางแผนและดำเนินโครงการพัฒนาสมรรถนะครูและบุคลากรอาชีวศึกษา',
  'จัดทำและติดตามแผนพัฒนาบุคลากรรายบุคคล (ID Plan)',
  'พัฒนาหลักสูตรและสื่อการอบรมรูปแบบออนไลน์',
  'รวบรวม วิเคราะห์ และรายงานผลการพัฒนาบุคลากรต่อผู้บริหาร'
];

async function seedUserData(client, uid, withWorks) {
  const wid = [];
  if (withWorks) {
    for (const w of WORKS) {
      const r = await client.query(
        'INSERT INTO works(user_id,title,type,ref,period,result,kpi,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
        [uid, ...w]
      );
      wid.push(r.rows[0].id);
    }
    for (const e of EVIDENCE) {
      await client.query(
        'INSERT INTO evidence(user_id,work_id,name,kind,ev_date,status,checker) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [uid, wid[e[3]], e[0], e[1], e[2], e[4], e[5]]
      );
    }
  }
  for (const k of KPIS) {
    await client.query(
      'INSERT INTO kpis(user_id,name,source,weight,target,actual,pct,score) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [uid, ...k]
    );
  }
  for (const c of COMPS) {
    await client.query('INSERT INTO competencies(user_id,grp,name,expected,actual) VALUES($1,$2,$3,$4,$5)', [uid, ...c]);
  }
}

module.exports = async function seed(pool) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return false;

  const pw = await bcrypt.hash(process.env.SEED_PASSWORD || 'changeme123', 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const admin = await client.query(
      `INSERT INTO users(username,password_hash,name,position,level,group_name,supervisor,role,duties)
       VALUES('admin',$1,'นางสาวพิมพ์ชนก วงศ์ประเสริฐ','นักทรัพยากรบุคคล','ชำนาญการ',
              'กลุ่มพัฒนาครูและบุคลากรทางการศึกษา','ผู้อำนวยการกลุ่ม','admin',$2) RETURNING id`,
      [pw, DUTIES.join('\n')]
    );
    const staff = await client.query(
      `INSERT INTO users(username,password_hash,name,position,level,group_name,supervisor,role)
       VALUES('staff',$1,'นายสมชาย ใจดี','นักวิชาการศึกษา','ปฏิบัติการ',
              'กลุ่มพัฒนาครูและบุคลากรทางการศึกษา','ผู้อำนวยการกลุ่ม','staff') RETURNING id`,
      [pw]
    );
    await seedUserData(client, admin.rows[0].id, true);
    await seedUserData(client, staff.rows[0].id, false);
    await client.query(
      `INSERT INTO settings(key,value) VALUES('ai',$1) ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify({ provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.5-flash', apiKey: '' })]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return true;
};

module.exports.seedUserData = seedUserData;
