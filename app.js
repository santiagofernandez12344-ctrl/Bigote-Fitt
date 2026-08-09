/* ===================== Bigote Fitt ===================== */

const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const DIAS_CORTO = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

const LIFTS_DEFAULT = [
  { key: "sentadilla", label: "Sentadilla" },
  { key: "peso_muerto", label: "Peso muerto" },
  { key: "press_banca", label: "Press banca" },
  { key: "press_militar", label: "Press militar" },
];

const LS = {
  program: "bf_program",
  users: "bf_users",
  currentUser: "bf_current_user",
  rms: "bf_rms",
  lifts: "bf_lift_defs",
};

/* ===================== Supabase (backend compartido) =====================
   1) Creá un proyecto gratis en https://supabase.com
   2) Pegá supabase_setup.sql en el SQL Editor y ejecutalo
   3) Project Settings → API → copiá "Project URL" y "anon public key" acá abajo
   La anon key es pública por diseño (no es un secreto), la protege el RLS
   que armamos en el SQL. ========================================== */
const SUPABASE_URL = "https://kgsuzucwufucdzmsnudd.supabase.co";       // ej: "https://abcdefgh.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtnc3V6dWN3dWZ1Y2R6bXNudWRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYzMTA1NzcsImV4cCI6MjEwMTg4NjU3N30.f9zXanwK08uV6Jwko2ERu5gUJJahjb3vS2F53bVQlYQ";  // ej: "eyJhbGciOiJI..."

const SB_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

async function sbSelect(table, query = "") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`sbSelect ${table} failed: ${res.status}`);
  return res.json();
}

async function sbUpsert(table, rows, onConflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`sbUpsert ${table} failed: ${res.status}`);
}

/* Trae el estado más nuevo del servidor y actualiza la caché local.
   Se llama al boot y al entrar a Ajustes/Modo entrenador. Si falla
   (sin señal), la app sigue funcionando con lo último guardado. */
async function pullAndSync() {
  if (!SB_CONFIGURED) return false;
  try {
    const [progRows, userRows, liftRows] = await Promise.all([
      sbSelect("bigote_programa", "?select=data&id=eq.1"),
      sbSelect("bigote_users", "?select=name&order=created_at.asc"),
      sbSelect("bigote_lifts", "?select=data&id=eq.1"),
    ]);

    let remoteProgram = progRows[0] && progRows[0].data;
    if (!remoteProgram || !remoteProgram.weeks) {
      remoteProgram = seedProgram();
      await sbUpsert("bigote_programa", [{ id: 1, data: remoteProgram, updated_at: new Date().toISOString() }], "id");
    }
    saveJSON(LS.program, remoteProgram);

    const remoteUsers = userRows.map((r) => r.name);
    saveJSON(LS.users, remoteUsers);

    let remoteLifts = liftRows[0] && liftRows[0].data;
    if (!remoteLifts || !remoteLifts.length) {
      remoteLifts = LIFTS_DEFAULT;
      await sbUpsert("bigote_lifts", [{ id: 1, data: remoteLifts, updated_at: new Date().toISOString() }], "id");
    }
    saveJSON(LS.lifts, remoteLifts);

    const user = getCurrentUser();
    if (user) {
      const rmRows = await sbSelect("bigote_rms", `?select=data&user_name=eq.${encodeURIComponent(user)}`);
      const remoteRms = (rmRows[0] && rmRows[0].data) || {};
      const all = getAllRms();
      all[user] = remoteRms;
      saveJSON(LS.rms, all);
    }
    return true;
  } catch (e) {
    console.warn("pullAndSync failed", e);
    return false;
  }
}

/* ---------- seed / storage helpers ---------- */

