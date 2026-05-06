import { useState, useEffect, useCallback } from "react";

// ── helpers ──────────────────────────────────────────────────────────────────
const MONTHS_UZ = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
const DAYS_UZ   = ["Du","Se","Ch","Pa","Ju","Sh","Ya"];

function formatSum(n) {
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,"") + " mln";
  if (n >= 1_000)     return (n/1_000).toFixed(0) + " K";
  return n.toString();
}

function formatFull(n) {
  return n.toLocaleString("uz-UZ") + " so'm";
}

function getDayColor(total) {
  if (total === 0)              return "empty";
  if (total <= 100_000)         return "green";
  if (total <= 200_000)         return "yellow";
  return "red";
}

function getMonthDays(year, month) {
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return { startDow, daysInMonth };
}

function dateKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function loadData() {
  try { return JSON.parse(localStorage.getItem("xarajat_v2") || "{}"); }
  catch { return {}; }
}

function saveData(data) {
  localStorage.setItem("xarajat_v2", JSON.stringify(data));
}

// ── icons ────────────────────────────────────────────────────────────────────
const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const ChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"/>
  </svg>
);
const ChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"/>
  </svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function StatsBar({ data, year, month }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let monthTotal = 0, activeDays = 0, maxDay = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(year, month, d);
    const items = data[key] || [];
    const s = items.reduce((a, b) => a + b.amount, 0);
    monthTotal += s;
    if (s > 0) activeDays++;
    if (s > maxDay) maxDay = s;
  }
  const avgDay = activeDays ? Math.round(monthTotal / activeDays) : 0;

  // yearly
  let yearTotal = 0;
  for (let m = 0; m < 12; m++) {
    const dm = new Date(year, m + 1, 0).getDate();
    for (let d = 1; d <= dm; d++) {
      const key = dateKey(year, m, d);
      const items = data[key] || [];
      yearTotal += items.reduce((a, b) => a + b.amount, 0);
    }
  }

  const stats = [
    { label: "Oylik jami", value: formatFull(monthTotal), accent: "#4ade80" },
    { label: "Kunlik o'rtacha", value: formatFull(avgDay), accent: "#facc15" },
    { label: "Eng ko'p kun", value: formatFull(maxDay), accent: "#f87171" },
    { label: "Yillik jami", value: formatFull(yearTotal), accent: "#a78bfa" },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px",
      marginBottom: "24px",
    }}>
      {stats.map(s => (
        <div key={s.label} style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "14px", padding: "14px 16px", position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: "2px",
            background: s.accent, borderRadius: "2px 2px 0 0",
          }}/>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginBottom: "6px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{s.label}</div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Monthly Sparkline ─────────────────────────────────────────────────────────
function MonthlyChart({ data, year }) {
  const months = Array.from({length: 12}, (_, m) => {
    const dm = new Date(year, m + 1, 0).getDate();
    let total = 0;
    for (let d = 1; d <= dm; d++) {
      const items = data[dateKey(year, m, d)] || [];
      total += items.reduce((a, b) => a + b.amount, 0);
    }
    return total;
  });
  const max = Math.max(...months, 1);
  const W = 600, H = 90, padX = 20, padY = 10;
  const colW = (W - padX*2) / 12;

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: "16px", padding: "16px 20px", marginBottom: "24px",
    }}>
      <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "12px", textTransform: "uppercase" }}>
        {year} — Oylar bo'yicha xarajat
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%", height:"auto", overflow:"visible"}}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa"/>
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.4"/>
          </linearGradient>
        </defs>
        {months.map((v, i) => {
          const bH = v ? Math.max(4, ((v / max) * (H - padY*2))) : 0;
          const x = padX + i * colW + colW*0.15;
          const w = colW * 0.7;
          const y = H - padY - bH;
          return (
            <g key={i}>
              <rect x={x} y={y} width={w} height={bH} rx="4" fill="url(#barGrad)" opacity="0.85"/>
              <text x={x + w/2} y={H - 1} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9" fontWeight="600">
                {MONTHS_UZ[i].slice(0,3)}
              </text>
              {v > 0 && (
                <text x={x + w/2} y={y - 4} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="8.5" fontWeight="700">
                  {formatSum(v)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Day Modal ─────────────────────────────────────────────────────────────────
function DayModal({ dateStr, data, onClose, onSave }) {
  const [items, setItems]   = useState(() => (data[dateStr] || []).map(i => ({...i})));
  const [name, setName]     = useState("");
  const [amount, setAmount] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editAmt, setEditAmt]   = useState("");
  const [shake, setShake]   = useState(false);

  const total = items.reduce((a, b) => a + b.amount, 0);

  const [d, m, y] = dateStr.split("-").reverse().map(Number);
  const displayDate = `${d < 10 ? "0"+d : d} ${MONTHS_UZ[m-1]} ${y}`;

  const addItem = () => {
    if (!name.trim() || !amount) { setShake(true); setTimeout(() => setShake(false), 500); return; }
    const n = parseInt(amount.replace(/\s/g,""), 10);
    if (isNaN(n) || n <= 0) return;
    setItems(prev => [...prev, { id: Date.now(), name: name.trim(), amount: n }]);
    setName(""); setAmount("");
  };

  const deleteItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const startEdit = (item) => {
    setEditId(item.id);
    setEditName(item.name);
    setEditAmt(String(item.amount));
  };

  const saveEdit = (id) => {
    const n = parseInt(editAmt.replace(/\s/g,""), 10);
    if (!editName.trim() || isNaN(n) || n <= 0) return;
    setItems(prev => prev.map(i => i.id === id ? {...i, name: editName.trim(), amount: n} : i));
    setEditId(null);
  };

  const handleSave = () => {
    onSave(dateStr, items);
    onClose();
  };

  const catColors = ["#f87171","#fb923c","#facc15","#4ade80","#34d399","#60a5fa","#a78bfa","#f472b6","#e879f9","#38bdf8"];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      animation: "fadeIn 0.2s ease",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: "min(560px, 95vw)", maxHeight: "90vh", display: "flex", flexDirection: "column",
        background: "#0f0f1a", border: "1px solid rgba(167,139,250,0.25)", borderRadius: "24px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(167,139,250,0.1)",
        animation: "slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px 24px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>{displayDate}</div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
              Kunlik xarajatlar
            </div>
          </div>
          <button onClick={onClose} style={{
            width: "36px", height: "36px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CloseIcon/>
          </button>
        </div>

        {/* Add row */}
        <div style={{
          padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", gap: "10px", animation: shake ? "shake 0.4s ease" : "none" }}>
            <input
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addItem()}
              placeholder="Xarajat nomi..."
              style={{
                flex: 2, padding: "11px 14px", borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
                color: "#fff", fontSize: "14px", outline: "none", fontFamily: "inherit",
                transition: "border-color 0.2s",
              }}
              onFocus={e => e.target.style.borderColor = "rgba(167,139,250,0.5)"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
            <input
              value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g,""))}
              onKeyDown={e => e.key === "Enter" && addItem()}
              placeholder="Summa..."
              type="text" inputMode="numeric"
              style={{
                flex: 1, padding: "11px 14px", borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
                color: "#fff", fontSize: "14px", outline: "none", fontFamily: "inherit",
                transition: "border-color 0.2s",
              }}
              onFocus={e => e.target.style.borderColor = "rgba(167,139,250,0.5)"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
            <button onClick={addItem} style={{
              width: "44px", height: "44px", borderRadius: "12px", border: "none",
              background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "transform 0.15s, opacity 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
              onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
            >
              <PlusIcon/>
            </button>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 24px" }}>
          {items.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)",
              fontSize: "14px",
            }}>
              Hali xarajat qo'shilmagan
            </div>
          ) : (
            items.map((item, idx) => (
              <div key={item.id} style={{
                display: "flex", alignItems: "center", gap: "12px",
                padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                animation: "fadeIn 0.2s ease",
              }}>
                <div style={{
                  width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                  background: catColors[idx % catColors.length],
                }}/>
                {editId === item.id ? (
                  <>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      style={{
                        flex: 2, padding: "7px 10px", borderRadius: "8px",
                        border: "1px solid rgba(167,139,250,0.4)", background: "rgba(255,255,255,0.07)",
                        color: "#fff", fontSize: "14px", outline: "none", fontFamily: "inherit",
                      }}/>
                    <input value={editAmt} onChange={e => setEditAmt(e.target.value.replace(/[^\d]/g,""))}
                      type="text" inputMode="numeric"
                      style={{
                        flex: 1, padding: "7px 10px", borderRadius: "8px",
                        border: "1px solid rgba(167,139,250,0.4)", background: "rgba(255,255,255,0.07)",
                        color: "#fff", fontSize: "14px", outline: "none", fontFamily: "inherit",
                      }}/>
                    <button onClick={() => saveEdit(item.id)} style={{
                      width: "32px", height: "32px", borderRadius: "8px", border: "none",
                      background: "#4ade80", color: "#000", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}><CheckIcon/></button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, color: "rgba(255,255,255,0.85)", fontSize: "14px" }}>{item.name}</span>
                    <span style={{
                      fontWeight: 700, fontSize: "14px", color: "#fff",
                      background: "rgba(255,255,255,0.06)", padding: "3px 10px", borderRadius: "8px",
                    }}>
                      {item.amount.toLocaleString("uz-UZ")}
                    </span>
                    <button onClick={() => startEdit(item)} style={{
                      width: "30px", height: "30px", borderRadius: "8px",
                      border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.5)", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}><EditIcon/></button>
                    <button onClick={() => deleteItem(item.id)} style={{
                      width: "30px", height: "30px", borderRadius: "8px",
                      border: "1px solid rgba(255,80,80,0.2)", background: "rgba(255,80,80,0.07)",
                      color: "#f87171", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}><TrashIcon/></button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Jami</div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
              {total.toLocaleString("uz-UZ")} <span style={{ fontSize: "14px", fontWeight: 500, color: "rgba(255,255,255,0.4)" }}>so'm</span>
            </div>
          </div>
          <button onClick={handleSave} style={{
            padding: "12px 28px", borderRadius: "14px", border: "none",
            background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff",
            fontSize: "14px", fontWeight: 700, cursor: "pointer", letterSpacing: "0.01em",
            transition: "transform 0.15s, box-shadow 0.15s",
            boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(124,58,237,0.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(124,58,237,0.4)"; }}
          >
            Saqlash
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideUp { from { opacity:0; transform:translateY(30px) scale(0.96) } to { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
      `}</style>
    </div>
  );
}

// ── Main Calendar ─────────────────────────────────────────────────────────────
export default function App() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [data,  setData]  = useState(loadData);
  const [modal, setModal] = useState(null); // dateStr

  const handleSave = useCallback((dateStr, items) => {
    setData(prev => {
      const next = { ...prev, [dateStr]: items };
      if (items.length === 0) delete next[dateStr];
      saveData(next);
      return next;
    });
  }, []);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const { startDow, daysInMonth } = getMonthDays(year, month);

  // color map
  const colorMap = {
    empty:  { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.06)", dot: null },
    green:  { bg: "rgba(74,222,128,0.1)",   border: "rgba(74,222,128,0.3)",   dot: "#4ade80" },
    yellow: { bg: "rgba(250,204,21,0.1)",   border: "rgba(250,204,21,0.3)",   dot: "#facc15" },
    red:    { bg: "rgba(248,113,113,0.1)",  border: "rgba(248,113,113,0.3)",  dot: "#f87171" },
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080812",
      fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
      padding: "24px 16px 48px",
      color: "#fff",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,800;0,9..40,900&display=swap');
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px }
        ::-webkit-scrollbar-track { background:transparent }
        ::-webkit-scrollbar-thumb { background:rgba(167,139,250,0.3); border-radius:4px }
        input::placeholder { color:rgba(255,255,255,0.2) }
        .day-cell:hover { transform:translateY(-2px) !important; box-shadow:0 6px 20px rgba(0,0,0,0.4) !important; cursor:pointer; }
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(167,139,250,0.4) }
          70% { box-shadow: 0 0 0 8px rgba(167,139,250,0) }
          100% { box-shadow: 0 0 0 0 rgba(167,139,250,0) }
        }
      `}</style>

      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        {/* Top header */}
        <div style={{ marginBottom: "28px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", color: "rgba(167,139,250,0.7)", textTransform: "uppercase", marginBottom: "4px" }}>
              Xarajat Kuzatuvchi
            </div>
            <h1 style={{ margin: 0, fontSize: "clamp(24px,5vw,38px)", fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(135deg,#fff 30%,rgba(167,139,250,0.8))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Moliyaviy Daftar
            </h1>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <div style={{ padding: "6px 14px", borderRadius: "30px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
              {today.toLocaleDateString("uz-UZ", {day:"numeric", month:"long", year:"numeric"})}
            </div>
          </div>
        </div>

        {/* Stats */}
        <StatsBar data={data} year={year} month={month}/>

        {/* Yearly chart */}
        <MonthlyChart data={data} year={year}/>

        {/* Calendar card */}
        <div style={{
          background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: "24px", padding: "24px", backdropFilter: "blur(20px)",
        }}>
          {/* Month navigation */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
            <button onClick={prevMonth} style={{
              width: "40px", height: "40px", borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.7)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            ><ChevronLeft/></button>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.02em" }}>
                {MONTHS_UZ[month]}
              </div>
              <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>{year}</div>
            </div>

            <button onClick={nextMonth} style={{
              width: "40px", height: "40px", borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.7)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            ><ChevronRight/></button>
          </div>

          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px", marginBottom: "6px" }}>
            {DAYS_UZ.map(d => (
              <div key={d} style={{
                textAlign: "center", fontSize: "11px", fontWeight: 700,
                color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em", padding: "4px 0",
                textTransform: "uppercase",
              }}>{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px" }}>
            {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`}/>)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const key = dateKey(year, month, day);
              const items = data[key] || [];
              const total = items.reduce((a, b) => a + b.amount, 0);
              const color = getDayColor(total);
              const cm = colorMap[color];
              const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

              return (
                <div key={day} className="day-cell" onClick={() => setModal(key)}
                  style={{
                    aspectRatio: "1", borderRadius: "14px",
                    background: isToday ? "rgba(167,139,250,0.15)" : cm.bg,
                    border: `1px solid ${isToday ? "rgba(167,139,250,0.5)" : cm.border}`,
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    padding: "4px", transition: "transform 0.18s, box-shadow 0.18s",
                    animation: isToday ? "pulseRing 2.5s infinite" : "none",
                    position: "relative",
                  }}>
                  <span style={{
                    fontSize: "clamp(11px,2vw,15px)", fontWeight: isToday ? 800 : 600,
                    color: isToday ? "#a78bfa" : "rgba(255,255,255,0.85)",
                    lineHeight: 1,
                  }}>{day}</span>
                  {total > 0 && (
                    <span style={{
                      fontSize: "clamp(8px,1.2vw,11px)", fontWeight: 700, marginTop: "3px",
                      color: cm.dot, lineHeight: 1,
                    }}>{formatSum(total)}</span>
                  )}
                  {items.length > 0 && (
                    <div style={{
                      position: "absolute", top: "5px", right: "5px",
                      width: "6px", height: "6px", borderRadius: "50%",
                      background: cm.dot,
                    }}/>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: "16px", marginTop: "20px", flexWrap: "wrap", justifyContent: "center" }}>
            {[
              { color: "rgba(255,255,255,0.2)", label: "Xarajat yo'q" },
              { color: "#4ade80", label: "0 – 100 000" },
              { color: "#facc15", label: "100 000 – 200 000" },
              { color: "#f87171", label: "200 000+" },
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: l.color }}/>
                <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>{l.label} so'm</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {modal && (
        <DayModal
          dateStr={modal}
          data={data}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
