async function injectNavbar() {
    try {
        const response = await fetch("navbar.html");
        if (!response.ok) throw new Error("Navbar não encontrada");
        const navbarHtml = await response.text();
        document.body.insertAdjacentHTML("beforeend", navbarHtml);

        const path = window.location.pathname;
        const page = path.split("/").pop();

        if (page === "index.html" || page === "") {
            document.getElementById("nav-index")?.classList.add("active");
        } else if (page === "times.html") {
            document.getElementById("nav-times")?.classList.add("active");
        } else if (page === "jogadores.html") {
            document.getElementById("nav-jogadores")?.classList.add("active");
        }
    } catch (err) {
        console.warn("Não foi possível carregar a navbar:", err);
    }
}

injectNavbar();