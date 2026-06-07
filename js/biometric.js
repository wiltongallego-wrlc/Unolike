/* biometric.js - desbloqueio/entrada por biometria (WebAuthn, autenticador
   da plataforma). Como o backend é serverless, isto funciona como um
   "cofre local": após logar uma vez e ativar, guarda o refresh token e
   usa a biometria do aparelho (digital/Face ID) para restaurar a sessão. */

const Biometric = (() => {
  const K_CRED = "xc.bio.cred";
  const K_TOKEN = "xc.bio.token";
  const K_ENABLED = "xc.bio.enabled";
  const K_EMAIL = "xc.bio.email";

  function bufToB64(buf) {
    const a = new Uint8Array(buf);
    let s = "";
    for (const b of a) s += String.fromCharCode(b);
    return btoa(s);
  }
  function b64ToBuf(b64) {
    const bin = atob(b64);
    const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a.buffer;
  }
  function rnd(n) {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return a;
  }

  async function supported() {
    try {
      if (!window.PublicKeyCredential || !navigator.credentials) return false;
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (e) {
      return false;
    }
  }

  function isEnabled() {
    return localStorage.getItem(K_ENABLED) === "1" && !!localStorage.getItem(K_CRED);
  }
  function canLogin() {
    return isEnabled() && !!localStorage.getItem(K_TOKEN);
  }
  function storedEmail() {
    return localStorage.getItem(K_EMAIL) || "";
  }
  function token() {
    return localStorage.getItem(K_TOKEN);
  }
  function updateToken(t) {
    if (t) localStorage.setItem(K_TOKEN, t);
  }

  // Registra a biometria neste aparelho, vinculando o refresh token atual
  async function enroll(refreshToken, email) {
    if (!refreshToken) throw new Error("Faça login antes de ativar a biometria.");
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: rnd(32),
        rp: { name: "XablauCard", id: location.hostname },
        user: {
          id: rnd(16),
          name: email || "jogador",
          displayName: email || "Jogador",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 60000,
      },
    });
    if (!cred) throw new Error("Não foi possível registrar a biometria.");
    localStorage.setItem(K_CRED, bufToB64(cred.rawId));
    localStorage.setItem(K_TOKEN, refreshToken);
    localStorage.setItem(K_ENABLED, "1");
    if (email) localStorage.setItem(K_EMAIL, email);
    return true;
  }

  // Pede a biometria do aparelho; resolve true se o usuário foi verificado
  async function verify() {
    const id = localStorage.getItem(K_CRED);
    if (!id) return false;
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: rnd(32),
        allowCredentials: [{ type: "public-key", id: b64ToBuf(id) }],
        userVerification: "required",
        timeout: 60000,
        rpId: location.hostname,
      },
    });
    return !!assertion;
  }

  function disable() {
    localStorage.removeItem(K_CRED);
    localStorage.removeItem(K_TOKEN);
    localStorage.removeItem(K_ENABLED);
    localStorage.removeItem(K_EMAIL);
  }

  return {
    supported,
    isEnabled,
    canLogin,
    storedEmail,
    token,
    updateToken,
    enroll,
    verify,
    disable,
  };
})();
