import { useState, useEffect, useRef, useCallback } from "react";

/* ================= palette =================
   base    #12151C  deep ink
   surface #1C2029
   line    #2A3040
   text    #EDEFF4 / muted #8A90A0
   phase A(引く/収縮)  #FF6A3D ember
   phase B(伸ばす/伸張) #52B6E8 ice
   rest    #7BD88F
============================================ */

const C = {
  bg: "#12151C", surface: "#1C2029", line: "#2A3040",
  text: "#EDEFF4", muted: "#8A90A0",
  pull: "#FF6A3D", ext: "#52B6E8", rest: "#7BD88F", warn: "#E8C55A",
};

const RPE_LABELS = [
  { v: 1, label: "楽勝", color: "#6FCF97" },
  { v: 2, label: "余裕あり", color: "#9BD86F" },
  { v: 3, label: "ちょうど良い", color: "#E8C55A" },
  { v: 4, label: "キツい", color: "#F2994A" },
  { v: 5, label: "限界", color: "#EB5757" },
];

const HOLD = (sec = 0) => ({ name: "キープ", sec, hold: true });

const DEFAULT_EXERCISES = [
  {
    id: "ex-latpull",
    name: "ラットプルダウン",
    phases: [{ name: "引く", sec: 2 }, HOLD(0), { name: "伸ばす", sec: 3 }],
    reps: 10, sets: 3, interval: 90, weight: 40,
    tips: [
      "肩甲骨を下げてから引き始める",
      "胸を張り、バーは鎖骨に向かって",
      "戻す時こそゆっくり、背中で耐える",
      "腕ではなく肘で引くイメージ",
    ],
  },
  {
    id: "ex-row",
    name: "シーテッドロー",
    phases: [{ name: "引く", sec: 2 }, HOLD(0), { name: "伸ばす", sec: 3 }],
    reps: 10, sets: 3, interval: 90, weight: 35,
    tips: [
      "腰は立てたまま、上体を倒さない",
      "肘を体の後ろまで引き切る",
      "戻しで肩甲骨を開いてストレッチ",
    ],
  },
  {
    id: "ex-squat",
    name: "自重スクワット",
    phases: [{ name: "下ろす", sec: 3 }, HOLD(1), { name: "上げる", sec: 2 }],
    reps: 15, sets: 3, interval: 60, weight: 0,
    tips: [
      "膝とつま先の向きを揃える",
      "かかと重心のまま深くしゃがむ",
      "ボトムで1秒止まると効きが段違い",
      "上げる時に膝を内側に入れない",
    ],
  },
  {
    id: "ex-lunge",
    name: "ランジ",
    phases: [{ name: "下ろす", sec: 2 }, HOLD(0), { name: "上げる", sec: 2 }],
    reps: 10, sets: 3, interval: 60, weight: 0,
    tips: [
      "上体は垂直のまま真下に沈む",
      "前脚のかかとで床を押して戻る",
      "膝がつま先より前に出過ぎない",
      "左右交互に1回ずつで1レップ",
    ],
  },
  {
    id: "ex-free",
    name: "フリーテンポ(汎用)",
    phases: [{ name: "動作①", sec: 3 }, HOLD(0), { name: "動作②", sec: 3 }],
    reps: 10, sets: 3, interval: 60, weight: 0,
    tips: [
      "どの種目でもテンポ管理だけしたい時用",
      "秒数・レップは実行中にも変更できます",
    ],
  },
];

/* ---------- storage ---------- */
async function loadKey(key, fallback) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : fallback;
  } catch { return fallback; }
}
async function saveKey(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); } catch (e) { console.error(e); }
}

/* ---------- audio ---------- */
let audioCtx = null;
function beep(freq = 880, dur = 0.09, gain = 0.15) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.frequency.value = freq; o.type = "sine";
    g.gain.value = gain;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.stop(audioCtx.currentTime + dur);
  } catch {}
}

/* 振動フィードバック(対応端末のみ・iOS Safariは非対応) */
function buzz(pattern = 12) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch {}
}

/* レップごとに音階が上がるチャイム(ペンタトニック) */
const SCALE = [523.25, 587.33, 659.25, 783.99, 880];
function repChime(n) { beep(SCALE[n % SCALE.length], 0.13, 0.22); buzz(45); }
function fanfare(final = false) {
  const seq = final ? [523, 659, 784, 1046, 1318, 1568] : [523, 659, 784, 1046];
  seq.forEach((f, i) => setTimeout(() => beep(f, 0.15, 0.2), i * 90));
  buzz(final ? [80, 50, 80, 50, 140] : [70, 40, 70]);
}

function avgRpe(sets) {
  const vs = sets.map(s => s.rpe).filter(v => v != null);
  if (!vs.length) return null;
  return vs.reduce((a, b) => a + b, 0) / vs.length;
}
function feedbackText(avg) {
  if (avg == null) return null;
  if (avg <= 1.5) return "負荷が軽め。重量アップを検討 ↑";
  if (avg <= 2.5) return "余裕あり。+2.5kg か +1レップいけそう";
  if (avg <= 3.5) return "適正負荷。この調子で継続";
  if (avg <= 4.5) return "高負荷。フォーム維持を最優先に";
  return "限界域。重量かレップを少し落とす選択も";
}
function estTotal(cfg) {
  const perRep = cfg.phases.reduce((a, p) => a + p.sec, 0);
  return perRep * cfg.reps * cfg.sets
    + cfg.interval * Math.max(0, cfg.sets - 1)
    + 5 + 3 * Math.max(0, cfg.sets - 1); // 準備カウントダウン込み
}
/* 実行中の残り時間: 秒数・レップ・セットを途中変更しても即反映 */
function remainingTotal(s, cfg) {
  const perRep = cfg.phases.reduce((a, p) => a + p.sec, 0);
  let t = s.remaining / 1000;
  const setBlock = cfg.reps * perRep;
  if (s.mode === "work") {
    for (let j = s.phaseIdx + 1; j < cfg.phases.length; j++) t += cfg.phases[j].sec;
    t += Math.max(0, cfg.reps - s.repIdx - 1) * perRep;
    const setsAfter = Math.max(0, cfg.sets - s.setIdx - 1);
    t += setsAfter * (cfg.interval + 3 + setBlock);
  } else if (s.mode === "ready") {
    t += setBlock;
    const setsAfter = Math.max(0, cfg.sets - s.setIdx - 1);
    t += setsAfter * (cfg.interval + 3 + setBlock);
  } else if (s.mode === "rest") {
    const setsAfter = Math.max(0, cfg.sets - s.setIdx - 1);
    t += setsAfter * (3 + setBlock) + Math.max(0, setsAfter - 1) * cfg.interval;
  }
  return Math.round(t);
}
function fmtDur(sec) {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m > 0 ? `約${m}分${s > 0 ? s + "秒" : ""}` : `${s}秒`;
}
const fmtW = (w) => (w > 0 ? `${w}kg` : "自重");

