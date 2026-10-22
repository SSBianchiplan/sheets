/* ================= BI: consultas, modelo, medidas (DAX) ================= */
let BI=null;let MODEL=null;let BI_DIRTY=true;let MEMO=new Map();
function biEmpty(){return{queries:[],rels:[],measures:[],calcCols:[],pages:[{id:uid('pg'),name:'Página 1',visuals:[],filters:[]}],rfilters:[],page:0,view:'report'}}
function biLoad(o){BI=o?Object.assign(biEmpty(),deep(o)):biEmpty();BI_DIRTY=true;MODEL=null}
function biSerialize(){const o=deep(BI);for(const p of o.pages){delete p.xf;for(const v of p.visuals)delete v._cache}return o}
function biSheetRenamed(){BI_DIRTY=true}
const DTYPE={num:'Número',int:'Inteiro',text:'Texto',date:'Data',bool:'Verdadeiro/Falso'};

/* ---- origem ---- */
function readSource(src){
  if(src.kind==='table'){const f=findTable(src.table);if(!f)throw new Error(`Tabela "${src.table}" não encontrada na pasta`);const {s,t}=f;return readRange(s,{r1:t.r1,c1:t.c1,r2:t.r2,c2:t.c2},true)}
  if(src.kind==='range'){const s=sheetById(src.sheetId)||sheetByName(src.sheet);if(!s)throw new Error('Planilha de origem não encontrada');const g=parseRange(src.ref);if(!g)throw new Error('Intervalo inválido');if(src.auto){const cr=currentRegion(s,g.r1,g.c1);g.r2=cr.r2;g.c2=cr.c2}return readRange(s,g,src.header!==false)}
  if(src.kind==='inline')return{cols:deep(src.cols),rows:deep(src.rows)};
  throw new Error('Origem desconhecida')}
function readRange(s,g,header){const r2=Math.min(g.r2,s.maxR);const cols=[];const names=new Set();
  for(let c=g.c1;c<=g.c2;c++){let n=header?txt(getVal(s,g.r1,c)).trim():'Coluna'+(c-g.c1+1);if(!n)n='Coluna'+(c-g.c1+1);let base=n,i=2;while(names.has(n.toLowerCase()))n=base+'_'+i++;names.add(n.toLowerCase());cols.push({name:n,src:c})}
  const rows=[];for(let r=header?g.r1+1:g.r1;r<=r2;r++){if(s.hidden.has(r))continue;const row=cols.map(cc=>{const v=getVal(s,r,cc.src);return isErr(v)?null:v===''?null:v});if(row.every(v=>v==null))continue;rows.push(row)}
  cols.forEach((cc,j)=>{let dateCnt=0,n=0;for(let r=header?g.r1+1:g.r1;r<=Math.min(r2,(header?g.r1+1:g.r1)+60);r++){const st=styleOf(s,r,cc.src);if(st&&isDateFmt(st.nf))dateCnt++;if(getVal(s,r,cc.src)!=null)n++}cc.type=inferType(rows.map(r=>r[j]),dateCnt>0&&dateCnt>=n*.6);const st=styleOf(s,header?g.r1+1:g.r1,cc.src);if(st&&st.nf&&cc.type!=='date'&&cc.type!=='text')cc.fmt=st.nf;delete cc.src});
  return{cols,rows}}
function inferType(vals,dateHint){let num=0,int=0,str=0,bool=0,tot=0;for(const v of vals){if(v==null)continue;tot++;if(typeof v==='number'){num++;if(Number.isInteger(v))int++}else if(typeof v==='boolean')bool++;else str++}
  if(!tot)return'text';if(dateHint&&num===tot)return'date';if(num===tot)return int===tot?'int':'num';if(bool===tot)return'bool';return'text'}
function castVal(v,t){if(v==null||v==='')return null;switch(t){case'num':case'int':{const n=typeof v==='number'?v:typeof v==='boolean'?+v:ptNum(String(v));return n==null?null:(t==='int'?Math.round(n):n)}case'date':{if(typeof v==='number')return Math.floor(v);const p=parseInput(String(v));return typeof p.v==='number'?Math.floor(p.v):null}case'text':return typeof v==='number'?fmtGeneral(v):String(v);case'bool':return typeof v==='boolean'?v:/^(1|sim|true|verdadeiro|s|yes)$/i.test(String(v))}return v}

