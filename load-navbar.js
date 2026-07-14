import { auth, onAuthStateChanged } from "./firebase-config.js";
import { encerrarSessao, obterPerfilAcesso, PAPEL_MASTER } from "./access-control.js";

async function injectNavbar() {
    try {
        const response = await fetch("navbar.html");
        if (!response.ok) throw new Error("Navbar não encontrada");
        const navbarHtml = await response.text();
        document.body.insertAdjacentHTML("beforeend", navbarHtml);

        const page = window.location.pathname.split("/").pop();
        const idsPorPagina = {
            "": "nav-index",
            "index.html": "nav-index",
            "times.html": "nav-times",
            "jogadores.html": "nav-jogadores",
            "acessos.html": "nav-acessos"
        };
        document.getElementById(idsPorPagina[page])?.classList.add("active");
        document.getElementById("btnNavLogout").onclick = () => encerrarSessao();

        onAuthStateChanged(auth, async (user) => {
            if (!user) return;
            try {
                const perfil = await obterPerfilAcesso(user);
                const nav = document.querySelector(".bottom-nav");
                const linkAcessos = document.getElementById("nav-acessos");
                const master = perfil?.papel === PAPEL_MASTER;
                linkAcessos?.classList.toggle("hidden", !master);
                nav?.classList.toggle("has-master-access", master);
                nav?.setAttribute("data-user-email", perfil?.email || "");
            } catch (error) {
                console.warn("Não foi possível montar a navegação do usuário:", error);
            }
        });
    } catch (error) {
        console.warn("Não foi possível carregar a navbar:", error);
    }
}

injectNavbar();
