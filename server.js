// VẼ AVATAR - server overlay TikTok LIVE 1080x1920.
// 5 BẬC VẼ theo tổng xu tích lũy trong phiên:
//   Bậc 1: avatar + tên, gom tối đa 4 người/lượt (lưới 2x2), giữ 1s (quà tổng dưới 5 xu, theo dõi, chia sẻ, bình luận khớp nội dung).
//   Bậc 2: avatar + tên + "Thank you ❤", viền đẹp, 1 người/lượt, giữ 2s (tổng từ 5 xu).
//   Bậc 3: khung lớn + tên đẹp + "Thank you ❤", 1 người/lượt, giữ 3s (tổng từ 10 xu).
//   Bậc 4: như bậc 3 + hiệu ứng, 1 người/lượt, giữ 5s (tổng từ 20 xu).
//   Bậc 5: như bậc 4 + lời cảm ơn/chúc bên cạnh ảnh, 1 người/lượt, giữ 7s (tổng từ 50 xu).
// Hàng đợi ƯU TIÊN: bậc cao in trước, cùng bậc thì tổng xu cao trước, rồi vào trước in trước.
// In xong giữ theo bậc rồi băng chạy xuống, chỉ để lại giấy trắng cho lượt tiếp theo.
// Chạy: node server.js (PORT mặc định 3005).
const PROTO = 6; // overlay/dashboard cũ hơn sẽ hiện banner yêu cầu chạy lại .bat
const express = require('express');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = parseInt(process.env.PORT) || 3005;
const DATA_DIR = path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const SESSION_FILE = path.join(DATA_DIR, 'session.json');
const FRAMES_FILE = path.join(DATA_DIR, 'frames.json');
const TTS_CACHE_DIR = path.join(DATA_DIR, 'tts_cache');
const FRAMES_DIR = path.join(__dirname, 'public', 'assets', 'frames');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(TTS_CACHE_DIR)) fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });

const MUSIC_TRACKS = ['off', 'vui', 'nhe', 'soi', 'tinh'];
const defaultSettings = {
  drawSeconds: 7,        // Thời gian vẽ 1 khung (5-10)
  spamSeconds: 600,      // Mỗi người tối đa 1 khung trong X giây
  minGiftCoins: 1,       // Quà từ X xu trở lên mới vào hàng đợi
  commentKeyword: '',    // Comment phải khớp nội dung này mới vào mốc 1 (trống = mọi comment)
  followOncePerSession: true,
  demoMode: true,        // Bật = chỉ nhận lượt thử, bỏ qua sự kiện thật
  bgMusic: 'off',        // Nhạc nền overlay: off/vui/nhe/soi/tinh
  musicVolume: 60,       // Âm lượng nhạc nền 0-100
  voiceEnabled: true,    // Giọng đọc cảm ơn mỗi lượt in
  voiceEngine: 'auto',   // auto = giọng Việt trình duyệt, thiếu thì dùng Google; browser/google = ép 1 loại
  tapEnabled: true,      // Bật sự kiện thả tim (tap/like)
  tapGoal: 20            // X tim = 1 khung mốc 1 (mặc định 20)
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const s = { ...defaultSettings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
      if (s.spamSeconds === undefined && s.spamMinutes !== undefined) {
        s.spamSeconds = Math.max(1, Math.floor(Number(s.spamMinutes) || 10) * 60); // migrate phút -> giây
      }
      delete s.spamMinutes;
      return s;
    }
  } catch (e) { console.error('Load settings lỗi:', e.message); }
  return { ...defaultSettings };
}
function saveSettings() {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8'); }
  catch (e) { console.error('Save settings lỗi:', e.message); }
}
let settings = loadSettings();
saveSettings();

// Khung vẽ 5 mốc (dashboard sửa, overlay đồng bộ).
// Mỗi mốc: khung mặc định (CSS) hoặc ảnh custom PNG do chủ live thiết kế,
// để trống 1 vòng tròn trong suốt để nhét avatar vào.
function defaultFrames() {
  return {
    1: { name: 'Mốc 1 — Khung giấy nhỏ', frameW: 320, frameH: 255, avatarSize: 192, avatarTop: 14, nameSize: 24, nameColor: '#333333', showThanks: false, thanksText: 'Thank you ❤', customImage: '', bgColor: '#fffdf8', borderColor: '#2a2a2a', updatedAt: 0 },
    2: { name: 'Mốc 2 — Khung viền vàng', frameW: 380, frameH: 255, avatarSize: 162, avatarTop: 18, nameSize: 24, nameColor: '#333333', showThanks: true, thanksText: 'Thank you ❤', customImage: '', bgColor: '#fffdf8', borderColor: '#b8860b', updatedAt: 0 },
    3: { name: 'Mốc 3 — Khung lớn ornate', frameW: 560, frameH: 370, avatarSize: 196, avatarTop: 20, nameSize: 36, nameColor: '#7a1f2b', showThanks: true, thanksText: 'Thank you ❤', customImage: '', bgColor: '#fffdf8', borderColor: '#b8860b', updatedAt: 0 },
    4: { name: 'Mốc 4 — Khung hào quang', frameW: 560, frameH: 370, avatarSize: 196, avatarTop: 20, nameSize: 36, nameColor: '#7a1f2b', showThanks: true, thanksText: 'Thank you ❤', customImage: '', bgColor: '#fffdf8', borderColor: '#d4a017', updatedAt: 0 },
    5: { name: 'Mốc 5 — Khung vinh danh', frameW: 800, frameH: 340, avatarSize: 196, avatarTop: 24, nameSize: 32, nameColor: '#7a1f2b', showThanks: true, thanksText: 'Thank you ❤', customImage: '', bgColor: '#fffdf8', borderColor: '#c81e3a', updatedAt: 0 }
  };
}
function loadFrames() {
  try {
    if (fs.existsSync(FRAMES_FILE)) {
      const base = defaultFrames();
      const saved = JSON.parse(fs.readFileSync(FRAMES_FILE, 'utf8'));
      for (const k of ['1', '2', '3', '4', '5']) {
        if (saved[k] && typeof saved[k] === 'object') base[k] = { ...base[k], ...saved[k] };
      }
      return base;
    }
  } catch (e) { console.error('Load frames lỗi:', e.message); }
  return defaultFrames();
}
function saveFrames() {
  try { fs.writeFileSync(FRAMES_FILE, JSON.stringify(frames, null, 2), 'utf8'); }
  catch (e) { console.error('Save frames lỗi:', e.message); }
}
let frames = loadFrames();
saveFrames();

