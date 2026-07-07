const presets = {
    "TODES_QUARTA": { nomeJogo: "Vôlei de quadra TODES 🏳️‍🌈", quadra: "DOM BOSCO - ITAJAÍ", dia: "Quarta-Feira", inicio: "20h30", fim: "22h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "15,00", adm: "Gustavo José" },
    "TODES_SEXTA": { nomeJogo: "Vôlei de quadra TODES 🏳️‍🌈", quadra: "ESCOLA JOSÉ MEDEIROS VIEIRA - ITAJAÍ", dia: "Sexta-Feira", inicio: "20h", fim: "22h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "10,00", adm: "Gustavo Floriani" },
    "ALLSTARS_QUARTA": { nomeJogo: "Vôlei de quadra ALL STARS ⭐", quadra: "ESCOLA JOSÉ MEDEIROS VIEIRA - ITAJAÍ", dia: "Quarta-Feira", inicio: "20h", fim: "22h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "10,00", adm: "Marcelo Venturin" },
    "ALLSTARS_SABADO": { nomeJogo: "Vôlei de quadra ALL STARS ⭐", quadra: "DOM BOSCO - ITAJAÍ", dia: "Sábado", inicio: "17h", fim: "19h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "14,00", adm: "Lucas Caetano" },
    "ELAX_QUINTA": { nomeJogo: "Vôlei de quadra ELAX 🌸", quadra: "E.B GASPAR DA COSTA MORAES - ITAJAÍ", dia: "Quinta-Feira", inicio: "21h", fim: "23h", limite: 18, pix: "(51) 980644783 (Pagamento até às 11h)", valor: "14,00", adm: "Lua Lisboa" },
    "PRAIA_DOMINGO": { nomeJogo: "😎☀️ JOGO DE AREIA☀️😎", quadra: "Praia Central de BC – Altura da 3700", dia: "Domingo", inicio: "16h", fim: "18h", limite: 15, pix: "💸 Jogo FREE!", valor: "0,00", adm: "Caio Padovan" }
};

// Estrutura do banco de dados v3 com Praia e Elax como listas de campos vazios
let db = JSON.parse(localStorage.getItem("volei_todes_db_v3")) || {
    ativa: "TODES_QUARTA",
    listas: {
        "TODES_QUARTA": { config: {...presets["TODES_QUARTA"], data: ""}, jogadores: [] },
        "TODES_SEXTA": { config: {...presets["TODES_SEXTA"], data: ""}, jogadores: [] },
        "ALLSTARS_QUARTA": { config: {...presets["ALLSTARS_QUARTA"], data: ""}, jogadores: [] },
        "ALLSTARS_SABADO": { config: {...presets["ALLSTARS_SABADO"], data: ""}, jogadores: [] },
        "ELAX_QUINTA": { config: {...presets["ELAX_QUINTA"], data: ""}, jogadores: Array.from({ length: 17 }, (_, i) => ({ id: Date.now() + i, nome: "" })) },
        "PRAIA_DOMINGO": { config: {...presets["PRAIA_DOMINGO"], data: ""}, jogadores: Array.from({ length: 14 }, (_, i) => ({ id: Date.now() + i, nome: "" })) }
    }
};

const listaDOM = document.getElementById("listaJogadores");

function calcularProximaData(diaSemana) {
    const mapaDias = { "Domingo": 0, "Segunda-Feira": 1, "Terça-Feira": 2, "Quarta-Feira": 3, "Quinta-Feira": 4, "Sexta-Feira": 5, "Sábado": 6 };
    const hoje = new Date();
    const diferenca = (mapaDias[diaSemana] - hoje.getDay() + 7) % 7;
    const dataResultado = new Date(hoje);
    dataResultado.setDate(hoje.getDate() + diferenca);
    return `${String(dataResultado.getDate()).padStart(2, '0')}/${String(dataResultado.getMonth() + 1).padStart(2, '0')}`;
}

if (listaDOM) {
    new Sortable(listaDOM, { animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost', onEnd: () => reordenarItens() });
}

function inicializarMenu() {
    document.querySelectorAll('.btn-cat').forEach(btn => {
        btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            db.ativa = id;
            db.listas[id].config.data = calcularProximaData(presets[id].dia);
            salvar(); render();
        };
    });
}

function getAtiva() { return db.listas[db.ativa]; }

function render() {
    const listaAtual = getAtiva();
    const { nomeJogo, quadra, data, dia, inicio, fim, valor, limite, pix, adm } = listaAtual.config;
    
    document.body.className = `theme-${db.ativa.split('_')[0].toLowerCase()}`;
    document.getElementById("tituloApp").innerText = `LISTA ${nomeJogo.toUpperCase()}`;

    document.querySelectorAll('.btn-cat').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-id') === db.ativa);
    });

    const isFree = pix.includes("FREE");
    document.getElementById("infoPreview").innerHTML = `
        <div class="edit-text title" contenteditable="true" data-key="nomeJogo">${nomeJogo}</div>
        <div class="info-row">
            📍 <span class="edit-text" contenteditable="true" data-key="quadra">${quadra}</span>
            <span class="sep">|</span>
            <span class="edit-text" contenteditable="true" data-key="data">${data}</span>
            <span class="sep">(</span><span class="edit-text" contenteditable="true" data-key="dia">${dia}</span><span class="sep">)</span>
        </div>
        <div class="info-row">
            🕒 <span class="edit-text" contenteditable="true" data-key="inicio">${inicio}</span> às <span class="edit-text" contenteditable="true" data-key="fim">${fim}</span>
        </div>
        <div class="info-row">
            💰 ${isFree ? '' : 'R$'} <span class="edit-text" contenteditable="true" data-key="valor" style="${isFree ? 'display:none' : ''}">${valor}</span> 
            <span class="sep">(</span><span class="edit-text" contenteditable="true" data-key="limite">${limite}</span> <span class="small-text">pess.</span><span class="sep">)</span> 
            <span class="sep">|</span> ${isFree ? '' : 'Pix:'} <span class="edit-text" contenteditable="true" data-key="pix">${pix}</span>
        </div>
    `;

    document.querySelectorAll('.edit-text').forEach(el => {
        el.onblur = () => { listaAtual.config[el.getAttribute('data-key')] = el.innerText.trim(); salvar(); if(['nomeJogo','limite'].includes(el.getAttribute('data-key'))) render(); };
        el.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } };
    });

    listaDOM.innerHTML = "";
    const divAdm = document.createElement("div");
    divAdm.className = "item-compra is-adm";
    divAdm.innerHTML = `
        <div class="drag-handle" style="opacity:0">⠿</div>
        <span class="num">1</span>
        <span class="input-item" contenteditable="true" style="color:var(--secondary); font-weight:bold;">${adm} ✅</span>
        <button class="btn-del" style="opacity:0">×</button>
    `;
    divAdm.querySelector('.input-item').onblur = (e) => { listaAtual.config.adm = e.target.innerText.replace(' ✅', '').trim(); salvar(); render(); };
    listaDOM.appendChild(divAdm);

    listaAtual.jogadores.forEach((jog, index) => {
        const pos = index + 2;
        if (pos === limite + 1) {
            const separator = document.createElement("div");
            separator.className = "espera-divider";
            separator.innerText = "Lista de Espera ⏰";
            listaDOM.appendChild(separator);
        }
        const div = document.createElement("div");
        div.className = `item-compra ${pos > limite ? 'modo-espera' : ''}`;
        div.setAttribute('data-id', jog.id);
        div.innerHTML = `
            <div class="drag-handle">⠿</div>
            <span class="num">${pos}</span>
            <span class="input-item" contenteditable="true">${jog.nome}</span>
            <button class="btn-del">×</button>
        `;
        div.querySelector(".input-item").onblur = (e) => { jog.nome = e.target.innerText.trim(); salvar(); };
        div.querySelector(".btn-del").onclick = () => { listaAtual.jogadores = listaAtual.jogadores.filter(j => j.id !== jog.id); salvar(); render(); };
        listaDOM.appendChild(div);
    });
}

document.getElementById("btnConfig").onclick = () => {
    const c = getAtiva().config;
    const fields = ["NomeJogo", "Quadra", "Data", "Dia", "Inicio", "Fim", "Valor", "Limite", "Pix", "Adm"];
    document.getElementById("cfgModalidade").value = db.ativa;
    fields.forEach(f => document.getElementById(`cfg${f}`).value = c[f.charAt(0).toLowerCase() + f.slice(1)]);
    abrirModal('modalConfig');
};

document.getElementById("cfgDia").onchange = (e) => { document.getElementById("cfgData").value = calcularProximaData(e.target.value); };

document.getElementById("cfgModalidade").onchange = (e) => {
    const sel = presets[e.target.value];
    if(sel) {
        Object.keys(sel).forEach(k => { const el = document.getElementById(`cfg${k.charAt(0).toUpperCase() + k.slice(1)}`); if(el) el.value = sel[k]; });
        document.getElementById("cfgData").value = calcularProximaData(sel.dia);
    }
};

document.getElementById("btnSalvarConfig").onclick = () => {
    const novaMod = document.getElementById("cfgModalidade").value;
    db.ativa = novaMod;
    db.listas[novaMod].config = {
        ...db.listas[novaMod].config,
        nomeJogo: document.getElementById("cfgNomeJogo").value,
        quadra: document.getElementById("cfgQuadra").value,
        data: document.getElementById("cfgData").value,
        dia: document.getElementById("cfgDia").value,
        inicio: document.getElementById("cfgInicio").value,
        fim: document.getElementById("cfgFim").value,
        valor: document.getElementById("cfgValor").value,
        limite: parseInt(document.getElementById("cfgLimite").value),
        pix: document.getElementById("cfgPix").value,
        adm: document.getElementById("cfgAdm").value
    };
    salvar(); render(); fecharModal('modalConfig');
};

document.getElementById("btnOpenImport").onclick = () => abrirModal('modalImport');
document.getElementById("btnConfirmarImport").onclick = () => {
    const texto = document.getElementById("textoNomesBulk").value.trim();
    if (texto) {
        getAtiva().jogadores = texto.split('\n').map(n => n.trim()).filter(n => n).map(n => ({ id: Date.now() + Math.random(), nome: n }));
        salvar(); render();
    }
    fecharModal('modalImport'); document.getElementById("textoNomesBulk").value = "";
};

document.getElementById("btnCopyWhatsapp").onclick = () => {
    const listaAtual = getAtiva();
    const c = listaAtual.config;
    const isFree = c.pix.includes("FREE");
    let texto = `*${c.nomeJogo}*\n📍 ${c.quadra.toUpperCase()} | ${c.data} (${c.dia}) | ${c.inicio} às ${c.fim}\n💰 ${isFree ? '' : 'R$' + c.valor} (${c.limite} pessoas) | ${isFree ? c.pix : 'Pix: ' + c.pix}\n\n1 - ${c.adm} ✅\n`;
    listaAtual.jogadores.forEach((j, i) => {
        const pos = i + 2;
        if (pos === c.limite + 1) texto += `\n*Lista de Espera ⏰*\n`;
        texto += `${pos} - ${j.nome ? j.nome : ""}\n`;
    });
    navigator.clipboard.writeText(texto).then(() => alert("Copiado com sucesso!"));
};

document.getElementById("btnClearAll").onclick = () => { 
    if(confirm("Limpar lista atual?")) { 
        if(db.ativa === "ELAX_QUINTA") {
            getAtiva().jogadores = Array.from({ length: 17 }, (_, i) => ({ id: Date.now() + i, nome: "" }));
        } else if(db.ativa === "PRAIA_DOMINGO") {
            getAtiva().jogadores = Array.from({ length: 14 }, (_, i) => ({ id: Date.now() + i, nome: "" }));
        } else {
            getAtiva().jogadores = []; 
        }
        salvar(); render(); 
    } 
};

function reordenarItens() {
    const novos = [];
    listaDOM.querySelectorAll('.item-compra').forEach(el => {
        const id = el.getAttribute('data-id');
        if (id) { const item = getAtiva().jogadores.find(j => String(j.id) === id); if (item) novos.push(item); }
    });
    getAtiva().jogadores = novos; salvar(); render();
}

function abrirModal(id) { document.getElementById(id).style.display = "flex"; }
function fecharModal(id) { document.getElementById(id).style.display = "none"; }
function salvar() { localStorage.setItem("volei_todes_db_v3", JSON.stringify(db)); }

inicializarMenu();
render();