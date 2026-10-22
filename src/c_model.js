/* ================= modelo da pasta de trabalho ================= */
const MAXC=16384;const K=(r,c)=>r*MAXC+c;const KR=k=>Math.floor(k/MAXC),KC=k=>k%MAXC;
const DEF_W=96,DEF_H=22;
function newSheet(name){return{id:uid('sh'),name,cells:new Map(),fcells:new Set(),colW:{},rowH:{},merges:[],cf:[],dv:[],freeze:{r:0,c:0},filter:null,hidden:new Set(),fhidden:new Set(),hcols:new Set(),tables:[],spill:new Map(),maxR:-1,maxC:-1,showGrid:true,tabColor:null}}
function newWorkbook(name='Pasta1'){const s=newSheet('Planilha1');return{id:uid('wb'),name,sheets:[s],names:{},active:0,bi:null}}
let WB=newWorkbook();let CEP=1;let PREV_SPILL=new Map();
const sheetById=id=>WB.sheets.find(s=>s.id===id);
const sheetByName=n=>{if(n==null)return null;const U=n.toLowerCase();return WB.sheets.find(s=>s.name.toLowerCase()===U)||null};
const curSheet=()=>WB.sheets[WB.active];

/* ---- contexto de avaliação ---- */
function mkCtx(sh,r,c){return{sheet:sh,r,c,get:getVal,maxRow:s=>s.maxR,maxCol:s=>s.maxC,sheetByName,resolveName,resolveTCol,rowHidden:(s,i)=>s.fhidden.has(i),isFormula:(s,i,j)=>!!s.cells.get(K(i,j))?.ast,resolveCol:(nm,cx)=>{const t=sh.tables.find(t=>inRange(t,r,c));if(!t)return undefined;const x=resolveTCol(t.name,nm,cx);return x==null?ERR.ref:x}}}
function resolveName(n){const d=WB.names[stripAcc(n).toUpperCase()];if(!d)return null;
  if(d.ref){const m=/^(?:'?(.+?)'?!)?(.+)$/.exec(d.ref);const sh=m[1]?sheetByName(m[1]):curSheet();const g=parseRange(m[2]);if(!sh||!g)return ERR.ref;return new Ref(sh,g.r1,g.c1,g.r2,g.c2)}
  if(d.f){try{return evalAst(parseFormula(d.f),mkCtx(curSheet(),0,0))}catch(e){return ERR.name}}return null}
function findTable(name){const U=name.toLowerCase();for(const s of WB.sheets)for(const t of s.tables)if(t.name.toLowerCase()===U)return{s,t};return null}
function tableHeaders(s,t){const h=[];for(let c=t.c1;c<=t.c2;c++)h.push(String(getVal(s,t.r1,c)??''));return h}
function resolveTCol(tn,cn,ctx){const f=findTable(tn);if(!f)return null;const{s,t}=f;cn=cn.trim();
  let thisRow=false;if(cn.startsWith('@')){thisRow=true;cn=cn.slice(1).replace(/^\[|\]$/g,'')}
  const L=cn.toLowerCase().replace(/[\[\]]/g,'');
  if(L==='#tudo'||L==='#all')return new Ref(s,t.r1,t.c1,t.r2,t.c2);
  if(L==='#dados'||L==='#data'||L==='')return new Ref(s,t.r1+1,t.c1,t.r2,t.c2);
  if(L==='#cabeçalhos'||L==='#cabecalhos'||L==='#headers')return new Ref(s,t.r1,t.c1,t.r1,t.c2);
  const hs=tableHeaders(s,t).map(x=>x.toLowerCase());const i=hs.indexOf(L);if(i<0)return null;const c=t.c1+i;
  if(thisRow){const r=(ctx||{}).r;return new Ref(s,r,c,r,c)}
  return new Ref(s,t.r1+1,c,t.r2,c);
}

