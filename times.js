import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";

// --- 1. FUNÇÕES DE SUPORTE E MODAIS ---
window.abrirModal = (id) => { const el = document.getElementById(id); if (el) el.style.display = "flex"; };
window.fecharModal = (id) => { const el = document.getElementById(id); if (el) el.style.display = "none"; };

// FUNÇÃO ESSENCIAL: Recuperada para evitar erro de ReferenceError
function formatarNome(n) { 
    if (!n) return "";
    return n.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); 
}

const docTimesRef = doc(db, "sistema", "montador_times");
const docBancoRef = doc(db, "sistema", "banco_notas");

let players = []; 
let teams = []; 
let fase = "rating"; 
let bancoPermanente = {};
let vinculosTemporarios = {}; 
let modosPendentes = {};
let notaTipoAtiva = "notaTodes"; 

// --- FUNÇÃO CRÍTICA: RESOLVER NOTA ATUALIZADA DO BANCO ---
// Esta função garante que o balanceador sempre use a nota mais recente do Banco de Dados
function resolverNotaReal(p, tipoNota) {
    const doBanco = bancoPermanente[p.nome];
    if (doBanco) {
        // Prioriza nota do banco permanente
        return Number(doBanco[tipoNota] || doBanco.level || 3);
    }
    // Fallback para nota da sessão (jogadores novos ainda não salvos no banco)
    return Number(p[tipoNota] || p.level || 3);
}

// --- 2. SINCRONIZAÇÃO EM TEMPO REAL ---
function ordenarJogadoresTime(jogadores) {
    return jogadores.sort((a, b) => {
        if (a.locked && !b.locked) return -1;
        if (!a.locked && b.locked) return 1;
        return 0;
    });
}

auth.onAuthStateChanged((user) => {
    if (user) {
        onSnapshot(docBancoRef, (snap) => { 
            if (snap.exists()) {
                bancoPermanente = snap.data(); 
                // Sempre que o banco mudar, re-renderizamos para garantir notas frescas na tela
                atualizarUI();
            }
            
            onSnapshot(docTimesRef, (snapTimes) => {
                if (snapTimes.exists()) { 
                    const d = snapTimes.data(); 
                    players = d.players || []; 
                    teams = d.teams || []; 
                    fase = d.fase || "rating"; 
                    notaTipoAtiva = d.notaTipoAtiva || "notaTodes";
                } 
                const spinner = document.getElementById("loadingSpinner");
                if(spinner) spinner.style.display = "none";
                atualizarUI();
            });
        });
        inicializarEventosTimes();
    } else { window.location.href = "login.html"; }
});

async function salvarFirebase() { 
    if (!auth.currentUser) return;
    try {
        await setDoc(docTimesRef, { players, teams, fase, notaTipoAtiva }); 
    } catch (error) {
        console.error("Erro ao salvar no Firebase:", error);
    }
}

// --- 3. LOGICA DE TRANSIÇÃO DE TELAS (UI) ---
function atualizarUI() {
    const aR = document.getElementById("areaRating"), 
          aT = document.getElementById("areaTeams"), 
          aC = document.getElementById("areaConfigTimes"), 
          aA = document.getElementById("areaAcoesFinal");
    
    if (!aR || !aT || !aC || !aA) return;

    if ((!players || players.length === 0) && teams.length === 0) {
        aR.style.display = "none"; aT.style.display = "none"; aC.style.display = "none"; aA.style.display = "none";
        return;
    }

    const pendentes = players.filter(p => !bancoPermanente[p.nome]);

    if (pendentes.length > 0 && fase === "rating") {
        aR.style.display = "block"; aC.style.display = "none"; aT.style.display = "none"; aA.style.display = "none";
        renderRatingList(pendentes);
    } else {
        aR.style.display = "none"; aC.style.display = "flex"; aA.style.display = "flex";
        document.querySelectorAll('.nota-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.tipo === notaTipoAtiva);
        });
        if (fase === "teams" && teams.length > 0) { aT.style.display = "block"; renderTeams(); }
        else { aT.style.display = "none"; }
    }
}

