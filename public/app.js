/* ================================================================
   Mölkky — Application Web
   ================================================================ */

const socket = io();

let gameState        = null;
let gameId           = null;
let pendingScore     = null;
let localPlayers     = [];
let manualAssignments = {}; // { playerName: 'team1' | 'team2' }

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
  if (joinId && !gameState) socket.emit('join-game', joinId);
});

socket.on('game-state', (state) => {
  gameState    = state;
  gameId       = state.id;
  pendingScore = null;
  routePhase();
});

socket.on('game-error', (msg) => renderError(msg));

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
      <button id="manualBtn" class="btn btn-outline btn-block" style="margin-top:8px"
              onclick="showManualTeams()"
              ${localPlayers.length < 2 ? 'disabled' : ''}>
        ✏️ Faire les équipes manuellement
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
  const canStart = localPlayers.length >= 2;
  document.getElementById('startBtn').disabled  = !canStart;
  document.getElementById('manualBtn').disabled = !canStart;
  input.focus();
}

function removePlayer(i) {
  localPlayers.splice(i, 1);
  document.getElementById('playerList').innerHTML = buildPlayerList();
  const canStart = localPlayers.length >= 2;
  document.getElementById('startBtn').disabled  = !canStart;
  document.getElementById('manualBtn').disabled = !canStart;
}

function createGame() {
  if (localPlayers.length < 2) return;
  showLoading('Création de la partie...');
  socket.emit('create-game', { players: localPlayers, baseUrl: window.location.origin });
}

// =====================================================================
// MANUAL TEAM ASSIGNMENT SCREEN
// =====================================================================

function showManualTeams() {
  manualAssignments = {};
  renderManualTeams();
}

function renderManualTeams() {
  const t1       = localPlayers.filter(n => manualAssignments[n] === 'team1');
  const t2       = localPlayers.filter(n => manualAssignments[n] === 'team2');
  const pending  = localPlayers.filter(n => !manualAssignments[n]);
  const canConfirm = pending.length === 0 && t1.length >= 1 && t2.length >= 1;

  setApp(`
    <header class="header">
      <h1>Mölkky</h1>
      <div class="subtitle">Équipes manuelles</div>
    </header>
    <main class="screen">
      <div class="card">
        <div class="section-title">Répartition</div>
        <div class="assign-summary">
          <div class="assign-box t1">
            <div class="assign-count">${t1.length}</div>
            <div class="assign-label">Équipe 1</div>
          </div>
          <div class="assign-box grey">
            <div class="assign-count">${pending.length}</div>
            <div class="assign-label">Non assignés</div>
          </div>
          <div class="assign-box t2">
            <div class="assign-count">${t2.length}</div>
            <div class="assign-label">Équipe 2</div>
          </div>
        </div>

        ${localPlayers.map((name, i) => {
          const assigned = manualAssignments[name];
          const avatarBg = assigned === 'team1' ? 'var(--t1)' : assigned === 'team2' ? 'var(--t2)' : '#9CA3AF';
          return `
            <div class="assign-row${!assigned ? ' unassigned' : ''}">
              <div class="avatar" style="background:${avatarBg}">${esc(name[0].toUpperCase())}</div>
              <span class="flex-1 fw500">${esc(name)}</span>
              <button class="team-toggle t1${assigned === 'team1' ? ' active' : ''}"
                      onclick="assignTeam(${i},'team1')">Éq. 1</button>
              <button class="team-toggle t2${assigned === 'team2' ? ' active' : ''}"
                      onclick="assignTeam(${i},'team2')">Éq. 2</button>
            </div>`;
        }).join('')}
      </div>

      <div class="btn-row">
        <button class="btn btn-outline" onclick="renderSetup()">← Retour</button>
        <button class="btn btn-primary flex-2"
                onclick="confirmManualTeams()"
                ${!canConfirm ? 'disabled' : ''}>
          ✓ Confirmer les équipes
        </button>
      </div>
    </main>
  `);
}

function assignTeam(playerIndex, teamId) {
  const name = localPlayers[playerIndex];
  manualAssignments[name] = teamId;
  renderManualTeams();
}

function confirmManualTeams() {
  const t1Names = localPlayers.filter(n => manualAssignments[n] === 'team1');
  const t2Names = localPlayers.filter(n => manualAssignments[n] === 'team2');
  if (!t1Names.length || !t2Names.length) return;
  showLoading('Création de la partie...');
  socket.emit('set-teams', { team1Names: t1Names, team2Names: t2Names, baseUrl: window.location.origin });
}

// =====================================================================
// TEAMS SCREEN
// =====================================================================

