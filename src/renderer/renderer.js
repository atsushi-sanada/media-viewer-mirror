class MahjongGame {
    constructor() {
        this.playerIndex = 0;
        this.players = [
            { name: 'あなた', wind: '東' },
            { name: '夕凪AI', wind: '南' },
            { name: '黎明AI', wind: '西' },
            { name: '宵星AI', wind: '北' }
        ];
        this.numberKanji = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
        this.fullWidthNumbers = ['０', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
        this.honorNames = {
            1: '東',
            2: '南',
            3: '西',
            4: '北',
            5: '白',
            6: '發',
            7: '中'
        };
        this.resetPersistentState();
        this.cacheElements();
        this.bindEvents();
        this.updateAllUI();
    }

    resetPersistentState() {
        this.wall = [];
        this.hands = [[], [], [], []];
        this.discards = [[], [], [], []];
        this.scores = [25000, 25000, 25000, 25000];
        this.roundWind = '東';
        this.roundCount = 1;
        this.honba = 0;
        this.currentTurn = 0;
        this.state = 'idle';
        this.highlightTileId = null;
        this.winnerIndex = null;
        this.logEntries = [];
    }

    cacheElements() {
        this.startBtn = document.getElementById('start-btn');
        this.autoSortBtn = document.getElementById('auto-sort-btn');
        this.tsumoBtn = document.getElementById('tsumo-btn');
        this.wallCountEl = document.getElementById('wall-count');
        this.roundInfoEl = document.getElementById('round-info');
        this.statusMessageEl = document.getElementById('status-message');
        this.scoreCards = Array.from(document.querySelectorAll('.score-card'));
        this.scoreEls = this.scoreCards.map(card => card.querySelector('.points'));
        this.seatStates = this.players.map((_, idx) => document.getElementById(`state-${idx}`));
        this.handContainers = this.players.map((_, idx) => document.getElementById(`hand-${idx}`));
        this.discardContainers = this.players.map((_, idx) => document.getElementById(`discard-${idx}`));
        this.logList = document.getElementById('log-list');
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => this.startGame());
        this.autoSortBtn.addEventListener('click', () => this.sortAndRenderPlayerHand());
        this.tsumoBtn.addEventListener('click', () => {
            if (this.state === 'awaiting-discard' && this.canWin(this.hands[this.playerIndex])) {
                this.declareWin(this.playerIndex, 'tsumo');
            }
        });
    }

    startGame() {
        this.resetRoundState();
        this.buildWall();
        this.dealHands();
        this.updateAllUI();
        this.setStatusMessage('配牌が完了しました。東家のあなたから打牌です。');
        this.addLog('東一局・0本場 開始', null);
        this.state = 'playing';
        this.startBtn.disabled = true;
        this.startBtn.textContent = '再戦する';
        this.autoSortBtn.disabled = false;
        this.currentTurn = this.playerIndex;
        setTimeout(() => this.takeTurn(), 600);
    }

    resetRoundState() {
        this.wall = [];
        this.hands = [[], [], [], []];
        this.discards = [[], [], [], []];
        this.currentTurn = this.playerIndex;
        this.state = 'idle';
        this.highlightTileId = null;
        this.winnerIndex = null;
        this.logEntries = [];
        this.scores = [25000, 25000, 25000, 25000];
        this.scoreCards.forEach(card => {
            card.classList.remove('winner');
            card.classList.remove('active');
        });
    }

    buildWall() {
        let id = 0;
        const wall = [];
        const suits = ['m', 'p', 's'];
        for (const suit of suits) {
            for (let value = 1; value <= 9; value++) {
                for (let i = 0; i < 4; i++) {
                    wall.push({ id: id++, code: `${value}${suit}` });
                }
            }
        }
        for (let value = 1; value <= 7; value++) {
            for (let i = 0; i < 4; i++) {
                wall.push({ id: id++, code: `${value}z` });
            }
        }
        this.shuffle(wall);
        this.wall = wall;
        this.updateWallCount();
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    dealHands() {
        for (let round = 0; round < 13; round++) {
            for (let seat = 0; seat < 4; seat++) {
                this.hands[seat].push(this.drawTile());
            }
        }
        this.hands.forEach(hand => this.sortHand(hand));
    }

    takeTurn() {
        if (this.state === 'finished') {
            return;
        }
        if (this.wall.length === 0) {
            this.endInDraw();
            return;
        }
        this.updateTurnIndicators();
        if (this.currentTurn === this.playerIndex) {
            this.playerDrawPhase();
        } else {
            this.aiTakeTurn(this.currentTurn);
        }
    }

    playerDrawPhase() {
        const tile = this.drawTile();
        if (!tile) {
            this.endInDraw();
            return;
        }
        this.hands[this.playerIndex].push(tile);
        this.highlightTileId = tile.id;
        this.sortHand(this.hands[this.playerIndex]);
        this.updateAllUI();
        this.state = 'awaiting-discard';
        const canWin = this.canWin(this.hands[this.playerIndex]);
        if (canWin) {
            this.tsumoBtn.classList.remove('hidden');
            this.setStatusMessage('和了形が揃いました！「ツモ」で和了しましょう。');
        } else {
            this.tsumoBtn.classList.add('hidden');
            this.setStatusMessage('捨てたい牌をクリックして打牌してください。');
        }
        this.enablePlayerInteractions();
    }

    enablePlayerInteractions() {
        const container = this.handContainers[this.playerIndex];
        container.querySelectorAll('.tile.clickable').forEach(tileEl => {
            tileEl.addEventListener('click', () => {
                const tileId = Number(tileEl.dataset.tileId);
                this.handlePlayerDiscard(tileId);
            }, { once: true });
        });
    }

    handlePlayerDiscard(tileId) {
        if (this.state !== 'awaiting-discard') {
            return;
        }
        const hand = this.hands[this.playerIndex];
        const index = hand.findIndex(tile => tile.id === tileId);
        if (index === -1) {
            return;
        }
        const [discard] = hand.splice(index, 1);
        this.discards[this.playerIndex].push(discard);
        this.highlightTileId = null;
        this.updateAllUI();
        this.addLog(`${this.players[this.playerIndex].name}は${this.tileName(discard.code)}を捨てた`, this.playerIndex);
        this.state = 'playing';
        this.tsumoBtn.classList.add('hidden');
        this.currentTurn = (this.currentTurn + 1) % 4;
        setTimeout(() => this.takeTurn(), 800);
    }

    aiTakeTurn(index) {
        if (this.state === 'finished') {
            return;
        }
        const tile = this.drawTile();
        if (!tile) {
            this.endInDraw();
            return;
        }
        this.hands[index].push(tile);
        this.sortHand(this.hands[index]);
        this.updateAllUI();
        if (this.canWin(this.hands[index])) {
            this.highlightTileId = null;
            setTimeout(() => this.declareWin(index, 'tsumo'), 600);
            return;
        }
        const discard = this.chooseAIDiscard(index);
        this.discards[index].push(discard);
        this.addLog(`${this.players[index].name}は${this.tileName(discard.code)}を捨てた`, index);
        this.updateAllUI();
        this.currentTurn = (index + 1) % 4;
        setTimeout(() => this.takeTurn(), 900);
    }

    chooseAIDiscard(index) {
        const hand = this.hands[index];
        this.sortHand(hand);
        const discard = hand.pop();
        return discard;
    }

    declareWin(index, type) {
        if (this.state === 'finished') {
            return;
        }
        this.state = 'finished';
        this.winnerIndex = index;
        const playerName = this.players[index].name;
        const message = type === 'tsumo' ? `${playerName}のツモ和了！` : `${playerName}の和了！`;
        this.setStatusMessage(message);
        this.addLog(message, index);
        const gain = 6000;
        this.scores[index] += gain;
        const loss = Math.floor(gain / 3);
        for (let seat = 0; seat < 4; seat++) {
            if (seat !== index) {
                this.scores[seat] -= loss;
            }
        }
        this.updateAllUI();
        this.finishRound();
    }

    endInDraw() {
        if (this.state === 'finished') {
            return;
        }
        this.state = 'finished';
        this.setStatusMessage('流局しました。もう一度挑戦してみましょう。');
        this.addLog('流局 - 残り山が尽きました', null);
        this.finishRound();
    }

    finishRound() {
        this.startBtn.disabled = false;
        this.startBtn.textContent = '再戦する';
        this.autoSortBtn.disabled = true;
        this.tsumoBtn.classList.add('hidden');
        this.highlightTileId = null;
        this.updateTurnIndicators();
        if (this.winnerIndex !== null) {
            this.scoreCards[this.winnerIndex].classList.add('winner');
        }
    }

    drawTile() {
        const tile = this.wall.pop();
        this.updateWallCount();
        return tile;
    }

    sortAndRenderPlayerHand() {
        if (this.hands[this.playerIndex].length === 0) {
            return;
        }
        this.sortHand(this.hands[this.playerIndex]);
        this.updateHands();
    }

    sortHand(hand) {
        hand.sort((a, b) => this.tileSortValue(a.code) - this.tileSortValue(b.code));
    }

    tileSortValue(code) {
        const suit = code.slice(-1);
        const value = parseInt(code.slice(0, -1), 10);
        const suitOrder = { m: 0, p: 1, s: 2, z: 3 };
        return suitOrder[suit] * 100 + value;
    }

    canWin(hand) {
        if (!hand || hand.length % 3 !== 2) {
            return false;
        }
        const tiles = hand.map(tile => tile.code);
        const counts = this.createTileCounts(tiles);
        for (const tile of Object.keys(counts)) {
            if (counts[tile] >= 2) {
                counts[tile] -= 2;
                if (this.canFormSets(counts)) {
                    counts[tile] += 2;
                    return true;
                }
                counts[tile] += 2;
            }
        }
        return false;
    }

    createTileCounts(tiles) {
        const counts = {};
        tiles.forEach(code => {
            counts[code] = (counts[code] || 0) + 1;
        });
        return counts;
    }

    canFormSets(counts) {
        const remainingTiles = Object.entries(counts).filter(([, count]) => count > 0);
        if (remainingTiles.length === 0) {
            return true;
        }
        const [tile, count] = remainingTiles[0];
        if (count >= 3) {
            counts[tile] -= 3;
            if (this.canFormSets(counts)) {
                counts[tile] += 3;
                return true;
            }
            counts[tile] += 3;
        }
        const suit = tile.slice(-1);
        if (suit !== 'z') {
            const value = parseInt(tile.slice(0, -1), 10);
            const n1 = `${value + 1}${suit}`;
            const n2 = `${value + 2}${suit}`;
            if (counts[n1] > 0 && counts[n2] > 0) {
                counts[tile]--;
                counts[n1]--;
                counts[n2]--;
                if (this.canFormSets(counts)) {
                    counts[tile]++;
                    counts[n1]++;
                    counts[n2]++;
                    return true;
                }
                counts[tile]++;
                counts[n1]++;
                counts[n2]++;
            }
        }
        return false;
    }

    tileName(code) {
        const suit = code.slice(-1);
        const value = parseInt(code.slice(0, -1), 10);
        if (suit === 'm') {
            return `${this.numberKanji[value]}萬`;
        }
        if (suit === 'p') {
            return `${this.fullWidthNumbers[value]}筒`;
        }
        if (suit === 's') {
            return `${this.numberKanji[value]}索`;
        }
        return this.honorNames[value];
    }

    createTileElement(tile, { hidden = false, clickable = false, size = 'normal', highlight = false } = {}) {
        const element = document.createElement('div');
        element.classList.add('tile');
        if (clickable) {
            element.classList.add('clickable');
        }
        if (size === 'small') {
            element.classList.add('tile-small');
        }
        if (hidden) {
            element.classList.add('tile-back');
            return element;
        }
        const code = tile.code;
        const suit = code.slice(-1);
        const value = parseInt(code.slice(0, -1), 10);
        let rankText = '';
        let className = '';
        let suitText = '';
        if (suit === 'm') {
            rankText = this.numberKanji[value];
            suitText = '萬';
            className = 'tile-man';
        } else if (suit === 'p') {
            rankText = this.fullWidthNumbers[value];
            suitText = '筒';
            className = 'tile-pin';
        } else if (suit === 's') {
            rankText = this.numberKanji[value];
            suitText = '索';
            className = 'tile-sou';
        } else {
            rankText = this.honorNames[value];
            className = 'tile-honor';
        }
        element.classList.add(className);
        const rank = document.createElement('span');
        rank.className = 'rank';
        rank.textContent = rankText;
        element.appendChild(rank);
        if (suit !== 'z') {
            const suitLabel = document.createElement('span');
            suitLabel.className = 'suit-label';
            suitLabel.textContent = suitText;
            element.appendChild(suitLabel);
        }
        if (clickable) {
            element.dataset.tileId = String(tile.id);
        }
        if (highlight) {
            element.classList.add('tile-drawn');
        }
        return element;
    }

    updateAllUI() {
        this.updateWallCount();
        this.updateRoundInfo();
        this.updateScoreboard();
        this.updateHands();
        this.updateDiscards();
        this.updateLog();
        this.updateTurnIndicators();
    }

    updateHands() {
        this.hands.forEach((hand, index) => {
            const container = this.handContainers[index];
            container.innerHTML = '';
            if (index === this.playerIndex) {
                hand.forEach(tile => {
                    const highlight = tile.id === this.highlightTileId;
                    const tileEl = this.createTileElement(tile, { clickable: true, highlight });
                    container.appendChild(tileEl);
                });
            } else {
                hand.forEach(() => {
                    const tileEl = this.createTileElement({ code: '0m', id: 0 }, { hidden: true });
                    container.appendChild(tileEl);
                });
            }
        });
    }

    updateDiscards() {
        this.discards.forEach((river, index) => {
            const container = this.discardContainers[index];
            container.innerHTML = '';
            river.forEach(tile => {
                const tileEl = this.createTileElement(tile, { size: 'small' });
                container.appendChild(tileEl);
            });
        });
    }

    updateScoreboard() {
        this.scores.forEach((score, index) => {
            this.scoreEls[index].textContent = score.toString();
        });
    }

    updateRoundInfo() {
        this.roundInfoEl.textContent = `${this.roundWind}一局 ・ ${this.honba}本場`;
    }

    updateWallCount() {
        this.wallCountEl.textContent = this.wall.length.toString().padStart(2, '0');
    }

    updateTurnIndicators() {
        this.scoreCards.forEach((card, idx) => {
            card.classList.toggle('active', this.state !== 'finished' && this.currentTurn === idx);
        });
        this.seatStates.forEach((label, idx) => {
            if (!label) return;
            if (this.state === 'finished') {
                label.textContent = idx === this.winnerIndex ? '和了' : '';
            } else if (this.currentTurn === idx) {
                label.textContent = idx === this.playerIndex ? '打牌中' : '思考中…';
            } else {
                label.textContent = '';
            }
        });
    }

    updateLog() {
        this.logList.innerHTML = '';
        this.logEntries.slice(-20).forEach(entry => {
            const li = document.createElement('li');
            li.textContent = entry.message;
            if (typeof entry.seat === 'number') {
                li.classList.add('highlight');
            }
            this.logList.appendChild(li);
        });
        this.logList.scrollTop = this.logList.scrollHeight;
    }

    addLog(message, seat) {
        this.logEntries.push({ message, seat, timestamp: Date.now() });
        this.updateLog();
    }

    setStatusMessage(message) {
        this.statusMessageEl.textContent = message;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MahjongGame();
});
