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

## アーキテクチャ

```
ブラウザ (public/index.html)
  └─ POST /.netlify/functions/notion-proxy
        ├─ GET  https://api.notion.com/v1/databases/{id}  ← スキーマ取得
        └─ POST https://api.notion.com/v1/pages           ← ページ作成
```

**なぜプロキシが必要か**: Notion APIはブラウザからの直接リクエストをCORSでブロックするため、Netlify Functionsを経由する。

### フロントエンド (`public/index.html`)

- フレームワーク・ビルドツールなし。バニラHTML/CSS/JS のシングルファイル。
- NotionのトークンとデータベースIDをlocalStorageに保存（キー: `quicknote-settings`）。
- PWA: `manifest.json` + `sw.js`（アプリシェルをキャッシュ優先で配信、APIリクエストはService Workerをバイパス）。

### バックエンド (`netlify/functions/notion-proxy.js`)

- npm依存なし。Node.js 18+のネイティブ `fetch` を使用。
- リクエストボディ: `{ token, databaseId, content }`
- 動作フロー:
  1. DBスキーマを取得し、`title`型プロパティ名を動的に特定（DBごとに名前が異なるため）
  2. `date`型プロパティをすべて自動検出し、今日の日付（JST）を自動セット
  3. 1行目をタイトル、2行目以降をparagraphブロックとしてページを作成
- JSTの日付: Netlifyの実行環境はUTCのため `Date.now() + 9h` で補正している

### Service Workerのキャッシュ更新

`sw.js` を変更した場合は `CACHE_NAME`（例: `quicknote-v1` → `quicknote-v2`）をインクリメントすること。古いキャッシュはactivateイベントで自動削除される。