// Phiên live (lưu file để khởi động lại không mất hàng đợi)
let session = {
  queue: [],            // [{qid, uid, name, avatar, kind, coins, giftName, enqueuedAt, test}]
  drawingRow: [],       // hàng đang vẽ: 1-4 entry + {startedAt, durationMs, tier, rowId, rowLayout}
  drawn: [],            // khung đã xong (tối đa 40)
  vipCoins: {},         // uid -> {name, coins, updatedAt}
  likeCounts: {},       // uid -> {name, count, updatedAt} — tim tích lũy chưa đổi khung
  followedUids: [],
  lastFrameAt: {},      // uid -> timestamp bắt đầu khung gần nhất
  logs: [],             // [{t, text, kind}]
  recentNotifies: [],   // [{text, at}]
  avatarStats: { total: 0, withAvatar: 0 },
  voiceStatus: null,    // {engine, label, at} do overlay báo về
  qidSeq: 0,
  rowSeq: 0
};
function saveSession() {
  try { fs.writeFileSync(SESSION_FILE, JSON.stringify(session), 'utf8'); }
  catch (e) { console.error('Save session lỗi:', e.message); }
}
function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const s = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      session = { ...session, ...s };
      if (!session.likeCounts || typeof session.likeCounts !== 'object') session.likeCounts = {};
      if (!session.vipCoins || typeof session.vipCoins !== 'object') session.vipCoins = {};
      if (!Array.isArray(session.drawingRow)) session.drawingRow = [];
      // Hàng đang vẽ dở khi tắt -> trả về đầu hàng đợi, không mất người
      // (kèm migrate bản cũ: drawing đơn -> hàng)
      const legacy = [];
      if (session.drawing) { legacy.push(session.drawing); delete session.drawing; }
      const back = [...legacy, ...session.drawingRow];
      if (back.length) {
        for (const d of back) { delete d.startedAt; delete d.durationMs; delete d.vip; delete d.tier; delete d.bare; delete d.rowId; delete d.rowLayout; }
        session.queue.unshift(...back);
        session.drawingRow = [];
      }
    }
  } catch (e) { console.error('Load session lỗi:', e.message); }
}
loadSession();

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));
// TikFinity có thể gửi sai content-type: đọc thêm form + text để không mất event
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.text({ type: ['text/plain', 'text/*'], limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

function addLog(text, kind = 'info') {
  session.logs.push({ t: Date.now(), text, kind });
  if (session.logs.length > 200) session.logs = session.logs.slice(-200);
}
function pushNotify(text) {
  session.recentNotifies.push({ text, at: Date.now() });
  if (session.recentNotifies.length > 10) session.recentNotifies = session.recentNotifies.slice(-10);
  io.emit('notify', { text });
}
// Tên loại sự kiện hiển thị cho người xem: luôn tiếng Việt (mã kind giữ nguyên để không gãy API).
function kindVi(kind) {
  if (kind === 'gift') return 'tặng quà';
  if (kind === 'comment') return 'bình luận';
  if (kind === 'follow') return 'theo dõi kênh';
  if (kind === 'share') return 'chia sẻ live';
  if (kind === 'join') return 'vào xem';
  if (kind === 'tap') return 'thả tim';
  return 'tương tác';
}
// Cụm tên quà kèm số lượng: 1 món chỉ đọc tên, nhiều món đọc "5 Hoa hồng" (không đọc số xu)
function giftPhrase(giftName, qty) {
  const g = giftName || 'quà tặng';
  return qty > 1 ? `${qty} ${g}` : g;
}
function notifyText(name, kind, giftName, qty, tapCount) {
  if (kind === 'gift') return `🎁 ${name} vừa tặng ${giftPhrase(giftName, qty)} — sắp được vẽ lên giấy!`;
  if (kind === 'comment') return `💬 ${name} vừa bình luận — đã vào hàng chờ vẽ!`;
  if (kind === 'follow') return `➕ ${name} vừa theo dõi kênh — cảm ơn bạn nhiều!`;
  if (kind === 'share') return `🔁 ${name} vừa chia sẻ live — đã vào hàng chờ vẽ!`;
  if (kind === 'tap') return `❤️ ${name} vừa thả ${tapCount || settings.tapGoal} tim — đã vào hàng chờ vẽ!`;
  return `✨ ${name} đã tương tác — đã vào hàng chờ vẽ!`;
}
// Chuẩn hóa chữ để so khớp comment: không dấu, không khoảng trắng, không phân biệt hoa thường
function normVi(s) {
  return String(s || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, '');
}
function commentMatches(text, keyword) {
  const k = String(keyword || '').trim();
  if (!k) return true; // chưa cài nội dung = mọi comment đều hợp lệ
  const t = String(text || '').trim();
  if (t === k) return true;
  const nt = normVi(t);
  return nt.length > 0 && nt === normVi(k);
}
function statePayload() {
  return {
    proto: PROTO,
    queue: session.queue.map(e => ({ ...e, tier: effectiveTier(e) })),
    drawingRow: session.drawingRow,
    drawn: session.drawn,
    vipTop: topList(),
    tapTop: tapList(),
    frames,
    settings,
    port: PORT,
    logs: session.logs.slice(-60),
    recentNotifies: session.recentNotifies,
    avatarStats: session.avatarStats,
    avatarWarning: session.avatarStats.total > 0 && session.avatarStats.withAvatar === 0,
    voiceStatus: session.voiceStatus || null,
    waitingCount: session.queue.length
  };
}
function broadcast() { io.emit('state-update', statePayload()); }

// ---------------- PHÂN TÍCH WEBHOOK TIKFINITY ----------------
function parseEvent(rawBody, query) {
  let bodyObj = (typeof rawBody === 'object' && rawBody !== null) ? rawBody : {};
  if (typeof rawBody === 'string' && rawBody.trim()) {
    const s = rawBody.trim();
    try { bodyObj = JSON.parse(s); } // text/plain chứa chuỗi JSON
    catch (e) {
      if (s.includes('=')) { // text dạng querystring: a=1&b=2
        try {
          const params = new URLSearchParams(s);
          const o = {};
          for (const [k, v] of params) o[k] = v;
          bodyObj = Object.keys(o).length ? o : { content: s.slice(0, 200) };
        } catch (e2) { bodyObj = { content: s.slice(0, 200) }; }
      } else {
        bodyObj = { content: s.slice(0, 200) }; // text thuần: coi như nội dung comment
      }
    }
    if (typeof bodyObj !== 'object' || bodyObj === null) bodyObj = {};
  }
  const data = { ...(query || {}), ...bodyObj };
  const innerData = [data.data, data.args, data.payload].find(v => typeof v === 'object' && v !== null) || {};
  const args = (typeof data.args === 'object' && data.args !== null) ? data.args : {};
  const triggerTypeId = Number(data.triggerTypeId || innerData.triggerTypeId || args.triggerTypeId || 0);
  const ev = [
    data.event, data.type, data.actionName, data.name, data.displayType, data.socialType,
    data.subType, data.label, data.value1, data.value2, data.value3, data.content,
    data.commandParams, data.message, innerData.event, innerData.type, innerData.action,
    innerData.name, innerData.content, innerData.message, innerData.commandParams
  ].map(s => String(s || '').toLowerCase()).join(' ');

  const userObj = [data.user, innerData.user].find(v => typeof v === 'object' && v !== null) || {};
  const uid = String(
    userObj.userId || userObj.id || userObj.user_id || data.userId || data.id || data.user_id ||
    innerData.userId || innerData.id || innerData.user_id || args.userId || args.user_id ||
    userObj.uniqueId || userObj.username || data.username || innerData.username || ''
  ).trim();
  const name = String(
    userObj.nickname || userObj.name || data.nickname || data.userName || data.user_name ||
    data.name || innerData.nickname || innerData.userName || innerData.name ||
    args.nickname || args.username || uid || 'Khán giả'
  ).trim().slice(0, 60) || 'Khán giả';
  const avatar = String(
    userObj.profilePictureUrl || userObj.avatarUrl || userObj.avatar || userObj.avatar_url ||
    userObj.avatar_thumb || userObj.profile_picture_url ||
    data.profilePictureUrl || data.avatarUrl || data.avatar || data.avatar_url ||
    data.avatar_thumb || data.profile_picture_url || data.avatar_large || data.profilePic ||
    innerData.profilePictureUrl || innerData.avatarUrl || innerData.avatar ||
    innerData.avatar_url || innerData.avatar_thumb || innerData.profile_picture_url ||
    args.profilePictureUrl || args.avatar || args.avatar_url || args.avatar_thumb || ''
  ).trim();

  // Share: chỉ xét các trường META (không xét nội dung chat) để comment có chữ
  // "share" không bị nhận nhầm thành chia sẻ. triggerTypeId 8 = Share (TikFinity).
  const evMeta = [
    data.event, data.type, data.actionName, data.name, data.displayType, data.socialType,
    data.subType, data.label, data.value1, data.value2, data.value3,
    innerData.event, innerData.type, innerData.action, innerData.name
  ].map(s => String(s || '').toLowerCase()).join(' ');
  const isShare = triggerTypeId === 8 || evMeta.includes('share') ||
    evMeta.includes('chia sẻ') || evMeta.includes('chia se');
  const isFollow = triggerTypeId === 1 || triggerTypeId === 2 ||
    ev.includes('follow') || ev.includes('theo dõi') || ev.includes('theo doi') ||
    ev.includes('member_follow') || ev.includes('subscribe');
  const isGift = triggerTypeId === 3 || ev.includes('gift') ||
    Boolean(data.giftName || data.gift || innerData.giftName || innerData.gift || args.giftName ||
      data.diamondCount || data.diamonds || data.coins || innerData.coins || args.coins);
  const isLike = triggerTypeId === 7 || evMeta.includes('like') || evMeta.includes('tap') ||
    ev.includes('member_like') || ev.includes('like_count') ||
    Boolean(data.likeCount || data.likes || innerData.likeCount || args.likeCount);
  const isJoin = triggerTypeId === 6 || (!isFollow && !isGift && !isLike &&
    (ev.includes('join') || ev.includes('member') || ev.includes('enter') || ev.includes('welcome')));
  const isChat = !isFollow && !isGift && !isLike && !isJoin && (triggerTypeId === 11 ||
    ev.includes('chat') || ev.includes('comment') ||
    Boolean(data.comment || data.content || data.text || data.message || data.commandParams ||
      innerData.comment || innerData.content || innerData.text || innerData.message));

  let kind = 'other';
  if (isGift) kind = 'gift';
  else if (isShare) kind = 'share';
  else if (isChat) kind = 'comment';
  else if (isFollow) kind = 'follow';
  else if (isJoin) kind = 'join';
  else if (isLike) kind = 'tap';

  // Xu quà: CHỈ lấy số thật trong sự kiện, không bao giờ đoán/mặc định
  const coinRaw = data.diamondCount ?? data.diamond_count ?? data.coins ?? data.diamonds ??
    innerData.diamondCount ?? innerData.coins ?? args.coins ?? data.gift?.diamond_count ??
    data.gift?.coins ?? null;
  const repeatRaw = data.repeatCount ?? data.count ?? data.combo ?? innerData.repeatCount ?? args.repeatCount ?? 1;
  const qty = Math.max(1, parseInt(repeatRaw) || 1); // số lượng quà: đọc "5 Hoa hồng", 1 thì chỉ đọc tên
  let coins = null;
  if (coinRaw !== null && coinRaw !== '' && !isNaN(Number(coinRaw))) {
    coins = Math.floor(Number(coinRaw));
    if (qty > 1 && coins > 0 && coins < qty) coins = coins * qty; // đây là đơn giá -> nhân số lượng
  }
  const giftName = String(
    data.giftName || data.gift?.name || data.gift?.gift_name || innerData.giftName ||
    innerData.gift?.name || args.giftName || (typeof data.gift === 'string' ? data.gift : '') || 'Quà'
  ).slice(0, 60);
  const text = String(
    data.comment ?? data.content ?? data.text ?? data.message ?? data.commandParams ??
    innerData.comment ?? innerData.content ?? innerData.text ?? innerData.message ??
    args.comment ?? args.text ?? ''
  ).slice(0, 200);

  // Số tim trong 1 sự kiện Like/Tap (TikFinity gom theo đợt, VD 5-20 tim/lần)
  const likeRaw = data.likeCount ?? data.likes ?? data.count ?? data.tapCount ??
    innerData.likeCount ?? innerData.likes ?? args.likeCount ?? args.count ?? null;
  let likeCount = 1;
  if (likeRaw !== null && likeRaw !== '' && !isNaN(Number(likeRaw))) {
    likeCount = Math.max(1, Math.floor(Number(likeRaw)));
  }

  return { uid, name, avatar, kind, coins, giftName, text, qty, likeCount };
}

// ---------------- LUỒNG VÀO HÀNG ĐỢI ----------------
function topList() {
  return Object.entries(session.vipCoins)
    .map(([uid, v]) => ({ uid, name: v.name, coins: v.coins, updatedAt: v.updatedAt, tier: tierOf(uid) }))
    .sort((a, b) => b.coins - a.coins || a.updatedAt - b.updatedAt);
}
function tapList() {
  return Object.entries(session.likeCounts || {})
    .map(([uid, v]) => ({ uid, name: v.name, count: v.count, goal: settings.tapGoal, updatedAt: v.updatedAt }))
    .sort((a, b) => b.count - a.count || a.updatedAt - b.updatedAt);
}
const TIER_MIN = { 2: 5, 3: 10, 4: 20, 5: 50 }; // tổng xu tích lũy tối thiểu cho bậc 2/3/4/5
const TIER_HOLD_MS = { 1: 1000, 2: 2000, 3: 3000, 4: 5000, 5: 7000 }; // giữ khung sau khi in xong
const totalOf = (uid) => (session.vipCoins[uid] ? session.vipCoins[uid].coins : 0);
function tierOf(uid) {
  const t = totalOf(uid);
  if (t >= TIER_MIN[5]) return 5;
  if (t >= TIER_MIN[4]) return 4;
  if (t >= TIER_MIN[3]) return 3;
  if (t >= TIER_MIN[2]) return 2;
  return 1;
}
// Mốc của 1 KHUNG trong đợi (khác mốc của NGƯỜI):
// - khung quà: theo tổng xu tích lũy (cộng dồn cả lúc chờ)
// - khung tim/bình luận/theo dõi/chia sẻ: chỉ tính xu MỚI từ lúc vào đợi
//   (thường = 0 -> mốc 1; tặng quà lúc đang chờ thì khung được nâng theo)
function effectiveCoins(entry) {
  if (!entry) return 0;
  if (entry.kind === 'gift') return totalOf(entry.uid);
  const base = (entry.base === undefined || entry.base === null) ? 0 : entry.base;
  return Math.max(0, totalOf(entry.uid) - base);
}
function tierFromCoins(c) {
  if (c >= TIER_MIN[5]) return 5;
  if (c >= TIER_MIN[4]) return 4;
  if (c >= TIER_MIN[3]) return 3;
  if (c >= TIER_MIN[2]) return 2;
  return 1;
}
function effectiveTier(entry) {
  if (!entry) return 1;
  if (entry.kind === 'gift') return tierOf(entry.uid);
  return tierFromCoins(effectiveCoins(entry));
}

function tryEnqueue({ uid, name, avatar, kind, coins, giftName, text, qty, test, tapCount }) {
  if (!uid) { addLog(`⚠️ Sự kiện ${kindVi(kind)} thiếu ID người dùng, bỏ qua.`, 'warn'); return { queued: false }; }
  const alreadyDrawing = session.drawingRow.some(e => e.uid === uid);
  const alreadyQueued = session.queue.some(e => e.uid === uid);
  // Nâng mốc giữa lúc đang vẽ: quà mới đẩy lên mốc CAO HƠN khung đang vẽ dở
  // -> xếp thêm 1 khung mới cho mốc đó (bỏ qua chặn trùng + chống spam cho lượt này).
  // Khung đang chờ thì không cần tách vì tới lượt nó tự nâng mốc theo tổng mới.
  let tierUpgrade = false;
  if (alreadyDrawing && !alreadyQueued && kind === 'gift') {
    const drawing = session.drawingRow.find(e => e.uid === uid);
    if (drawing && tierOf(uid) > (drawing.tier || 1)) tierUpgrade = true;
  }
  // Đã chờ / đang vẽ -> không tạo khung mới
  if (alreadyDrawing && !tierUpgrade) {
    addLog(`ℹ️ [${name}] đang được vẽ, lượt ${kindVi(kind)} mới không tạo thêm khung.`, 'info');
    return { queued: false, reason: 'drawing' };
  }
  if (alreadyQueued) {
    addLog(`ℹ️ [${name}] đã có trong hàng đợi, lượt ${kindVi(kind)} mới không tạo thêm khung.`, 'info');
    return { queued: false, reason: 'queued' };
  }
  // Chống spam: 1 khung mỗi X giây
  const last = session.lastFrameAt[uid] || 0;
  const spamMs = Math.max(1, settings.spamSeconds) * 1000;
  if (!tierUpgrade && Date.now() - last < spamMs) {
    const leftSec = Math.ceil((spamMs - (Date.now() - last)) / 1000);
    addLog(`⏳ [${name}] ${kindVi(kind)} trong thời gian chống spam (còn ~${leftSec} giây), không tạo khung mới.`, 'info');
    return { queued: false, reason: 'spam' };
  }
  session.qidSeq += 1;
  const entry = {
    qid: session.qidSeq, uid, name, avatar: avatar || null,
    kind, coins: coins || 0, base: totalOf(uid),
    giftName: giftName || '', qty: Math.max(1, parseInt(qty) || 1),
    text: kind === 'comment' ? String(text || '') : '',
    tapCount: kind === 'tap' ? (tapCount || settings.tapGoal) : 0,
    enqueuedAt: Date.now(), test: !!test
  };
  session.queue.push(entry);
  sortQueue(); // ưu tiên mốc cao: xếp lại ngay để dashboard thấy đúng thứ tự in
  pushNotify(notifyText(name, kind, giftName, entry.qty, entry.tapCount));
  addLog(`📥 [${name}] ${kindVi(kind)} — vào hàng đợi (vị trí ${session.queue.length}).`, 'queue');
  saveSession();
  broadcast();
  pumpQueue();
  return { queued: true, entry };
}

function handleIntake(ev, source) {
  const { uid, name, avatar, kind, coins, giftName, text, likeCount } = ev;
  if (kind === 'gift') {
    if (!uid) {
      addLog('⚠️ Quà tặng thiếu ID người dùng, bỏ qua.', 'warn');
      saveSession(); broadcast();
      return { queued: false };
    }
    if (coins === null || isNaN(coins) || coins < settings.minGiftCoins) {
      if (uid) session.avatarStats.total += 1;
      if (avatar && uid) session.avatarStats.withAvatar += 1;
      addLog(`⚠️ [${name}] tặng "${giftName}" nhưng không rõ số xu (>= ${settings.minGiftCoins}) — chỉ log, không vào hàng đợi, không tính tổng xu quà.`, 'warn');
      saveSession(); broadcast();
      return { queued: false };
    }
    const prev = session.vipCoins[uid];
    session.vipCoins[uid] = {
      name, coins: (prev ? prev.coins : 0) + coins,
      updatedAt: prev ? prev.updatedAt : Date.now()
    };
    addLog(`🎁 [${name}] tặng "${giftName}" +${coins} xu (tổng xu quà: ${session.vipCoins[uid].coins} xu).`, 'gift');
    if (uid) { session.avatarStats.total += 1; if (avatar) session.avatarStats.withAvatar += 1; }
    const r = tryEnqueue({ ...ev, coins });
    saveSession(); broadcast();
    return r;
  }
  if (kind === 'comment') {
    if (uid) { session.avatarStats.total += 1; if (avatar) session.avatarStats.withAvatar += 1; }
    if (!commentMatches(text, settings.commentKeyword)) {
      addLog(`💬 [${name}] bình luận "${String(text || '').slice(0, 60)}" — không khớp nội dung "${settings.commentKeyword}", chỉ log, không vào mốc 1.`, 'chat');
      saveSession(); broadcast();
      return { queued: false, reason: 'mismatch' };
    }
    addLog(`💬 [${name}] bình luận "${String(text || '').slice(0, 60)}" — khớp nội dung, xét vào mốc 1.`, 'chat');
    const r = tryEnqueue(ev);
    saveSession(); broadcast();
    return r;
  }
  if (kind === 'follow') {
    if (!uid) {
      addLog('⚠️ Lượt theo dõi thiếu ID người dùng, bỏ qua.', 'warn');
      saveSession(); broadcast();
      return { queued: false };
    }
    if (uid) { session.avatarStats.total += 1; if (avatar) session.avatarStats.withAvatar += 1; }
    if (settings.followOncePerSession && session.followedUids.includes(uid)) {
      addLog(`ℹ️ [${name}] đã theo dõi trong phiên này rồi, không tạo khung mới.`, 'info');
      saveSession(); broadcast();
      return { queued: false };
    }
    if (!session.followedUids.includes(uid)) session.followedUids.push(uid);
    addLog(`➕ [${name}] đã theo dõi kênh — xét vào hàng đợi.`, 'follow');
    const r = tryEnqueue(ev);
    saveSession(); broadcast();
    return r;
  }
  if (kind === 'share') {
    if (uid) { session.avatarStats.total += 1; if (avatar) session.avatarStats.withAvatar += 1; }
    addLog(`🔁 [${name}] đã chia sẻ live — xét vào hàng đợi.`, 'share');
    const r = tryEnqueue(ev);
    saveSession(); broadcast();
    return r;
  }
  if (kind === 'tap') {
    if (uid) { session.avatarStats.total += 1; if (avatar) session.avatarStats.withAvatar += 1; }
    if (!settings.tapEnabled) {
      addLog(`❤️ [${name}] thả tim — sự kiện tim đang TẮT, chỉ log.`, 'info');
      saveSession(); broadcast();
      return { queued: false, reason: 'tap-off' };
    }
    if (!uid) {
      addLog('⚠️ Lượt thả tim thiếu ID người dùng, bỏ qua.', 'warn');
      saveSession(); broadcast();
      return { queued: false };
    }
    const add = Math.max(1, parseInt(likeCount) || 1);
    const prev = session.likeCounts[uid] || { name, count: 0, updatedAt: Date.now() };
    prev.name = name;
    prev.count += add;
    prev.updatedAt = prev.updatedAt || Date.now();
    session.likeCounts[uid] = prev;
    const goal = Math.max(1, settings.tapGoal || 20);
    if (prev.count >= goal) {
      const total = prev.count;
      prev.count = prev.count % goal; // giữ phần dư cho vòng sau
      addLog(`❤️ [${name}] đủ ${total} tim (>= ${goal}) — đổi 1 khung mốc 1!`, 'tap');
      const r = tryEnqueue({ ...ev, tapCount: total });
      if (!r.queued) prev.count = total; // đang chờ/đang vẽ/chống spam: giữ nguyên tim, đợt sau thử lại
      saveSession(); broadcast();
      return r;
    }
    addLog(`❤️ [${name}] thả +${add} tim (tích lũy ${prev.count}/${goal}).`, 'tap');
    saveSession(); broadcast();
    return { queued: false, reason: 'tap-progress', count: prev.count, goal };
  }
  // join / other: chỉ log
  addLog(`👁️ [${name}] ${kindVi(kind)} — chỉ log, không vào hàng đợi.`, 'info');
  saveSession(); broadcast();
  return { queued: false };
}

// ---------------- MÁY VẼ (in theo HÀNG, đúng video mẫu) ----------------
// Mỗi lượt in 1 hàng: bậc 1 gom tối đa 4/hàng (lưới 2x2); bậc 2/3/4/5 luôn solo.
// Thứ tự ƯU TIÊN: bậc cao in trước, cùng bậc tổng xu cao trước, rồi vào trước in trước
// (bình luận/theo dõi/chia sẻ = 0 xu nên thường in sau quà).
let drawTimer = null, advanceTimer = null, clearTimer = null, awaitingClear = false;
const ROW_GAP_MS = 800;   // khung trống trượt vào ổ in trước khi in
const CLEAR_MS = 900;     // băng chạy xuống cuốn hàng cũ khỏi màn hình
const CLEAR_SETTLE_MS = 50;
function sortQueue() {
  // Bậc cao trước (mốc của KHUNG), cùng bậc xu hiệu lực cao trước, rồi vào trước trước
  session.queue.sort((a, b) => (effectiveTier(b) - effectiveTier(a)) ||
    (effectiveCoins(b) - effectiveCoins(a)) || ((a.qid || 0) - (b.qid || 0)));
}
function pumpQueue() {
  if (session.drawingRow.length || drawTimer || advanceTimer || clearTimer || awaitingClear) return;
  sortQueue();
  const first = session.queue.shift();
  if (!first) { broadcast(); return; } // hàng đợi trống: giấy + giàn ray đứng yên
  const durationMs = Math.min(10, Math.max(5, settings.drawSeconds)) * 1000;
  session.rowSeq += 1;
  const rowId = session.rowSeq;
  const tier = effectiveTier(first); // mốc của KHUNG lúc tới lượt (quà: tổng xu; còn lại: xu mới)
  const row = [{ ...first, durationMs, tier, rowId, rowLayout: '' }];
  session.lastFrameAt[first.uid] = Date.now();
  let batchNote = '';
  if (tier === 1) {
    // Bậc 1: gom tối đa 4 người/lượt (lưới 2 hàng x 2 ảnh), in avatar + tên
    while (row.length < 4 && session.queue.length && effectiveTier(session.queue[0]) === 1) {
      const e = session.queue.shift();
      row.push({ ...e, durationMs, tier: 1, rowId, rowLayout: '' });
      session.lastFrameAt[e.uid] = Date.now();
    }
    const lay = row.length <= 2 ? (row.length === 1 ? 't1solo' : 't1pair') : 't1grid';
    row.forEach(e => { e.rowLayout = lay; });
    if (row.length > 1) batchNote = ` (gom ${row.length} bậc 1)`;
  } else {
    // Bậc 2/3/4/5: luôn solo
    row[0].rowLayout = tier === 2 ? 't2' : tier === 3 ? 't3' : tier === 4 ? 't4' : 't5';
  }
  session.drawingRow = row;
  const names = row.map(e => `[${e.name}]`).join(' + ');
  addLog(`🖌️ Tới lượt ${names} (bậc ${tier}, hàng ${row[0].rowLayout})${batchNote}.`, 'draw');
  saveSession();
  // Báo khung trống trượt vào trước, 800ms sau mới in: giấy LUÔN đứng yên trong lúc in
  io.emit('row-advance', { rowId, layout: row[0].rowLayout, entries: row });
  broadcast();
  advanceTimer = setTimeout(() => {
    advanceTimer = null;
    const startedAt = Date.now();
    for (const e of session.drawingRow) e.startedAt = startedAt;
    io.emit('frame-start', { entries: session.drawingRow, layout: row[0].rowLayout, durationMs, startedAt, holdMs: TIER_HOLD_MS[tier] || 1000 });
    broadcast();
    saveSession();
    drawTimer = setTimeout(finishDrawing, durationMs);
  }, ROW_GAP_MS);
}
function finishDrawing() {
  drawTimer = null;
  if (!session.drawingRow.length) { pumpQueue(); return; }
  const qids = [];
  for (const e of session.drawingRow) {
    const done = { ...e, drawnAt: Date.now() };
    session.drawn.push(done);
    qids.push(done.qid);
    addLog(`✅ Vẽ xong [${done.name}] (bậc ${done.tier || 1}).`, 'draw');
  }
  if (session.drawn.length > 40) session.drawn = session.drawn.slice(-40);
  const clearedRowId = session.drawingRow.length ? session.drawingRow[0].rowId : null;
  const holdTier = session.drawingRow.length ? (session.drawingRow[0].tier || 1) : 1;
  session.drawingRow = [];
  saveSession();
  io.emit('frame-done', { qids });
  broadcast();
  // In xong: giữ theo bậc (1/2/3/5/7s) cho người xem nhìn, rồi băng chạy xuống
  // cuốn hàng cũ đi (chỉ để lại giấy trắng), xong mới xếp hàng tiếp
  const holdMs = TIER_HOLD_MS[holdTier] || 1000;
  awaitingClear = true;
  clearTimer = setTimeout(() => {
    if (clearedRowId !== null) io.emit('row-clear', { rowId: clearedRowId });
    broadcast();
    clearTimer = setTimeout(() => {
      clearTimer = null;
      awaitingClear = false;
      pumpQueue();
    }, CLEAR_MS + CLEAR_SETTLE_MS);
  }, holdMs);
}

// ---------------- API ----------------
app.post('/api/webhook', (req, res) => {
  const ev = parseEvent(req.body, req.query);
  if (ev.kind === 'other' || !ev.uid) {
    // Event TikFinity gửi về nhưng không nhận diện được: ghi rõ để sửa config cho đúng
    let rawPrev = '';
    try { rawPrev = (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)).slice(0, 300); }
    catch (e) { rawPrev = String(req.body).slice(0, 300); }
    addLog(`🔍 Webhook chưa nhận diện (loại=${ev.kind}, content-type=${req.get('content-type') || 'không có'}): ${rawPrev || '(body trống)'}. Kiểm tra body trong TikFinity có đủ userId + loại sự kiện không.`, 'warn');
  }
  if (settings.demoMode) {
    addLog(`🧪 Chế độ thử: bỏ qua sự kiện thật (${kindVi(ev.kind)}) từ [${ev.name}].`, 'info');
    saveSession(); broadcast();
    return res.json({ received: true, demoMode: true });
  }
  const r = handleIntake(ev, 'webhook');
  res.json({ received: true, kind: ev.kind, queued: !!r.queued });
});

app.get('/api/state', (req, res) => res.json(statePayload()));

app.post('/api/settings', (req, res) => {
  const b = req.body || {};
  if (b.drawSeconds !== undefined) settings.drawSeconds = Math.min(10, Math.max(5, Number(b.drawSeconds) || 7));
  if (b.spamSeconds !== undefined) settings.spamSeconds = Math.min(86400, Math.max(1, Math.floor(Number(b.spamSeconds)) || 600));
  else if (b.spamMinutes !== undefined) settings.spamSeconds = Math.min(86400, Math.max(1, Math.floor(Number(b.spamMinutes) || 10) * 60));
  if (b.minGiftCoins !== undefined) settings.minGiftCoins = Math.min(10000, Math.max(1, Math.floor(Number(b.minGiftCoins)) || 1));
  if (b.commentKeyword !== undefined) settings.commentKeyword = String(b.commentKeyword || '').slice(0, 100);
  if (b.followOncePerSession !== undefined) settings.followOncePerSession = !!b.followOncePerSession;
  if (b.demoMode !== undefined) settings.demoMode = !!b.demoMode;
  if (b.bgMusic !== undefined && MUSIC_TRACKS.includes(b.bgMusic)) settings.bgMusic = b.bgMusic;
  if (b.musicVolume !== undefined) settings.musicVolume = Math.min(100, Math.max(0, Number(b.musicVolume) || 0));
  if (b.voiceEnabled !== undefined) settings.voiceEnabled = !!b.voiceEnabled;
  if (b.voiceEngine !== undefined && ['auto', 'browser', 'google'].includes(b.voiceEngine)) settings.voiceEngine = b.voiceEngine;
  if (b.tapEnabled !== undefined) settings.tapEnabled = !!b.tapEnabled;
  if (b.tapGoal !== undefined) settings.tapGoal = Math.min(10000, Math.max(1, Math.floor(Number(b.tapGoal)) || 20));
  saveSettings();
  addLog(`⚙️ Đã lưu cài đặt: vẽ ${settings.drawSeconds}s/khung, chống spam ${settings.spamSeconds} giây, quà từ ${settings.minGiftCoins} xu, comment "${settings.commentKeyword || 'mọi nội dung'}", tim ${settings.tapEnabled ? settings.tapGoal + '/khung' : 'TẮT'}, chế độ thử ${settings.demoMode ? 'BẬT' : 'TẮT'}.`, 'system');
  saveSession(); broadcast();
  res.json({ success: true, settings });
});

app.post('/api/session/reset', (req, res) => {
  if (drawTimer) { clearTimeout(drawTimer); drawTimer = null; }
  if (advanceTimer) { clearTimeout(advanceTimer); advanceTimer = null; }
  if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
  awaitingClear = false;
  session.queue = []; session.drawingRow = []; session.drawn = [];
  session.vipCoins = {}; session.likeCounts = {}; session.followedUids = []; session.lastFrameAt = {};
  session.recentNotifies = [];
  session.avatarStats = { total: 0, withAvatar: 0 };
  addLog('🔄 Đã làm mới phiên: hàng đợi + giấy + tổng xu quà + tim về trống.', 'system');
  saveSession(); broadcast();
  io.emit('session-reset');
  res.json({ success: true });
});

app.post('/api/queue/remove', (req, res) => {
  const qid = Number(req.body && req.body.qid);
  const before = session.queue.length;
  session.queue = session.queue.filter(e => e.qid !== qid);
  if (session.queue.length !== before) {
    addLog(`🗑️ Chủ live đã xóa 1 người khỏi hàng đợi (khung #${qid}).`, 'system');
    saveSession(); broadcast();
  }
  res.json({ success: true, removed: before - session.queue.length });
});

// Lượt thử: chỉ chạy khi bật chế độ thử, đi đúng luồng thật
function needDemo(req, res) {
  if (!settings.demoMode) {
    res.status(400).json({ success: false, message: 'Bật chế độ thử trước khi thử.' });
    return false;
  }
  return true;
}
const testUid = (p) => `test_${p}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
app.post('/api/test/gift', (req, res) => {
  if (!needDemo(req, res)) return;
  const n = (req.body && req.body.name) || 'Người Thử Quà';
  const coins = Math.max(1, Math.floor(Number(req.body && req.body.coins) || 10));
  const qty = Math.max(1, Math.floor(Number(req.body && req.body.qty) || 1));
  const giftName = String((req.body && req.body.giftName) || 'Quà tặng thử').slice(0, 60);
  const r = handleIntake({ uid: testUid('gift'), name: n, avatar: '', kind: 'gift', coins, giftName, qty, test: true });
  res.json({ success: true, queued: !!r.queued, coins, qty });
});
app.post('/api/test/share', (req, res) => {
  if (!needDemo(req, res)) return;
  const n = (req.body && req.body.name) || 'Người Thử Chia Sẻ';
  const r = handleIntake({ uid: testUid('shr'), name: n, avatar: '', kind: 'share', coins: 0, giftName: '', test: true });
  res.json({ success: true, queued: !!r.queued });
});
app.post('/api/test/comment', (req, res) => {
  if (!needDemo(req, res)) return;
  const n = (req.body && req.body.name) || 'Người Thử Bình Luận';
  const t = (req.body && req.body.text) || settings.commentKeyword || 'Bình luận thử';
  const r = handleIntake({ uid: testUid('cmt'), name: n, avatar: '', kind: 'comment', coins: 0, giftName: '', text: t, test: true });
  res.json({ success: true, queued: !!r.queued });
});
app.post('/api/test/follow', (req, res) => {
  if (!needDemo(req, res)) return;
  const n = (req.body && req.body.name) || 'Người Thử Theo Dõi';
  const r = handleIntake({ uid: testUid('flw'), name: n, avatar: '', kind: 'follow', coins: 0, giftName: '', test: true });
  res.json({ success: true, queued: !!r.queued });
});
app.post('/api/test/top1', (req, res) => {
  if (!needDemo(req, res)) return;
  const n = ((req.body && req.body.name) || '').trim() || 'Nguoi Top 1';
  // Quà to vượt mốc bậc 5 (50 xu) để luôn ra khung xịn nhất
  const cur = topList()[0];
  const coins = Math.max(500, (cur ? cur.coins : 0) + 1);
  const r = handleIntake({ uid: testUid('top1'), name: n, avatar: '', kind: 'gift', coins, giftName: 'Quà bậc 5', test: true });
  res.json({ success: true, queued: !!r.queued, name: n, coins });
});
app.post('/api/test/tap', (req, res) => {
  if (!needDemo(req, res)) return;
  const n = (req.body && req.body.name) || 'Người Thử Thả Tim';
  const count = Math.max(1, Math.floor(Number(req.body && req.body.count) || settings.tapGoal || 20));
  const uid = (req.body && req.body.uid) ? String(req.body.uid) : testUid('tap');
  const r = handleIntake({ uid, name: n, avatar: '', kind: 'tap', likeCount: count, test: true });
  res.json({ success: true, queued: !!r.queued, count });
});

// ---------------- KHUNG VẼ 5 MỐC ----------------
app.get('/api/frames', (req, res) => res.json({ success: true, frames }));
function sanitizeFrame(tier, b) {
  const base = defaultFrames()[tier];
  const f = { ...frames[tier] };
  if (b.name !== undefined) f.name = String(b.name || '').slice(0, 60) || base.name;
  if (b.frameW !== undefined) f.frameW = Math.min(1000, Math.max(150, parseInt(b.frameW) || base.frameW));
  if (b.frameH !== undefined) f.frameH = Math.min(1200, Math.max(150, parseInt(b.frameH) || base.frameH));
  if (b.avatarSize !== undefined) f.avatarSize = Math.min(800, Math.max(40, parseInt(b.avatarSize) || base.avatarSize));
  if (b.avatarTop !== undefined) f.avatarTop = Math.min(1000, Math.max(0, parseInt(b.avatarTop) || 0));
  if (b.nameSize !== undefined) f.nameSize = Math.min(80, Math.max(10, parseInt(b.nameSize) || base.nameSize));
  if (b.nameColor !== undefined && /^#[0-9a-fA-F]{3,8}$/.test(String(b.nameColor))) f.nameColor = String(b.nameColor);
  if (b.showThanks !== undefined) f.showThanks = !!b.showThanks;
  if (b.thanksText !== undefined) f.thanksText = String(b.thanksText || '').slice(0, 60);
  if (b.bgColor !== undefined && /^#[0-9a-fA-F]{3,8}$/.test(String(b.bgColor))) f.bgColor = String(b.bgColor);
  if (b.borderColor !== undefined && /^#[0-9a-fA-F]{3,8}$/.test(String(b.borderColor))) f.borderColor = String(b.borderColor);
  f.updatedAt = Date.now();
  return f;
}
app.post('/api/frames', (req, res) => {
  const b = req.body || {};
  if (b.tier !== undefined) {
    const t = String(b.tier);
    if (!['1', '2', '3', '4', '5'].includes(t)) return res.status(400).json({ success: false, message: 'Mốc phải 1-5.' });
    frames[t] = sanitizeFrame(t, b);
    saveFrames();
    addLog(`🖼️ Đã lưu khung mốc ${t} (${frames[t].name}). Overlay đồng bộ ngay.`, 'system');
    saveSession(); broadcast();
    return res.json({ success: true, frames });
  }
  if (b.frames && typeof b.frames === 'object') {
    for (const t of ['1', '2', '3', '4', '5']) {
      if (b.frames[t]) frames[t] = sanitizeFrame(t, b.frames[t]);
    }
    saveFrames();
    addLog('🖼️ Đã lưu khung vẽ 5 mốc. Overlay đồng bộ ngay.', 'system');
    saveSession(); broadcast();
    return res.json({ success: true, frames });
  }
  return res.status(400).json({ success: false, message: 'Thiếu dữ liệu khung.' });
});
app.post('/api/frames/upload', (req, res) => {
  const b = req.body || {};
  const t = String(b.tier || '');
  if (!['1', '2', '3', '4', '5'].includes(t)) return res.status(400).json({ success: false, message: 'Mốc phải 1-5.' });
  const dataUrl = String(b.dataUrl || '');
  const m = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
  if (!m) return res.status(400).json({ success: false, message: 'Ảnh phải là PNG/JPG/WebP (base64). Nên dùng PNG nền trong suốt, để trống vòng tròn cho avatar.' });
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  let buf;
  try { buf = Buffer.from(m[2], 'base64'); } catch (e) { return res.status(400).json({ success: false, message: 'Ảnh lỗi, không đọc được.' }); }
  if (!buf.length || buf.length > 8 * 1024 * 1024) return res.status(400).json({ success: false, message: 'Ảnh quá lớn (tối đa 8MB).' });
  try {
    // Xóa file cũ khác đuôi
    for (const e of ['png', 'jpg', 'webp']) {
      const p = path.join(FRAMES_DIR, `tier${t}.${e}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    const fileName = `tier${t}.${ext}`;
    fs.writeFileSync(path.join(FRAMES_DIR, fileName), buf);
    frames[t].customImage = `/assets/frames/${fileName}?v=${Date.now()}`;
    frames[t].updatedAt = Date.now();
    saveFrames();
    addLog(`🖼️ Đã thay ảnh khung mốc ${t} (${fileName}). Overlay dùng khung mới ngay.`, 'system');
    saveSession(); broadcast();
    res.json({ success: true, frames });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Không lưu được ảnh: ' + e.message });
  }
});
app.post('/api/frames/remove-image', (req, res) => {
  const t = String((req.body && req.body.tier) || '');
  if (!['1', '2', '3', '4', '5'].includes(t)) return res.status(400).json({ success: false, message: 'Mốc phải 1-5.' });
  try {
    for (const e of ['png', 'jpg', 'webp']) {
      const p = path.join(FRAMES_DIR, `tier${t}.${e}`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch (e) {}
  frames[t].customImage = '';
  frames[t].updatedAt = Date.now();
  saveFrames();
  addLog(`🖼️ Đã xóa ảnh custom mốc ${t}, về khung mặc định.`, 'system');
  saveSession(); broadcast();
  res.json({ success: true, frames });
});
// GOOGLE TTS PROXY (giong buong giam): server tai mp3 tieng Viet ve,
// overlay/dashboard chi phat file tu server, khong goi thang sang Google tu trinh duyet.
function fetchTtsChunk(q) {
  return new Promise((resolve, reject) => {
    const cleanQ = (q || '').trim();
    if (!cleanQ) return resolve(Buffer.alloc(0));
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanQ)}&tl=vi&client=tw-ob`;
    https.get(url, (ttsRes) => {
      if (ttsRes.statusCode === 200) {
        const chunks = [];
        ttsRes.on('data', c => chunks.push(c));
        ttsRes.on('end', () => resolve(Buffer.concat(chunks)));
      } else {
        ttsRes.resume();
        reject(new Error(`TTS status ${ttsRes.statusCode}`));
      }
    }).on('error', reject);
  });
}
async function fetchLongTts(str) {
  if (!str || !str.trim()) return Buffer.alloc(0);
  const clean = str.trim();
  if (clean.length <= 180) return await fetchTtsChunk(clean);
  const parts = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  const buffers = [];
  let currentChunk = '';
  for (const part of parts) {
    if ((currentChunk + ' ' + part).trim().length <= 180) {
      currentChunk = (currentChunk + ' ' + part).trim();
    } else {
      if (currentChunk) buffers.push(await fetchTtsChunk(currentChunk));
      currentChunk = part.trim();
    }
  }
  if (currentChunk) buffers.push(await fetchTtsChunk(currentChunk));
  return Buffer.concat(buffers);
}
app.get('/api/tts', async (req, res) => {
  const rawText = String(req.query.text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!rawText) return res.status(400).send('No text');
  const hash = crypto.createHash('md5').update(rawText).digest('hex');
  const cachePath = path.join(TTS_CACHE_DIR, `${hash}.mp3`);
  try {
    if (fs.existsSync(cachePath)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      return fs.createReadStream(cachePath).pipe(res);
    }
    const audioBuffer = await fetchLongTts(rawText);
    if (audioBuffer && audioBuffer.length > 0) {
      try { fs.writeFileSync(cachePath, audioBuffer); } catch (e) {}
      res.setHeader('Content-Type', 'audio/mpeg');
      return res.send(audioBuffer);
    }
    return res.status(502).send('TTS empty');
  } catch (err) {
    console.error('TTS proxy lỗi:', err.message);
    return res.status(502).send('TTS failed');
  }
});
app.post('/api/test/voice', (req, res) => {
  const t = String((req.body && req.body.text) || 'Xin chào! Đây là giọng đọc thử của màn hình vẽ avatar.').slice(0, 200);
  io.emit('voice-test', { text: t });
  addLog('🔊 Đã gửi lệnh thử giọng đọc tới overlay.', 'system');
  saveSession(); broadcast();
  res.json({ success: true });
});
app.post('/api/test/clear-queue', (req, res) => {
  if (!needDemo(req, res)) return;
  const before = session.queue.length;
  session.queue = session.queue.filter(e => !e.test);
  addLog(`🧹 Đã xóa ${before - session.queue.length} khung thử khỏi hàng đợi.`, 'system');
  saveSession(); broadcast();
  res.json({ success: true });
});

io.on('connection', (socket) => {
  socket.emit('state-update', statePayload());
  socket.on('voice-status', (d) => {
    if (!d || typeof d !== 'object') return;
    session.voiceStatus = { engine: String(d.engine || ''), label: String(d.label || '').slice(0, 80), locked: !!d.locked, at: Date.now() };
    saveSession(); broadcast();
  });
});

server.listen(PORT, () => {
  console.log(`[VE-AVATAR] Bảng điều khiển http://localhost:${PORT} | Màn hình live http://localhost:${PORT}/overlay.html`);
  pumpQueue();
});
