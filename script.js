/**
 * FitSearch — script.js
 * Vanilla JavaScript · Chart.js 4.4.2 · Tanpa framework / backend / API key
 *
 * Bagian utama:
 *  0. Palet warna & konstanta
 *  1. Dark / light mode (localStorage + system preference)
 *  2. Validasi GYM_DATA
 *  3. Helper statistik
 *  4. State filter & fungsi filter
 *  5. Workout cards (dibuat dinamis dari data)
 *  6. Render filter controls (desktop sidebar + bottom sheet mobile)
 *  7. Bottom sheet (open/close)
 *  8. KPI cards
 *  9. Charts (upsert pattern — update tanpa buat ulang canvas)
 * 10. Insight Otomatis (berbasis aturan, bukan LLM)
 * 11. Fungsi utama renderDashboard()
 * 12. Event listeners & inisialisasi
 */

/* ============================================================
   0. PALET & KONSTANTA
   ============================================================ */

/** Fungsi helper: baca CSS variable yang ditetapkan oleh tema */
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Warna chart berdasarkan tema aktif — dipanggil ulang tiap render */
function palette() {
  const dark = document.documentElement.classList.contains('dark');
  return {
    teal:    '#0d9488',
    amber:   '#f59e0b',
    violet:  '#7c3aed',
    rose:    '#f43f5e',
    blue:    '#2563eb',
    sky:     '#0ea5e9',
    emerald: '#10b981',
    muted:   dark ? '#6ee7b7' : '#6b7280',
    grid:    dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.06)',
    tick:    dark ? '#6ee7b7' : '#6b7280',
    cardBg:  dark ? 'rgba(15,36,34,1)'     : 'rgba(255,255,255,1)',
  };
}

const WORKOUT_META = {
  Yoga:     { emoji: '🧘', color: '#10b981' },
  HIIT:     { emoji: '🔥', color: '#f43f5e' },
  Cardio:   { emoji: '🏃', color: '#0ea5e9' },
  Strength: { emoji: '💪', color: '#f59e0b' },
};

const EXP_LABELS  = { 1: 'Pemula (L1)', 2: 'Menengah (L2)', 3: 'Lanjutan (L3)' };
const BMI_CATS    = ['Underweight', 'Normal', 'Overweight', 'Obese'];

/* ============================================================
   1. DARK / LIGHT MODE
   ============================================================ */
const HTML_EL    = document.documentElement;
const BTN_THEME  = document.getElementById('btn-theme');
const THEME_ICON = document.getElementById('theme-icon');

/**
 * Terapkan tema ke <html> class dan simpan ke localStorage.
 * @param {'dark'|'light'} theme
 */
function applyTheme(theme) {
  if (theme === 'dark') {
    HTML_EL.classList.add('dark');
    THEME_ICON.textContent = '☀️';
  } else {
    HTML_EL.classList.remove('dark');
    THEME_ICON.textContent = '🌙';
  }
  localStorage.setItem('fitsearch-theme', theme);

  // Perbarui warna Chart.js global & re-render semua chart jika ada data
  const p = palette();
  Chart.defaults.color = p.muted;
  if (Object.keys(charts).length) renderDashboard();
}

/** Inisialisasi tema: localStorage → system preference */
function initTheme() {
  const saved  = localStorage.getItem('fitsearch-theme');
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || system);
}

BTN_THEME.addEventListener('click', () => {
  applyTheme(HTML_EL.classList.contains('dark') ? 'light' : 'dark');
});

/* ============================================================
   2. VALIDASI DATA
   ============================================================ */
function checkDataAvailable() {
  if (typeof GYM_DATA === 'undefined' || !Array.isArray(GYM_DATA) || GYM_DATA.length === 0) {
    document.getElementById('error-banner').classList.remove('hidden');
    return false;
  }
  return true;
}

/* ============================================================
   3. HELPER STATISTIK
   ============================================================ */
/** Rata-rata nilai sebuah field dari array data */
function avg(arr, field) {
  if (!arr.length) return 0;
  return arr.reduce((s, d) => s + (field ? d[field] : d), 0) / arr.length;
}

/** Rata-rata array angka murni */
function avgArr(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

const fmt1 = (n) => isNaN(n) ? '—' : (+n).toFixed(1);
const fmt0 = (n) => isNaN(n) ? '—' : Math.round(n).toLocaleString('id-ID');

function bmiCategory(bmi) {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25)   return 'Normal';
  if (bmi < 30)   return 'Overweight';
  return 'Obese';
}

/* ============================================================
   4. STATE FILTER
   ============================================================ */
/**
 * State terpusat — satu-satunya sumber kebenaran filter aktif.
 * Kedua set filter (desktop & mobile) membaca/menulis ke sini.
 */
const filterState = { gender: '', workout: '', exp: '', freq: '' };

/** Kembalikan subset GYM_DATA sesuai filterState */
function getFilteredData() {
  return GYM_DATA.filter(d => {
    if (filterState.gender  && d.gender              !== filterState.gender)            return false;
    if (filterState.workout && d.workout_type        !== filterState.workout)           return false;
    if (filterState.exp     && d.experience_level    !== Number(filterState.exp))       return false;
    if (filterState.freq    && d.workout_frequency_days_week !== Number(filterState.freq)) return false;
    return true;
  });
}

/* ============================================================
   5. WORKOUT CARDS — dibuat dari GYM_DATA
   ============================================================ */
