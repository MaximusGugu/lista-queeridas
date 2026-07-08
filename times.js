import { db, doc, setDoc, onSnapshot, auth } from "./firebase-config.js";

window.abrirModal = (id) => { const el = document.getElementById(id); if (el) el.style.display = "flex"; };
window.fecharModal = (id) => { const el = document.getElementById(id); if (el) el.style.display = "none"; };

const docTimesRef = doc(db, "sistema", "montador_times");
const docBancoRef = doc(db, "sistema", "banco_notas");
let players = []; let teams = []; let fase = "rating"; let bancoPermanente = {};

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
    
    if ((!players || players.length === 0) && teams.length === 0) {
        if(aR) aR.style.display = "none";
        if(aT) aT.style.display = "none";
        if(aC) aC.style.display = "none";
        if(aA) aA.style.display = "none";
        return;
    }

    const pendentes = players.filter(p => !bancoPermanente[p.nome]);

    if (pendentes.length > 0 && fase === "rating") {
        if(aR) aR.style.display = "block";
        if(aC) aC.style.display = "none";
        if(aT) aT.style.display = "none";
        if(aA) aA.style.display = "none";
        renderRatingList(pendentes);
    } else {
        if(aR) aR.style.display = "none";
        if(aC) aC.style.display = "flex";
        if(aA) aA.style.display = "flex";
        
        if (fase === "teams" && teams.length > 0) {
            if(aT) aT.style.display = "block";
            renderTeams();
        } else {
            if(aT) aT.style.display = "none";
        }
    }
}

function formatarNome(n) { return n ? n.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : ""; }

function renderRatingList(pendentes) {
    const cont = document.getElementById("areaRating");
    cont.innerHTML = '<p class="label-instrucao">Nomes novos detectados. Verifique o nível:</p>';
    
    pendentes.forEach(p => {
        const div = document.createElement("div");
        div.className = "item-compra";
        div.style.flexDirection = "column";
        div.style.alignItems = "stretch";
        div.style.padding = "15px";
        div.innerHTML = `
            <div class="row-between">
                <span style="font-weight:bold;">${p.nome}</span>
                <div class="qty-controls mini">
                    <button class="btn-qty" onclick="window.changeNewPlayerLevel('${p.id}', -1)">-</button>
                    <span class="level-num" id="lvl-${p.id}">${p.level || 3}</span>
                    <button class="btn-qty" onclick="window.changeNewPlayerLevel('${p.id}', 1)">+</button>
                </div>
            </div>
            <div style="margin-top:10px; font-size:11px;">
                <label><input type="checkbox" ${p.allStars ? 'checked' : ''} onchange="window.setNewAllStar('${p.id}', this.checked)"> Marcar All Star ⭐</label>
            </div>
        `;
        cont.appendChild(div);
    });

    const b = document.createElement("button");
    b.className = "btn btn-main";
    b.style.marginTop = "15px";
    b.innerText = "CONCLUIR E MONTAR";
    b.onclick = () => window.cadastrarNovosEContinuar();
    cont.appendChild(b);
}

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

window.cadastrarNovosEContinuar = async () => {
    const pendentes = players.filter(p => !bancoPermanente[p.nome]);
    pendentes.forEach(p => {
        bancoPermanente[p.nome] = { 
            level: p.level, 
            allStars: !!p.allStars, 
            apelidos: "" 
        };
    });
    
    await setDoc(docBancoRef, bancoPermanente);
    fase = "teams";
    await salvarFirebase();
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
            group: 'teams',
            animation: 150,
            handle: '.drag-handle',
            onEnd: async (evt) => {
                if (evt.from === evt.to) return;
                
                const fromTeamId = parseInt(evt.from.getAttribute('data-team-id'));
                const toTeamId = parseInt(evt.to.getAttribute('data-team-id'));
                const playerId = evt.item.getAttribute('data-player-id');

                const fromTeam = teams.find(t => t.id === fromTeamId);
                const toTeam = teams.find(t => t.id === toTeamId);
                const pMoved = fromTeam.players.find(p => p.id === playerId);

                const candidates = toTeam.players.filter(p => !p.locked && p.id !== playerId);

                if (candidates.length > 0) {
                    candidates.sort((a, b) => Math.abs(a.level - pMoved.level) - Math.abs(b.level - pMoved.level));
                    const pSwap = candidates[0];

                    fromTeam.players = fromTeam.players.filter(p => p.id !== playerId);
                    toTeam.players = toTeam.players.filter(p => p.id !== pSwap.id);

                    toTeam.players.push(pMoved);
                    fromTeam.players.push(pSwap);

                    mostrarToastMover(evt.originalEvent.pageX, evt.originalEvent.pageY, `Troca: ${pMoved.nome} ↔ ${pSwap.nome}`);
                } else {
                    fromTeam.players = fromTeam.players.filter(p => p.id !== playerId);
                    toTeam.players.push(pMoved);
                }

                fromTeam.players = ordenarJogadoresTime(fromTeam.players);
                toTeam.players = ordenarJogadoresTime(toTeam.players);

                await salvarFirebase();
            }
        });
    });
}