function seedProgram() {
  return {
    meta: { nombre: "Plan Base · Power · Peak", startDate: todayISO() },
    weeks: [
      {
        numero: 1,
        fase: "Base",
        dias: [
          dia("Lunes", "Tren inferior — Fuerza", false, [
            ex("Sentadilla trasera", 4, "5", 75, "sentadilla", "Pausa de 1 segundo abajo. Subida controlada, sin perder la técnica por meter más peso."),
            ex("Peso muerto rumano", 3, "8", 65, "peso_muerto", "Foco en isquios y glúteo. Bajá hasta donde la espalda se mantenga recta."),
            ex("Zancadas con salto", 3, "10 por pierna", 0, null, "Sin carga. Buscá altura y aterrizaje suave, no velocidad."),
          ]),
          dia("Martes", "Tren superior — Empuje", false, [
            ex("Press banca", 4, "6", 72, "press_banca", "Retracción escapular antes de bajar la barra."),
            ex("Press militar", 3, "8", 65, "press_militar", "Core apretado, sin arquear de más la lumbar."),
          ]),
          dia("Miércoles", "Descanso activo", true, []),
          dia("Jueves", "Potencia — Salto", false, [
            ex("Sentadilla trasera", 3, "3", 60, "sentadilla", "Velocidad máxima en la subida, sin perder forma."),
            ex("Salto al cajón", 4, "5", 0, null, "Aterrizá en silencio. Bajate caminando, no saltando de vuelta."),
          ]),
          dia("Viernes", "Tren superior — Tracción", false, [
            ex("Peso muerto convencional", 4, "5", 78, "peso_muerto", "Última serie con control extra, ya viene cargada la semana."),
          ]),
          dia("Sábado", "Partido / cancha", true, []),
          dia("Domingo", "Descanso", true, []),
        ],
      },
    ],
  };
}

function dia(nombre, tag, descanso, ejercicios) {
  return { dia: nombre, nombre: tag, descanso, ejercicios };
}
function ex(nombre, series, reps, pct, rmKey, notas) {
  return { id: uid(), nombre, series, reps, pct, rmKey, notas: notas || "" };
}
function uid() {
  return Math.random().toString(36).slice(2, 9);
}
function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function getProgram() {
  let p = loadJSON(LS.program, null);
  if (!p) {
    p = seedProgram();
    saveJSON(LS.program, p);
  }
  return p;
}
function setProgram(p) {
  saveJSON(LS.program, p);
  if (SB_CONFIGURED) {
    sbUpsert("bigote_programa", [{ id: 1, data: p, updated_at: new Date().toISOString() }], "id").catch(() => {
      toast("Sin conexión: se guardó en este celular, se sincroniza cuando vuelva la señal.");
    });
  }
}
function getLifts() {
  return loadJSON(LS.lifts, LIFTS_DEFAULT);
}
function setLifts(l) {
  saveJSON(LS.lifts, l);
  if (SB_CONFIGURED) {
    sbUpsert("bigote_lifts", [{ id: 1, data: l, updated_at: new Date().toISOString() }], "id").catch(() => {
      toast("Sin conexión: se guardó en este celular.");
    });
  }
}
function getUsers() {
  return loadJSON(LS.users, []);
}
async function addUser(name) {
  const users = getUsers();
  if (!users.includes(name)) {
    users.push(name);
    saveJSON(LS.users, users);
  }
  if (SB_CONFIGURED) {
    try {
      await sbUpsert("bigote_users", [{ name }], "name");
    } catch (e) {
      toast("Sin conexión: usuario guardado solo en este celular.");
    }
  }
}
function getCurrentUser() {
  return localStorage.getItem(LS.currentUser) || null;
}
function setCurrentUser(name) {
  localStorage.setItem(LS.currentUser, name);
}
function getAllRms() {
  return loadJSON(LS.rms, {});
}
function getUserRms(name) {
  const all = getAllRms();
  return all[name] || {};
}
async function saveUserRms(name, rms) {
  const all = getAllRms();
  all[name] = rms;
  saveJSON(LS.rms, all);
  if (SB_CONFIGURED) {
    try {
      await sbUpsert("bigote_rms", [{ user_name: name, data: rms, updated_at: new Date().toISOString() }], "user_name");
      return true;
    } catch (e) {
      return false;
    }
  }
  return true;
}

/* ---------- weight math ---------- */

