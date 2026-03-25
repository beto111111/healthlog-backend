// server.js — HealthLog v2 Backend
import express from 'express';
import multer from 'multer';
import supabase, {
  ensureDay, getDayFull, getRecentDays,
  saveAIAnalysis, getLastAnalysis, getWeekMuscleVolume
} from './db.js';
import { parseFitFile, getActivityDate, getActivityHour } from './fitParser.js';

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// ─── CORS ─────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.json({ limit: '20mb' }));

// Middleware: extrai userId do header (app gera e persiste localmente)
const requireUserId = (req, res, next) => {
  req.userId = req.headers['x-user-id'];
  if (!req.userId) return res.status(401).json({ error: 'x-user-id header obrigatório.' });
  next();
};

// ─── HEALTH CHECK ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    app: 'HealthLog v2',
    version: '2.0.0',
    anthropic_key: process.env.ANTHROPIC_API_KEY ? '✓' : '✗ ausente',
    supabase: process.env.SUPABASE_URL ? '✓' : '✗ ausente',
  });
});

// ─── LOGIN POR CÓDIGO ─────────────────────────────────────────────
// POST /api/login — recebe {code} e retorna {user_id, name}
app.post('/api/login', async (req, res) => {
  const code = (req.body?.code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ error: 'Código obrigatório.' });

  const { data, error } = await supabase
    .from('access_codes')
    .select('user_id, name, code')
    .eq('code', code)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(401).json({ error: 'Código inválido. Verifique e tente novamente.' });

  // Atualiza last_login
  await supabase.from('access_codes')
    .update({ last_login: new Date().toISOString() })
    .eq('code', code);

  console.log(`[login] ${data.name} (${code}) entrou`);
  res.json({ user_id: data.user_id, name: data.name, code: data.code });
});
app.post('/api/claude', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada.' });
  if (!req.body?.messages) return res.status(400).json({ error: 'Campo messages obrigatório.' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(req.body),
    });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: text });
    res.setHeader('Content-Type', 'application/json').send(text);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── OURA PROXY ───────────────────────────────────────────────────