/* ---- etapas aplicadas (estilo Power Query) ---- */
const STEP_LABEL={rename:'Coluna renomeada',remove:'Colunas removidas',keep:'Outras colunas removidas',type:'Tipo alterado',filter:'Linhas filtradas',addcol:'Coluna personalizada adicionada',groupby:'Linhas agrupadas',sort:'Linhas classificadas',dedupe:'Duplicatas removidas',replace:'Valor substituído',filldown:'Preenchido para baixo',unpivot:'Colunas não dinâmicas',split:'Coluna dividida',merge:'Consultas mescladas',top:'Primeiras linhas mantidas',trim:'Texto aparado',upper:'Texto em maiúsculas',nonull:'Linhas vazias removidas',dateparts:'Partes de data adicionadas',reorder:'Colunas reordenadas',promote:'Cabeçalhos promovidos',index:'Índice adicionado'};
function stepText(s){switch(s.op){case'rename':return`${s.from} → ${s.to}`;case'remove':return s.cols.join(', ');case'keep':return'mantidas: '+s.cols.join(', ');case'type':return`${s.col}: ${DTYPE[s.type]}`;case'filter':return`${s.col} ${({eq:'=',ne:'≠',gt:'>',lt:'<',ge:'≥',le:'≤',contains:'contém',ncontains:'não contém',starts:'começa com',empty:'é vazio',nempty:'não é vazio',in:'em'})[s.cmp]||s.cmp} ${s.cmp==='in'?'['+s.vals.slice(0,4).join(', ')+(s.vals.length>4?'…':'')+']':(s.v??'')}`;case'addcol':return`${s.name} = ${s.expr}`;case'groupby':return`por ${s.keys.join(', ')}: ${s.aggs.map(a=>a.as).join(', ')}`;case'sort':return`${s.col} ${s.desc?'↓':'↑'}`;case'replace':return`${s.col}: "${s.find}" → "${s.repl}"`;case'merge':return`com ${s.with} por ${s.key}`;case'top':return s.n+' linhas';case'split':return`${s.col} por "${s.delim}"`;case'unpivot':return'mantendo '+s.keep.join(', ');case'dateparts':return s.col;default:return s.col||''}}
function applyStep(T,s,qmap){const ci=n=>{const i=T.cols.findIndex(c=>c.name.toLowerCase()===String(n).toLowerCase());if(i<0)throw new Error(`Coluna "${n}" não encontrada`);return i};
  const cols=T.cols.map(c=>({...c}));let rows=T.rows;
  switch(s.op){
    case'rename':{const i=ci(s.from);if(T.cols.some((c,j)=>j!==i&&c.name.toLowerCase()===s.to.toLowerCase()))throw new Error('Já existe uma coluna '+s.to);cols[i].name=s.to;break}
    case'remove':{const idx=s.cols.map(ci);return{cols:cols.filter((_,j)=>!idx.includes(j)),rows:rows.map(r=>r.filter((_,j)=>!idx.includes(j)))}}
    case'keep':{const idx=s.cols.map(ci);return{cols:idx.map(i=>cols[i]),rows:rows.map(r=>idx.map(i=>r[i]))}}
    case'reorder':{const idx=s.cols.map(ci);return{cols:idx.map(i=>cols[i]),rows:rows.map(r=>idx.map(i=>r[i]))}}
    case'type':{const i=ci(s.col);cols[i].type=s.type;if(s.type==='date')delete cols[i].fmt;rows=rows.map(r=>{const n=r.slice();n[i]=castVal(r[i],s.type);return n});break}
    case'filter':{const i=ci(s.col);const t=cols[i].type;const cv=s.v==null?null:(t==='num'||t==='int'?ptNum(String(s.v)):t==='date'?castVal(s.v,'date'):String(s.v).toLowerCase());const set=s.vals?new Set(s.vals.map(String)):null;
      rows=rows.filter(r=>{const v=r[i];const vs=v==null?'':typeof v==='string'?v.toLowerCase():v;switch(s.cmp){case'eq':return vs===cv||(typeof vs==='string'&&vs===String(cv));case'ne':return vs!==cv;case'gt':return v!=null&&v>cv;case'lt':return v!=null&&v<cv;case'ge':return v!=null&&v>=cv;case'le':return v!=null&&v<=cv;case'contains':return String(vs).includes(cv);case'ncontains':return !String(vs).includes(cv);case'starts':return String(vs).startsWith(cv);case'empty':return v==null||v==='';case'nempty':return!(v==null||v==='');case'in':return set.has(v==null?'':String(typeof v==='number'&&t==='date'?v:v))}return true});break}
    case'nonull':rows=rows.filter(r=>r.some(v=>v!=null&&v!==''));break;
    case'addcol':{let ast;try{ast=parseFormula(s.expr.replace(/^=/,''))}catch(e){throw new Error('Expressão inválida: '+s.expr)}const map=new Map(cols.map((c,j)=>[c.name.toLowerCase(),j]));
      const out=rows.map(r=>{const ctx={r:0,c:0,get:()=>null,maxRow:()=>0,maxCol:()=>0,sheetByName:()=>null,resolveName:n=>{const j=map.get(n.toLowerCase());return j==null?null:r[j]},resolveCol:n=>{const j=map.get(n.toLowerCase());if(j==null)throw new FErr(ERR.name);return r[j]}};let v;try{v=scalar(ctx,evalAst(ast,ctx))}catch(e){v=e.v||ERR.val}return isErr(v)?null:v});
      const nc={name:s.name,type:s.type||inferType(out)};cols.push(nc);rows=rows.map((r,i)=>[...r,castVal(out[i],nc.type)]);break}
    case'index':{cols.push({name:s.name||'Índice',type:'int'});rows=rows.map((r,i)=>[...r,i+(s.start??1)]);break}
    case'dateparts':{const i=ci(s.col);const parts=s.parts||['Ano','Mês','Trimestre'];for(const p of parts)cols.push({name:s.col+' '+p,type:p==='Nome do mês'?'text':'int'});rows=rows.map(r=>{const v=r[i];const P=v==null?null:serialParts(v);return[...r,...parts.map(p=>P==null?null:p==='Ano'?P.y:p==='Mês'?P.m:p==='Trimestre'?Math.ceil(P.m/3):p==='Dia'?P.d:p==='Nome do mês'?MES3[P.m-1]:p==='Dia da semana'?P.wd+1:null)]});break}
    case'groupby':{const ki=s.keys.map(ci);const groups=new Map();for(const r of rows){const k=ki.map(i=>r[i]==null?'\u0000':String(r[i])).join('\u0001');if(!groups.has(k))groups.set(k,{key:ki.map(i=>r[i]),rows:[]});groups.get(k).rows.push(r)}
      const ag=s.aggs.map(a=>({...a,i:a.fn==='count'?-1:ci(a.col)}));const out=[...groups.values()].map(g=>[...g.key,...ag.map(a=>{if(a.fn==='count')return g.rows.length;const vs=g.rows.map(r=>r[a.i]).filter(v=>v!=null);const ns=vs.filter(v=>typeof v==='number');switch(a.fn){case'sum':return ns.reduce((x,y)=>x+y,0);case'avg':return ns.length?ns.reduce((x,y)=>x+y,0)/ns.length:null;case'min':return ns.length?Math.min(...ns):null;case'max':return ns.length?Math.max(...ns):null;case'dcount':return new Set(vs.map(String)).size;case'countnn':return vs.length}return null})]);
      return{cols:[...ki.map(i=>cols[i]),...ag.map(a=>({name:a.as,type:a.fn==='count'||a.fn==='dcount'||a.fn==='countnn'?'int':'num',fmt:a.i>=0?cols[a.i].fmt:undefined}))],rows:out}}
    case'sort':{const i=ci(s.col);rows=rows.slice().sort((a,b)=>{const c=cmpVals(a[i],b[i]);return s.desc?-c:c});break}
    case'dedupe':{const idx=(s.cols&&s.cols.length?s.cols:cols.map(c=>c.name)).map(ci);const seen=new Set();rows=rows.filter(r=>{const k=idx.map(i=>String(r[i])).join('\u0001');if(seen.has(k))return false;seen.add(k);return true});break}
    case'replace':{const i=ci(s.col);rows=rows.map(r=>{const n=r.slice();const v=r[i];if(v==null&&s.find==='')n[i]=castVal(s.repl,cols[i].type);else if(v!=null){if(s.whole?String(v)===s.find:false)n[i]=castVal(s.repl,cols[i].type);else if(!s.whole&&typeof v==='string')n[i]=v.split(s.find).join(s.repl);else if(String(v)===s.find)n[i]=castVal(s.repl,cols[i].type)}return n});break}
    case'filldown':{const i=ci(s.col);let last=null;rows=rows.map(r=>{const n=r.slice();if(n[i]==null||n[i]==='')n[i]=last;else last=n[i];return n});break}
    case'trim':case'upper':{const i=ci(s.col);rows=rows.map(r=>{const n=r.slice();if(typeof n[i]==='string')n[i]=s.op==='trim'?n[i].replace(/\s+/g,' ').trim():n[i].toUpperCase();return n});break}
    case'top':rows=rows.slice(0,s.n);break;
    case'split':{const i=ci(s.col);const parts=rows.map(r=>r[i]==null?[]:String(r[i]).split(s.delim));const n=Math.min(20,Math.max(1,...parts.map(p=>p.length)));const nc=range(1,n).map(k=>({name:s.col+'.'+k,type:'text'}));const newCols=[...cols.slice(0,i),...nc,...cols.slice(i+1)];const nr=rows.map((r,j)=>[...r.slice(0,i),...range(0,n-1).map(k=>{const v=parts[j][k];if(v==null)return null;const p=parseInput(v.trim());return p.v}),...r.slice(i+1)]);nc.forEach((c,k)=>c.type=inferType(nr.map(r=>r[i+k])));return{cols:newCols,rows:nr}}
    case'unpivot':{const keep=s.keep.map(ci);const other=cols.map((_,j)=>j).filter(j=>!keep.includes(j));const out=[];for(const r of rows)for(const j of other)if(r[j]!=null)out.push([...keep.map(i=>r[i]),cols[j].name,r[j]]);return{cols:[...keep.map(i=>cols[i]),{name:s.attr||'Atributo',type:'text'},{name:s.val||'Valor',type:inferType(out.map(r=>r[r.length-1]))}],rows:out}}
    case'merge':{const Q=qmap.get(s.with.toLowerCase());if(!Q)throw new Error('Consulta '+s.with+' não encontrada');const O=Q.out;if(!O)throw new Error('Consulta '+s.with+' com erro');const i=ci(s.key);const j=O.cols.findIndex(c=>c.name.toLowerCase()===String(s.key2||s.key).toLowerCase());if(j<0)throw new Error('Chave não encontrada em '+s.with);
      const idx=new Map();O.rows.forEach(r=>{const k=String(r[j]??'');if(!idx.has(k))idx.set(k,r)});const take=(s.cols||O.cols.map(c=>c.name).filter((_,k)=>k!==j)).map(n=>O.cols.findIndex(c=>c.name===n)).filter(k=>k>=0);
      const newCols=[...cols,...take.map(k=>{let n=O.cols[k].name;if(cols.some(c=>c.name.toLowerCase()===n.toLowerCase()))n=s.with+'.'+n;return{...O.cols[k],name:n}})];let nr=rows.map(r=>{const m=idx.get(String(r[i]??''));return[...r,...take.map(k=>m?m[k]:null)]});if(s.kind==='inner')nr=nr.filter((r,q)=>idx.has(String(rows[q][i]??'')));return{cols:newCols,rows:nr}}
  }
  return{cols,rows}}
