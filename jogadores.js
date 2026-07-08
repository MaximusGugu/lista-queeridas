import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";

const docBancoRef = doc(db, "sistema", "banco_notas");
let banco = {};
let nivelTemporario = 3;
let nivelEditarTemporario = 3;
let jogadorSendoEditado = "";

// --- 1. CONFIGURAÇÃO GERAL E INICIALIZAÇÃO FIREBASE ---
auth.onAuthStateChanged((user) => {
    if (user) {
        onSnapshot(docBancoRef, (snap) => {
            if (snap.exists()) {
                banco = snap.data();
            } else {
                banco = {};
            }
            renderBanco();
        }, (error) => {
            console.error("Erro no Firebase (Regras de Segurança?):", error);
        });
    } else {
        window.location.href = "login.html";
    }
});

function formatarNome(nome) {
    if (!nome) return "";
    return nome.toLowerCase().split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

async function salvarFirebase() {
    if (!auth.currentUser) throw new Error("Usuário não autenticado no Firebase.");
    await setDoc(docBancoRef, banco);
}

// --- 2. FUNÇÕES EXPOSTAS AO WINDOW PARA USO NOS BOTÕES HTML ---
window.ajustarNovoNivel = (v) => { 
    nivelTemporario = Math.max(1, Math.min(10, nivelTemporario + v)); 
    const el = document.getElementById('novoNivel');
    if (el) el.innerText = nivelTemporario; 
};

window.adicionarAoBanco = async () => {
    const input = document.getElementById('addNome');
    const checkAllStars = document.getElementById('addAllStars');
    if (!input) return;
    const nome = formatarNome(input.value.trim());
    if(!nome) return;
    const allStars = checkAllStars ? checkAllStars.checked : false;
    
    banco[nome] = {
        level: nivelTemporario,
        allStars: allStars
    };
    
    input.value = "";
    if (checkAllStars) checkAllStars.checked = false;
    nivelTemporario = 3;
    const elNivel = document.getElementById('novoNivel');
    if (elNivel) elNivel.innerText = nivelTemporario;

    try {
        await salvarFirebase();
    } catch (e) {
        console.error("Erro ao adicionar jogador:", e);
        alert("Erro ao salvar: " + e.message);
    }
};

window.abrirModalEditar = (nome) => {
    jogadorSendoEditado = nome;
    const info = banco[nome];
    const level = info && typeof info === "object" ? info.level : (Number(info) || 3);
    const allStars = info && typeof info === "object" ? !!info.allStars : false;

    nivelEditarTemporario = level;
    
    const editNome = document.getElementById("editNome");
    const editNivel = document.getElementById("editNivel");
    const editAllStars = document.getElementById("editAllStars");
    const modal = document.getElementById("modalEditarJogador");

    if (editNome) editNome.value = nome;
    if (editNivel) editNivel.innerText = nivelEditarTemporario;
    if (editAllStars) editAllStars.checked = allStars;
    if (modal) modal.style.display = "flex";
};

window.fecharModalEditar = () => {
    const modal = document.getElementById("modalEditarJogador");
    if (modal) modal.style.display = "none";
    jogadorSendoEditado = "";
};

window.ajustarEditarNivel = (v) => {
    nivelEditarTemporario = Math.max(1, Math.min(10, nivelEditarTemporario + v));
    const el = document.getElementById('editNivel');
    if (el) el.innerText = nivelEditarTemporario;
};

window.salvarEdicaoJogador = async () => {
    if (!jogadorSendoEditado) return;
    const editAllStars = document.getElementById("editAllStars");
    const allStars = editAllStars ? editAllStars.checked : false;

    banco[jogadorSendoEditado] = {
        level: nivelEditarTemporario,
        allStars: allStars
    };

    window.fecharModalEditar();

    try {
        await salvarFirebase();
    } catch (e) {
        console.error("Erro ao salvar edição:", e);
        alert("Erro ao salvar edição: " + e.message);
    }
};

window.excluirDoBanco = async (nome) => { 
    if(confirm(`Remover ${nome} do banco de notas?`)) { 
        const originalBanco = { ...banco };
        delete banco[nome]; 
        try {
            await salvarFirebase(); 
        } catch (e) {
            banco = originalBanco; // Rollback se falhar
            console.error("Erro ao excluir jogador:", e);
            alert("Erro ao excluir: " + e.message);
        }
    } 
};

window.exportarNotas = () => {
    const data = JSON.stringify(banco, null, 2);
    const blob = new Blob([data], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "notas_queeridas.json"; a.click();
};

window.importarNotas = (event) => {
    console.log("Selecionou arquivo para importação.");
    const file = event.target.files?.[0];
    if (!file) {
        console.log("Nenhum arquivo selecionado.");
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            console.log("Arquivo lido. Conteúdo bruto:", e.target.result);
            console.log("Iniciando parsing do JSON.");
            const data = JSON.parse(e.target.result);
            console.log("JSON parseado com sucesso:", data);
            const novo = {};

            if (Array.isArray(data)) {
                data.forEach(item => {
                    if (item && typeof item === "object" && item.nome) {
                        const nome = formatarNome(item.nome);
                        const nivel = Number(item.nivel) || 3;
                        const allStars = !!item.allStars;
                        if (nome) novo[nome] = { level: Math.max(1, Math.min(10, nivel)), allStars };
                    }
                });
            } else if (data && typeof data === "object") {
                Object.entries(data).forEach(([nome, val]) => {
                    const n = formatarNome(nome);
                    let level = 3;
                    let allStars = false;
                    if (val && typeof val === "object") {
                        level = Number(val.level) || 3;
                        allStars = !!val.allStars;
                    } else {
                        level = Number(val) || 3;
                    }
                    if (n) novo[n] = { level: Math.max(1, Math.min(10, level)), allStars };
                });
            } else {
                throw new Error("Formato do arquivo JSON inválido.");
            }

            console.log("Dados processados para merge:", novo);
            banco = { ...banco, ...novo };
            console.log("Salvando no Firebase Firestore...");
            await salvarFirebase();
            console.log("Salvo com sucesso!");
            alert("Notas importadas com sucesso!");
        } catch (err) {
            console.error("Erro na importação:", err);
            alert("Erro ao importar: " + err.message);
        } finally {
            event.target.value = ""; // Reseta o input de arquivo
        }
    };
    reader.readAsText(file);
};

// --- 3. RENDERIZAÇÃO DA TABELA ---
function renderBanco() {
    const container = document.getElementById("listaBanco");
    if (!container) return;
    container.innerHTML = "";
    const chaves = Object.keys(banco).filter(k => k !== "versao").sort();
    
    if(chaves.length === 0) {
        container.innerHTML = '<p style="text-align:center; opacity:0.5; font-size:12px; margin-top:20px;">Nenhum jogador cadastrado.</p>';
        return;
    }

    chaves.forEach(nome => {
        const info = banco[nome];
        const level = info && typeof info === "object" ? info.level : (Number(info) || 3);
        const allStars = info && typeof info === "object" ? !!info.allStars : false;
        
        // Escape single quotes for html event parameters
        const escapedNome = nome.replace(/'/g, "\\'");

        const div = document.createElement("div");
        div.className = "item-compra";
        div.innerHTML = `
            <div class="num" style="background:var(--bg-app)">${level}</div>
            <div class="input-item">${nome}${allStars ? ' ⭐' : ''}</div>
            <div class="action-buttons">
                <button class="btn-edit" onclick="abrirModalEditar('${escapedNome}')">✏️</button>
                <button class="btn-del" onclick="excluirDoBanco('${escapedNome}')">×</button>
            </div>
        `;
        container.appendChild(div);
    });
}
