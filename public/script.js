const socket = io();

const screenLogin = document.getElementById('screen-login');
const screenLobby = document.getElementById('screen-lobby');
const screenGame = document.getElementById('screen-game');
const screenResults = document.getElementById('screen-results');

const playerNameInput = document.getElementById('player-name');
const roomIdInput = document.getElementById('room-id');
const btnJoin = document.getElementById('btn-join');
const lobbyRoomId = document.getElementById('lobby-room-id');
const playersList = document.getElementById('players-list');
const btnStart = document.getElementById('btn-start');

const adminSettings = document.getElementById('admin-settings');
const btnModeNormal = document.getElementById('btn-mode-normal');
const btnModeStory = document.getElementById('btn-mode-story');
const settingRounds = document.getElementById('setting-rounds');
const settingTime = document.getElementById('setting-time');

const timerDisplay = document.getElementById('timer-display');
const gameHeader = document.getElementById('game-header');
const previousEntryContainer = document.getElementById('previous-entry-container');
const inputTextContainer = document.getElementById('input-text-container');
const inputDrawContainer = document.getElementById('input-draw-container');
const gameTextInput = document.getElementById('game-text-input');
const btnSubmit = document.getElementById('btn-submit');

const resultsPlayersList = document.getElementById('results-players-list');
const chainViewContainer = document.getElementById('chain-view-container');
const btnPlayAgain = document.getElementById('btn-play-again');

const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('color-picker');
const brushSize = document.getElementById('brush-size');
const btnClear = document.getElementById('btn-clear');

let currentRoom = '';
let isDrawing = false;
let currentPhase = '';
let isAdmin = false;
let selectedMode = 'normal';
let finishedChains = [];
let localPlayers = [];

function showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 4000);
}

function switchScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

btnJoin.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const room = roomIdInput.value.trim();
    if (name && room) {
        currentRoom = room;
        socket.emit('joinRoom', { roomId: room, playerName: name });
        lobbyRoomId.textContent = `#${room}`;
        switchScreen(screenLobby);
    }
});

socket.on('updateLobby', ({ players, adminId, settings }) => {
    const wasAdmin = isAdmin;
    const oldPlayers = localPlayers;
    
    localPlayers = players;
    isAdmin = (socket.id === adminId);
    
    if (!wasAdmin && isAdmin && oldPlayers.length > 0) {
        showToast("You are now the Admin!");
    }
    
    if (oldPlayers.length > 0) {
        const oldIds = oldPlayers.map(p => p.id);
        const newIds = players.map(p => p.id);
        
        players.forEach(p => {
            if (!oldIds.includes(p.id)) {
                showToast(`${p.name} joined the room.`);
            }
        });
        
        oldPlayers.forEach(p => {
            if (!newIds.includes(p.id)) {
                showToast(`${p.name} left the room.`);
            }
        });
    }

    playersList.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.className = 'player-result-item';
        li.style.cursor = 'default';
        
        const avatar = document.createElement('img');
        avatar.className = 'player-avatar';
        avatar.src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.name}`;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;
        
        li.appendChild(avatar);
        li.appendChild(nameSpan);

        if (p.id === adminId) {
            const adminBadge = document.createElement('span');
            adminBadge.textContent = 'ADMIN';
            adminBadge.style.fontSize = '10px';
            adminBadge.style.background = '#fff';
            adminBadge.style.color = '#000';
            adminBadge.style.padding = '2px 6px';
            adminBadge.style.marginLeft = '10px';
            adminBadge.style.fontWeight = '800';
            adminBadge.style.letterSpacing = '1px';
            li.appendChild(adminBadge);
        }

        if (isAdmin && p.id !== socket.id) {
            const btnGiveAdmin = document.createElement('button');
            btnGiveAdmin.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">
                    <polygon points="2 20 22 20 19 8 16 14 12 4 8 14 5 8" />
                </svg>
            `;
            btnGiveAdmin.title = 'Transfer Admin';
            btnGiveAdmin.className = 'btn-transfer-admin';
            
            btnGiveAdmin.addEventListener('click', () => {
                socket.emit('transferAdmin', { roomId: currentRoom, targetId: p.id });
            });
            li.appendChild(btnGiveAdmin);
        }

        playersList.appendChild(li);
    });
    
    if (isAdmin) {
        btnStart.style.display = players.length > 1 ? 'block' : 'none';
        btnPlayAgain.style.display = 'block';
    } else {
        btnStart.style.display = 'none';
        btnPlayAgain.style.display = 'none';
    }

    settingRounds.disabled = !isAdmin;
    settingTime.disabled = !isAdmin;
    btnModeNormal.disabled = !isAdmin;
    btnModeStory.disabled = !isAdmin;

    selectedMode = settings.mode;
    if (selectedMode === 'story') {
        btnModeStory.classList.add('active');
        btnModeNormal.classList.remove('active');
    } else {
        btnModeNormal.classList.add('active');
        btnModeStory.classList.remove('active');
    }
    
    settingRounds.value = settings.rounds;
    settingTime.value = settings.timeLimit;
});

btnModeNormal.addEventListener('click', () => {
    if (!isAdmin) return;
    selectedMode = 'normal';
    btnModeNormal.classList.add('active');
    btnModeStory.classList.remove('active');
    sendSettings();
});

