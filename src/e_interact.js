/* ================= interação com a grade ================= */
function gridPos(e){const r=$('#gridHost').getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function hitExtras(x,y){const sh=curSheet();const {r,c}=hit(x,y);const hw=HW(),hh=HH();
  if(x<hw&&y<hh)return{t:'corner'};
  if(y<hh){// borda de coluna?
    const cx=colScreenX(c),w=G.colX[c+1]-G.colX[c];if(x>cx+w-5)return{t:'colEdge',c};if(x<cx+4&&c>0)return{t:'colEdge',c:c-1};return{t:'colHdr',c}}
  if(x<hw){const ry=rowScreenY(r),h=G.rowY[r+1]-G.rowY[r];if(y>ry+h-4)return{t:'rowEdge',r};if(y<ry+3&&r>0)return{t:'rowEdge',r:r-1};return{t:'rowHdr',r}}
  // alça de preenchimento
  const s=UI.sel;const bb=(s.r1===s.r2&&s.c1===s.c2)||mergeEq(sh,s)?cellRect(UI.act.r,UI.act.c):{x:colScreenX(s.c1),y:rowScreenY(s.r1),w:G.colX[s.c2+1]-G.colX[s.c1],h:G.rowY[s.r2+1]-G.rowY[s.r1]};
  if(Math.abs(x-(bb.x+bb.w))<7&&Math.abs(y-(bb.y+bb.h))<7)return{t:'fill'};
  // botão de filtro
  if(sh.filter&&r===sh.filter.r1&&c>=sh.filter.c1&&c<=sh.filter.c2){const b=cellRect(r,c);const sz=Math.min(16*UI.zoom,b.h-4);if(x>=b.x+b.w-sz-4&&x<=b.x+b.w-2)return{t:'filterBtn',r,c}}
  // seta de validação
  const d=dvFor(sh,UI.act.r,UI.act.c);if(d&&d.type==='list'){const a=cellRect(UI.act.r,UI.act.c);if(x>=a.x+a.w&&x<=a.x+a.w+20&&y>=a.y&&y<=a.y+18)return{t:'dvBtn'}}
  return{t:'cell',r,c}}
let DRAG=null;
function gridDown(e){
  const p=gridPos(e);const hx=hitExtras(p.x,p.y);const sh=curSheet();
  if(e.button===2){if(hx.t==='cell'&&!inRange(UI.sel,hx.r,hx.c))selectCell(hx.r,hx.c);else if(hx.t==='colHdr'&&!(hx.c>=UI.sel.c1&&hx.c<=UI.sel.c2&&UI.sel.r1===0)){UI.anc={r:0,c:hx.c};setSel(0,hx.c,G.nR-1,hx.c,{r:0,c:hx.c})}else if(hx.t==='rowHdr'&&!(hx.r>=UI.sel.r1&&hx.r<=UI.sel.r2&&UI.sel.c1===0)){UI.anc={r:hx.r,c:0};setSel(hx.r,0,hx.r,G.nC-1,{r:hx.r,c:0})}return}
  const touch=e.pointerType==='touch';
  if(UI.ed&&hx.t==='cell'&&pointable()){e.preventDefault();UI.pointDrag={r:hx.r,c:hx.c};insertPointRef({r1:hx.r,c1:hx.c,r2:hx.r,c2:hx.c});DRAG={t:'point',r0:hx.r,c0:hx.c};capture(e);return}
  if(UI.ed){commitEdit();}
  hideMenus();
  switch(hx.t){
    case'corner':setSel(0,0,G.nR-1,G.nC-1,{r:0,c:0});break;
    case'colEdge':DRAG={t:'colW',c:hx.c,x0:p.x,w0:cw(sh,hx.c)/UI.zoom};capture(e);break;
    case'rowEdge':DRAG={t:'rowH',r:hx.r,y0:p.y,h0:rh(sh,hx.r)/UI.zoom};capture(e);break;
    case'colHdr':if(e.shiftKey)setSel(0,UI.anc.c,G.nR-1,hx.c);else{UI.anc={r:0,c:hx.c};UI.act={r:Math.max(0,scrTopRow()),c:hx.c};UI.act.r=0;setSel(0,hx.c,G.nR-1,hx.c,{r:0,c:hx.c})}DRAG=touch?null:{t:'colSel'};capture(e);break;
    case'rowHdr':if(e.shiftKey)setSel(UI.anc.r,0,hx.r,G.nC-1);else{UI.anc={r:hx.r,c:0};setSel(hx.r,0,hx.r,G.nC-1,{r:hx.r,c:0})}DRAG=touch?null:{t:'rowSel'};capture(e);break;
    case'fill':DRAG={t:'fill',src:{...UI.sel}};capture(e);break;
    case'filterBtn':selectCell(hx.r,hx.c);openFilterMenu(hx.c,e);break;
    case'dvBtn':openDvList(e);break;
    case'cell':
      if(UI.painter){applyPainter(hx.r,hx.c);return}
      if(touch){DRAG={t:'tap',r:hx.r,c:hx.c,x:p.x,y:p.y,shift:e.shiftKey};return}
      if(e.shiftKey)selectCell(hx.r,hx.c,true);else selectCell(hx.r,hx.c);DRAG={t:'sel'};capture(e);break;
  }
  focusGrid();
}
function scrTopRow(){return 0}
function capture(e){try{e.target.setPointerCapture(e.pointerId)}catch(_){}}
function gridMove(e){const p=gridPos(e);
  if(!DRAG){if(e.pointerType==='mouse'){const hx=hitExtras(p.x,p.y);scr().style.cursor=hx.t==='colEdge'?'col-resize':hx.t==='rowEdge'?'row-resize':hx.t==='fill'?'crosshair':hx.t==='colHdr'?'s-resize':hx.t==='rowHdr'?'e-resize':UI.painter?'copy':'cell'}return}
  const sh=curSheet();autoScroll(p);
  switch(DRAG.t){
    case'colW':{const w=Math.max(0,DRAG.w0+(p.x-DRAG.x0)/UI.zoom);const cs=UI.sel.r1===0&&UI.sel.r2>=G.nR-1&&DRAG.c>=UI.sel.c1&&DRAG.c<=UI.sel.c2?range(UI.sel.c1,UI.sel.c2):[DRAG.c];cs.forEach(c=>sh.colW[c]=Math.round(w));geoDirty();draw();break}
    case'rowH':{const hh=Math.max(0,DRAG.h0+(p.y-DRAG.y0)/UI.zoom);sh.rowH[DRAG.r]=Math.round(hh);geoDirty();draw();break}
    case'sel':{const {r,c}=hit(Math.max(HW()+1,p.x),Math.max(HH()+1,p.y));if(r>=0&&c>=0){UI.ext={r,c};setSel(UI.anc.r,UI.anc.c,r,c)}break}
    case'colSel':{const {c}=hit(Math.max(HW()+1,p.x),HH()+1);if(c>=0)setSel(0,UI.anc.c,G.nR-1,c);break}
    case'rowSel':{const {r}=hit(HW()+1,Math.max(HH()+1,p.y));if(r>=0)setSel(UI.anc.r,0,r,G.nC-1);break}
    case'point':{const {r,c}=hit(Math.max(HW()+1,p.x),Math.max(HH()+1,p.y));if(r>=0&&c>=0)insertPointRef(normR({r1:DRAG.r0,c1:DRAG.c0,r2:r,c2:c}));break}
    case'fill':{const {r,c}=hit(Math.max(HW()+1,p.x),Math.max(HH()+1,p.y));const s=DRAG.src;let g={...s};
      const dDown=r-s.r2,dUp=s.r1-r,dRight=c-s.c2,dLeft=s.c1-c;const mx=Math.max(dDown,dUp,dRight,dLeft);
      if(mx<=0)g=null;else if(mx===dDown)g={...s,r2:r};else if(mx===dUp)g={...s,r1:r};else if(mx===dRight)g={...s,c2:c};else g={...s,c1:c};
      UI.fill=g?normR(g):null;draw();break}
  }
}
function range(a,b){const o=[];for(let i=a;i<=b;i++)o.push(i);return o}
let ASC=null;function autoScroll(p){const host=$('#gridHost');const W=host.clientWidth,H=host.clientHeight;let dx=0,dy=0;if(p.x>W-20)dx=20;else if(p.x<HW()&&DRAG&&DRAG.t!=='rowSel'&&DRAG.t!=='rowH')dx=-20;if(p.y>H-20)dy=20;else if(p.y<HH()&&DRAG&&DRAG.t!=='colSel'&&DRAG.t!=='colW')dy=-20;
  if(['sel','fill','point','colSel','rowSel'].includes(DRAG&&DRAG.t)&&(dx||dy)){scr().scrollLeft+=dx;scr().scrollTop+=dy}}
function gridUp(e){
  if(!UI.ed&&!DLG_CLOSE&&!$('.menu'))setTimeout(()=>{if(!UI.ed&&!DLG_CLOSE)focusGrid()},0);
  if(!DRAG)return;const d=DRAG;DRAG=null;const sh=curSheet();
  if(d.t==='tap'){const p=gridPos(e);if(Math.hypot(p.x-d.x,p.y-d.y)<10){const now=performance.now();if(UI.lastTap&&now-UI.lastTap.t<350&&UI.lastTap.r===d.r&&UI.lastTap.c===d.c){startEdit(null,'edit')}else selectCell(d.r,d.c,d.shift)}UI.lastTap={t:performance.now(),r:d.r,c:d.c};return}
  if(d.t==='colW'||d.t==='rowH'){beginTx('Redimensionar');snapTx();commitTx();save()}
  if(d.t==='fill'&&UI.fill){const tgt=UI.fill;UI.fill=null;doFill(d.src,tgt)}
  UI.fill=null;draw()}
function gridDbl(e){const p=gridPos(e);const hx=hitExtras(p.x,p.y);
  if(hx.t==='colEdge'){autoFitCols(UI.sel.r1===0&&UI.sel.r2>=G.nR-1&&hx.c>=UI.sel.c1&&hx.c<=UI.sel.c2?range(UI.sel.c1,UI.sel.c2):[hx.c]);return}
  if(hx.t==='rowEdge'){const sh=curSheet();delete sh.rowH[hx.r];geoDirty();draw();return}
  if(hx.t==='fill'){// preencher até o fim dos dados adjacentes
    const sh=curSheet();const s=UI.sel;let r=s.r2;const c=s.c1>0?s.c1-1:s.c2+1;while(getVal(sh,r+1,c)!=null&&getVal(sh,r+1,c)!=='')r++;if(r>s.r2)doFill({...s},{...s,r2:r});return}
  if(hx.t==='cell')startEdit(null,'edit')}
function autoFitCols(cols){const sh=curSheet();const ctx=G.ctx;beginTx('Autoajustar');snapTx();
  for(const c of cols){let w=30;for(let r=0;r<=Math.min(sh.maxR,5000);r++){const cell=sh.cells.get(K(r,c));const v=getVal(sh,r,c);if(v==null||v==='')continue;const st=cell&&cell.st;ctx.font=fontOf(Object.assign({},st,{}));const t=fmtValue(v,st&&st.nf);w=Math.max(w,ctx.measureText(t).width/UI.zoom+12+(sh.filter&&r===sh.filter.r1?18:0))}sh.colW[c]=Math.min(480,Math.ceil(w))}
  commitTx();geoDirty();draw()}

/* ---- preencher (alça) ---- */
const SERIES=[MESES,MES3,DIAS,DIAS.map(d=>d.slice(0,3)),['seg','ter','qua','qui','sex','sáb','dom'],['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'].map(x=>x.toUpperCase())];
function doFill(src,tgt){const sh=curSheet();beginTx('Preencher');
  const vert=tgt.r1!==src.r1||tgt.r2!==src.r2;
  if(vert){const fwd=tgt.r2>src.r2;for(let c=src.c1;c<=src.c2;c++){const seq=[];for(let r=src.r1;r<=src.r2;r++)seq.push({r,c});fillLine(sh,seq,fwd?range(src.r2+1,tgt.r2).map(r=>({r,c})):range(tgt.r1,src.r1-1).reverse().map(r=>({r,c})),fwd,'r')}}
  else{const fwd=tgt.c2>src.c2;for(let r=src.r1;r<=src.r2;r++){const seq=[];for(let c=src.c1;c<=src.c2;c++)seq.push({r,c});fillLine(sh,seq,fwd?range(src.c2+1,tgt.c2).map(c=>({r,c})):range(tgt.c1,src.c1-1).reverse().map(c=>({r,c})),fwd,'c')}}
  commitTx();setSel(tgt.r1,tgt.c1,tgt.r2,tgt.c2)}
function fillLine(sh,seq,targets,fwd,axis){
  const cells=seq.map(p=>cellAt(sh,p.r,p.c));const vals=cells.map(c=>c?c.v:null);
  const allNum=vals.every(v=>typeof v==='number')&&cells.every(c=>c&&!c.ast);
  const n=seq.length;let step=null;
  if(allNum&&n>=2){const d=vals[1]-vals[0];let lin=true;for(let i=2;i<n;i++)if(Math.abs(vals[i]-vals[i-1]-d)>1e-9)lin=false;if(lin)step=d}
  if(allNum&&n===1&&cells[0].st&&isDateFmt(cells[0].st.nf))step=1;
  const textSeries=vals.map(v=>{if(typeof v!=='string')return null;for(const S of SERIES){const i=S.findIndex(x=>x.toLowerCase()===v.toLowerCase());if(i>=0)return{S,i,up:v===v.toUpperCase()&&v!==v.toLowerCase(),cap:v[0]===v[0].toUpperCase()}}return null});
  const numSuffix=vals.map(v=>typeof v==='string'&&/^(.*?)(\d+)$/.exec(v));
  targets.forEach((t,k)=>{const idx=k%n;const srcP=seq[fwd?idx:n-1-idx];const sc=cells[fwd?idx:n-1-idx];let raw;
    const kk=Math.floor(k/n)+1;
    if(step!=null){const base=fwd?vals[n-1]:vals[0];raw=+(base+(fwd?1:-1)*step*(k+1)).toFixed(10)}
    else if(sc&&sc.ast){const dr=t.r-srcP.r,dc=t.c-srcP.c;raw=shiftFormula(sc.raw,dr,dc)}
    else if(textSeries[fwd?idx:n-1-idx]){const ts=textSeries[fwd?idx:n-1-idx];const L=ts.S.length;let j=(ts.i+(fwd?1:-1)*(n===1?k+1:kk*n))%L;if(j<0)j+=L;let w=ts.S[j];if(ts.up)w=w.toUpperCase();else if(ts.cap)w=w[0].toUpperCase()+w.slice(1);raw=w}
    else if(numSuffix[fwd?idx:n-1-idx]&&!(sc&&sc.ast)){const m=numSuffix[fwd?idx:n-1-idx];const num2=+m[2]+(fwd?1:-1)*(n===1?k+1:kk*n);raw=m[1]+String(Math.max(0,num2)).padStart(m[2].length,'0')}
    else raw=sc?sc.raw:'';
    setRaw(sh,t.r,t.c,raw);if(sc&&sc.st){setStyle(sh,t.r,t.c,sc.st)}else if(cellAt(sh,t.r,t.c)?.st)setStyle(sh,t.r,t.c,{nf:null,b:null,bg:null})
  })}
function fillDir(dir){const sh=curSheet();const s=UI.sel;beginTx('Preencher');
  if(dir==='down'){for(let c=s.c1;c<=s.c2;c++){const src=cellAt(sh,s.r1,c);for(let r=s.r1+1;r<=s.r2;r++){setRaw(sh,r,c,src?(src.ast?shiftFormula(src.raw,r-s.r1,0):src.raw):'');if(src&&src.st)setStyle(sh,r,c,src.st)}}}
  else{for(let r=s.r1;r<=s.r2;r++){const src=cellAt(sh,r,s.c1);for(let c=s.c1+1;c<=s.c2;c++){setRaw(sh,r,c,src?(src.ast?shiftFormula(src.raw,0,c-s.c1):src.raw):'');if(src&&src.st)setStyle(sh,r,c,src.st)}}}
  commitTx()}

/* ---- área de transferência ---- */
function selCells(){const sh=curSheet();const s=UI.sel;const r2=Math.min(s.r2,Math.max(sh.maxR,s.r1)),c2=Math.min(s.c2,Math.max(sh.maxC,s.c1));return{sh,g:{r1:s.r1,c1:s.c1,r2:r2,c2:c2}}}
function tsvOf(sh,g){const rows=[];for(let r=g.r1;r<=g.r2;r++){if(sh.fhidden.has(r))continue;const row=[];for(let c=g.c1;c<=g.c2;c++){let t=displayOf(sh,r,c);if(/[\t\n"]/.test(t))t='"'+t.replace(/"/g,'""')+'"';row.push(t)}rows.push(row.join('\t'))}return rows.join('\n')}
function doCopy(cut){const {sh,g}=selCells();const data=[];for(let r=g.r1;r<=g.r2;r++){const row=[];for(let c=g.c1;c<=g.c2;c++){const cell=cellAt(sh,r,c);row.push(cell?{raw:cell.raw,st:cell.st?deep(cell.st):null,v:getVal(sh,r,c)}:{raw:'',st:null,v:getVal(sh,r,c)})}data.push(row)}
  UI.clip={sid:sh.id,g,data,cut,ants:true,tsv:tsvOf(sh,g)};antsLoop();return UI.clip.tsv}
function antsLoop(){if(!UI.clip||!UI.clip.ants)return;draw();setTimeout(()=>requestAnimationFrame(antsLoop),80)}
function doPaste(mode='all',text){const sh=curSheet();const s=UI.sel;
  if(text!=null&&(!UI.clip||text.replace(/\r/g,'')!==UI.clip.tsv)){// texto externo
    const rows=parseTSV(text);beginTx('Colar');for(let i=0;i<rows.length;i++)for(let j=0;j<rows[i].length;j++)setRaw(sh,s.r1+i,s.c1+j,rows[i][j]);commitTx();setSel(s.r1,s.c1,s.r1+rows.length-1,s.c1+Math.max(...rows.map(r=>r.length))-1);return}
  const cl=UI.clip;if(!cl)return toast('Área de transferência vazia');
  const R=cl.data.length,C=cl.data[0].length;const tr=mode==='transpose';
  let tR=tr?C:R,tC=tr?R:C;let rep=1,repc=1;const selR=s.r2-s.r1+1,selC=s.c2-s.c1+1;if(selR%tR===0&&selC%tC===0&&selR*selC>tR*tC&&selR<100000){rep=selR/tR;repc=selC/tC}
  beginTx('Colar');
  for(let a=0;a<rep;a++)for(let b=0;b<repc;b++)for(let i=0;i<R;i++)for(let j=0;j<C;j++){const d=cl.data[i][j];const ti=tr?j:i,tj=tr?i:j;const r=s.r1+a*tR+ti,c=s.c1+b*tC+tj;
    if(mode!=='formats'){let raw=d.raw;if(mode==='values'){raw=d.v==null?'':typeof d.v==='number'?d.v:isErr(d.v)?d.v.err:typeof d.v==='boolean'?(d.v?'VERDADEIRO':'FALSO'):"'"+d.v;if(typeof d.v==='string'&&!/^[\d.,\-+]/.test(d.v)&&!/^(verdadeiro|falso)$/i.test(d.v))raw=d.v}else if(raw&&raw[0]==='='&&!cl.cut)raw=shiftFormula(raw,r-(cl.g.r1+i),c-(cl.g.c1+j));setRaw(sh,r,c,raw)}
    if(mode!=='values'&&mode!=='formulas')setStyle(sh,r,c,d.st?d.st:{b:null,i:null,u:null,s:null,fc:null,bg:null,nf:null,ha:null,va:null,bd:null,wrap:null,fs:null})}
  if(cl.cut){const src=sheetById(cl.sid);if(src){// limpar origem e ajustar referências
      for(let i=0;i<R;i++)for(let j=0;j<C;j++){const r=cl.g.r1+i,c=cl.g.c1+j;if(src===sh&&r>=s.r1&&r<s.r1+tR&&c>=s.c1&&c<s.c1+tC)continue;setRaw(src,r,c,'');setStyle(src,r,c,{b:null,i:null,u:null,s:null,fc:null,bg:null,nf:null,ha:null,va:null,bd:null,wrap:null,fs:null})}
      const dr=s.r1-cl.g.r1,dc=s.c1-cl.g.c1;for(const s2 of WB.sheets)for(const k of [...s2.fcells]){const cell=s2.cells.get(k);if(!cell)continue;const nr=rewriteFormula(cell.raw,t=>{const tsh=t.sh?sheetByName(t.sh):s2;if(tsh!==src||t.b)return undefined;if(inRange(cl.g,t.a.r,t.a.c))return{a:{...t.a,r:t.a.r+dr,c:t.a.c+dc},b:null};return undefined});if(nr!==cell.raw){touch(s2,KR(k),KC(k));applyRaw(s2,KR(k),KC(k),nr,{keepFmt:true})}}}
    UI.clip=null}
  commitTx();setSel(s.r1,s.c1,s.r1+tR*rep-1,s.c1+tC*repc-1);if(UI.clip)UI.clip.ants=true;else draw()}
function parseTSV(t){t=t.replace(/\r\n?/g,'\n').replace(/\n$/,'');const rows=[[]];let cur='',q=false;const sep=t.includes('\t')?'\t':(t.split('\n')[0].split(';').length>t.split('\n')[0].split(',').length?';':(t.includes(',')&&/^[^"]*,/.test(t)&&!/\d,\d/.test(t)?',':'\t'));
  for(let i=0;i<t.length;i++){const ch=t[i];if(q){if(ch==='"'){if(t[i+1]==='"'){cur+='"';i++}else q=false}else cur+=ch;continue}if(ch==='"'&&cur===''){q=true;continue}if(ch===sep){rows[rows.length-1].push(cur);cur='';continue}if(ch==='\n'){rows[rows.length-1].push(cur);cur='';rows.push([]);continue}cur+=ch}rows[rows.length-1].push(cur);return rows}

/* ---- teclado ---- */
function gridKey(e){
  const k=e.key,ctrl=e.ctrlKey||e.metaKey,sh=curSheet();
  if(ctrl&&!e.altKey){const L=k.toLowerCase();
    const map={z:()=>undo(),y:()=>redo(),b:()=>toggleStyle('b'),i:()=>toggleStyle('i'),u:()=>toggleStyle('u'),'5':()=>toggleStyle('s'),a:()=>{const s=UI.sel;const g=currentRegion(sh,UI.act.r,UI.act.c);if(s.r1===g.r1&&s.c1===g.c1&&s.r2===g.r2&&s.c2===g.c2||(g.r1===g.r2&&g.c1===g.c2))setSel(0,0,G.nR-1,G.nC-1);else setSel(g.r1,g.c1,g.r2,g.c2)},f:()=>dlgFind(),h:()=>dlgFind(true),g:()=>{$('#namebox').focus();$('#namebox').select()},d:()=>fillDir('down'),r:()=>fillDir('right'),s:()=>save(true),o:()=>dlgOpen(),k:()=>dlgNote(),'1':()=>dlgFormat(),';':()=>{setCellQuick(fmtValue(todaySerial(),'dd/mm/yyyy'))},'`':()=>toggleShowF(),"'":()=>toggleShowF(),' ':()=>{setSel(0,UI.act.c,G.nR-1,UI.act.c)}};
    if(k==='Home'){e.preventDefault();selectCell(0,0,e.shiftKey);return}if(k==='End'){e.preventDefault();selectCell(Math.max(sh.maxR,0),Math.max(sh.maxC,0),e.shiftKey);return}
    if(k.startsWith('Arrow')){e.preventDefault();const d={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[k];jump(d[0],d[1],e.shiftKey);return}
    if(k==='Enter'&&UI.ed){e.preventDefault();return}
    if(map[L]){e.preventDefault();map[L]();return}
    if(k==='PageDown'){e.preventDefault();switchSheet(Math.min(WB.sheets.length-1,WB.active+1));return}if(k==='PageUp'){e.preventDefault();switchSheet(Math.max(0,WB.active-1));return}
    return;
  }
  if(e.shiftKey&&k===' '&&!UI.ed){e.preventDefault();setSel(UI.act.r,0,UI.act.r,G.nC-1);return}
  switch(k){
    case'ArrowUp':case'ArrowDown':case'ArrowLeft':case'ArrowRight':{e.preventDefault();const d={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[k];moveAct(d[0],d[1],e.shiftKey);return}
    case'Enter':e.preventDefault();if(e.shiftKey)moveInSel(-1,0);else moveInSel(1,0);return;
    case'Tab':e.preventDefault();moveInSel(0,e.shiftKey?-1:1);return;
    case'F2':e.preventDefault();startEdit(null,'edit');return;
    case'F9':e.preventDefault();recalc();draw();toast('Recalculado');return;
    case'F4':e.preventDefault();redoLast();return;
    case'Delete':case'Backspace':e.preventDefault();clearSel('contents');return;
    case'PageDown':e.preventDefault();scr().scrollTop+=scr().clientHeight-HH();moveAct(Math.floor((scr().clientHeight-HH())/rh(sh,0)||20),0,e.shiftKey);return;
    case'PageUp':e.preventDefault();scr().scrollTop-=scr().clientHeight-HH();moveAct(-Math.floor((scr().clientHeight-HH())/rh(sh,0)||20),0,e.shiftKey);return;
    case'Home':e.preventDefault();selectCell(UI.act.r,0,e.shiftKey);return;
    case'Escape':if(UI.clip){UI.clip=null;draw()}if(UI.painter){UI.painter=null;updateRibbonState()}UI.trace=null;draw();return;
    case'ContextMenu':e.preventDefault();const a=cellRect(UI.act.r,UI.act.c);const hr=$('#gridHost').getBoundingClientRect();cellMenu({clientX:hr.left+a.x+a.w/2,clientY:hr.top+a.y+a.h});return;
  }
  if(k.length===1&&!e.altKey){e.preventDefault();startEdit(k,'enter')}
}
function moveInSel(dr,dc){const s=UI.sel;if(s.r1===s.r2&&s.c1===s.c2||mergeEq(curSheet(),s)){moveAct(dr,dc);return}
  let {r,c}=UI.act;if(dr){r+=dr;if(r>s.r2){r=s.r1;c++;if(c>s.c2)c=s.c1}if(r<s.r1){r=s.r2;c--;if(c<s.c1)c=s.c2}}else{c+=dc;if(c>s.c2){c=s.c1;r++;if(r>s.r2)r=s.r1}if(c<s.c1){c=s.c2;r--;if(r<s.r1)r=s.r2}}
  UI.act={r,c};onSelChange();ensureVisible(r,c)}
function edKey(e){
  const ed=e.target;const isFx=ed.id==='fx';
  if($('#ac').style.display==='block'){if(e.key==='ArrowDown'){e.preventDefault();acMove(1);return}if(e.key==='ArrowUp'){e.preventDefault();acMove(-1);return}if(e.key==='Tab'||(e.key==='Enter'&&!e.altKey)){e.preventDefault();acAccept();return}if(e.key==='Escape'){e.preventDefault();hideAC(true);return}}
  if(e.key==='Enter'&&(e.altKey||(isFx&&e.shiftKey&&false))){e.preventDefault();const p=ed.selectionStart;ed.value=ed.value.slice(0,p)+'\n'+ed.value.slice(ed.selectionEnd);ed.setSelectionRange(p+1,p+1);edInput(isFx?'fx':undefined);return}
  if(e.key==='Enter'){e.preventDefault();if((e.ctrlKey||e.metaKey)&&UI.ed){fillSelWith();return}commitEdit(e.shiftKey?-1:1,0);return}
  if(e.key==='Tab'){e.preventDefault();commitEdit(0,e.shiftKey?-1:1);return}
  if(e.key==='Escape'){e.preventDefault();cancelEdit();return}
  if(e.key==='F4'){e.preventDefault();cycleAbs(ed);return}
  if(e.key==='F2'&&UI.ed){e.preventDefault();UI.ed.mode=UI.ed.mode==='enter'?'edit':'enter';toast(UI.ed.mode==='edit'?'Modo editar: setas movem o cursor':'Modo inserir: setas apontam células');return}
  if(UI.ed&&UI.ed.mode==='enter'&&e.key.startsWith('Arrow')&&!isFx){
    if(pointable()){e.preventDefault();const d={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key];const base=UI.point?(e.shiftKey?UI.point.g:{r1:UI.point.g.r2,c1:UI.point.g.c2}):{r1:UI.ed.r,c1:UI.ed.c};
      if(e.shiftKey&&UI.point){const g=UI.point.g;const anchor=UI.point.anchor||{r:g.r1,c:g.c1};const tip=UI.point.tip||{r:g.r2,c:g.c2};const nt={r:Math.max(0,tip.r+d[0]),c:Math.max(0,tip.c+d[1])};insertPointRef(normR({r1:anchor.r,c1:anchor.c,r2:nt.r,c2:nt.c}));UI.point.anchor=anchor;UI.point.tip=nt}
      else{const r=Math.max(0,(UI.point?UI.point.g.r1:UI.ed.r)+d[0]),c=Math.max(0,(UI.point?UI.point.g.c1:UI.ed.c)+d[1]);insertPointRef({r1:r,c1:c,r2:r,c2:c});UI.point.anchor={r,c};UI.point.tip={r,c}}
      ensureVisible(UI.point.g.r2,UI.point.g.c2);return}
    if(ed.value[0]!=='='){e.preventDefault();commitEdit(...({ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]}[e.key]));return}
  }
}
function fillSelWith(){const sh=curSheet();const v=$('#cellEd').value;const s=UI.sel;closeEditor();beginTx('Preencher seleção');for(let r=s.r1;r<=s.r2;r++)for(let c=s.c1;c<=s.c2;c++)setRaw(sh,r,c,v[0]==='='?shiftFormula(v,r-UI.act.r,c-UI.act.c):v);commitTx();focusGrid()}
function cycleAbs(ed){const v=ed.value;if(v[0]!=='=')return;const p=ed.selectionStart;const T=tokenize(v.slice(1));for(const t of T){if(t.t!=='ref')continue;const s=t.s+1,e2=t.e+1;if(p>=s&&p<=e2){const st=x=>x.ar&&x.ac?[false,false]:!x.ar&&!x.ac?[true,true]:x.ar&&!x.ac?[false,true]:[false,false];const nx=x=>{if(x.ac&&x.ar)return{...x,ac:false,ar:true};if(!x.ac&&x.ar)return{...x,ac:true,ar:false};if(x.ac&&!x.ar)return{...x,ac:false,ar:false};return{...x,ac:true,ar:true}};const a=nx(t.a),b=t.b?nx(t.b):null;const nt=refTokText(t,a,b,sheetPrefix(t));ed.value=v.slice(0,s)+nt+v.slice(e2);ed.setSelectionRange(s+nt.length,s+nt.length);edInput(ed.id==='fx'?'fx':undefined);return}}}
let LASTACT=null;function redoLast(){if(LASTACT)LASTACT()}
function setCellQuick(v){const sh=curSheet();beginTx('Inserir');setRaw(sh,UI.act.r,UI.act.c,v);commitTx()}

/* ---- comandos de célula ---- */
function clearSel(what){const sh=curSheet();const s=UI.sel;const r2=Math.min(s.r2,Math.max(sh.maxR,s.r1)),c2=Math.min(s.c2,Math.max(sh.maxC,s.c1));beginTx(what==='formats'?'Limpar formatos':'Limpar');
  for(let r=s.r1;r<=r2;r++)for(let c=s.c1;c<=c2;c++){const cell=cellAt(sh,r,c);if(!cell)continue;if(what!=='formats'&&what!=='notes'){setRaw(sh,r,c,'')}if(what==='formats'||what==='all')setStyle(sh,r,c,{b:null,i:null,u:null,s:null,fc:null,bg:null,nf:null,ha:null,va:null,bd:null,wrap:null,fs:null,ind:null});if(what==='notes'||what==='all'){touch(sh,r,c);const c2_=cellAt(sh,r,c);if(c2_){delete c2_.note;if(!c2_.raw&&!c2_.st)sh.cells.delete(K(r,c))}}}
  if(what==='all'){sh.merges=sh.merges.filter(m=>!(m.r1>=s.r1&&m.r2<=r2&&m.c1>=s.c1&&m.c2<=c2))}
  commitTx()}
function forSel(fn){const sh=curSheet();const s=UI.sel;const r2=Math.min(s.r2,Math.max(sh.maxR+1,s.r1)),c2=Math.min(s.c2,Math.max(sh.maxC+1,s.c1));const big=(r2-s.r1+1)*(c2-s.c1+1)>200000;if(big){toast('Seleção muito grande','err');return}for(let r=s.r1;r<=r2;r++)for(let c=s.c1;c<=c2;c++)fn(sh,r,c)}
function styleSel(patch,label='Formatar'){beginTx(label);forSel((sh,r,c)=>setStyle(sh,r,c,patch));commitTx();LASTACT=()=>styleSel(patch,label)}
function toggleStyle(k){const st=styleOf(curSheet(),UI.act.r,UI.act.c)||{};styleSel({[k]:st[k]?null:true})}
function bumpDecimals(d){const sh=curSheet();const st=styleOf(sh,UI.act.r,UI.act.c)||{};let nf=st.nf||'General';const v=getVal(sh,UI.act.r,UI.act.c);
  if(nf==='General'){const s=typeof v==='number'?fmtGeneral(v):'0';const dec=(s.split(',')[1]||'').length;nf='0'+(dec+d>0?'.'+'0'.repeat(Math.max(0,dec+d)):'')}
  else{nf=nf.replace(/0(\.0*)?(?=[^0.]*$|%|\s|"|;|$)/,m=>{const dec=m.length>1?m.length-2:0;const nd=Math.max(0,dec+d);return'0'+(nd?'.'+'0'.repeat(nd):'')})}
  styleSel({nf},'Casas decimais')}
function mergeSel(mode='center'){const sh=curSheet();const s=UI.sel;beginTx('Mesclar');snapTx();
  if(mode==='unmerge'){sh.merges=sh.merges.filter(m=>!(m.r1>=s.r1&&m.r2<=s.r2&&m.c1>=s.c1&&m.c2<=s.c2))}
  else if(mode==='across'){for(let r=s.r1;r<=s.r2;r++)sh.merges.push({r1:r,c1:s.c1,r2:r,c2:s.c2})}
  else{if(s.r1===s.r2&&s.c1===s.c2){commitTx();return}sh.merges=sh.merges.filter(m=>!(m.r1<=s.r2&&m.r2>=s.r1&&m.c1<=s.c2&&m.c2>=s.c1));
    let kept=false;for(let r=s.r1;r<=s.r2;r++)for(let c=s.c1;c<=s.c2;c++){if(r===s.r1&&c===s.c1)continue;if(rawOf(sh,r,c))kept=true;applyRaw(sh,r,c,'')}
    sh.merges.push({...s});if(mode==='center'){const cell=ensureCell(sh,s.r1,s.c1);cell.st=Object.assign({},cell.st,{ha:'center',va:'middle'})}if(kept)toast('Somente o valor superior esquerdo foi mantido')}
  commitTx();UI.act={r:s.r1,c:s.c1}}
function bordersSel(kind){const sh=curSheet();const s=UI.sel;const L='1 #000000',T='2 #000000';beginTx('Bordas');
  forSel((sh,r,c)=>{const cell=cellAt(sh,r,c);const bd=Object.assign({},cell&&cell.st&&cell.st.bd);
    if(kind==='none'){setStyle(sh,r,c,{bd:null});return}
    if(kind==='all'){bd.t=bd.b=bd.l=bd.r=L}
    if(kind==='outer'||kind==='thick'){const w=kind==='thick'?T:L;if(r===s.r1)bd.t=w;if(r===s.r2)bd.b=w;if(c===s.c1)bd.l=w;if(c===s.c2)bd.r=w}
    if(kind==='bottom'&&r===s.r2)bd.b=L;if(kind==='top'&&r===s.r1)bd.t=L;if(kind==='left'&&c===s.c1)bd.l=L;if(kind==='right'&&c===s.c2)bd.r=L;if(kind==='dbottom'&&r===s.r2)bd.b=T;
    setStyle(sh,r,c,{bd:Object.keys(bd).length?bd:null})});commitTx()}
function startPainter(){const st=styleOf(curSheet(),UI.act.r,UI.act.c);UI.painter={st:st?deep(st):{},g:{...UI.sel}};updateRibbonState();toast('Clique na célula de destino para aplicar o formato')}
function applyPainter(r,c){const p=UI.painter;UI.painter=null;const sh=curSheet();const R=p.g.r2-p.g.r1+1,C=p.g.c2-p.g.c1+1;beginTx('Pincel de formatação');for(let i=0;i<R;i++)for(let j=0;j<C;j++){const st=styleOf(sh,p.g.r1+i,p.g.c1+j);setStyle(sh,r+i,c+j,Object.assign({b:null,i:null,u:null,s:null,fc:null,bg:null,nf:null,ha:null,va:null,bd:null,wrap:null,fs:null},st||{}))}commitTx();setSel(r,c,r+R-1,c+C-1,{r,c});updateRibbonState()}
function autoSum(fn='SUM'){const sh=curSheet();const s=UI.sel;const pt=EN2PT[fn]||fn;
  if(s.r1===s.r2&&s.c1===s.c2){const {r,c}=UI.act;let r0=r-1;while(r0>=0&&typeof getVal(sh,r0,c)==='number')r0--;let src;if(r0<r-1)src={r1:r0+1,c1:c,r2:r-1,c2:c};else{let c0=c-1;while(c0>=0&&typeof getVal(sh,r,c0)==='number')c0--;if(c0<c-1)src={r1:r,c1:c0+1,r2:r,c2:c-1}}
    startEdit('='+pt+'('+(src?rangeA1(src):'')+')','edit');const ed=$('#cellEd');ed.setSelectionRange(ed.value.length-1,ed.value.length-1);return}
  beginTx('AutoSoma');const R=s.r2+1;for(let c=s.c1;c<=s.c2;c++){setRaw(sh,R,c,'='+pt+'('+rangeA1({r1:s.r1,c1:c,r2:s.r2,c2:c})+')')}commitTx()}
function insertRowsCols(axis,before=true){const s=UI.sel;const sh=curSheet();if(axis==='r'){const n=s.r2-s.r1+1;insertDelete(sh,'r',before?s.r1:s.r2+1,n)}else{const n=s.c2-s.c1+1;insertDelete(sh,'c',before?s.c1:s.c2+1,n)}geoDirty();draw()}
function deleteRowsCols(axis){const s=UI.sel;const sh=curSheet();if(axis==='r')insertDelete(sh,'r',s.r1,-(s.r2-s.r1+1));else insertDelete(sh,'c',s.c1,-(s.c2-s.c1+1));geoDirty();selectCell(UI.sel.r1,UI.sel.c1)}
function hideRowsCols(axis,show){const s=UI.sel;const sh=curSheet();beginTx(show?'Reexibir':'Ocultar');snapTx();if(axis==='r'){for(let r=s.r1;r<=s.r2;r++)show?sh.hidden.delete(r):sh.hidden.add(r);if(show&&s.r1>0)sh.hidden.delete(s.r1-1)}else{for(let c=s.c1;c<=s.c2;c++)show?sh.hcols.delete(c):sh.hcols.add(c)}commitTx();geoDirty();draw()}
function toggleShowF(){UI.showF=!UI.showF;draw();updateRibbonState()}
function traceRefs(){const sh=curSheet();const cell=cellAt(sh,UI.act.r,UI.act.c);if(!cell||!cell.ast){toast('A célula ativa não contém fórmula');return}let i=0;UI.trace=[];for(const t of tokenize(cell.raw.slice(1)))if(t.t==='ref'){const s2=t.sh?sheetByName(t.sh):sh;const g=t.b?normR({r1:t.a.r,c1:t.a.c,r2:t.wholeCol?Math.max(s2.maxR,0):t.b.r,c2:t.wholeRow?Math.max(s2.maxC,0):t.b.c}):{r1:t.a.r,c1:t.a.c,r2:t.a.r,c2:t.a.c};UI.trace.push({sh:s2,g,color:REFCOL[i++%REFCOL.length]})}draw();toast(UI.trace.length?`${UI.trace.length} precedente(s) destacado(s) · Esc limpa`:'Sem referências a células')}
function traceDeps(){const sh=curSheet();const {r,c}=UI.act;UI.trace=[];for(const k of sh.fcells){const cell=sh.cells.get(k);for(const t of tokenize(cell.raw.slice(1))){if(t.t!=='ref')continue;const s2=t.sh?sheetByName(t.sh):sh;if(s2!==sh)continue;const g=t.b?normR({r1:t.a.r,c1:t.a.c,r2:t.b.r,c2:t.b.c}):{r1:t.a.r,c1:t.a.c,r2:t.a.r,c2:t.a.c};if(inRange(g,r,c)){UI.trace.push({sh,g:{r1:KR(k),c1:KC(k),r2:KR(k),c2:KC(k)},color:'#2F7DE1'});break}}}draw();toast(UI.trace.length?`${UI.trace.length} dependente(s) nesta planilha`:'Nenhuma fórmula depende desta célula')}

/* ---- ordenar / filtrar ---- */
function sortRange(g,keys,hasHeader){const sh=curSheet();const r0=hasHeader?g.r1+1:g.r1;if(r0>g.r2)return;beginTx('Classificar');snapTx();
  const rows=[];for(let r=r0;r<=g.r2;r++){const row=[];for(let c=g.c1;c<=g.c2;c++){const cell=cellAt(sh,r,c);row.push(cell?{raw:cell.raw,st:cell.st,note:cell.note}:null)}rows.push({r,row,keys:keys.map(k=>getVal(sh,r,k.c))})}
  rows.sort((a,b)=>{for(let i=0;i<keys.length;i++){const x=a.keys[i],y=b.keys[i];const ex=x==null||x==='',ey=y==null||y==='';if(ex&&ey)continue;if(ex)return 1;if(ey)return -1;const c=cmpVals(x,y);if(c)return keys[i].desc?-c:c}return a.r-b.r});
  rows.forEach((o,i)=>{const r=r0+i;o.row.forEach((cell,j)=>{const c=g.c1+j;const k=K(r,c);if(!cell){sh.cells.delete(k);sh.fcells.delete(k);return}let raw=cell.raw;if(raw&&raw[0]==='=')raw=shiftFormula(raw,r-o.r,0);applyRaw(sh,r,c,raw,{keepFmt:true});const nc=ensureCell(sh,r,c);nc.st=cell.st;nc.note=cell.note})});
  commitTx();applyFilterHidden(sh)}
function quickSort(desc){const sh=curSheet();const s=UI.sel;let g,hdr;
  if(sh.filter&&inRange(sh.filter,UI.act.r,UI.act.c)){g=sh.filter;hdr=true}else{const t=tableAt(sh,UI.act.r,UI.act.c);if(t){g=t;hdr=true}else if(s.r1!==s.r2){g=s;hdr=false}else{g=currentRegion(sh,UI.act.r,UI.act.c);hdr=guessHeader(sh,g)}}
  sortRange(g,[{c:UI.act.c,desc}],hdr);toast('Classificado '+(desc?'Z → A':'A → Z'))}
function guessHeader(sh,g){if(g.r2<=g.r1)return false;let txtHdr=0,numBody=0;for(let c=g.c1;c<=g.c2;c++){const v=getVal(sh,g.r1,c),w=getVal(sh,g.r1+1,c);if(typeof v==='string')txtHdr++;if(typeof w==='number')numBody++}return txtHdr===g.c2-g.c1+1||(txtHdr>0&&numBody>0)}
function toggleFilter(){const sh=curSheet();beginTx('Filtro');snapTx();if(sh.filter){sh.filter=null;sh.fhidden=new Set()}else{const s=UI.sel;let g=s.r1!==s.r2?{...s}:currentRegion(sh,UI.act.r,UI.act.c);const t=tableAt(sh,UI.act.r,UI.act.c);if(t)g={r1:t.r1,c1:t.c1,r2:t.r2,c2:t.c2};if(g.r2>=G.nR-1)g.r2=sh.maxR;sh.filter={...g,crit:{}}}commitTx();geoDirty();draw()}
function setFilterCrit(c,crit){const sh=curSheet();if(!sh.filter)return;beginTx('Filtrar');snapTx();if(crit)sh.filter.crit[c]=crit;else delete sh.filter.crit[c];applyFilterHidden(sh);commitTx();geoDirty();draw();updateStatus()}