function calcKg(rm, pct) {
  if (!rm || !pct) return null;
  const raw = (rm * pct) / 100;
  return Math.round(raw / 2.5) * 2.5;
}
function fmtKg(v) {
  if (v === null || v === undefined) return "—";
  return Number.isInteger(v) ? `${v} kg` : `${v.toFixed(1)} kg`;
}
function zoneColor(pct) {
  if (!pct) return null;
  if (pct < 70) return "var(--green)";
  if (pct <= 85) return "var(--accent)";
  return "var(--red)";
}

/* ---------- week / day resolution ---------- */

function currentWeekIndex(program) {
  const start = program.meta.startDate ? new Date(program.meta.startDate + "T00:00:00") : null;
  if (!start) return 0;
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMid = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diffDays = Math.round((todayMid - startMid) / 86400000);
  if (diffDays < 0) return 0;
  const wk = Math.floor(diffDays / 7);
  return Math.min(wk, Math.max(program.weeks.length - 1, 0));
}
function todayDiaIndex() {
  return (new Date().getDay() + 6) % 7; // 0=Lunes
}

/* ===================== App state ===================== */

const state = {
  tab: "hoy",
  weekView: 0,
  dayView: 0,
  editorWeek: 0,
  authorMode: false,
};

const root = document.getElementById("app");

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._h);
  toast._h = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ===================== Render: onboarding ===================== */

function renderOnboarding() {
  const users = getUsers();
  root.innerHTML = `
    <div class="onboard">
      ${mustacheSVG(64)}
      <h1>Bigote <span style="color:var(--accent)">Fitt</span></h1>
      <p>Cada día, lo que toca entrenar. Series, repeticiones y los kilos ya calculados con tu marca personal.</p>
      ${users.length ? `<div class="section-title" style="margin-top:0">¿Quién sos?</div>
      <div class="friend-list">
        ${users.map(u => `<button class="friend-btn" data-user="${escapeAttr(u)}">${escapeHTML(u)} <span style="color:var(--text-dim)">→</span></button>`).join("")}
      </div>` : ""}
      <div class="field">
        <label>${users.length ? "Sumar otro gymbro" : "Tu nombre"}</label>
        <input id="new-user" type="text" placeholder="Ej: Santi" />
      </div>
      <button class="btn block" id="btn-enter">Entrar</button>
    </div>
  `;
  root.querySelectorAll("[data-user]").forEach(b => {
    b.addEventListener("click", () => {
      setCurrentUser(b.dataset.user);
      renderApp();
    });
  });
  document.getElementById("btn-enter").addEventListener("click", async () => {
    const val = document.getElementById("new-user").value.trim();
    if (!val) { toast("Escribí un nombre"); return; }
    const btn = document.getElementById("btn-enter");
    btn.disabled = true; btn.textContent = "Entrando...";
    await addUser(val);
    setCurrentUser(val);
    await pullAndSync();
    renderApp();
  });
}

function mustacheSVG(size) {
  return `<svg class="mustache-big" width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="512" height="512" rx="112" fill="#16171A"/>
    <circle cx="256" cy="256" r="188" fill="none" stroke="#E8A33D" stroke-width="22"/>
    <path d="M256 256 C220 200 120 210 20 250 C60 270 130 275 150 255 C170 275 190 275 256 256 Z" fill="#E8A33D"/>
    <path d="M256 256 C292 200 392 210 492 250 C452 270 382 275 362 255 C342 275 322 275 256 256 Z" fill="#E8A33D"/>
  </svg>`;
}

