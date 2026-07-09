import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";

window.abrirModal = (id) => { const el = document.getElementById(id); if (el) el.style.display = "flex"; };
window.fecharModal = (id) => { const el = document.getElementById(id); if (el) el.style.display = "none"; };

const docTimesRef = doc(db, "sistema", "montador_times");
const docBancoRef = doc(db, "sistema", "banco_notas");
let players = []; let teams = []; let fase = "rating"; let bancoPermanente = {};

// Variável local para armazenar os vínculos antes de salvar
let vinculosTemporarios = {}; 

function ordenarJogadoresTime(jogadores) {
    return jogadores.sort((a, b) => {
        if (a.locked && !b.locked) return -1;
        if (!a.locked && b.locked) return 1;
        return 0;
    });
}

auth.onAuthStateChanged((user) => {
    if (user) {
        onSnapshot(docBancoRef, (snap) => { 
            if (snap.exists()) bancoPermanente = snap.data(); 
            
            onSnapshot(docTimesRef, (snapTimes) => {
                if (snapTimes.exists()) { 
                    const d = snapTimes.data(); 
                    players = d.players || []; 
                    teams = d.teams || []; 
                    fase = d.fase || "rating"; 
                } 
                atualizarUI();
            });
        });
        inicializarEventosTimes();
    } else { window.location.href = "login.html"; }
});

async function salvarFirebase() { 
    if (!auth.currentUser) return;
    try {
        await setDoc(docTimesRef, { players, teams, fase }); 
    } catch (error) {
        console.error("Erro ao salvar no Firebase:", error);
    }
}

function atualizarUI() {
    const aR = document.getElementById("areaRating"), 
          aT = document.getElementById("areaTeams"), 
          aC = document.getElementById("areaConfigTimes"), 
          aA = document.getElementById("areaAcoesFinal");
    
    if (!aR || !aT || !aC || !aA) return;

    if ((!players || players.length === 0) && teams.length === 0) {
        aR.style.display = "none";
        aT.style.display = "none";
        aC.style.display = "none";
        aA.style.display = "none";
        return;
    }

    const pendentes = players.filter(p => !bancoPermanente[p.nome]);

    if (pendentes.length > 0 && fase === "rating") {
        aR.style.display = "block";
        aC.style.display = "none";
        aT.style.display = "none";
        aA.style.display = "none";
        renderRatingList(pendentes);
    } else {
        aR.style.display = "none";
        aC.style.display = "flex";
        aA.style.display = "flex";
        
        if (fase === "teams" && teams.length > 0) {
            aT.style.display = "block";
            renderTeams();
        } else {
            aT.style.display = "none";
        }
    }
}

function formatarNome(n) { return n ? n.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : ""; }

function renderRatingList(pendentes) {
    const cont = document.getElementById("areaRating");
    cont.innerHTML = '<p class="label-instrucao">Nomes novos detectados. Verifique o nível ou vincule a um jogador existente:</p>';
    
    pendentes.forEach(p => {
        const div = document.createElement("div");
        div.className = "item-compra item-rating-pendente";
        div.id = `card-${p.id}`;
        div.style.flexDirection = "column";
        div.style.alignItems = "stretch";
        div.style.padding = "15px";
        div.style.gap = "12px";
        
        // Verifica se este jogador já foi marcado para vínculo nesta sessão (memória local)
        const nomeVinculado = vinculosTemporarios[p.id];

        let htmlInterno = `
            <div class="row-between">
                <span style="font-weight:bold; font-size: 16px;">${p.nome}</span>
                <div class="qty-controls mini" style="${nomeVinculado ? 'opacity:0.3; pointer-events:none;' : ''}">
                    <button class="btn-qty" onclick="window.changeNewPlayerLevel('${p.id}', -1)">-</button>
                    <span class="level-num" id="lvl-${p.id}">${p.level || 3}</span>
                    <button class="btn-qty" onclick="window.changeNewPlayerLevel('${p.id}', 1)">+</button>
                </div>
            </div>
        `;

        if (nomeVinculado) {
            htmlInterno += `
                <div style="background: #ecfdf5; border: 1px solid #bbf7d0; padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="color: #047857; font-weight: 800; font-size: 13px;">✅ VINCULANDO A: ${nomeVinculado}</div>
                    <button onclick="window.cancelarVinculo('${p.id}')" style="background:none; border:none; color:#999; font-size:10px; text-decoration:underline; cursor:pointer; margin-top:5px;">Desfazer vínculo</button>
                </div>
            `;
        } else {
            htmlInterno += `
                <div class="vincular-container" id="vinc-cont-${p.id}" style="background: rgba(0,0,0,0.03); padding: 10px; border-radius: 8px;">
                    <label style="font-size: 10px; font-weight: bold; color: var(--text-muted); display: block; margin-bottom: 5px;">BUSCAR NO BANCO PARA VINCULAR:</label>
                    <input type="text" class="input-modal" style="margin-bottom: 0; flex: 1; font-size: 13px; padding: 10px; border: 1px solid #ddd;" 
                            placeholder="Digite o nome correto aqui..." 
                            oninput="window.buscarParaVincular('${p.id}', this.value)">
                    <div id="results-${p.id}" class="vincular-results" style="margin-top: 5px; max-height: 150px; overflow-y: auto; display: none; border: 1px solid #ddd; border-radius: 6px; background: white; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
                    </div>
                </div>

                <div style="font-size:11px; display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="star-${p.id}" ${p.allStars ? 'checked' : ''} onchange="window.setNewAllStar('${p.id}', this.checked)"> 
                    <label for="star-${p.id}" style="margin:0; cursor:pointer; font-weight: bold; color: var(--text-muted);">MARCAR COMO ALL STAR ⭐</label>
                </div>
            `;
        }

        div.innerHTML = htmlInterno;
        cont.appendChild(div);
    });

    const b = document.createElement("button");
    b.className = "btn btn-main";
    b.style.marginTop = "15px";
    b.innerText = "CONCLUIR E MONTAR TIMES";
    b.onclick = () => window.cadastrarNovosEContinuar();
    cont.appendChild(b);
}

