/* SPDL Hub — static site. Live data from the Sleeper API, dynasty values from data/ktc.json
   (refreshed daily by the GitHub Action), shared features on Firebase (Google sign-in + Firestore). */
(function(){
"use strict";
const API="https://api.sleeper.app/v1/";
const j=async u=>{const r=await fetch(u,{cache:"no-store"}); if(!r.ok) throw new Error(r.status+" "+u); return r.json();};
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const f1=x=>(Math.round(x*10)/10).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1});
const f2=x=>(+x).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const f0=x=>Math.round(x).toLocaleString('en-US');
const pctS=x=> x>=0.995&&x<1 ? ">99%" : (x>0&&x<0.005 ? "<1%" : Math.round(x*100)+"%");
const sgn=x=>(x>0?"+":x<0?"−":"")+f0(Math.abs(x));
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const norm=s=>String(s).toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g,'').replace(/[^a-z]/g,'');

/* ---------------- state ---------------- */
let S=null, PLAYERS=null, KTCV=null, LIVE_OK=false, LIVE_ERR=null, LIVE_AT=null;
let N=10, C, REG, PT, SEA, STAND, REMAIN, NEXTW, MODEL, GAP, OPT0, BASE, DORDER, KT, PR, TRADES, DECIDED={};
let MY_TEAM=null;
const ABBR=["GG","RAJ","KM","TES","WBT","SAS","YUT","OH","TAJ","KC","GZ"];
const SHORT=["Guǎndào gōng","Raj","Karl Marx","TeSlaa","WBT","Super A.S.S.","Yuta","Oh 🦌","Tommy","King Culture","georgebez"];
const NAME=i=> i===10 ? "georgebez (former)" : (S.owners[i]?S.owners[i][2]:"Team "+i);
const HANDLE=i=>S.owners[i]?S.owners[i][1]:"?";
const short=i=>SHORT[i]||NAME(i);
const abbr=i=>ABBR[i]||"T"+i;
const teamCell=(i,sub,sh)=>`<span class="team"><span class="badge">${abbr(i)}</span><span style="min-width:0;display:grid"><b>${esc(sh?short(i):NAME(i))}</b>${sub?`<small>${esc(sub)}</small>`:""}</span></span>`;

/* ---------------- live Sleeper ---------------- */
const ELIG={QB:['QB'],RB:['RB'],WR:['WR'],TE:['TE'],FLEX:['RB','WR','TE'],SUPER_FLEX:['QB','RB','WR','TE'],WRRB_FLEX:['RB','WR'],REC_FLEX:['WR','TE'],K:['K'],DEF:['DEF']};
const posOf=id=>PLAYERS&&PLAYERS[id]?PLAYERS[id][1]:null;
const nameOf=id=>PLAYERS&&PLAYERS[id]?PLAYERS[id][0]:("Player "+id);
function optimal(pp,slots){ if(!PLAYERS) return null; const pl=Object.entries(pp||{}).map(([id,v])=>({p:posOf(id),v})).sort((a,b)=>b.v-a.v); const used=new Set(); let tot=0;
  const order=[...slots].sort((a,b)=>(ELIG[a]||[]).length-(ELIG[b]||[]).length);
  for(const s of order){const e=ELIG[s]||[]; const i=pl.findIndex((x,k)=>!used.has(k)&&e.includes(x.p)); if(i>=0){used.add(i);tot+=pl[i].v;}} return +tot.toFixed(2); }
async function live(){
  const L=S.league;
  const [lg,users,rosters,tp,wb]=await Promise.all([j(API+"league/"+L),j(API+`league/${L}/users`),j(API+`league/${L}/rosters`),j(API+`league/${L}/traded_picks`),j(API+`league/${L}/winners_bracket`).catch(()=>[])]);
  const oi={}; S.owners.forEach((o,i)=>oi[o[0]]=i);
  users.forEach(u=>{ if(oi[u.user_id]==null){ oi[u.user_id]=S.owners.length; S.owners.push([u.user_id,u.display_name,(u.metadata&&u.metadata.team_name)||u.display_name]); } else { const o=S.owners[oi[u.user_id]]; o[1]=u.display_name; o[2]=(u.metadata&&u.metadata.team_name)||o[2]; } });
  const m={}; rosters.forEach(r=>m[r.roster_id]=oi[r.owner_id]);
  const pws=lg.settings.playoff_week_start, lastW=lg.settings.last_scored_leg||0, slots=lg.roster_positions.filter(p=>!['BN','IR','TAXI'].includes(p));
  const nW=Math.min(pws+2,18);
  const ms=await Promise.all(Array.from({length:nW},(_,i)=>j(API+`league/${L}/matchups/${i+1}`).catch(()=>[])));
  const old=S.cur&&+S.cur.season===+lg.season?S.cur.weeks:[];
  const weeks=ms.map((mm,i)=>(mm||[]).map(x=>{ const w=i+1, o=m[x.roster_id], played=w<=lastW; let opt=null;
    if(played){ opt=optimal(x.players_points,slots); if(opt==null){ const ow=(old[i]||[]).find(y=>y[0]===o); if(ow&&ow[2]!=null) opt=ow[2]; } }
    return [o,played?x.points:null,opt,x.matchup_id]; }));
  S.cur={season:+lg.season,pws,pteams:lg.settings.playoff_teams,lastW,weeks:weeks.slice(0,Math.max(pws-1,lastW))};
  S.curAll=weeks; // includes playoff weeks
  // bracket results already decided
  DECIDED={}; (wb||[]).forEach(b=>{ if(b.w!=null&&b.t1!=null&&b.t2!=null){ const a=m[b.t1],c=m[b.t2]; DECIDED[[a,c].sort().join('-')]=m[b.w]; } });
  // future pick ownership
  const season=+lg.season, fut={}; for(let y=season+1;y<=season+3;y++){ fut[y]={}; for(let r=1;r<=4;r++) fut[y][r]=Array.from({length:10},(_,i)=>i); }
  const ridOfOwner={}; Object.entries(m).forEach(([rid,o])=>ridOfOwner[o]=+rid);
  (tp||[]).forEach(t=>{ const y=+t.season; if(fut[y]&&fut[y][t.round]){ const o=m[t.roster_id], n=m[t.owner_id]; if(o!=null&&n!=null&&o<10) fut[y][t.round][o]=n; } });
  S.fut=fut;
  // rosters for dynasty values
  S.rosters={}; rosters.forEach(r=>{ S.rosters[m[r.roster_id]]=r.players||[]; });
  // new trades this season
  const have=new Set(S.trades.map(t=>t[2]));
  const txs=(await Promise.all(Array.from({length:18},(_,i)=>j(API+`league/${L}/transactions/${i+1}`).catch(()=>[])))).flat().filter(t=>t&&t.type==='trade'&&t.status==='complete');
  txs.forEach(t=>{ const ts=Math.round((t.status_updated||t.created)/1000); if(have.has(ts)) return; const sides={}; (t.roster_ids||[]).forEach(r=>sides[r]=[]);
    Object.entries(t.adds||{}).forEach(([p,r])=>(sides[r]=sides[r]||[]).push(`${nameOf(p)} (${posOf(p)||'?'})`));
    (t.draft_picks||[]).forEach(d=>{ const on=S.owners[m[d.roster_id]]?S.owners[m[d.roster_id]][1]:'?'; (sides[d.owner_id]=sides[d.owner_id]||[]).push(`${d.season} R${d.round} (${on})`); });
    S.trades.unshift([season,t.leg,ts,Object.entries(sides).map(([r,it])=>[m[r],0,it.join('; ')])]); });
  S.trades.sort((a,b)=>b[2]-a[2]);
  LIVE_OK=true; LIVE_AT=new Date();
}

