/* poker-engine.js - motor de Texas Hold'em (puro/autoritativo).
   Usa PokerEval. Estado serializável; apply(state, action) -> novo estado.
   Ações: fold, check, call, raise(amount=total da rua), allin. */

const PokerEngine = (() => {
  const Eval = typeof PokerEval !== "undefined" ? PokerEval : require("./poker-eval.js").PokerEval;

  function clone(s) {
    return JSON.parse(JSON.stringify(s));
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function createTable({ players, startingChips = 1000, smallBlind = 10, bigBlind = 20 }) {
    return {
      players: players.map((p) => ({
        id: p.id,
        name: p.name || "Jogador",
        avatar: p.avatar || "🙂",
        isHuman: !!p.isHuman,
        chips: startingChips,
        hole: [],
        folded: false,
        allIn: false,
        out: false,
        streetBet: 0,
        committed: 0,
        acted: false,
      })),
      deck: [],
      community: [],
      button: -1,
      sb: smallBlind,
      bb: bigBlind,
      currentBet: 0,
      minRaise: bigBlind,
      street: "idle",
      toAct: -1,
      handNo: 0,
      status: "idle",
      results: null,
      showdown: null,
      winner: null,
      version: 0,
      log: [],
    };
  }

  function nextActive(s, from) {
    const n = s.players.length;
    let i = from;
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      if (!s.players[i].out) return i;
    }
    return from;
  }

  function postBlind(s, idx, amount) {
    const p = s.players[idx];
    const pay = Math.min(amount, p.chips);
    p.chips -= pay;
    p.streetBet += pay;
    p.committed += pay;
    if (p.chips === 0) p.allIn = true;
  }

  function startHand(state) {
    const s = clone(state);
    s.log = [];
    s.players.forEach((p) => {
      if (p.chips <= 0) p.out = true;
    });
    const active = s.players.filter((p) => !p.out);
    if (active.length <= 1) {
      s.status = "table_over";
      s.winner = active[0] ? active[0].id : null;
      s.version++;
      return s;
    }

    s.players.forEach((p) => {
      p.folded = p.out;
      p.allIn = false;
      p.streetBet = 0;
      p.committed = 0;
      p.acted = false;
      p.hole = [];
    });

    s.button = nextActive(s, s.button);
    s.deck = shuffle(Eval.buildDeck());
    s.community = [];
    for (let r = 0; r < 2; r++)
      for (const p of s.players) if (!p.out) p.hole.push(s.deck.pop());

    const headsUp = active.length === 2;
    let sbIdx, bbIdx;
    if (headsUp) {
      sbIdx = s.button;
      bbIdx = nextActive(s, s.button);
    } else {
      sbIdx = nextActive(s, s.button);
      bbIdx = nextActive(s, sbIdx);
    }
    postBlind(s, sbIdx, s.sb);
    postBlind(s, bbIdx, s.bb);
    s.currentBet = s.bb;
    s.minRaise = s.bb;
    s.street = "preflop";
    s.status = "playing";
    s.toAct = headsUp ? s.button : nextActive(s, bbIdx);
    s.handNo++;
    s.results = null;
    s.showdown = null;
    s.version++;
    s.log.push({ t: "newhand", button: s.button, sb: sbIdx, bb: bbIdx });
    return s;
  }

  function commit(p, amount) {
    p.chips -= amount;
    p.streetBet += amount;
    p.committed += amount;
  }
  function resetActedExcept(s, idx) {
    s.players.forEach((p, j) => {
      if (j !== idx && !p.folded && !p.allIn && !p.out) p.acted = false;
    });
  }

  function nextToAct(s) {
    const n = s.players.length;
    let i = s.toAct;
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      const p = s.players[i];
      if (p.out || p.folded || p.allIn) continue;
      if (!p.acted || p.streetBet < s.currentBet) return i;
    }
    return -1;
  }

  function firstToActPostflop(s) {
    const n = s.players.length;
    let i = s.button;
    for (let k = 0; k < n; k++) {
      i = (i + 1) % n;
      const p = s.players[i];
      if (!p.out && !p.folded && !p.allIn) return i;
    }
    return -1;
  }

  function deal(s, n) {
    for (let k = 0; k < n; k++) if (s.deck.length) s.community.push(s.deck.pop());
  }

  function endHandUncontested(s) {
    const winner = s.players.find((x) => !x.folded && !x.out);
    const pot = s.players.reduce((a, p) => a + p.committed, 0);
    if (winner) winner.chips += pot;
    s.street = "handover";
    s.status = "handover";
    s.results = winner ? [{ id: winner.id, name: winner.name, amount: pot, uncontested: true }] : [];
    s.showdown = null;
    s.log.push({ t: "win", id: winner && winner.id, name: winner && winner.name, amount: pot, uncontested: true });
    s.version++;
    return s;
  }

  function settle(s) {
    const contenders = s.players.filter((p) => !p.folded && !p.out);
    const levels = [...new Set(s.players.map((p) => p.committed).filter((c) => c > 0))].sort(
      (a, b) => a - b
    );
    const pots = [];
    let prev = 0;
    for (const L of levels) {
      let amt = 0;
      for (const p of s.players)
        amt += Math.max(0, Math.min(p.committed, L) - Math.min(p.committed, prev));
      const eligible = contenders.filter((p) => p.committed >= L);
      pots.push({ amount: amt, eligible });
      prev = L;
    }

    const val = {};
    for (const p of contenders) val[p.id] = Eval.eval7(p.hole.concat(s.community));

    const awards = [];
    for (const pot of pots) {
      if (pot.amount <= 0 || pot.eligible.length === 0) continue;
      let best = pot.eligible[0];
      for (const p of pot.eligible) if (Eval.compare(val[p.id], val[best.id]) > 0) best = p;
      const winners = pot.eligible.filter((p) => Eval.compare(val[p.id], val[best.id]) === 0);
      const share = Math.floor(pot.amount / winners.length);
      const rem = pot.amount - share * winners.length;
      winners.forEach((w, idx) => {
        const add = share + (idx < rem ? 1 : 0);
        w.chips += add;
        awards.push({ id: w.id, name: w.name, amount: add, hand: Eval.categoryName(val[w.id]) });
      });
    }

    s.results = awards;
    s.showdown = contenders.map((p) => ({
      id: p.id,
      name: p.name,
      hole: p.hole,
      hand: Eval.categoryName(val[p.id]),
    }));
    s.status = "handover";
    s.street = "showdown";
    s.log.push({ t: "showdown", awards });
    s.version++;
    return s;
  }

  function endStreet(s) {
    s.players.forEach((p) => {
      p.streetBet = 0;
      p.acted = false;
    });
    s.currentBet = 0;
    s.minRaise = s.bb;
    return advanceStreet(s);
  }

  function advanceStreet(s) {
    if (s.street === "preflop") {
      s.street = "flop";
      deal(s, 3);
    } else if (s.street === "flop") {
      s.street = "turn";
      deal(s, 1);
    } else if (s.street === "turn") {
      s.street = "river";
      deal(s, 1);
    } else if (s.street === "river") {
      return settle(s);
    }
    const actors = s.players.filter((p) => !p.folded && !p.allIn && !p.out);
    if (actors.length < 2) return advanceStreet(s); // sem aposta possível: corre o board
    s.toAct = firstToActPostflop(s);
    s.version++;
    s.log.push({ t: "street", street: s.street, community: s.community.slice() });
    return s;
  }

  function apply(state, action) {
    if (state.status !== "playing") return state;
    const s = clone(state);
    s.log = [];
    const i = s.toAct;
    const p = s.players[i];
    if (!p || p.id !== action.playerId || p.folded || p.allIn || p.out) return state;

    const toCall = s.currentBet - p.streetBet;

    switch (action.type) {
      case "fold":
        p.folded = true;
        p.acted = true;
        s.log.push({ t: "fold", id: p.id, name: p.name });
        break;
      case "check":
        if (toCall > 0) return state;
        p.acted = true;
        s.log.push({ t: "check", id: p.id, name: p.name });
        break;
      case "call": {
        if (toCall <= 0) {
          p.acted = true;
          s.log.push({ t: "check", id: p.id, name: p.name });
          break;
        }
        const pay = Math.min(toCall, p.chips);
        commit(p, pay);
        if (p.chips === 0) p.allIn = true;
        p.acted = true;
        s.log.push({ t: "call", id: p.id, name: p.name, amount: pay, allIn: p.allIn });
        break;
      }
      case "raise":
      case "bet": {
        const maxTarget = p.streetBet + p.chips;
        let target = action.amount;
        if (target > maxTarget) target = maxTarget;
        const isAllIn = target === maxTarget;
        const minTarget = s.currentBet > 0 ? s.currentBet + s.minRaise : s.bb;
        if (target <= s.currentBet) return state;
        if (target < minTarget && !isAllIn) return state;
        commit(p, target - p.streetBet);
        const raiseSize = target - s.currentBet;
        s.currentBet = target;
        if (raiseSize >= s.minRaise) {
          s.minRaise = raiseSize;
          resetActedExcept(s, i);
        }
        if (p.chips === 0) p.allIn = true;
        p.acted = true;
        s.log.push({ t: "raise", id: p.id, name: p.name, amount: target, allIn: isAllIn });
        break;
      }
      case "allin": {
        const pay = p.chips;
        const target = p.streetBet + pay;
        commit(p, pay);
        p.allIn = true;
        p.acted = true;
        if (target > s.currentBet) {
          const raiseSize = target - s.currentBet;
          s.currentBet = target;
          if (raiseSize >= s.minRaise) {
            s.minRaise = raiseSize;
            resetActedExcept(s, i);
          }
        }
        s.log.push({ t: "allin", id: p.id, name: p.name, amount: target });
        break;
      }
      default:
        return state;
    }

    const inHand = s.players.filter((x) => !x.folded && !x.out);
    if (inHand.length === 1) return endHandUncontested(s);

    const nxt = nextToAct(s);
    if (nxt === -1) return endStreet(s);
    s.toAct = nxt;
    s.version++;
    return s;
  }

  function pot(s) {
    return s.players.reduce((a, p) => a + p.committed, 0);
  }

  function legalActions(s) {
    const p = s.players[s.toAct];
    if (!p) return null;
    const toCall = s.currentBet - p.streetBet;
    const callAmount = Math.min(Math.max(0, toCall), p.chips);
    const maxRaiseTo = p.streetBet + p.chips;
    const minRaiseToRaw = s.currentBet > 0 ? s.currentBet + s.minRaise : s.bb;
    const minRaiseTo = Math.min(minRaiseToRaw, maxRaiseTo);
    return {
      canFold: true,
      canCheck: toCall <= 0,
      canCall: toCall > 0 && p.chips > 0,
      callAmount,
      canRaise: p.chips > callAmount && maxRaiseTo > s.currentBet,
      minRaiseTo,
      maxRaiseTo,
    };
  }

  return { createTable, startHand, apply, legalActions, pot, nextActive };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PokerEngine };
}
