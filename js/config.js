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
  supabaseUrl: "https://jlfntgkogcjbqigkbosz.supabase.co",
  supabaseAnonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsZm50Z2tvZ2NqYnFpZ2tib3N6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NzU0NDIsImV4cCI6MjA5NjM1MTQ0Mn0.XrGwIF3i5lNcnG8Qt4V_HE8MqhP963ID2G308W12ekI",
};
