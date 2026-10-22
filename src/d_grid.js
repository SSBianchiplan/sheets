/* ================= grade (canvas) ================= */
const UI={sel:{r1:0,c1:0,r2:0,c2:0},act:{r:0,c:0},anc:{r:0,c:0},zoom:1,ed:null,clip:null,showF:false,trace:null,painter:null,hlRefs:[],point:null};
const HW=()=>Math.round(44*UI.zoom),HH=()=>Math.round(22*UI.zoom);
const REFCOL=['#2F7DE1','#C93A8E','#2A9D5B','#8456D0','#C98400','#118E9C'];
let G={cv:null,ctx:null,dpr:1,w:0,h:0,colX:null,rowY:null,nC:0,nR:0,ver:-1};let GEOVER=0;
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}
let PAL={};function readPal(){for(const k of['cell','grid','hdr','hdr-text','hdr-sel','hdr-sel-text','accent','text','muted','line','panel2','accent-soft','faint'])PAL[k]=css('--'+k);PAL.dark=document.documentElement.dataset.theme==='dark'||(document.documentElement.dataset.theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)}
const cw=(sh,c)=>sh.hcols.has(c)?0:Math.round((sh.colW[c]??DEF_W)*UI.zoom);
const rh=(sh,r)=>(sh.hidden.has(r)||sh.fhidden.has(r))?0:Math.round((sh.rowH[r]??DEF_H)*UI.zoom);
function buildGeo(){const sh=curSheet();const key=sh.id+':'+GEOVER+':'+UI.zoom+':'+sh.maxR+':'+sh.maxC;if(G.ver===key)return;G.ver=key;
  G.nC=Math.min(MAXC,Math.max(sh.maxC+30,60));G.nR=Math.max(sh.maxR+300,1000);
  G.colX=new Float64Array(G.nC+1);for(let c=0;c<G.nC;c++)G.colX[c+1]=G.colX[c]+cw(sh,c);
  G.rowY=new Float64Array(G.nR+1);for(let r=0;r<G.nR;r++)G.rowY[r+1]=G.rowY[r]+rh(sh,r);
  const sp=$('#gspacer');sp.style.width=(HW()+G.colX[G.nC])+'px';sp.style.height=(HH()+G.rowY[G.nR])+'px';}
function geoDirty(){GEOVER++}
const scr=()=>$('#gscroll');
function fz(){const sh=curSheet();return{r:sh.freeze.r||0,c:sh.freeze.c||0}}
function colScreenX(c){const f=fz();return HW()+G.colX[c]-(c>=f.c?scr().scrollLeft:0)}
function rowScreenY(r){const f=fz();return HH()+G.rowY[r]-(r>=f.r?scr().scrollTop:0)}
function bsearch(arr,v,n){let lo=0,hi=n;while(lo<hi){const m=(lo+hi)>>1;if(arr[m+1]<=v)lo=m+1;else hi=m}return Math.min(lo,n-1)}
function hit(x,y){buildGeo();const f=fz();const sx=scr().scrollLeft,sy=scr().scrollTop;
  let c=-1,r=-1;
  if(x>=HW()){const lx=x-HW();const fw=G.colX[f.c];c=lx<fw?bsearch(G.colX,lx,G.nC):bsearch(G.colX,lx+sx,G.nC);if(lx>=fw&&c<f.c)c=f.c}
  if(y>=HH()){const ly=y-HH();const fh=G.rowY[f.r];r=ly<fh?bsearch(G.rowY,ly,G.nR):bsearch(G.rowY,ly+sy,G.nR);if(ly>=fh&&r<f.r)r=f.r}
  return{r,c}}
function mergeAt(sh,r,c){for(const m of sh.merges)if(inRange(m,r,c))return m;return null}
function cellRect(r,c){const sh=curSheet();const m=mergeAt(sh,r,c);const g=m||{r1:r,c1:c,r2:r,c2:c};const x=colScreenX(g.c1),y=rowScreenY(g.r1);return{x,y,w:G.colX[g.c2+1]-G.colX[g.c1],h:G.rowY[g.r2+1]-G.rowY[g.r1]}}

