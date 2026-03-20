# Vinyl 🎵

SpotifyライブラリをiPod/iTunes風にブラウズできるウェブアプリ。

---

## セットアップ手順

### 1. Spotify Developer アプリを作成

1. https://developer.spotify.com/dashboard にアクセス
2. **Create app** をクリック
3. 以下を入力：
   - App name: `Vinyl`
   - App description: (なんでもOK)
   - Redirect URI: `http://localhost:5173/` （開発用）
   - APIs used: **Web API** と **Web Playback SDK** にチェック
4. **Save** → アプリの **Client ID** をコピーしておく

### 2. .env ファイルを作成

プロジェクトルートに `.env` ファイルを作成：

```
VITE_SPOTIFY_CLIENT_ID=ここにClient_IDをペースト
```

### 3. ローカルで起動

```bash
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開く

---

## Vercel にデプロイ（友達と共有する場合）

### 1. GitHubにpush

```bash
git init
git add .
git commit -m "initial"
# GitHubでリポジトリを作成してpush
git remote add origin https://github.com/YOUR_NAME/vinyl.git
git push -u origin main
```

### 2. Vercelと連携

1. https://vercel.com にアクセス（GitHubでログイン）
2. **New Project** → GitHubのリポジトリを選択
3. **Environment Variables** に追加：
   - Name: `VITE_SPOTIFY_CLIENT_ID`
   - Value: SpotifyのClient ID
4. **Deploy** をクリック

デプロイ後、URLが発行される（例: `https://vinyl-xxx.vercel.app`）

### 3. Spotify Dashboard にURLを追加

1. https://developer.spotify.com/dashboard → アプリを開く
2. **Edit Settings** → **Redirect URIs** に追加：
   ```
   https://vinyl-xxx.vercel.app/
   ```
   （末尾の`/`を忘れずに！）
3. **Save**

### 4. 友達をアローリストに追加

Spotify Dashboard → アプリを開く → **Users and Access**
→ 友達の **Spotify登録メールアドレス** を追加（最大5人まで、自分含む）

---

## 注意事項

- 再生機能は **Spotify Premium** が必要
- 友達も Spotify Premium ユーザーである必要あり
- 開発モードでは自分含め **5人まで** 利用可能
- 友達がブラウザで再生する場合、**Spotifyアプリも起動している**必要あり
  （Web Playback SDKの仕様）

---

## ディレクトリ構成

```
vinyl/
├── index.html
├── vite.config.js
├── package.json
├── .env              ← Client IDを設定（gitignoreされる）
├── .env.example
└── src/
    ├── main.jsx      ← エントリーポイント
    ├── App.jsx       ← OAuth認証フロー
    ├── Vinyl.jsx     ← メインUI
    └── spotify.js    ← Spotify API / PKCE認証ヘルパー
```
