# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

スマホから思い浮かんだことをすぐにメモし、Notionのデータベースに送信するPWAアプリ。
ビルドステップなし・外部依存なし。編集したファイルをそのままGitHubにpushすれば、Netlifyが自動デプロイする。

- **本番URL**: https://quick-note-yh.netlify.app
- **GitHub**: https://github.com/AzumaFujimoto401/quick-note

## デプロイ

```bash
git push  # mainへのpushでNetlifyが自動デプロイ（約12秒）
```

ビルドコマンドは不要。`netlify.toml` により `public/` が静的ファイルのルート、`netlify/functions/` がサーバーレス関数として扱われる。

## ⚠️ Service Worker キャッシュの必須ルール

**`public/` 配下のファイルを変更したときは必ず `public/sw.js` の `CACHE_NAME` をインクリメントすること。**
変更しないと既存ユーザーに古いキャッシュが配信され続ける。古いキャッシュはactivateイベントで自動削除される。

現在の値: `quicknote-v2`

## アーキテクチャ

```
ブラウザ (public/index.html)
  └─ POST /.netlify/functions/notion-proxy
        ├─ GET  https://api.notion.com/v1/databases/{id}  ← スキーマ取得（title・date型プロパティを検出）
        └─ POST https://api.notion.com/v1/pages           ← ページ作成
```

**なぜプロキシが必要か**: Notion APIはブラウザからの直接リクエストをCORSでブロックするため、Netlify Functionsを経由する。

### フロントエンド (`public/index.html`)

フレームワーク・ビルドツールなし。バニラHTML/CSS/JSのシングルファイル。

**localStorage（キー: `quicknote-settings`）に保存する内容:**
```json
{ "token": "ntn_...", "databaseId": "xxx...", "theme": "light|dark|system" }
```
設定の保存は `saveSettings(updates)` でマージ書き込みする（既存キーを消さないため）。

**ダークモードの仕組み:**
- `applyTheme(theme)` が `<html>` に `.dark` クラスを付け外しする
- CSS は `:root` にデフォルト変数、`html.dark` にダーク変数を定義
- `system` 選択時は `matchMedia('prefers-color-scheme')` を参照し、変更イベントも監視する

**設定シートのパネルナビゲーション:**
- `.sheet-panels`（横並びflex）を `translateX(-100%)` でスライドさせる2パネル構成
- パネル1: 設定一覧（外観 / 連携）
- パネル2: サブパネル（`#sub-darkmode` / `#sub-notion` を `hidden` で切り替え）
- `navigateTo(name, animate)` で遷移、`closeSheet()` は閉じたあと自動でメインに戻す

### バックエンド (`netlify/functions/notion-proxy.js`)

npm依存なし。Node.js 18+のネイティブ `fetch` を使用。

**リクエストボディ:** `{ token, databaseId, content }`

**動作フロー:**
1. DBスキーマを取得し、`title` 型プロパティ名を動的に特定（DBごとに名前が異なるため）
2. `date` 型プロパティをすべて自動検出し、今日の日付（JST）をセット
3. ランダムなNotionアイコンURLをページの `icon` に設定
4. 1行目をタイトル、2行目以降をparagraphブロックとしてページを作成

**JSTの日付計算:** Netlifyの実行環境はUTCのため `Date.now() + 9 * 60 * 60 * 1000` で補正。

**ランダムアイコン:** `https://www.notion.so/icons/{name}_{color}.svg` 形式。`ICONS`（57種）と `COLORS`（10色）の配列からランダム選択。
