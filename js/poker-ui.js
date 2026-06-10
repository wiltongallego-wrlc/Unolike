/* poker-ui.js - renderização da mesa de Texas Hold'em (single player). */

const PokerUI = (() => {
  const $ = (s) => document.querySelector(s);
  const el = {};

  const SUIT = { s: "♠", h: "♥", d: "♦", c: "♣" };
  const isRed = (s) => s === "h" || s === "d";

  function cache() {
    el.pot = $("#poker-pot");
    el.opp = $("#poker-opponents");
    el.community = $("#poker-community");
    el.msg = $("#poker-msg");
    el.meName = $("#poker-me-name");
    el.meChips = $("#poker-me-chips");
    el.hole = $("#poker-hole");
    el.actions = $("#poker-actions");
  }

  function pcard(card, faceDown) {
    const d = document.createElement("div");
    d.className = "pcard" + (faceDown ? " pcard--back" : isRed(card.s) ? " pcard--red" : "");
    if (!faceDown) {
      d.innerHTML =
        `<span class="pcard-r">${PokerEval.rankLabel(card.r)}</span>` +
        `<span class="pcard-s">${SUIT[card.s]}</span>`;
    }
    return d;
  }

  function describe(log) {
    if (!log || !log.length) return "";
    const e = log[0];
    const n = e.name || "";
    switch (e.t) {
      case "fold": return `${n} desistiu`;
      case "check": return `${n} passou`;
      case "call": return `${n} pagou ${e.amount}${e.allIn ? " (all-in)" : ""}`;
      case "raise": return `${n} ${e.allIn ? "foi all-in" : "aumentou"} para ${e.amount}`;
      case "allin": return `${n} foi all-in (${e.amount})`;
      case "street": return streetName(e.street);
      case "newhand": return "Nova mão";
      default: return "";
    }
  }
  function streetName(s) {
    return { flop: "Flop", turn: "Turn", river: "River", preflop: "Pré-flop" }[s] || s;
  }

  // ---------- Render ----------
  function render(state) {
    if (!state) return;
    const showdown = state.status === "handover";
    el.pot.textContent = PokerEngine.pot(state);

    // Oponentes
    el.opp.innerHTML = "";
    state.players.forEach((p, idx) => {
      if (p.isHuman) return;
      const active = idx === state.toAct && state.status === "playing";
      const div = document.createElement("div");
      div.className = "poker-player" + (active ? " active" : "") + (p.folded ? " folded" : "");

      const dealer = idx === state.button ? '<span class="poker-dealer">D</span>' : "";
      const av = `<div class="poker-av">${p.avatar || "🙂"}${dealer}</div>`;
      const name = `<div class="poker-pname">${p.name}</div>`;
      const chips = `<div class="poker-pchips">${p.chips}</div>`;

      const cards = document.createElement("div");
      cards.className = "poker-pcards";
      const reveal = showdown && !p.folded && state.community.length >= 0 && hasShowdown(state, p.id);
      if (p.out) {
        cards.innerHTML = '<span class="poker-out">fora</span>';
      } else if (reveal) {
        p.hole.forEach((c) => cards.appendChild(pcard(c, false)));
      } else if (!p.folded) {
        cards.appendChild(pcard(null, true));
        cards.appendChild(pcard(null, true));
      }

      const bet = p.streetBet > 0 ? `<div class="poker-bet">${p.streetBet}</div>` : "";
      const tag = p.allIn ? '<span class="poker-tag">ALL-IN</span>' : p.folded ? '<span class="poker-tag fold">fold</span>' : "";

      div.innerHTML = av + name + chips;
      div.appendChild(cards);
      div.insertAdjacentHTML("beforeend", bet + tag);
      el.opp.appendChild(div);
    });

    // Comunidade
    el.community.innerHTML = "";
    state.community.forEach((c) => el.community.appendChild(pcard(c, false)));
    for (let i = state.community.length; i < 5; i++) {
      const ph = document.createElement("div");
      ph.className = "pcard pcard--empty";
      el.community.appendChild(ph);
    }

    // Eu
    const me = state.players.find((p) => p.isHuman);
    const meIdx = state.players.indexOf(me);
    el.meName.textContent = `${me.name}${meIdx === state.button ? " (D)" : ""}`;
    el.meChips.textContent = `${me.chips} fichas${me.streetBet ? " · aposta " + me.streetBet : ""}`;
    el.hole.innerHTML = "";
    if (me.hole && me.hole.length) {
      me.hole.forEach((c) => el.hole.appendChild(pcard(c, false)));
      // categoria atual
      if (state.community.length >= 3) {
        const v = PokerEval.eval7(me.hole.concat(state.community));
        const tag = document.createElement("div");
        tag.className = "poker-mehand";
        tag.textContent = PokerEval.categoryName(v);
        el.hole.appendChild(tag);
      }
    }
    el.hole.classList.toggle("dim", me.folded);

    // Mensagem
    if (showdown) {
      el.msg.textContent = resultMsg(state);
    } else if (state.status === "playing") {
      const cur = state.players[state.toAct];
      el.msg.textContent = describe(state.log) || (cur.isHuman ? "Sua vez" : `Vez de ${cur.name}`);
    }
  }

  function hasShowdown(state, id) {
    return state.showdown && state.showdown.some((s) => s.id === id);
  }

  function resultMsg(state) {
    if (!state.results || !state.results.length) return "Fim da mão";
    const r = state.results[0];
    if (r.uncontested) return `${r.name} levou o pote (${r.amount})`;
    return state.results.map((x) => `${x.name} +${x.amount} (${x.hand || ""})`).join("  ·  ");
  }

  // ---------- Ações do jogador ----------
  function renderActions(legal) {
    el.actions.innerHTML = "";
    if (!legal) return;
    const me = PokerGame.getState().players.find((p) => p.isHuman);

    const row = document.createElement("div");
    row.className = "poker-act-row";

    const fold = btn("Desistir", "poker-btn poker-btn--fold", () => PokerGame.humanAction("fold"));
    row.appendChild(fold);

    if (legal.canCheck) {
      row.appendChild(btn("Passar", "poker-btn", () => PokerGame.humanAction("check")));
    } else if (legal.canCall) {
      row.appendChild(
        btn(`Pagar ${legal.callAmount}`, "poker-btn poker-btn--call", () =>
          PokerGame.humanAction("call")
        )
      );
    }

    el.actions.appendChild(row);

    if (legal.canRaise) {
      const min = legal.minRaiseTo;
      const max = legal.maxRaiseTo;
      const wrap = document.createElement("div");
      wrap.className = "poker-raise";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(min);
      slider.max = String(max);
      slider.value = String(min);
      slider.step = String(Math.max(1, Math.floor(PokerGame.getState().bb / 2)));

      const label = document.createElement("div");
      label.className = "poker-raise-val";
      const upd = () => (label.textContent = `Aumentar para ${slider.value}`);
      upd();
      slider.addEventListener("input", upd);

      const quick = document.createElement("div");
      quick.className = "poker-quick";
      const pot = PokerEngine.pot(PokerGame.getState());
      [["½ pote", Math.floor(pot / 2)], ["Pote", pot], ["All-in", max]].forEach(([t, v]) => {
        quick.appendChild(
          btn(t, "poker-chip", () => {
            const target = t === "All-in" ? max : Math.min(max, Math.max(min, (me.streetBet || 0) + v));
            slider.value = String(Math.min(max, Math.max(min, target)));
            upd();
          })
        );
      });

      const confirm = btn("Confirmar", "poker-btn poker-btn--raise", () => {
        PokerGame.humanAction("raise", parseInt(slider.value, 10));
      });

      wrap.appendChild(quick);
      wrap.appendChild(slider);
      wrap.appendChild(label);
      wrap.appendChild(confirm);
      el.actions.appendChild(wrap);
    }
  }

  function btn(text, cls, fn) {
    const b = document.createElement("button");
    b.className = cls;
    b.textContent = text;
    b.addEventListener("click", fn);
    return b;
  }

  function clearActions() {
    el.actions.innerHTML = "";
  }

  // ---------- Eventos ----------
  function bind() {
    cache();
    PokerGame.on("update", render);
    PokerGame.on("newhand", (s) => {
      render(s);
      flash("Nova mão", 900);
    });
    PokerGame.on("turn", ({ player, legal }) => {
      if (player.isHuman) {
        renderActions(legal);
        if (Sound.isEnabled()) Sound.play();
        if (navigator.vibrate) navigator.vibrate(15);
      } else {
        clearActions();
      }
    });
    PokerGame.on("action", () => {
      if (Sound.isEnabled()) Sound.draw();
    });
    PokerGame.on("handover", (s) => {
      clearActions();
      render(s);
      if (Sound.isEnabled()) Sound.special();
    });
    PokerGame.on("tableover", (s) => {
      clearActions();
      const me = s.players.find((p) => p.isHuman);
      App.showPokerOver(me && !me.out);
    });
  }

  let flashT = null;
  function flash(text, ms = 1000) {
    el.msg.textContent = text;
    clearTimeout(flashT);
  }

  return { bind, render };
})();
