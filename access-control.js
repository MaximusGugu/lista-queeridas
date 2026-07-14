import { auth, db, doc, getDoc, onSnapshot, signOut } from "./firebase-config.js";
import { limparBancoCache } from "./banco-cache.js";

export const PAPEL_MASTER = "master";
export const PAPEL_ADM = "admin";

export function normalizarEmail(email) {
    return String(email || "").trim().toLowerCase();
}

export function usuarioGoogleValido(user) {
    if (!user || user.isAnonymous || !user.email || !user.emailVerified) return false;
    return user.providerData?.some(provider => provider.providerId === "google.com") ?? false;
}

function referenciaAcesso(colecao, email) {
    return doc(db, colecao, normalizarEmail(email));
}

export async function obterPerfilAcesso(user = auth.currentUser) {
    if (!usuarioGoogleValido(user)) return null;
    const email = normalizarEmail(user.email);

    const master = await getDoc(referenciaAcesso("acessos_master", email));
    if (master.exists()) return { papel: PAPEL_MASTER, email, user };

    const adm = await getDoc(referenciaAcesso("acessos_adm", email));
    if (adm.exists()) return { papel: PAPEL_ADM, email, user };

    return null;
}

export function guardarMensagemLogin(mensagem) {
    if (mensagem) sessionStorage.setItem("queeridas_login_mensagem", mensagem);
}

export function consumirMensagemLogin() {
    const mensagem = sessionStorage.getItem("queeridas_login_mensagem") || "";
    sessionStorage.removeItem("queeridas_login_mensagem");
    return mensagem;
}

export async function encerrarSessao(mensagem = "") {
    guardarMensagemLogin(mensagem);
    limparBancoCache();
    try {
        await signOut(auth);
    } finally {
        if (!window.location.pathname.endsWith("login.html")) {
            window.location.replace("login.html");
        }
    }
}

export async function exigirAcesso(user, { somenteMaster = false } = {}) {
    if (!user) {
        window.location.replace("login.html");
        return null;
    }

    try {
        const perfil = await obterPerfilAcesso(user);
        if (!perfil) {
            await encerrarSessao("Este e-mail Google não possui acesso ao app.");
            return null;
        }
        if (somenteMaster && perfil.papel !== PAPEL_MASTER) {
            window.location.replace("index.html");
            return null;
        }
        return perfil;
    } catch (error) {
        console.error("Falha ao verificar o acesso:", error);
        await encerrarSessao("Não foi possível validar seu acesso. Entre novamente.");
        return null;
    }
}

export function monitorarAcesso(perfil) {
    if (!perfil) return () => {};
    const colecao = perfil.papel === PAPEL_MASTER ? "acessos_master" : "acessos_adm";
    const referencia = referenciaAcesso(colecao, perfil.email);

    return onSnapshot(referencia, (snapshot) => {
        if (snapshot.exists()) return;
        const mensagem = perfil.papel === PAPEL_MASTER
            ? "Seu acesso master não está mais configurado."
            : "Seu acesso de ADM foi revogado.";
        encerrarSessao(mensagem);
    }, (error) => {
        if (error?.code === "permission-denied") {
            encerrarSessao("Seu acesso ao app foi revogado.");
        } else {
            console.error("Falha ao monitorar o acesso:", error);
        }
    });
}
