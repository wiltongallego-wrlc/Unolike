/* poker-eval.js - avaliador de mãos de poker (Texas Hold'em).
   Carta: { r: 2..14 (14 = Ás), s: 's'|'h'|'d'|'c' }.
   eval5/eval7 retornam um array comparável: [categoria, ...desempates],
   onde categoria 8 = straight flush ... 0 = carta alta. Maior é melhor. */

const PokerEval = (() => {
  const SUITS = ["s", "h", "d", "c"];
  const CATEGORY = [
    "Carta alta",
    "Par",
    "Dois pares",
    "Trinca",
    "Sequência",
    "Flush",
    "Full house",
    "Quadra",
    "Straight flush",
  ];

  function buildDeck() {
    const deck = [];
    for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push({ r, s });
    return deck;
  }

  // Maior carta de uma sequência em um conjunto de ranks (trata a "roda" A-5)
  function straightHigh(rankSet) {
    const has = (r) => rankSet.has(r);
    // Ás baixo: A-2-3-4-5
    if (has(14) && has(2) && has(3) && has(4) && has(5)) {
      // verifica sequência normal mais alta primeiro
    }
    for (let hi = 14; hi >= 5; hi--) {
      let ok = true;
      for (let k = 0; k < 5; k++) {
        const need = hi - k;
        if (!has(need)) {
          ok = false;
          break;
        }
      }
      if (ok) return hi;
    }
    if (has(14) && has(2) && has(3) && has(4) && has(5)) return 5;
    return 0;
  }

  function eval5(cards) {
    const ranks = cards.map((c) => c.r).sort((a, b) => b - a);
    const suits = cards.map((c) => c.s);
    const isFlush = suits.every((s) => s === suits[0]);
    const rankSet = new Set(ranks);
    const sHigh = straightHigh(rankSet);

    const cnt = {};
    for (const r of ranks) cnt[r] = (cnt[r] || 0) + 1;
    const groups = Object.keys(cnt)
      .map((r) => ({ r: +r, c: cnt[r] }))
      .sort((a, b) => b.c - a.c || b.r - a.r);
    const kickersDesc = () => ranks.slice(); // já desc

    if (isFlush && sHigh) return [8, sHigh];
    if (groups[0].c === 4) {
      const quad = groups[0].r;
      const kick = ranks.find((r) => r !== quad);
      return [7, quad, kick];
    }
    if (groups[0].c === 3 && groups[1] && groups[1].c >= 2) {
      return [6, groups[0].r, groups[1].r];
    }
    if (isFlush) return [5, ...kickersDesc()];
    if (sHigh) return [4, sHigh];
    if (groups[0].c === 3) {
      const trip = groups[0].r;
      const ks = ranks.filter((r) => r !== trip);
      return [3, trip, ks[0], ks[1]];
    }
    if (groups[0].c === 2 && groups[1] && groups[1].c === 2) {
      const hi = Math.max(groups[0].r, groups[1].r);
      const lo = Math.min(groups[0].r, groups[1].r);
      const kick = ranks.find((r) => r !== hi && r !== lo);
      return [2, hi, lo, kick];
    }
    if (groups[0].c === 2) {
      const pair = groups[0].r;
      const ks = ranks.filter((r) => r !== pair);
      return [1, pair, ks[0], ks[1], ks[2]];
    }
    return [0, ...kickersDesc()];
  }

  function compare(a, b) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const x = a[i] || 0;
      const y = b[i] || 0;
      if (x !== y) return x - y;
    }
    return 0;
  }

  // Combinações de 5 dentre as cartas (5..7)
  function eval7(cards) {
    if (cards.length <= 5) return eval5(cards);
    let best = null;
    const n = cards.length;
    for (let a = 0; a < n - 4; a++)
      for (let b = a + 1; b < n - 3; b++)
        for (let c = b + 1; c < n - 2; c++)
          for (let d = c + 1; d < n - 1; d++)
            for (let e = d + 1; e < n; e++) {
              const v = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
              if (!best || compare(v, best) > 0) best = v;
            }
    return best;
  }

  function categoryName(value) {
    return CATEGORY[value[0]] || "";
  }

  const RANK_LABEL = {
    11: "J",
    12: "Q",
    13: "K",
    14: "A",
  };
  function rankLabel(r) {
    return RANK_LABEL[r] || String(r);
  }

  return { buildDeck, eval5, eval7, compare, categoryName, rankLabel, SUITS, CATEGORY };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PokerEval };
}
