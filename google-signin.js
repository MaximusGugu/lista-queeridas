import { auth, authPersistenceReady } from "./firebase-config.js";
import { GoogleAuthProvider, signInWithCredential } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const GOOGLE_CLIENT_ID = "417403077783-ro9k2tuj5n6btm1ern5unr7fpn8rttj8.apps.googleusercontent.com";
const GOOGLE_IDENTITY_URL = "https://accounts.google.com/gsi/client?hl=pt-BR";

let carregamentoBiblioteca = null;
let manipuladores = { aoEntrar: null, aoErro: null };

function carregarGoogleIdentity() {
    if (window.google?.accounts?.id) return Promise.resolve(window.google);
    if (carregamentoBiblioteca) return carregamentoBiblioteca;

    carregamentoBiblioteca = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = GOOGLE_IDENTITY_URL;
        script.async = true;
        script.dataset.googleIdentity = "true";
        script.onload = () => window.google?.accounts?.id
            ? resolve(window.google)
            : reject(new Error("A biblioteca do Google não ficou disponível."));
        script.onerror = () => reject(new Error("Não foi possível carregar o login do Google."));
        document.head.appendChild(script);
    });

    return carregamentoBiblioteca;
}

async function receberCredencialGoogle(response) {
    try {
        if (!response?.credential) throw new Error("O Google não retornou uma credencial válida.");
        await authPersistenceReady;
        const credencialFirebase = GoogleAuthProvider.credential(response.credential);
        const resultado = await signInWithCredential(auth, credencialFirebase);
        await manipuladores.aoEntrar?.(resultado);
    } catch (error) {
        manipuladores.aoErro?.(error);
    }
}

export async function renderizarBotaoGoogle(container, { aoEntrar, aoErro, texto = "continue_with" } = {}) {
    if (!container) throw new Error("Área do botão Google não encontrada.");
    manipuladores = { aoEntrar, aoErro };
    container.setAttribute("aria-busy", "true");

    try {
        await authPersistenceReady;
        const google = await carregarGoogleIdentity();
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: receberCredencialGoogle,
            auto_select: false,
            itp_support: true,
            use_fedcm_for_button: true,
            button_auto_select: false
        });

        container.replaceChildren();
        const largura = Math.max(220, Math.min(320, Math.floor(container.getBoundingClientRect().width || 320)));
        google.accounts.id.renderButton(container, {
            type: "standard",
            theme: "outline",
            size: "large",
            text: texto,
            shape: "rectangular",
            logo_alignment: "left",
            width: largura,
            locale: "pt_BR"
        });
    } finally {
        container.setAttribute("aria-busy", "false");
    }
}

export function desativarSelecaoAutomaticaGoogle() {
    window.google?.accounts?.id?.disableAutoSelect();
}