/* ---------------- dynasty values ---------------- */
function ktcValue(name){ if(!KTCV) return null; return KTCV.map[norm(name)]||0; }
function itemValue(it){ // "Name (POS)", "2025 R1 → Name (POS)", "2028 R2 (handle)"
  let m=it.match(/^\d{4} R\d → (.+) \([A-Z]+\)$/); if(m) return ktcValue(m[1]);
  m=it.match(/^(\d{4}) R(\d) \(/); if(m){ const y=+m[1], r=+m[2]; return y>C.season? (KTCV.picks[`${y} Mid ${['1st','2nd','3rd','4th'][r-1]}`]||0) : 0; }
  m=it.match(/^(.+) \([A-Z?]+\)$/); if(m) return ktcValue(m[1]);
  return 0; }
function teamValues(){
  if(!(KTCV&&PLAYERS&&S.rosters)) return S.ktc.map(k=>({...k,value:k.adj,src:"snap"}));
  const pickV=(y,r)=>KTCV.picks[`${y} Mid ${['1st','2nd','3rd','4th'][r-1]}`]||0;
  const out=[]; for(let o=0;o<N;o++){ const ids=S.rosters[o]||[];
    const pl=ids.map(id=>{const p=PLAYERS[id]; if(!p) return null; const k=KTCV.byName[norm(p[0])]; return [p[0],p[1],k?Math.floor(k[1]):(p[3]||0),k?k[0]:0];}).filter(x=>x&&['QB','RB','WR','TE'].includes(x[1])).sort((a,b)=>b[3]-a[3]);
    const pos={QB:0,RB:0,WR:0,TE:0,PICK:0}; pl.forEach(p=>pos[p[1]]+=p[3]);
    Object.keys(S.fut).forEach(y=>[1,2,3,4].forEach(r=>S.fut[y][r].forEach((own,orig)=>{ if(own===o) pos.PICK+=pickV(y,r); })));
    const top=pl.slice(0,20); const age=top.length?mean(top.map(p=>p[2])):0;
    // lineup-weighted value: starters count fully, depth at a quarter, picks fully
    const need={QB:2,RB:2,WR:3,TE:1}; const used=new Set(); let lineup=0;
    Object.entries(need).forEach(([ps,n])=>{ pl.filter((p,i)=>p[1]===ps&&!used.has(i)).slice(0,n).forEach(p=>{used.add(pl.indexOf(p)); lineup+=p[3];}); });
    pl.filter((p,i)=>!used.has(i)&&p[1]!=='QB').slice(0,2).forEach(p=>{used.add(pl.indexOf(p)); lineup+=p[3];});
    const depth=pl.filter((p,i)=>!used.has(i)).reduce((s,p)=>s+p[3],0)*0.25;
    out.push({o,value:Math.round(lineup+depth+pos.PICK*0.6),total:Math.round(pl.reduce((s,p)=>s+p[3],0)+pos.PICK),age,pos,young:pl.filter(p=>p[2]<=25).slice(0,3),src:"live"}); }
  out.sort((a,b)=>b.value-a.value).forEach((k,i)=>k.rank=i+1); return out; }

/* ---------------- season math ---------------- */
function season(){
  const rec=Array.from({length:N},()=>({w:0,l:0,t:0,pf:0,pa:0,pts:[],act:0,opt:0,ap:[0,0],weeks:[]})); const games=[];
  for(let wi=0;wi<C.weeks.length;wi++){const w=wi+1; if(w>C.lastW||w>REG) continue; const wk=C.weeks[wi]; const by={};
    wk.forEach(([o,p,op,m])=>{ if(p==null||o==null||o>=N) return; const r=rec[o]; r.pf+=p; r.pts.push(p); r.weeks.push([w,p,op]); if(op!=null){r.act+=p; r.opt+=op;} (by[m]=by[m]||[]).push([o,p]); });
    Object.entries(by).forEach(([m,pr])=>{ if(pr.length!==2) return; const [a,b]=pr; rec[a[0]].pa+=b[1]; rec[b[0]].pa+=a[1];
      if(a[1]>b[1]){rec[a[0]].w++;rec[b[0]].l++} else if(b[1]>a[1]){rec[b[0]].w++;rec[a[0]].l++} else {rec[a[0]].t++;rec[b[0]].t++}
      games.push({w,m:+m,a:a[0],as:a[1],b:b[0],bs:b[1]}); });
    const sc=wk.filter(x=>x[1]!=null&&x[0]<N); sc.forEach(([o,p])=>sc.forEach(([o2,p2])=>{ if(o2!==o){ if(p>p2) rec[o].ap[0]++; else if(p<p2) rec[o].ap[1]++; }}));
  } return {rec,games}; }
function erf(x){const t=1/(1+0.3275911*Math.abs(x)); const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x); return x>=0?y:-y;}
const winProb=(a,b)=>0.5*(1+erf((MODEL.mu[a]-MODEL.mu[b])/(MODEL.sd*Math.SQRT2)/Math.SQRT2));
function gauss(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
function simulate(forced,NS,draft){ NS=NS||8000; const out=Array.from({length:N},()=>({po:0,bye:0,top:0,last:0,wins:0,slots:new Array(N).fill(0)}));
  const baseW=SEA.rec.map(r=>r.w+r.t/2), baseP=SEA.rec.map(r=>r.pf);
  const W=new Float64Array(N), P=new Float64Array(N), MX=new Float64Array(N), idx=[...Array(N).keys()];
  const play=(a,b)=>{ const d=DECIDED[[a,b].sort().join('-')]; if(d!=null) return d===a?[a,b]:[b,a]; const sa=MODEL.mu[a]+gauss()*MODEL.sd, sb=MODEL.mu[b]+gauss()*MODEL.sd; return sa>=sb?[a,b]:[b,a]; };
  for(let s=0;s<NS;s++){ for(let i=0;i<N;i++){W[i]=baseW[i];P[i]=baseP[i];MX[i]=OPT0[i];}
    for(const g of REMAIN){ const f=forced[g.key]; let sa,sb;
      if(f!=null){ sa=MODEL.mu[g.a]; sb=MODEL.mu[g.b]; if(f===g.a){W[g.a]++} else {W[g.b]++} }
      else { sa=MODEL.mu[g.a]+gauss()*MODEL.sd; sb=MODEL.mu[g.b]+gauss()*MODEL.sd; if(sa>sb)W[g.a]++; else W[g.b]++; }
      P[g.a]+=sa; P[g.b]+=sb; MX[g.a]+=sa+GAP[g.a]; MX[g.b]+=sb+GAP[g.b]; }
    idx.sort((a,b)=>W[b]-W[a]||P[b]-P[a]);
    idx.forEach((t,r)=>{ const o=out[t]; o.wins+=W[t]; if(r<PT)o.po++; if(r<2)o.bye++; if(r===0)o.top++; if(r===N-1)o.last++; });
    if(draft){ const sd=idx.slice(0,PT), byMx=(a,b)=>MX[a]-MX[b];
      const r1a=play(sd[3],sd[4]), r1b=play(sd[2],sd[5]); const r2a=play(sd[0],r1a[0]), r2b=play(sd[1],r1b[0]); const fin=play(r2a[0],r2b[0]);
      [...idx.slice(PT).sort(byMx),...[r1a[1],r1b[1]].sort(byMx),...[r2a[1],r2b[1]].sort(byMx),fin[1],fin[0]].forEach((t,k)=>out[t].slots[k]++); } }
  out.forEach(o=>{o.po/=NS;o.bye/=NS;o.top/=NS;o.last/=NS;o.wins/=NS;o.slots=o.slots.map(x=>x/NS);o.avg=o.slots.reduce((a,p,k)=>a+p*(k+1),0)}); return out; }
function tradeNet(t){ const sides=t[3]; return sides.map((s,i)=>s[1]-mean(sides.filter((_,j)=>j!==i).map(x=>x[1]))); }
function compute(){
  C=S.cur; REG=C.pws-1; PT=C.pteams;
  SEA=season(); STAND=[...Array(N).keys()].sort((a,b)=>(SEA.rec[b].w+SEA.rec[b].t/2)-(SEA.rec[a].w+SEA.rec[a].t/2)||SEA.rec[b].pf-SEA.rec[a].pf);
  REMAIN=[]; for(let w=C.lastW+1; w<=REG; w++){ const wk=C.weeks[w-1]; if(!wk) continue; const by={}; wk.forEach(([o,p,op,m])=>{(by[m]=by[m]||[]).push(o)}); Object.entries(by).forEach(([m,pr])=>{ if(pr.length===2) REMAIN.push({w,m:+m,a:pr[0],b:pr[1],key:w+"-"+m}); }); }
  NEXTW=C.lastW+1<=REG?C.lastW+1:null;
  const all=SEA.rec.flatMap(r=>r.pts); const lm=mean(all)||120; let ss=0,n=0; SEA.rec.forEach(r=>{const mm=mean(r.pts); r.pts.forEach(x=>{ss+=(x-mm)**2;n++})});
  MODEL={lm,sd:Math.max(18,Math.sqrt(ss/Math.max(1,n-N))||30),mu:SEA.rec.map(r=>(r.pts.length*mean(r.pts)+3*lm)/(r.pts.length+3))};
  GAP=SEA.rec.map(r=>{const g=r.weeks.filter(x=>x[2]!=null).map(x=>x[2]-x[1]);return g.length?mean(g):15;});
  OPT0=SEA.rec.map(r=>r.weeks.reduce((s,x)=>s+(x[2]!=null?x[2]:x[1]),0));
  BASE=simulate({},12000,true); DORDER=[...Array(N).keys()].sort((a,b)=>BASE[a].avg-BASE[b].avg);
  const tv=teamValues(); KT={}; tv.forEach(k=>KT[k.o]=k); S.tv=tv;
  const posRank=pos=>{const arr=[...Array(N).keys()].sort((a,b)=>KT[b].pos[pos]-KT[a].pos[pos]); const r={}; arr.forEach((t,i)=>r[t]=i+1); return r;};
  PR={QB:posRank('QB'),RB:posRank('RB'),WR:posRank('WR'),TE:posRank('TE'),PICK:posRank('PICK')};
  const joke=new Set(S.jokeTs);
  TRADES=S.trades.filter(t=>t[3].length>=2&&!joke.has(t[2])).map(t=> KTCV ? [t[0],t[1],t[2],t[3].map(s=>[s[0],s[2]?s[2].split('; ').reduce((a,it)=>a+itemValue(it),0):0,s[2]])] : t);
}
function windowOf(i){ const k=KT[i]; if(k.rank<=5&&k.age>=27.5) return 'All-in'; if(k.rank<=4) return 'Contend'; if(k.rank>=8&&PR.PICK[i]<=3) return 'Rebuild'; return 'Retool'; }
const pillOf=w=>`<span class="pill p-${w.toLowerCase().replace(/[^a-z]/g,'')}">${w}</span>`;
const WCOL={"All-in":"var(--turf)","Contend":"var(--blue)","Retool":"var(--amber-hi)","Rebuild":"var(--bad)"};
function bar(p,cls){const on=p>=0.7&&cls!=='amber';return `<span class="pct ${cls||''}"><i style="width:${Math.max(0,Math.min(100,p*100))}%"></i><em style="${on?'color:var(--turf-ink)':''}">${pctS(p)}</em></span>`;}
function lockTime(w){ return S.locks[w]||Infinity; }

/* ---------------- tabs ---------------- */
const TABS=[["week","This Week"],["odds","Playoff Odds"],["luck","Luck & Lineups"],["trades","Trade Ledger"],["dynasty","Dynasty"],["history","History"],["whatif","What Ifs"],["pickem","Pick'em"],["polls","Polls"],["block","Trade Block"],["commish","Commish"]];
const R={};
function current(){ const h=(location.hash||"").slice(1); return TABS.some(t=>t[0]===h)?h:"week"; }
function renderNav(){ const cur=current(); $('tabs').innerHTML=TABS.map(([id,l])=>`<a href="#${id}" ${id===cur?'aria-current="page"':''}>${l}${(id==='pickem'&&NEXTW&&Date.now()<lockTime(NEXTW))?'<span class="dot" title="Picks open"></span>':''}</a>`).join(""); }
function show(){ if(!S) return; renderNav(); const cur=current(); const m=$('main'); m.innerHTML=`<section class="panel" id="p-${cur}"></section>`; try{ R[cur]($('p-'+cur)); }catch(e){ console.error(e); m.innerHTML=`<div class="notice">Something went wrong drawing this tab. Reload the page to try again.</div>`; } }
window.addEventListener('hashchange',()=>{show(); window.scrollTo({top:0});});
function header(){ const top=STAND[0];
  $('scorebug').innerHTML=`<div><b>${C.season}</b><span>Season</span></div><div><b>${NEXTW?('WK '+NEXTW):'POST'}</b><span>Up next</span></div><div><b>${abbr(top)}</b><span>No. 1 seed</span></div>`;
  const kd=KTCV?new Date(KTCV.gen):new Date(S.gen);
  $('fresh').textContent=(LIVE_OK?`Live from Sleeper · results through Week ${C.lastW}`:(LIVE_ERR?`Couldn't reach Sleeper, showing saved results through Week ${C.lastW}`:`Results through Week ${C.lastW}`))+` · KeepTradeCut values from ${kd.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
  $('foot').innerHTML=`SPDL league hub · Results live from Sleeper, dynasty values from KeepTradeCut (superflex, refreshed daily). Playoff odds and draft order simulate the rest of the season 12,000 times.`; }

/* ---------------- THIS WEEK ---------------- */
R.week=function(el){ const rec=SEA.rec; let html=`<div class="h-row"><div><div class="kicker">${NEXTW?`Week ${NEXTW} · ${C.season}`:'Regular season complete'}</div><h2>This Week</h2></div></div>`;
  if(NEXTW){ const gs=REMAIN.filter(g=>g.w===NEXTW);
    html+=`<div class="grid2">${gs.map(g=>{const p=winProb(g.a,g.b); return `<div class="card"><div class="mu">
      <div class="side">${teamCell(g.a,`${rec[g.a].w}-${rec[g.a].l} · ${pctS(BASE[g.a].po)} playoffs`,true)}</div><div class="vs">VS</div>
      <div class="side r">${teamCell(g.b,`${rec[g.b].w}-${rec[g.b].l} · ${pctS(BASE[g.b].po)} playoffs`,true)}</div></div>
      <div class="wp"><i style="width:${p*100}%"></i><i style="width:${(1-p)*100}%"></i></div>
      <div class="wp-l"><span>${pctS(p)} · proj ${f1(MODEL.mu[g.a])}</span><span>proj ${f1(MODEL.mu[g.b])} · ${pctS(1-p)}</span></div>
      <div class="note" style="margin-top:6px" data-pk="${g.key}"></div></div>`}).join("")}</div>
      <p class="note">Win chances come from each team's scoring this season, pulled toward the league average early on. <a href="#pickem">Make your picks</a> before Thursday kickoff.</p>`; }
  const lw=C.lastW, gl=SEA.games.filter(g=>g.w===lw);
  if(gl.length){ const sc=C.weeks[lw-1].filter(x=>x[1]!=null&&x[0]<N);
    const hi=sc.reduce((a,b)=>b[1]>a[1]?b:a), lo=sc.reduce((a,b)=>b[1]<a[1]?b:a);
    const marg=gl.map(g=>({...g,mg:Math.abs(g.as-g.bs)})); const blow=marg.reduce((a,b)=>b.mg>a.mg?b:a), close=marg.reduce((a,b)=>b.mg<a.mg?b:a);
    const bench=sc.filter(x=>x[2]!=null).map(x=>[x[0],x[2]-x[1]]).sort((a,b)=>b[1]-a[1])[0];
    const Wn=g=>g.as>g.bs?[g.a,g.b,g.as,g.bs]:[g.b,g.a,g.bs,g.as]; const bw=Wn(blow), cw=Wn(close);
    html+=`<div class="h-row"><h3>Week ${lw} in review</h3></div><div class="grid3">${award("Top score",hi[0],f2(hi[1])+" points")}${award("Low score",lo[0],f2(lo[1])+" points")}${award("Biggest blowout",bw[0],`${f2(bw[2])}–${f2(bw[3])} over ${short(bw[1])}`)}${award("Closest game",cw[0],`${f2(cw[2])}–${f2(cw[3])} over ${short(cw[1])}`)}${bench?award("Left on the bench",bench[0],f2(bench[1])+" points short of the best lineup"):""}</div>
    <div class="card"><div class="tw"><table><thead><tr><th>Week ${lw} results</th><th class="r">Score</th><th></th><th>Opponent</th><th class="r">Score</th></tr></thead><tbody>${gl.map(g=>{const [w,l,ws,ls]=Wn(g);return `<tr><td>${teamCell(w)}</td><td class="r num"><b>${f2(ws)}</b></td><td class="muted">def.</td><td>${teamCell(l)}</td><td class="r num">${f2(ls)}</td></tr>`}).join("")}</tbody></table></div></div>`; }
  html+=`<div class="h-row"><h3>Standings</h3><a class="note" href="#odds">Full playoff odds →</a></div><div class="card tw">${standingsTable()}</div>`;
  el.innerHTML=html; fillPickCounts(el); };
function award(t,i,d){return `<div class="card"><div class="kicker" style="font-size:12px">${t}</div><div style="margin-top:6px">${teamCell(i)}</div><div class="note" style="margin-top:6px">${esc(d)}</div></div>`;}
function standingsTable(){ const rec=SEA.rec;
  return `<table><thead><tr><th>#</th><th>Team</th><th class="r">W-L</th><th class="r">PF</th><th class="r">PA</th><th class="r">Playoffs</th></tr></thead><tbody>
  ${STAND.map((t,i)=>{const r=rec[t],b=BASE[t]; return `<tr class="${i===PT-1?'cut':''} ${t===MY_TEAM?'me':''}"><td class="num muted">${i+1}</td><td>${teamCell(t,HANDLE(t))}</td><td class="r num"><b>${r.w}-${r.l}${r.t?'-'+r.t:''}</b></td><td class="r num">${f2(r.pf)}</td><td class="r num muted">${f2(r.pa)}</td><td class="r">${bar(b.po)}</td></tr>`}).join("")}</tbody></table>`; }

/* ---------------- PLAYOFF ODDS ---------------- */
let FORCED={};
R.odds=function(el){
  el.innerHTML=`<div class="h-row"><div><div class="kicker">${REMAIN.length} games left · top ${PT} make it, top 2 get byes</div><h2>Playoff Odds</h2></div><button class="btn" id="wif-reset" ${Object.keys(FORCED).length?'':'disabled'}>Clear my picks</button></div>
    <p class="lead">Every remaining regular-season game is simulated 12,000 times. Pick winners below to see how the race changes.</p>
    <div class="card tw" id="odds-table"></div><div class="h-row"><h3>What if…</h3><span class="note">Tap a team to make them win that game. Tap again to undo.</span></div><div class="card"><div class="wif" id="wif"></div></div>`;
  const draw=()=>{ const has=Object.keys(FORCED).length; const res=has?simulate(FORCED,8000):BASE; const rec=SEA.rec;
    const ord=[...Array(N).keys()].sort((a,b)=>res[b].po-res[a].po||res[b].wins-res[a].wins);
    $('odds-table').innerHTML=`<table><thead><tr><th>Team</th><th class="r">Now</th><th class="r">Proj W</th><th class="r">Playoffs</th>${has?'<th class="r">Change</th>':''}<th class="r">Bye</th><th class="r">No. 1 seed</th><th class="r">Last place</th></tr></thead><tbody>${ord.map(t=>{const r=res[t],b=BASE[t],d=r.po-b.po;return `<tr class="${t===MY_TEAM?'me':''}"><td>${teamCell(t,`${f1(MODEL.mu[t])} proj pts/wk`)}</td><td class="r num">${rec[t].w}-${rec[t].l}</td><td class="r num">${f1(r.wins)}</td><td class="r">${bar(r.po)}</td>${has?`<td class="r num ${d>0.005?'up':d<-0.005?'down':'muted'}">${Math.abs(d)<0.005?'—':(d>0?'+':'−')+Math.round(Math.abs(d)*100)}</td>`:''}<td class="r">${bar(r.bye,'amber')}</td><td class="r num">${pctS(r.top)}</td><td class="r num muted">${pctS(r.last)}</td></tr>`}).join("")}</tbody></table>`;
    $('wif-reset').disabled=!has; };
  const wk={}; REMAIN.forEach(g=>(wk[g.w]=wk[g.w]||[]).push(g));
  $('wif').innerHTML=Object.keys(wk).length?Object.entries(wk).map(([w,gs])=>`<div class="wk"><h4>Week ${w}</h4>${gs.map(g=>{const p=winProb(g.a,g.b);return `<div class="g"><button data-k="${g.key}" data-t="${g.a}" aria-pressed="${FORCED[g.key]===g.a}"><span>${esc(short(g.a))}</span><small>${pctS(p)}</small></button><button data-k="${g.key}" data-t="${g.b}" aria-pressed="${FORCED[g.key]===g.b}"><span>${esc(short(g.b))}</span><small>${pctS(1-p)}</small></button></div>`}).join("")}</div>`).join(""):'<div class="empty">The regular season is over.</div>';
  let tmr=null;
  $('wif').addEventListener('click',e=>{const b=e.target.closest('button'); if(!b) return; const k=b.dataset.k, t=+b.dataset.t; if(FORCED[k]===t) delete FORCED[k]; else FORCED[k]=t;
    b.parentElement.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(FORCED[k]===+x.dataset.t))); clearTimeout(tmr); tmr=setTimeout(draw,60); });
  $('wif-reset').addEventListener('click',()=>{FORCED={}; R.odds(el);}); draw(); };