function runQuery(q,qmap,upto){let T;q.err=null;q.errStep=-1;try{T=readSource(q.source)}catch(e){q.err=e.message;return null}
  const n=upto==null?q.steps.length:upto;for(let i=0;i<n;i++){try{T=applyStep(T,q.steps[i],qmap)}catch(e){q.err=e.message;q.errStep=i;return T}}return T}

/* ---- modelo ---- */
function buildModel(){MEMO=new Map();RELP=new Map();const qmap=new Map();const tables=new Map();
  for(const q of BI.queries){q.out=null}
  // ordem: consultas sem merge primeiro
  const order=[...BI.queries].sort((a,b)=>(a.steps.some(s=>s.op==='merge')?1:0)-(b.steps.some(s=>s.op==='merge')?1:0));
  for(const q of order){qmap.set(q.name.toLowerCase(),q);const T=runQuery(q,qmap);q.out=q.err&&q.errStep<0?null:T}
  for(const q of BI.queries){if(!q.out||q.disabled)continue;const T={name:q.name,cols:q.out.cols.map(c=>({...c})),rows:q.out.rows,q};T.ci=new Map(T.cols.map((c,j)=>[c.name.toLowerCase(),j]));tables.set(q.name.toLowerCase(),T)}
  MODEL={tables,ver:(MODEL?.ver||0)+1};BI_DIRTY=false;for(const T of tables.values())T.idx=new Map();
  for(const cc of BI.calcCols){const T=tables.get(cc.table.toLowerCase());if(!T)continue;let ast;try{ast=parseFormula(cc.expr.replace(/^=/,''),'dax')}catch(e){cc.err='Expressão inválida';continue}cc.err=null;const vals=T.rows.map((_,i)=>{try{const v=daxEval(ast,{filters:[],rowCtx:new Map([[T.name.toLowerCase(),i]])});return isErr(v)?null:scalarize(v)}catch(e){return null}});const type=cc.type||inferType(vals);T.cols.push({name:cc.name,type,calc:true,fmt:cc.fmt});T.ci.set(cc.name.toLowerCase(),T.cols.length-1);T.rows=T.rows.map((r,i)=>[...r,vals[i]])}
  for(const T of tables.values()){T.idx=new Map()}
  for(const r of BI.rels){const A=tables.get(r.from.t.toLowerCase()),B=tables.get(r.to.t.toLowerCase());r.err=!A||!B||A.ci.get(r.from.c.toLowerCase())==null||B.ci.get(r.to.c.toLowerCase())==null?'Coluna ou tabela ausente':null}
  BI_DIRTY=false;return MODEL}
function MDL(){if(BI_DIRTY||!MODEL)buildModel();return MODEL}
const TB=n=>MDL().tables.get(String(n).toLowerCase());
function colIdx(T,c){const i=T.ci.get(String(c).toLowerCase());if(i==null)throw new FErr({err:`Coluna ${T.name}[${c}] não encontrada`});return i}
function keyIndex(T,c){const k=c.toLowerCase();if(T.idx.has(k))return T.idx.get(k);const i=colIdx(T,c);const m=new Map();T.rows.forEach((r,j)=>{const key=r[i]==null?'':String(r[i]);if(!m.has(key))m.set(key,j)});T.idx.set(k,m);return m}
function autoRelationships(){const m=MDL();const found=[];const tables=[...m.tables.values()];
  for(const A of tables)for(const B of tables){if(A===B)continue;for(const cb of B.cols){const ia=A.ci.get(cb.name.toLowerCase());if(ia==null)continue;const ib=B.ci.get(cb.name.toLowerCase());const keysB=new Set(B.rows.map(r=>String(r[ib])));if(keysB.size!==B.rows.length||B.rows.length>=A.rows.length)continue;const vals=A.rows.slice(0,500).map(r=>String(r[ia]));if(!vals.length||vals.filter(v=>keysB.has(v)).length<vals.length*.8)continue;if(BI.rels.some(r=>r.from.t===A.name&&r.to.t===B.name)||found.some(r=>r.from.t===A.name&&r.to.t===B.name))continue;found.push({id:uid('rel'),from:{t:A.name,c:cb.name},to:{t:B.name,c:cb.name},active:true})}}
  BI.rels.push(...found);return found.length}

