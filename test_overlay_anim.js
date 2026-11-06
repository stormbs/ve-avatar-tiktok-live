// Hồi quy timeline máy in gantry (đúng video1): ray chạy dọc, đầu quét ngang,
// giấy đứng yên lúc in, hiện nội dung theo mép dưới ray.
// Trích khối TIMELINE nguyên văn từ overlay.html. Chạy: node test_overlay_anim.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'public', 'overlay.html'), 'utf8');
const m = html.match(/\/\/ ==TIMELINE-START==([\s\S]*?)\/\/ ==TIMELINE-END==/);
assert(m, 'Overlay phải có khối TIMELINE đánh dấu để test');
// eslint-disable-next-line no-eval
const api = new Function(m[1] + '\nreturn { CENTER_Y, RAIL_HOME, BAR_H, ROW_H_T1, ROW_H_T1GRID, ROW_H_T2, ROW_H_T3, ROW_H_T4, ROW_H_T5, ROW_GAP, SWEEP_PASSES, HOME_MS, ADV_MS, CLEAR_MS, CLEAR_EXIT_TOP, CLEAR_EXIT_BOT, HEAD_L, HEAD_R, NAME_BAND, vaRowH, vaSlotTop, vaRowTimeline, vaRailY, vaSweep, vaRowMaskPct, vaRowMask, vaNameClip, vaPaperTarget, vaEase, vaClearDist, vaGiftPhrase, vaThanksText, vaEventText, vaEventIndex, vaSplitSpeech };')();
const { CENTER_Y, RAIL_HOME, BAR_H, ROW_H_T1, ROW_H_T1GRID, ROW_H_T2, ROW_H_T3, ROW_H_T4, ROW_H_T5, ROW_GAP,
  SWEEP_PASSES, HOME_MS, ADV_MS, CLEAR_MS, CLEAR_EXIT_TOP, CLEAR_EXIT_BOT, HEAD_L, HEAD_R, NAME_BAND,
  vaRowH, vaSlotTop, vaRowTimeline, vaRailY, vaSweep, vaRowMaskPct, vaRowMask, vaNameClip, vaPaperTarget, vaEase, vaClearDist, vaGiftPhrase, vaThanksText, vaEventText, vaEventIndex, vaSplitSpeech } = api;

