/*
 * config.js - configuração do backend (Supabase).
 *
 * Para ativar o ranking global e (futuramente) o jogo online:
 * 1. Crie um projeto grátis em https://supabase.com
 * 2. Em "Project Settings > API", copie a "Project URL" e a chave "anon public".
 * 3. Cole abaixo. (A chave anon é segura para uso no front-end com RLS ativo.)
 * 4. Rode o SQL de `supabase/schema.sql` no editor SQL do Supabase.
 *
 * Enquanto estiver vazio, o jogo funciona normalmente offline,
 * com cadastro e ranking apenas locais.
 */
window.UNOLIKE_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
};
