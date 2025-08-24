@echo off
chcp 65001 >nul
echo メディアビューワー ビルド開始...
echo.
echo 実行中のアプリを強制終了（ファイルロック解除）
taskkill /IM "Media Viewer.exe" /F >nul 2>&1
timeout /t 1 /nobreak >nul
echo 署名ツール関連の環境変数をクリア
set WIN_CSC_LINK=
set CSC_LINK=
echo ビルド前に既存のdistフォルダを削除してロックを解除
if exist "%~dp0dist" (
    echo 古いdistフォルダを削除しています...
    rd /s /q "%~dp0dist"
)
call npm install
if errorlevel 1 (
    echo エラー: 依存関係のインストールに失敗しました。
    pause
    exit /b 1
)

echo 依存関係のインストール完了。ビルドを実行しています...
echo パッケージ作成を開始中...
call npm run pack-win
echo done.
echo ビルド完了: distフォルダを確認してください。
rem win-unpacked フォルダ名を media-viewer-win に変更
if exist "%~dp0dist\media-viewer-win" rd /s /q "%~dp0dist\media-viewer-win"
if exist "%~dp0dist\win-unpacked" rename "%~dp0dist\win-unpacked" "media-viewer-win"
echo フォルダ名を media-viewer-win に変更しました。
pause