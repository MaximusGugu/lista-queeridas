import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";

// --- 1. FUNÇÕES DE MODAL GLOBAIS (DEFINIDAS PRIMEIRO DE TUDO) ---
window.abrirModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "flex";
};

window.fecharModal = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
};

// --- 2. CONFIGURAÇÕES E PRESETS ---
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

// --- 3. INICIALIZAÇÃO FIREBASE ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        onSnapshot(docRef, (snap) => {
            if (snap.exists() && snap.data().listas) {
                db_local.listas = snap.data().listas;
                render();
            } else {
                inicializarBancoNovo();
            }
        });
        onSnapshot(docBancoRef, (snap) => { if (snap.exists()) bancoNotas = snap.data(); });
        inicializarEventosBotoes();
    } else {
        if (!window.location.pathname.includes("login.html")) window.location.href = "login.html";
    }
});

async function salvar() {
    if (!auth.currentUser) return;
    try { await setDoc(docRef, { listas: db_local.listas }); } 
    catch (e) { console.error("Falha ao salvar:", e); }
}

async function inicializarBancoNovo() {
    Object.keys(presets).forEach(key => {
        db_local.listas[key] = {
            config: { ...presets[key], data: calcularProximaData(presets[key].dia) },
            jogadores: (key === "ELAX_QUINTA" || key === "PRAIA_DOMINGO") 
                ? Array.from({ length: key === "ELAX_QUINTA" ? 17 : 14 }, (_, i) => ({ id: "p-"+Date.now()+i, nome: "", pago: false }))
                : []
        };
    });
    await salvar();
}