function renderTeams() {
  const { players, turnOrder, id } = gameState;
  const team1Players = players.filter(p => p.team === 'team1');
  const team2Players = players.filter(p => p.team === 'team2');

  setApp(`
    <header class="header">
      <h1>Mölkky</h1>
      <div class="subtitle">Partie #${id}</div>
    </header>
    <main class="screen">
      <div class="teams-grid">
        <div class="team-card team1">
          <div class="team-label t1">Équipe 1</div>
          ${team1Players.map(p => `
            <div class="mini-player">
              <div class="avatar sm" style="background:var(--t1)">${esc(p.name[0].toUpperCase())}</div>
              <span>${esc(p.name)}</span>
            </div>`).join('')}
        </div>
        <div class="team-card team2">
          <div class="team-label t2">Équipe 2</div>
          ${team2Players.map(p => `
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
            const player = players.find(p => p.name === name);
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

  const activeTurn    = getActiveTurn(players, teams, turnOrder, currentTurn);
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

      <div class="card">
        <div class="section-title">Scores des équipes · Tour ${absoluteTurn + 1}</div>
        ${buildScoreboard(players, teams, turnOrder, currentName)}
      </div>
    </main>
  `);
}

function buildScoreboard(players, teams, turnOrder, currentName) {
  return ['team1', 'team2'].map(teamId => {
    const team      = teams[teamId];
    // Players listed in turn order for this team
    const teamPlayers = turnOrder
      .map(name => players.find(p => p.name === name && p.team === teamId))
      .filter(Boolean);
    const elim      = team.misses >= 3;
    const pct       = Math.min((team.score / 50) * 100, 100);
    const barClr    = team.score >= 45 ? 'var(--success)' : team.score >= 30 ? 'var(--accent)' : 'var(--primary-light)';
    const teamColor = teamId === 'team1' ? 'var(--t1)' : 'var(--t2)';
    const teamName  = teamId === 'team1' ? 'Équipe 1' : 'Équipe 2';

    return `
      <div class="team-score-card${elim ? ' elim' : ''}">
        <div class="team-score-header">
          <div>
            <div class="team-score-label" style="color:${teamColor}">${teamName}</div>
            <div class="miss-row">
              ${[0,1,2].map(i => `<div class="miss-dot${team.misses > i ? ' hit' : ''}"></div>`).join('')}
              ${elim ? '<span class="elim-tag">éliminée</span>' : ''}
            </div>
          </div>
          <div class="team-score-num${team.score >= 45 ? ' near-win' : ''}">${team.score}<span class="score-max">/50</span></div>
        </div>
        <div class="progress" style="margin:6px 0 10px">
          <div class="progress-bar" style="width:${pct}%;background:${barClr}"></div>
        </div>
        ${teamPlayers.map(p => {
          const history = p.history || [];
          const isCurrent = p.name === currentName;
          return `
            <div class="team-player-row${isCurrent ? ' active-player' : ''}">
              <div class="avatar sm" style="background:${teamColor};flex-shrink:0">${esc(p.name[0].toUpperCase())}</div>
              <div class="player-row-body">
                <div class="player-row-top">
                  <span class="fw500">${esc(p.name)}</span>
                  ${isCurrent ? '<span class="now-tag">← maintenant</span>' : ''}
                </div>
                ${history.length > 0 ? `
                  <div class="history-chips">
                    ${history.map(s => `<span class="hchip${s === 0 ? ' miss' : s >= 8 ? ' high' : ''}">${s === 0 ? '✗' : s}</span>`).join('')}
                  </div>` : ''}
              </div>
            </div>`;
        }).join('')}
      </div>`;
  }).join('');
}

function winnerOverlay(winner) {
  return `
    <div class="overlay" onclick="this.remove()">
      <div class="winner-card" onclick="event.stopPropagation()">
        <div class="trophy">🏆</div>
        <h2>${esc(winner.name)} gagne !</h2>
        <p class="winner-sub">${
          winner.reason === 'score'
            ? "L'équipe atteint exactement 50 points !"
            : "L'équipe adverse est éliminée après 3 ratés consécutifs !"
        }</p>
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

  const { players, turnOrder, currentTurn, absoluteTurn, teams } = gameState;
  const activeTurn = getActiveTurn(players, teams, turnOrder, currentTurn);
  if (!activeTurn) return;

  // Update player history
  const newPlayers = players.map(p =>
    p.name === activeTurn.name
      ? { ...p, history: [...(p.history || []), pendingScore] }
      : { ...p }
  );

  // Update team score / misses
  const newTeams = { team1: { ...teams.team1 }, team2: { ...teams.team2 } };
  const currentTeamId = activeTurn.player.team;
  const team     = newTeams[currentTeamId];
  const teamName = currentTeamId === 'team1' ? 'Équipe 1' : 'Équipe 2';

  if (pendingScore === 0) {
    team.misses += 1;
    if (team.misses >= 3) showToast(`${teamName} éliminée après 3 ratés !`);
  } else {
    team.misses  = 0;
    team.score  += pendingScore;
    if (team.score > 50) {
      team.score = 25;
      showToast(`${teamName} dépasse 50 → retour à 25 !`);
    }
  }

  let winner = null;
  if (team.score === 50) {
    winner = { name: teamName, team: currentTeamId, reason: 'score' };
  } else if (newTeams.team1.misses >= 3) {
    winner = { name: 'Équipe 2', team: 'team2', reason: 'elim' };
  } else if (newTeams.team2.misses >= 3) {
    winner = { name: 'Équipe 1', team: 'team1', reason: 'elim' };
  }

  // Advance to next player whose team is not eliminated
  let nextTurn = activeTurn.turn + 1;
  for (let i = 0; i < turnOrder.length; i++) {
    const p = newPlayers.find(pl => pl.name === turnOrder[nextTurn % turnOrder.length]);
    if (p && newTeams[p.team].misses < 3) break;
    nextTurn++;
  }

  socket.emit('update-game', {
    gameId,
    state: {
      ...gameState,
      players:      newPlayers,
      teams:        newTeams,
      currentTurn:  nextTurn,
      absoluteTurn: (absoluteTurn || 0) + 1,
      winner,
    },
  });
}

function toggleQR() {
  document.getElementById('qrPanel')?.classList.toggle('hidden');
}

// =====================================================================
// HELPERS
// =====================================================================

function getActiveTurn(players, teams, turnOrder, currentTurn) {
  for (let i = 0; i < turnOrder.length * 2; i++) {
    const idx  = (currentTurn + i) % turnOrder.length;
    const name = turnOrder[idx];
    const p    = players.find(pl => pl.name === name);
    if (p && teams[p.team] && teams[p.team].misses < 3) {
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
