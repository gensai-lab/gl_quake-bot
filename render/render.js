'use strict';
// GenLab Quake Bot 用 描画スクリプト（地震情報 v4 の app.js から描画部分を抜き出したもの）
// ブラウザ(Chromium)上で動かし、window.renderQuake(電文の配列) で 1920x1080 の PNG(dataURL) を返す
const W = 1920, H = 1080, BAR = 156;
const cv = document.getElementById('cv');
const qlog = (l, m, d) => console.log('[' + l + '] ' + m + (d === undefined ? '' : ' ' + (typeof d === 'string' ? d : JSON.stringify(d))));
function redraw() { }
// v4の設定値（設定画面の現在値を固定）
const cfg = {
  hist: 80, panel: true, px: 30, py: 183, pw: 420, ps: 30, prow: 8, cityDeg: 3,
  sIcon: 48, mIcon: 32, shingen: 60, labels: false, showTest: false,
  tx: 628, ty: 64, tw: 440, ts: 50, nx: 628, ny: 131, nw: 440, ns: 50,
  mx: 1226, my: 64, mw: 440, ms: 50, dx: 1226, dy: 131, dw: 440, ds: 50,
  fitMode: 'mid', feat: '"palt" 1', tl: 2, nl: 2, ml: 2, dl: 2,
  stretch: 1.15, lwS: 1.5, lwP: 2.2, colS: '#AAAAAA', colP: '#666666', base: 'data/'
};
// Adobe Fontsは使えないため、UD系の代替フォントを使う（Actionsのランナーに導入）
const FONT = '"BIZ UDPGothic","BIZ UDGothic","Noto Sans CJK JP",sans-serif';
cv.style.fontFeatureSettings = cfg.feat;
/* ---------- 震度 ---------- */
const IMAP = { '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5-': '5m', '5+': '5p', '6-': '6m', '6+': '6p', '7': '7', '!5-': 'u' };
const ICOL = { '0': ['#c8d4e8', '#000'], '1': ['#c8d4e8', '#000'], '2': ['#00aaff', '#fff'], '3': ['#0041ff', '#fff'], '4': ['#fae696', '#000'], '5m': ['#ffa000', '#000'], '5p': ['#ff6a00', '#000'], '6m': ['#ff2800', '#fff'], '6p': ['#a50021', '#fff'], '7': ['#b40068', '#fff'], 'u': ['#999', '#fff'] };
const LCOL = { '1': ['#fff3a0', '#000'], '2': ['#ffb347', '#000'], '3': ['#ff4b00', '#fff'], '4': ['#a50021', '#fff'] };
const ILAB = { '5m': '5-', '5p': '5+', '6m': '6-', '6p': '6+', 'u': '?' };

/* ---------- 素材 ---------- */
const IMG = {};
// 同時リクエスト数を絞る（サーバーの503対策）
let _act = 0; const _q = [];
function slot() { return new Promise(r => { const go = () => { _act++; r(); }; _act < 6 ? go() : _q.push(go); }); }
function free() { _act--; const n = _q.shift(); if (n) n(); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function loadImg(k, src) {
  for (let t = 0; t < 4; t++) {
    await slot();
    const ok = await new Promise(r => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => { IMG[k] = i; r(true); }; i.onerror = () => r(false); i.src = src + (t ? (src.includes('?') ? '&' : '?') + 'r=' + t : ''); });
    free(); if (ok) return; await sleep(500 * (t + 1));
  }
  qlog('warn', '画像を読み込めません: ' + src);
}
async function fetchRetry(url) {
  let err;
  for (let t = 0; t < 4; t++) {
    await slot();
    try { const r = await fetch(url); if (r.ok) { const j = await r.json(); free(); return j; } err = new Error('HTTP ' + r.status + ' ' + url); }
    catch (e) { err = e; }
    free(); await sleep(700 * (t + 1));
  }
  throw err;
}

// 通知用に必要な素材だけ読み込む（長周期用のcsk/は使わない）
function resources() {
  const b = cfg.base, L = [['cover', b + 'datacover.png'], ['shingen', b + 'icon/shingen.png']];
  Object.values(IMAP).forEach(k => L.push(['s' + k, `${b}icon/s${k}.svg`], ['m' + k, `${b}icon/m${k}.svg`]));
  ['1', '2', '3', '4', '5m', '5p', '6m', '6p', '7', 'enchi', 'nodata'].forEach(k => L.push(['b' + k, `${b}banner/${k}.svg`]));
  ['checking', 'eew', 'enchi', 'non-effective', 'none', 'warning'].forEach(k => L.push(['i' + k, `${b}info/${k}.svg`]));
  return Promise.all(L.map(a => loadImg(...a)));
}