async function main() {
  console.log('====================================================================');
  console.log('🧪 TIMELINE GANTRY: RAY DỌC + ĐẦU NGANG + GIẤY ĐỨNG YÊN');
  console.log('====================================================================\n');
  const T = 7000;

  // 1. Tiến độ in tuyến tính
  assert.strictEqual(vaRowTimeline(0, T).p, 0, 'p(0)=0');
  assert(Math.abs(vaRowTimeline(T / 2, T).p - 0.5) < 1e-9, 'p(T/2)=0.5');
  assert.strictEqual(vaRowTimeline(T, T).p, 1, 'p(T)=1');
  assert.strictEqual(vaRowTimeline(T, T).done, true, 'done ở T');
  assert.strictEqual(vaRowTimeline(0, T).done, false, 'chưa done ở 0');
  console.log('✓ 1. Tiến độ tuyến tính 0→100%.');

  // 2. Ray: từ mép trên ô in (giữa màn hình) xuống đáy hàng, tuyến tính
  assert.strictEqual(vaSlotTop(255), CENTER_Y - 127.5, 'Ô in 255 can giữa màn hình');
  assert.strictEqual(vaSlotTop(340), CENTER_Y - 170, 'Ô in 340 can giữa màn hình');
  assert.strictEqual(vaSlotTop(370), CENTER_Y - 185, 'Ô in 370 can giữa màn hình');
  assert.strictEqual(vaSlotTop(540), CENTER_Y - 270, 'Ô in 540 can giữa màn hình');
  assert.strictEqual(vaRailY(0, ROW_H_T2), vaSlotTop(ROW_H_T2) - BAR_H, 'Bắt đầu ở mép trên ô in');
  assert.strictEqual(vaRailY(1, ROW_H_T2), vaSlotTop(ROW_H_T2) + ROW_H_T2, 'Kết thúc ở đáy hàng');
  const mid = vaRailY(0.5, ROW_H_T4);
  assert(Math.abs(mid - (vaRailY(0, ROW_H_T4) + vaRailY(1, ROW_H_T4)) / 2) < 1e-9, 'Giữa tuyến tính');
  assert(vaRailY(1, ROW_H_T4) > vaRailY(1, ROW_H_T2), 'Hàng bậc 4 ray đi xa hơn bậc 2');
  assert(vaRailY(0, ROW_H_T2) > RAIL_HOME + 200, 'Điểm in xa ray nghỉ ở đỉnh');
  console.log('✓ 2. Ray ô-in-giữa → đáy hàng, tuyến tính.');

  // 3. Quét ngang sine: đủ biên, đổi chiều mượt, đúng số lượt
  assert(Math.abs(vaSweep(0, T).x - 0) < 1e-9, 'Bắt đầu đầu trái');
  assert.strictEqual(vaSweep(0, T).dir, 1, 'Lượt đầu trái→phải');
  const period = T / SWEEP_PASSES;
  assert(Math.abs(vaSweep(period, T).x - 1) < 1e-9, 'Cuối lượt 1 ở đầu phải');
  assert.strictEqual(vaSweep(period * 1.5, T).dir, -1, 'Lượt 2 đổi chiều');
  for (const e of [700, 2000, 4000, 6000]) {
    const x = vaSweep(e, T).x;
    assert(x >= 0 && x <= 1, `X trong [0,1], được ${x}`);
  }
  const dEnd = Math.abs(vaSweep(2, T).x - vaSweep(0, T).x);
  assert(dEnd < 0.001, `Đổi chiều mượt (delta 2ms=${dEnd})`);
  assert(HEAD_R - HEAD_L > 700, 'Quét gần full chiều rộng ray');
  console.log('✓ 3. Quét sine full ray, đổi chiều mượt.');

  // 4. Mask hàng theo mép dưới ray
  const rowTop = vaSlotTop(ROW_H_T2), rowH = ROW_H_T2;
  assert.strictEqual(vaRowMaskPct(vaRailY(0, rowH) + BAR_H, rowTop, rowH), 0, 'Ray ở mép ô in: hàng ẩn tuyệt đối');
  assert(vaRowMaskPct(rowTop + rowH / 2, rowTop, rowH) > 45 &&
    vaRowMaskPct(rowTop + rowH / 2, rowTop, rowH) < 55, 'Ray giữa hàng: hiện ~50%');
  assert.strictEqual(vaRowMaskPct(rowTop + rowH + 50, rowTop, rowH), 100, 'Ray qua đáy: hiện hết');
  assert(!vaRowMask(0).includes('#000'), 'p=0: trống tuyệt đối');
  assert.strictEqual(vaRowMask(100), 'none', 'p=100%: hiện hết');
  const mh = vaRowMask(50);
  assert(mh.includes('48.80%') && mh.includes('51.20%'), `Vạch ở ~50%: ${mh}`);
  console.log('✓ 4. Hiện nội dung theo mép dưới ray.');

  // 5. Tên cắt X theo đầu máy khi ray qua dải tên
  const bandTop = rowTop + rowH * 0.78, bandBot = rowTop + rowH * 0.95;
  assert.strictEqual(vaNameClip(bandTop - 10, rowTop, rowH, 't2', 0.5, 1), 'hidden', 'Trên dải tên: ẩn');
  assert.strictEqual(vaNameClip(bandBot + 10, rowTop, rowH, 't2', 0.5, 1), 'none', 'Qua dải tên: hiện hết');
  const midBand = (bandTop + bandBot) / 2;
  assert.strictEqual(vaNameClip(midBand, rowTop, rowH, 't2', 0.25, 1), 'inset(0 75.0% 0 0)', 'LTR: lộ từ trái theo đầu');
  assert.strictEqual(vaNameClip(midBand, rowTop, rowH, 't2', 0.25, -1), 'inset(0 0 0 25.0%)', 'RTL: lộ từ phải theo đầu');
  console.log('✓ 5. Tên viết theo X đầu máy trong dải tên.');

  // 6. Giấy: mục tiêu + ease
  assert.strictEqual(vaPaperTarget(-285, 255), vaSlotTop(255) + 285, 'Giấy đưa hàng lên đúng ô in');
  assert(vaPaperTarget(-100, 255) < vaPaperTarget(-500, 255), 'Hàng mới (paperY nhỏ) cần giấy xuống sâu hơn');
  assert.strictEqual(vaEase(0), 0, 'ease(0)=0');
  assert.strictEqual(vaEase(1), 1, 'ease(1)=1');
  assert(Math.abs(vaEase(0.5) - 0.5) < 1e-9, 'ease giữa 0.5');
  assert(vaEase(0.25) < 0.25 && vaEase(0.75) > 0.75, 'ease-in-out đúng dáng');
  assert.strictEqual(ADV_MS, 800, 'Nhịp tiến giấy khớp server ROW_GAP_MS=800');
  assert(HOME_MS < ADV_MS, 'Ray về đỉnh kịp trước khi giấy tiến xong');
  assert.strictEqual(ROW_H_T1, 255, 'Hàng bậc 1 cao 255');
  assert.strictEqual(ROW_H_T1GRID, 540, 'Lưới bậc 1 (2 hàng x 2 ảnh) cao 540');
  assert.strictEqual(ROW_H_T2, 255, 'Hàng bậc 2 cao 255');
  assert.strictEqual(ROW_H_T3, 370, 'Hàng bậc 3 lớn hơn (370)');
  assert.strictEqual(ROW_H_T4, 370, 'Hàng bậc 4 cùng cỡ bậc 3');
  assert.strictEqual(ROW_H_T5, 340, 'Hàng bậc 5 cao 340');
  assert.strictEqual(vaRowH('t1solo'), 255, 'vaRowH t1solo');
  assert.strictEqual(vaRowH('t1pair'), 255, 'vaRowH t1pair');
  assert.strictEqual(vaRowH('t1grid'), 540, 'vaRowH t1grid');
  assert.strictEqual(vaRowH('t2'), 255, 'vaRowH t2');
  assert.strictEqual(vaRowH('t3'), 370, 'vaRowH t3');
  assert.strictEqual(vaRowH('t4'), 370, 'vaRowH t4');
  assert.strictEqual(vaRowH('t5'), 340, 'vaRowH t5');
  assert.deepStrictEqual(NAME_BAND.t1solo, NAME_BAND.t2, 'Dải tên bậc 1 solo cùng họ bậc 2');
  assert.deepStrictEqual(NAME_BAND.t1pair, NAME_BAND.t2, 'Dải tên bậc 1 đôi cùng họ bậc 2');
  assert.deepStrictEqual(NAME_BAND.t3, NAME_BAND.t2, 'Dải tên bậc 3 cùng họ bậc 2');
  assert.deepStrictEqual(NAME_BAND.t4, NAME_BAND.t2, 'Dải tên bậc 4 cùng họ bậc 2');
  assert.deepStrictEqual(NAME_BAND.t5, NAME_BAND.t2, 'Dải tên bậc 5 cùng họ bậc 2');
  console.log('✓ 6. Mục tiêu giấy + ease nhịp nhàng.');

  // 6b. Cuốn hàng cũ: đủ xa để chỉ còn giấy trắng, khớp server CLEAR_MS
  assert.strictEqual(CLEAR_MS, 900, 'Nhịp cuốn khớp server CLEAR_MS=900');
  const slot2 = vaSlotTop(ROW_H_T2), slot4 = vaSlotTop(ROW_H_T4), slot5 = vaSlotTop(ROW_H_T5);
  assert.strictEqual(vaClearDist(slot2, ROW_H_T2), CLEAR_EXIT_TOP - slot2, 'Hàng bậc 2 cuốn qua mép dưới');
  assert(vaClearDist(slot4, ROW_H_T4) === CLEAR_EXIT_TOP - slot4, 'Hàng bậc 4 cuốn qua mép dưới');
  assert(vaClearDist(slot5, ROW_H_T5) === CLEAR_EXIT_TOP - slot5, 'Hàng bậc 5 cuốn qua mép dưới');
  assert(slot2 + ROW_H_T2 + vaClearDist(slot2, ROW_H_T2) >= CLEAR_EXIT_BOT, 'Đáy hàng bậc 2 ra khỏi màn hình');
  assert(slot4 + ROW_H_T4 + vaClearDist(slot4, ROW_H_T4) >= CLEAR_EXIT_BOT, 'Đáy bậc 4 ra khỏi màn hình');
  assert(slot5 + ROW_H_T5 + vaClearDist(slot5, ROW_H_T5) >= CLEAR_EXIT_BOT, 'Đáy bậc 5 ra khỏi màn hình');
  assert(vaClearDist(vaSlotTop(ROW_H_T1GRID), ROW_H_T1GRID) > 0, 'Lưới bậc 1 cuốn được');
  console.log('✓ 6b. Cuốn hàng cũ ra khỏi màn hình, chỉ còn giấy trắng.');

  // 7. Tĩnh: đúng 1 giàn ray chạy dọc, đầu chỉ X, đủ chi tiết VIP/đôi
  assert((html.match(/id="bar"/g) || []).length === 1, 'Đúng 1 thanh ray');
  assert((html.match(/id="head"/g) || []).length === 1, 'Đúng 1 đầu máy');
  assert(/barEl\.style\.transform/.test(html), 'Ray animate Y qua transform');
  assert(!/headEl\.style\.top/.test(html), 'Đầu máy không gán Y (Y theo thanh ray)');
  assert(/headEl\.style\.left/.test(html), 'Đầu máy chỉ animate X');
  assert(html.indexOf('id="head"') > html.indexOf('id="bar"'), 'Đầu nằm trên thanh ray');
  assert((html.match(/class="rod /g) || []).length === 2, 'Đủ 2 rod dọc tĩnh');
  assert(!/rodEl|rodsEl\.style/.test(html), 'Rod dọc không bao giờ di chuyển');
  assert(html.includes('.av-ring') && html.includes('.av-orn'), 'Đủ chi tiết viền bậc 2/3/4');
  assert(html.includes('.frame.t1solo') && html.includes('.frame.t1pair'), 'Có khung bậc 1 (solo + đôi)');
  assert(html.includes('.row.grid') && html.includes('repeat(2, auto)'), 'Có lưới bậc 1 (2 hàng x 2 ảnh)');
  assert(!html.includes('.frame.trio'), 'Xóa khung trio tràn giấy cũ');
  assert(html.includes('.frame.t2') && html.includes('.frame.t3') && html.includes('.frame.t4') && html.includes('.frame.t5'), 'Có khung bậc 2/3/4/5');
  assert(!html.includes('.frame.vip') && !html.includes('.frame.quad') && !html.includes('SUPER VIP'), 'Xóa sạch khung VIP/quad cũ');
  assert(!html.includes('bare'), 'Mốc 1 cũng in tên (xóa logic avatar-trần)');
  assert(/if \(cls === 't2' \|\| cls === 't3' \|\| cls === 't4'\) h \+= thanksLineHtml/.test(html), 'Thank you chỉ từ bậc 2 trở lên');
  assert(html.includes('.frame.t4 .halo') && html.includes('@keyframes t4halo') && html.includes('@keyframes t4pulse'), 'Bậc 4 có hao quang + nhịp sáng');
  assert(html.includes('.frame.t5 .t5-side') && html.includes('.thanks-vi') && html.includes('.wish-line'), 'Bậc 5 có lời cảm ơn/chúc bên cạnh ảnh');
  assert(html.includes('@keyframes t5pulse'), 'Bậc 5 có nhịp sáng riêng');
  assert(html.includes('thanksLineHtml') && html.includes('Thank you <span class="heart">❤</span>'), 'Bậc 2+ có dòng Thank you + tim');
  assert(html.includes('id="event-band"') && html.includes('id="event-text"'), 'Có dải sự kiện trên cùng');
  assert(html.includes('id="queue-panel"') && html.includes('vaRenderQueue'), 'Có bảng hàng chờ dưới lấp khoảng đen');
  assert(/railDive/.test(html), 'Ray lặn xuống điểm in lúc vào hàng');
  assert(/socket\.on\('row-clear'/.test(html), 'Có xử lý cuốn hàng cũ');
  assert(/pendingAdvance/.test(html) && /pendingClear/.test(html), 'Nối nhịp cuốn → vào hàng');
  assert(!/paperYFor/.test(html), 'Xóa sạch chia slot giấy cũ (mô hình 1 hàng)');
  assert(html.includes('proto-warn') && html.includes('SERVER CŨ'), 'Có banner báo server cũ');
  assert(html.includes('<html lang="vi">'), 'Overlay dùng tiếng Việt');
  assert(html.includes('Tôi vẽ avatar tặng bạn'), 'Tiêu đề overlay tiếng Việt');
  assert(html.includes('VẼ AVATAR TRỰC TIẾP'), 'Thương hiệu overlay tiếng Việt');
  assert(!html.includes('Let me draw your avatar') && !html.includes('PENCIL PRINTS LIVE'), 'Xóa chữ tiếng Anh cũ trên overlay');
  assert(!html.includes('added to the draw queue'), 'Xóa mẫu thông báo tiếng Anh cũ');
  assert(!/vaTimeline|vaHeadSweep01|vaRevealMask|vaResyncOrder|tailV|phase-empty/.test(html), 'Xóa sạch timeline/mask cũ');
  assert(!/\.staged/.test(html), 'Không còn staged (tên/tim in theo vị trí ray)');
  assert(/data-progress/.test(html), 'Tiến độ mirror data-progress');
  assert(/drawRow\.rowId/.test(html) && /return; \/\/ frame-start trung/.test(html), 'frame-start trùng không tạo lại hàng');
  console.log('✓ 7. Cấu trúc giàn ray + 5 bậc + cuốn giấy đạt.');

  // 8. Voice cảm ơn theo bậc + nhạc nền 4 bài
  const th1 = vaThanksText(['An'], 'gift', 'Hoa hồng', 1, 1);
  assert(th1.includes('An') && th1.includes('Hoa hồng'), `Bậc 1 đủ tên + quà: ${th1}`);
  assert.strictEqual(vaThanksText(['An'], 'follow', '', 0, 1), 'Cảm ơn An đã theo dõi kênh!', 'Follow mẫu đúng');
  assert.strictEqual(vaThanksText(['An'], 'share', '', 0, 1), 'Cảm ơn An đã chia sẻ live!', 'Share mẫu đúng');
  const thB = vaThanksText(['An', 'Bình', 'Chi'], 'comment', '', 0, 1);
  assert(thB.includes('An, Bình và Chi'), `Gộp tên đúng: ${thB}`);
  const th2 = vaThanksText(['An'], 'gift', 'Hoa hồng', 1, 2);
  const th3 = vaThanksText(['An'], 'gift', 'Hoa hồng', 1, 3);
  const th4 = vaThanksText(['An'], 'gift', 'Hoa hồng', 1, 4);
  const th5 = vaThanksText(['An'], 'gift', 'Hoa hồng', 1, 5);
  assert(th2.length > th1.length && th3.length > th2.length && th4.length > th3.length && th5.length > th4.length, 'Câu bậc cao dài hơn');
  assert([th1, th2, th3, th4, th5].every(t => !t.includes('xu')), 'Voice không đọc số xu');
  assert.strictEqual(vaGiftPhrase('Hoa hồng', 1), 'Hoa hồng', '1 món chỉ đọc tên');
  assert.strictEqual(vaGiftPhrase('Hoa hồng', 5), '5 Hoa hồng', 'Nhiều món đọc số lượng');
  assert.strictEqual(vaGiftPhrase('', 3), '3 quà tặng', 'Thiếu tên quà vẫn đọc số lượng');
  assert(vaThanksText(['An'], 'gift', 'Hoa hồng', 5, 3).includes('5 Hoa hồng'), 'Voice bậc 3 đọc số lượng');
  assert(vaThanksText(['An'], 'gift', 'Heo may mắn', 2, 2).includes('2 Heo may mắn'), 'Voice bậc 2 đọc số lượng');
  assert(!vaThanksText(['An'], 'gift', 'Hoa hồng', 1, 5).includes('1 Hoa hồng'), '1 món không đọc số 1');
  assert(html.includes('vaSpeakRow') && html.includes('speechSynthesis'), 'Có voice cảm ơn mỗi lượt in');
  assert(html.includes("u.lang = 'vi-VN'"), 'Voice luôn gắn tiếng Việt');
  assert(html.includes('u.voice = vaViVoice;'), 'Ưu tiên giọng Việt khi có');
  assert(html.includes('vaShowVoiceWarn(true)'), 'Thiếu giọng Việt vẫn đọc bằng giọng mặc định + nhắc nhẹ');
  assert(html.includes('id="voice-warn"') && html.includes('CHƯA CÓ GIỌNG ĐỌC TIẾNG VIỆT'), 'Có cảnh báo thiếu giọng Việt');
  assert(!html.includes('THIẾU GIỌNG ĐỌC TIẾNG VIỆT — Màn hình live chỉ đọc'), 'Không chặn voice khi thiếu giọng Việt');
  assert(html.includes('vaSpeakGoogle') && html.includes('/api/tts?text='), 'Thiếu giọng Việt thì đọc bằng file mp3 server');
  assert(!html.includes('translate_tts'), 'Overlay không gọi thẳng Google từ trình duyệt (hay bị chặn)');
  assert(html.includes("socket.on('voice-test'"), 'Overlay nghe lệnh thử giọng từ dashboard');
  assert(html.includes("socket.emit('voice-status'"), 'Overlay báo trạng thái giọng về dashboard');
  assert(/vaJingle\(doneLayout === 't5' \? 2/.test(html), 'Jingle bậc 3/4/5 lúc in xong');
  assert(html.includes('t5: 3.4'), 'Jingle bậc 5 dài hơn bậc 4');
  for (const tr of ['vui', 'nhe', 'soi', 'tinh']) assert(html.includes(tr + ':'), `Có track nhạc ${tr}`);
  assert(html.includes('vaApplyAudioSettings'), 'Nhạc/voice theo cài đặt dashboard');
  console.log('✓ 8. Voice cảm ơn theo bậc + nhạc nền 4 bài.');

  // 9. Dải sự kiện trên: câu tiếng Việt + chia thời gian theo số ảnh đang in
  assert.strictEqual(vaEventText({ name: 'An', kind: 'gift', giftName: 'Hoa hồng', coins: 10, qty: 1 }), 'An đã tặng Hoa hồng', 'Sự kiện quà không hiện xu');
  assert.strictEqual(vaEventText({ name: 'An', kind: 'gift', giftName: 'Hoa hồng', coins: 10, qty: 5 }), 'An đã tặng 5 Hoa hồng', 'Sự kiện quà đọc số lượng');
  assert.strictEqual(vaEventText({ name: 'An', kind: 'follow' }), 'An đã theo dõi kênh', 'Sự kiện theo dõi mẫu đúng');
  assert.strictEqual(vaEventText({ name: 'An', kind: 'share' }), 'An đã chia sẻ live', 'Sự kiện chia sẻ mẫu đúng');
  assert.strictEqual(vaEventText({ name: 'An', kind: 'comment' }), 'An đã bình luận', 'Sự kiện bình luận mẫu đúng');
  assert.strictEqual(vaEventIndex(0, 4), 0, 'Đầu lượt in: sự kiện 1');
  assert.strictEqual(vaEventIndex(0.24, 4), 0, 'Trước mốc 1/4: sự kiện 1');
  assert.strictEqual(vaEventIndex(0.25, 4), 1, 'Mốc 1/4: sự kiện 2');
  assert.strictEqual(vaEventIndex(0.74, 4), 2, 'Trước mốc 3/4: sự kiện 3');
  assert.strictEqual(vaEventIndex(0.99, 4), 3, 'Cuối lượt in: sự kiện 4');
  assert.strictEqual(vaEventIndex(1, 4), 3, 'p=1 vẫn sự kiện cuối');
  assert.strictEqual(vaEventIndex(0.5, 1), 0, 'In 1 ảnh: luôn 1 sự kiện');
  assert(html.includes('updateEventRow(p)'), 'Dải trên cập nhật theo tiến độ in');
  assert(html.includes("'Đang vẽ: ' + eventRow.messages[idx]"), 'Dải trên ghi rõ đang vẽ sự kiện nào');
  assert(/#notify-band \{[^}]*top: 86px/.test(html), 'Dải thông báo đã lên trên cùng');

  // 10. Cắt câu đọc cho TTS Google: mỗi đoạn ngắn, không mất chữ
  const long = 'Xin chân thành cảm ơn bạn đã ủng hộ món quà này, tổng cộng năm mươi xu! Chúc bạn và gia đình luôn mạnh khỏe, bình an và phát tài!';
  const chunks = vaSplitSpeech(long, 60);
  assert(chunks.length >= 2, `Câu dài phải cắt nhiều đoạn (được ${chunks.length})`);
  assert(chunks.every(c => c.length <= 60), 'Mỗi đoạn không quá giới hạn');
  assert.strictEqual(chunks.join(' ').replace(/\s+/g, ' '), long.replace(/\s+/g, ' '), 'Ghép lại đủ chữ');
  assert.deepStrictEqual(vaSplitSpeech('Chào bạn!', 60), ['Chào bạn!'], 'Câu ngắn giữ nguyên 1 đoạn');
  assert.deepStrictEqual(vaSplitSpeech('', 60), [], 'Chuỗi rỗng ra mảng rỗng');
  console.log('✓ 10. Cắt câu TTS đúng giới hạn, không mất chữ.');
  console.log('✓ 9. Dải sự kiện trên khớp nhịp in, chia đều theo số ảnh.');

  // 11. Mở khóa tiếng trình duyệt + đèn đọc + dự phòng ngược
  assert(html.includes('id="audio-unlock"') && html.includes('BẤM VÀO ĐÂY 1 LẦN'), 'Có nút mở khóa tiếng overlay');
  assert(html.includes('vaProbeAudio') && html.includes('vaSetAudioUnlocked') && html.includes('VA_SILENCE_WAV'), 'Tự dò trạng thái tiếng bằng file im lặng');
  assert(html.includes('vaGestureUnlock'), 'Bấm vào trang thì mở khóa tiếng');
  assert(html.includes('id="speak-badge"') && html.includes('ĐANG ĐỌC'), 'Có đèn báo đang đọc');
  assert(html.includes('speakBadgeEl.style.opacity = vaSpeaking'), 'Đèn đọc sáng theo lúc voice cất tiếng');
  assert(html.includes('locked: locked'), 'Báo trạng thái khóa tiếng về dashboard');
  assert(html.includes('vaPlayTtsFile') && html.includes('vaTtsFailed'), 'Phát file TTS server qua 1 Audio duy nhất');
  assert(html.includes('vaAudioErrors') && html.includes('vaSpeakNative(text, availSec)'), 'File TTS hỏng thì rớt xuống giọng trình duyệt');
  console.log('✓ 11. Mở khóa tiếng + đèn đọc + dự phòng ngược.');

  // 12. Trang trí: không mảng đen, đầu trang ấm, ghim khung
  const topRule = html.match(/#topband \{[\s\S]*?\}/)[0];
  const curlRule = html.match(/#curlbed \{[\s\S]*?\}/)[0];
  const topBg = (topRule.match(/background:[^;]+/g) || []).join(';');
  const curlBg = (curlRule.match(/background:[^;]+/g) || []).join(';');
  assert(!/#000|rgba\(0,\s*0,\s*0/.test(topBg), 'Nền đầu trang không còn đen xì');
  assert(!/#000|rgba\(0,\s*0,\s*0/.test(curlBg), 'Nền cuối giấy không còn hiệu ứng đen dần');
  assert(html.includes('id="tagline"') && html.includes('Mỗi tương tác'), 'Có dòng phụ trang trí đầu trang');
  assert(html.includes('.frame::after'), 'Khung ảnh có đinh ghim trang trí');
  console.log('✓ 12. Trang trí ấm, hết mảng đen.');

  // 13. Font an toàn dấu tiếng Việt + ký tự trang trí không lỗi font + đọc nhanh hơn
  assert(!html.includes('Segoe Script') && !html.includes('Brush Script MT'), 'Xóa font viết tay không có dấu Việt');
  assert(/\.frame\.t[345] \.fname \{[^}]*Georgia/.test(html), 'Tên bậc 3/4/5 dùng serif có dấu Việt');
  assert(!/[♥♪❖⚠]/.test(html), 'Xóa ký tự dễ lỗi font (♥♪❖⚠)');
  assert(html.includes('❤') && html.includes('🔊'), 'Tim và loa dùng ký tự emoji an toàn');
  assert(html.includes('text.length / 16'), 'Tốc độ đọc nhanh hơn (16 ký tự/giây)');
  assert(html.includes('Math.min(1.5, Math.max(1, rate))'), 'Trần tốc độ file đọc tăng');
  assert(!html.includes('q-tier'), 'Bảng chờ không còn nhãn mốc');

  console.log('\n====================================================================');
  console.log('🎉 TIMELINE GANTRY ĐẠT CHUẨN!');
  console.log('====================================================================');
}

main().catch(err => {
  console.error('❌ Thất bại:', err.message);
  process.exit(1);
});