function buildWorkoutCards() {
  const container = document.getElementById('workout-cards');
  if (!container) return;

  // Hitung statistik per jenis latihan dari seluruh data
  const types = Object.keys(WORKOUT_META);
  const cards = [
    // Kartu "Semua"
    {
      type: '',
      emoji: '🏋️',
      name: 'Semua',
      count: GYM_DATA.length,
      avgCal: avgArr(GYM_DATA.map(d => d.calories_burned)),
      extra: null,
      isAll: true,
    },
    ...types.map(t => {
      const sub = GYM_DATA.filter(d => d.workout_type === t);
      return {
        type: t,
        emoji: WORKOUT_META[t].emoji,
        name: t,
        count: sub.length,
        avgCal: avgArr(sub.map(d => d.calories_burned)),
        extra: null,
        isAll: false,
      };
    }),
  ];

  container.innerHTML = cards.map(c => `
    <button
      class="workout-card ${c.isAll ? 'wcard-all' : ''} ${filterState.workout === c.type && !c.isAll ? 'active' : ''} ${c.isAll && filterState.workout === '' ? 'active' : ''}"
      data-type="${c.type}"
      role="listitem"
      aria-pressed="${c.isAll ? filterState.workout === '' : filterState.workout === c.type}"
      aria-label="Filter: ${c.name}"
    >
      <span class="wcard-emoji" aria-hidden="true">${c.emoji}</span>
      <div class="wcard-name">${c.name}</div>
      <div class="wcard-meta">
        <strong>${c.count.toLocaleString('id-ID')}</strong> anggota<br/>
        <strong>${fmt0(c.avgCal)}</strong> kkal rata-rata
      </div>
    </button>
  `).join('');

  // Event listener pada setiap kartu
  container.querySelectorAll('.workout-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      filterState.workout = type;
      // Sinkronkan dengan select elements
      syncSelectsFromState();
      buildWorkoutCards();   // rebuild untuk update active state
      renderDashboard();
    });
  });
}

/* ============================================================
   6. FILTER CONTROLS — template HTML, dirender ke dua tempat
   ============================================================ */
const FILTER_DEFS = [
  {
    id: 'f-gender', key: 'gender', label: 'Gender',
    options: [
      { value: '', label: 'Semua Gender' },
      { value: 'Male', label: 'Male' },
      { value: 'Female', label: 'Female' },
    ],
  },
  {
    id: 'f-workout', key: 'workout', label: 'Jenis Latihan',
    options: [
      { value: '', label: 'Semua Jenis' },
      { value: 'Yoga', label: '🧘 Yoga' },
      { value: 'HIIT', label: '🔥 HIIT' },
      { value: 'Cardio', label: '🏃 Cardio' },
      { value: 'Strength', label: '💪 Strength' },
    ],
  },
  {
    id: 'f-exp', key: 'exp', label: 'Level Pengalaman',
    options: [
      { value: '', label: 'Semua Level' },
      { value: '1', label: 'Level 1 — Pemula' },
      { value: '2', label: 'Level 2 — Menengah' },
      { value: '3', label: 'Level 3 — Lanjutan' },
    ],
  },
  {
    id: 'f-freq', key: 'freq', label: 'Frekuensi Mingguan',
    options: [
      { value: '', label: 'Semua Frekuensi' },
      { value: '2', label: '2 hari/minggu' },
      { value: '3', label: '3 hari/minggu' },
      { value: '4', label: '4 hari/minggu' },
      { value: '5', label: '5 hari/minggu' },
    ],
  },
];

/** Bangun HTML string untuk satu filter group */
function buildFilterGroupHTML(def, suffix = '') {
  const optionsHTML = def.options.map(o =>
    `<option value="${o.value}" ${filterState[def.key] === o.value ? 'selected' : ''}>${o.label}</option>`
  ).join('');
  return `
    <div class="filter-group">
      <label class="filter-label" for="${def.id}${suffix}">${def.label}</label>
      <select class="filter-select" id="${def.id}${suffix}" data-key="${def.key}">${optionsHTML}</select>
    </div>
  `;
}

/** Render filter controls ke sebuah container dengan suffix ID */
function renderFilterControls(containerId, suffix = '') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const html = FILTER_DEFS.map(def => buildFilterGroupHTML(def, suffix)).join('');
  const resetHTML = `
    <button class="btn-reset-filter" data-role="reset">
      ↺ Reset Filter
    </button>
  `;
  container.innerHTML = html + resetHTML;

  // Pasang event listeners
  container.querySelectorAll('.filter-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      filterState[e.target.dataset.key] = e.target.value;
      syncSelectsFromState();
      buildWorkoutCards();
      renderDashboard();
    });
  });
  container.querySelector('[data-role="reset"]').addEventListener('click', () => {
    resetFilters();
  });
}

/** Sinkronkan semua <select> agar mencerminkan filterState saat ini */
function syncSelectsFromState() {
  document.querySelectorAll('.filter-select').forEach(sel => {
    const key = sel.dataset.key;
    if (key && sel.value !== filterState[key]) sel.value = filterState[key];
  });
}

function resetFilters() {
  Object.keys(filterState).forEach(k => { filterState[k] = ''; });
  syncSelectsFromState();
  buildWorkoutCards();
  renderDashboard();
  closeFilterSheet();
}

/* ============================================================
   7. BOTTOM SHEET (MOBILE FILTER)
   ============================================================ */