/* ---------------- LUCK ---------------- */
R.luck=function(el){ const rec=SEA.rec;
  const rows=[...Array(N).keys()].map(t=>{const r=rec[t]; const apg=r.ap[0]+r.ap[1]; const exp=apg?r.ap[0]/apg*(r.w+r.l+r.t):0; return {t,r,exp,luck:(r.w+r.t/2)-exp,eff:r.opt?r.act/r.opt:null,lost:r.opt-r.act};});
  const byLuck=[...rows].sort((a,b)=>b.luck-a.luck); const maxL=Math.max(...rows.map(x=>Math.abs(x.luck)),1);
  const worst=[]; rec.forEach((r,t)=>r.weeks.forEach(([w,p,op])=>{if(op!=null)worst.push([t,w,op-p,p,op])})); worst.sort((a,b)=>b[2]-a[2]);
  const at=S.at.map((a,i)=>({i,eff:a.opt?a.pts/a.opt:0,a})).filter(x=>x.i<N).sort((a,b)=>b.eff-a.eff);
  el.innerHTML=`<div class="h-row"><div><div class="kicker">Weeks 1–${C.lastW}</div><h2>Luck &amp; Lineups</h2></div></div>
  <p class="lead">Expected wins treat every week as if you played all nine other teams. The gap between that and your real record is schedule luck. Lineup efficiency compares the points you started with the best lineup you could have set.</p>
  <div class="grid2"><div class="card"><h3 style="margin-bottom:10px">Schedule luck</h3>
    ${byLuck.map(x=>{const w=Math.abs(x.luck)/maxL*50;return `<div style="display:grid;grid-template-columns:minmax(0,1fr) 120px 52px;gap:10px;align-items:center;padding:5px 0;border-bottom:1px solid var(--line)"><div>${teamCell(x.t,`${x.r.w}-${x.r.l} actual · ${f1(x.exp)} expected · all-play ${x.r.ap[0]}-${x.r.ap[1]}`)}</div>
      <div style="position:relative;height:14px;background:var(--sunk);border-radius:3px"><span style="position:absolute;top:0;bottom:0;${x.luck>=0?`left:50%;width:${w}%;background:var(--good)`:`right:50%;width:${w}%;background:var(--bad)`};border-radius:2px;opacity:.85"></span><span style="position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:var(--ink)"></span></div>
      <div class="num ${x.luck>=0?'up':'down'}" style="text-align:right;font-weight:600">${x.luck>=0?'+':'−'}${f1(Math.abs(x.luck))}</div></div>`}).join("")}<p class="note" style="margin-top:8px">Green = more wins than the scoring earned. Red = fewer.</p></div>
  <div class="card"><h3 style="margin-bottom:10px">Lineup grades</h3><div class="tw"><table><thead><tr><th>Team</th><th class="r">Efficiency</th><th class="r">Bench pts lost</th><th class="r">Perfect weeks</th></tr></thead><tbody>
    ${[...rows].sort((a,b)=>(b.eff||0)-(a.eff||0)).map(x=>{const perfect=x.r.weeks.filter(([w,p,op])=>op!=null&&op-p<0.5).length;return `<tr class="${x.t===MY_TEAM?'me':''}"><td>${teamCell(x.t)}</td><td class="r">${x.eff==null?'<span class="muted">—</span>':bar(x.eff,'amber')}</td><td class="r num">${f1(x.lost)}</td><td class="r num">${perfect}</td></tr>`}).join("")}</tbody></table></div></div></div>
  <div class="grid2"><div class="card"><h3 style="margin-bottom:10px">Worst lineup calls this season</h3><div class="tw"><table><thead><tr><th>Team</th><th class="r">Week</th><th class="r">Scored</th><th class="r">Best possible</th><th class="r">Left</th></tr></thead><tbody>
    ${worst.slice(0,8).map(([t,w,d,p,op])=>`<tr><td>${teamCell(t)}</td><td class="r num">${w}</td><td class="r num">${f2(p)}</td><td class="r num">${f2(op)}</td><td class="r num down">${f1(d)}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="card"><h3 style="margin-bottom:10px">All-time lineup efficiency</h3><div class="tw"><table><thead><tr><th>Manager</th><th class="r">Seasons</th><th class="r">Efficiency</th></tr></thead><tbody>
    ${at.map(x=>`<tr><td>${teamCell(x.i,HANDLE(x.i))}</td><td class="r num">${x.a.seasons}</td><td class="r">${bar(x.eff,'amber')}</td></tr>`).join("")}</tbody></table></div><p class="note">Regular-season weeks, 2020 through Oct. 2026.</p></div></div>`; };

/* ---------------- TRADES ---------------- */
let TF={season:"all",team:"all",n:30};
R.trades=function(el){ const seasons=[...new Set(TRADES.map(t=>t[0]))].sort((a,b)=>b-a);
  const inS=t=>TF.season==="all"||t[0]==+TF.season; const list=TRADES.filter(t=>inS(t)&&(TF.team==="all"||t[3].some(s=>s[0]==+TF.team)));
  const tot=Array.from({length:S.owners.length},()=>({net:0,n:0,won:0})); TRADES.filter(inS).forEach(t=>{const nets=tradeNet(t); t[3].forEach((s,i)=>{tot[s[0]].net+=nets[i];tot[s[0]].n++; if(nets[i]>0)tot[s[0]].won++;});});
  const board=[...Array(S.owners.length).keys()].filter(i=>tot[i].n).sort((a,b)=>tot[b].net-tot[a].net);
  const heists=TRADES.filter(inS).map(t=>{const n=tradeNet(t);const i=n.indexOf(Math.max(...n));return {t,i,v:n[i]}}).sort((a,b)=>b.v-a.v).slice(0,3);
  el.innerHTML=`<div class="h-row"><div><div class="kicker">${TRADES.length} trades since 2020</div><h2>Trade Ledger</h2></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><label>Season<select id="tf-s"><option value="all">All seasons</option>${seasons.map(s=>`<option ${TF.season==s?'selected':''}>${s}</option>`).join("")}</select></label>
    <label>Team<select id="tf-t"><option value="all">All teams</option>${[...Array(S.owners.length).keys()].map(i=>`<option value="${i}" ${TF.team==i?'selected':''}>${esc(NAME(i))}</option>`).join("")}</select></label></div></div>
  <p class="lead">Every trade is graded with today's KeepTradeCut superflex values, so the ledger shows how deals have aged. Unmade picks count at mid-round value; drafted picks count as the player taken. Trades that were traded right back are left out and listed at the bottom.</p>
  <div class="grid2"><div class="card"><h3 style="margin-bottom:10px">Best traders ${TF.season==='all'?'all-time':TF.season}</h3><div class="tw"><table><thead><tr><th>Manager</th><th class="r">Trades</th><th class="r">Won</th><th class="r">Net KTC</th></tr></thead><tbody>
    ${board.map(i=>`<tr class="${i===MY_TEAM?'me':''}"><td>${teamCell(i,HANDLE(i))}</td><td class="r num">${tot[i].n}</td><td class="r num">${tot[i].won}</td><td class="r num ${tot[i].net>=0?'up':'down'}"><b>${sgn(tot[i].net)}</b></td></tr>`).join("")}</tbody></table></div></div>
  <div class="card"><h3 style="margin-bottom:10px">Biggest heists</h3>${heists.map(h=>{const it=(h.t[3][h.i][2]||'nothing').split('; ');return `<div style="padding:8px 0;border-bottom:1px solid var(--line)">${teamCell(h.t[3][h.i][0],`${h.t[0]} · Week ${h.t[1]} · ${sgn(h.v)} KTC`)}<div class="note" style="margin-top:4px">Got ${esc(it.slice(0,4).join('; '))}${it.length>4?` and ${it.length-4} more`:''}</div></div>`}).join("")}</div></div>
  <div id="tl" style="display:grid;gap:12px">${list.length?list.slice(0,TF.n).map(tradeCard).join(""):'<div class="empty">No trades match these filters.</div>'}</div>
  <div style="text-align:center"><button class="btn" id="tl-more" ${list.length>TF.n?'':'hidden'}>Show more trades</button></div>
  <details class="card"><summary style="cursor:pointer"><h3 style="display:inline">Traded right back (${S.tradedBack.length})</h3> <span class="note">Joke trades undone within the hour. Not counted anywhere above.</span></summary>
  <div class="tw" style="margin-top:10px"><table><thead><tr><th>Date</th><th>Team</th><th>Got</th><th>Team</th><th>Got</th><th class="r">Undone after</th></tr></thead><tbody>${S.tradedBack.map(r=>`<tr><td class="muted" style="white-space:nowrap">${r[0]}</td><td>${teamCell(r[1],HANDLE(r[1]),true)}</td><td style="font-size:13px">${esc(r[2])}</td><td>${teamCell(r[3],HANDLE(r[3]),true)}</td><td style="font-size:13px">${esc(r[4])}${r[6]?`<div class="note">${esc(r[6])}</div>`:''}</td><td class="r num">${r[5]}</td></tr>`).join("")}</tbody></table></div></details>`;
  $('tf-s').onchange=e=>{TF.season=e.target.value;TF.n=30;R.trades(el)}; $('tf-t').onchange=e=>{TF.team=e.target.value;TF.n=30;R.trades(el)};
  const more=$('tl-more'); if(more) more.onclick=()=>{TF.n+=30;R.trades(el)}; };
function tradeCard(t){ const nets=tradeNet(t); const best=Math.max(...nets); const d=new Date(t[2]*1000);
  return `<div class="card trade"><div class="meta"><span>${d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · ${t[0]} season${t[1]>1?`, Week ${t[1]}`:''}</span><span>${t[3].length}-team trade</span></div>
  <div class="sides">${t[3].map((s,i)=>`<div class="side ${nets[i]===best&&best>0?'won':''}">${teamCell(s[0])}<div class="note">received</div><ul>${s[2]?s[2].split('; ').map(x=>`<li>${esc(x)}</li>`).join(""):'<li class="muted">Nothing listed</li>'}</ul><div class="val"><span>KTC today <b>${f0(s[1])}</b></span><b class="${nets[i]>0?'up':nets[i]<0?'down':'muted'}">${sgn(nets[i])}</b></div></div>`).join("")}</div></div>`; }

/* ---------------- DYNASTY ---------------- */
R.dynasty=function(el){ const rec=SEA.rec; const ppg=t=>rec[t].pts.length?mean(rec[t].pts):0; const rows=[...S.tv].sort((a,b)=>a.rank-b.rank);
  const rk=n=>`<span class="num ${n<=3?'up':n>=8?'down':''}" style="font-weight:600">${n}</span>`; const f27=S.fut[C.season+1]||S.fut[String(C.season+1)];
  el.innerHTML=`<div class="h-row"><div><div class="kicker">KeepTradeCut superflex values</div><h2>Dynasty</h2></div></div>
  <p class="lead">${rows[0].src==='live'?'Team value weights each roster\'s best lineup fully, depth at a quarter and picks at 60%, using current KTC values.':'Team value is KTC\'s adjusted total for each roster plus its picks.'} Positional columns rank each room against the league (1 is best). Windows: All-in = top-five value with an older roster, Contend = top four, Rebuild = bottom three with a top-three pick haul, Retool = everyone else.</p>
  <div class="card tw"><table><thead><tr><th>#</th><th>Team</th><th>Window</th><th class="r">Value</th><th class="r">QB</th><th class="r">RB</th><th class="r">WR</th><th class="r">TE</th><th class="r">Picks</th><th class="r">Avg age</th><th>Young core</th></tr></thead><tbody>
  ${rows.map(k=>`<tr class="${k.o===MY_TEAM?'me':''}"><td class="num muted">${k.rank}</td><td class="tc">${teamCell(k.o)}</td><td>${pillOf(windowOf(k.o))}</td><td class="r num"><b>${f0(k.value)}</b></td><td class="r">${rk(PR.QB[k.o])}</td><td class="r">${rk(PR.RB[k.o])}</td><td class="r">${rk(PR.WR[k.o])}</td><td class="r">${rk(PR.TE[k.o])}</td><td class="r">${rk(PR.PICK[k.o])}</td><td class="r num">${(+k.age).toFixed(1)}</td><td style="font-size:13px;min-width:220px">${k.young.map(y=>`<span class="chip">${esc(y[0])} <span class="muted">${y[1]} ${y[2]}</span></span>`).join("")}</td></tr>`).join("")}</tbody></table></div>
  <div class="card"><h3>Now vs. later</h3><p class="note" style="margin:4px 0 8px">${C.season} points per game against team value. Top right is strong now and later.</p><div class="lg">${['All-in','Contend','Retool','Rebuild'].map(w=>`<span><i style="background:${WCOL[w]}"></i>${w}</span>`).join("")}</div>${scatter(ppg)}</div>
  <div class="grid2"><div class="card"><h3 style="margin-bottom:8px">Pick ownership</h3><p class="note" style="margin:0 0 8px">First- and second-round picks each team holds. Amber chips came from another team.</p><div class="tw"><table><thead><tr><th>Team</th>${Object.keys(S.fut).map(y=>`<th>${y}</th>`).join("")}</tr></thead><tbody>
    ${[...Array(N).keys()].sort((a,b)=>KT[a].rank-KT[b].rank).map(t=>`<tr class="${t===MY_TEAM?'me':''}"><td><span class="tshort"><span class="badge">${abbr(t)}</span>${esc(short(t))}</span></td>${Object.keys(S.fut).map(y=>`<td style="min-width:120px">${picksHeld(t,y)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
  <div class="card"><h3 style="margin-bottom:8px">Projected ${C.season+1} order</h3><p class="note" style="margin:0 0 8px">SPDL rules: the four non-playoff teams pick 1–4 by lowest max PF, then first-round playoff losers, then semifinal losers (each pair by max PF), then the runner-up, then the champion. Simulated through the playoffs 12,000 times.</p><div class="tw"><table><thead><tr><th>Proj.</th><th>Original team</th><th class="r">Avg slot</th><th class="r">Top 4</th><th class="r">1.01</th><th>1st owner</th><th>2nd owner</th></tr></thead><tbody>
    ${DORDER.map((t,i)=>{const b=BASE[t]; const top4=b.slots.slice(0,4).reduce((a,x)=>a+x,0); const o1=f27?f27[1][t]:t, o2=f27?f27[2][t]:t; return `<tr class="${(o1===MY_TEAM||o2===MY_TEAM)?'me':''}"><td class="num"><b>1.${String(i+1).padStart(2,'0')}</b></td><td>${teamCell(t,null,true)}</td><td class="r num">${b.avg.toFixed(1)}</td><td class="r num">${pctS(top4)}</td><td class="r num">${pctS(b.slots[0])}</td><td>${o1===t?'<span class="muted">Own</span>':`<span class="chip from">${esc(short(o1))}</span>`}</td><td>${o2===t?'<span class="muted">Own</span>':`<span class="chip from">${esc(short(o2))}</span>`}</td></tr>`}).join("")}</tbody></table></div></div></div>
  <div class="card"><h3>${C.season+1} rookie mock draft</h3><p class="note" style="margin:4px 0 10px">Two rounds made Oct. 29, 2026 in the projected order at the time, from the Footballguys Superflex Big Board 4.0 and RotoBaller's 2QB mock, adjusted for each roster's needs.</p><div class="tw"><table><thead><tr><th>Pick</th><th>Team</th><th>Player</th><th>Pos</th><th>School</th></tr></thead><tbody>
    ${S.mock.map(m=>`<tr class="${m[1]===MY_TEAM?'me':''}"><td class="num"><b>${m[0]}</b></td><td>${teamCell(m[1],m[2])}</td><td><b>${esc(m[3])}</b></td><td><span class="chip">${m[4]}</span></td><td class="muted">${esc(m[5])}</td></tr>`).join("")}</tbody></table></div></div>`; };
function picksHeld(t,y){ const out=[]; [1,2].forEach(r=>{ S.fut[y][r].forEach((own,orig)=>{ if(own===t) out.push(`<span class="chip ${orig===t?'':'from'}">R${r}${orig===t?'':' · '+esc(abbr(orig))}</span>`); }); }); return out.join("")||'<span class="muted">—</span>'; }
function scatter(ppg){ const W=720,H=360,l=60,r=700,tp=20,b=310; const xs=[...Array(N).keys()].map(ppg), ys=S.tv.map(k=>k.value/1000);
  const xmin=Math.floor((Math.min(...xs)-8)/10)*10, xmax=Math.ceil((Math.max(...xs)+8)/10)*10, ymin=Math.floor(Math.min(...ys)-1), ymax=Math.ceil(Math.max(...ys)+1);
  const X=v=>l+(v-xmin)/(xmax-xmin)*(r-l), Y=v=>b-(v-ymin)/(ymax-ymin)*(b-tp); const step=Math.max(1,Math.round((ymax-ymin)/7));
  const mx=X(mean(xs)), my=Y(mean(ys)); let s=`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Points per game against team value"><rect x="${mx}" y="${tp}" width="${r-mx}" height="${my-tp}" style="fill:var(--good-bg)"/>`;
  for(let v=Math.ceil(ymin);v<=ymax;v+=step) s+=`<line x1="${l}" x2="${r}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--line)"/><text x="${l-8}" y="${Y(v)+4}" text-anchor="end" font-size="11" style="fill:var(--muted)">${v}k</text>`;
  for(let v=xmin;v<=xmax;v+=10) s+=`<text x="${X(v)}" y="${b+18}" text-anchor="middle" font-size="11" style="fill:var(--muted)">${v}</text>`;
  s+=`<line x1="${mx}" x2="${mx}" y1="${tp}" y2="${b}" style="stroke:var(--muted)" stroke-dasharray="4 4"/><line x1="${l}" x2="${r}" y1="${my}" y2="${my}" style="stroke:var(--muted)" stroke-dasharray="4 4"/><text x="${(l+r)/2}" y="${b+40}" text-anchor="middle" font-size="12" style="fill:var(--muted)">Points per game →</text><text transform="translate(16 ${(tp+b)/2}) rotate(-90)" text-anchor="middle" font-size="12" style="fill:var(--muted)">Team value →</text>`;
  const pts=S.tv.map(k=>({t:k.o,x:X(ppg(k.o)),y:Y(k.value/1000)})); const placed=[];
  pts.sort((a,b)=>a.y-b.y).forEach(p=>{ let dy=4, anchor='start', dx=11; const label=short(p.t); const wpx=label.length*6.6; if(p.x+dx+wpx>r){anchor='end';dx=-11;}
    for(let k=0;k<6;k++){ const box=[anchor==='start'?p.x+dx:p.x+dx-wpx, p.y+dy-11, wpx, 14]; if(!placed.some(q=>!(box[0]+box[2]<q[0]||q[0]+q[2]<box[0]||box[1]+box[3]<q[1]||q[1]+q[3]<box[1]))){placed.push(box);break;} dy+=(k%2?-1:1)*(14*(k+1)); }
    s+=`<circle cx="${p.x}" cy="${p.y}" r="7" style="fill:${WCOL[windowOf(p.t)]};stroke:var(--surface)" stroke-width="2"><title>${esc(NAME(p.t))}: ${f1(ppg(p.t))} PPG, ${f0(KT[p.t].value)} value</title></circle><text x="${p.x+dx}" y="${p.y+dy}" text-anchor="${anchor}" font-size="12" font-weight="${p.t===MY_TEAM?700:500}" style="fill:var(--ink)">${esc(label)}</text>`; });
  return s+`</svg>`; }

/* ---------------- HISTORY ---------------- */
const BADNAME=/fag|fuck/i;
R.history=function(el){ const done=S.hist.filter(h=>h.done).sort((a,b)=>b.s-a.s);
  const at=S.at.map((a,i)=>({i,...a})).sort((a,b)=>b.titles-a.titles||b.finals-a.finals||(b.w/(b.w+b.l))-(a.w/(a.w+a.l))); const rc=S.records; const order=[...Array(S.at.length).keys()];
  const nm=(h,i)=>{const n=h.names[i]; return n&&!BADNAME.test(n)?n:HANDLE(i);};
  el.innerHTML=`<div class="h-row"><div><div class="kicker">${done.length} completed seasons</div><h2>History</h2></div></div>
  <div class="champs">${done.map(h=>`<div class="champ"><span class="yr">${h.s}</span><span class="who">${esc(nm(h,h.champ))}</span><span class="note">${esc(HANDLE(h.champ))} · beat ${esc(HANDLE(h.ru))} in the final</span></div>`).join("")}</div>
  <div class="card tw"><h3 style="margin-bottom:8px">All-time standings</h3><table><thead><tr><th>Manager</th><th class="r">Seasons</th><th class="r">W-L</th><th class="r">Win %</th><th class="r">Points</th><th class="r">Playoffs</th><th class="r">Finals</th><th class="r">Titles</th></tr></thead><tbody>
    ${at.map(a=>`<tr class="${a.i===MY_TEAM?'me':''}"><td>${teamCell(a.i,HANDLE(a.i))}</td><td class="r num">${a.seasons}</td><td class="r num">${a.w}-${a.l}</td><td class="r num">${(a.w/(a.w+a.l)*100).toFixed(1)}%</td><td class="r num">${f0(a.pf)}</td><td class="r num">${a.po}</td><td class="r num">${a.finals}</td><td class="r num"><b>${a.titles?'🏆'.repeat(a.titles):'—'}</b></td></tr>`).join("")}</tbody></table>
    <p class="note">Covers 2020 through Week 7 of 2026. Playoff, finals and title counts are completed seasons only.</p></div>
  <div class="card"><div class="h-row" style="margin-bottom:8px"><h3>Season by season</h3><label>Season <select id="hs">${S.hist.map(h=>`<option>${h.s}</option>`).join("")}</select></label></div><div class="tw" id="hs-t"></div></div>
  <div class="card"><h3 style="margin-bottom:6px">Head-to-head</h3><p class="note" style="margin:0 0 8px">All-time record of the row manager against the column manager, regular season and playoffs.</p><div class="tw"><table class="h2h"><thead><tr><th></th>${order.map(j=>`<th title="${esc(HANDLE(j))}">${abbr(j)}</th>`).join("")}</tr></thead><tbody>
    ${order.map(i=>`<tr><th style="text-align:left">${esc(HANDLE(i))}</th>${order.map(k=>{ if(i===k) return '<td class="self"></td>'; const [w,l]=S.h2h[i][k]; if(!w&&!l) return '<td class="muted">—</td>'; const p=w/(w+l); const c=p>=0.5?`color-mix(in srgb, var(--good) ${Math.round((p-0.5)*120)}%, transparent)`:`color-mix(in srgb, var(--bad) ${Math.round((0.5-p)*120)}%, transparent)`; return `<td style="background:${c}">${w}-${l}</td>`}).join("")}</tr>`).join("")}</tbody></table></div></div>
  <div class="grid2"><div class="card"><h3 style="margin-bottom:8px">Highest scores</h3><table><tbody>${rc.high.map(([o,s,w,p])=>`<tr><td>${teamCell(o,HANDLE(o))}</td><td class="muted">${s} · Wk ${w}</td><td class="r num"><b>${f2(p)}</b></td></tr>`).join("")}</tbody></table></div>
  <div class="card"><h3 style="margin-bottom:8px">Closest games</h3><table><tbody>${rc.close.map(([wn,ln,s,w,m,ws,ls])=>`<tr><td>${esc(HANDLE(wn))} <span class="muted">over</span> ${esc(HANDLE(ln))}</td><td class="muted">${s} · Wk ${w}</td><td class="r num">${f2(ws)}–${f2(ls)}</td><td class="r num"><b>${f2(m)}</b></td></tr>`).join("")}</tbody></table></div>
  <div class="card"><h3 style="margin-bottom:8px">Biggest blowouts</h3><table><tbody>${rc.blow.map(([wn,ln,s,w,m,ws,ls])=>`<tr><td>${esc(HANDLE(wn))} <span class="muted">over</span> ${esc(HANDLE(ln))}</td><td class="muted">${s} · Wk ${w}</td><td class="r num">${f2(ws)}–${f2(ls)}</td><td class="r num"><b>${f1(m)}</b></td></tr>`).join("")}</tbody></table></div>
  <div class="card"><h3 style="margin-bottom:8px">Most points left on the bench</h3><table><tbody>${rc.bench.map(([o,s,w,p])=>`<tr><td>${teamCell(o,HANDLE(o))}</td><td class="muted">${s} · Wk ${w}</td><td class="r num"><b>${f1(p)}</b></td></tr>`).join("")}</tbody></table></div></div>`;
  const hs=$('hs'); const drawS=()=>{ const h=S.hist.find(x=>x.s==hs.value); const st=[...h.st].sort((a,b)=>b[1]-a[1]||b[3]-a[3]);
    $('hs-t').innerHTML=`<table><thead><tr><th>#</th><th>Team that year</th><th class="r">W-L</th><th class="r">PF</th><th class="r">PA</th><th>Finish</th></tr></thead><tbody>${st.map((r,i)=>{const o=r[0]; const fin=h.champ===o?'🏆 Champion':h.ru===o?'Runner-up':h.third===o?'Third':(h.po||[]).includes(o)?'Playoffs':''; return `<tr><td class="num muted">${i+1}</td><td>${teamCell(o,`${nm(h,o)} · ${HANDLE(o)}`)}</td><td class="r num">${r[1]}-${r[2]}</td><td class="r num">${f1(r[3])}</td><td class="r num muted">${f1(r[4])}</td><td>${fin}</td></tr>`}).join("")}</tbody></table>${h.done?'':'<p class="note">Season in progress. See This Week for live standings.</p>'}`; };
  hs.onchange=drawS; drawS(); };

/* ---------------- WHAT IFS ---------------- */
const RND=["Quarterfinal","Semifinal","Final"];
R.whatif=function(el){ const WI=S.whatif; const altPaths={};
  const scenarios=w=>{ if(w.s===2020) return []; return [
      {k:"Everyone sets their best lineup all season",c:w.perfect.champ,d:`Regular season replayed with every team's best possible lineup each week.${w.perfect.seeds[0]!==w.seeds[0]?` ${short(w.perfect.seeds[0])} takes the No. 1 seed.`:''}`},
      {k:"Seeds set by total points",c:w.byPF.champ,d:`Same playoff scores, seeded by points for. No. 1 seed: ${short(w.byPF.seeds[0])}.`},
      {k:"Seeds set by all-play record",c:w.allplay.champ,d:`Everyone plays everyone every week. ${short(w.allplay.seeds[0])} has the best all-play record (${w.allplay.ap[w.allplay.seeds[0]]} wins).`},
      {k:"Seeds set by max PF",c:w.byMax.champ,d:`Seeded by best-possible-lineup points, the same stat that sets draft order. No. 1 seed: ${short(w.byMax.seeds[0])}.`}]; };
  WI.forEach(w=>{ const add=t=>{ if(t==null||t===w.champ) return; (altPaths[t]=altPaths[t]||new Set()).add(w.s); }; scenarios(w).forEach(x=>add(x.c)); w.ppl.forEach(add); w.sched.forEach(x=>add(x[0])); });
  const realT={}; WI.forEach(w=>realT[w.champ]=(realT[w.champ]||0)+1);
  const multi=[...Array(S.at.length).keys()].filter(i=>realT[i]||altPaths[i]).sort((a,b)=>((realT[b]||0)+(altPaths[b]?altPaths[b].size:0))-((realT[a]||0)+(altPaths[a]?altPaths[a].size:0)));
  el.innerHTML=`<div class="h-row"><div><div class="kicker">2020–2025 replayed</div><h2>What Ifs</h2></div></div>
  <p class="lead">Every past title replayed under different rules and luck, using the real weekly scores and each team's best possible lineup. The bracket model reproduces all six actual champions exactly, so any change below comes from the what-if alone.</p>
  <div class="card tw"><h3 style="margin-bottom:8px">The multiverse title count</h3><table><thead><tr><th>Manager</th><th class="r">Real titles</th><th class="r">Other seasons they win somewhere</th><th>Which ones</th></tr></thead><tbody>
    ${multi.map(i=>`<tr class="${i===MY_TEAM?'me':''}"><td>${teamCell(i,HANDLE(i))}</td><td class="r num">${realT[i]?'🏆'.repeat(realT[i]):'—'}</td><td class="r num"><b>${altPaths[i]?altPaths[i].size:0}</b></td><td class="muted">${altPaths[i]?[...altPaths[i]].sort().join(', '):'—'}</td></tr>`).join("")}</tbody></table><p class="note">Counts a season when at least one what-if on this page hands that manager the title.</p></div>
  ${WI.map(w=>{ const fin=w.games.find(g=>g[0]===2); const sc=scenarios(w); const partial=w.s===2020; const eqC=w.eq.find(e=>e[0]===w.champ), fav=w.eq[0];
    return `<div class="card" style="display:grid;gap:12px">
      <div class="h-row"><div><div class="kicker">${w.s} season</div><h3 style="font-size:28px">${esc(HANDLE(w.champ))} won it</h3><div class="note">Beat ${esc(HANDLE(w.ru))} ${f2(fin[3])}–${f2(fin[4])} in the final · seeds: ${w.seeds.map((t,i)=>`${i+1}. ${short(t)}`).join(' · ')}</div></div>${teamCell(w.champ,'Champion')}</div>
      ${partial?'<div class="notice">Sleeper is missing most 2020 regular-season scores (the startup year), so only the playoff what-ifs run for this season.</div>':''}
      ${!partial?`<div><div class="kicker" style="font-size:12px;margin-bottom:6px">Title odds going into the playoffs</div><div style="display:grid;gap:6px">${w.eq.map(([t,p])=>`<div style="display:grid;grid-template-columns:minmax(0,180px) 1fr;gap:10px;align-items:center"><span class="tshort"><span class="badge">${abbr(t)}</span>${esc(short(t))}${t===w.champ?' 🏆':''}</span>${bar(p,t===w.champ?'':'amber')}</div>`).join("")}</div>
        <p class="note" style="margin-top:6px">${fav[0]===w.champ?`The favorite held up: ${short(w.champ)} entered at ${pctS(fav[1])}.`:`${short(fav[0])} was the favorite at ${pctS(fav[1])}. ${short(w.champ)} won it from ${pctS(eqC?eqC[1]:0)}.`} Based on each team's regular-season scoring, 20,000 brackets.</p></div>`:''}
      ${sc.length?`<div class="tw"><table><thead><tr><th>What if…</th><th>Champion</th><th>How</th></tr></thead><tbody>${sc.map(x=>`<tr><td><b>${x.k}</b></td><td>${x.c===w.champ?`<span class="muted">Same: ${esc(short(x.c))}</span>`:`<span class="chip from">${esc(short(x.c))}</span>`}</td><td class="note">${esc(x.d)}</td></tr>`).join("")}</tbody></table></div>`:''}
      ${w.ppl.length?`<div><div class="kicker" style="font-size:12px;margin-bottom:6px">One perfect playoff run away</div>${w.ppl.map(t=>`<div style="padding:4px 0">${teamCell(t,'Wins the title by starting its best lineup in every playoff game, with everyone else unchanged')}</div>`).join("")}</div>`:''}
      ${w.sched.length?`<div><div class="kicker" style="font-size:12px;margin-bottom:6px">Wrong schedule</div>${w.sched.map(([t,ys,real])=>`<div style="padding:4px 0">${teamCell(t,`Went ${real} wins. Wins the title with ${ys.map(([y,wn])=>`${short(y)}'s schedule (${wn} wins)`).join(', ')}`)}</div>`).join("")}</div>`:''}
      ${w.regret.length?`<div><div class="kicker" style="font-size:12px;margin-bottom:6px">Left it on the bench</div><div class="tw"><table><thead><tr><th>Round</th><th>Lost</th><th class="r">Scored</th><th class="r">Best lineup</th><th>To</th><th class="r">Their score</th></tr></thead><tbody>${w.regret.map(([r,l,wn,lopt,ws,ls])=>`<tr><td>${RND[r]}</td><td>${teamCell(l,null,true)}</td><td class="r num">${f2(ls)}</td><td class="r num up"><b>${f2(lopt)}</b></td><td>${esc(short(wn))}</td><td class="r num">${f2(ws)}</td></tr>`).join("")}</tbody></table></div><p class="note">Playoff losses where the loser's best possible lineup would have outscored the winner.</p></div>`:''}
    </div>`}).join("")}`; };

/* ---------------- FIREBASE (sign-in + shared state) ---------------- */
const ST={on:false,ready:false,user:null,uid:null,admin:false,members:{},claims:{},weeks:{},votes:{},polls:[],block:[],posts:[],err:null};
let FB=null;
function initFirebase(){
  if(!window.FIREBASE_CONFIG||!window.firebase){ ST.ready=true; renderAuth(); return; }
  try{ firebase.initializeApp(window.FIREBASE_CONFIG); FB={auth:firebase.auth(),db:firebase.firestore()}; ST.on=true; }catch(e){ ST.err=e.message; ST.ready=true; renderAuth(); return; }
  const db=FB.db, err=e=>{ console.warn(e); ST.err=e&&e.message; };
  FB.auth.getRedirectResult().catch(err);
  FB.auth.onAuthStateChanged(async u=>{ ST.user=u; ST.uid=u?u.uid:null; ST.admin=false;
    if(u){ try{ ST.admin=(await db.doc('admins/'+u.uid).get()).exists; }catch(e){}
      if(ST.admin){ const L={}; Object.entries(S.locks).forEach(([w,t])=>L[w]=t); db.doc('config/locks').set(L,{merge:true}).catch(err); } }
    ST.ready=true; MY_TEAM=ST.uid&&ST.members[ST.uid]?ST.members[ST.uid].team:null; renderAuth(); show(); });
  db.collection('members').onSnapshot(s=>{ const m={}; s.docs.forEach(d=>m[d.id]=d.data()); ST.members=m; MY_TEAM=ST.uid&&m[ST.uid]?m[ST.uid].team:null; show(); },err);
  db.collection('claims').onSnapshot(s=>{ const m={}; s.docs.forEach(d=>m[d.id]=d.data().uid); ST.claims=m; rerender(); },err);
  db.collectionGroup('weeks').onSnapshot(s=>{ const m={}; s.docs.forEach(d=>{ const uid=d.ref.parent.parent.id; (m[uid]=m[uid]||{})[d.id]=(d.data().picks||{}); }); ST.weeks=m; rerender(); },err);
  db.collection('votes').onSnapshot(s=>{ const m={}; s.docs.forEach(d=>m[d.id]=d.data()); ST.votes=m; rerender(); },err);
  db.collection('polls').onSnapshot(s=>{ ST.polls=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.ts||0)-(a.ts||0)); rerender(); },err);
  db.collection('block').onSnapshot(s=>{ ST.block=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.ts||0)-(a.ts||0)); rerender(); },err);
  db.collection('posts').onSnapshot(s=>{ ST.posts=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.ts||0)-(a.ts||0)); rerender(); },err);
}
function rerender(){ const c=current(); if(['pickem','polls','block','commish','week'].includes(c)) show(); }
function signIn(){ const p=new firebase.auth.GoogleAuthProvider(); FB.auth.signInWithPopup(p).catch(e=>{ if(e&&/popup/.test(e.code||'')) FB.auth.signInWithRedirect(p); else { ST.err=e.message; renderAuth(); } }); }
function renderAuth(){ const a=$('auth'); if(!a) return; if(!ST.on){ a.innerHTML=''; return; }
  if(!ST.user){ a.innerHTML=`<button class="btn" id="si">Sign in with Google</button>`; $('si').onclick=signIn; return; }
  const t=ST.members[ST.uid]; a.innerHTML=`${ST.user.photoURL?`<img src="${esc(ST.user.photoURL)}" alt="">`:''}<span style="font-size:13px">${esc(t&&t.team!=null?short(t.team):(ST.user.displayName||'Signed in'))}</span><button class="btn" id="so">Sign out</button>`; $('so').onclick=()=>FB.auth.signOut(); }
const isMember=()=>ST.uid&&ST.members[ST.uid]&&ST.members[ST.uid].team!=null;
function gate(){ if(!ST.on) return `<div class="notice">Sign-in isn't set up yet. The commissioner is turning it on soon.</div>`;
  if(!ST.user) return `<div class="notice">Sign in with Google (top right) and claim your team to make picks, vote and post on the trade block.</div>`;
  if(!isMember()) return claimBox(true); return ""; }
function claimBox(first){ if(!ST.user) return ""; const mine=ST.members[ST.uid]&&ST.members[ST.uid].team;
  return `<div class="card" style="display:flex;gap:12px;align-items:end;flex-wrap:wrap"><label>${first?'Claim your team to get started':'Your team'}<select id="claim"><option value="">Choose your team</option>${[...Array(N).keys()].map(i=>{const taken=ST.claims[i]&&ST.claims[i]!==ST.uid;return `<option value="${i}" ${mine===i?'selected':''} ${taken?'disabled':''}>${esc(NAME(i))}${taken?' (claimed)':''}</option>`}).join("")}</select></label><span class="note">Each team can be claimed once. Picked the wrong one? Ask the commissioner to free it up.</span></div>`; }
function bindClaim(){ const s=$('claim'); if(!s) return; s.onchange=async()=>{ const v=s.value===""?null:+s.value; const db=FB.db, uid=ST.uid, old=ST.members[uid]&&ST.members[uid].team; const b=db.batch();
  if(old!=null&&old!==v) b.delete(db.doc('claims/'+old)); if(v!=null) b.set(db.doc('claims/'+v),{uid});
  b.set(db.doc('members/'+uid),{team:v,name:ST.user.displayName||'',photo:ST.user.photoURL||'',ts:Date.now()});
  try{ await b.commit(); }catch(e){ alertBox("That team is already claimed. Pick another or ask the commissioner."); } }; }
function alertBox(msg){ const n=document.createElement('div'); n.className='notice'; n.style.cssText='position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:50;max-width:90vw'; n.textContent=msg; document.body.appendChild(n); setTimeout(()=>n.remove(),4000); }
const who=uid=>{ const m=ST.members[uid]; return m?(m.team!=null?`${m.name||'Someone'} · ${short(m.team)}`:(m.name||'Someone')):'Someone'; };
function fillPickCounts(el){ if(!NEXTW) return; el.querySelectorAll('[data-pk]').forEach(n=>{ const k=n.dataset.pk; const m=k.split('-')[1]; let a=0,b=0; const g=REMAIN.find(x=>x.key===k);
  Object.values(ST.weeks).forEach(d=>{const p=d[String(NEXTW)]; if(p&&p[m]!=null){ if(p[m]===g.a)a++; else if(p[m]===g.b)b++; }}); if(a+b) n.textContent=`Pick'em: ${a} picked ${short(g.a)}, ${b} picked ${short(g.b)}`; }); }

/* ---------------- PICK'EM ---------------- */
let PW=null;
function resultsFor(w){ const r={}; SEA.games.filter(x=>x.w===w).forEach(x=>{ r[x.m]= x.as>x.bs?x.a:x.bs>x.as?x.b:-1; }); return r; }
R.pickem=function(el){ if(PW==null) PW=NEXTW||C.lastW; const weeks=[]; for(let w=1;w<=REG;w++) weeks.push(w);
  const games=(C.weeks[PW-1]||[]); const by={}; games.forEach(([o,p,op,m])=>(by[m]=by[m]||[]).push(o)); const pairs=Object.entries(by).filter(([m,p])=>p.length===2);
  const locked=Date.now()>=lockTime(PW); const res=PW<=C.lastW?resultsFor(PW):null; const myW=(ST.uid&&ST.weeks[ST.uid]&&ST.weeks[ST.uid][String(PW)])||{};
  const lb=Object.entries(ST.weeks).filter(([uid])=>ST.members[uid]&&ST.members[uid].team!=null).map(([uid,d])=>{ let c=0,n=0; for(let w=1;w<=C.lastW;w++){ const p=d[String(w)]; if(!p) continue; const r=resultsFor(w); Object.entries(p).forEach(([m,t])=>{ if(r[m]!=null){ n++; if(r[m]===t) c++; } }); } return {uid,c,n}; }).sort((a,b)=>b.c-a.c||a.n-b.n);
  const can=isMember()&&!locked;
  el.innerHTML=`<div class="h-row"><div><div class="kicker">Weekly picks · locks Thursday 8:15 p.m. ET</div><h2>Pick'em</h2></div><label>Week<select id="pw">${weeks.map(w=>`<option value="${w}" ${w===PW?'selected':''}>Week ${w}${w===NEXTW?' (next)':''}</option>`).join("")}</select></label></div>
  ${gate()}${isMember()?claimBox(false):''}
  <div class="card"><div class="h-row" style="margin-bottom:10px"><h3>Week ${PW}</h3><span class="note">${res?'Final':locked?'Locked':`Open until ${new Date(lockTime(PW)).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`}</span></div>
    <div style="display:grid;gap:10px">${pairs.map(([m,[a,b]])=>{ const pa=winProb(a,b); const picked=myW[m]; const cls=t=>(!res||picked!==t)?'':(res[m]===t?'right':'wrong');
      const sc=t=>{const x=games.find(g=>g[0]===t); return x&&x[1]!=null?f2(x[1]):pctS(t===a?pa:1-pa)+' to win';};
      return `<div class="pick">${[a,b].map(t=>`<button data-m="${m}" data-t="${t}" aria-pressed="${picked===t}" class="${cls(t)}" ${can?'':'disabled'}><b>${esc(short(t))}</b><small>${sc(t)}${res&&res[m]===t?' · W':''}</small></button>`).join("")}</div>`}).join("")}</div>
    ${can?'<p class="note" style="margin-top:8px">Tap a team to pick it. Picks save as you tap.</p>':''}</div>
  <div class="card"><h3 style="margin-bottom:8px">Leaderboard</h3>${lb.length?`<table><thead><tr><th>#</th><th>Player</th><th class="r">Correct</th><th class="r">Graded</th><th class="r">Hit rate</th></tr></thead><tbody>${lb.map((x,i)=>`<tr class="${x.uid===ST.uid?'me':''}"><td class="num muted">${i+1}</td><td>${esc(who(x.uid))}</td><td class="r num"><b>${x.c}</b></td><td class="r num">${x.n}</td><td class="r num">${x.n?Math.round(x.c/x.n*100)+'%':'—'}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">No picks yet. The first correct pick takes the lead.</div>'}</div>`;
  $('pw').onchange=e=>{PW=+e.target.value; R.pickem(el)}; bindClaim();
  el.querySelectorAll('.pick button').forEach(btn=>btn.onclick=async()=>{ const m=btn.dataset.m, t=+btn.dataset.t; const all={...(ST.weeks[ST.uid]||{})}; const wk={...(all[String(PW)]||{})};
    if(wk[m]===t) delete wk[m]; else wk[m]=t; all[String(PW)]=wk; ST.weeks[ST.uid]=all; R.pickem(el);
    try{ await FB.db.doc(`pickem/${ST.uid}/weeks/${PW}`).set({picks:wk,ts:Date.now()}); }catch(e){ alertBox("Couldn't save that pick. Picks lock at Thursday kickoff."); } }); };

/* ---------------- POLLS ---------------- */
R.polls=function(el){ const tally=pid=>{ const c={}; Object.entries(ST.votes).forEach(([uid,v])=>{ if(v[pid]!=null&&ST.members[uid]&&ST.members[uid].team!=null) c[v[pid]]=(c[v[pid]]||0)+1; }); return c; };
  const mine=(ST.uid&&ST.votes[ST.uid])||{}; const can=isMember();
  el.innerHTML=`<div class="h-row"><div><div class="kicker">One vote per team · change it any time while a poll is open</div><h2>Polls</h2></div></div>${gate()}
  ${ST.admin?`<details class="card"><summary style="cursor:pointer;font-weight:600">New poll (commissioner)</summary><div style="display:grid;gap:10px;margin-top:10px"><label>Question<input type="text" id="np-q" placeholder="Who wins the SPDL title?"></label><label>Options, one per line<textarea id="np-o"></textarea></label><div><button class="btn primary" id="np-go">Post poll</button></div></div></details>`:""}
  ${ST.polls.length?ST.polls.map(p=>{ const c=tally(p.id); const tot=Object.values(c).reduce((s,x)=>s+x,0); const open=p.open!==false;
    return `<div class="card poll"><div class="h-row" style="margin-bottom:10px"><h3>${esc(p.q)}</h3><span class="note">${tot} vote${tot===1?'':'s'}${open?'':' · Closed'}</span></div><div class="opts">${(p.options||[]).map((o,i)=>{const n=c[i]||0;const w=tot?n/tot*100:0;return `<button class="opt" data-p="${esc(p.id)}" data-i="${i}" aria-pressed="${mine[p.id]===i}" ${(!open||!can)?'disabled':''}><span class="bar" style="width:${w}%"></span><span>${esc(o)}</span><span class="num">${n} · ${Math.round(w)}%</span></button>`}).join("")}</div>
    ${ST.admin?`<div style="margin-top:10px;display:flex;gap:8px"><button class="btn" data-close="${esc(p.id)}">${open?'Close poll':'Reopen poll'}</button><button class="btn" data-delpoll="${esc(p.id)}">Delete</button></div>`:''}</div>`}).join(""):`<div class="empty">No polls yet${ST.admin?'. Post the first one above.':'. The commissioner posts them here.'}</div>`}`;
  el.querySelectorAll('.opt').forEach(b=>b.onclick=async()=>{ const pid=b.dataset.p, i=+b.dataset.i; const cur={...(ST.votes[ST.uid]||{})}; if(cur[pid]===i) delete cur[pid]; else cur[pid]=i; ST.votes[ST.uid]=cur; R.polls(el); try{ await FB.db.doc('votes/'+ST.uid).set(cur); }catch(e){ alertBox("Couldn't save your vote."); } });
  el.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{ const p=ST.polls.find(x=>x.id===b.dataset.close); FB.db.doc('polls/'+p.id).update({open:p.open===false}); });
  el.querySelectorAll('[data-delpoll]').forEach(b=>b.onclick=()=>{ if(b.dataset.c!=='1'){b.dataset.c='1';b.textContent='Tap again to delete';return;} FB.db.doc('polls/'+b.dataset.delpoll).delete(); });
  const go=$('np-go'); if(go) go.onclick=async()=>{ const q=$('np-q').value.trim(); const o=$('np-o').value.split('\n').map(s=>s.trim()).filter(Boolean); if(!q||o.length<2) return; go.disabled=true; await FB.db.collection('polls').add({q,options:o.slice(0,12),open:true,ts:Date.now()}); }; };

/* ---------------- TRADE BLOCK ---------------- */
R.block=function(el){ const mine=ST.block.find(b=>b.id===ST.uid); const can=isMember();
  el.innerHTML=`<div class="h-row"><div><div class="kicker">Who's buying, who's selling</div><h2>Trade Block</h2></div></div><p class="lead">Post what you're shopping and what you want back. One listing per team; update it whenever your plans change.</p>${gate()}
  ${can?`<div class="card" style="display:grid;gap:10px"><h3>${mine?'Your listing':'Post a listing'}</h3><label>Shopping<textarea id="bk-o" placeholder="Players or picks you'd move">${esc(mine?mine.offering:'')}</textarea></label><label>Looking for<textarea id="bk-s" placeholder="What you want back">${esc(mine?mine.seeking:'')}</textarea></label><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn primary" id="bk-go">${mine?'Update listing':'Post listing'}</button>${mine?'<button class="btn" id="bk-del">Take it down</button>':''}</div></div>`:""}
  <div style="display:grid;gap:12px">${ST.block.length?ST.block.map(b=>{ const t=ST.members[b.id]&&ST.members[b.id].team; return `<div class="card" style="display:grid;gap:8px"><div class="h-row">${t!=null?teamCell(t,(ST.members[b.id]||{}).name||''):`<b>${esc(who(b.id))}</b>`}<span class="note">${new Date(b.ts||0).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div>
      <div class="grid2" style="gap:10px"><div><div class="kicker" style="font-size:12px">Shopping</div><div style="white-space:pre-wrap">${esc(b.offering||'—')}</div></div><div><div class="kicker" style="font-size:12px">Looking for</div><div style="white-space:pre-wrap">${esc(b.seeking||'—')}</div></div></div>
      ${t!=null&&KT[t]?`<div class="note">Value ${f0(KT[t].value)} · ${windowOf(t)} · picks rank ${PR.PICK[t]} of 10</div>`:''}${ST.admin&&b.id!==ST.uid?`<div><button class="btn" data-rm="${esc(b.id)}">Remove listing</button></div>`:''}</div>`}).join(""):'<div class="empty">The block is empty. Post the first listing.</div>'}</div>`;
  const go=$('bk-go'); if(go) go.onclick=async()=>{ const o=$('bk-o').value.trim(), s=$('bk-s').value.trim(); if(!o&&!s) return; go.disabled=true; try{ await FB.db.doc('block/'+ST.uid).set({offering:o.slice(0,600),seeking:s.slice(0,600),team:ST.members[ST.uid].team,ts:Date.now()}); }catch(e){ alertBox("Couldn't save your listing."); go.disabled=false; } };
  const del=$('bk-del'); if(del) del.onclick=()=>FB.db.doc('block/'+ST.uid).delete();
  el.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>FB.db.doc('block/'+b.dataset.rm).delete()); };

/* ---------------- COMMISH ---------------- */
R.commish=function(el){
  el.innerHTML=`<div class="h-row"><div><div class="kicker">From the commissioner</div><h2>Commish Corner</h2></div></div>
  ${ST.admin?`<details class="card"><summary style="cursor:pointer;font-weight:600">Write a post</summary><div style="display:grid;gap:10px;margin-top:10px"><label>Headline<input type="text" id="cp-t" placeholder="Week 8 recap"></label><label>Post<textarea id="cp-b" style="min-height:160px"></textarea></label><div><button class="btn primary" id="cp-go">Publish post</button></div></div></details>`:""}
  ${ST.posts.length?ST.posts.map(p=>`<article class="card post"><div class="note">${new Date(p.ts||0).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'})}</div><h4>${esc(p.title)}</h4><div class="body">${esc(p.body)}</div>${ST.admin?`<div><button class="btn" data-del="${esc(p.id)}">Delete post</button></div>`:''}</article>`).join(""):`<div class="empty">No posts yet.</div>`}
  ${ST.admin?`<div class="card"><h3 style="margin-bottom:8px">Team claims</h3><p class="note" style="margin:0 0 8px">Free up a team if someone claimed the wrong one.</p><table><tbody>${[...Array(N).keys()].map(i=>{const uid=ST.claims[i]; return `<tr><td>${teamCell(i)}</td><td>${uid?esc(who(uid)):'<span class="muted">Unclaimed</span>'}</td><td class="r">${uid?`<button class="btn" data-free="${i}">Free up</button>`:''}</td></tr>`}).join("")}</tbody></table></div>`:""}
  <div class="card"><h3 style="margin-bottom:6px">League rules at a glance</h3><ul style="margin:0;padding-left:18px"><li>10 teams, superflex, full PPR. Starters: QB, 2 RB, 3 WR, TE, 2 FLEX, 1 SUPER FLEX.</li><li>Regular season Weeks 1–${REG}. Top ${PT} make the playoffs starting Week ${C.pws}; top 2 seeds get a bye. Ties broken by points for.</li><li>Rookie draft: 4 rounds, linear. Non-playoff teams pick 1–4 by lowest max PF, then first-round losers, then semifinal losers (each by max PF), runner-up 9th, champion 10th.</li></ul></div>
  ${ST.user&&!ST.admin?`<p class="note">Commissioner setup: your account ID is <span class="uid">${esc(ST.uid)}</span></p>`:''}`;
  const go=$('cp-go'); if(go) go.onclick=async()=>{ const t=$('cp-t').value.trim(), b=$('cp-b').value.trim(); if(!t||!b) return; go.disabled=true; await FB.db.collection('posts').add({title:t.slice(0,140),body:b.slice(0,8000),ts:Date.now()}); };
  el.querySelectorAll('[data-del]').forEach(btn=>btn.onclick=()=>{ if(btn.dataset.c!=='1'){btn.dataset.c='1';btn.textContent='Tap again to delete';return;} FB.db.doc('posts/'+btn.dataset.del).delete(); });
  el.querySelectorAll('[data-free]').forEach(btn=>btn.onclick=async()=>{ const i=btn.dataset.free, uid=ST.claims[i]; const b=FB.db.batch(); b.delete(FB.db.doc('claims/'+i)); if(uid) b.set(FB.db.doc('members/'+uid),{team:null},{merge:true}); await b.commit(); }); };

/* ---------------- boot ---------------- */
(async function boot(){
  try{ S=await j('data/static.json'); }catch(e){ $('main').innerHTML='<div class="notice">Couldn\'t load league data. Refresh to try again.</div>'; return; }
  const [kt,pl]=await Promise.all([j('data/ktc.json').catch(()=>null), j('data/players.json').catch(()=>null)]);
  if(kt&&kt.players){ KTCV={gen:kt.gen,picks:kt.picks||{},map:{},byName:{}}; kt.players.forEach(p=>{ const k=norm(p[0]); KTCV.map[k]=Math.max(KTCV.map[k]||0,p[4]); KTCV.byName[k]=[p[4],p[3]]; }); }
  if(pl&&pl.players) PLAYERS=pl.players;
  compute(); header(); show(); initFirebase();
  try{ await live(); compute(); header(); show(); }catch(e){ console.warn(e); LIVE_ERR=e.message; header(); }
})();
})();