function escapeHTML(s) {
  return (s || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function escapeAttr(s) { return escapeHTML(s); }

/* ===================== Render: main app shell ===================== */

function renderApp() {
  const user = getCurrentUser();
  if (!user) return renderOnboarding();

  root.innerHTML = `
    <div class="topbar">
      <div class="brand">
        ${mustacheSVG(30)}
        <span class="brand-name">Bigote <b>Fitt</b></span>
      </div>
      <button class="user-chip" id="switch-user">${escapeHTML(user)} ⌄</button>
    </div>
    ${!SB_CONFIGURED ? `<div style="margin:0 16px 12px; padding:10px 14px; background:rgba(214,82,74,0.12); border:1px solid var(--red); border-radius:12px; font-size:12.5px; color:var(--text-dim)">
      ⚠️ Falta conectar el servidor (Supabase) en <code>app.js</code>. Por ahora cada celular guarda su propia copia, sin compartir entre gymbros.
    </div>` : ""}
    <main id="view"></main>
    <nav class="bottomnav">
      <button class="nav-btn" data-tab="hoy">${iconToday()}<span>Hoy</span></button>
      <button class="nav-btn" data-tab="semana">${iconWeek()}<span>Semana</span></button>
      <button class="nav-btn" data-tab="ajustes">${iconSettings()}<span>Ajustes</span></button>
    </nav>
    <div class="toast" id="toast"></div>
  `;

  document.getElementById("switch-user").addEventListener("click", () => {
    setCurrentUser(null);
    renderOnboarding();
  });

  root.querySelectorAll(".nav-btn").forEach(b => {
    b.addEventListener("click", () => {
      state.tab = b.dataset.tab;
      renderTab();
    });
  });

  renderTab();
}

function renderTab() {
  document.querySelectorAll(".nav-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === state.tab);
  });
  if (state.tab === "hoy") renderHoy();
  else if (state.tab === "semana") renderSemana();
  else renderAjustes();

  // Refresca en segundo plano y vuelve a pintar si cambió algo en el servidor.
  if (SB_CONFIGURED) {
    pullAndSync().then((ok) => {
      if (ok && document.getElementById(state.tab === "hoy" ? "view" : "view")) {
        if (state.tab === "hoy") renderHoy();
        else if (state.tab === "semana") renderSemana();
        else renderAjustes();
      }
    });
  }
}

/* ===================== Tab: HOY ===================== */

function renderHoy() {
  const view = document.getElementById("view");
  const program = getProgram();
  const wIdx = currentWeekIndex(program);
  const week = program.weeks[wIdx];
  const dIdx = todayDiaIndex();
  const day = week.dias[dIdx];

  const startDate = program.meta.startDate ? new Date(program.meta.startDate + "T00:00:00") : null;
  const now = new Date();
  const notStarted = startDate && now < startDate;

  view.innerHTML = `
    <div class="hero">
      <div class="hero-eyebrow">${notStarted ? "El ciclo todavía no arrancó" : `Semana ${week.numero} · ${escapeHTML(week.fase || "")}`}</div>
      <div class="hero-day display">${DIAS[dIdx]}</div>
      <div class="hero-sub">${escapeHTML(day.nombre || "")}</div>
      ${day.descanso ? `<div class="rest-badge">🛌 Día de descanso. Recuperate, mañana se sigue.</div>` : ""}
    </div>
    <div id="ex-container"></div>
  `;

  if (!day.descanso) {
    renderExerciseList(document.getElementById("ex-container"), day.ejercicios);
  }
}

function renderExerciseList(container, ejercicios) {
  if (!ejercicios || !ejercicios.length) {
    container.innerHTML = `<div class="empty">No hay ejercicios cargados para este día todavía.</div>`;
    return;
  }
  const user = getCurrentUser();
  const rms = getUserRms(user);
  const lifts = getLifts();

  container.innerHTML = `<div class="exlist">${ejercicios.map(e => {
    const liftLabel = lifts.find(l => l.key === e.rmKey)?.label;
    const rm = e.rmKey ? rms[e.rmKey] : null;
    const kg = e.pct ? calcKg(rm, e.pct) : null;
    const zc = zoneColor(e.pct);
    return `
      <div class="exercise">
        <div class="ex-top">
          <div>
            <div class="ex-name">${escapeHTML(e.nombre)}</div>
            <div class="ex-meta">${e.series} series × ${escapeHTML(String(e.reps))}</div>
          </div>
          ${e.pct ? `<div class="plate" style="--zone-color:${zc}">${e.pct}%</div>` : ""}
        </div>
        <div class="ex-numbers">
          <div class="num-block">
            <div class="num-label">Series</div>
            <div class="num-value">${e.series}</div>
          </div>
          <div class="num-block">
            <div class="num-label">Reps</div>
            <div class="num-value">${escapeHTML(String(e.reps))}</div>
          </div>
          ${e.pct ? `<div class="num-block">
            <div class="num-label">${liftLabel || "% RM"}</div>
            <div class="num-value accent">${kg !== null ? fmtKg(kg) : (e.pct + "%")}</div>
          </div>` : ""}
        </div>
        ${e.pct && e.rmKey && !rm ? `<div class="no-rm">Cargá tu marca de "${liftLabel}" en Ajustes para ver el kilaje.</div>` : ""}
        ${e.notas ? `
          <button class="notes-toggle" data-toggle>Ver indicaciones</button>
          <div class="ex-notes hidden">${escapeHTML(e.notas)}</div>
        ` : ""}
      </div>
    `;
  }).join("")}</div>`;

  container.querySelectorAll("[data-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const notes = btn.nextElementSibling;
      notes.classList.toggle("hidden");
      btn.textContent = notes.classList.contains("hidden") ? "Ver indicaciones" : "Ocultar indicaciones";
    });
  });
}

