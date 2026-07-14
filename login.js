import { auth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "./firebase-config.js";
import { consumirMensagemLogin, obterPerfilAcesso } from "./access-control.js";
import { limparBancoCache } from "./banco-cache.js";

const botao = document.getElementById("btnLoginGoogle");
const mensagem = document.getElementById("loginMessage");
let loginEmAndamento = false;

function mostrarMensagem(texto, tipo = "erro") {
    mensagem.textContent = texto || "";
    mensagem.className = `login-message ${texto ? `is-${tipo}` : "hidden"}`;
}

function mensagemErroLogin(error) {
    if (error?.code === "auth/popup-closed-by-user") return "Login cancelado. Tente novamente.";
    if (error?.code === "auth/popup-blocked") return "O navegador bloqueou a janela do Google. Permita pop-ups e tente novamente.";
    if (error?.code === "auth/cancelled-popup-request") return "Já existe uma tentativa de login aberta.";
    if (error?.code === "auth/network-request-failed") return "Sem conexão com o Google. Verifique sua internet.";
    return "Não foi possível entrar com o Google.";
}

async function encaminharSeAutorizado(user) {
    if (!user || user.isAnonymous || loginEmAndamento) return;
    loginEmAndamento = true;
    botao.disabled = true;
    try {
        const perfil = await obterPerfilAcesso(user);
        if (perfil) {
            window.location.replace("index.html");
            return;
        }
        limparBancoCache();
        await signOut(auth);
        mostrarMensagem("Este e-mail Google não possui acesso ao app.");
    } catch (error) {
        console.error("Falha ao conferir autorização:", error);
        limparBancoCache();
        await signOut(auth).catch(() => {});
        mostrarMensagem(error?.code === "permission-denied"
            ? "Este e-mail Google não possui acesso ao app."
            : "Não foi possível validar seu acesso agora.");
    } finally {
        loginEmAndamento = false;
        botao.disabled = false;
    }
}

botao.onclick = async () => {
    if (loginEmAndamento) return;
    loginEmAndamento = true;
    botao.disabled = true;
    mostrarMensagem("");
    try {
        if (auth.currentUser) {
            limparBancoCache();
            await signOut(auth);
        }
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });
        const resultado = await signInWithPopup(auth, provider);
        loginEmAndamento = false;
        await encaminharSeAutorizado(resultado.user);
    } catch (error) {
        console.error("Falha no login Google:", error);
        mostrarMensagem(mensagemErroLogin(error));
    } finally {
        loginEmAndamento = false;
        botao.disabled = false;
    }
};

const avisoPendente = consumirMensagemLogin();
if (avisoPendente) mostrarMensagem(avisoPendente, "aviso");

onAuthStateChanged(auth, encaminharSeAutorizado);