/* ---------- 地図 ---------- */
const M = {}, CEN = { reg: new Map(), city: new Map() };
const P = (lon, lat) => [lon * (cfg.stretch || 1), Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI];
const polysOf = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
function fillPath(fs, filter) {
  const p = new Path2D();
  for (const f of fs) for (const poly of polysOf(f.geometry)) {
    if (filter && !filter(poly)) continue;
    for (const r of poly) { r.forEach((c, i) => { const q = P(c[0], c[1]); i ? p.lineTo(q[0], q[1]) : p.moveTo(q[0], q[1]); }); p.closePath(); }
  }
  return p;
}
// ポリゴン同士が共有している辺だけを境界線として描く（海岸線に線を引かないため）
function borderPath(fs) {
  const m = new Map(), R = v => Math.round(v * 1e5);
  for (const f of fs) for (const poly of polysOf(f.geometry)) for (const r of poly) for (let i = 0; i < r.length - 1; i++) {
    const a = r[i], b = r[i + 1], ka = R(a[0]) + ',' + R(a[1]), kb = R(b[0]) + ',' + R(b[1]);
    if (ka === kb) continue;
    const k = ka < kb ? ka + '|' + kb : kb + '|' + ka, e = m.get(k);
    if (e) e.n++; else m.set(k, { n: 1, a, b });
  }
  const p = new Path2D(); let sh = 0;
  for (const e of m.values()) if (e.n >= 2) { sh++; const A = P(e.a[0], e.a[1]), B = P(e.b[0], e.b[1]); p.moveTo(A[0], A[1]); p.lineTo(B[0], B[1]); }
  if (sh < m.size * 0.02) { qlog('warn', '共有辺が少ないため外周線で境界を描画します'); return fillPath(fs); }
  return p;
}
function centroid(fs, keyF) {
  const mp = new Map();
  for (const f of fs) {
    let best = null, ba = -1;
    for (const poly of polysOf(f.geometry)) {
      const r = poly[0]; let a = 0, x = 0, y = 0;
      for (let i = 0; i < r.length - 1; i++) {
        const p = P(r[i][0], r[i][1]), q = P(r[i + 1][0], r[i + 1][1]), w = p[0] * q[1] - q[0] * p[1];
        a += w; x += (p[0] + q[0]) * w; y += (p[1] + q[1]) * w;
      }
      if (Math.abs(a) > ba) { ba = Math.abs(a); best = a ? [x / (3 * a), y / (3 * a)] : P(r[0][0], r[0][1]); }
    }
    if (best && f.properties) mp.set(keyF(f.properties), best);
  }
  return mp;
}
// Natural Earthの日本領域は細分区域データで描くため除外（済州島・鬱陵島は残す）
function notJapan(poly) {
  let a = 999, b = -999, c = 999, d = -999;
  for (const p of poly[0]) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); }
  if (!(a >= 122 && b <= 146.5 && c >= 24 && d <= 45.7)) return true;
  if (a >= 126 && b <= 127 && c >= 33 && d <= 34) return true;
  if (a >= 130.7 && b <= 132 && c >= 37 && d <= 37.7) return true;
  return false;
}
// FeatureCollection / Feature / Geometry / GeometryCollection に対応
function toFeatures(j) {
  if (!j || typeof j !== 'object') return null;
  if (Array.isArray(j.features)) return j.features;
  if (j.type === 'Feature') return [j];
  if (j.type === 'Polygon' || j.type === 'MultiPolygon') return [{ type: 'Feature', properties: {}, geometry: j }];
  if (j.type === 'GeometryCollection') return j.geometries.map(g => ({ type: 'Feature', properties: {}, geometry: g }));
  return null;
}
async function loadMaps() {
  const b = cfg.base + 'map/';
  const T = async (n, f) => {
    try {
      const j = await fetchRetry(b + n), fs = toFeatures(j);
      if (!fs) throw new Error('未対応の形式です(type=' + (j && j.type) + '): ' + n);
      f(fs); qlog('info', '地図読込OK: ' + n, fs.length + '件');
    } catch (e) { qlog('error', '地図読込失敗: ' + n, e); }
  };
  await Promise.all([
    T('world.json', fs => { M.world = fillPath(fs, notJapan); }),
    T('saibun.json', fs => { M.saibun = fillPath(fs); M.saibunB = borderPath(fs); CEN.reg = centroid(fs, p => String(p.code)); }),
    T('pref.json', fs => { M.prefB = borderPath(fs); }),
    T('shionuma.json', fs => { M.lake = fillPath(fs); }),
    T('city.json', fs => { CEN.city = centroid(fs, p => String(p.regioncode)); })
  ]);
  redraw();
}

