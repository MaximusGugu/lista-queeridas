let db = JSON.parse(localStorage.getItem("volei_todes_db")) || {
    config: {
        nomeJogo: "Vôlei de quadra TODES 🏳️‍🌈",
        quadra: "DOM BOSCO - ITAJAÍ",
        data: "01/07",
        dia: "Quarta-Feira",
        inicio: "20h30",
        fim: "22h30",
        valor: "15,00",
        limite: 21,
        pix: "(51) 980644783 (Pagamento até às 11h)"
    },
    jogadores: []
};

const listaDOM = document.getElementById("listaJogadores");

if (listaDOM) {
    new Sortable(listaDOM, {
        animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost',
        onEnd: () => reordenarItens()
    });
}

function render() {
    const { nomeJogo, quadra, data, dia, inicio, fim, valor, limite, pix } = db.config;
    
    // Preview do Cabeçalho no App
    document.getElementById("infoPreview").innerHTML = `
        <div style="font-weight: bold; color: var(--secondary); margin-bottom: 5px; font-size: 16px;">${nomeJogo}</div>
        <small>📍 ${quadra} | ${data} (${dia}) | ${inicio} às ${fim}</small><br>
        <small>💰 R$ ${valor} (${limite} pessoas) | Pix: ${pix}</small>
    `;

    listaDOM.innerHTML = "";
    
    db.jogadores.forEach((jog, index) => {
        const isEspera = index >= limite;
        
        if (index === limite) {
            const separator = document.createElement("div");
            separator.className = "espera-divider";
            separator.innerText = "Lista de Espera";
            listaDOM.appendChild(separator);
        }

        const div = document.createElement("div");
        div.className = `item-compra ${isEspera ? 'modo-espera' : ''}`;
        div.setAttribute('data-id', jog.id);
        
        div.innerHTML = `
            <div class="drag-handle">⠿</div>
            <span class="num">${index + 1}</span>
            <input type="text" class="input-item" value="${jog.nome}">
            <button class="btn-del">×</button>
        `;

        const inputNome = div.querySelector(".input-item");
        const btnDel = div.querySelector(".btn-del");

        inputNome.onblur = () => { jog.nome = inputNome.value; salvar(); };
        btnDel.onclick = () => { 
            db.jogadores = db.jogadores.filter(j => j.id !== jog.id); 
            salvar(); render(); 
        };

        listaDOM.appendChild(div);
    });
}

function abrirModal(id) { document.getElementById(id).style.display = "flex"; }
function fecharModal(id) { document.getElementById(id).style.display = "none"; }

document.getElementById("btnConfig").onclick = () => {
    document.getElementById("cfgNomeJogo").value = db.config.nomeJogo || "";
    document.getElementById("cfgQuadra").value = db.config.quadra;
    document.getElementById("cfgData").value = db.config.data;
    document.getElementById("cfgDia").value = db.config.dia;
    document.getElementById("cfgInicio").value = db.config.inicio;
    document.getElementById("cfgFim").value = db.config.fim;
    document.getElementById("cfgValor").value = db.config.valor;
    document.getElementById("cfgLimite").value = db.config.limite;
    document.getElementById("cfgPix").value = db.config.pix;
    abrirModal('modalConfig');
};

document.getElementById("btnSalvarConfig").onclick = () => {
    db.config = {
        nomeJogo: document.getElementById("cfgNomeJogo").value,
        quadra: document.getElementById("cfgQuadra").value,
        data: document.getElementById("cfgData").value,
        dia: document.getElementById("cfgDia").value,
        inicio: document.getElementById("cfgInicio").value,
        fim: document.getElementById("cfgFim").value,
        valor: document.getElementById("cfgValor").value,
        limite: parseInt(document.getElementById("cfgLimite").value),
        pix: document.getElementById("cfgPix").value
    };
    salvar(); render(); fecharModal('modalConfig');
};

document.getElementById("btnOpenImport").onclick = () => abrirModal('modalImport');
document.getElementById("btnConfirmarImport").onclick = () => {
    const texto = document.getElementById("textoNomesBulk").value.trim();
    if (texto) {
        const novosNomes = texto.split('\n')
            .map(n => n.trim())
            .filter(n => n !== "")
            .map(n => ({ id: Date.now() + Math.random(), nome: n }));
        
        db.jogadores = [...db.jogadores, ...novosNomes];
        salvar(); render();
    }
    fecharModal('modalImport');
    document.getElementById("textoNomesBulk").value = "";
};

document.getElementById("btnCopyWhatsapp").onclick = () => {
    const c = db.config;
    // FORMATAÇÃO DO WHATSAPP AQUI
    let textoFinal = `*${c.nomeJogo}*\n`;
    textoFinal += `📍 ${c.quadra.toUpperCase()} | ${c.data} (${c.dia}) - ${c.inicio} às ${c.fim} | Valor por pessoa: R$${c.valor} (${c.limite} pessoas) 💰 | Pix: ${c.pix}\n\n`;

    db.jogadores.forEach((jog, index) => {
        if (index === c.limite) {
            textoFinal += `\n*Lista de Espera*\n`;
        }
        textoFinal += `${index + 1} - ${jog.nome}\n`;
    });

    navigator.clipboard.writeText(textoFinal).then(() => {
        alert("Lista copiada com sucesso!");
    });
};

document.getElementById("btnClearAll").onclick = () => {
    if(confirm("Deseja apagar todos os nomes da lista?")) {
        db.jogadores = [];
        salvar(); render();
    }
};

function reordenarItens() {
    const novosItens = [];
    listaDOM.querySelectorAll('.item-compra').forEach(el => {
        const id = el.getAttribute('data-id');
        const item = db.jogadores.find(j => String(j.id) === String(id));
        if (item) novosItens.push(item);
    });
    db.jogadores = novosItens;
    salvar();
    render();
}

function salvar() { localStorage.setItem("volei_todes_db", JSON.stringify(db)); }

render();