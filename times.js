import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";

// --- 1. FUNÇÕES DE MODAL GLOBAIS ---
window.abrirModal = (id) => { 
    const el = document.getElementById(id);
    if (el) el.style.display = "flex"; 
};
window.fecharModal = (id) => { 
    const el = document.getElementById(id);
    if (el) el.style.display = "none"; 
};

const docTimesRef = doc(db, "sistema", "montador_times");
const docBancoRef = doc(db, "sistema", "banco_notas");

let players = []; 
let teams = [];   
let fase = "rating";
let bancoPermanente = {};

// --- 2. INICIALIZAÇÃO ---
auth.onAuthStateChanged((user) => {
    if (user) {
        onSnapshot(docBancoRef, (snap) => { 
            if (snap.exists()) {
                bancoPermanente = snap.data(); 
                atualizarUI();
            }
        });
        onSnapshot(docTimesRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                players = data.players || [];
                teams = data.teams || [];
                fase = data.fase || "rating";
            } else {
                players = []; teams = []; fase = "rating";
            }
            atualizarUI();
        });
        inicializarEventosTimes();
    } else {
        window.location.href = "login.html";
    }
});

async function salvarFirebase() {
    if (!auth.currentUser) return;
    try { await setDoc(docTimesRef, { players, teams, fase }); } catch(e) {}
}

function atualizarUI() {
    const aRating = document.getElementById("areaRating");
    const aTeams = document.getElementById("areaTeams");
    const aCfgTimes = document.getElementById("areaConfigTimes");
    const aAcoesFinal = document.getElementById("areaAcoesFinal");

    if (!players || players.length === 0) {
        if (aRating) { aRating.innerHTML = ""; aRating.style.display = "none"; }
        if (aTeams) { aTeams.innerHTML = ""; aTeams.style.display = "none"; }
        if (aCfgTimes) aCfgTimes.style.display = "none";
        if (aAcoesFinal) aAcoesFinal.style.display = "none";
        return;
    }

    // Jogadores que ainda não foram vinculados a um nome exato do banco
    const pendentes = players.filter(p => !bancoPermanente[p.nome]);

    if (pendentes.length > 0) {
        if (aCfgTimes) aCfgTimes.style.display = "none";
        if (aAcoesFinal) aAcoesFinal.style.display = "none";
        if (aRating) aRating.style.display = "block";
        if (aTeams) { aTeams.innerHTML = ""; aTeams.style.display = "none"; }
        renderRatingList();
    } else {
        if (aCfgTimes) aCfgTimes.style.display = "flex";
        if (aAcoesFinal) aAcoesFinal.style.display = "flex";
        if (aRating) { aRating.innerHTML = ""; aRating.style.display = "none"; }
        
        if (fase === "teams" && teams.length > 0) {
            if (aTeams) aTeams.style.display = "block";
            renderTeams();
        } else {
            if (aTeams) { aTeams.innerHTML = ""; aTeams.style.display = "none"; }
        }
    }
}

// --- 3. RENDERERS ---

function renderRatingList() {
    const container = document.getElementById("areaRating");
    if (!container) return;
    
    const pendentes = players.filter(p => !bancoPermanente[p.nome]);
    container.innerHTML = '<p class="label-instrucao">Há nomes não reconhecidos. Vincule ou Cadastre:</p>';
    
    pendentes.forEach(p => {
        const candidatos = encontrarCandidatosFuzzy(p.nome, bancoPermanente);
        const div = document.createElement("div");
        div.className = "item-compra";
        div.style.flexDirection = "column";
        div.style.alignItems = "stretch";
        div.style.padding = "15px";

        let htmlSugestoes = "";
        if (candidatos.length > 0) {
            htmlSugestoes = `
                <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(0,0,0,0.05);">
                    <label style="font-size:10px; font-weight:bold; opacity:0.5;">VINCULAR A EXISTENTE:</label>
                    <select class="input-modal" style="margin-top:5px; font-size:12px;" onchange="window.vincularJogador('${p.id}', this.value)">
                        <option value="">-- Selecionar jogador do banco --</option>
                        ${candidatos.map(c => `<option value="${c}">${c} (Nota ${bancoPermanente[c].level || bancoPermanente[c]})</option>`).join('')}
                    </select>
                </div>
            `;
        }

        div.innerHTML = `
            <div class="row-between">
                <span style="font-weight:bold; color:var(--primary)">${p.nome}</span>
                <div class="qty-controls mini">
                    <button class="btn-qty" onclick="window.changeNewPlayerLevel('${p.id}', -1)">-</button>
                    <span class="level-num">${p.level || 3}</span>
                    <button class="btn-qty" onclick="window.changeNewPlayerLevel('${p.id}', 1)">+</button>
                </div>
            </div>
            ${htmlSugestoes}
            <div style="margin-top:10px; font-size:11px; display:flex; align-items:center; gap:10px;">
                <label><input type="checkbox" id="as-${p.id}" ${p.allStars ? 'checked' : ''} onchange="window.setNewAllStar('${p.id}', this.checked)"> Marcar como All Star ⭐</label>
            </div>
        `;
        container.appendChild(div);
    });
    
    const btnCadastrar = document.createElement("button");
    btnCadastrar.className = "btn btn-main";
    btnCadastrar.style.marginTop = "20px";
    btnCadastrar.style.background = "var(--color-praia)";
    btnCadastrar.innerText = "CADASTRAR NOVOS E CONTINUAR";
    btnCadastrar.onclick = () => window.cadastrarNovosEContinuar();
    container.appendChild(btnCadastrar);
}

