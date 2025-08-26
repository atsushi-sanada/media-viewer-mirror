const { ipcRenderer } = require('electron');
const path = require('path');

class VideoViewer {
    constructor() {
        this.currentSort = 'mtime';
        this.currentOrder = 'desc';
        // プレビュー幅の初期値
        this.currentPreviewWidth = 400;
        // フィルターの初期値
        this.currentFilter = 'all';
        // サムネイルサイズの初期値
        this.currentThumbSize = 'standard';
        this.currentPath = null;
        this.pathHistory = { recent: [], pinned: [] };
        this.videoFiles = [];
        
        this.initializeElements();
        this.bindEvents();
        // ソート選択イベント
        this.sortSelect = document.getElementById('sort-select');
        this.sortSelect.value = this.currentSort;
        this.sortSelect.addEventListener('change', () => {
            this.currentSort = this.sortSelect.value;
            if (this.videoFiles.length) this.applySortAndRender();
        });
        this.orderSelect = document.getElementById('order-select');
        this.orderSelect.value = this.currentOrder;
        this.orderSelect.addEventListener('change', () => {
            this.currentOrder = this.orderSelect.value;
            if (this.videoFiles.length) this.applySortAndRender();
        });
        this.filterSelect = document.getElementById('filter-select');
        this.filterSelect.value = 'all';
        this.filterSelect.addEventListener('change', () => {
            this.currentFilter = this.filterSelect.value;
            // 保存して再描画
            this.pathHistory.folderFilters[this.currentPath] = this.currentFilter;
            this.savePathHistory();
            this.applySortAndRender();
        });
        // サムネイルサイズ選択
        this.thumbSizeSelect = document.getElementById('thumb-size-select');
        this.thumbSizeSelect.value = this.currentThumbSize;
        this.thumbSizeSelect.addEventListener('change', () => {
            this.currentThumbSize = this.thumbSizeSelect.value;
            this.savePathHistory();
            this.updateGridColumns();
            this.applySortAndRender();
        });
        // メニューからのフォルダ開く要求をハンドル
        ipcRenderer.on('menu-select-folder', (_, folderPath) => {
            if (folderPath) this.loadFolder(folderPath);
        });
        // プレビュー領域要素取得とリサイズ保存イベント
        this.previewPanel = document.getElementById('preview-panel');
        this.previewPanel.style.width = `${this.currentPreviewWidth}px`;
        this.previewPanel.addEventListener('mouseup', () => {
            this.currentPreviewWidth = this.previewPanel.getBoundingClientRect().width;
            this.savePathHistory();
        });
        this.loadPathHistory();
        // プログラムから開くで渡されたファイルをプレビュー
        ipcRenderer.on('open-file', async (_, filePath) => {
            const pathModule = require('path');
            const ext = pathModule.extname(filePath).toLowerCase();
            const videoExts = ['.mp4','.webm','.mov','.avi','.mkv','.wmv','.mp3'];
            const imageExts = ['.png','.jpg','.jpeg','.gif','.bmp','.tiff','.webp'];
            // PSD はサポート外
            if (ext === '.psd') {
                alert('PSDプレビューはサポートされていません');
                return;
            }
            // 直接ファイル起動：フォルダパスを保持して後で復元
            this._openFileFolder = pathModule.dirname(filePath);
            // 動画または画像を単一ビューで直接表示
            let mediaType;
            if (videoExts.includes(ext)) mediaType = 'video';
            else if (imageExts.includes(ext)) mediaType = 'image';
            else {
                alert('非対応ファイル形式です: ' + ext);
                return;
            }
            // メディアオブジェクト生成
            const media = { path: filePath, name: pathModule.basename(filePath), type: mediaType };
            // メディア要素動的生成
            let elem;
            if (mediaType === 'video') {
                elem = document.createElement('video');
                elem.src = `file://${filePath}`;
                elem.controls = true;
                elem.autoplay = true;
                elem.loop = true;
                elem.muted = true;
            } else {
                elem = document.createElement('img');
                elem.src = `file://${filePath}`;
            }
            // 直接単一ビュー起動
            this.enterSingleView(media, elem);
        });
        this.videoGrid = document.getElementById('video-grid');
        // WebP画像の遅延ロード＆アンロード用IntersectionObserver
        this.webpObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const item = entry.target;
                if (entry.isIntersecting) {
                    // <img>要素を動的生成
                    const img = document.createElement('img');
                    img.src = item.dataset.src;
                    img.alt = item.dataset.name || '';
                    img.className = 'webp-img';
                    img.addEventListener('load', () => {
                        item.classList.remove('lazy-webp');
                    });
                    item.appendChild(img);
                    // 一度ロードしたら監視解除
                    this.webpObserver.unobserve(item);
                }
            });
        }, { root: this.videoGrid, rootMargin: '0px', threshold: 0 });
        // 非WebPメディアの先読み・破棄用IntersectionObserver
        this.mediaObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const item = entry.target;
                const idx = parseInt(item.dataset.mediaIndex);
                const media = this.videoFiles[idx];
                const vid = entry.target.querySelector('video');
                if (media.type === 'video' && vid) {
                    if (entry.isIntersecting) {
                        // 画面内に入ったら再生
                        vid.play().catch(() => {});
                    } else {
                        // 画面外に出たら一時停止
                        vid.pause();
                    }
                }
            });
        }, { root: this.videoGrid, rootMargin: '200px', threshold: 0.1 });
        this.header = document.querySelector('.header');
        this.bodyWrapper = document.querySelector('.body-wrapper');
        this.isSingleView = false;
        this.lastIndex = null;
        // グローバルEnterキーでリストビューからシングルビューに切り替え
        document.addEventListener('keydown', (e) => {
            if (!this.isSingleView && e.key === 'Enter' && this.lastIndex !== null) {
                e.preventDefault();
                this.toggleSingleView(this.lastIndex);
            }
        });
        // アプリ起動時のリストビュー用デフォルトWindowサイズを取得
        ipcRenderer.invoke('get-content-size').then(([w, h]) => {
            this._defaultContentSize = { width: w, height: h };
        });
    }

    initializeElements() {
        this.selectFolderBtn = document.getElementById('select-folder-btn');
        this.toggleHistoryBtn = document.getElementById('toggle-history-btn');
        this.historyPanel = document.getElementById('history-panel');
        this.currentPathElement = document.getElementById('current-path');
        this.pinCurrentBtn = document.getElementById('pin-current-btn');
        this.videoGrid = document.getElementById('video-grid');
        this.dropOverlay = document.getElementById('drop-overlay'); // may be null if overlay removed
        this.loading = document.getElementById('loading');
        this.pinnedFolders = document.getElementById('pinned-folders');
        this.recentFolders = document.getElementById('recent-folders');
    }

    bindEvents() {
        this.selectFolderBtn.addEventListener('click', () => this.selectFolder());
        this.toggleHistoryBtn.addEventListener('click', () => this.toggleHistory());
        this.pinCurrentBtn.addEventListener('click', () => this.pinCurrentFolder());
        // ドラッグオーバー/ドロップは document レベルで処理
        document.addEventListener('dragover', (e) => this.handleDragOver(e));
        document.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        document.addEventListener('drop', (e) => this.handleDrop(e));
        // dropOverlay クリックで非表示、存在する場合のみバインド
        if (this.dropOverlay) {
            this.dropOverlay.addEventListener('click', () => this.dropOverlay.classList.add('hidden'));
            this.dropOverlay.addEventListener('drop', (e) => this.handleDrop(e));
        }
    }

    async loadPathHistory() {
        try {
            this.pathHistory = await ipcRenderer.invoke('load-path-history');
            // デフォルト値の初期化
            const ph = this.pathHistory || {};
            ph.recent = Array.isArray(ph.recent) ? ph.recent : [];
            ph.pinned = Array.isArray(ph.pinned) ? ph.pinned : [];
            ph.folderFilters = ph.folderFilters || {};
            this.pathHistory = ph;
            // 保存されたソート設定を反映
            if (this.pathHistory.sort) this.currentSort = this.pathHistory.sort;
            if (this.pathHistory.order) this.currentOrder = this.pathHistory.order;
            // ドロップダウンに適用
            this.sortSelect.value = this.currentSort;
            this.orderSelect.value = this.currentOrder;
            // サムネイルサイズ復元
            if (this.pathHistory.thumbSize) this.currentThumbSize = this.pathHistory.thumbSize;
            this.thumbSizeSelect.value = this.currentThumbSize;
            this.updateGridColumns();
            // フォルダ固有フィルター初期化
            if (!this.pathHistory.folderFilters) this.pathHistory.folderFilters = {};
            // プレビュー幅の復元
            if (this.pathHistory.previewWidth) this.currentPreviewWidth = this.pathHistory.previewWidth;
            this.previewPanel.style.width = `${this.currentPreviewWidth}px`;
            this.updateHistoryDisplay();
        } catch (error) {
            console.error('履歴読み込みエラー:', error);
        }
    }

    async savePathHistory() {
        try {
            // 現在のソート・プレビュー設定を保存先データに含める
            this.pathHistory.sort = this.currentSort;
            this.pathHistory.order = this.currentOrder;
            this.pathHistory.previewWidth = this.currentPreviewWidth;
            // サムネイルサイズ保存
            this.pathHistory.thumbSize = this.currentThumbSize;
            // フォルダ固有フィルターを保存
            if (!this.pathHistory.folderFilters) this.pathHistory.folderFilters = {};
            if (this.currentPath) this.pathHistory.folderFilters[this.currentPath] = this.currentFilter;
            await ipcRenderer.invoke('save-path-history', this.pathHistory);
        } catch (error) {
            console.error('履歴保存エラー:', error);
        }
    }

    async selectFolder() {
        try {
            const folderPath = await ipcRenderer.invoke('select-folder');
            if (folderPath) {
                await this.loadFolder(folderPath);
            }
        } catch (error) {
            console.error('フォルダ選択エラー:', error);
            this.showError('フォルダの選択に失敗しました。');
        }
    }

    async loadFolder(folderPath) {
        this.showLoading(true);
        
        try {
            // メディアファイルを取得
            this.videoFiles = await ipcRenderer.invoke('get-media-files', folderPath);
            // パスを更新
            this.currentPath = folderPath;
            this.updateCurrentPath();
            // 動的にフィルタードロップダウンを再構築
            const exts = Array.from(new Set(this.videoFiles.map(m => require('path').extname(m.name).toLowerCase()))).sort();
            this.filterSelect.innerHTML = '<option value="all">すべて</option>';
            exts.forEach(ext => {
                const opt = document.createElement('option');
                opt.value = ext;
                opt.textContent = ext;
                this.filterSelect.appendChild(opt);
            });
            // フォルダ固有フィルターを復元、存在しなければ'all'
            const saved = this.pathHistory.folderFilters && this.pathHistory.folderFilters[folderPath];
            this.currentFilter = (saved && exts.includes(saved)) ? saved : 'all';
            this.filterSelect.value = this.currentFilter;
            // 選択されたソート順で並び替え
            this.applySortAndRender();
            
            // 履歴を更新
            this.addToRecentHistory(folderPath);
            
            // グリッドは applySortAndRender ですでに更新済み
            
        } catch (error) {
            console.error('フォルダ読み込みエラー:', error);
            this.showError('フォルダの読み込みに失敗しました。');
        } finally {
            this.showLoading(false);
        }
    }

    updateCurrentPath() {
        if (this.currentPath) {
            const pathSpan = this.currentPathElement.querySelector('span');
            pathSpan.textContent = this.currentPath;
            this.pinCurrentBtn.classList.remove('hidden');
        }
    }

    addToRecentHistory(path) {
        // 既存の履歴から削除
        this.pathHistory.recent = this.pathHistory.recent.filter(p => p !== path);
        
        // 先頭に追加
        this.pathHistory.recent.unshift(path);
        
        // 最大10件まで保持
        if (this.pathHistory.recent.length > 10) {
            this.pathHistory.recent = this.pathHistory.recent.slice(0, 10);
        }
        
        this.savePathHistory();
        this.updateHistoryDisplay();
    }

    updateHistoryDisplay() {
        // ピン留めフォルダ表示
        this.pinnedFolders.innerHTML = '';
        this.pathHistory.pinned.forEach(path => {
            const item = this.createFolderItem(path, true);
            this.pinnedFolders.appendChild(item);
        });

        // 最近使用したフォルダ表示
        this.recentFolders.innerHTML = '';
        this.pathHistory.recent.forEach(path => {
            if (!this.pathHistory.pinned.includes(path)) {
                const item = this.createFolderItem(path, false);
                this.recentFolders.appendChild(item);
            }
        });
    }

    createFolderItem(path, isPinned) {
        const item = document.createElement('div');
        item.className = `folder-item ${isPinned ? 'pinned' : ''}`;
        
        const pathName = path.split(/[\\/]/).pop() || path;
        item.innerHTML = `
            <span title="${path}">${pathName}</span>
            ${isPinned ? '<button class="unpin-btn" title="ピン留めを解除">×</button>' : ''}
        `;
        
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('unpin-btn')) {
                this.unpinFolder(path);
            } else {
                this.loadFolder(path);
            }
        });
        
        return item;
    }

    updateVideoGrid() {
        this.videoGrid.innerHTML = '';
        
        if (this.videoFiles.length === 0) {
            this.videoGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🎬</div>
                    <p>このフォルダには動画ファイルがありません</p>
                </div>
            `;
            return;
        }

        this.videoFiles.forEach((media, index) => {
            const mediaItem = this.createMediaItem(media, index);
            this.videoGrid.appendChild(mediaItem);
        });
    }

    /**
     * メディア（動画/画像）アイテムの要素を作成
     */
    createMediaItem(media, index) {
        const item = document.createElement('div');
        item.className = 'video-item';
        item.draggable = true;
        // 単一ビューの切替用にフォーカス可能にする
        item.tabIndex = 0;
        // 最後に選択したインデックスを記録
        item.addEventListener('focus', () => { this.lastIndex = index; });
        item.dataset.mediaIndex = index;
        item.dataset.mediaPath = media.path;

        let mediaElement;
        const ext = path.extname(media.name).toLowerCase();
        if (media.type === 'video') {
            mediaElement = document.createElement('video');
            mediaElement.src = `file://${media.path}`;
            mediaElement.loop = true;
            mediaElement.muted = true;
            mediaElement.autoplay = true;
            mediaElement.controls = false;
            mediaElement.addEventListener('loadeddata', () => {
                mediaElement.play().catch(err => {
                    console.warn('自動再生エラー:', err);
                });
            });
        } else {
            if (ext === '.psd') {
                // PSDプレビューは重い/不安定なため汎用アイコンを表示
                mediaElement = document.createElement('img');
                mediaElement.alt = media.name;
                mediaElement.src = 'public/icon.png';
            } else if (ext === '.webp') {
                // WebPは背景プレースホルダー＋IntersectionObserverで遅延ロード
                // コンテナ(item)にdata属性とクラスを設定
                item.dataset.src = `file://${media.path}`;
                item.dataset.name = media.name;
                item.classList.add('lazy-webp');
                // 観測開始
                this.webpObserver.observe(item);
                // ここではmediaElementを生成せずplaceholderのみ
                mediaElement = null;
            } else {
                mediaElement = document.createElement('img');
                mediaElement.src = `file://${media.path}`;
                mediaElement.alt = media.name;
            }
        }
        // サムネイル表示サイズ適用
        const sizeMap = { small: 128, standard: 256, large: 512 };
        const dim = sizeMap[this.currentThumbSize] || 256;
        // サムネイル要素が存在する場合のみサイズを適用
        if (mediaElement) {
            mediaElement.style.width = `${dim}px`;
            mediaElement.style.height = `${dim}px`;
        }
        // コンテナ(item)のベースサイズを固定
        item.style.width = `${dim}px`;
        item.style.height = `${dim}px`;
        // WebP以外の場合のみメディア要素を追加
        // WebPは既存webpObserverで遅延ロード; 他はmediaObserverで遅延ロード
        if (mediaElement) {
            // すべてのメディア要素を常に追加し表示する
            item.appendChild(mediaElement);
            mediaElement.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); this.toggleSingleView(index); });
            mediaElement.tabIndex = 0;
            mediaElement.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.toggleSingleView(index); } });
        }
        // アイテムでのダブルクリックとEnterキーで単一ビュー切替
        item.addEventListener('dblclick', () => this.toggleSingleView(index));
        item.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.toggleSingleView(index); } });
        // 先読み・破棄Observerに登録
        this.mediaObserver.observe(item);
        // ドラッグイベント
        item.addEventListener('dragstart', (e) => {
            this.handleVideoItemDragStart(e, media);
        });
        item.addEventListener('dragend', (e) => this.handleVideoItemDragEnd(e));
        // クリックでプレビュー表示
        item.addEventListener('click', () => this.showPreview(media));
        return item;
    }
    /**
     * 選択された sort/order に従って動画・画像リストをソートし、表示を更新
     */
    applySortAndRender() {
        // フィルター適用
        let list = this.videoFiles;
        if (this.currentFilter && this.currentFilter !== 'all') {
            list = list.filter(m => require('path').extname(m.name).toLowerCase() === this.currentFilter);
        }
        // グリッド列幅を更新
        this.updateGridColumns();
        switch (this.currentSort) {
            case 'name':
                list.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'mtime':
                list.sort((a, b) => a.mtimeMs - b.mtimeMs);
                break;
            case 'type':
                list.sort((a, b) => {
                    const extA = path.extname(a.name).toLowerCase();
                    const extB = path.extname(b.name).toLowerCase();
                    return extA.localeCompare(extB);
                });
                break;
        }
        if (this.currentOrder === 'desc') {
            list.reverse();
        }
        // グリッド表示
        this.videoGrid.innerHTML = '';
        this.videoGrid.style.display = 'grid';
        list.forEach((media, index) => {
            const mediaItem = this.createMediaItem(media, index);
            this.videoGrid.appendChild(mediaItem);
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    toggleHistory() {
        this.historyPanel.classList.toggle('hidden');
    }

    pinCurrentFolder() {
        if (this.currentPath && !this.pathHistory.pinned.includes(this.currentPath)) {
            this.pathHistory.pinned.push(this.currentPath);
            this.savePathHistory();
            this.updateHistoryDisplay();
        }
    }

    unpinFolder(path) {
        this.pathHistory.pinned = this.pathHistory.pinned.filter(p => p !== path);
        this.savePathHistory();
        this.updateHistoryDisplay();
    }

    /**
     * ネイティブドラッグ開始をメインプロセスに通知
     */
    handleVideoItemDragStart(e, video) {
        // メインプロセスで startDrag を実行
        ipcRenderer.send('ondragstart', video.path);
        e.preventDefault();
        e.target.classList.add('dragging');
    }

    handleVideoItemDragEnd(e) {
        e.target.classList.remove('dragging');
        // ドロップ完了時オーバーレイ非表示 (存在する場合のみ)
        if (this.dropOverlay) this.dropOverlay.classList.add('hidden');
    }

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (this.dropOverlay) this.dropOverlay.classList.remove('hidden');
    }

    handleDragLeave(e) {
        // ウィンドウ外に出た場合のみオーバーレイを隠す
        if (e.clientX <= 0 || e.clientY <= 0 || 
            e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
            if (this.dropOverlay) this.dropOverlay.classList.add('hidden');
        }
    }

    async handleDrop(e) {
        e.preventDefault();
        if (this.dropOverlay) this.dropOverlay.classList.add('hidden');
        
        const sourcePath = e.dataTransfer.getData('text/plain');
        if (!sourcePath) return;
        
        try {
            // コピー先フォルダを選択
            const destinationFolder = await ipcRenderer.invoke('select-folder');
            if (!destinationFolder) return;
            
            const fileName = sourcePath.split(/[\\/]/).pop();
            const destinationPath = require('path').join(destinationFolder, fileName);
            
            this.showLoading(true);
            
            // ファイルをコピー
            const result = await ipcRenderer.invoke('copy-file', sourcePath, destinationPath);
            
            if (result.success) {
                this.showSuccess(`ファイルをコピーしました: ${fileName}`);
            } else {
                this.showError(`コピーに失敗しました: ${result.error}`);
            }
            
        } catch (error) {
            console.error('ドロップ処理エラー:', error);
            this.showError('ファイルのコピーに失敗しました。');
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        if (show) {
            this.loading.classList.remove('hidden');
        } else {
            this.loading.classList.add('hidden');
        }
    }

    showError(message) {
        // 簡易的なエラー表示（実際のプロダクトではより洗練されたUIを使用）
        alert(`エラー: ${message}`);
    }

    showSuccess(message) {
        // 簡易的な成功表示（実際のプロダクトではより洗練されたUIを使用）
        alert(`成功: ${message}`);
    }

    /**
     * サムネイルサイズに応じてグリッドのカラム幅を更新
     */
    updateGridColumns() {
        const sizeMap = { small: 128, standard: 256, large: 512 };
        const dim = sizeMap[this.currentThumbSize] || sizeMap.standard;
        // カラム幅を固定ピクセルに設定
        this.videoGrid.style.gridTemplateColumns = `repeat(auto-fill, ${dim}px)`;
    }

    /**
     * 単一ビューのトグル切替
     */
    toggleSingleView(index) {
        const media = this.videoFiles[index];
        console.log('toggleSingleView called for', media.path, 'index', index);
        // 常に最新の要素を取得
        const item = this.videoGrid.querySelector(`.video-item[data-media-index="${index}"]`);
        const el = item ? item.querySelector('video, img') : null;
        if (!el) {
            console.warn('toggleSingleView: media element not found for', media.path);
            return;
        }
        if (!this.isSingleView) {
            this.enterSingleView(media, el);
        } else {
            this.exitSingleView();
        }
    }
    /**
     * プレビュー領域にメディアを表示
     */
    showPreview(media) {
        if (!this.previewPanel) return;
        const preview = this.previewPanel;
        preview.innerHTML = '';
        // メタデータ表示
        const meta = document.createElement('div');
        meta.className = 'preview-meta';
        meta.innerHTML = `
            <p><strong>ファイル名:</strong> ${media.name}</p>
            <p><strong>サイズ:</strong> ${this.formatFileSize(media.size)}</p>
            <p><strong>更新日時:</strong> ${new Date(media.mtimeMs).toLocaleString()}</p>
            <p><strong>タイプ:</strong> ${media.type}</p>
        `;
        // メディア要素生成
        let elem;
        const ext = path.extname(media.name).toLowerCase();
        if (media.type === 'video') {
            elem = document.createElement('video');
            elem.src = `file://${media.path}`;
            elem.controls = true;
            elem.autoplay = true;
            elem.loop = true;
            elem.muted = false;
        } else {
            elem = document.createElement('img');
            elem.src = `file://${media.path}`;
            elem.alt = media.name;
        }
        elem.style.maxWidth = '100%';
        elem.style.maxHeight = '100%';
        preview.appendChild(elem);
        preview.appendChild(meta);
    }
    enterSingleView(media, mediaElement) {
        this.isSingleView = true;
        // 一覧表示を隠す(styleで非表示)
        this.header.style.display = 'none';
        this.bodyWrapper.style.display = 'none';
        // 単一ビューコンテナを生成
        this.singleViewContainer = document.createElement('div');
        this.singleViewContainer.className = 'single-view-container';
        // メディア要素をクローンして全画面表示
        const clone = mediaElement.cloneNode(true);
        // ネイティブダブルクリック全画面化抑制
        if (clone.tagName === 'VIDEO') {
            clone.controlsList = 'nofullscreen';
            clone.requestFullscreen = () => {};
            if (clone.webkitRequestFullscreen) clone.webkitRequestFullscreen = () => {};
        }
        // コンテンツ解像度に合わせるためスタイルは後で設定
        if (clone.tagName === 'VIDEO') {
            clone.controls = true;
            clone.autoplay = true;
            clone.loop = true;
            setTimeout(() => clone.play().catch(() => {}), 0);
            clone.addEventListener('loadedmetadata', () => {
                const w = clone.videoWidth;
                const h = clone.videoHeight;
                // リストビュー時のコンテンツサイズを取得して保持
                ipcRenderer.invoke('get-content-size').then(([cw, ch]) => {
                    this._savedContentSize = { width: cw, height: ch };
                    // メディア解像度に合わせてウィンドウリサイズ
                    ipcRenderer.invoke('resize-window', w, h);
                });
            });
        } else {
            clone.addEventListener('load', () => {
                const w = clone.naturalWidth;
                const h = clone.naturalHeight;
                // リストビュー時のコンテンツサイズを取得して保持
                ipcRenderer.invoke('get-content-size').then(([cw, ch]) => {
                    this._savedContentSize = { width: cw, height: ch };
                    ipcRenderer.invoke('resize-window', w, h);
                });
            });
        }
        this.singleViewContainer.appendChild(clone);
        document.body.appendChild(this.singleViewContainer);
        // ウィンドウリサイズ時にコンテンツをcontainerサイズに合わせる
        this._resizeHandler = () => {
            if (this.singleViewContainer) {
                const mediaEl = this.singleViewContainer.querySelector('video, img');
                if (mediaEl) {
                    const { width, height } = this.singleViewContainer.getBoundingClientRect();
                    mediaEl.style.width = `${width}px`;
                    mediaEl.style.height = `${height}px`;
                }
            }
        };
        window.addEventListener('resize', this._resizeHandler);
        // コンテナでのダブルクリックでリストビューに戻る
        this.singleViewContainer.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.exitSingleView();
        });
        // Enterキーで一覧ビューに戻る
        this._singleViewKeyHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.exitSingleView();
            }
        };
        document.addEventListener('keydown', this._singleViewKeyHandler);
    }
    exitSingleView() {
        this.isSingleView = false;
        // 直接ファイル起動時は解除後に一覧ビュー表示
        if (this._openFileFolder) {
            this.loadFolder(this._openFileFolder);
            this._openFileFolder = null;
        }
        // リストビュー時のWindowサイズを復帰
        if (this._openedDirectView) {
            // 直接起動時はデフォルトサイズに戻す
            if (this._defaultContentSize) {
                ipcRenderer.invoke('resize-window', this._defaultContentSize.width, this._defaultContentSize.height);
            }
            this._openedDirectView = false;
        } else if (this._savedContentSize) {
            // 通常の切替時は保存サイズに戻す
            ipcRenderer.invoke('resize-window', this._savedContentSize.width, this._savedContentSize.height);
            this._savedContentSize = null;
        }
        // Enterキーハンドラを解除
        if (this._singleViewKeyHandler) {
            document.removeEventListener('keydown', this._singleViewKeyHandler);
            this._singleViewKeyHandler = null;
        }
        // 一覧表示を戻す(styleで再表示)
        this.header.style.display = '';
        this.bodyWrapper.style.display = '';
        // リサイズハンドラ解除
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        // 単一ビューコンテナを削除
        if (this.singleViewContainer) {
            document.body.removeChild(this.singleViewContainer);
            this.singleViewContainer = null;
        }
    }
}

// アプリケーション初期化
document.addEventListener('DOMContentLoaded', () => {
    new VideoViewer();
});