/* ================= motor de fórmulas ================= */
const ERR={div:{err:'#DIV/0!'},na:{err:'#N/D'},val:{err:'#VALOR!'},ref:{err:'#REF!'},name:{err:'#NOME?'},num:{err:'#NÚM!'},spill:{err:'#DESPEJAR!'},circ:{err:'#CIRC!'},nul:{err:'#NULO!'},calc:{err:'#CALC!'}};
const ERR_ALIAS={'#DIV/0!':ERR.div,'#N/D':ERR.na,'#N/A':ERR.na,'#VALOR!':ERR.val,'#VALUE!':ERR.val,'#REF!':ERR.ref,'#NOME?':ERR.name,'#NAME?':ERR.name,'#NÚM!':ERR.num,'#NUM!':ERR.num,'#DESPEJAR!':ERR.spill,'#SPILL!':ERR.spill,'#NULO!':ERR.nul,'#NULL!':ERR.nul,'#CALC!':ERR.calc,'#CIRC!':ERR.circ};
const isErr=v=>v!==null&&typeof v==='object'&&!!v.err;
class Ref{constructor(sh,r1,c1,r2,c2){this.sh=sh;this.r1=r1;this.c1=c1;this.r2=r2;this.c2=c2}get rows(){return this.r2-this.r1+1}get cols(){return this.c2-this.c1+1}get single(){return this.r1===this.r2&&this.c1===this.c2}}
class FErr extends Error{constructor(v){super(v.err);this.v=v}}

