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
  };

  let settings = loadSettings();

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

  // ---------- Início de partida ----------
  function startGame() {
    Sound.unlock();
    const name = $("#player-name").value.trim() || "Você";
    const opponents = parseInt($("#opponent-count").value, 10);

    settings.name = name;
    settings.opponents = opponents;
    saveSettings();

    showScreen("game");
    Game.newGame({ playerName: name, opponentCount: opponents });
  }

  function showGameOver(winner) {
    const title = $("#gameover-title");
    const text = $("#gameover-text");
    if (winner.isHuman) {
      title.textContent = "Você venceu! 🏆";
      text.textContent = "Mandou bem! Pronto para outra?";
    } else {
      title.textContent = "Você perdeu";
      text.textContent = `${winner.name} ficou sem cartas primeiro.`;
    }
    openModal("gameover");
  }

  // ---------- Ligações de eventos da interface ----------
  function bindUI() {
    // Home
    $("#btn-start").addEventListener("click", startGame);
    $("#btn-rules").addEventListener("click", () => openModal("rules"));
    $("#btn-close-rules").addEventListener("click", () => closeModal("rules"));

    $("#sound-toggle").addEventListener("change", (e) => {
      settings.sound = e.target.checked;
      Sound.setEnabled(e.target.checked);
      saveSettings();
      syncSoundIcon();
    });

    // Pré-preenche com as preferências salvas
    if (settings.name) $("#player-name").value = settings.name;
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
      Game.newGame({
        playerName: settings.name || "Você",
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
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      });
    }
  }

  function init() {
    bindUI();
    UI.bindGame();
    registerSW();
  }

  return { init, showGameOver };
})();

document.addEventListener("DOMContentLoaded", App.init);
