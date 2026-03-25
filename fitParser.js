// fitParser.js — Parser de arquivos .fit do Garmin (CommonJS)
const FitParser = require('fit-file-parser');
const Parser = FitParser.default || FitParser;

const MUSCLE_MAP = {
  bench_press:        { primary: ['pectoralis_major'], secondary: ['anterior_deltoid','triceps'], group: 'chest' },
  incline_bench_press:{ primary: ['pectoralis_major_upper'], secondary: ['anterior_deltoid','triceps'], group: 'chest' },
  chest_fly:          { primary: ['pectoralis_major'], secondary: ['anterior_deltoid'], group: 'chest' },
  push_up:            { primary: ['pectoralis_major'], secondary: ['triceps','anterior_deltoid'], group: 'chest' },
  dip:                { primary: ['pectoralis_major_lower','triceps'], secondary: ['anterior_deltoid'], group: 'chest' },
  pull_up:            { primary: ['latissimus_dorsi'], secondary: ['biceps','rhomboids'], group: 'back' },
  lat_pulldown:       { primary: ['latissimus_dorsi'], secondary: ['biceps'], group: 'back' },
  seated_row:         { primary: ['rhomboids','mid_trapezius'], secondary: ['biceps'], group: 'back' },
  bent_over_row:      { primary: ['latissimus_dorsi','rhomboids'], secondary: ['biceps'], group: 'back' },
  deadlift:           { primary: ['erector_spinae','gluteus_maximus','hamstrings'], secondary: ['trapezius'], group: 'back' },
  face_pull:          { primary: ['posterior_deltoid','rhomboids'], secondary: [], group: 'back' },
  squat:              { primary: ['quadriceps','gluteus_maximus'], secondary: ['hamstrings'], group: 'legs' },
  leg_press:          { primary: ['quadriceps','gluteus_maximus'], secondary: ['hamstrings'], group: 'legs' },
  lunge:              { primary: ['quadriceps','gluteus_maximus'], secondary: ['hamstrings'], group: 'legs' },
  leg_extension:      { primary: ['quadriceps'], secondary: [], group: 'legs' },
  leg_curl:           { primary: ['hamstrings'], secondary: [], group: 'legs' },
  romanian_deadlift:  { primary: ['hamstrings','gluteus_maximus'], secondary: ['erector_spinae'], group: 'legs' },
  hip_thrust:         { primary: ['gluteus_maximus'], secondary: ['hamstrings'], group: 'glutes' },
  calf_raise:         { primary: ['gastrocnemius','soleus'], secondary: [], group: 'legs' },
  overhead_press:     { primary: ['deltoid_medial','anterior_deltoid'], secondary: ['triceps'], group: 'shoulders' },
  lateral_raise:      { primary: ['deltoid_medial'], secondary: [], group: 'shoulders' },
  front_raise:        { primary: ['anterior_deltoid'], secondary: [], group: 'shoulders' },
  rear_delt_fly:      { primary: ['posterior_deltoid'], secondary: ['rhomboids'], group: 'shoulders' },
  shrug:              { primary: ['upper_trapezius'], secondary: [], group: 'shoulders' },
  bicep_curl:         { primary: ['biceps_brachii'], secondary: ['brachialis'], group: 'arms' },
  hammer_curl:        { primary: ['brachialis','biceps_brachii'], secondary: [], group: 'arms' },
  tricep_extension:   { primary: ['triceps_brachii'], secondary: [], group: 'arms' },
  tricep_pushdown:    { primary: ['triceps_brachii'], secondary: [], group: 'arms' },
  skull_crusher:      { primary: ['triceps_brachii'], secondary: [], group: 'arms' },
  crunch:             { primary: ['rectus_abdominis'], secondary: [], group: 'core' },
  plank:              { primary: ['transverse_abdominis','rectus_abdominis'], secondary: [], group: 'core' },
  russian_twist:      { primary: ['obliques'], secondary: ['rectus_abdominis'], group: 'core' },
  leg_raise:          { primary: ['rectus_abdominis','hip_flexors'], secondary: [], group: 'core' },
};

