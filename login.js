import { auth, onAuthStateChanged, signOut } from "./firebase-config.js";
import { consumirMensagemLogin, obterPerfilAcesso } from "./access-control.js";
import { limparBancoCache } from "./banco-cache.js";
import { renderizarBotaoGoogle } from "./google-signin.js";

const botao = document.getElementById("btnLoginGoogle");
const mensagem = document.getElementById("loginMessage");
let validacaoEmAndamento = false;

function mostrarMensagem(texto, tipo = "erro") {
    mensagem.textContent = texto || "";
    mensagem.className = `login-message ${texto ? `is-${tipo}` : "hidden"}`;
}

function mensagemErroLogin(error) {
    if (error?.code === "auth/network-request-failed") return "Sem conexão com o Google. Verifique sua internet.";
    if (error?.code === "auth/invalid-credential") return "O Google não conseguiu validar esta sessão. Escolha a conta novamente.";
    return "Não foi possível entrar com o Google.";
}

async function encaminharSeAutorizado(user) {
    if (!user || user.isAnonymous || validacaoEmAndamento) return;
    validacaoEmAndamento = true;
    botao.setAttribute("aria-busy", "true");
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
        validacaoEmAndamento = false;
        botao.setAttribute("aria-busy", "false");
    }
}

renderizarBotaoGoogle(botao, {
    texto: "signin_with",
    aoEntrar: resultado => encaminharSeAutorizado(resultado.user),
    aoErro: error => {
        console.error("Falha no login Google:", error);
        mostrarMensagem(mensagemErroLogin(error));
    }
}).catch(error => {
    console.error("Falha ao preparar o login Google:", error);
    mostrarMensagem("Não foi possível carregar o botão do Google. Atualize a página e tente novamente.");
});

const avisoPendente = consumirMensagemLogin();
if (avisoPendente) mostrarMensagem(avisoPendente, "aviso");

onAuthStateChanged(auth, encaminharSeAutorizado);
