// strava.js — Integração com a API do Strava v3 (CommonJS)

const STRAVA_API = 'https://www.strava.com/api/v3';
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

// Mapeamento sport_type do Strava → tipo do chip na timeline
const SPORT_TYPE_MAP = {
  Run:             { type: 'run',      icon: '🏃', label: 'Corrida' },
  TrailRun:        { type: 'run',      icon: '🏃', label: 'Trail Run' },
  VirtualRun:      { type: 'run',      icon: '🏃', label: 'Corrida Virtual' },
  Ride:            { type: 'cycling',  icon: '🚴', label: 'Ciclismo' },
  VirtualRide:     { type: 'cycling',  icon: '🚴', label: 'Ciclismo Virtual' },
  Swim:            { type: 'swim',     icon: '🏊', label: 'Natação' },
  WeightTraining:  { type: 'gym',      icon: '💪', label: 'Treino de Força' },
  Workout:         { type: 'gym',      icon: '💪', label: 'Treino' },
  Crossfit:        { type: 'gym',      icon: '💪', label: 'CrossFit' },
  Yoga:            { type: 'meditate', icon: '🧘', label: 'Yoga' },
  Hike:            { type: 'run',      icon: '🥾', label: 'Caminhada' },
  Walk:            { type: 'run',      icon: '🚶', label: 'Caminhada' },
  Rowing:          { type: 'swim',     icon: '🚣', label: 'Remo' },
  StairStepper:    { type: 'gym',      icon: '🏃', label: 'Escada' },
  Elliptical:      { type: 'gym',      icon: '💪', label: 'Elíptico' },
};

// ─── TOKEN MANAGEMENT ─────────────────────────────────────────────

// Troca authorization_code por access_token + refresh_token
async function exchangeCode(clientId, clientSecret, code) {
  const r = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Erro ao trocar código Strava');
  return data; // { access_token, refresh_token, expires_at, athlete }
}

// Renova access_token usando refresh_token
async function refreshToken(clientId, clientSecret, refreshToken) {
  const r = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Erro ao renovar token Strava');
  return data; // { access_token, refresh_token, expires_at }
}

// Garante que o token está válido (renova se expirado)
async function getValidToken(stravaCredentials, supabase, userId) {
  const { access_token, refresh_token, expires_at } = stravaCredentials;
  const now = Math.floor(Date.now() / 1000);

  // Token ainda válido (com 5 min de margem)
  if (expires_at > now + 300) return access_token;

  // Renova
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const newTokens = await refreshToken(clientId, clientSecret, refresh_token);

  // Salva tokens renovados no perfil
  await supabase.from('user_profile').update({
    strava_access_token: newTokens.access_token,
    strava_refresh_token: newTokens.refresh_token,
    strava_expires_at: newTokens.expires_at,
  }).eq('user_id', userId);

  return newTokens.access_token;
}

// ─── ATIVIDADES ────────────────────────────────────────────────────

// Busca atividades do Strava para uma data específica
async function getActivitiesForDate(accessToken, dateStr) {
  // Converte data local para timestamps Unix (início e fim do dia em São Paulo UTC-3)
  const startOfDay = new Date(dateStr + 'T00:00:00-03:00');
  const endOfDay = new Date(dateStr + 'T23:59:59-03:00');
  const after = Math.floor(startOfDay.getTime() / 1000);
  const before = Math.floor(endOfDay.getTime() / 1000);

  const url = `${STRAVA_API}/athlete/activities?after=${after}&before=${before}&per_page=20`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Erro ao buscar atividades Strava');
  return data;
}

// Busca detalhes completos de uma atividade
async function getActivityDetail(accessToken, activityId) {
  const r = await fetch(`${STRAVA_API}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || 'Erro ao buscar detalhe da atividade');
  return data;
}

// Converte atividade do Strava em formato da timeline do HealthLog
function stravaActivityToTimeline(activity) {
  const sportDef = SPORT_TYPE_MAP[activity.sport_type] || SPORT_TYPE_MAP[activity.type] || {
    type: 'gym', icon: '🏃', label: activity.sport_type || 'Atividade',
  };

  // Horário de início local
  const startLocal = new Date(activity.start_date_local);
  const hour = startLocal.getHours() + startLocal.getMinutes() / 60;
  const durationMin = Math.round(activity.elapsed_time / 60);

  // Dados específicos por tipo
  const data = {
    strava_id: activity.id.toString(),
    sport_type: activity.sport_type,
    duration_min: durationMin,
    avg_hr: activity.average_heartrate || null,
    max_hr: activity.max_heartrate || null,
    calories: activity.calories || null,
    // Corrida/ciclismo
    distance_km: activity.distance ? Math.round(activity.distance / 10) / 100 : null,
    elevation_m: activity.total_elevation_gain || null,
    avg_speed_kmh: activity.average_speed ? Math.round(activity.average_speed * 3.6 * 10) / 10 : null,
    // Treino de força
    sets: activity.sets || null,
    // Nome da atividade no Strava
    strava_name: activity.name,
    // Gear (tênis/bike)
    gear_id: activity.gear_id || null,
  };

  // Pace para corrida (min/km)
  if (['run', 'Run', 'TrailRun'].includes(sportDef.type) && activity.average_speed) {
    const paceSecPerKm = 1000 / activity.average_speed;
    const paceMin = Math.floor(paceSecPerKm / 60);
    const paceSec = Math.round(paceSecPerKm % 60);
    data.pace = `${paceMin}:${String(paceSec).padStart(2, '0')}/km`;
  }

  return {
    type: sportDef.type,
    hour,
    duration_min: durationMin,
    label: activity.name || sportDef.label,
    icon: sportDef.icon,
    source: 'strava',
    data,
  };
}

// Gera URL de autorização OAuth do Strava
function getAuthUrl(clientId, redirectUri) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
  });
  return `https://www.strava.com/oauth/authorize?${params}`;
}

module.exports = {
  exchangeCode,
  refreshToken,
  getValidToken,
  getActivitiesForDate,
  getActivityDetail,
  stravaActivityToTimeline,
  getAuthUrl,
};
