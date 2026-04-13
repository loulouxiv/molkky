const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const os = require('os');
const path = require('path');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;

// Games stored in memory: gameId -> gameState
const games = new Map();

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawTeams(players) {
  const shuffled = shuffle(players);
  const mid = Math.ceil(shuffled.length / 2);
  const team1 = shuffled.slice(0, mid).map(p => ({ ...p, team: 'team1' }));
  const team2 = shuffled.slice(mid).map(p => ({ ...p, team: 'team2' }));
  return { team1, team2 };
}

function buildTurnOrder(team1, team2) {
  const t1 = shuffle(team1);
  const t2 = shuffle(team2);
  const order = [];
  const maxLen = Math.max(t1.length, t2.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < t1.length) order.push(t1[i].name);
    if (i < t2.length) order.push(t2[i].name);
  }
  return order;
}

async function makeQrCode(origin, gameId) {
  const gameUrl = `${origin}/?id=${gameId}`;
  let qrCode = '';
  try {
    qrCode = await QRCode.toDataURL(gameUrl, {
      width: 200, margin: 2,
      color: { dark: '#1B4332', light: '#FFFFFF' },
    });
  } catch (e) { console.error('QR error:', e.message); }
  return { gameUrl, qrCode };
}

function newTeams() {
  return { team1: { score: 0, misses: 0 }, team2: { score: 0, misses: 0 } };
}

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {

  // ---- Random team draw ----
  socket.on('create-game', async ({ players, baseUrl }) => {
    const gameId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const origin = baseUrl || `http://${getLocalIP()}:${PORT}`;
    const { gameUrl, qrCode } = await makeQrCode(origin, gameId);

    const playerObjects = players.map(name => ({ name, team: null, history: [] }));
    const { team1, team2 } = drawTeams(playerObjects);
    const allPlayers = [...team1, ...team2];
    const turnOrder  = buildTurnOrder(team1, team2);

    const game = {
      id: gameId, phase: 'teams',
      players: allPlayers, teams: newTeams(), turnOrder,
      currentTurn: 0, absoluteTurn: 0,
      winner: null, url: gameUrl, qrCode,
    };
    games.set(gameId, game);
    socket.join(gameId);
    socket.emit('game-state', game);
  });

  // ---- Manual team assignment ----
  socket.on('set-teams', async ({ team1Names, team2Names, baseUrl }) => {
    const gameId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const origin = baseUrl || `http://${getLocalIP()}:${PORT}`;
    const { gameUrl, qrCode } = await makeQrCode(origin, gameId);

    const team1 = team1Names.map(name => ({ name, team: 'team1', history: [] }));
    const team2 = team2Names.map(name => ({ name, team: 'team2', history: [] }));
    const allPlayers = [...team1, ...team2];
    const turnOrder  = buildTurnOrder(team1, team2);

    const game = {
      id: gameId, phase: 'teams',
      players: allPlayers, teams: newTeams(), turnOrder,
      currentTurn: 0, absoluteTurn: 0,
      winner: null, url: gameUrl, qrCode,
    };
    games.set(gameId, game);
    socket.join(gameId);
    socket.emit('game-state', game);
  });

  socket.on('join-game', (gameId) => {
    const game = games.get(gameId);
    if (game) {
      socket.join(gameId);
      socket.emit('game-state', game);
    } else {
      socket.emit('game-error', 'Partie introuvable. Le lien est peut-être expiré.');
    }
  });

  socket.on('update-game', ({ gameId, state }) => {
    if (games.has(gameId)) {
      games.set(gameId, state);
      io.to(gameId).emit('game-state', state);
    }
  });

  socket.on('redraw-teams', (gameId) => {
    const game = games.get(gameId);
    if (!game) return;

    const freshPlayers = game.players.map(p => ({ name: p.name, team: null, history: [] }));
    const { team1, team2 } = drawTeams(freshPlayers);
    const allPlayers = [...team1, ...team2];
    const turnOrder  = buildTurnOrder(team1, team2);

    const newGame = {
      ...game, phase: 'teams',
      players: allPlayers, teams: newTeams(), turnOrder,
      currentTurn: 0, absoluteTurn: 0, winner: null,
    };
    games.set(gameId, newGame);
    io.to(gameId).emit('game-state', newGame);
  });
});

httpServer.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\nMölkky app running!`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Réseau:  http://${ip}:${PORT}\n`);
});
