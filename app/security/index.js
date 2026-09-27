// สแกนความปลอดภัย 3 แหล่ง แล้วเก็บผลรวมไว้ใน settings (key 'security_scan') ให้หน้า admin แสดงเปรียบเทียบ
//   1) Snyk CLI — ช่องโหว่ใน dependencies (snyk test) + ซอร์สโค้ด (snyk code test)
//   2) DeepSeek — ส่งซอร์สโค้ดให้ LLM ตรวจแบบ manual review
//   3) Claude — ผลรีวิว manual ที่บันทึกไว้ใน claude-review.json (ไม่ได้รันใหม่ตอนกดสแกน)
// ตั้งค่าใน .env: SNYK_TOKEN, SNYK_ORG (ไม่บังคับ), DEEPSEEK_API_KEY, DEEPSEEK_MODEL (ไม่บังคับ)
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CATEGORIES = {
  secrets: 'ข้อมูลลับฝังในโค้ด', auth: 'การยืนยันตัวตน', session: 'Session', csrf: 'CSRF', xss: 'XSS',
  injection: 'Injection (SQL/Command)', 'path-traversal': 'Path Traversal', 'file-upload': 'การอัปโหลด/ให้บริการไฟล์',
  'access-control': 'การควบคุมสิทธิ์ (IDOR)', ssrf: 'SSRF', dos: 'DoS / Rate limit', headers: 'Security headers',
  crypto: 'การเข้ารหัส/Hash', 'info-leak': 'ข้อมูลรั่วไหล', 'ai-prompt': 'Prompt injection / AI', config: 'ค่าเริ่มต้น/การตั้งค่า',
  logging: 'Log และการตรวจสอบย้อนหลัง', dependency: 'Dependencies'
};
const SEV = ['critical', 'high', 'medium', 'low', 'info'];
const normSev = s => {
  s = String(s || '').toLowerCase();
  if (s === 'error') return 'high';
  if (s === 'warning') return 'medium';
  if (s === 'note') return 'low';
  return SEV.includes(s) ? s : 'info';
};
const normCat = c => (CATEGORIES[c] ? c : 'config');

// ---------- Snyk ----------
const SNYK_RULE_CAT = [
  [/Secret|Credential|Password/i, 'secrets'], [/PT$|PathTraversal/i, 'path-traversal'], [/XSS/i, 'xss'],
  [/Csrf/i, 'csrf'], [/PoweredBy|Header|Helmet|Cookie/i, 'headers'], [/Hash|Crypto|Random/i, 'crypto'],
  [/Sqli|Injection|Command/i, 'injection'], [/Ssrf/i, 'ssrf'], [/Redos|DOS|RateLimit/i, 'dos'], [/Redirect/i, 'access-control']
];
const snykCat = rule => (SNYK_RULE_CAT.find(([re]) => re.test(rule)) || [0, 'config'])[1];

function runSnyk(args) {
  const win = process.platform === 'win32';
  return new Promise(resolve => {
    // Windows เรียก .cmd ได้ผ่าน shell เท่านั้น — ส่งเป็นคำสั่งเดียว (args เป็นค่าคงที่/มาจาก .env)
    const cmd = ['npx', '-y', 'snyk', ...args];
    execFile(win ? cmd.join(' ') : cmd[0], win ? [] : cmd.slice(1), {
      cwd: ROOT, shell: win, timeout: 5 * 60 * 1000, maxBuffer: 50 * 1024 * 1024,
      env: { ...process.env, SNYK_TOKEN: process.env.SNYK_TOKEN }
    }, (err, stdout, stderr) => {
      // exit 1 = พบช่องโหว่ (ไม่ใช่ error) — อ่าน JSON จาก stdout ทุกกรณี
      try { resolve(JSON.parse(stdout)); } catch (e) { resolve({ ok: false, error: (stderr || (err && err.message) || 'snyk ไม่ตอบกลับ').trim().slice(0, 500) }); }
    });
  });
}

// Network/TLS hiccups (e.g. Windows failing to build the cert chain in time) are usually transient — retry them
const NET_ERR = /x509|certificate|tls|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|timeout|connection reset/i;
async function runSnykRetry(args, ok) {
  let r;
  for (let i = 0; i < 3; i++) {
    r = await runSnyk(args);
    if (ok(r) || !NET_ERR.test(String(r.error || ''))) return r;
    await new Promise(res => setTimeout(res, 3000 * (i + 1)));
  }
  r.error = String(r.error) + ' (ลองใหม่ 3 ครั้งแล้ว — ตรวจการเชื่อมต่ออินเทอร์เน็ต/proxy/เวลาเครื่อง หรือถ้าเครือข่ายตรวจ HTTPS ให้ตั้ง NODE_EXTRA_CA_CERTS ชี้ไปที่ไฟล์ CA ขององค์กรใน .env)';
  return r;
}

