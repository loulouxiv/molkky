/* ================================================================
   Mölkky — Application Web
   ================================================================ */

const socket = io();

let gameState   = null;
let gameId      = null;
let pendingScore = null;
let localPlayers = [];

const urlParams = new URLSearchParams(window.location.search);
const joinId    = urlParams.get('id');

// =====================================================================
// BOOT
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {
  if (joinId) {
    showLoading('Connexion à la partie...');
    socket.emit('join-game', joinId);
  } else {
    renderSetup();
  }
});

socket.on('connect', () => {
  // Re-join after reconnect if we were already in a game
  if (joinId && !gameState) {
    socket.emit('join-game', joinId);
  }
});

socket.on('game-state', (state) => {
  gameState    = state;
  gameId       = state.id;
  pendingScore = null;
  routePhase();
});

socket.on('game-error', (msg) => {
  renderError(msg);
});

// =====================================================================
// ROUTING
// =====================================================================

function routePhase() {
  if (!gameState) return;
  if (gameState.phase === 'teams') renderTeams();
  else if (gameState.phase === 'game') renderGame();
}

// =====================================================================
// SETUP SCREEN
// =====================================================================

function renderSetup() {
  setApp(`
    <header class="header">
      <h1>Mölkky</h1>
      <div class="subtitle">Nouvelle partie</div>
    </header>
    <main class="screen">
      <div class="card">
        <div class="section-title">Joueurs</div>
        <div class="input-group">
          <input id="playerInput" class="input" type="text"
                 placeholder="Nom du joueur..." autocomplete="off"
                 onkeydown="if(event.key==='Enter')addPlayer()">
          <button class="btn btn-primary" onclick="addPlayer()">+</button>
        </div>
        <div id="playerList">${buildPlayerList()}</div>
      </div>

      <button id="startBtn" class="btn btn-primary btn-block"
              onclick="createGame()"
              ${localPlayers.length < 2 ? 'disabled' : ''}>
        🎲 Tirer au sort les équipes
      </button>
    </main>
  `);
  setTimeout(() => document.getElementById('playerInput')?.focus(), 60);
}

function buildPlayerList() {
  if (localPlayers.length === 0) {
    return `
      <div class="empty-state">
        <div style="font-size:38px;margin-bottom:8px">👥</div>
        <p>Ajoutez au moins 2 joueurs pour commencer.</p>
      </div>`;
  }
  return `<ul class="player-list">
    ${localPlayers.map((name, i) => `
      <li class="player-item">
        <div class="avatar" style="background:${avatarColor(i)}">${esc(name[0].toUpperCase())}</div>
        <span class="flex-1 fw500">${esc(name)}</span>
        <button class="icon-btn danger" onclick="removePlayer(${i})" aria-label="Supprimer">✕</button>
      </li>
    `).join('')}
  </ul>`;
}

function addPlayer() {
  const input = document.getElementById('playerInput');
  const name  = input.value.trim();
  if (!name) return;
  if (localPlayers.some(p => p.toLowerCase() === name.toLowerCase())) {
    showToast('Ce joueur est déjà dans la liste');
    return;
  }
  localPlayers.push(name);
  input.value = '';

  document.getElementById('playerList').innerHTML = buildPlayerList();
  const btn = document.getElementById('startBtn');
  if (btn) btn.disabled = localPlayers.length < 2;
  input.focus();
}

function removePlayer(i) {
  localPlayers.splice(i, 1);
  document.getElementById('playerList').innerHTML = buildPlayerList();
  const btn = document.getElementById('startBtn');
  if (btn) btn.disabled = localPlayers.length < 2;
}

function createGame() {
  if (localPlayers.length < 2) return;
  showLoading('Création de la partie...');
  socket.emit('create-game', { players: localPlayers });
}

// =====================================================================
// TEAMS SCREEN
// =====================================================================