// --- 4. TELA DE RATING (NOVOS JOGADORES / VÍNCULOS) ---
function renderRatingList(pendentes) {
    const cont = document.getElementById("areaRating");
    cont.innerHTML = '<p class="label-instrucao">Nomes novos detectados. Cadastre as notas ou vincule a alguém que já existe no banco:</p>';
    
    pendentes.forEach(p => {
        const div = document.createElement("div");
        div.className = "item-compra item-rating-pendente";
        div.id = `card-${p.id}`;
        div.style.flexDirection = "column"; div.style.alignItems = "stretch"; div.style.padding = "15px"; div.style.gap = "12px";
        
        const nomeVinculado = vinculosTemporarios[p.id];
        const modoAtual = modosPendentes[p.id] || "novo";

        let htmlInterno = `
            <div class="row-between">
                <span style="font-weight:bold; font-size: 16px;">${p.nome}</span>
                <span style="font-size: 11px; color: #94a3b8; font-weight: 600;">${nomeVinculado ? 'vinculado' : 'Sem vínculo'}</span>
            </div>
            <div style="display:flex; gap:16px; align-items:center; font-size:12px; color:var(--text-muted);">
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                    <input type="radio" name="modo-${p.id}" ${modoAtual === "novo" ? "checked" : ""} onchange="window.setModoPendente('${p.id}', 'novo')">
                    Novo cadastro
                </label>
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                    <input type="radio" name="modo-${p.id}" ${modoAtual === "vincular" ? "checked" : ""} onchange="window.setModoPendente('${p.id}', 'vincular')">
                    Vincular
                </label>
            </div>
        `;

        if (nomeVinculado) {
            htmlInterno += `
                <div style="background: #ecfdf5; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="color: #047857; font-weight: 800; font-size: 13px;">✅ VINCULANDO A: ${nomeVinculado}</div>
                    <button onclick="window.cancelarVinculo('${p.id}')" style="background:none; border:none; color:#999; font-size:10px; text-decoration:underline; cursor:pointer; margin-top:5px;">Desfazer vínculo</button>
                </div>
            `;
        } else if (modoAtual === "vincular") {
            htmlInterno += `
                <div class="vincular-container" id="vinc-cont-${p.id}" style="background: rgba(0,0,0,0.03); padding: 10px; border-radius: 8px;">
                    <label style="font-size: 10px; font-weight: bold; color: var(--text-muted); display: block; margin-bottom: 5px;">BUSCAR NO BANCO PARA VINCULAR:</label>
                    <input type="text" class="input-modal" style="margin-bottom: 0; flex: 1; font-size: 13px; padding: 10px; border: 1px solid #ddd;" placeholder="Digite o nome correto aqui..." oninput="window.buscarParaVincular('${p.id}', this.value)">
                    <div id="results-${p.id}" class="vincular-results" style="margin-top: 5px; max-height: 150px; overflow-y: auto; display: none; border: 1px solid #ddd; border-radius: 6px; background: white; box-shadow: 0 4px 10px rgba(0,0,0,0.1);"></div>
                </div>
            `;
        } else {
            htmlInterno += `
                <div class="new-player-rating-grid">
                    <div class="rating-field"><label>TODES</label>
                        <div class="qty-controls rating-stepper">
                            <button class="btn-qty" onclick="window.changePlayerNotaLocal('${p.id}', 'notaTodes', -1)">-</button>
                            <span class="level-num" id="ntodes-${p.id}">${p.notaTodes || 3}</span>
                            <button class="btn-qty" onclick="window.changePlayerNotaLocal('${p.id}', 'notaTodes', 1)">+</button>
                        </div>
                    </div>
                    <div class="rating-field"><label>ELAX</label>
                        <div class="qty-controls rating-stepper">
                            <button class="btn-qty" onclick="window.changePlayerNotaLocal('${p.id}', 'notaElax', -1)">-</button>
                            <span class="level-num" id="nelax-${p.id}">${p.notaElax || 3}</span>
                            <button class="btn-qty" onclick="window.changePlayerNotaLocal('${p.id}', 'notaElax', 1)">+</button>
                        </div>
                    </div>
                    <div class="rating-field allstar-rating-field" id="allstar-rating-${p.id}" style="${p.allStars ? '' : 'display:none;'}"><label>ALL STARS</label>
                        <div class="qty-controls rating-stepper">
                            <button class="btn-qty" onclick="window.changePlayerNotaLocal('${p.id}', 'notaAllStars', -1)">-</button>
                            <span class="level-num" id="nstar-${p.id}">${p.notaAllStars || 3}</span>
                            <button class="btn-qty" onclick="window.changePlayerNotaLocal('${p.id}', 'notaAllStars', 1)">+</button>
                        </div>
                    </div>
                </div>
                <div class="allstar-toggle-row">
                    <input type="checkbox" id="star-${p.id}" ${p.allStars ? 'checked' : ''} onchange="window.setNewAllStarStatus('${p.id}', this.checked)"> 
                    <label for="star-${p.id}">Marcar como All Star ⭐</label>
                </div>
            `;
        }
        div.innerHTML = htmlInterno; cont.appendChild(div);
    });

    const b = document.createElement("button");
    b.className = "btn btn-main"; b.style.marginTop = "15px"; b.innerText = "CONCLUIR E MONTAR TIMES";
    b.onclick = () => window.cadastrarNovosEContinuar();
    cont.appendChild(b);
}