/* ---- contexto de filtro ---- */
const LVL={year:'Ano',quarter:'Trimestre',month:'Mês',day:'Dia',ym:'Mês/ano',yq:'Trimestre/ano'};
function lvlVal(v,lvl){if(v==null||!lvl)return v;const p=serialParts(v);switch(lvl){case'year':return p.y;case'quarter':return Math.ceil(p.m/3);case'month':return p.m;case'day':return Math.floor(v);case'ym':return p.y*100+p.m;case'yq':return p.y*10+Math.ceil(p.m/3)}return v}
function lvlLabel(v,lvl){if(v==null)return'(Em branco)';switch(lvl){case'year':return String(v);case'quarter':return'T'+v;case'month':return MES3[v-1]||String(v);case'day':return fmtValue(v,'dd/mm/yyyy');case'ym':return MES3[(v%100)-1]+'/'+String(Math.floor(v/100)).slice(2);case'yq':return Math.floor(v/10)+' T'+(v%10)}return String(v)}
function mkF(o){o.sig=[o.t,o.c||'',o.lvl||'',o.op,o.op==='in'?[...o.vals].map(String).sort().join(','):o.op==='range'?o.min+'~'+o.max:o.op==='rows'?o.id:o.op==='pred'?o.id:''].join('|');return o}
const fIn=(t,c,vals,lvl)=>mkF({t,c,lvl,op:'in',vals:vals instanceof Set?vals:new Set(vals)});
let PRED_ID=0;
function testF(f,T,row){const v=lvlVal(row[colIdx(T,f.c)],f.lvl);switch(f.op){case'in':{if(f.vals.has(v))return true;if(v==null)return f.vals.has(null)||f.vals.has('');return typeof v==='number'?false:f.vals.has(String(v))}case'range':return v!=null&&(f.min==null||v>=f.min)&&(f.max==null||v<=f.max);case'pred':return!!f.fn(v)}return true}
function rowsOf(tn,filters,_seen){const T=TB(tn);if(!T)return[];const key=T.name+'#'+filters.map(f=>f.sig).sort().join('&');if(MEMO.has(key))return MEMO.get(key);
  const seen=_seen||new Set();seen.add(T.name.toLowerCase());
  let idx=null;const own=filters.filter(f=>f.t.toLowerCase()===T.name.toLowerCase());
  const all=()=>T.rows.map((_,i)=>i);
  if(own.length){idx=[];outer:for(let i=0;i<T.rows.length;i++){const row=T.rows[i];for(const f of own){if(f.op==='rows'){if(!f.set.has(i))continue outer}else if(f.op==='rowpred'){if(!f.fn(i))continue outer}else if(!testF(f,T,row))continue outer}idx.push(i)}}
  for(const r of BI.rels){if(!r.active||r.err)continue;
    let other=null,myCol,otherCol;
    if(r.from.t.toLowerCase()===T.name.toLowerCase()){other=r.to.t;myCol=r.from.c;otherCol=r.to.c}
    else if(r.both&&r.to.t.toLowerCase()===T.name.toLowerCase()){other=r.from.t;myCol=r.to.c;otherCol=r.from.c}
    if(!other||seen.has(other.toLowerCase()))continue;
    const O=TB(other);if(!O)continue;
    if(!filters.some(f=>reaches(f.t,other,new Set([T.name.toLowerCase()]))))continue;
    const orows=rowsOf(other,filters,new Set(seen));if(orows.length===O.rows.length)continue;
    const oc=colIdx(O,otherCol);const keys=new Set(orows.map(i=>String(O.rows[i][oc]??'')));const mc=colIdx(T,myCol);
    idx=(idx||all()).filter(i=>keys.has(String(T.rows[i][mc]??'')))}
  const out=idx||all();MEMO.set(key,out);return out}
function reaches(from,to,seen){if(from.toLowerCase()===to.toLowerCase())return true;seen.add(to.toLowerCase());for(const r of BI.rels){if(!r.active||r.err)continue;let nxt=null;if(r.from.t.toLowerCase()===to.toLowerCase())nxt=r.to.t;else if(r.both&&r.to.t.toLowerCase()===to.toLowerCase())nxt=r.from.t;if(nxt&&!seen.has(nxt.toLowerCase())&&reaches(from,nxt,seen))return true}return false}
function withoutCol(filters,t,c){return filters.filter(f=>!(f.t.toLowerCase()===t.toLowerCase()&&(c==null||(f.c&&f.c.toLowerCase()===c.toLowerCase()))))}
function distinctVals(tn,c,filters,lvl){const T=TB(tn);const i=colIdx(T,c);const s=new Map();for(const r of rowsOf(tn,filters)){const v=lvlVal(T.rows[r][i],lvl);const k=v==null?'\u0000':typeof v+':'+v;if(!s.has(k))s.set(k,v)}return[...s.values()]}

/* ---- avaliador DAX ---- */
const DAX={};
function ddef(name,f,desc,sig){DAX[name]={f,lazy:true,desc,sig,en:name}}
function scalarize(v){if(v&&v.rows&&v.table)return v.rows.length?null:null;if(Array.isArray(v))return v[0]?.[0]??null;return v}
function daxCtx(base){return{filters:base.filters||[],rowCtx:base.rowCtx||new Map(),vars:base.vars,fnlib:DAX,get:()=>null,maxRow:()=>0,maxCol:()=>0,sheetByName:()=>null,
  resolveName(n){const T=TB(n);if(T)return{table:T.name};const m=BI.measures.find(x=>x.name.toLowerCase()===n.toLowerCase());if(m)return evalMeasure(m,this);return null},
  resolveTCol(t,c,ctx){const T=TB(t);if(!T)throw new FErr({err:`Tabela ${t} não encontrada`});const ri=ctx.rowCtx.get(T.name.toLowerCase());if(ri!=null){if(ri.vals)return ri.vals[c.toLowerCase()]??null;return T.rows[ri][colIdx(T,c)]}
    // valor único no contexto
    const vs=distinctVals(T.name,c,ctx.filters);if(vs.length===1)return vs[0];throw new FErr({err:`Valor único de ${T.name}[${c}] não pode ser determinado`})},
  resolveCol(n,ctx){const m=BI.measures.find(x=>x.name.toLowerCase()===n.toLowerCase());if(m)return evalMeasure(m,ctx);for(const [tn,ri] of ctx.rowCtx){const T=TB(tn);if(ri&&ri.vals){if(n.toLowerCase() in ri.vals)return ri.vals[n.toLowerCase()];continue}const j=T.ci.get(n.toLowerCase());if(j!=null)return T.rows[ri][j]}throw new FErr({err:`[${n}] não é medida nem coluna no contexto`})},
  daxIn(a,b){const vals=Array.isArray(b)?b.flat():[b];return vals.some(x=>cmpVals(scalar(this,a),x)===0)}}}
function daxEval(ast,base){const ctx=daxCtx(base);return evalAst(ast,ctx)}
function evalMeasure(m,ctx){if(!m._ast||m._src!==m.expr){try{m._ast=parseFormula(m.expr.replace(/^=/,''),'dax');m._src=m.expr;m.err=null}catch(e){m.err='Sintaxe inválida';throw new FErr({err:'Erro na medida '+m.name})}}
  let filters=ctx.filters;if(ctx.rowCtx&&ctx.rowCtx.size){filters=transition(ctx)}
  const depth=(ctx._depth||0)+1;if(depth>30)throw new FErr({err:'Referência circular em medidas'});
  const c2=daxCtx({filters});c2._depth=depth;const v=evalAst(m._ast,c2);return scalarize(v)}
