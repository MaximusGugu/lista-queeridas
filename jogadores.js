import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";

const docBancoRef = doc(db, "sistema", "banco_notas");
let banco = {};
let nomeAntigoOriginal = "";

auth.onAuthStateChanged((user) => {
    if (user) {
        onSnapshot(docBancoRef, (snap) => {
            banco = snap.exists() ? snap.data() : {};
            const spinner = document.getElementById("loadingSpinner");
            if(spinner) spinner.style.display = "none";
            renderBanco();
        });
    } else { window.location.href = "login.html"; }
});

function formatarNome(nome) {
    if (!nome) return "";
    return nome.toLowerCase().split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

async function salvarFirebase() {
    await setDoc(docBancoRef, banco);
}

window.ajustarNotaManual = (id, v) => {
    const el = document.getElementById(id);
    let val = parseInt(el.innerText);
    val = Math.max(1, Math.min(10, val + v));
    el.innerText = val;
};

window.toggleNotaAllStars = (prefix) => {
    const isChecked = document.getElementById(`${prefix}AllStars`).checked;
    document.getElementById(`group${prefix === 'add' ? 'Add' : 'Edit'}AllStars`).style.display = isChecked ? "flex" : "none";
};

window.adicionarAoBanco = async () => {
    const nome = formatarNome(document.getElementById('addNome').value.trim());
    const apelidos = document.getElementById('addApelidos').value.trim();
    const isAllStar = document.getElementById('addAllStars').checked;
    
    if(!nome) return;
    
    banco[nome] = { 
        notaTodes: parseInt(document.getElementById('addNotaTodes').innerText),
        notaElax: parseInt(document.getElementById('addNotaElax').innerText),
        notaAllStars: isAllStar ? parseInt(document.getElementById('addNotaAllStars').innerText) : 0,
        allStars: isAllStar,
        apelidos: apelidos 
    };

    // Reset formulário
    document.getElementById('addNome').value = "";
    document.getElementById('addApelidos').value = "";
    document.getElementById('addAllStars').checked = false;
    document.getElementById('addNotaTodes').innerText = "3";
    document.getElementById('addNotaElax').innerText = "3";
    document.getElementById('addNotaAllStars').innerText = "3";
    window.toggleNotaAllStars('add');
    
    await salvarFirebase();
};

window.abrirModalEditar = (nome) => {
    nomeAntigoOriginal = nome;
    const info = banco[nome];
    
    document.getElementById("editNome").value = nome;
    document.getElementById("editApelidos").value = info.apelidos || "";
    
    // Fallback para notas antigas (level vira notaTodes)
    document.getElementById("editNotaTodes").innerText = info.notaTodes || info.level || 3;
    document.getElementById("editNotaElax").innerText = info.notaElax || 3;
    document.getElementById("editNotaAllStars").innerText = info.notaAllStars || 3;
    
    const check = document.getElementById("editAllStars");
    check.checked = !!info.allStars;
    window.toggleNotaAllStars('edit');

    document.getElementById("modalEditarJogador").style.display = "flex";
};

window.fecharModalEditar = () => { document.getElementById("modalEditarJogador").style.display = "none"; };

window.salvarEdicaoJogador = async () => {
    const novoNome = formatarNome(document.getElementById("editNome").value.trim());
    const apelidos = document.getElementById("editApelidos").value.trim();
    const isAllStar = document.getElementById("editAllStars").checked;
    
    if (!novoNome) return;
    if (novoNome !== nomeAntigoOriginal) delete banco[nomeAntigoOriginal];

    banco[novoNome] = { 
        notaTodes: parseInt(document.getElementById('editNotaTodes').innerText),
        notaElax: parseInt(document.getElementById('editNotaElax').innerText),
        notaAllStars: isAllStar ? parseInt(document.getElementById('editNotaAllStars').innerText) : 0,
        allStars: isAllStar, 
        apelidos: apelidos 
    };
    
    window.fecharModalEditar();
    await salvarFirebase();
};

window.excluirDoBanco = async (nome) => { if(confirm(`Remover ${nome}?`)) { delete banco[nome]; await salvarFirebase(); } };

window.exportarNotas = () => {
    const chaves = Object.keys(banco).filter(k => k !== "versao").sort();
    let csvContent = "Nome;NotaTodes;NotaElax;NotaAllStar;AllStarStatus;Apelidos\n";
    chaves.forEach(nome => {
        const info = banco[nome];
        csvContent += `${nome};${info.notaTodes || info.level || 3};${info.notaElax || 3};${info.notaAllStars || 0};${info.allStars?'SIM':'NAO'};${info.apelidos || ""}\n`;
    });
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "banco_jogadores_queeridas.csv"; a.click();
};

window.importarNotas = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const content = e.target.result;
            const linhas = content.split("\n");
            const novoB = {};
            for (let i = 1; i < linhas.length; i++) {
                const colunas = linhas[i].split(";");
                if (colunas.length < 2) continue;
                const nome = formatarNome(colunas[0].trim());
                if (nome) {
                    novoB[nome] = { 
                        notaTodes: parseInt(colunas[1]) || 3,
                        notaElax: parseInt(colunas[2]) || 3,
                        notaAllStars: parseInt(colunas[3]) || 0,
                        allStars: colunas[4] === "SIM",
                        apelidos: colunas[5] || ""
                    };
                }
            }
            banco = { ...banco, ...novoB };
            await salvarFirebase();
            alert("Banco atualizado!");
        } catch (err) { alert("Erro na importação."); }
    };
    reader.readAsText(file);
};

function renderBanco() {
    const container = document.getElementById("listaBanco");
    if (!container) return;
    const spinner = document.getElementById("loadingSpinner");
    container.innerHTML = "";
    if(spinner) container.appendChild(spinner);

    const chaves = Object.keys(banco).filter(k => k !== "versao").sort();
    chaves.forEach(nome => {
        const info = banco[nome];
        const star = info.allStars ? ' ⭐' : '';
        const escapedNome = nome.replace(/'/g, "\\'");
        
        // No banco exibimos a nota Todes como principal, mas ao editar abre todas
        const notaExibida = info.notaTodes || info.level || 3;

        const div = document.createElement("div");
        div.className = "item-compra";
        div.innerHTML = `
            <div class="input-item" style="flex: 2;">${nome}${star}</div>
            <div style="font-size: 11px; color: #999; margin-right: 10px;">T: ${notaExibida}</div>
            <div class="action-buttons">
                <button class="btn-edit" onclick="window.abrirModalEditar('${escapedNome}')">✏️</button>
                <button class="btn-del" onclick="window.excluirDoBanco('${escapedNome}')">×</button>
            </div>
        `;
        container.appendChild(div);
    });
}