btnModeStory.addEventListener('click', () => {
    if (!isAdmin) return;
    selectedMode = 'story';
    btnModeStory.classList.add('active');
    btnModeNormal.classList.remove('active');
    sendSettings();
});

settingRounds.addEventListener('change', sendSettings);
settingTime.addEventListener('change', sendSettings);

function sendSettings() {
    if (!isAdmin) return;
    socket.emit('updateSettings', {
        roomId: currentRoom,
        settings: {
            mode: selectedMode,
            rounds: parseInt(settingRounds.value),
            timeLimit: parseInt(settingTime.value)
        }
    });
}

socket.on('settingsUpdated', (settings) => {
    if (!isAdmin) {
        selectedMode = settings.mode;
        if (selectedMode === 'story') {
            btnModeStory.classList.add('active');
            btnModeNormal.classList.remove('active');
        } else {
            btnModeNormal.classList.add('active');
            btnModeStory.classList.remove('active');
        }
        settingRounds.value = settings.rounds;
        settingTime.value = settings.timeLimit;
    }
});

btnStart.addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('startGame', currentRoom);
    }
});

socket.on('startTurn', ({ type, previousEntry }) => {
    switchScreen(screenGame);
    currentPhase = type;
    
    inputTextContainer.classList.remove('active');
    inputDrawContainer.classList.remove('active');
    gameTextInput.value = '';
    clearCanvas();
    previousEntryContainer.innerHTML = '';

    if (previousEntry) {
        if (previousEntry.type === 'text') {
            previousEntryContainer.textContent = previousEntry.value;
        } else if (previousEntry.type === 'draw') {
            const img = document.createElement('img');
            img.src = previousEntry.value;
            previousEntryContainer.appendChild(img);
        }
    } else {
        previousEntryContainer.textContent = "Start the chain with a prompt!";
    }

    if (type === 'text') {
        gameHeader.textContent = previousEntry ? "Describe what you see" : "Write a prompt";
        inputTextContainer.classList.add('active');
    } else {
        gameHeader.textContent = "Draw this prompt";
        inputDrawContainer.classList.add('active');
        resizeCanvas();
    }
    
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'Submit';
});

socket.on('timerUpdate', (timeLeft) => {
    timerDisplay.textContent = timeLeft;
});

socket.on('forceSubmitCallback', () => {
    submitCurrentWork();
});

btnSubmit.addEventListener('click', () => {
    submitCurrentWork();
});

function submitCurrentWork() {
    if (btnSubmit.disabled) return;
    
    let value = '';
    if (currentPhase === 'text') {
        value = gameTextInput.value.trim() || 'No text provided';
    } else if (currentPhase === 'draw') {
        value = canvas.toDataURL('image/png');
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Waiting...';

    socket.emit('submitEntry', {
        roomId: currentRoom,
        type: currentPhase,
        value: value
    });
}

socket.on('gameFinished', (chains) => {
    finishedChains = chains;
    switchScreen(screenResults);
    
    resultsPlayersList.innerHTML = '';
    chainViewContainer.innerHTML = '<p class="placeholder-text">Select a player to view their chain!</p>';
    
    localPlayers.forEach((p, index) => {
        const li = document.createElement('li');
        li.className = 'player-result-item';
        
        const avatar = document.createElement('img');
        avatar.className = 'player-avatar';
        avatar.src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${p.name}`;
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = p.name;
        
        li.appendChild(avatar);
        li.appendChild(nameSpan);
        
        li.addEventListener('click', () => {
            document.querySelectorAll('.player-result-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            renderChain(p.id);
        });
        
        resultsPlayersList.appendChild(li);
    });
});

function renderChain(playerId) {
    chainViewContainer.innerHTML = '';
    const chain = finishedChains.find(c => c.owner === playerId);
    
    if (!chain) return;

    chain.entries.forEach(entry => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'chain-entry';
        
        const author = document.createElement('span');
        author.className = 'author-label';
        author.textContent = entry.author;
        entryDiv.appendChild(author);

        if (entry.type === 'text') {
            const text = document.createElement('p');
            text.textContent = entry.value;
            entryDiv.appendChild(text);
        } else if (entry.type === 'draw') {
            const img = document.createElement('img');
            img.src = entry.value;
            entryDiv.appendChild(img);
        }
        chainViewContainer.appendChild(entryDiv);
    });
}

btnPlayAgain.addEventListener('click', () => {
    if (isAdmin) {
        socket.emit('playAgain', currentRoom);
    }
});

socket.on('gameRestarted', () => {
    switchScreen(screenLobby);
});

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.lineCap = 'square';
    ctx.lineJoin = 'miter';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

window.addEventListener('resize', () => {
    if (currentPhase === 'draw') {
        const temp = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resizeCanvas();
        ctx.putImageData(temp, 0, 0);
    }
});

function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: clientX - rect.left,
        y: clientY - rect.top
    };
}

function startDrawing(e) {
    isDrawing = true;
    const pos = getMousePos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    draw(e);
}

function stopDrawing() {
    isDrawing = false;
    ctx.beginPath();
}

function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getMousePos(e);
    
    ctx.lineWidth = brushSize.value;
    ctx.strokeStyle = colorPicker.value;
    
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
}

function clearCanvas() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

canvas.addEventListener('touchstart', startDrawing, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDrawing);

btnClear.addEventListener('click', clearCanvas);
