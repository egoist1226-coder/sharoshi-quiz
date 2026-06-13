// ===== 設定 =====
const SESSION_SIZE = 30;

// ===== ストレージ管理 =====
const STORAGE_KEY = 'sharoshi_quiz_v1';

function loadStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { return {}; }
}

function saveStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getSubjectData(subjectKey) {
  const all = loadStorage();
  if (!all[subjectKey]) {
    all[subjectKey] = { questions: {} };
    saveStorage(all);
  }
  return all[subjectKey];
}

function recordAnswer(subjectKey, questionId, isCorrect) {
  const all = loadStorage();
  if (!all[subjectKey]) all[subjectKey] = { questions: {} };
  const qs = all[subjectKey].questions;
  if (!qs[questionId]) qs[questionId] = { attempts: 0, correct: 0, wrong: 0, consecutiveCorrect: 0 };
  const q = qs[questionId];
  q.attempts++;

  let wasJustMastered = false;
  if (isCorrect) {
    q.correct++;
    q.consecutiveCorrect = (q.consecutiveCorrect || 0) + 1;
    if (!q.mastered && (q.wrong > 0 || q.manualWeak) && q.consecutiveCorrect >= 3) {
      q.mastered = true;
      wasJustMastered = true;
    }
  } else {
    q.wrong++;
    q.consecutiveCorrect = 0;
  }
  q.lastResult = isCorrect;
  saveStorage(all);
  return { wasJustMastered };
}

function addManualWeak(subjectKey, questionId) {
  const all = loadStorage();
  if (!all[subjectKey]) all[subjectKey] = { questions: {} };
  const qs = all[subjectKey].questions;
  if (!qs[questionId]) qs[questionId] = { attempts: 0, correct: 0, wrong: 0, consecutiveCorrect: 0 };
  qs[questionId].manualWeak = true;
  qs[questionId].mastered = false;
  qs[questionId].consecutiveCorrect = 0;
  saveStorage(all);
}

// サブカテゴリキーを含む全関連キーを返す
function _getRelatedKeys(subjectKey) {
  const config = MULTI_SUBJECT_FILES[subjectKey];
  if (!config) return [subjectKey];
  const files = Array.isArray(config) ? config : config.files;
  return [subjectKey, ...files];
}

// getStats: 全問演習(subjectKey)＋全サブカテゴリキーを集計
function getStats(subjectKey) {
  const all = loadStorage();
  const keys = _getRelatedKeys(subjectKey);
  let totalAttempts = 0, totalCorrect = 0;
  const weakSet = new Set();

  for (const key of keys) {
    const q = all[key]?.questions || {};
    for (const id in q) {
      totalAttempts += q[id].attempts || 0;
      totalCorrect += q[id].correct || 0;
      if ((q[id].wrong > 0 || q[id].manualWeak) && !q[id].mastered) {
        weakSet.add(`${key}::${id}`);
      }
    }
  }
  return { totalAttempts, totalCorrect, weakCount: weakSet.size };
}

// getWeakQuestionIds: 全関連キーから苦手問題IDを集約（重複排除）
function getWeakQuestionIds(subjectKey) {
  const all = loadStorage();
  const keys = _getRelatedKeys(subjectKey);
  const idSet = new Set();
  for (const key of keys) {
    const q = all[key]?.questions || {};
    Object.entries(q)
      .filter(([, v]) => (v.wrong > 0 || v.manualWeak) && !v.mastered)
      .forEach(([id]) => idSet.add(parseInt(id)));
  }
  return [...idSet];
}

function getQuestionConsecutive(subjectKey, questionId) {
  const data = getSubjectData(subjectKey);
  const q = data.questions[questionId];
  return q ? { consecutiveCorrect: q.consecutiveCorrect || 0, mastered: !!q.mastered } : { consecutiveCorrect: 0, mastered: false };
}

// resetSubject: 全問演習キー＋全サブカテゴリキーをリセット
function resetSubject(subjectKey) {
  const all = loadStorage();
  const keys = _getRelatedKeys(subjectKey);
  for (const key of keys) {
    all[key] = { questions: {} };
  }
  saveStorage(all);
}

// ===== 複数ファイル統合設定 =====
const MULTI_SUBJECT_FILES = {
  kenkou_hoken: ['kenkou_hoken_01', 'kenkou_hoken_02', 'kenkou_hoken_03', 'kenkou_hoken_04'],
  kousei_nenkin: { files: [
    'kousei_nenkin_01', 'kousei_nenkin_02', 'kousei_nenkin_03', 'kousei_nenkin_04',
    'kousei_nenkin_05', 'kousei_nenkin_06', 'kousei_nenkin_07', 'kousei_nenkin_08',
    'kousei_nenkin_09', 'kousei_nenkin_10', 'kousei_nenkin_11', 'kousei_nenkin_12',
    'kousei_nenkin_13', 'kousei_nenkin_14', 'kousei_nenkin_15', 'kousei_nenkin_16',
    'kousei_nenkin_17', 'kousei_nenkin_18', 'kousei_nenkin_19', 'kousei_nenkin_20',
    'kousei_nenkin_21',
  ], noIdTransform: true },
};