/* ---------- 電文 → 表示用データ ---------- */
const events = new Map(), seen = new Set();
let panelOn = cfg.panel !== false, lgMode = false, selId = null, live = true, userView = null, curV = null, lastT = 0, cityForce = null, ready = false;

function addTel(rec) {
  let b = rec.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { qlog('warn', 'body解析不可 id=' + rec.id); return null; } }
  if (!b || typeof b !== 'object' || !TYPES.includes(rec.headType)) return null;
  if (rec.test && !cfg.showTest) return null;
  const id = b.eventId || rec.id; let ev = events.get(id);
  if (!ev) { ev = { id, t: {} }; events.set(id, ev); }
  const sn = parseInt(b.serialNo) || 0, ht = rec.headType;
  if (b.infoType === '取消') { if (ev.t[ht] && sn >= ev.t[ht].sn) delete ev.t[ht]; qlog('info', '取消電文 ' + ht + ' event=' + id); }
  else { const cur = ev.t[ht]; if (!cur || sn >= cur.sn) ev.t[ht] = { rec, b, sn }; }
  ev.d = null;
  if (!Object.keys(ev.t).length) { events.delete(id); return null; }
  return ev;
}
function list() {
  const a = [...events.values()].map(ev => { const d = display(ev); return { ev, d, ts: new Date(d.origin).getTime() || 0 }; });
  a.sort((x, y) => y.ts - x.ts); return a;
}

