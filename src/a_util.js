'use strict';
/* ================= util ================= */
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const uid=(p='id')=>p+Math.random().toString(36).slice(2,9);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stripAcc=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const deep=o=>JSON.parse(JSON.stringify(o));
function h(tag,attrs={},...kids){const e=document.createElement(tag);for(const k in attrs){const v=attrs[k];if(v==null||v===false)continue;if(k==='class')e.className=v;else if(k==='style'&&typeof v==='object')Object.assign(e.style,v);else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='html')e.innerHTML=v;else e.setAttribute(k,v===true?'':v)}for(const c of kids.flat()){if(c==null||c===false)continue;e.append(c.nodeType?c:document.createTextNode(c))}return e}
function debounce(f,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}}
function mulberry(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function toast(msg,kind=''){const t=$('#toast');t.textContent=msg;t.className='show '+kind;clearTimeout(toast._t);toast._t=setTimeout(()=>t.className='',2600)}
const LS={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}},del(k){try{localStorage.removeItem(k)}catch(e){}}};

/* ===== column names ===== */
function colName(c){let s='';c++;while(c>0){const m=(c-1)%26;s=String.fromCharCode(65+m)+s;c=(c-m-1)/26}return s}
function colIndex(s){let c=0;for(const ch of s.toUpperCase())c=c*26+(ch.charCodeAt(0)-64);return c-1}
const A1=(r,c)=>colName(c)+(r+1);
function parseA1(s){const m=/^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(s.trim());if(!m)return null;return{r:+m[2]-1,c:colIndex(m[1])}}
function parseRange(s){s=s.trim();const p=s.split(':');const a=parseA1(p[0]);if(!a)return null;const b=p[1]?parseA1(p[1]):a;if(!b)return null;return{r1:Math.min(a.r,b.r),c1:Math.min(a.c,b.c),r2:Math.max(a.r,b.r),c2:Math.max(a.c,b.c)}}
const rangeA1=g=>g.r1===g.r2&&g.c1===g.c2?A1(g.r1,g.c1):A1(g.r1,g.c1)+':'+A1(g.r2,g.c2);
const inRange=(g,r,c)=>r>=g.r1&&r<=g.r2&&c>=g.c1&&c<=g.c2;
const normR=g=>({r1:Math.min(g.r1,g.r2),c1:Math.min(g.c1,g.c2),r2:Math.max(g.r1,g.r2),c2:Math.max(g.c1,g.c2)});

/* ===== dates (serial Excel, base 1899-12-30) ===== */
const EPOCH=Date.UTC(1899,11,30);
const dateToSerial=(y,m,d)=>(Date.UTC(y,m-1,d)-EPOCH)/864e5;
function serialToDate(s){const d=new Date(EPOCH+Math.round(s*864e5));return d}
function serialParts(s){const d=serialToDate(Math.floor(s+1e-9));const fr=s-Math.floor(s+1e-9);let secs=Math.round(fr*86400);return{y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate(),wd:d.getUTCDay(),hh:Math.floor(secs/3600),mi:Math.floor(secs%3600/60),ss:secs%60}}
const todaySerial=()=>{const n=new Date();return dateToSerial(n.getFullYear(),n.getMonth()+1,n.getDate())};
const nowSerial=()=>{const n=new Date();return todaySerial()+(n.getHours()*3600+n.getMinutes()*60+n.getSeconds())/86400};
const MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MES3=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const DIAS=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];

