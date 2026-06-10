/* auth.js - autenticação via Supabase (somente provedores que não exigem
   clientId: e-mail+senha e link mágico por e-mail). Mantém o jogo
   acessível só para quem tem cadastro. */

const Auth = (() => {
  let user = null;
  let session = null;
  let initialized = false;
  const subs = [];

  function available() {
    return Net.available();
  }
  function client() {
    return Net.ensureClient();
  }
  function notify() {
    Net.setUser(user);
    subs.forEach((fn) => fn(user));
  }

  async function init() {
    const c = client();
    if (!c) {
      initialized = true;
      return null;
    }
    try {
      const {
        data: { session: s },
      } = await c.auth.getSession();
      session = s || null;
      user = session ? session.user : null;
    } catch (e) {
      user = null;
      session = null;
    }
    Net.setUser(user);

    // Reage a login/logout (inclui retorno do link mágico)
    c.auth.onAuthStateChange((_event, s) => {
      session = s || null;
      const newUser = s ? s.user : null;
      const changed = (newUser && newUser.id) !== (user && user.id);
      user = newUser;
      if (s && s.refresh_token && typeof Biometric !== "undefined" && Biometric.isEnabled()) {
        Biometric.updateToken(s.refresh_token);
      }
      if (changed) notify();
    });

    initialized = true;
    return user;
  }

  function onChange(fn) {
    subs.push(fn);
  }
  function getUser() {
    return user;
  }
  function isLoggedIn() {
    return !!user;
  }
  function email() {
    return user ? user.email : null;
  }

  async function signUp(em, pass) {
    const c = client();
    if (!c) return { error: { message: "Backend indisponível." } };
    return c.auth.signUp({
      email: em,
      password: pass,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
  }
  async function signIn(em, pass) {
    const c = client();
    if (!c) return { error: { message: "Backend indisponível." } };
    return c.auth.signInWithPassword({ email: em, password: pass });
  }
  async function magicLink(em) {
    const c = client();
    if (!c) return { error: { message: "Backend indisponível." } };
    return c.auth.signInWithOtp({
      email: em,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
  }
  async function signOut() {
    const c = client();
    if (c) await c.auth.signOut();
    user = null;
    session = null;
    notify();
  }

  function getSession() {
    return session;
  }

  async function changePassword(newPass) {
    const c = client();
    if (!c) return { error: { message: "Backend indisponível." } };
    return c.auth.updateUser({ password: newPass });
  }

  // Restaura a sessão a partir de um refresh token (usado pela biometria)
  async function restore(refreshToken) {
    const c = client();
    if (!c || !refreshToken) return { error: { message: "Sem token de sessão." } };
    const { data, error } = await c.auth.refreshSession({ refresh_token: refreshToken });
    if (!error && data && data.session) {
      session = data.session;
      user = data.session.user;
      Net.setUser(user);
      notify();
    }
    return { data, error };
  }

  return {
    init,
    onChange,
    getUser,
    getSession,
    isLoggedIn,
    email,
    available,
    signUp,
    signIn,
    magicLink,
    signOut,
    restore,
    changePassword,
  };
})();
