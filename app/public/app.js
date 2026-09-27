'use strict';
/* BPCD e-Portfolio — client (vanilla JS, no build step). Recreates "BPCD e-Portfolio v2" design. */

// ---------------- constants ----------------
const QUESTIONS = [
  { k: 'ชื่องาน/โครงการ', q: 'เริ่มจากชื่องานหรือโครงการที่ต้องการบันทึกลงแฟ้มครับ', chips: ['งานประจำ', 'โครงการฝึกอบรม', 'งานนโยบาย'] },
  { k: 'ผู้มอบหมาย/เอกสารสั่งการ', q: 'ได้รับมอบหมายจากใคร และผ่านช่องทางใด เช่น คำสั่ง สอศ. เลขที่ หรือบันทึกข้อความ', chips: ['คำสั่ง สอศ. ที่ …/2568', 'บันทึกข้อความ', 'มอบหมายด้วยวาจา'] },
  { k: 'เป้าหมายและระยะเวลา', q: 'งานนี้มีเป้าหมายอะไร เริ่มและครบกำหนดเมื่อใด', chips: ['ต.ค. 2568 – ก.ย. 2569'] },
  { k: 'บทบาทและการดำเนินงาน', q: 'ท่านมีบทบาทอย่างไร (ผู้รับผิดชอบหลัก/ร่วม) และดำเนินการอะไรบ้าง', chips: ['ผู้รับผิดชอบหลัก', 'ผู้รับผิดชอบร่วม', 'เลขานุการคณะทำงาน'] },
  { k: 'ผลผลิต/ผลลัพธ์', q: 'ผลผลิตหรือผลลัพธ์ที่ได้คืออะไร ถ้ามีตัวเลขช่วยระบุด้วยครับ', chips: [] },
  { k: 'หลักฐาน', q: 'มีหลักฐานอะไรยืนยันบ้าง กดปุ่ม 📎 เพื่อแนบไฟล์ หรือวางลิงก์ผลงานได้เลย', chips: ['คำสั่ง', 'รายงานสรุปผล', 'รายชื่อผู้เข้าร่วม', 'ภาพกิจกรรม', 'URL ผลงาน'] },
  { k: 'ตัวชี้วัดที่เกี่ยวข้อง', q: 'งานนี้เชื่อมกับ KPI ข้อใด เลือกจากรายการด้านล่างแล้วกดส่ง', chips: [] },
  { k: 'ผู้ตรวจสอบ/ผู้รับรอง', q: 'สุดท้าย ใครเป็นผู้ตรวจสอบและผู้รับรองผลงานนี้', chips: ['ผู้อำนวยการกลุ่ม', 'ผู้อำนวยการสำนัก'] }
];
const ACKS = ['รับทราบครับ', 'ขอบคุณครับ', 'ดีครับ', 'บันทึกไว้แล้วครับ'];
const PROVIDERS = {
  openrouter: { label: 'OpenRouter', sub: 'หลายโมเดลในที่เดียว', icon: 'bi bi-diagram-3', baseUrl: 'https://openrouter.ai/api/v1', model: 'google/gemini-2.5-flash', ph: 'sk-or-v1-…' },
  google: { label: 'Google AI Studio', sub: 'Gemini API', icon: 'bi bi-google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', ph: 'AIza…' },
  local: { label: 'Local LLM', sub: 'Ollama / LM Studio', icon: 'bi bi-pc-display', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', ph: 'ไม่จำเป็นสำหรับ Ollama' },
  custom: { label: 'กำหนดเอง', sub: 'OpenAI‑compatible', icon: 'bi bi-sliders', baseUrl: 'https://api.example.com/v1', model: '', ph: 'API Key' }
};
const ST = {
  'รับรองแล้ว': ['#E7F2EA', '#1E6B3A', 'bi bi-patch-check-fill'],
  'รอตรวจสอบ': ['#FFF4DB', '#8A5A00', 'bi bi-hourglass-split'],
  'กำลังดำเนินการ': ['#E8EEF8', '#2B4C8C', 'bi bi-arrow-repeat'],
  'รอหลักฐาน': ['#FBE9EA', '#9B1C2C', 'bi bi-exclamation-circle'],
  'ตรวจแล้ว': ['#E7F2EA', '#1E6B3A', 'bi bi-check2']
};
const TYPES = ['โครงการ', 'งานประจำ', 'วิชาการ', 'ยุทธศาสตร์', 'บริการ', 'เร่งด่วน'];
const WORK_STATUSES = ['รอตรวจสอบ', 'กำลังดำเนินการ', 'รอหลักฐาน', 'รับรองแล้ว'];
const TYPE_ICON = { 'โครงการ': 'bi bi-kanban', 'งานประจำ': 'bi bi-briefcase', 'วิชาการ': 'bi bi-mortarboard', 'ยุทธศาสตร์': 'bi bi-bullseye', 'บริการ': 'bi bi-headset', 'เร่งด่วน': 'bi bi-lightning' };
const EV_ICON = { PDF: 'bi bi-file-earmark-pdf', DOCX: 'bi bi-file-earmark-word', XLSX: 'bi bi-file-earmark-spreadsheet', 'ภาพ': 'bi bi-images', URL: 'bi bi-link-45deg', 'วิดีโอ': 'bi bi-camera-video' };
const PAGE_TITLES = { dashboard: 'แดชบอร์ด', works: 'ผลงานและโครงการ', evidence: 'หลักฐาน', kpi: 'KPI และสมรรถนะ', settings: 'ตั้งค่าผู้ช่วย AI', period: 'รอบการประเมิน', users: 'จัดการผู้ใช้', security: 'ความปลอดภัย' };

// ---------------- state ----------------
const greet = () => ({ role: 'bot', text: 'สวัสดีครับ ผมจะช่วยสัมภาษณ์เพื่อบันทึกผลงานเข้าแฟ้ม 8 คำถามสั้น ๆ ตอบด้วยการพิมพ์หรือกดไมค์พูดได้เลย\n\n1/8 ' + QUESTIONS[0].q });
const S = {
  booted: false, me: null, data: null, loginErr: '',
  view: 'admin', page: 'dashboard', typeFilter: 'ทั้งหมด', search: '', sideOpen: false,
  chatOpen: false, mode: 'interview', chatInput: '', listening: false, loading: false,
  hintSeen: localStore('hintSeen') === '1',
  ivStep: 0, ivAnswers: [], ivMsgs: [greet()], ivDone: false, draftSummary: '', ivKpis: {}, ivEvidence: [],
  askMsgs: [{ role: 'bot', text: 'สอบถามเรื่องแฟ้มสะสมงาน KPI สมรรถนะ หรือให้ช่วยร่างข้อความได้เลยครับ' }],
  pfTab: 'overview', pfType: 'ทั้งหมด', pfDetail: null, pfEv: null,
  modal: null, pendingFiles: [], busy: false, formErr: '',
  aiForm: null, testMsg: '', testOk: null, users: null
};

function localStore(k, v) {
  try {
    if (v === undefined) return localStorage.getItem('bpcd_' + k);
    localStorage.setItem('bpcd_' + k, v);
  } catch (e) { return null; }
}

// บทสนทนากับผู้ช่วย AI เก็บใน sessionStorage (แยกตามผู้ใช้) ให้คงอยู่เมื่อเปลี่ยนหน้า/รีเฟรช
// ลบเมื่อออกจากระบบหรือปิดแท็บ; ข้อความที่มีรหัสผ่าน (secret) ไม่ถูกเก็บ
const CHAT_KEYS = ['askMsgs', 'ivMsgs', 'ivStep', 'ivAnswers', 'ivDone', 'draftSummary', 'ivKpis', 'ivEvidence', 'mode', 'chatOpen'];
const chatKey = () => S.me && 'bpcd_chat_' + S.me.id;
function saveChat() {
  if (!chatKey() || !S._chatRestored) return;
  const o = {};
  for (const k of CHAT_KEYS) o[k] = S[k];
  o.askMsgs = S.askMsgs.filter(m => !m.secret);
  try { sessionStorage.setItem(chatKey(), JSON.stringify(o)); } catch (e) { /* storage ปิดอยู่ */ }
}
function restoreChat() {
  if (S._chatRestored || !chatKey()) return;
  S._chatRestored = true;
  try {
    const o = JSON.parse(sessionStorage.getItem(chatKey()) || 'null');
    if (o) for (const k of CHAT_KEYS) if (o[k] !== undefined) S[k] = o[k];
    S._scrollChat = true;
  } catch (e) { /* ข้อมูลเสีย — เริ่มใหม่ */ }
}
function clearChat() {
  try { Object.keys(sessionStorage).filter(k => k.startsWith('bpcd_chat_')).forEach(k => sessionStorage.removeItem(k)); } catch (e) { /* ignore */ }
}

// ---------------- helpers ----------------
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = n => String(n).padStart(2, '0');
const stOf = s => ST[s] || ST['รอตรวจสอบ'];
const withSt = w => { const c = stOf(w.status); return { ...w, stBg: c[0], stFg: c[1], stIcon: c[2], icon: TYPE_ICON[w.type] || 'bi bi-file-text' }; };
const isAdmin = () => S.me && S.me.role === 'admin';
const photoUrl = u => u && u.photoVer ? '/api/profile/photo?v=' + u.photoVer : '';
// รอบการประเมิน/ปีงบประมาณที่ผู้ดูแลกำหนด (มาจาก /api/portfolio)
// PER = รอบปัจจุบันของระบบ (ปีงบที่แสดงทั่วไป) · VPER = รอบที่กำลังดู KPI/สมรรถนะ (ผู้ดูแลเลือกได้)
const PER = () => (S.data && S.data.current) || { fiscalYear: '', round: '', start: '', end: '' };
const VPER = () => (S.data && S.data.period) || PER();
const thDate = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
const periodRange = () => thDate(PER().start) + ' – ' + thDate(PER().end);

let CSRF_TOKEN = '';
async function ensureCsrfToken() {
  if (CSRF_TOKEN) return CSRF_TOKEN;
  const r = await fetch('/api/csrf', { credentials: 'same-origin' });
  const j = await r.json().catch(() => ({}));
  CSRF_TOKEN = j.token || '';
  return CSRF_TOKEN;
}

// เซิร์ฟเวอร์ deploy เวอร์ชันใหม่ระหว่างที่หน้าเปิดอยู่ -> แจ้งให้รีเฟรช (บทสนทนา AI ไม่หายเพราะเก็บใน sessionStorage)
let APP_VERSION = '';
function showUpdateBanner() {
  if (document.getElementById('updBanner')) return;
  const b = document.createElement('button');
  b.id = 'updBanner';
  b.textContent = '↻ มีระบบเวอร์ชันใหม่ — กดที่นี่เพื่อรีเฟรช';
  b.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;padding:10px 18px;border-radius:24px;background:#7B1E2B;color:#fff;font-size:14px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,.25)';
  b.onclick = () => location.reload();
  document.body.appendChild(b);
}
async function api(url, opts = {}, retried = false) {
  const o = { credentials: 'same-origin', ...opts };
  const method = (o.method || 'GET').toUpperCase();
  if (o.body && !(o.body instanceof FormData)) {
    o.headers = { 'Content-Type': 'application/json', ...(o.headers || {}) };
    o.body = JSON.stringify(o.body);
  }
  if (method !== 'GET' && method !== 'HEAD') {
    o.headers = { 'X-CSRF-Token': await ensureCsrfToken(), ...(o.headers || {}) };
  }
  const r = await fetch(url, o);
  const j = await r.json().catch(() => ({}));
  // token เก่า (session หมดอายุ/เซิร์ฟเวอร์รีสตาร์ท) — ขอ token ใหม่แล้วลองอีกครั้ง
  if (r.status === 403 && j.csrf && !retried) { CSRF_TOKEN = ''; return api(url, opts, true); }
  const ver = r.headers.get('X-App-Version');
  if (ver) { if (!APP_VERSION) APP_VERSION = ver; else if (ver !== APP_VERSION) showUpdateBanner(); }
  if (r.status === 401 && url !== '/api/login') { S.me = null; S.data = null; CSRF_TOKEN = ''; render(); }
  // 502/503/504 ที่ไม่มี JSON = หน้า error ของ nginx/proxy (แอปไม่ตอบ หรือกำลังรีสตาร์ท)
  if (!r.ok) throw new Error(j.error || ([502, 503, 504].includes(r.status)
    ? 'เซิร์ฟเวอร์ไม่ตอบสนอง (HTTP ' + r.status + ') — ลองใหม่อีกครั้ง ถ้ายังไม่ได้แจ้งผู้ดูแลระบบ'
    : 'HTTP ' + r.status));
  if (url === '/api/login' && j.csrfToken) CSRF_TOKEN = j.csrfToken;
  return j;
}

let toastTimer;
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast no-print'; document.body.appendChild(el); }
  el.textContent = msg; el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 3200);
}

async function loadData() {
  const q = [S.viewPeriod && 'period=' + S.viewPeriod, S.workPeriod && 'wperiod=' + S.workPeriod].filter(Boolean).join('&');
  const d = await api('/api/portfolio' + (q ? '?' + q : ''));
  S.data = d;
  S.me = d.user;
  restoreChat();
}

// ---------------- derived values ----------------
function derive() {
  const d = S.data;
  const works = d.works.map(withSt);
  const n = works.length;
  const wsum = d.kpis.reduce((a, k) => a + k.weight, 0) || 1;
  const kpiScore = (d.kpis.reduce((a, k) => a + k.score * k.weight, 0) / wsum).toFixed(2);
  const certified = works.filter(w => w.status === 'รับรองแล้ว').length;
  const evTotal = d.evidence.length;
  const evPending = d.evidence.filter(e => e.status === 'รอตรวจสอบ').length;
  const missing = works.filter(w => w.ev === 0);
  const kpiMet = d.kpis.filter(k => k.pct >= 100).length;
  const compPass = d.comps.filter(c => c.actual >= c.expected).length;
  const u = d.user;
  const ratio = f => (n ? works.filter(f).length / n : 0);
  const checks = [
    ['ข้อมูลบุคลากรและตำแหน่ง', u.position && u.level && u.group_name ? 1 : 0],
    ['คำสั่งมอบหมายงาน', ratio(w => w.ref)],
    ['ผลการดำเนินงานโครงการ', ratio(w => w.result)],
    ['หลักฐานครบทุกผลงาน', ratio(w => w.ev > 0)],
    ['ผลงานได้รับการรับรองครบ', ratio(w => w.status === 'รับรองแล้ว')]
  ];
  const completeness = Math.round(100 * checks.reduce((a, c) => a + c[1], 0) / checks.length);
  const duties = String(u.duties || '').split('\n').map(s => s.trim()).filter(Boolean);
  const chain = [
    ['บุคลากร', '1 คน'], ['ตำแหน่ง', u.level || '-'], ['หน้าที่', duties.length + ' ด้าน'],
    ['งานที่มอบหมาย', n + ' งาน'], ['การดำเนินงาน', works.filter(w => w.status !== 'รอหลักฐาน').length + ' ดำเนินการแล้ว'],
    ['ผลงาน', certified + ' รับรอง'], ['หลักฐาน', evTotal + ' ไฟล์'], ['KPI', d.kpis.length + ' ตัวชี้วัด'],
    ['การประเมิน', n && certified === n ? 'รับรองครบ' : 'อยู่ระหว่างประเมิน']
  ].map(([label, val], i) => ({ no: pad2(i + 1), label, val, bar: i < 7 ? '#7B1E2B' : i === 7 ? '#B8913A' : (n && certified === n ? '#7B1E2B' : '#E6DEDC') }));
  return { works, n, kpiScore, certified, evTotal, evPending, missing, kpiMet, compPass, checks, completeness, duties, chain };
}

function gapInfo(c) {
  const g = c.actual - c.expected;
  return { g, gapLabel: g > 0 ? 'สูงกว่าคาดหวัง +' + g : g < 0 ? 'ต่ำกว่าคาดหวัง ' + g : 'ตามเกณฑ์', gapColor: g < 0 ? '#C42838' : g > 0 ? '#1E6B3A' : '#6B6264' };
}

// ---------------- views: login ----------------
function viewLogin() {
  return `
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#3A0B13;position:relative;overflow:hidden">
  <img src="/vec-logo.png" alt="" style="position:absolute;right:-140px;top:-80px;width:600px;height:600px;opacity:.06;pointer-events:none;filter:grayscale(1) brightness(2)">
  <form data-form="login" style="position:relative;width:100%;max-width:400px;background:#fff;border-radius:22px;padding:34px 32px;display:flex;flex-direction:column;gap:16px;box-shadow:0 30px 80px rgba(0,0,0,.35)">
    <div style="display:flex;gap:12px;align-items:center">
      <img src="/vec-logo.png" alt="ตรา สอศ." style="width:52px;height:52px">
      <div style="line-height:1.3"><div style="font-weight:700;font-size:18px">BPCD e‑Portfolio</div><div style="font-size:12.5px;color:#8A7F81">ระบบแฟ้มสะสมงานอิเล็กทรอนิกส์</div></div>
    </div>
    <div style="font-size:13px;color:#6B6264;line-height:1.6">สำนักพัฒนาสมรรถนะครูและบุคลากรอาชีวศึกษา<br>สำนักงานคณะกรรมการการอาชีวศึกษา</div>
    <label class="field">ชื่อผู้ใช้<input id="loginUser" name="username" value="${esc(S.loginUser || '')}" autocomplete="username" required ${S.loginUser ? '' : 'autofocus'}></label>
    <label class="field">รหัสผ่าน<input id="loginPass" name="password" type="password" autocomplete="current-password" required ${S.loginUser ? 'autofocus' : ''}></label>
    ${S.loginErr ? `<div style="font-size:13px;color:#C42838">${esc(S.loginErr)}</div>` : ''}
    <button type="submit" class="btn btn-primary" style="padding:11px 16px">${S.busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
  </form>
</div>`;
}