const filterSheet   = document.getElementById('filter-sheet');
const sheetOverlay  = document.getElementById('filter-sheet-overlay');
const btnOpenFilter = document.getElementById('btn-open-filter');
const btnCloseFilter= document.getElementById('btn-close-filter');
const btnResetSheet = document.getElementById('btn-reset-sheet');
const btnApplySheet = document.getElementById('btn-apply-sheet');

function openFilterSheet() {
  filterSheet.classList.add('open');
  sheetOverlay.classList.remove('hidden');
  sheetOverlay.removeAttribute('aria-hidden');
  btnOpenFilter.setAttribute('aria-expanded', 'true');
  // Fokus ke sheet untuk aksesibilitas keyboard
  filterSheet.focus();
  // Rebuild mobile controls agar nilai reflect state saat ini
  renderFilterControls('filter-controls-mobile', '-m');
}

function closeFilterSheet() {
  filterSheet.classList.remove('open');
  sheetOverlay.classList.add('hidden');
  sheetOverlay.setAttribute('aria-hidden', 'true');
  btnOpenFilter.setAttribute('aria-expanded', 'false');
  btnOpenFilter.focus();
}

btnOpenFilter.addEventListener('click', openFilterSheet);
btnCloseFilter.addEventListener('click', closeFilterSheet);
sheetOverlay.addEventListener('click', closeFilterSheet);
btnResetSheet.addEventListener('click', () => resetFilters());
btnApplySheet.addEventListener('click', closeFilterSheet);

// Tutup sheet dengan tombol Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && filterSheet.classList.contains('open')) closeFilterSheet();
});

/* ============================================================
   8. KPI CARDS
   ============================================================ */
function updateKPIs(data) {
  document.getElementById('kpi-total').textContent = data.length.toLocaleString('id-ID');
  document.getElementById('kpi-cal').textContent   = fmt0(avgArr(data.map(d => d.calories_burned)));
  document.getElementById('kpi-dur').textContent   = fmt1(avgArr(data.map(d => d.session_duration_hours)));
  document.getElementById('kpi-bpm').textContent   = fmt1(avgArr(data.map(d => d.avg_bpm)));
  document.getElementById('kpi-bmi').textContent   = fmt1(avgArr(data.map(d => d.bmi)));

  // Badge di navbar
  document.getElementById('member-count-badge').textContent =
    `${data.length.toLocaleString('id-ID')} anggota`;

  // Bubble di hero
  const heroCalEl = document.getElementById('hero-avg-cal');
  if (heroCalEl) heroCalEl.textContent = fmt0(avgArr(data.map(d => d.calories_burned)));
}

/* ============================================================
   9. CHARTS
   ============================================================ */
const charts = {};  // menyimpan instance Chart.js agar bisa di-update

/**
 * Buat atau perbarui chart.
 * Jika tipe berubah (mis. bar → polarArea), chart lama di-destroy dan dibuat ulang.
 */
function upsertChart(id, config) {
  if (charts[id]) {
    if (charts[id].config.type !== config.type) {
      charts[id].destroy();
      delete charts[id];
    } else {
      charts[id].data.labels   = config.data.labels;
      charts[id].data.datasets = config.data.datasets;
      charts[id].options       = config.options;
      charts[id].update('active');
      return;
    }
  }
  const ctx = document.getElementById(id);
  if (!ctx) return;
  charts[id] = new Chart(ctx.getContext('2d'), config);
}

/** Opsi responsif dasar yang selalu dipakai */
function baseOpts(p) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { font: { size: 11, family: 'Inter' }, color: p.muted } },
    },
  };
}

/* ----- 9.1 Donut: Distribusi Jenis Latihan ----- */
function updateWorkoutDist(data) {
  const p = palette();
  const counts = {};
  data.forEach(d => { counts[d.workout_type] = (counts[d.workout_type] || 0) + 1; });
  const labels = Object.keys(counts);
  upsertChart('chart-workout-dist', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data:            labels.map(l => counts[l]),
        backgroundColor: labels.map(l => WORKOUT_META[l]?.color || p.muted),
        borderWidth: 2,
        borderColor: p.cardBg,
        hoverOffset: 6,
      }],
    },
    options: {
      ...baseOpts(p),
      cutout: '60%',
      plugins: {
        ...baseOpts(p).plugins,
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} anggota` } },
      },
    },
  });
}

/* ----- 9.2 Polar Area: Rata-rata Kalori per Jenis Latihan ----- */
function updateCalWorkout(data) {
  const p      = palette();
  const types  = ['Yoga', 'HIIT', 'Cardio', 'Strength'];
  const avgCals = types.map(t => {
    const sub = data.filter(d => d.workout_type === t);
    return sub.length ? +avgArr(sub.map(d => d.calories_burned)).toFixed(1) : 0;
  });
  upsertChart('chart-cal-workout', {
    type: 'polarArea',
    data: {
      labels: types,
      datasets: [{
        data:            avgCals,
        backgroundColor: types.map(t => (WORKOUT_META[t]?.color || p.muted) + 'cc'),
        borderColor:     types.map(t => WORKOUT_META[t]?.color || p.muted),
        borderWidth:     1.5,
      }],
    },
    options: {
      ...baseOpts(p),
      scales: {
        r: {
          ticks:    { font: { size: 10 }, color: p.tick, backdropColor: 'transparent' },
          grid:     { color: p.grid },
          pointLabels: { color: p.tick },
        },
      },
      plugins: {
        ...baseOpts(p).plugins,
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.formattedValue} kkal` } },
      },
    },
  });
}