/* ===================== Tab: SEMANA ===================== */

function renderSemana() {
  const view = document.getElementById("view");
  const program = getProgram();
  if (state.weekView === undefined || state.weekView === null) state.weekView = currentWeekIndex(program);
  if (state.weekView >= program.weeks.length) state.weekView = program.weeks.length - 1;
  if (state.weekView < 0) state.weekView = 0;

  const week = program.weeks[state.weekView];
  if (state.dayView === undefined || state.dayView === null) state.dayView = todayDiaIndex();

  view.innerHTML = `
    <div class="week-switch">
      <button id="w-prev" ${state.weekView === 0 ? "disabled style='opacity:.4'" : ""}>← Semana</button>
      <span class="w-label">Semana ${week.numero} · ${escapeHTML(week.fase || "")}</span>
      <button id="w-next" ${state.weekView === program.weeks.length - 1 ? "disabled style='opacity:.4'" : ""}>Semana →</button>
    </div>
    <div class="week-strip">
      ${week.dias.map((d, i) => `
        <div class="day-pill ${i === state.dayView ? "active" : ""}" data-day="${i}">
          <div class="d-name">${DIAS_CORTO[i]}</div>
          <div class="d-tag">${d.descanso ? "😌" : "💪"}</div>
        </div>
      `).join("")}
    </div>
    <div class="hero" style="padding:16px 18px;">
      <div class="hero-eyebrow">${DIAS[state.dayView]}</div>
      <div class="hero-sub" style="margin-top:0; font-size:16px; color:var(--text)">${escapeHTML(week.dias[state.dayView].nombre || "")}</div>
      ${week.dias[state.dayView].descanso ? `<div class="rest-badge">Día de descanso</div>` : ""}
    </div>
    <div id="ex-container"></div>
  `;

  if (!week.dias[state.dayView].descanso) {
    renderExerciseList(document.getElementById("ex-container"), week.dias[state.dayView].ejercicios);
  } else {
    document.getElementById("ex-container").innerHTML = "";
  }

  document.getElementById("w-prev")?.addEventListener("click", () => {
    if (state.weekView > 0) { state.weekView--; renderSemana(); }
  });
  document.getElementById("w-next")?.addEventListener("click", () => {
    if (state.weekView < program.weeks.length - 1) { state.weekView++; renderSemana(); }
  });
  view.querySelectorAll("[data-day]").forEach(p => {
    p.addEventListener("click", () => {
      state.dayView = parseInt(p.dataset.day, 10);
      renderSemana();
    });
  });
}

/* ===================== Tab: AJUSTES ===================== */

