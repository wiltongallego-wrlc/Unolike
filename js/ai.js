/* ai.js - decisões dos oponentes controlados pelo computador */

const AI = (() => {
  // Escolhe a melhor cor com base na maioria de cartas na mão
  function bestColor(hand) {
    const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
    for (const card of hand) {
      if (counts[card.color] !== undefined) counts[card.color]++;
    }
    let best = "red";
    let max = -1;
    for (const color of COLORS) {
      if (counts[color] > max) {
        max = counts[color];
        best = color;
      }
    }
    return best;
  }

  // Pontua uma carta jogável: prioriza livrar-se de cartas "caras" e atacar
  function scoreCard(card, hand, nextOpponentCount) {
    let score = 0;
    if (card.value === "wild4") score = nextOpponentCount <= 2 ? 9 : 4;
    else if (card.value === "draw2") score = 8;
    else if (card.value === "skip") score = 7;
    else if (card.value === "reverse") score = 6;
    else if (card.value === "wild") score = 5;
    else score = parseInt(card.value, 10); // 0-9

    // Guardar curingas quando ainda há muitas cartas coloridas jogáveis
    if (isWild(card) && hand.length > 3) score -= 2;
    return score;
  }

  /**
   * Decide a jogada de um bot.
   * Retorna { card, color } se for jogar, ou null para comprar.
   */
  function decide(hand, topCard, activeColor, nextOpponentHandSize) {
    const playable = hand.filter((c) => canPlay(c, topCard, activeColor));
    if (playable.length === 0) return null;

    // Se o próximo oponente está perto de vencer, prioriza cartas de ataque
    const aggressive = nextOpponentHandSize <= 2;

    playable.sort((a, b) => {
      let sa = scoreCard(a, hand, hand.length);
      let sb = scoreCard(b, hand, hand.length);
      if (aggressive) {
        if (["draw2", "wild4", "skip"].includes(a.value)) sa += 5;
        if (["draw2", "wild4", "skip"].includes(b.value)) sb += 5;
      }
      return sb - sa;
    });

    const chosen = playable[0];
    const color = isWild(chosen) ? bestColor(hand) : chosen.color;
    return { card: chosen, color };
  }

  return { decide, bestColor };
})();