function transition(ctx){let f=ctx.filters.slice();for(const [tn,ri] of ctx.rowCtx){if(ri&&ri.vals){for(const k in ri.vals){if(ri.cols&&ri.cols[k]){const c=ri.cols[k];f=withoutCol(f,c.t,c.c);f.push(fIn(c.t,c.c,[ri.vals[k]],c.lvl))}}continue}f.push(mkF({t:TB(tn).name,op:'rows',set:new Set([ri]),id:'r'+ri}))}return f}
function colArg(ast,ctx){if(ast&&ast.k==='tcol'){const T=TB(ast.t);if(!T)throw new FErr({err:'Tabela '+ast.t+' não encontrada'});return{T,c:ast.c,i:colIdx(T,ast.c)}}return null}
function tableArg(ast,ctx){// retorna {T, rows} ou {vals:[], col}
  if(!ast)throw new FErr(ERR.val);
  if(ast.k==='tbl'||ast.k==='name'){const T=TB(ast.v);if(!T){if(ast.k==='name'&&ctx.vars&&ctx.vars.has(stripAcc(ast.v).toUpperCase())){const v=ctx.vars.get(stripAcc(ast.v).toUpperCase());if(v&&v.table)return v}throw new FErr({err:'Tabela '+ast.v+' não encontrada'})}return{table:T.name,rows:rowsOf(T.name,ctx.filters)}}
  if(ast.k==='fn'){const v=evalAst(ast,ctx);if(v&&(v.table||v.vals))return v;throw new FErr({err:'Argumento de tabela esperado'})}
  if(ast.k==='tcol'){const T=TB(ast.t);return{vals:distinctVals(T.name,ast.c,ctx.filters),col:{t:T.name,c:ast.c}}}
  throw new FErr({err:'Argumento de tabela esperado'})}
function iterate(tb,ctx,fn){if(tb.vals){for(const v of tb.vals){const f=withoutCol(ctx.filters,tb.col.t,tb.col.c);f.push(fIn(tb.col.t,tb.col.c,[v],tb.col.lvl));const rc=new Map(ctx.rowCtx);rc.set('__v'+tb.col.t.toLowerCase(),{vals:{[tb.col.c.toLowerCase()]:v},cols:{[tb.col.c.toLowerCase()]:tb.col}});const c2=Object.assign(Object.create(ctx),{filters:f,rowCtx:rc});fn(c2,v)}return}
  const tl=tb.table.toLowerCase();const rc=new Map(ctx.rowCtx);const c2=Object.assign(Object.create(ctx),{rowCtx:rc});for(const i of tb.rows){rc.set(tl,i);fn(c2,i)}}
function aggCol(name,fnv){ddef(name,(a,ctx)=>{const ca=colArg(a[0],ctx);if(!ca){if(a.length>1&&(name==='MAX'||name==='MIN')){const x=num(scalar(ctx,evalAst(a[0],ctx))),y=num(scalar(ctx,evalAst(a[1],ctx)));return name==='MAX'?Math.max(x,y):Math.min(x,y)}const v=evalAst(a[0],ctx);return scalarize(v)}const rows=rowsOf(ca.T.name,ctx.filters);const vals=rows.map(r=>ca.T.rows[r][ca.i]);return fnv(vals)},`Agrega a coluna (${name})`,'Tabela[Coluna]')}
const nn=a=>a.filter(v=>typeof v==='number');
aggCol('SUM',v=>{const x=nn(v);return x.length?x.reduce((a,b)=>a+b,0):null});
aggCol('AVERAGE',v=>{const x=nn(v);return x.length?x.reduce((a,b)=>a+b,0)/x.length:null});
aggCol('MIN',v=>{const x=nn(v);return x.length?Math.min(...x):null});aggCol('MAX',v=>{const x=nn(v);return x.length?Math.max(...x):null});
aggCol('COUNT',v=>{const x=nn(v).length;return x||null});aggCol('COUNTA',v=>{const x=v.filter(y=>y!=null&&y!=='').length;return x||null});
aggCol('COUNTBLANK',v=>v.filter(y=>y==null||y==='').length);aggCol('DISTINCTCOUNT',v=>{const s=new Set(v.filter(y=>y!=null).map(String));return s.size||null});
aggCol('MEDIAN',v=>{const x=nn(v).sort((a,b)=>a-b);if(!x.length)return null;const m=x.length>>1;return x.length%2?x[m]:(x[m-1]+x[m])/2});
ddef('COUNTROWS',(a,ctx)=>{const t=a.length?tableArg(a[0],ctx):null;const n=t?(t.rows?t.rows.length:t.vals.length):0;return n||null},'Conta as linhas da tabela','Tabela');
const iterAgg=(name,red)=>ddef(name,(a,ctx)=>{const tb=tableArg(a[0],ctx);const vals=[];iterate(tb,ctx,c2=>{const v=scalar(c2,evalAst(a[1],c2));if(v!=null&&!isErr(v))vals.push(v)});return red(vals)},`Itera a tabela avaliando a expressão (${name})`,'Tabela; Expressão');
iterAgg('SUMX',v=>{const x=nn(v);return x.length?x.reduce((a,b)=>a+b,0):null});iterAgg('AVERAGEX',v=>{const x=nn(v);return x.length?x.reduce((a,b)=>a+b,0)/x.length:null});iterAgg('MINX',v=>{const x=nn(v);return x.length?Math.min(...x):null});iterAgg('MAXX',v=>{const x=nn(v);return x.length?Math.max(...x):null});iterAgg('COUNTX',v=>v.length||null);
ddef('CONCATENATEX',(a,ctx)=>{const tb=tableArg(a[0],ctx);const out=[];iterate(tb,ctx,c2=>{const v=scalar(c2,evalAst(a[1],c2));if(v!=null)out.push(txt(v))});return out.join(a[2]?S(ctx,evalAst(a[2],ctx)):', ')},'Concatena valores','Tabela; Expressão; [Delimitador]');
ddef('FILTER',(a,ctx)=>{const tb=tableArg(a[0],ctx);if(tb.vals){const keep=[];iterate(tb,ctx,(c2,v)=>{const r=scalar(c2,evalAst(a[1],c2));if(r&&!isErr(r))keep.push(v)});return{vals:keep,col:tb.col}}const keep=[];iterate(tb,ctx,(c2,i)=>{const r=scalar(c2,evalAst(a[1],c2));if(r&&!isErr(r))keep.push(i)});return{table:tb.table,rows:keep}},'Filtra a tabela','Tabela; Condição');
ddef('ALL',(a,ctx)=>{if(!a.length)throw new FErr(ERR.val);if(a[0].k==='tcol'){const T=TB(a[0].t);return{vals:distinctVals(T.name,a[0].c,withoutCol(ctx.filters,T.name,a[0].c)),col:{t:T.name,c:a[0].c},removeCol:true}}const T=TB(a[0].v);if(!T)throw new FErr(ERR.ref);return{table:T.name,rows:T.rows.map((_,i)=>i),removeAll:true}},'Remove filtros','Tabela | Tabela[Coluna]');DAX.REMOVEFILTERS=DAX.ALL;
ddef('ALLSELECTED',(a,ctx)=>DAX.ALL.f(a,ctx),'Remove filtros internos','Tabela | Tabela[Coluna]');
ddef('VALUES',(a,ctx)=>{if(a[0].k==='tcol'){const T=TB(a[0].t);return{vals:distinctVals(T.name,a[0].c,ctx.filters),col:{t:T.name,c:a[0].c}}}return tableArg(a[0],ctx)},'Valores distintos','Tabela[Coluna]');DAX.DISTINCT=DAX.VALUES;
ddef('RELATEDTABLE',(a,ctx)=>{const T=TB(a[0].v||a[0].t);if(!T)throw new FErr(ERR.ref);return{table:T.name,rows:rowsOf(T.name,transition(ctx))}},'Linhas relacionadas','Tabela');
ddef('RELATED',(a,ctx)=>{const ca=colArg(a[0],ctx);if(!ca)throw new FErr(ERR.val);for(const [tn,ri] of ctx.rowCtx){if(typeof ri!=='number')continue;const path=relPath(tn,ca.T.name.toLowerCase());if(!path)continue;let curT=TB(tn),cur=ri;for(const r of path){const fi=colIdx(curT,r.from.c);const O=TB(r.to.t);const j=keyIndex(O,r.to.c).get(String(curT.rows[cur][fi]??''));if(j==null)return null;curT=O;cur=j}return curT.rows[cur][ca.i]}throw new FErr({err:'RELATED sem relacionamento até '+ca.T.name})},'Valor da tabela relacionada (lado um)','Tabela[Coluna]');
let RELP=new Map();function relPath(from,to){const k=from+'>'+to;if(RELP.has(k))return RELP.get(k);const p=relPath0(from,to,new Set());RELP.set(k,p);return p}
function relPath0(from,to,seen){if(from===to)return[];seen.add(from);for(const r of BI.rels){if(!r.active||r.err)continue;if(r.from.t.toLowerCase()===from&&!seen.has(r.to.t.toLowerCase())){const p=relPath0(r.to.t.toLowerCase(),to,seen);if(p)return[r,...p]}}return null}
ddef('CALCULATE',(a,ctx)=>{let f=ctx.rowCtx.size?transition(ctx):ctx.filters.slice();const adds=[];
  for(const arg of a.slice(1)){const r=calcFilterArg(arg,ctx,f);f=r.filters;adds.push(...r.adds)}
  f=[...f,...adds];const c2=daxCtx({filters:f,vars:ctx.vars});c2._depth=(ctx._depth||0)+1;return scalarize(evalAst(a[0],c2))},'Avalia a expressão em um contexto de filtro modificado','Expressão; [Filtro1]; …');