function renderAjustes() {
  const view = document.getElementById("view");
  const user = getCurrentUser();
  const lifts = getLifts();
  const rms = getUserRms(user);
  const program = getProgram();

  view.innerHTML = `
    <div class="section-title">Tus marcas (1RM)</div>
    <div class="card" id="rm-card">
      ${lifts.map(l => `
        <div class="field">
          <label>${escapeHTML(l.label)} (kg)</label>
          <input type="number" inputmode="decimal" step="2.5" data-rm="${l.key}" value="${rms[l.key] ?? ""}" placeholder="Ej: 100" />
        </div>
      `).join("")}
      <div class="btn-row">
        <button class="btn secondary" id="add-lift">+ Agregar ejercicio</button>
        <button class="btn" id="save-rm">Guardar marcas</button>
      </div>
    </div>

    <div class="section-title">Modo entrenador</div>
    <div class="card">
      <p style="margin:0 0 12px; font-size:13.5px; color:var(--text-dim)">
        Acá se edita la programación que ven todos. Si sos vos el que sube el plan, activalo.
        Los cambios se guardan en este celular — después usá "Exportar" para mandárselo a tus amigos por WhatsApp.
      </p>
      <button class="btn ${state.authorMode ? "secondary" : ""} block" id="toggle-author">
        ${state.authorMode ? "Salir del modo entrenador" : "Activar modo entrenador"}
      </button>
    </div>

    ${state.authorMode ? `<div id="editor-zone"></div>` : ""}

    <div class="section-title">Compartir programación</div>
    <div class="card">
      <p style="margin:0 0 12px; font-size:13.5px; color:var(--text-dim)">
        Exportá el archivo y mandalo por WhatsApp. Tus amigos lo importan acá mismo y ya tienen la semana actualizada.
      </p>
      <div class="btn-row">
        <button class="btn secondary" id="export-btn">⬇ Exportar programa</button>
        <label class="btn secondary" style="cursor:pointer;">
          ⬆ Importar programa
          <input type="file" id="import-input" accept="application/json" style="display:none" />
        </label>
      </div>
    </div>

    <div class="section-title">Gymbros</div>
    <div class="card">
      ${getUsers().map(u => `<div class="list-item">${escapeHTML(u)} ${u === user ? '<span style="color:var(--accent); font-size:12px">vos</span>' : ""}</div>`).join("")}
    </div>
  `;

  document.getElementById("save-rm").addEventListener("click", async (e) => {
    const inputs = view.querySelectorAll("[data-rm]");
    const newRms = { ...rms };
    inputs.forEach(inp => {
      const v = parseFloat(inp.value);
      if (!isNaN(v) && v > 0) newRms[inp.dataset.rm] = v;
      else delete newRms[inp.dataset.rm];
    });
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = "Guardando...";
    const ok = await saveUserRms(user, newRms);
    btn.disabled = false; btn.textContent = "Guardar marcas";
    toast(ok ? "Marcas guardadas y sincronizadas 💪" : "Guardado en este celular (sin conexión con el servidor)");
  });

  document.getElementById("add-lift").addEventListener("click", () => {
    const name = prompt("Nombre del ejercicio (ej: Arranque, Cargada, Dominadas con lastre):");
    if (!name) return;
    const key = name.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const lifts2 = getLifts();
    if (lifts2.some(l => l.key === key)) { toast("Ya existe ese ejercicio"); return; }
    lifts2.push({ key, label: name.trim() });
    setLifts(lifts2);
    renderAjustes();
  });

  document.getElementById("toggle-author").addEventListener("click", () => {
    state.authorMode = !state.authorMode;
    if (state.authorMode) state.editorWeek = currentWeekIndex(program);
    renderAjustes();
  });

  document.getElementById("export-btn").addEventListener("click", () => {
    const data = JSON.stringify(getProgram(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bigote-fitt-programa.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Programa exportado");
  });

  document.getElementById("import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.weeks || !Array.isArray(parsed.weeks)) throw new Error("formato inválido");
        setProgram(parsed);
        toast("Programa importado ✅");
        renderAjustes();
      } catch (err) {
        toast("El archivo no tiene el formato correcto");
      }
    };
    reader.readAsText(file);
  });

  if (state.authorMode) renderEditor(document.getElementById("editor-zone"));
}

/* ---------- editor (modo entrenador) ---------- */

