-- HealthLog v2 — Schema Supabase
-- Execute este SQL no SQL Editor do Supabase (supabase.com → projeto → SQL Editor)

-- ─── EXTENSÃO UUID ────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── PERFIL DO USUÁRIO (onboarding) ──────────────────────────────
create table if not exists user_profile (
  id            uuid primary key default uuid_generate_v4(),
  user_id       text not null unique,       -- identificador local (gerado no app)
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  -- Identidade (Hábitos Atômicos)
  identity_statement  text,                -- "Sou uma pessoa que..."
  desired_identity    text,                -- "Quero me tornar..."

  -- Objetivos
  primary_goal        text,                -- performance | longevidade | composicao | saude
  goal_detail         text,

  -- Hábitos declarados
  good_habits         jsonb default '[]',  -- ["treino","meditacao","leitura"]
  bad_habits          jsonb default '[]',  -- ["fumar","alcool_excessivo"]
  habits_to_add       jsonb default '[]',  -- hábitos que quer construir
  habits_to_remove    jsonb default '[]',  -- hábitos que quer eliminar

  -- Configurações
  oura_token          text,
  backend_url         text,
  timezone            text default 'America/Sao_Paulo',

  -- Stats gamificados (calculados)
  level               int default 1,
  xp_total            int default 0,
  streak_days         int default 0,
  longest_streak      int default 0
);

-- ─── PASTA DO DIA ─────────────────────────────────────────────────
-- Cada linha = 1 dia. Contém todos os dados daquele dia.
create table if not exists days (
  id            uuid primary key default uuid_generate_v4(),
  user_id       text not null,
  date          date not null,             -- "2024-03-24" — chave principal do dia
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  -- ── SONO (Oura /sleep) ──
  sleep_hours         numeric(4,2),        -- 7.5
  sleep_score         int,                 -- 0-100
  sleep_efficiency    int,                 -- % 0-100
  sleep_latency_min   int,                 -- minutos para adormecer
  bed_time            time,                -- "23:10"
  wake_time           time,                -- "06:45"
  deep_sleep_min      int,
  rem_sleep_min       int,
  light_sleep_min     int,
  awake_min           int,
  hrv_avg             int,                 -- ms
  hr_resting          int,                 -- bpm
  hr_lowest           int,                 -- bpm durante o sono
  spo2_avg            numeric(4,1),        -- %
  breathing_di        int,                 -- Breathing Disturbance Index

  -- ── READINESS (Oura /daily_readiness) ──
  readiness_score     int,
  temp_deviation      numeric(5,3),        -- °C desvio da baseline
  temp_trend          numeric(5,3),
  readiness_contribs  jsonb,               -- {hrv_balance, recovery_index, ...}

  -- ── DAY SUMMARY (Oura /daily_stress) ──
  day_summary         text,                -- restored|relaxed|engaged|stressed
  stress_high_min     int,                 -- minutos em estresse alto
  recovery_high_min   int,                 -- minutos em recuperação

  -- ── ATIVIDADE (Oura /daily_activity + Garmin) ──
  steps               int,
  active_calories     int,
  total_calories      int,
  activity_score      int,
  sedentary_min       int,
  low_active_min      int,
  med_active_min      int,
  high_active_min     int,

  -- ── NUTRIÇÃO (refeições do dia) ──
  meals_kcal_total    int,                 -- soma de todas refeições
  meals_prot_total    int,                 -- g proteína
  meals_carb_total    int,                 -- g carboidratos
  meals_fat_total     int,                 -- g gordura

  -- ── SUBJETIVO ──
  mood                int,                 -- 1-5
  energy              int,                 -- 1-5
  notes               text,

  -- ── SINCRONIZAÇÃO ──
  oura_morning_sync   timestamptz,         -- último sync manhã
  oura_evening_sync   timestamptz,         -- último sync noite
  garmin_imported     boolean default false,

  unique(user_id, date)
);

