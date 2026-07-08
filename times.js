// CHAVE ÚNICA PARA O STORAGE
const STORAGE_KEY = "volei_queeridas_times_v1";

// Tenta carregar do LocalStorage ou inicia vazio
let db_times = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
    players: [],
    teams: [],
    fase: "rating" 
};

let players = db_times.players;
let teams = db_times.teams;

function abrirModal(id) { document.getElementById(id).style.display = "flex"; }
function fecharModal(id) { document.getElementById(id).style.display = "none"; }

// SALVAR NO NAVEGADOR
function salvar() {
    db_times.players = players;
    db_times.teams = teams;
    db_times.fase = document.getElementById("areaTeams").style.display === "block" ? "teams" : "rating";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db_times));
}

function processarLinha(linha) {
    const levelMatch = linha.match(/[✅|✅️]?\s*([1-5])$/);
    let level = 3;
    let nomeLimpo = linha;
    if (levelMatch) {
        level = parseInt(levelMatch[1]);
        nomeLimpo = linha.replace(/\s*[1-5]$/, '');
    }
    nomeLimpo = nomeLimpo.replace(/^\d+[\s.-]*/, '').replace(/[✅|✅️]/g, '').trim();
    return { nome: formatarNome(nomeLimpo), level: level };
}

function formatarNome(nome) {
    if (!nome) return "";
    return nome.toLowerCase().split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

function mostrarToast(text, x, y) {
    const toast = document.createElement('div');
    toast.className = `toast-copiado`;
    toast.innerText = text;
    toast.style.left = `${x}px`;
    toast.style.top = `${y}px`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1000);
}

document.getElementById("btnOpenImport").onclick = () => abrirModal('modalImport');

document.getElementById("btnConfirmarImport").onclick = () => {
    const texto = document.getElementById("textoTimesBulk").value.trim();
    if (texto) {
        players = texto.split('\n')
            .map(l => processarLinha(l))
            .filter(obj => obj.nome.length > 2)
            .map(obj => ({ 
                id: "p-" + Math.random().toString(36).substr(2, 9), 
                nome: obj.nome, 
                level: obj.level,
                locked: false 
            }));
        
        teams = []; 
        document.getElementById("areaConfigTimes").style.display = "flex";
        document.getElementById("areaAcoesFinal").style.display = "flex";
        document.getElementById("areaRating").style.display = "block";
        document.getElementById("areaTeams").style.display = "none";
        document.getElementById("btnGerarTimes").innerText = "MONTAR TIMES";
        salvar();
        renderRatingList();
    }
    fecharModal('modalImport');
    document.getElementById("textoTimesBulk").value = "";
};

function renderRatingList() {
    const container = document.getElementById("areaRating");
    container.innerHTML = players.length > 0 ? '<p class="label-instrucao">Ajuste o nível se necessário:</p>' : '';
    players.forEach(p => {
        const div = document.createElement("div");
        div.className = "item-compra";
        div.innerHTML = `
            <div class="drag-handle">⠿</div>
            <div class="input-item">${p.nome}</div>
            <div class="qty-controls">
                <button class="btn-qty" onclick="changeLevel('${p.id}', -1)">-</button>
                <span class="level-num">${p.level}</span>
                <button class="btn-qty" onclick="changeLevel('${p.id}', 1)">+</button>
            </div>
        `;
        container.appendChild(div);
    });
}

window.changeLevel = (id, delta) => {
    const p = players.find(x => x.id === id);
    if (p) {
        p.level = Math.max(1, Math.min(5, p.level + delta));
        salvar();
        renderRatingList();
    }
}

window.changeLevelInTeam = (id, delta) => {
    const pMaster = players.find(x => x.id === id);
    if (pMaster) pMaster.level = Math.max(1, Math.min(5, pMaster.level + delta));
    
    teams.forEach(t => {
        const pTeam = t.players.find(x => x.id === id);
        if (pTeam) pTeam.level = Math.max(1, Math.min(5, pTeam.level + delta));
    });
    
    salvar();
    renderTeams();
}

document.getElementById("btnGerarTimes").onclick = () => {
    const numTeamsRequired = parseInt(document.getElementById("qtdTimes").value);
    let existingNames = teams.map(t => t.nome);
    
    let lockedPlayers = [];
    if (teams.length > 0) {
        teams.forEach(t => {
            t.players.forEach(p => {
                if (p.locked) lockedPlayers.push({ player: p, teamId: t.id });
            });
        });
    }

    const lockedIds = lockedPlayers.map(lp => lp.player.id);
    const freePlayers = players
        .filter(p => !lockedIds.includes(p.id))
        .sort(() => Math.random() - 0.5); 

    let newTeams = Array.from({ length: numTeamsRequired }, (_, i) => ({
        id: i,
        nome: existingNames[i] || `Time ${i + 1}`,
        players: []
    }));

    lockedPlayers.forEach(lp => {
        if (newTeams[lp.teamId]) {
            newTeams[lp.teamId].players.push(lp.player);
        } else {
            lp.player.locked = false;
            freePlayers.push(lp.player);
        }
    });

    const sortedFree = freePlayers.sort((a, b) => b.level - a.level);
    
    sortedFree.forEach(p => {
        newTeams.sort((a, b) => {
            const sumA = a.players.reduce((acc, pl) => acc + pl.level, 0);
            const sumB = b.players.reduce((acc, pl) => acc + pl.level, 0);
            return sumA - sumB;
        });
        newTeams[0].players.push(p);
    });

    newTeams.sort((a, b) => a.id - b.id);
    teams = newTeams;

    document.getElementById("areaRating").style.display = "none";
    document.getElementById("areaTeams").style.display = "block";
    document.getElementById("btnGerarTimes").innerText = "SORTEAR NOVAMENTE";
    salvar();
    renderTeams();
};

