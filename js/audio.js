/* audio.js - efeitos sonoros simples via WebAudio (sem arquivos externos) */

const Sound = (() => {
  let ctx = null;
  let enabled = true;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type = "sine", gainValue = 0.06) {
    if (!enabled) return;
    const audio = ensureCtx();
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainValue;
    osc.connect(gain);
    gain.connect(audio.destination);
    const now = audio.currentTime;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.start(now);
    osc.stop(now + duration);
  }

  return {
    setEnabled(v) {
      enabled = v;
    },
    isEnabled() {
      return enabled;
    },
    unlock() {
      ensureCtx();
    },
    play() {
      tone(420, 0.12, "triangle");
    },
    draw() {
      tone(240, 0.1, "sine");
    },
    special() {
      tone(520, 0.1, "square", 0.05);
      setTimeout(() => tone(680, 0.12, "square", 0.05), 90);
    },
    uno() {
      tone(660, 0.1, "triangle");
      setTimeout(() => tone(880, 0.16, "triangle"), 110);
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) =>
        setTimeout(() => tone(f, 0.18, "triangle"), i * 130)
      );
    },
    lose() {
      tone(300, 0.25, "sawtooth", 0.05);
      setTimeout(() => tone(200, 0.35, "sawtooth", 0.05), 180);
    },
  };
})();