/* ---------- Notion連携(GAS Webhook経由) ---------- */
function logPayload(log) {
  const totalReps = log.sets.reduce((a, r) => a + r.reps, 0);
  const volume = log.sets.reduce((a, r) => a + r.weight * r.reps, 0);
  const avg = avgRpe(log.sets);
  return {
    date: log.date,
    exercise: log.exerciseName,
    tempo: log.tempo || "",
    totalReps,
    volume,
    avgRpe: avg != null ? +avg.toFixed(1) : null,
    memo: log.memo || "",
    setsText: log.sets.map((s2, i) =>
      `S${i + 1} ${fmtW(s2.weight)}×${s2.reps}${s2.rpe ? ` RPE${s2.rpe}` : ""}`).join(" / "),
    sets: log.sets,
  };
}
async function postWebhook(url, log) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // preflight回避
      body: JSON.stringify(logPayload(log)),
    });
    return res.ok;
  } catch { return false; }
}

const fmtDate = (iso) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const uid = () => Math.random().toString(36).slice(2, 10);

/* ================================================= */
export default function App() {
  const [view, setView] = useState("home"); // home | edit | workout | history | sync
  const [exercises, setExercises] = useState(null);
  const [logs, setLogs] = useState(null);
  const [webhook, setWebhook] = useState("");
  const [editing, setEditing] = useState(null); // exercise or null(new)
  const [active, setActive] = useState(null);   // exercise being trained

  useEffect(() => {
    (async () => {
      const raw = await loadKey("kt-exercises", null);
      let list;
      if (!raw) {
        list = DEFAULT_EXERCISES;
      } else if (Array.isArray(raw)) {
        // v1 → v2: キープ相を挿入し、新デフォルト種目を追加
        list = raw.map(ex => ex.phases.length === 2
          ? { ...ex, phases: [ex.phases[0], HOLD(0), ex.phases[1]] } : ex);
        const ids = new Set(list.map(e => e.id));
        DEFAULT_EXERCISES.forEach(d => { if (!ids.has(d.id)) list.push(d); });
        saveKey("kt-exercises", { version: 2, list });
      } else {
        list = raw.list;
      }
      setExercises(list);
      setLogs(await loadKey("kt-logs", []));
      setWebhook(await loadKey("kt-webhook", ""));
    })();
  }, []);

  const persistEx = (list) => { setExercises(list); saveKey("kt-exercises", { version: 2, list }); };
  const persistLogs = (list) => { setLogs(list); saveKey("kt-logs", list); };

  if (!exercises || !logs) {
    return <Shell><div style={{ color: C.muted, textAlign: "center", paddingTop: 120 }}>読み込み中…</div></Shell>;
  }

  return (
    <Shell>
      {view === "home" && (
        <Home
          exercises={exercises} logs={logs}
          onStart={(ex) => { setActive(ex); setView("workout"); }}
          onEdit={(ex) => { setEditing(ex); setView("edit"); }}
          onNew={() => { setEditing(null); setView("edit"); }}
          onHistory={() => setView("history")}
          onSync={() => setView("sync")}
          notionOn={!!webhook}
        />
      )}
      {view === "edit" && (
        <ExerciseForm
          initial={editing}
          onSave={(ex) => {
            const list = editing
              ? exercises.map(e => e.id === ex.id ? ex : e)
              : [...exercises, ex];
            persistEx(list); setView("home");
          }}
          onDelete={editing ? () => { persistEx(exercises.filter(e => e.id !== editing.id)); setView("home"); } : null}
          onCancel={() => setView("home")}
        />
      )}
      {view === "workout" && active && (
        <Workout
          exercise={active}
          lastLog={logs.filter(l => l.exerciseId === active.id).slice(-1)[0]}
          onFinish={(log, updatedDefaults) => {
            if (log) {
              const entry = { ...log, synced: false };
              persistLogs([...logs, entry]);
              if (webhook) {
                postWebhook(webhook, entry).then(ok => {
                  if (ok) setLogs(prev => {
                    const upd = prev.map(l => l.id === entry.id ? { ...l, synced: true } : l);
                    saveKey("kt-logs", upd);
                    return upd;
                  });
                });
              }
            }
            if (updatedDefaults) persistEx(exercises.map(e => e.id === active.id ? { ...e, ...updatedDefaults } : e));
            setActive(null); setView("home");
          }}
        />
      )}
      {view === "history" && (
        <History logs={logs} onUpdate={persistLogs} onBack={() => setView("home")} webhook={webhook} />
      )}
      {view === "sync" && (
        <SyncSettings
          webhook={webhook}
          logs={logs}
          onSave={(u) => { setWebhook(u); saveKey("kt-webhook", u); }}
          onUpdateLogs={persistLogs}
          onBack={() => setView("home")}
        />
      )}
    </Shell>
  );
}