/* ===== number format engine (códigos estilo Excel, saída pt-BR) ===== */
const NF_CACHE=new Map();
function nfCompile(code){
  if(NF_CACHE.has(code))return NF_CACHE.get(code);
  let out;
  if(!code||code==='General'||code==='Geral')out={gen:true};
  else{
    const secs=[];let cur='',q=false;for(const ch of code){if(ch==='"')q=!q;if(ch===';'&&!q){secs.push(cur);cur=''}else cur+=ch}secs.push(cur);
    out={secs:secs.map(nfSection)};
  }
  NF_CACHE.set(code,out);return out;
}
function nfSection(s){
  const sec={raw:s,date:false};
  const cleaned=s.replace(/"[^"]*"/g,'').replace(/\[[^\]]*\]/g,'').replace(/\\./g,'');
  if(!/[0#?]/.test(cleaned)&&/[dmyhs]/i.test(cleaned)&&!/@/.test(cleaned))sec.date=true;
  if(sec.date){sec.toks=s.match(/"[^"]*"|\[[^\]]*\]|yyyy|yy|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|\\.|./gi);return sec}
  // numeric
  const m=/^(.*?)([#0,.]*[0#][#0,.]*)(%?)(E\+0+)?(.*)$/i.exec(s);
  if(!m){sec.lit=s.replace(/"/g,'');return sec}
  const lit=x=>x.replace(/"([^"]*)"/g,'$1').replace(/\\(.)/g,'$1').replace(/_.?/g,' ').replace(/\*./g,'').replace(/\[[^\]]*\]/g,'');
  sec.pre=lit(m[1]);sec.suf=lit(m[5]);sec.pct=m[3]==='%'||/%/.test(m[5]);if(/%/.test(m[5]))sec.suf=sec.suf.replace('%','');
  const body=m[2];const dot=body.indexOf('.');
  sec.dec=dot<0?0:(body.slice(dot+1).match(/[0#]/g)||[]).length;sec.decMin=dot<0?0:(body.slice(dot+1).match(/0/g)||[]).length;
  sec.sep=/,/.test(dot<0?body:body.slice(0,dot));
  const ip=dot<0?body:body.slice(0,dot);sec.intMin=(ip.match(/0/g)||[]).length;
  sec.exp=!!m[4];return sec;
}
function fmtNumPlain(v,dec,decMin,sep,intMin=1){
  let s=Math.abs(v).toFixed(dec);let [i,f='']=s.split('.');
  if(decMin<dec){f=f.replace(/0+$/,'');if(f.length<decMin)f=f.padEnd(decMin,'0')}
  if(i.length<intMin)i=i.padStart(intMin,'0');if(intMin===0&&i==='0'&&f)i='';
  if(sep)i=i.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return i+(f?','+f:'');
}
function fmtGeneral(v){
  if(typeof v!=='number')return String(v);
  if(!isFinite(v))return '#NÚM!';
  if(v===0)return '0';
  const a=Math.abs(v);
  if(a>=1e11||a<1e-9){return v.toExponential(4).replace('.',',').replace('e+','E+').replace('e-','E-')}
  let s=String(+v.toPrecision(11));if(/e/.test(s))s=v.toFixed(10).replace(/0+$/,'');
  return s.replace('.',',');
}
function fmtValue(v,code){
  if(v==null||v==='')return '';
  if(typeof v==='boolean')return v?'VERDADEIRO':'FALSO';
  if(typeof v==='object'&&v.err)return v.err;
  if(typeof v!=='number'){const c=code&&nfCompile(code);if(c&&c.secs&&c.secs[3]&&c.secs[3].raw.includes('@'))return c.secs[3].raw.replace(/"/g,'').replace('@',v);return String(v)}
  const c=nfCompile(code);if(c.gen)return fmtGeneral(v);
  let sec=c.secs[0],neg=false;
  if(v<0&&c.secs[1]){sec=c.secs[1];neg=true}else if(v===0&&c.secs[2])sec=c.secs[2];
  if(sec.date)return fmtDate(v,sec.toks);
  if(sec.lit!=null)return sec.lit;
  let x=sec.pct?v*100:v;
  let body;
  if(sec.exp){const e=x===0?0:Math.floor(Math.log10(Math.abs(x)));const mnt=x/Math.pow(10,e);body=fmtNumPlain(mnt,sec.dec,sec.decMin,false)+'E'+(e<0?'-':'+')+String(Math.abs(e)).padStart(2,'0')}
  else body=fmtNumPlain(x,sec.dec,sec.decMin,sec.sep,sec.intMin);
  const sign=(x<0&&!neg&&Math.abs(x).toFixed(sec.dec)!=0)?'-':'';
  return (sign&&sec.pre&&/R\$|US\$|€/.test(sec.pre)?'-'+sec.pre:sec.pre+sign)+body+(sec.pct?'%':'')+sec.suf;
}
function fmtDate(v,toks){
  const p=serialParts(v);const hasAP=toks.some(t=>/AM\/PM/i.test(t));let out='';
  toks.forEach((t,i)=>{const l=t.toLowerCase();
    if(t[0]==='"')out+=t.slice(1,-1);else if(t[0]==='['){if(/h/i.test(t))out+=Math.floor(v*24);else if(/m/i.test(t))out+=Math.floor(v*1440)}
    else if(l==='yyyy')out+=p.y;else if(l==='yy')out+=String(p.y).slice(-2);
    else if(l==='mmmm')out+=MESES[p.m-1];else if(l==='mmm')out+=MES3[p.m-1];
    else if(l==='mm'||l==='m'){const prev=toks.slice(0,i).reverse().find(x=>/[a-z]/i.test(x));const next=toks.slice(i+1).find(x=>/[a-z]/i.test(x));const isMin=(prev&&/^h/i.test(prev))||(next&&/^s/i.test(next));const val=isMin?p.mi:p.m;out+=l==='mm'?String(val).padStart(2,'0'):val}
    else if(l==='dddd')out+=DIAS[p.wd];else if(l==='ddd')out+=DIAS[p.wd].slice(0,3);
    else if(l==='dd')out+=String(p.d).padStart(2,'0');else if(l==='d')out+=p.d;
    else if(l==='hh'||l==='h'){let hh=p.hh;if(hasAP)hh=hh%12||12;out+=l==='hh'?String(hh).padStart(2,'0'):hh}
    else if(l==='ss')out+=String(p.ss).padStart(2,'0');else if(l==='s')out+=p.ss;
    else if(/am\/pm/i.test(t))out+=p.hh<12?'AM':'PM';else if(t[0]==='\\')out+=t[1];else out+=t;
  });return out;
}
const isDateFmt=code=>{if(!code)return false;const c=nfCompile(code);return !!(c.secs&&c.secs[0].date)};
const NF_PRESETS=[
  ['Geral','General'],['Número','#,##0.00'],['Inteiro','#,##0'],['Moeda (R$)','"R$" #,##0.00'],['Contábil','"R$" #,##0.00;"R$" -#,##0.00;"R$" -'],
  ['Porcentagem','0.00%'],['Porcentagem inteira','0%'],['Data','dd/mm/yyyy'],['Data e hora','dd/mm/yyyy hh:mm'],['Hora','hh:mm'],['Mês/ano','mmm/yy'],['Data por extenso','d "de" mmmm "de" yyyy'],['Científico','0.00E+00'],['Texto','@']
];

/* ===== parse de entrada pt-BR ===== */
function parseInput(s){
  // retorna {v, nf?}
  if(s==null)return{v:null};
  const t=String(s).trim();if(t==='')return{v:null};
  if(/^(verdadeiro|true)$/i.test(t))return{v:true};if(/^(falso|false)$/i.test(t))return{v:false};
  let m;
  if((m=/^(-?)(R\$|US\$|€)\s*(-?[\d.]*,?\d+)$/.exec(t))){const n=ptNum(m[3]);if(n!=null)return{v:(m[1]?-1:1)*n,nf:'"R$" #,##0.00'}}
  if((m=/^(-?[\d.]*,?\d+)\s*%$/.exec(t))){const n=ptNum(m[1]);if(n!=null)return{v:n/100,nf:/,/.test(m[1])?'0.00%':'0%'}}
  if((m=/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(t))){let y=+m[3];if(y<100)y+=y<50?2000:1900;const d=+m[1],mo=+m[2];if(mo>=1&&mo<=12&&d>=1&&d<=31){let v=dateToSerial(y,mo,d);if(m[4])v+=(+m[4]*3600+ +m[5]*60+(+m[6]||0))/86400;return{v,nf:m[4]?'dd/mm/yyyy hh:mm':'dd/mm/yyyy'}}}
  if((m=/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t))&&t.length<=19){let v=dateToSerial(+m[1],+m[2],+m[3]);if(m[4])v+=(+m[4]*3600+ +m[5]*60+(+m[6]||0))/86400;return{v,nf:m[4]?'dd/mm/yyyy hh:mm':'dd/mm/yyyy'}}
  if((m=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t)))return{v:(+m[1]*3600+ +m[2]*60+(+m[3]||0))/86400,nf:m[3]?'hh:mm:ss':'hh:mm'};
  const n=ptNum(t);if(n!=null)return{v:n};
  return{v:t};
}
function ptNum(t){
  t=t.replace(/\s/g,'');
  if(/^[-+]?\d+$/.test(t))return +t;
  if(/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t))return +t.replace(/\./g,'').replace(',','.');
  if(/^[-+]?\d*,\d+$/.test(t))return +t.replace(',','.');
  if(/^[-+]?\d*\.\d+(e[-+]?\d+)?$/i.test(t)&&!/^[-+]?\d{1,3}\.\d{3}$/.test(t))return +t;
  if(/^[-+]?\d+(,\d+)?e[-+]?\d+$/i.test(t))return +t.replace(',','.');
  return null;
}
