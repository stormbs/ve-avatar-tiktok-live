// Hồi quy DOM overlay gantry (jsdom + server cô lập), đúng video1:
// ray chạy dọc xuống lúc in rồi về đỉnh, đầu quét ngang, giấy đứng yên lúc in
// rồi tiến 1 nhịp, hiện nội dung theo mép ray, tên viết theo X đầu máy,
// hàng đôi/VIP, 1 node duy nhất, resync giữa chừng không mất.
// Chạy: node test_overlay_dom.js (~60s)
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

function overlayTestHtml() {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'overlay.html'), 'utf8');
  const client = fs.readFileSync(path.join(ROOT, 'node_modules', 'socket.io', 'client-dist', 'socket.io.js'), 'utf8');
  const tag = '<script src="/socket.io/socket.io.js"></script>';
  assert(html.includes(tag), 'Overlay phải tải socket.io client');
  return html.split(tag).join('<script>/*socket.io client that*/\n' + client + '\n</script>');
}
function maskPct(mask) {
  if (!mask) return null;
  if (mask === 'none') return 100;
  const stops = [...mask.matchAll(/(?:#000|rgb\(0,\s*0,\s*0\))\s*([\d.]+)%/g)].map(x => parseFloat(x[1]));
  if (!stops.length) return 0;
  return stops[stops.length - 1];
}
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };

async function main() {
  console.log('====================================================================');
  console.log('🧪 HỒI QUY DOM GANTRY (jsdom + server cô lập)');
  console.log('====================================================================\n');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-veav-gan-'));
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
    while (Date.now() - t0 < timeoutMs) { if (await fn()) return; await sleep(200); }
    throw new Error('Hết giờ chờ: ' + label);
  }

  const vc = new VirtualConsole();
  vc.on('jsdomError', e => console.log('[page-error]', e.message));
  let dom, dom2;
  const finishAll = async () => {
    await waitCond(async () => { const s = await st(); return !s.drawingRow.length && !s.queue.length; }, 60000, 'in xong hết');
  };
  try {
    await waitCond(async () => { try { const r = await fetch(`${base}/api/state`); return r.ok || null; } catch (e) { return null; } }, 20000, 'server lên');
    await post('/api/settings', { demoMode: true, drawSeconds: 5 });
    await post('/api/session/reset', {});
    dom = new JSDOM(overlayTestHtml(), {
      url: base + '/overlay.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
    });
    const doc = dom.window.document;
    const sample = () => {
      const bar = doc.getElementById('bar');
      const mb = /translateY\((-?[\d.]+)px\)/.exec(bar.style.transform || '');
      const head = doc.getElementById('head');
      const strip = doc.getElementById('strip');
      const ms = /translateY\((-?[\d.]+)px\)/.exec(strip.style.transform || '');
      const sY = ms ? parseFloat(ms[1]) : 0;
      const eventEl = doc.getElementById('event-text');
      return {
        railY: mb ? parseFloat(mb[1]) : null,
        headX: num(head.style.left),
        stripY: sY,
        eventTop: eventEl ? eventEl.textContent : '',
        eventShown: eventEl ? eventEl.style.opacity === '1' : false,
        rows: [...doc.querySelectorAll('#rows .row')].map(f => {
          const top = num(f.style.top);
          return {
            rowId: f.getAttribute('data-row'),
            prog: num(f.getAttribute('data-progress')),
            mask: maskPct(f.style.maskImage || f.style.webkitMaskImage || ''),
            top: top,
            screenTop: top === null ? null : top + sY,
            frames: [...f.querySelectorAll('.frame')].map(g => ({
              qid: g.getAttribute('data-qid'),
              name: (g.querySelector('.nm') || {}).textContent || '?',
              cls: g.className,
              nmClip: (g.querySelector('.nm') || { style: {} }).style.clipPath || '',
              nmVis: (g.querySelector('.nm') || { style: {} }).style.visibility || ''
            }))
          };
        })
      };
    };
    // Quan sát tháo/gắn node hàng
    const removedRows = [];
    const obs = new dom.window.MutationObserver(muts => {
      for (const mu of muts) for (const n of mu.removedNodes) {
        if (n && n.getAttribute && n.classList && n.classList.contains('row')) removedRows.push(n.getAttribute('data-row'));
      }
    });
    obs.observe(doc.getElementById('rows'), { childList: true });

    // ---- Trang trí + mở khóa tiếng: phần tử phải có, không mảng đen ----
    const tagline = doc.getElementById('tagline');
    assert(tagline && tagline.textContent.includes('Mỗi tương tác'), 'Có dòng phụ trang trí đầu trang');
    assert(doc.getElementById('audio-unlock'), 'Có nút mở khóa tiếng overlay');
    assert(doc.getElementById('speak-badge'), 'Có đèn báo đang đọc');
    const cssAll = fs.readFileSync(path.join(ROOT, 'public', 'overlay.html'), 'utf8');
    const topRule = cssAll.match(/#topband \{[\s\S]*?\}/)[0];
    const curlRule = cssAll.match(/#curlbed \{[\s\S]*?\}/)[0];
    const topBg = (topRule.match(/background:[^;]+/g) || []).join(';');
    const curlBg = (curlRule.match(/background:[^;]+/g) || []).join(';');
    assert(!/#000|rgba\(0,\s*0,\s*0/.test(topBg), 'Nền đầu trang không còn đen xì');
    assert(!/#000|rgba\(0,\s*0,\s*0/.test(curlBg), 'Nền cuối giấy không còn hiệu ứng đen dần');
    dom.window.dispatchEvent(new dom.window.Event('pointerdown'));
    await sleep(100);
    console.log('--- trang trí + mở khóa tiếng OK ---');

    // ---- Hàng 1: gift A 10 xu -> bậc 3 solo, lấy mẫu suốt lượt in ----
    console.log('--- gift A: hàng bậc 3 solo, lấy mẫu suốt lượt in ---');
    const t0 = Date.now();
    await post('/api/test/gift', { name: 'Anh Tho' });
    await waitCond(() => sample().rows.length > 0 || null, 5000, 'hàng A xuất hiện');
    const firstA = sample().rows[0];
    assert(firstA.mask < 8, `Hàng mới gần như trắng lúc vào (mask=${firstA.mask})`);
    assert(Math.abs(firstA.mask - firstA.prog * 100) < 8, `Hiện theo đúng ray, không lộ trước (mask=${firstA.mask}, prog=${firstA.prog})`);
    assert(firstA.frames[0].nmVis === '' || firstA.frames[0].nmVis === 'hidden', 'Tên chưa lộ lúc vào');
    console.log(`✓ 1. Hàng mới ẩn kín lúc vào (t=${Date.now() - t0}ms).`);
    const rowAEl = doc.querySelector('#rows .row');

    const samples = [];
    let stop = false;
    const sampler = (async () => {
      while (!stop) {
        const s = Object.assign({ t: Date.now() - t0 }, sample());
        s.aSame = doc.querySelector('#rows .row') === rowAEl || !!doc.querySelector(`[data-row="${firstA.rowId}"]`) && doc.querySelector(`[data-row="${firstA.rowId}"]`) === rowAEl;
        samples.push(s);
        await sleep(300);
      }
    })();
    // Nạp B + C giữa lúc in A để hàng 2 thành đôi bậc 1
    await sleep(2500);
    await post('/api/test/comment', { name: 'Be Bon' });
    await post('/api/test/follow', { name: 'Chi Bay' });
    console.log('   đã nạp B + C giữa lúc in A (hàng 2 sẽ là đôi bậc 1)');
    await waitCond(async () => { const s = await st(); return !s.drawingRow.length && !s.queue.length; }, 30000, 'A + đôi xong');
    stop = true;
    await sampler;

    const aSamples = samples.filter(s => s.rows.some(r => r.rowId === firstA.rowId));
    const aPrint = aSamples.filter(s => {
      const r = s.rows.find(x => x.rowId === firstA.rowId);
      return r && r.mask !== null && r.mask > 2 && r.mask < 98;
    });
    assert(aPrint.length >= 5, `Phải có đủ mẫu lúc in A (được ${aPrint.length})`);
    if (process.env.VA_DEBUG) {
      console.log('   [dbg] t,railY,maskA,progA,stripY:');
      aSamples.forEach(s => {
        const r = s.rows.find(x => x.rowId === firstA.rowId);
        console.log(`   [dbg] ${s.t},${s.railY},${r && r.mask},${r && r.prog},${s.stripY}`);
      });
    }

    // 2. Hàng nằm giữa màn hình, ray chạy dọc xuống đơn điệu lúc in rồi về đỉnh sau khi xong
    const railVals = aPrint.map(s => { const r = s.rows.find(x => x.rowId === firstA.rowId); return s.railY; });
    const slotTops = aPrint.map(s => s.rows.find(x => x.rowId === firstA.rowId).screenTop);
    assert(slotTops.every(v => v !== null && Math.abs(v - 775) <= 25), 'Hàng bậc 3 nằm giữa màn hình (đỉnh ~775)');
    assert(railVals.every(v => v !== null), 'Ray phải có vị trí suốt lượt in');
    assert(railVals.every((v, i) => i === 0 || v >= railVals[i - 1] - 1), 'Ray chỉ đi xuống lúc in');
    assert(Math.max(...railVals) >= 1000, `Ray phải xuống tới đáy hàng (max=${Math.max(...railVals)})`);
    assert(Math.min(...railVals) >= 650 && Math.min(...railVals) <= 850, `Ray bắt đầu từ mép trên ô in giữa màn hình (min=${Math.min(...railVals)})`);
    console.log(`✓ 2. Hàng giữa màn hình, ray xuống đơn điệu ${Math.min(...railVals).toFixed(0)}→${Math.max(...railVals).toFixed(0)} lúc in.`);

    // 3. Đầu quét ngang rộng
    const xs = aPrint.map(s => s.headX).filter(v => v !== null);
    assert(xs.length && Math.max(...xs) - Math.min(...xs) > 500, `Đầu phải quét rộng (được ${xs.length ? Math.max(...xs) - Math.min(...xs) : 0})`);
    console.log('✓ 3. Đầu quét ngang rộng.');

    // 4. Giấy: ĐỨNG YÊN suốt toàn bộ lượt in (đã tiến nhịp xong ở row-advance trước đó)
    const sv = aPrint.map(s => s.stripY);
    assert(Math.max(...sv) - Math.min(...sv) <= 2, `Giấy đứng yên suốt lượt in (lệch ${(Math.max(...sv) - Math.min(...sv)).toFixed(2)})`);
    console.log('✓ 4. Giấy đứng yên suốt lượt in.');

    // 5. Mask + tiến độ đơn điệu, không reset; tên ẩn → cắt X → hiện
    const seq = aPrint.map(s => s.rows.find(x => x.rowId === firstA.rowId).mask);
    assert(seq.every((v, i) => i === 0 || v >= seq[i - 1] - 0.5), 'Mask đơn điệu tăng');
    const pseq = aSamples.map(s => s.rows.find(x => x.rowId === firstA.rowId).prog);
    assert(pseq.every((v, i) => i === 0 || v >= pseq[i - 1] - 1e-9), 'data-progress đơn điệu');
    assert(Math.max(...pseq) === 1, 'Tiến độ đạt 100%');
    const nmStates = aSamples.map(s => s.rows.find(x => x.rowId === firstA.rowId).frames[0]).filter(Boolean);
    assert(nmStates.some(f => f.nmVis === 'hidden' || f.nmVis === ''), 'Tên ẩn lúc đầu');
    assert(nmStates.some(f => /^inset\(/.test(f.nmClip)), 'Tên cắt X theo đầu máy giữa chừng');
    const aEnd = nmStates[nmStates.length - 1];
    assert(aEnd.nmClip === 'none' && aEnd.nmVis === 'visible', 'Tên hiện đủ cuối lượt');
    console.log('✓ 5. Mask/progress đơn điệu; tên ẩn → cắt X → hiện.');

    // 6. Identity: 1 node duy nhất suốt lượt in; chỉ gỡ SAU khi in xong + cuốn
    const withA = samples.filter(s => s.rows.some(r => r.rowId === firstA.rowId));
    assert(withA.every(s => s.aSame), 'Node hàng A 1 identity duy nhất suốt lượt in');
    const noAIdx = samples.findIndex(s => !s.rows.some(r => r.rowId === firstA.rowId));
    let lastPrintingIdx = -1;
    samples.forEach((s, i) => {
      const r = s.rows.find(x => x.rowId === firstA.rowId);
      if (r && r.prog < 1) lastPrintingIdx = i;
    });
    assert(noAIdx === -1 || noAIdx > lastPrintingIdx, 'Hàng A không biến mất giữa lúc in');
    assert(removedRows.includes(firstA.rowId), `Hàng A phải được cuốn đi sau khi in xong (đã gỡ: ${removedRows.join(',')})`);
    console.log('✓ 6. Node hàng A duy nhất lúc in, cuốn đi sau khi xong.');

    // 6b. Dải sự kiện trên: in 1 ảnh thì hiện đúng 1 sự kiện suốt lượt in
    const soloEvent = 'Đang vẽ: Anh Tho đã tặng Quà tặng thử';
    assert(aPrint.every(s => s.eventTop === soloEvent && s.eventShown), 'Dải trên hiện đúng sự kiện quà tiếng Việt');
    console.log('✓ 6b. Dải trên hiện đúng 1 sự kiện suốt lượt in solo.');

    // 7. Hàng 2 đôi bậc 1 B + C: 2 avatar + tên, FIFO trái→phải
    const sNow = await st();
    const bcFrames = sNow.drawn.filter(e => ['Be Bon', 'Chi Bay'].includes(e.name));
    assert.strictEqual(bcFrames.length, 2, 'B + C đều được vẽ');
    assert.strictEqual(bcFrames[0].rowId, bcFrames[1].rowId, 'B + C chung 1 hàng đôi bậc 1');
    assert.strictEqual(bcFrames[0].rowLayout, 't1pair', 'Hàng đôi đúng layout');
    assert(bcFrames.every(e => e.tier === 1), 'Cả 2 đều bậc 1');
    const pairEl = doc.querySelector(`[data-row="${bcFrames[0].rowId}"]`);
    assert(pairEl, 'Hàng đôi tồn tại trong DOM');
    const halves = pairEl.querySelectorAll('.frame.t1pair');
    assert.strictEqual(halves.length, 2, 'Hàng đôi có 2 khung t1pair');
    assert.strictEqual(pairEl.querySelectorAll('.av').length, 2, 'Đủ 2 avatar');
    const pairNames = [...pairEl.querySelectorAll('.nm')].map(n => n.textContent);
    assert.deepStrictEqual(pairNames, ['Be Bon', 'Chi Bay'], 'Mốc 1 in tên cả 2 người');
    assert(Number(halves[0].getAttribute('data-qid')) < Number(halves[1].getAttribute('data-qid')), 'FIFO: B trái, C phải');
    assert.strictEqual(pairEl.getAttribute('data-progress'), '1.000', 'Hàng đôi xong 100%');
    console.log('✓ 7. Đôi bậc 1 B + C: avatar + tên, đúng FIFO trái→phải.');

    // 7b. Dải sự kiện trên: in 2 ảnh thì chia đôi thời gian, hiện từng sự kiện
    const pairRowIdEarly = String(bcFrames[0].rowId);
    const pairSamples = samples.filter(s => s.rows.some(r => r.rowId === pairRowIdEarly));
    const earlyPair = pairSamples.filter(s => {
      const r = s.rows.find(x => x.rowId === pairRowIdEarly);
      return r && r.prog > 0.1 && r.prog < 0.45;
    });
    const latePair = pairSamples.filter(s => {
      const r = s.rows.find(x => x.rowId === pairRowIdEarly);
      return r && r.prog > 0.55 && r.prog < 1;
    });
    assert(earlyPair.length >= 1 && latePair.length >= 1, 'Phải có mẫu 2 nửa lượt in đôi');
    assert(earlyPair.every(s => s.eventTop === 'Đang vẽ: Be Bon đã bình luận' && s.eventShown), 'Nửa đầu hiện sự kiện Be Bon');
    assert(latePair.every(s => s.eventTop === 'Đang vẽ: Chi Bay đã theo dõi kênh' && s.eventShown), 'Nửa sau hiện sự kiện Chi Bay');
    console.log('✓ 7b. Dải trên chia đôi lượt in đôi: Be Bon rồi Chi Bay.');

    // 8. Ray về đỉnh + giấy tiến nhịp sau lượt in
    await sleep(800); // chờ ray về đỉnh (550ms) + đầu về giữa
    const fin = sample();
    assert(fin.railY !== null && Math.abs(fin.railY - 425) <= 12, `Ray về đỉnh sau in (y=${fin.railY})`);
    assert(fin.headX !== null && Math.abs(fin.headX - 501) < 120, `Đầu về giữa (x=${fin.headX})`);
    const drawnNames = sNow.drawn.map(e => e.name).join(',');
    assert.strictEqual(drawnNames, 'Anh Tho,Be Bon,Chi Bay', `FIFO vẽ xong (được ${drawnNames})`);
    console.log('✓ 8. Ray về đỉnh, đầu về giữa, FIFO giữ nguyên.');
    // 8b. Giấy chỉ chạy xuống (không đảo chiều); cuốn hàng cũ + hàng mới vào đúng nhịp
    assert(samples.every((s, i) => i === 0 || s.stripY >= samples[i - 1].stripY - 0.5), 'Giấy chỉ chạy xuống, không đảo chiều');
    assert(samples.every(s => s.rows.length <= 1), 'Giấy chỉ giữ đúng 1 hàng tại 1 thời điểm');
    const pairRowId = String(bcFrames[0].rowId);
    const pairPrint = samples.filter(s => {
      const r = s.rows.find(x => x.rowId === pairRowId);
      return r && r.prog > 0.3 && r.prog < 1;
    });
    assert(pairPrint.length >= 3, `Phải có mẫu lúc in đôi (được ${pairPrint.length})`);
    const pMean = pairPrint.reduce((a, s) => a + s.stripY, 0) / pairPrint.length;
    const aStripMean = sv.reduce((a, b) => a + b, 0) / sv.length;
    const advTotal = pMean - aStripMean;
    const slotTop = (rowH) => 960 - rowH / 2;
    const aTarget = slotTop(370) + 370 + 30;
    const clearDist = Math.max(1780 - slotTop(370), 1960 - (slotTop(370) + 370));
    const expectedAdv = (slotTop(255) + 255 + 30 + aTarget + clearDist) - aTarget;
    assert(Math.abs(advTotal - expectedAdv) <= 40, `Cuốn + vào hàng đúng nhịp ô in giữa màn hình (được ${advTotal.toFixed(1)}, mong ${expectedAdv.toFixed(1)})`);
    console.log('✓ 8b. Giấy 1 chiều, cuốn + vào hàng đúng nhịp, tối đa 1 hàng.');

    // ---- Hàng bậc 5 solo ----
    console.log('--- top1: hàng bậc 5 solo ---');
    await post('/api/test/top1', { name: 'Nguoi Vip' });
    await waitCond(async () => { const s = await st(); return !s.drawingRow.length && !s.queue.length; }, 20000, 'bậc 5 xong');
    const sVip = await st();
    const vipEntry = sVip.drawn.find(e => e.name === 'Nguoi Vip');
    assert(vipEntry && vipEntry.tier === 5, 'Bậc 5 ra khung t5');
    assert.strictEqual(vipEntry.rowLayout, 't5', 'layout t5');
    const vipEl = doc.querySelector(`[data-row="${vipEntry.rowId}"]`);
    assert(vipEl, 'Hàng bậc 5 trong DOM');
    assert.strictEqual(vipEl.querySelectorAll('.frame.t5').length, 1, 'Bậc 5 solo 1 khung');
    assert(vipEl.querySelector('.halo'), 'Có hao quang');
    assert.strictEqual(vipEl.querySelectorAll('.gem').length, 4, 'Đủ 4 ngọc');
    assert(vipEl.querySelector('.nm'), 'Có tên');
    assert.strictEqual(vipEl.querySelector('.nm').textContent, 'Nguoi Vip', 'Tên bậc 5 đọc được');
    assert(vipEl.querySelector('.thanks-line'), 'Có dòng Thank you + tim');
    assert.strictEqual(vipEl.querySelector('.thanks-line').textContent.replace(/\s+/g, ' ').trim(), 'Thank you ❤', 'Dòng Thank you đúng mẫu');
    assert(vipEl.querySelector('.t5-side'), 'Có cụm chữ bên cạnh ảnh');
    assert.strictEqual(vipEl.querySelector('.thanks-vi').textContent, 'Cảm ơn bạn rất nhiều!', 'Có lời cảm ơn tiếng Việt');
    assert.strictEqual(vipEl.querySelector('.wish-line').textContent, 'Chúc bạn luôn vui vẻ, may mắn và phát tài!', 'Có lời chúc tiếng Việt');
    assert.strictEqual(vipEl.style.height, '340px', 'Hàng bậc 5 cao 340');
    assert.strictEqual(doc.querySelectorAll('#rows .row').length, 1, 'Sau bậc 5: giấy chỉ giữ hàng bậc 5');
    console.log('✓ 9. Bậc 5 solo: halo + ngọc + tên + lời cảm ơn/chúc, cao 340.');

    // ---- Mở trang giữa chừng (resync): chỉ dựng hàng đang in, vẽ tiếp ----
    console.log('--- mở overlay thứ 2 giữa lúc đang in D ---');
    await post('/api/test/gift', { name: 'Den Don' });
    await waitCond(async () => { const s = await st(); return s.drawingRow.length ? s : null; }, 20000, 'D bắt đầu in');
    await sleep(1500); // đang in dở
    const dRowId = String((await st()).drawingRow[0].rowId);
    dom2 = new JSDOM(overlayTestHtml(), {
      url: base + '/overlay.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc
    });
    const doc2 = dom2.window.document;
    await waitCond(() => doc2.querySelectorAll('#rows .row').length === 1 || null, 10000, 'trang 2 dựng hàng D');
    const rows2 = [...doc2.querySelectorAll('#rows .row')].map(r => r.getAttribute('data-row'));
    assert.deepStrictEqual(rows2, [dRowId], `Trang 2 chỉ dựng đúng hàng đang in (được ${rows2.join(',')})`);
    await finishAll();
    await sleep(500);
    const sEnd = await st();
    assert(sEnd.drawn.some(e => e.name === 'Den Don'), 'D vẽ xong sau resync');
    assert(doc.querySelectorAll('#rows .row').length <= 1, 'Trang 1 cũng chỉ giữ tối đa 1 hàng');
    console.log('✓ 10. Resync giữa chừng: đúng 1 hàng đang in, vẽ tiếp xong.');

    // ---- Gom 4 bậc 1 (lưới 2x2): 4 avatar + tên ----
    console.log('--- gom lưới bậc 1 ---');
    await post('/api/test/top1', { name: 'Grid Giu May' });
    await post('/api/test/gift', { name: 'Grid Mot', coins: 1 });
    await post('/api/test/comment', { name: 'Grid Hai' });
    await post('/api/test/follow', { name: 'Grid Ba' });
    await post('/api/test/share', { name: 'Grid Bon' });
    await waitCond(() => {
      const t = doc.getElementById('queue-names').textContent;
      return (t.includes('Grid Mot') && t.includes('Grid Bon')) || null;
    }, 10000, 'bảng chờ hiện đủ tên');
    const panelText = doc.getElementById('queue-names').textContent;
    assert(panelText.includes('Grid Hai') && panelText.includes('Grid Ba'), `Bảng chờ hiện đủ tên (${panelText})`);
    assert(!panelText.includes('mốc'), `Bảng chờ chỉ ghi tên, không ghi mốc (${panelText})`);
    console.log('✓ 11b. Bảng chờ dưới chỉ hiện tên đang xếp hàng.');
    await waitCond(async () => { const s = await st(); return s.drawn.filter(e => /^Grid (Mot|Hai|Ba|Bon)$/.test(e.name)).length === 4; }, 60000, 'lưới vẽ xong');
    const sGrid = await st();
    const gridDrawn = sGrid.drawn.filter(e => /^Grid (Mot|Hai|Ba|Bon)$/.test(e.name));
    assert.strictEqual(new Set(gridDrawn.map(e => e.rowId)).size, 1, 'Lưới chung 1 hàng');
    assert(gridDrawn.every(e => e.rowLayout === 't1grid'), 'Layout t1grid');
    const gridEl = doc.querySelector(`[data-row="${gridDrawn[0].rowId}"]`);
    assert(gridEl, 'Hàng lưới trong DOM');
    assert(gridEl.className.includes('grid'), 'Hàng lưới dùng class grid');
    assert.strictEqual(gridEl.querySelectorAll('.frame.t1pair').length, 4, 'Đủ 4 ô t1pair');
    const gridNames = [...gridEl.querySelectorAll('.nm')].map(n => n.textContent);
    assert.deepStrictEqual(gridNames, ['Grid Mot', 'Grid Hai', 'Grid Ba', 'Grid Bon'], 'Lưới bậc 1 in tên cả 4 người');
    const gridQids = [...gridEl.querySelectorAll('.frame')].map(f => Number(f.getAttribute('data-qid')));
    assert.deepStrictEqual(gridQids, [...gridQids].sort((a, b) => a - b), 'Lưới giữ đúng thứ tự vào');
    console.log('✓ 11. Lưới bậc 1: 4 avatar + tên.');

    await post('/api/session/reset', {});
    await waitCond(() => doc.getElementById('queue-names').textContent.includes('Chưa có ai chờ') || null, 10000, 'bảng chờ trống sau reset');
    console.log('✓ 11c. Reset: bảng chờ về trạng thái trống.');
    await post('/api/settings', { demoMode: false });
    obs.disconnect();
  } finally {
    try { if (dom) dom.window.close(); } catch (e) {}
    try { if (dom2) dom2.window.close(); } catch (e) {}
    server.kill('SIGKILL');
  }
  assert(!/ReferenceError|TypeError|SyntaxError/.test(serverErr), 'Server không lỗi runtime: ' + serverErr.slice(0, 200));

  console.log('\n====================================================================');
  console.log('🎉 DOM GANTRY ĐẠT CHUẨN!');
  console.log('====================================================================');
}

main().catch(err => {
  console.error('❌ Thất bại:', err.message);
  process.exit(1);
});