/* ---- leitura de valores (com despejo) ---- */
function getVal(sh,r,c){
  const k=K(r,c);const cell=sh.cells.get(k);
  if(cell&&(cell.raw!==''&&cell.raw!=null)){if(cell.ast){evalCell(sh,cell,r,c);return cell.arr?cell.arr[0][0]:cell.v}return cell.v}
  let ak=sh.spill.get(k);
  if(ak==null){const hint=PREV_SPILL.get(sh.id);const hk=hint&&hint.get(k);if(hk!=null){const ac=sh.cells.get(hk);if(ac&&ac.ast&&ac.ep!==CEP){evalCell(sh,ac,KR(hk),KC(hk));ak=sh.spill.get(k)}}}
  if(ak!=null){const ac=sh.cells.get(ak);if(ac&&ac.arr){const dr=r-KR(ak),dc=c-KC(ak);const v=ac.arr[dr]?.[dc];return v===undefined?null:v}}
  return null;
}
function finalize(v){if(v==null)return 0;return v}
function evalCell(sh,cell,r,c){
  if(cell.ep===CEP)return;
  if(cell.busy){cell.v=ERR.circ;cell.arr=null;return}
  cell.busy=true;
  let res;try{res=evalAst(cell.ast,mkCtx(sh,r,c))}catch(e){res=e instanceof FErr?e.v:ERR.val;if(!(e instanceof FErr))console.warn(e)}
  cell.busy=false;
  if(cell.ep===CEP)return; // definido por ciclo
  let arr=null;
  if(res instanceof Ref){if(res.single)res=finalize(getVal(res.sh,res.r1,res.c1));else{arr=refToArray(mkCtx(sh,r,c),res)}}
  else if(Array.isArray(res)){arr=res}
  if(arr){
    if(arr.length===1&&arr[0].length===1){cell.v=finalize(arr[0][0]);cell.arr=null}
    else{
      arr=arr.map(row=>row.map(x=>x==null?0:x));
      let blocked=false;const R=arr.length,C=arr[0]?.length||0;
      if(R*C>2e5)blocked=true;
      for(let i=0;i<R&&!blocked;i++)for(let j=0;j<C;j++){if(!i&&!j)continue;const kk=K(r+i,c+j);const o=sh.cells.get(kk);if(o&&o.raw!==''&&o.raw!=null){blocked=true;break}const sp=sh.spill.get(kk);if(sp!=null&&sp!==K(r,c)){blocked=true;break}}
      if(blocked){cell.v=ERR.spill;cell.arr=null}
      else{cell.arr=arr;cell.v=arr[0][0];const ak=K(r,c);for(let i=0;i<R;i++)for(let j=0;j<C;j++){if(!i&&!j)continue;sh.spill.set(K(r+i,c+j),ak)}sh.maxR=Math.max(sh.maxR,r+R-1);sh.maxC=Math.max(sh.maxC,c+C-1)}
    }
  }else{cell.v=finalize(res);cell.arr=null}
  cell.ep=CEP;
}
function recalc(){
  let iter=0;
  do{
    PREV_SPILL=new Map(WB.sheets.map(s=>[s.id,s.spill]));
    CEP++;for(const s of WB.sheets)s.spill=new Map();
    for(const s of WB.sheets)for(const k of s.fcells){const cell=s.cells.get(k);if(cell&&cell.ast)evalCell(s,cell,KR(k),KC(k))}
    iter++;
  }while(iter<3&&spillChanged());
  CFCACHE.clear();
}
function spillChanged(){for(const s of WB.sheets){const p=PREV_SPILL.get(s.id);if(!p||p.size!==s.spill.size)return true;for(const [k,v] of s.spill)if(p.get(k)!==v)return true}return false}