function renderEditor(container) {
  const program = getProgram();
  if (state.editorWeek >= program.weeks.length) state.editorWeek = program.weeks.length - 1;
  const week = program.weeks[state.editorWeek];

  container.innerHTML = `
    <div class="card">
      <div class="field">
        <label>Fecha de inicio del ciclo</label>
        <input type="date" id="start-date" value="${program.meta.startDate || ""}" />
      </div>
      <div class="week-switch">
        <button id="ew-prev" ${state.editorWeek === 0 ? "disabled style='opacity:.4'" : ""}>← Semana</button>
        <span class="w-label">Semana ${week.numero}</span>
        <button id="ew-next" ${state.editorWeek === program.weeks.length - 1 ? "disabled style='opacity:.4'" : ""}>Semana →</button>
      </div>
      <div class="field">
        <label>Nombre de la fase (Base / Power / Peak, etc.)</label>
        <input type="text" id="fase-input" value="${escapeAttr(week.fase || "")}" />
      </div>
      <div class="btn-row" style="margin-bottom:4px;">
        <button class="btn secondary" id="add-week">+ Agregar semana nueva</button>
        ${program.weeks.length > 1 ? `<button class="btn danger" id="del-week">Eliminar esta semana</button>` : ""}
      </div>
    </div>

    <div id="days-editor"></div>
  `;

  renderDaysEditor(document.getElementById("days-editor"), week);

  document.getElementById("start-date").addEventListener("change", (e) => {
    const p = getProgram();
    p.meta.startDate = e.target.value;
    setProgram(p);
    toast("Fecha de inicio actualizada");
  });

  document.getElementById("fase-input").addEventListener("change", (e) => {
    const p = getProgram();
    p.weeks[state.editorWeek].fase = e.target.value;
    setProgram(p);
  });

  document.getElementById("ew-prev")?.addEventListener("click", () => {
    if (state.editorWeek > 0) { state.editorWeek--; renderEditor(container); }
  });
  document.getElementById("ew-next")?.addEventListener("click", () => {
    if (state.editorWeek < program.weeks.length - 1) { state.editorWeek++; renderEditor(container); }
  });

  document.getElementById("add-week").addEventListener("click", () => {
    const p = getProgram();
    const nextNum = p.weeks.length + 1;
    const lastFase = p.weeks[p.weeks.length - 1]?.fase || "";
    p.weeks.push({
      numero: nextNum,
      fase: lastFase,
      dias: DIAS.map(d => dia(d, "", d === "Domingo", [])),
    });
    setProgram(p);
    state.editorWeek = p.weeks.length - 1;
    renderEditor(container);
    toast("Semana agregada");
  });

  document.getElementById("del-week")?.addEventListener("click", () => {
    if (!confirm("¿Seguro que querés eliminar esta semana?")) return;
    const p = getProgram();
    p.weeks.splice(state.editorWeek, 1);
    p.weeks.forEach((w, i) => (w.numero = i + 1));
    setProgram(p);
    state.editorWeek = Math.max(0, state.editorWeek - 1);
    renderEditor(container);
  });
}