window.buscarParaVincular = (playerId, query) => {
    const resultsDiv = document.getElementById(`results-${playerId}`);
    if (!query || query.length < 2) {
        resultsDiv.style.display = "none";
        return;
    }

    const q = query.toLowerCase();
    const matches = Object.keys(bancoPermanente)
        .filter(nome => nome.toLowerCase().includes(q) || (bancoPermanente[nome].apelidos || "").toLowerCase().includes(q))
        .slice(0, 5);

    if (matches.length > 0) {
        resultsDiv.style.display = "block";
        resultsDiv.innerHTML = matches.map(m => `
            <div class="result-item" 
                 style="padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; font-size: 13px; display: flex; justify-content: space-between; align-items: center; background: white;"
                 onclick="window.setVinculoLocal('${playerId}', '${m.replace(/'/g, "\\'")}')">
                <span style="font-weight: 500;">${m} <small style="color: #999;">(Nível ${bancoPermanente[m].level})</small></span>
                <span style="color: #059669; font-weight: 800; font-size: 10px;">SELECIONAR</span>
            </div>
        `).join('');
    } else {
        resultsDiv.style.display = "none";
    }
};

// Apenas marca localmente, sem salvar no Firebase ainda
window.setVinculoLocal = (playerId, nomeOficial) => {
    vinculosTemporarios[playerId] = nomeOficial;
    atualizarUI();
};

window.cancelarVinculo = (playerId) => {
    delete vinculosTemporarios[playerId];
    atualizarUI();
};

window.cadastrarNovosEContinuar = async () => {
    const pendentes = players.filter(p => !bancoPermanente[p.nome]);
    let houveAlteracaoNoBanco = false;

    pendentes.forEach(p => {
        const nomeOficial = vinculosTemporarios[p.id];

        if (nomeOficial) {
            // CASO 1: FOI VINCULADO
            const dadosNoBanco = bancoPermanente[nomeOficial];
            let apelidosAtuais = dadosNoBanco.apelidos || "";
            const listaApelidos = apelidosAtuais.split(',').map(s => s.trim()).filter(s => s !== "");
            
            if (!listaApelidos.includes(p.nome)) {
                listaApelidos.push(p.nome);
                bancoPermanente[nomeOficial].apelidos = listaApelidos.join(', ');
                houveAlteracaoNoBanco = true;
            }

            // Atualiza o jogador da lista para os dados oficiais
            p.nome = nomeOficial;
            p.level = dadosNoBanco.level;
            p.allStars = !!dadosNoBanco.allStars;

        } else {
            // CASO 2: CADASTRO NOVO (MANUAL)
            bancoPermanente[p.nome] = { 
                level: p.level, 
                allStars: !!p.allStars, 
                apelidos: "" 
            };
            houveAlteracaoNoBanco = true;
        }
    });

    if (houveAlteracaoNoBanco) {
        await setDoc(docBancoRef, bancoPermanente);
    }
    
    vinculosTemporarios = {}; // Limpa memória local
    fase = "teams";
    await salvarFirebase();
};