function renderTeams() {
    const container = document.getElementById("areaTeams");
    if (!container) return;
    container.innerHTML = `<p class="label-instrucao">Times equilibrados (Arraste ou Fixe):</p>`;
    
    teams.forEach(team => {
        const total = team.players.reduce((acc, p) => acc + p.level, 0);
        const section = document.createElement("div");
        section.className = "team-section";
        section.innerHTML = `
            <div class="team-header">
                <input type="text" class="team-title" value="${team.nome}" onblur="updateTeamName(${team.id}, this.value)">
                <div class="team-total">Soma: ${total}</div>
            </div>
            <div class="team-list-drop" data-team-index="${team.id}">
                ${team.players.map(p => `
                    <div class="item-compra ${p.locked ? 'is-locked' : ''}" data-player-id="${p.id}">
                        <div class="drag-handle">⠿</div>
                        <div class="input-item">${p.nome}</div>
                        <div class="qty-controls mini">
                            <button class="btn-qty" onclick="changeLevelInTeam('${p.id}', -1)">-</button>
                            <span class="level-num">${p.level}</span>
                            <button class="btn-qty" onclick="changeLevelInTeam('${p.id}', 1)">+</button>
                        </div>
                        <button class="btn-lock ${p.locked ? 'locked' : ''}" onclick="toggleLock('${p.id}', event)">
                            ${p.locked ? '🔒' : '🔓'}
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(section);

        new Sortable(section.querySelector('.team-list-drop'), {
            group: 'teams',
            animation: 150,
            onEnd: (evt) => {
                if (evt.from === evt.to) return; 

                const fromIdx = parseInt(evt.from.getAttribute('data-team-index'));
                const toIdx = parseInt(evt.to.getAttribute('data-team-index'));
                const playerId = evt.item.getAttribute('data-player-id');

                const teamFrom = teams.find(t => t.id === fromIdx);
                const teamTo = teams.find(t => t.id === toIdx);
                const pMoved = teamFrom.players.find(p => p.id === playerId);

                const candidates = teamTo.players.filter(p => !p.locked && p.id !== playerId);

                if (candidates.length > 0) {
                    candidates.sort((a, b) => Math.abs(a.level - pMoved.level) - Math.abs(b.level - pMoved.level));
                    const pSwap = candidates[0];

                    teamFrom.players = teamFrom.players.filter(p => p.id !== playerId);
                    teamTo.players.splice(evt.newIndex, 0, pMoved); 
                    teamTo.players = teamTo.players.filter(p => p.id !== pSwap.id);
                    teamFrom.players.push(pSwap);

                    mostrarToast(`Troca: ${pSwap.nome} ⇄ ${pMoved.nome}`, evt.originalEvent.clientX, evt.originalEvent.clientY);
                } else {
                    teamFrom.players = teamFrom.players.filter(p => p.id !== playerId);
                    teamTo.players.splice(evt.newIndex, 0, pMoved);
                }
                
                salvar();
                renderTeams();
            }
        });
    });
}

window.toggleLock = (playerId, event) => {
    let player;
    teams.forEach(t => {
        const found = t.players.find(p => p.id === playerId);
        if (found) player = found;
    });

    if (player) {
        player.locked = !player.locked;
        const msg = player.locked ? "Fixado" : "Liberado";
        mostrarToast(msg, event.clientX, event.clientY);
        salvar();
        renderTeams();
    }
};

window.updateTeamName = (id, val) => {
    const t = teams.find(x => x.id === id);
    if(t) {
        t.nome = val;
        salvar();
    }
};

document.getElementById("btnCopyTimes").onclick = (e) => {
    let texto = "";
    teams.forEach((t, index) => {
        texto += `*Time ${t.nome}*\n`;
        t.players.forEach(p => {
            texto += `- ${p.nome}\n`;
        });
        if(index < teams.length - 1) texto += `\n`;
    });

    navigator.clipboard.writeText(texto).then(() => {
        mostrarToast('Copiado!', e.clientX, e.clientY);
    });
};

document.getElementById("btnLimpar").onclick = () => {
    if(confirm("Apagar tudo?")) {
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    }
};

// --- CARREGAMENTO INICIAL (PARA NÃO PERDER O F5) ---
window.onload = () => {
    if (players && players.length > 0) {
        document.getElementById("areaConfigTimes").style.display = "flex";
        document.getElementById("areaAcoesFinal").style.display = "flex";
        
        if (db_times.fase === "teams" && teams && teams.length > 0) {
            document.getElementById("areaRating").style.display = "none";
            document.getElementById("areaTeams").style.display = "block";
            document.getElementById("btnGerarTimes").innerText = "SORTEAR NOVAMENTE";
            renderTeams();
        } else {
            renderRatingList();
        }
    }
};