/* ----- 9.3 Bar: Rata-rata Kalori per Level Pengalaman ----- */
function updateCalExp(data) {
  const p       = palette();
  const levels  = [1, 2, 3];
  const expCols = [p.sky, p.teal, p.violet];
  const avgCals = levels.map(lv => {
    const sub = data.filter(d => d.experience_level === lv);
    return sub.length ? +avgArr(sub.map(d => d.calories_burned)).toFixed(1) : 0;
  });
  upsertChart('chart-cal-exp', {
    type: 'bar',
    data: {
      labels: levels.map(l => EXP_LABELS[l]),
      datasets: [{
        label:           'Rata-rata Kalori (kkal)',
        data:            avgCals,
        backgroundColor: expCols,
        borderRadius:    7,
        borderSkipped:   false,
      }],
    },
    options: {
      ...baseOpts(p),
      plugins: { ...baseOpts(p).plugins, legend: { display: false } },
      scales: {
        x: { ticks: { color: p.tick, font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: p.tick, font: { size: 11 } }, grid: { color: p.grid },
             title: { display: true, text: 'kkal', color: p.muted, font: { size: 10 } } },
      },
    },
  });
}

/* ----- 9.4 Scatter: Durasi vs Kalori ----- */
function updateScatter(data) {
  const p      = palette();
  const groups = {};
  data.forEach(d => {
    if (!groups[d.workout_type]) groups[d.workout_type] = [];
    groups[d.workout_type].push({ x: d.session_duration_hours, y: d.calories_burned });
  });
  const datasets = Object.entries(groups).map(([type, pts]) => ({
    label:            type,
    data:             pts,
    backgroundColor:  (WORKOUT_META[type]?.color || p.muted) + 'aa',
    pointRadius:      3.5,
    pointHoverRadius: 5.5,
  }));
  upsertChart('chart-scatter', {
    type: 'scatter',
    data: { datasets },
    options: {
      ...baseOpts(p),
      plugins: {
        ...baseOpts(p).plugins,
        tooltip: { callbacks: {
          label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.x}j → ${ctx.parsed.y} kkal`,
        }},
      },
      scales: {
        x: {
          title: { display: true, text: 'Durasi Sesi (jam)', color: p.muted, font: { size: 10 } },
          ticks: { color: p.tick, font: { size: 11 } }, grid: { color: p.grid },
        },
        y: {
          title: { display: true, text: 'Kalori Terbakar (kkal)', color: p.muted, font: { size: 10 } },
          ticks: { color: p.tick, font: { size: 11 } }, grid: { color: p.grid },
        },
      },
    },
  });
}

/* ----- 9.5 Bar horizontal: Distribusi Kategori BMI ----- */
function updateBMICat(data) {
  const p      = palette();
  const BMI_COLORS = [p.sky, p.teal, p.amber, p.rose];
  const counts = { Underweight: 0, Normal: 0, Overweight: 0, Obese: 0 };
  data.forEach(d => { counts[bmiCategory(d.bmi)]++; });
  upsertChart('chart-bmi-cat', {
    type: 'bar',
    data: {
      labels: BMI_CATS,
      datasets: [{
        label:           'Jumlah Anggota',
        data:            BMI_CATS.map(c => counts[c]),
        backgroundColor: BMI_COLORS,
        borderRadius:    6,
        borderSkipped:   false,
      }],
    },
    options: {
      ...baseOpts(p),
      indexAxis: 'y',
      plugins: { ...baseOpts(p).plugins, legend: { display: false } },
      scales: {
        x: { ticks: { color: p.tick, font: { size: 11 } }, grid: { color: p.grid } },
        y: { ticks: { color: p.tick, font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

/* ----- 9.6 Bar: Rata-rata Durasi per Frekuensi ----- */
function updateDurFreq(data) {
  const p       = palette();
  const freqs   = [2, 3, 4, 5];
  const freqCols= [p.sky, p.teal, p.violet, p.rose];
  const avgDurs = freqs.map(f => {
    const sub = data.filter(d => d.workout_frequency_days_week === f);
    return sub.length ? +avgArr(sub.map(d => d.session_duration_hours)).toFixed(2) : 0;
  });
  upsertChart('chart-dur-freq', {
    type: 'bar',
    data: {
      labels: freqs.map(f => `${f}×/minggu`),
      datasets: [{
        label:           'Rata-rata Durasi (jam)',
        data:            avgDurs,
        backgroundColor: freqCols,
        borderRadius:    7,
        borderSkipped:   false,
      }],
    },
    options: {
      ...baseOpts(p),
      plugins: { ...baseOpts(p).plugins, legend: { display: false } },
      scales: {
        x: { ticks: { color: p.tick, font: { size: 11 } }, grid: { display: false } },
        y: {
          ticks:       { color: p.tick, font: { size: 11 } },
          grid:        { color: p.grid },
          title:       { display: true, text: 'jam', color: p.muted, font: { size: 10 } },
          suggestedMin: 0,
        },
      },
    },
  });
}

/* ============================================================
   10. INSIGHT OTOMATIS (berbasis aturan, bukan LLM)
   Menulis 3 temuan & 2 rekomendasi dari data yang sudah difilter.
   Semua temuan dinyatakan sebagai korelasi, bukan sebab-akibat.
   ============================================================ */
function generateInsight(data) {
  if (!data.length) {
    renderInsightLists(
      ['Tidak ada data untuk dianalisis dengan filter ini.'],
      ['Coba reset filter untuk melihat insight dari keseluruhan data.']
    );
    return;
  }

  /* --- hitung statistik yang dibutuhkan --- */
  const avgCal  = avgArr(data.map(d => d.calories_burned));
  const avgDur  = avgArr(data.map(d => d.session_duration_hours));
  const avgBpm  = avgArr(data.map(d => d.avg_bpm));
  const avgBmi  = avgArr(data.map(d => d.bmi));
  const avgFat  = avgArr(data.map(d => d.fat_percentage));
  const n       = data.length;

  // Kalori per level pengalaman
  const calByExp = [1,2,3].map(lv => {
    const sub = data.filter(d => d.experience_level === lv);
    return { lv, avg: sub.length ? avgArr(sub.map(d => d.calories_burned)) : null, n: sub.length };
  }).filter(x => x.avg !== null);

  // Durasi per frekuensi latihan
  const durByFreq = [2,3,4,5].map(f => {
    const sub = data.filter(d => d.workout_frequency_days_week === f);
    return { f, avg: sub.length ? avgArr(sub.map(d => d.session_duration_hours)) : null, n: sub.length };
  }).filter(x => x.avg !== null);

  // Distribusi BMI
  const bmiCounts = { Underweight: 0, Normal: 0, Overweight: 0, Obese: 0 };
  data.forEach(d => { bmiCounts[bmiCategory(d.bmi)]++; });
  const dominantBmi = Object.entries(bmiCounts).sort((a,b) => b[1]-a[1])[0];

  // Kalori per jenis latihan (hanya yang ada datanya)
  const calByType = Object.keys(WORKOUT_META).map(t => {
    const sub = data.filter(d => d.workout_type === t);
    return { t, avg: sub.length ? avgArr(sub.map(d => d.calories_burned)) : null, n: sub.length };
  }).filter(x => x.avg !== null).sort((a,b) => b.avg - a.avg);

  // Gender split
  const maleData   = data.filter(d => d.gender === 'Male');
  const femaleData = data.filter(d => d.gender === 'Female');

  /* --- bangun temuan (3 temuan) --- */
  const findings = [];

  // Temuan 1: Korelasi durasi sesi vs kalori
  {
    // Korelasi sederhana: bandingkan kuartil atas & bawah durasi
    const sorted = [...data].sort((a,b) => a.session_duration_hours - b.session_duration_hours);
    const q1 = sorted.slice(0, Math.floor(n/4));
    const q4 = sorted.slice(Math.floor(3*n/4));
    const calQ1 = avgArr(q1.map(d => d.calories_burned));
    const calQ4 = avgArr(q4.map(d => d.calories_burned));
    const diff  = Math.round(calQ4 - calQ1);
    if (diff > 50) {
      findings.push(
        `Anggota dengan durasi sesi di kuartil atas (≥${fmt1(q4[0].session_duration_hours)}j) cenderung memiliki rata-rata kalori terbakar ${diff.toLocaleString('id-ID')} kkal lebih tinggi dibanding kuartil bawah — menunjukkan korelasi positif antara durasi dan kalori.`
      );
    } else {
      findings.push(
        `Rata-rata durasi sesi pada kelompok ini adalah ${fmt1(avgDur)} jam dengan rata-rata ${Math.round(avgCal).toLocaleString('id-ID')} kkal terbakar per sesi.`
      );
    }
  }

  // Temuan 2: Korelasi level pengalaman vs kalori
  if (calByExp.length >= 2) {
    const best = calByExp.reduce((a,b) => a.avg > b.avg ? a : b);
    const worst= calByExp.reduce((a,b) => a.avg < b.avg ? a : b);
    findings.push(
      `Anggota ${EXP_LABELS[best.lv]} berkorelasi dengan rata-rata kalori terbakar tertinggi (${Math.round(best.avg).toLocaleString('id-ID')} kkal), ` +
      `sedangkan ${EXP_LABELS[worst.lv]} memiliki rata-rata terendah (${Math.round(worst.avg).toLocaleString('id-ID')} kkal).`
    );
  } else {
    findings.push(
      `Rata-rata BPM anggota pada filter ini adalah ${fmt1(avgBpm)} bpm, berkorelasi dengan intensitas sesi latihan.`
    );
  }

  // Temuan 3: Dominasi kategori BMI atau perbandingan gender
  if (calByType.length >= 2) {
    findings.push(
      `Jenis latihan ${calByType[0].t} ${WORKOUT_META[calByType[0].t]?.emoji || ''} berkorelasi dengan rata-rata kalori terbakar tertinggi (${Math.round(calByType[0].avg).toLocaleString('id-ID')} kkal) dibanding ${calByType[calByType.length-1].t} ${WORKOUT_META[calByType[calByType.length-1].t]?.emoji || ''} (${Math.round(calByType[calByType.length-1].avg).toLocaleString('id-ID')} kkal).`
    );
  } else if (maleData.length && femaleData.length) {
    const calMale   = avgArr(maleData.map(d => d.calories_burned));
    const calFemale = avgArr(femaleData.map(d => d.calories_burned));
    const higher    = calMale >= calFemale ? 'Male' : 'Female';
    findings.push(
      `Anggota ${higher} dalam kelompok ini cenderung memiliki rata-rata kalori terbakar lebih tinggi (${Math.round(Math.max(calMale,calFemale)).toLocaleString('id-ID')} kkal vs ${Math.round(Math.min(calMale,calFemale)).toLocaleString('id-ID')} kkal) — ini korelasi, bukan kesimpulan kausal.`
    );
  } else {
    findings.push(
      `Kategori BMI ${dominantBmi[0]} mendominasi kelompok ini (${dominantBmi[1].toLocaleString('id-ID')} dari ${n.toLocaleString('id-ID')} anggota). Rata-rata BMI: ${fmt1(avgBmi)}.`
    );
  }

  /* --- bangun rekomendasi (2 rekomendasi) --- */
  const recs = [];

  // Rekomendasi 1: berdasarkan durasi rata-rata
  if (avgDur < 1.0) {
    recs.push(
      `Durasi sesi rata-rata pada kelompok ini (${fmt1(avgDur)} jam) cenderung pendek. Data menunjukkan korelasi antara durasi yang lebih panjang dan kalori yang lebih tinggi — pertimbangkan untuk memantau distribusi durasi lebih lanjut.`
    );
  } else {
    recs.push(
      `Dengan rata-rata durasi ${fmt1(avgDur)} jam per sesi, kelompok ini berada dalam rentang yang umumnya berkorelasi dengan pembakaran kalori moderat hingga tinggi (rata-rata ${Math.round(avgCal).toLocaleString('id-ID')} kkal).`
    );
  }

  // Rekomendasi 2: berdasarkan frekuensi latihan
  if (durByFreq.length >= 2) {
    const hiFreq = durByFreq.reduce((a,b) => a.f > b.f ? a : b);
    recs.push(
      `Anggota yang berlatih ${hiFreq.f}×/minggu cenderung memiliki rata-rata durasi sesi ${fmt1(hiFreq.avg)} jam. Jika tujuan analitik adalah meningkatkan volume latihan, data menunjukkan frekuensi tinggi berkorelasi dengan konsistensi durasi.`
    );
  } else {
    recs.push(
      `Data pada kelompok ini belum cukup variatif untuk analisis frekuensi lintas kelompok. Kurangi atau reset filter untuk melihat perbandingan yang lebih komprehensif.`
    );
  }

  renderInsightLists(findings, recs);
}

function renderInsightLists(findings, recs) {
  const makeItems = (arr) => arr.map(t => `<li>${t}</li>`).join('');
  document.getElementById('insight-finding-list').innerHTML = makeItems(findings);
  document.getElementById('insight-rec-list').innerHTML     = makeItems(recs);
}

/* ============================================================
   11. FUNGSI UTAMA: renderDashboard
   ============================================================ */
function renderDashboard() {
  const data = getFilteredData();

  // Empty state
  document.getElementById('empty-banner').classList.toggle('hidden', data.length > 0);

  // KPI selalu diupdate (meski kosong)
  updateKPIs(data);

  if (data.length === 0) {
    // Kosongkan chart dengan dataset kosong
    ['chart-workout-dist','chart-cal-workout','chart-cal-exp',
     'chart-scatter','chart-bmi-cat','chart-dur-freq'].forEach(id => {
      if (charts[id]) { charts[id].data.datasets = []; charts[id].update('active'); }
    });
    generateInsight([]);
    return;
  }

  // Render semua visualisasi
  updateWorkoutDist(data);
  updateCalWorkout(data);
  updateCalExp(data);
  updateScatter(data);
  updateBMICat(data);
  updateDurFreq(data);
  generateInsight(data);
}

/* ============================================================
   12. INISIALISASI
   ============================================================ */
// Terapkan tema sebelum paint pertama (mencegah flash)
initTheme();

if (checkDataAvailable()) {
  // Set global Chart.js defaults
  Chart.defaults.font.family  = "'Inter', -apple-system, system-ui, sans-serif";
  Chart.defaults.font.size    = 12;
  Chart.defaults.color        = palette().muted;
  Chart.defaults.animation    = { duration: 350, easing: 'easeInOutQuart' };

  // Render filter controls di sidebar desktop (mobile dirender saat sheet dibuka)
  renderFilterControls('filter-controls-desktop', '-d');

  // Bangun kartu workout dari data nyata
  buildWorkoutCards();

  // Render dashboard pertama kali
  renderDashboard();
}

/* ============================================================
   13. TOAST NOTIFICATION
   ============================================================ */
const toastEl = document.getElementById('toast');
let toastTimer = null;

/**
 * Tampilkan pesan toast singkat selama `duration` ms.
 * @param {string} msg  - Teks notifikasi
 * @param {number} duration - Durasi tampil (ms), default 2800
 */
function showToast(msg, duration = 2800) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  // Paksa reflow agar transisi berjalan setelah class dihapus
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.classList.add('hidden'), 260);
  }, duration);
}

/* ============================================================
   14. RENCANA SAYA — localStorage CRUD
   ============================================================ */
const PLAN_KEY       = 'fitsearch-plans';
const planModal      = document.getElementById('plan-modal');
const planModalOverlay = document.getElementById('plan-modal-overlay');
const btnMyPlan      = document.getElementById('btn-my-plan');
const btnClosePlan   = document.getElementById('btn-close-plan');
const planNavCount   = document.getElementById('plan-nav-count');
const planList       = document.getElementById('plan-list');
const planEmptyMsg   = document.getElementById('plan-empty-msg');

/** Muat rencana dari localStorage */
function loadPlans() {
  try { return JSON.parse(localStorage.getItem(PLAN_KEY)) || []; }
  catch { return []; }
}

/** Simpan array rencana ke localStorage */
function savePlans(plans) {
  localStorage.setItem(PLAN_KEY, JSON.stringify(plans));
}

/** Perbarui badge hitungan di navbar */
function updatePlanBadge() {
  const count = loadPlans().length;
  if (count > 0) {
    planNavCount.textContent = count > 9 ? '9+' : count;
    planNavCount.classList.remove('hidden');
  } else {
    planNavCount.classList.add('hidden');
  }
}

/** Render daftar rencana di modal */
function renderPlanList() {
  const plans = loadPlans();
  planEmptyMsg.classList.toggle('hidden', plans.length > 0);
  planList.innerHTML = plans.map((plan, idx) => `
    <li class="plan-item">
      <div class="plan-item-body">
        <div class="plan-item-title">${plan.title}</div>
        <div class="plan-item-meta">${plan.meta}</div>
      </div>
      <button class="btn-delete-plan" data-idx="${idx}" aria-label="Hapus rencana: ${plan.title}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </li>
  `).join('');

  // Pasang event listener tombol hapus
  planList.querySelectorAll('.btn-delete-plan').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.idx);
      const plans = loadPlans();
      const removed = plans.splice(idx, 1);
      savePlans(plans);
      updatePlanBadge();
      renderPlanList();
      showToast(`🗑️ Rencana "${removed[0]?.title}" dihapus`);
    });
  });
}

/** Buka modal Rencana Saya */
function openPlanModal() {
  renderPlanList();
  planModalOverlay.classList.remove('hidden');
  planModal.classList.add('open');
  planModal.removeAttribute('aria-hidden');
  btnMyPlan.setAttribute('aria-expanded', 'true');
  planModal.focus();
}

/** Tutup modal Rencana Saya */
function closePlanModal() {
  planModal.classList.remove('open');
  planModalOverlay.classList.add('hidden');
  planModal.setAttribute('aria-hidden', 'true');
  btnMyPlan.setAttribute('aria-expanded', 'false');
  btnMyPlan.focus();
}

btnMyPlan.addEventListener('click', openPlanModal);
btnClosePlan.addEventListener('click', closePlanModal);
planModalOverlay.addEventListener('click', closePlanModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && planModal.classList.contains('open')) closePlanModal();
});

/* ============================================================
   15. CARI PROGRAM LATIHAN
   ============================================================ */
const EXP_LABEL_SHORT = { '1': 'Pemula', '2': 'Menengah', '3': 'Lanjutan' };

// Slider durasi: update label realtime
const durSlider  = document.getElementById('s-dur');
const durValLabel = document.getElementById('s-dur-val');

function formatDurLabel(v) {
  // Tampilkan dengan koma sebagai desimal (ID locale)
  return (+v).toFixed(2).replace('.', ',').replace(',00', ',0').replace(/0$/, '') + ' jam';
}

durSlider.addEventListener('input', () => {
  const v = durSlider.value;
  durValLabel.textContent = formatDurLabel(v);
  durSlider.setAttribute('aria-valuenow', v);
  durSlider.setAttribute('aria-valuetext', formatDurLabel(v));
});

// Simpan referensi hasil pencarian terakhir untuk tombol Simpan
let lastSearchResult = null;

/** Cari anggota serupa dari GYM_DATA */
function searchSimilarMembers(exp, freq, dur, workout) {
  const durF    = parseFloat(dur);
  const MARGIN  = 0.25; // ±0.25 jam

  return GYM_DATA.filter(d => {
    if (d.experience_level        !== Number(exp))    return false;
    if (d.workout_frequency_days_week !== Number(freq)) return false;
    if (d.session_duration_hours  < durF - MARGIN)    return false;
    if (d.session_duration_hours  > durF + MARGIN)    return false;
    if (workout && d.workout_type !== workout)         return false;
    return true;
  });
}

/** Jenis latihan paling umum */
function mostCommonWorkout(data) {
  if (!data.length) return '—';
  const counts = {};
  data.forEach(d => { counts[d.workout_type] = (counts[d.workout_type] || 0) + 1; });
  return Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0];
}

/** Jenis latihan dengan rata-rata kalori tertinggi */
function highestCalWorkout(data) {
  if (!data.length) return '—';
  const types = [...new Set(data.map(d => d.workout_type))];
  let best = null, bestCal = -Infinity;
  types.forEach(t => {
    const sub = data.filter(d => d.workout_type === t);
    const c   = avgArr(sub.map(d => d.calories_burned));
    if (c > bestCal) { bestCal = c; best = t; }
  });
  return best || '—';
}

/** Render hasil ke DOM */
function renderSearchResult(data, params) {
  const resultEl  = document.getElementById('search-result');
  const gridEl    = document.getElementById('result-stats-grid');
  const warnEl    = document.getElementById('result-sample-warn');
  const SMALL     = 20;

  resultEl.classList.remove('hidden');
  warnEl.classList.toggle('hidden', data.length >= SMALL);

  const avgCal  = avgArr(data.map(d => d.calories_burned));
  const avgBpm  = avgArr(data.map(d => d.avg_bpm));
  const topType = mostCommonWorkout(data);
  const calType = highestCalWorkout(data);

  const topEmoji = WORKOUT_META[topType]?.emoji || '';
  const calEmoji = WORKOUT_META[calType]?.emoji || '';

  gridEl.innerHTML = `
    <div class="result-stat">
      <span class="result-stat-label">Anggota Serupa</span>
      <span class="result-stat-value">${data.length.toLocaleString('id-ID')}</span>
      <span class="result-stat-sub">orang ditemukan</span>
    </div>
    <div class="result-stat">
      <span class="result-stat-label">Rata-rata Kalori</span>
      <span class="result-stat-value">${data.length ? fmt0(avgCal) : '—'}</span>
      <span class="result-stat-sub">kkal/sesi</span>
    </div>
    <div class="result-stat">
      <span class="result-stat-label">Rata-rata Avg BPM</span>
      <span class="result-stat-value">${data.length ? fmt1(avgBpm) : '—'}</span>
      <span class="result-stat-sub">bpm</span>
    </div>
    <div class="result-stat">
      <span class="result-stat-label">Latihan Terpopuler</span>
      <span class="result-stat-value" style="font-size:.95rem;">${topEmoji} ${topType}</span>
      <span class="result-stat-sub">paling banyak dipilih</span>
    </div>
    <div class="result-stat">
      <span class="result-stat-label">Kalori Tertinggi</span>
      <span class="result-stat-value" style="font-size:.95rem;">${calEmoji} ${calType}</span>
      <span class="result-stat-sub">rata-rata kalori terbakar</span>
    </div>
  `;

  // Simpan params untuk "Simpan ke Rencana"
  lastSearchResult = {
    params,
    count:   data.length,
    avgCal,
    avgBpm,
    topType,
    calType,
  };
}

// Form submit
document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const exp     = document.getElementById('s-exp').value;
  const freq    = document.getElementById('s-freq').value;
  const dur     = document.getElementById('s-dur').value;
  const workout = document.getElementById('s-workout').value;

  if (!exp || !freq) {
    showToast('⚠️ Pilih Level Pengalaman dan Frekuensi Mingguan terlebih dahulu.');
    return;
  }

  const similar = searchSimilarMembers(exp, freq, dur, workout);
  renderSearchResult(similar, { exp, freq, dur, workout });
});

// Tombol Simpan ke Rencana
document.getElementById('btn-save-plan').addEventListener('click', () => {
  if (!lastSearchResult) return;
  const { params, count, avgCal, topType } = lastSearchResult;
  const expLabel  = EXP_LABEL_SHORT[params.exp] || `L${params.exp}`;
  const workout   = params.workout || 'Semua';
  const title     = `${expLabel} · ${params.freq}×/minggu · ${formatDurLabel(params.dur)}`;
  const meta      = `Latihan: <strong>${workout}</strong> · ${count.toLocaleString('id-ID')} anggota serupa · Rata-rata <strong>${fmt0(avgCal)} kkal</strong> · Populer: <strong>${topType}</strong>`;

  const plans = loadPlans();
  // Cegah duplikat (cek berdasarkan title)
  if (plans.some(p => p.title === title)) {
    showToast('ℹ️ Rencana ini sudah tersimpan.');
    return;
  }
  plans.unshift({ title, meta, savedAt: Date.now() });
  savePlans(plans);
  updatePlanBadge();
  showToast('✅ Rencana berhasil disimpan!');
});

/* ============================================================
   16. KALKULATOR BMI
   ============================================================ */
document.getElementById('btn-calc-bmi').addEventListener('click', calcBMI);

function calcBMI() {
  const weightEl = document.getElementById('bmi-weight');
  const heightEl = document.getElementById('bmi-height');
  const weight   = parseFloat(weightEl.value);
  const heightCm = parseFloat(heightEl.value);

  if (!weight || !heightCm || weight <= 0 || heightCm <= 0) {
    showToast('⚠️ Masukkan berat (kg) dan tinggi (cm) yang valid.');
    return;
  }

  const heightM = heightCm / 100;
  const bmi     = weight / (heightM * heightM);
  const cat     = bmiCategory(bmi);

  // Hitung posisi persentil dalam GYM_DATA
  const allBmi      = GYM_DATA.map(d => d.bmi).sort((a,b) => a-b);
  const lowerCount  = allBmi.filter(b => b < bmi).length;
  const percentile  = Math.round((lowerCount / allBmi.length) * 100);

  // Distribusi per kategori
  const cats    = { Underweight: 0, Normal: 0, Overweight: 0, Obese: 0 };
  GYM_DATA.forEach(d => { cats[bmiCategory(d.bmi)]++; });
  const total   = GYM_DATA.length;

  // Tampilkan hasil
  const resultEl = document.getElementById('bmi-result');
  resultEl.classList.remove('hidden');

  document.getElementById('bmi-score-val').textContent = bmi.toFixed(1);

  const catBadge = document.getElementById('bmi-cat-badge');
  catBadge.textContent = cat;
  catBadge.className   = 'bmi-cat-badge bmi-cat-' + cat.toLowerCase();

  document.getElementById('bmi-percentile').textContent = `Top ${100 - percentile}%`;
  document.getElementById('bmi-compare-sub').textContent =
    `BMI Anda lebih rendah dari ${percentile}% anggota`;

  // Distribution bar — semua full height, dim yang bukan kategori user
  const segs = {
    Underweight: 'bmi-seg-under',
    Normal:      'bmi-seg-normal',
    Overweight:  'bmi-seg-over',
    Obese:       'bmi-seg-obese',
  };
  Object.entries(segs).forEach(([c, id]) => {
    const fill = document.getElementById(id)?.querySelector('.bmi-seg-fill');
    if (fill) fill.classList.toggle('dim', c !== cat);
  });

  // Persentase per kategori
  const pctRow = document.getElementById('bmi-dist-pct-row');
  pctRow.innerHTML = Object.entries(cats).map(([c, n]) =>
    `<span title="${c}: ${n} anggota">${Math.round((n/total)*100)}%</span>`
  ).join('');
}

/* ============================================================
   17. INISIALISASI FITUR BARU
   ============================================================ */
// Muat badge rencana saat halaman pertama kali dibuka
updatePlanBadge();
