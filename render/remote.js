'use strict';
// Cloudflare Browser Rendering から開かれる描画ページ。
// ?tid=電文ID&w=WorkerのURL&t=一時トークン を受け取り、Worker経由で電文を取得して描画する。
// 描画が終わったら <div id="done"> を追加する（Worker側はこれを待ってスクリーンショットを撮る）。
(async () => {
  const q = new URLSearchParams(location.search);
  const tid = q.get('tid'), w = (q.get('w') || '').replace(/\/$/, ''), t = q.get('t');
  const KINDS = ['VXSE51', 'VXSE52', 'VXSE53'];
  const parseBody = r => { let b = r.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return null; } } return b && typeof b === 'object' ? b : null; };
  const api = async (p, params = {}) => {
    const u = new URL(`${w}/p${p}`);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    u.searchParams.set('t', t);
    const r = await fetch(u);
    if (!r.ok) throw new Error(p + ' HTTP ' + r.status);
    return r.json();
  };
  try {
    if (!tid || !w || !t) throw new Error('パラメータが足りません');
    const target = await api('/api/telegrams/' + encodeURIComponent(tid));
    const tb = parseBody(target); if (!tb) throw new Error('本文を解析できません');
    const tt = new Date(target.time).getTime();
    const list = await api('/api/telegrams', { since: new Date(tt - 24 * 3600e3).toISOString(), until: new Date(tt + 1000).toISOString(), test: 'no', limit: '500' });
    const eid = tb.eventId || target.id;
    const recs = (list.items || []).filter(r => KINDS.includes(r.headType) && new Date(r.time).getTime() <= tt && (parseBody(r) || {}).eventId === eid);
    if (!recs.some(r => r.id === target.id)) recs.push(target);
    recs.sort((a, b) => new Date(a.time) - new Date(b.time) || (a.id < b.id ? -1 : 1));
    const res = await window.renderQuake(recs);
    if (!res) throw new Error('表示できる情報がありません');
  } catch (e) {
    console.error('[remote] ' + e.message);
    const c = document.getElementById('cv'); c.getContext('2d').clearRect(0, 0, c.width, c.height);   // 失敗時は黒い画像にして、Worker側で失敗と判定させる
  }
  const d = document.createElement('div'); d.id = 'done'; document.body.appendChild(d);
})();
