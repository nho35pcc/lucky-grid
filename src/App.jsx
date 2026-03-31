import { useState, useEffect, useCallback } from "react";

// ── Data Sources ──────────────────────────────────────────────────────────────
// Primary: NY State open data (free, unlimited, works on Vercel)
// Fallback: Claude web search (used here in artifact sandbox)
const NY_GOV = {
  powerball:    "https://data.ny.gov/resource/d6yy-54nr.json",
  megamillions: "https://data.ny.gov/resource/5xaw-6ayf.json",
};

async function fetchFromNYGov(game, limit = 20) {
  const url = `${NY_GOV[game]}?$limit=${limit}&$order=draw_date%20DESC`;
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  return rows.map(row => {
    const parts = (row.winning_numbers || "").trim().split(/\s+/).map(Number).filter(Boolean);
    const special = row.mega_ball ? Number(row.mega_ball) : parts[parts.length - 1];
    const numbers = parts.slice(0, 5).sort((a, b) => a - b);
    const mult = row.multiplier ? (String(row.multiplier).includes("x") ? row.multiplier : row.multiplier + "x") : null;
    const date = (row.draw_date || "").split("T")[0];
    return { date, numbers, special, multiplier: mult };
  }).filter(d => d.numbers.length === 5 && d.special && d.date);
}

async function claudeFetch(prompt, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 2000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      return (d.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    } catch (e) { if (i === retries - 1) throw e; await new Promise(r => setTimeout(r, 1500 * (i + 1))); }
  }
}

function parseDrawings(text) {
  for (const m of [...text.matchAll(/\[[\s\S]*?\]/g)]) {
    try {
      const arr = JSON.parse(m[0]);
      const valid = arr.filter(d => d?.date?.match(/\d{4}-\d{2}-\d{2}/) && Array.isArray(d.numbers) && d.numbers.length === 5 && typeof d.special === "number");
      if (valid.length >= 3) return valid;
    } catch {}
  }
  return [];
}

async function fetchDrawings(game) {
  // Try direct NY.gov first (works on Vercel/real browser)
  try {
    const data = await fetchFromNYGov(game, 25);
    if (data.length > 0) return data;
  } catch {}
  // Fallback: Claude web search (works in artifact sandbox)
  const cfg = GAMES[game];
  const text = await claudeFetch(
    `Search for the most recent 12 ${cfg.label} lottery winning numbers. ` +
    `Return ONLY a raw JSON array — no markdown, just the array. ` +
    `Format: [{"date":"YYYY-MM-DD","numbers":[n1,n2,n3,n4,n5],"special":n,"multiplier":"Nx"}] ` +
    `5 white balls sorted ascending, special is the ${cfg.specialLabel} only. Start with [ end with ].`
  );
  const drawings = parseDrawings(text);
  if (!drawings.length) throw new Error("No data found");
  return drawings;
}

// ── Schedule ──────────────────────────────────────────────────────────────────
const DRAW_DAYS = { powerball: [1, 3, 6], megamillions: [2, 5] };
const DAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const FULL_DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function getTodayLabel() {
  const n = new Date();
  return { day: FULL_DAYS[n.getDay()], date: `${MONTHS[n.getMonth()]} ${n.getDate()}, ${n.getFullYear()}` };
}
function getNextDraw(game) {
  const days = DRAW_DAYS[game];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = (now.getDay() + i) % 7;
    if (days.includes(d)) return i === 0 ? "Tonight" : i === 1 ? "Tomorrow" : DAY_LABELS[d];
  }
}
function todayGame() {
  const d = new Date().getDay();
  if (DRAW_DAYS.powerball.includes(d)) return "powerball";
  if (DRAW_DAYS.megamillions.includes(d)) return "megamillions";
  return null;
}

// ── Game Config ───────────────────────────────────────────────────────────────
const GAMES = {
  powerball: {
    label: "Powerball", short: "PB",
    whiteMax: 69, specialMax: 26, specialLabel: "Powerball",
    color: "#d42b2b", accent: "#ff4444", dim: "#3a1010",
    ballColor: "#ff4444", specialBallColor: "#d42b2b",
    perRow: 10, specialPerRow: 10,
    gradient: "linear-gradient(135deg, #1a0a0a 0%, #2a0f0f 100%)",
    tileGradient: "linear-gradient(135deg, #8b0000 0%, #cc2200 100%)",
  },
  megamillions: {
    label: "Mega Millions", short: "MM",
    whiteMax: 70, specialMax: 25, specialLabel: "Mega Ball",
    color: "#1a6fc4", accent: "#3399ff", dim: "#0a1a3a",
    ballColor: "#3399ff", specialBallColor: "#f5c518",
    perRow: 12, specialPerRow: 12,
    gradient: "linear-gradient(135deg, #060e1a 0%, #0a1628 100%)",
    tileGradient: "linear-gradient(135deg, #0a3060 0%, #1a6fc4 100%)",
  },
};

// ── Patterns ──────────────────────────────────────────────────────────────────
function getPatternNums(anchor, max, perRow, mode) {
  if (!anchor || !mode) return [];
  const idx = anchor - 1, row = Math.floor(idx / perRow), col = idx % perRow;
  const totalRows = Math.ceil(max / perRow), ok = n => n >= 1 && n <= max;
  if (mode === "row") return Array.from({ length: perRow }, (_, i) => row * perRow + i + 1).filter(ok);
  if (mode === "col") return Array.from({ length: totalRows }, (_, i) => i * perRow + col + 1).filter(ok);
  if (mode === "diag-dn") { let r = row, c = col, out = []; while (r >= 0 && c >= 0) { out.push(r * perRow + c + 1); r--; c--; } r = row + 1; c = col + 1; while (r < totalRows && c < perRow) { out.push(r * perRow + c + 1); r++; c++; } return out.filter(ok); }
  if (mode === "diag-up") { let r = row, c = col, out = []; while (r >= 0 && c < perRow) { out.push(r * perRow + c + 1); r--; c++; } r = row + 1; c = col - 1; while (r < totalRows && c >= 0) { out.push(r * perRow + c + 1); r++; c--; } return out.filter(ok); }
  if (mode === "L-dn") { const rN = Array.from({ length: perRow }, (_, i) => row * perRow + i + 1).filter(ok); const cN = Array.from({ length: totalRows - row }, (_, i) => (row + i) * perRow + col + 1).filter(ok); return [...new Set([...rN, ...cN])]; }
  if (mode === "L-up") { const rN = Array.from({ length: perRow }, (_, i) => row * perRow + i + 1).filter(ok); const cN = Array.from({ length: row + 1 }, (_, i) => i * perRow + col + 1).filter(ok); return [...new Set([...rN, ...cN])]; }
  if (mode === "L-rt") { const cN = Array.from({ length: totalRows }, (_, i) => i * perRow + col + 1).filter(ok); const rN = Array.from({ length: perRow - col }, (_, i) => row * perRow + col + i + 1).filter(ok); return [...new Set([...cN, ...rN])]; }
  return [];
}