/* ---------- shell ---------- */
function Shell({ children }) {
  return (
    <div style={{
      minHeight: "100vh", background: C.bg, color: C.text,
      fontFamily: "'Hiragino Sans','Noto Sans JP',system-ui,sans-serif",
      display: "flex", justifyContent: "center",
    }}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button { font-family: inherit; cursor: pointer; border: none; }
        input, textarea { font-family: inherit; }
        input:focus, textarea:focus, button:focus-visible { outline: 2px solid #52B6E8; outline-offset: 1px; }
        @keyframes ktPulse { 0%,100% { opacity: 0.9; } 50% { opacity: 0.4; } }
        @keyframes ktPop { 0% { transform: scale(1.38); } 60% { transform: scale(0.95); } 100% { transform: scale(1); } }
        @keyframes ktComboPop { 0% { transform: scale(2.9) rotate(-10deg); opacity: 0.1; } 45% { transform: scale(0.85) rotate(4deg); } 70% { transform: scale(1.12) rotate(-2deg); } 100% { transform: scale(1) rotate(0); opacity: 1; } }
        @keyframes ktShake { 0% { transform: translateX(0) scale(1.18); } 18% { transform: translateX(-7px) rotate(-2.5deg); } 36% { transform: translateX(6px) rotate(2deg); } 54% { transform: translateX(-4px) rotate(-1deg); } 72% { transform: translateX(3px); } 100% { transform: translateX(0) scale(1); } }
        @keyframes ktCountIn { 0% { transform: scale(2.1) rotate(-7deg); opacity: 0.2; } 40% { transform: scale(0.85) rotate(4deg); } 70% { transform: scale(1.15) rotate(-2deg); } 100% { transform: scale(1) rotate(0); opacity: 1; } }
        @keyframes ktNumShake { 0% { transform: scale(1.14) translate(0, 0); } 25% { transform: scale(1.17) translate(-4px, 2px) rotate(-1.5deg); } 50% { transform: scale(1.2) translate(4px, -2px) rotate(1.5deg); } 75% { transform: scale(1.17) translate(-3px, -1px) rotate(-1deg); } 100% { transform: scale(1.14) translate(3px, 1px) rotate(1deg); } }
        @keyframes ktGlowRamp { from { filter: brightness(1); box-shadow: 0 0 0 transparent; } to { filter: brightness(2.3); box-shadow: 0 0 26px currentColor, 0 0 52px currentColor; } }
        @keyframes ktBtnPress { 0% { transform: scale(0.85); } 55% { transform: scale(1.09); } 100% { transform: scale(1); } }
        @keyframes ktBtnPress2 { 0% { transform: scale(0.85); } 55% { transform: scale(1.09); } 100% { transform: scale(1); } }
        @keyframes ktScreenIn { 0% { transform: scale(0.82) translateY(36px); opacity: 0; } 55% { transform: scale(1.045) translateY(-5px); opacity: 1; } 78% { transform: scale(0.985) translateY(2px); } 100% { transform: scale(1) translateY(0); } }
        @keyframes ktBurst { 0% { transform: translate(0, 0) scale(1.3); opacity: 1; } 100% { transform: translate(var(--tx), var(--ty)) scale(0.1); opacity: 0; } }
        @keyframes ktConfetti { 0% { transform: translateY(-8vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(85vh) rotate(720deg); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
        .num { font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
      `}</style>
      <div style={{ width: "100%", maxWidth: 480, padding: "16px 16px 40px" }}>{children}</div>
    </div>
  );
}

/* ---------- small ui atoms ---------- */
function Btn({ children, onClick, kind = "ghost", style = {}, big }) {
  const [pressN, setPressN] = useState(0);
  const base = {
    ghost: { background: C.surface, color: C.text, border: `1px solid ${C.line}` },
    primary: { background: C.text, color: C.bg, fontWeight: 700 },
    danger: { background: "transparent", color: "#EB5757", border: "1px solid #4a2a2a" },
  }[kind];
  return (
    <button
      onClick={() => { buzz(12); setPressN(n => n + 1); onClick && onClick(); }}
      style={{
        ...base, borderRadius: 12, padding: big ? "16px 20px" : "10px 14px",
        fontSize: big ? 17 : 14,
        animation: pressN > 0
          ? `${pressN % 2 ? "ktBtnPress" : "ktBtnPress2"} 0.3s cubic-bezier(0.2, 1.5, 0.4, 1)`
          : "none",
        ...style,
      }}>{children}</button>
  );
}

function Stepper({ label, value, unit, onChange, step = 1, min = 0, big }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: C.muted, fontSize: 13, minWidth: 68 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <RoundBtn onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}>−</RoundBtn>
        <span className="num" style={{ fontSize: big ? 22 : 17, fontWeight: 700, minWidth: 64, textAlign: "center" }}>
          {value}<span style={{ fontSize: 12, color: C.muted, marginLeft: 2 }}>{unit}</span>
        </span>
        <RoundBtn onClick={() => onChange(+(value + step).toFixed(1))}>＋</RoundBtn>
      </div>
    </div>
  );
}
function RoundBtn({ children, onClick, size = 40 }) {
  const [pressN, setPressN] = useState(0);
  return (
    <button
      onClick={() => { buzz(10); setPressN(n => n + 1); onClick && onClick(); }}
      style={{
        width: size, height: size, borderRadius: size / 2, background: C.surface,
        border: `1px solid ${C.line}`, color: C.text, fontSize: 18, lineHeight: 1,
        animation: pressN > 0
          ? `${pressN % 2 ? "ktBtnPress" : "ktBtnPress2"} 0.25s cubic-bezier(0.2, 1.5, 0.4, 1)`
          : "none",
      }}>{children}</button>
  );
}

/* ================= HOME ================= */
function Home({ exercises, logs, onStart, onEdit, onNew, onHistory, onSync, notionOn }) {
  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: "0.25em", color: C.muted }}>
            TEMPO TRAINING{notionOn && <span style={{ color: C.rest }}> · Notion連携中</span>}
          </div>
          <h1 style={{ margin: "2px 0 0", fontSize: 26, fontWeight: 800 }}>筋トレタイマー💪</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={onHistory}>履歴</Btn>
          <Btn onClick={onSync}>⚙</Btn>
        </div>
      </header>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {exercises.map(ex => {
          const last = logs.filter(l => l.exerciseId === ex.id).slice(-1)[0];
          const fb = last ? feedbackText(avgRpe(last.sets)) : null;
          return (
            <div key={ex.id} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{ex.name}</div>
                <button onClick={() => onEdit(ex)} style={{ background: "none", color: C.muted, fontSize: 13, padding: 4 }}>編集</button>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, fontSize: 13, color: C.muted }}>
                <span>
                  {ex.phases.filter(p => p.sec > 0).map((p, i, arr) => (
                    <b key={i} style={{ color: p.hold ? C.warn : i === 0 ? C.pull : C.ext }}>
                      {p.name}{p.sec}秒{i < arr.length - 1 ? " / " : ""}
                    </b>
                  ))}
                </span>
                <span>{ex.reps}回 × {ex.sets}セット</span>
                <span>{fmtW(ex.weight)}</span>
                <span>休憩{ex.interval}秒</span>
                <span>⏱ {fmtDur(estTotal(ex))}</span>
              </div>
              {last && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, fontSize: 12.5, color: C.muted }}>
                  前回 {fmtDate(last.date)}: {last.sets.map(s => `${fmtW(s.weight)}×${s.reps}`).join(" / ")}
                  {fb && <div style={{ color: C.warn, marginTop: 3 }}>▸ {fb}</div>}
                </div>
              )}
              <Btn kind="primary" big onClick={() => onStart(ex)} style={{ width: "100%", marginTop: 12 }}>スタート</Btn>
            </div>
          );
        })}
      </div>

      <Btn onClick={onNew} style={{ width: "100%", marginTop: 16, borderStyle: "dashed" }}>＋ 種目を追加</Btn>
    </div>
  );
}

/* ================= FORM ================= */
function ExerciseForm({ initial, onSave, onDelete, onCancel }) {
  const [f, setF] = useState(initial ?? {
    id: "ex-" + uid(), name: "",
    phases: [{ name: "引く", sec: 2 }, HOLD(0), { name: "伸ばす", sec: 3 }],
    reps: 10, sets: 3, interval: 90, weight: 20, tips: [],
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setPhase = (i, k, v) => setF(p => {
    const phases = p.phases.map((ph, j) => j === i ? { ...ph, [k]: v } : ph);
    return { ...p, phases };
  });
  const inputStyle = {
    width: "100%", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 10,
    color: C.text, padding: "10px 12px", fontSize: 15,
  };
  return (
    <div>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>{initial ? "種目を編集" : "種目を追加"}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 13, color: C.muted }}>種目名</label>
          <input style={inputStyle} value={f.name} placeholder="例: ラットプルダウン"
            onChange={e => set("name", e.target.value)} />
        </div>
        {f.phases.map((ph, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: ph.hold ? C.warn : i === 0 ? C.pull : C.ext }}>
                {ph.hold ? "キープ(静止・0で無し)" : `フェーズ${i === 0 ? 1 : 2}の名前`}
              </label>
              <input style={inputStyle} value={ph.name}
                onChange={e => setPhase(i, "name", e.target.value)} />
            </div>
            <div style={{ width: 130 }}>
              <Stepper label="秒数" value={ph.sec} unit="秒" step={1} min={ph.hold ? 0 : 1}
                onChange={v => setPhase(i, "sec", v)} />
            </div>
          </div>
        ))}
        <div style={{ background: C.surface, borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <Stepper label="レップ数" value={f.reps} unit="回" min={1} onChange={v => set("reps", v)} />
          <Stepper label="セット数" value={f.sets} unit="set" min={1} onChange={v => set("sets", v)} />
          <Stepper label="重さ" value={f.weight} unit="kg" step={2.5} onChange={v => set("weight", v)} />
          <Stepper label="休憩" value={f.interval} unit="秒" step={10} min={10} onChange={v => set("interval", v)} />
          <div style={{ fontSize: 13, color: C.muted, textAlign: "right", borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
            予想合計 ⏱ <b style={{ color: C.text }}>{fmtDur(estTotal(f))}</b>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 13, color: C.muted }}>コツ(1行に1つ・実行中に順番に表示)</label>
          <textarea style={{ ...inputStyle, minHeight: 100 }}
            value={f.tips.join("\n")}
            placeholder={"肩甲骨を下げてから引く\n戻す時こそゆっくり"}
            onChange={e => set("tips", e.target.value.split("\n"))} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn onClick={onCancel} style={{ flex: 1 }}>キャンセル</Btn>
          <Btn kind="primary" style={{ flex: 2 }} onClick={() => {
            if (!f.name.trim()) return;
            onSave({ ...f, tips: f.tips.map(t => t.trim()).filter(Boolean) });
          }}>保存</Btn>
        </div>
        {onDelete && <Btn kind="danger" onClick={onDelete}>この種目を削除</Btn>}
      </div>
    </div>
  );
}

/* ================= WORKOUT ================= */
function firstPhaseIdx(cfg) {
  let i = 0;
  while (i < cfg.phases.length - 1 && cfg.phases[i].sec <= 0) i++;
  return i;
}
function nextPhaseIdx(cfg, i) {
  let j = i + 1;
  while (j < cfg.phases.length && cfg.phases[j].sec <= 0) j++;
  return j; // phases.length なら次レップへ
}

function Workout({ exercise, lastLog, onFinish }) {
  // mutable session config
  const [cfg, setCfg] = useState({
    phases: exercise.phases.map(p => ({ ...p })),
    reps: exercise.reps, sets: exercise.sets,
    interval: exercise.interval, weight: exercise.weight,
  });
  const [s, setS] = useState({
    mode: "ready",           // ready | work | rest | done
    setIdx: 0, repIdx: 0, phaseIdx: 0,
    remaining: 5000, duration: 5000,
    paused: false,
    combo: 0,                // 完了レップ数(音ゲー風)
    results: [],             // {reps, weight, rpe}
  });
  const ref = useRef({});
  ref.current = { s, cfg };
  const startTime = useRef(new Date().toISOString());

  /* --- tick --- */
  useEffect(() => {
    const t = setInterval(() => {
      const { s, cfg } = ref.current;
      if (s.paused || s.mode === "done") return;
      const next = { ...s, remaining: s.remaining - 100 };
      if (next.remaining > 0) {
        // countdown ticks in last 3s of rest/ready
        if ((s.mode === "rest" || s.mode === "ready") &&
            Math.ceil(next.remaining / 1000) !== Math.ceil(s.remaining / 1000) &&
            next.remaining <= 3000) beep(660, 0.07, 0.1);
        setS(next); return;
      }
      /* phase expired → advance */
      if (s.mode === "ready") {
        beep(990, 0.12, 0.2); buzz(30);
        const fp = firstPhaseIdx(cfg);
        setS({ ...next, mode: "work", phaseIdx: fp, repIdx: s.repIdx,
          remaining: cfg.phases[fp].sec * 1000, duration: cfg.phases[fp].sec * 1000 });
      } else if (s.mode === "work") {
        const np = nextPhaseIdx(cfg, s.phaseIdx);
        if (np < cfg.phases.length) {
          const ph = cfg.phases[np];
          beep(ph.hold ? 700 : np === cfg.phases.length - 1 ? 520 : 880, 0.1, 0.18); buzz(25);
          setS({ ...next, phaseIdx: np,
            remaining: ph.sec * 1000, duration: ph.sec * 1000 });
        } else if (s.repIdx + 1 < cfg.reps) {
          repChime(s.combo);
          const fp = firstPhaseIdx(cfg);
          setS({ ...next, combo: s.combo + 1, repIdx: s.repIdx + 1, phaseIdx: fp,
            remaining: cfg.phases[fp].sec * 1000, duration: cfg.phases[fp].sec * 1000 });
        } else {
          // set complete
          const results = [...s.results, { reps: cfg.reps, weight: cfg.weight, rpe: null }];
          if (s.setIdx + 1 < cfg.sets) {
            fanfare(false);
            setS({ ...next, mode: "rest", combo: s.combo + 1, results,
              remaining: cfg.interval * 1000, duration: cfg.interval * 1000 });
          } else {
            fanfare(true);
            setS({ ...next, mode: "done", combo: s.combo + 1, results, remaining: 0 });
          }
        }
      } else if (s.mode === "rest") {
        beep(990, 0.15, 0.2); buzz(30);
        setS({ ...next, mode: "ready", setIdx: s.setIdx + 1, repIdx: 0, phaseIdx: 0,
          remaining: 3000, duration: 3000 });
      }
    }, 100);
    return () => clearInterval(t);
  }, []);

  /* --- live adjust helpers --- */
  const adjustPhaseSec = (i, d) => {
    setCfg(c => {
      const phases = c.phases.map((p, j) =>
        j === i ? { ...p, sec: Math.max(p.hold ? 0 : 1, p.sec + d) } : p);
      return { ...c, phases };
    });
    setS(prev => (prev.mode === "work" && prev.phaseIdx === i)
      ? { ...prev, remaining: Math.max(200, prev.remaining + d * 1000), duration: Math.max(1000, prev.duration + d * 1000) }
      : prev);
  };
  const adjustRest = (d) => setS(p => p.mode === "rest"
    ? { ...p, remaining: Math.max(1000, p.remaining + d * 1000), duration: Math.max(1000, p.duration + d * 1000) } : p);
  const setRpe = (setIdx, v) => {
    buzz(25);
    setS(p => ({
      ...p, results: p.results.map((r, i) => i === setIdx ? { ...r, rpe: v } : r),
    }));
  };
  const editResult = (i, k, v) => setS(p => ({
    ...p, results: p.results.map((r, j) => j === i ? { ...r, [k]: v } : r),
  }));

  const quit = () => {
    if (s.results.length === 0) { onFinish(null, null); return; }
    setS(p => ({ ...p, mode: "done" }));
  };

  /* ---------- render ---------- */
  if (s.mode === "done") {
    return <DoneScreen exercise={exercise} cfg={cfg} results={s.results}
      startTime={startTime.current} editResult={editResult} onFinish={onFinish} />;
  }

  const phase = cfg.phases[s.phaseIdx];
  const isWork = s.mode === "work";
  const isRest = s.mode === "rest";
  const isHold = isWork && phase.hold;
  const color = isRest ? C.rest : !isWork ? C.muted
    : phase.hold ? C.warn : s.phaseIdx === 0 ? C.pull : C.ext;
  const p = 1 - s.remaining / s.duration; // 0→1
  const secDisp = Math.ceil(s.remaining / 1000);
  // 伸縮バー: フェーズ1で縮む / キープで維持(点滅) / 最終フェーズで広がる
  const MINW = 26; // 切り返し位置の幅(%)
  const lastIdx = cfg.phases.length - 1;
  const barW = !isWork ? 100
    : s.phaseIdx === 0 ? 100 - (100 - MINW) * p
    : s.phaseIdx === lastIdx ? MINW + (100 - MINW) * p
    : MINW;
  const imminent = isWork && !s.paused && s.remaining <= 800; // 切り返し直前
  const tip = exercise.tips.length
    ? exercise.tips[(s.repIdx + s.setIdx) % exercise.tips.length] : null;

/* 切り返し時の粒子バースト: 外リング12発(遠く)+内リング8発(近く) */
const BURST = [
  ...Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return { tx: Math.cos(a) * 150, ty: Math.sin(a) * 70, size: 8, dur: 0.7, delay: 0 };
  }),
  ...Array.from({ length: 8 }, (_, i) => {
    const a = ((i + 0.5) / 8) * Math.PI * 2;
    return { tx: Math.cos(a) * 80, ty: Math.sin(a) * 40, size: 6, dur: 0.5, delay: 0.05 };
  }),
];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "88vh",
      animation: "ktScreenIn 0.6s cubic-bezier(0.18, 1.6, 0.35, 1)" }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>{exercise.name}</div>
        <button onClick={quit} style={{ background: "none", color: C.muted, fontSize: 13 }}>終了</button>
      </div>

      {/* set / rep indicators */}
      <div style={{ display: "flex", gap: 14, fontSize: 13, color: C.muted, marginBottom: 6 }}>
        <span>セット <b className="num" style={{ color: C.text, fontSize: 16 }}>{s.setIdx + 1}</b>/{cfg.sets}</span>
        <span>レップ <b className="num" style={{ color: C.text, fontSize: 16 }}>{isWork ? s.repIdx + 1 : "-"}</b>/{cfg.reps}</span>
        <span className="num">{fmtW(cfg.weight)}</span>
        <span className="num" style={{ marginLeft: "auto" }}>残り {fmtDur(remainingTotal(s, cfg))}</span>
      </div>

      {/* 全体進捗バー(セットごとに区切り) */}
      <div style={{ display: "flex", gap: 4, margin: "2px 0 10px" }}>
        {Array.from({ length: cfg.sets }).map((_, i) => {
          const perRep = cfg.phases.reduce((a, ph) => a + ph.sec, 0) || 1;
          const phaseElapsed = cfg.phases.slice(0, s.phaseIdx).reduce((a, ph) => a + ph.sec, 0)
            + (s.duration - s.remaining) / 1000;
          const repFrac = isWork ? Math.min(1, (s.repIdx + phaseElapsed / perRep) / cfg.reps) : 0;
          const fill = i < s.results.length ? 1 : (i === s.setIdx && isWork ? repFrac : 0);
          return (
            <div key={i} style={{ flex: 1, height: 6, background: C.line, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${fill * 100}%`, height: "100%", borderRadius: 3,
                background: fill >= 1 ? C.rest : color, transition: "width 0.1s linear" }} />
            </div>
          );
        })}
      </div>

      {/* ===== main visual ===== */}
      <div style={{
        borderRadius: 20, border: `1px solid ${C.line}`,
        background: `radial-gradient(ellipse at 50% 0%, ${color}22, ${C.surface} 70%)`,
        padding: "28px 16px", textAlign: "center", transition: "background 0.4s",
      }}>
        <div style={{ fontSize: 13, letterSpacing: "0.2em", color: isWork ? C.warn : C.muted, height: 18 }}>
          {isRest ? "インターバル" : s.mode === "ready" ? "準備"
            : s.combo > 0 ? (
              <span key={s.combo} style={{
                display: "inline-block", fontWeight: 800,
                animation: "ktComboPop 0.4s cubic-bezier(0.2, 1.6, 0.4, 1)",
                textShadow: `0 0 14px ${C.warn}99`,
              }}>
                COMBO ×{s.combo}
              </span>
            ) : ""}
        </div>
        <div key={isWork ? `ph-${s.setIdx}-${s.repIdx}-${s.phaseIdx}` : s.mode}
          style={{
            fontSize: isRest ? 30 : 44, fontWeight: 800, color, margin: "2px 0",
            transition: "color 0.3s",
            animation: isWork ? "ktShake 0.45s cubic-bezier(0.2, 1.4, 0.4, 1)" : "none",
            textShadow: isWork ? `0 0 18px ${color}55` : "none",
          }}>
          {isRest ? "休憩" : s.mode === "ready" ? "スタートまで" : phase.name}
        </div>
        <div
          key={s.mode === "ready" ? `cd-${secDisp}` : `${s.setIdx}-${s.repIdx}-${s.phaseIdx}`}
          className="num"
          style={{
            fontSize: 88, fontWeight: 800, lineHeight: 1,
            color: imminent ? color : C.text,
            textShadow: imminent ? `0 0 22px ${color}` : "none",
            animation: imminent ? "ktNumShake 0.13s linear infinite"
              : s.mode === "ready" ? "ktCountIn 0.5s cubic-bezier(0.2, 1.5, 0.4, 1)"
              : "ktPop 0.25s ease-out",
          }}>
          {secDisp}
        </div>

        {/* 伸縮バー: 点線=可動域、縦ライン=切り返し位置(ここまで縮んだら折り返し) */}
        <div style={{ height: 22, marginTop: 22, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: 11, border: `1px dashed ${C.line}` }} />
          {isWork && (
            <div style={{
              position: "absolute", top: -4, bottom: -4, left: "37%", width: "26%",
              borderLeft: `2px solid ${color}`, borderRight: `2px solid ${color}`,
              opacity: imminent ? 1 : 0.55, borderRadius: 4, transition: "border-color 0.3s, opacity 0.2s",
            }} />
          )}
          <div style={{ position: "absolute", inset: 3, display: "flex", justifyContent: "center" }}>
            <div style={{
              width: `${barW}%`, height: "100%", borderRadius: 8,
              background: color, color: color, opacity: 0.95,
              transition: "width 0.1s linear, background 0.3s",
              animation: imminent ? "ktGlowRamp 0.8s ease-in forwards"
                : isHold ? "ktPulse 1s ease-in-out infinite" : "none",
            }} />
          </div>
          {/* 粒子バースト(フェーズ切替ごとに発火) */}
          {isWork && (
            <div key={`bu-${s.setIdx}-${s.repIdx}-${s.phaseIdx}`}
              style={{ position: "absolute", left: "50%", top: "50%" }}>
              {BURST.map((b, i) => (
                <span key={i} style={{
                  position: "absolute", width: b.size, height: b.size, borderRadius: b.size,
                  background: color, boxShadow: `0 0 ${b.size}px ${color}`,
                  "--tx": `${b.tx}px`, "--ty": `${b.ty}px`,
                  animation: `ktBurst ${b.dur}s cubic-bezier(0.1, 0.8, 0.3, 1) ${b.delay}s forwards`,
                }} />
              ))}
            </div>
          )}
        </div>
        {/* 次フェーズ予告 */}
        {isWork && (() => {
          const np = nextPhaseIdx(cfg, s.phaseIdx);
          const nxt = np < cfg.phases.length ? cfg.phases[np].name
            : s.repIdx + 1 < cfg.reps ? cfg.phases[firstPhaseIdx(cfg)].name
            : s.setIdx + 1 < cfg.sets ? "休憩" : "完了 🏁";
          return (
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 10 }}>
              次 → <b style={{ color: C.text }}>{nxt}</b>
            </div>
          );
        })()}
        {/* progress line (rest) */}
        {isRest && (
          <div style={{ height: 4, background: C.line, borderRadius: 2, marginTop: 10 }}>
            <div style={{ height: "100%", width: `${p * 100}%`, background: C.rest, borderRadius: 2 }} />
          </div>
        )}
      </div>

      {/* ===== tips (work) / RPE check (rest) ===== */}
      {!isRest && tip && (
        <div style={{
          marginTop: 14, padding: "12px 16px", borderRadius: 14,
          background: C.surface, border: `1px solid ${C.line}`, fontSize: 15, lineHeight: 1.5,
        }}>
          <span style={{ color: C.warn, marginRight: 6 }}>💡</span>{tip}
        </div>
      )}

      {isRest && (
        <div style={{ marginTop: 14, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
          {s.results.length > 1 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {s.results.slice(0, -1).map((r, i) => {
                const l = RPE_LABELS.find(x => x.v === r.rpe);
                return (
                  <span key={i} style={{
                    fontSize: 11, padding: "3px 9px", borderRadius: 9,
                    background: C.bg, border: `1px solid ${l ? l.color : C.line}`,
                    color: l ? l.color : C.muted,
                  }}>S{i + 1} {l ? `${l.v} ${l.label}` : "未記録"}</span>
                );
              })}
            </div>
          )}
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>
            いまのセット({s.setIdx + 1}セット目)の負荷は?
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {RPE_LABELS.map(r => {
              const sel = s.results[s.setIdx]?.rpe === r.v;
              return (
                <button key={r.v} onClick={() => setRpe(s.setIdx, r.v)} style={{
                  flex: 1, padding: "10px 2px", borderRadius: 10, fontSize: 11.5, lineHeight: 1.3,
                  background: sel ? r.color : C.bg, color: sel ? "#12151C" : C.muted,
                  border: `1px solid ${sel ? r.color : C.line}`, fontWeight: sel ? 700 : 400,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{r.v}</div>{r.label}
                </button>
              );
            })}
          </div>
          {s.results[s.setIdx]?.rpe != null && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: C.warn }}>
              ▸ {feedbackText(s.results[s.setIdx].rpe)}
            </div>
          )}
        </div>
      )}

      {/* ===== live controls ===== */}
      <div style={{ marginTop: 14, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {isRest ? (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => adjustRest(-10)} style={{ flex: 1 }}>−10秒</Btn>
              <Btn onClick={() => adjustRest(10)} style={{ flex: 1 }}>＋10秒</Btn>
              <Btn onClick={() => setS(p2 => ({ ...p2, remaining: 100 }))} style={{ flex: 1 }}>スキップ</Btn>
            </div>
            <Stepper label="次の重さ" value={cfg.weight} unit="kg" step={2.5}
              onChange={v => setCfg(c => ({ ...c, weight: v }))} />
            <Stepper label="次のレップ" value={cfg.reps} unit="回" min={1}
              onChange={v => setCfg(c => ({ ...c, reps: v }))} />
          </>
        ) : (
          <>
            {cfg.phases.map((ph, i) => (
              <Stepper key={i} label={ph.hold ? `${ph.name}(静止)` : ph.name} value={ph.sec} unit="秒" min={ph.hold ? 0 : 1}
                onChange={v => adjustPhaseSec(i, v - ph.sec)} />
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <Stepper label="レップ" value={cfg.reps} unit="回" min={Math.max(1, s.repIdx + 1)}
                onChange={v => setCfg(c => ({ ...c, reps: v }))} />
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <Btn big style={{ flex: 1 }} onClick={() => setS(p2 => ({ ...p2, paused: !p2.paused }))}>
            {s.paused ? "▶ 再開" : "⏸ 一時停止"}
          </Btn>
          {isRest && (
            <>
              <Btn big style={{ flex: 1 }} onClick={() => setCfg(c => ({ ...c, sets: c.sets + 1 }))}>＋1セット</Btn>
              <Btn big style={{ flex: 1 }} onClick={() => {
                const newSets = Math.max(s.results.length, cfg.sets - 1);
                setCfg(c => ({ ...c, sets: newSets }));
                if (newSets <= s.results.length) {
                  fanfare(true);
                  setS(p2 => ({ ...p2, mode: "done" }));
                }
              }}>−1セット</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= DONE ================= */
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: (i % 14) * 0.13,
  dur: 1.8 + (i % 5) * 0.45,
  color: ["#FF6A3D", "#52B6E8", "#7BD88F", "#E8C55A"][i % 4],
  size: 6 + (i % 3) * 3,
}));

function DoneScreen({ exercise, cfg, results, startTime, editResult, onFinish }) {
  const [memo, setMemo] = useState("");
  const [saveDefaults, setSaveDefaults] = useState(true);
  const avg = avgRpe(results);
  const fb = feedbackText(avg);
  const totalReps = results.reduce((a, r) => a + r.reps, 0);
  const volume = results.reduce((a, r) => a + r.weight * r.reps, 0);
  const elapsed = Math.max(0, Math.round((Date.now() - new Date(startTime).getTime()) / 1000));

  return (
    <div>
      {/* 紙吹雪 */}
      <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {CONFETTI.map((c, i) => (
          <div key={i} style={{
            position: "absolute", top: 0, left: `${c.left}%`,
            width: c.size, height: c.size * 1.6, background: c.color, borderRadius: 2,
            animation: `ktConfetti ${c.dur}s ease-in ${c.delay}s both`,
          }} />
        ))}
      </div>

      <div style={{ textAlign: "center", margin: "24px 0 16px" }}>
        <div style={{ fontSize: 40 }}>🏁</div>
        <h2 style={{ margin: "6px 0 2px", fontSize: 22 }}>{exercise.name} 完了!</h2>
        <div style={{ color: C.muted, fontSize: 13 }}>内容は保存前に修正できます</div>
        {/* 100%進捗バー */}
        <div style={{ height: 8, background: C.line, borderRadius: 4, margin: "14px 0 0" }}>
          <div style={{ height: "100%", width: "100%", borderRadius: 4, background: C.rest, transition: "width 0.8s ease-out" }} />
        </div>
        {/* 達成サマリー */}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {[
            { label: "セット", val: `${results.length}` },
            { label: "合計レップ", val: `${totalReps}` },
            volume > 0
              ? { label: "総挙上量", val: `${volume}kg` }
              : { label: "所要時間", val: fmtDur(elapsed).replace("約", "") },
          ].map((st, i) => (
            <div key={i} style={{ flex: 1, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 4px" }}>
              <div className="num" style={{ fontSize: 22, fontWeight: 800 }}>{st.val}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{st.label}</div>
            </div>
          ))}
        </div>
        {volume > 0 && (
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>所要 {fmtDur(elapsed)}</div>
        )}
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {results.map((r, i) => (
          <div key={i} style={{ borderBottom: i < results.length - 1 ? `1px solid ${C.line}` : "none", paddingBottom: i < results.length - 1 ? 14 : 0 }}>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>セット {i + 1}</div>
            <Stepper label="レップ" value={r.reps} unit="回" min={0} onChange={v => editResult(i, "reps", v)} />
            <div style={{ height: 8 }} />
            <Stepper label="重さ" value={r.weight} unit="kg" step={2.5} onChange={v => editResult(i, "weight", v)} />
            <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
              {RPE_LABELS.map(l => {
                const sel = r.rpe === l.v;
                return (
                  <button key={l.v} onClick={() => editResult(i, "rpe", l.v)} style={{
                    flex: 1, padding: "7px 2px", borderRadius: 8, fontSize: 11,
                    background: sel ? l.color : C.bg, color: sel ? "#12151C" : C.muted,
                    border: `1px solid ${sel ? l.color : C.line}`, fontWeight: sel ? 700 : 400,
                  }}>{l.v} {l.label}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {fb && (
        <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "#2a2416", color: C.warn, fontSize: 14 }}>
          今日の平均RPE {avg.toFixed(1)} — {fb}
        </div>
      )}

      <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="メモ(任意)"
        style={{ width: "100%", marginTop: 12, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, color: C.text, padding: 12, fontSize: 14, minHeight: 64 }} />

      <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 13.5, color: C.muted }}>
        <input type="checkbox" checked={saveDefaults} onChange={e => setSaveDefaults(e.target.checked)} />
        今日の重さ・レップ・秒数を次回のデフォルトにする
      </label>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Btn onClick={() => onFinish(null, null)} style={{ flex: 1 }}>保存せず終了</Btn>
        <Btn kind="primary" big style={{ flex: 2 }} onClick={() => {
          const log = {
            id: "log-" + uid(), exerciseId: exercise.id, exerciseName: exercise.name,
            date: startTime, sets: results, memo: memo.trim(),
            tempo: cfg.phases.filter(p => p.sec > 0).map(p => `${p.name}${p.sec}秒`).join("/"),
          };
          const defaults = saveDefaults ? {
            weight: cfg.weight, reps: cfg.reps, sets: Math.max(exercise.sets, results.length),
            interval: cfg.interval, phases: cfg.phases,
          } : null;
          onFinish(log, defaults);
        }}>記録を保存</Btn>
      </div>
    </div>
  );
}

/* ================= SYNC SETTINGS ================= */
function SyncSettings({ webhook, logs, onSave, onUpdateLogs, onBack }) {
  const [url, setUrl] = useState(webhook);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const unsynced = logs.filter(l => !l.synced);

  const testSend = async () => {
    if (!url.trim()) { setStatus("URLを入力してください"); return; }
    setBusy(true); setStatus("テスト送信中…");
    const dummy = {
      id: "test", exerciseName: "接続テスト", date: new Date().toISOString(),
      tempo: "テスト2秒/テスト3秒", memo: "アプリからの接続テストです",
      sets: [{ reps: 1, weight: 0, rpe: 3 }],
    };
    const ok = await postWebhook(url.trim(), dummy);
    setStatus(ok ? "✓ 送信成功! NotionのDBを確認してください" : "✗ 送信失敗。URL・GASのデプロイ設定を確認してください");
    setBusy(false);
  };

  const resend = async () => {
    if (!url.trim() || unsynced.length === 0) return;
    setBusy(true);
    let okCount = 0;
    let updated = [...logs];
    for (const l of unsynced) {
      setStatus(`送信中… (${okCount + 1}/${unsynced.length})`);
      const ok = await postWebhook(url.trim(), l);
      if (ok) { okCount++; updated = updated.map(x => x.id === l.id ? { ...x, synced: true } : x); }
    }
    onUpdateLogs(updated);
    setStatus(`✓ ${okCount}/${unsynced.length} 件をNotionに送信しました`);
    setBusy(false);
  };

  const inputStyle = {
    width: "100%", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 10,
    color: C.text, padding: "10px 12px", fontSize: 13,
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>Notion連携</h2>
        <Btn onClick={onBack}>戻る</Btn>
      </div>

      <div style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, fontSize: 13, color: C.muted, lineHeight: 1.7 }}>
        保存した記録を、GAS(Google Apps Script)のWebhook経由でNotionのデータベースに自動送信します。
        GAS側のセットアップ手順とコードは同梱の <b style={{ color: C.text }}>gas-notion-proxy.gs</b> を参照。
        デプロイで発行された「ウェブアプリのURL」を下に貼り付けてください。
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={{ fontSize: 13, color: C.muted }}>GAS WebアプリのURL</label>
        <input style={inputStyle} value={url} placeholder="https://script.google.com/macros/s/…/exec"
          onChange={e => setUrl(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Btn style={{ flex: 1 }} onClick={busy ? null : testSend}>テスト送信</Btn>
        <Btn kind="primary" style={{ flex: 1 }} onClick={() => { onSave(url.trim()); setStatus("✓ 保存しました"); }}>保存</Btn>
      </div>

      {url.trim() && unsynced.length > 0 && (
        <Btn style={{ width: "100%", marginTop: 10 }} onClick={busy ? null : resend}>
          未送信の記録 {unsynced.length}件 をNotionへ送信
        </Btn>
      )}

      {webhook && (
        <Btn kind="danger" style={{ width: "100%", marginTop: 10 }}
          onClick={() => { setUrl(""); onSave(""); setStatus("連携を解除しました"); }}>連携を解除</Btn>
      )}

      {status && (
        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: C.surface, fontSize: 13.5 }}>
          {status}
        </div>
      )}
    </div>
  );
}

/* ================= HISTORY ================= */
function History({ logs, onUpdate, onBack, webhook }) {
  const [openId, setOpenId] = useState(null);
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const editSet = (logId, setIdx, k, v) => {
    onUpdate(logs.map(l => l.id !== logId ? l : {
      ...l, sets: l.sets.map((s, i) => i === setIdx ? { ...s, [k]: v } : s),
    }));
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, margin: 0 }}>トレーニング履歴</h2>
        <Btn onClick={onBack}>戻る</Btn>
      </div>
      {sorted.length === 0 && (
        <div style={{ color: C.muted, textAlign: "center", padding: "60px 0" }}>
          まだ記録がありません。<br />ホームから種目をスタートすると記録されます。
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(l => {
          const avg = avgRpe(l.sets);
          const open = openId === l.id;
          return (
            <div key={l.id} style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
              <div onClick={() => setOpenId(open ? null : l.id)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <b>{l.exerciseName}
                    {l.synced && <span style={{ fontSize: 10.5, color: C.rest, marginLeft: 6 }}>✓ Notion</span>}
                    {!l.synced && webhook && <span style={{ fontSize: 10.5, color: C.muted, marginLeft: 6 }}>未送信</span>}
                  </b>
                  <span style={{ color: C.muted, fontSize: 12.5 }}>{fmtDate(l.date)}</span>
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                  {l.sets.map(s => `${fmtW(s.weight)}×${s.reps}`).join(" / ")}
                  {avg != null && <span style={{ marginLeft: 8, color: C.warn }}>RPE {avg.toFixed(1)}</span>}
                  <span style={{ marginLeft: 8 }}>{l.tempo}</span>
                </div>
                {l.memo && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4 }}>📝 {l.memo}</div>}
              </div>
              {open && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 12 }}>
                  {l.sets.map((s, i) => (
                    <div key={i}>
                      <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>セット{i + 1}</div>
                      <Stepper label="レップ" value={s.reps} unit="回" min={0} onChange={v => editSet(l.id, i, "reps", v)} />
                      <div style={{ height: 6 }} />
                      <Stepper label="重さ" value={s.weight} unit="kg" step={2.5} onChange={v => editSet(l.id, i, "weight", v)} />
                      <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                        {RPE_LABELS.map(r => {
                          const sel = s.rpe === r.v;
                          return (
                            <button key={r.v} onClick={() => editSet(l.id, i, "rpe", r.v)} style={{
                              flex: 1, padding: "6px 2px", borderRadius: 8, fontSize: 10.5,
                              background: sel ? r.color : C.bg, color: sel ? "#12151C" : C.muted,
                              border: `1px solid ${sel ? r.color : C.line}`,
                            }}>{r.v}</button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <Btn kind="danger" onClick={() => onUpdate(logs.filter(x => x.id !== l.id))}>この記録を削除</Btn>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
