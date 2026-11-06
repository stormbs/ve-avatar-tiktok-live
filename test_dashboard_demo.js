// Demo tự động trên dashboard: dữ liệu có sẵn, bấm ▶ là chạy, không hỏi tên.
// Chạy: node test_dashboard_demo.js (~40s)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = __dirname;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

function dashTestHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const client = fs.readFileSync(path.join(ROOT, 'node_modules', 'socket.io', 'client-dist', 'socket.io.js'), 'utf8');
  const tag = '<script src="/socket.io/socket.io.js"></script>';
  assert(html.includes(tag), 'Dashboard phải tải socket.io client');
  return html.split(tag).join('<script>/*socket.io client that*/\n' + client + '\n</script>');
}

async function main() {
  console.log('====================================================================');
  console.log('🧪 DEMO TỰ ĐỘNG DASHBOARD (jsdom + server cô lập)');
  console.log('====================================================================\n');

  // 0. Tĩnh: đủ nút + kịch bản có sẵn
  const dash = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  assert(dash.includes('id="btn-demo-auto"'), 'Phải có nút Demo tự động');
  assert(dash.includes('/api/tts?text='), 'Nút thử giọng phải tự phát tiếng ngay trên dashboard');
  assert(dash.includes('runAutoDemo'), 'Phải có hàm runAutoDemo');
  assert(dash.includes('DEMO_SCRIPT'), 'Phải có kịch bản dữ liệu sẵn');
  for (const n of ['Anh Tho', 'Be Bon', 'Chi Bay', 'Chu Tu', 'Co Nam', 'Bac Sau', 'Em Ut']) {
    assert(dash.includes(n), `Kịch bản phải có sẵn tên ${n}`);
  }
  console.log('✓ 0. Đủ nút + kịch bản 8 lượt có sẵn.');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-veav-demo-'));
  fs.cpSync(path.join(ROOT, 'server.js'), path.join(tmp, 'server.js'));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.symlinkSync(path.join(ROOT, 'public'), path.join(tmp, 'public'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const server = spawn('node', ['server.js'], { cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PORT: String(port) } });
  server.stdout.on('data', () => {});
  let serverErr = '';
  server.stderr.on('data', d => { serverErr += d.toString(); });
  const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
  const st = async () => (await (await fetch(`${base}/api/state`)).json());
  async function waitCond(fn, timeoutMs, label) {
    const t0 = Date.now();
    let last;
    while (Date.now() - t0 < timeoutMs) { last = await fn(); if (last) return last; await sleep(200); }
    throw new Error('Hết giờ chờ: ' + label);
  }

  const dialogs = [], alerts = [];
  let confirmAnswer = false;
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => console.log('[page-error]', e.message));
  let dom;
  try {
    await waitCond(async () => { try { const r = await fetch(`${base}/api/state`); return r.ok || null; } catch (e) { return null; } }, 20000, 'server lên');
    // Vẽ chậm 10s để cả 8 lượt nạp xong trước khi khung đầu vẽ xong (xác định)
    await post('/api/settings', { demoMode: true, drawSeconds: 10 });
    await post('/api/session/reset', {});
    dom = new JSDOM(dashTestHtml(), {
      url: base + '/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(window) {
        window.fetch = (u, o) => globalThis.fetch(new URL(u, base + '/'), o);
        window.confirm = (msg) => { dialogs.push('confirm:' + msg); return confirmAnswer; };
        window.alert = (msg) => { alerts.push(msg); };
        window.prompt = () => { dialogs.push('prompt'); return null; };
      }
    });
    const doc = dom.window.document;
    await waitCond(() => doc.getElementById('queue-body') && doc.getElementById('queue-body').textContent.includes('Trống') || null, 10000, 'dashboard render');
    await sleep(500);

    // 1. Phiên sạch: bấm ▶ chạy ngay, không hỏi gì, nạp đủ 8 lượt đúng thứ tự
    console.log('--- bấm ▶ Demo tự động trên phiên sạch ---');
    doc.getElementById('btn-demo-auto').click();
    const snap = await waitCond(async () => {
      const s = await st();
      return (s.queue.length === 7 && s.drawingRow.length === 1 && s.drawingRow[0].name === 'Anh Tho') ? s : null;
    }, 25000, 'nạp đủ 8 lượt');
    assert.deepStrictEqual(snap.queue.map(e => e.name),
      ['Nguoi Top 1', 'Chu Tu', 'Bac Sau', 'Be Bon', 'Chi Bay', 'Co Nam', 'Em Ut'],
      'Hàng đợi phải đúng thứ tự ưu tiên (xu cao trước, bằng xu vào trước trước)');
    assert.strictEqual(snap.vipTop[0].name, 'Nguoi Top 1', 'Top 1 phải là người VIP 500 xu');
    assert.strictEqual(snap.vipTop[0].coins, 500, 'Top 1 phải có 500 xu');
    await waitCond(() => doc.getElementById('demo-status').textContent.includes('đã nạp xong 8') || null, 20000, 'demo báo xong');
    assert.strictEqual(dialogs.length, 0, `Phiên sạch không được hỏi gì (có ${dialogs.join('|')})`);
    assert.strictEqual(alerts.length, 0, `Không được báo lỗi (có ${alerts.join('|')})`);
    console.log('✓ 1. Một nút ▶ nạp đủ 8 lượt đúng thứ tự ưu tiên, không hỏi, không lỗi.');

    // 2. Phiên bẩn: hỏi xác nhận làm mới; từ chối thì không chạy, đồng ý thì chạy lại
    console.log('--- bấm ▶ trên phiên bẩn: từ chối rồi đồng ý ---');
    dialogs.length = 0;
    confirmAnswer = false;
    doc.getElementById('btn-demo-auto').click();
    await waitCond(() => dialogs.length > 0 || null, 10000, 'hộp xác nhận hiện ra');
    await sleep(600);
    assert(dialogs.some(d => d.startsWith('confirm:')), 'Phiên bẩn phải hỏi xác nhận làm mới');
    const stillThere = await st();
    assert((stillThere.queue.length + stillThere.drawingRow.length) > 0, 'Từ chối thì phiên cũ phải còn nguyên');
    assert(!doc.getElementById('demo-status').textContent.includes('Chạy thử 1/'), 'Từ chối thì demo không chạy');
    console.log('✓ 2a. Từ chối làm mới: phiên cũ còn nguyên, demo không chạy.');
    confirmAnswer = true;
    doc.getElementById('btn-demo-auto').click();
    // Chờ run MỚI thực sự bắt đầu (tránh đọc status cũ của lần trước), rồi chờ xong
    await waitCond(() => dom.window.eval('demoRunning') === true || null, 10000, 'demo mới bắt đầu chạy');
    await waitCond(() => dom.window.eval('demoRunning') === false || null, 25000, 'demo chạy lại xong');
    assert(doc.getElementById('demo-status').textContent.includes('đã nạp xong 8'), 'Demo mới phải báo nạp xong');
    const snap2 = await st();
    const names2 = snap2.drawingRow.map(e => e.name).concat(snap2.queue.map(e => e.name)).concat((snap2.drawn || []).map(e => e.name));
    assert(names2.includes('Anh Tho'), 'Đồng ý thì demo phải chạy lại từ đầu');
    console.log('✓ 2b. Đồng ý làm mới: demo chạy lại từ đầu.');
  } finally {
    try { if (dom) dom.window.close(); } catch (e) {}
    server.kill('SIGKILL');
  }
  assert(!/ReferenceError|TypeError|SyntaxError/.test(serverErr), 'Server không lỗi runtime: ' + serverErr.slice(0, 200));

  console.log('\n====================================================================');
  console.log('🎉 DEMO TỰ ĐỘNG ĐẠT CHUẨN!');
  console.log('====================================================================');
}

main().catch(err => {
  console.error('❌ Thất bại:', err.message);
  process.exit(1);
});
