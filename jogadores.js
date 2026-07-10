import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";

const docBancoRef = doc(db, "sistema", "banco_notas");
let banco = {};
let filtroBancoAtivo = "todos";

const inputBuscaBanco = document.getElementById("buscaBanco");
if (inputBuscaBanco) {
    inputBuscaBanco.addEventListener("input", renderBanco);
}

const filtroBancoNotas = document.getElementById("filtroBancoNotas");
if (filtroBancoNotas) {
    filtroBancoNotas.addEventListener("click", (event) => {
        const option = event.target.closest(".nota-option");
        if (!option) return;
        filtroBancoAtivo = option.dataset.filtro || "todos";
        filtroBancoNotas.querySelectorAll(".nota-option").forEach(opt => {
            opt.classList.toggle("active", opt === option);
        });
        renderBanco();
    });
}

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

function normalizarBusca(str) {
    return (str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function parseCsvLinha(linha, separador) {
    const colunas = [];
    let atual = "";
    let dentroAspas = false;
    for (let i = 0; i < linha.length; i++) {
        const char = linha[i];
        const proximo = linha[i + 1];
        if (char === '"' && proximo === '"') {
            atual += '"';
            i++;
        } else if (char === '"') {
            dentroAspas = !dentroAspas;
        } else if (char === separador && !dentroAspas) {
            colunas.push(atual.trim());
            atual = "";
        } else {
            atual += char;
        }
    }
    colunas.push(atual.trim());
    return colunas;
}

function detectarSeparadorCsv(cabecalho) {
    const pontosVirgula = (cabecalho.match(/;/g) || []).length;
    const virgulas = (cabecalho.match(/,/g) || []).length;
    return pontosVirgula >= virgulas ? ";" : ",";
}

function encontrarNomeExistente(nomeImportado) {
    const alvo = normalizarBusca(nomeImportado);
    if (!alvo) return null;
    return Object.keys(banco).find(nome => {
        if (nome === "versao") return false;
        const info = banco[nome] || {};
        if (normalizarBusca(nome) === alvo) return true;
        return (info.apelidos || "").split(",").some(apelido => normalizarBusca(apelido) === alvo);
    }) || null;
}

function valorBooleanoCsv(valor, padrao = false) {
    const normalizado = normalizarBusca(valor);
    if (!normalizado) return padrao;
    return ["sim", "true", "1", "yes"].includes(normalizado);
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function salvarFirebase() {
    await setDoc(docBancoRef, banco);
}

window.ajustarNotaManual = (id, v) => {
    const el = document.getElementById(id);
    let val = parseInt(el.innerText);
    val = Math.max(0, Math.min(10, val + v));
    el.innerText = val;
};

window.toggleNotaAllStars = (prefix) => {
    const isChecked = document.getElementById(`${prefix}AllStars`).checked;
    const group = document.getElementById(`group${prefix === 'add' ? 'Add' : 'Edit'}AllStars`);
    if (group) group.style.display = isChecked ? "flex" : "none";
    const grid = prefix === "add"
        ? document.querySelector(".add-rating-grid")
        : document.querySelector(".inline-rating-grid");
    if (grid) grid.classList.toggle("has-allstars", isChecked);
};

window.adicionarAoBanco = async () => {
    const nome = formatarNome(document.getElementById('addNome').value.trim());
    const apelidos = document.getElementById('addApelidos').value.trim();
    const isAllStar = document.getElementById('addAllStars').checked;
    const isAdm = document.getElementById('addAdm').checked;
    
    if(!nome) return;
    
    banco[nome] = { 
        notaTodes: parseInt(document.getElementById('addNotaTodes').innerText),
        notaElax: parseInt(document.getElementById('addNotaElax').innerText),
        notaAllStars: isAllStar ? parseInt(document.getElementById('addNotaAllStars').innerText) : 0,
        allStars: isAllStar,
        adm: isAdm,
        apelidos: apelidos 
    };

    // Reset formulário
    document.getElementById('addNome').value = "";
    document.getElementById('addApelidos').value = "";
    document.getElementById('addAllStars').checked = false;
    document.getElementById('addAdm').checked = false;
    document.getElementById('addNotaTodes').innerText = "3";
    document.getElementById('addNotaElax').innerText = "3";
    document.getElementById('addNotaAllStars').innerText = "3";
    window.toggleNotaAllStars('add');
    const addAccordion = document.querySelector(".add-player-accordion");
    if (addAccordion) addAccordion.open = false;
    
    await salvarFirebase();
};

async function salvarEdicaoInline(nomeOriginal, card) {
    const novoNome = formatarNome(card.querySelector(".edit-player-name").value.trim());
    if (!novoNome) return;

    const isAllStar = card.querySelector(".edit-player-allstars").checked;
    if (novoNome !== nomeOriginal) delete banco[nomeOriginal];

    banco[novoNome] = {
        notaTodes: parseInt(card.querySelector(".edit-nota-todes").innerText),
        notaElax: parseInt(card.querySelector(".edit-nota-elax").innerText),
        notaAllStars: isAllStar ? parseInt(card.querySelector(".edit-nota-allstars").innerText) : 0,
        allStars: isAllStar,
        adm: card.querySelector(".edit-player-adm").checked,
        apelidos: card.querySelector(".edit-player-apelidos").value.trim()
    };

    await salvarFirebase();
}

window.excluirDoBanco = async (nome) => { if(confirm(`Remover ${nome}?`)) { delete banco[nome]; await salvarFirebase(); } };

window.exportarNotas = () => {
    const chaves = Object.keys(banco).filter(k => k !== "versao").sort();
    let csvContent = "Nome;NotaTodes;NotaElax;NotaAllStar;AllStarStatus;Apelidos;Adm\n";
    chaves.forEach(nome => {
        const info = banco[nome];
        csvContent += `${nome};${notaBanco(info, "notaTodes")};${notaBanco(info, "notaElax")};${notaBanco(info, "notaAllStars", 0)};${info.allStars?'SIM':'NAO'};${info.apelidos || ""};${info.adm?'SIM':'NAO'}\n`;
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
            const linhas = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter(linha => linha.trim());
            if (linhas.length < 2) {
                alert("CSV vazio ou sem jogadores.");
                return;
            }
            const separador = detectarSeparadorCsv(linhas[0]);
            let atualizados = 0;
            let criados = 0;
            for (let i = 1; i < linhas.length; i++) {
                const colunas = parseCsvLinha(linhas[i], separador);
                if (colunas.length < 2) continue;
                const nome = formatarNome(colunas[0].trim());
                if (nome) {
                    const nomeExistente = encontrarNomeExistente(nome);
                    const chave = nomeExistente || nome;
                    const anterior = banco[chave] || {};
                    banco[chave] = {
                        ...anterior,
                        notaTodes: notaOuPadrao(colunas[1], notaBanco(anterior, "notaTodes")),
                        notaElax: notaOuPadrao(colunas[2], notaBanco(anterior, "notaElax")),
                        notaAllStars: notaOuPadrao(colunas[3], notaBanco(anterior, "notaAllStars", 0)),
                        allStars: valorBooleanoCsv(colunas[4], !!anterior.allStars),
                        apelidos: colunas[5] !== undefined && colunas[5] !== "" ? colunas[5] : (anterior.apelidos || ""),
                        adm: valorBooleanoCsv(colunas[6], !!anterior.adm)
                    };
                    if (nomeExistente) atualizados++;
                    else criados++;
                }
            }
            await salvarFirebase();
            alert(`Banco atualizado! ${atualizados} atualizados, ${criados} novos.`);
        } catch (err) { alert("Erro na importação."); }
    };
    reader.readAsText(file);
};

function renderBanco() {
    const container = document.getElementById("listaBanco");
    if (!container) return;
    const spinner = document.getElementById("loadingSpinner");
    const termoBusca = (document.getElementById("buscaBanco")?.value || "").trim().toLowerCase();
    container.innerHTML = "";
    if(spinner) container.appendChild(spinner);

    const chaves = Object.keys(banco)
        .filter(k => k !== "versao")
        .filter(nome => {
            const info = banco[nome] || {};
            const passaBusca = !termoBusca || nome.toLowerCase().includes(termoBusca) || (info.apelidos || "").toLowerCase().includes(termoBusca);
            if (!passaBusca) return false;
            if (filtroBancoAtivo === "todes") return notaBanco(info, "notaTodes") > 0;
            if (filtroBancoAtivo === "elax") return notaBanco(info, "notaElax") > 0;
            if (filtroBancoAtivo === "allstars") return !!info.allStars && notaBanco(info, "notaAllStars", 0) > 0;
            return true;
        })
        .sort();
    chaves.forEach((nome, index) => {
        const info = banco[nome];
        const star = info.allStars ? ' &#11088;' : '';
        const admBadge = info.adm ? ' <span class="bank-player-badge">ADM</span>' : '';
        const nomeSeguro = escaparHtml(nome);
        const apelidosSeguros = escaparHtml(info.apelidos || "");
        const notaTodes = notaBanco(info, "notaTodes");
        const notaElax = notaBanco(info, "notaElax");
        const notaAllStars = notaBanco(info, "notaAllStars", 0);
        const editId = `bank-edit-${index}`;
        const notasExibidas = [];
        if (notaTodes > 0) notasExibidas.push({ classe: "todes", texto: `TODES: ${notaTodes}` });
        if (notaElax > 0) notasExibidas.push({ classe: "elax", texto: `ELAX: ${notaElax}` });
        if (info.allStars && notaAllStars > 0) notasExibidas.push({ classe: "allstars", texto: `ALL STARS: ${notaAllStars}` });
        const notasHtml = notasExibidas.length
            ? `<div class="bank-player-rating">${notasExibidas.map(nota => `<span class="rating-pill ${nota.classe}">${nota.texto}</span>`).join('')}</div>`
            : "";

        const div = document.createElement("div");
        div.className = "item-compra bank-player-item bank-player-accordion";
        div.innerHTML = `
            <details class="bank-player-details">
                <summary class="bank-player-summary">
                    <div class="bank-player-main">
                        <div class="input-item btn-flex-2">${nomeSeguro}${star}${admBadge}</div>
                        ${notasHtml}
                    </div>
                    <span class="accordion-chevron" aria-hidden="true"></span>
                </summary>
                <div class="bank-player-edit-body">
                    <div class="modal-grid">
                        <div class="campo-modal">
                            <label>Nome do jogador:</label>
                            <input type="text" class="input-modal edit-player-name" value="${nomeSeguro}">
                        </div>
                        <div class="campo-modal">
                            <label>Apelidos:</label>
                            <input type="text" class="input-modal edit-player-apelidos" value="${apelidosSeguros}">
                        </div>
                    </div>
                    <div class="person-flags-row modal-checkbox-row inline-toggle-grid">
                        <div class="checkbox-row inline-toggle-field">
                            <input type="checkbox" id="${editId}-allstars" class="checkbox-control edit-player-allstars" ${info.allStars ? "checked" : ""}>
                            <label for="${editId}-allstars" class="checkbox-label">All Stars ⭐</label>
                        </div>
                        <div class="checkbox-row inline-toggle-field">
                            <input type="checkbox" id="${editId}-adm" class="checkbox-control edit-player-adm" ${info.adm ? "checked" : ""}>
                            <label for="${editId}-adm" class="checkbox-label">Adm</label>
                        </div>
                    </div>
                    <div class="notas-grid-cadastro inline-rating-grid ${info.allStars ? "has-allstars" : ""}">
                        <div class="nota-input-group">
                            <label>Todes</label>
                            <div class="qty-controls rating-stepper">
                                <button class="btn-qty" data-target="${editId}-todes" data-delta="-1">-</button>
                                <span id="${editId}-todes" class="level-num edit-nota-todes">${notaTodes}</span>
                                <button class="btn-qty" data-target="${editId}-todes" data-delta="1">+</button>
                            </div>
                        </div>
                        <div class="nota-input-group">
                            <label>Elax</label>
                            <div class="qty-controls rating-stepper">
                                <button class="btn-qty" data-target="${editId}-elax" data-delta="-1">-</button>
                                <span id="${editId}-elax" class="level-num edit-nota-elax">${notaElax}</span>
                                <button class="btn-qty" data-target="${editId}-elax" data-delta="1">+</button>
                            </div>
                        </div>
                        <div class="nota-input-group span-2 inline-allstars-group" style="${info.allStars ? "" : "display: none;"}">
                            <label>All Stars ⭐</label>
                            <div class="qty-controls rating-stepper">
                                <button class="btn-qty" data-target="${editId}-allstars-note" data-delta="-1">-</button>
                                <span id="${editId}-allstars-note" class="level-num edit-nota-allstars">${notaAllStars}</span>
                                <button class="btn-qty" data-target="${editId}-allstars-note" data-delta="1">+</button>
                            </div>
                        </div>
                    </div>
                    <div class="modal-buttons bank-player-edit-actions">
                        <button class="btn btn-main btn-primary-praia save-inline-player">SALVAR</button>
                        <button class="btn btn-sub danger delete-inline-player">EXCLUIR</button>
                    </div>
                </div>
            </details>
        `;
        div.querySelectorAll(".btn-qty").forEach(btn => {
            btn.onclick = () => window.ajustarNotaManual(btn.dataset.target, parseInt(btn.dataset.delta));
        });
        div.querySelector(".edit-player-allstars").onchange = (event) => {
            const group = div.querySelector(".inline-allstars-group");
            const grid = div.querySelector(".inline-rating-grid");
            group.style.display = event.target.checked ? "flex" : "none";
            grid.classList.toggle("has-allstars", event.target.checked);
        };
        div.querySelector(".save-inline-player").onclick = () => salvarEdicaoInline(nome, div);
        div.querySelector(".delete-inline-player").onclick = () => window.excluirDoBanco(nome);
        container.appendChild(div);
    });
}
