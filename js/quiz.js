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
    // 苦手問題に登録済みで3連続正解 → 苦手リストから除外（手動登録も対象）
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

// 正解した問題を手動で苦手リストに追加する
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

function getStats(subjectKey) {
  const data = getSubjectData(subjectKey);
  const q = data.questions;
  let totalAttempts = 0, totalCorrect = 0, weakCount = 0;
  for (const id in q) {
    totalAttempts += q[id].attempts;
    totalCorrect += q[id].correct;
    // mastered（3連続正解済み）は苦手カウントから除外。手動登録も含む
    if ((q[id].wrong > 0 || q[id].manualWeak) && !q[id].mastered) weakCount++;
  }
  return { totalAttempts, totalCorrect, weakCount };
}

function getWeakQuestionIds(subjectKey) {
  const data = getSubjectData(subjectKey);
  return Object.entries(data.questions)
    .filter(([, v]) => (v.wrong > 0 || v.manualWeak) && !v.mastered)
    .map(([id]) => parseInt(id));
}

// 問題のマスター状態を取得（苦手リストから除外済みかどうか）
function getQuestionConsecutive(subjectKey, questionId) {
  const data = getSubjectData(subjectKey);
  const q = data.questions[questionId];
  return q ? { consecutiveCorrect: q.consecutiveCorrect || 0, mastered: !!q.mastered } : { consecutiveCorrect: 0, mastered: false };
}

function resetSubject(subjectKey) {
  const all = loadStorage();
  all[subjectKey] = { questions: {} };
  saveStorage(all);
}

// 現在の問題セットに存在しないIDの記録を削除（問題セット更新時の不整合を防ぐ）
function cleanStaleIds(subjectKey, validIds) {
  const all = loadStorage();
  if (!all[subjectKey]) return;
  const qs = all[subjectKey].questions;
  const validSet = new Set(validIds.map(String));
  let cleaned = false;
  for (const id of Object.keys(qs)) {
    if (!validSet.has(id)) {
      delete qs[id];
      cleaned = true;
    }
  }
  if (cleaned) saveStorage(all);
}

// ===== 複数ファイル統合設定 =====
// 配列形式: IDを (fileIdx+1)*10000+元ID で一意化する（kenkou_hoken等）
// オブジェクト形式 { files, noIdTransform:true }: IDをそのまま使う（kousei_nenkin等）
const MULTI_SUBJECT_FILES = {
  kenkou_hoken: ['kenkou_hoken_01', 'kenkou_hoken_02', 'kenkou_hoken_03', 'kenkou_hoken_04'],
  kousei_nenkin: { files: ['kousei_nenkin_01', 'kousei_nenkin_02', 'kousei_nenkin_03'], noIdTransform: true },
};

// ファイル名が異なる科目の単純リダイレクト（IDは変換しない）
const SUBJECT_FILE_ALIAS = {};

// ===== 問題データ読み込み =====
async function loadQuestions(subjectFile) {
  if (MULTI_SUBJECT_FILES[subjectFile]) {
    const config = MULTI_SUBJECT_FILES[subjectFile];
    const files = Array.isArray(config) ? config : config.files;
    const noIdTransform = !Array.isArray(config) && !!config.noIdTransform;
    const results = await Promise.all(
      files.map(f => fetch(`data/${f}.json`).then(r => r.json()))
    );
    const combined = [];
    results.forEach((qs, fileIdx) => {
      qs.forEach(q => {
        combined.push(noIdTransform
          ? { ...q }
          : { ...q, id: (fileIdx + 1) * 10000 + q.id });
      });
    });
    return combined;
  }
  const alias = SUBJECT_FILE_ALIAS[subjectFile] || subjectFile;
  const res = await fetch(`data/${alias}.json`);
  return res.json();
}

// ===== URLパラメータ =====
function getParams() {
  const p = new URLSearchParams(location.search);
  return {
    subject: p.get('subject') || 'kokumin_kenko_hoken',
    mode: p.get('mode') || 'all',
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
  constructor(questions, subjectKey, mode) {
    this.subjectKey = subjectKey;
    this.mode = mode;
    this.allQuestions = questions;
    // 問題セット変更時に古いIDの記録を自動削除
    cleanStaleIds(subjectKey, questions.map(q => q.id));
    this.questions = this._selectQuestions(questions, mode, subjectKey);
    this.current = 0;
    this.correctCount = 0;
    this.wrongCount = 0;
    this.answered = false;
  }

  _selectQuestions(all, mode, subjectKey) {
    if (mode === 'weak') {
      const weakIds = getWeakQuestionIds(subjectKey);
      const weak = shuffle(all.filter(q => weakIds.includes(q.id)));
      return weak.slice(0, SESSION_SIZE);
    }
    return shuffle(all).slice(0, SESSION_SIZE);
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
