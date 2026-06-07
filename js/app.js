/* app.js - inicialização, navegação entre telas e ligações de UI */

const App = (() => {
  const $ = (sel) => document.querySelector(sel);

  const screens = {
    login: $("#screen-login"),
    home: $("#screen-home"),
    game: $("#screen-game"),
  };

  const modals = {
    rules: $("#rules-modal"),
    pause: $("#pause-modal"),
    gameover: $("#gameover-modal"),
    profiles: $("#profiles-modal"),
    ranking: $("#ranking-modal"),
    online: $("#online-modal"),
    lobby: $("#lobby-modal"),
    admin: $("#admin-modal"),
  };

  let settings = loadSettings();

  // Online
  let gameMode = "local"; // local | online
  let onlineInGame = false;
  let onlineOverHandled = false;
  let onlineLastCur = null;
  let pendingWildId = null;
  let onlinePrevCounts = {};
  let onlineLastLogV = 0;
  let onlineTimerInt = null;

  // Auth
  let authTab = "login";
  let bioSupported = false;
  let isAdminUser = false;

  // Faixas de ranking (matchmaking por tier)
  const TIERS = [
    { id: "diamante", label: "💎 Diamante", min: 1500 },
    { id: "ouro", label: "🥇 Ouro", min: 700 },
    { id: "prata", label: "🥈 Prata", min: 300 },
    { id: "bronze", label: "🥉 Bronze", min: 100 },
    { id: "iniciante", label: "🔰 Iniciante", min: 0 },
  ];
  function tierOf(points) {
    return TIERS.find((t) => (points || 0) >= t.min) || TIERS[TIERS.length - 1];
  }
  function tierLabel(id) {
    const t = TIERS.find((x) => x.id === id);
    return t ? t.label : "🔰 Iniciante";
  }

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem("unolike.settings")) || {};
    } catch {
      return {};
    }
  }
  function saveSettings() {
    localStorage.setItem("unolike.settings", JSON.stringify(settings));
  }

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("screen--active"));
    screens[name].classList.add("screen--active");
  }

  const modalStack = [];
  let deferredPrompt = null;

  function pushSentinel() {
    try {
      history.pushState({ xc: 1 }, "");
    } catch (e) {}
  }

  function openModal(name) {
    modals[name].hidden = false;
    const i = modalStack.indexOf(name);
    if (i >= 0) modalStack.splice(i, 1);
    modalStack.push(name);
    pushSentinel();
  }
  function closeModal(name) {
    modals[name].hidden = true;
    const i = modalStack.lastIndexOf(name);
    if (i >= 0) modalStack.splice(i, 1);
  }

  function cancelColorPicker() {
    UI.hideColorPicker();
    pendingWildId = null;
    if (gameMode !== "online") Game.cancelColor();
  }

  // Botão "voltar" (Android / navegador): fecha o que estiver por cima
  function onPopState() {
    if (!$("#color-picker").hidden) {
      cancelColorPicker();
      pushSentinel();
      return;
    }
    if (modalStack.length) {
      const top = modalStack[modalStack.length - 1];
      if (top === "lobby") leaveOnline();
      closeModal(top);
      pushSentinel();
      return;
    }
    if (isActive("game")) {
      if (gameMode === "online") leaveOnline();
      showScreen("home");
      pushSentinel();
      return;
    }
    pushSentinel(); // na home/login: evita sair sem querer
  }

  // ---------- Perfis ----------
  function ensureProfile() {
    if (!Profiles.current()) {
      const list = Profiles.all();
      if (list.length) Profiles.setCurrent(list[0].id);
      else Profiles.create(settings.name || "Você");
    }
  }

  function renderProfileChip() {
    const p = Profiles.current();
    if (!p) return;
    $("#profile-chip-avatar").textContent = p.avatar;
    $("#profile-chip-name").textContent = p.name;
    $("#profile-chip-stats").textContent =
      `${p.stats.wins} ${p.stats.wins === 1 ? "vitória" : "vitórias"} · ${p.stats.points} pts`;
  }

  function statBadges(s) {
    const games = s.games || 0;
    const winRate = games ? Math.round((s.wins / games) * 100) : 0;
    const t = tierOf(s.points);
    return (
      `<div class="stat"><b>${s.points}</b><span>pontos</span></div>` +
      `<div class="stat"><b>${s.wins}</b><span>vitórias</span></div>` +
      `<div class="stat"><b>${games}</b><span>jogos</span></div>` +
      `<div class="stat"><b>${winRate}%</b><span>aproveit.</span></div>` +
      `<div class="stat"><b>${s.bestScore}</b><span>recorde</span></div>` +
      `<div class="stat stat--tier"><b>${t.label}</b><span>tier</span></div>`
    );
  }

  function renderPlayerArea() {
    const p = Profiles.current();
    if (!p) return;
    $("#pa-avatar").textContent = p.avatar;
    $("#pa-name").textContent = p.name;
    $("#pa-email").textContent = (Auth.available() && Auth.email()) || "";
    $("#pa-stats").innerHTML = statBadges(p.stats);
    $("#pa-name-input").value = p.name;
    const acct = Auth.available() && Auth.isLoggedIn();
    $("#pa-pass-section").style.display = acct ? "" : "none";
    $("#btn-logout-2").style.display = acct ? "" : "none";
    $("#pa-msg").textContent = "";
    renderAvatarPicker();
  }

  function renderAvatarPicker() {
    const wrap = $("#avatar-picker");
    if (!wrap) return;
    wrap.innerHTML = "";
    const p = Profiles.current();
    Profiles.AVATARS.forEach((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "avatar-opt" + (p && a === p.avatar ? " avatar-opt--active" : "");
      b.textContent = a;
      b.addEventListener("click", () => {
        if (!p) return;
        Profiles.update(p.id, (x) => (x.avatar = a));
        renderPlayerArea();
        renderProfileChip();
      });
      wrap.appendChild(b);
    });
  }

  function saveProfile() {
    const p = Profiles.current();
    if (!p) return;
    const name = $("#pa-name-input").value.trim().slice(0, 12) || p.name;
    Profiles.update(p.id, (x) => (x.name = name));
    renderPlayerArea();
    renderProfileChip();
    $("#pa-msg").textContent = "Perfil salvo!";
  }

  async function changeProfilePassword() {
    const np = $("#pa-new-pass").value;
    if (!np || np.length < 6) {
      $("#pa-msg").textContent = "A nova senha precisa de ao menos 6 caracteres.";
      return;
    }
    $("#pa-msg").textContent = "Atualizando senha…";
    const { error } = await Auth.changePassword(np);
    $("#pa-new-pass").value = "";
    $("#pa-msg").textContent = error ? error.message || "Falha ao atualizar." : "Senha atualizada!";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  // ---------- Ranking ----------
  let rankingTab = "global";

  function renderRanking() {
    const list = $("#ranking-list");
    document.querySelectorAll("#ranking-modal .tab").forEach((t) =>
      t.classList.toggle("tab--active", t.dataset.tab === rankingTab)
    );

    if (rankingTab === "voce") {
      const p = Profiles.current();
      list.innerHTML = p
        ? rankingRows([
            {
              name: p.name,
              avatar: p.avatar,
              points: p.stats.points,
              wins: p.stats.wins,
              games: p.stats.games,
              best_score: p.stats.bestScore,
            },
          ])
        : '<p class="muted-text">Sem dados ainda.</p>';
      return;
    }

    // Global
    if (!Net.available()) {
      list.innerHTML =
        '<p class="muted-text">Ranking global indisponível.<br>Configure o Supabase em <code>js/config.js</code> para ativar.</p>';
      return;
    }
    list.innerHTML = '<p class="muted-text">Carregando…</p>';
    Net.leaderboard().then((rows) => {
      if (rankingTab !== "global") return;
      if (!rows) {
        list.innerHTML = '<p class="muted-text">Não foi possível carregar o ranking global.</p>';
        return;
      }
      list.innerHTML = rows.length
        ? rankingRows(rows)
        : '<p class="muted-text">Ninguém no ranking global ainda.</p>';
    });
  }

  function rankingRows(rows) {
    const medals = ["🥇", "🥈", "🥉"];
    return rows
      .map((r, i) => {
        const pos = medals[i] || `${i + 1}.`;
        return (
          `<div class="rank-row">` +
          `<span class="rank-pos">${pos}</span>` +
          `<span class="rank-av">${r.avatar || "🙂"}</span>` +
          `<span class="rank-name">${escapeHtml(r.name)}</span>` +
          `<span class="rank-pts">${r.points} pts</span>` +
          `<small class="rank-sub">${r.wins}V/${r.games}J</small>` +
          `</div>`
        );
      })
      .join("");
  }

  // ---------- Admin ----------
  function updateAdminUI() {
    const b = $("#btn-admin");
    if (b) b.hidden = !isAdminUser;
  }

  function timeAgo(ts) {
    if (!ts) return "—";
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "agora";
    if (m < 60) return m + "min";
    const h = Math.floor(m / 60);
    if (h < 24) return h + "h";
    return Math.floor(h / 24) + "d";
  }

  function adminCard(value, label) {
    return `<div class="admin-stat"><b>${value}</b><span>${label}</span></div>`;
  }

  function renderAdmin() {
    const box = $("#admin-content");
    box.innerHTML = '<p class="muted-text">Carregando…</p>';
    Net.adminData().then((rows) => {
      if (!rows) {
        box.innerHTML =
          '<p class="muted-text">Não foi possível carregar. Confirme o schema e a role de admin.</p>';
        return;
      }
      const total = rows.length;
      const players = rows.filter((r) => (r.games || 0) > 0).length;
      const conv = total ? Math.round((players / total) * 100) : 0;
      const totalGames = rows.reduce((s, r) => s + (r.games || 0), 0);
      const totalAband = rows.reduce((s, r) => s + (r.abandons || 0), 0);
      const active7 = rows.filter(
        (r) => r.last_seen && Date.now() - new Date(r.last_seen).getTime() < 7 * 864e5
      ).length;
      const avg = players ? (totalGames / players).toFixed(1) : "0";

      const cards =
        '<div class="admin-stats">' +
        adminCard(total, "usuários") +
        adminCard(players, "jogaram") +
        adminCard(conv + "%", "conversão") +
        adminCard(active7, "ativos 7d") +
        adminCard(totalGames, "partidas") +
        adminCard(avg, "média/jog.") +
        adminCard(totalAband, "abandonos") +
        "</div>";

      const list = rows
        .slice()
        .sort((a, b) => (b.points || 0) - (a.points || 0))
        .map(
          (r) =>
            '<div class="admin-row">' +
            `<span class="admin-av">${r.avatar || "🙂"}</span>` +
            `<div class="admin-info"><strong>${escapeHtml(r.name || "Jogador")}${
              r.is_admin ? " 🛠️" : ""
            }</strong>` +
            `<small>${r.points || 0} pts · ${r.wins || 0}V/${r.games || 0}J · ${
              r.abandons || 0
            } aband. · ${r.logins || 0} logins</small></div>` +
            `<span class="admin-seen">${timeAgo(r.last_seen)}</span>` +
            "</div>"
        )
        .join("");

      box.innerHTML =
        cards +
        '<h3 class="pa-h3">Usuários</h3>' +
        '<div class="admin-list">' +
        (list || '<p class="muted-text">Sem usuários ainda.</p>') +
        "</div>";
    });
  }

  // ---------- Início de partida ----------
  function startGame() {
    Sound.unlock();
    ensureProfile();
    gameMode = "local";
    const profile = Profiles.current();
    const opponents = parseInt($("#opponent-count").value, 10);

    settings.opponents = opponents;
    saveSettings();

    showScreen("game");
    Game.newGame({ playerName: profile.name, opponentCount: opponents });
  }

  // ---------- Online ----------
  function setOnlineBusy(busy) {
    ["#btn-create-room", "#btn-join-room", "#btn-public-match"].forEach((s) => {
      const b = $(s);
      if (b) b.disabled = busy;
    });
  }

  function renderLobby(l) {
    setOnlineBusy(false);
    if (onlineInGame) return;
    closeModal("online");
    openModal("lobby");
    $("#lobby-code").textContent = l.code || "----";
    $("#lobby-code-wrap").style.display = l.isPublic ? "none" : "";

    const wrap = $("#lobby-players");
    wrap.innerHTML = "";
    l.players.forEach((p) => {
      const row = document.createElement("div");
      row.className = "lobby-player";
      row.innerHTML =
        `<span class="lobby-player__av">${p.avatar || "🙂"}</span>` +
        `<span class="lobby-player__name">${escapeHtml(p.name)}</span>` +
        (p.host ? '<span class="lobby-host">host</span>' : "");
      wrap.appendChild(row);
    });

    const start = $("#btn-lobby-start");
    start.style.display = l.isHost ? "" : "none";
    start.disabled = !(l.isHost && l.players.length >= 2);
    start.textContent = l.isPublic ? "Começar agora" : "Começar";

    let status;
    if (l.isPublic) {
      const tl = tierLabel(l.tier);
      if (l.countdown != null && l.players.length >= 2) {
        status = `Matchmaking ${tl} — começando em ${l.countdown}s…`;
      } else {
        status = `Matchmaking ${tl} — procurando jogadores… (${l.players.length}/4)`;
      }
    } else {
      status = l.isHost
        ? l.players.length < 2
          ? "Aguardando jogadores entrarem…"
          : "Pronto para começar!"
        : "Aguardando o host iniciar…";
    }
    $("#lobby-status").textContent = status;
  }

  function enterOnline(state) {
    gameMode = "online";
    onlineInGame = true;
    onlineOverHandled = false;
    onlineLastCur = null;
    pendingWildId = null;
    onlinePrevCounts = {};
    onlineLastLogV = state.version;
    startOnlineTimer();
    closeModal("lobby");
    closeModal("online");
    closeModal("gameover");
    UI.hideColorPicker();
    showScreen("game");
    renderOnline(state);
  }

  function renderOnline(state) {
    const meId = Online.getMe().id;
    const curId = state.players[state.currentIndex].id;
    const top = state.discard[state.discard.length - 1];
    const myTurn = curId === meId && state.status === "playing";

    // Avisos de timeout/abandono (uma vez por versão de estado)
    if (state.version !== onlineLastLogV) {
      onlineLastLogV = state.version;
      (state.log || []).forEach((l) => {
        if (l.t === "timeout") UI.banner(`${l.name} demorou! +1 carta`, 1300, true);
        else if (l.t === "abandon") UI.banner(`${l.name} abandonou 🚫`, 1700);
        else if (l.t === "uno") UI.showXablau(l.name); // só quando alguém declara
      });
    }

    // Oponentes
    const opp = $("#opponents");
    opp.innerHTML = "";
    state.players
      .filter((p) => p.id !== meId)
      .forEach((p) => {
        const div = document.createElement("div");
        div.className =
          "opponent" +
          (p.id === curId && state.status === "playing" ? " active" : "") +
          (p.out ? " opponent--out" : "");
        const av = document.createElement("div");
        av.className = "opponent__avatar";
        av.style.background = "transparent";
        av.style.fontSize = "30px";
        av.textContent = p.avatar || "🙂";
        const name = document.createElement("div");
        name.className = "opponent__name";
        name.textContent = p.name;
        const cards = document.createElement("div");
        cards.className = "opponent__cards";
        for (let i = 0; i < Math.min(p.hand.length, 5); i++) {
          const mc = document.createElement("div");
          mc.className = "mini-card";
          cards.appendChild(mc);
        }
        const count = document.createElement("div");
        count.className = "opponent__count";
        if (p.out) count.textContent = "saiu 🚫";
        else if (p.hand.length === 1) count.innerHTML = '<span class="uno-flag">UNO</span>';
        else count.textContent = `${p.hand.length} cartas`;
        div.append(av, name, cards, count);
        opp.appendChild(div);
      });

    // Descarte / cor / direção
    const disc = $("#discard-pile");
    disc.innerHTML = "";
    const face = UI.buildCardFace(top);
    face.classList.add("flip-in");
    disc.appendChild(face);
    $("#color-badge").className = "color-badge" + (state.activeColor ? " " + state.activeColor : "");
    $("#table-glow").className = "table-glow" + (state.activeColor ? " " + state.activeColor : "");
    $("#direction-indicator").classList.toggle("reversed", state.direction === -1);

    // Minha mão
    const meP = state.players.find((p) => p.id === meId);
    const hand = $("#player-hand");
    hand.innerHTML = "";
    const playableIds = new Set(
      myTurn ? meP.hand.filter((c) => canPlay(c, top, state.activeColor)).map((c) => c.id) : []
    );
    const sorted = [...meP.hand].sort((a, b) =>
      a.color !== b.color ? COLORS.indexOf(a.color) - COLORS.indexOf(b.color) : a.value.localeCompare(b.value)
    );
    sorted.forEach((card) => {
      const f = UI.buildCardFace(card);
      if (myTurn && playableIds.has(card.id)) f.classList.add("playable");
      else if (myTurn) f.classList.add("disabled");
      f.addEventListener("click", () => onlineCardClick(card, playableIds));
      const slot = document.createElement("div");
      slot.className = "card-slot";
      slot.appendChild(f);
      hand.appendChild(slot);
    });
    UI.layoutFan(hand);
    $("#player-label").textContent = `${meP.name} — ${meP.hand.length} cartas`;

    // Compra / UNO / destaque
    const canDraw = myTurn && playableIds.size === 0;
    $("#draw-pile").classList.toggle("must-draw", canDraw);
    $("#draw-pile").style.opacity = myTurn ? "1" : "0.6";
    $("#draw-hint").textContent = canDraw ? "Compre!" : "Comprar";
    UI.setUnoButton(meP.hand.length === 1 && !meP.saidUno);
    $(".player-area").classList.toggle("active", myTurn);

    // Banner de vez
    if (state.status === "playing" && curId !== onlineLastCur) {
      onlineLastCur = curId;
      const curP = state.players[state.currentIndex];
      UI.banner(curId === meId ? "Sua vez!" : `Vez de ${curP.name}`, 900, curId !== meId);
    }

    if (state.status === "over" && !onlineOverHandled) showOnlineOver(state);
  }

  function onlineCardClick(card, playableIds) {
    if (!playableIds.has(card.id)) {
      const node = $("#player-hand").querySelector(`[data-id="${card.id}"]`);
      if (node)
        node.animate(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-6px)" },
            { transform: "translateX(6px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 220 }
        );
      return;
    }
    if (isWild(card)) {
      pendingWildId = card.id;
      UI.showColorPicker();
    } else {
      Online.play(card.id);
    }
  }

  function showOnlineOver(state) {
    onlineOverHandled = true;
    stopOnlineTimer();
    const meId = Online.getMe().id;
    const meP = state.players.find((p) => p.id === meId);
    const winner = state.players.find((p) => p.id === state.winnerId);
    const won = !!winner && winner.id === meId;
    const iAbandoned = !!(meP && meP.out);

    const profile = Profiles.current();
    if (profile) {
      let score = 0;
      if (won)
        score = state.players
          .filter((p) => p.id !== meId)
          .reduce((s, p) => s + handPoints(p.hand), 0);
      Profiles.recordResult(profile.id, { won, score });
      // Se fui desclassificado por abandono, o host já penalizou no global
      if (!iAbandoned) {
        Net.submitResult({ name: profile.name, avatar: profile.avatar, won, points: score });
      }
      renderProfileChip();
    }

    if (iAbandoned) {
      $("#gameover-title").textContent = "Você abandonou 🚫";
      $("#gameover-text").textContent = "Demorou demais — ranking penalizado.";
    } else {
      $("#gameover-title").textContent = won ? "Você venceu! 🏆" : `${winner ? winner.name : "Alguém"} venceu`;
      $("#gameover-text").textContent = won ? "Boa! Vitória online." : "Mais sorte na próxima!";
    }
    $("#gameover-points").hidden = true;
    $("#btn-rematch").style.display = Online.isHost() ? "" : "none";
    openModal("gameover");
  }

  function leaveOnline() {
    Online.leave();
    gameMode = "local";
    onlineInGame = false;
    stopOnlineTimer();
  }

  // ---------- Timer de turno (online) ----------
  function startOnlineTimer() {
    stopOnlineTimer();
    onlineTimerInt = setInterval(tickTurnTimer, 250);
    tickTurnTimer();
  }
  function stopOnlineTimer() {
    if (onlineTimerInt) clearInterval(onlineTimerInt);
    onlineTimerInt = null;
    const el = $("#turn-timer");
    if (el) el.hidden = true;
  }
  function tickTurnTimer() {
    const el = $("#turn-timer");
    if (!el) return;
    const st = Online.getState();
    if (!st || st.status !== "playing" || !st.turnDeadline) {
      el.hidden = true;
      return;
    }
    const rem = Math.max(0, Math.ceil((st.turnDeadline - Date.now()) / 1000));
    const me = Online.getMe();
    const curP = st.players[st.currentIndex];
    const mine = me && curP && curP.id === me.id;
    el.hidden = false;
    el.textContent = `⏱ ${mine ? "Sua vez — " : curP.name + " — "}${rem}s`;
    el.classList.toggle("warn", rem <= 10);
    el.classList.toggle("mine", !!mine);
  }

  // ---------- Autenticação (cadastro obrigatório) ----------
  function isActive(name) {
    return screens[name] && screens[name].classList.contains("screen--active");
  }

  function ensureAccountProfile() {
    ensureProfile();
    const p = Profiles.current();
    const em = Auth.email();
    if (p && em && (p.name === "Você" || !p.name)) {
      Profiles.update(p.id, (x) => (x.name = em.split("@")[0].slice(0, 12)));
    }
  }

  function applyAuthGate() {
    // Sem backend: libera o jogo localmente
    if (!Auth.available()) {
      $("#btn-logout").hidden = true;
      if (isActive("login")) showScreen("home");
      return;
    }
    if (Auth.isLoggedIn()) {
      ensureAccountProfile();
      renderProfileChip();
      $("#btn-logout").hidden = false;
      updateBioUI();
      if (Net.available()) {
        const pr = Profiles.current();
        Net.touchProfile(pr ? pr.name : "Jogador", pr ? pr.avatar : "🙂");
        Net.fetchMe().then((row) => {
          isAdminUser = !!(row && row.is_admin);
          updateAdminUI();
        });
      }
      if (isActive("login")) showScreen("home");
    } else {
      $("#btn-logout").hidden = true;
      isAdminUser = false;
      updateAdminUI();
      if (onlineInGame) leaveOnline();
      updateBioUI();
      const em = $("#auth-email");
      if (em && !em.value && Biometric.storedEmail()) em.value = Biometric.storedEmail();
      showScreen("login");
      if (em && !em.value) setTimeout(() => em.focus(), 50);
    }
  }

  function authMsg(text) {
    $("#auth-msg").textContent = text || "";
  }

  function setAuthTab(name) {
    authTab = name;
    document
      .querySelectorAll("[data-auth]")
      .forEach((x) => x.classList.toggle("tab--active", x.dataset.auth === authTab));
    $("#btn-auth-primary").textContent = authTab === "signup" ? "Criar conta" : "Entrar";
  }

  function userAlreadyExists(data) {
    // Supabase (anti-enumeração): com confirmação de e-mail ligada, um
    // cadastro de e-mail já existente volta sem erro, com identities vazio.
    const u = data && data.user;
    return !!(u && Array.isArray(u.identities) && u.identities.length === 0);
  }

  async function doAuthPrimary() {
    const em = $("#auth-email").value.trim();
    const pass = $("#auth-pass").value;
    if (!em || !pass) {
      authMsg("Preencha e-mail e senha.");
      return;
    }
    if (pass.length < 6) {
      authMsg("A senha precisa de pelo menos 6 caracteres.");
      return;
    }

    $("#btn-auth-primary").disabled = true;
    authMsg("Processando…");
    try {
      if (authTab === "signup") {
        const { data, error } = await Auth.signUp(em, pass);
        if (error) {
          const m = (error.message || "").toLowerCase();
          if (m.includes("already") || m.includes("registered") || m.includes("exist")) {
            authMsg("Esse e-mail já tem conta. Use “Entrar”.");
            setAuthTab("login");
          } else {
            authMsg(error.message || "Não foi possível criar a conta.");
          }
          return;
        }
        if (userAlreadyExists(data)) {
          authMsg("Esse e-mail já tem conta. Use “Entrar”.");
          setAuthTab("login");
          return;
        }
        if (data && !data.session) {
          authMsg("Conta criada! Confirme pelo e-mail (ou use o link mágico).");
          setAuthTab("login");
          return;
        }
        authMsg(""); // sessão criada → entra direto
        return;
      }

      // Login
      const { error } = await Auth.signIn(em, pass);
      if (error) {
        const m = (error.message || "").toLowerCase();
        if (m.includes("invalid")) authMsg("E-mail ou senha incorretos.");
        else if (m.includes("confirm")) authMsg("Confirme seu e-mail antes de entrar (ou use o link mágico).");
        else authMsg(error.message || "Não foi possível entrar.");
        return;
      }
      authMsg("");
    } finally {
      $("#btn-auth-primary").disabled = false;
    }
  }

  async function doMagicLink() {
    const em = $("#auth-email").value.trim();
    if (!em) {
      authMsg("Digite seu e-mail para receber o link.");
      return;
    }
    authMsg("Enviando link…");
    const { error } = await Auth.magicLink(em);
    authMsg(error ? error.message : "Link enviado! Verifique seu e-mail.");
  }

  // ---------- Biometria ----------
  function updateBioUI() {
    const toggle = $("#btn-bio-toggle");
    if (toggle) {
      const show = bioSupported && Auth.isLoggedIn();
      toggle.hidden = !show;
      toggle.textContent = Biometric.isEnabled() ? "🔐 Desativar biometria" : "🔐 Ativar biometria";
    }
    const loginBtn = $("#btn-biometric");
    if (loginBtn) loginBtn.hidden = !(bioSupported && Biometric.canLogin());
  }

  async function biometricLogin() {
    if (!Biometric.canLogin()) return;
    authMsg("Verificando biometria…");
    try {
      const ok = await Biometric.verify();
      if (!ok) {
        authMsg("Biometria não reconhecida.");
        return;
      }
      const { error } = await Auth.restore(Biometric.token());
      if (error) {
        authMsg("Sessão expirada — entre uma vez com e-mail.");
        return;
      }
      authMsg("");
    } catch (e) {
      authMsg("Não foi possível usar a biometria.");
    }
  }

  async function toggleBiometric() {
    if (!Auth.isLoggedIn()) return;
    if (Biometric.isEnabled()) {
      Biometric.disable();
      updateBioUI();
      UI.banner("Biometria desativada", 1400);
      return;
    }
    const sess = Auth.getSession();
    if (!sess || !sess.refresh_token) {
      UI.banner("Entre novamente para ativar a biometria", 1800);
      return;
    }
    try {
      await Biometric.enroll(sess.refresh_token, Auth.email());
      updateBioUI();
      UI.banner("Biometria ativada 🔐", 1600);
    } catch (e) {
      UI.banner("Não foi possível ativar a biometria", 1800);
    }
  }

  function showGameOver(winner) {
    const state = Game.getState();
    const profile = Profiles.current();
    const won = winner.isHuman;

    // Pontuação estilo UNO: vencedor soma os pontos das cartas dos demais
    let score = 0;
    if (won) {
      score = state.players
        .filter((p) => !p.isHuman)
        .reduce((sum, p) => sum + handPoints(p.hand), 0);
    }

    if (profile) {
      Profiles.recordResult(profile.id, { won, score });
      // O usuário é o jogador: resultados contam no ranking global
      Net.submitResult({ name: profile.name, avatar: profile.avatar, won, points: score });
    }
    renderProfileChip();

    const title = $("#gameover-title");
    const text = $("#gameover-text");
    const pts = $("#gameover-points");
    $("#btn-rematch").style.display = ""; // garante visível no modo local
    if (won) {
      title.textContent = "Você venceu! 🏆";
      text.textContent = "Mandou bem!";
      pts.hidden = false;
      pts.innerHTML = `+<strong>${score}</strong> pontos`;
    } else {
      title.textContent = "Você perdeu";
      text.textContent = `${winner.name} ficou sem cartas primeiro.`;
      pts.hidden = true;
    }
    openModal("gameover");
  }

  // ---------- Ligações de eventos da interface ----------
  function bindUI() {
    // Home
    $("#btn-start").addEventListener("click", startGame);
    $("#btn-rules").addEventListener("click", () => openModal("rules"));
    $("#btn-close-rules").addEventListener("click", () => closeModal("rules"));
    $("#btn-ranking").addEventListener("click", () => {
      rankingTab = "global";
      renderRanking();
      openModal("ranking");
    });

    // Admin
    $("#btn-admin").addEventListener("click", () => {
      renderAdmin();
      openModal("admin");
    });
    $("#btn-close-admin").addEventListener("click", () => closeModal("admin"));
    $("#btn-admin-refresh").addEventListener("click", renderAdmin);

    // Área do jogador
    $("#profile-chip").addEventListener("click", () => {
      renderPlayerArea();
      openModal("profiles");
    });
    $("#btn-close-profiles").addEventListener("click", () => {
      closeModal("profiles");
      renderProfileChip();
    });
    $("#btn-save-profile").addEventListener("click", saveProfile);
    $("#btn-change-pass").addEventListener("click", changeProfilePassword);
    $("#btn-logout-2").addEventListener("click", () => {
      closeModal("profiles");
      Auth.signOut();
    });

    // Ranking (abas)
    $("#btn-close-ranking").addEventListener("click", () => closeModal("ranking"));
    document.querySelectorAll("#ranking-modal .tab").forEach((t) =>
      t.addEventListener("click", () => {
        rankingTab = t.dataset.tab;
        renderRanking();
      })
    );

    // Auth (login)
    document.querySelectorAll("[data-auth]").forEach((t) =>
      t.addEventListener("click", () => {
        setAuthTab(t.dataset.auth);
        authMsg("");
      })
    );
    $("#btn-auth-primary").addEventListener("click", doAuthPrimary);
    $("#btn-magic").addEventListener("click", doMagicLink);
    $("#btn-logout").addEventListener("click", () => Auth.signOut());
    $("#btn-biometric").addEventListener("click", biometricLogin);
    $("#btn-bio-toggle").addEventListener("click", toggleBiometric);

    $("#sound-toggle").addEventListener("change", (e) => {
      settings.sound = e.target.checked;
      Sound.setEnabled(e.target.checked);
      saveSettings();
      syncSoundIcon();
    });

    if (settings.opponents) $("#opponent-count").value = String(settings.opponents);
    if (typeof settings.sound === "boolean") {
      $("#sound-toggle").checked = settings.sound;
      Sound.setEnabled(settings.sound);
    }
    syncSoundIcon();

    // Topbar do jogo
    $("#btn-menu").addEventListener("click", () => openModal("pause"));
    $("#btn-sound").addEventListener("click", toggleSound);

    // Pilha de compra
    $("#draw-pile").addEventListener("click", () => {
      if (gameMode === "online") Online.draw();
      else Game.humanDraw();
    });

    // Botão UNO
    $("#btn-uno").addEventListener("click", () => {
      if (gameMode === "online") Online.callUno();
      else Game.sayUno();
    });

    // Seletor de cor
    document.querySelectorAll(".color-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        UI.hideColorPicker();
        if (gameMode === "online") {
          if (pendingWildId != null) {
            Online.play(pendingWildId, btn.dataset.color);
            pendingWildId = null;
          }
        } else {
          Game.resolveColor(btn.dataset.color);
        }
      });
    });

    // Online
    $("#btn-online").addEventListener("click", () => {
      ensureProfile();
      if (!Net.available()) {
        $("#online-msg").textContent =
          "Online indisponível. Configure o Supabase e habilite o login anônimo.";
      } else {
        $("#online-msg").textContent = "";
      }
      openModal("online");
    });
    $("#btn-online-close").addEventListener("click", () => closeModal("online"));
    $("#btn-create-room").addEventListener("click", () => {
      $("#online-msg").textContent = "Criando sala…";
      setOnlineBusy(true);
      Online.createRoom();
    });
    $("#btn-join-room").addEventListener("click", () => {
      $("#online-msg").textContent = "Entrando…";
      setOnlineBusy(true);
      Online.joinByCode($("#join-code").value);
    });
    $("#btn-public-match").addEventListener("click", () => {
      const p = Profiles.current();
      const t = tierOf(p ? p.stats.points : 0);
      $("#online-msg").textContent = `Procurando partida — ${t.label}…`;
      setOnlineBusy(true);
      Online.publicMatch(t.id);
    });
    $("#btn-lobby-start").addEventListener("click", () => {
      if (!Online.start()) UI.banner("Precisa de pelo menos 2 jogadores", 1400);
    });
    $("#btn-lobby-leave").addEventListener("click", () => {
      leaveOnline();
      closeModal("lobby");
    });

    // Fechar tocando fora do card (modais não-críticos)
    ["rules", "ranking", "profiles", "online", "pause", "admin"].forEach((name) => {
      modals[name].addEventListener("click", (e) => {
        if (e.target === modals[name]) closeModal(name);
      });
    });

    // Seletor de cor: cancelar (botão ou toque fora)
    $("#btn-color-cancel").addEventListener("click", cancelColorPicker);
    $("#color-picker").addEventListener("click", (e) => {
      if (e.target.id === "color-picker") cancelColorPicker();
    });

    // Instalar PWA
    $("#btn-install").addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch (e) {}
      deferredPrompt = null;
      $("#btn-install").hidden = true;
    });

    // Modal de pausa
    $("#btn-resume").addEventListener("click", () => closeModal("pause"));
    $("#btn-rules-2").addEventListener("click", () => {
      closeModal("pause");
      openModal("rules");
    });
    $("#btn-quit").addEventListener("click", () => {
      closeModal("pause");
      if (gameMode === "online") leaveOnline();
      showScreen("home");
    });

    // Fim de jogo
    $("#btn-rematch").addEventListener("click", () => {
      closeModal("gameover");
      if (gameMode === "online") {
        if (Online.isHost()) {
          onlineOverHandled = false;
          Online.start();
        } else {
          UI.banner("Aguardando o host…", 1400);
        }
        return;
      }
      const profile = Profiles.current();
      Game.newGame({
        playerName: profile ? profile.name : "Você",
        opponentCount: settings.opponents || 3,
      });
    });
    $("#btn-home").addEventListener("click", () => {
      closeModal("gameover");
      if (gameMode === "online") leaveOnline();
      showScreen("home");
    });
  }

  function toggleSound() {
    const enabled = !Sound.isEnabled();
    Sound.setEnabled(enabled);
    settings.sound = enabled;
    $("#sound-toggle").checked = enabled;
    saveSettings();
    syncSoundIcon();
  }
  function syncSoundIcon() {
    $("#btn-sound").textContent = Sound.isEnabled() ? "🔊" : "🔇";
  }

  // ---------- Service worker (PWA) ----------
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js")
        .then((reg) => {
          const check = () => reg.update().catch(() => {});
          check();
          // verifica atualização ao voltar ao app e periodicamente
          document.addEventListener("visibilitychange", () => {
            if (!document.hidden) check();
          });
          window.addEventListener("focus", check);
          setInterval(check, 60 * 1000);
          // ativa imediatamente um novo SW que ficou aguardando
          reg.addEventListener("updatefound", () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener("statechange", () => {
              if (nw.state === "installed" && reg.waiting) {
                reg.waiting.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => {});
    });
  }

  function init() {
    ensureProfile();
    bindUI();
    renderProfileChip();
    UI.bindGame();
    registerSW();

    // Botão "voltar" do Android / navegador
    window.addEventListener("popstate", onPopState);
    pushSentinel();

    // Instalação do PWA
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredPrompt = e;
      const b = $("#btn-install");
      if (b) b.hidden = false;
    });
    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      const b = $("#btn-install");
      if (b) b.hidden = true;
    });

    // Callbacks do jogo online
    Online.on({
      lobby: (l) => renderLobby(l),
      start: (st) => enterOnline(st),
      state: (st) => {
        if (!onlineInGame) enterOnline(st);
        else renderOnline(st);
      },
      closed: () => {
        gameMode = "local";
        onlineInGame = false;
        closeModal("lobby");
        closeModal("gameover");
        showScreen("home");
        UI.banner("Sala encerrada", 1600);
      },
      error: (msg) => {
        setOnlineBusy(false);
        $("#online-msg").textContent = msg || "Erro de conexão.";
      },
    });

    // Biometria: detecta suporte do aparelho
    Biometric.supported().then((s) => {
      bioSupported = s;
      updateBioUI();
    });

    // Autenticação: exige cadastro para jogar (quando o backend existe)
    if (Net.available()) showScreen("login"); // evita "piscar" a home
    Auth.onChange(() => applyAuthGate());
    Auth.init().then(() => applyAuthGate());
  }

  return { init, showGameOver };
})();

document.addEventListener("DOMContentLoaded", App.init);
