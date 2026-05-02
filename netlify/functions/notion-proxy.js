/**
 * Notion API プロキシ
 * ブラウザからは CORS で直接叩けないため、Netlify Functions 経由でリクエストする
 */

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE = 'https://api.notion.com/v1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  // プリフライトリクエスト対応
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: cors, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: json({ message: 'Method Not Allowed' }) };
  }

  // ── 入力バリデーション ─────────────────────────────────────
  let token, databaseId, content;
  try {
    ({ token, databaseId, content } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers: cors, body: json({ message: 'リクエストの形式が不正です' }) };
  }

  if (!token || !databaseId || !content?.trim()) {
    return { statusCode: 400, headers: cors, body: json({ message: '必須項目が不足しています' }) };
  }

  const notionHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };

  // ── DBスキーマを取得してタイトルプロパティ名を特定 ──────────
  let titlePropName;
  try {
    const dbRes = await fetch(`${NOTION_BASE}/databases/${databaseId}`, {
      headers: notionHeaders,
    });

    if (!dbRes.ok) {
      const err = await dbRes.json();
      const msg = dbRes.status === 401
        ? 'APIトークンが無効です'
        : dbRes.status === 404
        ? 'データベースが見つかりません（DBにインテグレーションを接続しましたか？）'
        : (err.message || 'データベースの取得に失敗しました');
      return { statusCode: dbRes.status, headers: cors, body: json({ message: msg }) };
    }

    const db = await dbRes.json();
    const titleEntry = Object.entries(db.properties).find(([, prop]) => prop.type === 'title');

    if (!titleEntry) {
      return { statusCode: 400, headers: cors, body: json({ message: 'タイトルプロパティが見つかりません' }) };
    }
    titlePropName = titleEntry[0];
  } catch (err) {
    console.error('DB fetch error:', err);
    return { statusCode: 500, headers: cors, body: json({ message: 'データベースへの接続に失敗しました' }) };
  }

  // ── ページ作成 ─────────────────────────────────────────────
  // 1行目をタイトル、2行目以降を本文ブロックとして扱う
  const trimmed = content.trim();
  const lines = trimmed.split('\n');
  const title = lines[0].slice(0, 100);
  const bodyLines = lines.slice(1).filter((_, i, arr) => {
    // 先頭の空行はスキップ
    return !(i === 0 && arr[0] === '');
  });

  const pagePayload = {
    parent: { database_id: databaseId },
    properties: {
      [titlePropName]: {
        title: [{ text: { content: title } }],
      },
    },
  };

  // 本文がある場合はページにブロックとして追加
  if (bodyLines.length > 0) {
    pagePayload.children = bodyLines.map((line) => ({
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [
          {
            type: 'text',
            text: { content: line || ' ' }, // 空行は半角スペースで代替
          },
        ],
      },
    }));
  }

  try {
    const pageRes = await fetch(`${NOTION_BASE}/pages`, {
      method: 'POST',
      headers: notionHeaders,
      body: JSON.stringify(pagePayload),
    });

    if (!pageRes.ok) {
      const err = await pageRes.json();
      return {
        statusCode: pageRes.status,
        headers: cors,
        body: json({ message: err.message || 'ページの作成に失敗しました' }),
      };
    }

    const page = await pageRes.json();
    return {
      statusCode: 200,
      headers: cors,
      body: json({ success: true, pageId: page.id, pageUrl: page.url }),
    };
  } catch (err) {
    console.error('Page create error:', err);
    return { statusCode: 500, headers: cors, body: json({ message: 'ページの作成に失敗しました' }) };
  }
};

function json(obj) {
  return JSON.stringify(obj);
}
