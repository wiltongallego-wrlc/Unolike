/* auth.js - autenticação via Supabase (somente provedores que não exigem
   clientId: e-mail+senha e link mágico por e-mail). Mantém o jogo
   acessível só para quem tem cadastro. */

const Auth = (() => {
  let user = null;
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
        data: { session },
      } = await c.auth.getSession();
      user = session ? session.user : null;
    } catch (e) {
      user = null;
    }
    Net.setUser(user);

    // Reage a login/logout (inclui retorno do link mágico)
    c.auth.onAuthStateChange((_event, session) => {
      const newUser = session ? session.user : null;
      const changed = (newUser && newUser.id) !== (user && user.id);
      user = newUser;
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
    notify();
  }

  return {
    init,
    onChange,
    getUser,
    isLoggedIn,
    email,
    available,
    signUp,
    signIn,
    magicLink,
    signOut,
  };
})();
