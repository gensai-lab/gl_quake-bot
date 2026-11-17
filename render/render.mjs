// GenLab Quake Bot: 電文IDから通知カード(文章+画像)を作り、Discordへ送る
// 環境変数: TELEGRAM_ID, DMDATA_BASE_URL, DMDATA_API_KEY, DISCORD_WEBHOOK_URL(任意)
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { card } from './card.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(HERE, '..', 'work');
const OUT = path.join(HERE, '..', 'out');
const ASSET_BASE = (process.env.ASSET_BASE || 'https://assets.kactuif.com/quake/data/').replace(/\/?$/, '/');
const API = (process.env.DMDATA_BASE_URL || '').replace(/\/$/, '');
const KEY = process.env.DMDATA_API_KEY || '';
const TID = (process.env.TELEGRAM_ID || '').trim();
const HOOK = process.env.DISCORD_WEBHOOK_URL || '';
const BOT = process.env.DISCORD_BOT_TOKEN || '';
// 通知先チャンネルはイベントのファイルから読む（環境変数にするとログに表示されるため）
let CHANNELS = [];
try {
  const ev = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (ev.client_payload && Array.isArray(ev.client_payload.channels)) CHANNELS = ev.client_payload.channels.filter(c => c && /^\d+$/.test(String(c.id)));
} catch { }
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!API || !KEY || !TID) { console.error('DMDATA_BASE_URL / DMDATA_API_KEY / TELEGRAM_ID が必要です'); process.exit(1); }

async function api(p, q = {}) {
  const u = new URL(API + p);
  Object.entries(q).forEach(([k, v]) => u.searchParams.set(k, v));
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(u, { headers: { 'X-API-Key': KEY } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
      console.warn('API HTTP', r.status, p);
    } catch (e) { console.warn('API error', e.message); }
    await sleep(800 * (t + 1));
  }
  throw new Error('API取得に失敗: ' + p);
}

// ---- 素材を取得して、同一オリジンのローカルサーバーから配る（canvasを汚染させないため） ----
const IMAP = ['0', '1', '2', '3', '4', '5m', '5p', '6m', '6p', '7', 'u'];
function assetList() {
  const L = ['datacover.png', 'icon/shingen.png'];
  IMAP.forEach(k => L.push(`icon/s${k}.svg`, `icon/m${k}.svg`));
  ['1', '2', '3', '4', '5m', '5p', '6m', '6p', '7', 'enchi', 'nodata'].forEach(k => L.push(`banner/${k}.svg`));
  ['checking', 'eew', 'enchi', 'non-effective', 'none', 'warning'].forEach(k => L.push(`info/${k}.svg`));
  ['world', 'saibun', 'pref', 'shionuma', 'city'].forEach(k => L.push(`map/${k}.json`));
  return L;
}
const failed = [];
async function download(f) {
  const dst = path.join(WORK, 'data', f);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(ASSET_BASE + f);
      if (r.ok) { await fs.writeFile(dst, Buffer.from(await r.arrayBuffer())); return; }
      console.warn('素材HTTP', r.status, f);
    } catch (e) { console.warn('素材エラー', f, e.message); }
    await sleep(500 * (t + 1));
  }
  failed.push(f);
  console.error('::error::素材を取得できませんでした: ' + f);
}
async function downloadAll() {
  const L = assetList(); let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (i < L.length) await download(L[i++]); }));
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
function serve() {
  const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = p.startsWith('/data/') ? path.join(WORK, p) : path.join(HERE, p === '/' ? 'render.html' : p);
    if (!path.resolve(file).startsWith(path.resolve(WORK)) && !path.resolve(file).startsWith(path.resolve(HERE))) { res.writeHead(403); return res.end(); }
    try { const b = await fs.readFile(file); res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(b); }
    catch { res.writeHead(404); res.end(); }
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

// ---- 電文の取得: 対象電文と、同じ地震(eventId)のそれまでの電文 ----
const KINDS = ['VXSE51', 'VXSE52', 'VXSE53'];   // 震度速報 / 震源に関する情報 / 震源・震度に関する情報
const parseBody = r => { let b = r.body; if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return null; } } return b && typeof b === 'object' ? b : null; };
async function collect() {
  const target = await api('/api/telegrams/' + encodeURIComponent(TID));
  if (!target) throw new Error('電文が見つかりません: ' + TID);
  if (target.test) { console.log('訓練・試験の電文のため通知しません'); return null; }
  if (!KINDS.includes(target.headType)) { console.log('対象外の種別です: ' + target.headType); return null; }
  const tb = parseBody(target); if (!tb) throw new Error('本文を解析できません');
  const tt = new Date(target.time).getTime();
  const list = await api('/api/telegrams', {
    since: new Date(tt - 24 * 3600e3).toISOString(), until: new Date(tt + 1000).toISOString(), test: 'no', limit: 500
  });
  const eid = tb.eventId || target.id;
  const recs = (list.items || []).filter(r => KINDS.includes(r.headType) && new Date(r.time).getTime() <= tt && (parseBody(r) || {}).eventId === eid);
  if (!recs.some(r => r.id === target.id)) recs.push(target);
  recs.sort((a, b) => new Date(a.time) - new Date(b.time) || (a.id < b.id ? -1 : 1));
  return { target, recs };
}