function normalizeExerciseName(raw) {
  if (!raw) return 'unknown';
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function getMuscles(exerciseName) {
  const key = normalizeExerciseName(exerciseName);
  if (MUSCLE_MAP[key]) return MUSCLE_MAP[key];
  for (const [mapKey, data] of Object.entries(MUSCLE_MAP)) {
    if (key.includes(mapKey) || mapKey.includes(key)) return data;
  }
  const kws = { bench: MUSCLE_MAP.bench_press, squat: MUSCLE_MAP.squat, deadlift: MUSCLE_MAP.deadlift,
    row: MUSCLE_MAP.bent_over_row, pull: MUSCLE_MAP.pull_up, press: MUSCLE_MAP.overhead_press,
    curl: MUSCLE_MAP.bicep_curl, extension: MUSCLE_MAP.tricep_extension, fly: MUSCLE_MAP.chest_fly,
    raise: MUSCLE_MAP.lateral_raise, plank: MUSCLE_MAP.plank, crunch: MUSCLE_MAP.crunch };
  for (const [kw, data] of Object.entries(kws)) {
    if (key.includes(kw)) return data;
  }
  return { primary: [], secondary: [], group: 'other' };
}

function parseFitFile(buffer) {
  return new Promise((resolve, reject) => {
    const parser = new Parser({
      force: true, speedUnit: 'km/h', lengthUnit: 'km',
      temperatureUnit: 'celsius', elapsedRecordField: true, mode: 'both',
    });
    parser.parse(buffer, (error, data) => {
      if (error) return reject(error);
      const result = { activity: null, sport: null, isStrength: false, summary: {}, sets: [], records: [], exerciseSummary: {}, muscleVolume: {} };

      if (data.activity?.length) result.activity = data.activity[0];
      if (data.sport?.length) {
        result.sport = data.sport[0].sport;
        result.subsport = data.sport[0].sub_sport;
        result.isStrength = result.subsport === 'strength_training' || result.sport === 'training';
      }
      if (data.session?.length) {
        const s = data.session[0];
        result.summary = {
          startTime: s.start_time, totalElapsedTime: s.total_elapsed_time,
          totalTimerTime: s.total_timer_time, avgHR: s.avg_heart_rate,
          maxHR: s.max_heart_rate, totalCalories: s.total_calories,
          sport: s.sport, subSport: s.sub_sport,
        };
      }
      if (data.set?.length) {
        let setNumber = 0;
        result.sets = data.set.filter(s => s.set_type === 'active' || s.set_type === 0).map(s => {
          setNumber++;
          const exerciseRaw = s.exercise_name || s.category_subtype || '';
          const muscles = getMuscles(exerciseRaw || s.category || '');
          const reps = s.repetitions || 0;
          const weight = s.weight ? s.weight / 1000 : 0;
          return {
            set_number: setNumber, set_type: 'active',
            exercise_name: exerciseRaw || s.category || `Exercício ${setNumber}`,
            exercise_category: s.category || '',
            muscles_primary: muscles.primary, muscles_secondary: muscles.secondary,
            muscle_group: muscles.group, reps, weight_kg: weight,
            volume_kg: reps * weight, duration_sec: s.duration ? Math.round(s.duration / 1000) : null,
            avg_hr: s.avg_heart_rate || null,
          };
        });
        const byEx = {};
        result.sets.forEach(s => {
          if (!byEx[s.exercise_name]) byEx[s.exercise_name] = { sets: 0, reps: 0, volume: 0, group: s.muscle_group };
          byEx[s.exercise_name].sets++; byEx[s.exercise_name].reps += s.reps; byEx[s.exercise_name].volume += s.volume_kg;
        });
        result.exerciseSummary = byEx;
        const mv = {};
        result.sets.forEach(s => {
          const g = s.muscle_group || 'other';
          if (!mv[g]) mv[g] = { sets: 0, reps: 0, volume: 0 };
          mv[g].sets++; mv[g].reps += s.reps; mv[g].volume += s.volume_kg;
        });
        result.muscleVolume = mv;
      }
      if (data.record?.length) {
        result.records = data.record.map(r => ({ timestamp: r.timestamp, hr: r.heart_rate, speed: r.speed, distance: r.distance }));
      }
      resolve(result);
    });
  });
}

function getActivityDate(fitResult) {
  const ts = fitResult.summary?.startTime || fitResult.activity?.timestamp ||
    fitResult.activity?.local_timestamp || fitResult.records?.[0]?.timestamp || null;
  if (ts) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  }
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

function getActivityHour(fitResult) {
  const ts = fitResult.summary?.startTime || fitResult.activity?.timestamp || fitResult.records?.[0]?.timestamp || null;
  if (!ts) return 10;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return 10;
  const parts = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).split(':');
  return parseFloat(parts[0]) + parseFloat(parts[1]) / 60;
}

module.exports = { parseFitFile, getActivityDate, getActivityHour };
