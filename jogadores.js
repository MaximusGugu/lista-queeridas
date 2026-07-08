import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";

const docBancoRef = doc(db, "sistema", "banco_notas");
let banco = {};
let nivelTemporario = 3;
let nivelEditarTemporario = 3;
let nomeAntigoOriginal = "";

auth.onAuthStateChanged((user) => {
    if (user) {
        onSnapshot(docBancoRef, (snap) => {
            banco = snap.exists() ? snap.data() : {};
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

window.ajustarNovoNivel = (v) => { 
    nivelTemporario = Math.max(1, Math.min(10, nivelTemporario + v)); 
    document.getElementById('novoNivel').innerText = nivelTemporario; 
};

window.adicionarAoBanco = async () => {
    const input = document.getElementById('addNome');
    const checkAllStars = document.getElementById('addAllStars');
    const nome = formatarNome(input.value.trim());
    if(!nome) return;
    banco[nome] = { level: nivelTemporario, allStars: checkAllStars ? checkAllStars.checked : false, apelidos: "" };
    input.value = "";
    if (checkAllStars) checkAllStars.checked = false;
    nivelTemporario = 3;
    document.getElementById('novoNivel').innerText = 3;
    await salvarFirebase();
};

window.abrirModalEditar = (nome) => {
    nomeAntigoOriginal = nome;
    const info = banco[nome];
    nivelEditarTemporario = info.level || info.nota || 3;
    document.getElementById("editNome").value = nome;
    document.getElementById("editApelidos").value = info.apelidos || "";
    document.getElementById("editNivel").innerText = nivelEditarTemporario;
    document.getElementById("editAllStars").checked = !!(info.allStars || info.allStar);
    document.getElementById("modalEditarJogador").style.display = "flex";
};

window.fecharModalEditar = () => { document.getElementById("modalEditarJogador").style.display = "none"; };

window.ajustarEditarNivel = (v) => {
    nivelEditarTemporario = Math.max(1, Math.min(10, nivelEditarTemporario + v));
    document.getElementById('editNivel').innerText = nivelEditarTemporario;
};

window.salvarEdicaoJogador = async () => {
    const novoNome = formatarNome(document.getElementById("editNome").value.trim());
    const apelidos = document.getElementById("editApelidos").value.trim();
    const allStars = document.getElementById("editAllStars").checked;
    if (!novoNome) return;
    if (novoNome !== nomeAntigoOriginal) delete banco[nomeAntigoOriginal];
    banco[novoNome] = { level: nivelEditarTemporario, allStars: allStars, apelidos: apelidos };
    window.fecharModalEditar();
    await salvarFirebase();
};

window.alterarNivelNoBanco = async (nome, delta) => {
    const info = banco[nome];
    const levelAtual = info.level || info.nota || 3;
    banco[nome].level = Math.max(1, Math.min(10, levelAtual + delta));
    await salvarFirebase();
};

window.excluirDoBanco = async (nome) => { if(confirm(`Remover ${nome}?`)) { delete banco[nome]; await salvarFirebase(); } };

window.exportarNotas = () => {
    const data = JSON.stringify(banco, null, 2);
    const blob = new Blob([data], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "notas_queeridas.json"; a.click();
};

window.importarNotas = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const novoB = {};
            Object.entries(data).forEach(([nome, val]) => {
                const n = formatarNome(nome);
                if (val && typeof val === "object") {
                    novoB[n] = { level: Number(val.level || val.nota || 3), allStars: !!(val.allStars || val.allStar), apelidos: val.apelidos || "" };
                } else { novoB[n] = { level: Number(val) || 3, allStars: false, apelidos: "" }; }
            });
            banco = { ...banco, ...novoB };
            await salvarFirebase();
            alert("Notas importadas!");
        } catch (err) { alert("Erro no JSON."); }
        event.target.value = "";
    };
    reader.readAsText(file);
};

function renderBanco() {
    const container = document.getElementById("listaBanco");
    if (!container) return;
    container.innerHTML = "";
    const chaves = Object.keys(banco).filter(k => k !== "versao").sort();
    chaves.forEach(nome => {
        const info = banco[nome];
        const star = (info.allStars || info.allStar) ? ' ⭐' : '';
        const escapedNome = nome.replace(/'/g, "\\'");
        const div = document.createElement("div");
        div.className = "item-compra";
        div.innerHTML = `<div class="input-item" style="flex: 2;">${nome}${star}</div><div class="qty-controls mini"><button class="btn-qty" onclick="window.alterarNivelNoBanco('${escapedNome}', -1)">-</button><span class="level-num">${info.level || info.nota || 3}</span><button class="btn-qty" onclick="window.alterarNivelNoBanco('${escapedNome}', 1)">+</button></div><div class="action-buttons"><button class="btn-edit" onclick="window.abrirModalEditar('${escapedNome}')">✏️</button><button class="btn-del" onclick="window.excluirDoBanco('${escapedNome}')">×</button></div>`;
        container.appendChild(div);
    });
}