window.changeNewPlayerLevel = (id, d) => {
    const p = players.find(x => x.id === id);
    if (p) {
        p.level = Math.max(1, Math.min(10, (p.level || 3) + d));
        document.getElementById(`lvl-${id}`).innerText = p.level;
    }
};

window.setNewAllStar = (id, v) => {
    const p = players.find(x => x.id === id);
    if (p) p.allStars = v;
};

window.toggleLock = async (pId) => {
    teams.forEach(t => {
        const p = t.players.find(px => px.id === pId);
        if(p) {
            p.locked = !p.locked;
            t.players = ordenarJogadoresTime(t.players);
        }
    });
    await salvarFirebase();
};

window.changeLevelInTeam = async (id, d) => {
    teams.forEach(t => {
        const p = t.players.find(x => x.id === id);
        if (p) p.level = Math.max(1, Math.min(10, p.level + d));
    });
    await salvarFirebase();
};

window.prepEditTeam = (el) => {
    el.dataset.original = el.value; 
    el.value = ""; 
};

window.revertEditTeam = (el) => {
    setTimeout(() => {
        if (el.dataset.original !== undefined) {
            el.value = el.dataset.original;
            delete el.dataset.original;
        }
    }, 150);
};

window.handleTeamKey = (e, el, teamId) => {
    if (e.key === "Enter") {
        const novoNome = el.value.trim();
        if (novoNome !== "") {
            delete el.dataset.original; 
            window.updateTeamName(teamId, novoNome);
            el.blur();
        } else {
            el.blur(); 
        }
    }
};

window.updateTeamName = (id, val) => {
    const t = teams.find(x => x.id === id);
    if(t) {
        t.nome = val;
        salvarFirebase();
    }
};

function renderTeams() {
    const cont = document.getElementById("areaTeams");
    if (!cont) return;
    cont.innerHTML = `<p class="label-instrucao">Travados (🔒) ficam no topo e não saem no sorteio:</p>`;
    
    teams.forEach((team) => {
        const total = team.players.reduce((acc, p) => acc + p.level, 0);
        const sec = document.createElement("div");
        sec.className = "team-section";
        
        const jogadoresOrdenados = ordenarJogadoresTime([...team.players]);
        const isDefault = /^Time \d+$/i.test(team.nome);
        const cssClass = isDefault ? "is-default" : "is-custom";

        sec.innerHTML = `
            <div class="team-header">
                <input type="text" 
                    class="team-title ${cssClass}" 
                    value="${team.nome}" 
                    onfocus="window.prepEditTeam(this)"
                    onblur="window.revertEditTeam(this)"
                    onkeydown="window.handleTeamKey(event, this, ${team.id})">
                <div class="team-total">Soma: ${total}</div>
            </div>
            <div class="team-list-drop" data-team-id="${team.id}">
                ${jogadoresOrdenados.map(p => `
                    <div class="item-compra ${p.locked ? 'is-locked' : ''}" data-player-id="${p.id}">
                        <div class="drag-handle">⠿</div>
                        <div class="input-item">${p.nome}${p.allStars ? ' ⭐' : ''}</div>
                        <div class="qty-controls mini">
                            <button class="btn-qty" onclick="window.changeLevelInTeam('${p.id}', -1)">-</button>
                            <span class="level-num">${p.level}</span>
                            <button class="btn-qty" onclick="window.changeLevelInTeam('${p.id}', 1)">+</button>
                        </div>
                        <button class="btn-lock ${p.locked ? 'locked' : ''}" onclick="window.toggleLock('${p.id}')">
                            ${p.locked ? '🔒' : '🔓'}
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
        cont.appendChild(sec);

        new Sortable(sec.querySelector('.team-list-drop'), {
            group: 'teams', animation: 150, handle: '.drag-handle',
            onEnd: async (evt) => {
                if (evt.from === evt.to) return;
                const fromId = parseInt(evt.from.getAttribute('data-team-id'));
                const toId = parseInt(evt.to.getAttribute('data-team-id'));
                const pId = evt.item.getAttribute('data-player-id');
                const fromT = teams.find(t => t.id === fromId);
                const toT = teams.find(t => t.id === toId);
                const pMov = fromT.players.find(p => p.id === pId);
                const cand = toT.players.filter(p => !p.locked && p.id !== pId);

                if (cand.length > 0) {
                    cand.sort((a, b) => Math.abs(a.level - pMov.level) - Math.abs(b.level - pMov.level));
                    const pSwap = cand[0];
                    fromT.players = fromT.players.filter(p => p.id !== pId);
                    toT.players = toT.players.filter(p => p.id !== pSwap.id);
                    toT.players.push(pMov);
                    fromT.players.push(pSwap);
                    mostrarToastMover(evt.originalEvent.pageX, evt.originalEvent.pageY, `Troca: ${pMov.nome} ↔ ${pSwap.nome}`);
                } else {
                    fromT.players = fromT.players.filter(p => p.id !== pId);
                    toT.players.push(pMov);
                }
                fromT.players = ordenarJogadoresTime(fromT.players);
                toT.players = ordenarJogadoresTime(toT.players);
                await salvarFirebase();
            }
        });
    });
}