app.get('/api/oura/:endpoint', async (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Token não fornecido.' });
  const query = new URLSearchParams(req.query).toString();
  const url = `https://api.ouraring.com/v2/usercollection/${req.params.endpoint}${query ? '?' + query : ''}`;
  try {
    const r = await fetch(url, { headers: { Authorization: token } });
    const text = await r.text();
    res.status(r.status).setHeader('Content-Type', 'application/json').send(text);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PERFIL DO USUÁRIO ────────────────────────────────────────────

// GET /api/profile
app.get('/api/profile', requireUserId, async (req, res) => {
  const { data, error } = await supabase
    .from('user_profile').select('*').eq('user_id', req.userId).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || null);
});

// POST /api/profile — cria ou atualiza
app.post('/api/profile', requireUserId, async (req, res) => {
  const { data, error } = await supabase
    .from('user_profile')
    .upsert({ ...req.body, user_id: req.userId, updated_at: new Date().toISOString() },
             { onConflict: 'user_id' })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── DIAS ─────────────────────────────────────────────────────────

// GET /api/day/:date — pasta completa do dia
app.get('/api/day/:date', requireUserId, async (req, res) => {
  try {
    const dayData = await getDayFull(req.userId, req.params.date);
    res.json(dayData);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/day/:date — atualiza dados do dia (oura sync, etc)
app.put('/api/day/:date', requireUserId, async (req, res) => {
  try {
    await ensureDay(req.userId, req.params.date);
    const { data, error } = await supabase
      .from('days')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId).eq('date', req.params.date)
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/days?limit=7 — últimos N dias
app.get('/api/days', requireUserId, async (req, res) => {
  try {
    const days = await getRecentDays(req.userId, parseInt(req.query.limit) || 7);
    res.json(days);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── TIMELINE ─────────────────────────────────────────────────────

// GET /api/timeline/:date
app.get('/api/timeline/:date', requireUserId, async (req, res) => {
  const { data, error } = await supabase
    .from('timeline_entries').select('*')
    .eq('user_id', req.userId).eq('date', req.params.date)
    .order('hour');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /api/timeline/:date — adiciona entrada
app.post('/api/timeline/:date', requireUserId, async (req, res) => {
  try {
    await ensureDay(req.userId, req.params.date);
    const { data, error } = await supabase
      .from('timeline_entries')
      .insert({ ...req.body, user_id: req.userId, date: req.params.date })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/timeline/entry/:id — edita entrada (mover hora, etc)
app.put('/api/timeline/entry/:id', requireUserId, async (req, res) => {
  const { data, error } = await supabase
    .from('timeline_entries').update(req.body)
    .eq('id', req.params.id).eq('user_id', req.userId)
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// DELETE /api/timeline/entry/:id
app.delete('/api/timeline/entry/:id', requireUserId, async (req, res) => {
  const { error } = await supabase
    .from('timeline_entries').delete()
    .eq('id', req.params.id).eq('user_id', req.userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ─── IMPORTAR GARMIN .FIT ─────────────────────────────────────────
app.post('/api/import/fit', requireUserId, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo .fit não enviado.' });

  try {
    const fitResult = await parseFitFile(req.file.buffer);
    console.log('[FIT] sport:', fitResult.sport, '| subsport:', fitResult.subsport, '| sets:', fitResult.sets?.length, '| records:', fitResult.records?.length, '| summary:', JSON.stringify(fitResult.summary));
    const date = getActivityDate(fitResult) || req.query.date || new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

    await ensureDay(req.userId, date);

    const hour = getActivityHour(fitResult);
    const durationMin = fitResult.summary.totalTimerTime
      ? Math.round(fitResult.summary.totalTimerTime / 60) : null;

    // Determina tipo de atividade
    const sport = fitResult.sport || '';
    const subSport = fitResult.subsport || '';
    let type = 'gym';
    if (sport.includes('running') || subSport.includes('running') || subSport.includes('treadmill')) type = 'run';
    else if (subSport.includes('strength')) type = 'gym';
    else if (sport.includes('swimming') || subSport.includes('swimming')) type = 'swim';
    else if (sport.includes('cycling')) type = 'cycling';

    // Monta data para a entrada da timeline
    const timelineData = {
      type,
      hour: hour || 10,
      duration_min: durationMin,
      source: 'garmin',
      label: fitResult.summary.sport || type,
      data: {
        avg_hr: fitResult.summary.avgHR,
        max_hr: fitResult.summary.maxHR,
        calories: fitResult.summary.totalCalories,
        sport,
        sub_sport: subSport,
        exercise_count: Object.keys(fitResult.exerciseSummary || {}).length,
        total_sets: fitResult.sets?.length || 0,
        total_volume_kg: fitResult.sets?.reduce((s, x) => s + (x.volume_kg || 0), 0) || 0,
        muscles: Object.entries(fitResult.muscleVolume || {}).map(([g, v]) => ({ group: g, sets: v.sets })),
      },
    };

    // Insere na timeline
    const { data: tlEntry, error: tlErr } = await supabase
      .from('timeline_entries')
      .insert({ ...timelineData, user_id: req.userId, date })
      .select().single();

    if (tlErr) throw tlErr;

    // Insere séries detalhadas (só para treino de força)
    if (fitResult.isStrength && fitResult.sets?.length) {
      const setsToInsert = fitResult.sets.map(s => ({
        ...s,
        user_id: req.userId,
        date,
        timeline_entry_id: tlEntry.id,
      }));
      await supabase.from('workout_sets').insert(setsToInsert);

      // Atualiza volume muscular semanal
      const weekStart = getWeekStart(date);
      for (const [group, vol] of Object.entries(fitResult.muscleVolume || {})) {
        const { data: existing } = await supabase
          .from('weekly_muscle_volume')
          .select('*')
          .eq('user_id', req.userId)
          .eq('week_start', weekStart)
          .eq('muscle_group', group)
          .maybeSingle();

        await supabase.from('weekly_muscle_volume').upsert({
          user_id: req.userId,
          week_start: weekStart,
          muscle_group: group,
          total_sets: (existing?.total_sets || 0) + vol.sets,
          total_reps: (existing?.total_reps || 0) + vol.reps,
          total_volume_kg: (existing?.total_volume_kg || 0) + vol.volume,
          workout_count: (existing?.workout_count || 0) + 1,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,week_start,muscle_group' });
      }
    }

    // Atualiza resumo do dia
    await supabase.from('days').update({
      garmin_imported: true,
      active_calories: fitResult.summary.totalCalories || null,
      updated_at: new Date().toISOString(),
    }).eq('user_id', req.userId).eq('date', date);

    res.json({
      ok: true,
      date,
      type,
      timeline_entry: tlEntry,
      sets_imported: fitResult.sets?.length || 0,
      exercises: fitResult.exerciseSummary,
      muscle_volume: fitResult.muscleVolume,
    });

  } catch (e) {
    console.error('[FIT parser]', e);
    res.status(500).json({ error: 'Erro ao processar .fit: ' + e.message });
  }
});

// ─── REFEIÇÕES ────────────────────────────────────────────────────

// POST /api/meal/:date
app.post('/api/meal/:date', requireUserId, async (req, res) => {
  try {
    await ensureDay(req.userId, req.params.date);
    const { data, error } = await supabase
      .from('meals')
      .insert({ ...req.body, user_id: req.userId, date: req.params.date })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });

    // Atualiza totais do dia
    const { data: meals } = await supabase
      .from('meals').select('kcal, prot_g, carb_g, fat_g')
      .eq('user_id', req.userId).eq('date', req.params.date);

    const totals = (meals || []).reduce((acc, m) => ({
      kcal: acc.kcal + (m.kcal || 0),
      prot: acc.prot + (m.prot_g || 0),
      carb: acc.carb + (m.carb_g || 0),
      fat: acc.fat + (m.fat_g || 0),
    }), { kcal: 0, prot: 0, carb: 0, fat: 0 });

    await supabase.from('days').update({
      meals_kcal_total: totals.kcal,
      meals_prot_total: totals.prot,
      meals_carb_total: totals.carb,
      meals_fat_total: totals.fat,
    }).eq('user_id', req.userId).eq('date', req.params.date);

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── ANÁLISES DE IA ───────────────────────────────────────────────

// POST /api/analysis/morning/:date — análise matinal (correlação sono ↔ dia anterior)
app.post('/api/analysis/morning/:date', requireUserId, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key não configurada.' });

  try {
    const today = req.params.date;
    const yesterday = getPrevDate(today);

    // Busca dados: sono de hoje + dia completo de ontem
    const [todayData, yesterdayData, profile] = await Promise.all([
      getDayFull(req.userId, today),
      getDayFull(req.userId, yesterday),
      supabase.from('user_profile').select('*').eq('user_id', req.userId).maybeSingle().then(r => r.data),
    ]);

    const context = {
      sono_hoje: {
        horas: todayData.day?.sleep_hours,
        score: todayData.day?.sleep_score,
        hrv: todayData.day?.hrv_avg,
        deep_min: todayData.day?.deep_sleep_min,
        rem_min: todayData.day?.rem_sleep_min,
        eficiencia: todayData.day?.sleep_efficiency,
        latencia_min: todayData.day?.sleep_latency_min,
        acordou: todayData.day?.wake_time,
        readiness: todayData.day?.readiness_score,
      },
      dia_ontem: {
        day_summary: yesterdayData.day?.day_summary,
        stress_alto_min: yesterdayData.day?.stress_high_min,
        recuperacao_min: yesterdayData.day?.recovery_high_min,
        timeline: yesterdayData.timeline.map(e => ({ tipo: e.type, hora: e.hour, dados: e.data })),
        refeicoes: yesterdayData.meals.map(m => ({ tipo: m.meal_type, kcal: m.kcal, hora: m.hour })),
        treino: yesterdayData.workouts.length > 0 ? {
          exercicios: [...new Set(yesterdayData.workouts.map(w => w.exercise_name))],
          grupos_musculares: [...new Set(yesterdayData.workouts.map(w => w.exercise_category))],
          total_series: yesterdayData.workouts.length,
          volume_total_kg: yesterdayData.workouts.reduce((s, w) => s + (w.volume_kg || 0), 0),
        } : null,
      },
      identidade: profile?.identity_statement,
      objetivo: profile?.primary_goal,
    };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: `Você é especialista em medicina do sono, cronobiologia e otimização de performance.
Analise os dados de sono de hoje em correlação com o dia de ontem.
Seja específico, cite valores reais, e dê recomendações acionáveis.
A pessoa se identifica como: "${profile?.identity_statement || 'atleta de saúde'}".
Retorne APENAS JSON válido:
{
  "resumo": "2-3 frases sobre o sono de hoje",
  "qualidade": "excelente|boa|regular|ruim",
  "correlacoes": [{"tag":"nome","impacto":"positivo|negativo|neutro","explicacao":"uma frase"}],
  "insight_principal": "observação mais importante",
  "recomendacao": "1 mudança concreta para testar hoje",
  "score_projetado": 0
}`,
        messages: [{ role: 'user', content: `Analise:\n${JSON.stringify(context, null, 2)}` }],
      }),
    });

    const text = await r.text();
    const aiData = JSON.parse(text);
    const result = JSON.parse(aiData.content[0].text.replace(/```json|```/g, '').trim());

    await saveAIAnalysis(req.userId, today, 'morning_sleep', context, result);
    res.json(result);

  } catch (e) {
    console.error('[morning analysis]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/analysis/day/:date — análise do dia + planejamento do próximo
app.post('/api/analysis/day/:date', requireUserId, async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key não configurada.' });

  try {
    const date = req.params.date;
    const [dayData, recentDays, profile] = await Promise.all([
      getDayFull(req.userId, date),
      getRecentDays(req.userId, 7),
      supabase.from('user_profile').select('*').eq('user_id', req.userId).maybeSingle().then(r => r.data),
    ]);

    const context = {
      data: date,
      day_summary: dayData.day?.day_summary,
      timeline: dayData.timeline,
      refeicoes: dayData.meals,
      sono: { horas: dayData.day?.sleep_hours, hrv: dayData.day?.hrv_avg },
      habitos_ruins: profile?.bad_habits || [],
      habitos_bons: profile?.good_habits || [],
      identidade: profile?.identity_statement,
      objetivo: profile?.primary_goal,
      ultimos_7_dias: recentDays.map(d => ({
        data: d.date, sono: d.sleep_hours, hrv: d.hrv_avg,
        readiness: d.readiness_score, day_summary: d.day_summary,
      })),
    };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: `Especialista em medicina de estilo de vida e Hábitos Atômicos de James Clear.
Analise o dia e crie um plano para o dia seguinte com habit stacking.
Identidade da pessoa: "${profile?.identity_statement}". Objetivo: "${profile?.primary_goal}".
Hábitos a remover: ${JSON.stringify(profile?.habits_to_remove || [])}.
Hábitos a construir: ${JSON.stringify(profile?.habits_to_add || [])}.
Retorne APENAS JSON válido:
{
  "resumo_dia": "2-3 frases",
  "correlacoes": [{"tag":"","impacto":"positivo|negativo|neutro","explicacao":""}],
  "plano_amanha": {
    "habit_stacks": [{"depois_de":"","fazer":"","onde":"","quando":"","como":""}],
    "substituicoes": [{"remover":"","substituir_por":"","razao":""}],
    "foco_do_dia": ""
  },
  "xp_ganho": 0,
  "mensagem_identidade": ""
}`,
        messages: [{ role: 'user', content: JSON.stringify(context, null, 2) }],
      }),
    });

    const text = await r.text();
    const aiData = JSON.parse(text);
    const result = JSON.parse(aiData.content[0].text.replace(/```json|```/g, '').trim());

    // Salva plano do dia seguinte
    const nextDate = getNextDate(date);
    await supabase.from('day_plans').upsert({
      user_id: req.userId,
      plan_date: nextDate,
      habit_stacks: result.plano_amanha?.habit_stacks || [],
      ai_suggestions: result.plano_amanha?.substituicoes || [],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,plan_date' }).catch(() => {});

    await saveAIAnalysis(req.userId, date, 'day_summary', context, result);

    // XP gamificação
    if (result.xp_ganho) {
      await supabase.from('user_profile')
        .update({ xp_total: supabase.sql`xp_total + ${result.xp_ganho}` })
        .eq('user_id', req.userId).catch(() => {});
    }

    res.json(result);
  } catch (e) {
    console.error('[day analysis]', e);
    res.status(500).json({ error: e.message });
  }
});

// ─── VOLUME MUSCULAR SEMANAL ──────────────────────────────────────
app.get('/api/muscle-volume/:weekStart', requireUserId, async (req, res) => {
  try {
    const data = await getWeekMuscleVolume(req.userId, req.params.weekStart);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PLANO DO DIA ─────────────────────────────────────────────────
app.get('/api/plan/:date', requireUserId, async (req, res) => {
  const { data } = await supabase
    .from('day_plans').select('*')
    .eq('user_id', req.userId).eq('plan_date', req.params.date)
    .maybeSingle();
  res.json(data || null);
});

// ─── HISTÓRICO DE ANÁLISES ────────────────────────────────────────
app.get('/api/analyses', requireUserId, async (req, res) => {
  const { data } = await supabase
    .from('ai_analyses').select('id, date, type, summary, main_insight, recommendation, created_at')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false })
    .limit(parseInt(req.query.limit) || 30);
  res.json(data || []);
});

// ─── HELPERS ──────────────────────────────────────────────────────
function getWeekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day); // segunda-feira
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function getPrevDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

function getNextDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// ─── START ────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`HealthLog v2 Backend rodando na porta ${PORT}`);
  console.log(`Supabase: ${process.env.SUPABASE_URL ? '✓' : '✗'}`);
  console.log(`Claude: ${process.env.ANTHROPIC_API_KEY ? '✓' : '✗'}`);
});
