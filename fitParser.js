// fitParser.js — Parser de arquivos .fit do Garmin
// Extrai exercícios, séries, pesos e grupos musculares

import FitParser from 'fit-file-parser';

// Mapeamento de exercise_category + exercise_name → músculos
// Baseado no FIT SDK da Garmin
const MUSCLE_MAP = {
  // PEITO
  bench_press:                { primary: ['pectoralis_major'], secondary: ['anterior_deltoid','triceps'], group: 'chest' },
  incline_bench_press:        { primary: ['pectoralis_major_upper'], secondary: ['anterior_deltoid','triceps'], group: 'chest' },
  decline_bench_press:        { primary: ['pectoralis_major_lower'], secondary: ['triceps'], group: 'chest' },
  chest_fly:                  { primary: ['pectoralis_major'], secondary: ['anterior_deltoid'], group: 'chest' },
  cable_crossover:            { primary: ['pectoralis_major'], secondary: ['anterior_deltoid'], group: 'chest' },
  push_up:                    { primary: ['pectoralis_major'], secondary: ['triceps','anterior_deltoid'], group: 'chest' },
  dip:                        { primary: ['pectoralis_major_lower','triceps'], secondary: ['anterior_deltoid'], group: 'chest' },

  // COSTAS
  pull_up:                    { primary: ['latissimus_dorsi'], secondary: ['biceps','rhomboids'], group: 'back' },
  lat_pulldown:               { primary: ['latissimus_dorsi'], secondary: ['biceps'], group: 'back' },
  seated_row:                 { primary: ['rhomboids','mid_trapezius'], secondary: ['biceps','latissimus_dorsi'], group: 'back' },
  bent_over_row:              { primary: ['latissimus_dorsi','rhomboids'], secondary: ['biceps','erector_spinae'], group: 'back' },
  deadlift:                   { primary: ['erector_spinae','gluteus_maximus','hamstrings'], secondary: ['trapezius','latissimus_dorsi'], group: 'back' },
  back_extension:             { primary: ['erector_spinae'], secondary: ['gluteus_maximus'], group: 'back' },
  face_pull:                  { primary: ['posterior_deltoid','rhomboids'], secondary: ['external_rotators'], group: 'back' },

  // PERNAS
  squat:                      { primary: ['quadriceps','gluteus_maximus'], secondary: ['hamstrings','erector_spinae'], group: 'legs' },
  leg_press:                  { primary: ['quadriceps','gluteus_maximus'], secondary: ['hamstrings'], group: 'legs' },
  lunge:                      { primary: ['quadriceps','gluteus_maximus'], secondary: ['hamstrings','hip_flexors'], group: 'legs' },
  leg_extension:              { primary: ['quadriceps'], secondary: [], group: 'legs' },
  leg_curl:                   { primary: ['hamstrings'], secondary: [], group: 'legs' },
  romanian_deadlift:          { primary: ['hamstrings','gluteus_maximus'], secondary: ['erector_spinae'], group: 'legs' },
  hip_thrust:                 { primary: ['gluteus_maximus'], secondary: ['hamstrings','quadriceps'], group: 'glutes' },
  calf_raise:                 { primary: ['gastrocnemius','soleus'], secondary: [], group: 'legs' },

  // OMBROS
  overhead_press:             { primary: ['deltoid_medial','anterior_deltoid'], secondary: ['triceps','upper_trapezius'], group: 'shoulders' },
  lateral_raise:              { primary: ['deltoid_medial'], secondary: [], group: 'shoulders' },
  front_raise:                { primary: ['anterior_deltoid'], secondary: ['upper_trapezius'], group: 'shoulders' },
  rear_delt_fly:              { primary: ['posterior_deltoid'], secondary: ['rhomboids'], group: 'shoulders' },
  upright_row:                { primary: ['deltoid_medial','upper_trapezius'], secondary: ['biceps'], group: 'shoulders' },
  shrug:                      { primary: ['upper_trapezius'], secondary: [], group: 'shoulders' },

  // BRAÇOS — BÍCEPS
  bicep_curl:                 { primary: ['biceps_brachii'], secondary: ['brachialis'], group: 'arms' },
  hammer_curl:                { primary: ['brachialis','biceps_brachii'], secondary: [], group: 'arms' },
  preacher_curl:              { primary: ['biceps_brachii'], secondary: [], group: 'arms' },
  concentration_curl:         { primary: ['biceps_brachii'], secondary: [], group: 'arms' },

  // BRAÇOS — TRÍCEPS
  tricep_extension:           { primary: ['triceps_brachii'], secondary: [], group: 'arms' },
  tricep_pushdown:            { primary: ['triceps_brachii'], secondary: [], group: 'arms' },
  skull_crusher:              { primary: ['triceps_brachii'], secondary: [], group: 'arms' },
  close_grip_bench:           { primary: ['triceps_brachii'], secondary: ['pectoralis_major'], group: 'arms' },

  // CORE
  crunch:                     { primary: ['rectus_abdominis'], secondary: [], group: 'core' },
  plank:                      { primary: ['transverse_abdominis','rectus_abdominis'], secondary: ['erector_spinae'], group: 'core' },
  russian_twist:              { primary: ['obliques'], secondary: ['rectus_abdominis'], group: 'core' },
  leg_raise:                  { primary: ['rectus_abdominis','hip_flexors'], secondary: [], group: 'core' },
  ab_wheel:                   { primary: ['rectus_abdominis','transverse_abdominis'], secondary: ['latissimus_dorsi'], group: 'core' },
  cable_crunch:               { primary: ['rectus_abdominis'], secondary: ['obliques'], group: 'core' },
};

