# GenLab Quake Bot（通知カード作成部）

地震情報 v4 の描画をそのまま使い、GitHub Actions で 1920x1080 の画像を作ってDiscordへ投稿します。
このフォルダは第1段階（描画〜投稿の動作確認）です。更新検知とスラッシュコマンドは第2段階（Cloudflare Worker）で追加します。

## セットアップ（ブラウザだけで完了）

1. GitHubで **公開(Public)** リポジトリを作る（例: genlab-quake-bot）
2. このフォルダの中身をアップロードする（Add file → Upload files）。
   `.github/workflows/render.yml` は隠しフォルダなので、アップロードできない場合は
   Add file → Create new file で、ファイル名欄に `.github/workflows/render.yml` と入力して中身を貼り付ける
3. Settings → Secrets and variables → Actions → New repository secret で次を登録
   - `DMDATA_BASE_URL` … DMDATAプロキシのBase URL（https://〜workers.dev、末尾の/なし）
   - `DMDATA_API_KEY` … DMDATAプロキシのAPIキー
   - `DISCORD_WEBHOOK_URL` … テスト投稿用のWebhook URL（Discordのチャンネル設定 → 連携サービス → ウェブフック）
4. Actions タブ → render → Run workflow に電文IDを入れて実行

電文IDは、ブラウザで `<Base URL>/api/telegrams?type=VXSE53&test=no&limit=1&apiKey=<キー>` を開き、`items[0].id` を使う。

## 結果の見方
- 成功すると、Discordに通知カードが届く
- 失敗した場合は Actions の実行ログを見る。作成した画像は実行ページの Artifacts（quake-card）からも取得できる