/* ---- escrita de células ---- */
function cellAt(sh,r,c){return sh.cells.get(K(r,c))}
function ensureCell(sh,r,c){const k=K(r,c);let cell=sh.cells.get(k);if(!cell){cell={raw:'',v:null};sh.cells.set(k,cell)}return cell}
function applyRaw(sh,r,c,raw,{keepFmt=false}={}){
  const k=K(r,c);
  if(typeof raw==='number'&&isFinite(raw)){let cell=sh.cells.get(k);if(!cell){cell={raw:'',v:null};sh.cells.set(k,cell)}cell.raw=String(raw).replace('.',',');cell.v=raw;cell.ast=null;cell.arr=null;cell.ep=0;sh.fcells.delete(k);if(r>sh.maxR)sh.maxR=r;if(c>sh.maxC)sh.maxC=c;return}
  raw=raw==null?'':String(raw);
  let cell=sh.cells.get(k);
  if(raw===''){if(!cell)return;cell.raw='';cell.v=null;cell.ast=null;cell.arr=null;sh.fcells.delete(k);if(!cell.st&&!cell.note)sh.cells.delete(k);return}
  if(!cell){cell={raw:'',v:null};sh.cells.set(k,cell)}
  cell.raw=raw;cell.arr=null;cell.ep=0;
  if(raw[0]==='='&&raw.length>1){
    try{cell.ast=parseFormula(raw.slice(1))}catch(e){cell.ast={k:'e',v:ERR.name}}
    sh.fcells.add(k);cell.v=null;
  }else{
    cell.ast=null;sh.fcells.delete(k);
    if(raw[0]==="'"){cell.v=raw.slice(1)}
    else{const p=parseInput(raw);cell.v=p.v;if(p.nf&&!keepFmt&&!(cell.st&&cell.st.nf&&cell.st.nf!=='General'))cell.st=Object.assign({},cell.st,{nf:p.nf})}
  }
  if(r>sh.maxR)sh.maxR=r;if(c>sh.maxC)sh.maxC=c;
}
function recomputeExtent(sh){let R=-1,C=-1;for(const k of sh.cells.keys()){const r=KR(k),c=KC(k);if(r>R)R=r;if(c>C)C=c}sh.maxR=R;sh.maxC=C}
function rawOf(sh,r,c){const cell=cellAt(sh,r,c);return cell?cell.raw:''}
function styleOf(sh,r,c){const cell=cellAt(sh,r,c);return cell&&cell.st||null}

/* ---- histórico (desfazer/refazer) ---- */
const HIST={undo:[],redo:[],tx:null};
function cloneCell(c){if(!c)return null;return{raw:c.raw,st:c.st?deep(c.st):undefined,note:c.note}}
function beginTx(label){if(HIST.tx){HIST.tx.depth++;return}HIST.tx={label,cells:new Map(),depth:0,snap:null}}
function touch(sh,r,c){if(!HIST.tx)return;const key=sh.id+':'+K(r,c);if(!HIST.tx.cells.has(key))HIST.tx.cells.set(key,{sid:sh.id,k:K(r,c),before:cloneCell(cellAt(sh,r,c))})}
function snapTx(){if(HIST.tx&&!HIST.tx.snap)HIST.tx.snap=serializeSheets()}
function commitTx(){const tx=HIST.tx;if(!tx)return;if(tx.depth>0){tx.depth--;return}HIST.tx=null;
  if(!canEditBook()){if(tx.snap)restoreSheets(tx.snap);else for(const e of tx.cells.values()){const sh=sheetById(e.sid);if(sh)restoreCell(sh,e.k,e.before)}onChange();guardEdit();return}
  if(tx.snap){tx.after=serializeSheets()}
  else{if(!tx.cells.size)return;for(const e of tx.cells.values()){const sh=sheetById(e.sid);e.after=cloneCell(sh&&sh.cells.get(e.k))}}
  HIST.undo.push(tx);if(HIST.undo.length>120)HIST.undo.shift();if(HIST.undo.filter(x=>x.snap).length>12){const i=HIST.undo.findIndex(x=>x.snap);HIST.undo.splice(i,1)}HIST.redo=[];onChange()}