function renderTeams() {
  const { teams, turnOrder, id } = gameState;
  const allPlayers = [...teams.team1, ...teams.team2];

  setApp(`
    <header class="header">
      <h1>Mölkky</h1>
      <div class="subtitle">Partie #${id}</div>
    </header>
    <main class="screen">
      <div class="teams-grid">
        <div class="team-card team1">
          <div class="team-label t1">Équipe 1</div>
          ${teams.team1.map(p => `
            <div class="mini-player">
              <div class="avatar sm" style="background:var(--t1)">${esc(p.name[0].toUpperCase())}</div>
              <span>${esc(p.name)}</span>
            </div>`).join('')}
        </div>
        <div class="team-card team2">
          <div class="team-label t2">Équipe 2</div>
          ${teams.team2.map(p => `
            <div class="mini-player">
              <div class="avatar sm" style="background:var(--t2)">${esc(p.name[0].toUpperCase())}</div>
              <span>${esc(p.name)}</span>
            </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="section-title">Ordre de passage</div>
        <div class="turn-list">
          ${turnOrder.map((name, i) => {
            const player = allPlayers.find(p => p.name === name);
            return `
              <div class="turn-item">
                <div class="turn-num">${i + 1}</div>
                <div class="avatar sm" style="background:${player?.team === 'team1' ? 'var(--t1)' : 'var(--t2)'}">
                  ${esc(name[0].toUpperCase())}
                </div>
                <span class="flex-1 fw600">${esc(name)}</span>
                <span class="team-tag ${player?.team}">${player?.team === 'team1' ? 'Éq. 1' : 'Éq. 2'}</span>
              </div>`;
          }).join('')}
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-outline" onclick="redrawTeams()">🔄 Rejouer</button>
        <button class="btn btn-primary flex-2" onclick="startGame()">🎯 Commencer</button>
      </div>
    </main>
  `);
}

function redrawTeams() {
  socket.emit('redraw-teams', gameId);
}

function startGame() {
  socket.emit('update-game', { gameId, state: { ...gameState, phase: 'game' } });
}

// =====================================================================
// GAME SCREEN
// =====================================================================

function renderGame() {
  const { players, turnOrder, currentTurn, qrCode, url, winner, teams, absoluteTurn } = gameState;
  const allPlayers = [...teams.team1, ...teams.team2];

  // Determine active player (skip eliminated)
  const activeTurn = getActiveTurn(players, turnOrder, currentTurn);
  const currentName   = activeTurn ? activeTurn.name : null;
  const currentPlayer = activeTurn ? activeTurn.player : null;

  setApp(`
    ${winner ? winnerOverlay(winner) : ''}

    <header class="header">
      <h1>Mölkky</h1>
      <button class="qr-btn" onclick="toggleQR()" title="Partager via QR code">📱</button>
    </header>

    <div id="qrPanel" class="qr-panel hidden">
      <img src="${qrCode}" alt="QR Code" class="qr-img">
      <div class="qr-url">${esc(url)}</div>
    </div>

    <main class="screen">
      <!-- Current turn -->
      <div class="card turn-card">
        <div class="turn-label">Au tour de</div>
        <div class="turn-name">${currentName ? esc(currentName) : '—'}</div>
        ${currentPlayer ? `<div class="badge ${currentPlayer.team}">${currentPlayer.team === 'team1' ? 'Équipe 1' : 'Équipe 2'}</div>` : ''}

        <div>
          <div class="score-hint">Quilles abattues :</div>
          <div class="score-grid">
            ${Array.from({ length: 12 }, (_, i) => i + 1).map(n => `
              <button class="score-btn${pendingScore === n ? ' selected' : ''}"
                      onclick="selectScore(${n})">${n}</button>`).join('')}
          </div>
          <button class="miss-btn${pendingScore === 0 ? ' selected' : ''}"
                  onclick="selectScore(0)">✕ RATÉ (0 point)</button>
        </div>

        <button class="btn btn-primary btn-block"
                id="validateBtn"
                onclick="validateScore()"
                ${pendingScore === null ? 'disabled' : ''}>
          ✓ Valider le score
        </button>
      </div>

      <!-- Scoreboard -->
      <div class="card">
        <div class="section-title">Classement · Tour ${absoluteTurn + 1}</div>
        ${buildScoreboard(players, currentName)}
      </div>
    </main>
  `);
}

function buildScoreboard(players, currentName) {
  const sorted = [...players].sort((a, b) => {
    if (a.misses >= 3 && b.misses < 3) return 1;
    if (b.misses >= 3 && a.misses < 3) return -1;
    return b.score - a.score;
  });

  return sorted.map(p => {
    const elim    = p.misses >= 3;
    const isCur   = p.name === currentName;
    const pct     = Math.min((p.score / 50) * 100, 100);
    const barClr  = p.score >= 45 ? 'var(--success)' : p.score >= 30 ? 'var(--accent)' : 'var(--primary-light)';

    return `
      <div class="score-row ${isCur ? 'active' : ''} ${elim ? 'elim' : ''}">
        <div class="avatar" style="background:${p.team === 'team1' ? 'var(--t1)' : 'var(--t2)'}">
          ${esc(p.name[0].toUpperCase())}
        </div>
        <div class="score-info">
          <div class="score-name">
            ${esc(p.name)}
            ${elim ? '<span class="elim-tag">éliminé</span>' : ''}
          </div>
          <div class="miss-row">
            <div class="miss-dot${p.misses >= 1 ? ' hit' : ''}"></div>
            <div class="miss-dot${p.misses >= 2 ? ' hit' : ''}"></div>
            <div class="miss-dot${p.misses >= 3 ? ' hit' : ''}"></div>
          </div>
          <div class="progress">
            <div class="progress-bar" style="width:${pct}%;background:${barClr}"></div>
          </div>
        </div>
        <div class="score-num${p.score >= 45 ? ' near-win' : ''}">${p.score}</div>
      </div>`;
  }).join('');
}

function winnerOverlay(winner) {
  const isTeam = winner.name.startsWith('Équipe');
  return `
    <div class="overlay" onclick="this.remove()">
      <div class="winner-card" onclick="event.stopPropagation()">
        <div class="trophy">🏆</div>
        <h2>${isTeam ? esc(winner.name) + ' gagne !' : 'Victoire !'}</h2>
        ${!isTeam ? `<div class="winner-name">${esc(winner.name)}</div>` : ''}
        <p class="winner-sub">
          ${isTeam
            ? "Toute l'équipe adverse est éliminée !"
            : `${esc(winner.name)} atteint exactement 50 points !`}
        </p>
        <button class="btn btn-primary btn-block" onclick="window.location.href='/'">
          Nouvelle partie
        </button>
      </div>
    </div>`;
}

// =====================================================================
// GAME ACTIONS
// =====================================================================

function selectScore(score) {
  pendingScore = score;

  document.querySelectorAll('.score-btn').forEach(b => b.classList.remove('selected'));
  const missBtn = document.querySelector('.miss-btn');
  if (missBtn) missBtn.classList.remove('selected');

  if (score === 0) {
    if (missBtn) missBtn.classList.add('selected');
  } else {
    const btn = [...document.querySelectorAll('.score-btn')]
      .find(b => parseInt(b.textContent.trim()) === score);
    if (btn) btn.classList.add('selected');
  }

  const vBtn = document.getElementById('validateBtn');
  if (vBtn) vBtn.disabled = false;
}

function validateScore() {
  if (pendingScore === null || !gameState) return;

  const { players, turnOrder, currentTurn, absoluteTurn } = gameState;
  const activeTurn = getActiveTurn(players, turnOrder, currentTurn);
  if (!activeTurn) return;

  const newPlayers = players.map(p => ({ ...p }));
  const player     = newPlayers.find(p => p.name === activeTurn.name);
  if (!player) return;

  if (pendingScore === 0) {
    player.misses += 1;
    if (player.misses >= 3) {
      showToast(`${player.name} est éliminé après 3 ratés !`);
    }
  } else {
    player.misses  = 0;
    player.score  += pendingScore;
    if (player.score > 50) {
      player.score = 25;
      showToast(`${player.name} dépasse 50 → retour à 25 !`);
    }
  }

  // Check for winner
  let winner = null;
  if (player.score === 50) {
    winner = { name: player.name, team: player.team };
  }

  if (!winner) {
    const t1Alive = newPlayers.filter(p => p.team === 'team1' && p.misses < 3);
    const t2Alive = newPlayers.filter(p => p.team === 'team2' && p.misses < 3);
    if      (t1Alive.length === 0) winner = { name: 'Équipe 2', team: 'team2' };
    else if (t2Alive.length === 0) winner = { name: 'Équipe 1', team: 'team1' };
  }

  // Advance to next non-eliminated player
  let nextTurn = activeTurn.turn + 1;
  for (let i = 0; i < turnOrder.length; i++) {
    const p = newPlayers.find(pl => pl.name === turnOrder[nextTurn % turnOrder.length]);
    if (p && p.misses < 3) break;
    nextTurn++;
  }

  const newState = {
    ...gameState,
    players:       newPlayers,
    currentTurn:   nextTurn,
    absoluteTurn:  (absoluteTurn || 0) + 1,
    winner,
  };

  socket.emit('update-game', { gameId, state: newState });
}

function toggleQR() {
  document.getElementById('qrPanel')?.classList.toggle('hidden');
}

// =====================================================================
// HELPERS
// =====================================================================

/**
 * Find the current active (non-eliminated) player in turn order.
 * Returns { turn, name, player } or null if all eliminated.
 */
function getActiveTurn(players, turnOrder, currentTurn) {
  for (let i = 0; i < turnOrder.length * 2; i++) {
    const idx  = (currentTurn + i) % turnOrder.length;
    const name = turnOrder[idx];
    const p    = players.find(pl => pl.name === name);
    if (p && p.misses < 3) {
      return { turn: currentTurn + i, name, player: p };
    }
  }
  return null;
}

function setApp(html) {
  document.getElementById('app').innerHTML = html;
}

function showLoading(msg) {
  setApp(`
    <header class="header"><h1>Mölkky</h1></header>
    <div class="screen">
      <div class="loading">
        <div class="spinner"></div>
        <p>${msg}</p>
      </div>
    </div>`);
}

function renderError(msg) {
  setApp(`
    <header class="header"><h1>Mölkky</h1></header>
    <div class="screen">
      <div class="card error-card">
        <div style="font-size:48px">⚠️</div>
        <h2>Partie introuvable</h2>
        <p>${esc(msg)}</p>
        <button class="btn btn-primary btn-block" onclick="window.location.href='/'">
          Nouvelle partie
        </button>
      </div>
    </div>`);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = String(str);
  return d.innerHTML;
}

function avatarColor(i) {
  const c = ['#6366F1','#F59E0B','#10B981','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316'];
  return c[i % c.length];
}

function showToast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