-- ─── ENTRADAS DA TIMELINE ─────────────────────────────────────────
-- Cada chip/evento na timeline de um dia
create table if not exists timeline_entries (
  id            uuid primary key default uuid_generate_v4(),
  user_id       text not null,
  date          date not null,             -- referência ao dia
  created_at    timestamptz default now(),

  -- Posição na timeline
  hour          numeric(5,2) not null,     -- 7.5 = 07:30
  duration_min  int,                       -- duração em minutos

  -- Tipo e conteúdo
  type          text not null,             -- run|gym|sauna|ice|meal|cannabis|alcohol|meditate|read|nap|custom
  label         text,                      -- nome customizado
  icon          text,                      -- emoji
  source        text default 'manual',     -- manual|garmin|oura|auto

  -- Dados específicos por tipo (flexível)
  data          jsonb default '{}',
  -- gym:     {exercise_count, total_sets, total_reps, total_volume_kg, muscles:[]}
  -- run:     {distance_km, pace_min_km, avg_hr}
  -- sauna:   {temp_max, temp_min}
  -- meal:    {kcal, prot, carb, fat, meal_type}
  -- cannabis:{amount, method}
  -- alcohol: {drinks, type}

  -- Análise de impacto (calculada pela IA)
  sleep_impact_score  int,                 -- 0-100
  sleep_impact_text   text,

  -- Estado Oura no momento
  oura_state    text                       -- restored|relaxed|engaged|stressed
);

-- ─── TREINOS DE FORÇA DETALHADOS ──────────────────────────────────
-- Extraído dos arquivos .fit do Garmin
create table if not exists workout_sets (
  id              uuid primary key default uuid_generate_v4(),
  user_id         text not null,
  date            date not null,
  timeline_entry_id uuid references timeline_entries(id) on delete cascade,
  created_at      timestamptz default now(),

  -- Exercício
  exercise_name   text not null,           -- "Bench Press", "Squat"
  exercise_category text,                  -- "chest", "legs", "back", "shoulders", "arms", "core"
  muscles_primary   text[],               -- ["pectoralis_major", "anterior_deltoid"]
  muscles_secondary text[],               -- ["triceps_brachii"]

  -- Série
  set_number      int,
  set_type        text default 'active',   -- active|rest|warmup
  reps            int,
  weight_kg       numeric(6,2),
  duration_sec    int,
  rest_sec        int,

  -- Métricas
  volume_kg       numeric(8,2),            -- reps * weight
  avg_hr          int
);

-- ─── REFEIÇÕES ────────────────────────────────────────────────────
create table if not exists meals (
  id              uuid primary key default uuid_generate_v4(),
  user_id         text not null,
  date            date not null,
  created_at      timestamptz default now(),

  meal_type       text,                    -- cafe|almoco|jantar|lanche
  hour            numeric(5,2),            -- 12.5 = 12:30
  kcal            int,
  prot_g          int,
  carb_g          int,
  fat_g           int,
  fiber_g         int,
  description     text,
  ai_analysis     text,
  photo_url       text,
  notes           text
);

-- ─── ANÁLISES DE IA ───────────────────────────────────────────────
-- Histórico das análises geradas — para aprendizado ao longo do tempo
create table if not exists ai_analyses (
  id              uuid primary key default uuid_generate_v4(),
  user_id         text not null,
  date            date not null,
  created_at      timestamptz default now(),

  type            text not null,           -- morning_sleep|day_summary|weekly
  context_data    jsonb,                   -- dados usados na análise
  result          jsonb,                   -- resposta estruturada da IA
  model           text default 'claude-sonnet-4-6',

  -- Campos extraídos do result para queries rápidas
  summary         text,
  main_insight    text,
  recommendation  text,
  correlations    jsonb                    -- [{tag, impact, explanation}]
);

