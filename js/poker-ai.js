/* poker-ai.js - decisões dos bots de Texas Hold'em (heurística simples). */

const PokerAI = (() => {
  const Eval = typeof PokerEval !== "undefined" ? PokerEval : null;

  function strength(state, p) {
    const comm = state.community;
    if (comm.length === 0) {
      const hi = Math.max(p.hole[0].r, p.hole[1].r);
      const lo = Math.min(p.hole[0].r, p.hole[1].r);
      let s = ((hi - 2) / 12) * 0.5 + ((lo - 2) / 12) * 0.18;
      if (p.hole[0].r === p.hole[1].r) s += 0.34; // par
      if (p.hole[0].s === p.hole[1].s) s += 0.06; // suited
      if (hi - lo === 1) s += 0.05; // conectadas
      return Math.max(0, Math.min(1, s));
    }
    const v = Eval.eval7(p.hole.concat(comm));
    // categoria 0..8 → base; soma um pouco pelo desempate alto
    return Math.min(1, v[0] / 8 + (v[1] ? v[1] / 200 : 0));
  }

  function decide(state) {
    const la = PokerEngine.legalActions(state);
    const p = state.players[state.toAct];
    const str = strength(state, p);
    const potNow = PokerEngine.pot(state);
    const toCall = la.callAmount;
    const r = Math.random();

    // Sem aposta para pagar: check ou aposta de valor
    if (la.canCheck) {
      if (str > 0.62 && la.canRaise && r < 0.55) {
        const size = Math.min(la.maxRaiseTo, Math.max(la.minRaiseTo, Math.floor(potNow * 0.6) + state.bb));
        return { type: "raise", amount: size };
      }
      if (str < 0.35 && la.canRaise && r < 0.07) {
        return { type: "raise", amount: la.minRaiseTo }; // bluff esporádico
      }
      return { type: "check" };
    }

    // Enfrentando aposta: pot odds
    const potOdds = toCall / (potNow + toCall);
    if (str > 0.78 && la.canRaise && r < 0.55) {
      const size = Math.min(la.maxRaiseTo, Math.max(la.minRaiseTo, Math.floor((potNow + toCall) * 0.8)));
      return { type: "raise", amount: size };
    }
    if (str >= potOdds - 0.04) {
      return { type: "call" };
    }
    if (la.canRaise && r < 0.05) {
      return { type: "raise", amount: la.minRaiseTo }; // blefe
    }
    return { type: "fold" };
  }

  return { decide, strength };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PokerAI };
}
