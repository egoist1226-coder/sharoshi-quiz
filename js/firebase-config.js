// ★★★ Firebase設定ファイル ★★★
//
// 以下の手順でFirebaseプロジェクトを作成し、設定情報を貼り付けてください:
//
// 【手順】
// 1. https://console.firebase.google.com/ を開く
// 2. 「プロジェクトを作成」→ プロジェクト名を入力（例: sharoshi-quiz）→ 続行
//    ※ Googleアナリティクスは「無効」でOK
// 3. プロジェクトが作成されたら「ウェブ」アイコン（</>）をクリック
// 4. アプリのニックネームを入力（例: quiz）→「アプリを登録」
// 5. 表示された firebaseConfig の内容を下の「YOUR_～」部分に上書き貼り付け
// 6. 「Firestore Database」→「データベースの作成」→「テストモードで開始」
//    → リージョン「asia-northeast1（東京）」→「有効にする」
// 7. このファイルを保存し、git add / commit / push でデプロイ完了！

const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
