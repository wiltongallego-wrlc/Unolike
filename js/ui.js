/* ui.js - renderização, animações e ligação com o DOM */

const UI = (() => {
  const $ = (sel) => document.querySelector(sel);

  const el = {
    opponents: $("#opponents"),
    hand: $("#player-hand"),
    discard: $("#discard-pile"),
    drawPile: $("#draw-pile"),
    drawHint: $("#draw-hint"),
    colorBadge: $("#color-badge"),
    direction: $("#direction-indicator"),
    playerLabel: $("#player-label"),
    playerArea: $(".player-area"),
    btnUno: $("#btn-uno"),
    turnBanner: $("#turn-banner"),
    colorPicker: $("#color-picker"),
    table: $(".table"),
    tableGlow: $("#table-glow"),
  };

  let currentPlayable = new Set();
  let isHumanTurn = false;
  let dealPending = false;
  let lastDiscardId = null;
  let lastColor = null;
  let flyingToDiscard = false;
  let pendingDiscardReveal = null;

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

  function buildCardBack() {
    const back = document.createElement("div");
    back.className = "card card--back";
    const logo = document.createElement("span");
    logo.className = "card-back-logo";
    logo.textContent = "UNO";
    back.appendChild(logo);
    return back;
  }

  // ---------- Animação: voo de carta entre dois pontos ----------
  function rectOf(node) {
    return node.getBoundingClientRect();
  }

  function flyClone(node, srcRect, destRect, opts = {}) {
    const { duration = 420, delay = 0, rotate = 0, lift = 0 } = opts;
    const scaleEnd = destRect.width / srcRect.width || 1;

    node.classList.add("fly-card");
    node.style.left = srcRect.left + "px";
    node.style.top = srcRect.top + "px";
    node.style.width = srcRect.width + "px";
    node.style.height = srcRect.height + "px";
    node.style.margin = "0";
    document.body.appendChild(node);

    const srcCx = srcRect.left + srcRect.width / 2;
    const srcCy = srcRect.top + srcRect.height / 2;
    const dstCx = destRect.left + destRect.width / 2;
    const dstCy = destRect.top + destRect.height / 2;
    const dx = dstCx - srcCx;
    const dy = dstCy - srcCy;

    const frames = [{ transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 }];
    if (lift) {
      // Ponto intermediário: a carta "levanta" e cresce um pouco, formando um arco
      const midScale = 1 + (scaleEnd - 1) * 0.5 + 0.12;
      frames.push({
        transform: `translate(${dx * 0.45}px, ${dy * 0.45 - lift}px) scale(${midScale}) rotate(${rotate * 0.5}deg)`,
        opacity: 1,
        offset: 0.5,
      });
    }
    frames.push({
      transform: `translate(${dx}px, ${dy}px) scale(${scaleEnd}) rotate(${rotate}deg)`,
      opacity: 1,
    });

    const anim = node.animate(frames, {
      duration,
      delay,
      easing: "cubic-bezier(.2,.7,.3,1)",
      fill: "forwards",
    });
    anim.onfinish = () => node.remove();
    return anim;
  }

  function opponentNode(playerId) {
    return el.opponents.querySelector(`[data-pid="${playerId}"]`);
  }

  function flyCardToDiscard(player, card) {
    const dest = rectOf(el.discard);
    if (!dest.width) return;

    let src;
    let lift = 0;
    let duration = 430;

    if (player.isHuman) {
      const n = el.hand.querySelector(`[data-id="${card.id}"]`);
      if (n) {
        src = rectOf(n);
        n.style.visibility = "hidden"; // esconde o original assim que voa
      } else {
        src = rectOf(el.drawPile);
      }
      lift = 32; // arco mais pronunciado para a jogada do jogador
      duration = 540;
    } else {
      const opp = opponentNode(player.id);
      src = opp ? rectOf(opp) : rectOf(el.opponents);
    }

    flyingToDiscard = true;
    const clone = buildCardFace(card);
    const anim = flyClone(clone, src, dest, {
      duration,
      lift,
      rotate: Math.random() * 12 - 6,
    });
    anim.onfinish = () => {
      clone.remove();
      flyingToDiscard = false;
      // Revela a carta no descarte só quando ela "pousa" no meio
      if (pendingDiscardReveal) {
        const f = pendingDiscardReveal;
        pendingDiscardReveal = null;
        f.style.opacity = "1";
        f.classList.add("flip-in");
      }
    };
  }

  function flyDrawToHand(player, count) {
    const src = rectOf(el.drawPile);
    if (!src.width) return;
    let dest;
    if (player.isHuman) {
      dest = rectOf(el.hand);
    } else {
      const opp = opponentNode(player.id);
      dest = opp ? rectOf(opp) : rectOf(el.opponents);
    }
    const n = Math.min(count, 3);
    for (let i = 0; i < n; i++) {
      flyClone(buildCardBack(), src, dest, {
        duration: 400,
        delay: i * 90,
        rotate: Math.random() * 16 - 8,
      });
    }
  }

  // ---------- Oponentes ----------
  function renderOpponents(state) {
    el.opponents.innerHTML = "";
    const bots = state.players.filter((p) => !p.isHuman);
    const activeId = state.players[state.currentIndex].id;
    for (const bot of bots) {
      const div = document.createElement("div");
      div.className = "opponent";
      div.dataset.pid = bot.id;
      const isActive = activeId === bot.id && state.phase !== "over";
      if (isActive) div.classList.add("active");

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

      if (isActive) {
        const turn = document.createElement("div");
        turn.className = "opponent__turn";
        turn.textContent = "jogando…";
        div.appendChild(turn);
      }

      el.opponents.appendChild(div);
    }
  }

  // ---------- Descarte / cor / direção ----------
  function renderDiscard(state) {
    const top = state.discard[state.discard.length - 1];
    if (!top) return;

    const changed = top.id !== lastDiscardId;
    el.discard.innerHTML = "";
    const face = buildCardFace(top);
    if (flyingToDiscard) {
      // Mantém o destino invisível até a carta voadora "pousar" no meio
      face.style.opacity = "0";
      pendingDiscardReveal = face;
    } else if (changed) {
      // Sem voo (início / reembaralho): apenas o "plop"
      face.classList.add("flip-in");
    }
    el.discard.appendChild(face);
    lastDiscardId = top.id;

    // Badge da cor ativa
    el.colorBadge.className = "color-badge";
    if (state.activeColor) el.colorBadge.classList.add(state.activeColor);

    // Brilho da mesa na cor ativa
    el.tableGlow.className = "table-glow";
    if (state.activeColor) el.tableGlow.classList.add(state.activeColor);

    // Flash quando a cor muda
    if (lastColor && state.activeColor && lastColor !== state.activeColor) {
      el.colorBadge.classList.add("pulse");
      el.tableGlow.classList.add("flash");
      setTimeout(() => {
        el.colorBadge.classList.remove("pulse");
        el.tableGlow.classList.remove("flash");
      }, 650);
    }
    lastColor = state.activeColor;

    el.direction.classList.toggle("reversed", state.direction === -1);
  }

  // ---------- Mão do jogador ----------
  function renderHand(state) {
    const human = state.players.find((p) => p.isHuman);
    el.hand.innerHTML = "";

    const sorted = [...human.hand].sort((a, b) => {
      if (a.color !== b.color) return COLORS.indexOf(a.color) - COLORS.indexOf(b.color);
      return a.value.localeCompare(b.value);
    });

    sorted.forEach((card) => {
      const face = buildCardFace(card);
      if (isHumanTurn && currentPlayable.has(card.id)) {
        face.classList.add("playable");
      } else if (isHumanTurn) {
        face.classList.add("disabled");
      }
      face.addEventListener("click", () => onCardClick(card));
      el.hand.appendChild(face);
    });

    el.playerLabel.textContent = `${human.name} — ${human.hand.length} cartas`;
  }

  // Distribuição inicial: cartas voam da pilha de compra para as mãos
  function dealAnimation(state) {
    if (!rectOf(el.drawPile).width) return;
    for (let i = 0; i < 7; i++) {
      setTimeout(
        () =>
          flyClone(buildCardBack(), rectOf(el.drawPile), rectOf(el.hand), {
            duration: 360,
            rotate: Math.random() * 12 - 6,
          }),
        i * 65
      );
    }
    state.players
      .filter((p) => !p.isHuman)
      .forEach((bot) => {
        const opp = opponentNode(bot.id);
        if (!opp) return;
        for (let i = 0; i < 3; i++) {
          setTimeout(
            () => flyClone(buildCardBack(), rectOf(el.drawPile), rectOf(opp), { duration: 360 }),
            i * 65
          );
        }
      });
  }

  function onCardClick(card) {
    if (!isHumanTurn) return;
    if (!currentPlayable.has(card.id)) {
      const node = el.hand.querySelector(`[data-id="${card.id}"]`);
      if (node) {
        node.animate(
          [
            { transform: "translateX(0)" },
            { transform: "translateX(-6px)" },
            { transform: "translateX(6px)" },
            { transform: "translateX(0)" },
          ],
          { duration: 220 }
        );
      }
      if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
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
    el.playerArea.classList.toggle(
      "active",
      isHumanTurn && state.phase !== "over"
    );

    if (dealPending) {
      dealPending = false;
      requestAnimationFrame(() => dealAnimation(state));
    }
  }

  function updateDrawPile(state) {
    const human = state.players.find((p) => p.isHuman);
    const canDraw =
      isHumanTurn && state.phase === "playing" && Game.getPlayable(human).length === 0;
    el.drawPile.classList.toggle("must-draw", canDraw);
    el.drawPile.style.opacity = isHumanTurn ? "1" : "0.6";
    if (el.drawHint) {
      el.drawHint.textContent = canDraw ? "Compre!" : "Comprar";
    }
  }

  // ---------- Banner ----------
  let bannerTimer = null;
  function banner(text, ms = 1100, mini = false) {
    el.turnBanner.textContent = text;
    el.turnBanner.classList.toggle("turn-banner--mini", mini);
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
      el.playerArea.classList.toggle("active", isHumanTurn);

      if (isHumanTurn) {
        banner("Sua vez!", 900);
        if (navigator.vibrate) navigator.vibrate(20);
      } else {
        banner(`Vez de ${player.name}`, 750, true);
      }
    });

    Game.on("play", ({ player, card }) => {
      flyCardToDiscard(player, card);
      if (isActionCard(card) && Sound.isEnabled()) Sound.special();
      else if (Sound.isEnabled()) Sound.play();
      if (navigator.vibrate) navigator.vibrate(15);
    });

    Game.on("draw", ({ player, count }) => {
      flyDrawToHand(player, count);
      if (Sound.isEnabled()) Sound.draw();
    });

    Game.on("special", ({ type, player }) => {
      if (type === "reverse") {
        el.direction.classList.add("spin");
        setTimeout(() => el.direction.classList.remove("spin"), 650);
      }
      if (type === "skip" && player) {
        const opp = opponentNode(player.id);
        if (opp) {
          opp.classList.add("skipped");
          setTimeout(() => opp.classList.remove("skipped"), 450);
        }
      }
      const labels = {
        skip: player ? `${player.name} pulou!` : "Pulou!",
        reverse: "Sentido invertido!",
        draw2: player ? `${player.name} +2` : "+2",
        wild4: player ? `${player.name} +4` : "+4",
        wild: "Curinga!",
      };
      if (labels[type]) banner(labels[type], 1000);
    });

    Game.on("needColor", () => showColorPicker());

    Game.on("humanReachedUno", () => {
      setUnoButton(true);
      banner("Aperte UNO!", 1200);
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
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

    Game.on("reshuffle", () => banner("Reembaralhando…", 900, true));

    Game.on("newgame", () => {
      setUnoButton(false);
      hideColorPicker();
      dealPending = true;
      lastDiscardId = null;
      lastColor = null;
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
