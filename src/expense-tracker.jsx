import { useState, useCallback, useMemo, useRef, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const MONTHS_UZ  = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
const DAYS_SHORT = ["Du","Se","Ch","Pa","Ju","Sh","Ya"];

const EXPENSE_CATS = [
  { id:"food",          label:"Oziq-ovqat",    icon:"🛒", color:"#4ade80" },
  { id:"transport",     label:"Transport",     icon:"🚗", color:"#60a5fa" },
  { id:"home",          label:"Uy-ro'zg'or",   icon:"🏠", color:"#f59e0b" },
  { id:"health",        label:"Sog'liq",       icon:"💊", color:"#f87171" },
  { id:"cafe",          label:"Kafe/Restoran", icon:"☕", color:"#fb923c" },
  { id:"clothes",       label:"Kiyim",         icon:"👕", color:"#a78bfa" },
  { id:"entertainment", label:"Ko'ngilochar",  icon:"🎮", color:"#e879f9" },
  { id:"other",         label:"Boshqa",        icon:"📦", color:"#94a3b8" },
];
const INCOME_CATS = [
  { id:"salary",    label:"Maosh",         icon:"💼", color:"#4ade80" },
  { id:"freelance", label:"Freelance",     icon:"💻", color:"#60a5fa" },
  { id:"business",  label:"Biznes",        icon:"🏪", color:"#f59e0b" },
  { id:"gift",      label:"Sovg'a/Yordam", icon:"🎁", color:"#f472b6" },
  { id:"invest",    label:"Investitsiya",  icon:"📈", color:"#34d399" },
  { id:"other_in",  label:"Boshqa",        icon:"💰", color:"#94a3b8" },
];
const EXP_MAP = Object.fromEntries(EXPENSE_CATS.map(c=>[c.id,c]));
const INC_MAP = Object.fromEntries(INCOME_CATS.map(c=>[c.id,c]));

const CURRENCIES = [
  { code:"UZS", label:"So'm",   symbol:"so'm", rate:1 },
  { code:"USD", label:"Dollar", symbol:"$",    rate:12700 },
  { code:"EUR", label:"Euro",   symbol:"€",    rate:13800 },
  { code:"RUB", label:"Rubl",   symbol:"₽",    rate:140  },
];

const BADGES = [
  { id:"first_entry",   icon:"🌱", label:"Birinchi qadam",    desc:"Birinchi yozuvni kirit",          check:(s)=>s.totalEntries>=1 },
  { id:"week_streak",   icon:"🔥", label:"Haftalik streak",   desc:"7 kun ketma-ket yozuv",           check:(s)=>s.maxStreak>=7 },
  { id:"month_streak",  icon:"🏆", label:"Oylik streak",      desc:"30 kun ketma-ket yozuv",          check:(s)=>s.maxStreak>=30 },
  { id:"saver_10",      icon:"💰", label:"Tejamkor",          desc:"Daromadning 10% ni tejash",       check:(s)=>s.bestSavingPct>=10 },
  { id:"saver_30",      icon:"🏦", label:"Super tejamkor",    desc:"Daromadning 30% ni tejash",       check:(s)=>s.bestSavingPct>=30 },
  { id:"budget_hero",   icon:"🎯", label:"Byudjet qahramoni", desc:"Oyni limitdan past yakunlash",    check:(s)=>s.budgetWins>=1 },
  { id:"no_cafe",       icon:"☕", label:"Kafe-free oy",      desc:"Bir oy kafedan tashqari",         check:(s)=>s.noCafeMonths>=1 },
  { id:"income_double", icon:"🚀", label:"Ikki maosh",        desc:"Bir oyda 2x bonus kirim",         check:(s)=>s.incomeDoubled>=1 },
];

const SK = {
  exp:"mf_exp_v2", inc:"mf_inc_v2", budget:"mf_budget_v2",
  goals:"mf_goals_v2", etpl:"mf_etpl_v2", itpl:"mf_itpl_v2",
  badges:"mf_badges_v2", streak:"mf_streak_v2",
};
const DEFAULT_BUDGET = 3_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const fmt      = n => Math.round(n).toLocaleString("uz-UZ");
const fmtFull  = n => fmt(n)+" so'm";
const fmtShort = n => {
  const abs = Math.abs(n);
  if (abs>=1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,"")+" mln";
  if (abs>=1_000)     return Math.round(n/1_000)+"K";
  return String(Math.round(n));
};
const dateKey  = (y,m,d) => `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
const parseKey = key => { const [y,m,d]=key.split("-").map(Number); return {year:y,month:m-1,day:d}; };
const getMonthDays = (year,month) => ({
  startDow: (new Date(year,month,1).getDay()+6)%7,
  daysInMonth: new Date(year,month+1,0).getDate(),
});
const load    = (key,def) => { try{return JSON.parse(localStorage.getItem(key)||"null")??def;}catch{return def;} };
const persist = (key,val) => localStorage.setItem(key,JSON.stringify(val));
const monthTotal = (data,year,month) => {
  const dim=new Date(year,month+1,0).getDate(); let t=0;
  for(let d=1;d<=dim;d++) t+=(data[dateKey(year,month,d)]||[]).reduce((a,b)=>a+b.amount,0);
  return t;
};
const getCalendarWeeks = (year,month) => {
  const dim=new Date(year,month+1,0).getDate(); const weeks=[]; let wk=[];
  for(let d=1;d<=dim;d++){
    wk.push(d);
    if(((new Date(year,month,d).getDay()+6)%7)===6||d===dim){weeks.push(wk);wk=[];}
  }
  return weeks;
};
const todayStr = () => { const t=new Date(); return dateKey(t.getFullYear(),t.getMonth(),t.getDate()); };

// ─────────────────────────────────────────────────────────────────────────────
// STREAK CALCULATOR
// ─────────────────────────────────────────────────────────────────────────────
function calcStreak(expData) {
  const keys = Object.keys(expData).filter(k=>expData[k]?.length>0).sort();
  if(!keys.length) return { current:0, max:0 };
  let cur=1, max=1, prev=keys[0];
  for(let i=1;i<keys.length;i++){
    const [py,pm,pd]=prev.split("-").map(Number);
    const [cy,cm,cd]=keys[i].split("-").map(Number);
    const diff=(new Date(cy,cm-1,cd)-new Date(py,pm-1,pd))/(1000*60*60*24);
    if(diff===1){cur++;max=Math.max(max,cur);}else cur=1;
    prev=keys[i];
  }
  // check if streak is still alive today or yesterday
  const last=keys[keys.length-1];
  const [ly,lm,ld]=last.split("-").map(Number);
  const today=new Date(); const diff=(today-new Date(ly,lm-1,ld))/(1000*60*60*24);
  const alive=diff<2;
  return {current:alive?cur:0,max};
}

// ─────────────────────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────────────────────
const Ico=({d,size=16,stroke="currentColor",sw=2})=>(
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d)?d:[d]).map((p,i)=><path key={i} d={p}/>)}
  </svg>
);
const IC={
  plus:"M12 5v14M5 12h14",close:"M18 6 6 18M6 6l12 12",check:"M20 6 9 17 4 12",
  edit:["M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7","M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"],
  trash:["M3 6h18","M19 6l-1 14H6L5 6","M10 11v6","M14 11v6","M9 6V4h6v2"],
  chevL:"M15 18 9 12l6-6",chevR:"M9 18l6-6-6-6",chevD:"M6 9l6 6 6-6",
  search:"M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z",
  dl:"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
  ul:"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  target:["M12 22a10 10 0 100-20 10 10 0 000 20z","M12 18a6 6 0 100-12 6 6 0 000 12z","M12 14a2 2 0 100-4 2 2 0 000 4z"],
  bolt:"M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  flag:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  ai:"M12 2a2 2 0 012 2v2a2 2 0 01-2 2 2 2 0 01-2-2V4a2 2 0 012-2zM12 16a2 2 0 012 2v2a2 2 0 01-2 2 2 2 0 01-2-2v-2a2 2 0 012-2zM2 12a2 2 0 012-2h2a2 2 0 012 2 2 2 0 01-2 2H4a2 2 0 01-2-2zM16 12a2 2 0 012-2h2a2 2 0 012 2 2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  trophy:"M8 21h8M12 17v4M17 3H7l1 9a4 4 0 008 0l1-9zM5 3H3v4a4 4 0 004 4M19 3h2v4a4 4 0 01-4 4",
  currency:"M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6",
  compare:"M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18",
  fire:"M12 2c0 0-5 5-5 10a5 5 0 0010 0c0-5-5-10-5-10zM8 14s1 2 4 2 4-2 4-2",
  keyboard:"M20 5H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V7a2 2 0 00-2-2zM8 10h.01M12 10h.01M16 10h.01M8 14h8",
};

// ─────────────────────────────────────────────────────────────────────────────
// BASE UI
// ─────────────────────────────────────────────────────────────────────────────
function Btn({children,onClick,variant="ghost",size="md",style={},disabled=false}){
  const sz=size==="sm"?{padding:"6px 12px",fontSize:"12px"}:{padding:"10px 18px",fontSize:"13px"};
  const vs={
    ghost:{background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.7)",border:"1px solid rgba(255,255,255,0.1)"},
    primary:{background:"linear-gradient(135deg,#7c3aed,#a78bfa)",color:"#fff",boxShadow:"0 4px 16px rgba(124,58,237,0.3)"},
    income:{background:"linear-gradient(135deg,#059669,#34d399)",color:"#fff",boxShadow:"0 4px 16px rgba(5,150,105,0.3)"},
    danger:{background:"rgba(248,113,113,0.1)",color:"#f87171",border:"1px solid rgba(248,113,113,0.2)"},
    success:{background:"rgba(74,222,128,0.1)",color:"#4ade80",border:"1px solid rgba(74,222,128,0.2)"},
    ai:{background:"linear-gradient(135deg,#0ea5e9,#8b5cf6)",color:"#fff",boxShadow:"0 4px 16px rgba(14,165,233,0.3)"},
  };
  return(
    <button onClick={onClick} disabled={disabled} style={{
      display:"flex",alignItems:"center",gap:"6px",borderRadius:"10px",
      cursor:disabled?"not-allowed":"pointer",fontFamily:"inherit",fontWeight:600,
      transition:"all 0.15s",border:"none",letterSpacing:"0.01em",opacity:disabled?0.4:1,...sz,...vs[variant],...style,
    }}
      onMouseEnter={e=>{if(!disabled){e.currentTarget.style.opacity="0.82";e.currentTarget.style.transform="translateY(-1px)";}}}
      onMouseLeave={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.transform="translateY(0)";}}>
      {children}
    </button>
  );
}
function Inp({value,onChange,onKeyDown,placeholder,inputMode,style={},autoFocus=false}){
  return(
    <input value={value} onChange={onChange} onKeyDown={onKeyDown} placeholder={placeholder}
      inputMode={inputMode} autoFocus={autoFocus}
      style={{padding:"10px 14px",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.1)",
        background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:"13px",outline:"none",
        fontFamily:"inherit",transition:"border-color 0.2s",width:"100%",...style}}
      onFocus={e=>e.target.style.borderColor="rgba(167,139,250,0.5)"}
      onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.1)"}/>
  );
}
function Modal({onClose,children,width="560px"}){
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",backdropFilter:"blur(14px)",
      display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:`min(${width},96vw)`,maxHeight:"92vh",display:"flex",flexDirection:"column",
        background:"#0d0d1c",border:"1px solid rgba(167,139,250,0.18)",borderRadius:"22px",
        boxShadow:"0 40px 100px rgba(0,0,0,0.8)",animation:"slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)"}}>
        {children}
      </div>
    </div>
  );
}
function MHead({title,subtitle,onClose}){
  return(
    <div style={{padding:"20px 24px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",
      display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
      <div>
        <div style={{fontSize:"17px",fontWeight:800,color:"#fff"}}>{title}</div>
        {subtitle&&<div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>{subtitle}</div>}
      </div>
      <button onClick={onClose} style={{width:"34px",height:"34px",borderRadius:"9px",
        border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",
        color:"rgba(255,255,255,0.5)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <Ico d={IC.close} size={15}/>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DONUT
// ─────────────────────────────────────────────────────────────────────────────
function Donut({slices,size=120,thick=22}){
  const r=(size-thick)/2,cx=size/2,cy=size/2,circ=2*Math.PI*r;
  const total=slices.reduce((a,s)=>a+s.value,0)||1;
  let offset=0;
  const paths=slices.filter(s=>s.value>0).map(s=>{
    const dash=(s.value/total)*circ;
    const el=<circle key={s.id} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
      strokeWidth={thick} strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={-offset}
      style={{transition:"stroke-dasharray 0.5s ease"}}/>;
    offset+=dash; return el;
  });
  return(
    <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thick}/>
      {paths}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAK BANNER
// ─────────────────────────────────────────────────────────────────────────────
function StreakBanner({expData}){
  const {current,max}=useMemo(()=>calcStreak(expData),[expData]);
  if(current===0&&max===0) return null;
  return(
    <div style={{background:"linear-gradient(135deg,rgba(251,146,60,0.15),rgba(248,113,113,0.1))",
      border:"1px solid rgba(251,146,60,0.3)",borderRadius:"14px",padding:"12px 18px",
      marginBottom:"16px",display:"flex",alignItems:"center",gap:"16px",flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
        <span style={{fontSize:"28px"}}>🔥</span>
        <div>
          <div style={{fontSize:"22px",fontWeight:900,color:"#fb923c",lineHeight:1}}>{current}</div>
          <div style={{fontSize:"10px",color:"rgba(255,255,255,0.45)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em"}}>Ketma-ket kun</div>
        </div>
      </div>
      <div style={{width:"1px",height:"36px",background:"rgba(255,255,255,0.1)"}}/>
      <div>
        <div style={{fontSize:"13px",fontWeight:700,color:"rgba(255,255,255,0.8)"}}>
          {current===0?"Streak uzildi 😔":current>=7?"Zo'r! Davom eting! 💪":current>=3?"Yaxshi boshlanish! 👍":"Davom eting!"}
        </div>
        <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>Rekord: {max} kun</div>
      </div>
      {current>0&&(
        <div style={{marginLeft:"auto",display:"flex",gap:"3px"}}>
          {Array.from({length:Math.min(7,current)}).map((_,i)=>(
            <div key={i} style={{width:"8px",height:"8px",borderRadius:"50%",
              background:i===Math.min(7,current)-1?"#fb923c":"rgba(251,146,60,0.4)"}}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGES MODAL
// ─────────────────────────────────────────────────────────────────────────────
function BadgesModal({expData,incData,budget,onClose}){
  const stats=useMemo(()=>{
    const {current,max}=calcStreak(expData);
    const allExpKeys=Object.keys(expData);
    const totalEntries=allExpKeys.reduce((a,k)=>a+(expData[k]||[]).length,0);
    let bestSavingPct=0,budgetWins=0,noCafeMonths=0,incomeDoubled=0;
    for(let y=2023;y<=2026;y++){
      for(let m=0;m<12;m++){
        const exp=monthTotal(expData,y,m);
        const inc=monthTotal(incData,y,m);
        if(inc>0){
          const pct=((inc-exp)/inc)*100;
          if(pct>bestSavingPct) bestSavingPct=pct;
        }
        if(exp>0&&exp<=budget) budgetWins++;
        const cafeItems=(expData[dateKey(y,m,1)]||[]).filter(i=>i.category==="cafe");
        let hasCafe=false;
        for(let d=1;d<=new Date(y,m+1,0).getDate();d++)
          if((expData[dateKey(y,m,d)]||[]).some(i=>i.category==="cafe")){hasCafe=true;break;}
        if(!hasCafe&&exp>0) noCafeMonths++;
        const salaryItems=[];
        for(let d=1;d<=new Date(y,m+1,0).getDate();d++)
          for(const it of (incData[dateKey(y,m,d)]||[]))
            if(it.category==="salary") salaryItems.push(it.amount);
        const salTotal=salaryItems.reduce((a,b)=>a+b,0);
        const otherInc=inc-salTotal;
        if(salTotal>0&&otherInc>=salTotal) incomeDoubled++;
      }
    }
    return {totalEntries,maxStreak:max,bestSavingPct,budgetWins,noCafeMonths,incomeDoubled};
  },[expData,incData,budget]);

  const earned=BADGES.filter(b=>b.check(stats));
  const locked=BADGES.filter(b=>!b.check(stats));

  return(
    <Modal onClose={onClose} width="520px">
      <MHead title="Nishonlar (Badges)" subtitle={`${earned.length} / ${BADGES.length} ta qo'lga kiritildi`} onClose={onClose}/>
      <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>
        {earned.length>0&&(
          <>
            <div style={{fontSize:"11px",fontWeight:700,color:"rgba(255,255,255,0.4)",
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"10px"}}>Qo'lga kiritilgan ✅</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginBottom:"20px"}}>
              {earned.map(b=>(
                <div key={b.id} style={{background:"rgba(74,222,128,0.08)",border:"1px solid rgba(74,222,128,0.25)",
                  borderRadius:"14px",padding:"14px",display:"flex",alignItems:"center",gap:"12px"}}>
                  <span style={{fontSize:"28px"}}>{b.icon}</span>
                  <div>
                    <div style={{fontSize:"13px",fontWeight:700,color:"#4ade80"}}>{b.label}</div>
                    <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>{b.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {locked.length>0&&(
          <>
            <div style={{fontSize:"11px",fontWeight:700,color:"rgba(255,255,255,0.4)",
              textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"10px"}}>Qulflangan 🔒</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px"}}>
              {locked.map(b=>(
                <div key={b.id} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
                  borderRadius:"14px",padding:"14px",display:"flex",alignItems:"center",gap:"12px",opacity:0.5}}>
                  <span style={{fontSize:"28px",filter:"grayscale(1)"}}>{b.icon}</span>
                  <div>
                    <div style={{fontSize:"13px",fontWeight:700,color:"rgba(255,255,255,0.6)"}}>{b.label}</div>
                    <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)",marginTop:"2px"}}>{b.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{marginTop:"20px",padding:"14px",background:"rgba(255,255,255,0.03)",
          border:"1px solid rgba(255,255,255,0.07)",borderRadius:"12px"}}>
          <div style={{fontSize:"11px",color:"rgba(255,255,255,0.4)",marginBottom:"8px",fontWeight:600}}>Statistika</div>
          {[
            ["Jami yozuvlar",stats.totalEntries+" ta"],
            ["Eng uzun streak",stats.maxStreak+" kun"],
            ["Eng yuqori tejamkorlik",stats.bestSavingPct.toFixed(1)+"%"],
            ["Byudjet ichida oylar",stats.budgetWins+" oy"],
          ].map(([l,v])=>(
            <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",
              borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
              <span style={{fontSize:"12px",color:"rgba(255,255,255,0.5)"}}>{l}</span>
              <span style={{fontSize:"12px",fontWeight:700,color:"#fff"}}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// YEAR HEATMAP (GitHub style)
// ─────────────────────────────────────────────────────────────────────────────
function YearHeatmap({expData,year}){
  const jan1=new Date(year,0,1);
  const startOffset=(jan1.getDay()+6)%7;
  const isLeap=year%4===0&&(year%100!==0||year%400===0);
  const totalDays=isLeap?366:365;

  const dayTotals=useMemo(()=>{
    const map={};
    for(let d=0;d<totalDays;d++){
      const date=new Date(year,0,1+d);
      const k=dateKey(date.getFullYear(),date.getMonth(),date.getDate());
      map[k]=(expData[k]||[]).reduce((a,b)=>a+b.amount,0);
    }
    return map;
  },[expData,year]);

  const maxVal=Math.max(...Object.values(dayTotals),1);

  const getColor=(val)=>{
    if(!val) return "rgba(255,255,255,0.05)";
    const pct=val/maxVal;
    if(pct<0.25) return "rgba(74,222,128,0.3)";
    if(pct<0.5)  return "rgba(74,222,128,0.55)";
    if(pct<0.75) return "rgba(250,204,21,0.7)";
    return "rgba(248,113,113,0.85)";
  };

  const cellSize=11, gap=2;
  const cols=Math.ceil((totalDays+startOffset)/7);
  const W=cols*(cellSize+gap), H=7*(cellSize+gap);

  const cells=[];
  for(let i=0;i<startOffset;i++) cells.push({empty:true,key:`e${i}`});
  for(let d=0;d<totalDays;d++){
    const date=new Date(year,0,1+d);
    const k=dateKey(date.getFullYear(),date.getMonth(),date.getDate());
    cells.push({key:k,val:dayTotals[k]||0,date,d});
  }

  return(
    <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
      borderRadius:"14px",padding:"16px 18px",marginBottom:"16px",overflowX:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
        <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",
          color:"rgba(255,255,255,0.35)",textTransform:"uppercase"}}>{year} — Yillik heatmap</div>
        <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
          <span style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>Kam</span>
          {["rgba(255,255,255,0.05)","rgba(74,222,128,0.3)","rgba(74,222,128,0.55)","rgba(250,204,21,0.7)","rgba(248,113,113,0.85)"].map((c,i)=>(
            <div key={i} style={{width:"10px",height:"10px",borderRadius:"2px",background:c}}/>
          ))}
          <span style={{fontSize:"10px",color:"rgba(255,255,255,0.3)"}}>Ko'p</span>
        </div>
      </div>
      {/* Month labels */}
      <div style={{display:"flex",marginBottom:"4px",paddingLeft:"0"}}>
        {MONTHS_UZ.map((mn,mi)=>{
          const daysInPrevMonths=new Date(year,mi,0).getDate()||0;
          const jan1offset=startOffset;
          let dayOfYear=0;
          for(let i=0;i<mi;i++) dayOfYear+=new Date(year,i+1,0).getDate();
          const col=Math.floor((dayOfYear+jan1offset)/7);
          return(
            <div key={mn} style={{
              position:"absolute",
              left:`${col*(cellSize+gap)}px`,
              fontSize:"9px",color:"rgba(255,255,255,0.3)",fontWeight:600,
            }}>{mn.slice(0,3)}</div>
          );
        })}
      </div>
      <div style={{position:"relative",paddingTop:"14px"}}>
        {/* Month labels positioned */}
        {MONTHS_UZ.map((mn,mi)=>{
          let dayOfYear=0;
          for(let i=0;i<mi;i++) dayOfYear+=new Date(year,i+1,0).getDate();
          const col=Math.floor((dayOfYear+startOffset)/7);
          return(
            <div key={mn} style={{position:"absolute",top:0,left:`${col*(cellSize+gap)}px`,
              fontSize:"9px",color:"rgba(255,255,255,0.3)",fontWeight:600,whiteSpace:"nowrap"}}>
              {mn.slice(0,3)}
            </div>
          );
        })}
        {/* Grid */}
        <div style={{display:"grid",gridTemplateColumns:`repeat(${cols},${cellSize}px)`,
          gridTemplateRows:`repeat(7,${cellSize}px)`,gap:`${gap}px`,
          gridAutoFlow:"column",marginTop:"4px"}}>
          {cells.map((cell)=>{
            if(cell.empty) return <div key={cell.key} style={{width:cellSize,height:cellSize}}/>;
            const d=cell.date;
            const label=`${d.getDate()} ${MONTHS_UZ[d.getMonth()]}: ${fmtFull(cell.val)}`;
            return(
              <div key={cell.key} title={label} style={{
                width:cellSize,height:cellSize,borderRadius:"2px",
                background:getColor(cell.val),
                transition:"transform 0.1s",cursor:"default",
              }}
                onMouseEnter={e=>e.currentTarget.style.transform="scale(1.4)"}
                onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}/>
            );
          })}
        </div>
        {/* Day labels */}
        <div style={{position:"absolute",left:`-${cellSize+gap+14}px`,top:"4px",
          display:"grid",gridTemplateRows:`repeat(7,${cellSize+gap}px)`,gap:"0"}}>
          {["Du","","Ch","","Ju","","Ya"].map((d,i)=>(
            <div key={i} style={{fontSize:"8px",color:"rgba(255,255,255,0.25)",
              display:"flex",alignItems:"center",height:`${cellSize}px`}}>{d}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ANALYSIS MODAL
// ─────────────────────────────────────────────────────────────────────────────
function AIModal({expData,incData,budget,year,month,onClose}){
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState(null);
  const [error,setError]=useState(null);

  const analyze=useCallback(async()=>{
    setLoading(true);setError(null);setResult(null);
    try{
      // Build summary
      const dim=new Date(year,month+1,0).getDate();
      const expTotal=monthTotal(expData,year,month);
      const incTotal=monthTotal(incData,year,month);
      const catTotals={};
      for(let d=1;d<=dim;d++)
        for(const it of (expData[dateKey(year,month,d)]||[]))
          catTotals[it.category||"other"]=(catTotals[it.category||"other"]||0)+it.amount;

      const prevM=month===0?11:month-1;
      const prevY=month===0?year-1:year;
      const prevExp=monthTotal(expData,prevY,prevM);
      const prevInc=monthTotal(incData,prevY,prevM);
      const {current:streak}=calcStreak(expData);

      const catLines=EXPENSE_CATS
        .filter(c=>catTotals[c.id])
        .sort((a,b)=>(catTotals[b.id]||0)-(catTotals[a.id]||0))
        .map(c=>`  - ${c.label}: ${fmtFull(catTotals[c.id]||0)} (${((catTotals[c.id]||0)/expTotal*100).toFixed(1)}%)`)
        .join("\n");

      const prompt=`Sen shaxsiy moliya maslahatchiisan. Foydalanuvchining ${MONTHS_UZ[month]} ${year} oylik ma'lumotlari:

Kirim: ${fmtFull(incTotal)}
Chiqim: ${fmtFull(expTotal)}
Byudjet limiti: ${fmtFull(budget)}
Sof balans: ${fmtFull(incTotal-expTotal)}
Tejamkorlik: ${incTotal>0?((incTotal-expTotal)/incTotal*100).toFixed(1):0}%
O'tgan oy chiqim: ${fmtFull(prevExp)}
O'tgan oy kirim: ${fmtFull(prevInc)}
Ketma-ket kun yozuv (streak): ${streak}

Kategoriya bo'yicha xarajatlar:
${catLines||"  Ma'lumot yo'q"}

Qisqa, aniq, do'stona tarzda O'zbek tilida tahlil yoz. 4-5 gap. Muammolarni ayt, yaxshi tomonlarni maqta, va 2 ta amaliy maslahat ber. Emoji ishlatma.`;

      const resp=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          messages:[{role:"user",content:prompt}],
        }),
      });
      if(!resp.ok) throw new Error("API xatosi: "+resp.status);
      const data=await resp.json();
      setResult(data.content?.find(b=>b.type==="text")?.text||"Javob olishda xato.");
    }catch(e){
      setError("Tahlil qilishda xato yuz berdi: "+e.message);
    }finally{
      setLoading(false);
    }
  },[expData,incData,budget,year,month]);

  useEffect(()=>{analyze();},[]);

  return(
    <Modal onClose={onClose} width="560px">
      <MHead title={`🤖 AI Tahlil — ${MONTHS_UZ[month]} ${year}`}
        subtitle="Anthropic Claude tomonidan moliyaviy tahlil" onClose={onClose}/>
      <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
        {loading&&(
          <div style={{textAlign:"center",padding:"40px 0"}}>
            <div style={{fontSize:"32px",marginBottom:"12px",animation:"spin 1s linear infinite",display:"inline-block"}}>⚙️</div>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:"14px"}}>Ma'lumotlar tahlil qilinmoqda...</div>
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {error&&(
          <div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.2)",
            borderRadius:"12px",padding:"16px",color:"#f87171",fontSize:"13px"}}>
            {error}
          </div>
        )}
        {result&&(
          <div>
            <div style={{background:"rgba(14,165,233,0.08)",border:"1px solid rgba(14,165,233,0.2)",
              borderRadius:"14px",padding:"20px",fontSize:"14px",lineHeight:"1.7",
              color:"rgba(255,255,255,0.85)",whiteSpace:"pre-wrap"}}>
              {result}
            </div>
            <div style={{marginTop:"12px",display:"flex",gap:"8px",justifyContent:"flex-end"}}>
              <Btn size="sm" variant="ghost" onClick={analyze}>🔄 Qayta tahlil</Btn>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTH COMPARISON MODAL
// ─────────────────────────────────────────────────────────────────────────────
function CompareModal({expData,incData,year,month,onClose}){
  const [selA,setSelA]=useState({year,month});
  const [selB,setSelB]=useState({year:month===0?year-1:year,month:month===0?11:month-1});

  const stats=(y,m)=>{
    const exp=monthTotal(expData,y,m);
    const inc=monthTotal(incData,y,m);
    const dim=new Date(y,m+1,0).getDate();
    let activeDays=0,maxDay=0;
    const cats={};
    for(let d=1;d<=dim;d++){
      const s=(expData[dateKey(y,m,d)]||[]).reduce((a,b)=>a+b.amount,0);
      if(s>0) activeDays++;
      if(s>maxDay) maxDay=s;
      for(const it of (expData[dateKey(y,m,d)]||[]))
        cats[it.category||"other"]=(cats[it.category||"other"]||0)+it.amount;
    }
    const topCat=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
    return{exp,inc,bal:inc-exp,activeDays,maxDay,topCat,savPct:inc>0?((inc-exp)/inc*100):0};
  };

  const A=stats(selA.year,selA.month);
  const B=stats(selB.year,selB.month);

  const MonthSelect=({sel,onChange,label})=>(
    <div style={{flex:1}}>
      <div style={{fontSize:"10px",fontWeight:700,color:"rgba(255,255,255,0.4)",
        textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"8px"}}>{label}</div>
      <div style={{display:"flex",gap:"6px"}}>
        <select value={sel.month} onChange={e=>onChange({...sel,month:parseInt(e.target.value)})}
          style={{flex:1,padding:"8px 10px",borderRadius:"9px",border:"1px solid rgba(255,255,255,0.1)",
            background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:"12px",outline:"none",fontFamily:"inherit"}}>
          {MONTHS_UZ.map((mn,i)=><option key={i} value={i} style={{background:"#1a1a2e"}}>{mn}</option>)}
        </select>
        <select value={sel.year} onChange={e=>onChange({...sel,year:parseInt(e.target.value)})}
          style={{width:"80px",padding:"8px 10px",borderRadius:"9px",border:"1px solid rgba(255,255,255,0.1)",
            background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:"12px",outline:"none",fontFamily:"inherit"}}>
          {[2023,2024,2025,2026].map(y=><option key={y} value={y} style={{background:"#1a1a2e"}}>{y}</option>)}
        </select>
      </div>
    </div>
  );

  const Row=({label,va,vb,fmt:fmtFn=fmtFull,higherIsBetter=true})=>{
    const better=higherIsBetter?va>vb:va<vb;
    const worse=higherIsBetter?va<vb:va>vb;
    return(
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:"12px",
        padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,0.05)",alignItems:"center"}}>
        <div style={{textAlign:"right",fontWeight:700,fontSize:"13px",
          color:better?"#4ade80":worse?"#f87171":"#fff"}}>{fmtFn(va)}</div>
        <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",textAlign:"center",
          fontWeight:600,minWidth:"90px"}}>{label}</div>
        <div style={{fontWeight:700,fontSize:"13px",
          color:!better&&va!==vb?"#4ade80":!worse&&va!==vb?"#f87171":"#fff"}}>{fmtFn(vb)}</div>
      </div>
    );
  };

  return(
    <Modal onClose={onClose} width="600px">
      <MHead title="Oylarni solishtirish" subtitle="Ikki oyning moliyaviy ko'rsatkichlari" onClose={onClose}/>
      <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>
        <div style={{display:"flex",gap:"12px",marginBottom:"20px"}}>
          <MonthSelect sel={selA} onChange={setSelA} label="A Oy (Yashil)"/>
          <div style={{display:"flex",alignItems:"center",paddingTop:"20px",color:"rgba(255,255,255,0.3)",fontSize:"18px"}}>vs</div>
          <MonthSelect sel={selB} onChange={setSelB} label="B Oy (Qizil)"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:"12px",
          padding:"8px 0",marginBottom:"4px"}}>
          <div style={{textAlign:"right",fontSize:"13px",fontWeight:800,color:"#4ade80"}}>
            {MONTHS_UZ[selA.month]} {selA.year}
          </div>
          <div/>
          <div style={{fontSize:"13px",fontWeight:800,color:"#f87171"}}>
            {MONTHS_UZ[selB.month]} {selB.year}
          </div>
        </div>
        <Row label="Kirim" va={A.inc} vb={B.inc}/>
        <Row label="Chiqim" va={A.exp} vb={B.exp} higherIsBetter={false}/>
        <Row label="Sof balans" va={A.bal} vb={B.bal}/>
        <Row label="Tejamkorlik %" va={A.savPct} vb={B.savPct} fmtFn={v=>v.toFixed(1)+"%"}/>
        <Row label="Faol kunlar" va={A.activeDays} vb={B.activeDays} fmtFn={v=>v+" kun"} higherIsBetter={false}/>
        <Row label="Rekord kun" va={A.maxDay} vb={B.maxDay} higherIsBetter={false}/>
        {/* Visual bars */}
        <div style={{marginTop:"20px"}}>
          <div style={{fontSize:"11px",fontWeight:700,color:"rgba(255,255,255,0.4)",
            textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"12px"}}>Vizual taqqos</div>
          {[
            {label:"Kirim",av:A.inc,bv:B.inc,color:"#34d399"},
            {label:"Chiqim",av:A.exp,bv:B.exp,color:"#f87171"},
          ].map(row=>{
            const mx=Math.max(row.av,row.bv,1);
            return(
              <div key={row.label} style={{marginBottom:"10px"}}>
                <div style={{fontSize:"11px",color:"rgba(255,255,255,0.5)",marginBottom:"4px"}}>{row.label}</div>
                <div style={{display:"flex",gap:"4px",alignItems:"center"}}>
                  <div style={{flex:1,display:"flex",justifyContent:"flex-end"}}>
                    <div style={{height:"12px",borderRadius:"4px 0 0 4px",
                      background:"#4ade80",width:`${(row.av/mx)*100}%`,transition:"width 0.5s ease"}}/>
                  </div>
                  <div style={{width:"1px",height:"20px",background:"rgba(255,255,255,0.1)"}}/>
                  <div style={{flex:1}}>
                    <div style={{height:"12px",borderRadius:"0 4px 4px 0",
                      background:"#f87171",width:`${(row.bv/mx)*100}%`,transition:"width 0.5s ease"}}/>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CURRENCY CONVERTER
// ─────────────────────────────────────────────────────────────────────────────
function CurrencyModal({onClose}){
  const [amount,setAmount]=useState("1000000");
  const [from,setFrom]=useState("UZS");
  const [rates,setRates]=useState({USD:12700,EUR:13800,RUB:140});
  const [editing,setEditing]=useState(null);

  const fromCur=CURRENCIES.find(c=>c.code===from)||CURRENCIES[0];
  const amountNum=parseFloat(amount.replace(/\D/g,""))||0;
  const inUZS=from==="UZS"?amountNum:amountNum*(rates[from]||1);

  const convert=(toCur)=>{
    if(toCur.code==="UZS") return inUZS;
    return inUZS/(rates[toCur.code]||1);
  };

  return(
    <Modal onClose={onClose} width="420px">
      <MHead title="💱 Valyuta konvertatsiya" subtitle="Joriy kurs bo'yicha hisoblash" onClose={onClose}/>
      <div style={{flex:1,overflowY:"auto",padding:"16px 24px"}}>
        <div style={{display:"flex",gap:"8px",marginBottom:"16px"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:"10px",fontWeight:700,color:"rgba(255,255,255,0.4)",
              textTransform:"uppercase",marginBottom:"6px"}}>Miqdor</div>
            <Inp value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))}
              placeholder="Miqdor..." inputMode="numeric"/>
          </div>
          <div style={{width:"120px"}}>
            <div style={{fontSize:"10px",fontWeight:700,color:"rgba(255,255,255,0.4)",
              textTransform:"uppercase",marginBottom:"6px"}}>Valyuta</div>
            <select value={from} onChange={e=>setFrom(e.target.value)}
              style={{width:"100%",padding:"10px 12px",borderRadius:"10px",
                border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",
                color:"#fff",fontSize:"13px",outline:"none",fontFamily:"inherit"}}>
              {CURRENCIES.map(c=><option key={c.code} value={c.code} style={{background:"#1a1a2e"}}>{c.code} — {c.label}</option>)}
            </select>
          </div>
        </div>
        {/* Results */}
        <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"20px"}}>
          {CURRENCIES.filter(c=>c.code!==from).map(cur=>{
            const val=convert(cur);
            return(
              <div key={cur.code} style={{background:"rgba(255,255,255,0.04)",
                border:"1px solid rgba(255,255,255,0.08)",borderRadius:"12px",padding:"14px 16px",
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{fontSize:"11px",fontWeight:700,color:"rgba(255,255,255,0.5)",
                    textTransform:"uppercase",letterSpacing:"0.06em"}}>{cur.code} — {cur.label}</div>
                  <div style={{fontSize:"20px",fontWeight:800,color:"#fff",marginTop:"2px"}}>
                    {cur.symbol}{" "}
                    {cur.code==="UZS"?fmt(val):val.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}
                  </div>
                </div>
                <div style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>
                  1 {cur.code} = {fmt(rates[cur.code]||1)} so'm
                </div>
              </div>
            );
          })}
        </div>
        {/* Rate editor */}
        <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:"12px",padding:"14px 16px"}}>
          <div style={{fontSize:"11px",fontWeight:700,color:"rgba(255,255,255,0.4)",
            textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"10px"}}>
            Kursni o'zgartirish (so'mga nisbatan)
          </div>
          {Object.keys(rates).map(code=>(
            <div key={code} style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px"}}>
              <div style={{fontSize:"12px",fontWeight:700,color:"rgba(255,255,255,0.6)",width:"36px"}}>{code}</div>
              <Inp value={editing===code?String(rates[code]):String(rates[code])}
                onChange={e=>setRates(r=>({...r,[code]:parseInt(e.target.value)||r[code]}))}
                onKeyDown={e=>e.key==="Enter"&&setEditing(null)}
                inputMode="numeric"
                style={{fontSize:"12px",padding:"6px 10px"}}/>
              <span style={{fontSize:"11px",color:"rgba(255,255,255,0.3)"}}>so'm</span>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD SHORTCUTS MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ShortcutsModal({onClose}){
  const shortcuts=[
    ["N","Yangi chiqim qo'shish"],
    ["I","Yangi kirim qo'shish"],
    ["S","Qidirish"],
    ["A","AI tahlil"],
    ["C","Valyuta konvertatsiya"],
    ["H","Heatmap"],
    ["B","Badges / Nishonlar"],
    ["←","Oldingi oy"],
    ["→","Keyingi oy"],
    ["T","Bugungi kunga o'tish"],
    ["Esc","Modalni yopish"],
  ];
  return(
    <Modal onClose={onClose} width="380px">
      <MHead title="⌨️ Klaviatura yorliqlari" subtitle="Tezroq ishlash uchun" onClose={onClose}/>
      <div style={{padding:"16px 24px"}}>
        {shortcuts.map(([key,desc])=>(
          <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
            <span style={{fontSize:"13px",color:"rgba(255,255,255,0.65)"}}>{desc}</span>
            <kbd style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",
              borderRadius:"6px",padding:"3px 10px",fontSize:"12px",fontWeight:700,color:"#fff",
              fontFamily:"monospace",boxShadow:"0 2px 0 rgba(0,0,0,0.3)"}}>{key}</kbd>
          </div>
        ))}
        <div style={{marginTop:"14px",padding:"10px",background:"rgba(167,139,250,0.08)",
          border:"1px solid rgba(167,139,250,0.2)",borderRadius:"10px",
          fontSize:"11px",color:"rgba(255,255,255,0.45)"}}>
          💡 Swipe: Mobil qurilmada kalendarda chap/o'ng suring — oy almashadi
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE BANNER
// ─────────────────────────────────────────────────────────────────────────────
function BalanceBanner({expData,incData,year,month}){
  const exp=monthTotal(expData,year,month);
  const inc=monthTotal(incData,year,month);
  const bal=inc-exp;
  const savPct=inc>0?Math.round((bal/inc)*100):0;
  let yExp=0,yInc=0;
  for(let m=0;m<12;m++){yExp+=monthTotal(expData,year,m);yInc+=monthTotal(incData,year,m);}
  const cards=[
    {label:"Oylik kirim",  value:fmtFull(inc),      accent:"#34d399",sub:"bu oy"},
    {label:"Oylik chiqim", value:fmtFull(exp),      accent:"#f87171",sub:"bu oy"},
    {label:"Sof balans",   value:fmtFull(Math.abs(bal)), accent:bal>=0?"#4ade80":"#f87171",sub:bal>=0?"ortiqcha":"kamomad"},
    {label:"Tejamkorlik",  value:`${savPct}%`,       accent:savPct>=20?"#4ade80":savPct>=10?"#facc15":"#f87171",sub:"daromaddan"},
  ];
  return(
    <div style={{marginBottom:"16px"}}>
      <div style={{background:bal>=0
        ?"linear-gradient(135deg,rgba(5,150,105,0.15),rgba(52,211,153,0.08))"
        :"linear-gradient(135deg,rgba(220,38,38,0.15),rgba(248,113,113,0.08))",
        border:`1px solid ${bal>=0?"rgba(52,211,153,0.25)":"rgba(248,113,113,0.25)"}`,
        borderRadius:"18px",padding:"18px 22px",marginBottom:"10px",
        display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
        <div>
          <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"4px",
            color:bal>=0?"rgba(52,211,153,0.7)":"rgba(248,113,113,0.7)"}}>
            {bal>=0?"Oylik ortiqcha":"Oylik kamomad"}
          </div>
          <div style={{fontSize:"clamp(22px,4vw,34px)",fontWeight:900,letterSpacing:"-0.03em",color:bal>=0?"#34d399":"#f87171"}}>
            {bal>=0?"+ ":"- "}{fmtFull(Math.abs(bal))}
          </div>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"3px"}}>
            Yillik: {fmtFull(yInc-yExp)} {yInc-yExp>=0?"ortiqcha":"kamomad"}
          </div>
        </div>
        <div style={{display:"flex",gap:"20px"}}>
          {[{l:"Yillik kirim",v:fmtShort(yInc),c:"#34d399"},{l:"Yillik chiqim",v:fmtShort(yExp),c:"#f87171"}].map(x=>(
            <div key={x.l} style={{textAlign:"center"}}>
              <div style={{fontSize:"17px",fontWeight:800,color:x.c}}>{x.v}</div>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px"}}>
        {cards.map(c=>(
          <div key={c.label} style={{background:"rgba(255,255,255,0.03)",
            border:"1px solid rgba(255,255,255,0.07)",borderRadius:"14px",padding:"13px 15px",
            position:"relative",overflow:"hidden"}}>
            <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:c.accent}}/>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.38)",fontWeight:700,
              letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:"5px"}}>{c.label}</div>
            <div style={{fontSize:"15px",fontWeight:800,color:"#fff"}}>{c.value}</div>
            <div style={{fontSize:"10px",color:"rgba(255,255,255,0.28)",marginTop:"3px"}}>{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET BAR
// ─────────────────────────────────────────────────────────────────────────────
function BudgetBar({expData,year,month,budget,onEdit}){
  const total=monthTotal(expData,year,month);
  const pct=Math.min(100,total/budget*100);
  const color=pct>90?"#f87171":pct>70?"#facc15":"#4ade80";
  return(
    <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
      borderRadius:"14px",padding:"13px 17px",marginBottom:"14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"9px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"7px"}}>
          <Ico d={IC.target} size={13} stroke={color}/>
          <span style={{fontSize:"11px",fontWeight:700,color:"rgba(255,255,255,0.55)",
            textTransform:"uppercase",letterSpacing:"0.07em"}}>Chiqim limiti</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <span style={{fontSize:"13px",fontWeight:700,color}}>{fmt(total)} / {fmt(budget)} so'm</span>
          <Btn size="sm" variant="ghost" onClick={onEdit} style={{padding:"3px 9px",fontSize:"11px"}}>
            <Ico d={IC.edit} size={11}/> O'zgartirish
          </Btn>
        </div>
      </div>
      <div style={{height:"7px",background:"rgba(255,255,255,0.06)",borderRadius:"99px",overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:"99px",
          transition:"width 0.6s cubic-bezier(0.34,1.56,0.64,1)",boxShadow:`0 0 8px ${color}55`}}/>
      </div>
      <div style={{fontSize:"10px",color:"rgba(255,255,255,0.28)",marginTop:"5px",textAlign:"right"}}>
        {pct.toFixed(1)}% — {fmt(Math.max(0,budget-total))} so'm qoldi
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CASH FLOW CHART
// ─────────────────────────────────────────────────────────────────────────────
function CashFlowChart({expData,incData,year,month}){
  const dim=new Date(year,month+1,0).getDate();
  const days=Array.from({length:dim},(_,i)=>{
    const d=i+1;
    return{
      d,
      exp:(expData[dateKey(year,month,d)]||[]).reduce((a,b)=>a+b.amount,0),
      inc:(incData[dateKey(year,month,d)]||[]).reduce((a,b)=>a+b.amount,0),
    };
  });
  const maxV=Math.max(...days.map(d=>Math.max(d.exp,d.inc)),1);
  const W=560,H=90,padX=10,padY=10;
  const stepX=(W-padX*2)/(dim-1||1);
  const pts=key=>days.map((d,i)=>`${padX+i*stepX},${H-padY-(d[key]/maxV)*(H-padY*2)}`).join(" ");
  const hasData=days.some(d=>d.exp>0||d.inc>0);
  return(
    <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
      borderRadius:"14px",padding:"14px 17px",marginBottom:"14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
        <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",
          color:"rgba(255,255,255,0.35)",textTransform:"uppercase"}}>Kunlik pul oqimi</div>
        <div style={{display:"flex",gap:"12px"}}>
          {[["#34d399","Kirim"],["#f87171","Chiqim"]].map(([c,l])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:"5px"}}>
              <div style={{width:"18px",height:"2px",background:c,borderRadius:"2px"}}/>
              <span style={{fontSize:"10px",color:"rgba(255,255,255,0.4)"}}>{l}</span>
            </div>
          ))}
        </div>
      </div>
      {!hasData
        ?<div style={{textAlign:"center",padding:"18px 0",color:"rgba(255,255,255,0.15)",fontSize:"12px"}}>Bu oy ma'lumot yo'q</div>
        :(
          <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",overflow:"visible"}}>
            <polyline points={pts("inc")} fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round"/>
            <polyline points={pts("exp")} fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinejoin="round"/>
            {days.map((d,i)=>{
              const x=padX+i*stepX;
              return(
                <g key={i}>
                  {d.inc>0&&<circle cx={x} cy={H-padY-(d.inc/maxV)*(H-padY*2)} r="2.5" fill="#34d399"/>}
                  {d.exp>0&&<circle cx={x} cy={H-padY-(d.exp/maxV)*(H-padY*2)} r="2.5" fill="#f87171"/>}
                </g>
              );
            })}
            {days.filter((_,i)=>i===0||((i+1)%7===0)||(i===dim-1)).map((d)=>(
              <text key={d.d} x={padX+(d.d-1)*stepX} y={H}
                textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="8" fontWeight="600">{d.d}</text>
            ))}
          </svg>
        )
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY COMPARISON
// ─────────────────────────────────────────────────────────────────────────────
function WeeklyComparison({expData,incData,year,month}){
  const weeks=getCalendarWeeks(year,month);
  const prevM=month===0?11:month-1,prevY=month===0?year-1:year;
  const pWeeks=getCalendarWeeks(prevY,prevM);
  const wSum=(data,y,m,days)=>days.reduce((a,d)=>a+(data[dateKey(y,m,d)]||[]).reduce((s,i)=>s+i.amount,0),0);
  const curExp=weeks.map(w=>wSum(expData,year,month,w));
  const curInc=weeks.map(w=>wSum(incData,year,month,w));
  const prevExp=pWeeks.map(w=>wSum(expData,prevY,prevM,w));
  const maxV=Math.max(...curExp,...curInc,...prevExp,1);
  const maxH=68;
  const DOW=["Du","Se","Ch","Pa","Ju","Sh","Ya"];
  return(
    <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
      borderRadius:"14px",padding:"14px 17px",marginBottom:"14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
        <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",
          color:"rgba(255,255,255,0.35)",textTransform:"uppercase"}}>Haftalik taqqoslash</div>
        <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
          {[["#34d399","Kirim"],["#f87171","Chiqim"],["rgba(255,255,255,0.2)",`${MONTHS_UZ[prevM]}`]].map(([c,l])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:"4px"}}>
              <div style={{width:"10px",height:"4px",borderRadius:"2px",background:c}}/>
              <span style={{fontSize:"9px",color:"rgba(255,255,255,0.38)"}}>{l}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{display:"flex",gap:"6px",alignItems:"flex-end"}}>
        {weeks.map((days,wi)=>{
          const iH=curInc[wi]?Math.max(4,curInc[wi]/maxV*maxH):0;
          const eH=curExp[wi]?Math.max(4,curExp[wi]/maxV*maxH):0;
          const pH=prevExp[wi]?Math.max(4,prevExp[wi]/maxV*maxH):0;
          const fd=DOW[(new Date(year,month,days[0]).getDay()+6)%7];
          const ld=DOW[(new Date(year,month,days[days.length-1]).getDay()+6)%7];
          const range=`${days[0]}–${days[days.length-1]}`;
          const dayStr=days.length===1?fd:`${fd}–${ld}`;
          const diff=curExp[wi]-(prevExp[wi]||0);
          return(
            <div key={wi} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"2px"}}>
              {diff!==0&&(curExp[wi]>0||prevExp[wi]>0)&&(
                <div style={{fontSize:"8px",fontWeight:700,color:diff<0?"#4ade80":"#f87171",lineHeight:1}}>
                  {diff<0?"▼":"▲"}{fmtShort(Math.abs(diff))}
                </div>
              )}
              <div style={{width:"100%",display:"flex",gap:"2px",alignItems:"flex-end",height:`${maxH}px`}}>
                <div style={{flex:1,height:`${iH}px`,background:"#34d399",borderRadius:"3px 3px 0 0",transition:"height 0.4s ease"}}/>
                <div style={{flex:1,height:`${eH}px`,background:"#f87171",borderRadius:"3px 3px 0 0",transition:"height 0.4s ease"}}/>
                <div style={{flex:1,height:`${pH}px`,background:"rgba(255,255,255,0.18)",borderRadius:"3px 3px 0 0",transition:"height 0.4s ease"}}/>
              </div>
              <div style={{fontSize:"9px",color:"rgba(255,255,255,0.55)",fontWeight:700}}>{range}</div>
              <div style={{fontSize:"8px",color:"rgba(255,255,255,0.25)"}}>{dayStr}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY PANEL
// ─────────────────────────────────────────────────────────────────────────────
function CategoryPanel({data,year,month,cats,catMap,title}){
  const dim=new Date(year,month+1,0).getDate();
  const tots={};
  for(let d=1;d<=dim;d++)
    for(const it of (data[dateKey(year,month,d)]||[]))
      tots[it.category||"other"]=(tots[it.category||"other"]||0)+it.amount;
  const grand=Object.values(tots).reduce((a,b)=>a+b,0)||1;
  const slices=cats.map(c=>({id:c.id,value:tots[c.id]||0,color:c.color})).filter(s=>s.value>0);
  const sorted=[...cats].filter(c=>tots[c.id]).sort((a,b)=>(tots[b.id]||0)-(tots[a.id]||0));
  return(
    <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
      borderRadius:"14px",padding:"14px 17px",marginBottom:"14px"}}>
      <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",
        color:"rgba(255,255,255,0.35)",marginBottom:"12px",textTransform:"uppercase"}}>{title}</div>
      {sorted.length===0
        ?<div style={{color:"rgba(255,255,255,0.18)",fontSize:"12px",textAlign:"center",padding:"12px 0"}}>Bu oy ma'lumot yo'q</div>
        :(
          <div style={{display:"flex",gap:"14px",alignItems:"center"}}>
            <div style={{position:"relative",flexShrink:0}}>
              <Donut slices={slices} size={100} thick={18}/>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center"}}>
                <div style={{fontSize:"10px",fontWeight:800,color:"#fff"}}>{fmtShort(grand)}</div>
                <div style={{fontSize:"8px",color:"rgba(255,255,255,0.3)"}}>jami</div>
              </div>
            </div>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:"5px"}}>
              {sorted.slice(0,5).map(c=>{
                const v=tots[c.id]||0;
                const pct=(v/grand*100).toFixed(1);
                return(
                  <div key={c.id}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"2px"}}>
                      <span style={{fontSize:"11px",color:"rgba(255,255,255,0.65)",
                        display:"flex",alignItems:"center",gap:"4px"}}>
                        <span>{c.icon}</span>{c.label}
                      </span>
                      <span style={{fontSize:"11px",fontWeight:700,color:c.color}}>{fmtShort(v)} ({pct}%)</span>
                    </div>
                    <div style={{height:"3px",background:"rgba(255,255,255,0.05)",borderRadius:"99px"}}>
                      <div style={{height:"100%",width:`${pct}%`,background:c.color,borderRadius:"99px",transition:"width 0.5s ease"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY BAR CHART
// ─────────────────────────────────────────────────────────────────────────────
function MonthlyChart({expData,incData,year}){
  const months=Array.from({length:12},(_,m)=>({exp:monthTotal(expData,year,m),inc:monthTotal(incData,year,m)}));
  const maxV=Math.max(...months.map(m=>Math.max(m.exp,m.inc)),1);
  const W=560,H=80,padX=14,padY=8,colW=(W-padX*2)/12;
  return(
    <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
      borderRadius:"14px",padding:"14px 17px",marginBottom:"14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
        <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",
          color:"rgba(255,255,255,0.35)",textTransform:"uppercase"}}>{year} — Oylik dinamika</div>
        <div style={{display:"flex",gap:"12px"}}>
          {[["#34d399","Kirim"],["#f87171","Chiqim"]].map(([c,l])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:"4px"}}>
              <div style={{width:"10px",height:"10px",borderRadius:"3px",background:c}}/>
              <span style={{fontSize:"10px",color:"rgba(255,255,255,0.35)"}}>{l}</span>
            </div>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",overflow:"visible"}}>
        {months.map((m,i)=>{
          const iH=m.inc?Math.max(3,(m.inc/maxV)*(H-padY*2)):0;
          const eH=m.exp?Math.max(3,(m.exp/maxV)*(H-padY*2)):0;
          const bw=colW*0.37,xi=padX+i*colW+colW*0.09,xe=xi+bw+2;
          return(
            <g key={i}>
              <rect x={xi} y={H-padY-iH} width={bw} height={iH} rx="2" fill="#34d399" opacity="0.8"/>
              <rect x={xe} y={H-padY-eH} width={bw} height={eH} rx="2" fill="#f87171" opacity="0.8"/>
              <text x={xi+bw} y={H} textAnchor="middle" fill="rgba(255,255,255,0.28)"
                fontSize="7.5" fontWeight="600">{MONTHS_UZ[i].slice(0,3)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GOALS
// ─────────────────────────────────────────────────────────────────────────────
function GoalsModal({goals,onClose,onAdd,onDelete,onAddAmount}){
  const [name,setName]=useState(""),[target,setTarget]=useState(""),
        [addAmt,setAddAmt]=useState({});
  const handleAdd=()=>{
    if(!name.trim()||!target) return;
    const n=parseInt(target,10);
    if(isNaN(n)||n<=0) return;
    onAdd({id:Date.now(),name:name.trim(),target:n,saved:0});
    setName("");setTarget("");
  };
  return(
    <Modal onClose={onClose} width="520px">
      <MHead title="🎯 Moliyaviy maqsadlar" subtitle="Yig'ish maqsadlarini belgilang va kuzating" onClose={onClose}/>
      <div style={{padding:"14px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
        <div style={{display:"flex",gap:"8px"}}>
          <Inp value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Maqsad nomi..." style={{flex:2}}/>
          <Inp value={target} onChange={e=>setTarget(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Miqdor..." inputMode="numeric" style={{flex:1}}/>
          <Btn onClick={handleAdd} variant="primary" style={{padding:"10px 14px",flexShrink:0}}><Ico d={IC.plus} size={15}/></Btn>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 24px"}}>
        {goals.length===0
          ?<div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.18)",fontSize:"13px"}}>Hali maqsad qo'shilmagan</div>
          :goals.map(g=>{
            const pct=Math.min(100,(g.saved/g.target)*100);
            const done=pct>=100;
            const color=done?"#4ade80":pct>=50?"#facc15":"#a78bfa";
            return(
              <div key={g.id} style={{padding:"14px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                  <div>
                    <div style={{fontSize:"13px",fontWeight:700,color:"#fff"}}>{done&&"🎉 "}{g.name}</div>
                    <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>
                      {fmtFull(g.saved)} / {fmtFull(g.target)} — {pct.toFixed(1)}%
                    </div>
                  </div>
                  <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
                    <Inp value={addAmt[g.id]||""} onChange={e=>setAddAmt(p=>({...p,[g.id]:e.target.value.replace(/\D/g,"")}))}
                      placeholder="+Qo'shish..." inputMode="numeric" style={{width:"100px",fontSize:"12px",padding:"6px 10px"}}/>
                    <Btn size="sm" variant="success" onClick={()=>{
                      const n=parseInt(addAmt[g.id]||"0",10);
                      if(n>0){onAddAmount(g.id,n);setAddAmt(p=>({...p,[g.id]:""}))}
                    }}>+</Btn>
                    <button onClick={()=>onDelete(g.id)} style={{width:"28px",height:"28px",borderRadius:"7px",
                      border:"1px solid rgba(248,113,113,0.2)",background:"rgba(248,113,113,0.07)",
                      color:"#f87171",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <Ico d={IC.trash} size={12}/>
                    </button>
                  </div>
                </div>
                <div style={{height:"6px",background:"rgba(255,255,255,0.06)",borderRadius:"99px",overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:"99px",
                    transition:"width 0.5s ease",boxShadow:`0 0 8px ${color}55`}}/>
                </div>
                <div style={{fontSize:"10px",color:"rgba(255,255,255,0.28)",marginTop:"3px"}}>
                  {done?"✅ Maqsadga yetildi!":`${fmtFull(g.target-g.saved)} qoldi`}
                </div>
              </div>
            );
          })
        }
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUDGET MODAL
// ─────────────────────────────────────────────────────────────────────────────
function BudgetModal({budget,onClose,onSave}){
  const [val,setVal]=useState(String(budget));
  return(
    <Modal onClose={onClose} width="360px">
      <MHead title="Oylik chiqim limiti" subtitle="Oy uchun xarajat chegarasini belgilang" onClose={onClose}/>
      <div style={{padding:"20px 24px"}}>
        <Inp value={val} onChange={e=>setVal(e.target.value.replace(/\D/g,""))} placeholder="Masalan: 3000000"
          inputMode="numeric" onKeyDown={e=>e.key==="Enter"&&onSave(parseInt(val,10)||DEFAULT_BUDGET)}/>
        <div style={{display:"flex",gap:"8px",marginTop:"12px",justifyContent:"flex-end"}}>
          <Btn onClick={onClose} variant="ghost">Bekor</Btn>
          <Btn onClick={()=>onSave(parseInt(val,10)||DEFAULT_BUDGET)} variant="primary"><Ico d={IC.check} size={14}/> Saqlash</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH MODAL
// ─────────────────────────────────────────────────────────────────────────────
function SearchModal({expData,incData,onClose,onGoTo}){
  const [q,setQ]=useState(""),
        [tab,setTab]=useState("exp");
  const data=tab==="exp"?expData:incData;
  const catMap=tab==="exp"?EXP_MAP:INC_MAP;
  const results=useMemo(()=>{
    if(!q.trim()) return [];
    const ql=q.toLowerCase(),out=[];
    for(const [key,items] of Object.entries(data))
      for(const item of items)
        if(item.name.toLowerCase().includes(ql)||(item.amount+"").includes(ql)||
          (catMap[item.category||"other"]?.label||"").toLowerCase().includes(ql)){
          const {year,month,day}=parseKey(key);
          out.push({...item,key,year,month,day});
        }
    return out.sort((a,b)=>b.key.localeCompare(a.key)).slice(0,60);
  },[q,data,catMap]);
  const total=results.reduce((a,b)=>a+b.amount,0);
  return(
    <Modal onClose={onClose} width="560px">
      <MHead title="Qidirish" subtitle="Kirim va chiqimlar bo'yicha" onClose={onClose}/>
      <div style={{padding:"13px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
        <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
          {[["exp","📉 Chiqimlar"],["inc","📈 Kirimlar"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:"5px 13px",borderRadius:"8px",
              border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"12px",fontWeight:600,
              transition:"all 0.15s",background:tab===t?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.05)",
              color:tab===t?"#a78bfa":"rgba(255,255,255,0.4)",
              outline:tab===t?"1px solid rgba(167,139,250,0.4)":"none"}}>{l}</button>
          ))}
        </div>
        <div style={{position:"relative"}}>
          <div style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",opacity:0.4}}>
            <Ico d={IC.search} size={14}/>
          </div>
          <Inp value={q} onChange={e=>setQ(e.target.value)} placeholder="Qidiring..." style={{paddingLeft:"36px"}} autoFocus/>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"6px 24px"}}>
        {q&&results.length===0&&<div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.18)",fontSize:"13px"}}>Hech narsa topilmadi</div>}
        {results.map((r,i)=>{
          const cat=catMap[r.category||"other"];
          return(
            <div key={i} onClick={()=>{onGoTo(r.key,tab);onClose();}}
              style={{display:"flex",alignItems:"center",gap:"12px",padding:"9px 0",
                borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer",transition:"padding-left 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.paddingLeft="6px"}
              onMouseLeave={e=>e.currentTarget.style.paddingLeft="0"}>
              <span style={{fontSize:"17px"}}>{cat?.icon||"📦"}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:"13px",color:"rgba(255,255,255,0.85)",fontWeight:600}}>{r.name}</div>
                <div style={{fontSize:"11px",color:"rgba(255,255,255,0.32)",marginTop:"1px"}}>
                  {r.day} {MONTHS_UZ[r.month]} {r.year} · {cat?.label}
                </div>
              </div>
              <div style={{fontSize:"13px",fontWeight:700,color:cat?.color||"#94a3b8"}}>{fmt(r.amount)} so'm</div>
            </div>
          );
        })}
      </div>
      {results.length>0&&(
        <div style={{padding:"11px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",
          display:"flex",justifyContent:"space-between",flexShrink:0}}>
          <span style={{fontSize:"12px",color:"rgba(255,255,255,0.28)"}}>{results.length} ta natija</span>
          <span style={{fontSize:"12px",fontWeight:700,color:"#a78bfa"}}>Jami: {fmtFull(total)}</span>
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATES MODAL
// ─────────────────────────────────────────────────────────────────────────────
function TemplatesModal({templates,cats,catMap,onClose,onAdd,onDelete,onApply,title,accentVariant}){
  const [name,setName]=useState(""),
        [amount,setAmount]=useState(""),
        [catId,setCatId]=useState(cats[0]?.id||"other");
  const handleAdd=()=>{
    if(!name.trim()||!amount) return;
    const n=parseInt(amount,10);
    if(isNaN(n)||n<=0) return;
    onAdd({id:Date.now(),name:name.trim(),amount:n,category:catId});
    setName("");setAmount("");
  };
  return(
    <Modal onClose={onClose} width="500px">
      <MHead title={title} subtitle="Tez-tez ishlatiladigan yozuvlarni saqlang" onClose={onClose}/>
      <div style={{padding:"13px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
        <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"9px"}}>
          {cats.map(c=>(
            <button key={c.id} onClick={()=>setCatId(c.id)} style={{padding:"4px 8px",borderRadius:"7px",
              border:"none",cursor:"pointer",fontSize:"11px",fontWeight:600,fontFamily:"inherit",transition:"all 0.15s",
              background:catId===c.id?c.color+"33":"rgba(255,255,255,0.05)",
              color:catId===c.id?c.color:"rgba(255,255,255,0.38)",
              outline:catId===c.id?`1px solid ${c.color}55`:"none"}}>{c.icon} {c.label}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:"8px"}}>
          <Inp value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Sablon nomi..." style={{flex:2}}/>
          <Inp value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Summa..." inputMode="numeric" style={{flex:1}}/>
          <Btn onClick={handleAdd} variant={accentVariant} style={{padding:"10px 13px",flexShrink:0}}><Ico d={IC.plus} size={14}/></Btn>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 24px"}}>
        {templates.length===0
          ?<div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.18)",fontSize:"13px"}}>Hali sablon qo'shilmagan</div>
          :templates.map(t=>{
            const cat=catMap[t.category||cats[0]?.id];
            return(
              <div key={t.id} style={{display:"flex",alignItems:"center",gap:"11px",padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                <span style={{fontSize:"16px"}}>{cat?.icon||"📦"}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:"13px",color:"rgba(255,255,255,0.85)",fontWeight:600}}>{t.name}</div>
                  <div style={{fontSize:"11px",color:cat?.color||"#94a3b8",marginTop:"1px"}}>{cat?.label}</div>
                </div>
                <div style={{fontSize:"13px",fontWeight:700,color:"#fff"}}>{fmt(t.amount)} so'm</div>
                <Btn size="sm" variant="success" onClick={()=>{onApply(t);onClose();}} style={{padding:"4px 9px"}}>Qo'shish</Btn>
                <button onClick={()=>onDelete(t.id)} style={{width:"27px",height:"27px",borderRadius:"7px",
                  border:"1px solid rgba(248,113,113,0.2)",background:"rgba(248,113,113,0.07)",
                  color:"#f87171",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <Ico d={IC.trash} size={12}/>
                </button>
              </div>
            );
          })}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT MODAL
// ─────────────────────────────────────────────────────────────────────────────
function ExportModal({expData,incData,year,month,onClose,onImport}){
  const fileRef=useRef();
  const exportCSV=()=>{
    const dim=new Date(year,month+1,0).getDate();
    const rows=[["Sana","Tur","Nomi","Kategoriya","Summa (so'm)"]];
    for(let d=1;d<=dim;d++){
      for(const it of (expData[dateKey(year,month,d)]||[]))
        rows.push([`${d} ${MONTHS_UZ[month]} ${year}`,"Chiqim",it.name,EXP_MAP[it.category||"other"]?.label||"Boshqa",it.amount]);
      for(const it of (incData[dateKey(year,month,d)]||[]))
        rows.push([`${d} ${MONTHS_UZ[month]} ${year}`,"Kirim",it.name,INC_MAP[it.category||"other_in"]?.label||"Boshqa",it.amount]);
    }
    const blob=new Blob(["\uFEFF"+rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n")],{type:"text/csv;charset=utf-8;"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download=`moliya_${MONTHS_UZ[month]}_${year}.csv`;a.click();
  };
  const exportJSON=()=>{
    const blob=new Blob([JSON.stringify({expData,incData,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);a.download=`moliya_backup_${year}.json`;a.click();
  };
  const importJSON=e=>{
    const file=e.target.files[0];if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const p=JSON.parse(ev.target.result);
        if(p.expData&&p.incData){onImport(p.expData,p.incData);onClose();}
        else alert("Fayl formati noto'g'ri!");
      }catch{alert("Fayl o'qib bo'lmadi!");}
    };
    reader.readAsText(file);
  };
  const BtnRow=({label,sub,icon,rgb,onClick})=>(
    <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:"12px",padding:"13px 15px",
      background:`rgba(${rgb},0.07)`,border:`1px solid rgba(${rgb},0.2)`,borderRadius:"12px",
      cursor:"pointer",color:"#fff",fontFamily:"inherit",transition:"all 0.15s",width:"100%",textAlign:"left"}}
      onMouseEnter={e=>e.currentTarget.style.background=`rgba(${rgb},0.13)`}
      onMouseLeave={e=>e.currentTarget.style.background=`rgba(${rgb},0.07)`}>
      {icon}
      <div><div style={{fontWeight:700,fontSize:"13px"}}>{label}</div>
        <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginTop:"1px"}}>{sub}</div></div>
    </button>
  );
  return(
    <Modal onClose={onClose} width="400px">
      <MHead title="Eksport / Import" subtitle="Ma'lumotlarni saqlash va tiklash" onClose={onClose}/>
      <div style={{padding:"16px 24px",display:"flex",flexDirection:"column",gap:"9px"}}>
        <BtnRow label="CSV eksport" sub={`Kirim+Chiqim — ${MONTHS_UZ[month]} ${year}`} rgb="74,222,128" icon={<Ico d={IC.dl} size={17} stroke="#4ade80"/>} onClick={exportCSV}/>
        <BtnRow label="JSON zaxira" sub="Barcha ma'lumotlar" rgb="167,139,250" icon={<Ico d={IC.dl} size={17} stroke="#a78bfa"/>} onClick={exportJSON}/>
        <BtnRow label="JSON import" sub="Zaxiradan tiklash" rgb="250,204,21" icon={<Ico d={IC.ul} size={17} stroke="#facc15"/>} onClick={()=>fileRef.current.click()}/>
        <input ref={fileRef} type="file" accept=".json" onChange={importJSON} style={{display:"none"}}/>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DAY MODAL
// ─────────────────────────────────────────────────────────────────────────────
function DayModal({dateStr,data,cats,catMap,onClose,onSave,templates,mode}){
  const [items,setItems]=useState(()=>(data[dateStr]||[]).map(i=>({...i})));
  const [name,setName]=useState(""),
        [amount,setAmount]=useState(""),
        [catId,setCatId]=useState(cats[0]?.id),
        [editId,setEditId]=useState(null),
        [editName,setEditName]=useState(""),
        [editAmt,setEditAmt]=useState(""),
        [editCat,setEditCat]=useState(cats[0]?.id),
        [shake,setShake]=useState(false),
        [showTpl,setShowTpl]=useState(false);
  const total=items.reduce((a,b)=>a+b.amount,0);
  const [yr,mo,dy]=dateStr.split("-");
  const displayDate=`${parseInt(dy)} ${MONTHS_UZ[parseInt(mo)-1]} ${yr}`;
  const isIncome=mode==="inc";
  const btnVar=isIncome?"income":"primary";
  const addItem=()=>{
    if(!name.trim()||!amount){setShake(true);setTimeout(()=>setShake(false),500);return;}
    const n=parseInt(amount,10);if(isNaN(n)||n<=0) return;
    setItems(p=>[...p,{id:Date.now(),name:name.trim(),amount:n,category:catId}]);
    setName("");setAmount("");
  };
  const startEdit=item=>{setEditId(item.id);setEditName(item.name);setEditAmt(String(item.amount));setEditCat(item.category||cats[0]?.id);};
  const saveEdit=id=>{
    const n=parseInt(editAmt,10);if(!editName.trim()||isNaN(n)||n<=0) return;
    setItems(p=>p.map(i=>i.id===id?{...i,name:editName.trim(),amount:n,category:editCat}:i));
    setEditId(null);
  };
  return(
    <Modal onClose={onClose} width="600px">
      <MHead title={displayDate} subtitle={isIncome?"Kunlik kirimlar":"Kunlik chiqimlar"} onClose={onClose}/>
      <div style={{padding:"13px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
        <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"9px"}}>
          {cats.map(c=>(
            <button key={c.id} onClick={()=>setCatId(c.id)} style={{padding:"4px 8px",borderRadius:"7px",
              border:"none",cursor:"pointer",fontSize:"11px",fontWeight:600,fontFamily:"inherit",transition:"all 0.15s",
              background:catId===c.id?c.color+"33":"rgba(255,255,255,0.05)",
              color:catId===c.id?c.color:"rgba(255,255,255,0.38)",
              outline:catId===c.id?`1px solid ${c.color}55`:"none"}}>{c.icon} {c.label}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:"8px",animation:shake?"shake 0.4s ease":"none"}}>
          <Inp value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()}
            placeholder={isIncome?"Kirim nomi...":"Xarajat nomi..."} style={{flex:2}}/>
          <Inp value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))}
            onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="Summa..." inputMode="numeric" style={{flex:1}}/>
          <Btn onClick={addItem} variant={btnVar} style={{padding:"10px 13px",flexShrink:0}}><Ico d={IC.plus} size={14}/></Btn>
          {templates.length>0&&(
            <Btn onClick={()=>setShowTpl(s=>!s)} variant="ghost" style={{padding:"10px 13px",flexShrink:0}}><Ico d={IC.bolt} size={13}/></Btn>
          )}
        </div>
        {showTpl&&(
          <div style={{marginTop:"9px",display:"flex",gap:"6px",flexWrap:"wrap"}}>
            {templates.map(t=>{
              const cat=catMap[t.category||cats[0]?.id];
              return(
                <button key={t.id} onClick={()=>{
                  setItems(p=>[...p,{id:Date.now(),name:t.name,amount:t.amount,category:t.category}]);
                  setShowTpl(false);
                }} style={{padding:"5px 10px",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.1)",
                  background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.75)",cursor:"pointer",
                  fontSize:"11px",fontWeight:600,display:"flex",alignItems:"center",gap:"5px",
                  transition:"all 0.15s",fontFamily:"inherit"}}
                  onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}
                  onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}>
                  <span>{cat?.icon}</span>{t.name} — {fmtShort(t.amount)}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"6px 24px"}}>
        {items.length===0
          ?<div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.15)",fontSize:"13px"}}>Hali yozuv qo'shilmagan</div>
          :items.map(item=>{
            const cat=catMap[item.category||cats[0]?.id];
            return(
              <div key={item.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                <span style={{fontSize:"15px",flexShrink:0}}>{cat?.icon||"📦"}</span>
                {editId===item.id?(
                  <>
                    <div style={{flex:1,display:"flex",gap:"4px",flexWrap:"wrap"}}>
                      {cats.map(c=>(
                        <button key={c.id} onClick={()=>setEditCat(c.id)} style={{padding:"3px 6px",borderRadius:"6px",
                          border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:600,
                          background:editCat===c.id?c.color+"33":"rgba(255,255,255,0.05)",
                          color:editCat===c.id?c.color:"rgba(255,255,255,0.35)"}}>{c.icon}</button>
                      ))}
                    </div>
                    <Inp value={editName} onChange={e=>setEditName(e.target.value)} style={{flex:2}}/>
                    <Inp value={editAmt} onChange={e=>setEditAmt(e.target.value.replace(/\D/g,""))} inputMode="numeric" style={{flex:1}}/>
                    <button onClick={()=>saveEdit(item.id)} style={{width:"29px",height:"29px",borderRadius:"8px",
                      border:"none",background:"#4ade80",color:"#000",cursor:"pointer",
                      display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <Ico d={IC.check} size={13}/>
                    </button>
                  </>
                ):(
                  <>
                    <div style={{flex:1}}>
                      <div style={{fontSize:"13px",color:"rgba(255,255,255,0.85)",fontWeight:600}}>{item.name}</div>
                      <div style={{fontSize:"10px",color:cat?.color||"#94a3b8",marginTop:"1px"}}>{cat?.label}</div>
                    </div>
                    <span style={{fontSize:"13px",fontWeight:700,color:"#fff",
                      background:"rgba(255,255,255,0.06)",padding:"3px 10px",borderRadius:"7px"}}>{fmt(item.amount)}</span>
                    <button onClick={()=>startEdit(item)} style={{width:"27px",height:"27px",borderRadius:"7px",
                      border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",
                      color:"rgba(255,255,255,0.4)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <Ico d={IC.edit} size={12}/>
                    </button>
                    <button onClick={()=>setItems(p=>p.filter(i=>i.id!==item.id))} style={{width:"27px",height:"27px",
                      borderRadius:"7px",border:"1px solid rgba(248,113,113,0.2)",
                      background:"rgba(248,113,113,0.07)",color:"#f87171",cursor:"pointer",
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <Ico d={IC.trash} size={12}/>
                    </button>
                  </>
                )}
              </div>
            );
          })
        }
      </div>
      <div style={{padding:"13px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",
        display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        <div>
          <div style={{fontSize:"10px",color:"rgba(255,255,255,0.28)",fontWeight:700,
            letterSpacing:"0.08em",textTransform:"uppercase"}}>Jami</div>
          <div style={{fontSize:"20px",fontWeight:800,color:isIncome?"#34d399":"#a78bfa"}}>
            {fmt(total)} <span style={{fontSize:"13px",color:"rgba(255,255,255,0.3)",fontWeight:500}}>so'm</span>
          </div>
        </div>
        <div style={{display:"flex",gap:"8px"}}>
          <Btn onClick={onClose} variant="ghost">Bekor</Btn>
          <Btn onClick={()=>{onSave(dateStr,items);onClose();}} variant={btnVar}><Ico d={IC.check} size={14}/> Saqlash</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR
// ─────────────────────────────────────────────────────────────────────────────
function Calendar({expData,incData,year,month,onPrev,onNext,onDayClick,activeTab}){
  const today=new Date();
  const {startDow,daysInMonth}=getMonthDays(year,month);
  const data=activeTab==="exp"?expData:incData;
  const swipeRef=useRef({x:null});

  const handleTouchStart=e=>{ swipeRef.current.x=e.touches[0].clientX; };
  const handleTouchEnd=e=>{
    if(swipeRef.current.x===null) return;
    const dx=e.changedTouches[0].clientX-swipeRef.current.x;
    if(Math.abs(dx)>50){ dx<0?onNext():onPrev(); }
    swipeRef.current.x=null;
  };

  const colorMap={
    empty:{bg:"rgba(255,255,255,0.03)",border:"rgba(255,255,255,0.07)"},
    green:{bg:"rgba(74,222,128,0.09)", border:"rgba(74,222,128,0.28)"},
    yellow:{bg:"rgba(250,204,21,0.09)",border:"rgba(250,204,21,0.28)"},
    red:{bg:"rgba(248,113,113,0.09)", border:"rgba(248,113,113,0.28)"},
    income:{bg:"rgba(52,211,153,0.09)",border:"rgba(52,211,153,0.28)"},
  };
  const getDayStyle=total=>{
    if(activeTab==="inc") return total>0?"income":"empty";
    if(total===0) return "empty";
    if(total<=100_000) return "green";
    if(total<=200_000) return "yellow";
    return "red";
  };

  return(
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"13px"}}>
        <button onClick={onPrev} style={{width:"34px",height:"34px",borderRadius:"9px",
          border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",
          color:"rgba(255,255,255,0.7)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}>
          <Ico d={IC.chevL} size={15}/>
        </button>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:"18px",fontWeight:800,letterSpacing:"-0.02em"}}>{MONTHS_UZ[month]}</div>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",fontWeight:500}}>{year}</div>
        </div>
        <button onClick={onNext} style={{width:"34px",height:"34px",borderRadius:"9px",
          border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",
          color:"rgba(255,255,255,0.7)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}>
          <Ico d={IC.chevR} size={15}/>
        </button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"4px",marginBottom:"4px"}}>
        {DAYS_SHORT.map(d=>(
          <div key={d} style={{textAlign:"center",fontSize:"10px",fontWeight:700,
            color:"rgba(255,255,255,0.22)",letterSpacing:"0.07em",textTransform:"uppercase"}}>{d}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"4px"}}>
        {Array.from({length:startDow}).map((_,i)=><div key={`e${i}`}/>)}
        {Array.from({length:daysInMonth},(_,i)=>{
          const day=i+1,key=dateKey(year,month,day);
          const items=data[key]||[];
          const total=items.reduce((a,b)=>a+b.amount,0);
          const cs=getDayStyle(total),cm=colorMap[cs];
          const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
          const catAmts={};
          for(const it of items) catAmts[it.category||"other"]=(catAmts[it.category||"other"]||0)+it.amount;
          const domCat=Object.entries(catAmts).sort((a,b)=>b[1]-a[1])[0]?.[0];
          const dotColor=domCat?(activeTab==="exp"?EXP_MAP[domCat]?.color:INC_MAP[domCat]?.color):null;
          const hasInc=activeTab==="exp"&&(incData[key]||[]).length>0;
          return(
            <div key={day} className="day-cell" onClick={()=>onDayClick(key)}
              style={{height:"50px",borderRadius:"10px",
                background:isToday?"rgba(167,139,250,0.13)":cm.bg,
                border:`1px solid ${isToday?"rgba(167,139,250,0.45)":cm.border}`,
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                padding:"3px 2px",transition:"transform 0.15s, box-shadow 0.15s",
                animation:isToday?"pulseRing 2.5s infinite":"none",position:"relative",cursor:"pointer"}}>
              <span style={{fontSize:"12px",fontWeight:isToday?800:600,lineHeight:1,
                color:isToday?"#a78bfa":"rgba(255,255,255,0.82)"}}>{day}</span>
              {total>0&&(
                <span style={{fontSize:"9px",fontWeight:700,marginTop:"3px",lineHeight:1,
                  color:activeTab==="inc"?"#34d399":cs==="green"?"#4ade80":cs==="yellow"?"#facc15":"#f87171"}}>
                  {fmtShort(total)}
                </span>
              )}
              {items.length>0&&dotColor&&(
                <div style={{position:"absolute",top:"4px",right:"4px",width:"5px",height:"5px",borderRadius:"50%",background:dotColor}}/>
              )}
              {hasInc&&(
                <div style={{position:"absolute",top:"4px",left:"4px",width:"5px",height:"5px",borderRadius:"50%",background:"#34d399"}}/>
              )}
            </div>
          );
        })}
      </div>
      {(()=>{
        const legendItems=activeTab==="exp"
          ?[{color:"rgba(255,255,255,0.18)",label:"Yo'q"},{color:"#4ade80",label:"≤100K"},
            {color:"#facc15",label:"≤200K"},{color:"#f87171",label:"200K+"},{color:"#34d399",label:"● Kirim bor"}]
          :[{color:"rgba(255,255,255,0.18)",label:"Kirim yo'q"},{color:"#34d399",label:"Kirim bor"}];
        return(
          <div style={{display:"flex",gap:"12px",marginTop:"13px",flexWrap:"wrap",justifyContent:"center"}}>
            {legendItems.map(item=>(
              <div key={item.label} style={{display:"flex",alignItems:"center",gap:"4px"}}>
                <div style={{width:"8px",height:"8px",borderRadius:"2px",background:item.color}}/>
                <span style={{fontSize:"10px",color:"rgba(255,255,255,0.28)",fontWeight:500}}>{item.label} so'm</span>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GOALS MINI
// ─────────────────────────────────────────────────────────────────────────────
function GoalsMini({goals,onOpen}){
  if(!goals.length) return null;
  return(
    <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
      borderRadius:"14px",padding:"13px 17px",marginBottom:"14px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"11px"}}>
        <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",
          color:"rgba(255,255,255,0.35)",textTransform:"uppercase"}}>Maqsadlar</div>
        <Btn size="sm" variant="ghost" onClick={onOpen} style={{padding:"4px 10px",fontSize:"11px"}}>Barchasi</Btn>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:"7px"}}>
        {goals.slice(0,3).map(g=>{
          const pct=Math.min(100,(g.saved/g.target)*100);
          const color=pct>=100?"#4ade80":pct>=50?"#facc15":"#a78bfa";
          return(
            <div key={g.id}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
                <span style={{fontSize:"12px",color:"rgba(255,255,255,0.7)",fontWeight:600}}>{g.name}</span>
                <span style={{fontSize:"11px",color,fontWeight:700}}>{pct.toFixed(0)}% — {fmtShort(g.saved)}/{fmtShort(g.target)}</span>
              </div>
              <div style={{height:"4px",background:"rgba(255,255,255,0.06)",borderRadius:"99px"}}>
                <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:"99px",transition:"width 0.5s ease"}}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App(){
  const today=new Date();
  const [year,setYear]=useState(today.getFullYear());
  const [month,setMonth]=useState(today.getMonth());
  const [activeTab,setActiveTab]=useState("exp");
  const [expData,setExpData]=useState(()=>load(SK.exp,{}));
  const [incData,setIncData]=useState(()=>load(SK.inc,{}));
  const [budget,setBudget]=useState(()=>load(SK.budget,DEFAULT_BUDGET));
  const [goals,setGoals]=useState(()=>load(SK.goals,[]));
  const [expTpls,setExpTpls]=useState(()=>load(SK.etpl,[]));
  const [incTpls,setIncTpls]=useState(()=>load(SK.itpl,[]));

  // modals
  const [dayModal,setDayModal]=useState(null);
  const [showSearch,setShowSearch]=useState(false);
  const [showExpTpl,setShowExpTpl]=useState(false);
  const [showIncTpl,setShowIncTpl]=useState(false);
  const [showExport,setShowExport]=useState(false);
  const [showBudget,setShowBudget]=useState(false);
  const [showGoals,setShowGoals]=useState(false);
  const [showBadges,setShowBadges]=useState(false);
  const [showAI,setShowAI]=useState(false);
  const [showHeatmap,setShowHeatmap]=useState(false);
  const [showCompare,setShowCompare]=useState(false);
  const [showCurrency,setShowCurrency]=useState(false);
  const [showShortcuts,setShowShortcuts]=useState(false);

  // persistence
  const saveExp=useCallback((key,items)=>{
    setExpData(prev=>{const next={...prev,[key]:items};if(!items.length)delete next[key];persist(SK.exp,next);return next;});
  },[]);
  const saveInc=useCallback((key,items)=>{
    setIncData(prev=>{const next={...prev,[key]:items};if(!items.length)delete next[key];persist(SK.inc,next);return next;});
  },[]);
  const saveBudget=val=>{setBudget(val);persist(SK.budget,val);setShowBudget(false);};
  const addGoal=g=>{setGoals(p=>{const n=[...p,g];persist(SK.goals,n);return n;});};
  const delGoal=id=>{setGoals(p=>{const n=p.filter(g=>g.id!==id);persist(SK.goals,n);return n;});};
  const addToGoal=(id,amt)=>{setGoals(p=>{const n=p.map(g=>g.id===id?{...g,saved:g.saved+amt}:g);persist(SK.goals,n);return n;});};
  const addExpTpl=t=>{setExpTpls(p=>{const n=[...p,t];persist(SK.etpl,n);return n;});};
  const delExpTpl=id=>{setExpTpls(p=>{const n=p.filter(t=>t.id!==id);persist(SK.etpl,n);return n;});};
  const addIncTpl=t=>{setIncTpls(p=>{const n=[...p,t];persist(SK.itpl,n);return n;});};
  const delIncTpl=id=>{setIncTpls(p=>{const n=p.filter(t=>t.id!==id);persist(SK.itpl,n);return n;});};

  const prevMonth=()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);};
  const nextMonth=()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);};
  const goToToday=()=>{setYear(today.getFullYear());setMonth(today.getMonth());};

  const goToDate=(key,mode)=>{
    const{year:y,month:m}=parseKey(key);
    setYear(y);setMonth(m);setActiveTab(mode==="inc"?"inc":"exp");
    setDayModal({key,mode:mode==="inc"?"inc":"exp"});
  };

  // Streak info for badge count
  const earnedBadgesCount=useMemo(()=>{
    const {max}=calcStreak(expData);
    const allExpKeys=Object.keys(expData);
    const totalEntries=allExpKeys.reduce((a,k)=>a+(expData[k]||[]).length,0);
    let bestSavingPct=0,budgetWins=0,noCafeMonths=0,incomeDoubled=0;
    for(let y=2023;y<=2026;y++)
      for(let m=0;m<12;m++){
        const exp=monthTotal(expData,y,m),inc=monthTotal(incData,y,m);
        if(inc>0){const p=((inc-exp)/inc)*100;if(p>bestSavingPct)bestSavingPct=p;}
        if(exp>0&&exp<=budget) budgetWins++;
      }
    return BADGES.filter(b=>b.check({totalEntries,maxStreak:max,bestSavingPct,budgetWins,noCafeMonths,incomeDoubled})).length;
  },[expData,incData,budget]);

  // Keyboard shortcuts
  useEffect(()=>{
    const handle=e=>{
      if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA"||e.target.tagName==="SELECT") return;
      const any=dayModal||showSearch||showExpTpl||showIncTpl||showExport||showBudget||
        showGoals||showBadges||showAI||showHeatmap||showCompare||showCurrency||showShortcuts;
      if(e.key==="Escape"&&any){
        setDayModal(null);setShowSearch(false);setShowExpTpl(false);setShowIncTpl(false);
        setShowExport(false);setShowBudget(false);setShowGoals(false);setShowBadges(false);
        setShowAI(false);setShowHeatmap(false);setShowCompare(false);setShowCurrency(false);setShowShortcuts(false);
        return;
      }
      if(any) return;
      if(e.key==="n"||e.key==="N"){setActiveTab("exp");setDayModal({key:dateKey(year,month,today.getDate()),mode:"exp"});}
      else if(e.key==="i"||e.key==="I"){setActiveTab("inc");setDayModal({key:dateKey(year,month,today.getDate()),mode:"inc"});}
      else if(e.key==="s"||e.key==="S") setShowSearch(true);
      else if(e.key==="a"||e.key==="A") setShowAI(true);
      else if(e.key==="c"||e.key==="C") setShowCurrency(true);
      else if(e.key==="h"||e.key==="H") setShowHeatmap(true);
      else if(e.key==="b"||e.key==="B") setShowBadges(true);
      else if(e.key==="ArrowLeft") prevMonth();
      else if(e.key==="ArrowRight") nextMonth();
      else if(e.key==="t"||e.key==="T") goToToday();
      else if(e.key==="?") setShowShortcuts(true);
    };
    window.addEventListener("keydown",handle);
    return ()=>window.removeEventListener("keydown",handle);
  },[dayModal,showSearch,showExpTpl,showIncTpl,showExport,showBudget,showGoals,showBadges,showAI,showHeatmap,showCompare,showCurrency,showShortcuts,year,month]);

  const curExp=monthTotal(expData,year,month);
  const curInc=monthTotal(incData,year,month);
  const showAlert=curInc>0&&curExp>curInc;
  const {current:streak}=useMemo(()=>calcStreak(expData),[expData]);

  return(
    <div style={{minHeight:"100vh",background:"#080812",fontFamily:"'DM Sans','Segoe UI',sans-serif",
      padding:"18px 16px 60px",color:"#fff"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(167,139,250,0.3);border-radius:4px}
        input::placeholder{color:rgba(255,255,255,0.2)}
        select option{background:#1a1a2e}
        .day-cell:hover{transform:translateY(-2px)!important;box-shadow:0 6px 18px rgba(0,0,0,0.4)!important}
        @keyframes pulseRing{0%{box-shadow:0 0 0 0 rgba(167,139,250,0.4)}70%{box-shadow:0 0 0 7px rgba(167,139,250,0)}100%{box-shadow:0 0 0 0 rgba(167,139,250,0)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(26px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      `}</style>

      <div style={{maxWidth:"980px",margin:"0 auto"}}>
        {/* HEADER */}
        <div style={{marginBottom:"18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"10px"}}>
          <div>
            <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.14em",
              color:"rgba(167,139,250,0.65)",textTransform:"uppercase",marginBottom:"3px"}}>Shaxsiy Moliya</div>
            <h1 style={{margin:0,fontSize:"clamp(20px,5vw,32px)",fontWeight:900,letterSpacing:"-0.03em",
              background:"linear-gradient(135deg,#fff 30%,rgba(167,139,250,0.75))",
              WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
              Moliyaviy Daftar
            </h1>
          </div>
          <div style={{display:"flex",gap:"6px",flexWrap:"wrap",alignItems:"center"}}>
            {streak>0&&(
              <div onClick={()=>setShowBadges(true)} style={{display:"flex",alignItems:"center",gap:"5px",
                padding:"5px 11px",borderRadius:"20px",background:"rgba(251,146,60,0.15)",
                border:"1px solid rgba(251,146,60,0.3)",cursor:"pointer"}}>
                <span style={{fontSize:"14px"}}>🔥</span>
                <span style={{fontSize:"12px",fontWeight:700,color:"#fb923c"}}>{streak}</span>
              </div>
            )}
            {earnedBadgesCount>0&&(
              <div onClick={()=>setShowBadges(true)} style={{display:"flex",alignItems:"center",gap:"5px",
                padding:"5px 11px",borderRadius:"20px",background:"rgba(74,222,128,0.1)",
                border:"1px solid rgba(74,222,128,0.25)",cursor:"pointer"}}>
                <span style={{fontSize:"14px"}}>🏆</span>
                <span style={{fontSize:"12px",fontWeight:700,color:"#4ade80"}}>{earnedBadgesCount}</span>
              </div>
            )}
            <Btn size="sm" variant="ai" onClick={()=>setShowAI(true)}><Ico d={IC.ai} size={13}/> AI Tahlil</Btn>
            <Btn size="sm" variant="ghost" onClick={()=>setShowSearch(true)}><Ico d={IC.search} size={13}/> Qidirish</Btn>
            <Btn size="sm" variant="ghost" onClick={()=>setShowCurrency(true)}><Ico d={IC.currency} size={13}/> Valyuta</Btn>
            <Btn size="sm" variant="ghost" onClick={()=>setShowCompare(true)}><Ico d={IC.compare} size={13}/> Taqqos</Btn>
            <Btn size="sm" variant="ghost" onClick={()=>setShowHeatmap(true)} title="Heatmap (H)">📊</Btn>
            <Btn size="sm" variant="ghost" onClick={()=>setShowBadges(true)} title="Badges (B)">🏆</Btn>
            <Btn size="sm" variant="ghost" onClick={()=>setShowExport(true)}><Ico d={IC.dl} size={13}/></Btn>
            <Btn size="sm" variant="ghost" onClick={()=>setShowBudget(true)}><Ico d={IC.target} size={13}/></Btn>
            <Btn size="sm" variant="ghost" onClick={()=>setShowShortcuts(true)} title="Yorliqlar (?)">⌨️</Btn>
          </div>
        </div>

        {/* ALERT */}
        {showAlert&&(
          <div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",
            borderRadius:"12px",padding:"11px 17px",marginBottom:"14px",
            display:"flex",alignItems:"center",gap:"10px",animation:"fadeIn 0.3s ease"}}>
            <span style={{fontSize:"18px"}}>⚠️</span>
            <div>
              <div style={{fontSize:"13px",fontWeight:700,color:"#f87171"}}>Kirimdan ko'p sarfladingiz!</div>
              <div style={{fontSize:"11px",color:"rgba(255,255,255,0.45)",marginTop:"1px"}}>
                Bu oy {fmtFull(curExp-curInc)} ortiqcha xarajat. AI tahlilni tekshiring.
              </div>
            </div>
            <Btn size="sm" variant="ai" onClick={()=>setShowAI(true)} style={{marginLeft:"auto"}}>
              <Ico d={IC.ai} size={12}/> Tahlil
            </Btn>
          </div>
        )}

        {/* STREAK */}
        <StreakBanner expData={expData}/>

        {/* BALANCE */}
        <BalanceBanner expData={expData} incData={incData} year={year} month={month}/>

        {/* BUDGET */}
        <BudgetBar expData={expData} year={year} month={month} budget={budget} onEdit={()=>setShowBudget(true)}/>

        {/* GOALS MINI */}
        <GoalsMini goals={goals} onOpen={()=>setShowGoals(true)}/>

        {/* CHARTS ROW */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
          <WeeklyComparison expData={expData} incData={incData} year={year} month={month}/>
          <CashFlowChart expData={expData} incData={incData} year={year} month={month}/>
        </div>

        {/* CATEGORY ROW */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
          <CategoryPanel data={expData} year={year} month={month} cats={EXPENSE_CATS} catMap={EXP_MAP} title="Chiqim kategoriyalari"/>
          <CategoryPanel data={incData} year={year} month={month} cats={INCOME_CATS}  catMap={INC_MAP}  title="Kirim manbalari"/>
        </div>

        {/* YEARLY CHART */}
        <MonthlyChart expData={expData} incData={incData} year={year}/>

        {/* CALENDAR CARD */}
        <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",
          borderRadius:"20px",padding:"18px",backdropFilter:"blur(20px)"}}>
          {/* Tabs */}
          <div style={{display:"flex",gap:"8px",marginBottom:"15px",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:"5px",background:"rgba(255,255,255,0.04)",borderRadius:"12px",padding:"4px"}}>
              {[{id:"exp",label:"📉 Chiqimlar",color:"#f87171"},{id:"inc",label:"📈 Kirimlar",color:"#34d399"}].map(t=>(
                <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{padding:"7px 18px",borderRadius:"9px",
                  border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"13px",fontWeight:700,transition:"all 0.2s",
                  background:activeTab===t.id?"rgba(255,255,255,0.1)":"transparent",
                  color:activeTab===t.id?t.color:"rgba(255,255,255,0.35)",
                  boxShadow:activeTab===t.id?"0 2px 8px rgba(0,0,0,0.3)":"none"}}>{t.label}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:"6px"}}>
              <Btn size="sm" variant="ghost" onClick={goToToday} style={{fontSize:"11px",padding:"5px 10px"}}>Bugun</Btn>
              <Btn size="sm" variant="ghost" onClick={()=>activeTab==="exp"?setShowExpTpl(true):setShowIncTpl(true)} style={{fontSize:"11px",padding:"5px 10px"}}>
                <Ico d={IC.bolt} size={12}/> Sablonlar
              </Btn>
              <Btn size="sm" variant={activeTab==="inc"?"income":"primary"}
                onClick={()=>setDayModal({key:dateKey(year,month,today.getDate()),mode:activeTab})}
                style={{fontSize:"11px",padding:"5px 12px"}}>
                <Ico d={IC.plus} size={12}/>{activeTab==="inc"?"Kirim":"Chiqim"} qo'shish
              </Btn>
            </div>
          </div>

          <Calendar expData={expData} incData={incData} year={year} month={month}
            onPrev={prevMonth} onNext={nextMonth} onDayClick={key=>setDayModal({key,mode:activeTab})} activeTab={activeTab}/>

          {/* Keyboard hint */}
          <div style={{marginTop:"12px",textAlign:"center",fontSize:"10px",color:"rgba(255,255,255,0.2)"}}>
            ⌨️ N — chiqim · I — kirim · ← → — oy · S — qidirish · A — AI · ? — barcha yorliqlar
          </div>
        </div>
      </div>

      {/* ── MODALS ── */}
      {dayModal&&(
        <DayModal dateStr={dayModal.key} mode={dayModal.mode}
          data={dayModal.mode==="inc"?incData:expData}
          cats={dayModal.mode==="inc"?INCOME_CATS:EXPENSE_CATS}
          catMap={dayModal.mode==="inc"?INC_MAP:EXP_MAP}
          templates={dayModal.mode==="inc"?incTpls:expTpls}
          onClose={()=>setDayModal(null)}
          onSave={dayModal.mode==="inc"?saveInc:saveExp}/>
      )}
      {showSearch&&<SearchModal expData={expData} incData={incData} onClose={()=>setShowSearch(false)} onGoTo={goToDate}/>}
      {showExpTpl&&<TemplatesModal templates={expTpls} cats={EXPENSE_CATS} catMap={EXP_MAP} title="Chiqim sablonlari"
        accentVariant="primary" onClose={()=>setShowExpTpl(false)} onAdd={addExpTpl} onDelete={delExpTpl}
        onApply={()=>{setShowExpTpl(false);setDayModal({key:dateKey(year,month,today.getDate()),mode:"exp"});}}/>}
      {showIncTpl&&<TemplatesModal templates={incTpls} cats={INCOME_CATS} catMap={INC_MAP} title="Kirim sablonlari"
        accentVariant="income" onClose={()=>setShowIncTpl(false)} onAdd={addIncTpl} onDelete={delIncTpl}
        onApply={()=>{setShowIncTpl(false);setDayModal({key:dateKey(year,month,today.getDate()),mode:"inc"});}}/>}
      {showExport&&<ExportModal expData={expData} incData={incData} year={year} month={month}
        onClose={()=>setShowExport(false)}
        onImport={(ed,id)=>{setExpData(ed);persist(SK.exp,ed);setIncData(id);persist(SK.inc,id);}}/>}
      {showBudget&&<BudgetModal budget={budget} onClose={()=>setShowBudget(false)} onSave={saveBudget}/>}
      {showGoals&&<GoalsModal goals={goals} onClose={()=>setShowGoals(false)}
        onAdd={addGoal} onDelete={delGoal} onAddAmount={addToGoal}/>}
      {showBadges&&<BadgesModal expData={expData} incData={incData} budget={budget} onClose={()=>setShowBadges(false)}/>}
      {showAI&&<AIModal expData={expData} incData={incData} budget={budget} year={year} month={month} onClose={()=>setShowAI(false)}/>}
      {showCompare&&<CompareModal expData={expData} incData={incData} year={year} month={month} onClose={()=>setShowCompare(false)}/>}
      {showCurrency&&<CurrencyModal onClose={()=>setShowCurrency(false)}/>}
      {showShortcuts&&<ShortcutsModal onClose={()=>setShowShortcuts(false)}/>}
      {showHeatmap&&(
        <Modal onClose={()=>setShowHeatmap(false)} width="800px">
          <MHead title="📊 Yillik Heatmap" subtitle={`${year} yil xarajatlar intensivligi`} onClose={()=>setShowHeatmap(false)}/>
          <div style={{padding:"16px 24px",overflowX:"auto"}}>
            <div style={{display:"flex",gap:"8px",marginBottom:"14px"}}>
              {[year-1,year,year+1].map(y=>(
                <button key={y} onClick={()=>setYear(y)} style={{padding:"5px 13px",borderRadius:"8px",
                  border:"none",cursor:"pointer",fontFamily:"inherit",fontSize:"12px",fontWeight:700,
                  background:year===y?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.05)",
                  color:year===y?"#a78bfa":"rgba(255,255,255,0.4)"}}>{y}</button>
              ))}
            </div>
            <YearHeatmap expData={expData} year={year}/>
          </div>
        </Modal>
      )}
    </div>
  );
}




// --------4-Variant--------//



// import { useState, useCallback, useMemo, useRef } from "react";

// // ─────────────────────────────────────────────────────────────────────────────
// // CONSTANTS
// // ─────────────────────────────────────────────────────────────────────────────
// const MONTHS_UZ  = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
// const DAYS_SHORT = ["Du","Se","Ch","Pa","Ju","Sh","Ya"];

// const EXPENSE_CATS = [
//   { id:"food",          label:"Oziq-ovqat",    icon:"🛒", color:"#4ade80" },
//   { id:"transport",     label:"Transport",     icon:"🚗", color:"#60a5fa" },
//   { id:"home",          label:"Uy-ro'zg'or",   icon:"🏠", color:"#f59e0b" },
//   { id:"health",        label:"Sog'liq",       icon:"💊", color:"#f87171" },
//   { id:"cafe",          label:"Kafe/Restoran", icon:"☕", color:"#fb923c" },
//   { id:"clothes",       label:"Kiyim",         icon:"👕", color:"#a78bfa" },
//   { id:"entertainment", label:"Ko'ngilochar",  icon:"🎮", color:"#e879f9" },
//   { id:"other",         label:"Boshqa",        icon:"📦", color:"#94a3b8" },
// ];

// const INCOME_CATS = [
//   { id:"salary",    label:"Maosh",          icon:"💼", color:"#4ade80" },
//   { id:"freelance", label:"Freelance",      icon:"💻", color:"#60a5fa" },
//   { id:"business",  label:"Biznes",         icon:"🏪", color:"#f59e0b" },
//   { id:"gift",      label:"Sovg'a/Yordam",  icon:"🎁", color:"#f472b6" },
//   { id:"invest",    label:"Investitsiya",   icon:"📈", color:"#34d399" },
//   { id:"other_in",  label:"Boshqa",         icon:"💰", color:"#94a3b8" },
// ];

// const EXP_MAP = Object.fromEntries(EXPENSE_CATS.map(c=>[c.id,c]));
// const INC_MAP = Object.fromEntries(INCOME_CATS.map(c=>[c.id,c]));

// const SK_EXPENSE   = "mf_expense_v1";
// const SK_INCOME    = "mf_income_v1";
// const SK_BUDGET    = "mf_budget_v1";
// const SK_GOALS     = "mf_goals_v1";
// const SK_ETPL      = "mf_etpl_v1";
// const SK_ITPL      = "mf_itpl_v1";
// const DEFAULT_BUDGET = 3_000_000;

// // ─────────────────────────────────────────────────────────────────────────────
// // HELPERS
// // ─────────────────────────────────────────────────────────────────────────────
// const fmt     = n => Math.round(n).toLocaleString("uz-UZ");
// const fmtFull = n => fmt(n) + " so'm";
// const fmtShort = n => {
//   if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,"")+" mln";
//   if (n >= 1_000)     return Math.round(n/1_000)+"K";
//   return String(Math.round(n));
// };

// const dateKey = (y,m,d) =>
//   `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

// const parseKey = key => {
//   const [y,m,d] = key.split("-").map(Number);
//   return { year:y, month:m-1, day:d };
// };

// const getMonthDays = (year, month) => {
//   const startDow    = (new Date(year,month,1).getDay()+6)%7;
//   const daysInMonth = new Date(year,month+1,0).getDate();
//   return { startDow, daysInMonth };
// };

// const load = (key, def) => {
//   try { return JSON.parse(localStorage.getItem(key)||"null") ?? def; }
//   catch { return def; }
// };
// const persist = (key, val) => localStorage.setItem(key, JSON.stringify(val));

// // month totals helper
// const monthTotal = (data, year, month) => {
//   const dim = new Date(year,month+1,0).getDate();
//   let t = 0;
//   for (let d=1;d<=dim;d++)
//     t += (data[dateKey(year,month,d)]||[]).reduce((a,b)=>a+b.amount,0);
//   return t;
// };

// // real Mon→Sun weeks for a month
// const getCalendarWeeks = (year, month) => {
//   const dim = new Date(year,month+1,0).getDate();
//   const weeks = [];
//   let wk = [];
//   for (let d=1;d<=dim;d++) {
//     wk.push(d);
//     const dow = (new Date(year,month,d).getDay()+6)%7;
//     if (dow===6 || d===dim) { weeks.push(wk); wk=[]; }
//   }
//   return weeks;
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // ICONS
// // ─────────────────────────────────────────────────────────────────────────────
// const Ico = ({ d, size=16, stroke="currentColor", sw=2 }) => (
//   <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
//     stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
//     {(Array.isArray(d)?d:[d]).map((p,i)=><path key={i} d={p}/>)}
//   </svg>
// );
// const IC = {
//   plus:    "M12 5v14M5 12h14",
//   close:   "M18 6 6 18M6 6l12 12",
//   check:   "M20 6 9 17 4 12",
//   edit:    ["M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7","M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"],
//   trash:   ["M3 6h18","M19 6l-1 14H6L5 6","M10 11v6","M14 11v6","M9 6V4h6v2"],
//   chevL:   "M15 18 9 12l6-6",
//   chevR:   "M9 18l6-6-6-6",
//   search:  "M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z",
//   dl:      "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
//   ul:      "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
//   target:  ["M12 22a10 10 0 100-20 10 10 0 000 20z","M12 18a6 6 0 100-12 6 6 0 000 12z","M12 14a2 2 0 100-4 2 2 0 000 4z"],
//   bolt:    "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
//   trend:   "M22 7l-9.5 9.5-5-5L1 17",
//   wallet:  ["M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2z","M16 12a1 1 0 100-2 1 1 0 000 2z"],
//   flag:    "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
//   repeat:  "M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3",
//   info:    "M12 22a10 10 0 100-20 10 10 0 000 20zM12 8v4M12 16h.01",
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // BASE COMPONENTS
// // ─────────────────────────────────────────────────────────────────────────────
// function Btn({ children, onClick, variant="ghost", size="md", style={}, disabled=false }) {
//   const sz = size==="sm" ? {padding:"6px 12px",fontSize:"12px"} : {padding:"10px 18px",fontSize:"13px"};
//   const vs = {
//     ghost:   {background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.7)",border:"1px solid rgba(255,255,255,0.1)"},
//     primary: {background:"linear-gradient(135deg,#7c3aed,#a78bfa)",color:"#fff",boxShadow:"0 4px 16px rgba(124,58,237,0.3)"},
//     income:  {background:"linear-gradient(135deg,#059669,#34d399)",color:"#fff",boxShadow:"0 4px 16px rgba(5,150,105,0.3)"},
//     danger:  {background:"rgba(248,113,113,0.1)",color:"#f87171",border:"1px solid rgba(248,113,113,0.2)"},
//     success: {background:"rgba(74,222,128,0.1)",color:"#4ade80",border:"1px solid rgba(74,222,128,0.2)"},
//   };
//   return (
//     <button onClick={onClick} disabled={disabled} style={{
//       display:"flex",alignItems:"center",gap:"6px",borderRadius:"10px",cursor:disabled?"not-allowed":"pointer",
//       fontFamily:"inherit",fontWeight:600,transition:"all 0.15s",border:"none",letterSpacing:"0.01em",
//       opacity:disabled?0.4:1, ...sz, ...vs[variant], ...style,
//     }}
//       onMouseEnter={e=>{ if(!disabled){e.currentTarget.style.opacity="0.82";e.currentTarget.style.transform="translateY(-1px)";} }}
//       onMouseLeave={e=>{ e.currentTarget.style.opacity="1";e.currentTarget.style.transform="translateY(0)"; }}
//     >{children}</button>
//   );
// }

// function Inp({ value, onChange, onKeyDown, placeholder, inputMode, style={} }) {
//   return (
//     <input value={value} onChange={onChange} onKeyDown={onKeyDown}
//       placeholder={placeholder} inputMode={inputMode}
//       style={{
//         padding:"10px 14px",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.1)",
//         background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:"13px",
//         outline:"none",fontFamily:"inherit",transition:"border-color 0.2s",width:"100%",...style,
//       }}
//       onFocus={e=>e.target.style.borderColor="rgba(167,139,250,0.5)"}
//       onBlur={e =>e.target.style.borderColor="rgba(255,255,255,0.1)"}
//     />
//   );
// }

// function Modal({ onClose, children, width="560px" }) {
//   return (
//     <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",backdropFilter:"blur(14px)",
//       display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}}
//       onClick={e=>e.target===e.currentTarget&&onClose()}>
//       <div style={{width:`min(${width},96vw)`,maxHeight:"92vh",display:"flex",flexDirection:"column",
//         background:"#0d0d1c",border:"1px solid rgba(167,139,250,0.18)",borderRadius:"22px",
//         boxShadow:"0 40px 100px rgba(0,0,0,0.8)",animation:"slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)"}}>
//         {children}
//       </div>
//     </div>
//   );
// }

// function MHead({ title, subtitle, onClose, accent="#a78bfa" }) {
//   return (
//     <div style={{padding:"20px 24px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",
//       display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
//       <div>
//         <div style={{fontSize:"17px",fontWeight:800,color:"#fff"}}>{title}</div>
//         {subtitle&&<div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>{subtitle}</div>}
//       </div>
//       <button onClick={onClose} style={{width:"34px",height:"34px",borderRadius:"9px",
//         border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",
//         color:"rgba(255,255,255,0.5)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
//         <Ico d={IC.close} size={15}/>
//       </button>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // DONUT CHART
// // ─────────────────────────────────────────────────────────────────────────────
// function Donut({ slices, size=120, thick=22 }) {
//   const r    = (size-thick)/2;
//   const cx   = size/2, cy=size/2;
//   const circ = 2*Math.PI*r;
//   const total= slices.reduce((a,s)=>a+s.value,0)||1;
//   let offset = 0;
//   const paths = slices.filter(s=>s.value>0).map(s=>{
//     const dash=(s.value/total)*circ;
//     const el=(
//       <circle key={s.id} cx={cx} cy={cy} r={r} fill="none" stroke={s.color}
//         strokeWidth={thick} strokeDasharray={`${dash} ${circ-dash}`}
//         strokeDashoffset={-offset} style={{transition:"stroke-dasharray 0.5s ease"}}/>
//     );
//     offset+=dash; return el;
//   });
//   return (
//     <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
//       <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thick}/>
//       {paths}
//     </svg>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // TOP BALANCE BANNER
// // ─────────────────────────────────────────────────────────────────────────────
// function BalanceBanner({ expData, incData, year, month }) {
//   const exp = monthTotal(expData, year, month);
//   const inc = monthTotal(incData, year, month);
//   const bal = inc - exp;
//   const savPct = inc > 0 ? Math.round((bal/inc)*100) : 0;

//   // yearly
//   let yExp=0, yInc=0;
//   for (let m=0;m<12;m++) { yExp+=monthTotal(expData,year,m); yInc+=monthTotal(incData,year,m); }

//   const cards = [
//     { label:"Oylik kirim",   value:fmtFull(inc), accent:"#34d399", icon:"📈", sub:"bu oy" },
//     { label:"Oylik chiqim",  value:fmtFull(exp), accent:"#f87171", icon:"📉", sub:"bu oy" },
//     { label:"Sof balans",    value:fmtFull(Math.abs(bal)), accent: bal>=0?"#4ade80":"#f87171",
//       icon: bal>=0?"✅":"⚠️", sub: bal>=0?"ortiqcha":"kamomad" },
//     { label:"Tejamkorlik",   value:`${savPct}%`, accent: savPct>=20?"#4ade80":savPct>=10?"#facc15":"#f87171",
//       icon:"🏦", sub:"daromaddan" },
//   ];

//   return (
//     <div style={{marginBottom:"20px"}}>
//       {/* big balance */}
//       <div style={{background: bal>=0
//         ?"linear-gradient(135deg,rgba(5,150,105,0.15),rgba(52,211,153,0.08))"
//         :"linear-gradient(135deg,rgba(220,38,38,0.15),rgba(248,113,113,0.08))",
//         border:`1px solid ${bal>=0?"rgba(52,211,153,0.25)":"rgba(248,113,113,0.25)"}`,
//         borderRadius:"18px",padding:"20px 24px",marginBottom:"12px",
//         display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
//         <div>
//           <div style={{fontSize:"11px",fontWeight:700,letterSpacing:"0.1em",
//             color:bal>=0?"rgba(52,211,153,0.7)":"rgba(248,113,113,0.7)",textTransform:"uppercase",marginBottom:"4px"}}>
//             {bal>=0?"Oylik ortiqcha":"Oylik kamomad"}
//           </div>
//           <div style={{fontSize:"clamp(24px,5vw,36px)",fontWeight:900,letterSpacing:"-0.03em",
//             color:bal>=0?"#34d399":"#f87171"}}>
//             {bal>=0?"+ ":"- "}{fmtFull(Math.abs(bal))}
//           </div>
//           <div style={{fontSize:"12px",color:"rgba(255,255,255,0.35)",marginTop:"4px"}}>
//             Yillik jami: {fmtFull(yInc-yExp)} {yInc-yExp>=0?"ortiqcha":"kamomad"}
//           </div>
//         </div>
//         <div style={{display:"flex",gap:"24px"}}>
//           {[{l:"Yillik kirim",v:fmtShort(yInc),c:"#34d399"},{l:"Yillik chiqim",v:fmtShort(yExp),c:"#f87171"}].map(x=>(
//             <div key={x.l} style={{textAlign:"center"}}>
//               <div style={{fontSize:"18px",fontWeight:800,color:x.c}}>{x.v}</div>
//               <div style={{fontSize:"10px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>{x.l}</div>
//             </div>
//           ))}
//         </div>
//       </div>
//       {/* 4 stat cards */}
//       <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"10px"}}>
//         {cards.map(c=>(
//           <div key={c.label} style={{background:"rgba(255,255,255,0.03)",
//             border:"1px solid rgba(255,255,255,0.07)",borderRadius:"14px",padding:"13px 15px",
//             position:"relative",overflow:"hidden"}}>
//             <div style={{position:"absolute",top:0,left:0,right:0,height:"2px",background:c.accent,borderRadius:"2px 2px 0 0"}}/>
//             <div style={{fontSize:"10px",color:"rgba(255,255,255,0.38)",fontWeight:700,
//               letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:"5px"}}>{c.label}</div>
//             <div style={{fontSize:"15px",fontWeight:800,color:"#fff",lineHeight:1.2}}>{c.value}</div>
//             <div style={{fontSize:"10px",color:"rgba(255,255,255,0.28)",marginTop:"3px"}}>{c.sub}</div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // BUDGET BAR
// // ─────────────────────────────────────────────────────────────────────────────
// function BudgetBar({ expData, year, month, budget, onEdit }) {
//   const total = monthTotal(expData, year, month);
//   const pct   = Math.min(100, total/budget*100);
//   const color = pct>90?"#f87171":pct>70?"#facc15":"#4ade80";
//   return (
//     <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",
//       borderRadius:"14px",padding:"14px 18px",marginBottom:"16px"}}>
//       <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
//         <div style={{display:"flex",alignItems:"center",gap:"7px"}}>
//           <Ico d={IC.target} size={14} stroke={color}/>
//           <span style={{fontSize:"11px",fontWeight:700,color:"rgba(255,255,255,0.55)",
//             textTransform:"uppercase",letterSpacing:"0.07em"}}>Chiqim limiti</span>
//         </div>
//         <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
//           <span style={{fontSize:"13px",fontWeight:700,color}}>{fmt(total)} / {fmt(budget)} so'm</span>
//           <Btn size="sm" variant="ghost" onClick={onEdit} style={{padding:"4px 10px",fontSize:"11px"}}>
//             <Ico d={IC.edit} size={11}/> O'zgartirish
//           </Btn>
//         </div>
//       </div>
//       <div style={{height:"7px",background:"rgba(255,255,255,0.06)",borderRadius:"99px",overflow:"hidden"}}>
//         <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:"99px",
//           transition:"width 0.6s cubic-bezier(0.34,1.56,0.64,1)",boxShadow:`0 0 8px ${color}55`}}/>
//       </div>
//       <div style={{fontSize:"10px",color:"rgba(255,255,255,0.28)",marginTop:"5px",textAlign:"right"}}>
//         {pct.toFixed(1)}% — {fmt(Math.max(0,budget-total))} so'm qoldi
//       </div>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // CASH FLOW LINE CHART (kirim vs chiqim kunlik)
// // ─────────────────────────────────────────────────────────────────────────────
// function CashFlowChart({ expData, incData, year, month }) {
//   const dim = new Date(year,month+1,0).getDate();
//   const days = Array.from({length:dim},(_,i)=>{
//     const d = i+1;
//     const exp = (expData[dateKey(year,month,d)]||[]).reduce((a,b)=>a+b.amount,0);
//     const inc = (incData[dateKey(year,month,d)]||[]).reduce((a,b)=>a+b.amount,0);
//     return {d, exp, inc};
//   });

//   const maxV = Math.max(...days.map(d=>Math.max(d.exp,d.inc)), 1);
//   const W=560, H=90, padX=10, padY=10;
//   const stepX = (W-padX*2)/(dim-1||1);

//   const pts = (key) => days.map((d,i)=>{
//     const x = padX+i*stepX;
//     const y = H-padY-(d[key]/maxV)*(H-padY*2);
//     return `${x},${y}`;
//   }).join(" ");

//   const hasData = days.some(d=>d.exp>0||d.inc>0);

//   return (
//     <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
//       borderRadius:"14px",padding:"16px 18px",marginBottom:"16px"}}>
//       <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
//         <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",
//           color:"rgba(255,255,255,0.35)",textTransform:"uppercase"}}>Kunlik pul oqimi</div>
//         <div style={{display:"flex",gap:"14px"}}>
//           {[["#34d399","Kirim"],["#f87171","Chiqim"]].map(([c,l])=>(
//             <div key={l} style={{display:"flex",alignItems:"center",gap:"5px"}}>
//               <div style={{width:"20px",height:"2px",background:c,borderRadius:"2px"}}/>
//               <span style={{fontSize:"10px",color:"rgba(255,255,255,0.4)"}}>{l}</span>
//             </div>
//           ))}
//         </div>
//       </div>
//       {!hasData ? (
//         <div style={{textAlign:"center",padding:"20px 0",color:"rgba(255,255,255,0.15)",fontSize:"12px"}}>
//           Bu oy ma'lumot yo'q
//         </div>
//       ) : (
//         <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",overflow:"visible"}}>
//           <defs>
//             <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
//               <stop offset="0%" stopColor="#34d399" stopOpacity="0.3"/>
//               <stop offset="100%" stopColor="#34d399" stopOpacity="0"/>
//             </linearGradient>
//             <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
//               <stop offset="0%" stopColor="#f87171" stopOpacity="0.3"/>
//               <stop offset="100%" stopColor="#f87171" stopOpacity="0"/>
//             </linearGradient>
//           </defs>
//           {/* area fills */}
//           <polyline points={pts("inc")} fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinejoin="round"/>
//           <polyline points={pts("exp")} fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinejoin="round"/>
//           {/* dots for non-zero */}
//           {days.map((d,i)=>{
//             const x=padX+i*stepX;
//             const yi=H-padY-(d.inc/maxV)*(H-padY*2);
//             const ye=H-padY-(d.exp/maxV)*(H-padY*2);
//             return (
//               <g key={i}>
//                 {d.inc>0&&<circle cx={x} cy={yi} r="2.5" fill="#34d399"/>}
//                 {d.exp>0&&<circle cx={x} cy={ye} r="2.5" fill="#f87171"/>}
//               </g>
//             );
//           })}
//           {/* x-axis labels every ~7 days */}
//           {days.filter((_,i)=>i===0||((i+1)%7===0)||(i===dim-1)).map((d)=>{
//             const i=d.d-1;
//             const x=padX+i*stepX;
//             return (
//               <text key={d.d} x={x} y={H} textAnchor="middle"
//                 fill="rgba(255,255,255,0.25)" fontSize="8" fontWeight="600">{d.d}</text>
//             );
//           })}
//         </svg>
//       )}
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // WEEKLY COMPARISON (kirim + chiqim)
// // ─────────────────────────────────────────────────────────────────────────────
// function WeeklyComparison({ expData, incData, year, month }) {
//   const weeks  = getCalendarWeeks(year, month);
//   const prevM  = month===0?11:month-1;
//   const prevY  = month===0?year-1:year;
//   const pWeeks = getCalendarWeeks(prevY, prevM);

//   const wSum = (data,y,m,days) =>
//     days.reduce((a,d)=>a+(data[dateKey(y,m,d)]||[]).reduce((s,i)=>s+i.amount,0),0);

//   const curExp  = weeks.map(w=>wSum(expData,year,month,w));
//   const curInc  = weeks.map(w=>wSum(incData,year,month,w));
//   const prevExp = pWeeks.map(w=>wSum(expData,prevY,prevM,w));

//   const maxV = Math.max(...curExp,...curInc,...prevExp,1);
//   const maxH = 72;
//   const DOW  = ["Du","Se","Ch","Pa","Ju","Sh","Ya"];

//   return (
//     <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
//       borderRadius:"14px",padding:"16px 18px",marginBottom:"16px"}}>
//       <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
//         <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",
//           color:"rgba(255,255,255,0.35)",textTransform:"uppercase"}}>Haftalik taqqoslash</div>
//         <div style={{display:"flex",gap:"12px",flexWrap:"wrap"}}>
//           {[["#34d399","Kirim"],["#f87171","Chiqim (bu oy)"],["rgba(255,255,255,0.2)",`Chiqim (${MONTHS_UZ[prevM]})`]].map(([c,l])=>(
//             <div key={l} style={{display:"flex",alignItems:"center",gap:"4px"}}>
//               <div style={{width:"10px",height:"4px",borderRadius:"2px",background:c}}/>
//               <span style={{fontSize:"9px",color:"rgba(255,255,255,0.38)"}}>{l}</span>
//             </div>
//           ))}
//         </div>
//       </div>
//       <div style={{display:"flex",gap:"8px",alignItems:"flex-end"}}>
//         {weeks.map((days,wi)=>{
//           const iH = curInc[wi]  ? Math.max(4,curInc[wi]/maxV*maxH)  : 0;
//           const eH = curExp[wi]  ? Math.max(4,curExp[wi]/maxV*maxH)  : 0;
//           const pH = prevExp[wi] ? Math.max(4,prevExp[wi]/maxV*maxH) : 0;
//           const fd = DOW[(new Date(year,month,days[0]).getDay()+6)%7];
//           const ld = DOW[(new Date(year,month,days[days.length-1]).getDay()+6)%7];
//           const range = `${days[0]}–${days[days.length-1]}`;
//           const dayStr = days.length===1 ? fd : `${fd}–${ld}`;
//           const diff = curExp[wi] - (prevExp[wi]||0);
//           return (
//             <div key={wi} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:"3px"}}>
//               {diff!==0&&(curExp[wi]>0||prevExp[wi]>0)&&(
//                 <div style={{fontSize:"8px",fontWeight:700,color:diff<0?"#4ade80":"#f87171",lineHeight:1}}>
//                   {diff<0?"▼":"▲"}{fmtShort(Math.abs(diff))}
//                 </div>
//               )}
//               <div style={{width:"100%",display:"flex",gap:"2px",alignItems:"flex-end",height:`${maxH}px`}}>
//                 <div title={`Kirim: ${fmtFull(curInc[wi]||0)}`}
//                   style={{flex:1,height:`${iH}px`,background:"#34d399",borderRadius:"4px 4px 0 0",transition:"height 0.4s ease"}}/>
//                 <div title={`Chiqim: ${fmtFull(curExp[wi]||0)}`}
//                   style={{flex:1,height:`${eH}px`,background:"#f87171",borderRadius:"4px 4px 0 0",transition:"height 0.4s ease"}}/>
//                 <div title={`O'tgan oy chiqim: ${fmtFull(prevExp[wi]||0)}`}
//                   style={{flex:1,height:`${pH}px`,background:"rgba(255,255,255,0.18)",borderRadius:"4px 4px 0 0",transition:"height 0.4s ease"}}/>
//               </div>
//               <div style={{fontSize:"9px",color:"rgba(255,255,255,0.55)",fontWeight:700,lineHeight:1}}>{range}</div>
//               <div style={{fontSize:"8px",color:"rgba(255,255,255,0.25)",lineHeight:1}}>{dayStr}</div>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // CATEGORY PANEL
// // ─────────────────────────────────────────────────────────────────────────────
// function CategoryPanel({ data, year, month, cats, catMap, title }) {
//   const dim  = new Date(year,month+1,0).getDate();
//   const tots = {};
//   for (let d=1;d<=dim;d++)
//     for (const it of (data[dateKey(year,month,d)]||[]))
//       tots[it.category||"other"] = (tots[it.category||"other"]||0)+it.amount;

//   const grand  = Object.values(tots).reduce((a,b)=>a+b,0)||1;
//   const slices = cats.map(c=>({id:c.id,value:tots[c.id]||0,color:c.color})).filter(s=>s.value>0);
//   const sorted = [...cats].filter(c=>tots[c.id]).sort((a,b)=>(tots[b.id]||0)-(tots[a.id]||0));

//   return (
//     <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
//       borderRadius:"14px",padding:"16px 18px",marginBottom:"16px"}}>
//       <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",
//         color:"rgba(255,255,255,0.35)",marginBottom:"14px",textTransform:"uppercase"}}>{title}</div>
//       {sorted.length===0 ? (
//         <div style={{color:"rgba(255,255,255,0.18)",fontSize:"13px",textAlign:"center",padding:"16px 0"}}>
//           Bu oy ma'lumot yo'q
//         </div>
//       ) : (
//         <div style={{display:"flex",gap:"16px",alignItems:"center"}}>
//           <div style={{position:"relative",flexShrink:0}}>
//             <Donut slices={slices} size={110} thick={20}/>
//             <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
//               <div style={{fontSize:"11px",fontWeight:800,color:"#fff"}}>{fmtShort(grand)}</div>
//               <div style={{fontSize:"9px",color:"rgba(255,255,255,0.3)"}}>jami</div>
//             </div>
//           </div>
//           <div style={{flex:1,display:"flex",flexDirection:"column",gap:"5px"}}>
//             {sorted.slice(0,5).map(c=>{
//               const v=tots[c.id]||0;
//               const pct=(v/grand*100).toFixed(1);
//               return (
//                 <div key={c.id}>
//                   <div style={{display:"flex",justifyContent:"space-between",marginBottom:"2px"}}>
//                     <span style={{fontSize:"11px",color:"rgba(255,255,255,0.65)",display:"flex",alignItems:"center",gap:"4px"}}>
//                       <span>{c.icon}</span>{c.label}
//                     </span>
//                     <span style={{fontSize:"11px",fontWeight:700,color:c.color}}>{fmtShort(v)} ({pct}%)</span>
//                   </div>
//                   <div style={{height:"3px",background:"rgba(255,255,255,0.05)",borderRadius:"99px"}}>
//                     <div style={{height:"100%",width:`${pct}%`,background:c.color,borderRadius:"99px",transition:"width 0.5s ease"}}/>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // MONTHLY BAR CHART
// // ─────────────────────────────────────────────────────────────────────────────
// function MonthlyChart({ expData, incData, year }) {
//   const months = Array.from({length:12},(_,m)=>({
//     exp: monthTotal(expData,year,m),
//     inc: monthTotal(incData,year,m),
//   }));
//   const maxV=Math.max(...months.map(m=>Math.max(m.exp,m.inc)),1);
//   const W=560,H=90,padX=14,padY=10;
//   const colW=(W-padX*2)/12;

//   return (
//     <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
//       borderRadius:"14px",padding:"16px 18px",marginBottom:"16px"}}>
//       <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
//         <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",
//           color:"rgba(255,255,255,0.35)",textTransform:"uppercase"}}>{year} — Oylik dinamika</div>
//         <div style={{display:"flex",gap:"14px"}}>
//           {[["#34d399","Kirim"],["#f87171","Chiqim"]].map(([c,l])=>(
//             <div key={l} style={{display:"flex",alignItems:"center",gap:"4px"}}>
//               <div style={{width:"10px",height:"10px",borderRadius:"3px",background:c}}/>
//               <span style={{fontSize:"10px",color:"rgba(255,255,255,0.35)"}}>{l}</span>
//             </div>
//           ))}
//         </div>
//       </div>
//       <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",overflow:"visible"}}>
//         {months.map((m,i)=>{
//           const iH=m.inc?Math.max(3,(m.inc/maxV)*(H-padY*2)):0;
//           const eH=m.exp?Math.max(3,(m.exp/maxV)*(H-padY*2)):0;
//           const bw=(colW*0.38);
//           const xi=padX+i*colW+colW*0.1;
//           const xe=xi+bw+2;
//           return (
//             <g key={i}>
//               <rect x={xi} y={H-padY-iH} width={bw} height={iH} rx="2" fill="#34d399" opacity="0.8"/>
//               <rect x={xe} y={H-padY-eH} width={bw} height={eH} rx="2" fill="#f87171" opacity="0.8"/>
//               <text x={xi+bw} y={H-1} textAnchor="middle" fill="rgba(255,255,255,0.28)"
//                 fontSize="7.5" fontWeight="600">{MONTHS_UZ[i].slice(0,3)}</text>
//             </g>
//           );
//         })}
//       </svg>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // GOALS MODAL
// // ─────────────────────────────────────────────────────────────────────────────
// function GoalsModal({ goals, onClose, onAdd, onDelete, onAddAmount }) {
//   const [name,   setName]   = useState("");
//   const [target, setTarget] = useState("");
//   const [addAmt, setAddAmt] = useState({});

//   const handleAdd = () => {
//     if (!name.trim()||!target) return;
//     const n=parseInt(target,10);
//     if(isNaN(n)||n<=0) return;
//     onAdd({id:Date.now(),name:name.trim(),target:n,saved:0});
//     setName(""); setTarget("");
//   };

//   return (
//     <Modal onClose={onClose} width="540px">
//       <MHead title="Moliyaviy maqsadlar" subtitle="Yig'ish maqsadlarini belgilang va kuzating" onClose={onClose}/>
//       <div style={{padding:"16px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
//         <div style={{display:"flex",gap:"8px"}}>
//           <Inp value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdd()}
//             placeholder="Maqsad nomi (masalan: Telefon)" style={{flex:2}}/>
//           <Inp value={target} onChange={e=>setTarget(e.target.value.replace(/\D/g,""))}
//             onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Miqdor..." inputMode="numeric" style={{flex:1}}/>
//           <Btn onClick={handleAdd} variant="primary" style={{padding:"10px 14px",flexShrink:0}}>
//             <Ico d={IC.plus} size={15}/>
//           </Btn>
//         </div>
//       </div>
//       <div style={{flex:1,overflowY:"auto",padding:"8px 24px"}}>
//         {goals.length===0?(
//           <div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.18)",fontSize:"13px"}}>
//             Hali maqsad qo'shilmagan
//           </div>
//         ):goals.map(g=>{
//           const pct=Math.min(100,(g.saved/g.target)*100);
//           const done=pct>=100;
//           const color=done?"#4ade80":pct>=50?"#facc15":"#a78bfa";
//           return (
//             <div key={g.id} style={{padding:"14px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
//               <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
//                 <div>
//                   <div style={{fontSize:"13px",fontWeight:700,color:"#fff",display:"flex",alignItems:"center",gap:"6px"}}>
//                     {done&&<span>🎉</span>}{g.name}
//                   </div>
//                   <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>
//                     {fmtFull(g.saved)} / {fmtFull(g.target)} — {pct.toFixed(1)}%
//                   </div>
//                 </div>
//                 <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
//                   <Inp value={addAmt[g.id]||""} onChange={e=>setAddAmt(p=>({...p,[g.id]:e.target.value.replace(/\D/g,"")}))}
//                     placeholder="Qo'shish..." inputMode="numeric" style={{width:"110px",fontSize:"12px",padding:"6px 10px"}}/>
//                   <Btn size="sm" variant="success" onClick={()=>{
//                     const n=parseInt(addAmt[g.id]||"0",10);
//                     if(n>0){onAddAmount(g.id,n);setAddAmt(p=>({...p,[g.id]:""}))}
//                   }}>+</Btn>
//                   <button onClick={()=>onDelete(g.id)} style={{width:"28px",height:"28px",borderRadius:"7px",
//                     border:"1px solid rgba(248,113,113,0.2)",background:"rgba(248,113,113,0.07)",
//                     color:"#f87171",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
//                     <Ico d={IC.trash} size={12}/>
//                   </button>
//                 </div>
//               </div>
//               <div style={{height:"6px",background:"rgba(255,255,255,0.06)",borderRadius:"99px",overflow:"hidden"}}>
//                 <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:"99px",
//                   transition:"width 0.5s ease",boxShadow:`0 0 8px ${color}55`}}/>
//               </div>
//               <div style={{fontSize:"10px",color:"rgba(255,255,255,0.28)",marginTop:"4px"}}>
//                 {done?"✅ Maqsadga yetildi!":`${fmtFull(g.target-g.saved)} qoldi`}
//               </div>
//             </div>
//           );
//         })}
//       </div>
//     </Modal>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // BUDGET MODAL
// // ─────────────────────────────────────────────────────────────────────────────
// function BudgetModal({ budget, onClose, onSave }) {
//   const [val, setVal] = useState(String(budget));
//   return (
//     <Modal onClose={onClose} width="360px">
//       <MHead title="Oylik chiqim limiti" subtitle="Oy uchun xarajat chegarasini belgilang" onClose={onClose}/>
//       <div style={{padding:"20px 24px"}}>
//         <Inp value={val} onChange={e=>setVal(e.target.value.replace(/\D/g,""))}
//           placeholder="Masalan: 3000000" inputMode="numeric"
//           onKeyDown={e=>e.key==="Enter"&&onSave(parseInt(val,10)||DEFAULT_BUDGET)}/>
//         <div style={{display:"flex",gap:"8px",marginTop:"12px",justifyContent:"flex-end"}}>
//           <Btn onClick={onClose} variant="ghost">Bekor</Btn>
//           <Btn onClick={()=>onSave(parseInt(val,10)||DEFAULT_BUDGET)} variant="primary">
//             <Ico d={IC.check} size={14}/> Saqlash
//           </Btn>
//         </div>
//       </div>
//     </Modal>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // SEARCH MODAL
// // ─────────────────────────────────────────────────────────────────────────────
// function SearchModal({ expData, incData, onClose, onGoTo }) {
//   const [q,   setQ]   = useState("");
//   const [tab, setTab] = useState("exp");

//   const data   = tab==="exp" ? expData : incData;
//   const catMap = tab==="exp" ? EXP_MAP : INC_MAP;

//   const results = useMemo(()=>{
//     if(!q.trim()) return [];
//     const ql=q.toLowerCase();
//     const out=[];
//     for(const [key,items] of Object.entries(data)){
//       for(const item of items){
//         if(item.name.toLowerCase().includes(ql)||(item.amount+"").includes(ql)||
//           (catMap[item.category||"other"]?.label||"").toLowerCase().includes(ql)){
//           const {year,month,day}=parseKey(key);
//           out.push({...item,key,year,month,day});
//         }
//       }
//     }
//     return out.sort((a,b)=>b.key.localeCompare(a.key)).slice(0,60);
//   },[q,data,catMap]);

//   const total=results.reduce((a,b)=>a+b.amount,0);

//   return (
//     <Modal onClose={onClose} width="560px">
//       <MHead title="Qidirish" subtitle="Kirim va chiqimlar bo'yicha" onClose={onClose}/>
//       <div style={{padding:"14px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
//         <div style={{display:"flex",gap:"6px",marginBottom:"10px"}}>
//           {[["exp","📉 Chiqimlar"],["inc","📈 Kirimlar"]].map(([t,l])=>(
//             <button key={t} onClick={()=>setTab(t)} style={{
//               padding:"6px 14px",borderRadius:"8px",border:"none",cursor:"pointer",
//               fontFamily:"inherit",fontSize:"12px",fontWeight:600,transition:"all 0.15s",
//               background:tab===t?"rgba(167,139,250,0.2)":"rgba(255,255,255,0.05)",
//               color:tab===t?"#a78bfa":"rgba(255,255,255,0.4)",
//               outline:tab===t?"1px solid rgba(167,139,250,0.4)":"none",
//             }}>{l}</button>
//           ))}
//         </div>
//         <div style={{position:"relative"}}>
//           <div style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",opacity:0.4}}>
//             <Ico d={IC.search} size={14}/>
//           </div>
//           <Inp value={q} onChange={e=>setQ(e.target.value)} placeholder="Qidiring..." style={{paddingLeft:"36px"}}/>
//         </div>
//       </div>
//       <div style={{flex:1,overflowY:"auto",padding:"6px 24px"}}>
//         {q&&results.length===0&&(
//           <div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.18)",fontSize:"13px"}}>Hech narsa topilmadi</div>
//         )}
//         {results.map((r,i)=>{
//           const cat=catMap[r.category||"other"];
//           return (
//             <div key={i} onClick={()=>{onGoTo(r.key,tab);onClose();}}
//               style={{display:"flex",alignItems:"center",gap:"12px",padding:"9px 0",
//                 borderBottom:"1px solid rgba(255,255,255,0.04)",cursor:"pointer",transition:"padding-left 0.15s"}}
//               onMouseEnter={e=>e.currentTarget.style.paddingLeft="6px"}
//               onMouseLeave={e=>e.currentTarget.style.paddingLeft="0"}>
//               <span style={{fontSize:"18px"}}>{cat?.icon||"📦"}</span>
//               <div style={{flex:1}}>
//                 <div style={{fontSize:"13px",color:"rgba(255,255,255,0.85)",fontWeight:600}}>{r.name}</div>
//                 <div style={{fontSize:"11px",color:"rgba(255,255,255,0.32)",marginTop:"1px"}}>
//                   {r.day} {MONTHS_UZ[r.month]} {r.year} · {cat?.label||"Boshqa"}
//                 </div>
//               </div>
//               <div style={{fontSize:"13px",fontWeight:700,color:cat?.color||"#94a3b8"}}>{fmt(r.amount)} so'm</div>
//             </div>
//           );
//         })}
//       </div>
//       {results.length>0&&(
//         <div style={{padding:"12px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",
//           display:"flex",justifyContent:"space-between",flexShrink:0}}>
//           <span style={{fontSize:"12px",color:"rgba(255,255,255,0.28)"}}>{results.length} ta natija</span>
//           <span style={{fontSize:"12px",fontWeight:700,color:"#a78bfa"}}>Jami: {fmtFull(total)}</span>
//         </div>
//       )}
//     </Modal>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // TEMPLATES MODAL
// // ─────────────────────────────────────────────────────────────────────────────
// function TemplatesModal({ templates, cats, catMap, onClose, onAdd, onDelete, onApply, title, accentVariant }) {
//   const [name,  setName]  = useState("");
//   const [amount,setAmount]= useState("");
//   const [catId, setCatId] = useState(cats[0]?.id||"other");

//   const handleAdd=()=>{
//     if(!name.trim()||!amount) return;
//     const n=parseInt(amount,10);
//     if(isNaN(n)||n<=0) return;
//     onAdd({id:Date.now(),name:name.trim(),amount:n,category:catId});
//     setName(""); setAmount("");
//   };

//   return (
//     <Modal onClose={onClose} width="520px">
//       <MHead title={title} subtitle="Tez-tez ishlatiladigan yozuvlarni saqlang" onClose={onClose}/>
//       <div style={{padding:"14px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
//         <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"10px"}}>
//           {cats.map(c=>(
//             <button key={c.id} onClick={()=>setCatId(c.id)} style={{
//               padding:"4px 9px",borderRadius:"7px",border:"none",cursor:"pointer",fontSize:"11px",fontWeight:600,
//               background:catId===c.id?c.color+"33":"rgba(255,255,255,0.05)",
//               color:catId===c.id?c.color:"rgba(255,255,255,0.38)",
//               outline:catId===c.id?`1px solid ${c.color}55`:"none",
//               transition:"all 0.15s",fontFamily:"inherit",
//             }}>{c.icon} {c.label}</button>
//           ))}
//         </div>
//         <div style={{display:"flex",gap:"8px"}}>
//           <Inp value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdd()}
//             placeholder="Sablon nomi..." style={{flex:2}}/>
//           <Inp value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))}
//             onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Summa..." inputMode="numeric" style={{flex:1}}/>
//           <Btn onClick={handleAdd} variant={accentVariant} style={{padding:"10px 14px",flexShrink:0}}>
//             <Ico d={IC.plus} size={15}/>
//           </Btn>
//         </div>
//       </div>
//       <div style={{flex:1,overflowY:"auto",padding:"8px 24px"}}>
//         {templates.length===0?(
//           <div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.18)",fontSize:"13px"}}>
//             Hali sablon qo'shilmagan
//           </div>
//         ):templates.map(t=>{
//           const cat=catMap[t.category||cats[0].id];
//           return (
//             <div key={t.id} style={{display:"flex",alignItems:"center",gap:"12px",padding:"10px 0",
//               borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
//               <span style={{fontSize:"17px"}}>{cat?.icon||"📦"}</span>
//               <div style={{flex:1}}>
//                 <div style={{fontSize:"13px",color:"rgba(255,255,255,0.85)",fontWeight:600}}>{t.name}</div>
//                 <div style={{fontSize:"11px",color:cat?.color||"#94a3b8",marginTop:"1px"}}>{cat?.label}</div>
//               </div>
//               <div style={{fontSize:"13px",fontWeight:700,color:"#fff"}}>{fmt(t.amount)} so'm</div>
//               <Btn size="sm" variant="success" onClick={()=>{onApply(t);onClose();}} style={{padding:"5px 10px"}}>
//                 Qo'shish
//               </Btn>
//               <button onClick={()=>onDelete(t.id)} style={{width:"28px",height:"28px",borderRadius:"7px",
//                 border:"1px solid rgba(248,113,113,0.2)",background:"rgba(248,113,113,0.07)",
//                 color:"#f87171",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
//                 <Ico d={IC.trash} size={12}/>
//               </button>
//             </div>
//           );
//         })}
//       </div>
//     </Modal>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // EXPORT MODAL
// // ─────────────────────────────────────────────────────────────────────────────
// function ExportModal({ expData, incData, year, month, onClose, onImport }) {
//   const fileRef = useRef();

//   const exportCSV = () => {
//     const dim=new Date(year,month+1,0).getDate();
//     const rows=[["Sana","Tur","Nomi","Kategoriya","Summa (so'm)"]];
//     for(let d=1;d<=dim;d++){
//       for(const it of (expData[dateKey(year,month,d)]||[])){
//         rows.push([`${d} ${MONTHS_UZ[month]} ${year}`,"Chiqim",it.name,EXP_MAP[it.category||"other"]?.label||"Boshqa",it.amount]);
//       }
//       for(const it of (incData[dateKey(year,month,d)]||[])){
//         rows.push([`${d} ${MONTHS_UZ[month]} ${year}`,"Kirim",it.name,INC_MAP[it.category||"other_in"]?.label||"Boshqa",it.amount]);
//       }
//     }
//     const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
//     const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
//     const url=URL.createObjectURL(blob);
//     const a=document.createElement("a");
//     a.href=url;a.download=`moliya_${MONTHS_UZ[month]}_${year}.csv`;a.click();
//     URL.revokeObjectURL(url);
//   };

//   const exportJSON = () => {
//     const payload={expData,incData,exportedAt:new Date().toISOString()};
//     const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
//     const url=URL.createObjectURL(blob);
//     const a=document.createElement("a");
//     a.href=url;a.download=`moliya_backup_${year}.json`;a.click();
//     URL.revokeObjectURL(url);
//   };

//   const importJSON = e => {
//     const file=e.target.files[0];
//     if(!file) return;
//     const reader=new FileReader();
//     reader.onload=ev=>{
//       try{
//         const p=JSON.parse(ev.target.result);
//         if(p.expData&&p.incData){onImport(p.expData,p.incData);onClose();}
//         else alert("Fayl formati noto'g'ri!");
//       }catch{alert("Fayl o'qib bo'lmadi!");}
//     };
//     reader.readAsText(file);
//   };

//   const btnRow=(label,sub,icon,color,onClick)=>(
//     <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:"12px",padding:"14px 16px",
//       background:`rgba(${color},0.07)`,border:`1px solid rgba(${color},0.2)`,borderRadius:"12px",
//       cursor:"pointer",color:"#fff",fontFamily:"inherit",transition:"all 0.15s",width:"100%",textAlign:"left"}}
//       onMouseEnter={e=>e.currentTarget.style.background=`rgba(${color},0.13)`}
//       onMouseLeave={e=>e.currentTarget.style.background=`rgba(${color},0.07)`}>
//       {icon}
//       <div>
//         <div style={{fontWeight:700,fontSize:"13px"}}>{label}</div>
//         <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",marginTop:"2px"}}>{sub}</div>
//       </div>
//     </button>
//   );

//   return (
//     <Modal onClose={onClose} width="400px">
//       <MHead title="Eksport / Import" subtitle="Ma'lumotlarni saqlash va tiklash" onClose={onClose}/>
//       <div style={{padding:"18px 24px",display:"flex",flexDirection:"column",gap:"10px"}}>
//         {btnRow("CSV eksport",`Kirim+Chiqim — ${MONTHS_UZ[month]} ${year}`,<Ico d={IC.dl} size={18} stroke="#4ade80"/>,"74,222,128",exportCSV)}
//         {btnRow("JSON zaxira","Barcha ma'lumotlar",<Ico d={IC.dl} size={18} stroke="#a78bfa"/>,"167,139,250",exportJSON)}
//         {btnRow("JSON import","Zaxiradan tiklash",<Ico d={IC.ul} size={18} stroke="#facc15"/>,"250,204,21",()=>fileRef.current.click())}
//         <input ref={fileRef} type="file" accept=".json" onChange={importJSON} style={{display:"none"}}/>
//       </div>
//     </Modal>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // DAY MODAL (works for both expense and income)
// // ─────────────────────────────────────────────────────────────────────────────
// function DayModal({ dateStr, data, cats, catMap, onClose, onSave, templates, mode }) {
//   const [items,   setItems]    = useState(()=>(data[dateStr]||[]).map(i=>({...i})));
//   const [name,    setName]     = useState("");
//   const [amount,  setAmount]   = useState("");
//   const [catId,   setCatId]    = useState(cats[0]?.id);
//   const [editId,  setEditId]   = useState(null);
//   const [editName,setEditName] = useState("");
//   const [editAmt, setEditAmt]  = useState("");
//   const [editCat, setEditCat]  = useState(cats[0]?.id);
//   const [shake,   setShake]    = useState(false);
//   const [showTpl, setShowTpl]  = useState(false);

//   const total = items.reduce((a,b)=>a+b.amount,0);
//   const [yr,mo,dy] = dateStr.split("-");
//   const displayDate = `${parseInt(dy)} ${MONTHS_UZ[parseInt(mo)-1]} ${yr}`;
//   const isIncome = mode==="inc";
//   const accent   = isIncome ? "#34d399" : "#a78bfa";
//   const btnVar   = isIncome ? "income"  : "primary";

//   const addItem=()=>{
//     if(!name.trim()||!amount){setShake(true);setTimeout(()=>setShake(false),500);return;}
//     const n=parseInt(amount,10);
//     if(isNaN(n)||n<=0) return;
//     setItems(p=>[...p,{id:Date.now(),name:name.trim(),amount:n,category:catId}]);
//     setName(""); setAmount("");
//   };

//   const startEdit=item=>{
//     setEditId(item.id);setEditName(item.name);
//     setEditAmt(String(item.amount));setEditCat(item.category||cats[0]?.id);
//   };

//   const saveEdit=id=>{
//     const n=parseInt(editAmt,10);
//     if(!editName.trim()||isNaN(n)||n<=0) return;
//     setItems(p=>p.map(i=>i.id===id?{...i,name:editName.trim(),amount:n,category:editCat}:i));
//     setEditId(null);
//   };

//   return (
//     <Modal onClose={onClose} width="600px">
//       <MHead
//         title={displayDate}
//         subtitle={isIncome?"Kunlik kirimlar":"Kunlik chiqimlar"}
//         onClose={onClose}
//         accent={accent}
//       />
//       {/* add row */}
//       <div style={{padding:"14px 24px",borderBottom:"1px solid rgba(255,255,255,0.06)",flexShrink:0}}>
//         <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"10px"}}>
//           {cats.map(c=>(
//             <button key={c.id} onClick={()=>setCatId(c.id)} style={{
//               padding:"4px 9px",borderRadius:"7px",border:"none",cursor:"pointer",
//               fontSize:"11px",fontWeight:600,fontFamily:"inherit",transition:"all 0.15s",
//               background:catId===c.id?c.color+"33":"rgba(255,255,255,0.05)",
//               color:catId===c.id?c.color:"rgba(255,255,255,0.38)",
//               outline:catId===c.id?`1px solid ${c.color}55`:"none",
//             }}>{c.icon} {c.label}</button>
//           ))}
//         </div>
//         <div style={{display:"flex",gap:"8px",animation:shake?"shake 0.4s ease":"none"}}>
//           <Inp value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()}
//             placeholder={isIncome?"Kirim nomi...":"Xarajat nomi..."} style={{flex:2}}/>
//           <Inp value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))}
//             onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="Summa..." inputMode="numeric" style={{flex:1}}/>
//           <Btn onClick={addItem} variant={btnVar} style={{padding:"10px 14px",flexShrink:0}}>
//             <Ico d={IC.plus} size={15}/>
//           </Btn>
//           {templates.length>0&&(
//             <Btn onClick={()=>setShowTpl(s=>!s)} variant="ghost" style={{padding:"10px 14px",flexShrink:0}}>
//               <Ico d={IC.bolt} size={14}/>
//             </Btn>
//           )}
//         </div>
//         {showTpl&&(
//           <div style={{marginTop:"10px",display:"flex",gap:"6px",flexWrap:"wrap"}}>
//             {templates.map(t=>{
//               const cat=catMap[t.category||cats[0]?.id];
//               return (
//                 <button key={t.id} onClick={()=>{
//                   setItems(p=>[...p,{id:Date.now(),name:t.name,amount:t.amount,category:t.category}]);
//                   setShowTpl(false);
//                 }} style={{
//                   padding:"5px 10px",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.1)",
//                   background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.75)",cursor:"pointer",
//                   fontSize:"11px",fontWeight:600,display:"flex",alignItems:"center",gap:"5px",
//                   transition:"all 0.15s",fontFamily:"inherit",
//                 }}
//                   onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}
//                   onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}>
//                   <span>{cat?.icon}</span>{t.name} — {fmtShort(t.amount)}
//                 </button>
//               );
//             })}
//           </div>
//         )}
//       </div>
//       {/* list */}
//       <div style={{flex:1,overflowY:"auto",padding:"6px 24px"}}>
//         {items.length===0?(
//           <div style={{textAlign:"center",padding:"36px 0",color:"rgba(255,255,255,0.15)",fontSize:"13px"}}>
//             Hali yozuv qo'shilmagan
//           </div>
//         ):items.map(item=>{
//           const cat=catMap[item.category||cats[0]?.id];
//           return (
//             <div key={item.id} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 0",
//               borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
//               <span style={{fontSize:"16px",flexShrink:0}}>{cat?.icon||"📦"}</span>
//               {editId===item.id?(
//                 <>
//                   <div style={{flex:1,display:"flex",gap:"4px",flexWrap:"wrap"}}>
//                     {cats.map(c=>(
//                       <button key={c.id} onClick={()=>setEditCat(c.id)} style={{
//                         padding:"3px 7px",borderRadius:"6px",border:"none",cursor:"pointer",fontFamily:"inherit",
//                         fontSize:"10px",fontWeight:600,
//                         background:editCat===c.id?c.color+"33":"rgba(255,255,255,0.05)",
//                         color:editCat===c.id?c.color:"rgba(255,255,255,0.35)",
//                       }}>{c.icon}</button>
//                     ))}
//                   </div>
//                   <Inp value={editName} onChange={e=>setEditName(e.target.value)} style={{flex:2}}/>
//                   <Inp value={editAmt} onChange={e=>setEditAmt(e.target.value.replace(/\D/g,""))}
//                     inputMode="numeric" style={{flex:1}}/>
//                   <button onClick={()=>saveEdit(item.id)} style={{width:"30px",height:"30px",borderRadius:"8px",
//                     border:"none",background:"#4ade80",color:"#000",cursor:"pointer",
//                     display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
//                     <Ico d={IC.check} size={13}/>
//                   </button>
//                 </>
//               ):(
//                 <>
//                   <div style={{flex:1}}>
//                     <div style={{fontSize:"13px",color:"rgba(255,255,255,0.85)",fontWeight:600}}>{item.name}</div>
//                     <div style={{fontSize:"10px",color:cat?.color||"#94a3b8",marginTop:"1px"}}>{cat?.label}</div>
//                   </div>
//                   <span style={{fontSize:"13px",fontWeight:700,color:"#fff",
//                     background:"rgba(255,255,255,0.06)",padding:"3px 10px",borderRadius:"7px"}}>
//                     {fmt(item.amount)}
//                   </span>
//                   <button onClick={()=>startEdit(item)} style={{width:"28px",height:"28px",borderRadius:"7px",
//                     border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",
//                     color:"rgba(255,255,255,0.4)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
//                     <Ico d={IC.edit} size={12}/>
//                   </button>
//                   <button onClick={()=>setItems(p=>p.filter(i=>i.id!==item.id))} style={{width:"28px",height:"28px",
//                     borderRadius:"7px",border:"1px solid rgba(248,113,113,0.2)",
//                     background:"rgba(248,113,113,0.07)",color:"#f87171",cursor:"pointer",
//                     display:"flex",alignItems:"center",justifyContent:"center"}}>
//                     <Ico d={IC.trash} size={12}/>
//                   </button>
//                 </>
//               )}
//             </div>
//           );
//         })}
//       </div>
//       {/* footer */}
//       <div style={{padding:"14px 24px",borderTop:"1px solid rgba(255,255,255,0.06)",
//         display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
//         <div>
//           <div style={{fontSize:"10px",color:"rgba(255,255,255,0.28)",fontWeight:700,
//             letterSpacing:"0.08em",textTransform:"uppercase"}}>Jami</div>
//           <div style={{fontSize:"20px",fontWeight:800,color:accent}}>
//             {fmt(total)} <span style={{fontSize:"13px",color:"rgba(255,255,255,0.3)",fontWeight:500}}>so'm</span>
//           </div>
//         </div>
//         <div style={{display:"flex",gap:"8px"}}>
//           <Btn onClick={onClose} variant="ghost">Bekor</Btn>
//           <Btn onClick={()=>{onSave(dateStr,items);onClose();}} variant={btnVar}>
//             <Ico d={IC.check} size={14}/> Saqlash
//           </Btn>
//         </div>
//       </div>
//     </Modal>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // CALENDAR
// // ─────────────────────────────────────────────────────────────────────────────
// function Calendar({ expData, incData, year, month, onPrev, onNext, onDayClick, activeTab }) {
//   const today = new Date();
//   const {startDow, daysInMonth} = getMonthDays(year, month);
//   const data   = activeTab==="exp" ? expData : incData;
//   const catMap = activeTab==="exp" ? EXP_MAP  : INC_MAP;

//   const colorMap = {
//     empty:  {bg:"rgba(255,255,255,0.03)",border:"rgba(255,255,255,0.07)"},
//     green:  {bg:"rgba(74,222,128,0.09)", border:"rgba(74,222,128,0.28)"},
//     yellow: {bg:"rgba(250,204,21,0.09)", border:"rgba(250,204,21,0.28)"},
//     red:    {bg:"rgba(248,113,113,0.09)",border:"rgba(248,113,113,0.28)"},
//     income: {bg:"rgba(52,211,153,0.09)", border:"rgba(52,211,153,0.28)"},
//   };

//   const getDayStyle = (total) => {
//     if (activeTab==="inc") return total>0 ? "income" : "empty";
//     if (total===0)           return "empty";
//     if (total<=100_000)      return "green";
//     if (total<=200_000)      return "yellow";
//     return "red";
//   };

//   return (
//     <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",
//       borderRadius:"20px",padding:"18px",backdropFilter:"blur(20px)"}}>
//       {/* nav */}
//       <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"14px"}}>
//         <button onClick={onPrev} style={{width:"34px",height:"34px",borderRadius:"9px",
//           border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",
//           color:"rgba(255,255,255,0.7)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.2s"}}
//           onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}
//           onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}>
//           <Ico d={IC.chevL} size={15}/>
//         </button>
//         <div style={{textAlign:"center"}}>
//           <div style={{fontSize:"18px",fontWeight:800,letterSpacing:"-0.02em"}}>{MONTHS_UZ[month]}</div>
//           <div style={{fontSize:"12px",color:"rgba(255,255,255,0.3)",fontWeight:500}}>{year}</div>
//         </div>
//         <button onClick={onNext} style={{width:"34px",height:"34px",borderRadius:"9px",
//           border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",
//           color:"rgba(255,255,255,0.7)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.2s"}}
//           onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}
//           onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}>
//           <Ico d={IC.chevR} size={15}/>
//         </button>
//       </div>
//       {/* day headers */}
//       <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"4px",marginBottom:"4px"}}>
//         {DAYS_SHORT.map(d=>(
//           <div key={d} style={{textAlign:"center",fontSize:"10px",fontWeight:700,
//             color:"rgba(255,255,255,0.22)",letterSpacing:"0.07em",textTransform:"uppercase"}}>{d}</div>
//         ))}
//       </div>
//       {/* cells */}
//       <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"4px"}}>
//         {Array.from({length:startDow}).map((_,i)=><div key={`e${i}`}/>)}
//         {Array.from({length:daysInMonth},(_,i)=>{
//           const day  = i+1;
//           const key  = dateKey(year,month,day);
//           const items= data[key]||[];
//           const total= items.reduce((a,b)=>a+b.amount,0);
//           const cs   = getDayStyle(total);
//           const cm   = colorMap[cs];
//           const isToday=day===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();

//           // dominant cat dot color
//           const catAmts={};
//           for(const it of items) catAmts[it.category||"other"]=(catAmts[it.category||"other"]||0)+it.amount;
//           const domCat=Object.entries(catAmts).sort((a,b)=>b[1]-a[1])[0]?.[0];
//           const dotColor=domCat?(activeTab==="exp"?EXP_MAP[domCat]?.color:INC_MAP[domCat]?.color):null;

//           // also show income dot on expense view
//           const hasInc = activeTab==="exp" && (incData[key]||[]).length>0;

//           return (
//             <div key={day} className="day-cell" onClick={()=>onDayClick(key)}
//               style={{height:"50px",borderRadius:"10px",
//                 background:isToday?"rgba(167,139,250,0.13)":cm.bg,
//                 border:`1px solid ${isToday?"rgba(167,139,250,0.45)":cm.border}`,
//                 display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
//                 padding:"3px 2px",transition:"transform 0.15s, box-shadow 0.15s",
//                 animation:isToday?"pulseRing 2.5s infinite":"none",position:"relative",cursor:"pointer"}}>
//               <span style={{fontSize:"12px",fontWeight:isToday?800:600,lineHeight:1,
//                 color:isToday?"#a78bfa":"rgba(255,255,255,0.82)"}}>{day}</span>
//               {total>0&&(
//                 <span style={{fontSize:"9px",fontWeight:700,marginTop:"3px",lineHeight:1,
//                   color:activeTab==="inc"?"#34d399":cs==="green"?"#4ade80":cs==="yellow"?"#facc15":"#f87171"}}>
//                   {fmtShort(total)}
//                 </span>
//               )}
//               {items.length>0&&dotColor&&(
//                 <div style={{position:"absolute",top:"4px",right:"4px",width:"5px",height:"5px",
//                   borderRadius:"50%",background:dotColor}}/>
//               )}
//               {hasInc&&(
//                 <div style={{position:"absolute",top:"4px",left:"4px",width:"5px",height:"5px",
//                   borderRadius:"50%",background:"#34d399"}}/>
//               )}
//             </div>
//           );
//         })}
//       </div>
//       {/* legend */}
//       {(()=>{
//         const legendItems = activeTab==="exp"
//           ? [
//               {color:"rgba(255,255,255,0.18)", label:"Yo'q"},
//               {color:"#4ade80",               label:"≤100K"},
//               {color:"#facc15",               label:"≤200K"},
//               {color:"#f87171",               label:"200K+"},
//               {color:"#34d399",               label:"● Kirim bor (chap)"},
//             ]
//           : [
//               {color:"rgba(255,255,255,0.18)", label:"Kirim yo'q"},
//               {color:"#34d399",               label:"Kirim bor"},
//             ];
//         return (
//           <div style={{display:"flex",gap:"12px",marginTop:"14px",flexWrap:"wrap",justifyContent:"center"}}>
//             {legendItems.map(item=>(
//               <div key={item.label} style={{display:"flex",alignItems:"center",gap:"4px"}}>
//                 <div style={{width:"8px",height:"8px",borderRadius:"2px",background:item.color}}/>
//                 <span style={{fontSize:"10px",color:"rgba(255,255,255,0.28)",fontWeight:500}}>{item.label} so'm</span>
//               </div>
//             ))}
//           </div>
//         );
//       })()}
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // GOALS MINI PANEL
// // ─────────────────────────────────────────────────────────────────────────────
// function GoalsMini({ goals, onOpen }) {
//   if(goals.length===0) return null;
//   return (
//     <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.06)",
//       borderRadius:"14px",padding:"14px 18px",marginBottom:"16px"}}>
//       <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
//         <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.1em",
//           color:"rgba(255,255,255,0.35)",textTransform:"uppercase"}}>Maqsadlar</div>
//         <Btn size="sm" variant="ghost" onClick={onOpen} style={{padding:"4px 10px",fontSize:"11px"}}>
//           Barchasi
//         </Btn>
//       </div>
//       <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
//         {goals.slice(0,3).map(g=>{
//           const pct=Math.min(100,(g.saved/g.target)*100);
//           const color=pct>=100?"#4ade80":pct>=50?"#facc15":"#a78bfa";
//           return (
//             <div key={g.id}>
//               <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
//                 <span style={{fontSize:"12px",color:"rgba(255,255,255,0.7)",fontWeight:600}}>{g.name}</span>
//                 <span style={{fontSize:"11px",color,fontWeight:700}}>{pct.toFixed(0)}% — {fmtShort(g.saved)}/{fmtShort(g.target)}</span>
//               </div>
//               <div style={{height:"5px",background:"rgba(255,255,255,0.06)",borderRadius:"99px"}}>
//                 <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:"99px",
//                   transition:"width 0.5s ease",boxShadow:`0 0 6px ${color}55`}}/>
//               </div>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // MAIN APP
// // ─────────────────────────────────────────────────────────────────────────────
// export default function App() {
//   const today = new Date();

//   // state
//   const [year,     setYear]     = useState(today.getFullYear());
//   const [month,    setMonth]    = useState(today.getMonth());
//   const [activeTab,setActiveTab]= useState("exp"); // "exp" | "inc"
//   const [expData,  setExpData]  = useState(()=>load(SK_EXPENSE,{}));
//   const [incData,  setIncData]  = useState(()=>load(SK_INCOME, {}));
//   const [budget,   setBudget]   = useState(()=>load(SK_BUDGET,  DEFAULT_BUDGET));
//   const [goals,    setGoals]    = useState(()=>load(SK_GOALS,   []));
//   const [expTpls,  setExpTpls]  = useState(()=>load(SK_ETPL,    []));
//   const [incTpls,  setIncTpls]  = useState(()=>load(SK_ITPL,    []));

//   // modals
//   const [dayModal,    setDayModal]    = useState(null); // {key, mode}
//   const [showSearch,  setShowSearch]  = useState(false);
//   const [showExpTpl,  setShowExpTpl]  = useState(false);
//   const [showIncTpl,  setShowIncTpl]  = useState(false);
//   const [showExport,  setShowExport]  = useState(false);
//   const [showBudget,  setShowBudget]  = useState(false);
//   const [showGoals,   setShowGoals]   = useState(false);

//   // persistence helpers
//   const saveExp = useCallback((key,items)=>{
//     setExpData(prev=>{
//       const next={...prev,[key]:items};
//       if(items.length===0) delete next[key];
//       persist(SK_EXPENSE,next); return next;
//     });
//   },[]);

//   const saveInc = useCallback((key,items)=>{
//     setIncData(prev=>{
//       const next={...prev,[key]:items};
//       if(items.length===0) delete next[key];
//       persist(SK_INCOME,next); return next;
//     });
//   },[]);

//   const saveBudget = val=>{ setBudget(val); persist(SK_BUDGET,val); setShowBudget(false); };

//   const addGoal = g=>{ setGoals(p=>{const n=[...p,g];persist(SK_GOALS,n);return n;}); };
//   const delGoal = id=>{ setGoals(p=>{const n=p.filter(g=>g.id!==id);persist(SK_GOALS,n);return n;}); };
//   const addToGoal=(id,amt)=>{ setGoals(p=>{const n=p.map(g=>g.id===id?{...g,saved:g.saved+amt}:g);persist(SK_GOALS,n);return n;}); };

//   const addExpTpl = t=>{ setExpTpls(p=>{const n=[...p,t];persist(SK_ETPL,n);return n;}); };
//   const delExpTpl = id=>{ setExpTpls(p=>{const n=p.filter(t=>t.id!==id);persist(SK_ETPL,n);return n;}); };
//   const addIncTpl = t=>{ setIncTpls(p=>{const n=[...p,t];persist(SK_ITPL,n);return n;}); };
//   const delIncTpl = id=>{ setIncTpls(p=>{const n=p.filter(t=>t.id!==id);persist(SK_ITPL,n);return n;}); };

//   const prevMonth=()=>{ if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); };
//   const nextMonth=()=>{ if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); };

//   const goToDate=(key,mode)=>{
//     const {year:y,month:m}=parseKey(key);
//     setYear(y);setMonth(m);setActiveTab(mode==="inc"?"inc":"exp");
//     setDayModal({key,mode:mode==="inc"?"inc":"exp"});
//   };

//   const onDayClick=key=>{
//     setDayModal({key,mode:activeTab});
//   };

//   // savings % alert
//   const curInc=monthTotal(incData,year,month);
//   const curExp=monthTotal(expData,year,month);
//   const savPct=curInc>0?Math.round(((curInc-curExp)/curInc)*100):0;
//   const showAlert=curInc>0&&curExp>curInc;

//   return (
//     <div style={{minHeight:"100vh",background:"#080812",
//       fontFamily:"'DM Sans','Segoe UI',sans-serif",padding:"20px 16px 60px",color:"#fff"}}>
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');
//         *{box-sizing:border-box}
//         ::-webkit-scrollbar{width:4px}
//         ::-webkit-scrollbar-track{background:transparent}
//         ::-webkit-scrollbar-thumb{background:rgba(167,139,250,0.3);border-radius:4px}
//         input::placeholder{color:rgba(255,255,255,0.2)}
//         .day-cell:hover{transform:translateY(-2px)!important;box-shadow:0 6px 18px rgba(0,0,0,0.4)!important}
//         @keyframes pulseRing{0%{box-shadow:0 0 0 0 rgba(167,139,250,0.4)}70%{box-shadow:0 0 0 7px rgba(167,139,250,0)}100%{box-shadow:0 0 0 0 rgba(167,139,250,0)}}
//         @keyframes slideUp{from{opacity:0;transform:translateY(26px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}
//         @keyframes fadeIn{from{opacity:0}to{opacity:1}}
//         @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
//       `}</style>

//       <div style={{maxWidth:"980px",margin:"0 auto"}}>

//         {/* ── HEADER ── */}
//         <div style={{marginBottom:"20px",display:"flex",alignItems:"center",
//           justifyContent:"space-between",flexWrap:"wrap",gap:"12px"}}>
//           <div>
//             <div style={{fontSize:"10px",fontWeight:700,letterSpacing:"0.14em",
//               color:"rgba(167,139,250,0.65)",textTransform:"uppercase",marginBottom:"3px"}}>
//               Shaxsiy Moliya
//             </div>
//             <h1 style={{margin:0,fontSize:"clamp(22px,5vw,34px)",fontWeight:900,letterSpacing:"-0.03em",
//               background:"linear-gradient(135deg,#fff 30%,rgba(167,139,250,0.75))",
//               WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>
//               Moliyaviy Daftar
//             </h1>
//           </div>
//           <div style={{display:"flex",gap:"7px",flexWrap:"wrap"}}>
//             <Btn size="sm" variant="ghost" onClick={()=>setShowSearch(true)}>
//               <Ico d={IC.search} size={13}/> Qidirish
//             </Btn>
//             <Btn size="sm" variant="ghost" onClick={()=>setShowGoals(true)}>
//               <Ico d={IC.flag} size={13}/> Maqsadlar
//             </Btn>
//             <Btn size="sm" variant="ghost" onClick={()=>setShowExport(true)}>
//               <Ico d={IC.dl} size={13}/> Eksport
//             </Btn>
//             <Btn size="sm" variant="ghost" onClick={()=>setShowBudget(true)}>
//               <Ico d={IC.target} size={13}/> Limit
//             </Btn>
//           </div>
//         </div>

//         {/* ── ALERT ── */}
//         {showAlert&&(
//           <div style={{background:"rgba(248,113,113,0.1)",border:"1px solid rgba(248,113,113,0.3)",
//             borderRadius:"12px",padding:"12px 18px",marginBottom:"16px",
//             display:"flex",alignItems:"center",gap:"10px",animation:"fadeIn 0.3s ease"}}>
//             <span style={{fontSize:"18px"}}>⚠️</span>
//             <div>
//               <div style={{fontSize:"13px",fontWeight:700,color:"#f87171"}}>Kirimdan ko'p sarfladingiz!</div>
//               <div style={{fontSize:"11px",color:"rgba(255,255,255,0.45)",marginTop:"1px"}}>
//                 Bu oy {fmtFull(curExp-curInc)} ortiqcha xarajat qilindi
//               </div>
//             </div>
//           </div>
//         )}

//         {/* ── BALANCE BANNER ── */}
//         <BalanceBanner expData={expData} incData={incData} year={year} month={month}/>

//         {/* ── BUDGET BAR ── */}
//         <BudgetBar expData={expData} year={year} month={month} budget={budget} onEdit={()=>setShowBudget(true)}/>

//         {/* ── GOALS MINI ── */}
//         <GoalsMini goals={goals} onOpen={()=>setShowGoals(true)}/>

//         {/* ── CHARTS ROW ── */}
//         <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px",marginBottom:"0"}}>
//           <WeeklyComparison expData={expData} incData={incData} year={year} month={month}/>
//           <CashFlowChart    expData={expData} incData={incData} year={year} month={month}/>
//         </div>

//         {/* ── CATEGORY ROW ── */}
//         <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px"}}>
//           <CategoryPanel data={expData} year={year} month={month} cats={EXPENSE_CATS} catMap={EXP_MAP} title="Chiqim kategoriyalari"/>
//           <CategoryPanel data={incData} year={year} month={month} cats={INCOME_CATS}  catMap={INC_MAP} title="Kirim manbalari"/>
//         </div>

//         {/* ── YEARLY CHART ── */}
//         <MonthlyChart expData={expData} incData={incData} year={year}/>

//         {/* ── TABS + CALENDAR ── */}
//         <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.07)",
//           borderRadius:"20px",padding:"18px",backdropFilter:"blur(20px)"}}>

//           {/* tab switcher */}
//           <div style={{display:"flex",gap:"8px",marginBottom:"16px",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
//             <div style={{display:"flex",gap:"6px",background:"rgba(255,255,255,0.04)",
//               borderRadius:"12px",padding:"4px"}}>
//               {[
//                 {id:"exp",label:"📉 Chiqimlar",color:"#f87171"},
//                 {id:"inc",label:"📈 Kirimlar", color:"#34d399"},
//               ].map(t=>(
//                 <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
//                   padding:"8px 20px",borderRadius:"9px",border:"none",cursor:"pointer",
//                   fontFamily:"inherit",fontSize:"13px",fontWeight:700,transition:"all 0.2s",
//                   background:activeTab===t.id?"rgba(255,255,255,0.1)":"transparent",
//                   color:activeTab===t.id?t.color:"rgba(255,255,255,0.35)",
//                   boxShadow:activeTab===t.id?"0 2px 8px rgba(0,0,0,0.3)":"none",
//                 }}>{t.label}</button>
//               ))}
//             </div>
//             <div style={{display:"flex",gap:"6px"}}>
//               <Btn size="sm" variant="ghost"
//                 onClick={()=>activeTab==="exp"?setShowExpTpl(true):setShowIncTpl(true)}
//                 style={{fontSize:"11px",padding:"6px 12px"}}>
//                 <Ico d={IC.bolt} size={12}/> Sablonlar
//               </Btn>
//               <Btn size="sm" variant={activeTab==="inc"?"income":"primary"}
//                 onClick={()=>setDayModal({key:dateKey(year,month,today.getDate()),mode:activeTab})}
//                 style={{fontSize:"11px",padding:"6px 12px"}}>
//                 <Ico d={IC.plus} size={12}/>
//                 {activeTab==="inc"?"Kirim qo'shish":"Chiqim qo'shish"}
//               </Btn>
//             </div>
//           </div>

//           {/* calendar grid */}
//           <Calendar
//             expData={expData} incData={incData}
//             year={year} month={month}
//             onPrev={prevMonth} onNext={nextMonth}
//             onDayClick={onDayClick} activeTab={activeTab}
//           />
//         </div>

//       </div>

//       {/* ── MODALS ── */}
//       {dayModal&&(
//         <DayModal
//           dateStr={dayModal.key}
//           mode={dayModal.mode}
//           data={dayModal.mode==="inc"?incData:expData}
//           cats={dayModal.mode==="inc"?INCOME_CATS:EXPENSE_CATS}
//           catMap={dayModal.mode==="inc"?INC_MAP:EXP_MAP}
//           templates={dayModal.mode==="inc"?incTpls:expTpls}
//           onClose={()=>setDayModal(null)}
//           onSave={dayModal.mode==="inc"?saveInc:saveExp}
//         />
//       )}
//       {showSearch&&(
//         <SearchModal expData={expData} incData={incData}
//           onClose={()=>setShowSearch(false)} onGoTo={goToDate}/>
//       )}
//       {showExpTpl&&(
//         <TemplatesModal templates={expTpls} cats={EXPENSE_CATS} catMap={EXP_MAP}
//           title="Chiqim sablonlari" accentVariant="primary"
//           onClose={()=>setShowExpTpl(false)} onAdd={addExpTpl} onDelete={delExpTpl}
//           onApply={t=>{ setDayModal({key:dateKey(year,month,today.getDate()),mode:"exp"}); }}
//         />
//       )}
//       {showIncTpl&&(
//         <TemplatesModal templates={incTpls} cats={INCOME_CATS} catMap={INC_MAP}
//           title="Kirim sablonlari" accentVariant="income"
//           onClose={()=>setShowIncTpl(false)} onAdd={addIncTpl} onDelete={delIncTpl}
//           onApply={t=>{ setDayModal({key:dateKey(year,month,today.getDate()),mode:"inc"}); }}
//         />
//       )}
//       {showExport&&(
//         <ExportModal expData={expData} incData={incData} year={year} month={month}
//           onClose={()=>setShowExport(false)}
//           onImport={(ed,id)=>{
//             setExpData(ed);persist(SK_EXPENSE,ed);
//             setIncData(id);persist(SK_INCOME,id);
//           }}/>
//       )}
//       {showBudget&&(
//         <BudgetModal budget={budget} onClose={()=>setShowBudget(false)} onSave={saveBudget}/>
//       )}
//       {showGoals&&(
//         <GoalsModal goals={goals} onClose={()=>setShowGoals(false)}
//           onAdd={addGoal} onDelete={delGoal} onAddAmount={addToGoal}/>
//       )}
//     </div>
//   );
// }



// ---------------2-variant-------------------------//



// import { useState, useCallback, useMemo, useRef, useEffect } from "react";

// // ─────────────────────────────────────────────────────────────────────────────
// // CONSTANTS
// // ─────────────────────────────────────────────────────────────────────────────
// const MONTHS_UZ = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
// const DAYS_UZ   = ["Du","Se","Ch","Pa","Ju","Sh","Ya"];

// const CATEGORIES = [
//   { id: "food",      label: "Oziq-ovqat",   icon: "🛒", color: "#4ade80" },
//   { id: "transport", label: "Transport",    icon: "🚗", color: "#60a5fa" },
//   { id: "home",      label: "Uy-ro'zg'or",  icon: "🏠", color: "#f59e0b" },
//   { id: "health",    label: "Sog'liq",      icon: "💊", color: "#f87171" },
//   { id: "cafe",      label: "Kafe/Rest.",   icon: "☕", color: "#fb923c" },
//   { id: "clothes",   label: "Kiyim",        icon: "👕", color: "#a78bfa" },
//   { id: "entertainment", label: "Ko'ngilochar", icon: "🎮", color: "#e879f9" },
//   { id: "other",     label: "Boshqa",       icon: "📦", color: "#94a3b8" },
// ];

// const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
// const DEFAULT_BUDGET = 3_000_000;
// const STORAGE_KEY = "xarajat_pro_v1";
// const BUDGET_KEY  = "xarajat_budget_v1";
// const TEMPLATES_KEY = "xarajat_templates_v1";

// // ─────────────────────────────────────────────────────────────────────────────
// // HELPERS
// // ─────────────────────────────────────────────────────────────────────────────
// const fmt = n => n.toLocaleString("uz-UZ");
// const fmtSum = n => {
//   if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,"") + " mln";
//   if (n >= 1_000)     return (n/1_000).toFixed(0) + "K";
//   return String(n);
// };
// const fmtFull = n => fmt(n) + " so'm";

// function dateKey(y, m, d) {
//   return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
// }
// function parseKey(key) {
//   const [y,m,d] = key.split("-").map(Number);
//   return { year: y, month: m-1, day: d };
// }
// function getMonthDays(year, month) {
//   const first   = new Date(year, month, 1);
//   const startDow = (first.getDay() + 6) % 7;
//   const daysInMonth = new Date(year, month + 1, 0).getDate();
//   return { startDow, daysInMonth };
// }
// function getDayColor(total) {
//   if (total === 0)        return "empty";
//   if (total <= 100_000)   return "green";
//   if (total <= 200_000)   return "yellow";
//   return "red";
// }

// const load  = (key, def) => { try { return JSON.parse(localStorage.getItem(key) || "null") ?? def; } catch { return def; } };
// const save  = (key, val) => localStorage.setItem(key, JSON.stringify(val));

// // ─────────────────────────────────────────────────────────────────────────────
// // TINY ICONS
// // ─────────────────────────────────────────────────────────────────────────────
// const Ico = ({ d, size=16, stroke="currentColor", sw=2 }) => (
//   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
//     {Array.isArray(d) ? d.map((p,i) => <path key={i} d={p}/>) : <path d={d}/>}
//   </svg>
// );
// const Icons = {
//   plus:   "M12 5v14M5 12h14",
//   close:  "M18 6 6 18M6 6l12 12",
//   check:  "M20 6 9 17 4 12",
//   edit:   ["M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7","M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"],
//   trash:  ["M3 6h18","M19 6l-1 14H6L5 6","M10 11v6","M14 11v6","M9 6V4h6v2"],
//   chevL:  "M15 18 9 12l6-6",
//   chevR:  "M9 18l6-6-6-6",
//   search: "M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z",
//   download:"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
//   upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
//   target: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z",
//   bolt:   "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
//   bar:    "M18 20V10M12 20V4M6 20v-6",
//   template:"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
//   calendar:"M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
//   settings:"M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // BUTTON
// // ─────────────────────────────────────────────────────────────────────────────
// function Btn({ children, onClick, variant="ghost", size="md", style={} }) {
//   const base = {
//     display:"flex", alignItems:"center", gap:"6px", borderRadius:"10px",
//     cursor:"pointer", fontFamily:"inherit", fontWeight:600, transition:"all 0.15s",
//     border:"none", letterSpacing:"0.01em",
//     ...(size==="sm" ? { padding:"6px 12px", fontSize:"12px" } : { padding:"10px 18px", fontSize:"13px" }),
//   };
//   const variants = {
//     ghost:   { background:"rgba(255,255,255,0.05)", color:"rgba(255,255,255,0.7)", border:"1px solid rgba(255,255,255,0.1)" },
//     primary: { background:"linear-gradient(135deg,#7c3aed,#a78bfa)", color:"#fff", boxShadow:"0 4px 16px rgba(124,58,237,0.35)" },
//     danger:  { background:"rgba(248,113,113,0.1)", color:"#f87171", border:"1px solid rgba(248,113,113,0.2)" },
//     success: { background:"rgba(74,222,128,0.1)", color:"#4ade80", border:"1px solid rgba(74,222,128,0.2)" },
//   };
//   return (
//     <button onClick={onClick} style={{...base, ...variants[variant], ...style}}
//       onMouseEnter={e => { e.currentTarget.style.opacity="0.85"; e.currentTarget.style.transform="translateY(-1px)"; }}
//       onMouseLeave={e => { e.currentTarget.style.opacity="1"; e.currentTarget.style.transform="translateY(0)"; }}
//     >{children}</button>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // INPUT
// // ─────────────────────────────────────────────────────────────────────────────
// function Input({ value, onChange, onKeyDown, placeholder, type="text", inputMode, style={} }) {
//   return (
//     <input value={value} onChange={onChange} onKeyDown={onKeyDown}
//       placeholder={placeholder} type={type} inputMode={inputMode}
//       style={{
//         padding:"10px 14px", borderRadius:"10px", border:"1px solid rgba(255,255,255,0.1)",
//         background:"rgba(255,255,255,0.05)", color:"#fff", fontSize:"13px",
//         outline:"none", fontFamily:"inherit", transition:"border-color 0.2s", width:"100%", ...style,
//       }}
//       onFocus={e => e.target.style.borderColor="rgba(167,139,250,0.5)"}
//       onBlur={e  => e.target.style.borderColor="rgba(255,255,255,0.1)"}
//     />
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // MODAL WRAPPER
// // ─────────────────────────────────────────────────────────────────────────────
// function Modal({ onClose, children, width="560px" }) {
//   return (
//     <div style={{
//       position:"fixed", inset:0, background:"rgba(0,0,0,0.8)", backdropFilter:"blur(14px)",
//       display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000,
//     }} onClick={e => e.target===e.currentTarget && onClose()}>
//       <div style={{
//         width:`min(${width}, 96vw)`, maxHeight:"92vh", display:"flex", flexDirection:"column",
//         background:"#0d0d1c", border:"1px solid rgba(167,139,250,0.2)", borderRadius:"22px",
//         boxShadow:"0 40px 100px rgba(0,0,0,0.8)",
//         animation:"slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)",
//       }}>
//         {children}
//       </div>
//     </div>
//   );
// }
// function ModalHeader({ title, subtitle, onClose }) {
//   return (
//     <div style={{ padding:"20px 24px 16px", borderBottom:"1px solid rgba(255,255,255,0.06)",
//       display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
//       <div>
//         <div style={{ fontSize:"17px", fontWeight:800, color:"#fff" }}>{title}</div>
//         {subtitle && <div style={{ fontSize:"12px", color:"rgba(255,255,255,0.35)", marginTop:"2px" }}>{subtitle}</div>}
//       </div>
//       <button onClick={onClose} style={{
//         width:"34px", height:"34px", borderRadius:"9px", border:"1px solid rgba(255,255,255,0.1)",
//         background:"rgba(255,255,255,0.05)", color:"rgba(255,255,255,0.5)", cursor:"pointer",
//         display:"flex", alignItems:"center", justifyContent:"center",
//       }}><Ico d={Icons.close} size={15}/></button>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // DONUT CHART
// // ─────────────────────────────────────────────────────────────────────────────
// function DonutChart({ slices, size=140, thickness=28 }) {
//   const r = (size - thickness) / 2;
//   const cx = size / 2, cy = size / 2;
//   const circ = 2 * Math.PI * r;
//   const total = slices.reduce((a, s) => a + s.value, 0) || 1;

//   let offset = 0;
//   const paths = slices.filter(s=>s.value>0).map(s => {
//     const pct = s.value / total;
//     const dash = pct * circ;
//     const gap  = circ - dash;
//     const el = (
//       <circle key={s.id} cx={cx} cy={cy} r={r}
//         fill="none" stroke={s.color} strokeWidth={thickness}
//         strokeDasharray={`${dash} ${gap}`}
//         strokeDashoffset={-offset}
//         style={{ transition:"stroke-dasharray 0.5s ease" }}
//       />
//     );
//     offset += dash;
//     return el;
//   });

//   return (
//     <svg width={size} height={size} style={{ transform:"rotate(-90deg)" }}>
//       <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness}/>
//       {paths}
//     </svg>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // STATS BAR
// // ─────────────────────────────────────────────────────────────────────────────
// function StatsBar({ data, year, month, budget }) {
//   const dim = new Date(year, month+1, 0).getDate();
//   let monthTotal=0, activeDays=0, maxDay=0;
//   for (let d=1; d<=dim; d++) {
//     const s = (data[dateKey(year,month,d)]||[]).reduce((a,b)=>a+b.amount,0);
//     monthTotal += s; if(s>0) activeDays++; if(s>maxDay) maxDay=s;
//   }
//   const avgDay  = activeDays ? Math.round(monthTotal/activeDays) : 0;
//   const budgetPct = Math.min(100, Math.round(monthTotal/budget*100));
//   const budgetLeft = Math.max(0, budget - monthTotal);

//   return (
//     <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"10px", marginBottom:"20px" }}>
//       {[
//         { label:"Oylik jami",      value:fmtFull(monthTotal),  accent:"#4ade80",  sub: `${activeDays} kun xarajat` },
//         { label:"Kunlik o'rtacha", value:fmtFull(avgDay),      accent:"#facc15",  sub: "faol kunlar bo'yicha" },
//         { label:"Byudjet qoldi",   value:fmtFull(budgetLeft),  accent: budgetPct>85?"#f87171":"#a78bfa", sub: `${budgetPct}% ishlatildi` },
//         { label:"Rekord kun",      value:fmtFull(maxDay),      accent:"#f87171",  sub: "eng ko'p xarajat" },
//       ].map(s => (
//         <div key={s.label} style={{
//           background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)",
//           borderRadius:"14px", padding:"14px 16px", position:"relative", overflow:"hidden",
//         }}>
//           <div style={{ position:"absolute", top:0, left:0, right:0, height:"2px", background:s.accent, borderRadius:"2px 2px 0 0" }}/>
//           <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.4)", fontWeight:700, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:"6px" }}>{s.label}</div>
//           <div style={{ fontSize:"14px", fontWeight:800, color:"#fff", lineHeight:1.2 }}>{s.value}</div>
//           <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.3)", marginTop:"4px" }}>{s.sub}</div>
//         </div>
//       ))}
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // BUDGET PROGRESS BAR
// // ─────────────────────────────────────────────────────────────────────────────
// function BudgetBar({ data, year, month, budget, onEdit }) {
//   const dim = new Date(year, month+1, 0).getDate();
//   const total = Array.from({length:dim},(_,i)=>
//     (data[dateKey(year,month,i+1)]||[]).reduce((a,b)=>a+b.amount,0)
//   ).reduce((a,b)=>a+b,0);
//   const pct = Math.min(100, total/budget*100);
//   const color = pct>90?"#f87171":pct>70?"#facc15":"#4ade80";

//   return (
//     <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"14px", padding:"14px 18px", marginBottom:"20px" }}>
//       <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px" }}>
//         <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
//           <Ico d={Icons.target} size={15} stroke={color}/>
//           <span style={{ fontSize:"12px", fontWeight:700, color:"rgba(255,255,255,0.6)", textTransform:"uppercase", letterSpacing:"0.07em" }}>Oylik byudjet</span>
//         </div>
//         <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
//           <span style={{ fontSize:"13px", fontWeight:700, color }}>
//             {fmt(total)} / {fmt(budget)} so'm
//           </span>
//           <Btn size="sm" variant="ghost" onClick={onEdit} style={{ padding:"4px 10px" }}>
//             <Ico d={Icons.edit} size={12}/> O'zgartirish
//           </Btn>
//         </div>
//       </div>
//       <div style={{ height:"8px", background:"rgba(255,255,255,0.06)", borderRadius:"99px", overflow:"hidden" }}>
//         <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:"99px", transition:"width 0.6s cubic-bezier(0.34,1.56,0.64,1)", boxShadow:`0 0 8px ${color}55` }}/>
//       </div>
//       <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.3)", marginTop:"6px", textAlign:"right" }}>
//         {pct.toFixed(1)}% ishlatildi — {fmt(Math.max(0,budget-total))} so'm qoldi
//       </div>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // MONTHLY BAR CHART
// // ─────────────────────────────────────────────────────────────────────────────
// function MonthlyChart({ data, year }) {
//   const months = Array.from({length:12}, (_,m) => {
//     const dm = new Date(year,m+1,0).getDate();
//     let t=0;
//     for(let d=1;d<=dm;d++) t+=(data[dateKey(year,m,d)]||[]).reduce((a,b)=>a+b.amount,0);
//     return t;
//   });
//   const max=Math.max(...months,1);
//   const W=580,H=80,padX=16,padY=8;
//   const colW=(W-padX*2)/12;

//   return (
//     <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"14px", padding:"16px 18px", marginBottom:"20px" }}>
//       <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", color:"rgba(255,255,255,0.35)", marginBottom:"10px", textTransform:"uppercase" }}>
//         {year} — Oylar bo'yicha dinamika
//       </div>
//       <svg viewBox={`0 0 ${W} ${H}`} style={{ width:"100%", height:"auto", overflow:"visible" }}>
//         <defs>
//           <linearGradient id="bG" x1="0" y1="0" x2="0" y2="1">
//             <stop offset="0%" stopColor="#a78bfa"/>
//             <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.3"/>
//           </linearGradient>
//         </defs>
//         {months.map((v,i) => {
//           const bH = v ? Math.max(4,(v/max)*(H-padY*2)) : 0;
//           const x  = padX + i*colW + colW*0.18;
//           const w  = colW*0.64;
//           const y  = H - padY - bH;
//           return (
//             <g key={i}>
//               <rect x={x} y={y} width={w} height={bH} rx="3" fill="url(#bG)" opacity="0.85"/>
//               <text x={x+w/2} y={H-1} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="8" fontWeight="600">{MONTHS_UZ[i].slice(0,3)}</text>
//               {v>0 && <text x={x+w/2} y={y-4} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize="8" fontWeight="700">{fmtSum(v)}</text>}
//             </g>
//           );
//         })}
//       </svg>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // CATEGORY BREAKDOWN PANEL
// // ─────────────────────────────────────────────────────────────────────────────
// function CategoryPanel({ data, year, month }) {
//   const dim = new Date(year,month+1,0).getDate();
//   const totals = {};
//   for (let d=1; d<=dim; d++) {
//     for (const item of (data[dateKey(year,month,d)]||[])) {
//       const cid = item.category || "other";
//       totals[cid] = (totals[cid]||0) + item.amount;
//     }
//   }
//   const grand = Object.values(totals).reduce((a,b)=>a+b,0)||1;
//   const slices = CATEGORIES.map(c => ({ id:c.id, value:totals[c.id]||0, color:c.color })).filter(s=>s.value>0);
//   const sorted = [...CATEGORIES].filter(c=>totals[c.id]).sort((a,b)=>(totals[b.id]||0)-(totals[a.id]||0));

//   return (
//     <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"14px", padding:"16px 18px", marginBottom:"20px" }}>
//       <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", color:"rgba(255,255,255,0.35)", marginBottom:"14px", textTransform:"uppercase" }}>
//         Kategoriya tahlili
//       </div>
//       {sorted.length === 0 ? (
//         <div style={{ color:"rgba(255,255,255,0.2)", fontSize:"13px", textAlign:"center", padding:"20px 0" }}>Bu oy ma'lumot yo'q</div>
//       ) : (
//         <div style={{ display:"flex", gap:"20px", alignItems:"center" }}>
//           <div style={{ position:"relative", flexShrink:0 }}>
//             <DonutChart slices={slices} size={120} thickness={22}/>
//             <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
//               <div style={{ fontSize:"11px", fontWeight:800, color:"#fff" }}>{fmtSum(grand)}</div>
//               <div style={{ fontSize:"9px", color:"rgba(255,255,255,0.3)" }}>jami</div>
//             </div>
//           </div>
//           <div style={{ flex:1, display:"flex", flexDirection:"column", gap:"6px" }}>
//             {sorted.map(c => {
//               const v = totals[c.id]||0;
//               const pct = (v/grand*100).toFixed(1);
//               return (
//                 <div key={c.id}>
//                   <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"3px" }}>
//                     <span style={{ fontSize:"11px", color:"rgba(255,255,255,0.7)", display:"flex", alignItems:"center", gap:"5px" }}>
//                       <span>{c.icon}</span>{c.label}
//                     </span>
//                     <span style={{ fontSize:"11px", fontWeight:700, color:c.color }}>{fmtSum(v)} ({pct}%)</span>
//                   </div>
//                   <div style={{ height:"4px", background:"rgba(255,255,255,0.05)", borderRadius:"99px" }}>
//                     <div style={{ height:"100%", width:`${pct}%`, background:c.color, borderRadius:"99px", transition:"width 0.5s ease" }}/>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // WEEKLY COMPARISON
// // ─────────────────────────────────────────────────────────────────────────────
// function WeeklyComparison({ data, year, month }) {
//   const getWeeks = (y, m) => {
//     const dim = new Date(y, m+1, 0).getDate();
//     const weeks = [];
//     let wk = [];
//     for (let d=1; d<=dim; d++) {
//       wk.push(d);
//       const dow = (new Date(y,m,d).getDay()+6)%7;
//       if (dow===6 || d===dim) { weeks.push(wk); wk=[]; }
//     }
//     return weeks;
//   };

//   // current + prev month
//   const curWeeks  = getWeeks(year, month);
//   const prevM     = month===0 ? 11 : month-1;
//   const prevY     = month===0 ? year-1 : year;
//   const prevWeeks = getWeeks(prevY, prevM);

//   const weekSum = (y,m,days) => days.reduce((a,d) => a+(data[dateKey(y,m,d)]||[]).reduce((s,i)=>s+i.amount,0),0);

//   const curTotals  = curWeeks.map(w  => weekSum(year,  month, w));
//   const prevTotals = prevWeeks.map(w => weekSum(prevY, prevM, w));
//   const maxV = Math.max(...curTotals, ...prevTotals, 1);

//   return (
//     <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"14px", padding:"16px 18px", marginBottom:"20px" }}>
//       <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"14px" }}>
//         <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.1em", color:"rgba(255,255,255,0.35)", textTransform:"uppercase" }}>Haftalik taqqoslash</div>
//         <div style={{ display:"flex", gap:"14px" }}>
//           {[["#a78bfa", MONTHS_UZ[month]],["rgba(255,255,255,0.2)", MONTHS_UZ[prevM]]].map(([c,l])=>(
//             <div key={l} style={{ display:"flex", alignItems:"center", gap:"5px" }}>
//               <div style={{ width:"10px", height:"4px", borderRadius:"2px", background:c }}/>
//               <span style={{ fontSize:"10px", color:"rgba(255,255,255,0.4)" }}>{l}</span>
//             </div>
//           ))}
//         </div>
//       </div>
//       <div style={{ display:"flex", gap:"10px", alignItems:"flex-end" }}>
//         {curWeeks.map((_, wi) => {
//           const cv = curTotals[wi]  || 0;
//           const pv = prevTotals[wi] || 0;
//           const maxH = 72;
//           const cH = cv ? Math.max(4, cv/maxV*maxH) : 0;
//           const pH = pv ? Math.max(4, pv/maxV*maxH) : 0;
//           const diff = cv - pv;
//           return (
//             <div key={wi} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"4px" }}>
//               {diff!==0 && cv>0 && (
//                 <div style={{ fontSize:"9px", fontWeight:700, color: diff<0?"#4ade80":"#f87171" }}>
//                   {diff<0?"-":"+"}{ fmtSum(Math.abs(diff)) }
//                 </div>
//               )}
//               <div style={{ width:"100%", display:"flex", gap:"3px", alignItems:"flex-end", height:`${maxH}px` }}>
//                 <div style={{ flex:1, height:`${cH}px`, background:"#a78bfa", borderRadius:"4px 4px 0 0", transition:"height 0.4s ease" }}/>
//                 <div style={{ flex:1, height:`${pH}px`, background:"rgba(255,255,255,0.15)", borderRadius:"4px 4px 0 0", transition:"height 0.4s ease" }}/>
//               </div>
//               <div style={{ fontSize:"9px", color:"rgba(255,255,255,0.3)", fontWeight:600 }}>H{wi+1}</div>
//             </div>
//           );
//         })}
//       </div>
//     </div>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // SEARCH MODAL
// // ─────────────────────────────────────────────────────────────────────────────
// function SearchModal({ data, onClose, onGoTo }) {
//   const [q, setQ] = useState("");
//   const results = useMemo(() => {
//     if (!q.trim()) return [];
//     const qlo = q.toLowerCase();
//     const out = [];
//     for (const [key, items] of Object.entries(data)) {
//       for (const item of items) {
//         if (item.name.toLowerCase().includes(qlo) ||
//             (item.amount+"").includes(qlo) ||
//             (CAT_MAP[item.category]?.label||"").toLowerCase().includes(qlo)) {
//           const { year, month, day } = parseKey(key);
//           out.push({ ...item, key, year, month, day });
//         }
//       }
//     }
//     return out.sort((a,b) => b.key.localeCompare(a.key)).slice(0,50);
//   }, [q, data]);

//   const total = results.reduce((a,b)=>a+b.amount,0);

//   return (
//     <Modal onClose={onClose} width="580px">
//       <ModalHeader title="Xarajat qidirish" subtitle="Nom, miqdor yoki kategoriya bo'yicha" onClose={onClose}/>
//       <div style={{ padding:"16px 24px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
//         <div style={{ position:"relative" }}>
//           <div style={{ position:"absolute", left:"12px", top:"50%", transform:"translateY(-50%)", opacity:0.4 }}>
//             <Ico d={Icons.search} size={15}/>
//           </div>
//           <Input value={q} onChange={e=>setQ(e.target.value)} placeholder="Qidiring..."
//             style={{ paddingLeft:"36px" }}/>
//         </div>
//       </div>
//       <div style={{ flex:1, overflowY:"auto", padding:"8px 24px" }}>
//         {q && results.length===0 && (
//           <div style={{ textAlign:"center", padding:"40px 0", color:"rgba(255,255,255,0.2)", fontSize:"13px" }}>Hech narsa topilmadi</div>
//         )}
//         {results.map((r, i) => {
//           const cat = CAT_MAP[r.category||"other"];
//           return (
//             <div key={i} onClick={() => { onGoTo(r.key); onClose(); }}
//               style={{
//                 display:"flex", alignItems:"center", gap:"12px", padding:"10px 0",
//                 borderBottom:"1px solid rgba(255,255,255,0.04)", cursor:"pointer",
//                 transition:"background 0.15s", borderRadius:"8px",
//               }}
//               onMouseEnter={e=>e.currentTarget.style.paddingLeft="6px"}
//               onMouseLeave={e=>e.currentTarget.style.paddingLeft="0"}
//             >
//               <span style={{ fontSize:"18px" }}>{cat?.icon||"📦"}</span>
//               <div style={{ flex:1 }}>
//                 <div style={{ fontSize:"13px", color:"rgba(255,255,255,0.85)", fontWeight:600 }}>{r.name}</div>
//                 <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.35)", marginTop:"1px" }}>
//                   {r.day} {MONTHS_UZ[r.month]} {r.year} · {cat?.label||"Boshqa"}
//                 </div>
//               </div>
//               <div style={{ fontSize:"13px", fontWeight:700, color:cat?.color||"#94a3b8" }}>{fmt(r.amount)} so'm</div>
//             </div>
//           );
//         })}
//       </div>
//       {results.length>0 && (
//         <div style={{ padding:"12px 24px", borderTop:"1px solid rgba(255,255,255,0.06)", display:"flex", justifyContent:"space-between", flexShrink:0 }}>
//           <span style={{ fontSize:"12px", color:"rgba(255,255,255,0.3)" }}>{results.length} ta natija</span>
//           <span style={{ fontSize:"12px", fontWeight:700, color:"#a78bfa" }}>Jami: {fmtFull(total)}</span>
//         </div>
//       )}
//     </Modal>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // TEMPLATES MODAL
// // ─────────────────────────────────────────────────────────────────────────────
// function TemplatesModal({ templates, onClose, onAdd, onApply, onDelete }) {
//   const [name, setName]     = useState("");
//   const [amount, setAmount] = useState("");
//   const [catId, setCatId]   = useState("other");

//   const handleAdd = () => {
//     if (!name.trim() || !amount) return;
//     const n = parseInt(amount, 10);
//     if (isNaN(n)||n<=0) return;
//     onAdd({ id:Date.now(), name:name.trim(), amount:n, category:catId });
//     setName(""); setAmount(""); setCatId("other");
//   };

//   return (
//     <Modal onClose={onClose} width="540px">
//       <ModalHeader title="Tez qo'shish sablonlari" subtitle="Tez-tez ishlatiladigan xarajatlarni saqlang" onClose={onClose}/>
//       <div style={{ padding:"16px 24px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
//         <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", marginBottom:"10px" }}>
//           {CATEGORIES.map(c => (
//             <button key={c.id} onClick={()=>setCatId(c.id)} style={{
//               padding:"5px 10px", borderRadius:"8px", border:"none", cursor:"pointer",
//               fontSize:"11px", fontWeight:600,
//               background: catId===c.id ? c.color+"33" : "rgba(255,255,255,0.05)",
//               color: catId===c.id ? c.color : "rgba(255,255,255,0.4)",
//               outline: catId===c.id ? `1px solid ${c.color}55` : "none",
//               transition:"all 0.15s",
//             }}>{c.icon} {c.label}</button>
//           ))}
//         </div>
//         <div style={{ display:"flex", gap:"8px" }}>
//           <Input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Sablon nomi..." style={{ flex:2 }}/>
//           <Input value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&handleAdd()} placeholder="Summa..." inputMode="numeric" style={{ flex:1 }}/>
//           <Btn onClick={handleAdd} variant="primary" style={{ padding:"10px 14px", flexShrink:0 }}><Ico d={Icons.plus} size={15}/></Btn>
//         </div>
//       </div>
//       <div style={{ flex:1, overflowY:"auto", padding:"8px 24px" }}>
//         {templates.length===0 ? (
//           <div style={{ textAlign:"center", padding:"40px 0", color:"rgba(255,255,255,0.2)", fontSize:"13px" }}>
//             Hali sablon qo'shilmagan
//           </div>
//         ) : templates.map(t => {
//           const cat = CAT_MAP[t.category||"other"];
//           return (
//             <div key={t.id} style={{ display:"flex", alignItems:"center", gap:"12px", padding:"10px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
//               <span style={{ fontSize:"18px" }}>{cat.icon}</span>
//               <div style={{ flex:1 }}>
//                 <div style={{ fontSize:"13px", color:"rgba(255,255,255,0.85)", fontWeight:600 }}>{t.name}</div>
//                 <div style={{ fontSize:"11px", color:cat.color, marginTop:"1px" }}>{cat.label}</div>
//               </div>
//               <div style={{ fontSize:"13px", fontWeight:700, color:"#fff" }}>{fmt(t.amount)} so'm</div>
//               <Btn size="sm" variant="success" onClick={()=>{ onApply(t); onClose(); }} style={{ padding:"5px 10px" }}>Qo'shish</Btn>
//               <button onClick={()=>onDelete(t.id)} style={{
//                 width:"28px", height:"28px", borderRadius:"7px", border:"1px solid rgba(248,113,113,0.2)",
//                 background:"rgba(248,113,113,0.07)", color:"#f87171", cursor:"pointer",
//                 display:"flex", alignItems:"center", justifyContent:"center",
//               }}><Ico d={Icons.trash} size={13}/></button>
//             </div>
//           );
//         })}
//       </div>
//     </Modal>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // BUDGET EDIT MODAL
// // ─────────────────────────────────────────────────────────────────────────────
// function BudgetModal({ budget, onClose, onSave }) {
//   const [val, setVal] = useState(String(budget));
//   return (
//     <Modal onClose={onClose} width="380px">
//       <ModalHeader title="Oylik byudjet" subtitle="Oy uchun xarajat limitini belgilang" onClose={onClose}/>
//       <div style={{ padding:"20px 24px" }}>
//         <Input value={val} onChange={e=>setVal(e.target.value.replace(/\D/g,""))}
//           placeholder="Masalan: 3000000" inputMode="numeric"
//           onKeyDown={e=>e.key==="Enter"&&onSave(parseInt(val,10)||DEFAULT_BUDGET)}/>
//         <div style={{ display:"flex", gap:"8px", marginTop:"12px", justifyContent:"flex-end" }}>
//           <Btn onClick={onClose} variant="ghost">Bekor</Btn>
//           <Btn onClick={()=>onSave(parseInt(val,10)||DEFAULT_BUDGET)} variant="primary">
//             <Ico d={Icons.check} size={14}/> Saqlash
//           </Btn>
//         </div>
//       </div>
//     </Modal>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // EXPORT / IMPORT MODAL
// // ─────────────────────────────────────────────────────────────────────────────
// function ExportModal({ data, year, month, onClose, onImport }) {
//   const fileRef = useRef();

//   const exportCSV = () => {
//     const dim = new Date(year,month+1,0).getDate();
//     const rows = [["Sana","Xarajat nomi","Kategoriya","Summa (so'm)"]];
//     for (let d=1;d<=dim;d++) {
//       for (const item of (data[dateKey(year,month,d)]||[])) {
//         const cat = CAT_MAP[item.category||"other"]?.label||"Boshqa";
//         rows.push([`${d} ${MONTHS_UZ[month]} ${year}`, item.name, cat, item.amount]);
//       }
//     }
//     const csv = rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
//     const blob = new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"});
//     const url  = URL.createObjectURL(blob);
//     const a    = document.createElement("a");
//     a.href=url; a.download=`xarajat_${MONTHS_UZ[month]}_${year}.csv`; a.click();
//     URL.revokeObjectURL(url);
//   };

//   const exportJSON = () => {
//     const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
//     const url  = URL.createObjectURL(blob);
//     const a    = document.createElement("a");
//     a.href=url; a.download=`xarajat_backup_${year}.json`; a.click();
//     URL.revokeObjectURL(url);
//   };

//   const importJSON = e => {
//     const file = e.target.files[0];
//     if (!file) return;
//     const reader = new FileReader();
//     reader.onload = ev => {
//       try {
//         const parsed = JSON.parse(ev.target.result);
//         if (typeof parsed === "object") { onImport(parsed); onClose(); }
//       } catch { alert("Fayl noto'g'ri format!"); }
//     };
//     reader.readAsText(file);
//   };

//   return (
//     <Modal onClose={onClose} width="420px">
//       <ModalHeader title="Eksport / Import" subtitle="Ma'lumotlarni yuklash yoki zaxiralash" onClose={onClose}/>
//       <div style={{ padding:"20px 24px", display:"flex", flexDirection:"column", gap:"10px" }}>
//         <button onClick={exportCSV} style={{
//           display:"flex", alignItems:"center", gap:"12px", padding:"14px 16px",
//           background:"rgba(74,222,128,0.07)", border:"1px solid rgba(74,222,128,0.2)",
//           borderRadius:"12px", cursor:"pointer", color:"#fff", fontFamily:"inherit", transition:"all 0.15s",
//         }}
//           onMouseEnter={e=>e.currentTarget.style.background="rgba(74,222,128,0.12)"}
//           onMouseLeave={e=>e.currentTarget.style.background="rgba(74,222,128,0.07)"}
//         >
//           <Ico d={Icons.download} size={18} stroke="#4ade80"/>
//           <div style={{ textAlign:"left" }}>
//             <div style={{ fontWeight:700, fontSize:"13px" }}>CSV eksport</div>
//             <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.35)", marginTop:"2px" }}>Excel'da ochish uchun — {MONTHS_UZ[month]} {year}</div>
//           </div>
//         </button>
//         <button onClick={exportJSON} style={{
//           display:"flex", alignItems:"center", gap:"12px", padding:"14px 16px",
//           background:"rgba(167,139,250,0.07)", border:"1px solid rgba(167,139,250,0.2)",
//           borderRadius:"12px", cursor:"pointer", color:"#fff", fontFamily:"inherit", transition:"all 0.15s",
//         }}
//           onMouseEnter={e=>e.currentTarget.style.background="rgba(167,139,250,0.12)"}
//           onMouseLeave={e=>e.currentTarget.style.background="rgba(167,139,250,0.07)"}
//         >
//           <Ico d={Icons.download} size={18} stroke="#a78bfa"/>
//           <div style={{ textAlign:"left" }}>
//             <div style={{ fontWeight:700, fontSize:"13px" }}>JSON zaxira (backup)</div>
//             <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.35)", marginTop:"2px" }}>Barcha ma'lumotlar — {year} yil</div>
//           </div>
//         </button>
//         <button onClick={()=>fileRef.current.click()} style={{
//           display:"flex", alignItems:"center", gap:"12px", padding:"14px 16px",
//           background:"rgba(250,204,21,0.07)", border:"1px solid rgba(250,204,21,0.2)",
//           borderRadius:"12px", cursor:"pointer", color:"#fff", fontFamily:"inherit", transition:"all 0.15s",
//         }}
//           onMouseEnter={e=>e.currentTarget.style.background="rgba(250,204,21,0.12)"}
//           onMouseLeave={e=>e.currentTarget.style.background="rgba(250,204,21,0.07)"}
//         >
//           <Ico d={Icons.upload} size={18} stroke="#facc15"/>
//           <div style={{ textAlign:"left" }}>
//             <div style={{ fontWeight:700, fontSize:"13px" }}>JSON import</div>
//             <div style={{ fontSize:"11px", color:"rgba(255,255,255,0.35)", marginTop:"2px" }}>Zaxiradan tiklash</div>
//           </div>
//         </button>
//         <input ref={fileRef} type="file" accept=".json" onChange={importJSON} style={{ display:"none" }}/>
//       </div>
//     </Modal>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // DAY MODAL
// // ─────────────────────────────────────────────────────────────────────────────
// function DayModal({ dateStr, data, onClose, onSave, templates }) {
//   const [items,   setItems]   = useState(() => (data[dateStr]||[]).map(i=>({...i})));
//   const [name,    setName]    = useState("");
//   const [amount,  setAmount]  = useState("");
//   const [catId,   setCatId]   = useState("other");
//   const [editId,  setEditId]  = useState(null);
//   const [editName,setEditName]= useState("");
//   const [editAmt, setEditAmt] = useState("");
//   const [editCat, setEditCat] = useState("other");
//   const [shake,   setShake]   = useState(false);
//   const [showTpl, setShowTpl] = useState(false);

//   const total = items.reduce((a,b)=>a+b.amount,0);
//   const [yr,mo,dy] = dateStr.split("-");
//   const displayDate = `${parseInt(dy)} ${MONTHS_UZ[parseInt(mo)-1]} ${yr}`;

//   const addItem = () => {
//     if (!name.trim()||!amount) { setShake(true); setTimeout(()=>setShake(false),500); return; }
//     const n = parseInt(amount,10);
//     if (isNaN(n)||n<=0) return;
//     setItems(p=>[...p,{id:Date.now(), name:name.trim(), amount:n, category:catId}]);
//     setName(""); setAmount("");
//   };

//   const applyTemplate = t => {
//     setItems(p=>[...p,{id:Date.now(), name:t.name, amount:t.amount, category:t.category}]);
//   };

//   const startEdit = item => {
//     setEditId(item.id); setEditName(item.name);
//     setEditAmt(String(item.amount)); setEditCat(item.category||"other");
//   };

//   const saveEdit = id => {
//     const n = parseInt(editAmt,10);
//     if (!editName.trim()||isNaN(n)||n<=0) return;
//     setItems(p=>p.map(i=>i.id===id?{...i,name:editName.trim(),amount:n,category:editCat}:i));
//     setEditId(null);
//   };

//   // category totals for day
//   const catTotals = {};
//   for (const it of items) catTotals[it.category||"other"] = (catTotals[it.category||"other"]||0)+it.amount;

//   return (
//     <Modal onClose={onClose} width="600px">
//       <ModalHeader title={displayDate} subtitle="Kunlik xarajatlar" onClose={onClose}/>

//       {/* Add row */}
//       <div style={{ padding:"14px 24px", borderBottom:"1px solid rgba(255,255,255,0.06)", flexShrink:0 }}>
//         {/* Category selector */}
//         <div style={{ display:"flex", gap:"6px", flexWrap:"wrap", marginBottom:"10px" }}>
//           {CATEGORIES.map(c=>(
//             <button key={c.id} onClick={()=>setCatId(c.id)} style={{
//               padding:"4px 9px", borderRadius:"7px", border:"none", cursor:"pointer",
//               fontSize:"11px", fontWeight:600,
//               background: catId===c.id ? c.color+"33":"rgba(255,255,255,0.05)",
//               color: catId===c.id ? c.color:"rgba(255,255,255,0.4)",
//               outline: catId===c.id ? `1px solid ${c.color}55`:"none",
//               transition:"all 0.15s",
//             }}>{c.icon} {c.label}</button>
//           ))}
//         </div>
//         <div style={{ display:"flex", gap:"8px", animation: shake?"shake 0.4s ease":"none" }}>
//           <Input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="Xarajat nomi..." style={{ flex:2 }}/>
//           <Input value={amount} onChange={e=>setAmount(e.target.value.replace(/\D/g,""))} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="Summa..." inputMode="numeric" style={{ flex:1 }}/>
//           <Btn onClick={addItem} variant="primary" style={{ padding:"10px 14px", flexShrink:0 }}><Ico d={Icons.plus} size={15}/></Btn>
//           {templates.length>0 && (
//             <Btn onClick={()=>setShowTpl(s=>!s)} variant="ghost" style={{ padding:"10px 14px", flexShrink:0 }}>
//               <Ico d={Icons.bolt} size={14}/>
//             </Btn>
//           )}
//         </div>
//         {showTpl && (
//           <div style={{ marginTop:"10px", display:"flex", gap:"6px", flexWrap:"wrap" }}>
//             {templates.map(t=>(
//               <button key={t.id} onClick={()=>{ applyTemplate(t); setShowTpl(false); }} style={{
//                 padding:"5px 10px", borderRadius:"8px", border:"1px solid rgba(255,255,255,0.1)",
//                 background:"rgba(255,255,255,0.05)", color:"rgba(255,255,255,0.75)",
//                 cursor:"pointer", fontSize:"11px", fontWeight:600, display:"flex", alignItems:"center", gap:"5px",
//                 transition:"all 0.15s", fontFamily:"inherit",
//               }}
//                 onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}
//                 onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}
//               >
//                 <span>{CAT_MAP[t.category||"other"]?.icon}</span>
//                 {t.name} — {fmtSum(t.amount)}
//               </button>
//             ))}
//           </div>
//         )}
//       </div>

//       {/* List */}
//       <div style={{ flex:1, overflowY:"auto", padding:"6px 24px" }}>
//         {items.length===0 ? (
//           <div style={{ textAlign:"center", padding:"36px 0", color:"rgba(255,255,255,0.15)", fontSize:"13px" }}>
//             Hali xarajat qo'shilmagan
//           </div>
//         ) : items.map(item=>{
//           const cat = CAT_MAP[item.category||"other"];
//           return (
//             <div key={item.id} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"9px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
//               <span style={{ fontSize:"16px", flexShrink:0 }}>{cat.icon}</span>
//               {editId===item.id ? (
//                 <>
//                   <div style={{ flex:1, display:"flex", gap:"6px", flexWrap:"wrap" }}>
//                     {CATEGORIES.map(c=>(
//                       <button key={c.id} onClick={()=>setEditCat(c.id)} style={{
//                         padding:"3px 7px", borderRadius:"6px", border:"none", cursor:"pointer",
//                         fontSize:"10px", fontWeight:600,
//                         background: editCat===c.id?c.color+"33":"rgba(255,255,255,0.05)",
//                         color: editCat===c.id?c.color:"rgba(255,255,255,0.4)",
//                         fontFamily:"inherit",
//                       }}>{c.icon}</button>
//                     ))}
//                   </div>
//                   <Input value={editName} onChange={e=>setEditName(e.target.value)} style={{ flex:2 }}/>
//                   <Input value={editAmt} onChange={e=>setEditAmt(e.target.value.replace(/\D/g,""))} inputMode="numeric" style={{ flex:1 }}/>
//                   <button onClick={()=>saveEdit(item.id)} style={{ width:"30px",height:"30px",borderRadius:"8px",border:"none",background:"#4ade80",color:"#000",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}><Ico d={Icons.check} size={13}/></button>
//                 </>
//               ) : (
//                 <>
//                   <div style={{ flex:1 }}>
//                     <div style={{ fontSize:"13px", color:"rgba(255,255,255,0.85)", fontWeight:600 }}>{item.name}</div>
//                     <div style={{ fontSize:"10px", color:cat.color, marginTop:"1px" }}>{cat.label}</div>
//                   </div>
//                   <span style={{ fontSize:"13px", fontWeight:700, color:"#fff", background:"rgba(255,255,255,0.06)", padding:"3px 10px", borderRadius:"7px" }}>
//                     {fmt(item.amount)}
//                   </span>
//                   <button onClick={()=>startEdit(item)} style={{ width:"28px",height:"28px",borderRadius:"7px",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.4)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}><Ico d={Icons.edit} size={12}/></button>
//                   <button onClick={()=>setItems(p=>p.filter(i=>i.id!==item.id))} style={{ width:"28px",height:"28px",borderRadius:"7px",border:"1px solid rgba(248,113,113,0.2)",background:"rgba(248,113,113,0.07)",color:"#f87171",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center" }}><Ico d={Icons.trash} size={12}/></button>
//                 </>
//               )}
//             </div>
//           );
//         })}
//       </div>

//       {/* Footer */}
//       <div style={{ padding:"14px 24px", borderTop:"1px solid rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
//         <div>
//           <div style={{ fontSize:"10px", color:"rgba(255,255,255,0.3)", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase" }}>Jami</div>
//           <div style={{ fontSize:"20px", fontWeight:800, color:"#fff" }}>
//             {fmt(total)} <span style={{ fontSize:"13px", color:"rgba(255,255,255,0.35)", fontWeight:500 }}>so'm</span>
//           </div>
//         </div>
//         <div style={{ display:"flex", gap:"8px" }}>
//           <Btn onClick={onClose} variant="ghost">Bekor</Btn>
//           <Btn onClick={()=>{ onSave(dateStr,items); onClose(); }} variant="primary">
//             <Ico d={Icons.check} size={14}/> Saqlash
//           </Btn>
//         </div>
//       </div>
//     </Modal>
//   );
// }

// // ─────────────────────────────────────────────────────────────────────────────
// // MAIN APP
// // ─────────────────────────────────────────────────────────────────────────────
// export default function App() {
//   const today = new Date();
//   const [year,      setYear]      = useState(today.getFullYear());
//   const [month,     setMonth]     = useState(today.getMonth());
//   const [data,      setData]      = useState(()=>load(STORAGE_KEY,{}));
//   const [budget,    setBudget]    = useState(()=>load(BUDGET_KEY, DEFAULT_BUDGET));
//   const [templates, setTemplates] = useState(()=>load(TEMPLATES_KEY,[]));
//   const [modal,     setModal]     = useState(null);   // dateStr
//   const [showSearch,setShowSearch]= useState(false);
//   const [showTpl,   setShowTpl]   = useState(false);
//   const [showExport,setShowExport]= useState(false);
//   const [showBudget,setShowBudget]= useState(false);
//   const [pendingTemplate, setPending] = useState(null); // template to apply after choosing day

//   const saveData = useCallback((key,items) => {
//     setData(prev=>{
//       const next={...prev,[key]:items};
//       if(items.length===0) delete next[key];
//       save(STORAGE_KEY,next);
//       return next;
//     });
//   },[]);

//   const saveBudget = val => {
//     setBudget(val);
//     save(BUDGET_KEY,val);
//     setShowBudget(false);
//   };

//   const addTemplate = t => {
//     setTemplates(p=>{ const n=[...p,t]; save(TEMPLATES_KEY,n); return n; });
//   };
//   const deleteTemplate = id => {
//     setTemplates(p=>{ const n=p.filter(t=>t.id!==id); save(TEMPLATES_KEY,n); return n; });
//   };

//   const prevMonth = () => { if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); };
//   const nextMonth = () => { if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); };

//   const {startDow, daysInMonth} = getMonthDays(year, month);

//   const colorMap = {
//     empty:  { bg:"rgba(255,255,255,0.03)", border:"rgba(255,255,255,0.07)", dot:null },
//     green:  { bg:"rgba(74,222,128,0.09)",  border:"rgba(74,222,128,0.28)",  dot:"#4ade80" },
//     yellow: { bg:"rgba(250,204,21,0.09)",  border:"rgba(250,204,21,0.28)",  dot:"#facc15" },
//     red:    { bg:"rgba(248,113,113,0.09)", border:"rgba(248,113,113,0.28)", dot:"#f87171" },
//   };

//   const goToDate = key => {
//     const {year:y,month:m} = parseKey(key);
//     setYear(y); setMonth(m); setModal(key);
//   };

//   return (
//     <div style={{ minHeight:"100vh", background:"#080812", fontFamily:"'DM Sans','Segoe UI',sans-serif", padding:"24px 16px 56px", color:"#fff" }}>
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&display=swap');
//         *{box-sizing:border-box}
//         ::-webkit-scrollbar{width:4px}
//         ::-webkit-scrollbar-track{background:transparent}
//         ::-webkit-scrollbar-thumb{background:rgba(167,139,250,0.3);border-radius:4px}
//         input::placeholder{color:rgba(255,255,255,0.2)}
//         .day-cell:hover{transform:translateY(-2px)!important;box-shadow:0 6px 18px rgba(0,0,0,0.4)!important;cursor:pointer}
//         @keyframes pulseRing{0%{box-shadow:0 0 0 0 rgba(167,139,250,0.4)}70%{box-shadow:0 0 0 7px rgba(167,139,250,0)}100%{box-shadow:0 0 0 0 rgba(167,139,250,0)}}
//         @keyframes slideUp{from{opacity:0;transform:translateY(28px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}
//         @keyframes fadeIn{from{opacity:0}to{opacity:1}}
//         @keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
//       `}</style>

//       <div style={{ maxWidth:"960px", margin:"0 auto" }}>

//         {/* ── HEADER ── */}
//         <div style={{ marginBottom:"24px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:"12px" }}>
//           <div>
//             <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.14em", color:"rgba(167,139,250,0.65)", textTransform:"uppercase", marginBottom:"4px" }}>Xarajat Kuzatuvchi</div>
//             <h1 style={{ margin:0, fontSize:"clamp(22px,5vw,36px)", fontWeight:900, letterSpacing:"-0.03em", background:"linear-gradient(135deg,#fff 30%,rgba(167,139,250,0.75))", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
//               Moliyaviy Daftar
//             </h1>
//           </div>
//           <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
//             <Btn size="sm" variant="ghost" onClick={()=>setShowSearch(true)}><Ico d={Icons.search} size={13}/> Qidirish</Btn>
//             <Btn size="sm" variant="ghost" onClick={()=>setShowTpl(true)}><Ico d={Icons.bolt} size={13}/> Sablonlar</Btn>
//             <Btn size="sm" variant="ghost" onClick={()=>setShowExport(true)}><Ico d={Icons.download} size={13}/> Eksport</Btn>
//             <Btn size="sm" variant="ghost" onClick={()=>setShowBudget(true)}><Ico d={Icons.target} size={13}/> Byudjet</Btn>
//           </div>
//         </div>

//         {/* ── STATS ── */}
//         <StatsBar data={data} year={year} month={month} budget={budget}/>

//         {/* ── BUDGET BAR ── */}
//         <BudgetBar data={data} year={year} month={month} budget={budget} onEdit={()=>setShowBudget(true)}/>

//         {/* ── CHARTS ROW ── */}
//         <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px", marginBottom:"20px" }}>
//           <WeeklyComparison data={data} year={year} month={month}/>
//           <CategoryPanel    data={data} year={year} month={month}/>
//         </div>

//         {/* ── YEARLY CHART ── */}
//         <MonthlyChart data={data} year={year}/>

//         {/* ── CALENDAR CARD ── */}
//         <div style={{ background:"rgba(255,255,255,0.02)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"22px", padding:"20px", backdropFilter:"blur(20px)" }}>
//           {/* Month navigation */}
//           <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"14px" }}>
//             <button onClick={prevMonth} style={{ width:"36px",height:"36px",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.7)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.2s" }}
//               onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}
//               onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
//             ><Ico d={Icons.chevL} size={16}/></button>
//             <div style={{ textAlign:"center" }}>
//               <div style={{ fontSize:"19px", fontWeight:800, letterSpacing:"-0.02em" }}>{MONTHS_UZ[month]}</div>
//               <div style={{ fontSize:"12px", color:"rgba(255,255,255,0.3)", fontWeight:500 }}>{year}</div>
//             </div>
//             <button onClick={nextMonth} style={{ width:"36px",height:"36px",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.04)",color:"rgba(255,255,255,0.7)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"background 0.2s" }}
//               onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}
//               onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}
//             ><Ico d={Icons.chevR} size={16}/></button>
//           </div>

//           {/* Day headers */}
//           <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"5px", marginBottom:"5px" }}>
//             {DAYS_UZ.map(d=>(
//               <div key={d} style={{ textAlign:"center", fontSize:"10px", fontWeight:700, color:"rgba(255,255,255,0.22)", letterSpacing:"0.07em", textTransform:"uppercase" }}>{d}</div>
//             ))}
//           </div>

//           {/* Day cells */}
//           <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:"5px" }}>
//             {Array.from({length:startDow}).map((_,i)=><div key={`e${i}`}/>)}
//             {Array.from({length:daysInMonth},(_,i)=>{
//               const day   = i+1;
//               const key   = dateKey(year,month,day);
//               const items = data[key]||[];
//               const total = items.reduce((a,b)=>a+b.amount,0);
//               const color = getDayColor(total);
//               const cm    = colorMap[color];
//               const isToday = day===today.getDate() && month===today.getMonth() && year===today.getFullYear();

//               // dominant category color dot
//               const catCounts = {};
//               for (const it of items) catCounts[it.category||"other"]=(catCounts[it.category||"other"]||0)+it.amount;
//               const domCat = Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
//               const dotColor = domCat ? CAT_MAP[domCat]?.color : cm.dot;

//               return (
//                 <div key={day} className="day-cell" onClick={()=>setModal(key)}
//                   style={{
//                     height:"52px", borderRadius:"10px",
//                     background: isToday?"rgba(167,139,250,0.13)":cm.bg,
//                     border:`1px solid ${isToday?"rgba(167,139,250,0.45)":cm.border}`,
//                     display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
//                     padding:"4px 2px", transition:"transform 0.15s, box-shadow 0.15s",
//                     animation: isToday?"pulseRing 2.5s infinite":"none", position:"relative",
//                   }}>
//                   <span style={{ fontSize:"13px", fontWeight:isToday?800:600, color:isToday?"#a78bfa":"rgba(255,255,255,0.82)", lineHeight:1 }}>{day}</span>
//                   {total>0 && (
//                     <span style={{ fontSize:"9px", fontWeight:700, marginTop:"3px", color:cm.dot, lineHeight:1 }}>{fmtSum(total)}</span>
//                   )}
//                   {items.length>0 && (
//                     <div style={{ position:"absolute", top:"4px", right:"4px", width:"5px", height:"5px", borderRadius:"50%", background:dotColor }}/>
//                   )}
//                 </div>
//               );
//             })}
//           </div>

//           {/* Legend */}
//           <div style={{ display:"flex", gap:"14px", marginTop:"14px", flexWrap:"wrap", justifyContent:"center" }}>
//             {[
//               {color:"rgba(255,255,255,0.18)",label:"Xarajat yo'q"},
//               {color:"#4ade80",label:"≤ 100 000"},
//               {color:"#facc15",label:"≤ 200 000"},
//               {color:"#f87171",label:"200 000+"},
//             ].map(l=>(
//               <div key={l.label} style={{ display:"flex", alignItems:"center", gap:"5px" }}>
//                 <div style={{ width:"9px",height:"9px",borderRadius:"3px",background:l.color }}/>
//                 <span style={{ fontSize:"10px",color:"rgba(255,255,255,0.3)",fontWeight:500 }}>{l.label} so'm</span>
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>

//       {/* ── MODALS ── */}
//       {modal && (
//         <DayModal
//           dateStr={modal} data={data} templates={templates}
//           onClose={()=>setModal(null)} onSave={saveData}
//         />
//       )}
//       {showSearch && (
//         <SearchModal data={data} onClose={()=>setShowSearch(false)} onGoTo={goToDate}/>
//       )}
//       {showTpl && (
//         <TemplatesModal templates={templates}
//           onClose={()=>setShowTpl(false)}
//           onAdd={addTemplate}
//           onDelete={deleteTemplate}
//           onApply={t=>{ setShowTpl(false); setPending(t); }}
//         />
//       )}
//       {showExport && (
//         <ExportModal data={data} year={year} month={month}
//           onClose={()=>setShowExport(false)}
//           onImport={imported=>{ setData(imported); save(STORAGE_KEY,imported); }}
//         />
//       )}
//       {showBudget && (
//         <BudgetModal budget={budget} onClose={()=>setShowBudget(false)} onSave={saveBudget}/>
//       )}
//     </div>
//   );
// }



// ------------1-variant--------------//

// import { useState, useEffect, useCallback } from "react";

// // ── helpers ──────────────────────────────────────────────────────────────────
// const MONTHS_UZ = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];
// const DAYS_UZ   = ["Du","Se","Ch","Pa","Ju","Sh","Ya"];

// function formatSum(n) {
//   if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,"") + " mln";
//   if (n >= 1_000)     return (n/1_000).toFixed(0) + " K";
//   return n.toString();
// }

// function formatFull(n) {
//   return n.toLocaleString("uz-UZ") + " so'm";
// }

// function getDayColor(total) {
//   if (total === 0)              return "empty";
//   if (total <= 100_000)         return "green";
//   if (total <= 200_000)         return "yellow";
//   return "red";
// }

// function getMonthDays(year, month) {
//   const first = new Date(year, month, 1);
//   const startDow = (first.getDay() + 6) % 7; // Mon=0
//   const daysInMonth = new Date(year, month + 1, 0).getDate();
//   return { startDow, daysInMonth };
// }

// function dateKey(y, m, d) {
//   return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
// }

// function loadData() {
//   try { return JSON.parse(localStorage.getItem("xarajat_v2") || "{}"); }
//   catch { return {}; }
// }

// function saveData(data) {
//   localStorage.setItem("xarajat_v2", JSON.stringify(data));
// }

// // ── icons ────────────────────────────────────────────────────────────────────
// const PlusIcon = () => (
//   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
//     <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
//   </svg>
// );
// const EditIcon = () => (
//   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
//     <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
//     <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
//   </svg>
// );
// const TrashIcon = () => (
//   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
//     <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
//     <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
//   </svg>
// );
// const ChevronLeft = () => (
//   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
//     <polyline points="15 18 9 12 15 6"/>
//   </svg>
// );
// const ChevronRight = () => (
//   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
//     <polyline points="9 18 15 12 9 6"/>
//   </svg>
// );
// const CloseIcon = () => (
//   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
//     <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
//   </svg>
// );
// const CheckIcon = () => (
//   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
//     <polyline points="20 6 9 17 4 12"/>
//   </svg>
// );

// // ── Stats Bar ─────────────────────────────────────────────────────────────────
// function StatsBar({ data, year, month }) {
//   const daysInMonth = new Date(year, month + 1, 0).getDate();
//   let monthTotal = 0, activeDays = 0, maxDay = 0;
//   for (let d = 1; d <= daysInMonth; d++) {
//     const key = dateKey(year, month, d);
//     const items = data[key] || [];
//     const s = items.reduce((a, b) => a + b.amount, 0);
//     monthTotal += s;
//     if (s > 0) activeDays++;
//     if (s > maxDay) maxDay = s;
//   }
//   const avgDay = activeDays ? Math.round(monthTotal / activeDays) : 0;

//   // yearly
//   let yearTotal = 0;
//   for (let m = 0; m < 12; m++) {
//     const dm = new Date(year, m + 1, 0).getDate();
//     for (let d = 1; d <= dm; d++) {
//       const key = dateKey(year, m, d);
//       const items = data[key] || [];
//       yearTotal += items.reduce((a, b) => a + b.amount, 0);
//     }
//   }

//   const stats = [
//     { label: "Oylik jami", value: formatFull(monthTotal), accent: "#4ade80" },
//     { label: "Kunlik o'rtacha", value: formatFull(avgDay), accent: "#facc15" },
//     { label: "Eng ko'p kun", value: formatFull(maxDay), accent: "#f87171" },
//     { label: "Yillik jami", value: formatFull(yearTotal), accent: "#a78bfa" },
//   ];

//   return (
//     <div style={{
//       display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px",
//       marginBottom: "24px",
//     }}>
//       {stats.map(s => (
//         <div key={s.label} style={{
//           background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
//           borderRadius: "14px", padding: "14px 16px", position: "relative", overflow: "hidden",
//         }}>
//           <div style={{
//             position: "absolute", top: 0, left: 0, right: 0, height: "2px",
//             background: s.accent, borderRadius: "2px 2px 0 0",
//           }}/>
//           <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.45)", marginBottom: "6px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>{s.label}</div>
//           <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{s.value}</div>
//         </div>
//       ))}
//     </div>
//   );
// }

// // ── Monthly Sparkline ─────────────────────────────────────────────────────────
// function MonthlyChart({ data, year }) {
//   const months = Array.from({length: 12}, (_, m) => {
//     const dm = new Date(year, m + 1, 0).getDate();
//     let total = 0;
//     for (let d = 1; d <= dm; d++) {
//       const items = data[dateKey(year, m, d)] || [];
//       total += items.reduce((a, b) => a + b.amount, 0);
//     }
//     return total;
//   });
//   const max = Math.max(...months, 1);
//   const W = 600, H = 90, padX = 20, padY = 10;
//   const colW = (W - padX*2) / 12;

//   return (
//     <div style={{
//       background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
//       borderRadius: "16px", padding: "16px 20px", marginBottom: "24px",
//     }}>
//       <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", marginBottom: "12px", textTransform: "uppercase" }}>
//         {year} — Oylar bo'yicha xarajat
//       </div>
//       <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%", height:"auto", overflow:"visible"}}>
//         <defs>
//           <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
//             <stop offset="0%" stopColor="#a78bfa"/>
//             <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.4"/>
//           </linearGradient>
//         </defs>
//         {months.map((v, i) => {
//           const bH = v ? Math.max(4, ((v / max) * (H - padY*2))) : 0;
//           const x = padX + i * colW + colW*0.15;
//           const w = colW * 0.7;
//           const y = H - padY - bH;
//           return (
//             <g key={i}>
//               <rect x={x} y={y} width={w} height={bH} rx="4" fill="url(#barGrad)" opacity="0.85"/>
//               <text x={x + w/2} y={H - 1} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9" fontWeight="600">
//                 {MONTHS_UZ[i].slice(0,3)}
//               </text>
//               {v > 0 && (
//                 <text x={x + w/2} y={y - 4} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="8.5" fontWeight="700">
//                   {formatSum(v)}
//                 </text>
//               )}
//             </g>
//           );
//         })}
//       </svg>
//     </div>
//   );
// }

// // ── Day Modal ─────────────────────────────────────────────────────────────────
// function DayModal({ dateStr, data, onClose, onSave }) {
//   const [items, setItems]   = useState(() => (data[dateStr] || []).map(i => ({...i})));
//   const [name, setName]     = useState("");
//   const [amount, setAmount] = useState("");
//   const [editId, setEditId] = useState(null);
//   const [editName, setEditName] = useState("");
//   const [editAmt, setEditAmt]   = useState("");
//   const [shake, setShake]   = useState(false);

//   const total = items.reduce((a, b) => a + b.amount, 0);

//   const [d, m, y] = dateStr.split("-").reverse().map(Number);
//   const displayDate = `${d < 10 ? "0"+d : d} ${MONTHS_UZ[m-1]} ${y}`;

//   const addItem = () => {
//     if (!name.trim() || !amount) { setShake(true); setTimeout(() => setShake(false), 500); return; }
//     const n = parseInt(amount.replace(/\s/g,""), 10);
//     if (isNaN(n) || n <= 0) return;
//     setItems(prev => [...prev, { id: Date.now(), name: name.trim(), amount: n }]);
//     setName(""); setAmount("");
//   };

//   const deleteItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

//   const startEdit = (item) => {
//     setEditId(item.id);
//     setEditName(item.name);
//     setEditAmt(String(item.amount));
//   };

//   const saveEdit = (id) => {
//     const n = parseInt(editAmt.replace(/\s/g,""), 10);
//     if (!editName.trim() || isNaN(n) || n <= 0) return;
//     setItems(prev => prev.map(i => i.id === id ? {...i, name: editName.trim(), amount: n} : i));
//     setEditId(null);
//   };

//   const handleSave = () => {
//     onSave(dateStr, items);
//     onClose();
//   };

//   const catColors = ["#f87171","#fb923c","#facc15","#4ade80","#34d399","#60a5fa","#a78bfa","#f472b6","#e879f9","#38bdf8"];

//   return (
//     <div style={{
//       position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)",
//       display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
//       animation: "fadeIn 0.2s ease",
//     }} onClick={e => e.target === e.currentTarget && onClose()}>
//       <div style={{
//         width: "min(560px, 95vw)", maxHeight: "90vh", display: "flex", flexDirection: "column",
//         background: "#0f0f1a", border: "1px solid rgba(167,139,250,0.25)", borderRadius: "24px",
//         boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(167,139,250,0.1)",
//         animation: "slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)",
//       }}>
//         {/* Header */}
//         <div style={{
//           padding: "20px 24px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)",
//           display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
//         }}>
//           <div>
//             <div style={{ fontSize: "18px", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>{displayDate}</div>
//             <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>
//               Kunlik xarajatlar
//             </div>
//           </div>
//           <button onClick={onClose} style={{
//             width: "36px", height: "36px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.1)",
//             background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", cursor: "pointer",
//             display: "flex", alignItems: "center", justifyContent: "center",
//           }}>
//             <CloseIcon/>
//           </button>
//         </div>

//         {/* Add row */}
//         <div style={{
//           padding: "16px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0,
//         }}>
//           <div style={{ display: "flex", gap: "10px", animation: shake ? "shake 0.4s ease" : "none" }}>
//             <input
//               value={name} onChange={e => setName(e.target.value)}
//               onKeyDown={e => e.key === "Enter" && addItem()}
//               placeholder="Xarajat nomi..."
//               style={{
//                 flex: 2, padding: "11px 14px", borderRadius: "12px",
//                 border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
//                 color: "#fff", fontSize: "14px", outline: "none", fontFamily: "inherit",
//                 transition: "border-color 0.2s",
//               }}
//               onFocus={e => e.target.style.borderColor = "rgba(167,139,250,0.5)"}
//               onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
//             />
//             <input
//               value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g,""))}
//               onKeyDown={e => e.key === "Enter" && addItem()}
//               placeholder="Summa..."
//               type="text" inputMode="numeric"
//               style={{
//                 flex: 1, padding: "11px 14px", borderRadius: "12px",
//                 border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
//                 color: "#fff", fontSize: "14px", outline: "none", fontFamily: "inherit",
//                 transition: "border-color 0.2s",
//               }}
//               onFocus={e => e.target.style.borderColor = "rgba(167,139,250,0.5)"}
//               onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
//             />
//             <button onClick={addItem} style={{
//               width: "44px", height: "44px", borderRadius: "12px", border: "none",
//               background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff",
//               cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
//               flexShrink: 0, transition: "transform 0.15s, opacity 0.15s",
//             }}
//               onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
//               onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
//             >
//               <PlusIcon/>
//             </button>
//           </div>
//         </div>

//         {/* List */}
//         <div style={{ flex: 1, overflowY: "auto", padding: "8px 24px" }}>
//           {items.length === 0 ? (
//             <div style={{
//               textAlign: "center", padding: "40px 0", color: "rgba(255,255,255,0.2)",
//               fontSize: "14px",
//             }}>
//               Hali xarajat qo'shilmagan
//             </div>
//           ) : (
//             items.map((item, idx) => (
//               <div key={item.id} style={{
//                 display: "flex", alignItems: "center", gap: "12px",
//                 padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
//                 animation: "fadeIn 0.2s ease",
//               }}>
//                 <div style={{
//                   width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
//                   background: catColors[idx % catColors.length],
//                 }}/>
//                 {editId === item.id ? (
//                   <>
//                     <input value={editName} onChange={e => setEditName(e.target.value)}
//                       style={{
//                         flex: 2, padding: "7px 10px", borderRadius: "8px",
//                         border: "1px solid rgba(167,139,250,0.4)", background: "rgba(255,255,255,0.07)",
//                         color: "#fff", fontSize: "14px", outline: "none", fontFamily: "inherit",
//                       }}/>
//                     <input value={editAmt} onChange={e => setEditAmt(e.target.value.replace(/[^\d]/g,""))}
//                       type="text" inputMode="numeric"
//                       style={{
//                         flex: 1, padding: "7px 10px", borderRadius: "8px",
//                         border: "1px solid rgba(167,139,250,0.4)", background: "rgba(255,255,255,0.07)",
//                         color: "#fff", fontSize: "14px", outline: "none", fontFamily: "inherit",
//                       }}/>
//                     <button onClick={() => saveEdit(item.id)} style={{
//                       width: "32px", height: "32px", borderRadius: "8px", border: "none",
//                       background: "#4ade80", color: "#000", cursor: "pointer",
//                       display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
//                     }}><CheckIcon/></button>
//                   </>
//                 ) : (
//                   <>
//                     <span style={{ flex: 1, color: "rgba(255,255,255,0.85)", fontSize: "14px" }}>{item.name}</span>
//                     <span style={{
//                       fontWeight: 700, fontSize: "14px", color: "#fff",
//                       background: "rgba(255,255,255,0.06)", padding: "3px 10px", borderRadius: "8px",
//                     }}>
//                       {item.amount.toLocaleString("uz-UZ")}
//                     </span>
//                     <button onClick={() => startEdit(item)} style={{
//                       width: "30px", height: "30px", borderRadius: "8px",
//                       border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)",
//                       color: "rgba(255,255,255,0.5)", cursor: "pointer",
//                       display: "flex", alignItems: "center", justifyContent: "center",
//                     }}><EditIcon/></button>
//                     <button onClick={() => deleteItem(item.id)} style={{
//                       width: "30px", height: "30px", borderRadius: "8px",
//                       border: "1px solid rgba(255,80,80,0.2)", background: "rgba(255,80,80,0.07)",
//                       color: "#f87171", cursor: "pointer",
//                       display: "flex", alignItems: "center", justifyContent: "center",
//                     }}><TrashIcon/></button>
//                   </>
//                 )}
//               </div>
//             ))
//           )}
//         </div>

//         {/* Footer */}
//         <div style={{
//           padding: "16px 24px", borderTop: "1px solid rgba(255,255,255,0.06)",
//           display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
//         }}>
//           <div>
//             <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Jami</div>
//             <div style={{ fontSize: "22px", fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
//               {total.toLocaleString("uz-UZ")} <span style={{ fontSize: "14px", fontWeight: 500, color: "rgba(255,255,255,0.4)" }}>so'm</span>
//             </div>
//           </div>
//           <button onClick={handleSave} style={{
//             padding: "12px 28px", borderRadius: "14px", border: "none",
//             background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff",
//             fontSize: "14px", fontWeight: 700, cursor: "pointer", letterSpacing: "0.01em",
//             transition: "transform 0.15s, box-shadow 0.15s",
//             boxShadow: "0 4px 20px rgba(124,58,237,0.4)",
//           }}
//             onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 28px rgba(124,58,237,0.5)"; }}
//             onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(124,58,237,0.4)"; }}
//           >
//             Saqlash
//           </button>
//         </div>
//       </div>

//       <style>{`
//         @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
//         @keyframes slideUp { from { opacity:0; transform:translateY(30px) scale(0.96) } to { opacity:1; transform:translateY(0) scale(1) } }
//         @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
//       `}</style>
//     </div>
//   );
// }

// // ── Main Calendar ─────────────────────────────────────────────────────────────
// export default function App() {
//   const today = new Date();
//   const [year,  setYear]  = useState(today.getFullYear());
//   const [month, setMonth] = useState(today.getMonth());
//   const [data,  setData]  = useState(loadData);
//   const [modal, setModal] = useState(null); // dateStr

//   const handleSave = useCallback((dateStr, items) => {
//     setData(prev => {
//       const next = { ...prev, [dateStr]: items };
//       if (items.length === 0) delete next[dateStr];
//       saveData(next);
//       return next;
//     });
//   }, []);

//   const prevMonth = () => {
//     if (month === 0) { setMonth(11); setYear(y => y - 1); }
//     else setMonth(m => m - 1);
//   };
//   const nextMonth = () => {
//     if (month === 11) { setMonth(0); setYear(y => y + 1); }
//     else setMonth(m => m + 1);
//   };

//   const { startDow, daysInMonth } = getMonthDays(year, month);

//   // color map
//   const colorMap = {
//     empty:  { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.06)", dot: null },
//     green:  { bg: "rgba(74,222,128,0.1)",   border: "rgba(74,222,128,0.3)",   dot: "#4ade80" },
//     yellow: { bg: "rgba(250,204,21,0.1)",   border: "rgba(250,204,21,0.3)",   dot: "#facc15" },
//     red:    { bg: "rgba(248,113,113,0.1)",  border: "rgba(248,113,113,0.3)",  dot: "#f87171" },
//   };

//   return (
//     <div style={{
//       minHeight: "100vh",
//       background: "#080812",
//       fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
//       padding: "24px 16px 48px",
//       color: "#fff",
//     }}>
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,800;0,9..40,900&display=swap');
//         * { box-sizing:border-box; }
//         ::-webkit-scrollbar { width:4px }
//         ::-webkit-scrollbar-track { background:transparent }
//         ::-webkit-scrollbar-thumb { background:rgba(167,139,250,0.3); border-radius:4px }
//         input::placeholder { color:rgba(255,255,255,0.2) }
//         .day-cell:hover { transform:translateY(-2px) !important; box-shadow:0 6px 20px rgba(0,0,0,0.4) !important; cursor:pointer; }
//         @keyframes pulseRing {
//           0% { box-shadow: 0 0 0 0 rgba(167,139,250,0.4) }
//           70% { box-shadow: 0 0 0 8px rgba(167,139,250,0) }
//           100% { box-shadow: 0 0 0 0 rgba(167,139,250,0) }
//         }
//       `}</style>

//       <div style={{ maxWidth: "900px", margin: "0 auto" }}>
//         {/* Top header */}
//         <div style={{ marginBottom: "28px", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
//           <div>
//             <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", color: "rgba(167,139,250,0.7)", textTransform: "uppercase", marginBottom: "4px" }}>
//               Xarajat Kuzatuvchi
//             </div>
//             <h1 style={{ margin: 0, fontSize: "clamp(24px,5vw,38px)", fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(135deg,#fff 30%,rgba(167,139,250,0.8))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
//               Moliyaviy Daftar
//             </h1>
//           </div>
//           <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
//             <div style={{ padding: "6px 14px", borderRadius: "30px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", fontSize: "13px", color: "rgba(255,255,255,0.4)" }}>
//               {today.toLocaleDateString("uz-UZ", {day:"numeric", month:"long", year:"numeric"})}
//             </div>
//           </div>
//         </div>

//         {/* Stats */}
//         <StatsBar data={data} year={year} month={month}/>

//         {/* Yearly chart */}
//         <MonthlyChart data={data} year={year}/>

//         {/* Calendar card */}
//         <div style={{
//           background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
//           borderRadius: "24px", padding: "24px", backdropFilter: "blur(20px)",
//         }}>
//           {/* Month navigation */}
//           <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
//             <button onClick={prevMonth} style={{
//               width: "40px", height: "40px", borderRadius: "12px",
//               border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
//               color: "rgba(255,255,255,0.7)", cursor: "pointer",
//               display: "flex", alignItems: "center", justifyContent: "center",
//               transition: "background 0.2s",
//             }}
//               onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
//               onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
//             ><ChevronLeft/></button>

//             <div style={{ textAlign: "center" }}>
//               <div style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "-0.02em" }}>
//                 {MONTHS_UZ[month]}
//               </div>
//               <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>{year}</div>
//             </div>

//             <button onClick={nextMonth} style={{
//               width: "40px", height: "40px", borderRadius: "12px",
//               border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
//               color: "rgba(255,255,255,0.7)", cursor: "pointer",
//               display: "flex", alignItems: "center", justifyContent: "center",
//               transition: "background 0.2s",
//             }}
//               onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}
//               onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
//             ><ChevronRight/></button>
//           </div>

//           {/* Day headers */}
//           <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px", marginBottom: "6px" }}>
//             {DAYS_UZ.map(d => (
//               <div key={d} style={{
//                 textAlign: "center", fontSize: "11px", fontWeight: 700,
//                 color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em", padding: "4px 0",
//                 textTransform: "uppercase",
//               }}>{d}</div>
//             ))}
//           </div>

//           {/* Day cells */}
//           <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px" }}>
//             {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`}/>)}
//             {Array.from({ length: daysInMonth }, (_, i) => {
//               const day = i + 1;
//               const key = dateKey(year, month, day);
//               const items = data[key] || [];
//               const total = items.reduce((a, b) => a + b.amount, 0);
//               const color = getDayColor(total);
//               const cm = colorMap[color];
//               const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

//               return (
//                 <div key={day} className="day-cell" onClick={() => setModal(key)}
//                   style={{
//                     aspectRatio: "1", borderRadius: "14px",
//                     background: isToday ? "rgba(167,139,250,0.15)" : cm.bg,
//                     border: `1px solid ${isToday ? "rgba(167,139,250,0.5)" : cm.border}`,
//                     display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
//                     padding: "4px", transition: "transform 0.18s, box-shadow 0.18s",
//                     animation: isToday ? "pulseRing 2.5s infinite" : "none",
//                     position: "relative",
//                   }}>
//                   <span style={{
//                     fontSize: "clamp(11px,2vw,15px)", fontWeight: isToday ? 800 : 600,
//                     color: isToday ? "#a78bfa" : "rgba(255,255,255,0.85)",
//                     lineHeight: 1,
//                   }}>{day}</span>
//                   {total > 0 && (
//                     <span style={{
//                       fontSize: "clamp(8px,1.2vw,11px)", fontWeight: 700, marginTop: "3px",
//                       color: cm.dot, lineHeight: 1,
//                     }}>{formatSum(total)}</span>
//                   )}
//                   {items.length > 0 && (
//                     <div style={{
//                       position: "absolute", top: "5px", right: "5px",
//                       width: "6px", height: "6px", borderRadius: "50%",
//                       background: cm.dot,
//                     }}/>
//                   )}
//                 </div>
//               );
//             })}
//           </div>

//           {/* Legend */}
//           <div style={{ display: "flex", gap: "16px", marginTop: "20px", flexWrap: "wrap", justifyContent: "center" }}>
//             {[
//               { color: "rgba(255,255,255,0.2)", label: "Xarajat yo'q" },
//               { color: "#4ade80", label: "0 – 100 000" },
//               { color: "#facc15", label: "100 000 – 200 000" },
//               { color: "#f87171", label: "200 000+" },
//             ].map(l => (
//               <div key={l.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
//                 <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: l.color }}/>
//                 <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontWeight: 500 }}>{l.label} so'm</span>
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>

//       {modal && (
//         <DayModal
//           dateStr={modal}
//           data={data}
//           onClose={() => setModal(null)}
//           onSave={handleSave}
//         />
//       )}
//     </div>
//   );
// }
