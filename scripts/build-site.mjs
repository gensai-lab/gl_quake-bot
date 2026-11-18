// GitHub Pages用のサイト（site/）を作る: 描画ページ・フォント・素材（地図やアイコン）
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSET_BASE, assetList } from '../render/assets.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const sleep = ms => new Promise(r => setTimeout(r, ms));
await fs.rm(SITE, { recursive: true, force: true });
await fs.mkdir(path.join(SITE, 'fonts'), { recursive: true });
for (const f of ['remote.html', 'core.js', 'render.js', 'remote.js']) await fs.copyFile(path.join(ROOT, 'render', f), path.join(SITE, f));
await fs.copyFile(path.join(ROOT, 'render/fonts/BIZUDPGothic-Bold.ttf'), path.join(SITE, 'fonts/BIZUDPGothic-Bold.ttf'));
await fs.writeFile(path.join(SITE, '.nojekyll'), '');

const failed = [];
async function get(f) {
  const dst = path.join(SITE, 'data', f);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  for (let t = 0; t < 4; t++) {
    try { const r = await fetch(ASSET_BASE + f); if (r.ok) { await fs.writeFile(dst, Buffer.from(await r.arrayBuffer())); return; } console.warn('HTTP', r.status, f); }
    catch (e) { console.warn('error', f, e.message); }
    await sleep(500 * (t + 1));
  }
  failed.push(f);
}
const L = assetList(); let i = 0;
await Promise.all(Array.from({ length: 6 }, async () => { while (i < L.length) await get(L[i++]); }));
if (failed.length) { console.error('素材を取得できませんでした: ' + failed.join(', ')); process.exit(1); }
console.log('site を作成しました（素材 ' + L.length + ' 件）');
