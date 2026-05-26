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
};