ddef('CALCULATETABLE',(a,ctx)=>{let f=ctx.filters.slice();const adds=[];for(const arg of a.slice(1)){const r=calcFilterArg(arg,ctx,f);f=r.filters;adds.push(...r.adds)}f=[...f,...adds];const c2=daxCtx({filters:f});return tableArg(a[0],c2)},'Tabela com filtros modificados','Tabela; [Filtro1]; …');
function tcolRefs(ast,out=[]){if(!ast||typeof ast!=='object')return out;if(ast.k==='tcol')out.push(ast);for(const k of['a','b'])if(ast[k])tcolRefs(ast[k],out);if(ast.a&&Array.isArray(ast.a))ast.a.forEach(x=>tcolRefs(x,out));return out}
function calcFilterArg(arg,ctx,filters){
  if(arg.k==='fn'&&(arg.n==='ALL'||arg.n==='REMOVEFILTERS'||arg.n==='ALLSELECTED')){for(const x of arg.a){if(x.k==='tcol'){const T=TB(x.t);filters=withoutCol(filters,T.name,x.c)}else{const T=TB(x.v);if(T)filters=withoutCol(filters,T.name,null)}}if(!arg.a.length)filters=[];return{filters,adds:[]}}
  if(arg.k==='fn'&&arg.n==='ALLEXCEPT'){const T=TB(arg.a[0].v||arg.a[0].t);const keep=new Set(arg.a.slice(1).map(x=>x.c.toLowerCase()));filters=filters.filter(f=>!(f.t.toLowerCase()===T.name.toLowerCase()&&!(f.c&&keep.has(f.c.toLowerCase()))));return{filters,adds:[]}}
  if(arg.k==='fn'&&arg.n==='KEEPFILTERS'){const r=calcFilterArg(arg.a[0],ctx,filters);return{filters,adds:r.adds}}
  if(arg.k==='fn'&&arg.n==='USERELATIONSHIP')return{filters,adds:[]};
  if(arg.k==='fn'&&TIMEFN.has(arg.n)){const tf=evalAst(arg,daxCtx({filters,vars:ctx.vars}));const T=TB(tf.col.t);filters=withoutCol(filters,T.name,tf.col.c);return{filters,adds:[fIn(T.name,tf.col.c,tf.vals)]}}
  if(arg.k==='fn'&&(arg.n==='FILTER'||arg.n==='VALUES'||arg.n==='DATESBETWEEN')){const tb=evalAst(arg,daxCtx({filters,vars:ctx.vars}));if(tb.vals){filters=withoutCol(filters,tb.col.t,tb.col.c);return{filters,adds:[fIn(tb.col.t,tb.col.c,tb.vals)]}}const inner=arg.a[0];if(inner&&inner.k==='fn'&&inner.n==='ALL'){const T=TB(inner.a[0].v||inner.a[0].t);if(inner.a[0].k==='tcol')filters=withoutCol(filters,T.name,inner.a[0].c);else filters=withoutCol(filters,T.name,null)}return{filters,adds:[mkF({t:tb.table,op:'rows',set:new Set(tb.rows),id:'p'+(++PRED_ID)})]}}
  // expressão booleana sobre colunas
  const refs=tcolRefs(arg);if(!refs.length)throw new FErr({err:'Filtro do CALCULATE precisa referenciar uma coluna'});
  const T=TB(refs[0].t);const cols=[...new Set(refs.map(r=>r.c.toLowerCase()))];
  if(refs.every(r=>r.t.toLowerCase()===refs[0].t.toLowerCase())&&cols.length===1){const c=refs[0].c;filters=withoutCol(filters,T.name,c);
    if(arg.k==='bin'&&arg.op==='='&&arg.a.k==='tcol'){const v=scalar(ctx,evalAst(arg.b,ctx));return{filters,adds:[fIn(T.name,c,[v])]}}
    const fn=v=>{const rc=new Map([['__p',{vals:{[c.toLowerCase()]:v}}]]);const c2=daxCtx({filters:[],rowCtx:rc,vars:ctx.vars});const rv=scalar(c2,evalAst(arg,c2));return rv&&!isErr(rv)};
    const all=distinctVals(T.name,c,[]);return{filters,adds:[fIn(T.name,c,all.filter(fn))]}}
  for(const cc of cols)filters=withoutCol(filters,T.name,cc);
  const keep=[];T.rows.forEach((_,i)=>{const c2=daxCtx({filters:[],rowCtx:new Map([[T.name.toLowerCase(),i]]),vars:ctx.vars});const rv=scalar(c2,evalAst(arg,c2));if(rv&&!isErr(rv))keep.push(i)});
  return{filters,adds:[mkF({t:T.name,op:'rows',set:new Set(keep),id:'q'+(++PRED_ID)})]}}
