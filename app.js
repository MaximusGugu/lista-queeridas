import { db, doc, getDoc, setDoc, onSnapshot, auth } from "./firebase-config.js";

// --- 1. FUNÇÕES GLOBAIS (MODAIS) ---
window.abrirModal = (id) => { const el = document.getElementById(id); if (el) el.style.display = "flex"; };
window.fecharModal = (id) => { const el = document.getElementById(id); if (el) el.style.display = "none"; };

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

// --- 2. INICIALIZAÇÃO FIREBASE ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        onSnapshot(docRef, (snap) => {
            if (snap.exists() && snap.data().listas) {
                db_local.listas = snap.data().listas;
                atualizarDatasAutomaticas();
                render();
            } else { inicializarBancoNovo(); }
        });
        onSnapshot(docBancoRef, (snap) => { if (snap.exists()) bancoNotas = snap.data(); });
        inicializarEventosBotoes();
    } else {
        if (!window.location.pathname.includes("login.html")) window.location.href = "login.html";
    }
});

async function salvar() {
    if (!auth.currentUser) return;
    try {
        const snap = await getDoc(docRef);
        const listasNuvem = snap.exists() && snap.data().listas ? snap.data().listas : {};
        const listasMescladas = mesclarListasComNuvem(listasNuvem, db_local.listas);

        db_local.listas = listasMescladas;
        await setDoc(docRef, { listas: listasMescladas });
    } 
    catch (e) { console.error("Falha ao salvar:", e); }
}

function mesclarListasComNuvem(listasNuvem, listasLocais) {
    const resultado = { ...listasNuvem };

    Object.entries(listasLocais).forEach(([idLista, listaLocal]) => {
        const listaNuvem = listasNuvem[idLista] || {};
        resultado[idLista] = {
            ...listaNuvem,
            ...listaLocal,
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
            config: { ...presets[key], data: calcularProximaData(presets[key].dia), formAberto: false, textoApoio: "", mapaLink: "", grupoLink: LINK_GRUPO_PADRAO, abreDiasAntes: DIAS_ANTES_ABERTURA_PADRAO, abreHorario: HORARIO_ABERTURA_PADRAO },
            jogadores: (key === "ELAX_QUINTA" || key === "PRAIA_DOMINGO") 
                ? Array.from({ length: key === "ELAX_QUINTA" ? 17 : 14 }, (_, i) => ({ id: "p-"+Date.now()+i, nome: "", pago: false }))
                : []
        };
    });
    await salvar();
}

