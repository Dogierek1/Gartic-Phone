const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    socket.on('joinRoom', ({ roomId, playerName }) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = {
                adminId: socket.id,
                players: [],
                chains: [],
                currentRound: 0,
                status: 'lobby',
                settings: {
                    mode: 'normal',
                    rounds: 4,
                    timeLimit: 60
                },
                timerInterval: null,
                timeLeft: 0
            };
        }
        
        rooms[roomId].players.push({ id: socket.id, name: playerName, submitted: false });
        io.to(roomId).emit('updateLobby', {
            players: rooms[roomId].players,
            adminId: rooms[roomId].adminId,
            settings: rooms[roomId].settings
        });
    });

    socket.on('updateSettings', ({ roomId, settings }) => {
        const room = rooms[roomId];
        if (room && room.adminId === socket.id) {
            room.settings = settings;
            io.to(roomId).emit('settingsUpdated', settings);
        }
    });

    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (room && room.status === 'lobby' && room.adminId === socket.id) {
            room.status = 'playing';
            room.currentRound = 0;
            room.chains = room.players.map(p => ({
                owner: p.id,
                entries: []
            }));
            const gameLength = Math.min(room.settings.rounds, room.players.length);
            room.assignments = generateAssignments(room.players.length, gameLength);
            startRound(roomId);
        }
    });

    socket.on('submitEntry', ({ roomId, type, value }) => {
        const room = rooms[roomId];
        if (!room) return;

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1 || room.players[playerIndex].submitted) return;

        room.players[playerIndex].submitted = true;
        
        const chainIndex = room.assignments[room.currentRound][playerIndex];
        const chain = room.chains[chainIndex];
        chain.entries.push({ type, value, author: room.players[playerIndex].name });

        checkRoundCompletion(roomId);
    });

    socket.on('playAgain', (roomId) => {
        const room = rooms[roomId];
        if (room && room.adminId === socket.id) {
            room.status = 'lobby';
            room.currentRound = 0;
            room.chains = [];
            clearInterval(room.timerInterval);
            room.players.forEach(p => p.submitted = false);
            io.to(roomId).emit('gameRestarted');
            io.to(roomId).emit('updateLobby', {
                players: room.players,
                adminId: room.adminId,
                settings: room.settings
            });
        }
    });

    socket.on('transferAdmin', ({ roomId, targetId }) => {
        const room = rooms[roomId];
        if (room && room.adminId === socket.id && room.players.some(p => p.id === targetId)) {
            room.adminId = targetId;
            io.to(roomId).emit('updateLobby', {
                players: room.players,
                adminId: room.adminId,
                settings: room.settings
            });
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                
                if (room.players.length === 0) {
                    clearInterval(room.timerInterval);
                    delete rooms[roomId];
                } else {
                    if (room.adminId === socket.id) {
                        room.adminId = room.players[0].id;
                    }
                    if (room.status === 'lobby') {
                        io.to(roomId).emit('updateLobby', {
                            players: room.players,
                            adminId: room.adminId,
                            settings: room.settings
                        });
                    }
                }
            }
        }
    });
});

function startRound(roomId) {
    const room = rooms[roomId];
    const isEvenRound = room.currentRound % 2 === 0;
    
    room.players.forEach(p => p.submitted = false);
    
    room.players.forEach((player, i) => {
        const chainIndex = room.assignments[room.currentRound][i];
        const chain = room.chains[chainIndex];
        const previousEntry = chain.entries[chain.entries.length - 1];
        
        io.to(player.id).emit('startTurn', {
            type: room.settings.mode === 'story' ? 'text' : (isEvenRound ? 'text' : 'draw'),
            previousEntry: previousEntry || null
        });
    });

    startTimer(roomId);
}

function startTimer(roomId) {
    const room = rooms[roomId];
    clearInterval(room.timerInterval);
    room.timeLeft = room.settings.timeLimit;
    
    io.to(roomId).emit('timerUpdate', room.timeLeft);

    room.timerInterval = setInterval(() => {
        room.timeLeft--;
        io.to(roomId).emit('timerUpdate', room.timeLeft);

        if (room.timeLeft <= 0) {
            clearInterval(room.timerInterval);
            forceSubmit(roomId);
        }
    }, 1000);
}

function forceSubmit(roomId) {
    const room = rooms[roomId];
    room.players.forEach((player, playerIndex) => {
        if (!player.submitted) {
            player.submitted = true;
            const chainIndex = room.assignments[room.currentRound][playerIndex];
            const chain = room.chains[chainIndex];
            
            const isEvenRound = room.currentRound % 2 === 0;
            const type = room.settings.mode === 'story' ? 'text' : (isEvenRound ? 'text' : 'draw');
            const value = type === 'text' ? '' : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; 
            
            chain.entries.push({ type, value, author: player.name });
            io.to(player.id).emit('forceSubmitCallback');
        }
    });
    checkRoundCompletion(roomId);
}

function checkRoundCompletion(roomId) {
    const room = rooms[roomId];
    const allSubmitted = room.players.every(p => p.submitted);
    
    if (allSubmitted) {
        clearInterval(room.timerInterval);
        room.currentRound++;
        
        if (room.currentRound >= room.settings.rounds || room.currentRound >= room.players.length) {
            room.status = 'finished';
            io.to(roomId).emit('gameFinished', room.chains);
        } else {
            startRound(roomId);
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

function generateAssignments(playerCount, maxRounds) {
    const assignments = [];
    const seen = Array.from({length: playerCount}, () => new Set());
    
    const round0 = [];
    for(let i=0; i<playerCount; i++) {
        round0.push(i);
        seen[i].add(i);
    }
    assignments.push(round0);
    
    for(let r=1; r<maxRounds; r++) {
        let valid = false;
        let attempt = 0;
        let roundArr = [];
        
        while(!valid && attempt < 1000) {
            attempt++;
            roundArr = [...Array(playerCount).keys()];
            for (let i = roundArr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [roundArr[i], roundArr[j]] = [roundArr[j], roundArr[i]];
            }
            
            valid = true;
            for(let i=0; i<playerCount; i++) {
                if(seen[i].has(roundArr[i])) {
                    valid = false;
                    break;
                }
            }
        }
        
        if (!valid) {
            do {
                roundArr = [...Array(playerCount).keys()];
                for (let i = roundArr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [roundArr[i], roundArr[j]] = [roundArr[j], roundArr[i]];
                }
                valid = true;
                for(let i=0; i<playerCount; i++) {
                    if(assignments[r-1][i] === roundArr[i]) {
                        valid = false;
                        break;
                    }
                }
            } while(!valid);
        }
        
        for(let i=0; i<playerCount; i++) {
            seen[i].add(roundArr[i]);
        }
        assignments.push(roundArr);
    }
    return assignments;
}
