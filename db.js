// db.js — Cliente Supabase
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // service role key (bypass RLS)
);

// ─── HELPERS ──────────────────────────────────────────────────────

// Garante que o "dia" existe antes de inserir dados nele
export async function ensureDay(userId, date) {
  const { data, error } = await supabase
    .from('days')
    .upsert({ user_id: userId, date }, { onConflict: 'user_id,date', ignoreDuplicates: true })
    .select('id')
    .single();
  if (error && error.code !== '23505') throw error; // ignora conflict
  return date;
}

// Busca um dia completo com todas as entradas da timeline
export async function getDayFull(userId, date) {
  const [dayRes, timelineRes, mealsRes, workoutsRes, planRes] = await Promise.all([
    supabase.from('days').select('*').eq('user_id', userId).eq('date', date).maybeSingle(),
    supabase.from('timeline_entries').select('*').eq('user_id', userId).eq('date', date).order('hour'),
    supabase.from('meals').select('*').eq('user_id', userId).eq('date', date).order('hour'),
    supabase.from('workout_sets').select('*').eq('user_id', userId).eq('date', date).order('set_number'),
    supabase.from('day_plans').select('*').eq('user_id', userId).eq('plan_date', date).maybeSingle(),
  ]);

  return {
    day: dayRes.data,
    timeline: timelineRes.data || [],
    meals: mealsRes.data || [],
    workouts: workoutsRes.data || [],
    plan: planRes.data,
  };
}

// Busca os últimos N dias (para análises e panorama)
export async function getRecentDays(userId, days = 7) {
  const { data } = await supabase
    .from('days')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(days);
  return data || [];
}

// Volume muscular da semana atual
export async function getWeekMuscleVolume(userId, weekStart) {
  const { data } = await supabase
    .from('weekly_muscle_volume')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart);
  return data || [];
}

// Atualiza volume muscular semanal (upsert)
export async function upsertMuscleVolume(userId, weekStart, muscleGroup, sets, reps, volumeKg) {
  await supabase
    .from('weekly_muscle_volume')
    .upsert({
      user_id: userId,
      week_start: weekStart,
      muscle_group: muscleGroup,
      total_sets: sets,
      total_reps: reps,
      total_volume_kg: volumeKg,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,week_start,muscle_group',
      // incrementar em vez de substituir
    });
}

// Salva análise de IA
export async function saveAIAnalysis(userId, date, type, contextData, result) {
  const { data, error } = await supabase
    .from('ai_analyses')
    .insert({
      user_id: userId,
      date,
      type,
      context_data: contextData,
      result,
      summary: result.resumo || result.summary,
      main_insight: result.insight_principal || result.main_insight,
      recommendation: result.recomendacao || result.recommendation,
      correlations: result.correlacoes || result.correlations,
    })
    .select()
    .single();
  return data;
}

// Busca última análise de um tipo para um dia
export async function getLastAnalysis(userId, date, type) {
  const { data } = await supabase
    .from('ai_analyses')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export default supabase;