// ---------------- views: admin shell ----------------
function viewAdmin(D) {
  const pending = S.data.evidence.filter(e => e.status === 'รอตรวจสอบ').length;
  const nav = [['dashboard', 'แดชบอร์ด', 'bi bi-speedometer2'], ['works', 'ผลงานและโครงการ', 'bi bi-kanban', D.n], ['evidence', 'หลักฐาน', 'bi bi-folder2-open', pending], ['kpi', 'KPI และสมรรถนะ', 'bi bi-graph-up-arrow']];
  if (isAdmin()) nav.push(['period', 'รอบการประเมิน', 'bi bi-calendar3'], ['settings', 'ตั้งค่าผู้ช่วย AI', 'bi bi-cpu'], ['users', 'จัดการผู้ใช้', 'bi bi-people'], ['security', 'ความปลอดภัย', 'bi bi-shield-check']);
  const ai = S.data.ai;
  const P = PROVIDERS[ai.provider] || PROVIDERS.custom;
  const aiText = ai.ready ? 'เชื่อมต่อ ' + P.label + ' · ' + ai.model : isAdmin() ? 'ยังไม่เชื่อมต่อ API — ตั้งค่าได้ที่เมนู “ตั้งค่าผู้ช่วย AI”' : 'ผู้ดูแลระบบยังไม่เปิดการเชื่อมต่อ · โหมดสัมภาษณ์ใช้งานได้ทันที';
  const u = S.data.user;
  // "นางสาวพิมพ์ชนก วงศ์ประเสริฐ" -> "พว" (first letter of first name + surname)
  const initials = (u.name || '').replace(/^(นางสาว|นาง|นาย|ดร\.)\s*/, '').split(/\s+/).slice(0, 2).map(p => p[0] || '').join('');
  const page = { dashboard: pageDashboard, works: pageWorks, evidence: pageEvidence, kpi: pageKpi, settings: pageSettings, period: pagePeriod, users: pageUsers, security: pageSecurity }[S.page] || pageDashboard;
  return `
<div class="layout">
  ${S.sideOpen ? '<div data-act="side" style="position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:39"></div>' : ''}
  <aside class="sidebar ${S.sideOpen ? 'open' : ''}">
    <div style="padding:20px 20px 18px;display:flex;gap:12px;align-items:center;border-bottom:1px solid rgba(255,255,255,.08)">
      <img src="/vec-logo.png" alt="ตรา สอศ." style="width:44px;height:44px;flex-shrink:0;display:block">
      <div style="line-height:1.25"><div style="font-weight:700;font-size:15px;color:#fff">BPCD e‑Portfolio</div><div style="font-size:11.5px;color:#D9B8BC">ระบบแฟ้มสะสมงานอิเล็กทรอนิกส์</div></div>
    </div>
    <div style="padding:16px 12px 6px 22px;font-size:11px;letter-spacing:1px;color:#B98C92">เมนูหลัก</div>
    <nav style="display:flex;flex-direction:column;gap:2px;padding:0 12px">
      ${nav.map(([k, label, icon, badge]) => `
      <button data-act="page" data-v="${k}" class="h-side" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;font-size:14px;background:${S.page === k ? '#7B1E2B' : 'transparent'};color:${S.page === k ? '#fff' : '#E4CBCE'}">
        <i class="${icon}" style="font-size:16px;width:18px"></i><span style="flex:1">${label}</span>
        ${badge ? `<span style="background:#B8913A;color:#2A0A0F;font-size:11px;font-weight:700;padding:1px 7px;border-radius:10px">${badge}</span>` : ''}
      </button>`).join('')}
    </nav>
    <div style="padding:18px 12px 6px 22px;font-size:11px;letter-spacing:1px;color:#B98C92">การแสดงผล</div>
    <div style="padding:0 12px">
      <button data-act="goPortfolio" class="h-side" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;font-size:14px;color:#F3E6E7;width:100%">
        <i class="bi bi-journal-richtext" style="font-size:16px;width:18px"></i><span style="flex:1">หน้าแสดง Portfolio</span><i class="bi bi-box-arrow-up-right" style="font-size:12px;opacity:.6"></i>
      </button>
    </div>
    <div style="margin-top:auto;padding:16px;border-top:1px solid rgba(255,255,255,.08)">
      <div style="background:rgba(184,145,58,.12);border:1px solid rgba(184,145,58,.35);border-radius:10px;padding:12px">
        <div style="font-size:12px;color:#F1D9A0;font-weight:600;display:flex;gap:6px;align-items:center"><i class="bi bi-stars"></i>ผู้ช่วย AI</div>
        <div style="font-size:12px;color:#E4CBCE;margin-top:4px;line-height:1.5">${esc(aiText)}</div>
      </div>
    </div>
  </aside>

  <main style="flex:1;min-width:0;display:flex;flex-direction:column">
    <header style="height:64px;background:#fff;border-bottom:1px solid #E6DEDC;display:flex;align-items:center;gap:10px;padding:0 20px;position:sticky;top:0;z-index:5">
      <button data-act="side" class="menu-toggle icon-btn" style="width:36px;height:36px" aria-label="เมนู"><i class="bi bi-list" style="font-size:20px"></i></button>
      <div class="hide-sm" style="font-size:13px;color:#8A7F81;display:flex;gap:8px;align-items:center;white-space:nowrap"><i class="bi bi-house-door"></i><span>หน้าหลัก</span><i class="bi bi-chevron-right" style="font-size:10px"></i><span style="color:#1F1A1B;font-weight:600">${PAGE_TITLES[S.page]}</span></div>
      <div style="flex:1;min-width:0"></div>
      <div style="display:flex;align-items:center;gap:8px;border:1px solid #E6DEDC;border-radius:8px;padding:7px 12px;flex:0 1 240px;min-width:44px;overflow:hidden;color:#8A7F81;font-size:13px"><i class="bi bi-search"></i><input id="search" data-bind="search" data-rerender="1" value="${esc(S.search)}" placeholder="ค้นหาผลงาน หลักฐาน KPI…" style="border:0;outline:0;flex:1;min-width:0;width:100%;font-size:13px;background:transparent"></div>
      <div class="hide-sm" style="font-size:13px;border:1px solid #E6DEDC;border-radius:8px;padding:7px 12px;display:flex;gap:6px;align-items:center;white-space:nowrap;flex-shrink:0"><i class="bi bi-calendar3" style="color:#7B1E2B"></i>ปีงบ ${esc(PER().fiscalYear)}</div>
      <span class="hide-sm" style="font-size:12px;padding:5px 10px;border-radius:6px;background:#F4F1EF;color:#7B1E2B;font-weight:600;white-space:nowrap">${isAdmin() ? 'ผู้ดูแลระบบ' : 'บุคลากร'}</span>
      <div style="display:flex;gap:6px;align-items:center;padding-left:8px;border-left:1px solid #E6DEDC">
        <button data-act="modal" data-v="profile" title="${esc(u.name)} — แก้ไขข้อมูลส่วนตัว" style="width:36px;height:36px;border-radius:50%;overflow:hidden;background:#F6ECEC;color:#7B1E2B;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">${photoUrl(u) ? `<img src="${photoUrl(u)}" alt="" style="width:100%;height:100%;object-fit:cover">` : esc(initials)}</button>
        <button data-act="logout" class="icon-btn" title="ออกจากระบบ"><i class="bi bi-box-arrow-right" style="font-size:17px"></i></button>
      </div>
    </header>
    <div class="page-pad" style="padding:28px;display:flex;flex-direction:column;gap:22px;max-width:1360px;width:100%">
      ${page(D)}
      <div style="font-size:12px;color:#A59A9C;padding-top:8px">© ${new Date().getFullYear() + 543} สำนักพัฒนาสมรรถนะครูและบุคลากรอาชีวศึกษา สำนักงานคณะกรรมการการอาชีวศึกษา</div>
    </div>
  </main>
</div>`;
}

const card = 'background:#fff;border:1px solid #E6DEDC;border-radius:12px';
const pageHead = (title, sub, right = '') => `
<div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap">
  <div style="flex:1;min-width:260px"><h1 style="margin:0;font-size:24px;font-weight:700">${title}</h1><div style="color:#6B6264;font-size:14px;margin-top:4px">${sub}</div></div>
  ${right}
</div>`;
const statusPill = (s, extra = '') => { const c = stOf(s); return `<span style="font-size:12px;font-weight:600;padding:3px 10px;border-radius:20px;background:${c[0]};color:${c[1]};white-space:nowrap;${extra}">${esc(s)}</span>`; };

// ---------------- page: dashboard ----------------
function pageDashboard(D) {
  const d = S.data, u = d.user;
  const stats = [
    { label: 'ผลงานทั้งหมด', value: D.n, unit: 'รายการ', note: 'รับรองแล้ว ' + D.certified + ' รายการ', icon: 'bi bi-kanban' },
    { label: 'หลักฐาน', value: D.evTotal, unit: 'ไฟล์', note: 'รอตรวจสอบ ' + D.evPending + ' · ขาดหลักฐาน ' + D.missing.length + ' งาน', icon: 'bi bi-folder2-open' },
    { label: 'คะแนน KPI ถ่วงน้ำหนัก', value: D.kpiScore, unit: '/ 5.00', note: 'บรรลุเป้าหมาย ' + D.kpiMet + ' จาก ' + d.kpis.length + ' ตัวชี้วัด', icon: 'bi bi-graph-up-arrow' },
    { label: 'สมรรถนะตามเกณฑ์', value: D.compPass + '/' + d.comps.length, unit: 'ด้าน', note: 'ต่ำกว่าคาดหวัง ' + (d.comps.length - D.compPass) + ' ด้าน', icon: 'bi bi-person-check' }
  ];
  const insights = [
    ...D.missing.map(w => ({ icon: 'bi bi-exclamation-triangle-fill', color: '#C42838', text: '“' + (w.title.length > 42 ? w.title.slice(0, 42) + '…' : w.title) + '” ยังไม่มีหลักฐานแนบ' })),
    ...d.kpis.filter(k => k.pct < 100).map(k => ({ icon: 'bi bi-arrow-down-right-circle-fill', color: '#B8913A', text: 'KPI ' + k.name + ' ได้ ' + k.actual + ' ต่ำกว่าเป้าหมาย ' + k.target })),
    ...d.comps.filter(c => c.actual < c.expected).map(c => ({ icon: 'bi bi-lightbulb-fill', color: '#2B4C8C', text: 'สมรรถนะ “' + c.name + '” ต่ำกว่าระดับคาดหวัง ' + (c.expected - c.actual) + ' ระดับ แนะนำเพิ่มใน ID Plan รอบถัดไป' }))
  ];
  if (!insights.length) insights.push({ icon: 'bi bi-check-circle-fill', color: '#1E6B3A', text: 'แฟ้มครบถ้วน ไม่พบประเด็นที่ต้องติดตาม' });
  return `
${pageHead('ภาพรวมแฟ้มสะสมงาน', esc(u.name) + ' · ' + esc((u.position || '') + (u.level || '')), `
  <button data-act="startInterview" class="btn btn-primary" style="padding:10px 16px"><i class="bi bi-mic"></i>ให้ AI สัมภาษณ์เพิ่มผลงาน</button>
  <button data-act="goPortfolio" class="btn btn-outline"><i class="bi bi-eye"></i>ดูตัวอย่าง Portfolio</button>`)}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">
  ${stats.map(s => `
  <div style="${card};padding:18px 20px;display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;align-items:center;justify-content:space-between"><span style="font-size:13px;color:#6B6264">${s.label}</span><span style="width:32px;height:32px;border-radius:8px;background:#F6ECEC;color:#7B1E2B;display:flex;align-items:center;justify-content:center"><i class="${s.icon}"></i></span></div>
    <div style="display:flex;align-items:baseline;gap:6px"><span style="font-size:30px;font-weight:700;letter-spacing:-.5px">${esc(s.value)}</span><span style="font-size:13px;color:#8A7F81">${s.unit}</span></div>
    <div style="font-size:12.5px;color:#6B6264">${esc(s.note)}</div>
  </div>`).join('')}
</div>
<div style="${card};padding:20px 22px">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px"><div style="font-weight:600;font-size:15px">เส้นทางข้อมูลผลการปฏิบัติงาน</div><div style="font-size:12.5px;color:#8A7F81">บุคลากร → การประเมิน</div></div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:14px 6px">
    ${D.chain.map(c => `<div style="border-top:3px solid ${c.bar};padding-top:10px"><div style="font-size:11px;color:#8A7F81">${c.no}</div><div style="font-size:13px;font-weight:600;margin-top:2px">${c.label}</div><div style="font-size:12px;color:#6B6264;margin-top:2px">${esc(c.val)}</div></div>`).join('')}
  </div>
</div>
<div class="two-col">
  <div style="${card};overflow:hidden">
    <div style="padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #EFE8E6"><div style="font-weight:600;font-size:15px">ผลงานล่าสุด</div><button data-act="page" data-v="works" style="font-size:13px;color:#7B1E2B">ดูทั้งหมด <i class="bi bi-arrow-right"></i></button></div>
    ${D.works.slice(0, 5).map(w => `
    <div style="display:flex;gap:14px;align-items:center;padding:13px 20px;border-bottom:1px solid #F3EEEC">
      <div style="width:36px;height:36px;border-radius:8px;background:#F6ECEC;color:#7B1E2B;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="${w.icon}"></i></div>
      <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(w.title)}</div><div style="font-size:12px;color:#8A7F81;margin-top:2px">${esc(w.type)} · ${esc(w.period || '-')} · หลักฐาน ${w.ev} รายการ</div></div>
      ${statusPill(w.status)}
    </div>`).join('') || emptyRow('ยังไม่มีผลงาน — เริ่มบันทึกด้วยผู้ช่วย AI ได้เลย')}
  </div>
  <div style="display:flex;flex-direction:column;gap:16px">
    <div style="${card};padding:18px 20px">
      <div style="display:flex;gap:8px;align-items:center;font-weight:600;font-size:15px"><i class="bi bi-stars" style="color:#B8913A"></i>ข้อสังเกตจากผู้ช่วย AI</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">
        ${insights.slice(0, 6).map(it => `<div style="display:flex;gap:10px;font-size:13px;line-height:1.55"><i class="${it.icon}" style="color:${it.color};margin-top:2px"></i><span>${esc(it.text)}</span></div>`).join('')}
      </div>
      <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #E6DEDC;font-size:11.5px;color:#8A7F81">AI เป็นผู้ช่วยวิเคราะห์เท่านั้น ผลการประเมินขั้นสุดท้ายเป็นของผู้ประเมินและผู้รับรอง</div>
    </div>
    <div style="${card};padding:18px 20px">
      <div style="display:flex;justify-content:space-between;font-weight:600;font-size:15px"><span>ความครบถ้วนของแฟ้ม</span><span style="color:#7B1E2B">${D.completeness}%</span></div>
      <div style="height:8px;background:#F1EAE8;border-radius:8px;margin-top:12px;overflow:hidden"><div style="height:100%;width:${D.completeness}%;background:#7B1E2B;border-radius:8px"></div></div>
      <div style="display:flex;flex-direction:column;gap:7px;margin-top:14px">
        ${D.checks.map(([label, r]) => { const ok = r >= 1; return `<div style="display:flex;gap:8px;font-size:13px;align-items:center"><i class="${ok ? 'bi bi-check-circle-fill' : 'bi bi-circle'}" style="color:${ok ? '#1E6B3A' : '#C7BCBD'}"></i><span style="color:${ok ? '#1F1A1B' : '#8A7F81'}">${label}</span>${!ok && r > 0 ? `<span style="margin-left:auto;font-size:11.5px;color:#8A7F81">${Math.round(r * 100)}%</span>` : ''}</div>`; }).join('')}
      </div>
    </div>
  </div>
</div>`;
}
const emptyRow = t => `<div style="padding:40px;text-align:center;color:#8A7F81;font-size:14px">${t}</div>`;

// ---------------- page: works ----------------
function chipRow(list, cur, act) {
  return list.map(t => { const on = cur === t; return `<button data-act="${act}" data-v="${esc(t)}" style="font-size:13px;padding:6px 14px;border-radius:20px;border:1px solid ${on ? '#7B1E2B' : '#D9CCCB'};background:${on ? '#7B1E2B' : '#fff'};color:${on ? '#fff' : '#3E3537'}">${esc(t)}</button>`; }).join('');
}
function pageWorks(D) {
  const q = S.search.trim();
  const list = D.works.filter(w => (S.typeFilter === 'ทั้งหมด' || w.type === S.typeFilter) && (!q || (w.title + (w.ref || '') + (w.result || '')).includes(q)));
  const cols = 'grid-template-columns:48px minmax(0,3fr) 120px minmax(0,1.4fr) 80px 130px 70px';
  return `
${pageHead('ผลงานและโครงการ', 'งานประจำ งานนโยบาย งานโครงการ และงานมอบหมายพิเศษ ปีงบประมาณ ' + esc(PER().fiscalYear), `
  ${workPeriodSelect()}<button data-act="modal" data-v="work" class="btn btn-outline"><i class="bi bi-pencil-square"></i>เพิ่มผลงานเอง</button>`)}
<div style="display:flex;gap:8px;flex-wrap:wrap">${chipRow(['ทั้งหมด', ...TYPES], S.typeFilter, 'typeFilter')}</div>
<div style="${card};overflow:hidden" class="table-wrap">
  <div class="table-min">
    <div style="display:grid;${cols};gap:12px;padding:12px 20px;background:#FAF7F6;border-bottom:1px solid #EFE8E6;font-size:12px;color:#6B6264;font-weight:600">
      <div>ลำดับ</div><div>ชื่องาน / ผู้มอบหมาย</div><div>ประเภท</div><div>ผลลัพธ์</div><div>หลักฐาน</div><div>สถานะ</div><div></div>
    </div>
    ${list.map((w, i) => `
    <div class="h-row" style="display:grid;${cols};gap:12px;padding:14px 20px;border-bottom:1px solid #F3EEEC;align-items:center;font-size:13.5px">
      <div style="color:#8A7F81">${i + 1}</div>
      <div><div style="font-weight:600;line-height:1.45">${esc(w.title)}</div><div style="font-size:12px;color:#8A7F81;margin-top:3px">${esc(w.ref || '-')} · ${esc(w.period || '-')} ${periodTag(w.period_id)}</div></div>
      <div><span style="font-size:12px;padding:2px 8px;border-radius:6px;background:#F4F1EF;color:#5A5052">${esc(w.type)}</span></div>
      <div style="color:#3E3537;line-height:1.45">${esc(w.result || '-')}</div>
      <div><button data-act="uploadFor" data-id="${w.id}" title="แนบหลักฐาน" style="display:flex;gap:6px;align-items:center;color:#5A5052;padding:4px 6px;border-radius:6px" class="h-light"><i class="bi bi-paperclip"></i>${w.ev}</button></div>
      <div>${statusPill(w.status)}</div>
      <div style="display:flex;gap:2px"><button class="icon-btn" data-act="editWork" data-id="${w.id}" title="แก้ไข"><i class="bi bi-pencil"></i></button><button class="icon-btn" data-act="delWork" data-id="${w.id}" title="ลบ"><i class="bi bi-trash3"></i></button></div>
    </div>`).join('')}
    ${list.length ? '' : emptyRow('ไม่พบผลงานตามเงื่อนไข')}
  </div>
</div>`;
}

// ---------------- page: evidence ----------------
function evHref(e) { return e.hasFile ? '/files/' + e.id : e.url || ''; }
function pageEvidence(D) {
  const q = S.search.trim();
  const wt = id => (S.data.works.find(w => w.id === id) || {}).title;
  const list = S.data.evidence.filter(e => !q || (e.name + (wt(e.work_id) || '')).includes(q));
  return `
${pageHead('หลักฐานการปฏิบัติงาน', 'คำสั่ง รายงาน รายชื่อ ภาพ วิดีโอ URL ผลงานดิจิทัล และสถิติ', workPeriodSelect())}
<div data-drop="1" style="border:2px dashed #D9CCCB;border-radius:12px;background:#FCFAF9;padding:26px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">
  <div style="width:52px;height:52px;border-radius:12px;background:#F6ECEC;color:#7B1E2B;display:flex;align-items:center;justify-content:center;font-size:22px"><i class="bi bi-cloud-arrow-up"></i></div>
  <div style="flex:1;min-width:220px"><div style="font-weight:600;font-size:15px">ลากไฟล์หลักฐานมาวางที่นี่</div><div style="font-size:13px;color:#6B6264;margin-top:2px">PDF, DOCX, XLSX, JPG, PNG, MP4 (ไม่เกิน 50 MB) หรือวางลิงก์ Google Drive / OneDrive แล้วเลือกผลงานที่เชื่อมโยง</div></div>
  <button data-act="modal" data-v="evidence" class="btn btn-outline" style="font-weight:400">เลือกไฟล์ / เพิ่มลิงก์</button>
</div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
  ${list.map(e => { const c = stOf(e.status); const href = evHref(e); return `
  <div style="${card};padding:16px;display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;gap:12px;align-items:flex-start">
      <div style="width:40px;height:40px;border-radius:8px;background:#F6ECEC;color:#7B1E2B;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0"><i class="${EV_ICON[e.kind] || 'bi bi-file-earmark'}"></i></div>
      <div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600;line-height:1.4;word-break:break-word">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener" style="color:inherit">${esc(e.name)}</a>` : esc(e.name)}</div><div style="font-size:12px;color:#8A7F81;margin-top:3px">${esc(e.kind)} · ${esc(e.ev_date || '-')}${href ? '' : ' · ไม่มีไฟล์แนบ'} ${periodTag(e.period_id)}</div></div>
      <button class="icon-btn" data-act="delEv" data-id="${e.id}" title="ลบ"><i class="bi bi-trash3"></i></button>
    </div>
    <label style="font-size:12.5px;color:#5A5052;background:#FAF7F6;border-radius:6px;padding:4px 8px;display:flex;gap:6px;align-items:center"><i class="bi bi-link-45deg"></i>
      <select data-change="evWork" data-id="${e.id}" style="border:0;background:transparent;flex:1;min-width:0;font-size:12.5px;color:#5A5052;padding:3px 0;outline:0">
        <option value="">— ยังไม่เชื่อมโยงผลงาน —</option>
        ${S.data.works.map(w => `<option value="${w.id}" ${w.id === e.work_id ? 'selected' : ''}>${esc(w.title)}</option>`).join('')}
      </select></label>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <span style="font-size:12px;font-weight:600;padding:2px 9px;border-radius:20px;background:${c[0]};color:${c[1]}">${esc(e.status)}</span>
      ${isAdmin() ? `<button data-act="verifyEv" data-id="${e.id}" data-v="${e.status === 'ตรวจแล้ว' ? 'รอตรวจสอบ' : 'ตรวจแล้ว'}" style="font-size:12px;color:#7B1E2B">${e.status === 'ตรวจแล้ว' ? 'ยกเลิกการตรวจ' : '<i class="bi bi-check2"></i> ยืนยันตรวจแล้ว'}</button>` : ''}
      <span style="font-size:12px;color:#8A7F81">${esc(e.checker)}</span>
    </div>
  </div>`; }).join('')}
