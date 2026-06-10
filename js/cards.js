/* cards.js - criação e utilidades do baralho estilo UNO */

const COLORS = ["red", "yellow", "green", "blue"];

// Símbolos exibidos para cartas de ação
const SYMBOLS = {
  skip: "⊘",
  reverse: "⇄",
  draw2: "+2",
  wild: "★",
  wild4: "+4",
};

let cardIdCounter = 0;

function makeCard(color, value) {
  return { id: ++cardIdCounter, color, value };
}

/**
 * Monta um baralho completo (108 cartas):
 * - Por cor: um 0, dois de cada 1-9, dois skip, dois reverse, dois draw2
 * - 4 curingas e 4 curingas +4
 */
function buildDeck() {
  const deck = [];

  for (const color of COLORS) {
    deck.push(makeCard(color, "0"));
    for (let n = 1; n <= 9; n++) {
      deck.push(makeCard(color, String(n)));
      deck.push(makeCard(color, String(n)));
    }
    for (const action of ["skip", "reverse", "draw2"]) {
      deck.push(makeCard(color, action));
      deck.push(makeCard(color, action));
    }
  }

  for (let i = 0; i < 4; i++) {
    deck.push(makeCard("wild", "wild"));
    deck.push(makeCard("wild", "wild4"));
  }

  return deck;
}

// Embaralhamento Fisher-Yates
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isWild(card) {
  return card.color === "wild";
}

function isActionCard(card) {
  return ["skip", "reverse", "draw2", "wild", "wild4"].includes(card.value);
}

function isNumberCard(card) {
  return /^[0-9]$/.test(card.value);
}

/**
 * Verifica se uma carta pode ser jogada sobre o topo.
 * activeColor é a cor "efetiva" (importa quando o topo é curinga).
 */
function canPlay(card, topCard, activeColor) {
  if (isWild(card)) return true;
  if (card.color === activeColor) return true;
  if (card.value === topCard.value && !isWild(topCard)) return true;
  return false;
}

function cardLabel(card) {
  if (isNumberCard(card)) return card.value;
  return SYMBOLS[card.value] || "?";
}

// Pontuação estilo UNO: número = valor; ação = 20; curinga = 50
function cardPoints(card) {
  if (isNumberCard(card)) return parseInt(card.value, 10);
  if (card.value === "wild" || card.value === "wild4") return 50;
  return 20; // skip, reverse, draw2
}

function handPoints(hand) {
  return hand.reduce((sum, c) => sum + cardPoints(c), 0);
}
