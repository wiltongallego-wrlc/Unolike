/* online.js - camada de rede do jogo online (Supabase Realtime).
   Salas por código usam apenas canais Realtime (broadcast + presence),
   sem depender de tabelas. A partida pública usa a tabela `rooms` só
   para descoberta. O "host" é autoritativo: aplica as ações no
   OnlineEngine e transmite o estado para os demais. */

const Online = (() => {
  let client = null;
  let channel = null;
  let me = null;
  let code = null;
  let isHost = false;
  let isPublic = false;
  let roomRow = null;
  let started = false;

  let presenceList = [];
  let state = null;

  let tier = null; // faixa de ranking (matchmaking público)
  let autoTimer = null; // contagem regressiva (host)
  let countdown = null; // valor da contagem (host)
  let hostCountdown = null; // contagem recebida (não-host)

  const TURN_MS = 30000; // tempo por jogada
  const GRACE = 1500;
  let turnTimer = null;

  const cb = {}; // { lobby, start, state, closed, error }

  function on(handlers) {
    Object.assign(cb, handlers);
  }
  function emit(name, arg) {
    if (typeof cb[name] === "function") cb[name](arg);
  }

  function genCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  async function ensure() {
    if (!Net.available()) {
      emit("error", "Online indisponível: configure o Supabase.");
      return false;
    }
    if (!(await Net.init())) {
      emit("error", "Não foi possível conectar ao servidor.");
      return false;
    }
    client = Net.getClient();
    const u = (typeof Auth !== "undefined" && Auth.getUser()) || Net.getUser();
    if (!u) {
      emit("error", "Faça login para jogar online.");
      return false;
    }
    const p = (typeof Profiles !== "undefined" && Profiles.current()) || null;
    me = {
      id: u.id,
      name: p ? p.name : (u.email ? u.email.split("@")[0] : "Jogador"),
      avatar: p ? p.avatar : "🙂",
    };
    return true;
  }

  function flattenPresence(stateObj) {
    const out = [];
    const seen = new Set();
    Object.values(stateObj || {}).forEach((metas) => {
      (metas || []).forEach((m) => {
        if (m && m.id && !seen.has(m.id)) {
          seen.add(m.id);
          out.push(m);
        }
      });
    });
    out.sort((a, b) => (a.at || 0) - (b.at || 0));
    return out;
  }

  function broadcast(event, payload) {
    if (!channel) return;
    channel.send({ type: "broadcast", event, payload });
  }

  function openChannel(roomCode, asHost) {
    code = roomCode;
    isHost = asHost;
    started = false;

    channel = client.channel("unolike:room:" + roomCode, {
      config: { presence: { key: me.id }, broadcast: { self: false } },
    });

    channel.on("presence", { event: "sync" }, () => {
      presenceList = flattenPresence(channel.presenceState());
      emit("lobby", getLobby());
      // Se o host saiu durante o jogo, encerra para os demais
      if (started && !isHost && !presenceList.some((p) => p.host)) {
        emit("closed", "host");
        cleanup();
      }
      maybeAutoStart();
    });

    channel.on("broadcast", { event: "state" }, ({ payload }) => {
      if (!isHost) {
        state = payload.state;
        started = true;
        emit("state", state);
      }
    });

    channel.on("broadcast", { event: "start" }, ({ payload }) => {
      if (!isHost) {
        state = payload.state;
        started = true;
        emit("start", state);
      }
    });

    channel.on("broadcast", { event: "action" }, ({ payload }) => {
      if (isHost) hostApply(payload.action);
    });

    channel.on("broadcast", { event: "request_state" }, () => {
      if (isHost && state) broadcast("state", { state });
    });

    channel.on("broadcast", { event: "closed" }, () => {
      if (!isHost) {
        emit("closed", "host");
        cleanup();
      }
    });

    channel.on("broadcast", { event: "lobbyinfo" }, ({ payload }) => {
      if (!isHost) {
        hostCountdown = payload.countdown;
        emit("lobby", getLobby());
      }
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          id: me.id,
          name: me.name,
          avatar: me.avatar,
          host: isHost,
          at: Date.now(),
        });
        if (!isHost) broadcast("request_state", {});
        emit("lobby", getLobby());
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        emit("error", "Falha na conexão em tempo real.");
      }
    });
  }

  function getLobby() {
    return {
      code,
      isHost,
      isPublic,
      tier,
      countdown: isHost ? countdown : hostCountdown,
      me,
      players: presenceList.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, host: !!p.host })),
    };
  }

  // ---------- Início automático (matchmaking público) ----------
  function clearAuto() {
    if (autoTimer) clearInterval(autoTimer);
    autoTimer = null;
    countdown = null;
  }
  function broadcastLobby() {
    broadcast("lobbyinfo", { countdown });
  }
  function maybeAutoStart() {
    if (!isPublic || !isHost || started) return;
    const n = presenceList.length;
    if (n >= 4) {
      clearAuto();
      start();
    } else if (n >= 2) {
      if (autoTimer === null) {
        countdown = 12;
        broadcastLobby();
        emit("lobby", getLobby());
        autoTimer = setInterval(() => {
          countdown -= 1;
          if (countdown <= 0) {
            clearAuto();
            start();
          } else {
            broadcastLobby();
            emit("lobby", getLobby());
          }
        }, 1000);
      }
    } else {
      // menos de 2 jogadores: cancela contagem
      if (autoTimer !== null) {
        clearAuto();
        broadcastLobby();
        emit("lobby", getLobby());
      }
    }
  }

  function orderedPlayers() {
    const list = presenceList.length
      ? presenceList
      : [{ id: me.id, name: me.name, avatar: me.avatar }];
    return list.slice(0, 4).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar }));
  }

  function clearTurnTimer() {
    if (turnTimer) clearTimeout(turnTimer);
    turnTimer = null;
  }
  function armTurnTimer() {
    clearTurnTimer();
    if (!isHost || !state || state.status !== "playing") return;
    const curId = OnlineEngine.cur(state).id;
    const ver = state.version;
    turnTimer = setTimeout(() => {
      if (!isHost || !state || state.status !== "playing") return;
      if (state.version !== ver) return;
      if (OnlineEngine.cur(state).id !== curId) return;
      hostApply({ type: "timeout", playerId: curId });
    }, TURN_MS + GRACE);
  }

  // Host registra abandonos no ranking global (mesmo se o jogador caiu)
  function handleAbandons(s) {
    (s.log || []).forEach((l) => {
      if (l.t === "abandon" && l.id) Net.reportAbandon(l.id);
    });
  }

  function commitState() {
    state.turnDeadline = state.status === "playing" ? Date.now() + TURN_MS : null;
    handleAbandons(state);
    broadcast("state", { state });
    emit("state", state);
    persist();
    armTurnTimer();
  }

  function hostApply(action) {
    if (!isHost || !state) return;
    const ns = OnlineEngine.apply(state, action);
    if (ns !== state) {
      state = ns;
      commitState();
    }
  }

  function persist() {
    if (isPublic && isHost && roomRow) {
      Net.setRoomStatus(roomRow.id, state.status === "over" ? "finished" : "playing");
    }
  }

  // ---------- API pública ----------
  async function createRoom() {
    if (!(await ensure())) return;
    isPublic = false;
    roomRow = null;
    openChannel(genCode(), true);
  }

  async function joinByCode(inputCode) {
    if (!(await ensure())) return;
    const c = (inputCode || "").trim().toUpperCase();
    if (c.length < 4) {
      emit("error", "Código inválido.");
      return;
    }
    isPublic = false;
    roomRow = null;
    openChannel(c, false);
  }

  async function publicMatch(tierArg) {
    if (!(await ensure())) return;
    isPublic = true;
    tier = tierArg || "iniciante";
    const row = await Net.findOpenPublicRoom(tier);
    if (row) {
      roomRow = row;
      openChannel(row.code, false);
    } else {
      const c = genCode();
      roomRow = await Net.createPublicRoom(c, tier);
      openChannel(c, true);
    }
  }

  function start() {
    if (!isHost) return false;
    const players = orderedPlayers();
    if (players.length < 2) return false;
    clearAuto();
    state = OnlineEngine.createState(players);
    state.turnDeadline = Date.now() + TURN_MS;
    started = true;
    broadcast("start", { state });
    emit("start", state);
    commitState();
    return true;
  }

  function dispatch(action) {
    action.playerId = me.id;
    if (isHost) hostApply(action);
    else broadcast("action", { action });
  }

  function play(cardId, color) {
    const a = { type: "play", cardId };
    if (color) a.color = color;
    // marca UNO automaticamente se vai ficar com 1 carta
    const mp = state && state.players.find((p) => p.id === me.id);
    if (mp && mp.hand.length === 2) a.uno = true;
    dispatch(a);
  }
  function draw() {
    dispatch({ type: "draw" });
  }
  function callUno() {
    dispatch({ type: "uno" });
  }

  function cleanup() {
    if (channel) {
      try {
        channel.untrack();
      } catch (e) {}
      try {
        client.removeChannel(channel);
      } catch (e) {}
    }
    clearAuto();
    clearTurnTimer();
    channel = null;
    state = null;
    presenceList = [];
    started = false;
    tier = null;
    hostCountdown = null;
  }

  function leave() {
    if (isHost) broadcast("closed", {});
    if (isPublic && isHost && roomRow) Net.deleteRoom(roomRow.id);
    cleanup();
  }

  return {
    on,
    createRoom,
    joinByCode,
    publicMatch,
    start,
    play,
    draw,
    callUno,
    leave,
    getState: () => state,
    getMe: () => me,
    isHost: () => isHost,
    getCode: () => code,
  };
})();