// --- 4. RENDERIZAÇÃO ---
function render() {
    const listaAtual = db_local.listas[aba_ativa];
    if (!listaAtual) return;

    const { nomeJogo, quadra, data, dia, inicio, fim, valor, limite, pix, adm } = listaAtual.config;
    document.body.className = `theme-${aba_ativa.split('_')[0].toLowerCase()}`;
    
    const tApp = document.getElementById("tituloApp");
    if(tApp) tApp.innerText = `LISTA ${nomeJogo.toUpperCase()}`;

    document.querySelectorAll('.btn-cat').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-id') === aba_ativa);
    });

    const infoPreview = document.getElementById("infoPreview");
    if (infoPreview) {
        const isFree = pix.includes("FREE");
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
        `;
        vincularEventosResumo(listaAtual);
    }
    renderLista(listaAtual, limite, adm);
}

function renderLista(listaAtual, limite, adm) {
    const listaDOM = document.getElementById("listaJogadores");
    if (!listaDOM) return;
    listaDOM.innerHTML = "";
    
    const divAdm = document.createElement("div");
    divAdm.className = "item-compra is-adm";
    divAdm.innerHTML = `<span class="num">1</span><span class="input-item" contenteditable="true">${formatarNome(adm)}</span><div style="width:26px; margin-right:5px;"></div><button class="btn-del" style="opacity:0">×</button>`;
    divAdm.querySelector('.input-item').onblur = (e) => { listaAtual.config.adm = formatarNome(e.target.innerText.trim()); salvar(); };
    listaDOM.appendChild(divAdm);

    const principal = listaAtual.jogadores.slice(0, limite - 1);
    const todosPagos = principal.length > 0 && principal.every(j => j.pago && j.nome.trim().length > 0);

    listaAtual.jogadores.forEach((jog, index) => {
        const pos = index + 2;
        if (pos === limite + 1) {
            if (todosPagos) {
                const b = document.createElement("button"); b.className = "btn-fechar-lista"; b.innerText = "FECHAR LISTA E MONTAR TIMES";
                b.onclick = () => fecharListaEMontarTimes(listaAtual); listaDOM.appendChild(b);
            }
            const s = document.createElement("div"); s.className = "espera-divider"; s.innerText = "Lista de Espera ⏰";
            listaDOM.appendChild(s);
        }
        const div = document.createElement("div");
        div.className = `item-compra ${pos > limite ? 'modo-espera' : ''}`;
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

    if (!listaDOM.dataset.sortable) {
         new Sortable(listaDOM, { animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost', onEnd: () => reordenarItens() });
         listaDOM.dataset.sortable = "true";
    }
}

// --- 5. EVENTOS ---
function inicializarEventosBotoes() {
    document.querySelectorAll('.btn-cat').forEach(btn => {
        btn.onclick = async () => {
            aba_ativa = btn.getAttribute('data-id');
            localStorage.setItem("queeridas_aba_ativa", aba_ativa);
            const lista = db_local.listas[aba_ativa];
            if (lista && !lista.config.data) {
                lista.config.data = calcularProximaData(presets[aba_ativa].dia);
                await salvar();
            }
            render();
        };
    });

    const bCfg = document.getElementById("btnConfig");
    if(bCfg) bCfg.onclick = () => {
        const c = db_local.listas[aba_ativa].config;
        document.getElementById("cfgModalidade").value = aba_ativa;
        ["NomeJogo", "Quadra", "Data", "Dia", "Inicio", "Fim", "Valor", "Limite", "Pix", "Adm"].forEach(f => {
            const el = document.getElementById(`cfg${f}`); if(el) el.value = c[f.charAt(0).toLowerCase() + f.slice(1)];
        });
        window.abrirModal('modalConfig');
    };

    const selectDiaModal = document.getElementById("cfgDia");
    if(selectDiaModal) {
        selectDiaModal.onchange = (e) => {
            document.getElementById("cfgData").value = calcularProximaData(e.target.value);
        };
    }

    const bSav = document.getElementById("btnSalvarConfig");
    if(bSav) bSav.onclick = async () => {
        const mod = document.getElementById("cfgModalidade").value;
        db_local.listas[mod].config = {
            ...db_local.listas[mod].config,
            nomeJogo: document.getElementById("cfgNomeJogo").value,
            quadra: document.getElementById("cfgQuadra").value,
            data: document.getElementById("cfgData").value,
            dia: document.getElementById("cfgDia").value,
            inicio: document.getElementById("cfgInicio").value,
            fim: document.getElementById("cfgFim").value,
            valor: document.getElementById("cfgValor").value,
            limite: parseInt(document.getElementById("cfgLimite").value),
            pix: document.getElementById("cfgPix").value,
            adm: formatarNome(document.getElementById("cfgAdm").value)
        };
        await salvar(); window.fecharModal('modalConfig');
    };

    const bImp = document.getElementById("btnConfirmarImport");
    if(bImp) bImp.onclick = () => {
        const t = document.getElementById("textoNomesBulk").value.trim();
        if (t) {
            db_local.listas[aba_ativa].jogadores = t.split('\n').map(l => processarLinhaImportada(l)).filter(j => j.nome.length > 0);
            salvar();
        }
        window.fecharModal('modalImport');
    };

    const bOpn = document.getElementById("btnOpenImport");
    if(bOpn) bOpn.onclick = () => window.abrirModal('modalImport');

    const bClr = document.getElementById("btnClearAll");
    if(bClr) bClr.onclick = () => { 
        if(confirm("Limpar lista atual?")) { 
            db_local.listas[aba_ativa].jogadores = (aba_ativa === "ELAX_QUINTA" || aba_ativa === "PRAIA_DOMINGO") ? Array.from({ length: aba_ativa === "ELAX_QUINTA" ? 17 : 14 }, (_, i) => ({ id: "p-"+Date.now()+i, nome: "", pago: false })) : [];
            salvar(); 
        } 
    };
}

function vincularEventosResumo(listaAtual) {
    const diaTrig = document.querySelector('.edit-day-trigger');
    if (diaTrig) {
        diaTrig.onclick = () => {
            const currentDia = diaTrig.innerText;
            const sel = document.createElement('select');
            sel.className = 'edit-resumo-select';
            ["Segunda-Feira", "Terça-Feira", "Quarta-Feira", "Quinta-Feira", "Sexta-Feira", "Sábado", "Domingo"].forEach(d => {
                const opt = document.createElement('option'); opt.value = d; opt.text = d;
                if(d === currentDia) opt.selected = true; sel.appendChild(opt);
            });
            diaTrig.replaceWith(sel); sel.focus();
            sel.onchange = async () => {
                listaAtual.config.dia = sel.value;
                listaAtual.config.data = calcularProximaData(sel.value);
                await salvar(); render();
            };
            sel.onblur = () => render();
        };
    }

    const bCp = document.getElementById("btnCopyWhatsapp");
    if(bCp) bCp.onclick = (e) => {
        const c = listaAtual.config;
        const isFree = c.pix.includes("FREE");
        let texto = `*${c.nomeJogo}*\n📍 ${c.quadra.toUpperCase()} | ${c.data} (${c.dia}) | ${c.inicio} às ${c.fim}\n💰 ${isFree ? '' : 'R$' + c.valor} (${c.limite} pessoas) | ${isFree ? c.pix : 'Pix: ' + c.pix}\n\n1 - ${formatarNome(c.adm)} ✅\n`;
        listaAtual.jogadores.forEach((j, i) => {
            texto += `${i + 2} - ${formatarNome(j.nome)}${j.pago ? ' ✅' : ''}\n`;
        });
        navigator.clipboard.writeText(texto).then(() => mostrarToast(e.clientX, e.clientY));
    };

    document.querySelectorAll('.edit-text').forEach(el => {
        el.onblur = () => {
            listaAtual.config[el.getAttribute('data-key')] = el.innerText.trim();
            salvar();
            if(['nomeJogo','limite'].includes(el.getAttribute('data-key'))) render();
        };
        el.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } };
    });
}

// --- 6. AUXILIARES ---
function formatarNome(n) { return n ? n.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : ""; }

function processarLinhaImportada(l) {
    const p = l.includes('✅');
    const n = l.replace(/^\d+[\s.-]*/, '').replace(/[✅]/g, '').trim();
    return { id: "p-"+Date.now()+Math.random(), nome: formatarNome(n), pago: p };
}

function calcularProximaData(diaSemana) {
    const mapaDias = { "Domingo": 0, "Segunda-Feira": 1, "Terça-Feira": 2, "Quarta-Feira": 3, "Quinta-Feira": 4, "Sexta-Feira": 5, "Sábado": 6 };
    const hoje = new Date();
    const diferenca = (mapaDias[diaSemana] - hoje.getDay() + 7) % 7;
    const dataResultado = new Date(hoje);
    dataResultado.setDate(hoje.getDate() + diferenca);
    return `${String(dataResultado.getDate()).padStart(2, '0')}/${String(dataResultado.getMonth() + 1).padStart(2, '0')}`;
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
    db_local.listas[aba_ativa].jogadores = n; salvar();
}

async function fecharListaEMontarTimes(listaAtual) {
    const pagantes = [];
    const obterNivelENome = (nome) => {
        const nFormatado = formatarNome(nome);
        const chaveEncontrada = encontrarFuzzyMatch(nome, bancoNotas);
        let level = 3;
        if (chaveEncontrada && bancoNotas[chaveEncontrada] !== undefined) {
            const info = bancoNotas[chaveEncontrada];
            level = info && typeof info === "object" ? info.level : (Number(info) || 3);
        }
        return { nome: chaveEncontrada || nFormatado, level: level };
    };
    
    // Adiciona o ADM
    const admInfo = obterNivelENome(listaAtual.config.adm);
    pagantes.push({ id: "adm-"+Date.now(), nome: admInfo.nome, level: admInfo.level, locked: false });
    
    // Adiciona apenas os jogadores da lista principal (quem pagou)
    listaAtual.jogadores.slice(0, listaAtual.config.limite - 1).forEach(j => {
        const pInfo = obterNivelENome(j.nome);
        pagantes.push({ id: j.id, nome: pInfo.nome, level: pInfo.level, locked: false });
    });

    const docTimesRef = doc(db, "sistema", "montador_times");
    try {
        await setDoc(docTimesRef, { players: pagantes, teams: [], fase: "rating" });
        window.location.href = "times.html";
    } catch (e) { console.error(e); }
}

function encontrarFuzzyMatch(nomeImportado, banco) {
    const normalizar = (str) => 
        str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    const nomeLimp = normalizar(nomeImportado);
    if (!nomeLimp) return null;

    const chaves = Object.keys(banco);
    const palavrasImp = nomeLimp.split(/\s+/);

    // 1. Tenta Match Exato primeiro
    const exactMatch = chaves.find(k => normalizar(k) === nomeLimp);
    if (exactMatch) return exactMatch;

    // 2. Filtra o banco por nomes que contenham TODAS as palavras enviadas
    // Ex: "João Carlos" vai filtrar "João Carlos Pozzo" e "João Carlos Silva"
    const candidatos = chaves.filter(chave => {
        const nomeBancoLimp = normalizar(chave);
        return palavrasImp.every(palavra => nomeBancoLimp.includes(palavra));
    });

    // Se encontrou EXATAMENTE UM candidato, retorna ele.
    // Se houver mais de um (conflito), retorna null para o ADM conferir manualmente.
    if (candidatos.length === 1) {
        return candidatos[0];
    }

    // 3. Fallback para apelidos de primeiro nome (Leo -> Leonardo)
    // Só roda se não achou candidatos na etapa anterior
    if (palavrasImp.length === 1) {
        const apelido = palavrasImp[0];
        const matchesApelido = chaves.filter(k => normalizar(k).split(/\s+/)[0].startsWith(apelido));
        if (matchesApelido.length === 1) return matchesApelido[0];
    }

    return null;
}