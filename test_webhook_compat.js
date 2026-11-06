// Tương thích webhook TikFinity: server phải đọc được body KHÔNG phải JSON chuẩn
// (form-urlencoded, text/plain chứa JSON) và phải log chẩn đoán khi không nhận diện được.
// Chạy: node test_webhook_compat.js [ROOT khác để test bản cũ: ROOT=/path node test_webhook_compat.js]
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = process.env.ROOT || __dirname;
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  console.log('====================================================================');
  console.log('🧪 WEBHOOK COMPAT: body form/text/plain + log chẩn đoán');
  console.log('  ROOT = ' + ROOT);
  console.log('====================================================================\n');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-webhook-'));
  fs.cpSync(path.join(ROOT, 'server.js'), path.join(tmp, 'server.js'));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(tmp, 'node_modules'));
  fs.symlinkSync(path.join(ROOT, 'public'), path.join(tmp, 'public'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const port = await freePort();
  const base = `http://localhost:${port}`;
  const server = spawn('node', ['server.js'], {
    cwd: tmp, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(port) }
  });
  let out = '';
  server.stdout.on('data', d => { out += d.toString(); });
  server.stderr.on('data', d => { out += d.toString(); });
  const postJson = (p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const postRaw = (p, raw, ctype) => fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': ctype }, body: raw }).then(r => r.json());
  const st = async () => (await (await fetch(`${base}/api/state`)).json());
  const hasUid = async (uid) => {
    const s = await st();
    return s.queue.some(e => e.uid === uid) || (s.drawingRow || []).some(e => e.uid === uid) || s.drawn.some(e => e.uid === uid);
  };

  try {
    if (!await waitFor(`${base}/api/state`)) throw new Error('Server cô lập phải sẵn sàng');
    await postJson('/api/settings', { drawSeconds: 5, spamSeconds: 600, minGiftCoins: 1, demoMode: false, commentKeyword: '' });

    // 1. Form-urlencoded: quà vẫn vào đợi (TikFinity gửi sai content-type cũng phải đọc được)
    const r1 = await postRaw('/api/webhook',
      'triggerTypeId=3&userId=u_form&nickname=Ban+Form&giftName=Hoa+hong&diamondCount=10',
      'application/x-www-form-urlencoded');
    assert.strictEqual(r1.kind, 'gift', 'Form phải nhận diện là gift, được: ' + r1.kind);
    assert.strictEqual(r1.queued, true, 'Form gift phải vào đợi');
    assert(await hasUid('u_form'), 'Form gift phải có trong hàng đợi/đang vẽ');
    console.log('✓ 1. Form-urlencoded gift vào đợi.');

    // 2. Text/plain chứa chuỗi JSON: quà vẫn vào đợi
    const r2 = await postRaw('/api/webhook',
      JSON.stringify({ triggerTypeId: 3, userId: 'u_text', nickname: 'Ban Text', giftName: 'Hoa hồng', diamondCount: 5 }),
      'text/plain');
    assert.strictEqual(r2.kind, 'gift', 'Text JSON phải nhận diện là gift, được: ' + r2.kind);
    assert.strictEqual(r2.queued, true, 'Text gift phải vào đợi');
    assert(await hasUid('u_text'), 'Text gift phải có trong hàng đợi/đang vẽ');
    console.log('✓ 2. Text/plain JSON gift vào đợi.');

    // 3. Body lạ/trống: không crash + có log chẩn đoán ghi content-type và raw
    const r3 = await postJson('/api/webhook', { foo: 'bar' });
    assert.strictEqual(r3.queued, false, 'Body lạ không được vào đợi');
    const s3 = await st();
    const diag = s3.logs.find(l => /Webhook chưa nhận diện/.test(l.text));
    assert(diag, 'Phải có log chẩn đoán "Webhook chưa nhận diện"');
    assert(/content-type=/.test(diag.text), 'Log chẩn đoán phải ghi content-type: ' + diag.text);
    console.log('✓ 3. Body lạ: bỏ qua + log chẩn đoán.');

    // 4. Hồi quy: comment chứa chữ "like" vẫn là comment, không thành thả tim
    const r4 = await postJson('/api/webhook', { triggerTypeId: 11, userId: 'c_like', nickname: 'Thich Like', content: 'i like this live' });
    assert.strictEqual(r4.kind, 'comment', 'Comment chứa "like" phải là comment, được: ' + r4.kind);
    assert.strictEqual(r4.queued, true, 'Comment phải vào đợi');
    console.log('✓ 4. Comment chứa "like" vẫn là comment.');

    assert(!/ReferenceError|TypeError|SyntaxError/.test(out), 'Không được có lỗi runtime');
    console.log('✓ 5. Không có lỗi runtime.');
  } finally {
    server.kill('SIGKILL');
    await new Promise(r => setTimeout(r, 500));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('\n====================================================================');
  console.log('🎉 WEBHOOK COMPAT ĐẠT CHUẨN!');
  console.log('====================================================================');
}

main().catch(err => {
  console.error('❌ Thất bại:', err.message);
  process.exit(1);
});