/* ---------- tokenizer ---------- */
const RX_SHEET=/^(?:'((?:[^']|'')+)'|([A-Za-z_À-ÿ][\wÀ-ÿ.]*))!/;
const RX_CELL=/^(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})(?::(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7}))?/;
const RX_COLR=/^(\$?)([A-Za-z]{1,3}):(\$?)([A-Za-z]{1,3})(?![\w(])/;
const RX_ROWR=/^(\$?)(\d{1,7}):(\$?)(\d{1,7})(?![\d.])/;
function tokenize(src,mode){
  const T=[];let i=0;const n=src.length;
  const push=(t,v,s,extra)=>T.push(Object.assign({t,v,s,e:i,text:src.slice(s,i)},extra));
  let brace=0;
  while(i<n){
    const ch=src[i],s=i;
    if(/\s/.test(ch)){while(i<n&&/\s/.test(src[i]))i++;push('ws',null,s);continue}
    if(ch==='"'){i++;let v='';while(i<n){if(src[i]==='"'){if(src[i+1]==='"'){v+='"';i+=2;continue}i++;break}v+=src[i++]}push('str',v,s);continue}
    if(ch==='#'){const m=/^#(DIV\/0!|N\/[AD]|VALOR!|VALUE!|REF!|NOME\?|NAME\?|NÚM!|NUM!|DESPEJAR!|SPILL!|NULO!|NULL!|CALC!|CIRC!)/i.exec(src.slice(i));if(m){i+=m[0].length;push('err',ERR_ALIAS[m[0].toUpperCase()]||ERR.val,s);continue}}
    if(ch==='['){let j=i+1,depth=1;while(j<n&&depth){if(src[j]==='[')depth++;else if(src[j]===']')depth--;j++}const inner=src.slice(i+1,j-1);i=j;push('col',inner.replace(/^\[|\]$/g,''),s);continue}
    const rest=src.slice(i);
    // referência (com folha opcional)
    if(mode!=='dax'){
      let sh=null,mm=RX_SHEET.exec(rest),off=0;
      if(mm){sh=(mm[1]||mm[2]).replace(/''/g,"'");off=mm[0].length}
      const r2=rest.slice(off);let m;
      if((m=RX_CELL.exec(r2))&&!/^[\w(]/.test(r2.slice(m[0].length))&&!/^[A-Za-z_À-ÿ.]/.test(r2.slice(m[0].length))){
        i+=off+m[0].length;
        const a={r:+m[4]-1,c:colIndex(m[2]),ar:!!m[3],ac:!!m[1]};
        if(m[6]){const b={r:+m[8]-1,c:colIndex(m[6]),ar:!!m[7],ac:!!m[5]};push('ref',null,s,{sh,a,b})}else push('ref',null,s,{sh,a});
        continue;
      }
      if((m=RX_COLR.exec(r2))){i+=off+m[0].length;push('ref',null,s,{sh,a:{r:0,c:colIndex(m[2]),ar:true,ac:!!m[1]},b:{r:1048575,c:colIndex(m[4]),ar:true,ac:!!m[3]},wholeCol:true});continue}
      if((m=RX_ROWR.exec(r2))&&(off||T.length===0||!['num'].includes(lastT(T)?.t))){i+=off+m[0].length;push('ref',null,s,{sh,a:{r:+m[2]-1,c:0,ar:!!m[1],ac:true},b:{r:+m[4]-1,c:16383,ar:!!m[3],ac:true},wholeRow:true});continue}
      if(mm){i+=off;push('err',ERR.ref,s);continue}
    }
    if(/[0-9]/.test(ch)||(ch==='.'&&/[0-9]/.test(src[i+1]))){
      if(mode!=='en'&&brace===0){const mp=/^\d+,\d+(?:[eE][-+]?\d+)?/.exec(rest);if(mp){i+=mp[0].length;push('num',+mp[0].replace(',','.'),s);continue}}
      const m=/^\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(rest);i+=m[0].length;push('num',+m[0],s);continue}
    if(ch==="'"&&mode==='dax'){let j=i+1;while(j<n&&!(src[j]==="'"&&src[j+1]!=="'"))j++;const name=src.slice(i+1,j).replace(/''/g,"'");i=j+1;if(src[i]==='['){let k=i+1;while(k<n&&src[k]!==']')k++;const c=src.slice(i+1,k);i=k+1;push('tcol',null,s,{tb:name,cl:c})}else push('tbl',name,s);continue}
    if(/[A-Za-z_À-ÿ]/.test(ch)){
      const m=/^[A-Za-z_À-ÿ][\wÀ-ÿ.]*/.exec(rest);i+=m[0].length;const id=m[0];
      if(src[i]==='['){let k=i+1;while(k<n&&src[k]!==']')k++;const c=src.slice(i+1,k);i=k+1;push('tcol',null,s,{tb:id,cl:c});continue}
      let j=i;while(j<n&&src[j]===' ')j++;
      if(src[j]==='('){push('func',id,s);continue}
      const U=stripAcc(id).toUpperCase();
      if(U==='TRUE'||U==='VERDADEIRO'){push('bool',true,s);continue}
      if(U==='FALSE'||U==='FALSO'){push('bool',false,s);continue}
      push('name',id,s);continue;
    }
    if(ch==='{'){brace++;i++;push('lb',null,s);continue}
    if(ch==='}'){brace--;i++;push('rb',null,s);continue}
    if(ch==='('){i++;push('lp',null,s);continue}
    if(ch===')'){i++;push('rp',null,s);continue}
    if(ch===','||ch===';'){i++;if(brace>0)push(ch===';'?'rsep':'csep',null,s);else push('sep',null,s);continue}
    const two=src.substr(i,2);
    if(['<=','>=','<>','&&','||'].includes(two)){i+=2;push('op',two==='&&'?'AND':two==='||'?'OR':two,s);continue}
    if('+-*/^&=<>%:'.includes(ch)){i++;push('op',ch,s);continue}
    i++;push('bad',ch,s);
  }
  return T;
}
const lastT=T=>{for(let k=T.length-1;k>=0;k--)if(T[k].t!=='ws')return T[k];return null};

/* ---------- parser (Pratt) ---------- */
const BP={'=':1,'<>':1,'<':1,'>':1,'<=':1,'>=':1,'IN':1,'AND':0.5,'OR':0.4,'&':2,'+':3,'-':3,'*':4,'/':4,'^':5};
function parseFormula(src,mode){
  const T=tokenize(src,mode).filter(t=>t.t!=='ws');let p=0;
  const peek=()=>T[p],next=()=>T[p++];
  const expect=t=>{const k=next();if(!k||k.t!==t)throw new FErr(ERR.name);return k};
  function prefix(){
    const k=next();if(!k)throw new FErr(ERR.val);
    switch(k.t){
      case 'num':return{k:'n',v:k.v};
      case 'str':return{k:'s',v:k.v};
      case 'bool':return{k:'b',v:k.v};
      case 'err':return{k:'e',v:k.v};
      case 'ref':return k.b?{k:'rng',sh:k.sh,a:k.a,b:k.b,wc:k.wholeCol,wr:k.wholeRow}:{k:'ref',sh:k.sh,a:k.a};
      case 'col':return{k:'col',v:k.v};
      case 'tcol':return{k:'tcol',t:k.tb,c:k.cl};
      case 'tbl':return{k:'tbl',v:k.v};
      case 'name':{
        const U=stripAcc(k.v).toUpperCase();
        if(mode==='dax'&&U==='VAR'){const defs=[];p--;while(peek()&&peek().t==='name'&&stripAcc(peek().v).toUpperCase()==='VAR'){next();const nm=expect('name').v;const eq=next();if(!eq||eq.v!=='=')throw new FErr(ERR.name);defs.push([nm,expr(0)])}const r=next();if(!r||stripAcc(r.v||'').toUpperCase()!=='RETURN')throw new FErr(ERR.name);return{k:'let',defs,body:expr(0)}}
        return{k:'name',v:k.v};
      }
      case 'func':{
        expect('lp');const a=[];
        if(peek()&&peek().t==='rp'){next();return mkFn(k.v,a)}
        while(true){
          if(peek()&&(peek().t==='sep'||peek().t==='rp'))a.push({k:'missing'});else a.push(expr(0));
          const z=next();if(!z)throw new FErr(ERR.val);if(z.t==='rp')break;if(z.t!=='sep')throw new FErr(ERR.val);
        }
        return mkFn(k.v,a);
      }
      case 'lp':{const e=expr(0);expect('rp');return e}
      case 'lb':{const rows=[[]];while(true){const z=peek();if(!z)throw new FErr(ERR.val);if(z.t==='rb'){next();break}if(z.t==='csep'){next();continue}if(z.t==='rsep'){next();rows.push([]);continue}rows[rows.length-1].push(prefixSigned())}return{k:'arr',rows}}
      case 'op':if(k.v==='-'||k.v==='+'){const a=expr(6);return k.v==='-'?{k:'u',op:'-',a}:a}throw new FErr(ERR.val);
      default:throw new FErr(ERR.name);
    }
  }
  function prefixSigned(){const z=peek();if(z&&z.t==='op'&&z.v==='-'){next();const a=prefix();return{k:'u',op:'-',a}}return prefix()}
  function expr(min){
    let left=prefix();
    while(true){
      const k=peek();if(!k)break;
      if(k.t==='op'&&k.v==='%'){next();left={k:'pct',a:left};continue}
      let op=null;
      if(k.t==='op'&&BP[k.v]!=null)op=k.v;
      else if(mode==='dax'&&k.t==='name'&&['IN','AND','OR'].includes(stripAcc(k.v).toUpperCase())&&peek()){op=stripAcc(k.v).toUpperCase()}
      if(!op)break;const bp=BP[op];if(bp<=min&&!(op==='^'&&bp===min))break;if(bp<=min)break;
      next();const right=expr(op==='^'?bp-0.01:bp);left={k:'bin',op,a:left,b:right};
    }
    return left;
  }
  const ast=expr(0);if(p<T.length)throw new FErr(ERR.val);return ast;
}
function mkFn(raw,a){return{k:'fn',n:canonFn(raw),raw,a}}

/* ---------- registro de funções ---------- */
const FN={};const PT2EN={};const EN2PT={};
function canonFn(raw){let U=stripAcc(raw).toUpperCase();if(U.startsWith('_XLFN.'))U=U.slice(6);if(U.startsWith('_XLWS.'))U=U.slice(6);return PT2EN[U]||U}
function def(en,pt,cat,sig,desc,f,opt={}){FN[en]=Object.assign({en,pt,cat,sig,desc,f},opt);if(pt){for(const x of pt.split('|')){PT2EN[stripAcc(x).toUpperCase()]=en}EN2PT[en]=pt.split('|')[0]}}

/* ---------- helpers de valor ---------- */
function getRefVal(ctx,ref,r,c){return ctx.get(ref.sh,r,c)}
function refToArray(ctx,ref){const out=[];const r2=Math.min(ref.r2,ctx.maxRow(ref.sh)),c2=Math.min(ref.c2,ctx.maxCol(ref.sh));for(let r=ref.r1;r<=Math.max(r2,ref.r1);r++){const row=[];for(let c=ref.c1;c<=Math.max(c2,ref.c1);c++)row.push(ctx.get(ref.sh,r,c));out.push(row)}return out}
function toArr(ctx,v){if(v instanceof Ref)return refToArray(ctx,v);if(Array.isArray(v))return v;return[[v]]}
function scalar(ctx,v){
  if(v instanceof Ref){if(v.single)return ctx.get(v.sh,v.r1,v.c1);
    if(v.cols===1&&ctx.r!=null&&ctx.r>=v.r1&&ctx.r<=v.r2)return ctx.get(v.sh,ctx.r,v.c1);
    if(v.rows===1&&ctx.c!=null&&ctx.c>=v.c1&&ctx.c<=v.c2)return ctx.get(v.sh,v.r1,ctx.c);
    return ctx.get(v.sh,v.r1,v.c1);}
  if(Array.isArray(v))return v[0]?.[0]??null;
  return v;
}
function num(v){
  if(v==null||v==='')return 0;if(typeof v==='number')return v;if(typeof v==='boolean')return v?1:0;if(isErr(v))throw new FErr(v);
  const p=parseInput(v);if(typeof p.v==='number')return p.v;throw new FErr(ERR.val);
}
const N=(ctx,v)=>num(scalar(ctx,v));
const S=(ctx,v)=>{v=scalar(ctx,v);if(isErr(v))throw new FErr(v);if(v==null)return'';if(typeof v==='boolean')return v?'VERDADEIRO':'FALSO';if(typeof v==='number')return fmtGeneral(v);return String(v)};
const B=(ctx,v)=>{v=scalar(ctx,v);if(isErr(v))throw new FErr(v);if(typeof v==='string'){const U=stripAcc(v).toUpperCase();if(U==='TRUE'||U==='VERDADEIRO')return true;if(U==='FALSE'||U==='FALSO')return false;throw new FErr(ERR.val)}return !!v};
function flatNums(ctx,args,{countText=false}={}){
  const out=[];
  for(const a of args){
    if(a instanceof Ref||Array.isArray(a)){for(const row of toArr(ctx,a))for(const x of row){if(isErr(x))throw new FErr(x);if(typeof x==='number')out.push(x);else if(countText&&x!=null&&x!=='')out.push(typeof x==='boolean'?+x:0)}}
    else{const x=a;if(isErr(x))throw new FErr(x);if(x==null)continue;out.push(num(x))}
  }
  return out;
}
function flatAll(ctx,args){const out=[];for(const a of args){if(a instanceof Ref||Array.isArray(a)){for(const row of toArr(ctx,a))for(const x of row)out.push(x)}else out.push(a)}return out}
function cmpVals(a,b){ // Excel ordering: number < text < bool
  const rank=x=>x==null?0:typeof x==='number'?1:typeof x==='string'?2:typeof x==='boolean'?3:4;
  if(a==null&&typeof b==='number')a=0;if(b==null&&typeof a==='number')b=0;
  if(a==null&&typeof b==='string')a='';if(b==null&&typeof a==='string')b='';
  const ra=rank(a),rb=rank(b);if(ra!==rb)return ra-rb;
  if(typeof a==='string')return a.localeCompare(b,'pt-BR',{sensitivity:'base'});
  if(typeof a==='boolean')return(+a)-(+b);
  return a<b?-1:a>b?1:0;
}
function wildRx(s){return new RegExp('^'+s.replace(/[.+^${}()|\\]/g,'\\$&').replace(/~\*/g,'\u0001').replace(/~\?/g,'\u0002').replace(/\*/g,'.*').replace(/\?/g,'.').replace(/\u0001/g,'\\*').replace(/\u0002/g,'\\?')+'$','i')}
function makeCrit(c){
  if(typeof c==='number')return x=>typeof x==='number'?x===c:(typeof x==='string'&&ptNum(x)===c);
  if(typeof c==='boolean')return x=>x===c;
  if(c==null)return x=>x==null||x==='';
  const s=String(c);const m=/^(<=|>=|<>|=|<|>)?(.*)$/s.exec(s);const op=m[1]||'=';const rest=m[2];
  const pn=parseInput(rest);const isN=typeof pn.v==='number'&&rest.trim()!=='';
  if(isN){const v=pn.v;return x=>{if(typeof x!=='number'){if(op==='<>')return true;return false}switch(op){case'=':return x===v;case'<>':return x!==v;case'<':return x<v;case'>':return x>v;case'<=':return x<=v;case'>=':return x>=v}}}
  if(rest===''){if(op==='=')return x=>x==null||x==='';if(op==='<>')return x=>!(x==null||x==='')}
  if(op==='='||op==='<>'){const rx=wildRx(rest);return op==='='?x=>x!=null&&rx.test(typeof x==='number'?fmtGeneral(x):String(x)):x=>!(x!=null&&rx.test(String(x)))}
  return x=>{if(typeof x!=='string')return false;const k=x.localeCompare(rest,'pt-BR',{sensitivity:'base'});return op==='<'?k<0:op==='>'?k>0:op==='<='?k<=0:k>=0};
}
function arrDims(a){return[a.length,a[0]?.length||0]}
function broadcast(ctx,a,b,f){
  const A=toArr(ctx,a),Bb=toArr(ctx,b);const [ra,ca]=arrDims(A),[rb,cb]=arrDims(Bb);const R=Math.max(ra,rb),C=Math.max(ca,cb);const out=[];
  for(let i=0;i<R;i++){const row=[];for(let j=0;j<C;j++){const x=(A[ra===1?0:i]||[])[ca===1?0:j],y=(Bb[rb===1?0:i]||[])[cb===1?0:j];
    if((ra!==1&&i>=ra)||(ca!==1&&j>=ca)||(rb!==1&&i>=rb)||(cb!==1&&j>=cb)){row.push(ERR.na);continue}
    try{row.push(f(x===undefined?null:x,y===undefined?null:y))}catch(e){if(e instanceof FErr)row.push(e.v);else throw e}}out.push(row)}
  return out;
}
function mapArr(ctx,a,f){return toArr(ctx,a).map(r=>r.map(x=>{try{return f(x)}catch(e){if(e instanceof FErr)return e.v;throw e}}))}
function binop(op,x,y){
  if(isErr(x))return x;if(isErr(y))return y;
  switch(op){
    case'+':return num(x)+num(y);case'-':return num(x)-num(y);case'*':return num(x)*num(y);
    case'/':{const d=num(y);if(d===0)return ERR.div;return num(x)/d}
    case'^':{const r=Math.pow(num(x),num(y));return isFinite(r)?r:ERR.num}
    case'&':return txt(x)+txt(y);
    case'=':return cmpVals(x,y)===0;case'<>':return cmpVals(x,y)!==0;case'<':return cmpVals(x,y)<0;case'>':return cmpVals(x,y)>0;case'<=':return cmpVals(x,y)<=0;case'>=':return cmpVals(x,y)>=0;
    case'AND':return !!x&&!!y;case'OR':return !!x||!!y;
  }
  return ERR.val;
}
const txt=x=>x==null?'':typeof x==='boolean'?(x?'VERDADEIRO':'FALSO'):typeof x==='number'?fmtGeneral(x):String(x);

/* ---------- avaliação ---------- */
function evalAst(n,ctx){
  switch(n.k){
    case'n':case's':case'b':return n.v;case'e':return n.v;case'missing':return null;
    case'ref':{const sh=n.sh?ctx.sheetByName(n.sh):ctx.sheet;if(!sh)return ERR.ref;const r=n.a.r,c=n.a.c;return new Ref(sh,r,c,r,c)}
    case'rng':{const sh=n.sh?ctx.sheetByName(n.sh):ctx.sheet;if(!sh)return ERR.ref;let r1=Math.min(n.a.r,n.b.r),r2=Math.max(n.a.r,n.b.r),c1=Math.min(n.a.c,n.b.c),c2=Math.max(n.a.c,n.b.c);if(n.wc)r2=Math.max(ctx.maxRow(sh),0);if(n.wr)c2=Math.max(ctx.maxCol(sh),0);return new Ref(sh,r1,c1,r2,c2)}
    case'name':{
      if(ctx.vars&&ctx.vars.has(stripAcc(n.v).toUpperCase()))return ctx.vars.get(stripAcc(n.v).toUpperCase());
      const r=ctx.resolveName?ctx.resolveName(n.v):null;if(r!=null)return r;return ERR.name;
    }
    case'tcol':{const r=ctx.resolveTCol?ctx.resolveTCol(n.t,n.c,ctx):null;return r==null?ERR.ref:r}
    case'col':{const r=ctx.resolveCol?ctx.resolveCol(n.v,ctx):null;return r===undefined?ERR.name:r}
    case'arr':return n.rows.map(r=>r.map(x=>{const v=evalAst(x,ctx);return scalar(ctx,v)}));
    case'u':{const a=evalAst(n.a,ctx);if(a instanceof Ref&&!a.single||Array.isArray(a))return mapArr(ctx,a,x=>isErr(x)?x:-num(x));const v=scalar(ctx,a);if(isErr(v))return v;try{return -num(v)}catch(e){return e.v||ERR.val}}
    case'pct':{const a=evalAst(n.a,ctx);if(a instanceof Ref&&!a.single||Array.isArray(a))return mapArr(ctx,a,x=>isErr(x)?x:num(x)/100);const v=scalar(ctx,a);if(isErr(v))return v;try{return num(v)/100}catch(e){return e.v||ERR.val}}
    case'bin':{
      const a=evalAst(n.a,ctx),b=evalAst(n.b,ctx);
      if(n.op==='IN'&&ctx.daxIn)return ctx.daxIn(a,b);
      const multi=v=>(v instanceof Ref&&!v.single)||Array.isArray(v);
      if(multi(a)||multi(b))return broadcast(ctx,a,b,(x,y)=>binop(n.op,x,y));
      try{return binop(n.op,scalar(ctx,a),scalar(ctx,b))}catch(e){if(e instanceof FErr)return e.v;throw e}
    }
    case'let':{const vars=new Map(ctx.vars||[]);const c2=Object.assign(Object.create(ctx),{vars});for(const [nm,e] of n.defs)vars.set(stripAcc(nm).toUpperCase(),evalAst(e,c2));return evalAst(n.body,c2)}
    case'fn':{
      const lib=ctx.fnlib||FN;const F=lib[n.n]||(ctx.fnlib&&FN[n.n]&&!FN[n.n].sheetOnly?FN[n.n]:null);
      if(!F)return ERR.name;
      try{
        if(F.lazy)return F.f(n.a,ctx,n);
        const args=n.a.map(x=>evalAst(x,ctx));
        if(!F.raw)for(const v of args)if(isErr(v)&&!F.errok)return v;
        const r=F.f(args,ctx,n);return r===undefined?ERR.val:r;
      }catch(e){if(e instanceof FErr)return e.v;console.warn(e);return ERR.val}
    }
  }
  return ERR.val;
}
const lazyEval=(ctx,a)=>a?evalAst(a,ctx):null;

/* ---------- funções ---------- */
const M='Matemática',L='Lógica',P='Pesquisa',TX='Texto',D='Data e hora',ST='Estatística',FI='Financeira',IN='Informação',AR='Matriz dinâmica';
const aggr=(name,pt,cat,sig,desc,fn,opts)=>def(name,pt,cat,sig,desc,(a,ctx)=>fn(flatNums(ctx,a,opts),a,ctx));
aggr('SUM','SOMA',M,'número1; [número2]; …','Soma todos os números',x=>x.reduce((s,v)=>s+v,0));
aggr('AVERAGE','MÉDIA|MEDIA',ST,'número1; [número2]; …','Média aritmética',x=>x.length?x.reduce((s,v)=>s+v,0)/x.length:ERR.div);
aggr('MIN','MÍNIMO|MINIMO',ST,'número1; …','Menor valor',x=>x.length?Math.min(...x):0);
aggr('MAX','MÁXIMO|MAXIMO',ST,'número1; …','Maior valor',x=>x.length?Math.max(...x):0);
aggr('PRODUCT','MULT',M,'número1; …','Multiplica os números',x=>x.reduce((s,v)=>s*v,1));
aggr('MEDIAN','MED',ST,'número1; …','Mediana',x=>{if(!x.length)return ERR.num;x.sort((a,b)=>a-b);const m=x.length>>1;return x.length%2?x[m]:(x[m-1]+x[m])/2});
const variance=(x,s)=>{const n=x.length;if(n-(s?1:0)<=0)return ERR.div;const mu=x.reduce((a,b)=>a+b,0)/n;return x.reduce((a,b)=>a+(b-mu)**2,0)/(n-(s?1:0))};
aggr('STDEV.S','DESVPAD.A|DESVPAD',ST,'número1; …','Desvio padrão amostral',x=>{const v=variance(x,1);return isErr(v)?v:Math.sqrt(v)});FN.STDEV=FN['STDEV.S'];
aggr('STDEV.P','DESVPAD.P|DESVPADP',ST,'número1; …','Desvio padrão populacional',x=>{const v=variance(x,0);return isErr(v)?v:Math.sqrt(v)});FN.STDEVP=FN['STDEV.P'];
aggr('VAR.S','VAR.A|VAR',ST,'número1; …','Variância amostral',x=>variance(x,1));FN.VAR=FN['VAR.S'];
aggr('VAR.P','VAR.P|VARP',ST,'número1; …','Variância populacional',x=>variance(x,0));
aggr('MODE.SNGL','MODO.ÚNICO|MODO',ST,'número1; …','Valor mais frequente',x=>{const m=new Map();let best=null,bc=1;for(const v of x){const c=(m.get(v)||0)+1;m.set(v,c);if(c>bc){bc=c;best=v}}return best==null?ERR.na:best});FN.MODE=FN['MODE.SNGL'];
def('COUNT','CONT.NÚM|CONT.NUM',ST,'valor1; …','Conta células com números',(a,ctx)=>{let n=0;for(const v of flatAll(ctx,a))if(typeof v==='number')n++;return n},{errok:true});
def('COUNTA','CONT.VALORES',ST,'valor1; …','Conta células não vazias',(a,ctx)=>{let n=0;for(const v of flatAll(ctx,a))if(v!=null&&v!=='')n++;return n},{errok:true});
def('COUNTBLANK','CONTAR.VAZIO',ST,'intervalo','Conta células vazias',(a,ctx)=>{let n=0;for(const v of flatAll(ctx,a))if(v==null||v==='')n++;return n});
function ifsCore(ctx,pairs){ // pairs: [[range,crit]...] -> mask array of indices
  const arrs=pairs.map(([r,c])=>[toArr(ctx,r).flat(),makeCrit(scalar(ctx,c))]);const n=arrs[0][0].length;
  for(const [a] of arrs)if(a.length!==n)throw new FErr(ERR.val);
  const idx=[];for(let i=0;i<n;i++)if(arrs.every(([a,f])=>f(a[i])))idx.push(i);return idx;
}
def('SUMIF','SOMASE',M,'intervalo; critério; [intervalo_soma]','Soma condicional',(a,ctx)=>{const idx=ifsCore(ctx,[[a[0],a[1]]]);const s=toArr(ctx,a[2]??a[0]).flat();let t=0;for(const i of idx){const v=s[i];if(typeof v==='number')t+=v}return t});
def('SUMIFS','SOMASES',M,'intervalo_soma; intervalo1; critério1; …','Soma com vários critérios',(a,ctx)=>{const pairs=[];for(let k=1;k<a.length;k+=2)pairs.push([a[k],a[k+1]]);const idx=ifsCore(ctx,pairs);const s=toArr(ctx,a[0]).flat();let t=0;for(const i of idx){const v=s[i];if(typeof v==='number')t+=v}return t});
def('COUNTIF','CONT.SE',ST,'intervalo; critério','Conta células que atendem ao critério',(a,ctx)=>ifsCore(ctx,[[a[0],a[1]]]).length);
def('COUNTIFS','CONT.SES',ST,'intervalo1; critério1; …','Conta com vários critérios',(a,ctx)=>{const pairs=[];for(let k=0;k<a.length;k+=2)pairs.push([a[k],a[k+1]]);return ifsCore(ctx,pairs).length});
def('AVERAGEIF','MÉDIASE|MEDIASE',ST,'intervalo; critério; [intervalo_média]','Média condicional',(a,ctx)=>{const idx=ifsCore(ctx,[[a[0],a[1]]]);const s=toArr(ctx,a[2]??a[0]).flat();const v=idx.map(i=>s[i]).filter(x=>typeof x==='number');return v.length?v.reduce((p,q)=>p+q,0)/v.length:ERR.div});
def('AVERAGEIFS','MÉDIASES|MEDIASES',ST,'intervalo_média; intervalo1; critério1; …','Média com vários critérios',(a,ctx)=>{const pairs=[];for(let k=1;k<a.length;k+=2)pairs.push([a[k],a[k+1]]);const idx=ifsCore(ctx,pairs);const s=toArr(ctx,a[0]).flat();const v=idx.map(i=>s[i]).filter(x=>typeof x==='number');return v.length?v.reduce((p,q)=>p+q,0)/v.length:ERR.div});
def('MAXIFS','MÁXIMOSES|MAXIMOSES',ST,'intervalo_máx; intervalo1; critério1; …','Máximo com critérios',(a,ctx)=>{const pairs=[];for(let k=1;k<a.length;k+=2)pairs.push([a[k],a[k+1]]);const idx=ifsCore(ctx,pairs);const s=toArr(ctx,a[0]).flat();const v=idx.map(i=>s[i]).filter(x=>typeof x==='number');return v.length?Math.max(...v):0});
def('MINIFS','MÍNIMOSES|MINIMOSES',ST,'intervalo_mín; intervalo1; critério1; …','Mínimo com critérios',(a,ctx)=>{const pairs=[];for(let k=1;k<a.length;k+=2)pairs.push([a[k],a[k+1]]);const idx=ifsCore(ctx,pairs);const s=toArr(ctx,a[0]).flat();const v=idx.map(i=>s[i]).filter(x=>typeof x==='number');return v.length?Math.min(...v):0});
def('SUMPRODUCT','SOMARPRODUTO',M,'matriz1; [matriz2]; …','Soma dos produtos',(a,ctx)=>{const arrs=a.map(x=>toArr(ctx,x).flat());const n=arrs[0].length;if(arrs.some(x=>x.length!==n))return ERR.val;let t=0;for(let i=0;i<n;i++){let p=1;for(const x of arrs){const v=x[i];if(isErr(v))return v;p*=typeof v==='number'?v:typeof v==='boolean'?+v:0}t+=p}return t});
const n1=(name,pt,cat,sig,desc,f)=>def(name,pt,cat,sig,desc,(a,ctx)=>{const x=a[0];if((x instanceof Ref&&!x.single)||Array.isArray(x))return mapArr(ctx,x,v=>f(num(v),a.slice(1).map(y=>N(ctx,y))));return f(N(ctx,x),a.slice(1).map(y=>N(ctx,y)))});
const rnd=(v,d)=>{const m=Math.pow(10,d);return Math.round((v+Math.sign(v)*1e-12)*m)/m};
n1('ROUND','ARRED',M,'número; núm_dígitos','Arredonda',(v,[d=0])=>rnd(v,d));
n1('ROUNDUP','ARREDONDAR.PARA.CIMA',M,'número; núm_dígitos','Arredonda para cima',(v,[d=0])=>{const m=Math.pow(10,d);return Math.sign(v)*Math.ceil(Math.abs(v)*m-1e-9)/m});
n1('ROUNDDOWN','ARREDONDAR.PARA.BAIXO',M,'número; núm_dígitos','Arredonda para baixo',(v,[d=0])=>{const m=Math.pow(10,d);return Math.sign(v)*Math.floor(Math.abs(v)*m+1e-9)/m});
n1('TRUNC','TRUNCAR',M,'número; [núm_dígitos]','Trunca',(v,[d=0])=>{const m=Math.pow(10,d);return Math.trunc(v*m)/m});
n1('INT','INT',M,'número','Inteiro abaixo',v=>Math.floor(v));
n1('ABS','ABS',M,'número','Valor absoluto',v=>Math.abs(v));
n1('SQRT','RAIZ',M,'número','Raiz quadrada',v=>v<0?ERR.num:Math.sqrt(v));
n1('EXP','EXP',M,'número','e elevado a',v=>Math.exp(v));
n1('LN','LN',M,'número','Logaritmo natural',v=>v<=0?ERR.num:Math.log(v));
n1('LOG10','LOG10',M,'número','Logaritmo base 10',v=>v<=0?ERR.num:Math.log10(v));
n1('LOG','LOG',M,'número; [base]','Logaritmo',(v,[b=10])=>v<=0?ERR.num:Math.log(v)/Math.log(b));
n1('SIGN','SINAL',M,'número','Sinal',v=>Math.sign(v));
n1('MOD','RESTO|MOD',M,'número; divisor','Resto da divisão',(v,[d])=>d===0?ERR.div:v-d*Math.floor(v/d));
n1('POWER','POTÊNCIA|POTENCIA',M,'número; potência','Potência',(v,[p])=>Math.pow(v,p));
n1('CEILING','TETO',M,'número; [significância]','Arredonda para cima ao múltiplo',(v,[s=1])=>s===0?0:Math.ceil(v/s-1e-12)*s);FN['CEILING.MATH']=FN.CEILING;
n1('FLOOR','ARREDMULTB',M,'número; [significância]','Arredonda para baixo ao múltiplo',(v,[s=1])=>s===0?0:Math.floor(v/s+1e-12)*s);FN['FLOOR.MATH']=FN.FLOOR;
n1('MROUND','MARRED',M,'número; múltiplo','Arredonda ao múltiplo',(v,[s])=>s===0?0:Math.round(v/s)*s);
n1('EVEN','PAR',M,'número','Arredonda para o par',v=>{const c=Math.ceil(Math.abs(v));return Math.sign(v)*(c%2?c+1:c)});
n1('ODD','ÍMPAR|IMPAR',M,'número','Arredonda para o ímpar',v=>{const c=Math.ceil(Math.abs(v));return Math.sign(v)*(c%2?c:c+1)});
n1('FACT','FATORIAL',M,'número','Fatorial',v=>{let r=1;for(let i=2;i<=v;i++)r*=i;return r});
n1('RADIANS','RADIANOS',M,'ângulo','Graus para radianos',v=>v*Math.PI/180);n1('DEGREES','GRAUS',M,'ângulo','Radianos para graus',v=>v*180/Math.PI);
for(const [en,pt] of [['SIN','SEN'],['COS','COS'],['TAN','TAN'],['ASIN','ASEN'],['ACOS','ACOS'],['ATAN','ATAN']])n1(en,pt,M,'número','Trigonometria',v=>Math[en.toLowerCase()](v));
def('ATAN2','ATAN2',M,'x; y','Arco tangente de x,y',(a,ctx)=>Math.atan2(N(ctx,a[1]),N(ctx,a[0])));
def('PI','PI',M,'','π',()=>Math.PI);
def('RAND','ALEATÓRIO|ALEATORIO',M,'','Número aleatório entre 0 e 1',()=>Math.random(),{vol:true});
def('RANDBETWEEN','ALEATÓRIOENTRE|ALEATORIOENTRE',M,'inferior; superior','Inteiro aleatório',(a,ctx)=>{const lo=Math.ceil(N(ctx,a[0])),hi=Math.floor(N(ctx,a[1]));return lo+Math.floor(Math.random()*(hi-lo+1))},{vol:true});
def('GCD','MDC',M,'número1; …','Máximo divisor comum',(a,ctx)=>flatNums(ctx,a).map(Math.floor).reduce((x,y)=>{while(y){[x,y]=[y,x%y]}return x}));
def('LCM','MMC',M,'número1; …','Mínimo múltiplo comum',(a,ctx)=>flatNums(ctx,a).map(Math.floor).reduce((x,y)=>{let g=x,z=y;while(z){[g,z]=[z,g%z]}return x*y/g}));
def('SUMSQ','SOMAQUAD',M,'número1; …','Soma dos quadrados',(a,ctx)=>flatNums(ctx,a).reduce((s,v)=>s+v*v,0));
def('SUBTOTAL','SUBTOTAL',M,'núm_função; ref1; …','Subtotal (ignora linhas ocultas por filtro)',(a,ctx)=>{const f=N(ctx,a[0])%100;const vals=[];for(const r of a.slice(1)){if(r instanceof Ref){for(let i=r.r1;i<=Math.min(r.r2,ctx.maxRow(r.sh));i++){if(ctx.rowHidden&&ctx.rowHidden(r.sh,i))continue;for(let j=r.c1;j<=r.c2;j++)vals.push(ctx.get(r.sh,i,j))}}else vals.push(...flatAll(ctx,[r]))}const map={1:'AVERAGE',2:'COUNT',3:'COUNTA',4:'MAX',5:'MIN',6:'PRODUCT',7:'STDEV.S',8:'STDEV.P',9:'SUM',10:'VAR.S',11:'VAR.P'};const F=FN[map[f]];if(!F)return ERR.val;return F.f([[vals.filter(v=>!isErr(v))]],ctx)});
def('AGGREGATE','AGREGAR',M,'núm_função; opções; ref1; …','Agregação ignorando erros',(a,ctx)=>{const f=N(ctx,a[0]);const vals=flatAll(ctx,a.slice(2)).filter(v=>typeof v==='number');const map={1:'AVERAGE',2:'COUNT',3:'COUNTA',4:'MAX',5:'MIN',6:'PRODUCT',7:'STDEV.S',8:'STDEV.P',9:'SUM',10:'VAR.S',11:'VAR.P',12:'MEDIAN',13:'MODE.SNGL'};const F=FN[map[f]];return F?F.f([[vals]],ctx):ERR.val});

/* lógica */
def('IF','SE',L,'teste_lógico; [valor_se_verdadeiro]; [valor_se_falso]','Retorna um valor conforme a condição',(a,ctx)=>{const t=evalAst(a[0],ctx);if((t instanceof Ref&&!t.single)||Array.isArray(t)){const yes=a[1]?evalAst(a[1],ctx):true,no=a[2]?evalAst(a[2],ctx):false;const T=toArr(ctx,t);const Y=toArr(ctx,yes),Nn=toArr(ctx,no);return T.map((row,i)=>row.map((x,j)=>{if(isErr(x))return x;const pick=x?Y:Nn;return(pick[pick.length===1?0:i]||[])[pick[0]?.length===1?0:j]??null}))}const v=scalar(ctx,t);if(isErr(v))return v;let b;try{b=typeof v==='string'?B(ctx,v):!!v}catch(e){return ERR.val}if(b)return a[1]&&a[1].k!=='missing'?evalAst(a[1],ctx):(a[1]?0:true);return a[2]?(a[2].k==='missing'?0:evalAst(a[2],ctx)):false},{lazy:true});
def('IFS','SES',L,'teste1; valor1; [teste2; valor2]; …','Primeira condição verdadeira',(a,ctx)=>{for(let k=0;k<a.length;k+=2){const v=scalar(ctx,evalAst(a[k],ctx));if(isErr(v))return v;if(v)return evalAst(a[k+1],ctx)}return ERR.na},{lazy:true});
def('IFERROR','SEERRO',L,'valor; valor_se_erro','Trata erros',(a,ctx)=>{const v=evalAst(a[0],ctx);if(Array.isArray(v)||(v instanceof Ref&&!v.single)){const alt=scalar(ctx,evalAst(a[1],ctx));return toArr(ctx,v).map(r=>r.map(x=>isErr(x)?alt:x))}const s=scalar(ctx,v);return isErr(s)?evalAst(a[1],ctx):v},{lazy:true});
def('IFNA','SENÃODISP|SENAODISP',L,'valor; valor_se_nd','Trata #N/D',(a,ctx)=>{const v=evalAst(a[0],ctx);const s=scalar(ctx,v);return s===ERR.na||(s&&s.err==='#N/D')?evalAst(a[1],ctx):v},{lazy:true});
def('AND','E',L,'lógico1; [lógico2]; …','Todas verdadeiras',(a,ctx)=>{for(const v of flatAll(ctx,a)){if(isErr(v))return v;if(v===false||v===0)return false}return true});
def('OR','OU',L,'lógico1; [lógico2]; …','Alguma verdadeira',(a,ctx)=>{for(const v of flatAll(ctx,a)){if(isErr(v))return v;if(v===true||(typeof v==='number'&&v!==0))return true}return false});
def('XOR','OUEXCL',L,'lógico1; …','Ou exclusivo',(a,ctx)=>flatAll(ctx,a).filter(v=>v===true||(typeof v==='number'&&v)).length%2===1);
def('NOT','NÃO|NAO',L,'lógico','Inverte',(a,ctx)=>!B(ctx,a[0]));
def('TRUE','VERDADEIRO',L,'','Verdadeiro',()=>true);def('FALSE','FALSO',L,'','Falso',()=>false);
def('SWITCH','PARÂMETRO|PARAMETRO',L,'expressão; valor1; resultado1; …; [padrão]','Compara com lista de valores',(a,ctx)=>{const v=scalar(ctx,evalAst(a[0],ctx));for(let k=1;k+1<a.length;k+=2){if(cmpVals(v,scalar(ctx,evalAst(a[k],ctx)))===0)return evalAst(a[k+1],ctx)}return a.length%2===0?evalAst(a[a.length-1],ctx):ERR.na},{lazy:true});
def('CHOOSE','ESCOLHER',L,'núm_índice; valor1; …','Escolhe da lista',(a,ctx)=>{const i=Math.floor(N(ctx,evalAst(a[0],ctx)));if(i<1||i>=a.length)return ERR.val;return evalAst(a[i],ctx)},{lazy:true});
def('LET','LET',L,'nome1; valor1; …; cálculo','Atribui nomes a resultados',(a,ctx)=>{const vars=new Map(ctx.vars||[]);const c2=Object.assign(Object.create(ctx),{vars});for(let k=0;k+1<a.length;k+=2){if(a[k].k!=='name')return ERR.val;vars.set(stripAcc(a[k].v).toUpperCase(),evalAst(a[k+1],c2))}return evalAst(a[a.length-1],c2)},{lazy:true});

/* informação */
const i1=(en,pt,desc,f)=>def(en,pt,IN,'valor',desc,(a,ctx)=>f(scalar(ctx,a[0])),{raw:true});
i1('ISBLANK','ÉCÉL.VAZIA|ECEL.VAZIA','É vazio',v=>v==null||v==='');i1('ISNUMBER','ÉNÚM|ENUM','É número',v=>typeof v==='number');i1('ISTEXT','ÉTEXTO|ETEXTO','É texto',v=>typeof v==='string');
i1('ISERROR','ÉERROS|EERROS','É erro',v=>isErr(v));i1('ISERR','ÉERRO|EERRO','É erro (exceto #N/D)',v=>isErr(v)&&v.err!=='#N/D');i1('ISNA','É.NÃO.DISP|E.NAO.DISP','É #N/D',v=>isErr(v)&&v.err==='#N/D');i1('ISLOGICAL','ÉLÓGICO|ELOGICO','É lógico',v=>typeof v==='boolean');
i1('ISNONTEXT','É.NÃO.TEXTO|E.NAO.TEXTO','Não é texto',v=>typeof v!=='string');i1('ISEVEN','ÉPAR|EPAR','É par',v=>Math.floor(num(v))%2===0);i1('ISODD','ÉIMPAR|EIMPAR','É ímpar',v=>Math.abs(Math.floor(num(v))%2)===1);
def('NA','NÃO.DISP|NAO.DISP',IN,'','Retorna #N/D',()=>ERR.na);
def('N','N',IN,'valor','Converte em número',(a,ctx)=>{const v=scalar(ctx,a[0]);return typeof v==='number'?v:v===true?1:0});
def('ISFORMULA','ÉFÓRMULA|EFORMULA',IN,'ref','É fórmula',(a,ctx)=>a[0] instanceof Ref&&ctx.isFormula?ctx.isFormula(a[0].sh,a[0].r1,a[0].c1):false,{raw:true});

/* pesquisa */
function lookupExact(arr,v){for(let i=0;i<arr.length;i++)if(cmpVals(arr[i],v)===0&&!(arr[i]==null&&v!=null))return i;
  if(typeof v==='string'&&/[*?]/.test(v)){const rx=wildRx(v);for(let i=0;i<arr.length;i++)if(typeof arr[i]==='string'&&rx.test(arr[i]))return i}return -1}
function lookupApprox(arr,v){let best=-1;for(let i=0;i<arr.length;i++){if(arr[i]==null)continue;const k=cmpVals(arr[i],v);if(k<=0)best=i;else break}return best}
def('VLOOKUP','PROCV',P,'valor; matriz; núm_coluna; [procurar_intervalo]','Procura na 1ª coluna e retorna da coluna indicada',(a,ctx)=>{const v=scalar(ctx,a[0]);const T=toArr(ctx,a[1]);const ci=Math.floor(N(ctx,a[2]));const approx=a[3]==null?true:B(ctx,a[3]);if(ci<1||ci>(T[0]?.length||0))return ERR.ref;const col=T.map(r=>r[0]);const i=approx?lookupApprox(col,v):lookupExact(col,v);return i<0?ERR.na:T[i][ci-1]});
def('HLOOKUP','PROCH',P,'valor; matriz; núm_linha; [procurar_intervalo]','Procura na 1ª linha',(a,ctx)=>{const v=scalar(ctx,a[0]);const T=toArr(ctx,a[1]);const ri=Math.floor(N(ctx,a[2]));const approx=a[3]==null?true:B(ctx,a[3]);if(ri<1||ri>T.length)return ERR.ref;const i=approx?lookupApprox(T[0],v):lookupExact(T[0],v);return i<0?ERR.na:T[ri-1][i]});
def('LOOKUP','PROC',P,'valor; vetor_proc; [vetor_result]','Procura aproximada em vetor',(a,ctx)=>{const v=scalar(ctx,a[0]);const L1=toArr(ctx,a[1]).flat();const R=a[2]?toArr(ctx,a[2]).flat():L1;const i=lookupApprox(L1,v);return i<0?ERR.na:R[i]});
def('MATCH','CORRESP',P,'valor; matriz; [tipo]','Posição do valor',(a,ctx)=>{const v=scalar(ctx,a[0]);const arr=toArr(ctx,a[1]).flat();const t=a[2]==null?1:N(ctx,a[2]);let i;if(t===0)i=lookupExact(arr,v);else if(t>0)i=lookupApprox(arr,v);else{i=-1;for(let k=0;k<arr.length;k++){if(cmpVals(arr[k],v)>=0)i=k;else break}}return i<0?ERR.na:i+1});
function xmatch(arr,v,mm,sm){
  const idxs=[...arr.keys()];if(sm===-1)idxs.reverse();
  if(mm===2){const rx=wildRx(String(v));for(const i of idxs)if(arr[i]!=null&&rx.test(txt(arr[i])))return i;return -1}
  for(const i of idxs)if(arr[i]!=null&&cmpVals(arr[i],v)===0)return i;
  if(mm===-1||mm===1){let best=-1;for(const i of idxs){if(arr[i]==null)continue;const k=cmpVals(arr[i],v);if(mm===-1&&k<0&&(best<0||cmpVals(arr[i],arr[best])>0))best=i;if(mm===1&&k>0&&(best<0||cmpVals(arr[i],arr[best])<0))best=i}return best}
  return -1;
}
def('XLOOKUP','PROCX',P,'valor; matriz_pesquisa; matriz_retorno; [se_não_encontrado]; [modo_corresp]; [modo_pesquisa]','Procura e retorna (moderna)',(a,ctx)=>{const v=scalar(ctx,a[0]);const LA=toArr(ctx,a[1]);const horiz=LA.length===1&&LA[0].length>1;const look=horiz?LA[0]:LA.map(r=>r[0]);const R=toArr(ctx,a[2]);const mm=a[4]==null?0:N(ctx,a[4]),sm=a[5]==null?1:N(ctx,a[5]);const i=xmatch(look,v,mm,sm);if(i<0)return a[3]!=null?scalar(ctx,a[3]):ERR.na;if(horiz){const col=R.map(r=>[r[i]]);return col.length===1?col[0][0]:col}const row=R[i];return row.length===1?row[0]:[row]});
def('XMATCH','CORRESPX',P,'valor; matriz; [modo_corresp]; [modo_pesquisa]','Posição (moderna)',(a,ctx)=>{const i=xmatch(toArr(ctx,a[1]).flat(),scalar(ctx,a[0]),a[2]==null?0:N(ctx,a[2]),a[3]==null?1:N(ctx,a[3]));return i<0?ERR.na:i+1});
def('INDEX','ÍNDICE|INDICE',P,'matriz; núm_linha; [núm_coluna]','Valor na posição',(a,ctx)=>{const ref=a[0];let r=a[1]==null?0:Math.floor(N(ctx,a[1])),c=a[2]==null?0:Math.floor(N(ctx,a[2]));
  if(ref instanceof Ref){if(ref.rows===1&&a[2]==null){c=r;r=1}if(r<0||c<0||r>ref.rows||c>ref.cols)return ERR.ref;if(r===0&&c===0)return ref;if(r===0)return new Ref(ref.sh,ref.r1,ref.c1+c-1,ref.r2,ref.c1+c-1);if(c===0)return new Ref(ref.sh,ref.r1+r-1,ref.c1,ref.r1+r-1,ref.c2);return new Ref(ref.sh,ref.r1+r-1,ref.c1+(c||1)-1,ref.r1+r-1,ref.c1+(c||1)-1)}
  const T=toArr(ctx,ref);if(T.length===1&&a[2]==null){c=r;r=1}if(r>T.length||c>(T[0]?.length||0))return ERR.ref;if(r===0)return T.map(x=>[x[c-1]]);if(c===0)return[T[r-1]];return T[r-1][(c||1)-1]});
def('ROW','LIN',P,'[ref]','Número da linha',(a,ctx)=>{if(!a.length||a[0]==null)return ctx.r+1;const r=a[0];if(!(r instanceof Ref))return ERR.val;if(r.single)return r.r1+1;const out=[];for(let i=r.r1;i<=r.r2;i++)out.push([i+1]);return out},{raw:true});
def('COLUMN','COL',P,'[ref]','Número da coluna',(a,ctx)=>{if(!a.length||a[0]==null)return ctx.c+1;const r=a[0];if(!(r instanceof Ref))return ERR.val;if(r.single)return r.c1+1;const out=[[]];for(let i=r.c1;i<=r.c2;i++)out[0].push(i+1);return out},{raw:true});
def('ROWS','LINS',P,'matriz','Número de linhas',(a,ctx)=>a[0] instanceof Ref?a[0].rows:toArr(ctx,a[0]).length,{raw:true});
def('COLUMNS','COLS',P,'matriz','Número de colunas',(a,ctx)=>a[0] instanceof Ref?a[0].cols:(toArr(ctx,a[0])[0]?.length||0),{raw:true});
def('INDIRECT','INDIRETO',P,'texto_ref','Referência a partir de texto',(a,ctx)=>{const s=S(ctx,a[0]);try{const ast=parseFormula(s);if(ast.k==='ref'||ast.k==='rng')return evalAst(ast,ctx);if(ast.k==='name'){const r=ctx.resolveName(ast.v);return r==null?ERR.ref:r}}catch(e){}return ERR.ref},{vol:true});
def('OFFSET','DESLOC',P,'ref; linhas; colunas; [altura]; [largura]','Referência deslocada',(a,ctx)=>{const r=a[0];if(!(r instanceof Ref))return ERR.val;const dr=N(ctx,a[1]),dc=N(ctx,a[2]);const hh=a[3]==null?r.rows:N(ctx,a[3]),ww=a[4]==null?r.cols:N(ctx,a[4]);const r1=r.r1+dr,c1=r.c1+dc;if(r1<0||c1<0||hh<1||ww<1)return ERR.ref;return new Ref(r.sh,r1,c1,r1+hh-1,c1+ww-1)},{vol:true});
def('ADDRESS','ENDEREÇO|ENDERECO',P,'linha; coluna; [abs]','Endereço em texto',(a,ctx)=>{const r=N(ctx,a[0]),c=N(ctx,a[1]),t=a[2]==null?1:N(ctx,a[2]);const ar=t===1||t===2,ac=t===1||t===3;return(ac?'$':'')+colName(c-1)+(ar?'$':'')+r});
def('HYPERLINK','HIPERLINK',P,'link; [nome]','Cria um link',(a,ctx)=>a[1]!=null?S(ctx,a[1]):S(ctx,a[0]));

/* matrizes dinâmicas */
def('TRANSPOSE','TRANSPOR',AR,'matriz','Transpõe',(a,ctx)=>{const T=toArr(ctx,a[0]);return T[0].map((_,j)=>T.map(r=>r[j]))});
def('SEQUENCE','SEQUÊNCIA|SEQUENCIA',AR,'linhas; [colunas]; [início]; [passo]','Sequência de números',(a,ctx)=>{const R=Math.floor(N(ctx,a[0])),C=a[1]==null?1:Math.floor(N(ctx,a[1])),st=a[2]==null?1:N(ctx,a[2]),sp=a[3]==null?1:N(ctx,a[3]);if(R<1||C<1||R*C>1e6)return ERR.calc;const o=[];let v=st;for(let i=0;i<R;i++){const row=[];for(let j=0;j<C;j++){row.push(v);v+=sp}o.push(row)}return o});
def('FILTER','FILTRO',AR,'matriz; incluir; [se_vazio]','Filtra linhas pela condição',(a,ctx)=>{const T=toArr(ctx,a[0]);const I=toArr(ctx,a[1]);const byRow=I.length===T.length&&I[0].length===1;const keep=byRow?I.map(r=>r[0]):I[0];for(const k of keep)if(isErr(k))return k;let out;if(byRow||T.length===keep.length&&keep.length>1)out=T.filter((_,i)=>keep[i]&&keep[i]!==0);else out=T.map(r=>r.filter((_,j)=>keep[j]&&keep[j]!==0));if(!out.length||!out[0].length)return a[2]!=null?scalar(ctx,a[2]):ERR.calc;return out});
def('SORT','CLASSIFICAR',AR,'matriz; [índice]; [ordem]; [por_coluna]','Classifica',(a,ctx)=>{const T=toArr(ctx,a[0]).map(r=>r.slice());const k=(a[1]==null?1:N(ctx,a[1]))-1,o=a[2]==null?1:N(ctx,a[2]);if(a[3]&&B(ctx,a[3])){const tr=T[0].map((_,j)=>T.map(r=>r[j]));tr.sort((x,y)=>cmpVals(x[k],y[k])*o);return tr[0].map((_,j)=>tr.map(r=>r[j]))}return T.sort((x,y)=>cmpVals(x[k],y[k])*o)});
def('SORTBY','CLASSIFICARPOR',AR,'matriz; por_matriz1; [ordem1]; …','Classifica por outra matriz',(a,ctx)=>{const T=toArr(ctx,a[0]);const keys=[];for(let i=1;i<a.length;i+=2)keys.push([toArr(ctx,a[i]).flat(),a[i+1]==null?1:N(ctx,a[i+1])]);const idx=T.map((_,i)=>i);idx.sort((x,y)=>{for(const [k,o] of keys){const c=cmpVals(k[x],k[y]);if(c)return c*o}return x-y});return idx.map(i=>T[i])});
def('UNIQUE','ÚNICO|UNICO',AR,'matriz; [por_coluna]; [exatamente_uma_vez]','Valores únicos',(a,ctx)=>{const T=toArr(ctx,a[0]);const once=a[2]&&B(ctx,a[2]);const m=new Map();for(const r of T){const k=r.map(x=>typeof x==='string'?x.toLowerCase():x).join('\u0001');if(!m.has(k))m.set(k,{r,n:0});m.get(k).n++}const out=[...m.values()].filter(x=>!once||x.n===1).map(x=>x.r);return out.length?out:ERR.calc});
def('TAKE','PEGAR',AR,'matriz; linhas; [colunas]','Primeiras/últimas linhas',(a,ctx)=>{let T=toArr(ctx,a[0]);const r=a[1]==null?T.length:N(ctx,a[1]),c=a[2]==null?null:N(ctx,a[2]);T=r>=0?T.slice(0,r):T.slice(r);if(c!=null)T=T.map(x=>c>=0?x.slice(0,c):x.slice(c));return T.length?T:ERR.calc});
def('DROP','DESCARTAR',AR,'matriz; linhas; [colunas]','Descarta linhas',(a,ctx)=>{let T=toArr(ctx,a[0]);const r=a[1]==null?0:N(ctx,a[1]),c=a[2]==null?0:N(ctx,a[2]);T=r>=0?T.slice(r):T.slice(0,r);if(c)T=T.map(x=>c>=0?x.slice(c):x.slice(0,c));return T.length?T:ERR.calc});
def('CHOOSECOLS','ESCOLHERCOLS',AR,'matriz; núm_col1; …','Seleciona colunas',(a,ctx)=>{const T=toArr(ctx,a[0]);const cs=a.slice(1).map(x=>N(ctx,x));return T.map(r=>cs.map(c=>r[c>0?c-1:r.length+c]))});
def('CHOOSEROWS','ESCOLHERLINS',AR,'matriz; núm_lin1; …','Seleciona linhas',(a,ctx)=>{const T=toArr(ctx,a[0]);return a.slice(1).map(x=>{const r=N(ctx,x);return T[r>0?r-1:T.length+r]})});
def('VSTACK','EMPILHARV',AR,'matriz1; …','Empilha verticalmente',(a,ctx)=>{const out=[];let w=0;for(const x of a){const T=toArr(ctx,x);w=Math.max(w,T[0].length);out.push(...T)}return out.map(r=>r.length<w?[...r,...Array(w-r.length).fill(ERR.na)]:r)});
def('HSTACK','EMPILHARH',AR,'matriz1; …','Empilha horizontalmente',(a,ctx)=>{const Ts=a.map(x=>toArr(ctx,x));const R=Math.max(...Ts.map(t=>t.length));const out=[];for(let i=0;i<R;i++)out.push(Ts.flatMap(t=>t[i]||Array(t[0].length).fill(ERR.na)));return out});
def('TOCOL','PARACOL',AR,'matriz','Converte em coluna',(a,ctx)=>toArr(ctx,a[0]).flat().filter(x=>x!=null).map(x=>[x]));
def('TOROW','PARALIN',AR,'matriz','Converte em linha',(a,ctx)=>[toArr(ctx,a[0]).flat().filter(x=>x!=null)]);
def('TEXTSPLIT','DIVIDIRTEXTO',AR,'texto; delim_col; [delim_lin]','Divide texto',(a,ctx)=>{const s=S(ctx,a[0]),dc=a[1]==null?null:S(ctx,a[1]),dr=a[2]==null?null:S(ctx,a[2]);const rows=(dr?s.split(dr):[s]).map(r=>dc?r.split(dc):[r]);const w=Math.max(...rows.map(r=>r.length));return rows.map(r=>r.length<w?[...r,...Array(w-r.length).fill(ERR.na)]:r)});

/* texto */
const t1=(en,pt,sig,desc,f)=>def(en,pt,TX,sig,desc,(a,ctx)=>{const x=a[0];if((x instanceof Ref&&!x.single)||Array.isArray(x))return mapArr(ctx,x,v=>f(txt(v),a.slice(1),ctx));return f(S(ctx,x),a.slice(1),ctx)});
def('CONCAT','CONCAT',TX,'texto1; …','Concatena',(a,ctx)=>flatAll(ctx,a).map(txt).join(''));
def('CONCATENATE','CONCATENAR',TX,'texto1; …','Concatena',(a,ctx)=>a.map(x=>S(ctx,x)).join(''));
def('TEXTJOIN','UNIRTEXTO',TX,'delimitador; ignorar_vazio; texto1; …','Une com delimitador',(a,ctx)=>{const d=S(ctx,a[0]),ig=B(ctx,a[1]);return flatAll(ctx,a.slice(2)).filter(x=>!ig||(x!=null&&x!=='')).map(txt).join(d)});
t1('LEFT','ESQUERDA','texto; [núm_caract]','Caracteres à esquerda',(s,[n],ctx)=>s.slice(0,n==null?1:N(ctx,n)));
t1('RIGHT','DIREITA','texto; [núm_caract]','Caracteres à direita',(s,[n],ctx)=>{const k=n==null?1:N(ctx,n);return k?s.slice(-k):''});
t1('MID','EXT.TEXTO','texto; início; núm_caract','Extrai do meio',(s,[i,n],ctx)=>s.substr(N(ctx,i)-1,N(ctx,n)));
t1('LEN','NÚM.CARACT|NUM.CARACT','texto','Número de caracteres',s=>s.length);
t1('UPPER','MAIÚSCULA|MAIUSCULA','texto','Maiúsculas',s=>s.toUpperCase());t1('LOWER','MINÚSCULA|MINUSCULA','texto','Minúsculas',s=>s.toLowerCase());
t1('PROPER','PRI.MAIÚSCULA|PRI.MAIUSCULA','texto','Primeira letra maiúscula',s=>s.toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()));
t1('TRIM','ARRUMAR','texto','Remove espaços extras',s=>s.replace(/\s+/g,' ').trim());
t1('CLEAN','TIRAR','texto','Remove caracteres não imprimíveis',s=>s.replace(/[\x00-\x1f]/g,''));
def('SUBSTITUTE','SUBSTITUIR',TX,'texto; texto_antigo; novo_texto; [núm_ocorrência]','Substitui texto',(a,ctx)=>{const s=S(ctx,a[0]),o=S(ctx,a[1]),n=S(ctx,a[2]);if(!o)return s;if(a[3]==null)return s.split(o).join(n);let k=N(ctx,a[3]),i=-1;while(k--){i=s.indexOf(o,i+1);if(i<0)return s}return s.slice(0,i)+n+s.slice(i+o.length)});
def('REPLACE','MUDAR',TX,'texto_antigo; início; núm_caract; novo_texto','Substitui por posição',(a,ctx)=>{const s=S(ctx,a[0]),i=N(ctx,a[1])-1,n=N(ctx,a[2]);return s.slice(0,i)+S(ctx,a[3])+s.slice(i+n)});
def('FIND','PROCURAR',TX,'texto_procurado; no_texto; [início]','Posição (diferencia maiúsc.)',(a,ctx)=>{const i=S(ctx,a[1]).indexOf(S(ctx,a[0]),(a[2]==null?1:N(ctx,a[2]))-1);return i<0?ERR.val:i+1});
def('SEARCH','LOCALIZAR',TX,'texto_procurado; no_texto; [início]','Posição (sem diferenciar)',(a,ctx)=>{const f=S(ctx,a[0]);const s=S(ctx,a[1]);const st=(a[2]==null?1:N(ctx,a[2]))-1;const rx=/[*?]/.test(f)?new RegExp(wildRx(f).source.slice(1,-1),'i'):null;let i;if(rx){const m=rx.exec(s.slice(st));i=m?m.index+st:-1}else i=s.toLowerCase().indexOf(f.toLowerCase(),st);return i<0?ERR.val:i+1});
function ptFmtCode(f){if(/[0#]/.test(f)){if(/#\.##0|0\.000|[0#],[0#]/.test(f)&&!/E\+/i.test(f))f=f.replace(/[.,]/g,c=>c==='.'?',':'.');return f}return f.replace(/a/gi,'y')}
def('TEXT','TEXTO',TX,'valor; formato','Formata número como texto',(a,ctx)=>{const v=scalar(ctx,a[0]);const f=ptFmtCode(S(ctx,a[1]));const n=typeof v==='number'?v:typeof v==='string'?parseInput(v).v:null;return typeof n==='number'?fmtValue(n,f):txt(v)});
def('VALUE','VALOR',TX,'texto','Converte texto em número',(a,ctx)=>{const v=scalar(ctx,a[0]);if(typeof v==='number')return v;const p=parseInput(String(v??''));return typeof p.v==='number'?p.v:ERR.val});
def('NUMBERVALUE','VALORNUMÉRICO|VALORNUMERICO',TX,'texto; [sep_decimal]; [sep_grupo]','Converte texto em número',(a,ctx)=>{let s=S(ctx,a[0]);const d=a[1]==null?',':S(ctx,a[1]),g=a[2]==null?'.':S(ctx,a[2]);s=s.split(g).join('').replace(d,'.');const n=+s;return isNaN(n)?ERR.val:n});
t1('REPT','REPT','texto; núm_vezes','Repete texto',(s,[n],ctx)=>s.repeat(Math.max(0,N(ctx,n))));
def('EXACT','EXATO',TX,'texto1; texto2','Compara exatamente',(a,ctx)=>S(ctx,a[0])===S(ctx,a[1]));
def('CHAR','CARACT',TX,'número','Caractere pelo código',(a,ctx)=>String.fromCharCode(N(ctx,a[0])));
def('CODE','CÓDIGO|CODIGO',TX,'texto','Código do caractere',(a,ctx)=>S(ctx,a[0]).charCodeAt(0)||ERR.val);
def('FIXED','DEF.NÚM.DEC|DEF.NUM.DEC',TX,'número; [decimais]','Número fixo como texto',(a,ctx)=>fmtNumPlain(N(ctx,a[0]),a[1]==null?2:N(ctx,a[1]),a[1]==null?2:N(ctx,a[1]),!(a[2]&&B(ctx,a[2]))));
def('T','T',TX,'valor','Texto ou vazio',(a,ctx)=>{const v=scalar(ctx,a[0]);return typeof v==='string'?v:''});
def('TEXTBEFORE','TEXTOANTES',TX,'texto; delimitador','Texto antes do delimitador',(a,ctx)=>{const s=S(ctx,a[0]),d=S(ctx,a[1]);const i=s.indexOf(d);return i<0?ERR.na:s.slice(0,i)});
def('TEXTAFTER','TEXTODEPOIS',TX,'texto; delimitador','Texto depois do delimitador',(a,ctx)=>{const s=S(ctx,a[0]),d=S(ctx,a[1]);const i=s.indexOf(d);return i<0?ERR.na:s.slice(i+d.length)});

/* data e hora */
const dser=(ctx,v)=>{const x=scalar(ctx,v);if(typeof x==='string'){const p=parseInput(x);if(typeof p.v==='number')return p.v;throw new FErr(ERR.val)}return num(x)};
def('TODAY','HOJE',D,'','Data de hoje',()=>todaySerial(),{vol:true});
def('NOW','AGORA',D,'','Data e hora atuais',()=>nowSerial(),{vol:true});
def('DATE','DATA',D,'ano; mês; dia','Monta uma data',(a,ctx)=>{const y=N(ctx,a[0]),m=N(ctx,a[1]),d=N(ctx,a[2]);return(Date.UTC(y,m-1,d)-EPOCH)/864e5});
def('TIME','TEMPO',D,'hora; minuto; segundo','Monta uma hora',(a,ctx)=>((N(ctx,a[0])*3600+N(ctx,a[1])*60+N(ctx,a[2]))/86400)%1);
const dpart=(en,pt,desc,f)=>def(en,pt,D,'data',desc,(a,ctx)=>{const x=a[0];if((x instanceof Ref&&!x.single)||Array.isArray(x))return mapArr(ctx,x,v=>f(serialParts(num(v))));return f(serialParts(dser(ctx,x)))});
dpart('YEAR','ANO','Ano da data',p=>p.y);dpart('MONTH','MÊS|MES','Mês da data',p=>p.m);dpart('DAY','DIA','Dia da data',p=>p.d);dpart('HOUR','HORA','Hora',p=>p.hh);dpart('MINUTE','MINUTO','Minuto',p=>p.mi);dpart('SECOND','SEGUNDO','Segundo',p=>p.ss);
def('WEEKDAY','DIA.DA.SEMANA',D,'data; [tipo]','Dia da semana',(a,ctx)=>{const w=serialParts(dser(ctx,a[0])).wd;const t=a[1]==null?1:N(ctx,a[1]);return t===2?(w===0?7:w):t===3?(w+6)%7:w+1});
def('WEEKNUM','NÚMSEMANA|NUMSEMANA',D,'data; [tipo]','Número da semana',(a,ctx)=>{const s=Math.floor(dser(ctx,a[0]));const p=serialParts(s);const jan1=dateToSerial(p.y,1,1);const t=a[1]==null?1:N(ctx,a[1]);const wd=serialParts(jan1).wd;const off=t===2?(wd+6)%7:wd;return Math.floor((s-jan1+off)/7)+1});
def('ISOWEEKNUM','NÚMSEMANAISO|NUMSEMANAISO',D,'data','Semana ISO',(a,ctx)=>{const d=serialToDate(Math.floor(dser(ctx,a[0])));const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const dn=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-dn+3);const fy=new Date(Date.UTC(t.getUTCFullYear(),0,4));return 1+Math.round(((t-fy)/864e5-3+((fy.getUTCDay()+6)%7))/7)});
def('EOMONTH','FIMMÊS|FIMMES',D,'data_inicial; meses','Último dia do mês',(a,ctx)=>{const p=serialParts(dser(ctx,a[0]));const m=N(ctx,a[1]);return(Date.UTC(p.y,p.m+m,0)-EPOCH)/864e5});
def('EDATE','DATAM',D,'data_inicial; meses','Soma meses',(a,ctx)=>{const p=serialParts(dser(ctx,a[0]));const m=N(ctx,a[1]);const last=new Date(Date.UTC(p.y,p.m+m,0)).getUTCDate();return(Date.UTC(p.y,p.m-1+m,Math.min(p.d,last))-EPOCH)/864e5});
def('DAYS','DIAS',D,'data_final; data_inicial','Dias entre datas',(a,ctx)=>Math.floor(dser(ctx,a[0]))-Math.floor(dser(ctx,a[1])));
def('DATEDIF','DATADIF',D,'data_inicial; data_final; unidade','Diferença entre datas',(a,ctx)=>{const s=dser(ctx,a[0]),e=dser(ctx,a[1]);const u=S(ctx,a[2]).toUpperCase();if(e<s)return ERR.num;const A=serialParts(s),Bp=serialParts(e);let months=(Bp.y-A.y)*12+Bp.m-A.m;if(Bp.d<A.d)months--;switch(u){case'D':return Math.floor(e)-Math.floor(s);case'M':return months;case'Y':return Math.floor(months/12);case'YM':return months%12;case'MD':{let d=Bp.d-A.d;if(d<0){d+=new Date(Date.UTC(Bp.y,Bp.m-1,0)).getUTCDate()}return d}case'YD':{let ys=dateToSerial(Bp.y,A.m,A.d);if(ys>e)ys=dateToSerial(Bp.y-1,A.m,A.d);return Math.floor(e-ys)}}return ERR.num});
function isWork(s,hol){const w=serialParts(s).wd;return w!==0&&w!==6&&!hol.has(s)}
def('NETWORKDAYS','DIATRABALHOTOTAL',D,'data_inicial; data_final; [feriados]','Dias úteis entre datas',(a,ctx)=>{let s=Math.floor(dser(ctx,a[0])),e=Math.floor(dser(ctx,a[1]));const hol=new Set(a[2]?flatNums(ctx,[a[2]]).map(Math.floor):[]);let sg=1;if(e<s){[s,e]=[e,s];sg=-1}let n=0;for(let d=s;d<=e;d++)if(isWork(d,hol))n++;return n*sg});
def('WORKDAY','DIATRABALHO',D,'data_inicial; dias; [feriados]','Data após dias úteis',(a,ctx)=>{let d=Math.floor(dser(ctx,a[0]));let k=N(ctx,a[1]);const hol=new Set(a[2]?flatNums(ctx,[a[2]]).map(Math.floor):[]);const st=k<0?-1:1;k=Math.abs(k);while(k>0){d+=st;if(isWork(d,hol))k--}return d});
def('DATEVALUE','DATA.VALOR',D,'texto_data','Converte texto em data',(a,ctx)=>{const p=parseInput(S(ctx,a[0]));return typeof p.v==='number'?Math.floor(p.v):ERR.val});
def('YEARFRAC','FRAÇÃOANO|FRACAOANO',D,'data_inicial; data_final','Fração do ano',(a,ctx)=>Math.abs(dser(ctx,a[1])-dser(ctx,a[0]))/365);

/* estatística avançada */
const sortedNums=(ctx,x)=>flatNums(ctx,[x]).sort((p,q)=>p-q);
def('LARGE','MAIOR',ST,'matriz; k','k-ésimo maior',(a,ctx)=>{const x=sortedNums(ctx,a[0]);const k=N(ctx,a[1]);return k<1||k>x.length?ERR.num:x[x.length-k]});
def('SMALL','MENOR',ST,'matriz; k','k-ésimo menor',(a,ctx)=>{const x=sortedNums(ctx,a[0]);const k=N(ctx,a[1]);return k<1||k>x.length?ERR.num:x[k-1]});
def('RANK.EQ','ORDEM.EQ|ORDEM',ST,'número; ref; [ordem]','Posição do número',(a,ctx)=>{const v=N(ctx,a[0]);const x=flatNums(ctx,[a[1]]);const o=a[2]==null?0:N(ctx,a[2]);if(!x.includes(v))return ERR.na;return 1+x.filter(y=>o?y<v:y>v).length});FN.RANK=FN['RANK.EQ'];
const pctInc=(x,p)=>{if(!x.length||p<0||p>1)return ERR.num;const h=(x.length-1)*p;const lo=Math.floor(h);return x[lo]+(h-lo)*((x[lo+1]??x[lo])-x[lo])};
def('PERCENTILE.INC','PERCENTIL.INC|PERCENTIL',ST,'matriz; k','Percentil',(a,ctx)=>pctInc(sortedNums(ctx,a[0]),N(ctx,a[1])));FN.PERCENTILE=FN['PERCENTILE.INC'];
def('QUARTILE.INC','QUARTIL.INC|QUARTIL',ST,'matriz; quarto','Quartil',(a,ctx)=>pctInc(sortedNums(ctx,a[0]),N(ctx,a[1])/4));FN.QUARTILE=FN['QUARTILE.INC'];
function pairs(ctx,a,b){const X=toArr(ctx,a).flat(),Y=toArr(ctx,b).flat();const px=[],py=[];for(let i=0;i<Math.min(X.length,Y.length);i++)if(typeof X[i]==='number'&&typeof Y[i]==='number'){px.push(X[i]);py.push(Y[i])}return[px,py]}
function linreg(x,y){const n=x.length;const mx=x.reduce((s,v)=>s+v,0)/n,my=y.reduce((s,v)=>s+v,0)/n;let sxy=0,sxx=0,syy=0;for(let i=0;i<n;i++){sxy+=(x[i]-mx)*(y[i]-my);sxx+=(x[i]-mx)**2;syy+=(y[i]-my)**2}return{m:sxy/sxx,b:my-sxy/sxx*mx,r:sxy/Math.sqrt(sxx*syy)}}
def('CORREL','CORREL',ST,'matriz1; matriz2','Correlação',(a,ctx)=>{const[x,y]=pairs(ctx,a[0],a[1]);return x.length<2?ERR.div:linreg(x,y).r});
def('RSQ','RQUAD',ST,'y_conhecidos; x_conhecidos','R²',(a,ctx)=>{const[y,x]=pairs(ctx,a[0],a[1]);return linreg(x,y).r**2});
def('SLOPE','INCLINAÇÃO|INCLINACAO',ST,'y_conhecidos; x_conhecidos','Inclinação da regressão',(a,ctx)=>{const[y,x]=pairs(ctx,a[0],a[1]);return x.length<2?ERR.div:linreg(x,y).m});
def('INTERCEPT','INTERCEPÇÃO|INTERCEPCAO',ST,'y_conhecidos; x_conhecidos','Interseção da regressão',(a,ctx)=>{const[y,x]=pairs(ctx,a[0],a[1]);return x.length<2?ERR.div:linreg(x,y).b});
def('FORECAST.LINEAR','PREVISÃO.LINEAR|PREVISAO.LINEAR|PREVISÃO|PREVISAO',ST,'x; y_conhecidos; x_conhecidos','Previsão linear',(a,ctx)=>{const[y,x]=pairs(ctx,a[1],a[2]);const L=linreg(x,y);return L.b+L.m*N(ctx,a[0])});FN.FORECAST=FN['FORECAST.LINEAR'];
def('TREND','TENDÊNCIA|TENDENCIA',ST,'y_conhecidos; [x_conhecidos]; [novos_x]','Valores da tendência linear',(a,ctx)=>{const Y=toArr(ctx,a[0]).flat();const X=a[1]?toArr(ctx,a[1]).flat():Y.map((_,i)=>i+1);const L=linreg(X,Y);const NX=a[2]?toArr(ctx,a[2]):X.map(v=>[v]);return NX.map(r=>r.map(v=>L.b+L.m*num(v)))});
def('GROWTH','CRESCIMENTO',ST,'y_conhecidos; [x_conhecidos]; [novos_x]','Crescimento exponencial',(a,ctx)=>{const Y=toArr(ctx,a[0]).flat().map(Math.log);const X=a[1]?toArr(ctx,a[1]).flat():Y.map((_,i)=>i+1);const L=linreg(X,Y);const NX=a[2]?toArr(ctx,a[2]):X.map(v=>[v]);return NX.map(r=>r.map(v=>Math.exp(L.b+L.m*num(v))))});
def('AVEDEV','DESV.MÉDIO|DESV.MEDIO',ST,'número1; …','Desvio médio absoluto',(a,ctx)=>{const x=flatNums(ctx,a);const m=x.reduce((s,v)=>s+v,0)/x.length;return x.reduce((s,v)=>s+Math.abs(v-m),0)/x.length});
def('GEOMEAN','MÉDIA.GEOMÉTRICA|MEDIA.GEOMETRICA',ST,'número1; …','Média geométrica',(a,ctx)=>{const x=flatNums(ctx,a);return Math.exp(x.reduce((s,v)=>s+Math.log(v),0)/x.length)});
def('NORM.DIST','DIST.NORM.N|DIST.NORM',ST,'x; média; desv_padrão; cumulativo','Distribuição normal',(a,ctx)=>{const x=N(ctx,a[0]),m=N(ctx,a[1]),s=N(ctx,a[2]),c=B(ctx,a[3]);const z=(x-m)/s;if(!c)return Math.exp(-z*z/2)/(s*Math.sqrt(2*Math.PI));return .5*(1+erf(z/Math.SQRT2))});
function erf(x){const t=1/(1+.3275911*Math.abs(x));const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x);return x>=0?y:-y}
def('NORM.INV','INV.NORM.N|INV.NORM',ST,'probabilidade; média; desv_padrão','Inversa da normal',(a,ctx)=>{const p=N(ctx,a[0]),m=N(ctx,a[1]),s=N(ctx,a[2]);let lo=-10,hi=10;for(let i=0;i<80;i++){const mid=(lo+hi)/2;if(.5*(1+erf(mid/Math.SQRT2))<p)lo=mid;else hi=mid}return m+s*(lo+hi)/2});
def('STANDARDIZE','PADRONIZAR',ST,'x; média; desv_padrão','Valor normalizado',(a,ctx)=>(N(ctx,a[0])-N(ctx,a[1]))/N(ctx,a[2]));
def('FREQUENCY','FREQÜÊNCIA|FREQUENCIA',ST,'dados; classes','Distribuição de frequência',(a,ctx)=>{const d=flatNums(ctx,[a[0]]),b=flatNums(ctx,[a[1]]).sort((x,y)=>x-y);const out=b.map(()=>0);out.push(0);for(const v of d){let i=b.findIndex(x=>v<=x);if(i<0)i=b.length;out[i]++}return out.map(x=>[x])});

/* financeiras */
def('PMT','PGTO',FI,'taxa; nper; vp; [vf]; [tipo]','Pagamento periódico',(a,ctx)=>{const r=N(ctx,a[0]),n=N(ctx,a[1]),pv=N(ctx,a[2]),fv=a[3]==null?0:N(ctx,a[3]),t=a[4]==null?0:N(ctx,a[4]);if(r===0)return-(pv+fv)/n;const q=Math.pow(1+r,n);return-(r*(pv*q+fv))/((1+r*t)*(q-1))});
def('PV','VP',FI,'taxa; nper; pgto; [vf]; [tipo]','Valor presente',(a,ctx)=>{const r=N(ctx,a[0]),n=N(ctx,a[1]),p=N(ctx,a[2]),fv=a[3]==null?0:N(ctx,a[3]),t=a[4]==null?0:N(ctx,a[4]);if(r===0)return-(p*n+fv);const q=Math.pow(1+r,n);return-(p*(1+r*t)*(q-1)/r+fv)/q});
def('FV','VF',FI,'taxa; nper; pgto; [vp]; [tipo]','Valor futuro',(a,ctx)=>{const r=N(ctx,a[0]),n=N(ctx,a[1]),p=N(ctx,a[2]),pv=a[3]==null?0:N(ctx,a[3]),t=a[4]==null?0:N(ctx,a[4]);if(r===0)return-(pv+p*n);const q=Math.pow(1+r,n);return-(pv*q+p*(1+r*t)*(q-1)/r)});
def('NPER','NPER',FI,'taxa; pgto; vp; [vf]; [tipo]','Número de períodos',(a,ctx)=>{const r=N(ctx,a[0]),p=N(ctx,a[1]),pv=N(ctx,a[2]),fv=a[3]==null?0:N(ctx,a[3]),t=a[4]==null?0:N(ctx,a[4]);if(r===0)return-(pv+fv)/p;const z=p*(1+r*t)/r;return Math.log((z-fv)/(pv+z))/Math.log(1+r)});
def('NPV','VPL',FI,'taxa; valor1; …','Valor presente líquido',(a,ctx)=>{const r=N(ctx,a[0]);return flatNums(ctx,a.slice(1)).reduce((s,v,i)=>s+v/Math.pow(1+r,i+1),0)});
def('IRR','TIR',FI,'valores; [estimativa]','Taxa interna de retorno',(a,ctx)=>{const v=flatNums(ctx,[a[0]]);let r=a[1]==null?.1:N(ctx,a[1]);for(let k=0;k<100;k++){let f=0,df=0;v.forEach((c,i)=>{f+=c/Math.pow(1+r,i);df-=i*c/Math.pow(1+r,i+1)});const nr=r-f/df;if(!isFinite(nr))return ERR.num;if(Math.abs(nr-r)<1e-10)return nr;r=nr}return ERR.num});
def('RATE','TAXA',FI,'nper; pgto; vp; [vf]; [tipo]; [estimativa]','Taxa por período',(a,ctx)=>{const n=N(ctx,a[0]),p=N(ctx,a[1]),pv=N(ctx,a[2]),fv=a[3]==null?0:N(ctx,a[3]),t=a[4]==null?0:N(ctx,a[4]);let r=a[5]==null?.1:N(ctx,a[5]);const f=r=>{const q=Math.pow(1+r,n);return pv*q+p*(1+r*t)*(q-1)/r+fv};for(let k=0;k<100;k++){const y=f(r),d=(f(r+1e-6)-y)/1e-6;const nr=r-y/d;if(Math.abs(nr-r)<1e-10)return nr;r=nr}return ERR.num});
def('EFFECT','EFETIVA',FI,'taxa_nominal; npery','Taxa efetiva',(a,ctx)=>{const r=N(ctx,a[0]),n=N(ctx,a[1]);return Math.pow(1+r/n,n)-1});
def('SLN','DPD',FI,'custo; recuperação; vida_útil','Depreciação linear',(a,ctx)=>(N(ctx,a[0])-N(ctx,a[1]))/N(ctx,a[2]));

const FN_LIST=()=>Object.values(FN).filter((v,i,arr)=>arr.indexOf(v)===i&&!v.hidden);
/* ---- elevação de critérios/valores em matriz (ex.: SOMASES com lista de critérios) ---- */
const isMulti=v=>(v instanceof Ref&&!v.single)||Array.isArray(v);
function liftArgs(name,idxFn){const F=FN[name];const f0=F.f;F.f=(a,ctx,n)=>{const idx=idxFn(a.length);for(const i of idx){if(i<a.length&&isMulti(a[i])){const arr=toArr(ctx,a[i]);return arr.map(row=>row.map(x=>{const b=a.slice();b[i]=x;const r=F.f(b,ctx,n);return isMulti(r)?scalar(ctx,r):r}))}}return f0(a,ctx,n)}}
const odd=from=>len=>{const o=[];for(let i=from;i<len;i+=2)o.push(i);return o};
liftArgs('SUMIF',()=>[1]);liftArgs('COUNTIF',()=>[1]);liftArgs('AVERAGEIF',()=>[1]);
liftArgs('SUMIFS',odd(2));liftArgs('AVERAGEIFS',odd(2));liftArgs('MAXIFS',odd(2));liftArgs('MINIFS',odd(2));liftArgs('COUNTIFS',odd(1));
for(const n of['VLOOKUP','HLOOKUP','MATCH','XMATCH'])liftArgs(n,()=>[0]);
{const F=FN.XLOOKUP;const f0=F.f;F.f=(a,ctx,n)=>{if(isMulti(a[0])){const arr=toArr(ctx,a[0]);return arr.map(row=>row.map(x=>{const b=a.slice();b[0]=x;const r=f0(b,ctx,n);return Array.isArray(r)?r[0][0]:r}))}return f0(a,ctx,n)}}
