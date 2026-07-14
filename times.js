import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";

import { carregarBancoCache, salvarBancoCache } from "./banco-cache.js";
import { exigirAcesso, monitorarAcesso } from "./access-control.js";

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

function extrairNomesImportados(texto) {
    const linhas = (texto || "").split(/\r?\n/);
    const linhaNumerada = /^\s*\d+\s*(?:[-\u2013\u2014.)]\s*|\s+)(.+?)\s*$/u;
    const possuiNumeracao = linhas.some(linha => linhaNumerada.test(linha));

    return linhas.reduce((nomes, linha) => {
        const match = linha.match(linhaNumerada);
        if (possuiNumeracao && !match) return nomes;

        const conteudo = match ? match[1] : linha;
        const semMarcacao = conteudo.replace(/\*/g, "").trim();
        if (!semMarcacao || /^lista\s+de\s+espera\b/iu.test(semMarcacao)) return nomes;

        const nome = limparNomeImportado(conteudo);
        if (nome) nomes.push(nome);
        return nomes;
    }, []);
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

const flagPorNota = {
    notaTodes: "todes",
    notaElax: "elax",
    notaAllStars: "allStars"
};

function modalidadeAtiva(info, campo) {
    const flag = flagPorNota[campo];
    if (typeof info?.[flag] === "boolean") return info[flag];
    if (campo === "notaAllStars") return !!info?.allStars;
    return notaBanco(info, campo, 0) > 0;
}

function definirModalidade(objeto, campo, marcado) {
    const flag = flagPorNota[campo];
    objeto[flag] = !!marcado;
    if (marcado && notaBanco(objeto, campo, 0) === 0) objeto[campo] = 3;
    if (!marcado) objeto[campo] = 0;
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
let bancoPermanente = carregarBancoCache();
let vinculosTemporarios = {}; 
let modosPendentes = {};
const editoresNotasAbertos = new Set();
const rascunhosNotas = new Map();
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
        return modalidadeAtiva(doBanco, tipoNota) ? notaBanco(doBanco, tipoNota) : 0;
    }
    // Fallback para nota da sessão (jogadores novos ainda não salvos no banco)
    return modalidadeAtiva(p, tipoNota) ? notaBanco(p, tipoNota) : 0;
}

function jogadorEhAllStar(p) {
    const nomeOficial = encontrarJogadorBanco(p.nome) || p.nome;
    const doBanco = bancoPermanente[nomeOficial];
    return doBanco ? modalidadeAtiva(doBanco, "notaAllStars") : modalidadeAtiva(p, "notaAllStars");
}

function somaNotasTime(time) {
    return time.players.reduce((soma, jogador) => soma + resolverNotaReal(jogador, notaTipoAtiva), 0);
}