</div>
${list.length ? '' : `<div style="${card}">${emptyRow('ยังไม่มีหลักฐาน')}</div>`}`;
}

// ---------------- page: KPI ----------------
// เลือกดู KPI/สมรรถนะของตัวเองย้อนหลังได้ทุกรอบ (ในหน้าต่างแก้ KPI ของผู้ดูแลใช้เลือกรอบของบุคลากรนั้น)
function periodSelect(act = 'viewPeriod', cur = VPER().id) {
  const L = S.data.periods || [];
  if (!L.length) return '';
  const curId = PER().id;
  return `<label style="display:flex;gap:8px;align-items:center;font-size:13px;color:#5A5052"><i class="bi bi-calendar3"></i><select data-change="${act}" style="padding:7px 10px;border:1px solid #D9CCCB;border-radius:8px;font-size:13px;background:#fff">${L.map(p => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${esc(p.round + ' · ปีงบ ' + p.fiscalYear + (p.id === curId ? ' (ปัจจุบัน)' : ''))}</option>`).join('')}</select></label>`;
}
// ผลงาน/หลักฐาน: เลือกรอบ หรือ "ทุกรอบ" (ทุกคนเลือกได้ — เป็นข้อมูลของตัวเอง)
function workPeriodSelect() {
  const L = S.data.periods || [];
  if (L.length < 2) return '';
  const cur = S.data.workPeriod, curId = PER().id;
  return `<label style="display:flex;gap:8px;align-items:center;font-size:13px;color:#5A5052"><i class="bi bi-calendar3"></i><select data-change="workPeriod" style="padding:7px 10px;border:1px solid #D9CCCB;border-radius:8px;font-size:13px;background:#fff">
    <option value="all" ${cur === 'all' ? 'selected' : ''}>ทุกรอบการประเมิน</option>
    ${L.map(p => `<option value="${p.id}" ${p.id === cur ? 'selected' : ''}>${esc(p.round + ' · ปีงบ ' + p.fiscalYear + (p.id === curId ? ' (ปัจจุบัน)' : ''))}</option>`).join('')}</select></label>`;
}
const periodName = id => { const p = (S.data.periods || []).find(x => x.id === id); return p ? p.round + ' · ปีงบ ' + p.fiscalYear : ''; };
const periodTag = id => S.data.workPeriod === 'all' && periodName(id) ? `<span style="font-size:11px;color:#7B1E2B;background:#F6ECEC;padding:1px 7px;border-radius:10px;white-space:nowrap">${esc(periodName(id))}</span>` : '';
function pageKpi(D) {
  const d = S.data;
  const cols = 'grid-template-columns:minmax(0,2.6fr) 70px 90px 90px minmax(0,1.4fr) 70px';
  return `
${pageHead('KPI และสมรรถนะ', esc(VPER().round + ' ปีงบประมาณ ' + VPER().fiscalYear + ' (' + thDate(VPER().start) + ' – ' + thDate(VPER().end) + ')'), periodSelect())}
<div style="${card};overflow:hidden" class="table-wrap">
  <div class="table-min" style="min-width:720px">
    <div style="padding:16px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #EFE8E6"><div style="font-weight:600;font-size:15px">ผลสัมฤทธิ์ตามตัวชี้วัด</div><div style="font-size:13px">คะแนนถ่วงน้ำหนัก <b style="color:#7B1E2B;font-size:16px">${D.kpiScore}</b> / 5.00</div></div>
    <div style="display:grid;${cols};gap:12px;padding:11px 20px;background:#FAF7F6;font-size:12px;color:#6B6264;font-weight:600;border-bottom:1px solid #EFE8E6"><div>ตัวชี้วัด</div><div>น้ำหนัก</div><div>เป้าหมาย</div><div>ผลงาน</div><div>ความสำเร็จ</div><div>คะแนน</div></div>
    ${d.kpis.length ? '' : '<div style="padding:28px 20px;text-align:center;color:#8A7F81;font-size:13.5px">ยังไม่มีข้อมูลตัวชี้วัด</div>'}
    ${d.kpis.map(k => `
    <div style="display:grid;${cols};gap:12px;padding:14px 20px;border-bottom:1px solid #F3EEEC;align-items:center;font-size:13.5px">
      <div><div style="font-weight:500">${esc(k.name)}</div><div style="font-size:12px;color:#8A7F81;margin-top:2px">${esc(k.source || '')}</div></div>
      <div>${k.weight}%</div><div>${esc(k.target)}</div><div style="font-weight:600">${esc(k.actual)}</div>
      <div style="display:flex;gap:8px;align-items:center"><div style="flex:1;height:6px;background:#F1EAE8;border-radius:6px;overflow:hidden"><div style="height:100%;width:${Math.min(100, k.pct)}%;background:${k.pct >= 100 ? '#1E6B3A' : '#B8913A'}"></div></div><span style="font-size:12px;color:#6B6264;width:38px">${k.pct}%</span></div>
      <div style="font-weight:700;color:#7B1E2B">${k.score.toFixed(2)}</div>
    </div>`).join('')}
  </div>
</div>
<div style="${card};padding:18px 20px">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div style="font-weight:600;font-size:15px">สมรรถนะ (Competency)</div><div style="display:flex;gap:16px;font-size:12px;color:#6B6264"><span style="display:flex;gap:6px;align-items:center"><span style="width:12px;height:8px;background:#7B1E2B;border-radius:2px"></span>ระดับที่ประเมินได้</span><span style="display:flex;gap:6px;align-items:center"><span style="width:2px;height:12px;background:#B8913A"></span>ระดับที่คาดหวัง</span></div></div>
  <div class="comp-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:14px 40px;margin-top:18px">
    ${d.comps.length ? '' : '<div style="grid-column:1/-1;padding:12px 0;text-align:center;color:#8A7F81;font-size:13.5px">ยังไม่มีข้อมูลสมรรถนะ</div>'}
    ${d.comps.map(c => { const g = gapInfo(c); return `
    <div>
      <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px;gap:8px"><span><span style="font-size:11px;color:#8A7F81;margin-right:6px">${esc(c.grp)}</span>${esc(c.name)}</span><span style="font-size:12px;font-weight:600;color:${g.gapColor};white-space:nowrap">${g.gapLabel}</span></div>
      <div style="position:relative;height:10px;background:#F1EAE8;border-radius:5px"><div style="height:100%;width:${c.actual / 5 * 100}%;background:#7B1E2B;border-radius:5px"></div><div style="position:absolute;top:-4px;bottom:-4px;left:calc(${c.expected / 5 * 100}% - 1px);width:2px;background:#B8913A"></div></div>
    </div>`; }).join('')}
  </div>
</div>`;
}

// ---------------- page: AI settings (admin) ----------------
function pagePeriod() {
  if (!isAdmin()) return '';
  const L = S.periodsAdmin;
  if (!L) { loadPeriods(); return `<div style="${card}">${emptyRow('กำลังโหลด…')}</div>`; }
  const ed = S.perEdit ? L.periods.find(x => x.id === S.perEdit) : null;
  const p = ed || PER();
  const y = +p.fiscalYear || new Date().getFullYear() + 543;
  const presets = [[1, 'รอบที่ 1', '10-01', '03-31', -1, 0], [2, 'รอบที่ 2', '04-01', '09-30', 0, 0], [0, 'ทั้งปีงบประมาณ', '10-01', '09-30', -1, 0]];
  const cols = 'grid-template-columns:70px minmax(0,1.5fr) minmax(0,1.6fr) 120px minmax(0,1.3fr) 76px';
  return `
${pageHead('รอบการประเมิน', 'KPI และสมรรถนะแยกเก็บตามรอบ — รอบปัจจุบันคือรอบที่บุคลากรเห็นและผู้ดูแลแก้ไขเป็นค่าเริ่มต้น')}
<div style="${card};overflow:hidden" class="table-wrap"><div class="table-min" style="min-width:680px">
  <div style="display:grid;${cols};gap:12px;padding:12px 20px;background:#FAF7F6;border-bottom:1px solid #EFE8E6;font-size:12px;color:#6B6264;font-weight:600"><div>ปีงบ</div><div>รอบ</div><div>ช่วงเวลา</div><div>KPI ถ่วงน้ำหนัก</div><div>สถานะ</div><div></div></div>
  ${L.periods.map(x => { const cur = x.id === L.currentId; return `
  <div style="display:grid;${cols};gap:12px;padding:12px 20px;border-bottom:1px solid #F3EEEC;font-size:13.5px;align-items:center;${x.id === S.perEdit ? 'background:#FDFAF3' : ''}">
    <div style="font-weight:600">${esc(x.fiscalYear)}</div><div>${esc(x.round)}</div><div style="color:#5A5052">${esc(thDate(x.start) + ' – ' + thDate(x.end))}</div><div>${x.kpiScore == null ? '<span style="color:#8A7F81">-</span>' : `<b style="color:#7B1E2B">${x.kpiScore.toFixed(2)}</b><span style="font-size:12px;color:#8A7F81"> / 5.00</span><div style="font-size:11.5px;color:#8A7F81">เฉลี่ย ${x.kpiPeople} คน</div>`}</div>
    <div>${cur ? '<span style="font-size:12px;font-weight:600;background:#E6F2EA;color:#1E6B3A;padding:2px 9px;border-radius:20px">รอบปัจจุบัน</span>' : `<button class="btn btn-outline" style="font-size:12px;padding:3px 10px" data-act="perCurrent" data-id="${x.id}">ตั้งเป็นรอบปัจจุบัน</button>`}</div>
    <div style="display:flex;gap:2px"><button class="icon-btn" data-act="perEdit" data-id="${x.id}" title="แก้ไข"><i class="bi bi-pencil"></i></button>${cur ? '' : `<button class="icon-btn" data-act="perDel" data-id="${x.id}" title="ลบ"><i class="bi bi-trash3"></i></button>`}</div>
  </div>`; }).join('')}
</div></div>
<form data-form="period" style="${card};padding:22px;display:flex;flex-direction:column;gap:16px;max-width:680px">
  <div style="font-weight:600;font-size:15px">${ed ? 'แก้ไขรอบ: ' + esc(ed.round + ' ปีงบ ' + ed.fiscalYear) : 'เพิ่มรอบการประเมินใหม่'}</div>
  <div style="display:grid;grid-template-columns:140px 1fr;gap:12px">
    <label class="field">ปีงบประมาณ (พ.ศ.)<input id="perYear" name="fiscalYear" type="number" min="2500" max="2700" required value="${esc(ed ? ed.fiscalYear : y)}"></label>
    <label class="field">ชื่อรอบการประเมิน<input id="perRound" name="round" required maxlength="100" value="${esc(ed ? ed.round : '')}" placeholder="รอบการประเมินที่ 1"></label>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
    <label class="field">วันเริ่มต้น<input id="perStart" name="start" type="date" required value="${esc(ed ? ed.start : '')}"></label>
    <label class="field">วันสิ้นสุด<input id="perEnd" name="end" type="date" required value="${esc(ed ? ed.end : '')}"></label>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span style="font-size:12.5px;color:#6B6264">ตั้งค่าด่วนตามปีงบในช่อง:</span>
    ${presets.map(([n, label, st, en, ys, ye]) => `<button type="button" class="btn btn-outline" style="font-size:12.5px;padding:5px 10px" data-act="perPreset" data-round="${n ? 'รอบการประเมินที่ ' + n : 'ทั้งปีงบประมาณ'}" data-ms="${st}" data-me="${en}" data-ys="${ys}" data-ye="${ye}">${label}</button>`).join('')}
  </div>
  ${ed ? '' : `
  <label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" name="copyFrom" value="${L.currentId}" checked> คัดลอกตัวชี้วัดและสมรรถนะของทุกคนจากรอบปัจจุบัน (ผลงานและระดับที่ประเมินได้เริ่มที่ 0)</label>
  <label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" name="makeCurrent" value="1" checked> ตั้งเป็นรอบปัจจุบันทันที</label>`}
  <div style="display:flex;gap:8px"><button type="submit" class="btn btn-primary">${S.busy ? 'กำลังบันทึก…' : ed ? 'บันทึกการแก้ไข' : 'เพิ่มรอบ'}</button>${ed ? '<button type="button" class="btn btn-outline" data-act="perEdit" data-id="">ยกเลิก</button>' : ''}</div>
</form>`;
}
async function loadPeriods() {
  if (S._loadingPer) return;
  S._loadingPer = true;
  try { S.periodsAdmin = await api('/api/periods'); render(); } catch (e) { toast(e.message); } finally { S._loadingPer = false; }
}

function pageSettings() {
  if (!isAdmin()) return '';
  const f = S.aiForm;
  if (!f) { loadAiSettings(); return `<div style="${card}">${emptyRow('กำลังโหลด…')}</div>`; }
  const P = PROVIDERS[f.provider] || PROVIDERS.custom;
  const inp = 'border:1px solid #D9CCCB;border-radius:8px;padding:9px 12px;font-size:13.5px;outline:0';
  return `
<div><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h1 style="margin:0;font-size:24px;font-weight:700">ตั้งค่าผู้ช่วย AI</h1><span style="font-size:12px;font-weight:600;background:#4A0F18;color:#F1D9A0;padding:3px 10px;border-radius:20px"><i class="bi bi-shield-lock"></i> เฉพาะผู้ดูแลระบบ</span></div><div style="color:#6B6264;font-size:14px;margin-top:4px">การตั้งค่านี้มีผลกับผู้ใช้ทุกคนในหน่วยงาน รองรับ OpenAI‑compatible endpoint</div></div>
<div class="settings-col">
  <form data-form="ai" style="${card};padding:22px;display:flex;flex-direction:column;gap:16px">
    <div style="font-weight:600;font-size:15px">การเชื่อมต่อ</div>
    <div class="provider-grid" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
      ${Object.keys(PROVIDERS).map(k => { const p = PROVIDERS[k], on = f.provider === k; return `
      <button type="button" data-act="provider" data-v="${k}" style="border:1.5px solid ${on ? '#7B1E2B' : '#E6DEDC'};background:${on ? '#F6ECEC' : '#fff'};border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:4px">
        <i class="${p.icon}" style="font-size:18px;color:#7B1E2B"></i><span style="font-size:13.5px;font-weight:600">${p.label}</span><span style="font-size:11.5px;color:#8A7F81">${p.sub}</span>
      </button>`; }).join('')}
    </div>
    <label class="field">Base URL<input id="aiBase" name="baseUrl" data-bind="aiForm.baseUrl" value="${esc(f.baseUrl)}" class="mono" style="${inp}"></label>
    <label class="field">API Key<input id="aiKey" name="apiKey" type="password" data-bind="aiForm.apiKey" value="${esc(f.apiKey)}" autocomplete="off" placeholder="${esc(f.hasKey ? '•••••••• (บันทึกไว้แล้ว — เว้นว่างเพื่อใช้ค่าเดิม)' : P.ph)}" class="mono" style="${inp}">
      ${f.hasKey ? '<span style="font-weight:400;font-size:12px"><label style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" name="clearKey"> ลบ API Key ที่บันทึกไว้</label></span>' : ''}</label>
    <label class="field">Model<input id="aiModel" name="model" data-bind="aiForm.model" value="${esc(f.model)}" class="mono" style="${inp}"></label>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <button type="submit" class="btn btn-primary"><i class="bi bi-save"></i>บันทึก</button>
      <button type="button" data-act="testConn" class="btn btn-outline"><i class="bi bi-plug"></i>ทดสอบการเชื่อมต่อ</button>
      <span style="font-size:13px;color:${S.testOk === true ? '#1E6B3A' : S.testOk === false ? '#C42838' : '#6B6264'}">${esc(S.testMsg)}</span>
    </div>
  </form>
  <div style="display:flex;flex-direction:column;gap:16px">
    <div style="${card};padding:20px">
      <div style="font-weight:600;font-size:15px;display:flex;gap:8px;align-items:center"><i class="bi bi-lightning-charge" style="color:#B8913A"></i>การประหยัด Token</div>
      <div style="font-size:13px;color:#3E3537;line-height:1.7;margin-top:10px">แปลงเสียงเป็นข้อความด้วย Web Speech API ของเบราว์เซอร์ (ไม่ส่งเสียงไปยัง AI) · โหมดสัมภาษณ์ใช้ชุดคำถามมาตรฐานในเครื่อง เรียก AI เฉพาะตอนเรียบเรียงสรุป · ส่งประวัติสนทนาไม่เกิน 10 ข้อความล่าสุด</div>
    </div>
    <div style="${card};padding:20px">
      <div style="font-weight:600;font-size:15px;display:flex;gap:8px;align-items:center"><i class="bi bi-shield-lock" style="color:#7B1E2B"></i>ความปลอดภัยและ PDPA</div>
      <div style="font-size:13px;color:#3E3537;line-height:1.7;margin-top:10px">API Key เก็บแบบเข้ารหัส (AES‑256‑GCM) ในฐานข้อมูล และเรียก AI ผ่านเซิร์ฟเวอร์ของหน่วยงานเท่านั้น บุคลากรทั่วไปไม่เห็นและแก้ไขไม่ได้ · ไม่ส่งเลขประจำตัวประชาชนหรือผลประเมินรายบุคคลให้ AI · สำหรับข้อมูลอ่อนไหว แนะนำใช้ Local LLM ภายในหน่วยงาน</div>
    </div>
  </div>
</div>`;
}
async function loadAiSettings() {
  if (S._loadingAi) return;
  S._loadingAi = true;
  try { const a = await api('/api/settings/ai'); S.aiForm = { ...a, apiKey: '' }; render(); } catch (e) { toast(e.message); } finally { S._loadingAi = false; }
}

// ---------------- page: security scan (admin) ----------------
const SEV_ORDER = ['critical', 'high', 'medium', 'low', 'info'];
const SEV_STYLE = { critical: ['#5B0A14', '#fff', 'วิกฤต'], high: ['#FBE4E6', '#C42838', 'สูง'], medium: ['#FFF4DB', '#8A5A00', 'กลาง'], low: ['#E8EEF8', '#2B4C8C', 'ต่ำ'], info: ['#F4F1EF', '#6B6264', 'ข้อมูล'] };
const sevPill = s => { const c = SEV_STYLE[s] || SEV_STYLE.info; return `<span style="font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:20px;background:${c[0]};color:${c[1]};white-space:nowrap">${c[2]}</span>`; };
const SEC_SOURCES = [['snyk', 'Snyk', 'bi bi-bug', 'เครื่องมือสแกนอัตโนมัติ (SCA + SAST)'], ['deepseek', 'DeepSeek', 'bi bi-robot', 'LLM ตรวจโค้ดแบบ manual'], ['claude', 'Claude', 'bi bi-stars', 'รีวิวโค้ดแบบ manual (บันทึกไว้)']];
const thTime = iso => iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

function pageSecurity() {
  if (!isAdmin()) return '';
  const s = S.sec;
  if (!s) { loadSec(); return `<div style="${card}">${emptyRow('กำลังโหลด…')}</div>`; }
  const r = s.result;
  const btn = `<button data-act="secScan" class="btn btn-primary" ${s.running ? 'disabled' : ''}><i class="bi ${s.running ? 'bi-hourglass-split' : 'bi-arrow-repeat'}"></i>${s.running ? 'กำลังสแกน… (อาจใช้หลายนาที)' : 'Scan ใหม่'}</button>`;
  const head = pageHead('ความปลอดภัย', r ? 'สแกนล่าสุด ' + esc(thTime(r.finishedAt)) + ' · เปรียบเทียบผลจาก Snyk, DeepSeek และ Claude' : 'ยังไม่เคยสแกน — กด “Scan ใหม่” เพื่อเริ่ม', btn);
  if (!r) return head;

  const tiles = SEC_SOURCES.map(([k, label, icon, sub]) => {
    const src = r[k] || { findings: [] };
    const bySev = SEV_ORDER.map(v => [v, src.findings.filter(f => f.severity === v).length]).filter(x => x[1]);
    const m = src.meta || {};
    const metaText = k === 'snyk' ? (m.dependencies ? 'ตรวจ ' + m.dependencies + ' dependencies' : '') + (m.org ? ' · org ' + m.org : '')
      : k === 'deepseek' ? (m.model || '') + (m.tokens ? ' · ' + m.tokens.toLocaleString() + ' tokens' : '')
      : (m.model || '') + (m.reviewedAt ? ' · รีวิวเมื่อ ' + m.reviewedAt + ' (ไม่รันซ้ำตอนกดสแกน)' : '');
    return `<div style="${card};padding:18px;display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;gap:8px;align-items:center"><i class="${icon}" style="font-size:18px;color:#7B1E2B"></i><b style="font-size:15px">${label}</b><span style="font-size:12px;color:#8A7F81">${sub}</span></div>
      <div style="font-size:30px;font-weight:700">${src.findings.length}<span style="font-size:13px;font-weight:400;color:#6B6264"> รายการ</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${bySev.map(([v, n]) => sevPill(v).replace('</span>', ' ' + n + '</span>')).join('') || '<span style="font-size:12.5px;color:#1E6B3A">ไม่พบปัญหา</span>'}</div>
      ${src.error ? `<div style="font-size:12.5px;color:#C42838;word-break:break-word"><i class="bi bi-exclamation-triangle"></i> ${esc(src.error)}</div>` : ''}
      <div style="font-size:12px;color:#8A7F81">${esc(metaText)}</div>
    </div>`;
  }).join('');

  // ตารางเปรียบเทียบ: หมวดปัญหา × แหล่งที่ตรวจพบ
  const cats = Object.keys(s.categories).filter(c => SEC_SOURCES.some(([k]) => r[k] && r[k].findings.some(f => f.category === c)));
  const cell = (k, c) => {
    const fs = (r[k] ? r[k].findings : []).filter(f => f.category === c);
    if (!fs.length) return '<span style="color:#C9BFC0">—</span>';
    const worst = SEV_ORDER.find(v => fs.some(f => f.severity === v));
    return `${sevPill(worst)} <span style="font-size:12.5px;color:#6B6264">${fs.length}</span>`;
  };
  const cols = 'grid-template-columns:minmax(160px,2fr) repeat(3,minmax(90px,1fr)) 110px';
  const matrix = `<div style="${card};overflow:hidden" class="table-wrap"><div class="table-min" style="min-width:640px">
    <div style="display:grid;${cols};gap:12px;padding:12px 20px;background:#FAF7F6;border-bottom:1px solid #EFE8E6;font-size:12px;color:#6B6264;font-weight:600"><div>หมวดปัญหา</div>${SEC_SOURCES.map(x => `<div>${x[1]}</div>`).join('')}<div>พบตรงกัน</div></div>
    ${cats.map(c => { const n = SEC_SOURCES.filter(([k]) => r[k] && r[k].findings.some(f => f.category === c)).length; return `
    <div style="display:grid;${cols};gap:12px;padding:11px 20px;border-bottom:1px solid #F3EDEC;align-items:center;font-size:13.5px">
      <div style="font-weight:600">${esc(s.categories[c])}</div>${SEC_SOURCES.map(([k]) => `<div>${cell(k, c)}</div>`).join('')}
      <div style="font-size:12.5px;font-weight:600;color:${n === 3 ? '#1E6B3A' : n === 2 ? '#8A5A00' : '#8A7F81'}">${n}/3 แหล่ง</div>
    </div>`; }).join('') || emptyRow('ไม่พบปัญหาจากทุกแหล่ง')}
  </div></div>`;

  // รายละเอียดทีละแหล่ง
  const tab = S.secTab || 'snyk';
  const src = r[tab] || { findings: [] };
  const verdicts = (r.claude && r.claude.snykVerdicts) || {};
  const list = [...src.findings].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity)).map(f => `
    <div style="padding:14px 20px;border-bottom:1px solid #F3EDEC;display:flex;flex-direction:column;gap:5px">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${sevPill(f.severity)}<b style="font-size:14px">${esc(f.title)}</b>
        <span style="font-size:12px;color:#8A7F81">${esc(s.categories[f.category] || f.category)}</span></div>
      ${f.file ? `<div class="mono" style="font-size:12px;color:#7B1E2B">${esc(f.file)}${f.line ? ':' + f.line : ''}</div>` : ''}
      <div style="font-size:13px;color:#3E3537;line-height:1.6;word-break:break-word">${esc(f.detail)}</div>
      ${f.fix ? `<div style="font-size:12.5px;color:#1E6B3A">วิธีแก้: ${esc(f.fix)}</div>` : ''}
      ${tab === 'snyk' && verdicts[f.id] ? `<div style="font-size:12.5px;color:#2B4C8C"><i class="bi bi-stars"></i> ความเห็น Claude: ${esc(verdicts[f.id])}</div>` : ''}
    </div>`).join('');
  const tabs = SEC_SOURCES.map(([k, label]) => `<button data-act="secTab" data-v="${k}" style="padding:8px 14px;border-radius:8px;font-size:13.5px;font-weight:600;background:${tab === k ? '#7B1E2B' : '#F4F1EF'};color:${tab === k ? '#fff' : '#5A5052'}">${label} (${r[k] ? r[k].findings.length : 0})</button>`).join('');

  return `${head}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">${tiles}</div>
<div><div style="font-weight:600;font-size:16px;margin-bottom:10px">เปรียบเทียบตามหมวดปัญหา</div>${matrix}</div>
<div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">${tabs}</div>
  <div style="${card};overflow:hidden">${list || emptyRow(src.error ? esc(src.error) : 'ไม่พบปัญหา')}</div></div>`;
}
async function loadSec() {
  if (S._loadingSec) return;
  S._loadingSec = true;
  try {
    S.sec = await api('/api/security');
    render();
    if (S.sec.running) setTimeout(loadSec, 4000);
  } catch (e) { toast(e.message); } finally { S._loadingSec = false; }
}
async function runSecScan() {
  try {
    await api('/api/security/scan', { method: 'POST' });
    S.sec = { ...S.sec, running: true };
    render();
    setTimeout(loadSec, 4000);
  } catch (e) { toast(e.message); }
}

// ---------------- page: users (admin) ----------------
function pageUsers() {
  if (!isAdmin()) return '';
  if (!S.users) { loadUsers(); return `<div style="${card}">${emptyRow('กำลังโหลด…')}</div>`; }
  const cols = 'grid-template-columns:140px minmax(0,2fr) minmax(0,2fr) 110px 60px 76px';
  return `
${pageHead('จัดการผู้ใช้', 'บัญชีบุคลากรและผู้ดูแลระบบ', `<button data-act="modal" data-v="user" class="btn btn-primary"><i class="bi bi-person-plus"></i>เพิ่มผู้ใช้</button>`)}
<div style="${card};overflow:hidden" class="table-wrap"><div class="table-min" style="min-width:700px">
  <div style="display:grid;${cols};gap:12px;padding:12px 20px;background:#FAF7F6;border-bottom:1px solid #EFE8E6;font-size:12px;color:#6B6264;font-weight:600"><div>ชื่อผู้ใช้</div><div>ชื่อ-สกุล</div><div>ตำแหน่ง / กลุ่มงาน</div><div>บทบาท</div><div>ผลงาน</div><div></div></div>
  ${S.users.map(u => `
  <div style="display:grid;${cols};gap:12px;padding:13px 20px;border-bottom:1px solid #F3EEEC;font-size:13.5px;align-items:center">
    <div class="mono" style="font-size:13px">${esc(u.username)}</div><div style="font-weight:500">${esc(u.name)}</div>
    <div style="color:#5A5052">${esc((u.position || '-') + (u.level || ''))}<div style="font-size:12px;color:#8A7F81">${esc(u.group_name || '')}</div></div>
    <div>${u.role === 'admin' ? '<span style="font-size:12px;font-weight:600;background:#4A0F18;color:#F1D9A0;padding:2px 9px;border-radius:20px">ผู้ดูแลระบบ</span>' : '<span style="font-size:12px;padding:2px 9px;border-radius:20px;background:#F4F1EF;color:#5A5052">บุคลากร</span>'}</div>
    <div>${u.works}${u.locked ? ' <i class="bi bi-lock-fill" title="ถูกหน่วงการเข้าสู่ระบบ" style="color:#B3261E"></i>' : ''}</div>
    <div style="display:flex;gap:2px"><button class="icon-btn" data-act="editKpi" data-id="${u.id}" title="KPI และสมรรถนะ"><i class="bi bi-graph-up-arrow"></i></button>${u.id === S.data.user.id ? '' : `<button class="icon-btn" data-act="impersonate" data-id="${u.id}" title="สวมสิทธิ์เป็นผู้ใช้นี้"><i class="bi bi-person-bounding-box"></i></button>`}<button class="icon-btn" data-act="editUser" data-id="${u.id}" title="แก้ไข"><i class="bi bi-pencil"></i></button>${u.id === S.data.user.id ? '' : `<button class="icon-btn" data-act="delUser" data-id="${u.id}" title="ลบ"><i class="bi bi-trash3"></i></button>`}</div>
  </div>`).join('')}
</div></div>`;
}
async function loadUsers() {
  if (S._loadingUsers) return;
  S._loadingUsers = true;
  try { S.users = await api('/api/users'); render(); } catch (e) { toast(e.message); } finally { S._loadingUsers = false; }
}

// ---------------- view: public portfolio ----------------
// ---------------- print: สรุปแฟ้มสะสมงาน A4 หน้าเดียว (แสดงเฉพาะตอนพิมพ์; ย่ออัตโนมัติให้พอดี 1 แผ่น) ----------------
function printSheet(D) {
  const d = S.data, u = d.user, p = PER();
  const th = 'text-align:left;font-weight:600;color:#6B6264;padding:4px 6px;border-bottom:1.5px solid #7B1E2B;font-size:9pt';
  const td = 'padding:4px 6px;border-bottom:1px solid #EFE8E6;vertical-align:top';
  const sec = t => `<div style="font-weight:700;color:#7B1E2B;font-size:10.5pt;margin:0 0 5px;display:flex;align-items:center;gap:6px"><span style="width:4px;height:12px;background:#B8913A;border-radius:2px"></span>${t}</div>`;
  const stats = [['ผลงาน', D.n + ' รายการ'], ['รับรองแล้ว', D.certified + ' รายการ'], ['หลักฐาน', D.evTotal + ' รายการ'], ['คะแนน KPI', D.kpiScore + ' / 5'], ['สมรรถนะผ่านเกณฑ์', D.compPass + ' / ' + d.comps.length]];
  const info = [['ตำแหน่ง', (u.position || '-') + (u.level ? ' ' + u.level : '')], ['สังกัด', u.group_name], ['ผู้บังคับบัญชา', u.supervisor], ['รอบการประเมิน', p.round + ' ปีงบประมาณ ' + p.fiscalYear], ['ช่วงเวลา', periodRange()]];
  return `
<div class="print-sheet">
  <div style="background:#4A0F18;color:#fff;border-radius:10px;padding:12px 16px;display:flex;gap:16px;align-items:center">
    ${photoUrl(u) ? `<img src="${photoUrl(u)}" alt="" style="width:70px;height:92px;object-fit:cover;border-radius:6px;border:1.5px solid #D4AF5A;flex-shrink:0">` : ''}
    <div style="flex:1;min-width:0">
      <div style="font-size:8.5pt;color:#F1D9A0;letter-spacing:.5px">แฟ้มสะสมงาน (e‑Portfolio) · ปีงบประมาณ พ.ศ. ${esc(p.fiscalYear)}</div>
      <div style="font-family:'Noto Serif Thai',serif;font-size:17pt;font-weight:700;line-height:1.3;margin-top:2px">${esc(u.name)}</div>
      <div style="display:grid;grid-template-columns:auto 1fr auto 1fr;gap:1px 8px;font-size:8.5pt;margin-top:5px">${info.map(([k, v]) => `<span style="color:#D9B8BC">${k}</span><span>${esc(v || '-')}</span>`).join('')}</div>
    </div>
    <div style="width:78px;height:78px;border-radius:50%;background:conic-gradient(#D4AF5A ${Math.round(D.kpiScore / 5 * 360)}deg, rgba(255,255,255,.15) 0);display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <div style="width:62px;height:62px;border-radius:50%;background:#4A0F18;display:flex;flex-direction:column;align-items:center;justify-content:center"><b style="font-size:16pt;line-height:1">${D.kpiScore}</b><span style="font-size:7pt;color:#D9B8BC">KPI / 5.00</span></div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:8px 0 10px">${stats.map(([k, v]) => `<div style="border:1px solid #E6DEDC;border-radius:8px;padding:5px 8px"><div style="font-size:8pt;color:#8A7F81">${k}</div><div style="font-size:11pt;font-weight:700;color:#7B1E2B">${v}</div></div>`).join('')}</div>
  <div style="display:grid;grid-template-columns:1.35fr 1fr;gap:14px;margin-bottom:10px">
    <div>
      ${sec('ผลสัมฤทธิ์ตามตัวชี้วัด (KPI)')}
      <table style="width:100%;border-collapse:collapse;font-size:8.5pt"><tr><th style="${th}">ตัวชี้วัด</th><th style="${th}">น้ำหนัก</th><th style="${th}">เป้าหมาย</th><th style="${th}">ผลงาน</th><th style="${th}">%</th><th style="${th}">คะแนน</th></tr>
      ${d.kpis.map(k => `<tr><td style="${td}">${esc(k.name)}</td><td style="${td}">${k.weight}%</td><td style="${td}">${esc(k.target || '-')}</td><td style="${td};font-weight:600">${esc(k.actual || '-')}</td><td style="${td};color:${k.pct >= 100 ? '#1E6B3A' : '#B8913A'}">${k.pct}%</td><td style="${td};font-weight:700;color:#7B1E2B">${k.score.toFixed(2)}</td></tr>`).join('') || `<tr><td colspan="6" style="${td};color:#8A7F81">ยังไม่มีข้อมูลตัวชี้วัด</td></tr>`}
      </table>
      ${D.duties.length ? `<div style="margin-top:10px">${sec('หน้าที่ความรับผิดชอบหลัก')}<ol style="margin:0;padding-left:18px;font-size:8.5pt;line-height:1.5">${D.duties.map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>` : ''}
    </div>
    <div>
      ${sec('สมรรถนะ (Competency)')}
      <div style="display:flex;flex-direction:column;gap:5px">${d.comps.map(c => { const g = gapInfo(c); return `
        <div style="font-size:8.5pt"><div style="display:flex;justify-content:space-between;gap:6px"><span><span style="color:#8A7F81">${esc(c.grp)}</span> ${esc(c.name)}</span><span style="color:${g.gapColor};font-weight:600;white-space:nowrap">${c.actual}/${c.expected}</span></div>
        <div style="position:relative;height:6px;background:#F1EAE8;border-radius:3px;margin-top:2px"><div style="height:100%;width:${c.actual / 5 * 100}%;background:#7B1E2B;border-radius:3px"></div><div style="position:absolute;top:-2px;bottom:-2px;left:calc(${c.expected / 5 * 100}% - 1px);width:2px;background:#B8913A"></div></div></div>`; }).join('') || '<div style="font-size:8.5pt;color:#8A7F81">ยังไม่มีข้อมูลสมรรถนะ</div>'}</div>
      ${d.comps.length ? '<div style="font-size:7.5pt;color:#8A7F81;margin-top:4px">แถบสีเข้ม = ระดับที่ประเมินได้ · เส้นทอง = ระดับที่คาดหวัง (0–5)</div>' : ''}
    </div>
  </div>
  ${sec('ผลงานและโครงการ')}
  <table style="width:100%;border-collapse:collapse;font-size:8.5pt"><tr><th style="${th};width:22px">#</th><th style="${th}">ชื่องาน / เอกสารอ้างอิง</th><th style="${th}">ประเภท</th><th style="${th}">ผลผลิต / ผลลัพธ์</th><th style="${th}">ตัวชี้วัด</th><th style="${th}">หลักฐาน</th><th style="${th}">สถานะ</th></tr>
  ${D.works.map((w, i) => `<tr><td style="${td};color:#8A7F81">${i + 1}</td><td style="${td}"><div style="font-weight:600">${esc(w.title)}</div><div style="color:#8A7F81;font-size:7.5pt">${esc([w.ref, w.period].filter(Boolean).join(' · ') || '-')}</div></td><td style="${td}">${esc(w.type)}</td><td style="${td}">${esc(w.result || '-')}</td><td style="${td}">${esc(w.kpi || '-')}</td><td style="${td};text-align:center">${w.ev}</td><td style="${td};white-space:nowrap;color:${w.stFg};font-weight:600">${esc(w.status)}</td></tr>`).join('') || `<tr><td colspan="7" style="${td};color:#8A7F81">ยังไม่มีผลงาน</td></tr>`}
  </table>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:22px;font-size:8.5pt;text-align:center">
    <div><div style="border-bottom:1px dotted #5A5052;height:22px"></div><div style="margin-top:4px">(${esc(u.name)})</div><div style="color:#6B6264">ผู้จัดทำ</div></div>
    <div><div style="border-bottom:1px dotted #5A5052;height:22px"></div><div style="margin-top:4px">(${esc(u.supervisor || '.................................')})</div><div style="color:#6B6264">ผู้บังคับบัญชา / ผู้รับรอง</div></div>
  </div>
  <div style="margin-top:10px;font-size:7pt;color:#A59A9C;display:flex;justify-content:space-between"><span>BPCD e‑Portfolio · สำนักพัฒนาสมรรถนะครูและบุคลากรอาชีวศึกษา</span><span>พิมพ์เมื่อ ${esc(new Date().toLocaleDateString('th-TH', { dateStyle: 'long' }))}</span></div>
</div>`;
}
// ย่อแผ่นพิมพ์ให้พอดี A4 หน้าเดียว: วัดความสูงจริงแล้วตั้ง zoom ก่อนเปิดหน้าต่างพิมพ์
function fitPrintSheet() {
  const el = document.querySelector('.print-sheet');
  if (!el) return;
  const pageW = 718, pageH = 1010; // A4 190×277mm ที่ 96dpi (ความสูงเผื่อระยะให้การตัดบรรทัดตอนพิมพ์)
  el.style.zoom = ''; el.style.width = '';
  el.classList.add('measure');
  // ย่อแล้วขยายความกว้างตามอัตราที่ย่อ ให้ข้อความกระจายเต็มหน้ากว้าง (ความสูงลดลง) — วนหาอัตราที่พอดี
  let z = 1;
  for (let i = 0; i < 6; i++) {
    el.style.width = Math.round(pageW / z) + 'px';
    const h = el.scrollHeight * z;
    if (h <= pageH) break;
    z = Math.floor(z * pageH / h * 1000) / 1000;
  }
  el.classList.remove('measure');
  el.style.zoom = z < 1 ? String(z) : '';
  if (z >= 1) el.style.width = '';
}
window.addEventListener('beforeprint', fitPrintSheet);

function viewPortfolio(D) {
  const d = S.data, u = d.user;
  const kpiDeg = Math.round(D.kpiScore / 5 * 360) + 'deg';
  const featured = D.works.find(w => w.status === 'รับรองแล้ว') || D.works[0];
  const tabs = [['overview', 'ภาพรวม', 'bi bi-grid-1x2'], ['works', 'ผลงาน', 'bi bi-kanban'], ['kpi', 'ตัวชี้วัด', 'bi bi-bullseye'], ['comp', 'สมรรถนะ', 'bi bi-person-badge'], ['evidence', 'หลักฐาน', 'bi bi-folder2-open']];
  const badges = [{ icon: 'bi bi-award', label: 'ระดับ' + (u.level || '-') }, { icon: 'bi bi-patch-check', label: 'ผลงานรับรองแล้ว ' + D.certified + ' รายการ' }, { icon: 'bi bi-person-check', label: 'สมรรถนะผ่านเกณฑ์ ' + D.compPass + '/' + d.comps.length }];
  const pfStats = [{ value: D.n, label: 'ผลงานในปีงบประมาณ' }, { value: D.evTotal, label: 'หลักฐานประกอบ' }, { value: D.kpiScore, label: 'คะแนน KPI จาก 5.00' }, { value: D.compPass + '/' + d.comps.length, label: 'สมรรถนะผ่านเกณฑ์' }];
  const R = 'border-radius:26px';
  let body = '';
  if (S.pfTab === 'overview') {
    const profileRows = [['ตำแหน่ง', u.position], ['ระดับ', u.level], ['สังกัด', u.group_name], ['ผู้บังคับบัญชา', u.supervisor], ['รอบการประเมิน', PER().round + ' · ' + periodRange()], ['แหล่งข้อมูล', 'HR · IDPlan · R-HRD · สารบรรณ']];
    body = `
<div class="pf-grid">
  ${featured ? `
  <button data-act="pfDetail" data-id="${featured.id}" class="span7 a-press-sm" style="background:#7B1E2B;color:#fff;${R};padding:34px;display:flex;flex-direction:column;gap:14px;min-height:300px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span style="font-size:13px;letter-spacing:1.5px;color:#F1D9A0;font-weight:600">ผลงานเด่น</span><span style="display:flex;gap:6px;align-items:center;font-size:13px;background:rgba(255,255,255,.12);padding:5px 12px;border-radius:20px"><i class="bi bi-patch-check-fill" style="color:#D4AF5A"></i>${esc(featured.status)}</span></div>
    <div style="font-family:'Noto Serif Thai',serif;font-size:30px;font-weight:700;line-height:1.35;text-wrap:balance">${esc(featured.title)}</div>
    <div style="font-size:16px;color:#F3E6E7;line-height:1.6">${esc(featured.result || '')}</div>
    <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding-top:16px;border-top:1px solid rgba(255,255,255,.15);font-size:14px;color:#E4CBCE"><span>${esc(featured.ref || '-')} · หลักฐาน ${featured.ev} รายการ</span><span class="no-print" style="display:flex;gap:8px;align-items:center;color:#fff;font-weight:600">แตะเพื่อดูรายละเอียด<i class="bi bi-arrow-right-circle-fill" style="font-size:22px;color:#D4AF5A"></i></span></div>
  </button>` : `<div class="span7" style="background:#fff;border:1px solid #E6DEDC;${R};padding:34px;color:#8A7F81">ยังไม่มีผลงาน</div>`}
  <div class="span5" style="background:#fff;border:1px solid #E6DEDC;${R};padding:28px">
    <div style="font-size:13px;letter-spacing:1px;color:#7B1E2B;font-weight:700">หน้าที่ความรับผิดชอบหลัก</div>
    <div style="display:flex;flex-direction:column;gap:14px;margin-top:18px">
      ${D.duties.map((t, i) => `<div style="display:flex;gap:14px;font-size:15.5px;line-height:1.55"><span style="width:32px;height:32px;border-radius:50%;background:#F6ECEC;color:#7B1E2B;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px">${i + 1}</span><span>${esc(t)}</span></div>`).join('') || '<div style="color:#8A7F81;font-size:14px">ยังไม่ได้ระบุ — แก้ไขได้ที่ข้อมูลส่วนตัว</div>'}
    </div>
  </div>
  <div class="span5" style="background:#fff;border:1px solid #E6DEDC;${R};padding:28px">
    <div style="font-size:13px;letter-spacing:1px;color:#7B1E2B;font-weight:700">ข้อมูลบุคลากร</div>
    <div style="margin-top:10px">${profileRows.map(([k, v]) => `<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #F1EAE8;font-size:15px"><span style="color:#8A7F81;width:130px;flex-shrink:0">${k}</span><span>${esc(v || '-')}</span></div>`).join('')}</div>
  </div>
  <div class="span7" style="background:#fff;border:1px solid #E6DEDC;${R};padding:28px">
    <div style="font-size:13px;letter-spacing:1px;color:#7B1E2B;font-weight:700">เส้นทางผลการปฏิบัติงาน</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;margin-top:18px">
      ${D.chain.map(c => `<div style="background:#FAF7F6;border-radius:16px;padding:14px 16px;border-left:4px solid ${c.bar}"><div style="font-size:12px;color:#8A7F81">${c.no}</div><div style="font-size:15px;font-weight:600;margin-top:2px">${c.label}</div><div style="font-size:13.5px;color:#6B6264;margin-top:2px">${esc(c.val)}</div></div>`).join('')}
    </div>
  </div>
</div>`;
  } else if (S.pfTab === 'works') {
    const cards = D.works.filter(w => S.pfType === 'ทั้งหมด' || w.type === S.pfType);
    body = `
<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
  <div style="display:flex;gap:8px;flex-wrap:wrap;flex:1">
    ${['ทั้งหมด', ...TYPES].map(t => { const on = S.pfType === t; return `<button data-act="pfType" data-v="${esc(t)}" style="min-height:48px;padding:0 20px;border-radius:24px;font-size:15px;display:flex;align-items:center;border:1px solid ${on ? '#7B1E2B' : '#D9CCCB'};background:${on ? '#7B1E2B' : '#fff'};color:${on ? '#fff' : '#3E3537'}">${esc(t)}</button>`; }).join('')}
  </div>
  <button data-act="scroll" data-v="-380" class="no-print" aria-label="ก่อนหน้า" style="width:56px;height:56px;border-radius:50%;background:#fff;border:1px solid #D9CCCB;display:flex;align-items:center;justify-content:center;font-size:20px"><i class="bi bi-chevron-left"></i></button>
  <button data-act="scroll" data-v="380" class="no-print h-primary" aria-label="ถัดไป" style="width:56px;height:56px;border-radius:50%;background:#7B1E2B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px"><i class="bi bi-chevron-right"></i></button>
</div>
<div id="pfRow" class="scroll-x" style="display:flex;gap:18px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 16px;scrollbar-width:none;-webkit-overflow-scrolling:touch">
  ${cards.map((w, i) => `
  <button data-act="pfDetail" data-id="${w.id}" class="a-press" style="flex:0 0 min(360px,85vw);min-height:430px;scroll-snap-align:start;background:#fff;border:1px solid #E6DEDC;${R};padding:28px;display:flex;flex-direction:column;gap:12px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><span style="font-family:'Noto Serif Thai',serif;font-size:60px;font-weight:800;line-height:.9;color:#EAD9DA">${pad2(i + 1)}</span><span style="display:flex;gap:6px;align-items:center;font-size:13px;font-weight:600;padding:6px 12px;border-radius:20px;background:${w.stBg};color:${w.stFg}"><i class="${w.stIcon}"></i>${esc(w.status)}</span></div>
    <div style="display:flex;gap:8px;align-items:center;font-size:13.5px;color:#7B1E2B;font-weight:600;margin-top:8px"><i class="${w.icon}"></i>${esc(w.type)}<span style="color:#A59A9C;font-weight:400">· ${esc(w.period || '-')}</span></div>
    <div style="font-size:20px;font-weight:600;line-height:1.45;color:#2A0A0F;text-wrap:pretty">${esc(w.title)}</div>
    <div style="font-size:15px;color:#5A5052;line-height:1.6">${esc(w.result || '')}</div>
    <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:center;padding-top:16px;border-top:1px solid #F1EAE8"><span style="font-size:14px;color:#6B6264"><i class="bi bi-paperclip"></i> หลักฐาน ${w.ev} รายการ</span><span style="width:44px;height:44px;border-radius:50%;background:#F6ECEC;color:#7B1E2B;display:flex;align-items:center;justify-content:center;font-size:18px"><i class="bi bi-arrow-up-right"></i></span></div>
  </button>`).join('') || '<div style="color:#8A7F81;padding:20px">ไม่พบผลงานประเภทนี้</div>'}
</div>
<div class="no-print" style="display:flex;gap:8px;align-items:center;justify-content:center;font-size:14px;color:#8A7F81"><i class="bi bi-hand-index"></i>ปัดซ้าย–ขวาเพื่อดูผลงาน · แตะการ์ดเพื่อดูรายละเอียด</div>`;
  } else if (S.pfTab === 'kpi') {
    body = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:18px">
  ${d.kpis.length ? '' : '<div style="grid-column:1/-1;padding:28px 20px;text-align:center;color:#8A7F81;font-size:13.5px">ยังไม่มีข้อมูลตัวชี้วัด</div>'}
  ${d.kpis.map(k => `
  <div style="background:#fff;border:1px solid #E6DEDC;${R};padding:26px;display:flex;flex-direction:column;gap:18px">
    <div style="display:flex;gap:18px;align-items:center">
      <div style="width:108px;height:108px;border-radius:50%;background:conic-gradient(#7B1E2B ${Math.round(k.score / 5 * 360)}deg, #F1EAE8 0);display:flex;align-items:center;justify-content:center;flex-shrink:0"><div style="width:86px;height:86px;border-radius:50%;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center"><span style="font-family:'Noto Serif Thai',serif;font-size:28px;font-weight:700;color:#7B1E2B;line-height:1">${k.score.toFixed(1)}</span><span style="font-size:11px;color:#8A7F81">/ 5</span></div></div>
      <div style="font-size:17px;font-weight:600;line-height:1.45">${esc(k.name)}</div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      <div style="background:#FAF7F6;border-radius:14px;padding:12px"><div style="font-size:12px;color:#8A7F81">เป้าหมาย</div><div style="font-size:18px;font-weight:600">${esc(k.target)}</div></div>
      <div style="background:#FAF7F6;border-radius:14px;padding:12px"><div style="font-size:12px;color:#8A7F81">ผลงาน</div><div style="font-size:18px;font-weight:700;color:#7B1E2B">${esc(k.actual)}</div></div>
      <div style="background:#FAF7F6;border-radius:14px;padding:12px"><div style="font-size:12px;color:#8A7F81">น้ำหนัก</div><div style="font-size:18px;font-weight:600">${k.weight}%</div></div>
    </div>
    <div style="font-size:13px;color:#8A7F81"><i class="bi bi-database"></i> ${esc(k.source || '')}</div>
  </div>`).join('')}
</div>`;
  } else if (S.pfTab === 'comp') {
    body = `
<div style="display:flex;gap:20px;font-size:14px;color:#6B6264;align-items:center;flex-wrap:wrap"><span style="display:flex;gap:8px;align-items:center"><span style="width:22px;height:14px;background:#7B1E2B;border-radius:4px"></span>ระดับที่ประเมินได้</span><span style="display:flex;gap:8px;align-items:center"><span style="width:22px;height:14px;border:2px solid #D4AF5A;border-radius:4px"></span>ระดับที่คาดหวังตามตำแหน่ง</span></div>
<div class="comp-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:14px">
  ${d.comps.map(c => { const g = gapInfo(c); return `
  <div style="background:#fff;border:1px solid #E6DEDC;border-radius:22px;padding:22px 24px;display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div><div style="font-size:12.5px;color:#8A7F81">สมรรถนะ${esc(c.grp)}</div><div style="font-size:17px;font-weight:600;margin-top:2px">${esc(c.name)}</div></div><div style="text-align:right"><div style="font-family:'Noto Serif Thai',serif;font-size:30px;font-weight:700;color:#7B1E2B;line-height:1">${c.actual}</div><div style="font-size:12px;font-weight:600;color:${g.gapColor};white-space:nowrap">${g.gapLabel}</div></div></div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">
      ${[1, 2, 3, 4, 5].map(i => `<div style="height:16px;border-radius:5px;background:${i <= c.actual ? '#7B1E2B' : '#EDE4E2'};outline:${i === c.expected ? '2px solid #D4AF5A' : '2px solid transparent'};outline-offset:2px"></div>`).join('')}
    </div>
  </div>`; }).join('')}
</div>`;
  } else {
    body = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px">
  ${d.evidence.map(e => `
  <button data-act="pfEv" data-id="${e.id}" class="a-press" style="background:#fff;border:1px solid #E6DEDC;border-radius:22px;padding:22px;display:flex;flex-direction:column;gap:14px;min-height:200px">
    <div style="width:60px;height:60px;border-radius:18px;background:#F6ECEC;color:#7B1E2B;display:flex;align-items:center;justify-content:center;font-size:28px"><i class="${EV_ICON[e.kind] || 'bi bi-file-earmark'}"></i></div>
    <div style="font-size:16px;font-weight:600;line-height:1.45;word-break:break-word">${esc(e.name)}</div>
    <div style="margin-top:auto;font-size:13px;color:#8A7F81">${esc(e.kind)} · ${esc(e.ev_date || '-')}</div>
  </button>`).join('') || '<div style="color:#8A7F81">ยังไม่มีหลักฐาน</div>'}
</div>`;
  }

  const signers = [{ name: u.name, role: 'ผู้จัดทำ' }, { name: '.................................', role: 'ผู้ตรวจสอบ / ' + (u.supervisor || 'ผู้อำนวยการกลุ่ม') }, { name: '.................................', role: 'ผู้รับรอง / ผู้อำนวยการสำนัก' }];
  return `
<div style="min-height:100vh;background:#F4F1EF;padding-bottom:48px">
  <section style="background:#3A0B13;color:#fff;position:relative;overflow:hidden">
    <img src="/vec-logo.png" alt="" style="position:absolute;right:-120px;top:-60px;width:560px;height:560px;opacity:.06;pointer-events:none;filter:grayscale(1) brightness(2)">
    <div class="pf-pad" style="position:relative;max-width:1280px;margin:0 auto;padding:18px 32px 0;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <button data-act="goAdmin" class="h-dark no-print" style="display:flex;gap:10px;align-items:center;height:48px;padding:0 20px;border-radius:24px;background:rgba(255,255,255,.08);font-size:15px"><i class="bi bi-arrow-left"></i>ระบบจัดการ</button>
      <div style="display:flex;gap:12px;align-items:center;margin-left:6px">
        <img src="/vec-logo.png" alt="ตรา สอศ." style="width:60px;height:60px;flex-shrink:0;display:block">
        <div style="line-height:1.35"><div style="font-size:14.5px;font-weight:600">สำนักพัฒนาสมรรถนะครูและบุคลากรอาชีวศึกษา</div><div style="font-size:12.5px;color:#D9B8BC">สำนักงานคณะกรรมการการอาชีวศึกษา</div></div>
      </div>
      <div style="flex:1"></div>
      <button data-act="print" title="พิมพ์ / PDF" class="h-dark no-print" style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:18px"><i class="bi bi-printer"></i></button>
    </div>
    <div class="hero-grid pf-pad" style="position:relative;max-width:1280px;margin:0 auto;padding:44px 32px 36px">
      <div class="hero-photo" style="position:relative;aspect-ratio:3/4;border-radius:22px;background:rgba(255,255,255,.06);border:1px solid rgba(212,175,90,.55);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#D9B8BC;font-size:13px;overflow:hidden">
        ${photoUrl(u) ? `<img src="${photoUrl(u)}" alt="ภาพถ่าย ${esc(u.name)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : '<i class="bi bi-person" style="font-size:56px"></i>ภาพถ่ายบุคลากร'}
        <div class="no-print" style="position:absolute;left:8px;right:8px;bottom:8px;display:flex;gap:6px;justify-content:center">
          <label title="อัปโหลดรูปถ่าย (JPG/PNG/WebP ไม่เกิน 5 MB)" style="cursor:pointer;background:rgba(26,6,10,.72);color:#F1D9A0;border:1px solid rgba(212,175,90,.6);border-radius:16px;padding:5px 12px;font-size:12px;display:flex;gap:6px;align-items:center">${S.photoBusy ? '<i class="bi bi-arrow-repeat" style="animation:spin 1s linear infinite"></i>' : '<i class="bi bi-camera"></i>'}${photoUrl(u) ? 'เปลี่ยนรูป' : 'เพิ่มรูป'}<input id="photoFile" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" style="display:none"></label>
          ${photoUrl(u) ? '<button data-act="delPhoto" title="ลบรูป" style="background:rgba(26,6,10,.72);color:#F1D9A0;border:1px solid rgba(212,175,90,.6);border-radius:16px;padding:5px 10px;font-size:12px"><i class="bi bi-trash3"></i></button>' : ''}
        </div>
      </div>
      <div style="min-width:0">
        <div style="display:inline-flex;gap:8px;align-items:center;border:1px solid rgba(212,175,90,.5);color:#F1D9A0;border-radius:20px;padding:5px 14px;font-size:13px;letter-spacing:.5px"><i class="bi bi-journal-richtext"></i>e‑Portfolio · ปีงบประมาณ พ.ศ. ${esc(PER().fiscalYear)}</div>
        <h1 class="hero-name" style="font-family:'Noto Serif Thai',serif;font-size:52px;line-height:1.2;margin:16px 0 8px;font-weight:700;text-wrap:balance">${esc(u.name)}</h1>
        <div style="font-size:21px;color:#F3E6E7">${esc((u.position || '') + (u.level || ''))}</div>
        <div style="font-size:15px;color:#D9B8BC;margin-top:4px">${esc(u.group_name || '')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px">${badges.map(b => `<span style="display:flex;gap:8px;align-items:center;background:rgba(255,255,255,.08);border-radius:20px;padding:7px 14px;font-size:13.5px"><i class="${b.icon}" style="color:#D4AF5A"></i>${esc(b.label)}</span>`).join('')}</div>
      </div>
      <div class="hero-ring" style="width:220px;height:220px;border-radius:50%;background:conic-gradient(#D4AF5A ${kpiDeg}, rgba(255,255,255,.1) 0);display:flex;align-items:center;justify-content:center">
        <div style="width:186px;height:186px;border-radius:50%;background:#3A0B13;display:flex;flex-direction:column;align-items:center;justify-content:center">
          <div style="font-family:'Noto Serif Thai',serif;font-size:58px;font-weight:700;line-height:1;color:#fff">${D.kpiScore}</div>
          <div style="font-size:13px;color:#D9B8BC;margin-top:8px">คะแนน KPI จาก 5.00</div>
        </div>
      </div>
    </div>
    <div class="pf-pad" style="position:relative;max-width:1280px;margin:0 auto;padding:0 32px 32px;display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      ${pfStats.map(s => `<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:18px 22px"><div style="font-family:'Noto Serif Thai',serif;font-size:36px;font-weight:700;color:#F1D9A0;line-height:1.1">${esc(s.value)}</div><div style="font-size:14px;color:#D9B8BC;margin-top:4px">${s.label}</div></div>`).join('')}
    </div>
  </section>
  <nav class="pf-nav no-print" style="position:sticky;top:0;z-index:6;background:rgba(244,241,239,.94);backdrop-filter:blur(12px);border-bottom:1px solid #E6DEDC">
    <div class="pf-pad scroll-x" style="max-width:1280px;margin:0 auto;padding:12px 32px;display:flex;gap:10px;overflow-x:auto">
      ${tabs.map(([k, label, icon]) => { const on = S.pfTab === k; return `<button data-act="pfTab" data-v="${k}" style="display:flex;gap:10px;align-items:center;min-height:56px;padding:0 26px;border-radius:28px;font-size:16px;font-weight:600;white-space:nowrap;background:${on ? '#7B1E2B' : '#fff'};color:${on ? '#fff' : '#3E3537'};border:1px solid ${on ? '#7B1E2B' : '#E6DEDC'}"><i class="${icon}" style="font-size:18px"></i>${label}</button>`; }).join('')}
    </div>
  </nav>
  <div class="pf-pad" style="max-width:1280px;margin:0 auto;padding:28px 32px 0;display:flex;flex-direction:column;gap:20px">
    ${body}
    <div class="signers" style="background:#fff;border:1px solid #E6DEDC;${R};padding:28px 32px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) 120px;gap:28px;align-items:end;margin-top:8px">
      ${signers.map(g => `<div style="text-align:center;font-size:14px"><div style="height:44px"></div><div style="border-top:1px dotted #8A7F81;padding-top:8px">( ${esc(g.name)} )</div><div style="color:#6B6264;margin-top:2px">${esc(g.role)}</div></div>`).join('')}
      <div style="display:flex;flex-direction:column;align-items:center;gap:6px"><div style="width:96px;height:96px;border:1px dashed #C7BCBD;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#A59A9C;font-size:32px"><i class="bi bi-qr-code"></i></div><div style="font-size:11.5px;color:#8A7F81">ตรวจสอบต้นฉบับ</div></div>
    </div>
  </div>
  ${viewPfDetail(D)}${viewPfEv()}
</div>`;
}

function viewPfDetail(D) {
  if (S.pfDetail == null) return '';
  const idx = D.works.findIndex(w => w.id === S.pfDetail);
  if (idx < 0) return '';
  const w = D.works[idx];
  const rows = [['ผู้มอบหมาย / เอกสารอ้างอิง', w.ref], ['ระยะเวลาดำเนินงาน', w.period], ['ผลผลิต / ผลลัพธ์', w.result], ['ตัวชี้วัดที่เชื่อมโยง', w.kpi], ['จำนวนหลักฐาน', w.ev + ' รายการ'], ['สถานะการรับรอง', w.status]];
  const evs = S.data.evidence.filter(e => e.work_id === w.id);
  return `
<div data-act="closePf" data-self="1" class="no-print" style="position:fixed;inset:0;z-index:60;background:rgba(26,6,10,.58);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px">
  <div role="dialog" aria-modal="true" style="width:100%;max-width:920px;max-height:92vh;overflow:auto;background:#fff;border-radius:30px;box-shadow:0 30px 80px rgba(0,0,0,.35)">
    <div style="background:#3A0B13;color:#fff;padding:26px 32px;display:flex;gap:16px;align-items:flex-start;position:sticky;top:0">
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:10px;align-items:center;font-size:14px;color:#F1D9A0"><i class="${w.icon}"></i>${esc(w.type)} · ${esc(w.period || '-')}</div>
        <div style="font-family:'Noto Serif Thai',serif;font-size:30px;font-weight:700;line-height:1.35;margin-top:8px">${esc(w.title)}</div>
      </div>
      <button data-act="closePf" aria-label="ปิด" style="width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0"><i class="bi bi-x-lg"></i></button>
    </div>
    <div style="padding:28px 32px;display:flex;flex-direction:column;gap:24px">
      <div class="detail-rows" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">
        ${rows.map(([k, v]) => `<div style="background:#FAF7F6;border-radius:16px;padding:16px 18px"><div style="font-size:13px;color:#8A7F81">${k}</div><div style="font-size:16.5px;margin-top:4px;line-height:1.5;font-weight:500">${esc(v || '-')}</div></div>`).join('')}
      </div>
      ${w.summary ? `<div><div style="font-size:13px;letter-spacing:1px;color:#7B1E2B;font-weight:700;margin-bottom:10px">สรุปผลการปฏิบัติงาน</div><div style="font-size:15.5px;line-height:1.8;white-space:pre-wrap">${esc(w.summary)}</div></div>` : ''}
      <div>
        <div style="font-size:13px;letter-spacing:1px;color:#7B1E2B;font-weight:700;margin-bottom:12px">หลักฐานที่เชื่อมโยง</div>
        ${evs.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">${evs.map(e => { const href = evHref(e); return `<${href ? `a href="${esc(href)}" target="_blank" rel="noopener"` : 'div'} style="border:1px solid #E6DEDC;border-radius:16px;padding:14px 16px;display:flex;gap:12px;align-items:center;color:inherit;text-decoration:none"><i class="${EV_ICON[e.kind] || 'bi bi-file-earmark'}" style="font-size:24px;color:#7B1E2B"></i><div><div style="font-size:14.5px;font-weight:500;line-height:1.4">${esc(e.name)}</div><div style="font-size:12.5px;color:#8A7F81">${esc(e.kind)} · ${esc(e.ev_date || '-')}</div></div></${href ? 'a' : 'div'}>`; }).join('')}</div>`
          : '<div style="font-size:15px;color:#8A7F81;background:#FAF7F6;border-radius:16px;padding:18px">ยังไม่มีไฟล์หลักฐานเผยแพร่สำหรับผลงานนี้</div>'}
      </div>
    </div>
    <div style="padding:18px 32px 26px;display:flex;gap:12px;align-items:center;border-top:1px solid #F1EAE8">
      <button data-act="pfNav" data-v="-1" style="min-height:56px;padding:0 24px;border-radius:28px;border:1px solid #D9CCCB;display:flex;gap:8px;align-items:center;font-size:15px"><i class="bi bi-chevron-left"></i>ก่อนหน้า</button>
      <div style="flex:1;text-align:center;font-size:14px;color:#8A7F81">${idx + 1} / ${D.n}</div>
      <button data-act="pfNav" data-v="1" style="min-height:56px;padding:0 24px;border-radius:28px;background:#7B1E2B;color:#fff;display:flex;gap:8px;align-items:center;font-size:15px;font-weight:600">ถัดไป<i class="bi bi-chevron-right"></i></button>
    </div>
  </div>
</div>`;
}

function viewPfEv() {
  if (S.pfEv == null) return '';
  const e = S.data.evidence.find(x => x.id === S.pfEv);
  if (!e) return '';
  const c = stOf(e.status);
  const href = evHref(e);
  const work = (S.data.works.find(w => w.id === e.work_id) || {}).title || '-';
  const preview = e.hasFile && e.kind === 'ภาพ'
    ? `<img src="${esc(href)}" alt="${esc(e.name)}" style="width:100%;height:100%;object-fit:contain">`
    : `<i class="${EV_ICON[e.kind] || 'bi bi-file-earmark'}" style="font-size:64px;color:#C7A9AC"></i><span style="font-size:14px">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">เปิดไฟล์หลักฐาน <i class="bi bi-box-arrow-up-right"></i></a>` : 'ไม่มีไฟล์แนบ'}</span>`;
  return `
<div data-act="closeEv" data-self="1" class="no-print" style="position:fixed;inset:0;z-index:60;background:rgba(26,6,10,.58);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px">
  <div role="dialog" aria-modal="true" style="width:100%;max-width:760px;background:#fff;border-radius:30px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35)">
    <div style="aspect-ratio:16/9;background:#F4F1EF;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#A59A9C;position:relative">${preview}
      <button data-act="closeEv" aria-label="ปิด" style="position:absolute;top:18px;right:18px;width:56px;height:56px;border-radius:50%;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;font-size:20px;color:#1F1A1B"><i class="bi bi-x-lg"></i></button>
    </div>
    <div style="padding:26px 30px 30px;display:flex;flex-direction:column;gap:10px">
      <div style="display:flex;gap:10px;align-items:center"><span style="font-size:13px;font-weight:600;padding:4px 12px;border-radius:20px;background:${c[0]};color:${c[1]}">${esc(e.status)}</span><span style="font-size:14px;color:#8A7F81">${esc(e.kind)} · ${esc(e.ev_date || '-')}</span></div>
      <div style="font-family:'Noto Serif Thai',serif;font-size:26px;font-weight:700;line-height:1.4;word-break:break-word">${esc(e.name)}</div>
      <div style="font-size:15px;color:#5A5052"><i class="bi bi-link-45deg"></i> ${esc(work)}</div>
    </div>
  </div>
</div>`;
}

// ---------------- chat panel ----------------
function viewChat() {
  const ai = S.data.ai;
  const P = PROVIDERS[ai.provider] || PROVIDERS.custom;
  const hint = !S.chatOpen && !S.hintSeen ? `<div class="no-print hide-sm" style="position:fixed;right:100px;bottom:36px;background:#fff;border:1px solid #E6DEDC;box-shadow:0 8px 24px rgba(40,10,15,.12);border-radius:12px;padding:10px 14px;font-size:13px;z-index:49;max-width:240px;line-height:1.5"><b style="color:#4A0F18">ให้ AI ช่วยสัมภาษณ์</b><br><span style="color:#6B6264">เล่าผลงานด้วยเสียง ระบบจะจัดเป็นบันทึกให้</span></div>` : '';
  const fab = `<button data-act="toggleChat" class="no-print h-primary" aria-label="ผู้ช่วย AI" style="position:fixed;right:24px;bottom:24px;width:64px;height:64px;border-radius:50%;background:#7B1E2B;color:#F1D9A0;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 28px rgba(74,15,24,.4);z-index:51;border:2px solid #B8913A">
    ${S.chatOpen ? '' : '<span style="position:absolute;inset:-2px;border-radius:50%;border:2px solid #B8913A;animation:ringPulse 2.2s ease-out infinite;pointer-events:none"></span>'}
    <i class="${S.chatOpen ? 'bi bi-x-lg' : 'bi bi-stars'}" style="font-size:24px;position:relative"></i></button>`;
  if (!S.chatOpen) return hint + fab;

  const iv = S.mode === 'interview';
  const msgs = iv ? S.ivMsgs : S.askMsgs;
  const kpiStep = iv && !S.ivDone && S.ivStep === KPI_Q;
  const chips = kpiStep ? (S.data.kpiOptions.length ? [] : ['ยังไม่มีตัวชี้วัดในระบบ']) : iv && !S.ivDone ? (QUESTIONS[S.ivStep] || {}).chips || [] : !iv ? ['สรุปผลงานเด่นของฉัน', 'KPI ใดยังต่ำกว่าเป้า', 'แนะนำการพัฒนาตนเอง'] : [];
  const tabs = [['interview', 'สัมภาษณ์', 'bi bi-mic'], ['ask', 'ถาม‑ตอบ', 'bi bi-chat-dots']];
  const dots = [0, 1, 2].map(i => `<span style="animation:blink 1.2s infinite;animation-delay:${i * 0.2}s;width:6px;height:6px;border-radius:50%;background:#8A7F81;display:inline-block"></span>`).join('');
  return hint + fab + `
<div class="chat-panel no-print" style="position:fixed;right:24px;bottom:100px;width:410px;height:min(660px,calc(100vh - 124px));background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(40,10,15,.25),0 2px 8px rgba(40,10,15,.1);display:flex;flex-direction:column;overflow:hidden;z-index:50;border:1px solid #E6DEDC">
  <div style="background:#4A0F18;color:#fff;padding:16px 18px 0">
    <div style="display:flex;gap:12px;align-items:center">
      <div style="width:38px;height:38px;border-radius:12px;background:#7B1E2B;border:1px solid #B8913A;display:flex;align-items:center;justify-content:center;color:#F1D9A0;font-size:18px"><i class="bi bi-stars"></i></div>
      <div style="flex:1;line-height:1.3"><div style="font-weight:700;font-size:15px">ผู้ช่วย AI แฟ้มสะสมงาน</div><div style="font-size:12px;color:#D9B8BC;display:flex;gap:6px;align-items:center"><span style="width:7px;height:7px;border-radius:50%;background:${ai.ready ? '#5FD08A' : '#D9B8BC'}"></span>${esc(ai.ready ? P.label + ' · ' + ai.model : 'ออฟไลน์ · สัมภาษณ์ได้โดยไม่ใช้ token')}</div></div>
      <button data-act="resetChat" title="เริ่มใหม่" class="h-chat" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#E4CBCE"><i class="bi bi-arrow-counterclockwise"></i></button>
      <button data-act="toggleChat" title="ปิด" class="h-chat" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#E4CBCE"><i class="bi bi-x-lg"></i></button>
    </div>
    <div style="display:flex;gap:4px;margin-top:14px">
      ${tabs.map(([k, label, icon]) => `<button data-act="chatMode" data-v="${k}" style="flex:1;text-align:center;padding:9px 0;font-size:13px;font-weight:600;border-radius:10px 10px 0 0;background:${S.mode === k ? '#fff' : 'transparent'};color:${S.mode === k ? '#4A0F18' : '#E4CBCE'}"><i class="${icon}"></i> ${label}</button>`).join('')}
    </div>
  </div>
  ${iv ? `
  <div style="padding:12px 18px 10px;border-bottom:1px solid #EFE8E6;background:#FAF7F6">
    <div style="display:flex;justify-content:space-between;font-size:12px;color:#6B6264"><span>${esc(S.ivDone ? 'สัมภาษณ์ครบแล้ว' : 'หัวข้อ: ' + QUESTIONS[S.ivStep].k)}</span><span>${Math.min(S.ivStep, 8)} / 8</span></div>
    <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:4px;margin-top:8px">${QUESTIONS.map((_, i) => `<div style="height:4px;border-radius:4px;background:${i < S.ivStep ? '#7B1E2B' : i === S.ivStep ? '#B8913A' : '#E6DEDC'}"></div>`).join('')}</div>
  </div>` : ''}
  <div id="msgs" style="flex:1;overflow:auto;padding:16px 16px 8px;display:flex;flex-direction:column;gap:10px;background:#fff">
    ${msgs.map((m, i) => { const me = m.role === 'user'; return `<div style="display:flex;flex-direction:column;align-items:${me ? 'flex-end' : 'flex-start'}"><div style="max-width:86%;padding:10px 13px;font-size:13.5px;line-height:1.6;white-space:pre-wrap;word-break:break-word;background:${me ? '#7B1E2B' : '#F4F1EF'};color:${me ? '#fff' : '#1F1A1B'};border-radius:${me ? '14px 4px 14px 14px' : '4px 14px 14px 14px'}">${esc(m.text)}</div>${!iv && m.action ? userActionCard(m.action, i) : ''}</div>`; }).join('')}
    ${S.loading ? `<div style="display:flex;gap:4px;padding:10px 13px;background:#F4F1EF;border-radius:4px 14px 14px 14px;width:fit-content">${dots}</div>` : ''}
    ${iv && S.ivDone ? `
    <div style="border:1px solid #E3D3B0;background:#FDFAF3;border-radius:12px;padding:14px;margin-top:4px">
      <div style="font-size:13px;font-weight:700;color:#4A0F18;display:flex;gap:6px;align-items:center"><i class="bi bi-file-earmark-text"></i>ร่างบันทึกผลงาน</div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px">${QUESTIONS.map((q, i) => `<div style="font-size:12.5px;line-height:1.5"><span style="color:#8A7F81">${q.k}:</span> ${esc(S.ivAnswers[i] || '-')}</div>`).join('')}</div>
      ${S.data.kpiOptions.length ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #E3D3B0">${ivKpiPicker()}</div>` : ''}
      ${S.ivEvidence.length ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #E3D3B0">${ivEvidenceList()}</div>` : ''}
      ${S.draftSummary ? `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #E3D3B0;font-size:13px;line-height:1.7;white-space:pre-wrap">${esc(S.draftSummary)}</div>` : ''}
      <div style="display:flex;gap:8px;margin-top:12px">
        <button data-act="polish" style="flex:1;text-align:center;border:1px solid #D9CCCB;background:#fff;padding:8px;border-radius:8px;font-size:12.5px;font-weight:600"><i class="bi bi-stars" style="color:#B8913A"></i> เรียบเรียงด้วย AI</button>
        <button data-act="saveDraft" style="flex:1;text-align:center;background:#7B1E2B;color:#fff;padding:8px;border-radius:8px;font-size:12.5px;font-weight:600"><i class="bi bi-save"></i> บันทึกเข้าแฟ้ม</button>
      </div>
    </div>` : ''}
  </div>
  ${kpiStep && S.data.kpiOptions.length ? `<div style="padding:8px 16px 0;max-height:190px;overflow:auto">${ivKpiPicker()}</div>` : ''}
  ${iv && !S.ivDone && S.ivEvidence.length ? `<div style="padding:8px 16px 0;max-height:120px;overflow:auto">${ivEvidenceList()}</div>` : ''}
  ${chips.length ? `<div style="display:flex;gap:6px;flex-wrap:wrap;padding:6px 16px 0">${chips.map(c => `<button data-act="chip" data-v="${esc(c)}" class="h-outline" style="font-size:12px;padding:4px 10px;border-radius:20px;border:1px solid #E6DEDC;color:#5A5052">${esc(c)}</button>`).join('')}</div>` : ''}
  <div style="padding:10px 12px 12px">
    ${S.listening ? '<div style="font-size:12px;color:#C42838;padding:0 6px 6px;display:flex;gap:6px;align-items:center"><i class="bi bi-record-circle"></i>กำลังฟัง… พูดภาษาไทยได้เลย</div>' : ''}
    <div style="display:flex;gap:8px;align-items:flex-end;border:1px solid #D9CCCB;border-radius:14px;padding:6px 6px 6px 12px;background:#fff">
      <textarea id="chatInput" data-bind="chatInput" rows="2" placeholder="${iv ? 'พิมพ์คำตอบ หรือกดไมค์เพื่อพูด…' : 'ถามผู้ช่วย AI…'}" style="flex:1;border:0;outline:0;resize:none;font-size:13.5px;line-height:1.5;padding:4px 0;background:transparent">${esc(S.chatInput)}</textarea>
      ${iv ? `<label title="แนบไฟล์หลักฐาน" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#F6ECEC;color:#7B1E2B;cursor:pointer">${S.uploading ? '<i class="bi bi-arrow-repeat" style="animation:spin 1s linear infinite"></i>' : '<i class="bi bi-paperclip"></i>'}<input id="chatFile" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov" style="display:none"></label>` : ''}
      <button data-act="mic" title="พูดเพื่อพิมพ์ (ใช้เบราว์เซอร์)" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${S.listening ? '#C42838' : '#F6ECEC'};color:${S.listening ? '#fff' : '#7B1E2B'};animation:${S.listening ? 'micPulse 1.4s infinite' : 'none'}"><i class="bi bi-mic-fill"></i></button>
      <button data-act="send" title="ส่ง" class="h-primary" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#7B1E2B;color:#fff"><i class="bi bi-send-fill"></i></button>
    </div>
  </div>
</div>`;
}

// ---------------- form modals ----------------
// เลือก KPI ที่ผลงานนี้สนับสนุน (อ้างอิง — ผลงานของ KPI ผู้ดูแลกรอกเอง)
function workKpiPicker(w) {
  const links = new Set((w.kpi_links || []).map(l => l.kpi_id));
  return `
      <fieldset style="border:1px solid #EFE8E6;border-radius:12px;padding:10px 14px 12px;margin:0;display:flex;flex-direction:column;gap:8px">
        <legend style="font-size:13px;color:#5A5052;padding:0 6px">ตัวชี้วัดที่เชื่อมโยง</legend>
        ${S.data.kpiOptions.map(k => `
        <div style="display:flex;gap:10px;align-items:center;font-size:13.5px;flex-wrap:wrap">
          <label style="display:flex;gap:8px;align-items:flex-start;flex:1;min-width:200px"><input type="checkbox" name="kpi_ck" value="${k.id}" ${links.has(k.id) ? 'checked' : ''} style="margin-top:3px"><span>${esc(k.name)}</span></label>
        </div>`).join('')}
        <div style="font-size:12px;color:#8A7F81">ใช้อ้างอิงว่าผลงานนี้สนับสนุนตัวชี้วัดใด — ผลงานของตัวชี้วัดผู้ดูแลระบบเป็นผู้กรอก</div>
      </fieldset>`;
}

// ผู้ดูแลแก้ KPI/สมรรถนะ/สถานะผลงานของบุคลากร — ค่าที่พิมพ์เก็บใน S.kpiEdit ผ่าน data-k="kpis.0.name"
function syncKpiEdit() {
  document.querySelectorAll('[data-k]').forEach(el => {
    const [list, i, f] = el.dataset.k.split('.');
    const row = S.kpiEdit[list][+i];
    if (row) row[f] = el.type === 'checkbox' ? el.checked : el.value;
  });
}
function kpiAdminBody() {
  const e = S.kpiEdit;
  const inp = (k, v, extra = '') => `<input data-k="${k}" value="${esc(v == null ? '' : v)}" ${extra} style="width:100%;min-width:0;padding:6px 8px;border:1px solid #E6DEDC;border-radius:8px;font-size:13px">`;
  const sec = t => `<div style="font-weight:600;font-size:14px;color:#7B1E2B;margin-top:4px">${t}</div>`;
  const wsum = e.kpis.reduce((a, k) => a + (+k.weight || 0), 0);
  const kc = 'grid-template-columns:minmax(0,2.4fr) minmax(0,1.4fr) 64px 80px 64px 80px 30px';
  const cc = 'grid-template-columns:minmax(0,1fr) minmax(0,2.4fr) 80px 80px 30px';
  const lvl = (k, v) => `<select data-k="${k}" style="width:100%;padding:6px;border:1px solid #E6DEDC;border-radius:8px">${[0, 1, 2, 3, 4, 5].map(n => `<option ${+v === n ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  return `
    ${sec('ตัวชี้วัด (KPI)')}
    <div class="table-wrap"><div class="table-min" style="min-width:640px;display:flex;flex-direction:column;gap:8px">
      <div style="display:grid;${kc};gap:8px;font-size:12px;color:#6B6264;font-weight:600"><div>ชื่อตัวชี้วัด</div><div>แหล่งข้อมูล</div><div>น้ำหนัก %</div><div>เป้าหมาย</div><div>หน่วย</div><div>ผลงาน</div><div></div></div>
      ${e.kpis.map((k, i) => `
      <div style="border-bottom:1px dashed #EFE8E6;padding-bottom:8px">
        <div style="display:grid;${kc};gap:8px;align-items:center">
          ${inp(`kpis.${i}.name`, k.name)}${inp(`kpis.${i}.source`, k.source)}${inp(`kpis.${i}.weight`, k.weight, 'type="number" min="0" max="100" step="any"')}
          ${inp(`kpis.${i}.target_value`, k.target_value, 'type="number" min="0" step="any"')}${inp(`kpis.${i}.unit`, k.unit, 'placeholder="%, คน"')}
          ${inp(`kpis.${i}.actual_value`, k.actual_value, 'type="number" min="0" step="any"')}
          <button type="button" class="icon-btn" data-act="kpiRow" data-v="kpis.${i}" title="ลบ"><i class="bi bi-trash3"></i></button>
        </div>
      </div>`).join('') || '<div style="font-size:13px;color:#8A7F81">ยังไม่มีตัวชี้วัด</div>'}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn btn-outline" data-act="kpiRow" data-v="kpis.add"><i class="bi bi-plus-lg"></i>เพิ่มตัวชี้วัด</button>
        <span style="font-size:12.5px;color:${e.kpis.length && Math.round(wsum) !== 100 ? '#B3261E' : '#6B6264'}">น้ำหนักรวม ${Math.round(wsum * 100) / 100}%${e.kpis.length && Math.round(wsum) !== 100 ? ' (ควรเป็น 100%)' : ''}</span>
      </div>
    </div></div>
    ${sec('สมรรถนะ (ระดับ 0–5)')}
    <div class="table-wrap"><div class="table-min" style="min-width:480px;display:flex;flex-direction:column;gap:8px">
      <div style="display:grid;${cc};gap:8px;font-size:12px;color:#6B6264;font-weight:600"><div>กลุ่ม</div><div>สมรรถนะ</div><div>คาดหวัง</div><div>ประเมินได้</div><div></div></div>
      ${e.comps.map((c, i) => `
      <div style="display:grid;${cc};gap:8px;align-items:center">
        ${inp(`comps.${i}.grp`, c.grp, 'placeholder="หลัก / ตำแหน่ง"')}${inp(`comps.${i}.name`, c.name)}${lvl(`comps.${i}.expected`, c.expected)}${lvl(`comps.${i}.actual`, c.actual)}
        <button type="button" class="icon-btn" data-act="kpiRow" data-v="comps.${i}" title="ลบ"><i class="bi bi-trash3"></i></button>
      </div>`).join('') || '<div style="font-size:13px;color:#8A7F81">ยังไม่มีสมรรถนะ</div>'}
      <button type="button" class="btn btn-outline" data-act="kpiRow" data-v="comps.add" style="align-self:flex-start"><i class="bi bi-plus-lg"></i>เพิ่มสมรรถนะ</button>
    </div></div>
    ${sec('รับรองผลงาน')}
    ${e.works.map((w, i) => `
    <div style="display:flex;gap:10px;align-items:center;font-size:13px">
      <div style="flex:1;min-width:0"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(w.title)}</div>${w.kpi ? `<div style="font-size:11.5px;color:#8A7F81">${esc(w.kpi)}</div>` : ''}</div>
      <select data-k="works.${i}.status" style="padding:5px 8px;border:1px solid #E6DEDC;border-radius:8px;font-size:12.5px">${WORK_STATUSES.map(s => `<option ${s === w.status ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
    </div>`).join('') || '<div style="font-size:13px;color:#8A7F81">ยังไม่มีผลงาน</div>'}`;
}

function viewModal() {
  const m = S.modal;
  if (!m) return '';
  const u = S.data.user;
  const opt = (list, cur) => list.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
  let title = '', body = '', form = m.type;
  if (m.type === 'work') {
    const w = m.id ? S.data.works.find(x => x.id === m.id) || {} : {};
    title = m.id ? 'แก้ไขผลงาน' : 'เพิ่มผลงาน';
    body = `
      <label class="field">ชื่องาน / โครงการ *<input name="title" required value="${esc(w.title)}"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="field">ประเภท<select name="type">${opt(TYPES, w.type || 'โครงการ')}</select></label>
        <label class="field">ระยะเวลา<input name="period" value="${esc(w.period)}" placeholder="ต.ค. 68 – มี.ค. 69"></label>
      </div>
      <label class="field">ผู้มอบหมาย / เอกสารอ้างอิง<input name="ref" value="${esc(w.ref)}" placeholder="คำสั่ง สอศ. ที่ …/${esc(PER().fiscalYear)}"></label>
      <label class="field">ผลผลิต / ผลลัพธ์<textarea name="result" rows="2">${esc(w.result)}</textarea></label>
      ${S.data.kpiOptions.length ? workKpiPicker(w) : `<label class="field">ตัวชี้วัดที่เชื่อมโยง<input name="kpi" value="${esc(w.kpi)}" placeholder="KPI 1, 2"></label>`}
      <label class="field">สรุปผลการปฏิบัติงาน<textarea name="summary" rows="4">${esc(w.summary)}</textarea></label>
      ${isAdmin() && m.id ? `<label class="field">สถานะ (ผู้ดูแลระบบ)<select name="status">${opt(WORK_STATUSES, w.status)}</select></label>` : ''}`;
  } else if (m.type === 'evidence') {
    title = 'เพิ่มหลักฐาน';
    body = `
      <label class="field">เชื่อมโยงกับผลงาน<select name="work_id"><option value="">— ไม่ระบุ —</option>${S.data.works.map(w => `<option value="${w.id}" ${w.id === m.workId ? 'selected' : ''}>${esc(w.title)}</option>`).join('')}</select></label>
      <div data-drop="1" style="border:2px dashed #D9CCCB;border-radius:12px;background:#FCFAF9;padding:18px;display:flex;flex-direction:column;gap:10px;align-items:flex-start">
        <div style="font-size:13px;color:#6B6264">ลากไฟล์มาวาง หรือ</div>
        <label class="btn btn-outline" style="cursor:pointer;font-weight:400"><i class="bi bi-paperclip"></i>เลือกไฟล์<input id="fileInput" type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.mp4,.mov" style="display:none"></label>
        ${S.pendingFiles.length ? `<div style="display:flex;flex-direction:column;gap:4px;width:100%">${S.pendingFiles.map((f, i) => `<div style="display:flex;gap:8px;align-items:center;font-size:13px"><i class="bi bi-file-earmark"></i><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.name)}</span><span style="color:#8A7F81">${(f.size / 1048576).toFixed(1)} MB</span><button type="button" class="icon-btn" data-act="rmFile" data-v="${i}"><i class="bi bi-x"></i></button></div>`).join('')}</div>` : ''}
      </div>
      <div style="font-size:12.5px;color:#8A7F81;text-align:center">— หรือเพิ่มเป็นลิงก์ —</div>
      <label class="field">ลิงก์ (Google Drive / OneDrive / URL ผลงาน)<input name="url" type="url" placeholder="https://"></label>
      <label class="field">ชื่อหลักฐาน (สำหรับลิงก์)<input name="name" placeholder="เช่น แบบประเมินความพึงพอใจ"></label>`;
  } else if (m.type === 'profile') {
    title = 'ข้อมูลส่วนตัว';
    body = `
      <label class="field">ชื่อ-สกุล *<input name="name" required value="${esc(u.name)}"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="field">ตำแหน่ง<input name="position" value="${esc(u.position)}"></label>
        <label class="field">ระดับ<input name="level" value="${esc(u.level)}"></label>
      </div>
      <label class="field">สังกัด / กลุ่มงาน<input name="group_name" value="${esc(u.group_name)}"></label>
      <label class="field">ผู้บังคับบัญชา<input name="supervisor" value="${esc(u.supervisor)}"></label>
      <label class="field">หน้าที่ความรับผิดชอบหลัก (บรรทัดละ 1 ข้อ)<textarea name="duties" rows="4">${esc(u.duties)}</textarea></label>
      <button type="button" data-act="modal" data-v="password" style="font-size:13px;color:#7B1E2B;align-self:flex-start"><i class="bi bi-key"></i> เปลี่ยนรหัสผ่าน</button>`;
  } else if (m.type === 'password') {
    title = 'เปลี่ยนรหัสผ่าน';
    body = `
      <label class="field">รหัสผ่านเดิม<input name="current" type="password" required autocomplete="current-password"></label>
      <label class="field">รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)<input name="next" type="password" required minlength="8" autocomplete="new-password"></label>`;
  } else if (m.type === 'userEdit') {
    const x = (S.users || []).find(v => v.id === m.id) || {};
    const self = x.id === S.data.user.id;
    title = 'แก้ไขผู้ใช้ — ' + esc(x.name || '');
    body = `
      <input type="hidden" name="id" value="${x.id}">
      <fieldset style="border:1px solid #EFE8E6;border-radius:12px;padding:12px 14px 14px;background:#FCFAF9;display:flex;flex-direction:column;gap:12px;margin:0">
        <legend style="font-size:13px;font-weight:600;color:#7B1E2B;padding:0 6px"><i class="bi bi-box-arrow-in-right"></i> ข้อมูลเข้าสู่ระบบ</legend>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <label class="field">ชื่อผู้ใช้ *<input name="username" required pattern="[a-zA-Z0-9._\\-]{3,32}" value="${esc(x.username)}"></label>
          <label class="field">รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)<input name="password" type="password" minlength="8" placeholder="อย่างน้อย 8 ตัวอักษร" autocomplete="new-password"></label>
        </div>
        ${x.locked ? '<label style="display:flex;gap:8px;align-items:center;font-size:13.5px"><input type="checkbox" name="unlock" value="1" checked> ปลดล็อกการเข้าสู่ระบบ</label>' : ''}
      </fieldset>
      <label class="field">บทบาท<select name="role" ${self ? 'disabled title="ไม่สามารถเปลี่ยนบทบาทของตัวเองได้"' : ''}><option value="staff" ${x.role === 'staff' ? 'selected' : ''}>บุคลากร</option><option value="admin" ${x.role === 'admin' ? 'selected' : ''}>ผู้ดูแลระบบ</option></select></label>
      <label class="field">ชื่อ-สกุล *<input name="name" required value="${esc(x.name)}"></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="field">ตำแหน่ง<input name="position" value="${esc(x.position)}"></label>
        <label class="field">ระดับ<input name="level" value="${esc(x.level)}"></label>
      </div>
      <label class="field">สังกัด / กลุ่มงาน<input name="group_name" value="${esc(x.group_name)}"></label>
      <label class="field">ผู้บังคับบัญชา<input name="supervisor" value="${esc(x.supervisor)}"></label>
      <label class="field">หน้าที่ความรับผิดชอบหลัก (บรรทัดละ 1 ข้อ)<textarea name="duties" rows="4">${esc(x.duties)}</textarea></label>
      <div style="font-size:12px;color:#8A7F81">การเปลี่ยนบทบาทหรือรหัสผ่านจะทำให้ผู้ใช้นั้นต้องเข้าสู่ระบบใหม่</div>`;
  } else if (m.type === 'kpiAdmin') {
    title = 'KPI และสมรรถนะ — ' + esc(S.kpiEdit.name);
    body = periodSelect('kpiEditPeriod', S.kpiEdit.periodId) + kpiAdminBody();
  } else if (m.type === 'user') {
    title = 'เพิ่มผู้ใช้';
    body = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="field">ชื่อผู้ใช้ *<input name="username" required pattern="[a-zA-Z0-9._\\-]{3,32}"></label>
        <label class="field">รหัสผ่าน * (≥ 8 ตัว)<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
      </div>
      <label class="field">ชื่อ-สกุล *<input name="name" required></label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="field">ตำแหน่ง<input name="position"></label>
        <label class="field">ระดับ<input name="level"></label>
      </div>
      <label class="field">สังกัด / กลุ่มงาน<input name="group_name" value="กลุ่มพัฒนาครูและบุคลากรทางการศึกษา"></label>
      <label class="field">บทบาท<select name="role"><option value="staff">บุคลากร</option><option value="admin">ผู้ดูแลระบบ</option></select></label>`;
  }
  return `
<div data-act="closeModal" data-self="1" style="position:fixed;inset:0;z-index:70;background:rgba(26,6,10,.5);display:flex;align-items:center;justify-content:center;padding:16px">
  <form data-form="${form}" role="dialog" aria-modal="true" style="width:100%;max-width:${m.type === 'kpiAdmin' ? 900 : 560}px;max-height:92vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.35)">
    <div style="padding:18px 22px;border-bottom:1px solid #EFE8E6;display:flex;align-items:center;gap:10px;position:sticky;top:0;background:#fff;z-index:1"><div style="flex:1;font-weight:700;font-size:16px">${title}</div><button type="button" data-act="closeModal" class="icon-btn" aria-label="ปิด"><i class="bi bi-x-lg"></i></button></div>
    <div style="padding:20px 22px;display:flex;flex-direction:column;gap:14px">${body}
      ${S.formErr ? `<div style="font-size:13px;color:#C42838">${esc(S.formErr)}</div>` : ''}
    </div>
    <div style="padding:14px 22px 18px;display:flex;gap:10px;justify-content:flex-end;border-top:1px solid #EFE8E6">
      <button type="button" data-act="closeModal" class="btn btn-outline">ยกเลิก</button>
      <button type="submit" class="btn btn-primary">${S.busy ? '<i class="bi bi-arrow-repeat" style="animation:spin 1s linear infinite"></i> กำลังบันทึก…' : 'บันทึก'}</button>
    </div>
  </form>
</div>`;
}

// ---------------- render ----------------
const root = document.getElementById('root');
function render() {
  saveChat();
  const a = document.activeElement;
  const focusId = a && a.id ? a.id : null;
  const sel = focusId && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd] : null;
  const msgEl = document.getElementById('msgs');
  const wasAtBottom = !msgEl || msgEl.scrollHeight - msgEl.scrollTop - msgEl.clientHeight < 40;

  if (!S.booted) root.innerHTML = '';
  else if (!S.me || !S.data) root.innerHTML = viewLogin();
  else {
    const D = derive();
    root.innerHTML = impersonateBar() + (S.view === 'portfolio' ? viewPortfolio(D) + printSheet(D) : viewAdmin(D)) + viewChat() + viewModal();
  }

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus(); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text input */ } }
  }
  const m = document.getElementById('msgs');
  if (m && (wasAtBottom || S._scrollChat)) m.scrollTop = m.scrollHeight;
  S._scrollChat = false;

  // keep the current screen in the URL so a refresh returns to it
  if (S.me) {
    const h = S.view === 'portfolio' ? '#/portfolio/' + S.pfTab : '#/' + S.page;
    if (location.hash !== h) history.replaceState(null, '', h);
  }
}
// Portfolio แสดงข้อมูลปีงบ/รอบปัจจุบันเสมอ — ถ้ากำลังเลือกดูรอบอื่นอยู่ ล้างตัวเลือกแล้วโหลดข้อมูลรอบปัจจุบันใหม่
function showPortfolio(quiet) {
  S.view = 'portfolio'; S.sideOpen = false;
  if (S.viewPeriod || S.workPeriod) {
    S.viewPeriod = S.workPeriod = null;
    return reloadAfter(Promise.resolve());
  }
  if (!quiet) render();
}
// แถบเตือนตลอดเวลาที่ผู้ดูแลสวมสิทธิ์ผู้ใช้อยู่
function impersonateBar() {
  const by = S.data && S.data.impersonator;
  if (!by) return '';
  return `<div class="no-print" style="position:sticky;top:0;z-index:80;background:#B8913A;color:#1F1A1B;padding:8px 16px;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;font-size:13.5px">
  <i class="bi bi-person-bounding-box"></i><span>กำลังสวมสิทธิ์เป็น <b>${esc(S.data.user.name)}</b> (${esc(S.data.user.username)}) — ทุกการแก้ไขจะบันทึกเป็นของผู้ใช้นี้ และระบุว่าทำโดย ${esc(by)}</span>
  <button data-act="stopImpersonate" style="background:#4A0F18;color:#fff;border-radius:16px;padding:4px 14px;font-weight:600">กลับเป็นผู้ดูแล</button>
</div>`;
}
async function switchUser(p, page, msg) {
  try {
    await p;
    saveChat(); // เก็บแชทของบัญชีเดิมไว้ (แยกคีย์ตามผู้ใช้) แล้วโหลดของบัญชีใหม่
    Object.assign(S, { view: 'admin', page, viewPeriod: null, workPeriod: null, users: null, periodsAdmin: null, kpiEdit: null, modal: null, aiForm: null, _chatRestored: false, askMsgs: S.askMsgs.slice(0, 1), ivStep: 0, ivAnswers: [], ivMsgs: [greet()], ivDone: false, draftSummary: '', ivKpis: {}, ivEvidence: [] });
    await loadData();
    location.hash = '';
    render(); window.scrollTo(0, 0);
    toast(msg);
  } catch (e) { toast(e.message); }
}
function readHash() {
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'portfolio') { showPortfolio(true); if (['overview', 'works', 'kpi', 'comp', 'evidence'].includes(b)) S.pfTab = b; }
  else if (PAGE_TITLES[a]) { S.view = 'admin'; S.page = a; }
}
const set = patch => { Object.assign(S, patch); render(); };

// ---------------- chat: เพิ่มผู้ใช้ผ่านผู้ช่วย AI (admin) ----------------
function userActionCard(a, i) {
  const rows = a.users.map(u => `<div style="padding:6px 0;border-top:1px solid #EFE6E7"><b>${esc(u.name)}</b> <span style="color:#8A7F81">(${esc(u.username)})</span>${u.role === 'admin' ? ' <span style="color:#7B1E2B">ผู้ดูแลระบบ</span>' : ''}<br><span style="font-size:12px;color:#6B6163">${esc([u.position, u.level, u.group_name].filter(Boolean).join(' · ') || '-')}</span></div>`).join('');
  const btn = a.done ? `<div style="font-size:12px;color:#2E7D4F;margin-top:6px">${esc(a.done)}</div>`
    : `<button data-act="aiCreateUsers" data-v="${i}" style="margin-top:8px;padding:7px 12px;border-radius:8px;background:#7B1E2B;color:#fff;font-size:13px">ยืนยันเพิ่มผู้ใช้ ${a.users.length} คน</button>`;
  return `<div style="max-width:86%;margin-top:6px;padding:10px 13px;font-size:13px;background:#fff;border:1px solid #E4CBCE;border-radius:10px">
    <div style="font-weight:600;margin-bottom:4px"><i class="bi bi-person-plus"></i> เพิ่มผู้ใช้ (ยังไม่ได้บันทึก)</div>${rows}${btn}</div>`;
}
async function aiCreateUsers(i) {
  const m = S.askMsgs[i];
  if (!m || !m.action || m.action.done || S.busy) return;
  S.busy = true;
  const ok = [], fail = [];
  for (const u of m.action.users) {
    try {
      const r = await api('/api/users', { method: 'POST', body: { ...u, generatePassword: true } });
      ok.push(u.name + '  ชื่อผู้ใช้: ' + u.username + '  รหัสผ่าน: ' + r.password);
    } catch (e) { fail.push(u.name + ' (' + u.username + '): ' + e.message); }
  }
  S.busy = false;
  m.action = { ...m.action, done: 'ดำเนินการแล้ว — สำเร็จ ' + ok.length + ' / ' + m.action.users.length };
  S.users = null;
  pushMsg('askMsgs', { role: 'bot', secret: ok.length > 0, text:
    (ok.length ? 'เพิ่มผู้ใช้แล้ว (รหัสผ่านแสดงครั้งเดียว ให้แจ้งผู้ใช้และเปลี่ยนรหัสหลังเข้าระบบครั้งแรก):\n' + ok.join('\n') : '') +
    (fail.length ? (ok.length ? '\n\n' : '') + 'เพิ่มไม่สำเร็จ:\n' + fail.join('\n') : '') });
  render();
}

// ---------------- chat logic ----------------
// ---------------- interview: KPI จริง + แนบหลักฐาน ----------------
const KPI_Q = QUESTIONS.findIndex(q => q.k === 'ตัวชี้วัดที่เกี่ยวข้อง');
const EV_Q = QUESTIONS.findIndex(q => q.k === 'หลักฐาน');
// S.ivKpis = { [kpiId]: 1 } — KPI ที่ผลงานนี้สนับสนุน (อ้างอิง ไม่นับเป็นคะแนน)
function ivKpiPicker() {
  return `<div style="font-size:12px;color:#6B6264;margin-bottom:6px">เลือกตัวชี้วัดที่งานนี้สนับสนุน</div>
  <div style="display:flex;flex-direction:column;gap:6px">${S.data.kpiOptions.map(k => { const on = k.id in S.ivKpis; return `
    <div style="display:flex;gap:8px;align-items:center;font-size:12.5px;flex-wrap:wrap">
      <label style="display:flex;gap:7px;align-items:flex-start;flex:1;min-width:160px;cursor:pointer"><input type="checkbox" data-change="ivKpi" data-id="${k.id}" ${on ? 'checked' : ''} style="margin-top:2px"><span>${esc(k.name)}</span></label>
    </div>`; }).join('')}</div>`;
}
const ivKpiNames = () => S.data.kpiOptions.filter(k => k.id in S.ivKpis).map(k => k.name);
function ivEvidenceList() {
  return `<div style="font-size:12px;color:#6B6264;margin-bottom:4px"><i class="bi bi-paperclip"></i> หลักฐานที่แนบ (จะเชื่อมกับผลงานเมื่อบันทึก)</div>
  ${S.ivEvidence.map((e, i) => `<div style="display:flex;gap:6px;align-items:center;font-size:12.5px"><i class="bi bi-file-earmark-check" style="color:#1E6B3A"></i><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.name)}</span><button data-act="rmIvEv" data-v="${i}" title="ลบไฟล์นี้" style="color:#8A7F81"><i class="bi bi-x"></i></button></div>`).join('')}`;
}
// อัปโหลดทันทีเป็นหลักฐานที่ยังไม่เชื่อมผลงาน (อยู่รอดแม้รีเฟรชหน้า) แล้วเชื่อมกับผลงานตอนบันทึกร่าง
async function uploadChatFiles(files) {
  if (!files.length || S.uploading) return;
  const out = new FormData();
  files.forEach(f => out.append('files', f));
  set({ uploading: true });
  try {
    const r = await api('/api/evidence', { method: 'POST', body: out });
    r.ids.forEach((id, i) => S.ivEvidence.push({ id, name: files[i].name }));
    pushMsg('ivMsgs', { role: 'bot', text: 'แนบหลักฐานแล้ว ' + r.ids.length + ' ไฟล์: ' + files.map(f => f.name).join(', ') + (S.ivStep === EV_Q && !S.ivDone ? '\nพิมพ์คำอธิบายเพิ่มเติม หรือกดส่งเพื่อไปข้อถัดไปได้เลยครับ' : '') });
    await loadData();
  } catch (e) {
    pushMsg('ivMsgs', { role: 'bot', text: 'แนบไฟล์ไม่สำเร็จ: ' + e.message });
  }
  set({ uploading: false });
}

function pushMsg(key, msg) { S[key] = [...S[key], msg]; S._scrollChat = true; }

async function send() {
  let text = S.chatInput.trim();
  // ข้อ KPI/หลักฐาน: ถ้าไม่พิมพ์แต่เลือก KPI หรือแนบไฟล์แล้ว ใช้สิ่งที่เลือกเป็นคำตอบ
  if (!text && S.mode === 'interview' && !S.ivDone) {
    if (S.ivStep === KPI_Q) text = ivKpiNames().join(', ');
    else if (S.ivStep === EV_Q) text = S.ivEvidence.map(e => e.name).join(', ');
  }
  if (!text || S.loading) return;
  if (S.rec && S.listening) S.rec.stop();
  S.chatInput = '';
  if (S.mode === 'interview') {
    if (S.ivDone) {
      pushMsg('ivMsgs', { role: 'user', text });
      pushMsg('ivMsgs', { role: 'bot', text: 'ร่างบันทึกพร้อมแล้วครับ กด “บันทึกเข้าแฟ้ม” หรือเริ่มใหม่ที่ปุ่มด้านบน' });
      return render();
    }
    const step = S.ivStep + 1;
    S.ivAnswers = [...S.ivAnswers, text];
    pushMsg('ivMsgs', { role: 'user', text });
    if (step < QUESTIONS.length) pushMsg('ivMsgs', { role: 'bot', text: ACKS[step % ACKS.length] + '\n\n' + (step + 1) + '/8 ' + QUESTIONS[step].q });
    else pushMsg('ivMsgs', { role: 'bot', text: 'ครบทุกคำถามแล้วครับ ตรวจสอบร่างด้านล่าง กด “เรียบเรียงด้วย AI” เพื่อได้ข้อความทางการ (ใช้ token ครั้งเดียว)' });
    S.ivStep = step; S.ivDone = step >= QUESTIONS.length;
    return render();
  }
  pushMsg('askMsgs', { role: 'user', text });
  if (!S.data.ai.ready) {
    pushMsg('askMsgs', { role: 'bot', text: 'ผู้ดูแลระบบยังไม่ได้เปิดการเชื่อมต่อ AI ครับ ระหว่างนี้ใช้โหมดสัมภาษณ์ได้โดยไม่ต้องเชื่อมต่อ' });
    return render();
  }
  set({ loading: true });
  try {
    const r = await api('/api/ai/chat', { method: 'POST', body: { messages: S.askMsgs } });
    pushMsg('askMsgs', { role: 'bot', text: r.text, action: r.action || undefined });
  } catch (e) {
    pushMsg('askMsgs', { role: 'bot', text: 'เชื่อมต่อไม่สำเร็จ: ' + e.message });
  }
  set({ loading: false });
}

async function polish() {
  if (S.loading) return;
  if (!S.data.ai.ready) {
    pushMsg('ivMsgs', { role: 'bot', text: 'ผู้ดูแลระบบยังไม่ได้เปิดการเชื่อมต่อ AI กดบันทึกร่างนี้เข้าแฟ้มได้เลยครับ' });
    return render();
  }
  set({ loading: true });
  const data = QUESTIONS.map((q, i) => q.k + ': ' + (S.ivAnswers[i] || '-')).join('\n');
  try {
    const r = await api('/api/ai/polish', { method: 'POST', body: { data } });
    S.draftSummary = r.text; S._scrollChat = true;
  } catch (e) {
    pushMsg('ivMsgs', { role: 'bot', text: 'เชื่อมต่อไม่สำเร็จ: ' + e.message });
  }
  set({ loading: false });
}

async function saveDraft() {
  if (S.busy) return;
  const a = S.ivAnswers;
  const t = TYPES.find(x => (a[0] || '').includes(x)) || 'โครงการ';
  const summary = S.draftSummary || ['บทบาทและการดำเนินงาน: ' + (a[3] || '-'), 'หลักฐาน: ' + (a[5] || '-'), 'ผู้ตรวจสอบ/ผู้รับรอง: ' + (a[7] || '-')].join('\n');
  S.busy = true;
  try {
    const body = { title: a[0] || 'ผลงานใหม่', type: t, ref: a[1], period: a[2], result: a[4], kpi: a[KPI_Q], summary };
    const own = new Set(S.data.kpiOptions.map(k => k.id));
    const links = Object.entries(S.ivKpis).filter(([id]) => own.has(+id)).map(([id, value]) => ({ kpi_id: +id, value }));
    if (S.data.kpiOptions.length) body.kpi_links = links;
    const w = await api('/api/works', { method: 'POST', body });
    // หลักฐานที่แนบในแชท + ลิงก์ที่พิมพ์ในคำตอบข้อหลักฐาน -> เชื่อมกับผลงานนี้
    let evCount = 0;
    for (const e of S.ivEvidence) {
      try { await api('/api/evidence/' + e.id, { method: 'PUT', body: { work_id: w.id } }); evCount++; } catch (err) { /* ถูกลบไปแล้ว */ }
    }
    for (const url of [...new Set((a[EV_Q] || '').match(/https?:\/\/[^\s,]+/g) || [])]) {
      const fd = new FormData();
      fd.append('work_id', w.id); fd.append('url', url);
      try { await api('/api/evidence', { method: 'POST', body: fd }); evCount++; } catch (err) { /* ลิงก์ไม่ถูกต้อง — ข้าม */ }
    }
    await loadData();
    const kpiMsg = links.length ? '\nเชื่อมกับตัวชี้วัด: ' + ivKpiNames().join(', ') : '';
    const evMsg = evCount ? '\nแนบหลักฐาน ' + evCount + ' รายการ' : '\nแนบไฟล์หลักฐานเพิ่มได้ที่เมนู “หลักฐาน” หรือกดไอคอน 📎 ในตารางผลงาน';
    pushMsg('ivMsgs', { role: 'bot', text: 'บันทึก “' + w.title + '” เข้าแฟ้มแล้ว สถานะ: รอตรวจสอบ จากผู้บังคับบัญชา' + kpiMsg + evMsg });
    Object.assign(S, { ivDone: false, ivStep: 0, ivAnswers: [], draftSummary: '', ivKpis: {}, ivEvidence: [], view: 'admin', page: 'works', typeFilter: 'ทั้งหมด' });
    render();
    setTimeout(() => { pushMsg('ivMsgs', { role: 'bot', text: 'ต้องการบันทึกผลงานถัดไปไหมครับ\n\n1/8 ' + QUESTIONS[0].q }); render(); }, 600);
  } catch (e) {
    toast('บันทึกไม่สำเร็จ: ' + e.message);
  } finally { S.busy = false; }
}

function toggleMic() {
  if (S.listening) { if (S.rec) S.rec.stop(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const key = S.mode === 'ask' ? 'askMsgs' : 'ivMsgs';
  if (!SR) { pushMsg(key, { role: 'bot', text: 'เบราว์เซอร์นี้ไม่รองรับการแปลงเสียงเป็นข้อความ แนะนำ Google Chrome หรือ Microsoft Edge' }); return render(); }
  const rec = new SR();
  rec.lang = 'th-TH'; rec.interimResults = true; rec.continuous = true;
  const base = S.chatInput ? S.chatInput.trim() + ' ' : '';
  rec.onresult = e => {
    let t = '';
    for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
    S.chatInput = base + t;
    const el = document.getElementById('chatInput');
    if (el) el.value = S.chatInput;
  };
  rec.onend = () => set({ listening: false });
  rec.onerror = () => set({ listening: false });
  S.rec = rec;
  try { rec.start(); set({ listening: true }); } catch (e) { toast('เปิดไมโครโฟนไม่สำเร็จ'); }
}

// ---------------- actions ----------------
async function reloadAfter(p, okMsg) {
  try { await p; await loadData(); render(); if (okMsg) toast(okMsg); } catch (e) { toast(e.message); }
}
const A = {
  page: el => set({ page: el.dataset.v, view: 'admin', sideOpen: false, testMsg: '' }),
  side: () => set({ sideOpen: !S.sideOpen }),
  goPortfolio: () => { showPortfolio(); window.scrollTo(0, 0); },
  goAdmin: () => { set({ view: 'admin' }); window.scrollTo(0, 0); },
  // รอฟอนต์โหลดครบก่อนวัดความสูง ไม่งั้นวัดจากฟอนต์สำรองแล้วล้นหน้า
  impersonate: el => {
    const u = (S.users || []).find(x => x.id === +el.dataset.id);
    if (!u || !confirm('สวมสิทธิ์เป็น "' + u.name + '"?\nจะเห็นและแก้ไขข้อมูลได้เหมือนผู้ใช้นี้ กด "กลับเป็นผู้ดูแล" ที่แถบด้านบนเพื่อออก')) return;
    switchUser(api('/api/users/' + u.id + '/impersonate', { method: 'POST' }), 'dashboard', 'กำลังสวมสิทธิ์เป็น ' + u.name);
  },
  stopImpersonate: () => switchUser(api('/api/impersonate/stop', { method: 'POST' }), 'users', 'กลับเป็นผู้ดูแลแล้ว'),
  delPhoto: () => { if (confirm('ลบรูปถ่าย?')) reloadAfter(api('/api/profile/photo', { method: 'DELETE' }), 'ลบรูปถ่ายแล้ว'); },
  print: () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { fitPrintSheet(); window.print(); }),
  logout: async () => { clearChat(); try { await api('/api/logout', { method: 'POST' }); } catch (e) { /* ignore */ } location.reload(); },
  typeFilter: el => set({ typeFilter: el.dataset.v }),
  startInterview: () => { localStore('hintSeen', '1'); set({ chatOpen: true, mode: 'interview', hintSeen: true, _scrollChat: true }); focusChat(); },
  toggleChat: () => { localStore('hintSeen', '1'); set({ chatOpen: !S.chatOpen, hintSeen: true, _scrollChat: true }); if (S.chatOpen) focusChat(); },
  chatMode: el => { set({ mode: el.dataset.v, _scrollChat: true }); focusChat(); },
  aiCreateUsers: el => aiCreateUsers(+el.dataset.v),
  secScan: () => runSecScan(),
  secTab: el => set({ secTab: el.dataset.v }),
  resetChat: () => set(S.mode === 'ask' ? { askMsgs: S.askMsgs.slice(0, 1) } : { ivStep: 0, ivAnswers: [], ivMsgs: [greet()], ivDone: false, draftSummary: '', ivKpis: {}, ivEvidence: [] }),
  rmIvEv: async el => {
    const [e] = S.ivEvidence.splice(+el.dataset.v, 1);
    render();
    if (e) await reloadAfter(api('/api/evidence/' + e.id, { method: 'DELETE' }), 'ลบไฟล์ ' + e.name + ' แล้ว');
  },
  chip: el => { S.chatInput = (S.chatInput ? S.chatInput + ' ' : '') + el.dataset.v; render(); focusChat(); },
  send, polish, saveDraft, mic: toggleMic,
  pfTab: el => set({ pfTab: el.dataset.v }),
  pfType: el => set({ pfType: el.dataset.v }),
  pfDetail: el => set({ pfDetail: +el.dataset.id }),
  pfEv: el => set({ pfEv: +el.dataset.id }),
  closePf: () => set({ pfDetail: null }),
  closeEv: () => set({ pfEv: null }),
  pfNav: el => {
    const ws = S.data.works, n = ws.length;
    const i = ws.findIndex(w => w.id === S.pfDetail);
    set({ pfDetail: ws[(i + +el.dataset.v + n) % n].id });
  },
  scroll: el => { const r = document.getElementById('pfRow'); if (r) r.scrollBy({ left: +el.dataset.v, behavior: 'smooth' }); },
  modal: el => set({ modal: { type: el.dataset.v }, formErr: '', pendingFiles: [] }),
  closeModal: () => set({ modal: null, formErr: '', pendingFiles: [] }),
  editWork: el => set({ modal: { type: 'work', id: +el.dataset.id }, formErr: '' }),
  uploadFor: el => set({ modal: { type: 'evidence', workId: +el.dataset.id }, formErr: '', pendingFiles: [] }),
  editUser: el => set({ modal: { type: 'userEdit', id: +el.dataset.id }, formErr: '' }),
  perPreset: el => {
    // คำนวณวันจากปีงบ พ.ศ. ในช่องกรอก: รอบที่ 1 เริ่ม 1 ต.ค. ของปีก่อน
    const ce = (+document.getElementById('perYear').value || new Date().getFullYear() + 543) - 543;
    document.getElementById('perRound').value = el.dataset.round;
    document.getElementById('perStart').value = (ce + +el.dataset.ys) + '-' + el.dataset.ms;
    document.getElementById('perEnd').value = (ce + +el.dataset.ye) + '-' + el.dataset.me;
  },
  perEdit: el => set({ perEdit: +el.dataset.id || null }),
  perCurrent: el => reloadAfter(api('/api/periods/' + el.dataset.id + '/current', { method: 'POST' }).then(() => { S.periodsAdmin = null; S.viewPeriod = null; S.workPeriod = null; }), 'ตั้งรอบปัจจุบันแล้ว'),
  perDel: el => {
    const p = S.periodsAdmin.periods.find(x => x.id === +el.dataset.id);
    if (!confirm('ลบรอบ "' + p.round + ' ปีงบ ' + p.fiscalYear + '"?')) return;
    reloadAfter(api('/api/periods/' + p.id, { method: 'DELETE' }).then(() => { S.periodsAdmin = null; }), 'ลบรอบแล้ว');
  },
  editKpi: async el => {
    const id = +el.dataset.id;
    try {
      const r = await api('/api/users/' + id + '/kpis' + (el.dataset.period ? '?period=' + el.dataset.period : ''));
      S.kpiEdit = { id, name: ((S.users || []).find(u => u.id === id) || {}).name || '', ...r };
      set({ modal: { type: 'kpiAdmin' }, formErr: '' });
    } catch (e) { toast(e.message); }
  },
  kpiRow: el => {
    syncKpiEdit();
    const [list, i] = el.dataset.v.split('.');
    if (i === 'add') S.kpiEdit[list].push(list === 'kpis' ? { name: '', weight: '', target_value: '', unit: '', actual_value: 0 } : { grp: '', name: '', expected: 3, actual: 0 });
    else S.kpiEdit[list].splice(+i, 1);
    render();
  },
  delUser: el => {
    const u = (S.users || []).find(v => v.id === +el.dataset.id);
    if (u && confirm('ลบผู้ใช้ “' + u.name + '” (' + u.username + ') ?\nผลงาน หลักฐาน และไฟล์ทั้งหมดของผู้ใช้นี้จะถูกลบถาวร')) {
      S.users = null;
      reloadAfter(api('/api/users/' + u.id, { method: 'DELETE' }), 'ลบผู้ใช้แล้ว');
    }
  },
  delWork: el => {
    const w = S.data.works.find(x => x.id === +el.dataset.id);
    if (w && confirm('ลบผลงาน “' + w.title + '” ?\n(หลักฐานที่เชื่อมโยงจะยังอยู่ แต่ไม่ผูกกับผลงานนี้)')) reloadAfter(api('/api/works/' + w.id, { method: 'DELETE' }), 'ลบผลงานแล้ว');
  },
  delEv: el => {
    const e = S.data.evidence.find(x => x.id === +el.dataset.id);
    if (e && confirm('ลบหลักฐาน “' + e.name + '” ?')) reloadAfter(api('/api/evidence/' + e.id, { method: 'DELETE' }), 'ลบหลักฐานแล้ว');
  },
  verifyEv: el => {
    const e = S.data.evidence.find(x => x.id === +el.dataset.id);
    reloadAfter(api('/api/evidence/' + e.id, { method: 'PUT', body: { work_id: e.work_id, status: el.dataset.v } }));
  },
  rmFile: el => { S.pendingFiles.splice(+el.dataset.v, 1); render(); },
  provider: el => {
    const p = PROVIDERS[el.dataset.v];
    set({ aiForm: { ...S.aiForm, provider: el.dataset.v, baseUrl: p.baseUrl, model: p.model }, testMsg: '' });
  },
  testConn: async () => {
    set({ testMsg: 'กำลังทดสอบ… (ทดสอบค่าที่บันทึกแล้ว)', testOk: null });
    try {
      const r = await api('/api/ai/test', { method: 'POST' });
      set(r.ok ? { testMsg: 'เชื่อมต่อสำเร็จ · ' + r.text, testOk: true } : { testMsg: 'ไม่สำเร็จ: ' + r.error, testOk: false });
    } catch (e) { set({ testMsg: 'ไม่สำเร็จ: ' + e.message, testOk: false }); }
  }
};
function focusChat() { setTimeout(() => { const el = document.getElementById('chatInput'); if (el) el.focus(); }, 0); }

// ---------------- form submits ----------------
const FORMS = {
  login: async fd => {
    S.loginUser = fd.get('username');
    set({ busy: true, loginErr: '' });
    try {
      await api('/api/login', { method: 'POST', body: { username: fd.get('username'), password: fd.get('password') } });
      await loadData();
      Object.assign(S, { view: 'admin', page: 'dashboard' });
      readHash();
    } catch (e) { S.loginErr = e.message; }
    set({ busy: false });
    if (S.loginErr) { const p = document.getElementById('loginPass'); if (p) p.focus(); }
  },
  period: async fd => {
    const b = Object.fromEntries(fd.entries());
    b.makeCurrent = !!b.makeCurrent;
    if (S.perEdit) await api('/api/periods/' + S.perEdit, { method: 'PUT', body: b });
    else { await api('/api/periods', { method: 'POST', body: b }); if (b.makeCurrent) S.viewPeriod = S.workPeriod = null; }
    const msg = S.perEdit ? 'บันทึกการแก้ไขรอบแล้ว' : 'เพิ่มรอบการประเมินแล้ว';
    Object.assign(S, { periodsAdmin: null, perEdit: null });
    return msg;
  },
  kpiAdmin: async () => {
    syncKpiEdit();
    const e = S.kpiEdit;
    await api('/api/users/' + e.id + '/kpis', { method: 'PUT', body: { periodId: e.periodId, kpis: e.kpis, comps: e.comps, works: e.works.map(w => ({ id: w.id, status: w.status })) } });
    S.users = null;
    return 'บันทึก KPI และสมรรถนะแล้ว';
  },
  work: async fd => {
    const body = Object.fromEntries(fd.entries());
    if (S.data.kpiOptions.length) {
      body.kpi_links = fd.getAll('kpi_ck').map(id => ({ kpi_id: +id }));
      Object.keys(body).forEach(k => { if (k === 'kpi_ck') delete body[k]; });
    }
    const id = S.modal.id;
    await api(id ? '/api/works/' + id : '/api/works', { method: id ? 'PUT' : 'POST', body });
    return id ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มผลงานแล้ว';
  },
  evidence: async fd => {
    const out = new FormData();
    out.append('work_id', fd.get('work_id') || '');
    out.append('url', fd.get('url') || '');
    out.append('name', fd.get('name') || '');
    S.pendingFiles.forEach(f => out.append('files', f));
    if (!S.pendingFiles.length && !String(fd.get('url') || '').trim()) throw new Error('กรุณาเลือกไฟล์หรือระบุลิงก์');
    const r = await api('/api/evidence', { method: 'POST', body: out });
    return 'เพิ่มหลักฐานแล้ว ' + r.ids.length + ' รายการ';
  },
  profile: async fd => { await api('/api/profile', { method: 'PUT', body: Object.fromEntries(fd.entries()) }); return 'บันทึกข้อมูลส่วนตัวแล้ว'; },
  password: async fd => { await api('/api/password', { method: 'POST', body: { current: fd.get('current'), next: fd.get('next') } }); return 'เปลี่ยนรหัสผ่านแล้ว'; },
  userEdit: async fd => {
    const b = Object.fromEntries(fd.entries());
    const id = b.id; delete b.id;
    if (!b.password) delete b.password;
    b.unlock = !!b.unlock;
    await api('/api/users/' + id, { method: 'PUT', body: b });
    S.users = null;
    return 'บันทึกข้อมูลผู้ใช้แล้ว';
  },
  user: async fd => { await api('/api/users', { method: 'POST', body: Object.fromEntries(fd.entries()) }); S.users = null; return 'เพิ่มผู้ใช้แล้ว'; },
  ai: async fd => {
    const body = { provider: S.aiForm.provider, baseUrl: fd.get('baseUrl'), model: fd.get('model') };
    if (fd.get('clearKey')) body.apiKey = '';
    else if (String(fd.get('apiKey') || '').trim()) body.apiKey = fd.get('apiKey');
    await api('/api/settings/ai', { method: 'PUT', body });
    S.aiForm = null;
    return 'บันทึกการตั้งค่า AI แล้ว';
  }
};

// ---------------- event delegation ----------------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.self && e.target !== el) return; // backdrop: only when clicking outside the dialog
  const fn = A[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});

document.addEventListener('submit', async e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  if (kind === 'login') return FORMS.login(new FormData(form));
  if (S.busy) return;
  set({ busy: true, formErr: '' });
  try {
    const msg = await FORMS[kind](new FormData(form));
    await loadData();
    Object.assign(S, { modal: kind === 'ai' ? S.modal : null, pendingFiles: [] });
    if (msg) toast(msg);
  } catch (err) {
    if (S.modal) S.formErr = err.message; else toast(err.message);
  }
  set({ busy: false });
});

document.addEventListener('input', e => {
  const el = e.target;
  const b = el.dataset && el.dataset.bind;
  if (!b) return;
  const [k, sub] = b.split('.');
  if (sub) S[k][sub] = el.value; else S[k] = el.value;
  if (b === 'search' && S.page === 'dashboard' && el.value) S.page = 'works';
  if (el.dataset.rerender) render();
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'fileInput') { S.pendingFiles.push(...el.files); render(); return; }
  if (el.dataset && el.dataset.change === 'workPeriod') { S.workPeriod = el.value; reloadAfter(Promise.resolve()); return; }
  if (el.dataset && el.dataset.change === 'viewPeriod') { S.viewPeriod = +el.value; reloadAfter(Promise.resolve()); return; }
  if (el.dataset && el.dataset.change === 'kpiEditPeriod') { A.editKpi({ dataset: { id: S.kpiEdit.id, period: el.value } }); return; }
  if (el.id === 'photoFile' && el.files[0]) {
    const f = el.files[0];
    if (f.size > 5 * 1024 * 1024) return toast('รูปใหญ่เกิน 5 MB');
    const fd = new FormData(); fd.append('photo', f);
    set({ photoBusy: true });
    reloadAfter(api('/api/profile/photo', { method: 'POST', body: fd }), 'อัปโหลดรูปถ่ายแล้ว').then(() => set({ photoBusy: false }));
    return;
  }
  if (el.id === 'chatFile') { uploadChatFiles([...el.files]); return; }
  if (el.dataset && el.dataset.change === 'ivKpi') {
    const k = S.data.kpiOptions.find(x => x.id === +el.dataset.id);
    if (el.checked) S.ivKpis[k.id] = 1; else delete S.ivKpis[k.id];
    if (S.ivDone) S.ivAnswers[KPI_Q] = ivKpiNames().join(', ') || '-';
    render(); return;
  }
  if (el.dataset && el.dataset.change === 'evWork') {
    const ev = S.data.evidence.find(x => x.id === +el.dataset.id);
    reloadAfter(api('/api/evidence/' + ev.id, { method: 'PUT', body: { work_id: el.value || null } }), 'เชื่อมโยงหลักฐานแล้ว');
  }
});

document.addEventListener('keydown', e => {
  if (e.target.id === 'chatInput' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  if (e.key === 'Escape') {
    if (S.modal) A.closeModal();
    else if (S.pfEv != null) A.closeEv();
    else if (S.pfDetail != null) A.closePf();
  }
});

// drag & drop evidence files
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => {
  const z = e.target.closest && e.target.closest('[data-drop]');
  if (!z) return;
  e.preventDefault();
  z.classList.add('drop-active');
}));
document.addEventListener('dragleave', e => {
  const z = e.target.closest && e.target.closest('[data-drop]');
  if (z && !z.contains(e.relatedTarget)) z.classList.remove('drop-active');
});
document.addEventListener('drop', e => {
  const z = e.target.closest && e.target.closest('[data-drop]');
  if (!z) return;
  e.preventDefault();
  const files = [...(e.dataTransfer.files || [])];
  if (!files.length) return;
  S.pendingFiles.push(...files);
  if (!S.modal) S.modal = { type: 'evidence' };
  S.formErr = '';
  render();
});

// ---------------- boot ----------------
(async () => {
  try { await loadData(); readHash(); } catch (e) { S.me = null; }
  S.booted = true;
  render();
})();