function inicializarEventosTimes() {
    const btnOpenImport = document.getElementById("btnOpenImport");
    if(btnOpenImport) btnOpenImport.onclick = () => window.abrirModal('modalImport');

    const btnImp = document.getElementById("btnConfirmarImport");
    if(btnImp) {
        btnImp.onclick = async () => {
            const texto = document.getElementById("textoTimesBulk").value.trim();
            if (!texto) return;

            players = texto.split('\n').map(linha => {
                const nomeLimpo = linha.replace(/^\d+[\s.-]*/, '').replace(/[✅|✅️]/g, '').trim();
                const nFormatado = formatarNome(nomeLimpo);
                let m = Object.keys(bancoPermanente).find(k => k.toLowerCase() === nFormatado.toLowerCase());
                if (!m) {
                    m = Object.keys(bancoPermanente).find(k => {
                        const apelidos = (bancoPermanente[k].apelidos || "").toLowerCase().split(',').map(s => s.trim());
                        return apelidos.includes(nFormatado.toLowerCase());
                    });
                }
                return {
                    id: "p-" + Math.random().toString(36).substr(2, 9),
                    nome: m || nFormatado,
                    level: m ? (bancoPermanente[m].level || 3) : 3,
                    allStars: m ? !!bancoPermanente[m].allStars : false,
                    locked: false
                };
            }).filter(p => p.nome.length > 1);

            teams = []; fase = "rating";
            await salvarFirebase();
            window.fecharModal('modalImport');
        };
    }

    const btnGerar = document.getElementById("btnGerarTimes");
    if (btnGerar) {
        btnGerar.onclick = async () => {
            const nTeams = parseInt(document.getElementById("qtdTimes").value);
            let todos = (teams.length > 0) ? teams.flatMap(t => t.players) : [...players];
            if (todos.length === 0) return;

            let nTA = Array.from({ length: nTeams }, (_, i) => ({ 
                id: i, nome: (teams[i] && teams[i].nome) ? teams[i].nome : `Time ${i + 1}`, players: [] 
            }));

            let livres = [];
            todos.forEach(p => {
                if (p.locked) {
                    const tOrig = teams.find(t => t.players.some(tp => tp.id === p.id));
                    if (tOrig && tOrig.id < nTeams) nTA[tOrig.id].players.push(p);
                    else { p.locked = false; livres.push(p); }
                } else { livres.push(p); }
            });

            livres.sort((a, b) => b.level - a.level).forEach(p => {
                nTA.sort((a, b) => a.players.reduce((s, pl) => s + pl.level, 0) - b.players.reduce((s, pl) => s + pl.level, 0));
                nTA[0].players.push(p);
            });

            teams = nTA.map(t => ({ ...t, players: ordenarJogadoresTime(t.players) })).sort((a, b) => a.id - b.id);
            fase = "teams";
            await salvarFirebase();
        };
    }

    document.getElementById("btnLimpar").onclick = async () => {
        if(confirm("Limpar tudo?")) { players = []; teams = []; fase = "rating"; await salvarFirebase(); }
    };
    
    document.getElementById("btnCopyTimes").onclick = () => {
        let txt = "⭐ *TIMES QUEERIDAS* ⭐\n\n";
        teams.forEach(t => {
            txt += `*${t.nome.toUpperCase()}*\n`;
            t.players.forEach(p => txt += `- ${p.nome}\n`);
            txt += `\n`;
        });
        navigator.clipboard.writeText(txt);
        alert("Times copiados!");
    };
}

function mostrarToastMover(x, y, texto) {
    const toast = document.createElement('div');
    toast.className = 'toast-copiado';
    toast.innerText = texto;
    toast.style.position = 'fixed';
    toast.style.left = `${x}px`; toast.style.top = `${y}px`;
    toast.style.zIndex = '10000';
    toast.style.backgroundColor = 'rgba(0,0,0,0.8)';
    document.body.appendChild(toast);
    setTimeout(() => { if(toast) toast.remove(); }, 1500);
}