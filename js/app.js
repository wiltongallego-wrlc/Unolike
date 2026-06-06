/* app.js - inicialização, navegação entre telas e ligações de UI */

const App = (() => {
  const $ = (sel) => document.querySelector(sel);

  const screens = {
    home: $("#screen-home"),
    game: $("#screen-game"),
  };

  const modals = {
    rules: $("#rules-modal"),
    pause: $("#pause-modal"),
    gameover: $("#gameover-modal"),
    profiles: $("#profiles-modal"),
    ranking: $("#ranking-modal"),
  };

  let settings = loadSettings();
  let selectedAvatar = Profiles.AVATARS[0];

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem("unolike.settings")) || {};
    } catch {
      return {};
    }
  }
  function saveSettings() {
    localStorage.setItem("unolike.settings", JSON.stringify(settings));
  }

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("screen--active"));
    screens[name].classList.add("screen--active");
  }

  function openModal(name) {
    modals[name].hidden = false;
  }
  function closeModal(name) {
    modals[name].hidden = true;
  }

  // ---------- Perfis ----------
  function ensureProfile() {
    if (!Profiles.current()) {
      const list = Profiles.all();
      if (list.length) Profiles.setCurrent(list[0].id);
      else Profiles.create(settings.name || "Você");
    }
  }

  function renderProfileChip() {
    const p = Profiles.current();
    if (!p) return;
    $("#profile-chip-avatar").textContent = p.avatar;
    $("#profile-chip-name").textContent = p.name;
    $("#profile-chip-stats").textContent =
      `${p.stats.wins} ${p.stats.wins === 1 ? "vitória" : "vitórias"} · ${p.stats.points} pts`;
  }

  function renderProfilesList() {
    const wrap = $("#profiles-list");
    wrap.innerHTML = "";
    const currentId = Profiles.getCurrentId();
    const list = Profiles.all();

    if (!list.length) {
      wrap.innerHTML = '<p class="muted-text">Nenhum jogador ainda. Crie o primeiro abaixo.</p>';
      return;
    }

    for (const p of list) {
      const row = document.createElement("div");
      row.className = "profile-row" + (p.id === currentId ? " profile-row--active" : "");

      const av = document.createElement("span");
      av.className = "profile-row__avatar";
      av.textContent = p.avatar;

      const info = document.createElement("div");
      info.className = "profile-row__info";
      info.innerHTML =
        `<strong>${escapeHtml(p.name)}</strong>` +
        `<small>${p.stats.wins}V/${p.stats.games}J · ${p.stats.points} pts · recorde ${p.stats.bestScore}</small>`;

      const del = document.createElement("button");
      del.className = "profile-row__del";
      del.textContent = "✕";
      del.title = "Remover";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        Profiles.remove(p.id);
        renderProfilesList();
        renderProfileChip();
      });

      row.append(av, info, del);
      row.addEventListener("click", () => {
        Profiles.setCurrent(p.id);
        renderProfilesList();
        renderProfileChip();
      });
      wrap.appendChild(row);
    }
  }

  function renderAvatarPicker() {
    const wrap = $("#avatar-picker");
    wrap.innerHTML = "";
    Profiles.AVATARS.forEach((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "avatar-opt" + (a === selectedAvatar ? " avatar-opt--active" : "");
      b.textContent = a;
      b.addEventListener("click", () => {
        selectedAvatar = a;
        renderAvatarPicker();
      });
      wrap.appendChild(b);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
    );
  }

  // ---------- Ranking ----------
  let rankingTab = "local";

  function renderRanking() {
    const list = $("#ranking-list");
    document.querySelectorAll(".tab").forEach((t) =>
      t.classList.toggle("tab--active", t.dataset.tab === rankingTab)
    );

    if (rankingTab === "local") {
      const rows = Profiles.ranked();
      list.innerHTML = rows.length
        ? rankingRows(
            rows.map((p) => ({
              name: p.name,
              avatar: p.avatar,
              points: p.stats.points,
              wins: p.stats.wins,
              games: p.stats.games,
              best_score: p.stats.bestScore,
            }))
          )
        : '<p class="muted-text">Jogue uma partida para aparecer no ranking.</p>';
      return;
    }

    // Global
    if (!Net.available()) {
      list.innerHTML =
        '<p class="muted-text">Ranking global indisponível.<br>Configure o Supabase em <code>js/config.js</code> para ativar.</p>';
      return;
    }
    list.innerHTML = '<p class="muted-text">Carregando…</p>';
    Net.leaderboard().then((rows) => {
      if (rankingTab !== "global") return;
      if (!rows) {
        list.innerHTML = '<p class="muted-text">Não foi possível carregar o ranking global.</p>';
        return;
      }
      list.innerHTML = rows.length
        ? rankingRows(rows)
        : '<p class="muted-text">Ninguém no ranking global ainda.</p>';
    });
  }

  function rankingRows(rows) {
    const medals = ["🥇", "🥈", "🥉"];
    return rows
      .map((r, i) => {
        const pos = medals[i] || `${i + 1}.`;
        return (
          `<div class="rank-row">` +
          `<span class="rank-pos">${pos}</span>` +
          `<span class="rank-av">${r.avatar || "🙂"}</span>` +
          `<span class="rank-name">${escapeHtml(r.name)}</span>` +
          `<span class="rank-pts">${r.points} pts</span>` +
          `<small class="rank-sub">${r.wins}V/${r.games}J</small>` +
          `</div>`
        );
      })
      .join("");
  }

  // ---------- Início de partida ----------
  function startGame() {
    Sound.unlock();
    ensureProfile();
    const profile = Profiles.current();
    const opponents = parseInt($("#opponent-count").value, 10);

    settings.opponents = opponents;
    saveSettings();

    showScreen("game");
    Game.newGame({ playerName: profile.name, opponentCount: opponents });
  }

  function showGameOver(winner) {
    const state = Game.getState();
    const profile = Profiles.current();
    const won = winner.isHuman;

    // Pontuação estilo UNO: vencedor soma os pontos das cartas dos demais
    let score = 0;
    if (won) {
      score = state.players
        .filter((p) => !p.isHuman)
        .reduce((sum, p) => sum + handPoints(p.hand), 0);
    }

    if (profile) {
      Profiles.recordResult(profile.id, { won, score });
      Net.submitResult({
        name: profile.name,
        avatar: profile.avatar,
        won,
        points: score,
      });
    }
    renderProfileChip();

    const title = $("#gameover-title");
    const text = $("#gameover-text");
    const pts = $("#gameover-points");
    if (won) {
      title.textContent = "Você venceu! 🏆";
      text.textContent = "Mandou bem!";
      pts.hidden = false;
      pts.innerHTML = `+<strong>${score}</strong> pontos`;
    } else {
      title.textContent = "Você perdeu";
      text.textContent = `${winner.name} ficou sem cartas primeiro.`;
      pts.hidden = true;
    }
    openModal("gameover");
  }

  // ---------- Ligações de eventos da interface ----------
  function bindUI() {
    // Home
    $("#btn-start").addEventListener("click", startGame);
    $("#btn-rules").addEventListener("click", () => openModal("rules"));
    $("#btn-close-rules").addEventListener("click", () => closeModal("rules"));
    $("#btn-ranking").addEventListener("click", () => {
      rankingTab = "local";
      renderRanking();
      openModal("ranking");
    });

    // Perfis
    $("#profile-chip").addEventListener("click", () => {
      renderProfilesList();
      renderAvatarPicker();
      openModal("profiles");
    });
    $("#btn-close-profiles").addEventListener("click", () => {
      closeModal("profiles");
      renderProfileChip();
    });
    $("#btn-create-profile").addEventListener("click", () => {
      const input = $("#new-profile-name");
      Profiles.create(input.value, selectedAvatar);
      input.value = "";
      selectedAvatar = Profiles.AVATARS[Math.floor(Math.random() * Profiles.AVATARS.length)];
      renderProfilesList();
      renderAvatarPicker();
      renderProfileChip();
    });

    // Ranking (abas)
    $("#btn-close-ranking").addEventListener("click", () => closeModal("ranking"));
    document.querySelectorAll(".tab").forEach((t) =>
      t.addEventListener("click", () => {
        rankingTab = t.dataset.tab;
        renderRanking();
      })
    );

    $("#sound-toggle").addEventListener("change", (e) => {
      settings.sound = e.target.checked;
      Sound.setEnabled(e.target.checked);
      saveSettings();
      syncSoundIcon();
    });

    if (settings.opponents) $("#opponent-count").value = String(settings.opponents);
    if (typeof settings.sound === "boolean") {
      $("#sound-toggle").checked = settings.sound;
      Sound.setEnabled(settings.sound);
    }
    syncSoundIcon();

    // Topbar do jogo
    $("#btn-menu").addEventListener("click", () => openModal("pause"));
    $("#btn-sound").addEventListener("click", toggleSound);

    // Pilha de compra
    $("#draw-pile").addEventListener("click", () => Game.humanDraw());

    // Botão UNO
    $("#btn-uno").addEventListener("click", () => Game.sayUno());

    // Seletor de cor
    document.querySelectorAll(".color-choice").forEach((btn) => {
      btn.addEventListener("click", () => {
        UI.hideColorPicker();
        Game.resolveColor(btn.dataset.color);
      });
    });

    // Modal de pausa
    $("#btn-resume").addEventListener("click", () => closeModal("pause"));
    $("#btn-rules-2").addEventListener("click", () => {
      closeModal("pause");
      openModal("rules");
    });
    $("#btn-quit").addEventListener("click", () => {
      closeModal("pause");
      showScreen("home");
    });

    // Fim de jogo
    $("#btn-rematch").addEventListener("click", () => {
      closeModal("gameover");
      const profile = Profiles.current();
      Game.newGame({
        playerName: profile ? profile.name : "Você",
        opponentCount: settings.opponents || 3,
      });
    });
    $("#btn-home").addEventListener("click", () => {
      closeModal("gameover");
      showScreen("home");
    });
  }

  function toggleSound() {
    const enabled = !Sound.isEnabled();
    Sound.setEnabled(enabled);
    settings.sound = enabled;
    $("#sound-toggle").checked = enabled;
    saveSettings();
    syncSoundIcon();
  }
  function syncSoundIcon() {
    $("#btn-sound").textContent = Sound.isEnabled() ? "🔊" : "🔇";
  }

  // ---------- Service worker (PWA) ----------
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;

    let refreshing = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    });

    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js")
        .then((reg) => reg.update())
        .catch(() => {});
    });
  }

  function init() {
    ensureProfile();
    bindUI();
    renderProfileChip();
    UI.bindGame();
    registerSW();
    // Pré-aquece a conexão com o backend (se configurado)
    if (Net.configured()) Net.init();
  }

  return { init, showGameOver };
})();

document.addEventListener("DOMContentLoaded", App.init);
