/* ui.js - renderização e ligação com o DOM */

const UI = (() => {
  const $ = (sel) => document.querySelector(sel);

  const el = {
    opponents: $("#opponents"),
    hand: $("#player-hand"),
    discard: $("#discard-pile"),
    drawPile: $("#draw-pile"),
    colorBadge: $("#color-badge"),
    direction: $("#direction-indicator"),
    playerLabel: $("#player-label"),
    btnUno: $("#btn-uno"),
    turnBanner: $("#turn-banner"),
    colorPicker: $("#color-picker"),
  };

  let currentPlayable = new Set();
  let isHumanTurn = false;

  // ---------- Construção de cartas ----------
  function cardClass(card) {
    if (isWild(card)) return "card card--wild";
    return `card card--${card.color}`;
  }

  function buildCardFace(card) {
    const label = cardLabel(card);
    const wrap = document.createElement("div");
    wrap.className = cardClass(card);
    wrap.dataset.id = card.id;

    const tl = document.createElement("span");
    tl.className = "corner corner--tl";
    tl.textContent = label;

    const br = document.createElement("span");
    br.className = "corner corner--br";
    br.textContent = label;

    const center = document.createElement("span");
    center.className = "center center--oval";
    center.textContent = label;

    wrap.append(tl, center, br);
    return wrap;
  }

  // ---------- Oponentes ----------
  function renderOpponents(state) {
    el.opponents.innerHTML = "";
    const bots = state.players.filter((p) => !p.isHuman);
    for (const bot of bots) {
      const div = document.createElement("div");
      div.className = "opponent";
      if (state.players[state.currentIndex].id === bot.id && state.phase !== "over") {
        div.classList.add("active");
      }

      const avatar = document.createElement("div");
      avatar.className = "opponent__avatar";
      avatar.textContent = bot.name.charAt(0).toUpperCase();

      const name = document.createElement("div");
      name.className = "opponent__name";
      name.textContent = bot.name;

      const cards = document.createElement("div");
      cards.className = "opponent__cards";
      const show = Math.min(bot.hand.length, 5);
      for (let i = 0; i < show; i++) {
        const mc = document.createElement("div");
        mc.className = "mini-card";
        cards.appendChild(mc);
      }

      const count = document.createElement("div");
      count.className = "opponent__count";
      if (bot.hand.length === 1) {
        count.innerHTML = '<span class="uno-flag">UNO</span>';
      } else {
        count.textContent = `${bot.hand.length} cartas`;
      }

      div.append(avatar, name, cards, count);
      el.opponents.appendChild(div);
    }
  }

  // ---------- Descarte / cor / direção ----------
  function renderDiscard(state) {
    const top = state.discard[state.discard.length - 1];
    if (!top) return;
    el.discard.innerHTML = "";
    el.discard.appendChild(buildCardFace(top));

    el.colorBadge.className = "color-badge";
    if (state.activeColor) el.colorBadge.classList.add(state.activeColor);

    el.direction.classList.toggle("reversed", state.direction === -1);
  }

  // ---------- Mão do jogador ----------
  function renderHand(state) {
    const human = state.players.find((p) => p.isHuman);
    el.hand.innerHTML = "";

    // Ordena por cor depois valor para facilitar a leitura
    const sorted = [...human.hand].sort((a, b) => {
      if (a.color !== b.color) return COLORS.indexOf(a.color) - COLORS.indexOf(b.color);
      return a.value.localeCompare(b.value);
    });

    for (const card of sorted) {
      const face = buildCardFace(card);
      if (isHumanTurn && currentPlayable.has(card.id)) {
        face.classList.add("playable");
      } else if (isHumanTurn) {
        face.classList.add("disabled");
      }
      face.addEventListener("click", () => onCardClick(card));
      el.hand.appendChild(face);
    }

    el.playerLabel.textContent = `${human.name} — ${human.hand.length} cartas`;
  }

  function onCardClick(card) {
    if (!isHumanTurn) return;
    if (!currentPlayable.has(card.id)) {
      // feedback leve: balança a carta
      const node = el.hand.querySelector(`[data-id="${card.id}"]`);
      if (node) {
        node.animate(
          [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
          { duration: 220 }
        );
      }
      return;
    }
    Game.humanPlay(card.id);
  }

  // ---------- Estado geral ----------
  function update(state) {
    renderOpponents(state);
    renderDiscard(state);
    renderHand(state);
    updateDrawPile(state);
  }

  function updateDrawPile(state) {
    const human = state.players.find((p) => p.isHuman);
    const canDraw =
      isHumanTurn && state.phase === "playing" && Game.getPlayable(human).length === 0;
    el.drawPile.classList.toggle("disabled", !canDraw);
    el.drawPile.style.opacity = canDraw ? "1" : "0.6";
  }

  // ---------- Banner ----------
  let bannerTimer = null;
  function banner(text, ms = 1100) {
    el.turnBanner.textContent = text;
    el.turnBanner.classList.add("show");
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.turnBanner.classList.remove("show"), ms);
  }

  // ---------- Seletor de cor ----------
  function showColorPicker() {
    el.colorPicker.hidden = false;
  }
  function hideColorPicker() {
    el.colorPicker.hidden = true;
  }

  // ---------- UNO ----------
  function setUnoButton(enabled) {
    el.btnUno.disabled = !enabled;
  }

  // ---------- Ligações de eventos do jogo ----------
  function bindGame() {
    Game.on("update", (state) => update(state));

    Game.on("turn", ({ player, playable }) => {
      isHumanTurn = !!player.isHuman;
      currentPlayable = new Set((playable || []).map((c) => c.id));
      const state = Game.getState();
      renderHand(state);
      updateDrawPile(state);

      if (isHumanTurn) {
        banner("Sua vez!", 900);
      }
    });

    Game.on("play", ({ player, card }) => {
      if (isActionCard(card) && Sound.isEnabled()) Sound.special();
      else if (Sound.isEnabled()) Sound.play();
      if (navigator.vibrate) navigator.vibrate(15);
    });

    Game.on("draw", ({ player, count }) => {
      if (Sound.isEnabled()) Sound.draw();
    });

    Game.on("special", ({ type, player }) => {
      const labels = {
        skip: player ? `${player.name} pulou!` : "Pulou!",
        reverse: "Sentido invertido!",
        draw2: player ? `${player.name} +2` : "+2",
        wild4: player ? `${player.name} +4` : "+4",
        wild: "Curinga!",
      };
      if (labels[type]) banner(labels[type], 1000);
    });

    Game.on("needColor", () => {
      showColorPicker();
    });

    Game.on("humanReachedUno", () => {
      setUnoButton(true);
      banner("Aperte UNO!", 1200);
    });

    Game.on("uno", (player) => {
      if (Sound.isEnabled()) Sound.uno();
      if (player.isHuman) {
        setUnoButton(false);
        banner("UNO! 🎉", 900);
      } else {
        banner(`${player.name}: UNO!`, 900);
      }
    });

    Game.on("unoPenalty", (player) => {
      setUnoButton(false);
      banner(
        player.isHuman ? "Esqueceu o UNO! +2" : `${player.name} esqueceu o UNO! +2`,
        1400
      );
    });

    Game.on("reshuffle", () => banner("Reembaralhando...", 900));

    Game.on("newgame", () => {
      setUnoButton(false);
      hideColorPicker();
    });

    Game.on("gameover", (winner) => {
      if (winner.isHuman) {
        if (Sound.isEnabled()) Sound.win();
      } else {
        if (Sound.isEnabled()) Sound.lose();
      }
      App.showGameOver(winner);
    });
  }

  return {
    bindGame,
    showColorPicker,
    hideColorPicker,
    setUnoButton,
    banner,
  };
})();