// ── Storage ───────────────────────────────────────────────────────────────────
async function sGet(k) { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function sSet(k, v) { try { await window.storage.set(k, JSON.stringify(v)); } catch {} }

// ── Drawing Machine Loading Animation ────────────────────────────────────────
function DrawingMachine({ size = 220, game = "powerball" }) {
  const canvasRef = { current: null };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = size, H = Math.round(size * 1.18);
    canvas.width = W; canvas.height = H;
    const CX = W/2, CY = H*0.43, SR = W*0.375;
    const BR = W * 0.052;

    const isPB = game === "powerball";
    const BALLS = [
      {color:'#ff3333',shade:'#991111',tc:'#fff',n: isPB?'7':'14'},
      {color:'#2255ee',shade:'#0a2288',tc:'#fff',n: isPB?'20':'42'},
      {color:'#ffcc00',shade:'#996600',tc:'#333',n: isPB?'31':'57'},
      {color:'#22bb44',shade:'#0a6622',tc:'#fff',n: isPB?'41':'03'},
      {color:'#cc33cc',shade:'#661166',tc:'#fff',n: isPB?'57':'25'},
      {color:'#ff7722',shade:'#993300',tc:'#fff',n: isPB?'04':'11'},
      {color:'#ffffff',shade:'#bbbbbb',tc:'#222',n: isPB?'62':'66'},
      {color:'#ffffff',shade:'#bbbbbb',tc:'#222',n: isPB?'48':'33'},
      {color:'#ff3333',shade:'#991111',tc:'#fff',n: isPB?'11':'07'},
      {color:'#2255ee',shade:'#0a2288',tc:'#fff',n: isPB?'38':'19'},
    ];

    function clamp(v){ return Math.max(0,Math.min(255,Math.round(v))); }
    function hx(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
    function lgt(h,f){ const [r,g,b]=hx(h); return `rgb(${clamp(r+f*255)},${clamp(g+f*255)},${clamp(b+f*255)})`; }
    function drk(h,f){ const [r,g,b]=hx(h); return `rgb(${clamp(r-f*255)},${clamp(g-f*255)},${clamp(b-f*255)})`; }

    const balls = BALLS.map(d => {
      const a = Math.random()*Math.PI*2, r = Math.random()*(SR-BR-6);
      const spd = 2.6+Math.random()*1.8, ang = Math.random()*Math.PI*2;
      return {...d, x:CX+Math.cos(a)*r, y:CY+Math.sin(a)*r, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd};
    });
    for(let k=0;k<20;k++) for(let i=0;i<balls.length;i++) for(let j=i+1;j<balls.length;j++){
      const a=balls[i],b=balls[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy);
      if(d<BR*2&&d>0){const nx=dx/d,ny=dy/d,ov=(BR*2-d)/2;a.x-=nx*ov;a.y-=ny*ov;b.x+=nx*ov;b.y+=ny*ov;}
    }

    let alive = true;
    function update(){
      balls.forEach(b=>{
        b.x+=b.vx; b.y+=b.vy;
        if(Math.random()<0.03){b.vx+=(Math.random()-.5)*.5;b.vy+=(Math.random()-.5)*.5;}
        const dx=b.x-CX,dy=b.y-CY,d=Math.sqrt(dx*dx+dy*dy),mx=SR-BR;
        if(d>mx){const nx=dx/d,ny=dy/d,dot=b.vx*nx+b.vy*ny;b.vx-=2*dot*nx;b.vy-=2*dot*ny;b.x=CX+nx*mx*.995;b.y=CY+ny*mx*.995;b.vx+=(Math.random()-.5)*.3;b.vy+=(Math.random()-.5)*.3;}
        const sp=Math.sqrt(b.vx*b.vx+b.vy*b.vy);
        if(sp<2.2){b.vx*=1.06;b.vy*=1.06;} if(sp>5.2){b.vx*=.96;b.vy*=.96;}
      });
      for(let i=0;i<balls.length;i++) for(let j=i+1;j<balls.length;j++){
        const a=balls[i],b=balls[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy);
        if(d<BR*2&&d>.01){const nx=dx/d,ny=dy/d,ov=(BR*2-d)/2;a.x-=nx*ov;a.y-=ny*ov;b.x+=nx*ov;b.y+=ny*ov;const rv=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(rv<0){a.vx+=rv*nx;a.vy+=rv*ny;b.vx-=rv*nx;b.vy-=rv*ny;}}
      }
    }

    function drawBall(b){
      const g=ctx.createRadialGradient(b.x-BR*.3,b.y-BR*.3,BR*.04,b.x+BR*.1,b.y+BR*.15,BR*1.05);
      g.addColorStop(0,lgt(b.color,.45)); g.addColorStop(0.3,b.color); g.addColorStop(0.8,drk(b.color,.25)); g.addColorStop(1,drk(b.color,.4));
      ctx.save(); ctx.shadowColor='rgba(0,0,0,0.35)'; ctx.shadowBlur=4; ctx.shadowOffsetY=2;
      ctx.beginPath(); ctx.arc(b.x,b.y,BR,0,Math.PI*2); ctx.fillStyle=g; ctx.fill(); ctx.restore();
      const sh=ctx.createRadialGradient(b.x-BR*.33,b.y-BR*.33,0,b.x-BR*.15,b.y-BR*.15,BR*.56);
      sh.addColorStop(0,'rgba(255,255,255,0.68)'); sh.addColorStop(0.45,'rgba(255,255,255,0.15)'); sh.addColorStop(1,'rgba(255,255,255,0)');
      ctx.beginPath(); ctx.arc(b.x,b.y,BR,0,Math.PI*2); ctx.fillStyle=sh; ctx.fill();
      ctx.font=`900 ${Math.round(BR)}px "Arial Black",Arial`; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillStyle='rgba(0,0,0,0.2)'; ctx.fillText(b.n,b.x+1,b.y+2);
      ctx.fillStyle=b.tc; ctx.fillText(b.n,b.x,b.y+.5);
    }

    function render(){
      ctx.clearRect(0,0,W,H);
      const sc='rgba(160,190,220,0.55)', sl='rgba(180,210,240,0.65)';
      const legY=CY+SR-8, baseY=H-12;
      ctx.lineCap='round'; ctx.lineWidth=3.5;
      [[CX-SR*.6,baseY],[CX,baseY],[CX+SR*.6,baseY]].forEach(([tx,ty])=>{
        ctx.beginPath();ctx.moveTo(CX,legY);ctx.lineTo(tx,ty);ctx.strokeStyle=sc;ctx.stroke();
      });
      ctx.beginPath();ctx.arc(CX,baseY,SR*.6,Math.PI,Math.PI*2,false);ctx.strokeStyle=sc;ctx.lineWidth=2.5;ctx.stroke();
      ctx.lineWidth=2.5;
      ctx.beginPath();ctx.moveTo(CX,CY-SR+10);ctx.lineTo(CX,legY);ctx.strokeStyle=sl;ctx.stroke();
      ctx.beginPath();ctx.moveTo(CX-SR+10,CY);ctx.lineTo(CX+SR-10,CY);ctx.strokeStyle=sl;ctx.stroke();
      ctx.beginPath();ctx.arc(CX,CY,6,0,Math.PI*2);ctx.fillStyle=sl;ctx.fill();
      ctx.beginPath();ctx.arc(CX,CY,3.5,0,Math.PI*2);ctx.fillStyle='rgba(10,20,40,0.7)';ctx.fill();
      // sphere interior
      ctx.beginPath();ctx.arc(CX,CY,SR,0,Math.PI*2);ctx.fillStyle='rgba(30,50,90,0.15)';ctx.fill();
      // balls (clipped)
      ctx.save();ctx.beginPath();ctx.arc(CX,CY,SR-1,0,Math.PI*2);ctx.clip();
      [...balls].sort((a,b)=>a.y-b.y).forEach(drawBall);
      ctx.restore();
      // outer ring
      ctx.beginPath();ctx.arc(CX,CY,SR,0,Math.PI*2);ctx.strokeStyle='rgba(160,200,255,0.6)';ctx.lineWidth=2.5;ctx.stroke();
      ctx.beginPath();ctx.arc(CX,CY,SR-5,0,Math.PI*2);ctx.strokeStyle='rgba(160,200,255,0.1)';ctx.lineWidth=1;ctx.stroke();
      // glass highlights
      ctx.beginPath();ctx.arc(CX-SR*.18,CY-SR*.18,SR*.62,Math.PI*1.08,Math.PI*1.72);ctx.strokeStyle='rgba(255,255,255,0.48)';ctx.lineWidth=2.8;ctx.stroke();
      ctx.beginPath();ctx.arc(CX-SR*.28,CY-SR*.28,SR*.28,Math.PI*1.1,Math.PI*1.6);ctx.strokeStyle='rgba(255,255,255,0.25)';ctx.lineWidth=1.8;ctx.stroke();
      ctx.beginPath();ctx.arc(CX+SR*.18,CY+SR*.22,SR*.32,Math.PI*.05,Math.PI*.58);ctx.strokeStyle='rgba(255,255,255,0.09)';ctx.lineWidth=1.4;ctx.stroke();
      // air tube
      ctx.lineWidth=4.5;ctx.strokeStyle=sc;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(CX,CY+SR+1);ctx.lineTo(CX,legY-2);ctx.stroke();
      ctx.lineWidth=2.5;ctx.strokeStyle='rgba(200,220,255,0.22)';
      ctx.beginPath();ctx.moveTo(CX,CY+SR+1);ctx.lineTo(CX,legY-2);ctx.stroke();
    }

    function loop(){ if(!alive) return; update(); render(); requestAnimationFrame(loop); }
    loop();
    return () => { alive = false; };
  }, [game, size]);

  return <canvas ref={r => { canvasRef.current = r; }} style={{ display:"block", borderRadius: 8 }} />;
}

