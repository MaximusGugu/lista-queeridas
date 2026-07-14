import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";
import { carregarBancoCache, salvarBancoCache } from "./banco-cache.js";
import { exigirAcesso, monitorarAcesso } from "./access-control.js";

const docBancoRef = doc(db, "sistema", "banco_notas");
let banco = carregarBancoCache();
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

let jogadoresInicializado = false;
auth.onAuthStateChanged(async (user) => {
    if (user && !jogadoresInicializado) {
        const perfil = await exigirAcesso(user);
        if (!perfil) return;
        jogadoresInicializado = true;
        monitorarAcesso(perfil);
        if (Object.keys(banco).length > 0) {
            const spinner = document.getElementById("loadingSpinner");
            if (spinner) spinner.style.display = "none";
            renderBanco();
        }
        onSnapshot(docBancoRef, (snap) => {
            banco = snap.exists() ? snap.data() : {};
            salvarBancoCache(banco);
            const spinner = document.getElementById("loadingSpinner");
            if(spinner) spinner.style.display = "none";
            renderBanco();
        });
    } else if (!user) { window.location.href = "login.html"; }
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

const flagPorNota = {
    notaTodes: "todes",
    notaElax: "elax",
    notaAllStars: "allStars"
};

function modalidadeAtiva(info, campo) {
    const flag = flagPorNota[campo];
    if (typeof info?.[flag] === "boolean") return info[flag];
    if (campo === "notaAllStars") return !!info?.allStars;
    return notaBanco(info, campo, 0) > 0;
}

function ehAdmBanco(info) {
    return Array.isArray(info?.admEmails) && info.admEmails.length > 0;
}

function atualizarGrupoModalidade(grupo, marcado, seletorNota) {
    if (!grupo) return;
    grupo.classList.toggle("is-disabled", !marcado);
    grupo.querySelectorAll(".btn-qty").forEach(botao => { botao.disabled = !marcado; });
    const nota = grupo.querySelector(seletorNota);
    if (nota) {
        const valorAtual = Number(nota.innerText) || 0;
        nota.innerText = String(marcado ? (valorAtual || 3) : 0);
    }
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
    salvarBancoCache(banco);
    await setDoc(docBancoRef, banco);
}

window.ajustarNotaManual = (id, v) => {
    const el = document.getElementById(id);
    let val = parseInt(el.innerText);
    val = Math.max(0, Math.min(10, val + v));
    el.innerText = val;
};

window.toggleModalidadeBanco = (prefix, modalidade, marcado) => {
    const idsNota = {
        todes: `${prefix}NotaTodes`,
        elax: `${prefix}NotaElax`,
        allStars: `${prefix}NotaAllStars`
    };
    const checkbox = document.getElementById(`${prefix}${modalidade === "allStars" ? "AllStars" : modalidade.charAt(0).toUpperCase() + modalidade.slice(1)}`);
    atualizarGrupoModalidade(checkbox?.closest(".rating-modality"), marcado, `#${idsNota[modalidade]}`);
};

window.adicionarAoBanco = async () => {
    const nome = formatarNome(document.getElementById('addNome').value.trim());
    const apelidos = document.getElementById('addApelidos').value.trim();
    const isTodes = document.getElementById('addTodes').checked;
    const isElax = document.getElementById('addElax').checked;
    const isAllStar = document.getElementById('addAllStars').checked;
    
    if(!nome) return;
    
    const anterior = banco[nome] || {};
    banco[nome] = {
        ...anterior,
        notaTodes: isTodes ? parseInt(document.getElementById('addNotaTodes').innerText) : 0,
        notaElax: isElax ? parseInt(document.getElementById('addNotaElax').innerText) : 0,
        notaAllStars: isAllStar ? parseInt(document.getElementById('addNotaAllStars').innerText) : 0,
        todes: isTodes,
        elax: isElax,
        allStars: isAllStar,
        apelidos: apelidos 
    };
    delete banco[nome].adm;

    // Reset formulário
    document.getElementById('addNome').value = "";
    document.getElementById('addApelidos').value = "";
    document.getElementById('addTodes').checked = true;
    document.getElementById('addElax').checked = false;
    document.getElementById('addAllStars').checked = false;
    document.getElementById('addNotaTodes').innerText = "3";
    document.getElementById('addNotaElax').innerText = "0";
    document.getElementById('addNotaAllStars').innerText = "0";
    window.toggleModalidadeBanco('add', 'todes', true);
    window.toggleModalidadeBanco('add', 'elax', false);
    window.toggleModalidadeBanco('add', 'allStars', false);
    const addAccordion = document.querySelector(".add-player-accordion");
    if (addAccordion) addAccordion.open = false;
    
    await salvarFirebase();
};

async function salvarEdicaoInline(nomeOriginal, card) {
    const novoNome = formatarNome(card.querySelector(".edit-player-name").value.trim());
    if (!novoNome) return;

    const anterior = banco[nomeOriginal] || {};
    const isTodes = card.querySelector(".edit-player-todes").checked;
    const isElax = card.querySelector(".edit-player-elax").checked;
    const isAllStar = card.querySelector(".edit-player-allstars").checked;
    if (novoNome !== nomeOriginal) delete banco[nomeOriginal];

    const atualizado = {
        ...anterior,
        notaTodes: isTodes ? parseInt(card.querySelector(".edit-nota-todes").innerText) : 0,
        notaElax: isElax ? parseInt(card.querySelector(".edit-nota-elax").innerText) : 0,
        notaAllStars: isAllStar ? parseInt(card.querySelector(".edit-nota-allstars").innerText) : 0,
        todes: isTodes,
        elax: isElax,
        allStars: isAllStar,
        apelidos: card.querySelector(".edit-player-apelidos").value.trim()
    };
    delete atualizado.adm;
    banco[novoNome] = atualizado;

    await salvarFirebase();
}

window.excluirDoBanco = async (nome) => {
    if (ehAdmBanco(banco[nome])) {
        alert("Esta pessoa está vinculada a um acesso de ADM. Remova o vínculo na tela Acessos antes de excluir.");
        return;
    }
    if (confirm(`Remover ${nome}?`)) {
        delete banco[nome];
        await salvarFirebase();
    }
};

window.exportarNotas = () => {
    const chaves = Object.keys(banco).filter(k => k !== "versao").sort();
    let csvContent = "Nome;NotaTodes;NotaElax;NotaAllStar;AllStarStatus;Apelidos;Adm\n";
    chaves.forEach(nome => {
        const info = banco[nome];
        csvContent += `${nome};${notaBanco(info, "notaTodes")};${notaBanco(info, "notaElax")};${notaBanco(info, "notaAllStars", 0)};${modalidadeAtiva(info, "notaAllStars")?'SIM':'NAO'};${info.apelidos || ""};${ehAdmBanco(info)?'SIM':'NAO'}\n`;
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
                    const notaTodes = notaOuPadrao(colunas[1], notaBanco(anterior, "notaTodes"));
                    const notaElax = notaOuPadrao(colunas[2], notaBanco(anterior, "notaElax"));
                    const notaAllStars = notaOuPadrao(colunas[3], notaBanco(anterior, "notaAllStars", 0));
                    const allStars = valorBooleanoCsv(colunas[4], modalidadeAtiva(anterior, "notaAllStars"));
                    banco[chave] = {
                        ...anterior,
                        notaTodes,
                        notaElax,
                        notaAllStars: allStars ? notaAllStars : 0,
                        todes: notaTodes > 0,
                        elax: notaElax > 0,
                        allStars,
                        apelidos: colunas[5] !== undefined && colunas[5] !== "" ? colunas[5] : (anterior.apelidos || "")
                    };
                    delete banco[chave].adm;
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
            if (filtroBancoAtivo === "todes") return modalidadeAtiva(info, "notaTodes");
            if (filtroBancoAtivo === "elax") return modalidadeAtiva(info, "notaElax");
            if (filtroBancoAtivo === "allstars") return modalidadeAtiva(info, "notaAllStars");
            return true;
        })
        .sort();
    chaves.forEach((nome, index) => {
        const info = banco[nome];
        const admBadge = ehAdmBanco(info) ? ' <span class="bank-player-badge">ADM</span>' : '';
        const nomeSeguro = escaparHtml(nome);
        const apelidosSeguros = escaparHtml(info.apelidos || "");
        const notaTodes = notaBanco(info, "notaTodes");
        const notaElax = notaBanco(info, "notaElax");
        const notaAllStars = notaBanco(info, "notaAllStars", 0);
        const editId = `bank-edit-${index}`;
        const notasExibidas = [];
        if ((filtroBancoAtivo === "todos" || filtroBancoAtivo === "todes") && modalidadeAtiva(info, "notaTodes")) {
            notasExibidas.push({ classe: "todes", texto: `TODES: ${notaTodes}` });
        }
        if ((filtroBancoAtivo === "todos" || filtroBancoAtivo === "elax") && modalidadeAtiva(info, "notaElax")) {
            notasExibidas.push({ classe: "elax", texto: `ELAX: ${notaElax}` });
        }
        if ((filtroBancoAtivo === "todos" || filtroBancoAtivo === "allstars") && modalidadeAtiva(info, "notaAllStars")) {
            notasExibidas.push({ classe: "allstars", texto: `ALL STARS: ${notaAllStars}` });
        }
        const notasHtml = notasExibidas.length
            ? `<div class="bank-player-rating">${notasExibidas.map(nota => `<span class="rating-pill ${nota.classe}">${nota.texto}</span>`).join('')}</div>`
            : "";

        const div = document.createElement("div");
        div.className = "item-compra bank-player-item bank-player-accordion";
        div.innerHTML = `
            <details class="bank-player-details">
                <summary class="bank-player-summary">
                    <div class="bank-player-main">
                        <div class="input-item btn-flex-2">${nomeSeguro}${admBadge}</div>
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
                    <div class="notas-grid-cadastro inline-rating-grid">
                        <div class="nota-input-group rating-modality ${modalidadeAtiva(info, "notaTodes") ? "" : "is-disabled"}">
                            <label class="rating-modality-label"><input type="checkbox" id="${editId}-todes-active" class="checkbox-control edit-player-todes" ${modalidadeAtiva(info, "notaTodes") ? "checked" : ""}> Todes</label>
                            <div class="qty-controls rating-stepper">
                                <button type="button" class="btn-qty" data-target="${editId}-todes" data-delta="-1" ${modalidadeAtiva(info, "notaTodes") ? "" : "disabled"}>-</button>
                                <span id="${editId}-todes" class="level-num edit-nota-todes">${notaTodes}</span>
                                <button type="button" class="btn-qty" data-target="${editId}-todes" data-delta="1" ${modalidadeAtiva(info, "notaTodes") ? "" : "disabled"}>+</button>
                            </div>
                        </div>
                        <div class="nota-input-group rating-modality ${modalidadeAtiva(info, "notaElax") ? "" : "is-disabled"}">
                            <label class="rating-modality-label"><input type="checkbox" id="${editId}-elax-active" class="checkbox-control edit-player-elax" ${modalidadeAtiva(info, "notaElax") ? "checked" : ""}> Elax</label>
                            <div class="qty-controls rating-stepper">
                                <button type="button" class="btn-qty" data-target="${editId}-elax" data-delta="-1" ${modalidadeAtiva(info, "notaElax") ? "" : "disabled"}>-</button>
                                <span id="${editId}-elax" class="level-num edit-nota-elax">${notaElax}</span>
                                <button type="button" class="btn-qty" data-target="${editId}-elax" data-delta="1" ${modalidadeAtiva(info, "notaElax") ? "" : "disabled"}>+</button>
                            </div>
                        </div>
                        <div class="nota-input-group rating-modality inline-allstars-group ${modalidadeAtiva(info, "notaAllStars") ? "" : "is-disabled"}">
                            <label class="rating-modality-label"><input type="checkbox" id="${editId}-allstars" class="checkbox-control edit-player-allstars" ${modalidadeAtiva(info, "notaAllStars") ? "checked" : ""}> All Stars ⭐</label>
                            <div class="qty-controls rating-stepper">
                                <button type="button" class="btn-qty" data-target="${editId}-allstars-note" data-delta="-1" ${modalidadeAtiva(info, "notaAllStars") ? "" : "disabled"}>-</button>
                                <span id="${editId}-allstars-note" class="level-num edit-nota-allstars">${notaAllStars}</span>
                                <button type="button" class="btn-qty" data-target="${editId}-allstars-note" data-delta="1" ${modalidadeAtiva(info, "notaAllStars") ? "" : "disabled"}>+</button>
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
        [
            [".edit-player-todes", ".edit-nota-todes"],
            [".edit-player-elax", ".edit-nota-elax"],
            [".edit-player-allstars", ".edit-nota-allstars"]
        ].forEach(([seletorCheckbox, seletorNota]) => {
            const checkbox = div.querySelector(seletorCheckbox);
            checkbox.onchange = () => atualizarGrupoModalidade(checkbox.closest(".rating-modality"), checkbox.checked, seletorNota);
        });
        div.querySelector(".save-inline-player").onclick = () => salvarEdicaoInline(nome, div);
        div.querySelector(".delete-inline-player").onclick = () => window.excluirDoBanco(nome);
        container.appendChild(div);
    });
}
