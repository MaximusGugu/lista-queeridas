const presets = {
    "TODES_QUARTA": { nomeJogo: "Vôlei de quadra TODES 🏳️‍🌈", quadra: "DOM BOSCO - ITAJAÍ", dia: "Quarta-Feira", inicio: "20h30", fim: "22h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "15,00", adm: "Gustavo José" },
    "TODES_SEXTA": { nomeJogo: "Vôlei de quadra TODES 🏳️‍🌈", quadra: "ESCOLA JOSÉ MEDEIROS VIEIRA - ITAJAÍ", dia: "Sexta-Feira", inicio: "20h", fim: "22h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "10,00", adm: "Gustavo Floriani" },
    "ALLSTARS_QUARTA": { nomeJogo: "Vôlei de quadra ALL STARS ⭐", quadra: "ESCOLA JOSÉ MEDEIROS VIEIRA - ITAJAÍ", dia: "Quarta-Feira", inicio: "20h", fim: "22h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "10,00", adm: "Marcelo Venturin" },
    "ALLSTARS_SABADO": { nomeJogo: "Vôlei de quadra ALL STARS ⭐", quadra: "DOM BOSCO - ITAJAÍ", dia: "Sábado", inicio: "17h", fim: "19h30", limite: 21, pix: "(51) 980644783 (Pagamento até às 14h)", valor: "14,00", adm: "Lucas Caetano" },
    "ELAX_QUINTA": { nomeJogo: "Vôlei de quadra ELAX 🌸", quadra: "E.B GASPAR DA COSTA MORAES - ITAJAÍ", dia: "Quinta-Feira", inicio: "21h", fim: "23h", limite: 18, pix: "(51) 980644783 (Pagamento até às 11h)", valor: "14,00", adm: "Lua" },
    "PRAIA_DOMINGO": { nomeJogo: "😎☀️ JOGO DE AREIA☀️😎", quadra: "Praia Central de BC – Altura da 3700", dia: "Domingo", inicio: "16h", fim: "18h", limite: 15, pix: "💸 Jogo FREE!", valor: "0,00", adm: "Caio Padovan" }
};

let db = JSON.parse(localStorage.getItem("volei_todes_db")) || {
    config: { ...presets["TODES_QUARTA"], modalidade: "TODES_QUARTA", data: "" },
    jogadores: []
};

const listaDOM = document.getElementById("listaJogadores");

if (listaDOM) {
    new Sortable(listaDOM, {
        animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost',
        onEnd: () => reordenarItens()
    });
}

function inicializarMenu() {
    document.querySelectorAll('.btn-cat').forEach(btn => {
        btn.onclick = () => {
            const id = btn.getAttribute('data-id');
            const sel = presets[id];
            if(sel) {
                db.config = { ...db.config, ...sel, modalidade: id };
                
                // Lógica especial ELAX: Preenche 17 espaços vazios
                if (id === "ELAX_QUINTA") {
                    db.jogadores = Array.from({ length: 17 }, (_, i) => ({ id: Date.now() + i, nome: "" }));
                }

                salvar();
                render();
            }
        };
    });
}

function render() {
    const { nomeJogo, quadra, data, dia, inicio, fim, valor, limite, pix, modalidade, adm } = db.config;
    
    document.body.className = `theme-${modalidade.split('_')[0].toLowerCase()}`;
    document.getElementById("tituloApp").innerText = `LISTA ${nomeJogo.toUpperCase()}`;

    document.querySelectorAll('.btn-cat').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-id') === modalidade);
    });

    const isFree = pix.includes("FREE");
    document.getElementById("infoPreview").innerHTML = `
        <div class="edit-text title" contenteditable="true" data-key="nomeJogo">${nomeJogo}</div>
        <div class="info-row">
            📍 <span class="edit-text" contenteditable="true" data-key="quadra">${quadra}</span>
            <span class="sep">|</span>
            <span class="edit-text" contenteditable="true" data-key="data" data-placeholder="dd/mm">${data || 'dd/mm'}</span>
            <span class="sep">(</span><span class="edit-text" contenteditable="true" data-key="dia">${dia}</span><span class="sep">)</span>
        </div>
        <div class="info-row">
            🕒 <span class="edit-text" contenteditable="true" data-key="inicio">${inicio}</span> 
            às <span class="edit-text" contenteditable="true" data-key="fim">${fim}</span>
        </div>
        <div class="info-row">
            💰 ${isFree ? '' : 'R$'} <span class="edit-text" contenteditable="true" data-key="valor" style="${isFree ? 'display:none' : ''}">${valor}</span> 
            <span class="sep">(</span><span class="edit-text" contenteditable="true" data-key="limite">${limite}</span> <span class="small-text">pess.</span><span class="sep">)</span> 
            <span class="sep">|</span> ${isFree ? '' : 'Pix:'} 
            <span class="edit-text" contenteditable="true" data-key="pix">${pix}</span>
        </div>
    `;

    document.querySelectorAll('.edit-text').forEach(el => {
        el.onblur = () => {
            const key = el.getAttribute('data-key');
            db.config[key] = el.innerText.trim();
            salvar();
            if(key === 'nomeJogo' || key === 'limite') render();
        };
        el.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } };
    });

    listaDOM.innerHTML = "";
    // ADM
    const divAdm = document.createElement("div");
    divAdm.className = "item-compra is-adm";
    divAdm.innerHTML = `
        <div class="drag-handle" style="opacity:0">⠿</div>
        <span class="num">1</span>
        <span class="input-item" contenteditable="true" style="color:var(--secondary); font-weight:bold;">${adm} ✅</span>
        <button class="btn-del" style="opacity:0">×</button>
    `;
    divAdm.querySelector('.input-item').onblur = (e) => {
        db.config.adm = e.target.innerText.replace(' ✅', '').trim();
        salvar(); render();
    };
    listaDOM.appendChild(divAdm);

    // Jogadores
    db.jogadores.forEach((jog, index) => {
        const pos = index + 2;
        const isEspera = pos > limite;
        if (pos === limite + 1) {
            const separator = document.createElement("div");
            separator.className = "espera-divider";
            separator.innerText = "Lista de Espera ⏰";
            listaDOM.appendChild(separator);
        }
        const div = document.createElement("div");
        div.className = `item-compra ${isEspera ? 'modo-espera' : ''}`;
        div.setAttribute('data-id', jog.id);
        div.innerHTML = `
            <div class="drag-handle">⠿</div>
            <span class="num">${pos}</span>
            <span class="input-item" contenteditable="true">${jog.nome}</span>
            <button class="btn-del">×</button>
        `;
        div.querySelector(".input-item").onblur = (e) => { jog.nome = e.target.innerText.trim(); salvar(); };
        div.querySelector(".btn-del").onclick = () => { db.jogadores = db.jogadores.filter(j => j.id !== jog.id); salvar(); render(); };
        listaDOM.appendChild(div);
    });
}

