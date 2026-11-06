// Suite §9: 8 test bắt buộc game Vẽ Avatar (server cô lập, KHÔNG động live).
// Chạy: node test_ve_avatar_suite.js
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
async function waitFor(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}
async function waitCond(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('Hết giờ chờ: ' + label);
}

async function main() {
  console.log('====================================================================');
  console.log('🧪 SUITE §9: 8 TEST GAME VẼ AVATAR');
  console.log('====================================================================\n');

  // 0. Ràng buộc tĩnh overlay + dashboard + server
  const overlay = fs.readFileSync(path.join(ROOT, 'public', 'overlay.html'), 'utf8');
  const dash = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert(overlay.includes('Tôi vẽ avatar tặng bạn'), 'Overlay phải có tiêu đề tiếng Việt');
  assert(overlay.includes('VẼ AVATAR TRỰC TIẾP'), 'Overlay phải có thương hiệu tiếng Việt');
  assert(!overlay.includes('Let me draw your avatar') && !overlay.includes('PENCIL PRINTS LIVE'), 'Overlay phải xóa chữ tiếng Anh cũ');
  assert((overlay.match(/id="head"/g) || []).length === 1, 'Overlay chỉ có ĐÚNG 1 đầu máy');
  assert(overlay.includes('.frame.t1solo') && overlay.includes('.frame.t5') && overlay.includes('t4halo') && overlay.includes('t5pulse'), 'Overlay phải có mẫu khung 5 bậc');
  assert(overlay.includes('thanksLineHtml') && overlay.includes('id="event-text"'), 'Overlay phải có Thank you bậc 2+ và dải sự kiện trên');
  assert(overlay.includes('/api/tts?text=') && overlay.includes('id="queue-panel"'), 'Overlay phải có voice file server + bảng hàng chờ');
  assert(!overlay.includes('translate_tts'), 'Overlay không được gọi thẳng Google từ trình duyệt');
  assert(srv.includes('/api/tts') && srv.includes('translate_tts') && srv.includes('tts_cache'), 'Server phải proxy Google TTS + cache mp3 kiểu buồng giam');
  assert(!overlay.includes('SUPER VIP') && !overlay.includes('.frame.vip'), 'Overlay phải xóa khung VIP cũ');
  assert(!/added to the draw queue/.test(srv) && !/đang chờ vẽ\./.test(srv), 'Thông báo phải xóa mẫu câu cũ');
  assert(/sắp được vẽ lên giấy/.test(srv) && /đã vào hàng chờ vẽ/.test(srv), 'Thông báo phải đúng văn mới');
  assert(srv.includes('commentKeyword') && srv.includes('commentMatches'), 'Server phải lọc comment theo nội dung cài');
  assert(srv.includes('spamSeconds'), 'Chống spam phải tính bằng giây');
  assert(srv.includes('const PROTO = 6'), 'Server phải có bản giao thức 6');
  assert(srv.includes('locked: !!d.locked'), 'Server phải chuyển tiếp trạng thái khóa tiếng');
  assert(dash.includes('proto-warn'), 'Dashboard phải có banner báo server cũ');
  assert(dash.includes('CHƯA CÓ TIẾNG') && dash.includes('bấm vào trang overlay 1 lần'), 'Dashboard phải hướng dẫn mở khóa tiếng');
  assert(overlay.includes('id="audio-unlock"') && overlay.includes('id="speak-badge"') && overlay.includes('id="tagline"'), 'Overlay phải có nút mở khóa + đèn đọc + dòng phụ trang trí');
  for (const t of ['Thử quà', 'Thử bình luận', 'Thử theo dõi', 'Thử chia sẻ', 'Thử Bậc 5 (khung xịn nhất)', 'Thử 1 xu (bậc 1)', 'Thử 5 xu (bậc 2)', 'Thử 10 xu (bậc 3)', 'Thử 20 xu (bậc 4)', 'Thử 50 xu (bậc 5)', 'Thử giọng overlay', 'test-gift-coins', 'test-gift-qty', 'test-name', 'test-comment', 'set-music', 'set-voice', 'btn-voice-mute', 'toggleVoiceMute', 'set-voice-engine', 'set-comment', 'set-spam', 'st-voice', 'Xóa hàng đợi thử', 'Đặt lại phiên thử', 'Làm mới phiên', 'demo-toggle']) {
    assert(dash.includes(t), `Dashboard phải có: ${t}`);
  }
  console.log('✓ 0. Overlay/dashboard/server đủ thành phần bắt buộc, 1 đầu máy.');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-veav-'));
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
  const post = (p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
  const st = async () => (await (await fetch(`${base}/api/state`)).json());
  const gift = (uid, name, coins, extra = {}) => post('/api/webhook', { triggerTypeId: 3, userId: uid, nickname: name, giftName: 'Hoa hồng', diamondCount: coins, repeatCount: 1, profilePictureUrl: `https://cdn/x/${uid}.jpg`, ...extra });
  const comment = (uid, name, extra = {}) => post('/api/webhook', { triggerTypeId: 11, userId: uid, nickname: name, content: 'hello', profilePictureUrl: `https://cdn/x/${uid}.jpg`, ...extra });
  const follow = (uid, name, extra = {}) => post('/api/webhook', { triggerTypeId: 1, userId: uid, nickname: name, profilePictureUrl: `https://cdn/x/${uid}.jpg`, ...extra });
  const share = (uid, name, extra = {}) => post('/api/webhook', { triggerTypeId: 8, event: 'share', userId: uid, nickname: name, profilePictureUrl: `https://cdn/x/${uid}.jpg`, ...extra });
  const drawnBy = async (uid) => (await st()).drawn.find(e => e.uid === uid);

  try {
    if (!await waitFor(`${base}/api/state`)) throw new Error('Server cô lập phải sẵn sàng');
    await post('/api/settings', { drawSeconds: 5, spamSeconds: 600, minGiftCoins: 1, demoMode: false });

    // 7. Avatar thiếu (chạy đầu để phiên sạch -> cảnh báo rõ)
    await gift('noav_u1', 'Nguoi Khong Avatar', 5, { profilePictureUrl: undefined });
    let s = await st();
    assert.strictEqual(s.avatarWarning, true, 'Thiếu avatar phải bật cảnh báo');
    await waitCond(async () => drawnBy('noav_u1'), 15000, 'khung thiếu avatar vẽ xong');
    assert.strictEqual((await drawnBy('noav_u1')).avatar, null, 'Khung thiếu avatar lưu null (vòng xám + chữ cái)');
    console.log('✓ 7. Thiếu avatar: cảnh báo rõ, khung dự phòng, hàng đợi không kẹt.');
    await post('/api/session/reset', {});

    // 1. Gift
    await gift('gift_u1', 'Nguoi Tang Qua', 10);
    s = await st();
    assert(s.recentNotifies.some(n => n.text === '🎁 Nguoi Tang Qua vừa tặng Hoa hồng — sắp được vẽ lên giấy!'), 'Thông báo gift đúng mẫu');
    await waitCond(async () => drawnBy('gift_u1'), 15000, 'khung gift vẽ xong');
    const g1 = await drawnBy('gift_u1');
    assert.strictEqual(g1.avatar, 'https://cdn/x/gift_u1.jpg', 'Khung dùng đúng avatar thật');
    assert.strictEqual(g1.name, 'Nguoi Tang Qua', 'Tên đọc được');
    assert.strictEqual(g1.tier, 3, 'Quà 10 xu vẽ bậc 3');
    console.log('✓ 1. Gift: vào đợi, thông báo đúng mẫu, vẽ xong, avatar thật.');

    // 2. Comment
    await comment('cmt_u1', 'Nguoi Binh Luan');
    s = await st();
    assert(s.recentNotifies.some(n => n.text === '💬 Nguoi Binh Luan vừa bình luận — đã vào hàng chờ vẽ!'), 'Thông báo comment đúng mẫu');
    await waitCond(async () => drawnBy('cmt_u1'), 15000, 'khung comment vẽ xong');
    console.log('✓ 2. Comment: vào đợi, thông báo đúng mẫu, vẽ xong.');

    // 3. Follow (+ follow lần 2 trong phiên không tạo khung)
    await follow('flw_u1', 'Nguoi Follow');
    s = await st();
    assert(s.recentNotifies.some(n => n.text === '➕ Nguoi Follow vừa theo dõi kênh — cảm ơn bạn nhiều!'), 'Thông báo follow đúng mẫu');
    await waitCond(async () => drawnBy('flw_u1'), 15000, 'khung follow vẽ xong');
    await follow('flw_u1', 'Nguoi Follow');
    await new Promise(r => setTimeout(r, 1500));
    s = await st();
    const flwFrames = s.drawn.filter(e => e.uid === 'flw_u1').length + s.queue.filter(e => e.uid === 'flw_u1').length;
    assert.strictEqual(flwFrames, 1, 'Follow lần 2 trong phiên không tạo khung mới');
    console.log('✓ 3. Follow: vào đợi, vẽ xong, follow lại không tạo khung.');

    // 4. Chống spam: quà + comment liên tiếp = 1 khung, xu vẫn tính VIP
    await gift('spam_u1', 'Nguoi Spam', 20);
    await comment('spam_u1', 'Nguoi Spam');
    await waitCond(async () => drawnBy('spam_u1'), 15000, 'khung spam vẽ xong');
    await new Promise(r => setTimeout(r, 1500));
    s = await st();
    const spamFrames = s.drawn.filter(e => e.uid === 'spam_u1').length + s.queue.filter(e => e.uid === 'spam_u1').length;
    assert.strictEqual(spamFrames, 1, 'Chỉ 1 khung trong thời gian chống spam');
    assert.strictEqual(s.vipTop.find(t => t.uid === 'spam_u1').coins, 20, 'Xu quà vẫn tính VIP');
    assert.strictEqual((await drawnBy('spam_u1')).tier, 4, 'Tổng 20 xu vẽ bậc 4');
    assert(s.logs.filter(l => /Nguoi Spam/.test(l.text)).length >= 2, 'Cả 2 tương tác đều log');
    console.log('✓ 4. Chống spam: 1 khung, xu vẫn tính VIP, đủ log.');

    // 5. Bậc vẽ theo tổng xu tích lũy: 5 -> bậc 2, 10 -> bậc 3, 20 -> bậc 4, 50 -> bậc 5, luôn solo
    await gift('tier2', 'Nguoi Bac Hai', 5);
    await waitCond(async () => drawnBy('tier2'), 15000, 'khung bậc 2 vẽ xong');
    await gift('tier3', 'Nguoi Bac Ba', 10);
    await waitCond(async () => drawnBy('tier3'), 15000, 'khung bậc 3 vẽ xong');
    await gift('tier4', 'Nguoi Bac Bon', 20);
    await waitCond(async () => drawnBy('tier4'), 20000, 'khung bậc 4 vẽ xong');
    await gift('tier5', 'Nguoi Bac Nam', 50);
    await waitCond(async () => drawnBy('tier5'), 30000, 'khung bậc 5 vẽ xong');
    const t2e = await drawnBy('tier2'), t3e = await drawnBy('tier3'), t4e = await drawnBy('tier4'), t5e = await drawnBy('tier5');
    assert.strictEqual(t2e.tier, 2, 'Tổng 5 xu vẽ bậc 2');
    assert.strictEqual(t2e.rowLayout, 't2', 'Bậc 2 layout t2');
    assert.strictEqual(t3e.tier, 3, 'Tổng 10 xu vẽ bậc 3');
    assert.strictEqual(t3e.rowLayout, 't3', 'Bậc 3 layout t3');
    assert.strictEqual(t4e.tier, 4, 'Tổng 20 xu vẽ bậc 4');
    assert.strictEqual(t4e.rowLayout, 't4', 'Bậc 4 layout t4');
    assert.strictEqual(t5e.tier, 5, 'Tổng 50 xu vẽ bậc 5');
    assert.strictEqual(t5e.rowLayout, 't5', 'Bậc 5 layout t5');
    assert.strictEqual(new Set([t2e.rowId, t3e.rowId, t4e.rowId, t5e.rowId]).size, 4, 'Bậc 2/3/4/5 luôn solo 1 người/lượt');
    console.log('✓ 5. Bậc 2/3/4/5 theo mốc 5/10/20/50 xu, luôn solo.');

    // 6. Gom bậc 1 tối đa 4/lượt: 5 người 2 xu -> lưới 2x2 + solo, đúng thứ tự
    await gift('six_block', 'Nguoi Giua May', 10);
    const five = ['fifo1', 'fifo2', 'fifo3', 'fifo4', 'fifo5'];
    for (const u of five) await gift(u, 'Ten ' + u, 2);
    await waitCond(async () => (await st()).drawn.filter(e => five.includes(e.uid)).length === 5, 60000, '5 khung bậc 1 vẽ xong');
    s = await st();
    const order = s.drawn.filter(e => five.includes(e.uid)).map(e => e.uid);
    assert.deepStrictEqual(order, five, 'Đúng thứ tự vào trước vẽ trước, không mất ai');
    const lays = s.drawn.filter(e => five.includes(e.uid)).map(e => e.rowLayout);
    assert.deepStrictEqual(lays, ['t1grid', 't1grid', 't1grid', 't1grid', 't1solo'], 'Gom 4 + 1 bậc 1');
    assert(s.drawn.filter(e => five.includes(e.uid)).every(e => e.tier === 1), 'Cả 5 đều bậc 1');
    console.log('✓ 6. Gom bậc 1: lưới 2x2 + solo, đúng thứ tự.');

    // 8. Reset
    await post('/api/session/reset', {});
    s = await st();
    assert.strictEqual(s.queue.length, 0, 'Reset: hàng đợi trống');
    assert.strictEqual(s.drawn.length, 0, 'Reset: giấy trống');
    assert.strictEqual(s.vipTop.length, 0, 'Reset: tổng VIP về 0');
    console.log('✓ 8. Reset: đợi + giấy + VIP đều trống.');

    // 10. Nút Thử Bậc 5: đúng tên nhập vào, chỉ 1 khung, luôn ra bậc 5 (kể cả bấm lặp)
    await post('/api/settings', { demoMode: true });
    const drawnQid = async (qid) => (await st()).drawn.find(e => String(e.qid) === String(qid));
    let r1 = await post('/api/test/top1', { name: 'Ten Top Mot' });
    assert.strictEqual(r1.name, 'Ten Top Mot', 'Thử bậc 5 phải dùng đúng tên nhập vào');
    s = await st();
    assert.strictEqual(s.drawingRow.length + s.queue.length, 1, 'Thử bậc 5 chỉ tạo đúng 1 khung');
    assert.strictEqual((s.drawingRow[0] || s.queue[0]).name, 'Ten Top Mot', 'Khung phải mang tên đã nhập');
    const q1 = (s.drawingRow[0] || s.queue[0]).qid;
    await waitCond(async () => drawnQid(q1), 15000, 'khung bậc 5 thứ nhất vẽ xong');
    assert.strictEqual((await drawnQid(q1)).tier, 5, 'Thử bậc 5 phải ra tier 5');
    assert.strictEqual((await drawnQid(q1)).rowLayout, 't5', 'Thử bậc 5 phải layout t5');
    let r2 = await post('/api/test/top1', { name: 'Ten Top Hai' });
    assert.strictEqual(r2.name, 'Ten Top Hai', 'Lần 2 cũng dùng đúng tên nhập vào');
    s = await st();
    assert.strictEqual(s.drawingRow.length + s.queue.length, 1, 'Lần 2 cũng chỉ 1 khung');
    const q2 = (s.drawingRow[0] || s.queue[0]).qid;
    await waitCond(async () => drawnQid(q2), 30000, 'khung bậc 5 thứ hai vẽ xong');
    assert.strictEqual((await drawnQid(q2)).tier, 5, 'Bấm lặp vẫn ra bậc 5');
    console.log('✓ 10. Thử Bậc 5: đúng tên nhập, 1 khung, luôn bậc 5.');

    // 11. Ưu tiên bậc cao: bậc 5 in trước bậc 1 dù vào sau
    await post('/api/settings', { demoMode: false }); // test 10 bật chế độ thử, trả về live để webhook chạy
    await post('/api/session/reset', {});
    await gift('pri_a', 'Nguoi Dau', 1);
    await gift('pri_low', 'Nguoi Mot Xu', 1);
    await gift('pri_high', 'Nguoi Nam Muoi', 50);
    await waitCond(async () => (await st()).drawn.length === 3, 60000, '3 khung ưu tiên vẽ xong');
    s = await st();
    assert.deepStrictEqual(s.drawn.map(e => e.uid), ['pri_a', 'pri_high', 'pri_low'], 'Bậc 5 phải in trước bậc 1 vào trước nó');
    assert.deepStrictEqual(s.drawn.map(e => e.tier), [1, 5, 1], 'Bậc từng khung đúng');
    console.log('✓ 11. Ưu tiên bậc cao: bậc 5 in trước bậc 1.');

    // 12. Gom bậc 1 tối đa 4/lượt: 4 người chung 1 lưới 2x2
    await post('/api/session/reset', {});
    await gift('bat_a', 'Nguoi Giua Cho', 10);
    for (const u of ['bat_1', 'bat_2', 'bat_3', 'bat_4']) await gift(u, 'Mot Xu ' + u, 1);
    await waitCond(async () => (await st()).drawn.filter(e => /^bat_[0-9]$/.test(e.uid)).length === 4, 45000, '4 bậc 1 vẽ xong');
    s = await st();
    const batched = s.drawn.filter(e => /^bat_[0-9]$/.test(e.uid));
    assert.strictEqual(new Set(batched.map(e => e.rowId)).size, 1, '4 bậc 1 chung 1 lượt');
    assert(batched.every(e => e.rowLayout === 't1grid'), 'Lưới 2x2 bậc 1');
    assert(batched.every(e => e.tier === 1), 'Cả 4 đều bậc 1');
    assert.deepStrictEqual(batched.map(e => e.uid), ['bat_1', 'bat_2', 'bat_3', 'bat_4'], 'Trong hàng gom giữ đúng thứ tự vào');
    console.log('✓ 12. Gom 4 bậc 1 chung 1 lưới 2x2.');

    // 13. Mốc 1 xu một mình: bậc 1 solo, avatar + tên
    await post('/api/session/reset', {});
    await gift('solo_1', 'Mot Xu Duy Nhat', 1);
    await waitCond(async () => drawnBy('solo_1'), 15000, 'khung 1 xu duy nhất vẽ xong');
    assert.strictEqual((await drawnBy('solo_1')).tier, 1, 'Tổng 1 xu vẽ bậc 1');
    assert.strictEqual((await drawnBy('solo_1')).rowLayout, 't1solo', 'Bậc 1 một mình layout t1solo');
    assert.strictEqual((await drawnBy('solo_1')).name, 'Mot Xu Duy Nhat', 'Bậc 1 in tên');
    console.log('✓ 13. Mốc 1 xu một mình ra bậc 1 solo.');

    // 14. Reset giữa lúc dừng 2s: sạch + server vẫn chạy tiếp bình thường
    await post('/api/session/reset', {});
    await gift('rst_a', 'Nguoi Truoc Reset', 5);
    await waitCond(async () => drawnBy('rst_a'), 15000, 'khung trước reset vẽ xong');
    await new Promise(r => setTimeout(r, 500)); // đang trong 2s dừng
    await post('/api/session/reset', {});
    s = await st();
    assert.strictEqual(s.queue.length, 0, 'Reset giữa dừng: đợi trống');
    assert.strictEqual(s.drawn.length, 0, 'Reset giữa dừng: giấy trống');
    assert.strictEqual(s.drawingRow.length, 0, 'Reset giữa dừng: không kẹt hàng');
    await gift('rst_b', 'Nguoi Sau Reset', 5);
    await waitCond(async () => drawnBy('rst_b'), 15000, 'khung sau reset vẽ xong');
    console.log('✓ 14. Reset giữa lúc dừng 2s: sạch, không kẹt timer.');

    // 15. Share: vào đợi, vẽ bậc 1, share lặp không tạo khung
    await post('/api/session/reset', {});
    await share('shr_u1', 'Nguoi Chia Se');
    s = await st();
    assert(s.recentNotifies.some(n => n.text === '🔁 Nguoi Chia Se vừa chia sẻ live — đã vào hàng chờ vẽ!'), 'Thông báo share đúng mẫu');
    await waitCond(async () => drawnBy('shr_u1'), 15000, 'khung share vẽ xong');
    assert.strictEqual((await drawnBy('shr_u1')).tier, 1, 'Share vẽ bậc 1');
    assert.strictEqual((await drawnBy('shr_u1')).name, 'Nguoi Chia Se', 'Share in tên');
    await share('shr_u1', 'Nguoi Chia Se');
    await new Promise(r => setTimeout(r, 1500));
    s = await st();
    const shrFrames = s.drawn.filter(e => e.uid === 'shr_u1').length + s.queue.filter(e => e.uid === 'shr_u1').length;
    assert.strictEqual(shrFrames, 1, 'Share lặp trong chống spam không tạo khung mới');
    console.log('✓ 15. Share: vào đợi, bậc 1, chống lặp.');

    // 16. Bậc tính lúc tới lượt: 1 xu chờ + 5 xu sau -> in bậc 2
    await post('/api/session/reset', {});
    await gift('cum_a', 'Nguoi Giua May', 10);
    await gift('cum_b', 'Nguoi Len Bac', 1);
    await gift('cum_b', 'Nguoi Len Bac', 5);
    await waitCond(async () => drawnBy('cum_b'), 30000, 'khung lên bậc vẽ xong');
    const cb = await drawnBy('cum_b');
    assert.strictEqual(cb.tier, 2, 'Tổng 6 xu lúc tới lượt phải in bậc 2');
    assert.strictEqual(cb.rowLayout, 't2', 'Bậc 2 layout t2');
    console.log('✓ 16. Bậc tính lúc tới lượt (cộng dồn nhiều món).');

    // 17. Giữ khung theo bậc: sau bậc 4 nghỉ lâu hơn sau bậc 1 (~4s)
    await post('/api/session/reset', {});
    await gift('hld_a', 'Truoc Bac Bon', 1);
    await gift('hld_b', 'Bac Bon', 20);
    await gift('hld_c', 'Sau Bac Bon', 1);
    await waitCond(async () => (await st()).drawn.length === 3, 60000, '3 khung giữ bậc vẽ xong');
    s = await st();
    assert.deepStrictEqual(s.drawn.map(e => e.uid), ['hld_a', 'hld_b', 'hld_c'], 'Thứ tự bậc đúng');
    const [hda, hdb, hdc] = ['hld_a', 'hld_b', 'hld_c'].map(u => s.drawn.find(e => e.uid === u).drawnAt);
    const holdDiff = (hdc - hdb) - (hdb - hda);
    assert(holdDiff > 1500 && holdDiff < 6500, `Giữ bậc 4 lâu hơn bậc 1 ~4s (được ${holdDiff}ms)`);
    console.log('✓ 17. Giữ khung: bậc 4 lâu hơn bậc 1 ~4s.');

    // 19. Comment theo nội dung cài: đúng chữ + đúng kiểu không dấu/không cách mới vào mốc 1
    await post('/api/session/reset', {});
    await post('/api/settings', { commentKeyword: 'vẽ avatar' });
    s = await st();
    assert.strictEqual(s.settings.commentKeyword, 'vẽ avatar', 'Nội dung comment lưu được');
    await comment('kw_exact', 'Nguoi Khop Chu', { content: 'vẽ avatar' });
    await waitCond(async () => drawnBy('kw_exact'), 20000, 'comment đúng chữ vẽ xong');
    assert.strictEqual((await drawnBy('kw_exact')).tier, 1, 'Comment đúng chữ vào mốc 1');
    await comment('kw_norm', 'Nguoi Khong Dau', { content: 'VE  AVATAR' });
    await waitCond(async () => drawnBy('kw_norm'), 20000, 'comment không dấu vẽ xong');
    assert.strictEqual((await drawnBy('kw_norm')).tier, 1, 'Comment không dấu/không cách vào mốc 1');
    await comment('kw_miss', 'Nguoi Lech', { content: 'hello shop' });
    await new Promise(r => setTimeout(r, 1500));
    s = await st();
    assert(!s.drawn.some(e => e.uid === 'kw_miss') && !s.queue.some(e => e.uid === 'kw_miss'), 'Comment lệch không tạo khung');
    assert(s.logs.some(l => /Nguoi Lech/.test(l.text) && /không khớp/.test(l.text)), 'Comment lệch vẫn log rõ lý do');
    await post('/api/settings', { commentKeyword: '' });
    console.log('✓ 19. Comment khớp nội dung (kể cả không dấu) vào mốc 1, lệch thì chỉ log.');

    // 18. Cài đặt âm thanh: nhạc nền + voice lưu và dùng ngay, track lạ bị từ chối
    await post('/api/settings', { bgMusic: 'vui', musicVolume: 70, voiceEnabled: false });
    s = await st();
    assert.strictEqual(s.settings.bgMusic, 'vui', 'Nhạc nền lưu được');
    assert.strictEqual(s.settings.musicVolume, 70, 'Âm lượng lưu được');
    assert.strictEqual(s.settings.voiceEnabled, false, 'Tắt voice lưu được');
    await post('/api/settings', { bgMusic: 'nhac-lau' });
    s = await st();
    assert.strictEqual(s.settings.bgMusic, 'vui', 'Track lạ bị từ chối');
    await post('/api/settings', { voiceEngine: 'google' });
    s = await st();
    assert.strictEqual(s.settings.voiceEngine, 'google', 'Bộ máy giọng lưu được');
    await post('/api/settings', { voiceEngine: 'may-lau' });
    s = await st();
    assert.strictEqual(s.settings.voiceEngine, 'google', 'Bộ máy lạ bị từ chối');
    await post('/api/settings', { bgMusic: 'off', voiceEnabled: true, voiceEngine: 'auto' });
    console.log('✓ 18. Cài đặt nhạc/voice lưu ngay, chặn track lạ.');

    // 20. Thử giọng overlay: endpoint nhận lệnh, state có voiceStatus
    const vt = await post('/api/test/voice', {});
    assert.strictEqual(vt.success, true, 'Lệnh thử giọng được nhận');
    s = await st();
    assert('voiceStatus' in s, 'State phải có voiceStatus');
    console.log('✓ 20. Thử giọng overlay nhận lệnh, state có voiceStatus.');

    // 21. /api/tts kiểu buồng giam: thiếu chữ -> 400; trúng cache -> mp3 (không cần mạng)
    const emptyTts = await fetch(`${base}/api/tts`);
    assert.strictEqual(emptyTts.status, 400, 'Thiếu text phải 400');
    const ttsText = 'Xin chào thử giọng';
    const ttsHash = crypto.createHash('md5').update(ttsText).digest('hex');
    const fakeMp3 = Buffer.from('ID3fake-mp3-bytes');
    fs.mkdirSync(path.join(tmp, 'data', 'tts_cache'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'data', 'tts_cache', `${ttsHash}.mp3`), fakeMp3);
    const cached = await fetch(`${base}/api/tts?text=${encodeURIComponent(ttsText)}`);
    assert.strictEqual(cached.status, 200, 'Trúng cache phải 200');
    assert.strictEqual(cached.headers.get('content-type'), 'audio/mpeg', 'Cache phải trả audio/mpeg');
    assert.deepStrictEqual(Buffer.from(await cached.arrayBuffer()), fakeMp3, 'Cache phải trả đúng bytes file');
    console.log('✓ 21. /api/tts: 400 khi thiếu chữ, trúng cache trả mp3.');

    // 22. Số lượng quà: thông báo đọc "5 Hoa hồng", không đọc xu; 1 món chỉ đọc tên
    await gift('qty_u5', 'Chi Nam', 1, { giftName: 'Hoa hồng', repeatCount: 5 });
    await waitCond(async () => drawnBy('qty_u5'), 20000, 'khung 5 món vẽ xong');
    const q5 = await drawnBy('qty_u5');
    assert.strictEqual(q5.qty, 5, 'Khung lưu số lượng 5');
    s = await st();
    const n5 = s.recentNotifies.map(n => n.text).find(t => t.includes('Chi Nam'));
    assert(n5 && n5.includes('5 Hoa hồng'), `Thông báo đọc số lượng (${n5})`);
    assert(!/xu/.test(n5), `Thông báo không đọc xu (${n5})`);
    await gift('qty_u1', 'Anh Mot', 10, { giftName: 'Heo may mắn' });
    await waitCond(async () => drawnBy('qty_u1'), 20000, 'khung 1 món vẽ xong');
    s = await st();
    const n1 = s.recentNotifies.map(n => n.text).find(t => t.includes('Anh Mot'));
    assert(n1 && n1.includes('Heo may mắn') && !n1.includes('1 Heo'), `1 món chỉ đọc tên (${n1})`);
    console.log('✓ 22. Thông báo đọc tên quà + số lượng, không xu.');

    // 23. Khung thả tim sau khi đã tặng quà to: về mốc 1, không ăn theo tổng xu cũ
    await post('/api/session/reset', {});
    await post('/api/settings', { spamSeconds: 1 });
    await gift('hightap_u', 'Nguoi Tang To', 50);
    await waitCond(async () => drawnBy('hightap_u'), 20000, 'khung quà 50 vẽ xong');
    assert.strictEqual((await drawnBy('hightap_u')).tier, 5, 'Quà 50 xu vẽ bậc 5');
    await post('/api/webhook', { triggerTypeId: 7, userId: 'hightap_u', nickname: 'Nguoi Tang To', likeCount: 20 });
    await waitCond(async () => (await st()).drawn.filter(e => e.uid === 'hightap_u').length === 2, 40000, 'khung tap vẽ xong');
    s = await st();
    const tapFrame = s.drawn.filter(e => e.uid === 'hightap_u')[1];
    assert.strictEqual(tapFrame.kind, 'tap', 'Khung thứ hai là thả tim');
    assert.strictEqual(tapFrame.tier, 1, 'Thả tim sau quà to phải về bậc 1');
    console.log('✓ 23. Thả tim sau quà to về mốc 1.');

    // 24. Nâng mốc giữa lúc đang vẽ: quà 1 đang vẽ dở + quà 10 -> thêm 1 khung mốc mới;
    // quà thêm cùng mốc thì không tách khung
    await post('/api/session/reset', {});
    await gift('upg_u', 'Nguoi Nang Moc', 1);
    await waitCond(async () => (await st()).drawingRow.some(e => e.uid === 'upg_u'), 10000, 'khung 1 bắt đầu vẽ');
    await gift('upg_u', 'Nguoi Nang Moc', 10); // tổng 11 -> mốc 3, phải xếp thêm khung mới
    await waitCond(async () => (await st()).drawn.filter(e => e.uid === 'upg_u').length === 2, 40000, 'cả 2 khung vẽ xong');
    s = await st();
    const upgFrames = s.drawn.filter(e => e.uid === 'upg_u');
    assert.strictEqual(upgFrames[0].tier, 1, 'Khung đầu vẫn mốc 1');
    assert.strictEqual(upgFrames[1].tier, 3, 'Khung nâng mốc phải vẽ mốc 3');
    await gift('upg_same', 'Nguoi Khong Nang', 1);
    await waitCond(async () => (await st()).drawingRow.some(e => e.uid === 'upg_same'), 20000, 'khung cùng mốc bắt đầu vẽ');
    await gift('upg_same', 'Nguoi Khong Nang', 1); // tổng 2, vẫn mốc 1 -> không thêm khung
    await waitCond(async () => drawnBy('upg_same'), 20000, 'khung cùng mốc vẽ xong');
    await new Promise(r => setTimeout(r, 1500));
    s = await st();
    assert.strictEqual(s.drawn.filter(e => e.uid === 'upg_same').length + s.queue.filter(e => e.uid === 'upg_same').length, 1, 'Quà cùng mốc không tách thêm khung');
    console.log('✓ 24. Nâng mốc giữa lúc đang vẽ xếp thêm khung mới.');

    assert(!/ReferenceError|TypeError|SyntaxError/.test(out), 'Không được có lỗi runtime');
    console.log('✓ 9. Không có lỗi runtime.');
  } finally {
    server.kill('SIGKILL');
    await new Promise(r => setTimeout(r, 500));
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('\n====================================================================');
  console.log('🎉 CẢ 8 TEST §9 ĐẠT CHUẨN!');
  console.log('====================================================================');
}

main().catch(err => {
  console.error('❌ Thất bại:', err.message);
  process.exit(1);
});
