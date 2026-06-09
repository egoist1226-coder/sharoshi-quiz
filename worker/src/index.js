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

// 文字数チェックのバッファ（±3文字）
// last_line_pos（1〜36の確定位置）を使うため厳格化
const CHAR_BUFFER = 3;

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
- 問題文は問題集の原文を一字一句そのまま忠実に再現すること（修正・要約・補完・言い換えは絶対にしない）
- 答の○はtrue、×はfalseとする${isTwoPage ? '（解説ページの○×を参照）' : ''}
- 解説中の赤文字・強調語は <span class="wrong-key">...</span> で囲む
- 難問ラベルがある問題はdifficulty: "hard"、基礎ラベルはdifficulty: "easy"、それ以外はdifficulty: "normal"
- categoryは問題のカテゴリ（例：障害厚生年金）
- line_count: 画像上でその問題文が占める行数（句読点・スペース含む印刷行数）を正確に数える
- last_line_pos: 最終行において最後の文字が左から何文字目（1〜36）に位置するかを整数で記録する（例：最終行が15文字で終わっていれば 15、36文字ちょうど埋まっていれば 36）

JSONのみを返すこと（説明文は不要）:
[
  {
    "id": 数値,
    "line_count": 整数,
    "last_line_pos": 整数（1〜36）,
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
    const n   = q.line_count;
    const pos = q.last_line_pos; // 1〜36の整数
    const base   = (n - 1) * CHARS_PER_LINE;
    const actual = q.question.length;

    let lower, upper, expected;
    if (pos && pos >= 1 && pos <= 36) {
      // 案A: last_line_posで確定した期待値に±バッファ
      expected = base + pos;
      lower    = expected - CHAR_BUFFER;
      upper    = expected + CHAR_BUFFER;
    } else {
      // last_line_pos 未取得時は従来の全範囲（1〜36字）＋バッファ5
      expected = base + 18; // 中央値
      lower    = base + 1  - 5;
      upper    = base + 36 + 5;
    }

    if (actual < lower || actual > upper) {
      invalid.push({
        id: q.id,
        line_count: n,
        last_line_pos: pos,
        expected,
        lower,
        upper,
        actual,
        diff: actual - expected,
      });
    } else {
      valid.push(q);
    }
  }
  return { valid, invalid };
}

// ===== リトライ指示文生成（案C: 具体的なヒント付き）=====
function buildRetryNote(failures) {
  return failures.map(f => {
    const absDiff = Math.abs(f.diff);
    const direction = f.diff > 0 ? '多い' : '少ない';
    const hint = f.diff > 0
      ? `問題文に余分な文字（送り仮名の重複・句読点の挿入・スペースの混入・不要な括弧など）が混入している可能性があります。` +
        `特に問題文の後半部分（${f.line_count}行目付近）を一字一句見直してください。`
      : `問題文の一部が欠落している可能性があります。` +
        `特に文末付近（${f.line_count}行目）が途中で切れていないか、最後まで読み切れているか確認してください。`;
    return (
      `問題ID ${f.id}：` +
      `行数=${f.line_count}行・最終行位置=${f.last_line_pos ?? '未取得'}文字目、` +
      `想定文字数=${f.expected}字（許容=${f.lower}〜${f.upper}字）、` +
      `前回抽出=${f.actual}字（約${absDiff}字${direction}）。` +
      hint
    );
  }).join('\n');
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
      const retryNote = buildRetryNote(remaining); // 案C: 具体的な指示
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

    // ===== 案B: 最終的に検証失敗した問題は review_needed フラグ付きで返却 =====
    // （無条件採用せず、UIで要確認表示・コミットブロック）
    if (remaining.length > 0) {
      const lastRetryNote = buildRetryNote(remaining);
      const lastRetried = await callClaude(env, buildContent(lastRetryNote));
      const lastIds = new Set(remaining.map(r => r.id));
      const flagged = lastRetried
        .filter(q => lastIds.has(q.id))
        .map(q => ({
          ...q,
          review_needed: true,
          review_info: (() => {
            const f = remaining.find(r => r.id === q.id);
            return f
              ? `文字数不一致: 抽出=${f.actual}字、想定=${f.expected}字（許容${f.lower}〜${f.upper}字）`
              : '文字数チェック失敗';
          })(),
        }));
      allQuestions.push(...flagged);
    }

    // 検証用フィールドを削除（DBには不要）
    const output = allQuestions.map(({ line_count, last_line_pos, ...q }) => q);

    return json({
      success: true,
      questions: output,
      validation: validationLog,
      review_count: output.filter(q => q.review_needed).length,
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

  // 案B: review_needed が残っているままコミットしようとした場合は拒否
  const reviewRemaining = questions.filter(q => q.review_needed);
  if (reviewRemaining.length > 0) {
    return json({
      error: `${reviewRemaining.length}問が文字数チェック未通過です（ID: ${reviewRemaining.map(q => q.id).join(', ')}）。問題文を手動で確認・修正してください。`,
      review_needed_ids: reviewRemaining.map(q => q.id),
    }, 422);
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

  // コミット前に review_needed / review_info フィールドを除去
  const cleanQuestions = questions.map(({ review_needed, review_info, ...q }) => q);

  const existingIds = new Set(existing.map(q => q.id));
  const toAdd = cleanQuestions.filter(q => !existingIds.has(q.id));
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
