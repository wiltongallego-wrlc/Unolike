/* online-engine.js - motor autoritativo do jogo online (função pura).
   Reaproveita as regras de cards.js (buildDeck, shuffle, canPlay, etc.).
   Não depende do DOM nem da rede, para poder ser testado isoladamente. */

const OnlineEngine = (() => {
  function clone(s) {
    return JSON.parse(JSON.stringify(s));
  }

  function createState(players) {
    const deck = shuffle(buildDeck());
    const ps = players.map((p) => ({
      id: p.id,
      name: p.name || "Jogador",
      avatar: p.avatar || "🙂",
      hand: [],
      saidUno: false,
    }));

    for (let r = 0; r < 7; r++) {
      for (const p of ps) p.hand.push(deck.pop());
    }

    let first = deck.pop();
    while (isActionCard(first)) {
      deck.unshift(first);
      first = deck.pop();
    }

    return {
      version: 1,
      status: "playing",
      players: ps,
      deck,
      discard: [first],
      currentIndex: 0,
      direction: 1,
      activeColor: first.color,
      winnerId: null,
      log: [],
    };
  }

  const cur = (s) => s.players[s.currentIndex];
  const top = (s) => s.discard[s.discard.length - 1];

  function nextIndex(s, from, steps) {
    const n = s.players.length;
    let i = from;
    for (let k = 0; k < steps; k++) i = (i + s.direction + n) % n;
    return i;
  }
  function advance(s, steps) {
    s.currentIndex = nextIndex(s, s.currentIndex, steps);
  }

  function reshuffle(s) {
    if (s.deck.length === 0 && s.discard.length > 1) {
      const t = s.discard.pop();
      s.deck = shuffle(s.discard);
      s.discard = [t];
    }
  }
  function drawN(s, player, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      reshuffle(s);
      if (!s.deck.length) break;
      const c = s.deck.pop();
      player.hand.push(c);
      out.push(c);
    }
    if (player.hand.length > 1) player.saidUno = false;
    return out;
  }

  function effect(s, card) {
    const two = s.players.length === 2;
    switch (card.value) {
      case "reverse":
        s.direction *= -1;
        s.log.push({ t: "reverse" });
        advance(s, two ? 2 : 1);
        break;
      case "skip": {
        const v = s.players[nextIndex(s, s.currentIndex, 1)];
        s.log.push({ t: "skip", id: v.id, name: v.name });
        advance(s, 2);
        break;
      }
      case "draw2": {
        const v = s.players[nextIndex(s, s.currentIndex, 1)];
        drawN(s, v, 2);
        s.log.push({ t: "draw2", id: v.id, name: v.name });
        advance(s, 2);
        break;
      }
      case "wild4": {
        const v = s.players[nextIndex(s, s.currentIndex, 1)];
        drawN(s, v, 4);
        s.log.push({ t: "wild4", id: v.id, name: v.name });
        advance(s, 2);
        break;
      }
      case "wild":
        s.log.push({ t: "wild" });
        advance(s, 1);
        break;
      default:
        advance(s, 1);
    }
  }

  /**
   * Aplica uma ação e retorna o NOVO estado (ou o mesmo, se inválida).
   * Ações: {type:'play', playerId, cardId, color?, uno?}
   *        {type:'draw', playerId}
   *        {type:'uno',  playerId}
   */
  function apply(state, action) {
    if (state.status !== "playing") return state;
    const s = clone(state);
    s.log = [];

    const player = s.players.find((p) => p.id === action.playerId);
    if (!player) return state;

    if (action.type === "uno") {
      if (player.hand.length === 1 && !player.saidUno) {
        player.saidUno = true;
        s.log.push({ t: "uno", id: player.id, name: player.name });
        s.version++;
        return s;
      }
      return state;
    }

    // play/draw só na vez do jogador
    if (cur(s).id !== action.playerId) return state;

    if (action.type === "draw") {
      const playable = player.hand.filter((c) => canPlay(c, top(s), s.activeColor));
      if (playable.length > 0) return state; // precisa jogar
      const [c] = drawN(s, player, 1);
      s.log.push({ t: "draw", id: player.id, name: player.name, count: 1 });
      if (!(c && canPlay(c, top(s), s.activeColor))) advance(s, 1);
      s.version++;
      return s;
    }

    if (action.type === "play") {
      const idx = player.hand.findIndex((c) => c.id === action.cardId);
      if (idx === -1) return state;
      const card = player.hand[idx];
      if (!canPlay(card, top(s), s.activeColor)) return state;
      if (isWild(card) && !action.color) return state;

      player.hand.splice(idx, 1);
      s.discard.push(card);
      s.activeColor = isWild(card) ? action.color : card.color;
      if (action.uno && player.hand.length === 1) player.saidUno = true;
      s.log.push({ t: "play", id: player.id, name: player.name, card });

      if (player.hand.length === 0) {
        s.status = "over";
        s.winnerId = player.id;
        s.version++;
        return s;
      }
      effect(s, card);
      s.version++;
      return s;
    }

    return state;
  }

  // Cartas jogáveis de um jogador (para a UI)
  function playableFor(s, playerId) {
    const p = s.players.find((x) => x.id === playerId);
    if (!p) return [];
    return p.hand.filter((c) => canPlay(c, top(s), s.activeColor));
  }

  return { createState, apply, cur, top, playableFor, nextIndex };
})();

// Permite usar no Node (testes headless)
if (typeof module !== "undefined" && module.exports) {
  module.exports = { OnlineEngine };
}