function quantidadeAllStarsTime(time) {
    return time.players.filter(jogadorEhAllStar).length;
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
    const deveDistribuirAllStars = notaTipoAtiva === "notaTodes" || notaTipoAtiva === "notaElax";
    livres.sort((a, b) => {
        if (deveDistribuirAllStars && jogadorEhAllStar(a) !== jogadorEhAllStar(b)) {
            return jogadorEhAllStar(a) ? -1 : 1;
        }
        return resolverNotaReal(b, notaTipoAtiva) - resolverNotaReal(a, notaTipoAtiva);
    });
    livres.forEach(p => {
        nTA.sort((a, b) => {
            if (deveDistribuirAllStars && jogadorEhAllStar(p)) {
                const diferencaAllStars = quantidadeAllStarsTime(a) - quantidadeAllStarsTime(b);
                if (diferencaAllStars !== 0) return diferencaAllStars;
            }
            const diferencaSoma = somaNotasTime(a) - somaNotasTime(b);
            if (diferencaSoma !== 0) return diferencaSoma;
            return a.players.length - b.players.length;
        });
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

let timesInicializado = false;
auth.onAuthStateChanged(async (user) => {
    if (user && !timesInicializado) {
        const perfil = await exigirAcesso(user);
        if (!perfil) return;
        timesInicializado = true;
        monitorarAcesso(perfil);
        onSnapshot(docBancoRef, (snap) => { 
            bancoPermanente = snap.exists() ? snap.data() : {};
            salvarBancoCache(bancoPermanente);
            // Sempre que o banco mudar, re-renderizamos para garantir notas frescas na tela
            atualizarUI();
        });
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
        inicializarEventosTimes();
    } else if (!user) { window.location.href = "login.html"; }
});

async function salvarFirebase() { 
    if (!auth.currentUser) return;
    try {
        await setDoc(docTimesRef, { players, teams, fase, notaTipoAtiva, qtdTimesSugerida, autoMontarTimes }); 
    } catch (error) {
        console.error("Erro ao salvar no Firebase:", error);
    }
}

async function salvarBancoFirebase() {
    salvarBancoCache(bancoPermanente);
    await setDoc(docBancoRef, bancoPermanente);
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
        const todesAtivo = modalidadeAtiva(p, "notaTodes");
        const elaxAtivo = modalidadeAtiva(p, "notaElax");
        const allStarsAtivo = modalidadeAtiva(p, "notaAllStars");

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
                    <div class="rating-field rating-modality ${todesAtivo ? '' : 'is-disabled'}"><label class="rating-modality-label"><input type="checkbox" class="checkbox-control" ${todesAtivo ? 'checked' : ''} onchange="window.setNewModalityStatus('${p.id}', 'notaTodes', this.checked)"> TODES</label>
                        <div class="qty-controls rating-stepper">
                            <button class="btn-qty" ${todesAtivo ? '' : 'disabled'} onclick="window.changePlayerNotaLocal('${p.id}', 'notaTodes', -1)">-</button>
                            <span class="level-num" id="ntodes-${p.id}">${notaBanco(p, "notaTodes")}</span>
                            <button class="btn-qty" ${todesAtivo ? '' : 'disabled'} onclick="window.changePlayerNotaLocal('${p.id}', 'notaTodes', 1)">+</button>
                        </div>
                    </div>
                    <div class="rating-field rating-modality ${elaxAtivo ? '' : 'is-disabled'}"><label class="rating-modality-label"><input type="checkbox" class="checkbox-control" ${elaxAtivo ? 'checked' : ''} onchange="window.setNewModalityStatus('${p.id}', 'notaElax', this.checked)"> ELAX</label>
                        <div class="qty-controls rating-stepper">
                            <button class="btn-qty" ${elaxAtivo ? '' : 'disabled'} onclick="window.changePlayerNotaLocal('${p.id}', 'notaElax', -1)">-</button>
                            <span class="level-num" id="nelax-${p.id}">${notaBanco(p, "notaElax")}</span>
                            <button class="btn-qty" ${elaxAtivo ? '' : 'disabled'} onclick="window.changePlayerNotaLocal('${p.id}', 'notaElax', 1)">+</button>
                        </div>
                    </div>
                    <div class="rating-field rating-modality ${allStarsAtivo ? '' : 'is-disabled'}"><label class="rating-modality-label"><input type="checkbox" class="checkbox-control" ${allStarsAtivo ? 'checked' : ''} onchange="window.setNewModalityStatus('${p.id}', 'notaAllStars', this.checked)"> ALL STARS</label>
                        <div class="qty-controls rating-stepper">
                            <button class="btn-qty" ${allStarsAtivo ? '' : 'disabled'} onclick="window.changePlayerNotaLocal('${p.id}', 'notaAllStars', -1)">-</button>
                            <span class="level-num" id="nstar-${p.id}">${notaBanco(p, "notaAllStars")}</span>
                            <button class="btn-qty" ${allStarsAtivo ? '' : 'disabled'} onclick="window.changePlayerNotaLocal('${p.id}', 'notaAllStars', 1)">+</button>
                        </div>
                    </div>
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
    if (p && modalidadeAtiva(p, tipo)) {
        if (p[tipo] === undefined || p[tipo] === null || p[tipo] === "") p[tipo] = 3;
        p[tipo] = Math.max(0, Math.min(10, Number(p[tipo]) + delta));
        const idMap = { 'notaTodes': 'ntodes', 'notaElax': 'nelax', 'notaAllStars': 'nstar' };
        const el = document.getElementById(`${idMap[tipo]}-${playerId}`);
        if(el) el.innerText = p[tipo];
    }
};

window.setNewModalityStatus = (id, tipo, marcado) => {
    const p = players.find(x => x.id === id);
    if (p) {
        definirModalidade(p, tipo, marcado);
        atualizarUI();
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
            p.todes = modalidadeAtiva(p, "notaTodes");
            p.elax = modalidadeAtiva(p, "notaElax");
            p.allStars = modalidadeAtiva(p, "notaAllStars");
            bancoPermanente[p.nome] = {
                notaTodes: p.todes ? p.notaTodes : 0,
                notaElax: p.elax ? p.notaElax : 0,
                notaAllStars: p.allStars ? p.notaAllStars : 0,
                todes: p.todes,
                elax: p.elax,
                allStars: p.allStars,
                apelidos: ""
            };
            houveAlteracaoNoBanco = true;
        }
    });
    if (houveAlteracaoNoBanco) await salvarBancoFirebase();
    vinculosTemporarios = {};
    modosPendentes = {};
    await montarTimes(qtdTimesSugerida || calcularQuantidadeTimesSugerida(players.length), true);
};

// --- 6. RENDERIZAÇÃO DOS TIMES ---
function encontrarJogadorNosTimes(playerId) {
    const id = String(playerId);
    return teams.flatMap(time => time.players).find(player => String(player.id) === id) || null;
}

function criarRascunhoNotas(player) {
    const nomeOficial = encontrarJogadorBanco(player.nome) || player.nome;
    const info = bancoPermanente[nomeOficial] || player;
    return {
        notaTodes: notaBanco(info, "notaTodes"),
        notaElax: notaBanco(info, "notaElax"),
        notaAllStars: notaBanco(info, "notaAllStars", 0),
        todes: modalidadeAtiva(info, "notaTodes"),
        elax: modalidadeAtiva(info, "notaElax"),
        allStars: modalidadeAtiva(info, "notaAllStars")
    };
}

function obterRascunhoNotas(player) {
    const id = String(player.id);
    if (!rascunhosNotas.has(id)) rascunhosNotas.set(id, criarRascunhoNotas(player));
    return rascunhosNotas.get(id);
}

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
                ${jogadoresOrdenados.map(p => {
                    const id = String(p.id);
                    const aberto = editoresNotasAbertos.has(id);
                    const rascunho = aberto ? obterRascunhoNotas(p) : criarRascunhoNotas(p);
                    return `
                        <div class="item-compra team-player-card ${p.locked ? 'is-locked' : ''}" data-player-id="${p.id}">
                            <div class="team-player-row">
                                <div class="drag-handle">⠿</div>
                                <div class="input-item">${p.nome}${jogadorEhAllStar(p) && notaTipoAtiva !== 'notaAllStars' ? ' ⭐' : ''}</div>
                                <span class="level-num">${resolverNotaReal(p, notaTipoAtiva)}</span>
                                <button type="button" class="btn-edit btn-edit-rating ${aberto ? 'active' : ''}" aria-expanded="${aberto}" title="Editar notas" onclick="window.toggleEditorNotas(event, '${p.id}')">✏️</button>
                                <button type="button" class="btn-lock ${p.locked ? 'locked' : ''}" onclick="window.toggleLock('${p.id}')">${p.locked ? '🔒' : '🔓'}</button>
                            </div>
                            <div class="team-player-edit-body ${aberto ? '' : 'hidden'}">
                                <div class="notas-grid-cadastro team-player-rating-grid">
                                    <div class="nota-input-group rating-modality ${rascunho.todes ? '' : 'is-disabled'}">
                                        <label class="rating-modality-label"><input type="checkbox" class="checkbox-control" ${rascunho.todes ? 'checked' : ''} onchange="window.toggleTeamPlayerModality('${p.id}', 'notaTodes', this.checked)"> Todes</label>
                                        <div class="qty-controls rating-stepper">
                                            <button type="button" class="btn-qty" ${rascunho.todes ? '' : 'disabled'} onclick="window.changeTeamPlayerNota('${p.id}', 'notaTodes', -1)">-</button>
                                            <span class="level-num" data-edit-note="notaTodes">${rascunho.notaTodes}</span>
                                            <button type="button" class="btn-qty" ${rascunho.todes ? '' : 'disabled'} onclick="window.changeTeamPlayerNota('${p.id}', 'notaTodes', 1)">+</button>
                                        </div>
                                    </div>
                                    <div class="nota-input-group rating-modality ${rascunho.elax ? '' : 'is-disabled'}">
                                        <label class="rating-modality-label"><input type="checkbox" class="checkbox-control" ${rascunho.elax ? 'checked' : ''} onchange="window.toggleTeamPlayerModality('${p.id}', 'notaElax', this.checked)"> Elax</label>
                                        <div class="qty-controls rating-stepper">
                                            <button type="button" class="btn-qty" ${rascunho.elax ? '' : 'disabled'} onclick="window.changeTeamPlayerNota('${p.id}', 'notaElax', -1)">-</button>
                                            <span class="level-num" data-edit-note="notaElax">${rascunho.notaElax}</span>
                                            <button type="button" class="btn-qty" ${rascunho.elax ? '' : 'disabled'} onclick="window.changeTeamPlayerNota('${p.id}', 'notaElax', 1)">+</button>
                                        </div>
                                    </div>
                                    <div class="nota-input-group rating-modality team-player-allstars-note ${rascunho.allStars ? '' : 'is-disabled'}">
                                        <label class="rating-modality-label"><input type="checkbox" class="checkbox-control" ${rascunho.allStars ? 'checked' : ''} onchange="window.toggleTeamPlayerModality('${p.id}', 'notaAllStars', this.checked)"> All Stars ⭐</label>
                                        <div class="qty-controls rating-stepper">
                                            <button type="button" class="btn-qty" ${rascunho.allStars ? '' : 'disabled'} onclick="window.changeTeamPlayerNota('${p.id}', 'notaAllStars', -1)">-</button>
                                            <span class="level-num" data-edit-note="notaAllStars">${rascunho.notaAllStars}</span>
                                            <button type="button" class="btn-qty" ${rascunho.allStars ? '' : 'disabled'} onclick="window.changeTeamPlayerNota('${p.id}', 'notaAllStars', 1)">+</button>
                                        </div>
                                    </div>
                                </div>
                                <button type="button" class="btn btn-main btn-save-team-rating" onclick="window.salvarNotasJogadorTime('${p.id}')">SALVAR NOTAS</button>
                            </div>
                        </div>
                    `;
                }).join('')}
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
            players = extrairNomesImportados(texto).map(nomeLimpo => {
                const nFormatado = formatarNome(nomeLimpo);
                let m = encontrarJogadorBanco(nFormatado);
                const dbP = m ? bancoPermanente[m] : null;
                return {
                    id: "p-" + Math.random().toString(36).substr(2, 9),
                    nome: m || nFormatado,
                    notaTodes: dbP ? notaBanco(dbP, "notaTodes") : 3,
                    notaElax: dbP ? notaBanco(dbP, "notaElax") : 0,
                    notaAllStars: dbP ? notaBanco(dbP, "notaAllStars", 0) : 0,
                    todes: dbP ? modalidadeAtiva(dbP, "notaTodes") : true,
                    elax: dbP ? modalidadeAtiva(dbP, "notaElax") : false,
                    allStars: dbP ? modalidadeAtiva(dbP, "notaAllStars") : false,
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
    document.getElementById("btnCopyTimes").onclick = (event) => {
        let txt = "";
        teams.forEach(t => { txt += `*${t.nome.toUpperCase()}*\n`; t.players.forEach(p => txt += `- ${p.nome}\n`); txt += `\n`; });
        navigator.clipboard.writeText(txt.trim()).then(() => {
            mostrarToastMover(event.clientX, event.clientY, "Copiado!");
        });
    };
}

window.toggleLock = async (pId) => {
    teams.forEach(t => {
        const p = t.players.find(px => px.id === pId);
        if(p) { p.locked = !p.locked; t.players = ordenarJogadoresTime(t.players); }
    });
    await salvarFirebase();
};

function encontrarCardJogador(playerId) {
    const id = String(playerId);
    return [...document.querySelectorAll("#areaTeams .team-player-card")]
        .find(card => String(card.dataset.playerId) === id) || null;
}

window.toggleEditorNotas = (event, playerId) => {
    event?.preventDefault();
    event?.stopPropagation();
    const id = String(playerId);
    const card = encontrarCardJogador(id);
    const corpo = card?.querySelector(".team-player-edit-body");
    const botao = card?.querySelector(".btn-edit-rating");
    if (!corpo || !botao) return;

    const abrir = corpo.classList.contains("hidden");
    corpo.classList.toggle("hidden", !abrir);
    botao.classList.toggle("active", abrir);
    botao.setAttribute("aria-expanded", String(abrir));
    if (abrir) {
        editoresNotasAbertos.add(id);
    } else {
        editoresNotasAbertos.delete(id);
        rascunhosNotas.delete(id);
    }
};

window.changeTeamPlayerNota = (playerId, tipo, delta) => {
    const player = encontrarJogadorNosTimes(playerId);
    if (!player) return;
    const rascunho = obterRascunhoNotas(player);
    if (!modalidadeAtiva(rascunho, tipo)) return;
    rascunho[tipo] = Math.max(0, Math.min(10, Number(rascunho[tipo] || 0) + Number(delta)));
    const card = encontrarCardJogador(playerId);
    const valor = card?.querySelector(`[data-edit-note="${tipo}"]`);
    if (valor) valor.innerText = String(rascunho[tipo]);
};

window.toggleTeamPlayerModality = (playerId, tipo, marcado) => {
    const player = encontrarJogadorNosTimes(playerId);
    if (!player) return;
    const rascunho = obterRascunhoNotas(player);
    definirModalidade(rascunho, tipo, marcado);

    const card = encontrarCardJogador(playerId);
    const valor = card?.querySelector(`[data-edit-note="${tipo}"]`);
    const campo = valor?.closest(".rating-modality");
    campo?.classList.toggle("is-disabled", !marcado);
    campo?.querySelectorAll(".btn-qty").forEach(botao => { botao.disabled = !marcado; });
    if (valor) valor.innerText = String(rascunho[tipo]);
};

window.salvarNotasJogadorTime = async (playerId) => {
    const player = encontrarJogadorNosTimes(playerId);
    if (!player) return;
    const id = String(playerId);
    const rascunho = obterRascunhoNotas(player);
    const nomeOficial = encontrarJogadorBanco(player.nome) || player.nome;
    const anterior = bancoPermanente[nomeOficial] || {};
    const dadosAtualizados = {
        ...anterior,
        notaTodes: rascunho.todes ? rascunho.notaTodes : 0,
        notaElax: rascunho.elax ? rascunho.notaElax : 0,
        notaAllStars: rascunho.allStars ? rascunho.notaAllStars : 0,
        todes: rascunho.todes,
        elax: rascunho.elax,
        allStars: rascunho.allStars
    };

    bancoPermanente[nomeOficial] = dadosAtualizados;
    const atualizarFotoJogador = (item) => {
        const mesmoId = String(item.id) === id;
        const mesmoCadastro = (encontrarJogadorBanco(item.nome) || item.nome) === nomeOficial;
        if (!mesmoId && !mesmoCadastro) return;
        item.notaTodes = dadosAtualizados.notaTodes;
        item.notaElax = dadosAtualizados.notaElax;
        item.notaAllStars = dadosAtualizados.notaAllStars;
        item.todes = dadosAtualizados.todes;
        item.elax = dadosAtualizados.elax;
        item.allStars = dadosAtualizados.allStars;
    };
    players.forEach(atualizarFotoJogador);
    teams.forEach(time => time.players.forEach(atualizarFotoJogador));

    editoresNotasAbertos.delete(id);
    rascunhosNotas.delete(id);
    atualizarUI();
    try {
        await Promise.all([salvarBancoFirebase(), salvarFirebase()]);
    } catch (error) {
        console.error("Erro ao salvar as notas do jogador:", error);
        alert("As notas ficaram salvas neste dispositivo, mas houve erro ao enviar para a nuvem. Tente novamente.");
    }
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
