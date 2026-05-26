// ===== クロスデバイス同期モジュール =====
// Firebase Firestore を使って複数デバイス間で成績・苦手問題を共有する

const SYNC_CODE_KEY      = 'sharoshi_sync_code_v1';
const SYNC_LOCAL_TIME_KEY = 'sharoshi_sync_local_time';

// Firebase初期化（重複防止）
function _getDb() {
  if (window._shDb) return window._shDb;
  try {
    if (typeof firebase === 'undefined') return null;
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    window._shDb = firebase.firestore();
    return window._shDb;
  } catch (e) {
    console.warn('[sync] Firebase初期化失敗:', e);
    return null;
  }
}

window.SyncAPI = {

  // Firebase設定が有効かどうか（"YOUR_API_KEY"のままならfalse）
  isConfigured() {
    return typeof FIREBASE_CONFIG !== 'undefined' &&
           !!FIREBASE_CONFIG.apiKey &&
           FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';
  },

  // 同期コードが設定されているか
  isEnabled() {
    return this.isConfigured() && !!this.getSyncCode();
  },

  getSyncCode() {
    return localStorage.getItem(SYNC_CODE_KEY) || '';
  },

  setSyncCode(code) {
    if (code) {
      localStorage.setItem(SYNC_CODE_KEY, code.trim().toUpperCase());
    } else {
      localStorage.removeItem(SYNC_CODE_KEY);
    }
  },

  // 読みやすい形式で表示（ABCD1234 → ABCD 1234）
  formatCode(code) {
    return code ? code.substring(0, 4) + ' ' + code.substring(4) : '';
  },

  // ランダムな8文字の同期コードを生成（紛らわしい文字を除く）
  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  },

  // Firebaseにデータを保存（fire-and-forget）
  async push(data) {
    if (!this.isEnabled()) return;
    const db = _getDb();
    if (!db) return;
    try {
      const localTime = Date.now();
      await db.collection('users').doc(this.getSyncCode()).set({
        data: JSON.stringify(data),
        localTime,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
      });
      localStorage.setItem(SYNC_LOCAL_TIME_KEY, String(localTime));
    } catch (e) {
      console.warn('[sync] push失敗:', e);
    }
  },

  // Firebaseからデータを取得
  async pull() {
    if (!this.isEnabled()) return null;
    const db = _getDb();
    if (!db) return null;
    try {
      const snap = await db.collection('users').doc(this.getSyncCode()).get();
      if (snap.exists) {
        const d = snap.data();
        return { data: JSON.parse(d.data), remoteTime: d.localTime || 0 };
      }
    } catch (e) {
      console.warn('[sync] pull失敗:', e);
    }
    return null;
  },

  // 起動時同期: リモートが新しければローカルを更新。更新があればtrueを返す
  async syncOnStart() {
    if (!this.isEnabled()) return false;
    const result = await this.pull();
    if (!result) return false;
    const localTime = parseInt(localStorage.getItem(SYNC_LOCAL_TIME_KEY) || '0');
    if (result.remoteTime > localTime) {
      localStorage.setItem('sharoshi_quiz_v1', JSON.stringify(result.data));
      localStorage.setItem(SYNC_LOCAL_TIME_KEY, String(result.remoteTime));
      return true;
    }
    return false;
  },

  // 現在のローカルデータをFirebaseに初回登録（コード作成時）
  async pushCurrentData() {
    try {
      const data = JSON.parse(localStorage.getItem('sharoshi_quiz_v1') || '{}');
      await this.push(data);
    } catch (e) {
      console.warn('[sync] pushCurrentData失敗:', e);
    }
  },

  // ===== 改定候補キュー =====
  _localQueueKey: 'sharoshi_review_queue_v1',

  _localQueueGet() {
    try { return JSON.parse(localStorage.getItem(this._localQueueKey) || '[]'); }
    catch { return []; }
  },
  _localQueueSave(arr) {
    localStorage.setItem(this._localQueueKey, JSON.stringify(arr));
  },

  // 改定候補を追加
  async addToReviewQueue(subjectKey, questionId, questionText, note) {
    const item = {
      localId: `${Date.now()}_${questionId}`,
      subjectKey,
      questionId,
      questionText,
      note: note || '',
      addedAt: Date.now(),
      status: 'pending',
    };
    // localStorageに保存（オフライン対応）
    const local = this._localQueueGet();
    // 同じ問題の重複登録を防ぐ
    const exists = local.some(q => q.questionId === questionId && q.subjectKey === subjectKey && q.status === 'pending');
    if (!exists) {
      local.unshift(item);
      this._localQueueSave(local);
    }
    // Firebaseにも保存
    if (!this.isEnabled()) return;
    const db = _getDb();
    if (!db) return;
    try {
      const code = this.getSyncCode();
      await db.collection('review_queue').doc(code)
        .collection('items').doc(item.localId).set({
          ...item,
          addedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (e) {
      console.warn('[sync] addToReviewQueue Firebase失敗:', e);
    }
  },

  // 改定候補リストを取得（pending のみ）
  async getReviewQueue() {
    if (this.isEnabled()) {
      const db = _getDb();
      if (db) {
        try {
          const code = this.getSyncCode();
          const snap = await db.collection('review_queue').doc(code)
            .collection('items')
            .where('status', '==', 'pending')
            .get();
          if (!snap.empty) {
            return snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }))
              .sort((a, b) => (b.addedAt?.seconds || 0) - (a.addedAt?.seconds || 0));
          }
        } catch (e) {
          console.warn('[sync] getReviewQueue Firebase失敗:', e);
        }
      }
    }
    // フォールバック: localStorage
    return this._localQueueGet().filter(q => q.status === 'pending');
  },

  // 確認済みにする
  async markReviewDone(localId) {
    // localStorageを更新
    const local = this._localQueueGet();
    const updated = local.map(q => q.localId === localId ? { ...q, status: 'done' } : q);
    this._localQueueSave(updated);
    // Firebaseも更新
    if (!this.isEnabled()) return;
    const db = _getDb();
    if (!db) return;
    try {
      const code = this.getSyncCode();
      await db.collection('review_queue').doc(code)
        .collection('items').doc(localId).update({ status: 'done' });
    } catch (e) {
      console.warn('[sync] markReviewDone Firebase失敗:', e);
    }
  },

  // すでに改定候補に入っているか確認
  isInReviewQueue(subjectKey, questionId) {
    return this._localQueueGet().some(
      q => q.questionId === questionId && q.subjectKey === subjectKey && q.status === 'pending'
    );
  },
};
