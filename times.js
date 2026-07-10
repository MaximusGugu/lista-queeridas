import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";

// --- 1. FUNÇÕES DE SUPORTE E MODAIS ---
window.abrirModal = (id) => { const el = document.getElementById(id); if (el) el.style.display = "flex"; };
window.fecharModal = (id) => { const el = document.getElementById(id); if (el) el.style.display = "none"; };

// FUNÇÃO ESSENCIAL: Recuperada para evitar erro de ReferenceError
function formatarNome(n) { 
    if (!n) return "";
    return n.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); 
}

function limparNomeImportado(linha) {
    return (linha || "")
        .replace(/^\s*\d+\s*[-.)]?\s*/, "")
        .replace(/[\u2705\u2713\u2714\u2611\uFE0E\uFE0F]/g, "")
        .replace(/[\u200B-\u200D]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizarBusca(str) {
    return (str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u200B-\u200D\uFE0E\uFE0F]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function encontrarJogadorBanco(nomeDigitado) {
    const nomeLimp = normalizarBusca(nomeDigitado);
    if (!nomeLimp) return null;
    const chaves = Object.keys(bancoPermanente).filter(k => k !== "versao");

    for (const nomeOficial of chaves) {
        const info = bancoPermanente[nomeOficial] || {};
        if (normalizarBusca(nomeOficial) === nomeLimp) return nomeOficial;
        const apelidos = (info.apelidos || "").split(",").map(a => normalizarBusca(a));
        if (apelidos.includes(nomeLimp)) return nomeOficial;
    }

    const candidatos = chaves.filter(nomeOficial => {
        const info = bancoPermanente[nomeOficial] || {};
        const textoBusca = normalizarBusca(`${nomeOficial} ${info.apelidos || ""}`);
        return nomeLimp.split(/\s+/).every(palavra => textoBusca.includes(palavra));
    });
    return candidatos.length === 1 ? candidatos[0] : null;
}

function notaOuPadrao(valor, padrao = 3) {
    if (valor === undefined || valor === null || valor === "") return padrao;
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : padrao;
}

function notaBanco(info, campo, padrao = 3) {
    if (info && info[campo] !== undefined && info[campo] !== null && info[campo] !== "") {
        return notaOuPadrao(info[campo], padrao);
    }
    if (campo === "notaTodes" && info?.level !== undefined && info?.level !== null && info?.level !== "") {
        return notaOuPadrao(info.level, padrao);
    }
    return padrao;
}

function calcularQuantidadeTimesSugerida(totalJogadores) {
    if (totalJogadores <= 0) return 2;
    return Math.max(2, Math.min(5, Math.round(totalJogadores / 7)));
}

function aplicarQuantidadeTimesSugerida() {
    const select = document.getElementById("qtdTimes");
    if (!select) return;
    select.value = String(qtdTimesSugerida || calcularQuantidadeTimesSugerida(players.length));
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
let qtdTimesSugerida = 3;
let autoMontarTimes = false;

// --- FUNÇÃO CRÍTICA: RESOLVER NOTA ATUALIZADA DO BANCO ---
// Esta função garante que o balanceador sempre use a nota mais recente do Banco de Dados
function resolverNotaReal(p, tipoNota) {
    const nomeOficial = encontrarJogadorBanco(p.nome) || p.nome;
    const doBanco = bancoPermanente[nomeOficial];
    if (doBanco) {
        // Prioriza nota do banco permanente
        return notaBanco(doBanco, tipoNota);
    }
    // Fallback para nota da sessão (jogadores novos ainda não salvos no banco)
    return notaBanco(p, tipoNota);
}

// --- 2. SINCRONIZAÇÃO EM TEMPO REAL ---
function ordenarJogadoresTime(jogadores) {
    return jogadores.sort((a, b) => {
        if (a.locked && !b.locked) return -1;
        if (!a.locked && b.locked) return 1;
        return 0;
    });
}

async function montarTimes(nTeams, automatico = false) {
    qtdTimesSugerida = nTeams || calcularQuantidadeTimesSugerida(players.length);
    let todos = (teams.length > 0 && !automatico) ? teams.flatMap(t => t.players) : [...players];
    if (!todos.length) return;
    let nTA = Array.from({ length: qtdTimesSugerida }, (_, i) => ({ id: i, nome: (teams[i] && teams[i].nome && !automatico) ? teams[i].nome : `Time ${i + 1}`, players: [] }));
    let livres = [];
    todos.forEach(p => {
        if (p.locked) {
            const tOrig = teams.find(t => t.players.some(tp => tp.id === p.id));
            if (!automatico && tOrig && tOrig.id < qtdTimesSugerida) nTA[tOrig.id].players.push(p);
            else { p.locked = false; livres.push(p); }
        } else livres.push(p);
    });
    livres.sort((a, b) => resolverNotaReal(b, notaTipoAtiva) - resolverNotaReal(a, notaTipoAtiva));
    livres.forEach(p => {
        nTA.sort((a, b) => a.players.reduce((s, x) => s + resolverNotaReal(x, notaTipoAtiva), 0) - b.players.reduce((s, x) => s + resolverNotaReal(x, notaTipoAtiva), 0));
        nTA[0].players.push(p);
    });
    teams = nTA.map(t => ({ ...t, players: ordenarJogadoresTime(t.players) })).sort((a, b) => a.id - b.id);
    fase = "teams";
    autoMontarTimes = false;
    await salvarFirebase();
}

async function montarAutomaticamenteSePronto() {
    const pendentes = players.filter(p => !encontrarJogadorBanco(p.nome));
    if (autoMontarTimes && players.length > 0 && teams.length === 0 && pendentes.length === 0) {
        await montarTimes(qtdTimesSugerida || calcularQuantidadeTimesSugerida(players.length), true);
        return true;
    }
    return false;
}

auth.onAuthStateChanged((user) => {
    if (user) {
        onSnapshot(docBancoRef, (snap) => { 
            if (snap.exists()) {
                bancoPermanente = snap.data(); 
                // Sempre que o banco mudar, re-renderizamos para garantir notas frescas na tela
                atualizarUI();
            }
            
            onSnapshot(docTimesRef, async (snapTimes) => {
                if (snapTimes.exists()) { 
                    const d = snapTimes.data(); 
                    players = d.players || []; 
                    teams = d.teams || []; 
                    fase = d.fase || "rating"; 
                    notaTipoAtiva = d.notaTipoAtiva || "notaTodes";
                    qtdTimesSugerida = d.qtdTimesSugerida || calcularQuantidadeTimesSugerida(players.length);
                    autoMontarTimes = !!d.autoMontarTimes;
                } 
                const spinner = document.getElementById("loadingSpinner");
                if(spinner) spinner.style.display = "none";
                if (await montarAutomaticamenteSePronto()) return;
                atualizarUI();
            });
        });
        inicializarEventosTimes();
    } else { window.location.href = "login.html"; }
});

async function salvarFirebase() { 
    if (!auth.currentUser) return;
    try {
        await setDoc(docTimesRef, { players, teams, fase, notaTipoAtiva, qtdTimesSugerida, autoMontarTimes }); 
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

    const pendentes = players.filter(p => !encontrarJogadorBanco(p.nome));

    if (pendentes.length > 0 && fase === "rating") {
        aR.style.display = "block"; aC.style.display = "none"; aT.style.display = "none"; aA.style.display = "none";
        renderRatingList(pendentes);
    } else {
        aR.style.display = "none"; aC.style.display = "flex"; aA.style.display = "flex";
        document.querySelectorAll('.nota-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.tipo === notaTipoAtiva);
        });
        aplicarQuantidadeTimesSugerida();
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
        div.className = "item-compra item-rating-pendente player-rating-card";
        div.id = `card-${p.id}`;
        
        const nomeVinculado = vinculosTemporarios[p.id];
        const modoAtual = modosPendentes[p.id] || "novo";

        let htmlInterno = `
            <div class="row-between">
                <span class="pending-player-name">${p.nome}</span>
                <span class="pending-player-status">${nomeVinculado ? 'vinculado' : 'Sem vínculo'}</span>
            </div>
            <div class="link-mode-row">
                <label class="radio-label">
                    <input type="radio" name="modo-${p.id}" ${modoAtual === "novo" ? "checked" : ""} onchange="window.setModoPendente('${p.id}', 'novo')">
                    Novo cadastro
                </label>
                <label class="radio-label">
                    <input type="radio" name="modo-${p.id}" ${modoAtual === "vincular" ? "checked" : ""} onchange="window.setModoPendente('${p.id}', 'vincular')">
                    Vincular
                </label>
            </div>
        `;

        if (nomeVinculado) {
            htmlInterno += `
                <div class="linked-card">
                    <div class="linked-card-title">✅ VINCULANDO A: ${nomeVinculado}</div>
                    <button onclick="window.cancelarVinculo('${p.id}')" class="btn-link-subtle mt-10">Desfazer vínculo</button>
                </div>
            `;
        } else if (modoAtual === "vincular") {
            htmlInterno += `
                <div class="vincular-container" id="vinc-cont-${p.id}">
                    <label class="vincular-label">BUSCAR NO BANCO PARA VINCULAR:</label>
                    <input type="text" class="input-modal vincular-input" placeholder="Digite o nome correto aqui..." oninput="window.buscarParaVincular('${p.id}', this.value)">
                    <div id="results-${p.id}" class="vincular-results"></div>
                </div>
            `;
        } else {
            htmlInterno += `
                <div class="new-player-rating-grid">
                    <div class="rating-field"><label>TODES</label>
                        <div class="qty-controls rating-stepper">
                            <button class="btn-qty" onclick="window.changePlayerNotaLocal('${p.id}', 'notaTodes', -1)">-</button>
                            <span class="level-num" id="ntodes-${p.id}">${notaBanco(p, "notaTodes")}</span>
                            <button class="btn-qty" onclick="window.changePlayerNotaLocal('${p.id}', 'notaTodes', 1)">+</button>
                        </div>
                    </div>
                    <div class="rating-field"><label>ELAX</label>
                        <div class="qty-controls rating-stepper">
                            <button class="btn-qty" onclick="window.changePlayerNotaLocal('${p.id}', 'notaElax', -1)">-</button>
                            <span class="level-num" id="nelax-${p.id}">${notaBanco(p, "notaElax")}</span>
                            <button class="btn-qty" onclick="window.changePlayerNotaLocal('${p.id}', 'notaElax', 1)">+</button>
                        </div>
                    </div>
                    <div class="rating-field allstar-rating-field" id="allstar-rating-${p.id}" style="${p.allStars ? '' : 'display:none;'}"><label>ALL STARS</label>
                        <div class="qty-controls rating-stepper">
                            <button class="btn-qty" onclick="window.changePlayerNotaLocal('${p.id}', 'notaAllStars', -1)">-</button>
                            <span class="level-num" id="nstar-${p.id}">${notaBanco(p, "notaAllStars")}</span>
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
    b.className = "btn btn-main btn-concluir-times"; b.innerText = "CONCLUIR E MONTAR TIMES";
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
            p.notaTodes = notaBanco(p, "notaTodes");
            p.notaElax = notaBanco(p, "notaElax");
            p.notaAllStars = notaBanco(p, "notaAllStars");
        }
    }
    atualizarUI();
};

window.changePlayerNotaLocal = (playerId, tipo, delta) => {
    const p = players.find(x => x.id === playerId);
    if (p) {
        if (p[tipo] === undefined || p[tipo] === null || p[tipo] === "") p[tipo] = 3;
        p[tipo] = Math.max(0, Math.min(10, Number(p[tipo]) + delta));
        const idMap = { 'notaTodes': 'ntodes', 'notaElax': 'nelax', 'notaAllStars': 'nstar' };
        const el = document.getElementById(`${idMap[tipo]}-${playerId}`);
        if(el) el.innerText = p[tipo];
    }
};

window.setNewAllStarStatus = (id, v) => {
    const p = players.find(x => x.id === id);
    if (p) {
        p.allStars = v;
        if (v && (p.notaAllStars === undefined || p.notaAllStars === null || p.notaAllStars === "")) p.notaAllStars = 3;
        const campo = document.getElementById(`allstar-rating-${id}`);
        if (campo) campo.style.display = v ? "" : "none";
    }
};

window.buscarParaVincular = (playerId, query) => {
    const resultsDiv = document.getElementById(`results-${playerId}`);
    if (!query || query.length < 2) { resultsDiv.style.display = "none"; return; }
    const q = normalizarBusca(query);
    const matches = Object.keys(bancoPermanente)
        .filter(nome => nome !== "versao")
        .filter(nome => normalizarBusca(`${nome} ${bancoPermanente[nome].apelidos || ""}`).includes(q))
        .slice(0, 5);
    if (matches.length > 0) {
        resultsDiv.style.display = "block";
        resultsDiv.innerHTML = matches.map(m => `
            <div class="result-item"
                 onclick="window.setVinculoLocal('${playerId}', '${m.replace(/'/g, "\\'")}')">
                <span class="result-name">${m} <small class="result-note">(T: ${notaBanco(bancoPermanente[m], "notaTodes")})</small></span>
                <span class="result-action">SELECIONAR</span>
            </div>
        `).join('');
    } else { resultsDiv.style.display = "none"; }
};

window.setVinculoLocal = (playerId, nomeOficial) => { vinculosTemporarios[playerId] = nomeOficial; modosPendentes[playerId] = "vincular"; atualizarUI(); };
window.cancelarVinculo = (playerId) => { delete vinculosTemporarios[playerId]; atualizarUI(); };

window.cadastrarNovosEContinuar = async () => {
    const pendentes = players.filter(p => !encontrarJogadorBanco(p.nome));
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
            p.notaTodes = notaBanco(p, "notaTodes");
            p.notaElax = notaBanco(p, "notaElax");
            p.notaAllStars = notaBanco(p, "notaAllStars", 0);
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
    vinculosTemporarios = {};
    modosPendentes = {};
    await montarTimes(qtdTimesSugerida || calcularQuantidadeTimesSugerida(players.length), true);
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
                        <div class="input-item">${p.nome}${p.allStars && notaTipoAtiva !== 'notaAllStars' ? ' ⭐' : ''}</div>
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
                const nomeLimpo = limparNomeImportado(linha);
                const nFormatado = formatarNome(nomeLimpo);
                let m = encontrarJogadorBanco(nFormatado);
                const dbP = m ? bancoPermanente[m] : null;
                return {
                    id: "p-" + Math.random().toString(36).substr(2, 9),
                    nome: m || nFormatado,
                    notaTodes: dbP ? notaBanco(dbP, "notaTodes") : 3,
                    notaElax: dbP ? notaBanco(dbP, "notaElax") : 3,
                    notaAllStars: dbP ? notaBanco(dbP, "notaAllStars", 0) : 0,
                    allStars: dbP ? !!dbP.allStars : false,
                    locked: false
                };
            }).filter(p => p.nome.length > 1);
            qtdTimesSugerida = calcularQuantidadeTimesSugerida(players.length);
            teams = []; fase = "rating"; await salvarFirebase(); window.fecharModal('modalImport');
        };
    }
    document.getElementById("btnGerarTimes").onclick = async () => {
        const nTeams = parseInt(document.getElementById("qtdTimes").value);
        await montarTimes(nTeams, false);
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
    toast.style.left = `${x}px`; toast.style.top = `${y}px`;
    document.body.appendChild(toast);
    setTimeout(() => { if(toast) toast.remove(); }, 1500);
}
