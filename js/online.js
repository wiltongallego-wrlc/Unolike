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
    const u = Net.getUser();
    const p = (typeof Profiles !== "undefined" && Profiles.current()) || null;
    me = {
      id: u ? u.id : "anon-" + Math.random().toString(36).slice(2),
      name: p ? p.name : "Jogador",
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
      me,
      players: presenceList.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, host: !!p.host })),
    };
  }

  function orderedPlayers() {
    const list = presenceList.length
      ? presenceList
      : [{ id: me.id, name: me.name, avatar: me.avatar }];
    return list.slice(0, 4).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar }));
  }

  function hostApply(action) {
    if (!isHost || !state) return;
    const ns = OnlineEngine.apply(state, action);
    if (ns !== state) {
      state = ns;
      broadcast("state", { state });
      emit("state", state);
      persist();
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

  async function publicMatch() {
    if (!(await ensure())) return;
    isPublic = true;
    const row = await Net.findOpenPublicRoom();
    if (row) {
      roomRow = row;
      openChannel(row.code, false);
    } else {
      const c = genCode();
      roomRow = await Net.createPublicRoom(c);
      openChannel(c, !!roomRow || true);
    }
  }

  function start() {
    if (!isHost) return false;
    const players = orderedPlayers();
    if (players.length < 2) return false;
    state = OnlineEngine.createState(players);
    started = true;
    broadcast("start", { state });
    broadcast("state", { state });
    emit("start", state);
    persist();
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
    channel = null;
    state = null;
    presenceList = [];
    started = false;
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
