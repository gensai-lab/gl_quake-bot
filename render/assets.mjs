// 素材（地図・アイコンなど）のファイル一覧。Actionsの描画とGitHub Pagesの作成の両方で使う
export const ASSET_BASE = (process.env.ASSET_BASE || 'https://assets.kactuif.com/quake/data/').replace(/\/?$/, '/');
const IMAP = ['0', '1', '2', '3', '4', '5m', '5p', '6m', '6p', '7', 'u'];
export function assetList() {
  const L = ['datacover.png', 'icon/shingen.png'];
  IMAP.forEach(k => L.push(`icon/s${k}.svg`, `icon/m${k}.svg`));
  ['1', '2', '3', '4', '5m', '5p', '6m', '6p', '7', 'enchi', 'nodata'].forEach(k => L.push(`banner/${k}.svg`));
  ['checking', 'eew', 'enchi', 'non-effective', 'none', 'warning'].forEach(k => L.push(`info/${k}.svg`));
  ['world', 'saibun', 'pref', 'shionuma', 'city'].forEach(k => L.push(`map/${k}.json`));
  return L;
}
