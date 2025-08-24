@echo off
chcp 65001 >nul
echo 動画リストビュワーを起動しています...
echo.

node --version >nul 2>&1
if errorlevel 1 (
    echo エラー: Node.jsがインストールされていません。
    echo https://nodejs.org/ja からNode.jsをインストールしてください。
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo 初回起動のため、依存関係をインストールしています...
    echo これには数分かかる場合があります。
    echo.
    npm install
    if errorlevel 1 (
        echo エラー: 依存関係のインストールに失敗しました。
        echo インターネット接続を確認してください。
        echo.
        pause
        exit /b 1
    )
)

echo アプリケーションを起動中...
npm start

if errorlevel 1 (
    echo.
    echo エラーが発生しました。
    echo 詳細なインストールガイドを参照してください。
    echo.
    pause
)

