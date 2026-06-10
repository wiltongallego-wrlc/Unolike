/* poker-game.js - driver single player de Texas Hold'em.
   Conecta PokerEngine + PokerAI à UI via eventos. */

const PokerGame = (() => {
  const BOT_NAMES = ["Bia", "Caio", "Duda", "Léo", "Ana", "Gus"];
  const THINK_MS = 950;
  const SHOWDOWN_MS = 4200;

  let state = null;
  const listeners = {};
  let botTimer = null;
  let nextTimer = null;
  let cfg = {};

  function on(e, cb) {
    (listeners[e] = listeners[e] || []).push(cb);
  }
  function emit(e, payload) {
    (listeners[e] || []).forEach((cb) => cb(payload));
  }

  function newGame({ playerName, avatar, opponents = 3, startingChips = 1000, sb = 10, bb = 20 }) {
    clearTimeout(botTimer);
    clearTimeout(nextTimer);
    cfg = { startingChips, sb, bb };

    const players = [{ id: "me", name: playerName || "Você", avatar: avatar || "🙂", isHuman: true }];
    const names = shuffle([...BOT_NAMES]);
    for (let i = 0; i < opponents; i++) {
      players.push({ id: "bot" + i, name: names[i], avatar: botAvatar(i), isHuman: false });
    }

    state = PokerEngine.createTable({ players, startingChips, smallBlind: sb, bigBlind: bb });
    emit("newgame", state);
    nextHand();
  }

  function botAvatar(i) {
    const a = ["🦊", "🐼", "🐵", "🦁", "🐯", "🐸"];
    return a[i % a.length];
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function nextHand() {
    clearTimeout(nextTimer);
    state = PokerEngine.startHand(state);
    if (state.status === "table_over") {
      emit("update", state);
      emit("tableover", state);
      return;
    }
    emit("newhand", state);
    proceed();
  }

  function proceed() {
    emit("update", state);
    if (state.status === "handover") {
      emit("handover", state);
      nextTimer = setTimeout(nextHand, SHOWDOWN_MS);
      return;
    }
    if (state.status !== "playing") return;
    const p = state.players[state.toAct];
    emit("turn", { player: p, legal: PokerEngine.legalActions(state) });
    if (!p.isHuman) {
      botTimer = setTimeout(botAct, THINK_MS);
    }
  }

  function botAct() {
    if (!state || state.status !== "playing") return;
    const p = state.players[state.toAct];
    if (p.isHuman) return;
    const action = PokerAI.decide(state);
    action.playerId = p.id;
    applyAction(action);
  }

  function applyAction(action) {
    const ns = PokerEngine.apply(state, action);
    if (ns !== state) {
      state = ns;
      emit("action", action);
      proceed();
    }
  }

  function humanAction(type, amount) {
    if (!state || state.status !== "playing") return;
    const p = state.players[state.toAct];
    if (!p.isHuman) return;
    applyAction({ type, amount, playerId: p.id });
  }

  function skipToNext() {
    if (state && state.status === "handover") nextHand();
  }

  function stop() {
    clearTimeout(botTimer);
    clearTimeout(nextTimer);
  }

  return {
    on,
    newGame,
    humanAction,
    skipToNext,
    stop,
    getState: () => state,
    legal: () => (state ? PokerEngine.legalActions(state) : null),
  };
})();
