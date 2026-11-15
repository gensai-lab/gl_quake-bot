'use strict';
// 共有ロジック(メイン画面 app.js と 投稿文ページ post.js で使用): 震度・電文→表示データ変換・付加文コード判定
const RANK = { '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5-': 5, '5+': 6, '6-': 7, '6+': 8, '7': 9, '!5-': 5.5 };
const INTLABEL = { '5-': '5弱', '5+': '5強', '6-': '6弱', '6+': '6強' };
const TYPES = ['VXSE51', 'VXSE52', 'VXSE53', 'VXSE62'];
const PREF = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const jst = s => { const d = new Date(s); return isNaN(d) ? null : new Date(d.getTime() + 9 * 3600e3); };
const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
// 固定付加文コード表(AdditionalCommentEarthquake)に基づく分類
const CODE_EEW = ['0241', '0242', '0243', '0244', '0245'];
const CODE_ENCHI = ['0221', '0222', '0223', '0224', '0225', '0226', '0227', '0229', '0230'];
const CODE_TSU = {
  warning: ['0211'],
  'non-effective': ['0101', '0102', '0103', '0104', '0105', '0212', '0213', '0214'],
  none: ['0215', '0230'],
  checking: ['0216', '0229', '0221', '0222', '0223', '0224', '0225', '0226', '0227']
};
function codesOf(o, out = []) {
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
    if (k === 'codes' && Array.isArray(v)) v.forEach(x => out.push(String(x)));
    else if (k === 'code' && /^\d{4}$/.test(String(v))) out.push(String(v));
    else codesOf(v, out);
  }
  return out;
}
function tsuCodes(cs) {
  for (const k of ['warning', 'non-effective', 'none', 'checking']) if (CODE_TSU[k].some(c => cs.includes(c))) return k;
  return null;
}
function tsu(t) {
  if (/津波警報|津波注意報|大津波/.test(t) && /発表中/.test(t)) return 'warning';
  if (/海面変動/.test(t)) return 'non-effective';
  if (/津波の心配(は)?(ありません|なし)/.test(t)) return 'none';
  if (/調査中/.test(t) && /津波/.test(t)) return 'checking';
  return null;
}
function display(ev) {
  if (ev.d) return ev.d;
  const t51 = ev.t.VXSE51, t52 = ev.t.VXSE52, t53 = ev.t.VXSE53;
  const t62 = ev.t.VXSE62, hy = t53 || t52 || t62, ins = t53 || t51, main = t53 || t52 || t51 || t62;
  const bd = x => (x && x.b && x.b.body) || {};
  const eq = bd(hy).earthquake, inB = bd(ins).intensity || {};
  const d = { id: ev.id, head: main.rec.headType, serial: main.sn, rec: main.rec, regions: [], cities: [], hy: null, depth: '調査中', mag: '調査中' };
  if (eq && eq.hypocenter) {
    const h = eq.hypocenter, co = h.coordinate || {};
    d.hy = { name: h.name || '', lat: num(co.latitude && co.latitude.value), lon: num(co.longitude && co.longitude.value) };
    const dp = h.depth || {}, dv = num(dp.value);
    d.depth = dp.condition && !/不明/.test(dp.condition) ? dp.condition : (dv != null ? '約' + Math.round(dv) + 'km' : '調査中');
    const mg = eq.magnitude || {}, mv = num(mg.value);
    d.mag = mv != null ? 'M' + mv.toFixed(1) : (mg.condition && /8/.test(mg.condition) && /超/.test(mg.condition) ? 'M8超' : (mg.condition && !/不明/.test(mg.condition) ? mg.condition : '調査中'));
  }
  const lgB = bd(t62).intensity || {};
  d.hasLg = !!t62; d.lgMax = lgB.maxLgInt != null ? String(lgB.maxLgInt) : null;
  d.lgRegions = (lgB.regions || []).filter(r => r.maxLgInt != null).map(r => ({ code: String(r.code), name: r.name, lg: String(r.maxLgInt) }));
  d.origin = (eq && (eq.originTime || eq.arrivalTime)) || main.b.targetDateTime || main.rec.time;
  const rg = a => (a || []).map(r => ({ code: String(r.code), name: r.name, int: r.maxInt })).filter(r => RANK[r.int] !== undefined);
  d.regions = rg(inB.regions); d.cities = rg(inB.cities);
  d.maxInt = RANK[inB.maxInt] !== undefined ? inB.maxInt : null;
  if (!d.maxInt && d.regions.length) d.maxInt = d.regions.reduce((a, r) => RANK[r.int] > RANK[a] ? r.int : a, d.regions[0].int);
  const title = main.b.title || main.rec.title || '';
  // 固定付加文コード(気象庁コード表)で判定し、取れない場合は文面で補う
  const ctext = t => JSON.stringify(bd(t).comments || {}) + (bd(t).text || '');
  const cds = t => codesOf(bd(t).comments);
  d.ctext = ctext(main);
  d.codes = [...new Set(Object.values(ev.t).flatMap(cds))];
  d.tsunami = null;
  for (const t of [t53, t52, t51]) { if (!t) continue; d.tsunami = tsuCodes(cds(t)) || tsu(ctext(t)); if (d.tsunami) break; }
  d.eew = d.codes.some(c => CODE_EEW.includes(c)) || Object.values(ev.t).some(t => /緊急地震速報を発表/.test(ctext(t)));
  d.enchi = /遠地/.test(title) || d.codes.some(c => CODE_ENCHI.includes(c));
  return (ev.d = d);
}
