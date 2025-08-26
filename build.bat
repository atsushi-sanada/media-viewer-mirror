@echo off
chcp 65001 >nul
echo メディアビューワー ビルド開始...
echo.
echo 実行中のアプリを強制終了（ファイルロック解除）
taskkill /IM "Media Viewer.exe" /F >nul 2>&1
timeout /t 1 /nobreak >nul
echo 署名ツール関連の環境変数をクリア
set "WIN_CSC_LINK="
set "CSC_LINK="
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

echo アンパック形式でビルド（electron-packager へ切り替え）
call npx electron-packager . "Media Viewer" --platform=win32 --arch=x64 --out "%~dp0dist" --icon "%~dp0icon.ico" --overwrite
if errorlevel 1 (
    echo エラー: unpack（electron-packager）ビルドに失敗しました。
    pause
    exit /b 1
)
rem unpack 出力フォルダ名を固定名にリネーム
if exist "%~dp0dist\Media Viewer-win32-x64" (
    rd /s /q "%~dp0dist\win-unpacked"
    rename "%~dp0dist\Media Viewer-win32-x64" "win-unpacked"
)
rem unpack ディレクトリを ZIP 圧縮
powershell -NoProfile -Command "Compress-Archive -Path '%~dp0dist\\win-unpacked\\*' -DestinationPath '%~dp0dist\\media-viewer-win.zip' -Force"
if errorlevel 1 (
    echo エラー: ZIP 圧縮に失敗しました。
    pause
    exit /b 1
)
echo done.
echo ビルド完了: dist フォルダを確認してください。

if exist "%~dp0dist\media-viewer-win" rd /s /q "%~dp0dist\media-viewer-win"
if exist "%~dp0dist\win-unpacked" rename "%~dp0dist\win-unpacked" "media-viewer-win"
echo フォルダ名を media-viewer-win に変更しました。
pause