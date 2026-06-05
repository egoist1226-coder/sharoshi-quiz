/**
 * Sharoshi Quiz - Photo Upload Worker
 * 写真から問題・解説を抽出してGitHubにコミットする
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Secret',
};

// 1行あたりの文字数（問題集の仕様）
const CHARS_PER_LINE = 36;

// 文字数チェック（行数から厳密に算出）
// 有効範囲: (line_count-1)×36+1 ≤ actual ≤ line_count×36
// ＋OCR誤差の許容バッファ（±5文字）
const CHAR_BUFFER = 5;

// ===== プロンプト =====
function buildPrompt(isTwoPage, retryNote = '') {
  const base = isTwoPage
    ? `2枚の画像は社労士試験の問題集です。1枚目が問題ページ、2枚目が解答・解説ページです。問題番号で対応させてすべての問題を抽出してください。`
    : `この画像は社労士試験の問題集のページです。ページに掲載されているすべての問題を抽出してください。`;

  const retrySection = retryNote
    ? `\n\n【重要・再抽出指示】\n${retryNote}\n`
    : '';

  return `${base}${retrySection}

抽出ルール：
- 問題番号（数値）をidおよびsource_noに使う
- 問題文は問題集の原文を一字一句そのまま忠実に再現すること（修正・要約・補完は絶対にしない）
- 答の○はtrue、×はfalseとする${isTwoPage ? '（解説ページの○×を参照）' : ''}
- 解説中の赤文字・強調語は <span class="wrong-key">...</span> で囲む
- 難問ラベルがある問題はdifficulty: "hard"、基礎ラベルはdifficulty: "easy"、それ以外はdifficulty: "normal"
- categoryは問題のカテゴリ（例：障害厚生年金）
- line_count: 画像上でその問題文が占める行数（句読点・スペース含む印刷行数）を正確に数える
- last_line_half: 最終行の末尾文字の位置。1行36文字のうち左半分（1〜18文字目）で終わる場合は "left"、右半分（19〜36文字目）で終わる場合は "right"

JSONのみを返すこと（説明文は不要）:
[
  {
    "id": 数値,
    "line_count": 整数,
    "last_line_half": "left" または "right",
    "category": "カテゴリ名",
    "question": "問題文（原文そのまま）",
    "answer": true,
    "explanation": "解説文（赤文字は<span class=\\"wrong-key\\">テキスト</span>で囲む）",
    "difficulty": "normal",
    "source_no": 数値
  }
]`;
}

// ===== 文字数バリデーション =====
function validateCharCount(questions) {
  const valid = [];
  const invalid = [];

  for (const q of questions) {
    // line_countがない場合はスキップ（チェック不能）
    if (!q.line_count || q.line_count <= 0) {
      valid.push(q);
      continue;
    }
    const n    = q.line_count;
    const half = q.last_line_half; // "left"(1-18) or "right"(19-36)
    const base = (n - 1) * CHARS_PER_LINE;
    const actual = q.question.length;

    // last_line_half で最終行の位置を特定し範囲を±18字に絞る
    let lower, upper;
    if (half === 'left') {
      lower = base + 1  - CHAR_BUFFER;  // 最終行 1〜18字
      upper = base + 18 + CHAR_BUFFER;
    } else if (half === 'right') {
      lower = base + 19 - CHAR_BUFFER;  // 最終行 19〜36字
      upper = base + 36 + CHAR_BUFFER;
    } else {
      // last_line_half 未取得時は従来の全範囲（1〜36字）
      lower = base + 1  - CHAR_BUFFER;
      upper = base + 36 + CHAR_BUFFER;
    }

    if (actual < lower || actual > upper) {
      invalid.push({
        id: q.id,
        line_count: n,
        last_line_half: half,
        lower,
        upper,
        actual,
        diff: actual - (base + (half === 'left' ? 9 : 27)), // 中央値との差
      });
    } else {
      valid.push(q);
    }
  }
  return { valid, invalid };
}

// ===== Claude API呼び出し =====
async function callClaude(env, content) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': (env.ANTHROPIC_API_KEY || '').trim(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.content[0].text;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error(`JSON not found in response: ${text.substring(0, 200)}`);

  return JSON.parse(match[0]);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    const secret = (request.headers.get('X-Upload-Secret') || '').trim();
    const storedSecret = (env.UPLOAD_SECRET || '').trim();
    if (!storedSecret || secret !== storedSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const url = new URL(request.url);
    if (url.pathname === '/extract') return handleExtract(request, env);
    if (url.pathname === '/commit')  return handleCommit(request, env);
    return json({ error: 'Not found' }, 404);
  }
};

// ===== 抽出処理（文字数チェック＋リトライあり）=====
async function handleExtract(request, env) {
  const body = await request.json();
  const { image, mimeType, imageQ, imageA, mimeTypeQ, mimeTypeA } = body;
  const isTwoPage = !!(imageQ && imageA);

  if (!isTwoPage && !image) {
    return json({ error: 'No image provided' }, 400);
  }

  // 画像contentを構築する関数
  const buildContent = (retryNote = '') => {
    const prompt = buildPrompt(isTwoPage, retryNote);
    if (isTwoPage) {
      return [
        { type: 'image', source: { type: 'base64', media_type: mimeTypeQ || 'image/jpeg', data: imageQ } },
        { type: 'image', source: { type: 'base64', media_type: mimeTypeA || 'image/jpeg', data: imageA } },
        { type: 'text', text: prompt }
      ];
    }
    return [
      { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: image } },
      { type: 'text', text: prompt }
    ];
  };

  const MAX_RETRIES = 2;
  let allQuestions = [];
  const validationLog = [];

  try {
    // ===== 第1回抽出 =====
    let questions = await callClaude(env, buildContent());
    const { valid, invalid } = validateCharCount(questions);

    allQuestions = valid;
    validationLog.push({
      attempt: 1,
      total: questions.length,
      passed: valid.length,
      failed: invalid,
    });

    // ===== リトライ（最大MAX_RETRIES回）=====
    let remaining = invalid;
    for (let attempt = 2; attempt <= MAX_RETRIES + 1 && remaining.length > 0; attempt++) {
      const retryNote = remaining.map(f =>
        `問題ID ${f.id}：行数=${f.line_count}行、許容範囲=${f.lower}〜${f.upper}字、` +
        `前回抽出=${f.actual}字（${f.diff > 0 ? '多' : '少'}すぎ）。` +
        `問題文を一字一句そのまま正確に読み直してください。`
      ).join('\n');

      const retried = await callClaude(env, buildContent(retryNote));

      // リトライ対象IDのみ再チェック
      const retryIds = new Set(remaining.map(r => r.id));
      const retryQuestions = retried.filter(q => retryIds.has(q.id));
      const { valid: rv, invalid: ri } = validateCharCount(retryQuestions);

      allQuestions.push(...rv);
      validationLog.push({
        attempt,
        retried: retryIds.size,
        passed: rv.length,
        failed: ri,
      });

      remaining = ri;
    }

    // 最終的に検証失敗したものも含める（最善努力）
    if (remaining.length > 0) {
      // 最後のリトライ結果から取得
      const lastRetried = await callClaude(env, buildContent());
      const lastIds = new Set(remaining.map(r => r.id));
      allQuestions.push(...lastRetried.filter(q => lastIds.has(q.id)));
    }

    // 検証用フィールドを削除（DBには不要）
    const output = allQuestions.map(({ line_count, last_line_half, ...q }) => q);

    return json({
      success: true,
      questions: output,
      validation: validationLog,
    });

  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// ===== コミット処理 =====
async function handleCommit(request, env) {
  const body = await request.json();
  const { questions, subcatFile } = body;

  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return json({ error: 'No questions provided' }, 400);
  }
  if (!subcatFile) {
    return json({ error: 'subcatFile is required' }, 400);
  }

  const owner = env.GITHUB_OWNER;
  const repo  = env.GITHUB_REPO;
  const path  = `data/${subcatFile}.json`;
  const token = (env.GITHUB_TOKEN || '').trim();

  let existing = [];
  let fileSha  = null;

  const getRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
    { headers: { Authorization: `token ${token}`, 'User-Agent': 'sharoshi-quiz-worker' } }
  );

  if (getRes.ok) {
    const fileData = await getRes.json();
    fileSha  = fileData.sha;
    existing = JSON.parse(decodeBase64Utf8(fileData.content));
  }

  const existingIds = new Set(existing.map(q => q.id));
  const toAdd = questions.filter(q => !existingIds.has(q.id));
  if (toAdd.length === 0) {
    return json({ success: true, added: 0, message: 'All questions already exist' });
  }

  const updated    = [...existing, ...toAdd];
  const newContent = encodeBase64Utf8(JSON.stringify(updated, null, 2));

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
