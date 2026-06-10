-- ============================================================
-- Unolike — schema do Supabase
-- Rode este SQL no editor SQL do seu projeto Supabase.
-- ============================================================

-- ------------------------------------------------------------
-- PERFIS / RANKING GLOBAL  (Fase 2)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null default 'Jogador',
  avatar      text not null default '🙂',
  games       int  not null default 0,
  wins        int  not null default 0,
  points      int  not null default 0,
  best_score  int  not null default 0,
  abandons    int  not null default 0,
  logins      int  not null default 0,
  is_admin    boolean not null default false,
  last_seen   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Para tabelas que já existiam (idempotente):
alter table public.profiles add column if not exists abandons   int not null default 0;
alter table public.profiles add column if not exists logins     int not null default 0;
alter table public.profiles add column if not exists is_admin   boolean not null default false;
alter table public.profiles add column if not exists last_seen  timestamptz;
alter table public.profiles add column if not exists created_at timestamptz not null default now();

-- Registra acesso (login/abertura) sem mexer em pontuação. Usado para
-- métricas de conversão, frequência e último acesso no painel admin.
create or replace function public.touch_profile(p_name text, p_avatar text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles as pr (id, name, avatar, logins, last_seen, created_at, updated_at)
  values (auth.uid(), p_name, p_avatar, 1, now(), now(), now())
  on conflict (id) do update set
    name = excluded.name,
    avatar = excluded.avatar,
    logins = pr.logins + 1,
    last_seen = now(),
    updated_at = now();
end; $$;

grant execute on function public.touch_profile(text, text) to anon, authenticated;

-- Torna o usuário atual (dono do app) administrador.
-- Funciona mesmo que o perfil ainda não exista.
insert into public.profiles (id, name, is_admin)
select id, coalesce(raw_user_meta_data->>'name', split_part(email, '@', 1)), true
from auth.users
where email = 'presales-ia@truechange.com'
on conflict (id) do update set is_admin = true;

alter table public.profiles enable row level security;

drop policy if exists "perfis visiveis" on public.profiles;
create policy "perfis visiveis" on public.profiles
  for select using (true);

drop policy if exists "edita o proprio perfil" on public.profiles;
create policy "edita o proprio perfil" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Registra o resultado de uma partida (upsert + incremento atômico)
create or replace function public.add_result(
  p_name text, p_avatar text, p_won boolean, p_points int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  gained int := case when p_won then greatest(coalesce(p_points,0), 0) else 0 end;
begin
  insert into public.profiles as pr (id, name, avatar, games, wins, points, best_score, updated_at)
  values (auth.uid(), p_name, p_avatar, 1,
          case when p_won then 1 else 0 end, gained, gained, now())
  on conflict (id) do update set
    name       = excluded.name,
    avatar     = excluded.avatar,
    games      = pr.games + 1,
    wins       = pr.wins + (case when p_won then 1 else 0 end),
    points     = pr.points + gained,
    best_score = greatest(pr.best_score, gained),
    last_seen  = now(),
    updated_at = now();
end; $$;

grant execute on function public.add_result(text, text, boolean, int) to anon, authenticated;

-- Penalidade por abandono (queda abrupta no ranking). Chamada pelo host
-- da partida para o jogador que abandonou (funciona mesmo se ele caiu).
-- Observação: é baseada em confiança (sem validação de partida no servidor);
-- pode ser endurecida no futuro com uma Edge Function.
create or replace function public.report_abandon(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set
    games    = games + 1,
    abandons = abandons + 1,
    points   = greatest(points - 75, 0),
    updated_at = now()
  where id = p_user;
  if not found then
    insert into public.profiles (id, name, avatar, games, abandons, points)
    values (p_user, 'Jogador', '🙂', 1, 1, 0);
  end if;
end; $$;

grant execute on function public.report_abandon(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- SALAS ONLINE  (Fase 3 — jogo online)
-- Lembre de habilitar Realtime para estas tabelas:
--   Database > Replication > supabase_realtime  (adicione rooms e room_players)
-- ------------------------------------------------------------
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  status      text not null default 'lobby',   -- lobby | playing | finished
  is_public   boolean not null default false,
  tier        text,                            -- faixa de ranking (matchmaking)
  host_id     uuid references auth.users(id),
  max_players int not null default 4,
  state       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Se a tabela já existia sem a coluna tier, adicione:
alter table public.rooms add column if not exists tier text;

alter table public.rooms enable row level security;

drop policy if exists "salas visiveis" on public.rooms;
create policy "salas visiveis" on public.rooms for select using (true);

drop policy if exists "cria sala" on public.rooms;
create policy "cria sala" on public.rooms for insert with check (auth.uid() = host_id);

drop policy if exists "host atualiza sala" on public.rooms;
create policy "host atualiza sala" on public.rooms
  for update using (auth.uid() = host_id) with check (auth.uid() = host_id);

create table if not exists public.room_players (
  room_id   uuid references public.rooms(id) on delete cascade,
  user_id   uuid references auth.users(id) on delete cascade,
  name      text not null default 'Jogador',
  avatar    text not null default '🙂',
  seat      int,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.room_players enable row level security;

drop policy if exists "jogadores visiveis" on public.room_players;
create policy "jogadores visiveis" on public.room_players for select using (true);

drop policy if exists "entra na sala" on public.room_players;
create policy "entra na sala" on public.room_players
  for insert with check (auth.uid() = user_id);

drop policy if exists "edita o proprio assento" on public.room_players;
create policy "edita o proprio assento" on public.room_players
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
