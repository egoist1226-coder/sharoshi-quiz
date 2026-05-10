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
  const q = all[subjectKey].questions;
  if (!q[questionId]) q[questionId] = { attempts: 0, correct: 0, wrong: 0 };
  q[questionId].attempts++;
  if (isCorrect) q[questionId].correct++;
  else q[questionId].wrong++;
  q[questionId].lastResult = isCorrect;
  saveStorage(all);
}

function getStats(subjectKey, totalQuestions) {
  const data = getSubjectData(subjectKey);
  const q = data.questions;
  let totalAttempts = 0, totalCorrect = 0, weakCount = 0;
  for (let id = 1; id <= totalQuestions; id++) {
    if (q[id]) {
      totalAttempts += q[id].attempts;
      totalCorrect += q[id].correct;
      if (q[id].wrong > 0) weakCount++;
    }
  }
  return { totalAttempts, totalCorrect, weakCount };
}

function getWeakQuestionIds(subjectKey) {
  const data = getSubjectData(subjectKey);
  return Object.entries(data.questions)
    .filter(([, v]) => v.wrong > 0)
    .map(([id]) => parseInt(id));
}

function resetSubject(subjectKey) {
  const all = loadStorage();
  all[subjectKey] = { questions: {} };
  saveStorage(all);
}

// ===== 問題データ読み込み =====
async function loadQuestions(subjectFile) {
  const res = await fetch(`data/${subjectFile}.json`);
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
    recordAnswer(this.subjectKey, this.currentQ.id, isCorrect);
    return isCorrect;
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
  resetSubject,
  getParams,
};
