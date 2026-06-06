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
  updated_at  timestamptz not null default now()
);

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
    updated_at = now();
end; $$;

grant execute on function public.add_result(text, text, boolean, int) to anon, authenticated;

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
  host_id     uuid references auth.users(id),
  max_players int not null default 4,
  state       jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

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
