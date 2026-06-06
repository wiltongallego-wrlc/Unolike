/* net.js - integração opcional com Supabase (ranking global / online).
   Tudo é "best-effort": se não houver configuração ou conexão, o jogo
   continua funcionando normalmente apenas com dados locais. */

const Net = (() => {
  let client = null;
  let ready = false;
  let user = null;
  let initPromise = null;

  function cfg() {
    return window.UNOLIKE_CONFIG || {};
  }
  function configured() {
    const c = cfg();
    return !!(c.supabaseUrl && c.supabaseAnonKey);
  }
  function available() {
    return configured() && typeof window.supabase !== "undefined";
  }

  async function init() {
    if (ready) return true;
    if (!available()) return false;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        client = window.supabase.createClient(cfg().supabaseUrl, cfg().supabaseAnonKey);
        let {
          data: { session },
        } = await client.auth.getSession();
        if (!session) {
          const { data, error } = await client.auth.signInAnonymously();
          if (error) throw error;
          session = data.session;
        }
        user = session ? session.user : null;
        ready = !!user;
        return ready;
      } catch (e) {
        console.warn("Net: falha ao iniciar Supabase —", e.message);
        ready = false;
        return false;
      }
    })();
    return initPromise;
  }

  // Envia o resultado de uma partida para o ranking global
  async function submitResult({ name, avatar, won, points }) {
    if (!(await init())) return false;
    try {
      const { error } = await client.rpc("add_result", {
        p_name: name || "Jogador",
        p_avatar: avatar || "🙂",
        p_won: !!won,
        p_points: points | 0,
      });
      if (error) throw error;
      return true;
    } catch (e) {
      console.warn("Net: submitResult —", e.message);
      return false;
    }
  }

  // Lê o ranking global (top jogadores por pontos)
  async function leaderboard(limit = 50) {
    if (!(await init())) return null;
    try {
      const { data, error } = await client
        .from("profiles")
        .select("name,avatar,points,wins,games,best_score")
        .order("points", { ascending: false })
        .order("wins", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn("Net: leaderboard —", e.message);
      return null;
    }
  }

  return {
    configured,
    available,
    init,
    submitResult,
    leaderboard,
    isReady: () => ready,
    getClient: () => client,
    getUser: () => user,
  };
})();
