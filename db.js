// db.js — Cliente Supabase (CommonJS)
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function ensureDay(userId, date) {
  const { error } = await supabase
    .from('days')
    .upsert({ user_id: userId, date }, { onConflict: 'user_id,date', ignoreDuplicates: true });
  if (error && error.code !== '23505') throw error;
  return date;
}

async function getDayFull(userId, date) {
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

async function getRecentDays(userId, days = 7) {
  const { data } = await supabase
    .from('days').select('*').eq('user_id', userId)
    .order('date', { ascending: false }).limit(days);
  return data || [];
}

async function getWeekMuscleVolume(userId, weekStart) {
  const { data } = await supabase
    .from('weekly_muscle_volume').select('*')
    .eq('user_id', userId).eq('week_start', weekStart);
  return data || [];
}

async function saveAIAnalysis(userId, date, type, contextData, result) {
  const { data } = await supabase
    .from('ai_analyses')
    .insert({
      user_id: userId, date, type,
      context_data: contextData, result,
      summary: result.resumo || result.summary,
      main_insight: result.insight_principal || result.main_insight,
      recommendation: result.recomendacao || result.recommendation,
      correlations: result.correlacoes || result.correlations,
    })
    .select().maybeSingle();
  return data;
}

async function getLastAnalysis(userId, date, type) {
  const { data } = await supabase
    .from('ai_analyses').select('*')
    .eq('user_id', userId).eq('date', date).eq('type', type)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}

module.exports = { supabase, ensureDay, getDayFull, getRecentDays, getWeekMuscleVolume, saveAIAnalysis, getLastAnalysis };