// --- 5. LOGICA DE VÍNCULOS ---
window.setModoPendente = (playerId, modo) => {
    modosPendentes[playerId] = modo;
    if (modo === "novo") {
        delete vinculosTemporarios[playerId];
        const p = players.find(x => x.id === playerId);
        if (p) {
            p.notaTodes = p.notaTodes || 3;
            p.notaElax = p.notaElax || 3;
            p.notaAllStars = p.notaAllStars || 3;
        }
    }
    atualizarUI();
};

window.changePlayerNotaLocal = (playerId, tipo, delta) => {
    const p = players.find(x => x.id === playerId);
    if (p) {
        if (!p[tipo]) p[tipo] = 3;
        p[tipo] = Math.max(1, Math.min(10, p[tipo] + delta));
        const idMap = { 'notaTodes': 'ntodes', 'notaElax': 'nelax', 'notaAllStars': 'nstar' };
        const el = document.getElementById(`${idMap[tipo]}-${playerId}`);
        if(el) el.innerText = p[tipo];
    }
};

window.setNewAllStarStatus = (id, v) => {
    const p = players.find(x => x.id === id);
    if (p) {
        p.allStars = v;
        if (v && !p.notaAllStars) p.notaAllStars = 3;
        const campo = document.getElementById(`allstar-rating-${id}`);
        if (campo) campo.style.display = v ? "" : "none";
    }
};

window.buscarParaVincular = (playerId, query) => {
    const resultsDiv = document.getElementById(`results-${playerId}`);
    if (!query || query.length < 2) { resultsDiv.style.display = "none"; return; }
    const q = query.toLowerCase();
    const matches = Object.keys(bancoPermanente).filter(nome => nome.toLowerCase().includes(q) || (bancoPermanente[nome].apelidos || "").toLowerCase().includes(q)).slice(0, 5);
    if (matches.length > 0) {
        resultsDiv.style.display = "block";
        resultsDiv.innerHTML = matches.map(m => `
            <div class="result-item" style="padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; font-size: 13px; display: flex; justify-content: space-between; align-items: center; background: white;"
                 onclick="window.setVinculoLocal('${playerId}', '${m.replace(/'/g, "\\'")}')">
                <span style="font-weight: 500;">${m} <small style="color: #999;">(T: ${bancoPermanente[m].notaTodes || bancoPermanente[m].level || 3})</small></span>
                <span style="color: #059669; font-weight: 800; font-size: 10px;">SELECIONAR</span>
            </div>
        `).join('');
    } else { resultsDiv.style.display = "none"; }
};

window.setVinculoLocal = (playerId, nomeOficial) => { vinculosTemporarios[playerId] = nomeOficial; modosPendentes[playerId] = "vincular"; atualizarUI(); };
window.cancelarVinculo = (playerId) => { delete vinculosTemporarios[playerId]; atualizarUI(); };

window.cadastrarNovosEContinuar = async () => {
    const pendentes = players.filter(p => !bancoPermanente[p.nome]);
    const vinculosSemSelecao = pendentes.filter(p => (modosPendentes[p.id] || "novo") === "vincular" && !vinculosTemporarios[p.id]);
    if (vinculosSemSelecao.length > 0) {
        alert("Selecione um jogador do banco para todos que estiverem marcados como vincular.");
        return;
    }

    let houveAlteracaoNoBanco = false;
    pendentes.forEach(p => {
        const nomeOficial = vinculosTemporarios[p.id];
        if (nomeOficial) {
            const dbRef = bancoPermanente[nomeOficial];
            let apelidos = dbRef.apelidos || "";
            if (!apelidos.toLowerCase().includes(p.nome.toLowerCase())) {
                bancoPermanente[nomeOficial].apelidos = apelidos ? `${apelidos}, ${p.nome}` : p.nome;
                houveAlteracaoNoBanco = true;
            }
            p.nome = nomeOficial;
        } else {
            p.notaTodes = p.notaTodes || 3;
            p.notaElax = p.notaElax || 3;
            p.notaAllStars = p.notaAllStars || 0;
            p.allStars = !!p.allStars;
            bancoPermanente[p.nome] = {
                notaTodes: p.notaTodes,
                notaElax: p.notaElax,
                notaAllStars: p.allStars ? p.notaAllStars : 0,
                allStars: p.allStars,
                apelidos: ""
            };
            houveAlteracaoNoBanco = true;
        }
    });
    if (houveAlteracaoNoBanco) await setDoc(docBancoRef, bancoPermanente);
    vinculosTemporarios = {}; modosPendentes = {}; fase = "teams"; await salvarFirebase();
};