function restoreCell(sh,k,v){const r=KR(k),c=KC(k);if(!v){applyRaw(sh,r,c,'');const cl=sh.cells.get(k);if(cl){delete cl.st;delete cl.note;if(!cl.raw)sh.cells.delete(k)}return}applyRaw(sh,r,c,v.raw,{keepFmt:true});const cl=sh.cells.get(k)||ensureCell(sh,r,c);cl.st=v.st?deep(v.st):undefined;cl.note=v.note;if(!cl.raw&&!cl.st&&!cl.note)sh.cells.delete(k)}
function undo(){const tx=HIST.undo.pop();if(!tx)return toast('Nada para desfazer');if(tx.snap)restoreSheets(tx.snap);else for(const e of tx.cells.values()){const sh=sheetById(e.sid);if(sh)restoreCell(sh,e.k,e.before)}HIST.redo.push(tx);onChange();toast('Desfeito: '+tx.label)}
function redo(){const tx=HIST.redo.pop();if(!tx)return toast('Nada para refazer');if(tx.snap)restoreSheets(tx.after);else for(const e of tx.cells.values()){const sh=sheetById(e.sid);if(sh)restoreCell(sh,e.k,e.after)}HIST.undo.push(tx);onChange();toast('Refeito: '+tx.label)}
function setRaw(sh,r,c,raw,o){touch(sh,r,c);applyRaw(sh,r,c,raw,o)}
function setStyle(sh,r,c,patch){touch(sh,r,c);const cell=ensureCell(sh,r,c);const st=Object.assign({},cell.st);for(const k in patch){if(patch[k]==null)delete st[k];else st[k]=patch[k]}cell.st=Object.keys(st).length?st:undefined;if(!cell.raw&&!cell.st&&!cell.note)sh.cells.delete(K(r,c))}

/* ---- serialização ---- */
function serSheet(s){const cells=[];for(const [k,c] of s.cells){if(!c.raw&&!c.st&&!c.note)continue;const e=[KR(k),KC(k),c.raw||''];if(c.st||c.note)e.push(c.st||0);if(c.note)e.push(c.note);cells.push(e)}
  return{id:s.id,name:s.name,cells,colW:s.colW,rowH:s.rowH,merges:s.merges,cf:s.cf,dv:s.dv,freeze:s.freeze,filter:s.filter,hidden:[...s.hidden],hcols:[...s.hcols],tables:s.tables,showGrid:s.showGrid,tabColor:s.tabColor}}
function deSheet(o){const s=newSheet(o.name);Object.assign(s,{id:o.id||s.id,colW:o.colW||{},rowH:o.rowH||{},merges:o.merges||[],cf:o.cf||[],dv:o.dv||[],freeze:o.freeze||{r:0,c:0},filter:o.filter||null,hidden:new Set(o.hidden||[]),hcols:new Set(o.hcols||[]),tables:o.tables||[],showGrid:o.showGrid!==false,tabColor:o.tabColor||null});
  for(const e of o.cells||[]){const [r,c,raw,st,note]=e;applyRaw(s,r,c,raw,{keepFmt:true});if(st||note){const cl=ensureCell(s,r,c);if(st)cl.st=st;if(note)cl.note=note}}return s}
function serializeSheets(){return JSON.stringify({sheets:WB.sheets.map(serSheet),names:WB.names,active:WB.active})}
function restoreSheets(json){const o=JSON.parse(json);WB.sheets=o.sheets.map(deSheet);WB.names=o.names||{};WB.active=Math.min(o.active||0,WB.sheets.length-1);WB.sheets.forEach(applyFilterHidden)}
function serializeWB(){return{v:1,app:'GPlanSiS|Sheets',id:WB.id,name:WB.name,sheets:WB.sheets.map(serSheet),names:WB.names,active:WB.active,bi:biHasContent()?biSerialize():null}}
function biHasContent(){return!!BI&&(BI.queries.length>0||BI.measures.length>0||BI.calcCols.length>0||BI.pages.some(p=>p.visuals.length>0))}
function loadWB(o){WB={id:o.id||uid('wb'),name:o.name||'Pasta',sheets:(o.sheets||[]).map(deSheet),names:o.names||{},active:o.active||0,bi:null};if(!WB.sheets.length)WB.sheets.push(newSheet('Planilha1'));WB.sheets.forEach(applyFilterHidden);biLoad(o.bi);HIST.undo=[];HIST.redo=[];recalc()}