// inteligência de tempo
const TIMEFN=new Set(['DATESYTD','DATESMTD','DATESQTD','DATEADD','SAMEPERIODLASTYEAR','PREVIOUSMONTH','PREVIOUSYEAR','PREVIOUSQUARTER','PARALLELPERIOD','DATESBETWEEN','DATESINPERIOD']);
function visDates(ctx,T,c){return distinctVals(T.name,c,ctx.filters).filter(v=>typeof v==='number').sort((a,b)=>a-b)}
function allDates(T,c){const i=colIdx(T,c);return[...new Set(T.rows.map(r=>r[i]).filter(v=>typeof v==='number'))].sort((a,b)=>a-b)}
function shiftDate(d,n,unit){const p=serialParts(d);if(unit==='DAY')return d+n;const mm=unit==='YEAR'?n*12:unit==='QUARTER'?n*3:n;const last=new Date(Date.UTC(p.y,p.m-1+mm+1,0)).getUTCDate();return(Date.UTC(p.y,p.m-1+mm,Math.min(p.d,last))-EPOCH)/864e5}
const unitOf=ast=>ast?String(ast.v||'').toUpperCase().replace('MES','MONTH').replace('ANO','YEAR'):'MONTH';
const tdef=(name,fn,desc)=>ddef(name,(a,ctx)=>{const ca=colArg(a[0],ctx);if(!ca)throw new FErr({err:name+' requer Tabela[Data]'});const vals=fn(ctx,ca.T,ca.c,a);return{vals,col:{t:ca.T.name,c:ca.c}}},desc,'Tabela[Data]');
tdef('DATESYTD',(ctx,T,c)=>{const v=visDates(ctx,T,c);if(!v.length)return[];const mx=v[v.length-1];const y=serialParts(mx).y;return allDates(T,c).filter(d=>serialParts(d).y===y&&d<=mx)},'Datas do início do ano até a data');
tdef('DATESQTD',(ctx,T,c)=>{const v=visDates(ctx,T,c);if(!v.length)return[];const mx=v[v.length-1];const p=serialParts(mx);const q=Math.ceil(p.m/3);return allDates(T,c).filter(d=>{const x=serialParts(d);return x.y===p.y&&Math.ceil(x.m/3)===q&&d<=mx})},'Datas do início do trimestre');
tdef('DATESMTD',(ctx,T,c)=>{const v=visDates(ctx,T,c);if(!v.length)return[];const mx=v[v.length-1];const p=serialParts(mx);return allDates(T,c).filter(d=>{const x=serialParts(d);return x.y===p.y&&x.m===p.m&&d<=mx})},'Datas do início do mês');
tdef('DATEADD',(ctx,T,c,a)=>{const n=num(scalar(ctx,evalAst(a[1],ctx)));const u=unitOf(a[2]);const set=new Set(visDates(ctx,T,c).map(d=>shiftDate(d,n,u)));return allDates(T,c).filter(d=>set.has(d))},'Desloca as datas');
tdef('SAMEPERIODLASTYEAR',(ctx,T,c)=>{const set=new Set(visDates(ctx,T,c).map(d=>shiftDate(d,-1,'YEAR')));return allDates(T,c).filter(d=>set.has(d))},'Mesmo período do ano anterior');
tdef('PARALLELPERIOD',(ctx,T,c,a)=>{const n=num(scalar(ctx,evalAst(a[1],ctx)));const u=unitOf(a[2]);const v=visDates(ctx,T,c);if(!v.length)return[];const s=shiftDate(v[0],n,u),e=shiftDate(v[v.length-1],n,u);const ps=serialParts(s),pe=serialParts(e);const st=u==='YEAR'?dateToSerial(ps.y,1,1):dateToSerial(ps.y,ps.m,1);const en=u==='YEAR'?dateToSerial(pe.y,12,31):(Date.UTC(pe.y,pe.m,0)-EPOCH)/864e5;return allDates(T,c).filter(d=>d>=st&&d<=en)},'Período paralelo inteiro');
tdef('PREVIOUSMONTH',(ctx,T,c)=>{const v=visDates(ctx,T,c);if(!v.length)return[];const p=serialParts(v[0]);const m=p.m===1?12:p.m-1,y=p.m===1?p.y-1:p.y;return allDates(T,c).filter(d=>{const x=serialParts(d);return x.y===y&&x.m===m})},'Mês anterior');
tdef('PREVIOUSQUARTER',(ctx,T,c)=>{const v=visDates(ctx,T,c);if(!v.length)return[];const p=serialParts(v[0]);let q=Math.ceil(p.m/3)-1,y=p.y;if(q<1){q=4;y--}return allDates(T,c).filter(d=>{const x=serialParts(d);return x.y===y&&Math.ceil(x.m/3)===q})},'Trimestre anterior');
tdef('PREVIOUSYEAR',(ctx,T,c)=>{const v=visDates(ctx,T,c);if(!v.length)return[];const y=serialParts(v[0]).y-1;return allDates(T,c).filter(d=>serialParts(d).y===y)},'Ano anterior');
tdef('DATESBETWEEN',(ctx,T,c,a)=>{const s=num(scalar(ctx,evalAst(a[1],ctx))),e=num(scalar(ctx,evalAst(a[2],ctx)));return allDates(T,c).filter(d=>d>=s&&d<=e)},'Datas entre');
tdef('DATESINPERIOD',(ctx,T,c,a)=>{const s=num(scalar(ctx,evalAst(a[1],ctx)));const n=num(scalar(ctx,evalAst(a[2],ctx)));const u=unitOf(a[3]);const e=shiftDate(s,n,u);const lo=Math.min(s,e),hi=Math.max(s,e);return allDates(T,c).filter(d=>n<0?d>lo&&d<=hi:d>=lo&&d<hi)},'Datas no período');
ddef('TOTALYTD',(a,ctx)=>DAX.CALCULATE.f([a[0],{k:'fn',n:'DATESYTD',a:[a[1]]}],ctx),'Total do ano até a data','Expressão; Tabela[Data]');
ddef('TOTALMTD',(a,ctx)=>DAX.CALCULATE.f([a[0],{k:'fn',n:'DATESMTD',a:[a[1]]}],ctx),'Total do mês até a data','Expressão; Tabela[Data]');
ddef('TOTALQTD',(a,ctx)=>DAX.CALCULATE.f([a[0],{k:'fn',n:'DATESQTD',a:[a[1]]}],ctx),'Total do trimestre até a data','Expressão; Tabela[Data]');
ddef('DIVIDE',(a,ctx)=>{const x=scalar(ctx,evalAst(a[0],ctx)),y=scalar(ctx,evalAst(a[1],ctx));if(x==null||isErr(x))return null;const d=num(y);if(!d)return a[2]?scalar(ctx,evalAst(a[2],ctx)):null;return num(x)/d},'Divisão segura','Numerador; Denominador; [Alternativo]');
ddef('BLANK',()=>null,'Valor em branco','');
ddef('ISBLANK',(a,ctx)=>{const v=scalar(ctx,evalAst(a[0],ctx));return v==null||v===''},'É em branco','Valor');
ddef('COALESCE',(a,ctx)=>{for(const x of a){const v=scalar(ctx,evalAst(x,ctx));if(v!=null&&v!=='')return v}return null},'Primeiro não vazio','Valor1; …');
ddef('SELECTEDVALUE',(a,ctx)=>{const ca=colArg(a[0],ctx);const vs=distinctVals(ca.T.name,ca.c,ctx.filters);return vs.length===1?vs[0]:(a[1]?scalar(ctx,evalAst(a[1],ctx)):null)},'Valor selecionado se único','Tabela[Coluna]; [Alternativo]');
ddef('HASONEVALUE',(a,ctx)=>{const ca=colArg(a[0],ctx);return distinctVals(ca.T.name,ca.c,ctx.filters).length===1},'Tem um único valor','Tabela[Coluna]');
ddef('ISFILTERED',(a,ctx)=>{const ca=colArg(a[0],ctx);return ctx.filters.some(f=>f.t.toLowerCase()===ca.T.name.toLowerCase()&&f.c&&f.c.toLowerCase()===ca.c.toLowerCase())},'Coluna filtrada diretamente','Tabela[Coluna]');
ddef('RANKX',(a,ctx)=>{const tb=tableArg(a[0],ctx.rowCtx.size?daxCtx({filters:transition(ctx)}):ctx);const cur=scalar(ctx,evalAst(a[1],ctx));const vals=[];const base=daxCtx({filters:ctx.filters.filter(f=>!(tb.col&&f.t===tb.col.t&&f.c===tb.col.c))});iterate(tb,base,c2=>{vals.push(scalar(c2,evalAst(a[1],c2)))});const asc=a[3]&&String(a[3].v||'').toUpperCase()==='ASC';const n=vals.filter(v=>v!=null&&(asc?v<cur:v>cur)).length;return cur==null?null:n+1},'Classificação','Tabela; Expressão; [Valor]; [Ordem]');
ddef('FORMAT',(a,ctx)=>{const v=scalar(ctx,evalAst(a[0],ctx));const f=S(ctx,evalAst(a[1],ctx));return v==null?'':typeof v==='number'?fmtValue(v,ptFmtCode(f)):txt(v)},'Formata valor','Valor; Formato');
ddef('IF',(a,ctx)=>{const t=scalar(ctx,evalAst(a[0],ctx));if(t&&!isErr(t))return scalar(ctx,evalAst(a[1],ctx));return a[2]?scalar(ctx,evalAst(a[2],ctx)):null},'Condicional','Condição; Verdadeiro; [Falso]');
ddef('SWITCH',(a,ctx)=>FN.SWITCH.f(a,ctx),'Escolhe por valor','Expressão; Valor1; Resultado1; …');
ddef('TRUE',()=>true,'Verdadeiro','');ddef('FALSE',()=>false,'Falso','');
ddef('AND',(a,ctx)=>a.every(x=>!!scalar(ctx,evalAst(x,ctx))),'E','');ddef('OR',(a,ctx)=>a.some(x=>!!scalar(ctx,evalAst(x,ctx))),'Ou','');ddef('NOT',(a,ctx)=>!scalar(ctx,evalAst(a[0],ctx)),'Não','');
ddef('FIRSTDATE',(a,ctx)=>{const ca=colArg(a[0],ctx);const v=visDates(ctx,ca.T,ca.c);return v[0]??null},'Primeira data','Tabela[Data]');ddef('LASTDATE',(a,ctx)=>{const ca=colArg(a[0],ctx);const v=visDates(ctx,ca.T,ca.c);return v[v.length-1]??null},'Última data','Tabela[Data]');
const DAX_LIST=()=>Object.keys(DAX).sort();

