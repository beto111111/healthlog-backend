# HealthLog v2 — Backend

Node.js + Supabase + Claude. Gerencia todos os dados do app de forma persistente.

---

## 🗄️ Estrutura de dados (pastas por dia)

```
Supabase PostgreSQL
│
├── user_profile          — onboarding, identidade, metas, XP
│
├── days/                 — PASTA DO DIA (1 linha por dia)
│   └── 2024-03-24        — sono, readiness, day summary, atividade, nutrição
│
├── timeline_entries/     — chips da timeline (vinculados ao dia)
│   ├── gym @ 10:30       — {muscles, volume, sets}
│   ├── meal @ 13:00      — {kcal, macros}
│   └── sauna @ 12:00     — {temp, duration}
│
├── workout_sets/         — séries detalhadas de cada exercício
│   ├── Bench Press — set 1 — 80kg x 8 reps
│   └── Squat — set 2 — 100kg x 6 reps
│
├── meals/                — refeições com macros
│
├── weekly_muscle_volume/ — volume por músculo na semana
│   ├── chest             — 15 séries, 2400kg volume
│   └── legs              — 20 séries, 8000kg volume
│
├── ai_analyses/          — histórico de análises da IA
│
└── day_plans/            — plano do dia seguinte (habit stacking)
```

---

## 🚀 Setup Supabase (5 min)

1. Acesse **supabase.com** → New Project (gratuito, sem cartão)
2. Dê um nome ao projeto (ex: `healthlog`)
3. Anote a senha do banco (guarde em local seguro)
4. Vá em **SQL Editor** → cole todo o conteúdo de `schema.sql` → Run
5. Vá em **Settings → API**:
   - Copie a **Project URL** → será `SUPABASE_URL`
   - Copie a **service_role key** (não a anon) → será `SUPABASE_SERVICE_KEY`

---

## 🚀 Deploy no Render

1. Crie repositório `healthlog-v2-backend` no GitHub
2. Faça upload dos arquivos desta pasta
3. No **render.com** → New Web Service → conecte o repositório
4. Em **Environment Variables** adicione:

| Variável | Valor |
|----------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_KEY` | `eyJhbGc...` (service_role) |

5. Deploy — URL será `https://healthlog-v2-backend.onrender.com`

---

## 📡 Rotas principais

### Perfil
- `GET /api/profile` — busca perfil + onboarding
- `POST /api/profile` — salva/atualiza perfil

### Dias (pasta do dia)
- `GET /api/day/2024-03-24` — tudo do dia (sono, timeline, refeições, treino)
- `PUT /api/day/2024-03-24` — atualiza dados do dia
- `GET /api/days?limit=7` — últimos N dias

### Timeline
- `GET /api/timeline/2024-03-24` — entradas da timeline
- `POST /api/timeline/2024-03-24` — adiciona chip
- `PUT /api/timeline/entry/:id` — move/edita chip
- `DELETE /api/timeline/entry/:id` — remove chip

### Importação
- `POST /api/import/fit` — processa arquivo .fit do Garmin

### Refeições
- `POST /api/meal/2024-03-24` — salva refeição + atualiza totais do dia

### Análises IA
- `POST /api/analysis/morning/2024-03-24` — análise matinal (sono + dia anterior)
- `POST /api/analysis/day/2024-03-24` — análise do dia + plano de amanhã

### Músculo
- `GET /api/muscle-volume/2024-03-18` — volume semanal (começando na segunda)

### Oura Proxy
- `GET /api/oura/:endpoint?start_date=&end_date=` — proxy para API do Oura

---

## 🔑 Autenticação do app

Cada request do PWA envia o header `x-user-id` com um UUID gerado localmente no primeiro uso.
Simples e suficiente para uso pessoal. Para multi-usuário no futuro, migrar para Supabase Auth.