/* ---------- 描画 ---------- */
function fitView(d, lg) {
  const A = { x0: 90, y0: BAR + 50, x1: W - 90, y1: H - 50 }, aw = A.x1 - A.x0, ah = A.y1 - A.y0, S = cfg.stretch || 1;
  const regs = lg ? (d.lgRegions || []).map(r => ({ code: r.code, rank: +r.lg, key: r.lg })) : d.regions.map(r => ({ code: r.code, rank: RANK[r.int], key: r.int }));
  const big = regs.filter(r => r.rank >= (lg ? 1 : 3)), src = big.length ? big : regs;
  const pts = src.map(r => CEN.reg.get(r.code)).filter(Boolean), hasReg = pts.length > 0;
  const hp = d.hy && d.hy.lat != null ? P(d.hy.lon, d.hy.lat) : null;
  if (hp) pts.push(hp);
  if (!pts.length) { const c = P(137, 36); return { cx: c[0], cy: c[1], k: aw / (45 * S) }; }
  const avg = a => [a.reduce((s, p) => s + p[0], 0) / a.length, a.reduce((s, p) => s + p[1], 0) / a.length];
  let c0;
  if (cfg.fitMode === 'mid') {
    // 最大震度を観測した地域の中心と震源の中間を画面中央にする
    const mk = lg ? d.lgMax : d.maxInt, mx = mk ? regs.filter(r => r.key === mk).map(r => CEN.reg.get(r.code)).filter(Boolean) : [];
    const mc = mx.length ? avg(mx) : null;
    c0 = mc && hp ? [(mc[0] + hp[0]) / 2, (mc[1] + hp[1]) / 2] : (mc || hp);
  }
  if (!c0) { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]); c0 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; }
  // 中央を決めたうえで、全地点が収まる最大の倍率にする
  const dx = Math.max(...pts.map(p => Math.abs(p[0] - c0[0])), 1e-3), dy = Math.max(...pts.map(p => Math.abs(p[1] - c0[1])), 1e-3);
  let k = Math.min(aw / 2 / dx, ah / 2 / dy);
  k = hasReg ? Math.min(Math.max(k, aw / (150 * S)), aw / (3 * S)) : aw / (36 * S);
  const ax = (A.x0 + A.x1) / 2, ay = (A.y0 + A.y1) / 2;
  return { cx: c0[0] - (ax - W / 2) / k, cy: c0[1] + (ay - H / 2) / k, k };
}
function txt(c, s, x, y, size, o = {}) {
  c.font = `${o.w || 600} ${size}px ${FONT}`; c.fillStyle = o.col || '#fff'; c.textAlign = o.al || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y);
}
// list=[[文字, サイズ倍率]...]。maxWを超える場合は横方向にだけ圧縮して収める
function parts(c, list, x, y, maxW, size, ls) {
  const f = k => `600 ${size * k}px ${FONT}`; let w = 0; ls = ls || 0;
  c.save(); try { c.letterSpacing = ls + 'px'; } catch (e) { }
  list.forEach(([t, k]) => { c.font = f(k); w += c.measureText(t).width; });
  w -= ls; // 末尾の字間は幅に含めない
  c.translate(x, y); c.scale(w > maxW ? maxW / w : 1, 1);
  c.fillStyle = '#fff'; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  let px = 0; list.forEach(([t, k]) => { c.font = f(k); c.fillText(t, px, 0); px += c.measureText(t).width; });
  c.restore();
}
function icon(c, kind, key, x, y, size, pal, lab) {
  const im = IMG[kind + key];
  if (im) { const h = size * im.naturalHeight / im.naturalWidth; c.drawImage(im, x - size / 2, y - h / 2, size, h); return; }
  const [bg, fg] = (pal || ICOL)[key] || ['#999', '#fff'];
  c.fillStyle = bg; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath();
  if (kind === 'm') c.arc(x, y, size / 2, 0, 7); else c.rect(x - size / 2, y - size / 2, size, size);
  c.fill(); c.stroke(); txt(c, (lab || ILAB)[key] || key, x, y + 2, size * .62, { col: fg, al: 'center' });
}
const BADGE = { none: ['津波の心配なし', 384, '#555'], checking: ['津波調査中', 384, '#555'], warning: ['津波警報等発表中', 384, '#c00'], 'non-effective': ['若干の海面変動', 384, '#555'], eew: ['EEW発表', 242, '#ff4b00'], enchi: ['遠地', 132, '#0050ff'] };
function badge(c, k, x, y) {
  const im = IMG['i' + k];
  if (im) { const w = im.naturalWidth * 1.2; c.drawImage(im, x, y, w, im.naturalHeight * 1.2); return w; }
  const [t, w, col] = BADGE[k]; c.fillStyle = col; c.fillRect(x, y, w, 55); txt(c, t, x + w / 2, y + 29, 34, { al: 'center' }); return w;
}
function pad(n) { return String(n).padStart(2, '0'); }

