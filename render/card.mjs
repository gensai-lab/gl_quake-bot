// 通知カード（Discordの埋め込み）の文章と見た目を組み立てる
const PREF = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const TITLE = { VXSE51: '震度速報', VXSE52: '震源に関する情報', VXSE53: '震源・震度に関する情報' };
const INTLABEL = { '5-': '5弱', '5+': '5強', '6-': '6弱', '6+': '6強' };
const COLOR = { '1': 0xc8d4e8, '2': 0x00aaff, '3': 0x0041ff, '4': 0xfae696, '5-': 0xffa000, '5+': 0xff6a00, '6-': 0xff2800, '6+': 0xa50021, '7': 0xb40068 };
const TSUNAMI = {
  none: 'この地震による津波の心配はありません。',
  'non-effective': 'この地震により、日本の沿岸では若干の海面変動があるかもしれませんが、被害の心配はありません。',
  checking: '津波の有無については調査中です。',
  warning: '津波警報等を発表中です。今後の情報に注意してください。'
};
const MAX_TEXT = 900;   // 市町村の並びがこれを超えたら、市町村が多い都道府県から「〇〇県」だけの表記にする

export function jstText(s) {
  const d = new Date(new Date(s).getTime() + 9 * 3600e3); if (isNaN(d)) return '時刻不明';
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${String(d.getUTCHours()).padStart(2, '0')}時${String(d.getUTCMinutes()).padStart(2, '0')}分ごろ`;
}

// 市町村を都道府県ごとにまとめる: 〇〇県の〇〇市・〇〇市、〇〇県の〇〇町
export function cityText(cities) {
  const src = cities.map(r => ({ pref: PREF[(parseInt(String(r.code).slice(0, 2)) || 0) - 1] || '', name: r.name, code: String(r.code) }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  const groups = [];
  for (const r of src) {
    const g = groups[groups.length - 1];
    if (g && g.pref === r.pref) g.names.push(r.name); else groups.push({ pref: r.pref, names: [r.name], short: false });
  }
  const build = () => groups.map(g => g.short || !g.pref ? (g.pref || g.names.join('・')) : `${g.pref}の${g.names.join('・')}`).join('、');
  let t = build();
  while (t.length > MAX_TEXT) {
    const g = groups.filter(x => !x.short && x.pref && x.names.length > 1).sort((a, b) => b.names.length - a.names.length)[0];
    if (!g) break;
    g.short = true; t = build();
  }
  return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + '…' : t;
}

export function regionText(regions) {
  const names = [...regions].sort((a, b) => (String(a.code) < String(b.code) ? -1 : 1)).map(r => r.name);
  let t = names.join('　');
  if (t.length > MAX_TEXT) { t = t.slice(0, MAX_TEXT); t = t.slice(0, t.lastIndexOf('　')) + '　ほか'; }
  return t;
}

export function card(d, serial) {
  const lv = d.maxInt ? '震度' + (INTLABEL[d.maxInt] || d.maxInt) : null;
  const where = d.hy && d.hy.name ? d.hy.name : null;
  const L = [];
  L.push(where ? `${jstText(d.origin)}、${where}で地震がありました。` : `${jstText(d.origin)}、地震がありました。`);
  if (d.head === 'VXSE51') {
    if (lv && d.topRegions && d.topRegions.length) { L.push(`この地震で、${lv}を観測した地域は次のとおりです。`); L.push(regionText(d.topRegions)); }
  } else {
    if (lv && d.topCities && d.topCities.length) L.push(`この地震で、${lv}を${cityText(d.topCities)}で観測しています。`);
    L.push(`震源地：${where || '調査中'}`, `深さ　：${d.depth}`, `規模　：${d.mag}`);
  }
  const tsu = TSUNAMI[d.tsunami] || (d.head === 'VXSE51' ? null : '津波の有無については調査中です。');
  if (tsu) { L.push(''); L.push(tsu); }
  if (d.eew) L.push('この地震で、緊急地震速報が発表されています。');
  if (d.enchi) L.push('この情報は遠地地震に関するものです。');
  return {
    title: (d.enchi ? '【遠地】' : '') + (TITLE[d.head] || '地震情報'),
    description: L.join('\n').slice(0, 4000),
    color: COLOR[d.maxInt] || 0x555555,
    image: { url: 'attachment://quake.png' },
    footer: { text: `GenLab Quake Bot　第${serial}報` },
    timestamp: new Date().toISOString()
  };
}
