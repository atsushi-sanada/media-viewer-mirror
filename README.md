# Media Viewer - メディアビューワー

動画および画像（静止画・WebP・PSDなど）を一覧表示／ループ再生し、フォルダ指定・パス履歴・ドラッグ&ドロップコピー機能を持つデスクトップアプリです。

## 機能

### ✅ 実装済み機能
- **動画一覧表示**: 指定フォルダ直下の動画ファイルを一覧表示
- **ループ再生**: 全ての動画を自動ループ再生
- **フォルダ選択**: フォルダ選択ダイアログによる動画フォルダの指定
- **パス記憶**: 過去に表示したフォルダパスの記憶機能
- **ピン留め**: よく使うフォルダのピン留め機能
- **ドラッグ&ドロップ**: 動画ファイルを別フォルダにコピー

### 📹 サポート動画形式
- MP4 (.mp4)
- WebM (.webm)
- MOV (.mov)
- GIF (.gif)
- AVI (.avi)
- MKV (.mkv)
- WMV (.wmv)

### 🖼️ サポート画像形式
- PNG (.png)
- JPEG (.jpg, .jpeg)
- GIF (.gif)
- BMP (.bmp)
- TIFF (.tiff)
- Photoshop (.psd)
- WebP (.webp)

## インストール・起動方法

### 必要環境
- Windows 10/11
- Node.js 16.0以上

### インストール
```bash
# 依存関係のインストール
npm install
```

### 開発モードで起動
```bash
# 開発モードで起動（開発者ツール付き）
npm run dev
```

### 通常起動
```bash
# 通常起動
npm start
```

### ビルド・パッケージ作成
```bash
# 依存インストール
npm install

# EXE単一ファイルを生成（Portable形式）
npm run pack-win

# または NSIS インストーラ形式
npm run build
```

## 使用方法

### 1. フォルダ選択
1. 「フォルダを選択」ボタンをクリック
2. 動画ファイルが含まれるフォルダを選択
3. 動画が自動的にループ再生で表示されます

### 2. パス履歴の利用
1. 「履歴」ボタンをクリックして履歴パネルを表示
2. 最近使用したフォルダから選択
3. よく使うフォルダは「ピン留め」ボタンでピン留め可能

### 3. ドラッグ&ドロップでコピー
1. 動画アイテムをドラッグ開始
2. ドロップオーバーレイが表示されます
3. ドロップするとコピー先フォルダ選択ダイアログが開きます
4. コピー先を選択してファイルをコピー

### 4. プログラムから開く
1. エクスプローラーでファイル／フォルダを右クリック
2. 「プログラムから開く」→「Media Viewer」を選択
3. 選択フォルダ／ファイルを自動でロードしてプレビュー表示します
   - 同梱の `media-viewer-context.reg` を登録するとコンテキストメニューにID追加可能

## プロジェクト構造

```
media-viewer/
├── src/
│   ├── main/
│   │   └── main.js          # Electronメインプロセス
│   └── renderer/
│       ├── index.html       # メインUI
│       ├── styles.css       # スタイルシート
│       └── renderer.js      # レンダラープロセス
├── public/                  # 静的ファイル
├── package.json
├── build.bat                # ビルド／パッケージバッチ
└── README.md
```

## 技術仕様

- **フレームワーク**: Electron
- **UI**: HTML5 + CSS3 + JavaScript
- **動画再生**: HTML5 Video API
- **ファイル操作**: Node.js fs module
- **設定保存**: JSON形式でローカル保存

## 開発者向け情報

### 主要コンポーネント
- `VideoViewer`: メインアプリケーションクラス（`open-file` IPCによる起動時プレビュー対応）
- `FolderSelector`: フォルダ選択機能
- `VideoGrid`: 動画一覧表示
- `PathHistory`: パス履歴・ピン留め管理
- `DragDropHandler`: ドラッグ&ドロップ処理

### IPC通信
- `select-folder`: フォルダ選択ダイアログ
- `get-video-files`: 動画ファイル一覧取得
- `copy-file`: ファイルコピー
- `save-path-history`: 履歴保存
- `load-path-history`: 履歴読み込み

## ライセンス

MIT License

## 作成者

Manus AI