async function scanSnyk() {
  if (!process.env.SNYK_TOKEN) return { ok: false, error: 'ยังไม่ได้ตั้ง SNYK_TOKEN ใน .env', findings: [] };
  const org = process.env.SNYK_ORG ? ['--org=' + process.env.SNYK_ORG] : [];
  const [oss, code] = await Promise.all([
    runSnykRetry(['test', '--json', ...org], r => Array.isArray(r.vulnerabilities)),
    runSnykRetry(['code', 'test', '--json', ...org], r => !!r.runs)
  ]);
  const findings = [];
  const errors = [];

  if (Array.isArray(oss.vulnerabilities)) {
    const seen = new Set();
    for (const v of oss.vulnerabilities) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      findings.push({
        id: v.id, source: 'oss', category: 'dependency', severity: normSev(v.severity), title: v.title,
        file: 'package-lock.json', line: null, detail: v.packageName + '@' + v.version + ' (ผ่าน ' + (v.from || []).slice(1).join(' › ') + ')',
        fix: v.fixedIn && v.fixedIn.length ? 'อัปเกรดเป็น ' + v.fixedIn.join(' / ') : ''
      });
    }
  } else errors.push('snyk test: ' + (oss.error || 'อ่านผลไม่ได้'));

  if (code.runs) {
    const run = code.runs[0];
    const rules = Object.fromEntries((run.tool.driver.rules || []).map(r => [r.id, r]));
    for (const r of run.results || []) {
      const loc = r.locations[0].physicalLocation;
      const rule = rules[r.ruleId] || {};
      findings.push({
        id: r.ruleId, source: 'code', category: snykCat(r.ruleId), severity: normSev(r.level),
        title: (rule.shortDescription && rule.shortDescription.text) || r.ruleId,
        file: loc.artifactLocation.uri, line: loc.region.startLine, detail: r.message.text, fix: ''
      });
    }
  } else errors.push('snyk code test: ' + (code.error || 'อ่านผลไม่ได้'));

  return {
    ok: !errors.length, error: errors.join(' · '), findings,
    meta: { dependencies: oss.dependencyCount || null, org: oss.org || process.env.SNYK_ORG || '' }
  };
}

// ---------- DeepSeek ----------
const REVIEW_FILES = ['server.js', 'db/index.js', 'db/schema.sql', 'db/seed.js', 'public/app.js', 'public/index.html', 'deploy/auto-update.sh'];

async function scanDeepSeek() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { ok: false, error: 'ยังไม่ได้ตั้ง DEEPSEEK_API_KEY ใน .env', findings: [] };
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
  const code = REVIEW_FILES.map(f => {
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
    return '===== FILE: ' + f + ' =====\n' + lines.map((l, i) => (i + 1) + ': ' + l).join('\n');
  }).join('\n\n');
  const system = 'You are a senior application security engineer doing a manual security code review of a Node.js/Express + PostgreSQL web app ' +
    '(session auth, CSRF synchronizer token, multer uploads, vanilla-JS SPA that renders with innerHTML and an esc() helper, an AI proxy). ' +
    'Report only real, specific, exploitable or clearly risky issues with exact file and line numbers from the numbered source. Do not report issues that the code already mitigates. ' +
    'Reply with JSON only: {"findings":[{"title":"","severity":"critical|high|medium|low","category":"' + Object.keys(CATEGORIES).join('|') +
    '","file":"","line":0,"detail":"","fix":""}]}. Write title, detail and fix in Thai.';
  let r;
  try {
    r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model, temperature: 0, max_tokens: 8000, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: code }]
      }),
      signal: AbortSignal.timeout(5 * 60 * 1000)
    });
  } catch (e) {
    return { ok: false, error: 'ติดต่อ DeepSeek ไม่ได้ (' + (e.name === 'TimeoutError' ? 'หมดเวลา 5 นาที' : (e.cause && e.cause.code) || e.message) + ')', findings: [] };
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: 'DeepSeek: ' + ((j.error && j.error.message) || 'HTTP ' + r.status), findings: [] };
  let out;
  try { out = JSON.parse(j.choices[0].message.content); } catch (e) { return { ok: false, error: 'DeepSeek ตอบกลับไม่ใช่ JSON', findings: [] }; }
  const s = v => String(v == null ? '' : v).slice(0, 1500);
  const findings = (Array.isArray(out.findings) ? out.findings : []).slice(0, 100).map((f, n) => ({
    id: 'DS-' + (n + 1), category: normCat(f.category), severity: normSev(f.severity), title: s(f.title),
    file: s(f.file), line: Number(f.line) || null, detail: s(f.detail), fix: s(f.fix)
  }));
  return { ok: true, error: '', findings, meta: { model: j.model || model, tokens: j.usage ? j.usage.total_tokens : null } };
}

// ---------- Claude (ผลรีวิวที่บันทึกไว้) ----------
function claudeReview() {
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'claude-review.json'), 'utf8'));
  return { ok: true, error: '', findings: r.findings.map(f => ({ ...f, severity: normSev(f.severity), category: normCat(f.category) })), snykVerdicts: r.snykVerdicts || {}, meta: { reviewedAt: r.reviewedAt, model: r.model } };
}

// ---------- รันทั้งหมด ----------
let running = null;
async function runScan(save) {
  if (running) return running;
  running = (async () => {
    const startedAt = new Date().toISOString();
    const [snyk, deepseek] = await Promise.all([
      scanSnyk().catch(e => ({ ok: false, error: e.message, findings: [] })),
      scanDeepSeek().catch(e => ({ ok: false, error: e.message, findings: [] }))
    ]);
    let claude;
    try { claude = claudeReview(); } catch (e) { claude = { ok: false, error: 'อ่าน claude-review.json ไม่ได้: ' + e.message, findings: [] }; }
    const result = { startedAt, finishedAt: new Date().toISOString(), snyk, deepseek, claude };
    await save(result);
    return result;
  })().finally(() => { running = null; });
  return running;
}

module.exports = { runScan, isRunning: () => !!running, CATEGORIES };