document.getElementById("btnConfig").onclick = () => {
    const c = db.config;
    document.getElementById("cfgModalidade").value = c.modalidade;
    document.getElementById("cfgNomeJogo").value = c.nomeJogo;
    document.getElementById("cfgQuadra").value = c.quadra;
    document.getElementById("cfgData").value = c.data;
    document.getElementById("cfgDia").value = c.dia;
    document.getElementById("cfgInicio").value = c.inicio;
    document.getElementById("cfgFim").value = c.fim;
    document.getElementById("cfgValor").value = c.valor;
    document.getElementById("cfgLimite").value = c.limite;
    document.getElementById("cfgPix").value = c.pix;
    document.getElementById("cfgAdm").value = c.adm;
    abrirModal('modalConfig');
};

document.getElementById("btnSalvarConfig").onclick = () => {
    db.config = {
        ...db.config,
        modalidade: document.getElementById("cfgModalidade").value,
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
        const novos = texto.split('\n').map(n => n.trim()).filter(n => n).map(n => ({ id: Date.now() + Math.random(), nome: n }));
        db.jogadores = novos;
        salvar(); render();
    }
    fecharModal('modalImport');
    document.getElementById("textoNomesBulk").value = "";
};

document.getElementById("btnCopyWhatsapp").onclick = () => {
    const c = db.config;
    const isFree = c.pix.includes("FREE");
    let texto = `*${c.nomeJogo}*\n`;
    texto += `📍 ${c.quadra.toUpperCase()} | ${c.data} (${c.dia}) | ${c.inicio} às ${c.fim}\n`;
    texto += `💰 ${isFree ? '' : 'R$' + c.valor} (${c.limite} pessoas) | ${isFree ? c.pix : 'Pix: ' + c.pix}\n\n`;
    
    texto += `1 - ${c.adm} ✅\n`;

    db.jogadores.forEach((j, i) => {
        const pos = i + 2;
        if (pos === c.limite + 1) texto += `\n*Lista de Espera ⏰*\n`;
        // Se o nome for vazio, copia apenas o número e o traço
        let nomeFinal = j.nome ? j.nome : "";
        texto += `${pos} - ${nomeFinal}\n`;
    });
    navigator.clipboard.writeText(texto).then(() => alert("Copiado com sucesso!"));
};

document.getElementById("btnClearAll").onclick = () => { if(confirm("Limpar lista?")) { db.jogadores = []; salvar(); render(); } };

function reordenarItens() {
    const novos = [];
    listaDOM.querySelectorAll('.item-compra').forEach(el => {
        const id = el.getAttribute('data-id');
        if (id) {
            const item = db.jogadores.find(j => String(j.id) === id);
            if (item) novos.push(item);
        }
    });
    db.jogadores = novos;
    salvar(); render();
}

function abrirModal(id) { document.getElementById(id).style.display = "flex"; }
function fecharModal(id) { document.getElementById(id).style.display = "none"; }
function salvar() { localStorage.setItem("volei_todes_db", JSON.stringify(db)); }

inicializarMenu();
render();