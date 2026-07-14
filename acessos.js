import { auth, collection, db, doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "./firebase-config.js";
import { exigirAcesso, monitorarAcesso, normalizarEmail } from "./access-control.js";

const formulario = document.getElementById("accessForm");
const inputEmail = document.getElementById("accessEmail");
const botaoLiberar = document.getElementById("btnGrantAccess");
const mensagem = document.getElementById("accessMessage");
const listaMasters = document.getElementById("masterAccessList");
const listaAdms = document.getElementById("adminAccessList");
const bancoRef = doc(db, "sistema", "banco_notas");
const emailsMasters = new Set();
const emailsAdms = new Set();
let perfilAtual = null;
let acessosInicializados = false;
let banco = {};
let documentosMasters = [];
let documentosAdms = [];

function mostrarMensagem(texto, tipo = "sucesso") {
    mensagem.textContent = texto || "";
    mensagem.className = `access-message ${texto ? `is-${tipo}` : "hidden"}`;
}

function normalizarBusca(valor) {
    return String(valor || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function nomesBanco() {
    return Object.keys(banco).filter(nome => nome !== "versao").sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function emailsVinculados(info) {
    return Array.isArray(info?.admEmails)
        ? info.admEmails.map(normalizarEmail).filter(Boolean)
        : [];
}

function nomeVinculado(email) {
    const encontrado = nomesBanco().find(nome => emailsVinculados(banco[nome]).includes(email));
    return encontrado || "";
}

function bancoComVinculo(bancoAtual, email, destino = "") {
    const atualizado = {};
    Object.entries(bancoAtual || {}).forEach(([nome, dados]) => {
        if (nome === "versao" || !dados || typeof dados !== "object") {
            atualizado[nome] = dados;
            return;
        }
        const emails = new Set(emailsVinculados(dados));
        emails.delete(email);
        if (nome === destino) emails.add(email);
        const novosDados = { ...dados, admEmails: [...emails].sort() };
        delete novosDados.adm;
        atualizado[nome] = novosDados;
    });
    return atualizado;
}

function formatarData(timestamp) {
    const data = timestamp?.toDate?.();
    if (!data) return "";
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

function renderizarVazio(container, texto) {
    container.innerHTML = "";
    const vazio = document.createElement("p");
    vazio.className = "access-empty";
    vazio.textContent = texto;
    container.appendChild(vazio);
}

function criarLinhaMaster(email) {
    const vinculado = nomeVinculado(email);
    const card = document.createElement("div");
    card.className = "access-admin-card access-master-card";
    const topo = document.createElement("div");
    topo.className = "access-admin-header";
    const emailEl = document.createElement("span");
    emailEl.className = "access-item-email";
    emailEl.textContent = email;
    const selo = document.createElement("span");
    selo.className = "access-master-badge";
    selo.textContent = "MASTER";
    topo.append(emailEl, selo);
    card.append(topo, criarPainelVinculo(email, vinculado, vincularMaster));
    return card;
}

function criarBotao(texto, classe, acao) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = classe;
    botao.textContent = texto;
    botao.onclick = () => acao(botao);
    return botao;
}

function renderizarResultadosBusca(email, consulta, container, atualizarVinculo) {
    container.innerHTML = "";
    const termo = normalizarBusca(consulta);
    if (termo.length < 2) {
        container.style.display = "none";
        return;
    }

    const resultados = nomesBanco()
        .filter(nome => normalizarBusca(`${nome} ${banco[nome]?.apelidos || ""}`).includes(termo))
        .slice(0, 6);
    if (!resultados.length) {
        container.style.display = "none";
        return;
    }

    resultados.forEach(nome => {
        const resultado = document.createElement("button");
        resultado.type = "button";
        resultado.className = "result-item access-link-result";
        const nomeEl = document.createElement("span");
        nomeEl.className = "result-name";
        nomeEl.textContent = nome;
        const acao = document.createElement("span");
        acao.className = "result-action";
        acao.textContent = "VINCULAR";
        resultado.append(nomeEl, acao);
        resultado.onclick = () => atualizarVinculo(email, nome, resultado);
        container.appendChild(resultado);
    });
    container.style.display = "block";
}

function criarPainelVinculo(email, vinculado, atualizarVinculo) {
    const vinculo = document.createElement("div");
    vinculo.className = "access-link-panel";
    const status = document.createElement("div");
    status.className = `access-link-status ${vinculado ? "is-linked" : ""}`;
    const statusTexto = document.createElement("span");
    statusTexto.textContent = vinculado ? `Pessoa vinculada: ${vinculado}` : "Nenhuma pessoa do banco vinculada";
    status.appendChild(statusTexto);
    if (vinculado) {
        status.appendChild(criarBotao("DESVINCULAR", "btn-link-subtle access-unlink-button", botao => atualizarVinculo(email, "", botao)));
    }

    const busca = document.createElement("input");
    busca.type = "search";
    busca.className = "input-modal vincular-input access-link-input";
    busca.placeholder = vinculado ? "Buscar outra pessoa no banco..." : "Buscar pessoa no banco...";
    busca.autocomplete = "off";
    const resultados = document.createElement("div");
    resultados.className = "vincular-results access-link-results";
    busca.oninput = () => renderizarResultadosBusca(email, busca.value, resultados, atualizarVinculo);
    vinculo.append(status, busca, resultados);
    return vinculo;
}

function criarLinhaAdm(documento) {
    const dados = documento.data();
    const email = normalizarEmail(dados.email || documento.id);
    const vinculado = nomeVinculado(email);
    const card = document.createElement("div");
    card.className = "access-admin-card";

    const topo = document.createElement("div");
    topo.className = "access-admin-header";
    const conteudo = document.createElement("div");
    conteudo.className = "access-item-content";
    const emailEl = document.createElement("span");
    emailEl.className = "access-item-email";
    emailEl.textContent = email;
    const data = formatarData(dados.criadoEm);
    const detalhe = document.createElement("span");
    detalhe.className = "access-item-detail";
    detalhe.textContent = [dados.criadoPor ? `Liberado por ${dados.criadoPor}` : "", data].filter(Boolean).join(" · ");
    conteudo.append(emailEl, detalhe);
    const revogar = criarBotao("REVOGAR", "btn btn-sub danger access-revoke-button", botao => revogarAcesso(email, botao));
    topo.append(conteudo, revogar);

    card.append(topo, criarPainelVinculo(email, vinculado, vincularAdm));
    return card;
}

function renderizarMasters() {
    listaMasters.innerHTML = "";
    documentosMasters.forEach(documento => {
        const email = normalizarEmail(documento.data().email || documento.id);
        listaMasters.appendChild(criarLinhaMaster(email));
    });
    if (!documentosMasters.length) renderizarVazio(listaMasters, "Nenhum master configurado.");
}

function renderizarAdms() {
    listaAdms.innerHTML = "";
    documentosAdms.forEach(documento => listaAdms.appendChild(criarLinhaAdm(documento)));
    if (!documentosAdms.length) renderizarVazio(listaAdms, "Nenhum ADM autorizado.");
}

async function vincularMaster(email, destino, botao) {
    botao.disabled = true;
    try {
        await runTransaction(db, async transaction => {
            const bancoSnap = await transaction.get(bancoRef);
            if (!bancoSnap.exists()) throw new Error("Banco de pessoas não encontrado.");
            if (destino && !bancoSnap.data()[destino]) throw new Error("Pessoa não encontrada no banco.");
            transaction.set(bancoRef, bancoComVinculo(bancoSnap.data(), email, destino));
        });
        mostrarMensagem(destino ? `Master ${email} vinculado a ${destino}.` : `Vínculo do master ${email} removido.`);
    } catch (error) {
        console.error("Falha ao atualizar vínculo do master:", error);
        mostrarMensagem("Não foi possível atualizar este vínculo.", "erro");
        botao.disabled = false;
    }
}

async function vincularAdm(email, destino, botao) {
    botao.disabled = true;
    try {
        await runTransaction(db, async transaction => {
            const acessoRef = doc(db, "acessos_adm", email);
            const [acessoSnap, bancoSnap] = await Promise.all([
                transaction.get(acessoRef),
                transaction.get(bancoRef)
            ]);
            if (!acessoSnap.exists()) throw new Error("Acesso não encontrado.");
            if (!bancoSnap.exists()) throw new Error("Banco de pessoas não encontrado.");
            if (destino && !bancoSnap.data()[destino]) throw new Error("Pessoa não encontrada no banco.");

            transaction.set(bancoRef, bancoComVinculo(bancoSnap.data(), email, destino));
            transaction.update(acessoRef, {
                jogadorBanco: destino,
                vinculadoPor: perfilAtual.email,
                vinculadoEm: serverTimestamp()
            });
        });
        mostrarMensagem(destino ? `${email} vinculado a ${destino}.` : `Vínculo de ${email} removido.`);
    } catch (error) {
        console.error("Falha ao atualizar vínculo:", error);
        mostrarMensagem("Não foi possível atualizar este vínculo.", "erro");
        botao.disabled = false;
    }
}

async function revogarAcesso(email, botao) {
    if (!confirm(`Revogar o acesso de ${email}?`)) return;
    botao.disabled = true;
    try {
        await runTransaction(db, async transaction => {
            const acessoRef = doc(db, "acessos_adm", email);
            const [acessoSnap, bancoSnap] = await Promise.all([
                transaction.get(acessoRef),
                transaction.get(bancoRef)
            ]);
            if (!acessoSnap.exists()) return;
            if (bancoSnap.exists()) transaction.set(bancoRef, bancoComVinculo(bancoSnap.data(), email));
            transaction.delete(acessoRef);
        });
        mostrarMensagem(`Acesso de ${email} revogado.`);
    } catch (error) {
        console.error("Falha ao revogar acesso:", error);
        mostrarMensagem("Não foi possível revogar este acesso.", "erro");
        botao.disabled = false;
    }
}

function acompanharListas() {
    onSnapshot(bancoRef, snapshot => {
        banco = snapshot.exists() ? snapshot.data() : {};
        renderizarMasters();
        renderizarAdms();
    }, error => console.error("Falha ao carregar o banco para vínculos:", error));

    onSnapshot(collection(db, "acessos_master"), snapshot => {
        emailsMasters.clear();
        documentosMasters = [...snapshot.docs].sort((a, b) => a.id.localeCompare(b.id));
        documentosMasters.forEach(documento => {
            const email = normalizarEmail(documento.data().email || documento.id);
            emailsMasters.add(email);
        });
        renderizarMasters();
    }, error => {
        console.error("Falha ao carregar masters:", error);
        renderizarVazio(listaMasters, "Não foi possível carregar os masters.");
    });

    onSnapshot(collection(db, "acessos_adm"), snapshot => {
        emailsAdms.clear();
        documentosAdms = [...snapshot.docs].sort((a, b) => a.id.localeCompare(b.id));
        documentosAdms.forEach(documento => emailsAdms.add(normalizarEmail(documento.data().email || documento.id)));
        renderizarAdms();
    }, error => {
        console.error("Falha ao carregar ADMs:", error);
        renderizarVazio(listaAdms, "Não foi possível carregar os ADMs.");
    });
}

formulario.onsubmit = async event => {
    event.preventDefault();
    mostrarMensagem("");
    const email = normalizarEmail(inputEmail.value);
    inputEmail.value = email;
    if (!inputEmail.checkValidity()) {
        inputEmail.reportValidity();
        return;
    }
    if (emailsMasters.has(email)) {
        mostrarMensagem("Este e-mail já é master.", "erro");
        return;
    }
    if (emailsAdms.has(email)) {
        mostrarMensagem("Este e-mail já possui acesso de ADM.", "erro");
        return;
    }

    botaoLiberar.disabled = true;
    try {
        await setDoc(doc(db, "acessos_adm", email), {
            email,
            criadoPor: perfilAtual.email,
            criadoEm: serverTimestamp()
        });
        inputEmail.value = "";
        mostrarMensagem(`Acesso liberado para ${email}. Agora vincule uma pessoa do banco.`);
    } catch (error) {
        console.error("Falha ao liberar acesso:", error);
        mostrarMensagem("Não foi possível liberar este acesso.", "erro");
    } finally {
        botaoLiberar.disabled = false;
    }
};

auth.onAuthStateChanged(async user => {
    if (!user || acessosInicializados) return;
    const perfil = await exigirAcesso(user, { somenteMaster: true });
    if (!perfil) return;
    perfilAtual = perfil;
    acessosInicializados = true;
    document.getElementById("accessPage").classList.remove("hidden");
    monitorarAcesso(perfil);
    acompanharListas();
});