function render(c, d, v, lg, panel) {
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#143264'; c.fillRect(0, 0, W, H);
  c.save(); c.setTransform(v.k, 0, 0, -v.k, W / 2 - v.cx * v.k, H / 2 + v.cy * v.k);
  const px = 1 / v.k;
  if (M.world) { c.fillStyle = '#CCCCCC'; c.fill(M.world, 'evenodd'); }
  if (M.saibun) { c.fillStyle = '#CCCCCC'; c.fill(M.saibun, 'evenodd'); }
  c.lineJoin = 'round';
  if (M.saibunB) { c.strokeStyle = cfg.colS; c.lineWidth = cfg.lwS * px; c.stroke(M.saibunB); }
  if (M.prefB) { c.strokeStyle = cfg.colP; c.lineWidth = cfg.lwP * px; c.stroke(M.prefB); }
  if (M.lake) { c.fillStyle = '#143264'; c.fill(M.lake, 'evenodd'); }
  c.restore(); c.setTransform(1, 0, 0, 1, 0, 0);
  const toS = (x, y) => [W / 2 + (x - v.cx) * v.k, H / 2 - (y - v.cy) * v.k];

  if (!d) { txt(c, '地震情報を待機しています', W / 2, H / 2, 54, { al: 'center', col: 'rgba(255,255,255,.7)' }); return; }

  const city = !lg && (cityForce === null ? (W / v.k / (cfg.stretch || 1) <= cfg.cityDeg) : cityForce) && d.cities.length > 0;
  const src = lg ? [] : (city ? d.cities : d.regions), cen = city ? CEN.city : CEN.reg;
  src.map(r => ({ r, p: cen.get(r.code) })).filter(o => o.p).sort((a, b) => RANK[a.r.int] - RANK[b.r.int]).forEach(o => {
    const [sx, sy] = toS(o.p[0], o.p[1]);
    if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) return;
    icon(c, city ? 'm' : 's', IMAP[o.r.int], sx, sy, city ? cfg.mIcon : cfg.sIcon);
  });
  if (lg) {
    d.lgRegions.filter(r => +r.lg >= 1).map(r => ({ r, p: CEN.reg.get(r.code) })).filter(o => o.p).sort((a, b) => a.r.lg - b.r.lg).forEach(o => {
      const [sx, sy] = toS(o.p[0], o.p[1]);
      if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) return;
      icon(c, 'ls', o.r.lg, sx, sy, cfg.sIcon, LCOL, {});
    });
  }
  if (d.hy && d.hy.lat != null) {
    const [sx, sy] = toS(...P(d.hy.lon, d.hy.lat)), im = IMG.shingen, s = cfg.shingen;
    if (im) c.drawImage(im, sx - s / 2, sy - s / 2, s, s * im.naturalHeight / im.naturalWidth);
    else { c.lineCap = 'round'; [['#ffe600', 24], ['#e00', 14]].forEach(([col, w]) => { c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(sx - 30, sy - 30); c.lineTo(sx + 30, sy + 30); c.moveTo(sx + 30, sy - 30); c.lineTo(sx - 30, sy + 30); c.stroke(); }); }
  }

  // 情報ボックス
  const cover = IMG.cover;
  if (cover) c.drawImage(cover, 0, 0, W, W * cover.naturalHeight / cover.naturalWidth);
  else { c.fillStyle = 'rgba(8,8,10,.94)'; c.fillRect(0, 0, W, BAR); }
  if (cfg.labels || !cover) {
    [['発生', 502, 18], ['震源', 502, 83], ['規模', 1136, 18], ['深さ', 1136, 83]].forEach(([t, x, y]) => { c.fillStyle = '#fff'; c.fillRect(x, y, 108, 55); txt(c, t, x + 54, y + 29, 36, { al: 'center', col: '#111' }); });
  }
  const bk = lg ? (+d.lgMax >= 1 ? d.lgMax : 'n') : (d.maxInt && IMAP[d.maxInt] !== '0' && IMAP[d.maxInt] !== 'u' ? IMAP[d.maxInt] : (d.enchi ? 'enchi' : 'nodata')), bi = IMG[(lg ? 'lc' : 'b') + bk];
  if (bi) c.drawImage(bi, 0, 0, 480, 156);
  else {
    const pal = lg ? LCOL : ICOL; c.fillStyle = (pal[bk] || ['#7a0016'])[0]; c.fillRect(0, 0, 480, 156);
    txt(c, lg ? (bk === 'n' ? '情報なし' : '長周期地震動 階級' + bk) : (bk === 'nodata' ? '情報なし' : '最大震度 ' + (INTLABEL[d.maxInt] || d.maxInt)), 240, 78, 40, { al: 'center', col: (pal[bk] || ['', '#fff'])[1] });
  }

  const j = jst(d.origin), now = jst(Date.now()), tl = [];
  if (j) {
    if (!now || j.getUTCMonth() !== now.getUTCMonth()) tl.push([String(j.getUTCMonth() + 1), 1], ['月', .75]);
    tl.push([String(j.getUTCDate()), 1], ['日', .75], [' ', .54], [pad(j.getUTCHours()), 1], ['時', .75], [pad(j.getUTCMinutes()), 1], ['分ごろ', .75]);
  } else tl.push(['--', 1]);
  parts(c, tl, cfg.tx, cfg.ty, cfg.tw, cfg.ts, cfg.tl);
  parts(c, [[d.hy ? (d.hy.name || '調査中') : '調査中', 1]], cfg.nx, cfg.ny, cfg.nw, cfg.ns, cfg.nl);
  parts(c, [[d.mag, 1]], cfg.mx, cfg.my, cfg.mw, cfg.ms, cfg.ml);
  const m = /^約(\d+)km$/.exec(d.depth);
  parts(c, m ? [['約', .75], [m[1], 1], ['km', .75]] : [[d.depth, 1]], cfg.dx, cfg.dy, cfg.dw, cfg.ds, cfg.dl);

  // 右上: 1段目=津波 / 2段目=EEW発表+遠地（常に同じ位置。無効時は透明度0.1）
  const bx = 1518, bw = 384, ew = IMG.ienchi ? IMG.ienchi.naturalWidth * 1.2 : 132;
  {
    badge(c, d.tsunami || 'checking', bx, 18);   // 津波情報が無いときは「調査中」(checking.svg)
    c.globalAlpha = d.eew ? 1 : 0.1; badge(c, 'eew', bx, 83);
    c.globalAlpha = d.enchi ? 1 : 0.1; badge(c, 'enchi', bx + bw - ew, 83);
    c.globalAlpha = 1;
  }
  if (panel) drawPanel(c, d, lg);

}