// Normaliza nome do exercício para lookup no mapa
function normalizeExerciseName(raw) {
  if (!raw) return 'unknown';
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

// Procura músculos pelo nome do exercício — fallback por palavras-chave
function getMuscles(exerciseName, category) {
  const key = normalizeExerciseName(exerciseName);

  // Busca exata
  if (MUSCLE_MAP[key]) return MUSCLE_MAP[key];

  // Busca parcial
  for (const [mapKey, data] of Object.entries(MUSCLE_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return data;
  }

  // Fallback por categoria do Garmin
  const categoryFallbacks = {
    bench_press: MUSCLE_MAP.bench_press,
    squat: MUSCLE_MAP.squat,
    deadlift: MUSCLE_MAP.deadlift,
    lunge: MUSCLE_MAP.lunge,
    row: MUSCLE_MAP.bent_over_row,
    pull: MUSCLE_MAP.pull_up,
    press: MUSCLE_MAP.overhead_press,
    curl: MUSCLE_MAP.bicep_curl,
    extension: MUSCLE_MAP.tricep_extension,
    fly: MUSCLE_MAP.chest_fly,
    raise: MUSCLE_MAP.lateral_raise,
    plank: MUSCLE_MAP.plank,
    crunch: MUSCLE_MAP.crunch,
  };

  for (const [kw, data] of Object.entries(categoryFallbacks)) {
    if (key.includes(kw)) return data;
  }

  return { primary: [], secondary: [], group: 'other' };
}

// Parser principal do .fit
export function parseFitFile(buffer) {
  return new Promise((resolve, reject) => {
    const parser = new FitParser({
      force: true,
      speedUnit: 'km/h',
      lengthUnit: 'km',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'both',
    });

    parser.parse(buffer, (error, data) => {
      if (error) return reject(error);

      const result = {
        activity: null,
        sport: null,
        isStrength: false,
        summary: {},
        sets: [],
        laps: [],
        records: [],
      };

      // Atividade principal
      if (data.activity?.length) {
        result.activity = data.activity[0];
      }

      // Sport/subsport
      if (data.sport?.length) {
        const sport = data.sport[0];
        result.sport = sport.sport;
        result.subsport = sport.sub_sport;
        result.isStrength = sport.sub_sport === 'strength_training' ||
                            sport.sport === 'training';
      }

      // Sessão resumo
      if (data.session?.length) {
        const s = data.session[0];
        result.summary = {
          startTime: s.start_time,
          totalElapsedTime: s.total_elapsed_time,
          totalTimerTime: s.total_timer_time,
          avgHR: s.avg_heart_rate,
          maxHR: s.max_heart_rate,
          totalCalories: s.total_calories,
          sport: s.sport,
          subSport: s.sub_sport,
          // Força
          totalSets: s.num_active_lengths || null,
        };
      }

      // ── SÉRIES DE FORÇA ──────────────────────────────────────────
      if (data.set?.length) {
        let setNumber = 0;
        result.sets = data.set
          .filter(s => s.set_type === 'active' || s.set_type === 0)
          .map(s => {
            setNumber++;
            const exerciseRaw = s.exercise_name || s.category_subtype || '';
            const category = s.category || s.exercise_category || '';
            const muscles = getMuscles(exerciseRaw, category);

            const reps = s.repetitions || 0;
            const weight = s.weight ? s.weight / 1000 : 0; // Garmin usa gramas
            const volume = reps * weight;

            return {
              set_number: setNumber,
              set_type: s.set_type === 0 ? 'active' : (s.set_type || 'active'),
              exercise_name: exerciseRaw || category || `Exercício ${setNumber}`,
              exercise_category: category,
              muscles_primary: muscles.primary,
              muscles_secondary: muscles.secondary,
              muscle_group: muscles.group,
              reps,
              weight_kg: weight,
              volume_kg: volume,
              duration_sec: s.duration ? Math.round(s.duration / 1000) : null,
              avg_hr: s.avg_heart_rate || null,
            };
          });

        // Agregar por exercício para o summary
        const byExercise = {};
        result.sets.forEach(s => {
          const k = s.exercise_name;
          if (!byExercise[k]) byExercise[k] = { sets: 0, reps: 0, volume: 0, muscles: s.muscles_primary, group: s.muscle_group };
          byExercise[k].sets++;
          byExercise[k].reps += s.reps;
          byExercise[k].volume += s.volume_kg;
        });
        result.exerciseSummary = byExercise;

        // Volume por grupo muscular
        const muscleVolume = {};
        result.sets.forEach(s => {
          const g = s.muscle_group || 'other';
          if (!muscleVolume[g]) muscleVolume[g] = { sets: 0, reps: 0, volume: 0 };
          muscleVolume[g].sets++;
          muscleVolume[g].reps += s.reps;
          muscleVolume[g].volume += s.volume_kg;
        });
        result.muscleVolume = muscleVolume;
      }

      // Records (para corrida, FC ao longo do tempo, etc.)
      if (data.record?.length) {
        result.records = data.record.map(r => ({
          timestamp: r.timestamp,
          hr: r.heart_rate,
          speed: r.speed,
          distance: r.distance,
          altitude: r.altitude,
          lat: r.position_lat,
          lng: r.position_long,
        }));
      }

      resolve(result);
    });
  });
}

// Detecta data da atividade do .fit
export function getActivityDate(fitResult) {
  const ts = fitResult.summary?.startTime || fitResult.activity?.timestamp;
  if (!ts) return null;
  const d = new Date(ts);
  // Local date em São Paulo
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

// Detecta horário de início (para posicionar na timeline)
export function getActivityHour(fitResult) {
  const ts = fitResult.summary?.startTime || fitResult.activity?.timestamp;
  if (!ts) return null;
  const d = new Date(ts);
  const parts = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).split(':');
  return parseFloat(parts[0]) + parseFloat(parts[1]) / 60;
}
