/* profiles.js - cadastro de jogadores e estatísticas (armazenamento local) */

const Profiles = (() => {
  const KEY = "unolike.profiles";
  const CUR = "unolike.currentProfile";

  const AVATARS = [
    "🦊", "🐼", "🐵", "🦁", "🐯", "🐸",
    "🐙", "🦄", "🐲", "🐧", "🐨", "🐶",
    "🐱", "🦖", "🐺", "🐰",
  ];

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  }
  function save(list) {
    localStorage.setItem(KEY, JSON.stringify(list));
  }

  function blankStats() {
    return { games: 0, wins: 0, losses: 0, points: 0, bestScore: 0 };
  }

  function all() {
    return load();
  }

  function getCurrentId() {
    return localStorage.getItem(CUR);
  }
  function setCurrent(id) {
    if (id) localStorage.setItem(CUR, id);
    else localStorage.removeItem(CUR);
  }
  function current() {
    const id = getCurrentId();
    return load().find((p) => p.id === id) || null;
  }

  function create(name, avatar) {
    const list = load();
    const profile = {
      id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: (name || "").trim().slice(0, 12) || "Jogador",
      avatar: avatar || AVATARS[Math.floor(Math.random() * AVATARS.length)],
      createdAt: Date.now(),
      stats: blankStats(),
    };
    list.push(profile);
    save(list);
    setCurrent(profile.id);
    return profile;
  }

  function remove(id) {
    const list = load().filter((p) => p.id !== id);
    save(list);
    if (getCurrentId() === id) setCurrent(list[0] ? list[0].id : null);
  }

  function update(id, fn) {
    const list = load();
    const p = list.find((x) => x.id === id);
    if (!p) return;
    if (!p.stats) p.stats = blankStats();
    fn(p);
    save(list);
  }

  // Registra o resultado de uma partida para um perfil
  function recordResult(id, { won, score }) {
    update(id, (p) => {
      p.stats.games++;
      if (won) {
        p.stats.wins++;
        p.stats.points += score;
        if (score > p.stats.bestScore) p.stats.bestScore = score;
      } else {
        p.stats.losses++;
      }
    });
  }

  function ranked() {
    return load()
      .slice()
      .sort(
        (a, b) =>
          b.stats.points - a.stats.points ||
          b.stats.wins - a.stats.wins ||
          a.name.localeCompare(b.name)
      );
  }

  return {
    AVATARS,
    all,
    create,
    remove,
    update,
    current,
    getCurrentId,
    setCurrent,
    recordResult,
    ranked,
  };
})();
