/**
 * Sharoshi Quiz - Photo Upload Worker
 * 写真から問題・解説を抽出してGitHubにコミットする
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Secret',
};

// 1行あたりの文字数（問題集の仕様：実測37文字）
const CHARS_PER_LINE = 37;

// ===== プロンプト =====
function buildPrompt(isTwoPage, retryNote = '', isTextMode = false) {
  let base;
  if (isTextMode) {
    base = `以下は社労士試験問題集のOCRテキストです。【問題ページ OCRテキスト】が問題ページ、【解説ページ OCRテキスト】が解答・解説ページです。問題番号で対応させてすべての問題を抽出してください。`;
  } else if (isTwoPage) {
    base = `2ページのコンテンツは社労士試験の問題集です（問題ページと解答・解説ページ）。問題番号で対応させてすべての問題を抽出してください。`;
  } else {
    base = `このページは社労士試験の問題集です。ページに掲載されているすべての問題を抽出してください。`;
  }

  const retrySection = retryNote
    ? `\n\n【重要・再抽出指示】\n${retryNote}\n`
    : '';

  const lineCountRule = isTextMode ? '' : `
- line_count: 問題文本文のみの印刷行数を数える（1行37文字）。問題番号・難易度ラベル・試験回次（例：「379 □□□ 難 R元.5-ア」）の行は含めない。最終行が途中で終わる場合も必ず1行としてカウントする（例：4完全行＋短い5行目 → line_count:5）。**問題文の1行目（最初の行）を必ず含めること。かすれ・読み取り困難でも印刷されている行はカウントすること。**
- last_line_half: 最終行の文字数が左半分（1〜18文字）なら "left"、右半分（19〜37文字）なら "right"
- ※ 括弧「(」「)」やピリオド「.」などの半角文字は0.5文字としてカウントする`;

  const lineCountJson = isTextMode ? '' : `
    "line_count": 整数,
    "last_line_half": "left" または "right",`;

  return `${base}${retrySection}

【問題番号の読み取りルール（最重要）】
問題番号は必ず【解説ページ OCRテキスト】からのみ取得する。解説ページでは各問の冒頭が「○ 419」や「× 420」の形式になっており、○または×の記号の直後に半角スペースと3桁の問題番号が続く。この3桁の整数をそのまま id および source_no に使うこと。

【○マークがOCRで読めない場合の境界判定ルール】
○（正解）のマークはOCRスキャンで読み取れず、ゴミ文字や空白に化けることが多い。その場合でも各問の解説は必ず「（法○○条）」「（法附則○○条）」「（令○○条）」などの法令引用から本文が始まる。この法令引用の出現を「新しい問題の解説開始」と判定すること。一つ前の問題の解説は法令引用が現れる直前までである。

【絶対に問題番号として使ってはならないもの】
問題ページ・解説ページ両方の余白には「H28.7-ウ」「R3.6-B」「H元.5-ア」のような過去問出題履歴コードが印字されている場合がある。このコードは「元号（HまたはR）＋年数＋枝番号」の形式であり、問題番号とは無関係である。「H」は平成（Heisei）、「R」は令和（Reiwa）の略であって数字ではない。OCRが「H」を「4」に、「R」を「5」に誤読することがあり、たとえばH28.7-ウが「428.7-ウ」や「4280」に化けることがあるが、いかなる場合もこれらを問題番号として使用してはならない。

- 問題番号が解説ページの「○/× + 数値」形式から読み取れない場合のみ id:0 とする（推定・連番・補完は絶対禁止）
- ページ内のすべての問題を漏れなく抽出すること
- 問題文は問題集の原文を一字一句そのまま忠実に再現すること（修正・要約・補完・言い換えは絶対にしない）
- 答の○はtrue、×はfalseとする${isTwoPage ? '（解説ページの○×を参照）' : ''}
- 解説中の赤文字・強調語は <span class="wrong-key">...</span> で囲む
- 難問ラベルがある問題はdifficulty: "hard"、基礎ラベルはdifficulty: "easy"、それ以外はdifficulty: "normal"
- categoryは問題のカテゴリ（例：障害厚生年金）${lineCountRule}

JSONのみを返すこと（説明文は不要）:
[
  {
    "id": 数値,${lineCountJson}
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
    const half = q.last_line_half; // "left"(1-18) or "right"(19-37)
    const base   = (n - 1) * CHARS_PER_LINE;
    const actual = q.question.length;

    let lower, upper, expected;
    if (half === 'left') {
      lower    = base + 1;
      upper    = base + 18;
      expected = base + 9;
    } else if (half === 'right') {
      lower    = base + 19;
      upper    = base + 37;
      expected = base + 27;
    } else {
      // last_line_half 未取得時は全範囲＋バッファ5
      expected = base + 18;
      lower    = base + 1  - 5;
      upper    = base + 37 + 5;
    }

    if (actual < lower || actual > upper) {
      invalid.push({
        id: q.id,
        line_count: n,
        last_line_half: half,
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

// ===== リトライ指示文生成（具体的なヒント付き）=====
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
      `行数=${f.line_count}行・最終行=${f.last_line_half ?? '未取得'}（left=左半分1〜18字/right=右半分19〜37字）、` +
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
  const { image, mimeType, imageQ, imageA, mimeTypeQ, mimeTypeA, pdf, pdfQ, pdfA, textQ, textA } = body;
  const isTextMode = !!(textQ && textA);
  const isTwoPage = isTextMode || (!!(imageQ || pdfQ) && !!(imageA || pdfA));

  if (!isTextMode && !isTwoPage && !image && !pdf) {
    return json({ error: 'No image or PDF provided' }, 400);
  }

  // 1ブロック分のcontent要素を生成（画像 or PDFドキュメント）
  const makeBlock = (data, mt, isPdf) => isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image',    source: { type: 'base64', media_type: mt || 'image/jpeg',  data } };

  // 問題ページから試験年度コード（H28.7-ウ, R3.6-B 等）を除去
  // OCRが H→4, R→5 と誤読することがあり問題番号と誤認識される原因となる
  const stripExamCodes = (text) => text
    .replace(/[HR元][\d元]{1,2}[.．][\d]{1,2}[-－][アイウエオA-Z]/g, '')
    .replace(/[45][\d]{1,2}[.．][\d]{1,2}[-－][アイウエオA-Z]/g, ''); // H→4, R→5 誤読パターンも除去

  // contentを構築する関数
  const buildContent = (retryNote = '') => {
    const prompt = buildPrompt(isTwoPage, retryNote, isTextMode);
    if (isTextMode) {
      const cleanQ = stripExamCodes(textQ);
      const cleanA = stripExamCodes(textA);
      return [
        { type: 'text', text: `【問題ページ OCRテキスト】\n${cleanQ}` },
        { type: 'text', text: `【解説ページ OCRテキスト】\n${cleanA}` },
        { type: 'text', text: prompt }
      ];
    }
    if (isTwoPage) {
      return [
        makeBlock(pdfQ || imageQ, mimeTypeQ, !!pdfQ),
        makeBlock(pdfA || imageA, mimeTypeA, !!pdfA),
        { type: 'text', text: prompt }
      ];
    }
    return [
      makeBlock(pdf || image, mimeType, !!pdf),
      { type: 'text', text: prompt }
    ];
  };

  const MAX_RETRIES = 2;
  let allQuestions = [];
  const validationLog = [];

  try {
    // ===== テキストモード：バリデーション不要で即返却 =====
    if (isTextMode) {
      const questions = await callClaude(env, buildContent());
      const output = questions.map(({ line_count, last_line_half, ...q }) => q);
      return json({ success: true, questions: output, validation: [], review_count: 0 });
    }

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
      const retryNote = buildRetryNote(remaining);
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

    // ===== 最終的に検証失敗した問題は review_needed フラグ付きで返却 =====
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
    const output = allQuestions.map(({ line_count, last_line_half, ...q }) => q);

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

  // review_needed は警告のみ（コミットはブロックしない）
  const reviewRemaining = questions.filter(q => q.review_needed);

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