function renderDaysEditor(container, week) {
  const lifts = getLifts();
  container.innerHTML = week.dias.map((d, di) => `
    <div class="card">
      <div class="field" style="margin-bottom:8px;">
        <label>${DIAS[di]}</label>
        <input type="text" placeholder="Nombre del entrenamiento (ej: Tren inferior — Fuerza)" data-day-name="${di}" value="${escapeAttr(d.nombre || "")}" />
      </div>
      <label style="display:flex; align-items:center; gap:8px; font-size:13.5px; color:var(--text-dim); margin-bottom:10px;">
        <input type="checkbox" data-day-rest="${di}" ${d.descanso ? "checked" : ""} style="width:auto;" />
        Día de descanso
      </label>
      <div data-day-exercises="${di}" class="${d.descanso ? "hidden" : ""}">
        ${d.ejercicios.map((e, ei) => renderExerciseEditor(e, di, ei, lifts)).join("")}
        <button class="btn secondary" data-add-ex="${di}">+ Agregar ejercicio</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-day-name]").forEach(inp => {
    inp.addEventListener("change", () => {
      const p = getProgram();
      p.weeks[state.editorWeek].dias[inp.dataset.dayName].nombre = inp.value;
      setProgram(p);
    });
  });
  container.querySelectorAll("[data-day-rest]").forEach(cb => {
    cb.addEventListener("change", () => {
      const p = getProgram();
      p.weeks[state.editorWeek].dias[cb.dataset.dayRest].descanso = cb.checked;
      setProgram(p);
      renderDaysEditor(container, getProgram().weeks[state.editorWeek]);
    });
  });
  container.querySelectorAll("[data-add-ex]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = getProgram();
      p.weeks[state.editorWeek].dias[btn.dataset.addEx].ejercicios.push(ex("Nuevo ejercicio", 3, "10", 0, null, ""));
      setProgram(p);
      renderDaysEditor(container, getProgram().weeks[state.editorWeek]);
    });
  });

  bindExerciseEditors(container);
}

function renderExerciseEditor(e, di, ei, lifts) {
  return `
    <div class="exercise-editor" data-ex-block="${di}-${ei}">
      <div class="field">
        <label>Ejercicio</label>
        <input type="text" data-ex-field="nombre" data-di="${di}" data-ei="${ei}" value="${escapeAttr(e.nombre)}" />
      </div>
      <div class="row2">
        <div class="field">
          <label>Series</label>
          <input type="number" data-ex-field="series" data-di="${di}" data-ei="${ei}" value="${e.series}" />
        </div>
        <div class="field">
          <label>Reps</label>
          <input type="text" data-ex-field="reps" data-di="${di}" data-ei="${ei}" value="${escapeAttr(String(e.reps))}" />
        </div>
      </div>
      <div class="row2">
        <div class="field">
          <label>% RM (0 si no aplica)</label>
          <input type="number" data-ex-field="pct" data-di="${di}" data-ei="${ei}" value="${e.pct || 0}" />
        </div>
        <div class="field">
          <label>Ejercicio de referencia</label>
          <select data-ex-field="rmKey" data-di="${di}" data-ei="${ei}">
            <option value="">— ninguno —</option>
            ${lifts.map(l => `<option value="${l.key}" ${e.rmKey === l.key ? "selected" : ""}>${escapeHTML(l.label)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Indicaciones</label>
        <textarea data-ex-field="notas" data-di="${di}" data-ei="${ei}">${escapeHTML(e.notas || "")}</textarea>
      </div>
      <button class="btn danger" data-del-ex="${di}-${ei}">Eliminar ejercicio</button>
    </div>
  `;
}

function bindExerciseEditors(container) {
  container.querySelectorAll("[data-ex-field]").forEach(inp => {
    inp.addEventListener("change", () => {
      const p = getProgram();
      const di = inp.dataset.di, ei = inp.dataset.ei, field = inp.dataset.exField;
      const target = p.weeks[state.editorWeek].dias[di].ejercicios[ei];
      if (field === "series" || field === "pct") target[field] = parseFloat(inp.value) || 0;
      else if (field === "rmKey") target[field] = inp.value || null;
      else target[field] = inp.value;
      setProgram(p);
    });
  });
  container.querySelectorAll("[data-del-ex]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [di, ei] = btn.dataset.delEx.split("-");
      const p = getProgram();
      p.weeks[state.editorWeek].dias[di].ejercicios.splice(ei, 1);
      setProgram(p);
      renderDaysEditor(document.getElementById("days-editor"), getProgram().weeks[state.editorWeek]);
    });
  });
}

/* ---------- icons ---------- */
function iconToday(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/><circle cx="12" cy="15" r="2.3" fill="currentColor" stroke="none"/></svg>`}
function iconWeek(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2"/></svg>`}
function iconSettings(){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 005 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019 9c.14.36.4.66.74.86.34.2.55.55.55.94v.4c0 .39-.21.74-.55.94-.34.2-.6.5-.74.86z"/></svg>`}

/* ===================== boot ===================== */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

renderApp();
if (SB_CONFIGURED) {
  pullAndSync().then((ok) => {
    if (ok) renderApp();
  });
} else {
  console.warn("Bigote Fitt: falta configurar SUPABASE_URL / SUPABASE_ANON_KEY en app.js — la app funciona en modo local, sin sincronizar entre celulares.");
}