-- ─── VOLUME MUSCULAR SEMANAL ──────────────────────────────────────
-- Agregado por semana para o corpo anatômico
create table if not exists weekly_muscle_volume (
  id              uuid primary key default uuid_generate_v4(),
  user_id         text not null,
  week_start      date not null,           -- segunda-feira da semana
  muscle_group    text not null,           -- chest|back|legs|shoulders|arms|core|glutes
  total_sets      int default 0,
  total_reps      int default 0,
  total_volume_kg numeric(10,2) default 0,
  workout_count   int default 0,
  updated_at      timestamptz default now(),

  unique(user_id, week_start, muscle_group)
);

-- ─── PLANOS DO DIA SEGUINTE ───────────────────────────────────────
create table if not exists day_plans (
  id              uuid primary key default uuid_generate_v4(),
  user_id         text not null,
  plan_date       date not null,           -- data para a qual o plano foi feito
  created_at      timestamptz default now(),

  -- Habit stacking planejado
  habit_stacks    jsonb default '[]',
  -- [{after: "acordar", do: "meditação", where: "quarto", when: "07:00", how: "10min guiado"}]

  -- Recomendações da IA
  ai_suggestions  jsonb default '[]',
  -- [{replace: "cigarro após refeição", with: "caminhada 5min", reason: "..."}]

  notes           text,
  completed       boolean default false
);

-- ─── ÍNDICES PARA PERFORMANCE ─────────────────────────────────────
create index if not exists idx_days_user_date on days(user_id, date desc);
create index if not exists idx_timeline_user_date on timeline_entries(user_id, date desc);
create index if not exists idx_workouts_user_date on workout_sets(user_id, date desc);
create index if not exists idx_meals_user_date on meals(user_id, date desc);
create index if not exists idx_analyses_user_date on ai_analyses(user_id, date desc);
create index if not exists idx_muscle_volume_user_week on weekly_muscle_volume(user_id, week_start desc);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────
-- Por simplicidade (app pessoal), desabilitado por padrão.
-- Para multi-usuário no futuro, habilitar e adicionar políticas.
alter table user_profile disable row level security;
alter table days disable row level security;
alter table timeline_entries disable row level security;
alter table workout_sets disable row level security;
alter table meals disable row level security;
alter table ai_analyses disable row level security;
alter table weekly_muscle_volume disable row level security;
alter table day_plans disable row level security;

-- ─── FUNÇÃO: atualizar updated_at automaticamente ─────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_days_updated
  before update on days
  for each row execute function update_updated_at();

create trigger trg_profile_updated
  before update on user_profile
  for each row execute function update_updated_at();

-- ─── CÓDIGOS DE ACESSO ────────────────────────────────────────────
-- Execute este bloco no SQL Editor do Supabase para adicionar o sistema de login

create table if not exists access_codes (
  id         uuid primary key default uuid_generate_v4(),
  code       text not null unique,        -- "BETO", "PEDRO", "LUCAS"
  user_id    text not null unique,        -- UUID fixo associado ao código
  name       text,                        -- nome amigável
  created_at timestamptz default now(),
  last_login timestamptz
);

alter table access_codes disable row level security;

-- Corrigir coluna devices ausente no user_profile
alter table user_profile add column if not exists devices jsonb default '[]';

-- ── INSERIR USUÁRIOS DE TESTE ──────────────────────────────────────
-- Substitua os UUIDs por valores gerados (ou deixe o banco gerar)
insert into access_codes (code, user_id, name) values
  ('BETO',  gen_random_uuid()::text, 'Beto'),
  ('PEDRO', gen_random_uuid()::text, 'Pedro'),
  ('LUCAS', gen_random_uuid()::text, 'Lucas')
on conflict (code) do nothing;

-- Para ver os códigos e user_ids criados:
-- select code, user_id, name from access_codes;

-- ─── COLUNAS STRAVA no user_profile ──────────────────────────────
-- Execute no SQL Editor do Supabase
alter table user_profile add column if not exists strava_access_token  text;
alter table user_profile add column if not exists strava_refresh_token text;
alter table user_profile add column if not exists strava_expires_at    bigint;
alter table user_profile add column if not exists strava_athlete_id    text;
alter table user_profile add column if not exists strava_athlete_name  text;