/* ---- desenho ---- */
const FONTC=new Map();
function fontOf(st){const fs=(st&&st.fs||11)*UI.zoom*1.2;return`${st&&st.i?'italic ':''}${st&&st.b?'600 ':'400 '}${fs.toFixed(1)}px "IBM Plex Sans", system-ui, sans-serif`}
let drawQ=false;function draw(){if(drawQ)return;drawQ=true;requestAnimationFrame(()=>{drawQ=false;drawNow()})}
function drawNow(){
  const host=$('#gridHost');if(!host||host.offsetParent===null)return;
  readPal();buildGeo();const sh=curSheet();const cv=G.cv,ctx=G.ctx;const W=host.clientWidth,H=host.clientHeight;const dpr=window.devicePixelRatio||1;
  if(G.w!==W||G.h!==H||G.dpr!==dpr){G.w=W;G.h=H;G.dpr=dpr;cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px'}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=PAL.cell;ctx.fillRect(0,0,W,H);
  const f=fz();const sx=scr().scrollLeft,sy=scr().scrollTop;const hw=HW(),hh=HH();
  const fw=G.colX[f.c],fh=G.rowY[f.r];
  const visCols=(from,to,off)=>{const out=[];let c=bsearch(G.colX,from+off,G.nC);for(;c<G.nC;c++){if(G.colX[c]-off>to)break;out.push(c)}return out};
  const visRows=(from,to,off)=>{const out=[];let r=bsearch(G.rowY,from+off,G.nR);for(;r<G.nR;r++){if(G.rowY[r]-off>to)break;out.push(r)}return out};
  const colsU=visCols(fw,W-hw,sx).filter(c=>c>=f.c),rowsU=visRows(fh,H-hh,sy).filter(r=>r>=f.r);
  const colsF=f.c?[...Array(f.c).keys()]:[],rowsF=f.r?[...Array(f.r).keys()]:[];
  const quads=[[rowsU,colsU,hw+fw,hh+fh,W,H],[rowsU,colsF,hw,hh+fh,hw+fw,H],[rowsF,colsU,hw+fw,hh,W,hh+fh],[rowsF,colsF,hw,hh,hw+fw,hh+fh]];
  for(const [rows,cols,x0,y0,x1,y1] of quads){if(!rows.length||!cols.length)continue;ctx.save();ctx.beginPath();ctx.rect(x0,y0,x1-x0,y1-y0);ctx.clip();drawCells(sh,rows,cols);drawOverlays(sh,rows,cols);ctx.restore()}
  drawHeaders(sh,[...colsF,...colsU],[...rowsF,...rowsU]);
  if(f.r){ctx.fillStyle=PAL.line;ctx.fillRect(0,hh+fh-.5,W,1.5)}if(f.c){ctx.fillStyle=PAL.line;ctx.fillRect(hw+fw-.5,0,1.5,H)}
  if(UI.ed)positionEditor();
}
function tableAt(sh,r,c){for(const t of sh.tables)if(inRange(t,r,c))return t;return null}
const TSTYLE={laranja:{h:'#EB6A20',s:'#FDEFE6',hd:'#7A3510',sd:'#3A2A20'},grafite:{h:'#2D3336',s:'#EEF0F1',hd:'#C9CED1',sd:'#262D31'},ambar:{h:'#C98400',s:'#FEF5DE',hd:'#6B4700',sd:'#352C16'},aco:{h:'#5E676C',s:'#EFF1F2',hd:'#9AA4AA',sd:'#283035'}};
function drawCells(sh,rows,cols){
  const ctx=G.ctx;const textJobs=[];const borders=[];const drawnMerge=new Set();
  // fundos
  for(const r of rows){const h=G.rowY[r+1]-G.rowY[r];if(!h)continue;const y=rowScreenY(r);
    for(const c of cols){const w=G.colX[c+1]-G.colX[c];if(!w)continue;const x=colScreenX(c);
      const k=K(r,c);const cell=sh.cells.get(k);const st=cell&&cell.st;
      const m=sh.merges.length?mergeAt(sh,r,c):null;
      if(m&&!(m.r1===r&&m.c1===c)){if(drawnMerge.has(m))continue;if(!(rows.includes(m.r1)&&cols.includes(m.c1))){drawnMerge.add(m);const rr=cellRect(m.r1,m.c1);ctx.fillStyle=PAL.cell;ctx.fillRect(rr.x,rr.y,rr.w,rr.h);queueCell(sh,m.r1,m.c1,rr,textJobs,borders,true)}continue}
      let rect={x,y,w,h};if(m){drawnMerge.add(m);rect=cellRect(r,c);ctx.fillStyle=PAL.cell;ctx.fillRect(rect.x,rect.y,rect.w,rect.h)}
      queueCell(sh,r,c,rect,textJobs,borders,!!m);
    }}
  // linhas de grade
  if(sh.showGrid){ctx.strokeStyle=PAL.grid;ctx.lineWidth=1;ctx.beginPath();
    const x0=colScreenX(cols[0]),x1=colScreenX(cols[cols.length-1])+G.colX[cols[cols.length-1]+1]-G.colX[cols[cols.length-1]];
    const y0=rowScreenY(rows[0]),y1=rowScreenY(rows[rows.length-1])+G.rowY[rows[rows.length-1]+1]-G.rowY[rows[rows.length-1]];
    for(const c of cols){const x=Math.round(colScreenX(c)+G.colX[c+1]-G.colX[c])-.5;ctx.moveTo(x,y0);ctx.lineTo(x,y1)}
    for(const r of rows){if(!(G.rowY[r+1]-G.rowY[r]))continue;const y=Math.round(rowScreenY(r)+G.rowY[r+1]-G.rowY[r])-.5;ctx.moveTo(x0,y);ctx.lineTo(x1,y)}
    ctx.stroke();
    // limpar linhas sob mesclagens / overflow
    for(const j of textJobs){if(j.merge){ctx.fillStyle=j.bg||PAL.cell;ctx.fillRect(j.rect.x+.5,j.rect.y+.5,j.rect.w-1.5,j.rect.h-1.5)}}
  }
  // texto (com transbordo)
  for(const j of textJobs)drawText(sh,j,cols);
  for(const b of borders)drawBorder(b);
}
function queueCell(sh,r,c,rect,textJobs,borders,merge){
  const ctx=G.ctx;const cell=sh.cells.get(K(r,c));let st=cell&&cell.st;
  const v=getVal(sh,r,c);
  let cf=sh.cf.length?cfFor(sh,r,c,v):null;
  const t=sh.tables.length?tableAt(sh,r,c):null;
  let bg=st&&st.bg;let fc=st&&st.fc;let bold=st&&st.b;
  if(t){const ts=TSTYLE[t.style||'laranja'];if(r===t.r1){bg=bg||(PAL.dark?ts.hd:ts.h);fc=fc||(PAL.dark?'#fff':'#fff');bold=true}else if(t.banded!==false&&(r-t.r1)%2===0)bg=bg||(PAL.dark?ts.sd:ts.s)}
  if(cf&&cf.bg)bg=cf.bg;if(cf&&cf.fc)fc=cf.fc;if(cf&&cf.b)bold=true;
  if(bg){ctx.fillStyle=bg;ctx.fillRect(rect.x,rect.y,rect.w,rect.h)}
  if(cf&&cf.bar){const b=cf.bar;const pad=2;const W2=rect.w-pad*2;const x0=rect.x+pad+W2*b.z,x1=rect.x+pad+W2*b.t;ctx.fillStyle=b.color+'B0';ctx.fillRect(Math.min(x0,x1),rect.y+3,Math.abs(x1-x0),rect.h-6)}
  if(st&&st.bd)borders.push({rect,bd:st.bd});
  const hasV=v!=null&&v!=='';
  const showRaw=UI.showF&&cell&&cell.ast;
  const isSpill=!cell||!cell.raw;
  if(hasV||showRaw||(cf&&cf.icon!=null)){
    textJobs.push({r,c,rect,v,st:Object.assign({},st,{b:bold,fc,_t:t}),cf,merge,bg,raw:showRaw?cell.raw:null,spill:isSpill});
  }else if(merge)textJobs.push({r,c,rect,v:null,st:{},merge,bg});
  if(cell&&cell.note){ctx.fillStyle='#D6338A';ctx.beginPath();ctx.moveTo(rect.x+rect.w-7,rect.y);ctx.lineTo(rect.x+rect.w-1,rect.y);ctx.lineTo(rect.x+rect.w-1,rect.y+6);ctx.fill()}
}
const ICONS={arrows:[['▼','#C8402E'],['▶','#C98400'],['▲','#2F8F55']],dots:[['●','#C8402E'],['●','#E2B100'],['●','#2F8F55']]};
function drawText(sh,j,cols){
  if(j.v==null&&!j.raw&&!(j.cf&&j.cf.icon!=null))return;
  const ctx=G.ctx;const st=j.st||{};const v=j.v;
  let s=j.raw?j.raw:fmtValue(v,st.nf);
  const isNum=!j.raw&&typeof v==='number',isBool=typeof v==='boolean',isE=isErr(v);
  let ha=st.ha||(isNum?'right':(isBool||isE)?'center':'left');
  const va=st.va||'bottom';
  ctx.font=fontOf(st);
  let color=st.fc;if(!color||(PAL.dark&&(color==='#000000'||color==='#000')))color=PAL.text;if(isE)color='#C8402E';
  if(isNum&&v<0&&st.nf&&/\[Red\]|\[Vermelho\]/i.test(st.nf))color='#C8402E';
  ctx.fillStyle=color;
  const {x,y,w,h}=j.rect;const pad=Math.max(2,3*UI.zoom);
  let tw=ctx.measureText(s).width;
  let clipX=x,clipW=w;
  if(isNum&&tw>w-pad*2&&!st.wrap&&!(st.nf||'').match(/@/)){s='#'.repeat(Math.max(1,Math.floor((w-pad*2)/ctx.measureText('#').width)));tw=ctx.measureText(s).width}
  // transbordo de texto
  if(!isNum&&!st.wrap&&!j.merge&&tw>w-pad*2&&ha!=='center'){
    if(ha==='left'){let c=j.c+1,ext=0;while(c<G.nC&&ext<tw){const nv=sh.cells.get(K(j.r,c));const hasVal=(nv&&nv.raw)||sh.spill.has(K(j.r,c));if(hasVal)break;const ww=G.colX[c+1]-G.colX[c];ext+=ww;clipW+=ww;c++}}
    else{let c=j.c-1;while(c>=0&&clipW<tw+pad*2){const nv=sh.cells.get(K(j.r,c));if((nv&&nv.raw)||sh.spill.has(K(j.r,c)))break;const ww=G.colX[c+1]-G.colX[c];clipX-=ww;clipW+=ww;c--}}
  }
  ctx.save();ctx.beginPath();ctx.rect(clipX+1,y+1,clipW-2,h-2);ctx.clip();
  const fs=(st.fs||11)*UI.zoom*1.2;const lh=fs*1.25;
  let lines=[s];
  if(st.wrap&&!isNum){lines=[];for(const para of s.split('\n')){let cur='';for(const word of para.split(/(\s+)/)){const t2=cur+word;if(ctx.measureText(t2).width>w-pad*2&&cur){lines.push(cur.trimEnd());cur=word.trimStart()}else cur=t2}lines.push(cur)}}
  else if(s.includes('\n'))lines=s.split('\n');
  const totalH=lines.length*lh;
  let ty=va==='top'?y+pad+fs*.85:va==='middle'?y+h/2-totalH/2+fs*.85:y+h-pad-(lines.length-1)*lh-fs*.18;
  let icon=null;if(j.cf&&j.cf.icon!=null){icon=(ICONS[j.cf.iconSet]||ICONS.arrows)[j.cf.icon]}
  for(const ln of lines){const lw=ctx.measureText(ln).width;let tx=ha==='right'?x+w-pad-lw:ha==='center'?x+(w-lw)/2:x+pad+(st.ind||0)*8*UI.zoom;
    if(icon&&ha!=='right')tx+=fs;
    ctx.fillText(ln,tx,ty);
    if(st.u){ctx.fillRect(tx,ty+2,lw,1)}if(st.s){ctx.fillRect(tx,ty-fs*.32,lw,1)}
    ty+=lh}
  if(icon){ctx.fillStyle=icon[1];ctx.font=`${(fs*.8).toFixed(1)}px system-ui`;ctx.fillText(icon[0],x+pad,y+h-pad-fs*.18)}
  ctx.restore();
}
function drawBorder({rect,bd}){const ctx=G.ctx;const {x,y,w,h}=rect;const line=(spec,x1,y1,x2,y2)=>{if(!spec)return;const [wd,col]=spec.split(' ');ctx.strokeStyle=col&&!(PAL.dark&&col==='#000000')?col:PAL.text;ctx.lineWidth=+wd||1;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()};
  line(bd.t,x,y+.5,x+w,y+.5);line(bd.b,x,y+h-.5,x+w,y+h-.5);line(bd.l,x+.5,y,x+.5,y+h);line(bd.r,x+w-.5,y,x+w-.5,y+h)}
function drawOverlays(sh,rows,cols){
  const ctx=G.ctx;const s=UI.sel;
  const rr=g=>{const x=colScreenX(g.c1),y=rowScreenY(g.r1);return{x,y,w:G.colX[g.c2+1]-G.colX[g.c1],h:G.rowY[Math.min(g.r2,G.nR-1)+1]-G.rowY[g.r1]}};
  // filtro: botões
  if(sh.filter){const f=sh.filter;for(let c=f.c1;c<=f.c2;c++){if(!cols.includes(c)||!rows.includes(f.r1))continue;const b=cellRect(f.r1,c);const sz=Math.min(16*UI.zoom,b.h-4);const bx=b.x+b.w-sz-3,by=b.y+(b.h-sz)/2;ctx.fillStyle=PAL.dark?'#2D353A':'#F4F6F7';ctx.strokeStyle=f.crit&&f.crit[c]?PAL.accent:PAL.line;ctx.lineWidth=1;ctx.fillRect(bx,by,sz,sz);ctx.strokeRect(bx+.5,by+.5,sz-1,sz-1);ctx.fillStyle=f.crit&&f.crit[c]?PAL.accent:PAL.muted;ctx.beginPath();if(f.crit&&f.crit[c]){ctx.moveTo(bx+sz*.25,by+sz*.3);ctx.lineTo(bx+sz*.75,by+sz*.3);ctx.lineTo(bx+sz*.55,by+sz*.55);ctx.lineTo(bx+sz*.55,by+sz*.78);ctx.lineTo(bx+sz*.45,by+sz*.72);ctx.lineTo(bx+sz*.45,by+sz*.55)}else{ctx.moveTo(bx+sz*.28,by+sz*.4);ctx.lineTo(bx+sz*.72,by+sz*.4);ctx.lineTo(bx+sz*.5,by+sz*.66)}ctx.fill()}}
  // spill
  const ac=sh.cells.get(K(UI.act.r,UI.act.c));let spillA=null;
  if(ac&&ac.arr)spillA={r:UI.act.r,c:UI.act.c,cell:ac};else{const sk=sh.spill.get(K(UI.act.r,UI.act.c));if(sk!=null)spillA={r:KR(sk),c:KC(sk),cell:sh.cells.get(sk)}}
  if(spillA&&spillA.cell&&spillA.cell.arr){const g={r1:spillA.r,c1:spillA.c,r2:spillA.r+spillA.cell.arr.length-1,c2:spillA.c+spillA.cell.arr[0].length-1};const b=rr(g);ctx.setLineDash([4,3]);ctx.strokeStyle='#2F7DE1';ctx.lineWidth=1.5;ctx.strokeRect(b.x+.5,b.y+.5,b.w-1,b.h-1);ctx.setLineDash([])}
  // referências destacadas (edição / rastrear)
  const hls=UI.ed?UI.hlRefs:(UI.trace||[]);
  for(const h of hls){if(h.sh&&h.sh!==sh)continue;const b=rr(h.g);ctx.fillStyle=h.color+'22';ctx.fillRect(b.x,b.y,b.w,b.h);ctx.strokeStyle=h.color;ctx.lineWidth=2;ctx.strokeRect(b.x+1,b.y+1,b.w-2,b.h-2);if(!UI.ed){ctx.fillStyle=h.color;ctx.fillRect(b.x-2,b.y-2,5,5)}}
  // seleção
  if(!UI.ed||!UI.point){
    const b=rr(s);const multi=!(s.r1===s.r2&&s.c1===s.c2)&&!mergeEq(sh,s);
    if(multi){ctx.fillStyle=PAL['accent-soft'];ctx.fillRect(b.x,b.y,b.w,b.h);const a=cellRect(UI.act.r,UI.act.c);ctx.fillStyle=PAL.cell;ctx.globalAlpha=.6;ctx.fillRect(a.x+1,a.y+1,a.w-2,a.h-2);ctx.globalAlpha=1}
    ctx.strokeStyle=PAL.accent;ctx.lineWidth=2;const bb=multi?b:cellRect(UI.act.r,UI.act.c);ctx.strokeRect(bb.x+1,bb.y+1,bb.w-2,bb.h-2);
    if(!UI.ed){const hs=Math.max(6,7*UI.zoom);ctx.fillStyle=PAL.accent;ctx.fillRect(bb.x+bb.w-hs/2-1,bb.y+bb.h-hs/2-1,hs,hs);ctx.strokeStyle=PAL.cell;ctx.lineWidth=1;ctx.strokeRect(bb.x+bb.w-hs/2-1.5,bb.y+bb.h-hs/2-1.5,hs+1,hs+1)}
  }
  if(UI.fill){const b=rr(UI.fill);ctx.setLineDash([3,3]);ctx.strokeStyle=PAL.muted;ctx.lineWidth=1.5;ctx.strokeRect(b.x+.5,b.y+.5,b.w-1,b.h-1);ctx.setLineDash([])}
  if(UI.clip&&UI.clip.sid===sh.id&&UI.clip.ants){const b=rr(UI.clip.g);ctx.setLineDash([5,4]);ctx.lineDashOffset=-(performance.now()/60)%9;ctx.strokeStyle=PAL.accent;ctx.lineWidth=1.5;ctx.strokeRect(b.x+1,b.y+1,b.w-2,b.h-2);ctx.setLineDash([])}
  // validação: seta de lista
  const d=dvFor(sh,UI.act.r,UI.act.c);if(d&&d.type==='list'&&!UI.ed){const a=cellRect(UI.act.r,UI.act.c);const sz=Math.min(18,a.h);ctx.fillStyle=PAL.panel2||'#eee';ctx.fillRect(a.x+a.w+2,a.y,sz,sz);ctx.strokeStyle=PAL.line;ctx.strokeRect(a.x+a.w+2.5,a.y+.5,sz-1,sz-1);ctx.fillStyle=PAL.muted;ctx.beginPath();ctx.moveTo(a.x+a.w+2+sz*.28,a.y+sz*.4);ctx.lineTo(a.x+a.w+2+sz*.72,a.y+sz*.4);ctx.lineTo(a.x+a.w+2+sz*.5,a.y+sz*.66);ctx.fill()}
}
const mergeEq=(sh,s)=>sh.merges.some(m=>m.r1===s.r1&&m.c1===s.c1&&m.r2===s.r2&&m.c2===s.c2);
function drawHeaders(sh,cols,rows){
  const ctx=G.ctx;const hw=HW(),hh=HH();const s=UI.sel;
  ctx.fillStyle=PAL.hdr;ctx.fillRect(0,0,G.w,hh);ctx.fillRect(0,0,hw,G.h);
  ctx.font=`500 ${(11*UI.zoom).toFixed(1)}px "IBM Plex Sans", system-ui, sans-serif`;ctx.textBaseline='middle';
  const f=fz();
  ctx.save();ctx.beginPath();ctx.rect(hw,0,G.w-hw,hh);ctx.clip();
  for(const c of cols){const w=G.colX[c+1]-G.colX[c];if(!w)continue;const x=colScreenX(c);if(x+w<hw)continue;const on=c>=s.c1&&c<=s.c2;const full=on&&s.r1===0&&s.r2>=G.nR-1;if(on){ctx.fillStyle=full?PAL.accent:PAL['hdr-sel'];ctx.fillRect(x,0,w,hh)}ctx.fillStyle=full?'#fff':on?PAL['hdr-sel-text']:PAL['hdr-text'];const t=colName(c);ctx.fillText(t,x+(w-ctx.measureText(t).width)/2,hh/2+1);ctx.fillStyle=PAL.line;ctx.fillRect(x+w-1,0,1,hh)}
  ctx.restore();ctx.save();ctx.beginPath();ctx.rect(0,hh,hw,G.h-hh);ctx.clip();
  for(const r of rows){const h=G.rowY[r+1]-G.rowY[r];if(!h)continue;const y=rowScreenY(r);const on=r>=s.r1&&r<=s.r2;const full=on&&s.c1===0&&s.c2>=G.nC-1;if(on){ctx.fillStyle=full?PAL.accent:PAL['hdr-sel'];ctx.fillRect(0,y,hw,h)}ctx.fillStyle=full?'#fff':on?PAL['hdr-sel-text']:(sh.fhidden.has(r+1)?PAL.accent:PAL['hdr-text']);const t=String(r+1);ctx.fillText(t,hw-6-ctx.measureText(t).width,y+h/2+1);ctx.fillStyle=PAL.line;ctx.fillRect(0,y+h-1,hw,1)}
  ctx.restore();
  ctx.fillStyle=PAL.line;ctx.fillRect(0,hh-1,G.w,1);ctx.fillRect(hw-1,0,1,G.h);
  ctx.fillStyle=PAL.hdr;ctx.fillRect(0,0,hw-1,hh-1);ctx.fillStyle=PAL.faint;ctx.beginPath();ctx.moveTo(hw-5,hh-5);ctx.lineTo(hw-5,hh-14);ctx.lineTo(hw-14,hh-5);ctx.fill();
  ctx.textBaseline='alphabetic';
}

/* ---- navegação/seleção ---- */
function setSel(r1,c1,r2=r1,c2=c1,act){const sh=curSheet();UI.sel=normR({r1,c1,r2,c2});
  // expandir por mesclagens
  let changed=true,g=UI.sel;while(changed){changed=false;for(const m of sh.merges){if(m.r1<=g.r2&&m.r2>=g.r1&&m.c1<=g.c2&&m.c2>=g.c1){const n={r1:Math.min(g.r1,m.r1),c1:Math.min(g.c1,m.c1),r2:Math.max(g.r2,m.r2),c2:Math.max(g.c2,m.c2)};if(n.r1!==g.r1||n.r2!==g.r2||n.c1!==g.c1||n.c2!==g.c2){g=n;changed=true}}}}UI.sel=g;
  if(act)UI.act=act;UI.trace=null;onSelChange()}
function selectCell(r,c,extend){r=clamp(r,0,1048575);c=clamp(c,0,MAXC-1);if(extend){setSel(UI.anc.r,UI.anc.c,r,c)}else{UI.anc={r,c};UI.act={r,c};setSel(r,c,r,c,{r,c})}ensureVisible(extend?r:UI.act.r,extend?c:UI.act.c)}
function ensureVisible(r,c){buildGeo();if(r>=G.nR-50||c>=G.nC-5){const sh=curSheet();sh.maxR=Math.max(sh.maxR,r);sh.maxC=Math.max(sh.maxC,c);buildGeo()}
  const sc=scr();const f=fz();const hw=HW(),hh=HH();const fw=G.colX[f.c],fh=G.rowY[f.r];
  if(c>=f.c){const x=G.colX[c],x2=G.colX[c+1];const viewW=sc.clientWidth-hw-fw;if(x-fw<sc.scrollLeft)sc.scrollLeft=x-fw;else if(x2-fw>sc.scrollLeft+viewW)sc.scrollLeft=x2-fw-viewW}
  if(r>=f.r){const y=G.rowY[r],y2=G.rowY[r+1];const viewH=sc.clientHeight-hh-fh;if(y-fh<sc.scrollTop)sc.scrollTop=y-fh;else if(y2-fh>sc.scrollTop+viewH)sc.scrollTop=y2-fh-viewH}
  draw()}
function moveAct(dr,dc,extend){const sh=curSheet();let {r,c}=extend?UI.ext||UI.act:UI.act;
  const m=mergeAt(sh,r,c);if(m&&!extend){if(dr>0)r=m.r2;if(dc>0)c=m.c2}
  do{r+=dr;c+=dc}while(dr&&r>0&&r<1048575&&rh(sh,r)===0||dc&&c>0&&cw(sh,c)===0);
  r=Math.max(0,r);c=Math.max(0,c);
  if(extend){UI.ext={r,c};setSel(UI.anc.r,UI.anc.c,r,c);ensureVisible(r,c)}else{UI.ext=null;selectCell(r,c)}}
function jump(dr,dc,extend){const sh=curSheet();let {r,c}=extend?UI.ext||UI.act:UI.act;const filled=(i,j)=>{const v=getVal(sh,i,j);return v!=null&&v!==''};
  const maxR=Math.max(sh.maxR,0),maxC=Math.max(sh.maxC,0);
  const step=()=>{r+=dr;c+=dc};const inb=()=>r>=0&&c>=0&&r<=maxR+1&&c<=maxC+1;
  if(filled(r,c)&&filled(r+dr,c+dc)){while(inb()&&filled(r+dr,c+dc))step()}else{step();while(inb()&&!filled(r,c))step();if(!inb()){r=dr>0?maxR:dr<0?0:r;c=dc>0?maxC:dc<0?0:c}}
  r=clamp(r,0,1048575);c=clamp(c,0,MAXC-1);if(extend){UI.ext={r,c};setSel(UI.anc.r,UI.anc.c,r,c);ensureVisible(r,c)}else selectCell(r,c)}
function onSelChange(){updateNameBox();updateFx();updateStatus();updateRibbonState();draw()}
function updateNameBox(){const s=UI.sel;const nb=$('#namebox');if(document.activeElement===nb)return;const name=Object.entries(WB.names).find(([n,d])=>d.ref&&d.ref.replace(/\$/g,'').split('!').pop()===rangeA1(s));nb.value=name?name[0]:(s.r1===s.r2&&s.c1===s.c2)||mergeEq(curSheet(),s)?A1(UI.act.r,UI.act.c):(s.r1===0&&s.r2>=G.nR-1?colName(s.c1)+':'+colName(s.c2):rangeA1(s))}
function updateFx(){if(UI.ed)return;const sh=curSheet();const cell=cellAt(sh,UI.act.r,UI.act.c);let t=cell?cell.raw:'';if(!t){const sk=sh.spill.get(K(UI.act.r,UI.act.c));if(sk!=null){const ac=sh.cells.get(sk);t=ac?ac.raw:'';$('#fx').classList.add('ghost')}else $('#fx').classList.remove('ghost')}else $('#fx').classList.remove('ghost');
  if(cell&&cell.v!=null&&!cell.ast&&typeof cell.v==='number'&&cell.st&&isDateFmt(cell.st.nf)){t=fmtValue(cell.v,cell.v%1?'dd/mm/yyyy hh:mm':'dd/mm/yyyy')}
  else if(cell&&!cell.ast&&typeof cell.v==='number'&&cell.raw&&cell.raw[0]!=="'"){if(cell.st&&/%/.test(cell.st.nf||''))t=fmtGeneral(cell.v*100)+'%';else t=fmtGeneral(cell.v)}
  $('#fx').value=t}
function updateStatus(){const sh=curSheet();const s=UI.sel;let n=0,cnt=0,sum=0,mn=Infinity,mx=-Infinity;const lim=(s.r2-s.r1+1)*(s.c2-s.c1+1);
  if(lim>1&&lim<4e5){const r2=Math.min(s.r2,Math.max(sh.maxR,0)),c2=Math.min(s.c2,Math.max(sh.maxC,0));for(let r=s.r1;r<=r2;r++){if(sh.fhidden.has(r)||sh.hidden.has(r))continue;for(let c=s.c1;c<=c2;c++){const v=getVal(sh,r,c);if(v==null||v==='')continue;cnt++;if(typeof v==='number'){n++;sum+=v;if(v<mn)mn=v;if(v>mx)mx=v}}}}
  const el=$('#stat');if(!el)return;const f=x=>fmtValue(x,Math.abs(x)>=1000?'#,##0.00':'General');
  el.innerHTML=lim>1&&cnt?(n?`<span>Média <b>${esc(f(sum/n))}</b></span><span>Contagem <b>${cnt}</b></span><span>Soma <b>${esc(f(sum))}</b></span><span class="opt">Mín <b>${esc(f(mn))}</b></span><span class="opt">Máx <b>${esc(f(mx))}</b></span>`:`<span>Contagem <b>${cnt}</b></span>`):(sh.filter&&sh.fhidden.size?`<span>Filtro: ${sh.filter.r2-sh.filter.r1-sh.fhidden.size} de ${sh.filter.r2-sh.filter.r1} registros</span>`:'<span>Pronto</span>')}

/* ---- edição ---- */
function startEdit(initial,mode='enter'){
  if(!guardEdit())return;
  const sh=curSheet();const {r,c}=UI.act;const ed=$('#cellEd');
  const cell=cellAt(sh,r,c);if(sh.spill.has(K(r,c))&&initial==null){toast('Esta célula faz parte de um despejo; edite a célula de origem');return}
  UI.ed={r,c,mode,orig:cell?cell.raw:''};
  ed.value=initial!=null?initial:$('#fx').value;
  const st=cell&&cell.st||{};ed.style.font=fontOf(st);ed.style.textAlign='left';
  ed.style.display='block';positionEditor();ed.focus();ed.setSelectionRange(ed.value.length,ed.value.length);
  $('#fx').value=ed.value;edInput();draw();
}
function positionEditor(){if(!UI.ed)return;const ed=$('#cellEd');const r=cellRect(UI.ed.r,UI.ed.c);const host=$('#gridHost');
  const ctx=G.ctx;ctx.font=ed.style.font;const lines=ed.value.split('\n');const tw=Math.max(...lines.map(l=>ctx.measureText(l).width))+18;
  const w=Math.min(Math.max(r.w+1,tw),host.clientWidth-r.x-4);ed.style.left=(r.x-1)+'px';ed.style.top=(r.y-1)+'px';ed.style.width=Math.max(w,r.w+2)+'px';
  const lh=parseFloat(ed.style.font.match(/([\d.]+)px/)[1])*1.3;ed.style.height=Math.max(r.h+2,lines.length*lh+6)+'px';positionAC()}
function commitEdit(dr=0,dc=0){
  if(!UI.ed)return;const sh=curSheet();const {r,c,orig}=UI.ed;let v=$('#cellEd').value;
  if(v[0]==='='){v=autoClose(v)}
  hideAC();
  if(!dvCheck(sh,r,c,v)){const d=dvFor(sh,r,c);if(d&&d.strict!==false){toast(d.msg||'Valor não permitido pela validação de dados','err');return}}
  closeEditor();
  if(v!==orig){
    beginTx('Editar '+A1(r,c));
    // auto-expansão de tabela
    const t=sh.tables.find(t=>r===t.r2+1&&c>=t.c1&&c<=t.c2&&v!=='');
    setRaw(sh,r,c,v);
    if(t){t.r2=r;// propagar colunas calculadas
      for(let j=t.c1;j<=t.c2;j++){const above=cellAt(sh,r-1,j);if(j!==c&&above&&above.ast&&!rawOf(sh,r,j))setRaw(sh,r,j,shiftFormula(above.raw,1,0))}}
    // fórmula em tabela: propagar para coluna
    const tt=sh.tables.find(t=>inRange(t,r,c)&&r>t.r1);if(tt&&v[0]==='='&&/\[@/.test(v)){for(let i=tt.r1+1;i<=tt.r2;i++)if(i!==r&&!rawOf(sh,i,c))setRaw(sh,i,c,v)}
    commitTx();
  }
  if(dr||dc)moveAct(dr,dc);else onSelChange();
  focusGrid();
}
function autoClose(v){let d=0,q=false;for(const ch of v){if(ch==='"')q=!q;else if(!q){if(ch==='(')d++;else if(ch===')')d--}}if(q)v+='"';while(d-->0)v+=')';return v}
function cancelEdit(){closeEditor();updateFx();focusGrid();draw()}
function closeEditor(){UI.ed=null;UI.point=null;UI.hlRefs=[];const ed=$('#cellEd');ed.style.display='none';hideAC()}
function focusGrid(){const k=$('#kbd');if(document.activeElement!==k)k.focus({preventScroll:true})}
function edInput(src){const ed=$('#cellEd');const fx=$('#fx');if(src==='fx'){if(!UI.ed){startEdit(fx.value,'edit');return}ed.value=fx.value}else fx.value=ed.value;
  // refs destacadas
  UI.hlRefs=[];const v=ed.value;
  if(v[0]==='='){let i=0;try{for(const t of tokenize(v.slice(1))){if(t.t==='ref'){const sh=t.sh?sheetByName(t.sh):curSheet();if(!sh)continue;const g=t.b?normR({r1:t.a.r,c1:t.a.c,r2:t.wholeCol?Math.max(curSheet().maxR,t.a.r):t.b.r,c2:t.wholeRow?Math.max(curSheet().maxC,0):t.b.c}):{r1:t.a.r,c1:t.a.c,r2:t.a.r,c2:t.a.c};UI.hlRefs.push({sh,g,color:REFCOL[i++%REFCOL.length]})}}}catch(e){}}
  positionEditor();updateAC();draw()}
function pointable(){const ed=UI.fxActive?$('#fx'):$('#cellEd');const v=ed.value;if(v[0]!=='=')return false;const p=ed.selectionStart;if(UI.point&&p===UI.point.end)return true;const before=v.slice(0,p).replace(/\s+$/,'');const ch=before[before.length-1];return '=(;,+-*/^&<>:'.includes(ch)}
function insertPointRef(g,sh){const ed=UI.fxActive?$('#fx'):$('#cellEd');let v=ed.value;let txt2=(sh&&sh!==curSheetEditing()?quoteSheet(sh.name)+'!':'')+rangeA1(g);
  let st=ed.selectionStart,en=ed.selectionEnd;if(UI.point&&UI.point.end===st){st=UI.point.start}
  v=v.slice(0,st)+txt2+v.slice(en);ed.value=v;const p=st+txt2.length;ed.setSelectionRange(p,p);UI.point={start:st,end:p,g};edInput(UI.fxActive?'fx':undefined)}
function curSheetEditing(){return UI.ed&&UI.ed.sheet?UI.ed.sheet:curSheet()}

/* ---- autocompletar ---- */
let AC={items:[],idx:0,word:null};
function acCandidates(prefix){const P=stripAcc(prefix).toUpperCase();const out=[];const seen=new Set();
  for(const F of FN_LIST()){const names=[EN2PT[F.en],F.en].filter(Boolean);for(const nm of names){if(stripAcc(nm).toUpperCase().startsWith(P)&&!seen.has(nm)){seen.add(nm);out.push({t:'fn',name:nm,F})}}}
  for(const s of WB.sheets)for(const t of s.tables)if(stripAcc(t.name).toUpperCase().startsWith(P))out.push({t:'tbl',name:t.name});
  for(const n in WB.names)if(n.startsWith(P))out.push({t:'name',name:n});
  out.sort((a,b)=>(a.t!=='fn')-(b.t!=='fn')||(a.F&&EN2PT[a.F.en]===a.name?0:1)-(b.F&&EN2PT[b.F.en]===b.name?0:1)||a.name.length-b.name.length||a.name.localeCompare(b.name));return out.slice(0,40)}
function updateAC(){const ed=UI.fxActive?$('#fx'):$('#cellEd');const v=ed.value;const p=ed.selectionStart;if(v[0]!=='='){hideAC();return}
  const before=v.slice(0,p);const m=/([A-Za-z_À-ÿ][\wÀ-ÿ.]*)$/.exec(before);
  // assinatura
  updateSig(before);
  if(!m||/[\d]$/.test(m[1])&&parseA1(m[1])||/"[^"]*$/.test(before.replace(/"[^"]*"/g,''))){hideAC(true);return}
  const prev=before.slice(0,before.length-m[1].length);if(/[A-Za-z0-9_$!']$/.test(prev)){hideAC(true);return}
  AC.items=acCandidates(m[1]);AC.word=m[1];AC.idx=0;if(!AC.items.length){hideAC(true);return}
  const el=$('#ac');el.innerHTML='';AC.items.forEach((it,i)=>{el.append(h('div',{class:'it'+(i===0?' on':''),onmousedown:e=>{e.preventDefault();AC.idx=i;acAccept()}},h('b',{},it.name),h('span',{},it.t==='fn'?(it.F.desc+(it.name!==it.F.en?' · '+it.F.en:'')):it.t==='tbl'?'Tabela':'Nome definido')))});
  el.style.display='block';positionAC()}
function positionAC(){const el=$('#ac');if(el.style.display!=='block'&&$('#sig').style.display!=='block')return;const host=$('#gridHost').getBoundingClientRect();let x,y;
  if(UI.fxActive){const r=$('#fx').getBoundingClientRect();x=r.left-host.left+30;y=r.bottom-host.top+2}else{const ed=$('#cellEd');x=parseFloat(ed.style.left);y=parseFloat(ed.style.top)+parseFloat(ed.style.height)+2}
  el.style.left=Math.max(0,Math.min(x,host.width-300))+'px';el.style.top=y+'px';const sg=$('#sig');sg.style.left=Math.max(0,Math.min(x,host.width-340))+'px';sg.style.top=(UI.fxActive?y:Math.max(0,parseFloat($('#cellEd').style.top)-28))+'px';if(UI.fxActive&&el.style.display==='block')sg.style.top=(y+Math.min(262,el.offsetHeight)+4)+'px'}
function hideAC(keepSig){$('#ac').style.display='none';AC.items=[];if(!keepSig)$('#sig').style.display='none'}
function acMove(d){if(!AC.items.length)return false;AC.idx=(AC.idx+d+AC.items.length)%AC.items.length;$$('#ac .it').forEach((e,i)=>e.classList.toggle('on',i===AC.idx));$$('#ac .it')[AC.idx].scrollIntoView({block:'nearest'});return true}
function acAccept(){const it=AC.items[AC.idx];if(!it)return false;const ed=UI.fxActive?$('#fx'):$('#cellEd');const p=ed.selectionStart;const v=ed.value;const st=p-AC.word.length;const ins=it.t==='fn'?it.name+'(':it.name+(it.t==='tbl'?'[':'');ed.value=v.slice(0,st)+ins+v.slice(p);ed.setSelectionRange(st+ins.length,st+ins.length);hideAC();edInput(UI.fxActive?'fx':undefined);return true}
function updateSig(before){const sg=$('#sig');let depth=0,arg=0,fn=null;const stack=[];
  try{const T=tokenize(before.slice(1));for(let i=0;i<T.length;i++){const t=T[i];if(t.t==='func'){stack.push({n:t.v,arg:0})}else if(t.t==='lp'&&!(T[i-1]&&T[i-1].t==='func')&&!(T[i-1]&&T[i-1].t==='ws'&&T[i-2]&&T[i-2].t==='func'))stack.push(null);else if(t.t==='rp')stack.pop();else if(t.t==='sep'&&stack.length&&stack[stack.length-1])stack[stack.length-1].arg++}}catch(e){}
  const top=[...stack].reverse().find(x=>x);if(!top){sg.style.display='none';return}const F=FN[canonFn(top.n)];if(!F){sg.style.display='none';return}
  const parts=F.sig.split(';').map(s=>s.trim()).filter(Boolean);let ai=top.arg;if(ai>=parts.length&&parts.some(p=>p.includes('…')))ai=parts.length-2;
  sg.innerHTML=esc(top.n.toUpperCase())+'('+parts.map((p,i)=>i===ai?'<b>'+esc(p)+'</b>':esc(p)).join('; ')+')<div style="opacity:.75;margin-top:2px">'+esc(F.desc)+'</div>';sg.style.display='block';positionAC()}