// --- 4. LÓGICA DE VÍNCULO E FUZZY ---

function encontrarCandidatosFuzzy(nomeImportado, banco) {
    const normalizar = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const nomeLimp = normalizar(nomeImportado);
    if (!nomeLimp) return [];

    const chaves = Object.keys(banco);
    const palavrasImp = nomeLimp.split(/\s+/);

    // Retorna todos os nomes que contenham pelo menos a primeira palavra do que foi colado
    return chaves.filter(chave => {
        const nomeBancoLimp = normalizar(chave);
        return palavrasImp.every(palavra => nomeBancoLimp.includes(palavra));
    });
}

window.vincularJogador = async (playerId, nomeNoBanco) => {
    if (!nomeNoBanco) return;
    const p = players.find(x => x.id === playerId);
    if (p) {
        const info = bancoPermanente[nomeNoBanco];
        p.nome = nomeNoBanco; // Atualiza o nome para o nome completo do banco
        p.level = info && typeof info === "object" ? info.level : (Number(info) || 3);
        p.allStars = info && typeof info === "object" ? !!info.allStars : false;
        await salvarFirebase();
        atualizarUI();
    }
};

window.changeNewPlayerLevel = (id, delta) => {
    const p = players.find(x => x.id === id);
    if (p) {
        p.level = Math.max(1, Math.min(10, (p.level || 3) + delta));
        renderRatingList();
    }
};

window.setNewAllStar = (id, val) => {
    const p = players.find(x => x.id === id);
    if (p) p.allStars = val;
};

window.cadastrarNovosEContinuar = async () => {
    // Apenas quem ainda não está no banco (os novos de fato)
    const pendentes = players.filter(p => !bancoPermanente[p.nome]);
    pendentes.forEach(p => {
        bancoPermanente[p.nome] = { level: p.level || 3, allStars: !!p.allStars };
    });
    try {
        await setDoc(docBancoRef, bancoPermanente);
        await salvarFirebase();
        mostrarToast("Novos jogadores cadastrados!", window.innerWidth/2, 100);
    } catch (e) { alert("Erro ao salvar."); }
};

