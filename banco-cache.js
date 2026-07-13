const CHAVE_CACHE_BANCO = "queeridas_banco_notas_cache_v1";

function objetoValido(valor) {
    return valor && typeof valor === "object" && !Array.isArray(valor);
}

export function carregarBancoCache() {
    try {
        const salvo = JSON.parse(localStorage.getItem(CHAVE_CACHE_BANCO) || "null");
        return objetoValido(salvo?.dados) ? salvo.dados : {};
    } catch (error) {
        console.warn("Não foi possível ler o cache local do banco:", error);
        return {};
    }
}

export function salvarBancoCache(dados) {
    if (!objetoValido(dados)) return;
    try {
        localStorage.setItem(CHAVE_CACHE_BANCO, JSON.stringify({
            dados,
            atualizadoEm: Date.now()
        }));
    } catch (error) {
        console.warn("Não foi possível atualizar o cache local do banco:", error);
    }
}