// --- 6. RENDERIZAÇÃO DOS TIMES ---
function renderTeams() {
    const cont = document.getElementById("areaTeams");
    cont.innerHTML = `<p class="label-instrucao">Times sorteados usando nota de <b>${notaTipoAtiva.replace('nota','')}</b>:</p>`;
    
    teams.forEach((team) => {
        // Cálculo da soma buscando sempre no Banco Permanente
        const total = team.players.reduce((acc, p) => acc + resolverNotaReal(p, notaTipoAtiva), 0);
        const sec = document.createElement("div");
        sec.className = "team-section";
        const jogadoresOrdenados = ordenarJogadoresTime([...team.players]);
        const isDefault = /^Time \d+$/i.test(team.nome);
        const cssClass = isDefault ? "is-default" : "is-custom";

        sec.innerHTML = `
            <div class="team-header">
                <input type="text" class="team-title ${cssClass}" value="${team.nome}" 
                    onfocus="window.prepEditTeam(this)" onblur="window.revertEditTeam(this)"
                    onkeydown="window.handleTeamKey(event, this, ${team.id})">
                <div class="team-total">Soma: ${total}</div>
            </div>
            <div class="team-list-drop" data-team-id="${team.id}">
                ${jogadoresOrdenados.map(p => `
                    <div class="item-compra ${p.locked ? 'is-locked' : ''}" data-player-id="${p.id}">
                        <div class="drag-handle">⠿</div>
                        <div class="input-item">${p.nome}${p.allStars ? ' ⭐' : ''}</div>
                        <span class="level-num">${resolverNotaReal(p, notaTipoAtiva)}</span>
                        <button class="btn-lock ${p.locked ? 'locked' : ''}" onclick="window.toggleLock('${p.id}')">${p.locked ? '🔒' : '🔓'}</button>
                    </div>
                `).join('')}
            </div>
        `;
        cont.appendChild(sec);

        new Sortable(sec.querySelector('.team-list-drop'), {
            group: 'teams', animation: 150, handle: '.drag-handle',
            onEnd: async (evt) => {
                if (evt.from === evt.to) return;
                const fromId = parseInt(evt.from.getAttribute('data-team-id'));
                const toId = parseInt(evt.to.getAttribute('data-team-id'));
                const pId = evt.item.getAttribute('data-player-id');
                const fromT = teams.find(t => t.id === fromId);
                const toT = teams.find(t => t.id === toId);
                const pMoved = fromT.players.find(p => p.id === pId);
                const candidates = toT.players.filter(p => !p.locked && p.id !== pId);

                if (candidates.length > 0) {
                    const pNota = resolverNotaReal(pMoved, notaTipoAtiva);
                    candidates.sort((a, b) => Math.abs(resolverNotaReal(a, notaTipoAtiva) - pNota) - Math.abs(resolverNotaReal(b, notaTipoAtiva) - pNota));
                    const pSwap = candidates[0];
                    fromT.players = fromT.players.filter(p => p.id !== pId);
                    toT.players = toT.players.filter(p => p.id !== pSwap.id);
                    toT.players.push(pMoved); fromT.players.push(pSwap);
                    mostrarToastMover(evt.originalEvent.pageX, evt.originalEvent.pageY, `Troca: ${pMoved.nome} ↔ ${pSwap.nome}`);
                } else {
                    fromT.players = fromT.players.filter(p => p.id !== pId);
                    toT.players.push(pMoved);
                }
                fromT.players = ordenarJogadoresTime(fromT.players);
                toT.players = ordenarJogadoresTime(toT.players);
                await salvarFirebase();
            }
        });
    });
}