/* ---- ajuste de referências ---- */
function refTokText(t,a,b,sheetText){
  const one=p=>(p.ac?'$':'')+colName(p.c)+(p.ar?'$':'')+(p.r+1);
  let body;
  if(t.wholeCol)body=(a.ac?'$':'')+colName(a.c)+':'+(b.ac?'$':'')+colName(b.c);
  else if(t.wholeRow)body=(a.ar?'$':'')+(a.r+1)+':'+(b.ar?'$':'')+(b.r+1);
  else body=b?one(a)+':'+one(b):one(a);
  return(sheetText||'')+body;
}
function sheetPrefix(t){const m=RX_SHEET.exec(t.text);return m?m[0]:''}
function rewriteFormula(raw,fn){ // fn(tok,{a,b}) -> {a,b}|null(#REF)|undefined(no change)
  if(!raw||raw[0]!=='=')return raw;
  const T=tokenize(raw.slice(1));let out='=',changed=false;
  for(const t of T){if(t.t!=='ref'){out+=t.text;continue}
    const res=fn(t);if(res===undefined){out+=t.text;continue}changed=true;
    if(res===null){out+=sheetPrefix(t)+'#REF!';continue}
    out+=refTokText(t,res.a,res.b,sheetPrefix(t));}
  return changed?out:raw;
}
function shiftFormula(raw,dr,dc){
  return rewriteFormula(raw,t=>{const mv=p=>({...p,r:p.ar||t.wholeCol?p.r:p.r+dr,c:p.ac||t.wholeRow?p.c:p.c+dc});const a=mv(t.a),b=t.b?mv(t.b):null;if(a.r<0||a.c<0||(b&&(b.r<0||b.c<0)))return null;return{a,b}});
}
function adjustForInsert(target,axis,at,cnt){ // cnt>0 inserir, <0 excluir
  const key=axis==='r'?'r':'c';
  const fix=(p,isEnd,isB)=>{let v=p[key];if(cnt>0){if(v>=at)v+=cnt}else{const d=-cnt;if(v>=at+d)v-=d;else if(v>=at)return isB?{...p,[key]:at-1,_del:true}:{...p,[key]:at,_del:true}}return{...p,[key]:v}};
  for(const s of WB.sheets){
    for(const k of s.fcells){const cell=s.cells.get(k);if(!cell)continue;
      const nr=rewriteFormula(cell.raw,t=>{const tsh=t.sh?sheetByName(t.sh):s;if(tsh!==target)return undefined;if((axis==='r'&&t.wholeCol)||(axis==='c'&&t.wholeRow))return undefined;
        let a=fix(t.a,false,false),b=t.b?fix(t.b,true,true):null;
        if(cnt<0){if(!b&&a._del)return null;if(b&&a._del&&b._del&&(b[key]<a[key]))return null;if(b&&b[key]<a[key])return null}
        delete a._del;if(b)delete b._del;if(a[key]===t.a[key]&&(!b||b[key]===t.b[key]))return undefined;return{a,b}});
      if(nr!==cell.raw){cell.raw=nr;try{cell.ast=parseFormula(nr.slice(1))}catch(e){cell.ast={k:'e',v:ERR.ref}}}
    }
  }
}
function shiftRange(g,axis,at,cnt){const a=axis==='r'?['r1','r2']:['c1','c2'];const o={...g};if(cnt>0){if(o[a[0]]>=at)o[a[0]]+=cnt;if(o[a[1]]>=at)o[a[1]]+=cnt}else{const d=-cnt;for(const k of a){if(o[k]>=at+d)o[k]-=d;else if(o[k]>=at)o[k]=k===a[0]?at:at-1}if(o[a[1]]<o[a[0]])return null}return o}
function insertDelete(sh,axis,at,cnt){
  beginTx(cnt>0?(axis==='r'?'Inserir linhas':'Inserir colunas'):(axis==='r'?'Excluir linhas':'Excluir colunas'));snapTx();
  adjustForInsert(sh,axis,at,cnt);
  const nm=new Map();const nf=new Set();
  for(const [k,cell] of sh.cells){let r=KR(k),c=KC(k);let v=axis==='r'?r:c;
    if(cnt<0&&v>=at&&v<at-cnt)continue;if(v>=at)v+=cnt;if(axis==='r')r=v;else c=v;const nk=K(r,c);nm.set(nk,cell);if(cell.ast)nf.add(nk)}
  sh.cells=nm;sh.fcells=nf;
  const sz=axis==='r'?sh.rowH:sh.colW;const nsz={};for(const k in sz){let v=+k;if(cnt<0&&v>=at&&v<at-cnt)continue;if(v>=at)v+=cnt;nsz[v]=sz[k]}if(axis==='r')sh.rowH=nsz;else sh.colW=nsz;
  sh.merges=sh.merges.map(g=>shiftRange(g,axis,at,cnt)).filter(Boolean);
  for(const r of sh.cf){const g=shiftRange(r.range,axis,at,cnt);if(g)r.range=g;else r._dead=true}sh.cf=sh.cf.filter(r=>!r._dead);
  for(const r of sh.dv){const g=shiftRange(r.range,axis,at,cnt);if(g)r.range=g;else r._dead=true}sh.dv=sh.dv.filter(r=>!r._dead);
  sh.tables=sh.tables.map(t=>{const g=shiftRange(t,axis,at,cnt);return g?{...t,...g}:null}).filter(Boolean);
  if(sh.filter){const g=shiftRange(sh.filter,axis,at,cnt);if(g){const crit={};if(axis==='c'){for(const k in sh.filter.crit){let v=+k;if(v>=at)v+=cnt;if(!(cnt<0&&+k>=at&&+k<at-cnt))crit[v]=sh.filter.crit[k]}}else Object.assign(crit,sh.filter.crit);sh.filter={...g,crit}}else sh.filter=null}
  for(const n in WB.names){const d=WB.names[n];if(!d.ref)continue;const m=/^(?:'?(.+?)'?!)?(.+)$/.exec(d.ref);const s2=m[1]?sheetByName(m[1]):null;if(s2!==sh)continue;const g=parseRange(m[2]);const g2=g&&shiftRange(g,axis,at,cnt);d.ref=g2?(m[1]?quoteSheet(m[1])+'!':'')+'$'+rangeA1(g2).replace(/([A-Z]+)(\d+)/g,'$1$$$2').replace(/:/,':$'):'#REF!'}
  recomputeExtent(sh);applyFilterHidden(sh);commitTx();
}
const quoteSheet=n=>/^[A-Za-z_À-ÿ][\wÀ-ÿ.]*$/.test(n)&&!parseA1(n)?n:"'"+n.replace(/'/g,"''")+"'";

/* ---- filtro automático ---- */
function applyFilterHidden(sh){sh.fhidden=new Set();const f=sh.filter;if(!f)return;const cols=Object.keys(f.crit||{}).map(Number);if(!cols.length)return;
  for(let r=f.r1+1;r<=f.r2;r++){for(const c of cols){const cr=f.crit[c];const v=getValSafe(sh,r,c);if(!critPass(cr,v,sh,r,c)){sh.fhidden.add(r);break}}}}
function getValSafe(sh,r,c){try{return getVal(sh,r,c)}catch(e){return null}}
function critPass(cr,v,sh,r,c){if(!cr)return true;
  if(cr.vals){const t=displayOf(sh,r,c);return cr.vals.includes(t)}
  if(cr.cond){const {op,a,b}=cr.cond;const n=typeof v==='number'?v:null;const s=txt(v).toLowerCase();const A=String(a??'').toLowerCase();const an=ptNum(String(a??''));const bn=ptNum(String(b??''));
    switch(op){case'eq':return an!=null&&n!=null?n===an:s===A;case'ne':return an!=null&&n!=null?n!==an:s!==A;case'gt':return n!=null&&n>an;case'lt':return n!=null&&n<an;case'ge':return n!=null&&n>=an;case'le':return n!=null&&n<=an;case'between':return n!=null&&n>=an&&n<=bn;case'contains':return s.includes(A);case'ncontains':return !s.includes(A);case'starts':return s.startsWith(A);case'ends':return s.endsWith(A);case'empty':return v==null||v==='';case'nempty':return !(v==null||v==='');case'top':{const vals=[];for(let i=sh.filter.r1+1;i<=sh.filter.r2;i++){const x=getVal(sh,i,c);if(typeof x==='number')vals.push(x)}vals.sort((p,q)=>q-p);return n!=null&&n>=(vals[Math.max(0,an-1)]??-Infinity)}case'above':{let s2=0,k=0;for(let i=sh.filter.r1+1;i<=sh.filter.r2;i++){const x=getVal(sh,i,c);if(typeof x==='number'){s2+=x;k++}}return n!=null&&n>s2/k}}}
  return true}
function displayOf(sh,r,c){const v=getVal(sh,r,c);const st=styleOf(sh,r,c);return fmtValue(v,st&&st.nf)}

/* ---- região atual (Ctrl+A / detecção de tabela) ---- */
function currentRegion(sh,r,c){
  const filled=(i,j)=>{const v=getVal(sh,i,j);return v!=null&&v!==''};
  let g={r1:r,c1:c,r2:r,c2:c};let grow=true,guard=0;
  while(grow&&guard++<5000){grow=false;
    const tryExp=(dr1,dc1,dr2,dc2)=>{const n={r1:Math.max(0,g.r1+dr1),c1:Math.max(0,g.c1+dc1),r2:g.r2+dr2,c2:g.c2+dc2};let any=false;
      if(dr1&&n.r1!==g.r1)for(let j=n.c1;j<=n.c2;j++)if(filled(n.r1,j)){any=true;break}
      if(dr2)for(let j=n.c1;j<=n.c2;j++)if(filled(n.r2,j)){any=true;break}
      if(dc1&&n.c1!==g.c1)for(let i=n.r1;i<=n.r2;i++)if(filled(i,n.c1)){any=true;break}
      if(dc2)for(let i=n.r1;i<=n.r2;i++)if(filled(i,n.c2)){any=true;break}
      if(any){g=n;grow=true}};
    tryExp(-1,0,0,0);tryExp(0,0,1,0);tryExp(0,-1,0,0);tryExp(0,0,0,1);
  }
  // remove borda vazia
  return g;
}

/* ---- formatação condicional ---- */
const CFCACHE=new Map();
function cfStats(sh,rule){const key=sh.id+rule.id+CEP;if(CFCACHE.has(key))return CFCACHE.get(key);const g=rule.range;const nums=[];const cnt=new Map();
  for(let r=g.r1;r<=Math.min(g.r2,sh.maxR);r++)for(let c=g.c1;c<=Math.min(g.c2,sh.maxC);c++){const v=getVal(sh,r,c);if(typeof v==='number')nums.push(v);if(v!=null&&v!==''){const t=txt(v).toLowerCase();cnt.set(t,(cnt.get(t)||0)+1)}}
  nums.sort((a,b)=>a-b);const st={min:nums[0],max:nums[nums.length-1],nums,cnt,avg:nums.reduce((s,v)=>s+v,0)/(nums.length||1)};CFCACHE.set(key,st);return st}
function lerpColor(a,b,t){const p=x=>[1,3,5].map(i=>parseInt(x.slice(i,i+2),16));const A=p(a),Bc=p(b);return'#'+A.map((v,i)=>Math.round(v+(Bc[i]-v)*t).toString(16).padStart(2,'0')).join('')}
function cfFor(sh,r,c,v){
  let out=null;
  for(const rule of sh.cf){if(!inRange(rule.range,r,c))continue;
    const n=typeof v==='number'?v:null;let hit=false;
    switch(rule.type){
      case'cell':{const a=ptNum(String(rule.a))??rule.a,b=ptNum(String(rule.b))??rule.b;if(n==null&&!['eq','ne'].includes(rule.op))break;switch(rule.op){case'gt':hit=n>a;break;case'lt':hit=n<a;break;case'ge':hit=n>=a;break;case'le':hit=n<=a;break;case'eq':hit=n!=null?n===a:txt(v).toLowerCase()===String(rule.a).toLowerCase();break;case'ne':hit=n!=null?n!==a:txt(v).toLowerCase()!==String(rule.a).toLowerCase();break;case'between':hit=n>=a&&n<=b;break}break}
      case'text':hit=v!=null&&txt(v).toLowerCase().includes(String(rule.a).toLowerCase());break;
      case'top':{if(n==null)break;const st=cfStats(sh,rule);const k=Math.max(1,+rule.n||10);hit=rule.bottom?n<=st.nums[Math.min(k,st.nums.length)-1]:n>=st.nums[Math.max(0,st.nums.length-k)];break}
      case'avg':{if(n==null)break;const st=cfStats(sh,rule);hit=rule.below?n<st.avg:n>st.avg;break}
      case'dup':{if(v==null||v==='')break;const st=cfStats(sh,rule);hit=(st.cnt.get(txt(v).toLowerCase())||0)>1;if(rule.unique)hit=!hit;break}
      case'formula':{try{const ast=rule._ast||(rule._ast=parseFormula(rule.f.replace(/^=/,'')));const dr=r-rule.range.r1,dc=c-rule.range.c1;const shifted=dr||dc?parseFormula(shiftFormula('='+rule.f.replace(/^=/,''),dr,dc).slice(1)):ast;const res=scalar(mkCtx(sh,r,c),evalAst(shifted,mkCtx(sh,r,c)));hit=!!res&&!isErr(res)}catch(e){}break}
      case'scale':{if(n==null)break;const st=cfStats(sh,rule);const t=st.max===st.min?.5:(n-st.min)/(st.max-st.min);const cs=rule.colors||['#F8696B','#FFEB84','#63BE7B'];const col=cs.length===3?(t<.5?lerpColor(cs[0],cs[1],t*2):lerpColor(cs[1],cs[2],(t-.5)*2)):lerpColor(cs[0],cs[1],t);out=Object.assign(out||{},{bg:col});continue}
      case'bar':{if(n==null)break;const st=cfStats(sh,rule);const lo=Math.min(0,st.min),hi=Math.max(0,st.max);out=Object.assign(out||{},{bar:{t:hi===lo?0:(n-lo)/(hi-lo),z:hi===lo?0:(0-lo)/(hi-lo),color:rule.color||'#EB6A20'}});continue}
      case'icons':{if(n==null)break;const st=cfStats(sh,rule);const t=st.max===st.min?1:(n-st.min)/(st.max-st.min);{let ix=t>=2/3?2:t>=1/3?1:0;if(rule.rev)ix=2-ix;out=Object.assign(out||{},{icon:ix,iconSet:rule.set||'arrows'})};continue}
    }
    if(hit){out=Object.assign(out||{},rule.style);if(rule.stop)break}
  }
  return out;
}
function dvFor(sh,r,c){for(const d of sh.dv)if(inRange(d.range,r,c))return d;return null}
function dvList(sh,d){if(d.src){try{const v=evalAst(parseFormula(d.src.replace(/^=/,'')),mkCtx(sh,0,0));return [...new Set(toArr(mkCtx(sh,0,0),v).flat().filter(x=>x!=null&&x!=='').map(txt))]}catch(e){return[]}}return d.list||[]}
function dvCheck(sh,r,c,raw){const d=dvFor(sh,r,c);if(!d||raw==='')return true;const p=raw[0]==='='?null:parseInput(raw);if(!p)return true;const v=p.v;
  if(d.type==='list')return dvList(sh,d).some(x=>x.toLowerCase()===String(raw).toLowerCase());
  if(d.type==='num'||d.type==='int'){if(typeof v!=='number')return false;if(d.type==='int'&&!Number.isInteger(v))return false;const a=+d.a,b=+d.b;switch(d.op){case'between':return v>=a&&v<=b;case'gt':return v>a;case'lt':return v<a;case'ge':return v>=a;case'le':return v<=a;case'eq':return v===a}return true}
  if(d.type==='len')return String(raw).length<=+d.a;
  return true}