const SUBJECT_FILE_ALIAS = {};

// ===== 問題データ読み込み =====
async function loadQuestions(subjectFile, subcat) {
  if (MULTI_SUBJECT_FILES[subjectFile]) {
    const config = MULTI_SUBJECT_FILES[subjectFile];
    const files = Array.isArray(config) ? config : config.files;
    const noIdTransform = !Array.isArray(config) && !!config.noIdTransform;
    const targetFiles = (subcat && files.includes(subcat)) ? [subcat] : files;
    const ts = Date.now();
    const results = await Promise.all(
      targetFiles.map(f =>
        fetch(`data/${f}.json?_=${ts}`, { cache: 'no-store' })
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      )
    );
    const combined = [];
    results.forEach((qs, idx) => {
      const fileIdx = noIdTransform ? 0 : (subcat ? files.indexOf(targetFiles[0]) : idx);
      qs.forEach(q => {
        combined.push(noIdTransform
          ? { ...q }
          : { ...q, id: (fileIdx + 1) * 10000 + q.id });
      });
    });
    return combined;
  }
  const alias = SUBJECT_FILE_ALIAS[subjectFile] || subjectFile;
  const res = await fetch(`data/${alias}.json?_=${Date.now()}`, { cache: 'no-store' });
  return res.json();
}

// ===== URLパラメータ =====
function getParams() {
  const p = new URLSearchParams(location.search);
  const diffRaw = p.get('diff') || '';
  const diff = diffRaw ? diffRaw.split(',').filter(Boolean) : [];
  return {
    subject: p.get('subject') || 'kokumin_kenko_hoken',
    mode: p.get('mode') || 'all',
    subcat: p.get('subcat') || '',
    diff, // [] = 全難易度、['easy','normal'] 等 = 絞り込み
  };
}

// ===== シャッフル =====
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== クイズコントローラー =====
class QuizController {
  constructor(questions, subjectKey, mode, diff = []) {
    this.subjectKey = subjectKey;
    this.mode = mode;
    this.allQuestions = questions;
    this.questions = this._selectQuestions(questions, mode, subjectKey, diff);
    this.current = 0;
    this.correctCount = 0;
    this.wrongCount = 0;
    this.answered = false;
  }

  _selectQuestions(all, mode, subjectKey, diff) {
    const limit = Math.min(SESSION_SIZE, all.length);

    if (mode === 'seq') {
      // 順番演習: 難易度フィルター後にID昇順で全問
      const filtered = diff.length > 0 ? all.filter(q => diff.includes(q.difficulty)) : all;
      return [...filtered].sort((a, b) => a.id - b.id);
    }

    if (mode === 'weak') {
      const weakIds = getWeakQuestionIds(subjectKey);
      const weak = shuffle(all.filter(q => weakIds.includes(q.id)));
      return weak.slice(0, limit);
    }

    // 通常モード: 出題頻度が低い問題を優先
    const qs = loadStorage()[subjectKey]?.questions || {};
    const weighted = shuffle(all).map(q => ({
      q,
      attempts: qs[String(q.id)]?.attempts || 0,
    }));
    weighted.sort((a, b) => a.attempts - b.attempts);
    return weighted.slice(0, limit).map(w => w.q);
  }

  get total() { return this.questions.length; }
  get currentQ() { return this.questions[this.current]; }
  get isLast() { return this.current >= this.total - 1; }
  get progress() { return (this.current / this.total) * 100; }

  answer(userAnswer) {
    if (this.answered) return null;
    this.answered = true;
    const isCorrect = userAnswer === this.currentQ.answer;
    if (isCorrect) this.correctCount++;
    else this.wrongCount++;
    const { wasJustMastered } = recordAnswer(this.subjectKey, this.currentQ.id, isCorrect);
    return { isCorrect, wasJustMastered };
  }

  next() {
    if (!this.isLast) {
      this.current++;
      this.answered = false;
      return true;
    }
    return false;
  }

  get accuracy() {
    const total = this.correctCount + this.wrongCount;
    return total === 0 ? 0 : Math.round((this.correctCount / total) * 100);
  }
}

// グローバルに公開
window.QuizAPI = {
  SESSION_SIZE,
  loadQuestions,
  QuizController,
  getStats,
  getWeakQuestionIds,
  getQuestionConsecutive,
  addManualWeak,
  resetSubject,
  getParams,
  loadStorage,
};