async function post(png, embed) {
  if (!HOOK) { console.log('DISCORD_WEBHOOK_URL が未設定のため、投稿は行いません'); return; }
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }));
  fd.append('files[0]', new Blob([png], { type: 'image/png' }), 'quake.png');
  const r = await fetch(HOOK + (HOOK.includes('?') ? '&' : '?') + 'wait=true', { method: 'POST', body: fd });
  if (!r.ok) throw new Error('Discord投稿に失敗 HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  console.log('Discordへ投稿しました');
}

const RANK = { '1': 1, '2': 2, '3': 3, '4': 4, '5-': 5, '5+': 6, '6-': 7, '6+': 8, '7': 9 };
// 最大震度が分からない情報（震源のみ・遠地など）は、最低震度が3以下の通知先へ送る
const wants = (c, maxInt) => (RANK[c.min] || 1) <= (maxInt ? RANK[maxInt] || 1 : 3);
async function postBot(png, embed, maxInt) {
  if (!CHANNELS.length) return;
  if (!BOT) { console.warn('::warning::DISCORD_BOT_TOKEN が未設定のためBot投稿をスキップします'); return; }
  const targets = CHANNELS.filter(c => wants(c, maxInt));
  console.log(`Bot投稿先: ${targets.length}/${CHANNELS.length}件（最大震度 ${maxInt || '不明'}）`);
  const one = async c => {
    for (let t = 0; t < 3; t++) {
      const fd = new FormData();
      fd.append('payload_json', JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }));
      fd.append('files[0]', new Blob([png], { type: 'image/png' }), 'quake.png');
      const r = await fetch(`https://discord.com/api/v10/channels/${c.id}/messages`, { method: 'POST', headers: { Authorization: 'Bot ' + BOT }, body: fd });
      if (r.ok) return true;
      if (r.status === 429) { const j = await r.json().catch(() => ({})); await sleep((j.retry_after || 1) * 1000 + 100); continue; }
      console.warn('::warning::投稿に失敗 HTTP ' + r.status + ' ' + (await r.text()).slice(0, 100));
      return false;
    }
    return false;
  };
  let ok = 0, i = 0;
  // 8件ずつ並列で投稿する
  await Promise.all(Array.from({ length: Math.min(8, targets.length) }, async () => { while (i < targets.length) { if (await one(targets[i++])) ok++; } }));
  console.log(`Botで投稿: ${ok}/${targets.length}件`);
  if (targets.length && !ok) throw new Error('すべての投稿先への投稿に失敗しました');
}

// ---- 実行 ----
const t0 = Date.now();
const got = await collect();
if (!got) process.exit(0);
await fs.mkdir(OUT, { recursive: true });
const browserP = chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });   // 素材の取得と並行してブラウザを起動する
browserP.catch(() => { });
await downloadAll();
if (failed.length) { console.error('素材の取得に失敗したため中断します（' + failed.length + '件）: ' + failed.join(', ')); process.exit(1); }
const sizes = [];
for (const f of assetList().filter(x => x.startsWith('map/'))) sizes.push(f + '=' + (await fs.stat(path.join(WORK, 'data', f))).size + 'B');
console.log('地図ファイル: ' + sizes.join(' '));
const srv = await serve();
const browser = await browserP;
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const pageErrors = [];
  page.on('console', m => { console.log('[page]', m.text()); if (/^\[(error|warn)\]/.test(m.text())) pageErrors.push(m.text()); });
  page.on('requestfailed', r => { console.error('[requestfailed]', r.url()); pageErrors.push('requestfailed ' + r.url()); });
  page.on('response', r => { if (r.status() >= 400) { console.error('[http' + r.status() + ']', r.url()); pageErrors.push('http' + r.status() + ' ' + r.url()); } });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/render.html`);
  const res = await page.evaluate(recs => window.renderQuake(recs), got.recs);
  if (!res) { console.log('表示できる情報がありません'); process.exit(0); }
  const png = Buffer.from(res.png.split(',')[1], 'base64');
  await fs.writeFile(path.join(OUT, 'quake.png'), png);
  await fs.writeFile(path.join(OUT, 'meta.json'), JSON.stringify(res.d, null, 2));
  if (pageErrors.length) console.error('::warning::描画中に問題がありました:\n' + pageErrors.join('\n'));
  console.log('描画完了', JSON.stringify(res.d), (Date.now() - t0) + 'ms');
  const embed = card(res.d, res.d.serial);
  await postBot(png, embed, res.d.maxInt);
  // テスト用Webhookは任意。Bot投稿の通知先がある場合、Webhookの失敗では全体を失敗にしない
  try { await post(png, embed); }
  catch (e) { if (CHANNELS.length) console.warn('::warning::Webhook投稿に失敗（Bot投稿は実施済み）: ' + e.message); else throw e; }
} finally { await browser.close(); srv.close(); }