// --- 7. EVENTOS DE BOTÕES ---
function inicializarEventosTimes() {
    const btnOpenImport = document.getElementById("btnOpenImport");
    if(btnOpenImport) btnOpenImport.onclick = () => window.abrirModal('modalImport');
    const notaSelector = document.getElementById("notaTipoSelector");
    if (notaSelector) {
        notaSelector.onclick = (e) => {
            const opt = e.target.closest('.nota-option');
            if (opt) { notaTipoAtiva = opt.dataset.tipo; salvarFirebase(); }
        };
    }
    const btnConfirmarImport = document.getElementById("btnConfirmarImport");
    if (btnConfirmarImport) {
        btnConfirmarImport.onclick = async () => {
            const texto = document.getElementById("textoTimesBulk").value.trim();
            if (!texto) return;
            players = texto.split('\n').map(linha => {
                const nomeLimpo = linha.replace(/^\d+[\s.-]*/, '').replace(/[✅|✅️]/g, '').trim();
                const nFormatado = formatarNome(nomeLimpo);
                let m = Object.keys(bancoPermanente).find(k => k.toLowerCase() === nFormatado.toLowerCase() || (bancoPermanente[k].apelidos || "").toLowerCase().split(',').map(s=>s.trim()).includes(nFormatado.toLowerCase()));
                const dbP = m ? bancoPermanente[m] : null;
                return {
                    id: "p-" + Math.random().toString(36).substr(2, 9),
                    nome: m || nFormatado,
                    notaTodes: dbP ? (dbP.notaTodes || dbP.level || 3) : 3,
                    notaElax: dbP ? (dbP.notaElax || 3) : 3,
                    notaAllStars: dbP ? (dbP.notaAllStars || 0) : 0,
                    allStars: dbP ? !!dbP.allStars : false,
                    locked: false
                };
            }).filter(p => p.nome.length > 1);
            teams = []; fase = "rating"; await salvarFirebase(); window.fecharModal('modalImport');
        };
    }
    document.getElementById("btnGerarTimes").onclick = async () => {
        const nTeams = parseInt(document.getElementById("qtdTimes").value);
        let todos = (teams.length > 0) ? teams.flatMap(t => t.players) : [...players];
        if (!todos.length) return;
        let nTA = Array.from({ length: nTeams }, (_, i) => ({ id: i, nome: (teams[i] && teams[i].nome) ? teams[i].nome : `Time ${i + 1}`, players: [] }));
        let livres = [];
        todos.forEach(p => {
            if (p.locked) {
                const tOrig = teams.find(t => t.players.some(tp => tp.id === p.id));
                if (tOrig && tOrig.id < nTeams) nTA[tOrig.id].players.push(p);
                else { p.locked = false; livres.push(p); }
            } else livres.push(p);
        });
        livres.sort((a, b) => resolverNotaReal(b, notaTipoAtiva) - resolverNotaReal(a, notaTipoAtiva));
        livres.forEach(p => {
            nTA.sort((a, b) => a.players.reduce((s, x) => s + resolverNotaReal(x, notaTipoAtiva), 0) - b.players.reduce((s, x) => s + resolverNotaReal(x, notaTipoAtiva), 0));
            nTA[0].players.push(p);
        });
        teams = nTA.map(t => ({ ...t, players: ordenarJogadoresTime(t.players) })).sort((a, b) => a.id - b.id);
        fase = "teams"; await salvarFirebase();
    };
    document.getElementById("btnLimpar").onclick = async () => { if(confirm("Limpar?")) { players = []; teams = []; fase = "rating"; await salvarFirebase(); }};
    document.getElementById("btnCopyTimes").onclick = () => {
        let txt = "⭐ *TIMES QUEERIDAS* ⭐\n\n";
        teams.forEach(t => { txt += `*${t.nome.toUpperCase()}*\n`; t.players.forEach(p => txt += `- ${p.nome}\n`); txt += `\n`; });
        navigator.clipboard.writeText(txt); alert("Copiado!");
    };
}

window.toggleLock = async (pId) => {
    teams.forEach(t => {
        const p = t.players.find(px => px.id === pId);
        if(p) { p.locked = !p.locked; t.players = ordenarJogadoresTime(t.players); }
    });
    await salvarFirebase();
};

window.prepEditTeam = (el) => { el.dataset.original = el.value; el.value = ""; };
window.revertEditTeam = (el) => { setTimeout(() => { if (el.dataset.original !== undefined) { el.value = el.dataset.original; delete el.dataset.original; } }, 150); };
window.handleTeamKey = (e, el, teamId) => { if (e.key === "Enter") { const novoNome = el.value.trim(); if (novoNome !== "") { delete el.dataset.original; window.updateTeamName(teamId, novoNome); el.blur(); } else { el.blur(); } } };
window.updateTeamName = (id, val) => { const t = teams.find(x => x.id === id); if(t) { t.nome = val; salvarFirebase(); } };

function mostrarToastMover(x, y, texto) {
    const toast = document.createElement('div');
    toast.className = 'toast-copiado';
    toast.innerText = texto;
    toast.style.position = 'fixed';
    toast.style.left = `${x}px`; toast.style.top = `${y}px`;
    toast.style.zIndex = '10000';
    toast.style.backgroundColor = 'rgba(0,0,0,0.8)';
    document.body.appendChild(toast);
    setTimeout(() => { if(toast) toast.remove(); }, 1500);
}
