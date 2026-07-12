import { auth, collection, db, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, setDoc, where } from "./firebase-config.js";

// --- 1. FUNÇÕES GLOBAIS (MODAIS) ---
let scrollAntesDoModal = 0;

function bloquearScrollDaPagina() {
    if (document.body.classList.contains("modal-open")) return;
    scrollAntesDoModal = window.scrollY;
    document.body.classList.add("modal-open");
    document.body.style.top = `-${scrollAntesDoModal}px`;
}

function liberarScrollDaPagina() {
    const existeModalAberto = [...document.querySelectorAll(".modal-overlay")]
        .some(modal => getComputedStyle(modal).display !== "none");
    if (existeModalAberto) return;
    document.body.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, scrollAntesDoModal);
}

window.abrirModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    bloquearScrollDaPagina();
    el.style.display = "flex";
};

window.fecharModal = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = "none";
    liberarScrollDaPagina();
};

const presets = {
    "TODES_QUARTA": { nomeJogo: "Vôlei de quadra TODES 🏳️‍🌈", quadra: "DOM BOSCO - ITAJAÍ", dia: "Quarta-Feira", inicio: "20h30", fim: "22h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "15,00", adm: "Gustavo José" },
    "TODES_SEXTA": { nomeJogo: "Vôlei de quadra TODES 🏳️‍🌈", quadra: "ESCOLA JOSÉ MEDEIROS VIEIRA - ITAJAÍ", dia: "Sexta-Feira", inicio: "20h", fim: "22h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "10,00", adm: "Gustavo Floriani" },
    "ALLSTARS_QUARTA": { nomeJogo: "Vôlei de quadra ALL STARS ⭐", quadra: "ESCOLA JOSÉ MEDEIROS VIEIRA - ITAJAÍ", dia: "Quarta-Feira", inicio: "20h", fim: "22h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "10,00", adm: "Marcelo Venturin" },
    "ALLSTARS_SABADO": { nomeJogo: "Vôlei de quadra ALL STARS ⭐", quadra: "DOM BOSCO - ITAJAÍ", dia: "Sábado", inicio: "17h", fim: "19h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "14,00", adm: "Lucas Caetano" },
    "ELAX_QUINTA": { nomeJogo: "Vôlei de quadra ELAX 🌸", quadra: "E.B GASPAR DA COSTA MORAES - ITAJAÍ", dia: "Quinta-Feira", inicio: "21h", fim: "23h", limite: 18, pix: "(51) 980644783 (Pagamento até às 11h)", valor: "14,00", adm: "Lua Lisboa" },
    "PRAIA_DOMINGO": { nomeJogo: "😎☀️ JOGO DE AREIA☀️😎", quadra: "Praia Central de BC – Altura da 3700", dia: "Domingo", inicio: "16h", fim: "18h", limite: 15, pix: "💸 Jogo FREE!", valor: "0,00", adm: "Caio Padovan" }
};

let db_local = { listas: {} };
let aba_ativa = localStorage.getItem("queeridas_aba_ativa") || "TODES_QUARTA";
const docRef = doc(db, "sistema", "lista_presenca");
const docBancoRef = doc(db, "sistema", "banco_notas");
let bancoNotas = {};
const LINK_GRUPO_PADRAO = "https://chat.whatsapp.com/JWHNWnWC8N5IFrpNEwEtii";
const DIAS_ANTES_ABERTURA_PADRAO = 1;
const HORARIO_ABERTURA_PADRAO = "12h30";
const assinaturasFormulariosPublicos = new Map();
const formulariosEmRotacao = new Set();
const inscricoesEmFila = new Set();
const idsJogadoresConhecidos = new Map();
const listenersInscricoesPublicas = new Map();
let filaSincronizacao = Promise.resolve();
let duplicidadeEmCadastro = null;

function gerarSeedFormulario() {
    const numeros = new Uint32Array(2);
    crypto.getRandomValues(numeros);
    return Array.from(numeros, numero => String(numero).padStart(10, "0")).join("");
}

function garantirSeedsFormulario() {
    let alterou = false;
    Object.values(db_local.listas).forEach(lista => {
        if (lista?.config && !lista.config.formSeed) {
            lista.config.formSeed = gerarSeedFormulario();
            alterou = true;
        }
    });
    return alterou;
}

function criarIdentificadorFormulario(idLista, config) {
    return `${idLista}_${config.formSeed}`;
}

function registrarJogadoresConhecidos(listas) {
    Object.entries(listas || {}).forEach(([idLista, lista]) => {
        const conhecidos = idsJogadoresConhecidos.get(idLista) || new Set();
        (lista.jogadores || []).forEach(jogador => conhecidos.add(String(jogador.id)));
        idsJogadoresConhecidos.set(idLista, conhecidos);
    });
}

function contarOcupacaoInicial(lista) {
    return (lista.jogadores || []).filter(jogador => jogador.nome && jogador.nome.trim()).length;
}

function montarDadosFormularioPublico(idLista, lista) {
    const config = lista.config;
    const gratuito = (config.pix || "").includes("FREE");
    return {
        listaId: idLista,
        vigente: true,
        aberto: !!config.formAberto,
        nomeJogo: config.nomeJogo || "",
        quadra: config.quadra || "",
        mapaLink: config.mapaLink || "",
        grupoLink: config.grupoLink || LINK_GRUPO_PADRAO,
        data: config.data || "",
        dia: config.dia || "",
        inicio: config.inicio || "",
        fim: config.fim || "",
        valorTexto: gratuito ? (config.pix || "Jogo FREE") : `R$ ${config.valor || "0,00"}`,
        limite: Number(config.limite || 0),
        textoApoio: config.textoApoio || "",
        abreDiasAntes: Number(config.abreDiasAntes ?? DIAS_ANTES_ABERTURA_PADRAO),
        abreHorario: config.abreHorario || HORARIO_ABERTURA_PADRAO
    };
}

async function publicarFormularioPublico(idLista, { reiniciar = false, forcar = false } = {}) {
    const lista = db_local.listas[idLista];
    if (!lista?.config?.formSeed || formulariosEmRotacao.has(idLista) && !reiniciar) return;

    const identificador = criarIdentificadorFormulario(idLista, lista.config);
    const dados = montarDadosFormularioPublico(idLista, lista);
    const assinatura = JSON.stringify(dados);
    if (!reiniciar && !forcar && assinaturasFormulariosPublicos.get(identificador) === assinatura) return;

    const referencia = doc(db, "formularios_publicos", identificador);
    const existente = await getDoc(referencia);
    if (!existente.exists() || reiniciar) {
        await setDoc(referencia, {
            ...dados,
            ocupacaoInicial: contarOcupacaoInicial(lista),
            contadorInscricoes: 0,
            ultimaInscricaoId: "",
            ultimaInscricaoUid: "",
            atualizadoEm: serverTimestamp()
        });
    } else {
        await setDoc(referencia, { ...dados, atualizadoEm: serverTimestamp() }, { merge: true });
    }
    assinaturasFormulariosPublicos.set(identificador, assinatura);
}

async function publicarTodosFormularios() {
    await Promise.all(Object.keys(db_local.listas).map(idLista => publicarFormularioPublico(idLista)));
}

async function invalidarFormularioPorIdentificador(identificador) {
    if (!identificador) return;
    const referencia = doc(db, "formularios_publicos", identificador);
    const existente = await getDoc(referencia);
    if (existente.exists()) {
        await setDoc(referencia, {
            vigente: false,
            aberto: false,
            atualizadoEm: serverTimestamp()
        }, { merge: true });
    }
    assinaturasFormulariosPublicos.delete(identificador);
}

async function rotacionarFormulario(idLista, novoStatus) {
    formulariosEmRotacao.add(idLista);
    const config = db_local.listas[idLista].config;
    const configAnterior = { ...config };
    const identificadorAnterior = config.formSeed ? criarIdentificadorFormulario(idLista, config) : "";
    let formularioAnteriorInvalidado = false;
    try {
        config.formAberto = novoStatus;
        config.formSeed = gerarSeedFormulario();
        await publicarFormularioPublico(idLista, { reiniciar: true, forcar: true });
        await invalidarFormularioPorIdentificador(identificadorAnterior);
        formularioAnteriorInvalidado = true;
        await salvar();
    } catch (error) {
        const identificadorNovo = criarIdentificadorFormulario(idLista, config);
        db_local.listas[idLista].config = { ...configAnterior };
        await invalidarFormularioPorIdentificador(identificadorNovo).catch(() => {});
        if (formularioAnteriorInvalidado && identificadorAnterior) {
            const dadosAnteriores = montarDadosFormularioPublico(idLista, db_local.listas[idLista]);
            await setDoc(doc(db, "formularios_publicos", identificadorAnterior), {
                ...dadosAnteriores,
                vigente: true,
                atualizadoEm: serverTimestamp()
            }, { merge: true }).catch(() => {});
        }
        throw error;
    } finally {
        formulariosEmRotacao.delete(idLista);
    }
}

function dataInscricaoComoIso(valor) {
    if (valor?.toDate) return valor.toDate().toISOString();
    return new Date().toISOString();
}

async function sincronizarInscricaoPublica(referencia) {
    await runTransaction(db, async transaction => {
        const inscricaoSnap = await transaction.get(referencia);
        const listaSnap = await transaction.get(docRef);
        if (!inscricaoSnap.exists() || inscricaoSnap.data().sincronizada) return;
        if (!listaSnap.exists()) throw new Error("Documento de listas não encontrado.");

        const inscricao = inscricaoSnap.data();
        const dadosAtuais = listaSnap.data();
        const listas = dadosAtuais.listas || {};
        const lista = listas[inscricao.listaId];
        if (!lista) throw new Error(`Lista ${inscricao.listaId} não encontrada.`);

        const jogadores = [...(lista.jogadores || [])];
        const jaExiste = jogadores.some(jogador => jogador.inscricaoId === inscricao.inscricaoId);
        if (!jaExiste) {
            jogadores.push({
                id: `form-${inscricao.inscricaoId}`,
                nome: formatarNome(inscricao.nome),
                email: inscricao.email,
                timestamp: dataInscricaoComoIso(inscricao.criadoEm),
                pago: false,
                inscricaoId: inscricao.inscricaoId,
                formularioToken: inscricao.formularioToken
            });
            listas[inscricao.listaId] = { ...lista, jogadores };
            transaction.set(docRef, { ...dadosAtuais, listas });
        }
        transaction.update(referencia, {
            sincronizada: true,
            sincronizadaEm: serverTimestamp()
        });
    });
}

function enfileirarInscricaoPublica(referencia) {
    if (inscricoesEmFila.has(referencia.path)) return;
    inscricoesEmFila.add(referencia.path);
    filaSincronizacao = filaSincronizacao
        .then(() => sincronizarInscricaoPublica(referencia))
        .catch(error => console.error("Falha ao sincronizar inscrição pública:", error))
        .finally(() => inscricoesEmFila.delete(referencia.path));
}

function enfileirarSnapshotInscricoes(snapshot) {
    [...snapshot.docs]
        .sort((a, b) => {
            const dataA = a.data().criadoEm?.toMillis?.() || 0;
            const dataB = b.data().criadoEm?.toMillis?.() || 0;
            return dataA - dataB || Number(a.data().posicao || 0) - Number(b.data().posicao || 0);
        })
        .forEach(documento => enfileirarInscricaoPublica(documento.ref));
}

function consultaInscricoesPendentes(formularioRef) {
    return query(collection(formularioRef, "inscricoes"), where("sincronizada", "==", false));
}

async function verificarInscricoesPendentes(formularioRef) {
    const snapshot = await getDocs(consultaInscricoesPendentes(formularioRef));
    enfileirarSnapshotInscricoes(snapshot);
}

function acompanharFormularioPublico(documentoFormulario) {
    const caminho = documentoFormulario.ref.path;
    verificarInscricoesPendentes(documentoFormulario.ref)
        .catch(error => console.error("Falha ao buscar inscrições pendentes:", error));

    if (!documentoFormulario.data().vigente) {
        listenersInscricoesPublicas.get(caminho)?.();
        listenersInscricoesPublicas.delete(caminho);
        return;
    }
    if (listenersInscricoesPublicas.has(caminho)) return;

    const cancelar = onSnapshot(
        consultaInscricoesPendentes(documentoFormulario.ref),
        enfileirarSnapshotInscricoes,
        error => console.error("Falha ao acompanhar inscrições públicas:", error)
    );
    listenersInscricoesPublicas.set(caminho, cancelar);
}

function iniciarSincronizacaoInscricoesPublicas() {
    onSnapshot(collection(db, "formularios_publicos"), snapshot => {
        snapshot.docChanges().forEach(alteracao => {
            const caminho = alteracao.doc.ref.path;
            if (alteracao.type === "removed") {
                listenersInscricoesPublicas.get(caminho)?.();
                listenersInscricoesPublicas.delete(caminho);
                return;
            }
            acompanharFormularioPublico(alteracao.doc);
        });
    }, error => console.error("Falha ao listar formulários públicos:", error));
}

// --- 2. INICIALIZAÇÃO FIREBASE ---
auth.onAuthStateChanged(async (user) => {
    if (user && !user.isAnonymous) {
        onSnapshot(docRef, async (snap) => {
            if (snap.exists() && snap.data().listas) {
                registrarJogadoresConhecidos(snap.data().listas);
                db_local.listas = snap.data().listas;
                const seedsCriadas = garantirSeedsFormulario();
                const datasAtualizadas = atualizarDatasAutomaticas();
                if (seedsCriadas || datasAtualizadas) await salvar();
                await publicarTodosFormularios().catch(error => console.error("Falha ao publicar formulários:", error));
                const spinner = document.getElementById("loadingSpinner");
                if(spinner) spinner.style.display = "none";
                render();
            } else { inicializarBancoNovo(); }
        });
        onSnapshot(docBancoRef, (snap) => {
            bancoNotas = snap.exists() ? snap.data() : {};
            popularSelectAdm();
            const listaAtual = db_local.listas[aba_ativa];
            if (listaAtual) renderDuplicidades(listaAtual);
        });
        inicializarEventosBotoes();
        iniciarSincronizacaoInscricoesPublicas();
    } else {
        if (!window.location.pathname.includes("login.html")) window.location.href = "login.html";
    }
});

async function salvar() {
    if (!auth.currentUser || auth.currentUser.isAnonymous) return;
    try {
        await runTransaction(db, async transaction => {
            const snap = await transaction.get(docRef);
            const dadosNuvem = snap.exists() ? snap.data() : {};
            const listasNuvem = dadosNuvem.listas || {};
            const listasMescladas = mesclarListasComNuvem(listasNuvem, db_local.listas);
            db_local.listas = listasMescladas;
            transaction.set(docRef, { ...dadosNuvem, listas: listasMescladas });
        });
    } 
    catch (e) { console.error("Falha ao salvar:", e); }
}

function mesclarListasComNuvem(listasNuvem, listasLocais) {
    const resultado = { ...listasNuvem };
    Object.entries(listasLocais).forEach(([idLista, listaLocal]) => {
        const listaNuvem = listasNuvem[idLista] || {};
        const jogadoresLocais = [...(listaLocal.jogadores || [])];
        const idsLocais = new Set(jogadoresLocais.map(jogador => String(jogador.id)));
        const conhecidos = idsJogadoresConhecidos.get(idLista) || new Set();
        const jogadoresNovosNaNuvem = (listaNuvem.jogadores || []).filter(jogador => {
            const id = String(jogador.id);
            return !idsLocais.has(id) && !conhecidos.has(id);
        });
        resultado[idLista] = {
            ...listaNuvem,
            ...listaLocal,
            jogadores: [...jogadoresLocais, ...jogadoresNovosNaNuvem],
            config: {
                ...(listaNuvem.config || {}),
                ...(listaLocal.config || {})
            }
        };
    });
    return resultado;
}

async function inicializarBancoNovo() {
    Object.keys(presets).forEach(key => {
        db_local.listas[key] = {
            config: { ...presets[key], data: calcularProximaData(presets[key].dia), formAberto: false, formSeed: gerarSeedFormulario(), textoApoio: "", mapaLink: "", grupoLink: LINK_GRUPO_PADRAO, abreDiasAntes: DIAS_ANTES_ABERTURA_PADRAO, abreHorario: HORARIO_ABERTURA_PADRAO },
            jogadores: (key === "ELAX_QUINTA" || key === "PRAIA_DOMINGO") 
                ? Array.from({ length: key === "ELAX_QUINTA" ? 17 : 14 }, (_, i) => ({ id: "p-"+Date.now()+i, nome: "", pago: false }))
                : []
        };
    });
    await salvar();
}

// --- 3. LOGICA DO MODAL DE CONFIGURAÇÃO ---
function obterNomesAdm(valorAtual = "") {
    const admins = Object.keys(bancoNotas)
        .filter(nome => nome !== "versao" && bancoNotas[nome]?.adm)
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
    if (valorAtual && !admins.includes(valorAtual)) admins.unshift(valorAtual);
    return admins;
}

function popularSelectAdm(valorAtual = "") {
    const select = document.getElementById("cfgAdm");
    if (!select) return;
    const valorSelecionado = valorAtual || select.value || "";
    const admins = obterNomesAdm(valorSelecionado);
    select.innerHTML = "";

    if (!admins.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Nenhum ADM marcado no banco";
        select.appendChild(option);
        select.value = "";
        return;
    }

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione um ADM";
    select.appendChild(placeholder);

    admins.forEach(nome => {
        const option = document.createElement("option");
        option.value = nome;
        option.textContent = nome;
        select.appendChild(option);
    });
    select.value = admins.includes(valorSelecionado) ? valorSelecionado : "";
}

function carregarDadosNoModal(idLista) {
    const lista = db_local.listas[idLista];
    if (!lista) return;
    const c = lista.config;
    popularSelectAdm(c.adm || "");
    document.getElementById("cfgNomeJogo").value = c.nomeJogo || "";
    document.getElementById("cfgQuadra").value = c.quadra || "";
    document.getElementById("cfgMapaLink").value = c.mapaLink || "";
    document.getElementById("cfgGrupoLink").value = c.grupoLink || LINK_GRUPO_PADRAO;
    document.getElementById("cfgAbreDiasAntes").value = c.abreDiasAntes ?? DIAS_ANTES_ABERTURA_PADRAO;
    document.getElementById("cfgAbreHorario").value = c.abreHorario || HORARIO_ABERTURA_PADRAO;
    document.getElementById("cfgData").value = c.data || "";
    document.getElementById("cfgDia").value = c.dia || "Segunda-Feira";
    document.getElementById("cfgInicio").value = c.inicio || "";
    document.getElementById("cfgFim").value = c.fim || "";
    document.getElementById("cfgValor").value = c.valor || "";
    document.getElementById("cfgLimite").value = c.limite || 21;
    document.getElementById("cfgPix").value = c.pix || "";
    document.getElementById("cfgFormStatus").value = c.formAberto ? "true" : "false";
    document.getElementById("cfgTextoApoio").value = c.textoApoio || "";
}

function selecionarModalidadeConfig(idLista) {
    const campoModalidade = document.getElementById("cfgModalidade");
    if (campoModalidade) campoModalidade.value = idLista;
    document.querySelectorAll('.cfg-list-option').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-id') === idLista);
    });
    carregarDadosNoModal(idLista);
}

// --- 4. RENDERIZAÇÃO ---
function render() {
    const listaAtual = db_local.listas[aba_ativa];
    if (!listaAtual) return;
    const { nomeJogo, quadra, data, dia, inicio, fim, valor, limite, pix, adm, formAberto } = listaAtual.config;
    document.body.className = `theme-${aba_ativa.split('_')[0].toLowerCase()}`;
    const tApp = document.getElementById("tituloApp");
    if(tApp) tApp.innerText = `LISTA ${nomeJogo.toUpperCase()}`;
    document.querySelectorAll('.main-list-tab').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-id') === aba_ativa));

    const infoPreview = document.getElementById("infoPreview");
    if (infoPreview) {
        const isFree = pix.includes("FREE");
        const urlBase = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
        const linkPublico = `${urlBase}form.html?lista=${criarIdentificadorFormulario(aba_ativa, listaAtual.config)}`;

        infoPreview.innerHTML = `
            <div class="info-card-header">
                <div class="edit-text title" contenteditable="true" data-key="nomeJogo">${nomeJogo}</div>
            </div>
            <div class="info-row">
                &#128205; <span class="edit-text" contenteditable="true" data-key="quadra">${quadra}</span> | 
                <span class="edit-text" contenteditable="true" data-key="data">${data || 'dd/mm'}</span>
                (<span class="edit-day-trigger">${dia}</span>)
            </div>
            <div class="info-row">&#128338; ${inicio} &agrave;s ${fim}</div>
            <div class="info-row">&#128176; ${isFree ? pix : 'R$ ' + valor + ' | Pix: ' + pix}</div>
            
            <div class="card-actions">
                <div class="card-actions-header">
                    <div class="card-actions-title">A&ccedil;&otilde;es da lista</div>
                    <span class="form-status-pill ${formAberto ? 'is-open' : 'is-closed'}">${formAberto ? '&#128275; Aberto' : '&#128274; Fechado'}</span>
                </div>
                <div class="form-link-row">
                    <div class="form-link-copy">
                        <b>LINK DO FORMUL&Aacute;RIO:</b>
                        <span class="form-link-url">${linkPublico}</span>
                    </div>
                </div>
                <div class="card-actions-grid">
                    <button id="btnCopyWhatsapp" class="btn btn-sub">COPIAR LISTA</button>
                    <button id="btnCopyFormLink" class="btn btn-sub">COPIAR LINK</button>
                    <button id="btnToggleForm" class="status-toggle-btn ${formAberto ? 'is-open' : 'is-closed'}">${formAberto ? 'FECHAR FORMUL&Aacute;RIO' : 'ABRIR FORMUL&Aacute;RIO'}</button>
                </div>
            </div>
        `;
        vincularEventosResumo(listaAtual);
    }
    renderLista(listaAtual, limite, adm);
    renderDuplicidades(listaAtual);
}

function renderLista(listaAtual, limite, adm) {
    const listaDOM = document.getElementById("listaJogadores");
    if (!listaDOM) return;
    listaDOM.innerHTML = "";
    const divAdm = document.createElement("div");
    divAdm.className = "item-compra is-adm";
    divAdm.innerHTML = `<span class="num">1</span><span class="input-item" contenteditable="true">${formatarNome(adm)}</span><div class="adm-actions-placeholder"></div><button class="btn-del btn-invisible">&times;</button>`;
    divAdm.querySelector('.input-item').onblur = (e) => { listaAtual.config.adm = formatarNome(e.target.innerText.trim()); salvar(); };
    listaDOM.appendChild(divAdm);

    const principal = listaAtual.jogadores.slice(0, limite - 1);
    const todosPagos = principal.length > 0 && principal.every(j => j.pago && j.nome.trim().length > 0);

    let bFechar = null;
    if (todosPagos) {
        bFechar = document.createElement("button");
        bFechar.className = "btn-fechar-lista";
        bFechar.innerText = "FECHAR LISTA E MONTAR TIMES";
        bFechar.onclick = () => fecharListaEMontarTimes(listaAtual);
    }

    let botaoInserido = false;
    listaAtual.jogadores.forEach((jog, index) => {
        const pos = index + 2;
        if (pos === limite + 1) {
            if (bFechar) { listaDOM.appendChild(bFechar); botaoInserido = true; }
            const s = document.createElement("div");
            s.className = "espera-divider";
            s.innerHTML = "Lista de Espera &#9200;";
            listaDOM.appendChild(s);
        }
        const div = document.createElement("div");
        div.className = `item-compra ${pos > limite ? 'modo-espera' : ''} ${jog.pago ? 'is-pago' : ''}`;
        div.setAttribute('data-id', jog.id);
        div.innerHTML = `
            <div class="drag-handle">&#10303;</div>
            <span class="num">${pos}</span>
            <span class="input-item" contenteditable="true">${formatarNome(jog.nome)}</span>
            <input type="checkbox" class="check-pago" ${jog.pago ? 'checked' : ''}>
            <button class="btn-del">&times;</button>
        `;
        div.querySelector(".input-item").onblur = (e) => { jog.nome = formatarNome(e.target.innerText.trim()); salvar(); };
        div.querySelector(".check-pago").onchange = (e) => { jog.pago = e.target.checked; salvar(); render(); };
        div.querySelector(".btn-del").onclick = () => { listaAtual.jogadores = listaAtual.jogadores.filter(j => j.id !== jog.id); salvar(); };
        listaDOM.appendChild(div);
    });
    if (bFechar && !botaoInserido) listaDOM.appendChild(bFechar);
    if (!listaDOM.dataset.sortable) {
         new Sortable(listaDOM, { animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost', onEnd: () => reordenarItens() });
         listaDOM.dataset.sortable = "true";
    }
}

// --- 5. FUNÇÕES DE SUPORTE ---
function limparNomeImportado(linha) {
    return (linha || "")
        .replace(/^\s*\d+\s*[-.)]?\s*/, "")
        .replace(/[\u2705\u2713\u2714\u2611\uFE0E\uFE0F]/g, "")
        .replace(/[\u200B-\u200D]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extrairLinhasImportadas(texto) {
    const linhas = (texto || "").split(/\r?\n/);
    const linhaNumerada = /^\s*\d+\s*(?:[-\u2013\u2014.)]\s*|\s+)(.+?)\s*$/u;
    const possuiNumeracao = linhas.some(linha => linhaNumerada.test(linha));

    return linhas.reduce((resultado, linha) => {
        const match = linha.match(linhaNumerada);
        if (possuiNumeracao && !match) return resultado;

        const conteudo = match ? match[1] : linha;
        const semMarcacao = conteudo.replace(/\*/g, "").trim();
        if (!semMarcacao || /^lista\s+de\s+espera\b/iu.test(semMarcacao)) return resultado;

        const nome = limparNomeImportado(conteudo);
        if (!nome) return resultado;

        resultado.push({
            nome,
            pago: /[\u2705\u2713\u2714\u2611]/u.test(conteudo)
        });
        return resultado;
    }, []);
}

function nomesEquivalentes(nomeA, nomeB) {
    const normalizar = (valor) => (valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}]/gu, "")
        .toLowerCase();
    return normalizar(nomeA) === normalizar(nomeB);
}

function formatarNome(n) { return n ? n.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : ""; }

function encontrarFuzzyMatch(nomeImportado, banco) {
    const normalizar = (str) => (str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\u200B-\u200D\uFE0E\uFE0F]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const nomeLimp = normalizar(nomeImportado);
    if (!nomeLimp) return null;
    const chaves = Object.keys(banco).filter(k => k !== "versao");
    for (let nomeOficial of chaves) {
        const info = banco[nomeOficial] || {};
        if (normalizar(nomeOficial) === nomeLimp) return nomeOficial;
        if (info.apelidos && info.apelidos.split(',').map(a => normalizar(a)).includes(nomeLimp)) return nomeOficial;
    }
    const candidatos = chaves.filter(nomeOficial => {
        const info = banco[nomeOficial] || {};
        const textoBusca = normalizar(nomeOficial + " " + (info.apelidos || ""));
        return nomeLimp.split(/\s+/).every(palavra => textoBusca.includes(palavra));
    });
    return candidatos.length === 1 ? candidatos[0] : null;
}

function normalizarNomeDuplicidade(valor) {
    return (valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function distanciaLevenshtein(a, b) {
    const anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = anterior[0];
        anterior[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const acima = anterior[j];
            anterior[j] = Math.min(
                anterior[j] + 1,
                anterior[j - 1] + 1,
                diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
            diagonal = acima;
        }
    }
    return anterior[b.length];
}

function pontuarDuplicidade(nomeA, nomeB) {
    const a = normalizarNomeDuplicidade(nomeA);
    const b = normalizarNomeDuplicidade(nomeB);
    if (!a || !b) return 0;
    if (a === b) return 1;

    const bancoA = encontrarFuzzyMatch(nomeA, bancoNotas);
    const bancoB = encontrarFuzzyMatch(nomeB, bancoNotas);
    if (bancoA && bancoB && bancoA === bancoB) return 0.99;

    const compactoA = a.replace(/\s/g, "");
    const compactoB = b.replace(/\s/g, "");
    const menor = compactoA.length <= compactoB.length ? compactoA : compactoB;
    const maior = compactoA.length > compactoB.length ? compactoA : compactoB;
    if (menor.length >= 3 && maior.includes(menor) && maior.length - menor.length <= 5) return 0.9;

    const tokensA = a.split(" ");
    const tokensB = b.split(" ");
    if (tokensA[0] === tokensB[0]) {
        const ultimoA = tokensA[tokensA.length - 1];
        const ultimoB = tokensB[tokensB.length - 1];
        if (ultimoA[0] === ultimoB[0]) return 0.91;
        if (tokensA.length === 1 || tokensB.length === 1) return 0.86;
    }

    const maiorTamanho = Math.max(compactoA.length, compactoB.length);
    const similaridade = 1 - distanciaLevenshtein(compactoA, compactoB) / maiorTamanho;
    return similaridade >= 0.84 ? similaridade : 0;
}

function chaveDuplicidade(idA, idB) {
    return [String(idA), String(idB)].sort().join("::");
}

function detectarDuplicidades(listaAtual) {
    const entradas = [];
    if (listaAtual.config.adm?.trim()) {
        entradas.push({ id: `adm-${aba_ativa}`, nome: listaAtual.config.adm, isAdm: true });
    }
    (listaAtual.jogadores || []).forEach(jogador => {
        if (jogador.nome?.trim()) entradas.push({ id: String(jogador.id), nome: jogador.nome, isAdm: false });
    });

    const ignoradas = new Set(listaAtual.duplicidadesIgnoradas || []);
    const encontradas = [];
    for (let atual = 1; atual < entradas.length; atual++) {
        let melhor = null;
        for (let anterior = 0; anterior < atual; anterior++) {
            const antigo = entradas[anterior];
            const novo = entradas[atual];
            const chave = chaveDuplicidade(antigo.id, novo.id);
            if (ignoradas.has(chave)) continue;
            const pontuacao = pontuarDuplicidade(antigo.nome, novo.nome);
            if (pontuacao < 0.84 || melhor && melhor.pontuacao >= pontuacao) continue;
            melhor = {
                antigo,
                novo,
                chave,
                pontuacao,
                nomeBanco: encontrarFuzzyMatch(antigo.nome, bancoNotas) || encontrarFuzzyMatch(novo.nome, bancoNotas)
            };
        }
        if (melhor) encontradas.push(melhor);
    }
    return encontradas;
}

async function removerEntradaDuplicada(listaAtual, duplicidade) {
    listaAtual.jogadores = listaAtual.jogadores.filter(jogador => String(jogador.id) !== duplicidade.novo.id);
    await salvar();
    render();
}

function encontrarCorrespondenciaBanco(nome) {
    const nomeNormalizado = normalizarNomeDuplicidade(nome);
    const nomesBanco = Object.keys(bancoNotas).filter(nomeBanco => nomeBanco !== "versao");

    const principal = nomesBanco.find(
        nomeBanco => normalizarNomeDuplicidade(nomeBanco) === nomeNormalizado
    );
    if (principal) return { nomeBanco: principal, prioridade: 3 };

    const porApelido = nomesBanco.find(nomeBanco =>
        String(bancoNotas[nomeBanco]?.apelidos || "")
            .split(",")
            .some(apelido => normalizarNomeDuplicidade(apelido) === nomeNormalizado)
    );
    if (porApelido) return { nomeBanco: porApelido, prioridade: 2 };

    const fuzzy = encontrarFuzzyMatch(nome, bancoNotas);
    return fuzzy ? { nomeBanco: fuzzy, prioridade: 1 } : null;
}

function escolherNomePrincipalDuplicidade(duplicidade) {
    const correspondenciaAntiga = encontrarCorrespondenciaBanco(duplicidade.antigo.nome);
    const correspondenciaNova = encontrarCorrespondenciaBanco(duplicidade.novo.nome);

    if (correspondenciaAntiga && correspondenciaNova &&
        correspondenciaAntiga.nomeBanco === correspondenciaNova.nomeBanco) {
        return { nomeBanco: correspondenciaAntiga.nomeBanco, correspondencias: [correspondenciaAntiga] };
    }

    const correspondencias = [correspondenciaAntiga, correspondenciaNova].filter(Boolean);
    if (correspondencias.length) {
        correspondencias.sort((a, b) => b.prioridade - a.prioridade);
        return { nomeBanco: correspondencias[0].nomeBanco, correspondencias };
    }

    const nomes = [duplicidade.antigo.nome, duplicidade.novo.nome];
    nomes.sort((a, b) => {
        const tokens = normalizarNomeDuplicidade(b).split(" ").length - normalizarNomeDuplicidade(a).split(" ").length;
        return tokens || b.length - a.length;
    });
    return { nomeBanco: formatarNome(nomes[0]), correspondencias: [] };
}

async function mesclarDuplicidade(listaAtual, duplicidade) {
    const { nomeBanco, correspondencias } = escolherNomePrincipalDuplicidade(duplicidade);
    const cadastroPrincipal = bancoNotas[nomeBanco] || {
        notaTodes: 3,
        notaElax: 0,
        notaAllStars: 0,
        allStars: false,
        adm: false,
        apelidos: ""
    };
    const outrosCadastros = correspondencias
        .map(item => item.nomeBanco)
        .filter(nome => nome !== nomeBanco && bancoNotas[nome]);
    const apelidosExistentes = [
        ...String(cadastroPrincipal.apelidos || "").split(","),
        ...outrosCadastros.flatMap(nome => [nome, ...String(bancoNotas[nome].apelidos || "").split(",")])
    ];
    const apelidos = adicionarApelidosDaDuplicidade(apelidosExistentes, nomeBanco, duplicidade);
    bancoNotas[nomeBanco] = { ...cadastroPrincipal, apelidos: apelidos.join(", ") };

    outrosCadastros.forEach(nome => delete bancoNotas[nome]);
    Object.values(db_local.listas).forEach(lista => {
        if (outrosCadastros.some(nome => nomesEquivalentes(lista.config?.adm, nome))) {
            lista.config.adm = nomeBanco;
        }
        (lista.jogadores || []).forEach(jogador => {
            if (outrosCadastros.some(nome => nomesEquivalentes(jogador.nome, nome))) {
                jogador.nome = nomeBanco;
            }
        });
    });

    if (duplicidade.antigo.isAdm) {
        listaAtual.config.adm = nomeBanco;
    } else {
        const jogadorMantido = listaAtual.jogadores.find(
            jogador => String(jogador.id) === duplicidade.antigo.id
        );
        if (jogadorMantido) jogadorMantido.nome = nomeBanco;
    }
    listaAtual.jogadores = listaAtual.jogadores.filter(
        jogador => String(jogador.id) !== duplicidade.novo.id
    );

    await setDoc(docBancoRef, bancoNotas);
    await salvar();
    render();
}

function definirNotaCadastroDuplicidade(id, valor) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.innerText = String(Math.max(0, Math.min(10, Number(valor) || 0)));
}

function atualizarAllStarsCadastroDuplicidade(aplicarNotaPadrao = true) {
    const marcado = document.getElementById("duplicateBankAllStars").checked;
    const grupo = document.getElementById("duplicateBankAllStarsGroup");
    const grid = document.querySelector(".duplicate-bank-ratings");
    grupo.classList.toggle("hidden", !marcado);
    grid.classList.toggle("has-allstars", marcado);
    if (aplicarNotaPadrao && marcado && Number(document.getElementById("duplicateBankAllStarsNote").innerText) === 0) {
        definirNotaCadastroDuplicidade("duplicateBankAllStarsNote", 3);
    }
}

function preencherCadastroDuplicidade() {
    if (!duplicidadeEmCadastro) return;
    const duplicidade = duplicidadeEmCadastro.duplicidade;
    const nomeInput = document.getElementById("duplicateBankName");
    nomeInput.value = duplicidade.novo.nome;
    nomeInput.disabled = false;
    document.getElementById("duplicateBankAliases").value = "";
    document.getElementById("duplicateBankAllStars").checked = false;
    document.getElementById("duplicateBankAdm").checked = false;
    definirNotaCadastroDuplicidade("duplicateBankTodes", 3);
    definirNotaCadastroDuplicidade("duplicateBankElax", 0);
    definirNotaCadastroDuplicidade("duplicateBankAllStarsNote", 0);
    atualizarAllStarsCadastroDuplicidade(false);
    document.getElementById("btnSaveDuplicateBank").innerText = "CADASTRAR PESSOA";
}

function abrirCadastroDuplicidade(listaAtual, duplicidade) {
    duplicidadeEmCadastro = { listaAtual, duplicidade };
    document.getElementById("duplicateBankTitle").innerText = `Cadastrando ${duplicidade.novo.nome}`;
    preencherCadastroDuplicidade();
    window.abrirModal("modalDuplicateBank");
}

function adicionarApelidosDaDuplicidade(apelidos, nomeBanco, duplicidade) {
    const resultado = apelidos.map(valor => valor.trim()).filter(Boolean);
    const normalizados = new Set(resultado.map(normalizarNomeDuplicidade));
    [duplicidade.antigo.nome, duplicidade.novo.nome].forEach(nome => {
        const normalizado = normalizarNomeDuplicidade(nome);
        if (normalizado !== normalizarNomeDuplicidade(nomeBanco) && !normalizados.has(normalizado)) {
            resultado.push(nome);
            normalizados.add(normalizado);
        }
    });
    return resultado;
}

async function salvarCadastroDuplicidade() {
    if (!duplicidadeEmCadastro) return;
    const { listaAtual, duplicidade } = duplicidadeEmCadastro;
    const nomeBanco = formatarNome(document.getElementById("duplicateBankName").value.trim());
    if (!nomeBanco) {
        alert("Informe o nome da pessoa.");
        return;
    }

    const nomeJaExiste = Object.keys(bancoNotas).find(
        nome => normalizarNomeDuplicidade(nome) === normalizarNomeDuplicidade(nomeBanco)
    );
    if (nomeJaExiste) {
        alert(`Essa pessoa já existe no banco como ${nomeJaExiste}. Use a opção de vincular.`);
        return;
    }

    const allStars = document.getElementById("duplicateBankAllStars").checked;
    const apelidos = document.getElementById("duplicateBankAliases").value.split(",");
    bancoNotas[nomeBanco] = {
        notaTodes: Number(document.getElementById("duplicateBankTodes").innerText),
        notaElax: Number(document.getElementById("duplicateBankElax").innerText),
        notaAllStars: allStars ? Number(document.getElementById("duplicateBankAllStarsNote").innerText) : 0,
        allStars,
        adm: document.getElementById("duplicateBankAdm").checked,
        apelidos: apelidos.map(valor => valor.trim()).filter(Boolean).join(", ")
    };

    const ignoradas = new Set(listaAtual.duplicidadesIgnoradas || []);
    ignoradas.add(duplicidade.chave);
    listaAtual.duplicidadesIgnoradas = [...ignoradas];

    await setDoc(docBancoRef, bancoNotas);
    await salvar();
    duplicidadeEmCadastro = null;
    window.fecharModal("modalDuplicateBank");
    render();
}

function renderDuplicidades(listaAtual) {
    const container = document.getElementById("duplicateReview");
    if (!container) return;
    container.innerHTML = "";

    detectarDuplicidades(listaAtual).forEach(duplicidade => {
        const alerta = document.createElement("section");
        alerta.className = "duplicate-alert";

        const titulo = document.createElement("div");
        titulo.className = "duplicate-alert-title";
        titulo.textContent = "Possível duplicação encontrada";

        const texto = document.createElement("div");
        texto.className = "duplicate-alert-text";
        texto.append("O nome ");
        const novo = document.createElement("strong");
        novo.textContent = duplicidade.novo.nome;
        texto.append(novo, " pode ser a mesma pessoa que ");
        const antigo = document.createElement("strong");
        antigo.textContent = duplicidade.antigo.nome;
        texto.append(antigo, ".");

        const acoes = document.createElement("div");
        acoes.className = "duplicate-actions";

        const remover = document.createElement("button");
        remover.className = "btn btn-sub";
        remover.textContent = "REMOVER O ÚLTIMO";
        remover.onclick = () => removerEntradaDuplicada(listaAtual, duplicidade);
        acoes.appendChild(remover);

        const vincular = document.createElement("button");
        vincular.className = "btn btn-sub";
        vincular.textContent = "MESCLAR AMBAS";
        vincular.onclick = () => mesclarDuplicidade(listaAtual, duplicidade);
        acoes.appendChild(vincular);

        const cadastrar = document.createElement("button");
        cadastrar.className = "btn btn-sub";
        cadastrar.textContent = "CADASTRAR NOVA PESSOA";
        cadastrar.onclick = () => abrirCadastroDuplicidade(listaAtual, duplicidade);
        acoes.appendChild(cadastrar);

        alerta.append(titulo, texto, acoes);
        container.appendChild(alerta);
    });
}

function processarLinhaImportada(item) {
    return {
        id: "p-" + Date.now() + Math.random(),
        nome: formatarNome(item.nome),
        pago: item.pago
    };
}

function calcularQuantidadeTimesSugerida(totalJogadores) {
    if (totalJogadores <= 0) return 2;
    return Math.max(2, Math.min(5, Math.round(totalJogadores / 7)));
}

function notaBanco(info, campo, padrao = 3) {
    if (info && info[campo] !== undefined && info[campo] !== null && info[campo] !== "") {
        const numero = Number(info[campo]);
        return Number.isFinite(numero) ? numero : padrao;
    }
    if (campo === "notaTodes" && info?.level !== undefined && info?.level !== null && info?.level !== "") {
        const numero = Number(info.level);
        return Number.isFinite(numero) ? numero : padrao;
    }
    return padrao;
}

function criarJogadoresVaziosParaLista(idLista) {
    const lista = db_local.listas[idLista];
    const totalVagas = Math.max(0, Number(lista?.config?.limite || 1) - 1);
    return Array.from({ length: totalVagas }, (_, i) => ({
        id: "p-" + Date.now() + "-" + i,
        nome: "",
        pago: false
    }));
}

function calcularProximaData(diaSemana) {
    const mapaDias = { "Domingo": 0, "Segunda-Feira": 1, "Terça-Feira": 2, "Quarta-Feira": 3, "Quinta-Feira": 4, "Sexta-Feira": 5, "Sábado": 6 };
    if (mapaDias[diaSemana] === undefined) return "";
    const hoje = new Date();
    const diferenca = (mapaDias[diaSemana] - hoje.getDay() + 7) % 7;
    const dataResultado = new Date(hoje);
    dataResultado.setDate(hoje.getDate() + diferenca);
    return `${String(dataResultado.getDate()).padStart(2, '0')}/${String(dataResultado.getMonth() + 1).padStart(2, '0')}`;
}

function dataEstaVencida(dataTexto) {
    const partes = /^(\d{2})\/(\d{2})$/.exec((dataTexto || "").trim());
    if (!partes) return true;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const data = new Date(hoje.getFullYear(), Number(partes[2]) - 1, Number(partes[1]));
    return data < hoje;
}

function dataCombinaComDia(dataTexto, diaSemana) {
    const mapaDias = { "Domingo": 0, "Segunda-Feira": 1, "Terça-Feira": 2, "Quarta-Feira": 3, "Quinta-Feira": 4, "Sexta-Feira": 5, "Sábado": 6 };
    const partes = /^(\d{2})\/(\d{2})$/.exec((dataTexto || "").trim());
    if (!partes || mapaDias[diaSemana] === undefined) return false;
    const data = new Date(new Date().getFullYear(), Number(partes[2]) - 1, Number(partes[1]));
    return data.getDay() === mapaDias[diaSemana];
}

function atualizarDatasAutomaticas() {
    let houveMudanca = false;
    Object.values(db_local.listas).forEach(lista => {
        if (!lista?.config?.dia) return;
        if (!lista.config.data || dataEstaVencida(lista.config.data) || !dataCombinaComDia(lista.config.data, lista.config.dia)) {
            const proximaData = calcularProximaData(lista.config.dia);
            if (proximaData && lista.config.data !== proximaData) {
                lista.config.data = proximaData;
                houveMudanca = true;
            }
        }
    });
    return houveMudanca;
}

async function fecharListaEMontarTimes(listaAtual) {
    const pagantes = [];
    let notaAtivaSugerida = "notaTodes";
    if (aba_ativa.includes("ELAX")) notaAtivaSugerida = "notaElax";
    if (aba_ativa.includes("ALLSTARS")) notaAtivaSugerida = "notaAllStars";

    const obterDadosCompleto = (nomeDigitado) => {
        const match = encontrarFuzzyMatch(nomeDigitado, bancoNotas);
        if (match) {
            const info = bancoNotas[match];
            return { 
                nome: match, 
                // Buscamos as notas REAIS do banco agora para enviar a foto correta
                notaTodes: notaBanco(info, "notaTodes"),
                notaElax: notaBanco(info, "notaElax"),
                notaAllStars: notaBanco(info, "notaAllStars", 0),
                allStars: !!info.allStars, 
                locked: false 
            };
        }
        return { nome: formatarNome(nomeDigitado), notaTodes: 3, notaElax: 0, notaAllStars: 0, allStars: false, locked: false };
    };

    if (listaAtual.config.adm) pagantes.push({ id: "adm-"+Date.now(), ...obterDadosCompleto(listaAtual.config.adm) });
    listaAtual.jogadores.slice(0, listaAtual.config.limite - 1).forEach(j => {
        if (j.nome && j.nome.trim() !== "") pagantes.push({ id: j.id, ...obterDadosCompleto(j.nome) });
    });

    const docTimesRef = doc(db, "sistema", "montador_times");
    await setDoc(docTimesRef, { 
        players: pagantes, 
        teams: [], 
        fase: "rating", 
        timestamp: Date.now(),
        notaTipoAtiva: notaAtivaSugerida,
        qtdTimesSugerida: calcularQuantidadeTimesSugerida(pagantes.length),
        autoMontarTimes: true
    });
    window.location.href = "times.html";
}

// --- 6. EVENTOS DE BOTÕES ---
function inicializarEventosBotoes() {
    document.querySelectorAll('.main-list-tab').forEach(btn => {
        btn.onclick = async () => {
            aba_ativa = btn.getAttribute('data-id');
            localStorage.setItem("queeridas_aba_ativa", aba_ativa);
            render();
        };
    });
    const bCfg = document.getElementById("btnConfig");
    if(bCfg) bCfg.onclick = () => {
        selecionarModalidadeConfig(aba_ativa);
        window.abrirModal('modalConfig');
    };
    document.querySelectorAll('.cfg-list-option').forEach(btn => {
        btn.onclick = () => selecionarModalidadeConfig(btn.getAttribute('data-id'));
    });
    const selDia = document.getElementById("cfgDia");
    if(selDia) selDia.onchange = (e) => { document.getElementById("cfgData").value = calcularProximaData(e.target.value); };

    const bSav = document.getElementById("btnSalvarConfig");
    if(bSav) bSav.onclick = async () => {
        const mod = document.getElementById("cfgModalidade").value;
        const configAtual = db_local.listas[mod].config;
        const novoFormAberto = document.getElementById("cfgFormStatus").value === "true";
        const statusFoiAlterado = novoFormAberto !== !!configAtual.formAberto;
        const diaSelecionado = document.getElementById("cfgDia").value;
        const dataInformada = document.getElementById("cfgData").value.trim();
        db_local.listas[mod].config = { 
            ...configAtual, 
            nomeJogo: document.getElementById("cfgNomeJogo").value, 
            quadra: document.getElementById("cfgQuadra").value, 
            mapaLink: document.getElementById("cfgMapaLink").value,
            grupoLink: document.getElementById("cfgGrupoLink").value,
            abreDiasAntes: Math.max(0, parseInt(document.getElementById("cfgAbreDiasAntes").value) || 0),
            abreHorario: document.getElementById("cfgAbreHorario").value || HORARIO_ABERTURA_PADRAO,
            data: dataInformada || calcularProximaData(diaSelecionado), 
            dia: diaSelecionado, 
            inicio: document.getElementById("cfgInicio").value, 
            fim: document.getElementById("cfgFim").value, 
            valor: document.getElementById("cfgValor").value, 
            limite: parseInt(document.getElementById("cfgLimite").value), 
            pix: document.getElementById("cfgPix").value, 
            adm: formatarNome(document.getElementById("cfgAdm").value),
            formAberto: configAtual.formAberto,
            formSeed: configAtual.formSeed || gerarSeedFormulario(),
            textoApoio: document.getElementById("cfgTextoApoio").value
        };
        if (statusFoiAlterado) {
            await rotacionarFormulario(mod, novoFormAberto);
        } else {
            await salvar();
            await publicarFormularioPublico(mod, { forcar: true });
        }
        window.fecharModal('modalConfig');
    };

    const duplicateAllStars = document.getElementById("duplicateBankAllStars");
    if (duplicateAllStars) duplicateAllStars.onchange = () => atualizarAllStarsCadastroDuplicidade();
    document.querySelectorAll(".duplicate-note-btn").forEach(button => {
        button.onclick = () => {
            const campo = document.getElementById(button.dataset.target);
            definirNotaCadastroDuplicidade(button.dataset.target, Number(campo.innerText) + Number(button.dataset.delta));
        };
    });
    const btnSaveDuplicateBank = document.getElementById("btnSaveDuplicateBank");
    if (btnSaveDuplicateBank) btnSaveDuplicateBank.onclick = async () => {
        btnSaveDuplicateBank.disabled = true;
        try {
            await salvarCadastroDuplicidade();
        } finally {
            btnSaveDuplicateBank.disabled = false;
        }
    };

    document.getElementById("btnOpenImport").onclick = () => window.abrirModal('modalImport');
    document.getElementById("btnConfirmarImport").onclick = () => {
        const t = document.getElementById("textoNomesBulk").value.trim();
        if (t) {
            const adm = db_local.listas[aba_ativa].config.adm;
            const itens = extrairLinhasImportadas(t);
            if (itens.length && nomesEquivalentes(itens[0].nome, adm)) itens.shift();
            db_local.listas[aba_ativa].jogadores = itens.map(processarLinhaImportada);
            db_local.listas[aba_ativa].duplicidadesIgnoradas = [];
            salvar();
        }
        window.fecharModal('modalImport');
    };
    document.getElementById("btnClearAll").onclick = () => {
        if(confirm("Limpar lista?")) {
            const deveManterNumeros = aba_ativa === "ELAX_QUINTA" || aba_ativa === "PRAIA_DOMINGO";
            db_local.listas[aba_ativa].jogadores = deveManterNumeros ? criarJogadoresVaziosParaLista(aba_ativa) : [];
            db_local.listas[aba_ativa].duplicidadesIgnoradas = [];
            salvar();
        }
    };
}

function vincularEventosResumo(listaAtual) {
    document.getElementById("btnCopyWhatsapp").onclick = (e) => {
        const c = listaAtual.config;
        const isFree = c.pix.includes("FREE");
        let texto = `*${c.nomeJogo}*\n📍 ${c.quadra.toUpperCase()} | ${c.data} (${c.dia}) | ${c.inicio} às ${c.fim}\n💰 ${isFree ? '' : 'R$' + c.valor} (${c.limite} pessoas) | ${isFree ? c.pix : 'Pix: ' + c.pix}\n\n1 - ${formatarNome(c.adm)} ✅\n`;
        let separadorEsperaInserido = false;
        listaAtual.jogadores.forEach((j, i) => {
            const posicao = i + 2;
            if (posicao === Number(c.limite) + 1 && !separadorEsperaInserido) {
                texto += `\n*LISTA DE ESPERA ⏰*\n`;
                separadorEsperaInserido = true;
            }
            texto += `${posicao} - ${formatarNome(j.nome)}${j.pago ? ' ✅' : ''}\n`;
        });
        navigator.clipboard.writeText(texto).then(() => mostrarToast(e.clientX, e.clientY));
    };
    const btnToggleForm = document.getElementById("btnToggleForm");
    if (btnToggleForm) {
        btnToggleForm.onclick = async () => {
            await rotacionarFormulario(aba_ativa, !listaAtual.config.formAberto);
            render();
        };
    }
    const btnCopyFormLink = document.getElementById("btnCopyFormLink");
    if (btnCopyFormLink) {
        btnCopyFormLink.onclick = (e) => {
            const urlBase = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            const linkPublico = `${urlBase}form.html?lista=${criarIdentificadorFormulario(aba_ativa, listaAtual.config)}`;
            navigator.clipboard.writeText(linkPublico).then(() => mostrarToast(e.clientX, e.clientY));
        };
    }
    document.querySelectorAll('.edit-text').forEach(el => {
        el.onblur = async () => {
            listaAtual.config[el.getAttribute('data-key')] = el.innerText.trim();
            await salvar();
            await publicarFormularioPublico(aba_ativa, { forcar: true });
            if(['nomeJogo','limite'].includes(el.getAttribute('data-key'))) render();
        };
    });
}

function mostrarToast(x, y) {
    const toast = document.createElement('div');
    toast.className = 'toast-copiado';
    toast.innerText = 'Copiado!';
    toast.style.left = `${x}px`; toast.style.top = `${y}px`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1000);
}

function reordenarItens() {
    const n = [];
    document.querySelectorAll('#listaJogadores .item-compra').forEach(el => {
        const id = el.getAttribute('data-id');
        if (id) { const i = db_local.listas[aba_ativa].jogadores.find(j => String(j.id) === id); if (i) n.push(i); }
    });
    db_local.listas[aba_ativa].jogadores = n; 
    salvar();
}