// ── Bubble ────────────────────────────────────────────────────────────────────
function Bubble({ num, isWinner, isMine, isPattern, heat, mode, cfg, onClick }) {
  let bg = "rgba(255,255,255,0.07)", border = "1.5px solid rgba(255,255,255,0.12)", text = "rgba(255,255,255,0.35)", fw = 500, shadow = "none", scale = 1;
  if (mode === "heat" && heat > 0) {
    const r = Math.round(30 + 215 * heat), g = Math.round(heat > .5 ? 140 * (2 - heat * 2) : 100 * heat * 2), b = Math.round(220 * (1 - heat));
    bg = `rgba(${r},${g},${b},${0.15 + heat * 0.85})`; border = `1.5px solid rgba(${r},${g},${b},0.7)`;
    text = heat > .4 ? "#fff" : "rgba(255,255,255,0.6)"; fw = heat > .5 ? 800 : 600;
    if (heat > .55) shadow = `0 0 10px rgba(${r},${g},${b},.6)`;
  } else if (isWinner && isMine) {
    bg = "#ffe234"; border = "2px solid #ffd700"; text = "#111"; fw = 900; shadow = "0 0 14px #ffd70099"; scale = 1.12;
  } else if (isWinner) {
    bg = cfg.ballColor; border = `2px solid ${cfg.accent}`; text = "#fff"; fw = 900; shadow = `0 0 12px ${cfg.ballColor}88`;
  } else if (isMine) {
    bg = "rgba(80,160,255,0.25)"; border = "2px solid #4499ff"; text = "#88ccff"; fw = 900;
  } else if (isPattern) {
    bg = "rgba(160,80,255,0.25)"; border = "2px solid #aa66ff"; text = "#cc99ff"; fw = 800;
  }
  return (
    <div onClick={onClick} style={{
      width: 34, height: 30, borderRadius: 15, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: fw, fontFamily: "'DM Mono', monospace",
      background: bg, border, color: text, boxShadow: shadow,
      transform: `scale(${scale})`, transition: "all .1s ease",
      cursor: onClick ? "pointer" : "default",
      userSelect: "none", WebkitTapHighlightColor: "transparent",
    }}>{num}</div>
  );
}