// --- 5. RENDER TIMES E OUTROS ---

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
                <input type="text" class="team-title" value="${team.nome}" onblur="window.updateTeamName(${team.id}, this.value)">
                <div class="team-total">Soma: ${total}</div>
            </div>
            <div class="team-list-drop" data-team-index="${team.id}">
                ${team.players.map(p => `
                    <div class="item-compra ${p.locked ? 'is-locked' : ''}" data-player-id="${p.id}">
                        <div class="drag-handle">⠿</div>
                        <div class="input-item">${p.nome}${p.allStars ? ' ⭐' : ''}</div>
                        <div class="qty-controls mini">
                            <button class="btn-qty" onclick="window.changeLevelInTeam('${p.id}', -1)">-</button>
                            <span class="level-num">${p.level}</span>
                            <button class="btn-qty" onclick="window.changeLevelInTeam('${p.id}', 1)">+</button>
                        </div>
                        <button class="btn-lock ${p.locked ? 'locked' : ''}" onclick="window.toggleLock('${p.id}', event)">
                            ${p.locked ? '🔒' : '🔓'}
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
        container.appendChild(section);

        new Sortable(section.querySelector('.team-list-drop'), {
            group: 'teams', animation: 150,
            onEnd: async (evt) => {
                if (evt.from === evt.to) return; 
                const fromIdx = parseInt(evt.from.getAttribute('data-team-index'));
                const toIdx = parseInt(evt.to.getAttribute('data-team-index'));
                const pId = evt.item.getAttribute('data-player-id');
                const tFrom = teams.find(t => t.id === fromIdx);
                const tTo = teams.find(t => t.id === toIdx);
                const pMoved = tFrom.players.find(p => p.id === pId);
                const candidates = tTo.players.filter(p => !p.locked && p.id !== pId);
                if (candidates.length > 0) {
                    candidates.sort((a, b) => Math.abs(a.level - pMoved.level) - Math.abs(b.level - pMoved.level));
                    const pSwap = candidates[0];
                    tFrom.players = tFrom.players.filter(p => p.id !== pId);
                    tTo.players.splice(evt.newIndex, 0, pMoved); 
                    tTo.players = tTo.players.filter(p => p.id !== pSwap.id);
                    tFrom.players.push(pSwap);
                } else {
                    tFrom.players = tFrom.players.filter(p => p.id !== pId);
                    tTo.players.splice(evt.newIndex, 0, pMoved);
                }
                await salvarFirebase();
            }
        });
    });
}

function processarLinha(linha) {
    const levelMatch = linha.match(/[✅|✅️]?\s*([1-9]|10)$/);
    let level = 3;
    let nomeLimpo = linha.replace(/^\d+[\s.-]*/, '').replace(/[✅|✅️]/g, '').trim();
    if (levelMatch) {
        level = parseInt(levelMatch[1]);
        nomeLimpo = nomeLimpo.replace(/\s*([1-9]|10)$/, '').trim();
    }
    return { nome: formatarNome(nomeLimpo), level: level };
}

function mostrarToast(text, x, y) {
    const toast = document.createElement('div');
    toast.className = `toast-copiado`;
    toast.innerText = text;
    toast.style.left = `${x}px`; toast.style.top = `${y}px`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1000);
}

window.changeLevelInTeam = async (id, delta) => {
    const pMaster = players.find(x => x.id === id);
    if (pMaster) {
        pMaster.level = Math.max(1, Math.min(10, pMaster.level + delta));
        if(bancoPermanente[pMaster.nome]) {
            bancoPermanente[pMaster.nome].level = pMaster.level;
            await setDoc(docBancoRef, bancoPermanente);
        }
    }
    teams.forEach(t => {
        const pTeam = t.players.find(x => x.id === id);
        if (pTeam) pTeam.level = Math.max(1, Math.min(10, pTeam.level + delta));
    });
    await salvarFirebase();
};

window.toggleLock = async (playerId, event) => {
    let player;
    players.forEach(p => { if(p.id === playerId) player = p; });
    if(!player) teams.forEach(t => { const f = t.players.find(p => p.id === playerId); if(f) player = f; });
    if (player) {
        player.locked = !player.locked;
        mostrarToast(player.locked ? "Fixado" : "Liberado", event.clientX, event.clientY);
        await salvarFirebase();
    }
};

window.updateTeamName = async (id, val) => {
    const t = teams.find(x => x.id === id);
    if(t) { t.nome = val; await salvarFirebase(); }
};

function inicializarEventosTimes() {
    document.getElementById("btnOpenImport").onclick = () => window.abrirModal('modalImport');
    document.getElementById("btnConfirmarImport").onclick = async () => {
        const texto = document.getElementById("textoTimesBulk").value.trim();
        if (texto) {
            players = texto.split('\n').map(l => {
                const proc = processarLinha(l);
                // Busca se já existe um match perfeito no banco
                const matchExato = Object.keys(bancoPermanente).find(k => k.toLowerCase() === proc.nome.toLowerCase());
                
                return {
                    id: "p-" + Math.random().toString(36).substr(2, 9),
                    nome: matchExato || proc.nome,
                    level: matchExato ? (bancoPermanente[matchExato].level || bancoPermanente[matchExato]) : proc.level,
                    allStars: matchExato ? !!bancoPermanente[matchExato].allStars : false,
                    locked: false
                };
            }).filter(p => p.nome.length > 1);
            teams = []; fase = "rating"; await salvarFirebase();
        }
        window.fecharModal('modalImport');
    };

    document.getElementById("btnGerarTimes").onclick = async () => {
        const nTeams = parseInt(document.getElementById("qtdTimes").value);
        let exNames = teams.map(t => t.nome);
        let locked = [];
        teams.forEach(t => { t.players.forEach(p => { if (p.locked) locked.push({ player: p, teamId: t.id }); }); });
        let free = players.filter(p => !locked.some(l => l.player.id === p.id)).sort(() => Math.random() - 0.5); 
        let nTeamsArr = Array.from({ length: nTeams }, (_, i) => ({ id: i, nome: exNames[i] || `Time ${i + 1}`, players: [] }));
        locked.forEach(l => { if (nTeamsArr[l.teamId]) nTeamsArr[l.teamId].players.push(l.player); else { l.player.locked = false; free.push(l.player); } });
        free.sort((a, b) => b.level - a.level).forEach(p => {
            nTeamsArr.sort((a, b) => a.players.reduce((s, pl) => s + pl.level, 0) - b.players.reduce((s, pl) => s + pl.level, 0));
            nTeamsArr[0].players.push(p);
        });
        teams = nTeamsArr.sort((a, b) => a.id - b.id); fase = "teams"; await salvarFirebase();
    };

    document.getElementById("btnCopyTimes").onclick = (e) => {
        let t = ""; teams.forEach(tm => { t += `*Time ${tm.nome}*\n`; tm.players.forEach(p => { t += `- ${p.nome}\n`; }); t += `\n`; });
        navigator.clipboard.writeText(t).then(() => mostrarToast('Copiado!', e.clientX, e.clientY));
    };

    document.getElementById("btnLimpar").onclick = async () => {
        if(confirm("Apagar tudo na nuvem?")) {
            players = []; teams = []; fase = "rating";
            await salvarFirebase();
        }
    };
}