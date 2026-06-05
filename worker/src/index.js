/**
 * Sharoshi Quiz - Photo Upload Worker
 * 写真から問題・解説を抽出してGitHubにコミットする
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Secret',
};

const CLAUDE_PROMPT = `この画像は社労士試験の問題集のページです。
ページに掲載されているすべての問題を抽出してください。

抽出ルール：
- 問題番号（数値）をidおよびsource_noに使う
- 答の○はtrue、×はfalseとする
- 解説中の赤文字・強調語は <span class="wrong-key">...</span> で囲む
- 難問ラベルがある問題はdifficulty: "hard"、基礎ラベルはdifficulty: "easy"、それ以外はdifficulty: "normal"
- categoryは問題のカテゴリ（例：障害厚生年金）

JSONのみを返すこと（説明文は不要）:
[
  {
    "id": 数値,
    "category": "カテゴリ名",
    "question": "問題文",
    "answer": true,
    "explanation": "解説文（赤文字は<span class=\\"wrong-key\\">テキスト</span>で囲む）",
    "difficulty": "normal",
    "source_no": 数値
  }
]`;

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // 認証チェック
    const secret = request.headers.get('X-Upload-Secret');
    if (!env.UPLOAD_SECRET || secret !== env.UPLOAD_SECRET) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const url = new URL(request.url);

    // ===== /extract: 画像から問題を抽出（コミットしない）=====
    if (url.pathname === '/extract') {
      return handleExtract(request, env);
    }

    // ===== /commit: 抽出済みJSONをGitHubにコミット =====
    if (url.pathname === '/commit') {
      return handleCommit(request, env);
    }

    return json({ error: 'Not found' }, 404);
  }
};

// ===== 抽出処理 =====
async function handleExtract(request, env) {
  let imageBase64, mimeType;

  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const file = formData.get('image');
    if (!file) return json({ error: 'No image provided' }, 400);
    const buf = await file.arrayBuffer();
    imageBase64 = arrayBufferToBase64(buf);
    mimeType = file.type || 'image/jpeg';
  } else {
    // JSON形式（base64）
    const body = await request.json();
    imageBase64 = body.image;
    mimeType = body.mimeType || 'image/jpeg';
    if (!imageBase64) return json({ error: 'No image provided' }, 400);
  }

  // Claude API呼び出し
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 }
          },
          { type: 'text', text: CLAUDE_PROMPT }
        ]
      }]
    })
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    return json({ error: 'Claude API error', detail: err }, 500);
  }

  const claudeData = await claudeRes.json();
  const text = claudeData.content[0].text;

  // JSONを抽出
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return json({ error: 'Could not parse questions from image', raw: text }, 500);

  let questions;
  try {
    questions = JSON.parse(match[0]);
  } catch (e) {
    return json({ error: 'JSON parse error', raw: match[0] }, 500);
  }

  return json({ success: true, questions });
}

// ===== コミット処理 =====
async function handleCommit(request, env) {
  const body = await request.json();
  const { questions, subcatFile } = body;

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return json({ error: 'No questions provided' }, 400);
  }
  if (!subcatFile) {
    return json({ error: 'subcatFile is required (e.g. kousei_nenkin_10)' }, 400);
  }

  const owner = env.GITHUB_OWNER;
  const repo  = env.GITHUB_REPO;
  const path  = `data/${subcatFile}.json`;
  const token = env.GITHUB_TOKEN;

  // 既存ファイルを取得
  let existing = [];
  let fileSha   = null;

  const getRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { headers: { Authorization: `token ${token}`, 'User-Agent': 'sharoshi-quiz-worker' } }
  );

  if (getRes.ok) {
    const fileData = await getRes.json();
    fileSha  = fileData.sha;
    existing = JSON.parse(decodeBase64Utf8(fileData.content));
  }

  // 重複IDをスキップして追記
  const existingIds = new Set(existing.map(q => q.id));
  const toAdd = questions.filter(q => !existingIds.has(q.id));
  if (toAdd.length === 0) {
    return json({ success: true, added: 0, message: 'All questions already exist' });
  }

  const updated = [...existing, ...toAdd];
  const newContent = encodeBase64Utf8(JSON.stringify(updated, null, 2));

  // GitHubにコミット
  const putRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'sharoshi-quiz-worker',
      },
      body: JSON.stringify({
        message: `Add ${toAdd.length} questions to ${subcatFile} via photo upload`,
        content: newContent,
        sha: fileSha || undefined,
        committer: { name: 'Sharoshi Quiz Bot', email: 'bot@sharoshi-quiz.app' }
      })
    }
  );

  if (!putRes.ok) {
    const err = await putRes.text();
    return json({ error: 'GitHub commit failed', detail: err }, 500);
  }

  return json({ success: true, added: toAdd.length, total: updated.length });
}

// ===== ユーティリティ =====
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64Utf8(str) {
  const clean = str.replace(/\n/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