// 最大震度を観測した市町村を、地図の左上に小さなパネルで表示（都道府県 + 市町村名）
function drawPanel(c, d, lg) {
  if (!d) return;
  // 市町村の震度がある場合(震源・震度情報)のみ表示。震度速報・震源情報・長周期地震動では出さない
  if (lg || !d.maxInt || !d.cities.length) return;
  const unit = '市町村';
  const src = d.cities.filter(r => r.int === d.maxInt).map(r => ({ pref: PREF[(parseInt(String(r.code).slice(0, 2)) || 0) - 1] || '', name: r.name, code: r.code }));
  if (!src.length) return;
  src.sort((a, b) => a.code < b.code ? -1 : 1);
  let rows = src.map((r, i) => ({ pref: i === 0 || src[i - 1].pref !== r.pref ? r.pref : '', name: r.name }));
  const max = Math.max(2, cfg.prow | 0);
  if (rows.length > max) { const n = rows.length - (max - 1); rows = rows.slice(0, max - 1); rows.push({ pref: '', name: 'ほか', more: true }); }
  const sz = cfg.ps, lh = sz * 1.6, padX = sz * 0.73, padY = sz * 0.4, w = cfg.pw;
  const hasPref = rows.some(r => r.pref), prefW = sz * 4, gap = sz * 0.77;   // 都道府県は4文字分の幅で左揃え
  const nameX = padX + (hasPref ? prefW + gap : 0), nameW = w - padX - nameX, h = padY * 2 + lh * rows.length;
  c.save();
  c.fillStyle = 'rgba(4,6,10,.92)'; c.beginPath();
  if (c.roundRect) c.roundRect(cfg.px, cfg.py, w, h, 8); else c.rect(cfg.px, cfg.py, w, h);
  c.fill();
  // 幅を超える文字は横方向にだけ縮める
  const fit = (t, x, y, maxW, al) => {
    c.font = `600 ${sz}px ${FONT}`; const tw = c.measureText(t).width, k = tw > maxW ? maxW / tw : 1;
    c.save(); c.translate(x, y); c.scale(k, 1); txt(c, t, 0, 0, sz, { al }); c.restore();
  };
  rows.forEach((r, i) => {
    const y = cfg.py + padY + lh * (i + 0.5);
    if (r.more) { // 「ほか」: 小さく・右揃え・不透明度80%
      c.save(); c.globalAlpha = 0.8; txt(c, r.name, cfg.px + w - padX, y, sz * 0.75, { al: 'right' }); c.restore(); return;
    }
    if (r.pref) fit(r.pref, cfg.px + padX, y, prefW, 'left');
    fit(r.name, cfg.px + nameX, y, nameW, 'left');
  });
  c.restore();
}

/* ---------- 外部から呼ぶ入口 ---------- */
window.quakeReady = Promise.all([document.fonts.load('600 56px "BIZ UDPGothic"').catch(() => []), resources(), loadMaps()]);
// recs: 同じ地震(eventId)の電文レコード（古い順）。最後の電文の時点の表示を描画する
window.renderQuake = async function (recs) {
  await window.quakeReady;
  events.clear();
  let ev = null;
  for (const r of recs) { const e = addTel(r); if (e) ev = e; }
  if (!ev) return null;
  const d = display(ev);
  const c = cv.getContext('2d');
  render(c, d, fitView(d, false), false, cfg.panel !== false);
  return {
    png: cv.toDataURL('image/png'),
    d: { head: d.head, serial: d.serial, maxInt: d.maxInt, hy: d.hy, mag: d.mag, depth: d.depth, tsunami: d.tsunami, eew: d.eew, enchi: d.enchi, origin: d.origin, cities: d.cities.length, regions: d.regions.length,
      topCities: d.cities.filter(r => r.int === d.maxInt).map(r => ({ code: String(r.code), name: r.name })),
      topRegions: d.regions.filter(r => r.int === d.maxInt).map(r => ({ code: String(r.code), name: r.name })) }
  };
};