// --- 3. LOGICA DO MODAL DE CONFIGURAÇÃO ---
function carregarDadosNoModal(idLista) {
    const lista = db_local.listas[idLista];
    if (!lista) return;
    const c = lista.config;

    document.getElementById("cfgAdm").value = c.adm || "";
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

// --- 4. RENDERIZAÇÃO ---
function render() {
    const listaAtual = db_local.listas[aba_ativa];
    if (!listaAtual) return;
    const { nomeJogo, quadra, data, dia, inicio, fim, valor, limite, pix, adm, formAberto } = listaAtual.config;
    
    document.body.className = `theme-${aba_ativa.split('_')[0].toLowerCase()}`;
    const tApp = document.getElementById("tituloApp");
    if(tApp) tApp.innerText = `LISTA ${nomeJogo.toUpperCase()}`;
    document.querySelectorAll('.btn-cat').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-id') === aba_ativa));

    const infoPreview = document.getElementById("infoPreview");
    if (infoPreview) {
        const isFree = pix.includes("FREE");
        const urlBase = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
        const linkPublico = `${urlBase}form.html?lista=${aba_ativa}`;

        infoPreview.innerHTML = `
            <div class="info-card-header">
                <div class="edit-text title" contenteditable="true" data-key="nomeJogo">${nomeJogo}</div>
                <button id="btnCopyWhatsapp" class="copy-btn">COPIAR LISTA</button>
            </div>
            <div class="info-row">
                📍 <span class="edit-text" contenteditable="true" data-key="quadra">${quadra}</span> | 
                <span class="edit-text" contenteditable="true" data-key="data">${data || 'dd/mm'}</span>
                (<span class="edit-day-trigger" style="cursor:pointer; text-decoration:underline dotted;">${dia}</span>)
            </div>
            <div class="info-row">🕒 ${inicio} às ${fim}</div>
            <div class="info-row">💰 ${isFree ? pix : 'R$ ' + valor + ' | Pix: ' + pix}</div>
            
            <div style="margin-top:15px; padding-top:10px; border-top:1px dashed #ddd; font-size:11px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <div style="flex:1">
                        <b>LINK DO FORMULÁRIO:</b><br>
                        <span style="color:var(--color-praia); word-break:break-all;">${linkPublico}</span>
                    </div>
                    <button id="btnCopyFormLink" class="copy-link-btn">Copiar Link 🔗</button>
                </div>
                <div class="form-status-control">
                    <span>STATUS: <b style="color:${formAberto ? '#059669' : '#e11d48'}">${formAberto ? '🔓 ABERTO (Aceitando nomes)' : '🔒 FECHADO (Link desativado)'}</b></span>
                    <button id="btnToggleForm" class="status-toggle-btn ${formAberto ? 'is-open' : 'is-closed'}">${formAberto ? 'FECHAR FORMULÁRIO' : 'ABRIR FORMULÁRIO'}</button>
                </div>
            </div>
        `;
        vincularEventosResumo(listaAtual);
    }
    renderLista(listaAtual, limite, adm);
}

function renderLista(listaAtual, limite, adm) {
    const listaDOM = document.getElementById("listaJogadores");
    if (!listaDOM) return;
    listaDOM.innerHTML = "";
    
    // Item do ADM
    const divAdm = document.createElement("div");
    divAdm.className = "item-compra is-adm";
    divAdm.innerHTML = `<span class="num">1</span><span class="input-item" contenteditable="true">${formatarNome(adm)}</span><div style="width:26px; margin-right:5px;"></div><button class="btn-del" style="opacity:0">×</button>`;
    divAdm.querySelector('.input-item').onblur = (e) => { listaAtual.config.adm = formatarNome(e.target.innerText.trim()); salvar(); };
    listaDOM.appendChild(divAdm);

    // Identifica quem são os jogadores dentro do limite principal (ADM + jogadores)
    const principal = listaAtual.jogadores.slice(0, limite - 1);
    const todosPagos = principal.length > 0 && principal.every(j => j.pago && j.nome.trim().length > 0);

    // Preparar o botão para ser inserido no momento certo
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

        // Se chegamos no limite da lista principal, insere o botão (se habilitado) e o divisor
        if (pos === limite + 1) {
            if (bFechar) {
                listaDOM.appendChild(bFechar);
                botaoInserido = true;
            }
            const s = document.createElement("div");
            s.className = "espera-divider";
            s.innerText = "Lista de Espera ⏰";
            listaDOM.appendChild(s);
        }

        const div = document.createElement("div");
        div.className = `item-compra ${pos > limite ? 'modo-espera' : ''} ${jog.pago ? 'is-pago' : ''}`;
        div.setAttribute('data-id', jog.id);
        div.innerHTML = `
            <div class="drag-handle">⠿</div>
            <span class="num">${pos}</span>
            <span class="input-item" contenteditable="true">${formatarNome(jog.nome)}</span>
            <input type="checkbox" class="check-pago" ${jog.pago ? 'checked' : ''}>
            <button class="btn-del">×</button>
        `;
        div.querySelector(".input-item").onblur = (e) => { jog.nome = formatarNome(e.target.innerText.trim()); salvar(); };
        div.querySelector(".check-pago").onchange = (e) => { jog.pago = e.target.checked; salvar(); render(); };
        div.querySelector(".btn-del").onclick = () => { listaAtual.jogadores = listaAtual.jogadores.filter(j => j.id !== jog.id); salvar(); };
        listaDOM.appendChild(div);
    });

    // CORREÇÃO: Se a lista terminou e o botão ainda não foi inserido (porque não atingiu o limite de espera), insere no final
    if (bFechar && !botaoInserido) {
        listaDOM.appendChild(bFechar);
    }

    if (!listaDOM.dataset.sortable) {
         new Sortable(listaDOM, { animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost', onEnd: () => reordenarItens() });
         listaDOM.dataset.sortable = "true";
    }
}

// --- 5. FUNÇÕES DE SUPORTE ---
function formatarNome(n) { return n ? n.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : ""; }

function encontrarFuzzyMatch(nomeImportado, banco) {
    const normalizar = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const nomeLimp = normalizar(nomeImportado);
    if (!nomeLimp) return null;
    const chaves = Object.keys(banco);
    for (let nomeOficial of chaves) {
        const info = banco[nomeOficial];
        if (normalizar(nomeOficial) === nomeLimp) return nomeOficial;
        if (info.apelidos && info.apelidos.split(',').map(a => normalizar(a)).includes(nomeLimp)) return nomeOficial;
    }
    const candidatos = chaves.filter(nomeOficial => {
        const info = banco[nomeOficial];
        const textoBusca = normalizar(nomeOficial + " " + (info.apelidos || ""));
        return normalizar(nomeImportado).split(/\s+/).every(palavra => textoBusca.includes(palavra));
    });
    return candidatos.length === 1 ? candidatos[0] : null;
}

function processarLinhaImportada(l) {
    const p = l.includes('✅');
    const n = l.replace(/^\d+[\s.-]*/, '').replace(/[✅]/g, '').trim();
    return { id: "p-"+Date.now()+Math.random(), nome: formatarNome(n), pago: p };
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
    data.setHours(0, 0, 0, 0);
    return data < hoje;
}

function dataCombinaComDia(dataTexto, diaSemana) {
    const mapaDias = { "Domingo": 0, "Segunda-Feira": 1, "Terça-Feira": 2, "Quarta-Feira": 3, "Quinta-Feira": 4, "Sexta-Feira": 5, "Sábado": 6 };
    const partes = /^(\d{2})\/(\d{2})$/.exec((dataTexto || "").trim());
    if (!partes || mapaDias[diaSemana] === undefined) return false;

    const hoje = new Date();
    const data = new Date(hoje.getFullYear(), Number(partes[2]) - 1, Number(partes[1]));
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

    if (houveMudanca) salvar();
}

async function fecharListaEMontarTimes(listaAtual) {
    const pagantes = [];
    const obterDadosCompleto = (nomeDigitado) => {
        const match = encontrarFuzzyMatch(nomeDigitado, bancoNotas);
        if (match) {
            const info = bancoNotas[match];
            return { nome: match, level: Number(info.level || 3), allStars: !!info.allStars, locked: false };
        }
        return { nome: formatarNome(nomeDigitado), level: 3, allStars: false, locked: false };
    };

    if (listaAtual.config.adm) pagantes.push({ id: "adm-"+Date.now(), ...obterDadosCompleto(listaAtual.config.adm) });
    listaAtual.jogadores.slice(0, listaAtual.config.limite - 1).forEach(j => {
        if (j.nome && j.nome.trim() !== "") pagantes.push({ id: j.id, ...obterDadosCompleto(j.nome) });
    });

    const docTimesRef = doc(db, "sistema", "montador_times");
    await setDoc(docTimesRef, { players: pagantes, teams: [], fase: "rating", timestamp: Date.now() });
    window.location.href = "times.html";
}

// --- 6. EVENTOS DE BOTÕES ---
function inicializarEventosBotoes() {
    document.querySelectorAll('.btn-cat').forEach(btn => {
        btn.onclick = async () => {
            aba_ativa = btn.getAttribute('data-id');
            localStorage.setItem("queeridas_aba_ativa", aba_ativa);
            render();
        };
    });

    const bCfg = document.getElementById("btnConfig");
    if(bCfg) bCfg.onclick = () => {
        document.getElementById("cfgModalidade").value = aba_ativa;
        carregarDadosNoModal(aba_ativa);
        window.abrirModal('modalConfig');
    };

    const selModalidade = document.getElementById("cfgModalidade");
    if(selModalidade) {
        selModalidade.onchange = (e) => carregarDadosNoModal(e.target.value);
    }

    const selDia = document.getElementById("cfgDia");
    if(selDia) {
        selDia.onchange = (e) => {
            document.getElementById("cfgData").value = calcularProximaData(e.target.value);
        };
    }

    const bSav = document.getElementById("btnSalvarConfig");
    if(bSav) bSav.onclick = async () => {
        const mod = document.getElementById("cfgModalidade").value;
        const diaSelecionado = document.getElementById("cfgDia").value;
        const dataInformada = document.getElementById("cfgData").value.trim();
        db_local.listas[mod].config = { 
            ...db_local.listas[mod].config, 
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
            formAberto: document.getElementById("cfgFormStatus").value === "true",
            textoApoio: document.getElementById("cfgTextoApoio").value
        };
        await salvar(); 
        window.fecharModal('modalConfig');
    };

    document.getElementById("btnOpenImport").onclick = () => window.abrirModal('modalImport');
    document.getElementById("btnConfirmarImport").onclick = () => {
        const t = document.getElementById("textoNomesBulk").value.trim();
        if (t) { db_local.listas[aba_ativa].jogadores = t.split('\n').map(l => processarLinhaImportada(l)).filter(j => j.nome.length > 0); salvar(); }
        window.fecharModal('modalImport');
    };
    document.getElementById("btnClearAll").onclick = () => { if(confirm("Limpar lista?")) { db_local.listas[aba_ativa].jogadores = []; salvar(); } };
}

function vincularEventosResumo(listaAtual) {
    document.getElementById("btnCopyWhatsapp").onclick = (e) => {
        const c = listaAtual.config;
        const isFree = c.pix.includes("FREE");
        let texto = `*${c.nomeJogo}*\n📍 ${c.quadra.toUpperCase()} | ${c.data} (${c.dia}) | ${c.inicio} às ${c.fim}\n💰 ${isFree ? '' : 'R$' + c.valor} (${c.limite} pessoas) | ${isFree ? c.pix : 'Pix: ' + c.pix}\n\n1 - ${formatarNome(c.adm)} ✅\n`;
        listaAtual.jogadores.forEach((j, i) => { texto += `${i + 2} - ${formatarNome(j.nome)}${j.pago ? ' ✅' : ''}\n`; });
        navigator.clipboard.writeText(texto).then(() => mostrarToast(e.clientX, e.clientY));
    };

    const btnToggleForm = document.getElementById("btnToggleForm");
    if (btnToggleForm) {
        btnToggleForm.onclick = async () => {
            listaAtual.config.formAberto = !listaAtual.config.formAberto;
            await salvar();
            render();
        };
    }

    const btnCopyFormLink = document.getElementById("btnCopyFormLink");
    if (btnCopyFormLink) {
        btnCopyFormLink.onclick = (e) => {
            const urlBase = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            const linkPublico = `${urlBase}form.html?lista=${aba_ativa}`;
            navigator.clipboard.writeText(linkPublico).then(() => mostrarToast(e.clientX, e.clientY));
        };
    }

    document.querySelectorAll('.edit-text').forEach(el => {
        el.onblur = () => {
            listaAtual.config[el.getAttribute('data-key')] = el.innerText.trim();
            salvar();
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