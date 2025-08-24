const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
// 設定ファイルパス
const configPath = path.join(app.getPath('userData'), 'config.json');
// 設定読み込み（ウィンドウサイズ復元用） - 同期
let savedConfig = {};
try {
  if (fsSync.existsSync(configPath)) {
    const data = fsSync.readFileSync(configPath, 'utf8');
    savedConfig = JSON.parse(data);
  }
} catch (err) {
  console.error('設定読み込みエラー:', err);
  savedConfig = {};
}
// GPUプロセスの不具合対策: ハードウェアアクセレーションを無効化
app.disableHardwareAcceleration();

// 起動時のファイルパス引数を検出
const { existsSync, statSync } = fsSync;
const fileArg = process.argv.slice(1).find(arg => {
  try {
    return existsSync(arg) && statSync(arg).isFile();
  } catch {
    return false;
  }
});

let mainWindow;

function createWindow() {
  // 保存されたウィンドウサイズを適用
  const { width = 1200, height = 800 } = (savedConfig && savedConfig.windowBounds) || {};
  mainWindow = new BrowserWindow({
    width,
    height,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../../public/icon.png')
  });

  // 開発環境では開発者ツールを開く
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.loadFile('src/renderer/index.html');
  // メニューバー不要のため空のメニューを設定
  Menu.setApplicationMenu(null);
  // レンダラー読み込み後、ファイル引数があれば通知
  mainWindow.webContents.on('did-finish-load', () => {
    if (fileArg) {
      mainWindow.webContents.send('open-file', fileArg);
    }
  });
  // 開発者モードをショートカットで開けるように設定
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Ctrl+Shift+I または F12
    if ((input.control && input.shift && input.key.toUpperCase() === 'I') || input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  // ウィンドウサイズ変更時に保存
  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize();
    savedConfig.windowBounds = { width: w, height: h };
    fs.writeFile(configPath, JSON.stringify(savedConfig, null, 2)).catch(console.error);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// フォルダ選択ダイアログ
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'フォルダを選択してください'
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// フォルダ内の動画ファイルを取得
ipcMain.handle('get-media-files', async (event, folderPath) => {
  try {
    const files = await fs.readdir(folderPath);
    // 動画および画像形式（Photoshop PSD含む）
    const mediaExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.wmv', '.mp3', // 追加音声
                             '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.psd'];
    const mediaFiles = files.filter(file => mediaExtensions.includes(path.extname(file).toLowerCase()))
      .map(file => {
        const ext = path.extname(file).toLowerCase();
        const type = ['.mp4','.webm','.mov','.avi','.mkv','.wmv'].includes(ext)
                   ? 'video' : 'image';
        return {
          name: file,
          path: path.join(folderPath, file),
          size: 0,
          mtimeMs: 0,
          type
        };
      });

    // ファイルサイズと更新日時を取得
    for (let media of mediaFiles) {
      try {
        const stats = await fs.stat(media.path);
        media.size = stats.size;
        media.mtimeMs = stats.mtimeMs;
      } catch (err) {
        console.error('ファイルサイズ取得エラー:', err);
      }
    }

    return mediaFiles;
  } catch (error) {
    console.error('フォルダ読み込みエラー:', error);
    return [];
  }
});

// ファイルコピー
ipcMain.handle('copy-file', async (event, sourcePath, destinationPath) => {
  try {
    await fs.copyFile(sourcePath, destinationPath);
    return { success: true };
  } catch (error) {
    console.error('ファイルコピーエラー:', error);
    return { success: false, error: error.message };
  }
});

// パス履歴の保存・読み込み
ipcMain.handle('save-path-history', async (event, history) => {
  try {
    await fs.writeFile(configPath, JSON.stringify(history, null, 2));
    return { success: true };
  } catch (error) {
    console.error('履歴保存エラー:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-path-history', async () => {
  try {
    const data = await fs.readFile(configPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // ファイルが存在しない場合は空の履歴を返す
    return { recent: [], pinned: [] };
  }
});

