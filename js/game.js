/* game.js - motor do jogo (estado e regras) */

const Game = (() => {
  const BOT_NAMES = ["Bia", "Caio", "Duda", "Léo", "Ana"];
  const BOT_THINK_MS = 850;
  const UNO_PENALTY_MS = 3500;

  let state = null;
  const listeners = {};
  let unoTimer = null;
  let botTimer = null;

  function on(event, cb) {
    (listeners[event] = listeners[event] || []).push(cb);
  }
  function emit(event, payload) {
    (listeners[event] || []).forEach((cb) => cb(payload));
  }

  function getState() {
    return state;
  }

  function currentPlayer() {
    return state.players[state.currentIndex];
  }

  function topCard() {
    return state.discard[state.discard.length - 1];
  }

  // ---------- Setup ----------
  function newGame({ playerName, opponentCount }) {
    clearTimeout(unoTimer);
    clearTimeout(botTimer);

    const players = [
      { id: 0, name: playerName || "Você", isHuman: true, hand: [], saidUno: false },
    ];
    const names = shuffle([...BOT_NAMES]);
    for (let i = 0; i < opponentCount; i++) {
      players.push({
        id: i + 1,
        name: names[i],
        isHuman: false,
        hand: [],
        saidUno: false,
      });
    }

    const deck = shuffle(buildDeck());

    state = {
      players,
      deck,
      discard: [],
      currentIndex: 0,
      direction: 1,
      activeColor: null,
      phase: "dealing",
      winner: null,
      pendingCardId: null,
    };

    // Distribui 7 cartas para cada jogador
    for (let r = 0; r < 7; r++) {
      for (const p of players) p.hand.push(state.deck.pop());
    }

    // Vira a primeira carta (garante que seja numérica para um início simples)
    let first = state.deck.pop();
    while (isActionCard(first)) {
      state.deck.unshift(first);
      first = state.deck.pop();
    }
    state.discard.push(first);
    state.activeColor = first.color;

    state.phase = "playing";
    emit("newgame", state);
    emit("update", state);
    runTurn();
  }

  // ---------- Compra de cartas ----------
  function reshuffleIfNeeded() {
    if (state.deck.length === 0) {
      const top = state.discard.pop();
      state.deck = shuffle(state.discard);
      state.discard = [top];
      emit("reshuffle", state);
    }
  }

  function drawCards(player, n) {
    const drawn = [];
    for (let i = 0; i < n; i++) {
      reshuffleIfNeeded();
      if (state.deck.length === 0) break;
      const card = state.deck.pop();
      player.hand.push(card);
      drawn.push(card);
    }
    // Comprar cartas invalida o "UNO" anterior
    if (player.hand.length > 1) player.saidUno = false;
    return drawn;
  }

  function getPlayable(player) {
    const top = topCard();
    return player.hand.filter((c) => canPlay(c, top, state.activeColor));
  }

  // ---------- Turnos ----------
  function nextIndex(from, steps) {
    const n = state.players.length;
    let idx = from;
    for (let i = 0; i < steps; i++) {
      idx = (idx + state.direction + n) % n;
    }
    return idx;
  }

  function advance(steps) {
    state.currentIndex = nextIndex(state.currentIndex, steps);
  }

  function runTurn() {
    if (state.phase === "over") return;
    const player = currentPlayer();
    emit("turn", { player, playable: player.isHuman ? getPlayable(player) : [] });
    emit("update", state);

    if (player.isHuman) {
      // Aguarda a ação do jogador (toque em carta ou na pilha de compra)
      return;
    }

    // Turno do bot
    botTimer = setTimeout(() => botTurn(player), BOT_THINK_MS);
  }

  function botTurn(player) {
    if (state.phase === "over" || currentPlayer() !== player) return;

    const next = state.players[nextIndex(state.currentIndex, 1)];
    const decision = AI.decide(
      player.hand,
      topCard(),
      state.activeColor,
      next ? next.hand.length : 7
    );

    if (!decision) {
      // Sem carta jogável -> compra
      const [card] = drawCards(player, 1);
      emit("draw", { player, count: 1 });
      emit("update", state);
      if (card && canPlay(card, topCard(), state.activeColor)) {
        botTimer = setTimeout(() => {
          const color = isWild(card) ? AI.bestColor(player.hand) : card.color;
          playCardInternal(player, card, color);
        }, BOT_THINK_MS);
      } else {
        endTurnAndAdvance(1);
      }
      return;
    }

    playCardInternal(player, decision.card, decision.color);
  }

  // ---------- Jogar carta ----------
  function playCardInternal(player, card, color) {
    // Remove da mão
    const idx = player.hand.findIndex((c) => c.id === card.id);
    if (idx === -1) return;
    player.hand.splice(idx, 1);

    state.discard.push(card);
    state.activeColor = isWild(card) ? color : card.color;

    emit("play", { player, card, color: state.activeColor });

    // UNO
    if (player.hand.length === 1) {
      handleReachUno(player);
    } else if (player.hand.length === 0) {
      return finishGame(player);
    }

    applyEffectAndAdvance(card);
  }

  function applyEffectAndAdvance(card) {
    const twoPlayers = state.players.length === 2;

    switch (card.value) {
      case "reverse":
        state.direction *= -1;
        emit("special", { type: "reverse" });
        advance(twoPlayers ? 2 : 1);
        break;
      case "skip": {
        const skipped = state.players[nextIndex(state.currentIndex, 1)];
        emit("special", { type: "skip", player: skipped });
        advance(2);
        break;
      }
      case "draw2": {
        const victim = state.players[nextIndex(state.currentIndex, 1)];
        drawCards(victim, 2);
        emit("special", { type: "draw2", player: victim });
        emit("draw", { player: victim, count: 2 });
        advance(2);
        break;
      }
      case "wild4": {
        const victim = state.players[nextIndex(state.currentIndex, 1)];
        drawCards(victim, 4);
        emit("special", { type: "wild4", player: victim });
        emit("draw", { player: victim, count: 4 });
        advance(2);
        break;
      }
      case "wild":
        emit("special", { type: "wild" });
        advance(1);
        break;
      default:
        advance(1);
    }

    emit("update", state);
    runTurn();
  }

  function endTurnAndAdvance(steps) {
    advance(steps);
    emit("update", state);
    runTurn();
  }

  // ---------- UNO ----------
  function handleReachUno(player) {
    player.saidUno = false;
    if (player.isHuman) {
      emit("humanReachedUno", player);
      clearTimeout(unoTimer);
      unoTimer = setTimeout(() => {
        if (state.phase !== "over" && player.hand.length === 1 && !player.saidUno) {
          drawCards(player, 2);
          emit("unoPenalty", player);
          emit("update", state);
        }
      }, UNO_PENALTY_MS);
    } else {
      // Bots às vezes "esquecem" e levam penalidade
      const forgets = Math.random() < 0.15;
      if (forgets) {
        drawCards(player, 2);
        emit("unoPenalty", player);
      } else {
        player.saidUno = true;
        emit("uno", player);
      }
    }
  }

  function sayUno() {
    const human = state.players.find((p) => p.isHuman);
    if (human && human.hand.length === 1) {
      human.saidUno = true;
      clearTimeout(unoTimer);
      emit("uno", human);
    }
  }

  // ---------- Fim ----------
  function finishGame(winner) {
    state.phase = "over";
    state.winner = winner;
    clearTimeout(unoTimer);
    clearTimeout(botTimer);
    emit("update", state);
    emit("gameover", winner);
  }

  // ---------- Ações do jogador humano ----------
  function humanPlay(cardId, color) {
    if (state.phase !== "playing") return;
    const player = currentPlayer();
    if (!player.isHuman) return;

    const card = player.hand.find((c) => c.id === cardId);
    if (!card) return;
    if (!canPlay(card, topCard(), state.activeColor)) return;

    if (isWild(card) && !color) {
      state.pendingCardId = cardId;
      emit("needColor", card);
      return;
    }

    state.pendingCardId = null;
    playCardInternal(player, card, color);
  }

  function resolveColor(color) {
    if (state.pendingCardId == null) return;
    humanPlay(state.pendingCardId, color);
  }

  function humanDraw() {
    if (state.phase !== "playing") return;
    const player = currentPlayer();
    if (!player.isHuman) return;
    if (getPlayable(player).length > 0) return; // deve jogar se puder

    const [card] = drawCards(player, 1);
    emit("draw", { player, count: 1 });
    emit("update", state);

    if (card && canPlay(card, topCard(), state.activeColor)) {
      // Pode jogar a carta comprada
      emit("turn", { player, playable: getPlayable(player), drawnCard: card });
    } else {
      endTurnAndAdvance(1);
    }
  }

  return {
    on,
    getState,
    newGame,
    humanPlay,
    resolveColor,
    humanDraw,
    sayUno,
    getPlayable,
    topCard,
    currentPlayer,
  };
})();