function TicketGrid({ max, perRow, winners = [], mine = [], patternNums = [], mode = "view", freqMap = {}, cfg, onToggle, onAnchor }) {
  const maxF = Math.max(1, ...Object.values(freqMap));
  const rows = [];
  for (let i = 1; i <= max; i += perRow)
    rows.push(Array.from({ length: Math.min(perRow, max - i + 1) }, (_, j) => i + j));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", gap: 4 }}>
          {row.map(n => (
            <Bubble key={n} num={n} mode={mode}
              isWinner={winners.includes(n)} isMine={mine.includes(n)} isPattern={patternNums.includes(n)}
              heat={freqMap[n] ? freqMap[n] / maxF : 0} cfg={cfg}
              onClick={() => { onToggle?.(n); onAnchor?.(n); }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Big Ball ──────────────────────────────────────────────────────────────────
function BigBall({ num, isSpecial, cfg }) {
  const c = isSpecial ? cfg.specialBallColor : "#ffffff";
  const textColor = isSpecial ? (cfg.specialBallColor === "#f5c518" ? "#111" : "#fff") : "#111";
  return (
    <div style={{
      width: 66, height: 66, borderRadius: "50%", flexShrink: 0,
      background: isSpecial
        ? `radial-gradient(circle at 35% 30%, ${cfg.specialBallColor}ee, ${cfg.specialBallColor}88)`
        : "radial-gradient(circle at 35% 30%, #ffffff, #dde0ee)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 24, fontWeight: 900, fontFamily: "'DM Mono', monospace",
      color: textColor,
      boxShadow: isSpecial
        ? `0 0 28px ${c}66, 0 4px 16px rgba(0,0,0,0.5), inset 0 -3px 8px rgba(0,0,0,0.3)`
        : "0 4px 16px rgba(0,0,0,0.4), inset 0 -3px 8px rgba(0,0,0,0.15)",
      border: isSpecial ? `3px solid ${c}` : "3px solid rgba(255,255,255,0.5)",
    }}>{num}</div>
  );
}

// ── Pattern Bar ───────────────────────────────────────────────────────────────
const PATTERNS = [
  { id: "row", label: "Row" }, { id: "col", label: "Col" },
  { id: "diag-dn", label: "↘ Diag" }, { id: "diag-up", label: "↗ Diag" },
  { id: "L-dn", label: "L ↓" }, { id: "L-up", label: "L ↑" }, { id: "L-rt", label: "L →" },
];
function PatternBar({ active, onSelect }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono', monospace", letterSpacing: 2, marginBottom: 10, textTransform: "uppercase" }}>
        Pattern Overlay{active ? " · Tap a bubble to place" : ""}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PATTERNS.map(p => (
          <button key={p.id} onClick={() => onSelect(active === p.id ? null : p.id)} style={{
            padding: "9px 14px", borderRadius: 10, fontSize: 13,
            fontFamily: "'DM Mono', monospace", fontWeight: 700, minHeight: 42,
            background: active === p.id ? "rgba(160,80,255,0.3)" : "rgba(255,255,255,0.07)",
            border: active === p.id ? "2px solid #aa66ff" : "2px solid rgba(255,255,255,0.12)",
            color: active === p.id ? "#cc99ff" : "rgba(255,255,255,0.5)",
            cursor: "pointer", transition: "all .12s",
          }}>{p.label}</button>
        ))}
        {active && <button onClick={() => onSelect(null)} style={{ padding: "9px 14px", borderRadius: 10, fontSize: 13, fontFamily: "'DM Mono', monospace", background: "rgba(255,255,255,0.05)", border: "2px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.3)", cursor: "pointer", minHeight: 42 }}>✕</button>}
      </div>
    </div>
  );
}

// ── Game Tile ─────────────────────────────────────────────────────────────────
function GameTile({ gameKey, cfg, active, jackpot, onClick }) {
  const nextDraw = getNextDraw(gameKey);
  return (
    <div onClick={onClick} style={{
      flex: 1, borderRadius: 16, padding: "16px 18px",
      background: active ? cfg.tileGradient : "rgba(255,255,255,0.06)",
      border: active ? `2px solid ${cfg.accent}` : "2px solid rgba(255,255,255,0.1)",
      cursor: "pointer", transition: "all .2s",
      boxShadow: active ? `0 4px 24px ${cfg.accent}33` : "none",
    }}>
      <div style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{nextDraw}</div>
      <div style={{ fontSize: 18, fontWeight: 900, fontFamily: "'DM Sans', sans-serif", color: active ? "#fff" : "rgba(255,255,255,0.45)", lineHeight: 1.1, marginBottom: 8 }}>{cfg.label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'DM Mono', monospace", color: active ? cfg.accent : "rgba(255,255,255,0.2)" }}>
        {jackpot || "—"}
      </div>
    </div>
  );
}

// ── Section Label ─────────────────────────────────────────────────────────────
const SLabel = ({ children, color }) => (
  <div style={{ fontSize: 12, fontFamily: "'DM Mono', monospace", color: color || "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 2.5, marginBottom: 14, fontWeight: 700 }}>{children}</div>
);

// ── Week Strip ────────────────────────────────────────────────────────────────
function WeekStrip() {
  const today = new Date().getDay();
  return (
    <div style={{ display: "flex", gap: 4, padding: "14px 20px", background: "rgba(0,0,0,0.25)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      {DAY_LABELS.map((d, i) => {
        const pb = DRAW_DAYS.powerball.includes(i), mm = DRAW_DAYS.megamillions.includes(i), isToday = i === today;
        return (
          <div key={i} style={{ flex: 1, borderRadius: 8, padding: "6px 2px", background: isToday ? "rgba(255,255,255,0.1)" : "transparent", border: isToday ? "1.5px solid rgba(255,255,255,0.2)" : "1.5px solid transparent", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ fontSize: 9, fontFamily: "'DM Mono', monospace", color: isToday ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)", fontWeight: isToday ? 800 : 500 }}>{d}</div>
            {pb && <div style={{ width: 8, height: 8, borderRadius: "50%", background: isToday ? GAMES.powerball.accent : "rgba(255,68,68,0.3)" }} />}
            {mm && <div style={{ width: 8, height: 8, borderRadius: "50%", background: isToday ? GAMES.megamillions.accent : "rgba(51,153,255,0.3)" }} />}
            {!pb && !mm && <div style={{ width: 8, height: 8 }} />}
          </div>
        );
      })}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function LotteryTracker() {
  const [game, setGame] = useState(() => todayGame() || "powerball");
  const [tab, setTab] = useState("latest");
  const [allDrawings, setAllDrawings] = useState({ powerball: [], megamillions: [] });
  const [picks, setPicks] = useState({ powerball: { white: [], special: null }, megamillions: { white: [], special: null } });
  const [jackpots, setJackpots] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingSource, setLoadingSource] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [ready, setReady] = useState(false);
  const [patternMode, setPatternMode] = useState(null);
  const [patternAnchor, setPatternAnchor] = useState(null);
  const [expandedDate, setExpandedDate] = useState(null);
  const [histPatternMode, setHistPatternMode] = useState(null);
  const [histPatternAnchor, setHistPatternAnchor] = useState(null);
  const [specialInput, setSpecialInput] = useState("");
  const [savedTickets, setSavedTickets] = useState([]);
  const [savingName, setSavingName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [activeTicketIdx, setActiveTicketIdx] = useState(null);

  const cfg = GAMES[game];
  const drawings = allDrawings[game];
  const latest = drawings[0];
  const myPicks = picks[game];
  const patternNums = getPatternNums(patternAnchor, cfg.whiteMax, cfg.perRow, patternMode);
  const histPatternNums = getPatternNums(histPatternAnchor, cfg.whiteMax, cfg.perRow, histPatternMode);

  useEffect(() => {
    (async () => {
      const d = await sGet("lt7:drawings"); if (d) setAllDrawings(d);
      const p = await sGet("lt7:picks"); if (p) setPicks(p);
      const j = await sGet("lt7:jackpots"); if (j) setJackpots(j);
      const t = await sGet("lt7:tickets"); if (t) setSavedTickets(t);
      setReady(true);
    })();
  }, []);

  useEffect(() => { if (ready && drawings.length === 0) doFetch(); }, [game, ready]);

  useEffect(() => {
    if (!ready) return;
    fetch('/api/jackpots').then(r => r.json()).then(j => {
      if (j && Object.keys(j).length) { setJackpots(j); sSet("lt7:jackpots", j); }
    }).catch(() => {});
  }, [ready]);

  const doFetch = async () => {
    if (loading) return;
    setLoading(true); setError("");
    setLoadingSource("Trying data.ny.gov…");
    setStatus("");
    try {
      const fetched = await fetchDrawings(game);
      setAllDrawings(prev => {
        const seen = new Set();
        const merged = [...fetched, ...prev[game]].filter(d => !seen.has(d.date) && seen.add(d.date)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 100);
        const next = { ...prev, [game]: merged };
        sSet("lt7:drawings", next); return next;
      });
      setStatus(`✓ ${fetched.length} drawings loaded`);
      setLoadingSource("");
    } catch {
      setError("Could not load results — tap Refresh to try again");
      setLoadingSource("");
    }
    setLoading(false); setTimeout(() => setStatus(""), 5000);
  };

  const toggleWhite = useCallback((n) => {
    setPicks(prev => {
      const cur = prev[game].white;
      const next = cur.includes(n) ? cur.filter(x => x !== n) : cur.length < 5 ? [...cur, n].sort((a, b) => a - b) : cur;
      const u = { ...prev, [game]: { ...prev[game], white: next } }; sSet("lt7:picks", u); return u;
    });
  }, [game]);

  const toggleSpecial = useCallback((n) => {
    setPicks(prev => { const u = { ...prev, [game]: { ...prev[game], special: prev[game].special === n ? null : n } }; sSet("lt7:picks", u); return u; });
  }, [game]);

  const clearPicks = () => { setPicks(prev => { const u = { ...prev, [game]: { white: [], special: null } }; sSet("lt7:picks", u); return u; }); };

  const saveTicket = () => {
    if (!myPicks.white.length && !myPicks.special) return;
    const name = savingName.trim() || `Ticket ${savedTickets.length + 1}`;
    const ticket = { id: Date.now(), name, game, white: [...myPicks.white], special: myPicks.special, savedOn: new Date().toLocaleDateString() };
    const next = [ticket, ...savedTickets].slice(0, 20);
    setSavedTickets(next); sSet("lt7:tickets", next);
    setSavingName(""); setShowSaveInput(false); setActiveTicketIdx(null);
  };

  const loadTicket = (ticket) => {
    if (ticket.game !== game) setGame(ticket.game);
    setPicks(prev => { const u = { ...prev, [ticket.game]: { white: ticket.white, special: ticket.special } }; sSet("lt7:picks", u); return u; });
    setActiveTicketIdx(ticket.id);
  };

  const deleteTicket = (id) => {
    const next = savedTickets.filter(t => t.id !== id);
    setSavedTickets(next); sSet("lt7:tickets", next);
    if (activeTicketIdx === id) setActiveTicketIdx(null);
  };

  const whiteFreq = {}, specialFreq = {};
  drawings.forEach(d => { (d.numbers || []).forEach(n => { whiteFreq[n] = (whiteFreq[n] || 0) + 1; }); if (d.special) specialFreq[d.special] = (specialFreq[d.special] || 0) + 1; });
  const wSorted = Object.entries(whiteFreq).sort((a, b) => b[1] - a[1]);
  const hot5 = wSorted.slice(0, 5).map(([n, c]) => ({ n: +n, c }));
  const cold5 = wSorted.slice(-5).map(([n, c]) => ({ n: +n, c }));
  const matchWhite = myPicks.white.filter(n => latest?.numbers?.includes(n)).length;
  const matchSpecial = myPicks.special != null && latest?.special === myPicks.special;
  const hasMyPicks = myPicks.white.length > 0 || myPicks.special != null;

  // ── Shared card styles ─────────────────────────────────────────────────────
  const card = { background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: "20px", marginBottom: 14 };
  const ticketCard = { background: "rgba(255,255,255,0.05)", border: `2px solid ${cfg.accent}55`, borderRadius: 16, padding: "20px", marginBottom: 14, boxShadow: `0 0 32px ${cfg.accent}18` };

  const EmptyState = () => (
    <div style={{ ...card, textAlign: "center", padding: "56px 24px" }}>
      {loading ? (<>
        <div style={{ display:"flex", justifyContent:"center", marginBottom: 20 }}>
          <DrawingMachine size={200} game={game} />
        </div>
        <div style={{ fontSize: 18, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, marginBottom: 10 }}>{loadingSource || "Loading…"}</div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono', monospace" }}>This may take 15–20 seconds</div>
      </>) : error ? (<>
        <div style={{ display:"flex", justifyContent:"center", marginBottom: 20, opacity: 0.55 }}>
          <DrawingMachine size={160} game={game} />
        </div>
        <div style={{ fontSize: 17, color: "#ff8888", fontFamily: "'DM Sans', sans-serif", fontWeight: 700, marginBottom: 20 }}>{error}</div>
        <button onClick={doFetch} style={{ background: cfg.tileGradient, border: "none", color: "#fff", padding: "14px 28px", borderRadius: 12, fontSize: 16, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, cursor: "pointer" }}>↻ Try Again</button>
      </>) : (<>
        <div style={{ display:"flex", justifyContent:"center", marginBottom: 20 }}>
          <DrawingMachine size={200} game={game} />
        </div>
        <div style={{ fontSize: 17, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginBottom: 20 }}>Tap Refresh to load results</div>
        <button onClick={doFetch} style={{ background: cfg.tileGradient, border: "none", color: "#fff", padding: "14px 28px", borderRadius: 12, fontSize: 16, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, cursor: "pointer" }}>Load Results</button>
      </>)}
    </div>
  );

  // ── Tab: Latest ─────────────────────────────────────────────────────────────
  const TabLatest = () => !latest ? <EmptyState /> : (<>
    {hasMyPicks && (matchWhite > 0 || matchSpecial) && (
      <div style={{ background: "linear-gradient(135deg, #7a6000, #c4900a)", border: "2px solid #ffd700", borderRadius: 14, padding: "16px 20px", marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
          🎉 You matched {matchWhite} number{matchWhite !== 1 ? "s" : ""}{matchSpecial ? ` + the ${cfg.specialLabel}!` : "!"}
        </div>
      </div>
    )}
    <div style={card}>
      <SLabel color={cfg.accent}>Latest Drawing · {latest.date}{latest.multiplier ? ` · ${latest.multiplier}` : ""}</SLabel>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {(latest.numbers || []).map(n => <BigBall key={n} num={n} isSpecial={false} cfg={cfg} />)}
        <div style={{ width: 2, height: 50, background: "rgba(255,255,255,0.1)", borderRadius: 1 }} />
        <BigBall num={latest.special} isSpecial cfg={cfg} />
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{cfg.specialLabel.toUpperCase()}</div>
      </div>
    </div>

    <div style={ticketCard}>
      <SLabel color={cfg.accent}>Select 5 · 1–{cfg.whiteMax} · {cfg.perRow} per row · Real Slip Layout</SLabel>
      <PatternBar active={patternMode} onSelect={m => { setPatternMode(m); setPatternAnchor(null); }} />
      <TicketGrid max={cfg.whiteMax} perRow={cfg.perRow} winners={latest.numbers || []} mine={myPicks.white} patternNums={patternNums} cfg={cfg} onToggle={toggleWhite} onAnchor={patternMode ? setPatternAnchor : undefined} />
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "16px 0 14px" }} />
      <SLabel color={cfg.specialBallColor === "#f5c518" ? "#f5c518" : cfg.accent}>Select 1 · {cfg.specialLabel} · 1–{cfg.specialMax}</SLabel>
      <TicketGrid max={cfg.specialMax} perRow={cfg.specialPerRow} winners={[latest.special]} mine={myPicks.special ? [myPicks.special] : []} cfg={cfg} onToggle={toggleSpecial} />
    </div>
  </>);

  // ── Tab: My Numbers ─────────────────────────────────────────────────────────
  const TabMyNumbers = () => (<>
    <div style={card}>
      <SLabel>Your Numbers</SLabel>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {myPicks.white.map(n => (
          <div key={n} onClick={() => toggleWhite(n)} style={{ width: 56, height: 56, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #fff, #c8ccd8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 900, color: "#111", fontFamily: "'DM Mono', monospace", boxShadow: "0 4px 12px rgba(0,0,0,0.4)", border: "3px solid rgba(255,255,255,0.5)", cursor: "pointer" }}>{n}</div>
        ))}
        {Array.from({ length: Math.max(0, 5 - myPicks.white.length) }).map((_, i) => (
          <div key={i} style={{ width: 56, height: 56, borderRadius: "50%", border: "2.5px dashed rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "rgba(255,255,255,0.2)" }}>+</div>
        ))}
        <div style={{ width: 2, height: 40, background: "rgba(255,255,255,0.1)" }} />
        <div onClick={() => myPicks.special && toggleSpecial(myPicks.special)} style={{ width: 56, height: 56, borderRadius: "50%", background: myPicks.special ? `radial-gradient(circle at 35% 30%, ${cfg.specialBallColor}ee, ${cfg.specialBallColor}88)` : "rgba(255,255,255,0.05)", border: myPicks.special ? `3px solid ${cfg.specialBallColor}` : "2.5px dashed rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: myPicks.special ? 20 : 24, fontWeight: 900, color: myPicks.special ? (cfg.specialBallColor === "#f5c518" ? "#222" : "#fff") : "rgba(255,255,255,0.2)", fontFamily: "'DM Mono', monospace", boxShadow: myPicks.special ? `0 0 20px ${cfg.specialBallColor}55` : "none", cursor: myPicks.special ? "pointer" : "default" }}>{myPicks.special || "+"}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{cfg.specialLabel.toUpperCase()}</div>
        {hasMyPicks && <button onClick={clearPicks} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)", padding: "10px 18px", borderRadius: 10, fontSize: 14, fontFamily: "'DM Mono', monospace", fontWeight: 700, cursor: "pointer", minHeight: 44 }}>Clear</button>}
      </div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace" }}>Tap bubbles below to select · Tap a ball above to remove</div>

      {/* Save current picks */}
      <div style={{ marginTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 16 }}>
        {showSaveInput ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              autoFocus
              style={{ flex: 1, minWidth: 140, background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.2)", color: "#fff", padding: "11px 14px", borderRadius: 10, fontSize: 15, fontFamily: "'DM Sans', sans-serif", outline: "none" }}
              placeholder="Name this ticket…"
              value={savingName}
              onChange={e => setSavingName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveTicket(); if (e.key === "Escape") setShowSaveInput(false); }}
            />
            <button onClick={saveTicket} style={{ background: cfg.tileGradient, border: "none", color: "#fff", padding: "11px 20px", borderRadius: 10, fontSize: 15, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, cursor: "pointer", minHeight: 46 }}>Save</button>
            <button onClick={() => setShowSaveInput(false)} style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.4)", padding: "11px 16px", borderRadius: 10, fontSize: 15, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", minHeight: 46 }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowSaveInput(true)} disabled={!hasMyPicks} style={{ background: hasMyPicks ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)", border: "2px solid rgba(255,255,255,0.12)", color: hasMyPicks ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)", padding: "11px 20px", borderRadius: 10, fontSize: 15, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: hasMyPicks ? "pointer" : "not-allowed", minHeight: 46 }}>
            💾 &nbsp;Save This Ticket
          </button>
        )}
      </div>
    </div>

    {/* Saved Tickets */}
    {savedTickets.length > 0 && (
      <div style={card}>
        <SLabel>Saved Tickets</SLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {savedTickets.map(t => {
            const isActive = activeTicketIdx === t.id;
            const gameColor = GAMES[t.game]?.accent || "#fff";
            return (
              <div key={t.id} style={{ background: isActive ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)", border: `2px solid ${isActive ? gameColor : "rgba(255,255,255,0.1)"}`, borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "'DM Sans', sans-serif", marginBottom: 4 }}>{t.name}</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                    {t.white.map(n => <div key={n} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff", fontFamily: "'DM Mono', monospace" }}>{n}</div>)}
                    {t.special && (<><div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)" }} /><div style={{ width: 28, height: 28, borderRadius: "50%", background: GAMES[t.game]?.specialBallColor || gameColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: t.game === "megamillions" ? "#111" : "#fff", fontFamily: "'DM Mono', monospace" }}>{t.special}</div></>)}
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace", marginLeft: 4 }}>{t.game === "powerball" ? "PB" : "MM"} · {t.savedOn}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => loadTicket(t)} style={{ background: isActive ? gameColor + "33" : "rgba(255,255,255,0.08)", border: `1.5px solid ${isActive ? gameColor : "rgba(255,255,255,0.15)"}`, color: isActive ? gameColor : "rgba(255,255,255,0.6)", padding: "8px 14px", borderRadius: 9, fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, cursor: "pointer", minHeight: 40 }}>{isActive ? "✓ Loaded" : "Load"}</button>
                  <button onClick={() => deleteTicket(t.id)} style={{ background: "rgba(255,50,50,0.1)", border: "1.5px solid rgba(255,80,80,0.2)", color: "rgba(255,100,100,0.7)", padding: "8px 12px", borderRadius: 9, fontSize: 13, cursor: "pointer", minHeight: 40 }}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}
    <div style={ticketCard}>
      <SLabel color={cfg.accent}>White Balls · 1–{cfg.whiteMax}{myPicks.white.length > 0 && <span style={{ color: "#fff", marginLeft: 10 }}>{myPicks.white.length} of 5</span>}</SLabel>
      <PatternBar active={patternMode} onSelect={m => { setPatternMode(m); setPatternAnchor(null); }} />
      <TicketGrid max={cfg.whiteMax} perRow={cfg.perRow} winners={latest?.numbers || []} mine={myPicks.white} patternNums={patternNums} cfg={cfg} onToggle={toggleWhite} onAnchor={patternMode ? setPatternAnchor : undefined} />
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "16px 0 14px" }} />
      <SLabel color={cfg.specialBallColor === "#f5c518" ? "#f5c518" : cfg.accent}>{cfg.specialLabel} · 1–{cfg.specialMax}</SLabel>
      <TicketGrid max={cfg.specialMax} perRow={cfg.specialPerRow} winners={latest?.special ? [latest.special] : []} mine={myPicks.special ? [myPicks.special] : []} cfg={cfg} onToggle={toggleSpecial} />
      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center" }}>
        <input style={{ background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.15)", color: "#fff", padding: "11px 14px", borderRadius: 10, fontSize: 16, fontFamily: "'DM Mono', monospace", outline: "none", width: 110 }}
          placeholder={`1–${cfg.specialMax}`} value={specialInput}
          onChange={e => setSpecialInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { toggleSpecial(+specialInput); setSpecialInput(""); } }}
        />
        <button onClick={() => { toggleSpecial(+specialInput); setSpecialInput(""); }} style={{ background: cfg.tileGradient, border: "none", color: "#fff", padding: "11px 20px", borderRadius: 10, fontSize: 15, fontFamily: "'DM Mono', monospace", fontWeight: 800, cursor: "pointer", minHeight: 46 }}>Set</button>
      </div>
    </div>
  </>);

  // ── Tab: Heat Map ───────────────────────────────────────────────────────────
  const TabHeatMap = () => drawings.length < 2 ? <EmptyState /> : (<>
    <div style={ticketCard}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 6 }}>
        <SLabel color={cfg.accent}>{drawings.length} Drawings · Number Frequency</SLabel>
        <div style={{ display: "flex", gap: 12, fontSize: 12, fontFamily: "'DM Mono', monospace', fontWeight: 700" }}>
          <span style={{ color: "#4466ff" }}>■ Rare</span>
          <span style={{ color: "#44aaee" }}>■ Avg</span>
          <span style={{ color: "#ff4422" }}>■ Hot</span>
        </div>
      </div>
      <TicketGrid max={cfg.whiteMax} perRow={cfg.perRow} mode="heat" freqMap={whiteFreq} cfg={cfg} />
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "16px 0 14px" }} />
      <SLabel color={cfg.specialBallColor === "#f5c518" ? "#f5c518" : cfg.accent}>{cfg.specialLabel} Frequency</SLabel>
      <TicketGrid max={cfg.specialMax} perRow={cfg.specialPerRow} mode="heat" freqMap={specialFreq} cfg={cfg} />
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {[{ label: "🔥 Hot", nums: hot5, c1: "#e63946", c2: "#ff7777" }, { label: "❄️ Cold", nums: cold5, c1: "#3355cc", c2: "#5577ff" }].map(({ label, nums, c1, c2 }) => (
        <div key={label} style={card}>
          <SLabel>{label}</SLabel>
          {nums.map(({ n, c }) => (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0, background: c1, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, fontFamily: "'DM Mono', monospace", boxShadow: `0 0 10px ${c1}66` }}>{n}</div>
              <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3 }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${(c / Math.max(...nums.map(x => x.c))) * 100}%`, background: `linear-gradient(90deg, ${c1}, ${c2})` }} />
              </div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono', monospace", fontWeight: 700, width: 28 }}>{c}x</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  </>);

  // ── Tab: History ────────────────────────────────────────────────────────────
  const TabHistory = () => drawings.length === 0 ? <EmptyState /> : (
    <div>
      {drawings.map((d, i) => {
        const isExp = expandedDate === d.date;
        const wMatch = myPicks.white.filter(n => (d.numbers || []).includes(n));
        const sMatch = myPicks.special != null && d.special === myPicks.special;
        return (
          <div key={d.date + i} style={{ marginBottom: 6 }}>
            <div onClick={() => { setExpandedDate(isExp ? null : d.date); setHistPatternMode(null); setHistPatternAnchor(null); }} style={{
              background: isExp ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.06)",
              border: `2px solid ${isExp ? cfg.accent : "rgba(255,255,255,0.1)"}`,
              borderRadius: isExp ? "14px 14px 0 0" : 14, padding: "14px 18px",
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              boxShadow: isExp ? `0 0 20px ${cfg.accent}22` : "none", flexWrap: "wrap",
            }}>
              <div style={{ width: 80, flexShrink: 0, fontSize: i === 0 ? 13 : 12, fontFamily: "'DM Mono', monospace", color: i === 0 ? cfg.accent : "rgba(255,255,255,0.3)", fontWeight: i === 0 ? 900 : 500 }}>
                {i === 0 ? "LATEST" : d.date}
              </div>
              <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "nowrap" }}>
                {(d.numbers || []).map(n => {
                  const mine = myPicks.white.includes(n);
                  return <div key={n} style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: mine ? "#ffe234" : cfg.ballColor, border: `2px solid ${mine ? "#f5a700" : cfg.accent + "88"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: mine ? "#333" : "#fff", fontFamily: "'DM Mono', monospace" }}>{n}</div>;
                })}
                <div style={{ width: 2, height: 18, background: "rgba(255,255,255,0.1)", margin: "0 3px" }} />
                <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: sMatch ? "#ffe234" : cfg.specialBallColor, border: `2px solid ${sMatch ? "#f5a700" : cfg.specialBallColor}88`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: sMatch ? "#333" : (cfg.specialBallColor === "#f5c518" ? "#333" : "#fff"), fontFamily: "'DM Mono', monospace" }}>{d.special}</div>
                {d.multiplier && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace", fontWeight: 700 }}>{d.multiplier}</div>}
              </div>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                {(wMatch.length > 0 || sMatch) && <div style={{ fontSize: 12, color: "#ffd700", fontFamily: "'DM Mono', monospace", fontWeight: 900, background: "rgba(255,215,0,0.15)", border: "1.5px solid #ffd70055", borderRadius: 8, padding: "4px 10px" }}>{wMatch.length > 0 ? `${wMatch.length}W` : ""}{sMatch ? "+B" : ""}</div>}
                <div style={{ fontSize: 18, color: isExp ? cfg.accent : "rgba(255,255,255,0.2)", display: "inline-block", transform: isExp ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</div>
              </div>
            </div>
            {isExp && (
              <div style={{ background: "rgba(255,255,255,0.04)", border: `2px solid ${cfg.accent}`, borderTop: "none", borderRadius: "0 0 14px 14px", padding: "18px 20px" }}>
                <PatternBar active={histPatternMode} onSelect={m => { setHistPatternMode(m); setHistPatternAnchor(null); }} />
                <SLabel color={cfg.accent}>Select 5 · {d.date}</SLabel>
                <TicketGrid max={cfg.whiteMax} perRow={cfg.perRow} winners={d.numbers || []} mine={myPicks.white} patternNums={histPatternNums} cfg={cfg} onAnchor={histPatternMode ? setHistPatternAnchor : undefined} />
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", margin: "14px 0 12px" }} />
                <SLabel color={cfg.specialBallColor === "#f5c518" ? "#f5c518" : cfg.accent}>{cfg.specialLabel}</SLabel>
                <TicketGrid max={cfg.specialMax} perRow={cfg.specialPerRow} winners={[d.special]} mine={myPicks.special ? [myPicks.special] : []} cfg={cfg} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div style={{ background: "#0a1628", minHeight: "100vh", color: "#fff" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500;700&family=DM+Sans:wght@400;600;700;800;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
        button { outline: none; }
        input::placeholder { color: rgba(255,255,255,0.25); }
      `}</style>

      {/* Header */}
      <div style={{ background: "linear-gradient(180deg, #0d1f3c 0%, #0a1628 100%)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "18px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono', monospace", letterSpacing: 3, textTransform: "uppercase", marginBottom: 4 }}>California</div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: 3, color: "#fff", margin: 0, lineHeight: 1 }}>Lottery Tracker</h1>
          </div>
          {/* Today's date — center */}
          <div style={{ textAlign: "center", flex: 1, padding: "0 12px" }}>
            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'DM Sans', sans-serif", color: "#fff", lineHeight: 1 }}>{getTodayLabel().day}</div>
            <div style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.45)", marginTop: 4 }}>{getTodayLabel().date}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <button onClick={doFetch} disabled={loading} style={{ background: loading ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.12)", border: "2px solid rgba(255,255,255,0.2)", color: "#fff", padding: "11px 20px", borderRadius: 12, fontSize: 15, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? .6 : 1, minHeight: 48 }}>
              {loading ? "⟳  Loading…" : "↻  Refresh"}
            </button>
            {status && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: "'DM Mono', monospace" }}>{status}</div>}
          </div>
        </div>

        {/* Game tiles */}
        <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
          {Object.entries(GAMES).map(([k, g]) => (
            <GameTile key={k} gameKey={k} cfg={g} active={game === k} jackpot={jackpots[k]} onClick={() => { setGame(k); setPatternMode(null); setPatternAnchor(null); setExpandedDate(null); }} />
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {[["latest","Results"],["mynumbers","My Numbers"],["heatmap","Heat Map"],["history","History"]].map(([id, label]) => (
            <div key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: "14px 4px", textAlign: "center", fontSize: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, letterSpacing: .5, textTransform: "uppercase", color: tab === id ? cfg.accent : "rgba(255,255,255,0.3)", borderBottom: tab === id ? `3px solid ${cfg.accent}` : "3px solid transparent", cursor: "pointer", transition: "color .15s", whiteSpace: "nowrap" }}>{label}</div>
          ))}
        </div>
      </div>

      <WeekStrip />

      <div style={{ padding: "16px", maxWidth: 860, margin: "0 auto" }}>
        {tab === "latest" && <TabLatest />}
        {tab === "mynumbers" && <TabMyNumbers />}
        {tab === "heatmap" && <TabHeatMap />}
        {tab === "history" && <TabHistory />}
      </div>
    </div>
  );
}