function inicializarEventosTimes() {
    // CONSERTO: Botão Colar Lista funcionando
    const btnOpenImport = document.getElementById("btnOpenImport");
    if(btnOpenImport) {
        btnOpenImport.onclick = () => window.abrirModal('modalImport');
    }

    const btnImp = document.getElementById("btnConfirmarImport");
    if(btnImp) {
        btnImp.onclick = async () => {
            const texto = document.getElementById("textoTimesBulk").value.trim();
            if (!texto) return;

            players = texto.split('\n').map(linha => {
                const nomeLimpo = linha.replace(/^\d+[\s.-]*/, '').replace(/[✅|✅️]/g, '').trim();
                const nFormatado = formatarNome(nomeLimpo);
                const m = Object.keys(bancoPermanente).find(k => k.toLowerCase() === nFormatado.toLowerCase());
                
                return {
                    id: "p-" + Math.random().toString(36).substr(2, 9),
                    nome: m || nFormatado,
                    level: m ? (bancoPermanente[m].level || 3) : 3,
                    allStars: m ? !!bancoPermanente[m].allStars : false,
                    locked: false
                };
            }).filter(p => p.nome.length > 1);

            teams = [];
            fase = "rating";
            await salvarFirebase();
            window.fecharModal('modalImport');
        };
    }

    const btnGerar = document.getElementById("btnGerarTimes");
    if (btnGerar) {
        btnGerar.onclick = async () => {
            const nTeams = parseInt(document.getElementById("qtdTimes").value);
            
            let todosJogadores = [];
            if (teams.length > 0) {
                teams.forEach(t => todosJogadores.push(...t.players));
            } else {
                todosJogadores = [...players];
            }

            if (todosJogadores.length === 0) return;

            let nTA = Array.from({ length: nTeams }, (_, i) => ({ 
                id: i, 
                nome: (teams[i] && teams[i].nome) ? teams[i].nome : `Time ${i + 1}`, 
                players: [] 
            }));

            let livres = [];
            todosJogadores.forEach(p => {
                if (p.locked) {
                    const timeOriginal = teams.find(t => t.players.some(tp => tp.id === p.id));
                    if (timeOriginal && timeOriginal.id < nTeams) {
                        nTA[timeOriginal.id].players.push(p);
                    } else {
                        p.locked = false;
                        livres.push(p);
                    }
                } else {
                    livres.push(p);
                }
            });

            livres.sort((a, b) => b.level - a.level);
            livres.forEach(p => {
                nTA.sort((a, b) => {
                    const somaA = a.players.reduce((s, pl) => s + pl.level, 0);
                    const somaB = b.players.reduce((s, pl) => s + pl.level, 0);
                    return somaA - somaB;
                });
                nTA[0].players.push(p);
            });

            teams = nTA.map(team => ({
                ...team,
                players: ordenarJogadoresTime(team.players)
            })).sort((a, b) => a.id - b.id);

            fase = "teams";
            await salvarFirebase();
        };
    }

    const btnLimpar = document.getElementById("btnLimpar");
    if(btnLimpar) {
        btnLimpar.onclick = async () => {
            if(confirm("Limpar tudo?")) {
                players = []; teams = []; fase = "rating";
                await salvarFirebase();
            }
        };
    }
    
    const btnCopy = document.getElementById("btnCopyTimes");
    if(btnCopy) {
        btnCopy.onclick = () => {
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
}

function mostrarToastMover(x, y, texto) {
    const toast = document.createElement('div');
    toast.className = 'toast-copiado';
    toast.innerText = texto;
    toast.style.position = 'fixed';
    toast.style.left = `${x}px`;
    toast.style.top = `${y}px`;
    toast.style.zIndex = '10000';
    toast.style.backgroundColor = 'rgba(0,0,0,0.8)';
    toast.style.whiteSpace = 'nowrap';
    document.body.appendChild(toast);
    setTimeout(() => { if(toast) toast.remove(); }, 1500);
}