/* ---- itens de valor dos visuais ---- */
const AGGN={sum:'Soma',avg:'Média',count:'Contagem',dcount:'Contagem distinta',min:'Mín',max:'Máx',none:'Não resumir'};
function itemName(it){if(!it)return'';if(it.m)return it.m;if(it.lvl)return it.c+' · '+LVL[it.lvl];if(it.agg&&it.agg!=='none')return AGGN[it.agg]+' de '+it.c;return it.c}
function evalItem(it,filters){if(it.m){const m=BI.measures.find(x=>x.name===it.m);if(!m)throw new FErr({err:'Medida '+it.m+' não existe'});return evalMeasure(m,daxCtx({filters}))}
  const T=TB(it.t);if(!T)return null;const i=colIdx(T,it.c);const vals=rowsOf(T.name,filters).map(r=>T.rows[r][i]);const x=nn(vals);
  switch(it.agg||'sum'){case'sum':return x.length?x.reduce((a,b)=>a+b,0):null;case'avg':return x.length?x.reduce((a,b)=>a+b,0)/x.length:null;case'min':return x.length?Math.min(...x):null;case'max':return x.length?Math.max(...x):null;case'count':return vals.filter(v=>v!=null).length||null;case'dcount':return new Set(vals.filter(v=>v!=null).map(String)).size||null}return null}
function itemFmt(it){if(it.fmt)return it.fmt;if(it.m){const m=BI.measures.find(x=>x.name===it.m);return m&&m.fmt||'#,##0.##'}if(it.agg==='count'||it.agg==='dcount')return'#,##0';const T=TB(it.t);const c=T&&T.cols[T.ci.get(it.c.toLowerCase())];if(c&&c.type==='date'&&(it.agg==='min'||it.agg==='max'))return'dd/mm/yyyy';return c&&c.fmt||'#,##0.##'}
function fmtShort(v,f){if(v==null)return'(Em branco)';if(typeof v!=='number')return txt(v);const a=Math.abs(v);const pre=/R\$/.test(f||'')?'R$ ':'';const pct=/%/.test(f||'');if(pct)return fmtValue(v,f);if(a>=1e9)return pre+fmtNumPlain(v/1e9,1,0,true)+' bi';if(a>=1e6)return pre+fmtNumPlain(v/1e6,1,0,true)+' mi';if(a>=1e4)return pre+fmtNumPlain(v/1e3,1,0,true)+' mil';return fmtValue(v,f)}
