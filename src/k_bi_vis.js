const FF='"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
function dispName(it){const n=itemName(it);return it&&it.m?n.replace(/^CLD_/,'').replace(/_/g,' ').replace(/\bPct\b/,'%'):n}
/* ================= BI: visuais ================= */
const VT={
 col:{n:'Colunas agrupadas',i:'col',wells:[['axis','Eixo X',9],['legend','Legenda',1],['values','Valores',9]]},
 stackcol:{n:'Colunas empilhadas',i:'stackcol',wells:[['axis','Eixo X',9],['legend','Legenda',1],['values','Valores',9]]},
 bar:{n:'Barras agrupadas',i:'bar',wells:[['axis','Eixo Y',9],['legend','Legenda',1],['values','Valores',9]]},
 stackbar:{n:'Barras empilhadas',i:'stackbar',wells:[['axis','Eixo Y',9],['legend','Legenda',1],['values','Valores',9]]},
 line:{n:'Linhas',i:'line',wells:[['axis','Eixo X',9],['legend','Legenda',1],['values','Valores',9]]},
 area:{n:'Área',i:'area',wells:[['axis','Eixo X',9],['legend','Legenda',1],['values','Valores',9]]},
 combo:{n:'Colunas e linha',i:'combo',wells:[['axis','Eixo X',9],['values','Colunas',9],['values2','Linha (eixo secundário)',9]]},
 pie:{n:'Pizza',i:'pie',wells:[['axis','Legenda',9],['values','Valores',1]]},
 donut:{n:'Rosca',i:'donut',wells:[['axis','Legenda',9],['values','Valores',1]]},
 treemap:{n:'Mapa de árvore',i:'treemap',wells:[['axis','Categoria',9],['values','Valores',1]]},
 funnel:{n:'Funil',i:'funnel',wells:[['axis','Categoria',9],['values','Valores',1]]},
 waterfall:{n:'Cascata',i:'waterfall',wells:[['axis','Categoria',9],['values','Valores',1]]},
 scatter:{n:'Dispersão',i:'scatter',wells:[['axis','Detalhes',1],['values','Eixo X',1],['values2','Eixo Y',1],['size','Tamanho',1]]},
 gauge:{n:'Medidor',i:'gauge',wells:[['values','Valor',1],['min','Mínimo',1],['max','Máximo',1],['target','Meta',1]]},
 card:{n:'Cartão',i:'card',wells:[['values','Campos',1]]},
 multicard:{n:'Cartão de várias linhas',i:'kpi',wells:[['values','Campos',12]]},
 kpi:{n:'KPI',i:'kpi',wells:[['values','Valor',1],['target','Meta',1],['axis','Tendência',1]]},
 table:{n:'Tabela',i:'table',wells:[['cols','Colunas',20]]},
 matrix:{n:'Matriz',i:'matrix',wells:[['rows','Linhas',6],['colsM','Colunas',1],['values','Valores',8]]},
 slicer:{n:'Segmentação de dados',i:'slicer',wells:[['axis','Campo',1]]},
 text:{n:'Caixa de texto',i:'text',wells:[]},
};
const VALUE_WELLS=new Set(['values','values2','size','min','max','target']);
const CHARTS=new Map();
const BIUI={sel:null,side:'vis',drag:null};
function pal(){const ap=advPalette();if(ap)return ap;const dark=PAL.dark;return['#EB6A20',dark?'#C9CED1':'#2D3336','#F6A709','#3C8DAD',dark?'#9AA4AA':'#7D8286','#B4532A','#2F8F55','#8456D0','#E8B86D','#5B6B73']}
function curPage(){return BI.pages[Math.min(BI.page,BI.pages.length-1)]}
function fieldType(t,c){const T=TB(t);if(!T)return null;const i=T.ci.get(String(c).toLowerCase());return i==null?null:T.cols[i].type}

/* ---- filtros do painel → filtros do motor ---- */
function convFilter(pf){if(!pf||!TB(pf.t))return null;try{colIdx(TB(pf.t),pf.c)}catch(e){return null}
  if(pf.kind==='basic'){if(!pf.vals||!pf.vals.length)return null;return fIn(TB(pf.t).name,pf.c,pf.vals,pf.lvl)}
  if(pf.kind==='range'){if(pf.min==null&&pf.max==null)return null;return mkF({t:TB(pf.t).name,c:pf.c,lvl:pf.lvl,op:'range',min:pf.min,max:pf.max})}
  if(pf.kind==='adv'){const a=ptNum(String(pf.a??''))??pf.a;const A=String(pf.a??'').toLowerCase();const fn=v=>{const s=txt(v).toLowerCase();switch(pf.op){case'gt':return v>a;case'lt':return v<a;case'ge':return v>=a;case'le':return v<=a;case'eq':return typeof a==='number'?v===a:s===A;case'ne':return typeof a==='number'?v!==a:s!==A;case'contains':return s.includes(A);case'ncontains':return !s.includes(A);case'starts':return s.startsWith(A);case'empty':return v==null||v==='';case'nempty':return!(v==null||v==='')}return true};return mkF({t:TB(pf.t).name,c:pf.c,lvl:pf.lvl,op:'pred',fn,id:'adv'+pf.op+pf.a})}
  if(pf.kind==='topn'&&pf.by){const T=TB(pf.t);const vals=distinctVals(T.name,pf.c,[],pf.lvl);const sc=vals.map(v=>{let x=null;try{x=evalItem(pf.by,[fIn(T.name,pf.c,[v],pf.lvl)])}catch(e){}return[v,x]}).filter(x=>x[1]!=null).sort((p,q)=>pf.bottom?p[1]-q[1]:q[1]-p[1]).slice(0,pf.n||5).map(x=>x[0]);return fIn(T.name,pf.c,sc,pf.lvl)}
  return null}
function slicerFilter(v){const f=v.fields.axis&&v.fields.axis[0];if(!f||!TB(f.t))return null;const s=v.slicer||{};if(s.mode==='range'){if(s.min==null&&s.max==null)return null;return mkF({t:TB(f.t).name,c:f.c,lvl:f.lvl,op:'range',min:s.min,max:s.max})}if(!s.sel||!s.sel.length)return null;return fIn(TB(f.t).name,f.c,s.sel,f.lvl)}
function visFilters(v,p){p=p||curPage();const F=[];for(const pf of[...(BI.rfilters||[]),...(p.filters||[]),...(v.filters||[])]){const f=convFilter(pf);if(f)F.push(f)}
  for(const o of p.visuals){if(o.type==='slicer'&&o.id!==v.id){const f=slicerFilter(o);if(f)F.push(f)}}
  if(p.xf&&p.xf.vid!==v.id&&v.type!=='slicer'&&v.type!=='text')F.push(...p.xf.filters);
  return F}

/* ---- níveis do eixo (hierarquia) ---- */
function axisLevels(v){const out=[];for(const it of v.fields.axis||[]){if(!TB(it.t))continue;if(fieldType(it.t,it.c)==='date'&&!it.lvl&&it.dateH!==false){for(const l of['year','quarter','month','day'])out.push({t:it.t,c:it.c,lvl:l})}else out.push({t:it.t,c:it.c,lvl:it.lvl})}return out}
function lvlName(L){return L.lvl?L.c+' · '+LVL[L.lvl]:L.c}
function catLabel(v,lvl){if(lvl)return lvlLabel(v,lvl);if(v==null||v==='')return'(Em branco)';if(typeof v==='number')return fmtGeneral(v);return txt(v)}
/* ---- cálculo de dados categóricos ---- */
function computeCat(v){const p=curPage();const F=visFilters(v,p);const lv=axisLevels(v);const d=v.drill||(v.drill={lvl:0,path:[]});
  if(!lv.length)return{empty:true};d.lvl=clamp(d.lvl,0,lv.length-1);
  const pathF=[];for(let i=0;i<d.lvl;i++){const L=lv[i];if(d.path[i]===undefined)break;pathF.push(fIn(TB(L.t).name,L.c,[d.path[i]],L.lvl))}
  const L=lv[d.lvl];const AN=d.expand&&d.lvl>0?lv.slice(0,d.lvl).filter(a=>TB(a.t)===TB(L.t)):[];const P=AN.length?AN[AN.length-1]:null;
  const base=[...F,...(AN.length?[]:pathF)];
  const T=TB(L.t);const i=colIdx(T,L.c);const ai=AN.map(a=>colIdx(T,a.c));
  const seen=new Map();for(const r of rowsOf(T.name,base)){const row=T.rows[r];const val=lvlVal(row[i],L.lvl);const pv=AN.length?AN.map((a,k)=>lvlVal(row[ai[k]],a.lvl)):undefined;const key=(pv?pv.join('\u0002')+'\u0001':'')+val;if(!seen.has(key))seen.set(key,{v:val,pv})}
  let cats=[...seen.values()];
  const vals=v.fields.values||[];const vals2=v.fields.values2||[];
  const leg=v.fields.legend&&v.fields.legend[0]&&TB(v.fields.legend[0].t)?v.fields.legend[0]:null;
  let legVals=null;if(leg){legVals=distinctVals(TB(leg.t).name,leg.c,base,leg.lvl).sort(cmpVals).slice(0,24)}
  const catF=c=>{const f=[fIn(T.name,L.c,[c.v],L.lvl)];if(c.pv)AN.forEach((a,k)=>f.push(fIn(T.name,a.c,[c.pv[k]],a.lvl)));return f};
  const rows=cats.map(c=>{const cf=[...base,...catF(c)];const o={c,vals:[],vals2:[],leg:[]};
    if(leg){const it=vals[0];o.leg=legVals.map(lv2=>{try{return it?evalItem(it,[...cf,fIn(TB(leg.t).name,leg.c,[lv2],leg.lvl)]):null}catch(e){return null}})}
    else{o.vals=vals.map(it=>{try{return evalItem(it,cf)}catch(e){o.err=e.v?e.v.err:String(e.message);return null}});o.vals2=vals2.map(it=>{try{return evalItem(it,cf)}catch(e){return null}})}
    return o}).filter(o=>leg?o.leg.some(x=>x!=null):(o.vals.some(x=>x!=null)||o.vals2.some(x=>x!=null)||!vals.length));
  // ordenação
  const ty=fieldType(L.t,L.c);const natural=L.lvl||ty==='date'||ty==='int'||ty==='num';const so=v.opts.sort||{by:natural?'cat':'val',dir:natural?'asc':'desc'};
  const key0=o=>leg?o.leg.reduce((a,b)=>a+(b||0),0):(o.vals[0]??-Infinity);
  rows.sort((a,b)=>{let k=0;if(so.by==='cat'){if(a.c.pv)for(let q=0;q<a.c.pv.length&&!k;q++)k=cmpVals(a.c.pv[q],b.c.pv[q]);if(!k)k=cmpVals(a.c.v,b.c.v)}else k=key0(a)-key0(b);return so.dir==='desc'?-k:k});
  let shown=rows;if(v.opts.topN>0)shown=rows.slice(0,v.opts.topN);
  const lab=o=>(o.c.pv?o.c.pv.map((x,k)=>catLabel(x,AN[k].lvl)).filter((x,k)=>!(AN[k].lvl==='quarter'&&L.lvl==='month')).join(' ')+' ':'')+catLabel(o.c.v,L.lvl);
  const err=rows.find(o=>o.err);
  return{L,lv,P,AN,rows:shown,total:rows.length,labels:shown.map(lab),leg,legVals,vals,vals2,err:err&&err.err,base}}

/* ---- render de um visual ---- */
function biRenderVisual(v,host){const body=host.querySelector('.vbody');const T=VT[v.type];
  const ttl=host.querySelector('.vt');ttl.textContent=v.opts.showTitle===false?'':(v.title||autoTitle(v));
  try{
    if(v.type==='text'){disposeChart(v.id);body.innerHTML='';const d=h('div',{class:'vtext',html:mdLite(v.text||'Clique duas vezes para escrever.')});d.ondblclick=()=>editText(v);body.append(d);return}
    if(v.type==='slicer')return renderSlicer(v,body);
    if(v.type==='card'||v.type==='multicard'||v.type==='kpi')return renderCards(v,body);
    if(v.type==='table')return renderTable(v,body);
    if(v.type==='matrix')return renderMatrix(v,body);
    if(v.type==='gauge')return renderGauge(v,body);
    if(v.type==='scatter')return renderScatter(v,body);
    return renderCatChart(v,body);
  }catch(e){console.warn(e);disposeChart(v.id);body.innerHTML='';body.append(h('div',{class:'verr'},'Não foi possível calcular este visual: '+(e.v?e.v.err:e.message)))}}
function autoTitle(v){const f=v.fields;const vn=(f.values||[]).map(dispName).join(', ');const an=(f.axis||[]).map(x=>x.c).join(', ');if(v.type==='slicer')return an;if(v.type==='table')return(f.cols||[]).map(dispName).slice(0,3).join(', ');if(v.type==='matrix')return(f.values||[]).map(dispName).join(', ')+(f.rows&&f.rows.length?' por '+f.rows.map(x=>x.c).join(', '):'');if(!vn)return VT[v.type].n;return an?`${vn} por ${an}`:vn}
function emptyState(body,v,msg){disposeChart(v.id);body.innerHTML='';body.append(h('div',{class:'vempty',html:ico(VT[v.type].i)+'<div>'+esc(msg||'Arraste campos do painel Dados para este visual')+'</div>'}))}
function disposeChart(id){const c=CHARTS.get(id);if(c){try{c.dispose()}catch(e){}CHARTS.delete(id)}}
function chartIn(v,body){if(!window.echarts){body.innerHTML='';body.append(h('div',{class:'verr'},'Biblioteca de gráficos indisponível. Use a versão offline ou verifique a conexão.'));return null}
  let c=CHARTS.get(v.id);if(c&&c.getDom().parentNode!==body){disposeChart(v.id);c=null}if(!c){body.innerHTML='';const d=h('div',{style:{position:'absolute',inset:'0'}});body.append(d);c=echarts.init(d,null,{renderer:'canvas'});CHARTS.set(v.id,c)}return c}
function axisStyle(){return{axisLine:{lineStyle:{color:PAL.line}},axisLabel:{color:PAL.muted,fontFamily:FF,fontSize:11},splitLine:{lineStyle:{color:PAL.grid}},axisTick:{show:false}}}
function tipBase(){return{backgroundColor:PAL.dark?'#2D3336':'#fff',borderColor:PAL.line,textStyle:{color:PAL.text,fontFamily:FF,fontSize:12},extraCssText:'box-shadow:0 4px 14px rgba(0,0,0,.18);border-radius:6px'}}
function renderCatChart(v,body){const f=v.fields;if(!(f.axis||[]).length||!(f.values||[]).length)return emptyState(body,v,(f.axis||[]).length?'Adicione um valor (medida ou coluna numérica)':'Adicione um campo ao '+VT[v.type].wells[0][1]);
  let D=computeCat(v);if(D.err&&!D.rows.length){emptyState(body,v,D.err);return}D=advData(v,D);
  const c=chartIn(v,body);if(!c)return;const P=pal();const xf=curPage().xf;const selSet=xf&&xf.vid===v.id?new Set(xf.keys):null;
  const fmt0=itemFmt(f.values[0]);const horiz=v.type==='bar'||v.type==='stackbar';const stack=v.type.startsWith('stack');
  const dim=i=>selSet&&!selSet.has(D.labels[i]);
  let series=[];
  const lbl={show:!!v.opts.labels,position:stack?'inside':horiz?'right':'top',color:stack?'#fff':PAL.muted,fontSize:10.5,formatter:p=>fmtShort(p.value,fmt0)};
  if(['col','stackcol','bar','stackbar','line','area'].includes(v.type)){
    const kind=v.type==='line'||v.type==='area'?'line':'bar';
    const mk=(name,data,i,fmt)=>({name,type:kind,data:data.map((x,j)=>({value:x,itemStyle:dim(j)?{opacity:.3}:undefined})),stack:stack?'s':undefined,smooth:kind==='line'&&v.opts.smooth!==false?.25:false,showSymbol:D.rows.length<40,symbolSize:5,areaStyle:v.type==='area'?{opacity:.18}:undefined,lineStyle:kind==='line'?{width:2.2}:undefined,barMaxWidth:46,label:{...lbl,formatter:p=>fmtShort(p.value,fmt)},itemStyle:{color:v.opts.color&&i===0&&!D.leg?v.opts.color:P[i%P.length],borderRadius:kind==='bar'?(horiz?[0,3,3,0]:[3,3,0,0]):0},emphasis:{focus:'series'}});
    if(D.leg)series=D.legVals.map((lv2,i)=>mk(catLabel(lv2,D.leg.lvl),D.rows.map(o=>o.leg[i]),i,fmt0));else series=f.values.map((it,i)=>mk(dispName(it),D.rows.map(o=>o.vals[i]),i,itemFmt(it)));
  }else if(v.type==='combo'){
    series=[...f.values.map((it,i)=>({name:dispName(it),type:'bar',data:D.rows.map((o,j)=>({value:o.vals[i],itemStyle:dim(j)?{opacity:.3}:undefined})),barMaxWidth:46,itemStyle:{color:P[i%P.length],borderRadius:[3,3,0,0]},label:{...lbl,formatter:p=>fmtShort(p.value,itemFmt(it))}})),...(f.values2||[]).map((it,i)=>({name:dispName(it),type:'line',yAxisIndex:1,data:D.rows.map(o=>o.vals2[i]),smooth:.25,symbolSize:6,lineStyle:{width:2.4},itemStyle:{color:P[(i+2)%P.length]},label:{...lbl,formatter:p=>fmtShort(p.value,itemFmt(it))}}))];
  }else if(v.type==='pie'||v.type==='donut'){
    series=[{type:'pie',radius:v.type==='donut'?['48%','74%']:[0,'74%'],center:['50%',v.opts.legend!==false?'46%':'52%'],data:D.rows.map((o,j)=>({name:D.labels[j],value:o.vals[0],itemStyle:{color:P[j%P.length],opacity:dim(j)?.3:1,borderColor:PAL.cell,borderWidth:1.5}})),label:{show:v.opts.labels!==false,color:PAL.muted,fontSize:11,formatter:p=>p.percent>=4?`${p.name}\n${fmtShort(p.value,fmt0)} (${fmtNumPlain(p.percent,1,0,false)}%)`:''},labelLine:{lineStyle:{color:PAL.line}}}];
  }else if(v.type==='treemap'){series=[{type:'treemap',roam:false,nodeClick:false,breadcrumb:{show:false},width:'100%',height:'100%',top:0,left:0,label:{fontSize:12,formatter:p=>p.name+'\n'+fmtShort(p.value,fmt0)},itemStyle:{borderColor:PAL.cell,borderWidth:2,gapWidth:2},data:D.rows.map((o,j)=>({name:D.labels[j],value:o.vals[0],itemStyle:{color:P[j%P.length],opacity:dim(j)?.3:1}}))}]}
  else if(v.type==='funnel'){series=[{type:'funnel',left:'10%',width:'80%',top:10,bottom:10,sort:'descending',label:{position:'inside',color:'#fff',formatter:p=>p.name+': '+fmtShort(p.value,fmt0)},data:D.rows.map((o,j)=>({name:D.labels[j],value:o.vals[0],itemStyle:{color:P[j%P.length],opacity:dim(j)?.3:1}}))}]}
  else if(v.type==='waterfall'){let acc=0;const base=[],up=[],dn=[];for(const o of D.rows){const x=o.vals[0]||0;if(x>=0){base.push(acc);up.push(x);dn.push(null)}else{base.push(acc+x);up.push(null);dn.push(-x)}acc+=x}
    D.labels.push('Total');base.push(0);up.push(acc>=0?acc:null);dn.push(acc<0?-acc:null);
    series=[{type:'bar',stack:'w',data:base,itemStyle:{color:'transparent'},silent:true},{name:'Aumento',type:'bar',stack:'w',data:up.map((x,i)=>({value:x,itemStyle:{color:i===up.length-1?P[1]:'#2F8F55'}})),label:{show:true,position:'top',color:PAL.muted,fontSize:10,formatter:p=>p.value==null?'':fmtShort(p.value,fmt0)}},{name:'Redução',type:'bar',stack:'w',data:dn,itemStyle:{color:'#C8402E'},label:{show:true,position:'bottom',color:PAL.muted,fontSize:10,formatter:p=>p.value==null?'':'-'+fmtShort(p.value,fmt0)}}]}
  const cartesian=!['pie','donut','treemap','funnel'].includes(v.type);
  const cat={type:'category',data:D.labels,...axisStyle(),axisLabel:{...axisStyle().axisLabel,interval:'auto',hideOverlap:true,width:horiz?110:undefined,overflow:'truncate'}};
  const val={type:'value',...axisStyle(),axisLabel:{...axisStyle().axisLabel,formatter:x=>fmtShort(x,fmt0)},scale:(v.type==='line'||v.type==='area')&&v.opts.zeroBase!==true&&!/^0/.test('')};
  const opt={animationDuration:350,color:P,textStyle:{fontFamily:FF},tooltip:{...tipBase(),trigger:cartesian?'axis':'item',axisPointer:{type:cartesian&&v.type!=='line'&&v.type!=='area'?'shadow':'line'},valueFormatter:x=>x==null?'(Em branco)':fmtValue(x,fmt0)},
    legend:{show:v.opts.legend!==false&&(series.length>1||['pie','donut'].includes(v.type))&&v.type!=='waterfall',type:'scroll',bottom:0,textStyle:{color:PAL.muted,fontSize:11},icon:'circle',itemWidth:9,itemHeight:9},
    grid:cartesian?{left:8,right:v.type==='combo'?8:14,top:18,bottom:v.opts.legend!==false&&series.length>1?34:10,containLabel:true}:undefined,series};
  if(cartesian){if(horiz){opt.yAxis={...cat,inverse:true};opt.xAxis=val}else{opt.xAxis=cat;opt.yAxis=v.type==='combo'?[val,{...val,splitLine:{show:false},axisLabel:{...val.axisLabel,formatter:x=>fmtShort(x,itemFmt((f.values2||[])[0]||f.values[0]))}}]:val}
    if(D.rows.length>40&&!horiz)opt.dataZoom=[{type:'inside',start:0,end:Math.min(100,4000/D.rows.length)}]}
  advOptions(v,D,opt,fmt0);c.setOption(opt,true);
  c.off('click');c.on('click',p=>{if(p.seriesName==='Aumento'&&v.type==='waterfall'&&p.dataIndex===D.rows.length)return;const i=p.dataIndex;const o=D.rows[i];if(!o)return;onCatClick(v,D,o,D.labels[i],p.event&&p.event.event)});
  const db=body.querySelector('.drillbar');if(db)db.remove();
  if(D.lv.length>1||D.total>D.rows.length){body.append(h('div',{class:'drillbar'},(D.lv.length>1?lvlName(D.L)+(v.drill.path.length?' · '+v.drill.path.slice(0,v.drill.lvl).map((x,k)=>catLabel(x,D.lv[k].lvl)).join(' › '):''):'')+(D.total>D.rows.length?` · ${D.rows.length} de ${D.total}`:'')))}
}
function onCatClick(v,D,o,label,ev){const p=curPage();
  if(v.drill.mode&&v.drill.lvl<D.lv.length-1){if(o.c.pv)o.c.pv.forEach((x,k)=>v.drill.path[k]=x);v.drill.path[v.drill.lvl]=o.c.v;v.drill.expand=false;v.drill.lvl++;v.drill.path.length=v.drill.lvl;biRenderPage();return}
  const filters=[fIn(TB(D.L.t).name,D.L.c,[o.c.v],D.L.lvl)];if(o.c.pv)D.AN.forEach((a,k)=>filters.push(fIn(TB(a.t).name,a.c,[o.c.pv[k]],a.lvl)));
  if(!o.c.pv)for(let i=0;i<v.drill.lvl;i++){const L=D.lv[i];if(v.drill.path[i]!==undefined)filters.push(fIn(TB(L.t).name,L.c,[v.drill.path[i]],L.lvl))}
  const multi=ev&&(ev.ctrlKey||ev.metaKey);
  if(p.xf&&p.xf.vid===v.id){if(multi){const k=new Set(p.xf.keys);if(k.has(label)){k.delete(label)}else k.add(label);if(!k.size){p.xf=null}else{p.xf.keys=[...k];const L=D.L;const vals=D.rows.filter((r,j)=>k.has(D.labels[j])).map(r=>r.c.v);p.xf.filters=[fIn(TB(L.t).name,L.c,vals,L.lvl)]}}else if(p.xf.keys.length===1&&p.xf.keys[0]===label)p.xf=null;else p.xf={vid:v.id,keys:[label],filters}}
  else p.xf={vid:v.id,keys:[label],filters};
  biRenderPage()}
function renderScatter(v,body){const f=v.fields;if(!(f.values||[]).length||!(f.values2||[]).length)return emptyState(body,v,'Adicione valores ao Eixo X e ao Eixo Y'+(f.axis&&f.axis.length?'':' e um campo em Detalhes'));
  const p=curPage();const F=visFilters(v,p);let pts=[];
  if(f.axis&&f.axis[0]){const A=f.axis[0];const vals=distinctVals(TB(A.t).name,A.c,F,A.lvl).slice(0,2000);pts=vals.map(x=>{const cf=[...F,fIn(TB(A.t).name,A.c,[x],A.lvl)];return{name:catLabel(x,A.lvl),x:evalItem(f.values[0],cf),y:evalItem(f.values2[0],cf),s:f.size&&f.size[0]?evalItem(f.size[0],cf):null,raw:x}}).filter(o=>o.x!=null&&o.y!=null)}
  else pts=[{name:'Total',x:evalItem(f.values[0],F),y:evalItem(f.values2[0],F)}];
  const c=chartIn(v,body);if(!c)return;const P=pal();const smax=Math.max(1,...pts.map(o=>o.s||0));const fx=itemFmt(f.values[0]),fy=itemFmt(f.values2[0]);
  c.setOption({animationDuration:300,tooltip:{...tipBase(),trigger:'item',formatter:o=>`<b>${esc(o.data.name)}</b><br>${esc(itemName(f.values[0]))}: ${esc(fmtValue(o.data.value[0],fx))}<br>${esc(itemName(f.values2[0]))}: ${esc(fmtValue(o.data.value[1],fy))}`},grid:{left:8,right:16,top:16,bottom:8,containLabel:true},
    xAxis:{type:'value',scale:true,name:itemName(f.values[0]),nameLocation:'middle',nameGap:24,nameTextStyle:{color:PAL.muted,fontSize:11},...axisStyle(),axisLabel:{...axisStyle().axisLabel,formatter:x=>fmtShort(x,fx)}},yAxis:{type:'value',scale:true,...axisStyle(),axisLabel:{...axisStyle().axisLabel,formatter:x=>fmtShort(x,fy)}},
    series:[{type:'scatter',data:pts.map(o=>({name:o.name,value:[o.x,o.y],raw:o.raw})),symbolSize:d=>{const o=pts.find(q=>q.x===d[0]&&q.y===d[1]);return f.size&&f.size[0]&&o?8+28*Math.sqrt((o.s||0)/smax):10},itemStyle:{color:P[0],opacity:.78,borderColor:PAL.cell},label:{show:!!v.opts.labels,position:'top',color:PAL.muted,fontSize:10,formatter:p=>p.name}}]},true);
  c.off('click');c.on('click',e=>{if(!f.axis||!f.axis[0])return;const A=f.axis[0];const pg=curPage();const key=e.data.name;if(pg.xf&&pg.xf.vid===v.id&&pg.xf.keys[0]===key)pg.xf=null;else pg.xf={vid:v.id,keys:[key],filters:[fIn(TB(A.t).name,A.c,[e.data.raw],A.lvl)]};biRenderPage()})}
function renderGauge(v,body){const f=v.fields;if(!(f.values||[]).length)return emptyState(body,v,'Adicione um valor');const F=visFilters(v);const val=evalItem(f.values[0],F);const mn=f.min&&f.min[0]?evalItem(f.min[0],F):0;const tg=f.target&&f.target[0]?evalItem(f.target[0],F):null;let mx=f.max&&f.max[0]?evalItem(f.max[0],F):null;if(mx==null)mx=Math.max(val||0,tg||0)*1.25||1;const fm=itemFmt(f.values[0]);
  const c=chartIn(v,body);if(!c)return;const P=pal();const ratio=tg?Math.min(1,Math.max(0,(tg-mn)/(mx-mn))):null;
  c.setOption({series:[{type:'gauge',min:mn,max:mx,startAngle:200,endAngle:-20,radius:'100%',center:['50%','68%'],progress:{show:true,width:16,itemStyle:{color:P[0]}},axisLine:{lineStyle:{width:16,color:[[ratio??1,PAL.dark?'#38424A':'#E2E6E9'],[1,PAL.dark?'#38424A':'#E2E6E9']]}},pointer:{show:false},axisTick:{show:false},splitLine:{show:false},axisLabel:{show:false},anchor:{show:false},title:{show:true,offsetCenter:[0,'34%'],color:PAL.muted,fontSize:11},detail:{valueAnimation:true,offsetCenter:[0,'-2%'],fontSize:24,fontWeight:600,color:PAL.text,formatter:x=>fmtShort(x,fm)},data:[{value:val??0,name:tg!=null?'Meta '+fmtShort(tg,itemFmt(f.target[0])):dispName(f.values[0])}],markLine:undefined},
    ...(tg!=null?[{type:'gauge',min:mn,max:mx,startAngle:200,endAngle:-20,radius:'100%',center:['50%','68%'],axisLine:{show:false},axisTick:{show:false},splitLine:{show:false},axisLabel:{show:false},pointer:{show:true,length:'18%',width:4,offsetCenter:[0,'-82%'],itemStyle:{color:PAL.text}},detail:{show:false},title:{show:false},data:[{value:tg}]}]:[])]},true)}
function renderCards(v,body){disposeChart(v.id);const f=v.fields;const its=f.values||[];if(!its.length)return emptyState(body,v,'Adicione um campo');const F=visFilters(v);body.innerHTML='';
  if(v.type==='card'){const it=its[0];const x=evalItem(it,F);const fm=itemFmt(it);const el=h('div',{class:'kcard'},h('span',{class:'kv',style:{color:v.opts.color||null},title:fmtValue(x,fm)},v.opts.full?fmtValue(x,fm):fmtShort(x,fm)),v.title?null:h('span',{class:'kl'},dispName(it)));body.append(el);fitCard(body,el);return}
  if(v.type==='multicard'){const el=h('div',{class:'mcard'});for(const it of its){const x=evalItem(it,F);el.append(h('div',{class:'mr'},h('span',{},dispName(it)),h('b',{},fmtShort(x,itemFmt(it)))))}body.append(el);return}
  // KPI
  const it=its[0];const x=evalItem(it,F);const fm=itemFmt(it);const tg=f.target&&f.target[0]?evalItem(f.target[0],F):null;
  const el=h('div',{class:'kcard'});const dv=tg!=null&&x!=null?(x-tg)/Math.abs(tg||1):null;const good=v.opts.lowerBetter?dv<=0:dv>=0;
  el.append(h('span',{class:'kv',style:{color:dv==null?null:good?'#2F8F55':'#C8402E'}},fmtShort(x,fm)),h('span',{class:'kl'},dispName(it)),tg!=null?h('span',{class:'kd'},`Meta ${fmtShort(tg,itemFmt(f.target[0]))} · ${dv>=0?'+':''}${fmtNumPlain(dv*100,1,1,true)}%`):null);
  body.append(el);fitCard(body,el,f.axis&&f.axis[0]?.62:1);
  if(f.axis&&f.axis[0]&&window.echarts){const A=f.axis[0];const isD=fieldType(A.t,A.c)==='date';const lvl=A.lvl||(isD?'ym':null);const xs=distinctVals(TB(A.t).name,A.c,F,lvl).sort(cmpVals);const ys=xs.map(q=>evalItem(it,[...F,fIn(TB(A.t).name,A.c,[q],lvl)]));const sp=h('div',{style:{position:'absolute',left:'0',right:'0',bottom:'0',height:'38%',opacity:.85}});body.append(sp);el.style.bottom='34%';const ch=echarts.init(sp);CHARTS.set(v.id,ch);ch.setOption({grid:{left:0,right:0,top:4,bottom:0},xAxis:{type:'category',show:false,data:xs.map(q=>catLabel(q,lvl))},yAxis:{type:'value',show:false,scale:true},tooltip:{...tipBase(),trigger:'axis',valueFormatter:q=>fmtValue(q,fm)},series:[{type:'line',data:ys,smooth:.3,symbol:'none',lineStyle:{width:2,color:pal()[0]},areaStyle:{color:pal()[0],opacity:.12}}]})}}
function cfStyleFor(it,val,stats){const cf=it.cf;if(!cf||val==null||typeof val!=='number')return null;const t=stats.max===stats.min?1:(val-stats.min)/(stats.max-stats.min);if(cf==='bar')return{bar:Math.max(0,Math.min(1,(val-Math.min(0,stats.min))/((Math.max(0,stats.max)-Math.min(0,stats.min))||1)))};if(cf==='scale')return{bg:t<.5?lerpColor('#F8D6D0','#FEF0C9',t*2):lerpColor('#FEF0C9','#D5ECDD',(t-.5)*2),fc:'#22282B'};if(cf==='heat')return{bg:lerpColor(PAL.dark?'#1B2023':'#FFFFFF','#F5A06D',t),fc:t>.6?'#fff':null};return null}
function tdCell(it,val,stats){const fm=itemFmt(it);const td=h('td',{class:'n'});const st=cfStyleFor(it,val,stats);if(st&&st.bar!=null)td.append(h('span',{class:'bar',style:{width:`calc(${(st.bar*100).toFixed(1)}% - 8px)`}}));if(st&&st.bg){td.style.background=st.bg;if(st.fc)td.style.color=st.fc}td.append(document.createTextNode(val==null?'':fmtValue(val,fm)));return td}
function renderTable(v,body){disposeChart(v.id);const cols=v.fields.cols||[];if(!cols.length)return emptyState(body,v,'Adicione colunas');const F=visFilters(v);const dims=cols.filter(c=>!c.m&&(!c.agg||c.agg==='none')),meas=cols.filter(c=>c.m||(c.agg&&c.agg!=='none'));
  let rows=[];
  if(dims.length){const T0=TB(dims[0].t);// agrupar pelas dimensões da mesma tabela (ou relacionada)
    const map=new Map();const getters=dims.map(d=>{const T=TB(d.t);if(T===T0){const i=colIdx(T,d.c);return r=>lvlVal(T0.rows[r][i],d.lvl)}const path=relPath(T0.name.toLowerCase(),T.name.toLowerCase());if(!path)return()=>null;return r=>{let curT=T0,cur=r;for(const rel of path){const O=TB(rel.to.t);const j=keyIndex(O,rel.to.c).get(String(curT.rows[cur][colIdx(curT,rel.from.c)]??''));if(j==null)return null;curT=O;cur=j}return lvlVal(curT.rows[cur][colIdx(curT,d.c)],d.lvl)}});
    for(const r of rowsOf(T0.name,F)){const key=getters.map(g=>g(r));const k=key.map(String).join('\u0001');if(!map.has(k))map.set(k,key);if(map.size>5000)break}
    rows=[...map.values()].map(key=>{const cf=[...F,...dims.map((d,i)=>fIn(TB(d.t).name,d.c,[key[i]],d.lvl))];return{key,vals:meas.map(m=>{try{return evalItem(m,cf)}catch(e){return null}})}});
    if(meas.length)rows=rows.filter(r=>r.vals.some(x=>x!=null));
  }else rows=[{key:[],vals:meas.map(m=>evalItem(m,F))}];
  const so=v.opts.tsort;if(so){const ix=so.i;rows.sort((a,b)=>{const x=ix<dims.length?a.key[ix]:a.vals[ix-dims.length],y=ix<dims.length?b.key[ix]:b.vals[ix-dims.length];const k=cmpVals(x??-Infinity,y??-Infinity);return so.desc?-k:k})}else if(dims.length)rows.sort((a,b)=>{for(let i=0;i<dims.length;i++){const k=cmpVals(a.key[i],b.key[i]);if(k)return k}return 0});
  const stats=meas.map((m,j)=>{const xs=rows.map(r=>r.vals[j]).filter(x=>typeof x==='number');return{min:Math.min(...xs),max:Math.max(...xs)}});
  const xf=curPage().xf;const mine=xf&&xf.vid===v.id?new Set(xf.keys):null;
  const tb=h('table');const thr=h('tr');[...dims,...meas].forEach((c,i)=>thr.append(h('th',{class:i>=dims.length?'n':'',onclick:()=>{v.opts.tsort={i,desc:so&&so.i===i?!so.desc:i>=dims.length};biRenderVisualById(v.id)}},dispName(c)+(so&&so.i===i?(so.desc?' ↓':' ↑'):''))));tb.append(h('thead',{},thr));
  const tbd=h('tbody');const lim=Math.min(rows.length,1000);for(let k=0;k<lim;k++){const r=rows[k];const lab=r.key.map(String).join(' · ');const tr=h('tr',{class:mine?(mine.has(lab)?'xsel':'dim'):'',onclick:e=>{if(!dims.length)return;const pg=curPage();if(pg.xf&&pg.xf.vid===v.id&&pg.xf.keys[0]===lab)pg.xf=null;else pg.xf={vid:v.id,keys:[lab],filters:dims.map((d,i)=>fIn(TB(d.t).name,d.c,[r.key[i]],d.lvl))};biRenderPage()}});
    dims.forEach((d,i)=>{const ty=fieldType(d.t,d.c);const x=r.key[i];tr.append(h('td',{class:typeof x==='number'&&!d.lvl&&ty!=='date'?'n':''},d.lvl?catLabel(x,d.lvl):ty==='date'?fmtValue(x,'dd/mm/yyyy'):x==null?'':typeof x==='number'?fmtValue(x,TB(d.t).cols[colIdx(TB(d.t),d.c)].fmt||'#,##0.##'):txt(x)))});
    meas.forEach((m,j)=>tr.append(tdCell(m,r.vals[j],stats[j])));tbd.append(tr)}tb.append(tbd);
  if(dims.length&&meas.length&&v.opts.totals!==false){const tot=meas.map(m=>{try{return evalItem(m,F)}catch(e){return null}});const tr=h('tr');tr.append(h('td',{colspan:dims.length},'Total'));meas.forEach((m,j)=>tr.append(h('td',{class:'n'},tot[j]==null?'':fmtValue(tot[j],itemFmt(m)))));tb.append(h('tfoot',{},tr))}
  body.innerHTML='';const wrap=h('div',{class:'vtable'},tb);if(rows.length>lim)wrap.append(h('div',{class:'small',style:{padding:'6px 8px'}},`Mostrando ${lim} de ${rows.length} linhas`));body.append(wrap)}
function renderMatrix(v,body){disposeChart(v.id);const f=v.fields;const R=(f.rows||[]).filter(x=>TB(x.t));const vals=f.values||[];if(!R.length||!vals.length)return emptyState(body,v,!R.length?'Adicione campos em Linhas':'Adicione valores');
  const F=visFilters(v);const levels=[];for(const it of R){if(fieldType(it.t,it.c)==='date'&&!it.lvl&&it.dateH!==false){for(const l of['year','quarter','month'])levels.push({t:it.t,c:it.c,lvl:l})}else levels.push({t:it.t,c:it.c,lvl:it.lvl})}
  const C=f.colsM&&f.colsM[0]&&TB(f.colsM[0].t)?f.colsM[0]:null;let cvals=C?distinctVals(TB(C.t).name,C.c,F,C.lvl).sort(cmpVals).slice(0,30):[null];
  const exp=v.mexp||(v.mexp={});const allX=v.opts.expandAll;
  const colF=cv=>cv===null||!C?[]:[fIn(TB(C.t).name,C.c,[cv],C.lvl)];
  const allCells=[];
  function build(depth,pf,path){const L=levels[depth];const vs=distinctVals(TB(L.t).name,L.c,[...F,...pf],L.lvl).sort(cmpVals);const out=[];
    for(const x of vs){const fx=[...pf,fIn(TB(L.t).name,L.c,[x],L.lvl)];const key=path+'\u0001'+x;const cells=cvals.map(cv=>vals.map(it=>{try{return evalItem(it,[...F,...fx,...colF(cv)])}catch(e){return null}}));if(cells.every(r=>r.every(q=>q==null)))continue;const tot=C?vals.map(it=>{try{return evalItem(it,[...F,...fx])}catch(e){return null}}):null;
      const node={x,L,depth,key,cells,tot,kids:null};if(depth<levels.length-1&&(allX||exp[key]))node.kids=build(depth+1,fx,key);out.push(node);allCells.push(cells)}return out}
  const tree=build(0,[],'');
  const stats=vals.map((it,j)=>{const xs=allCells.flatMap(c=>c.map(r=>r[j])).filter(q=>typeof q==='number');return{min:Math.min(...xs),max:Math.max(...xs)}});
  const tb=h('table');const hr1=h('tr');hr1.append(h('th',{rowspan:C&&vals.length>1?2:1},levels.map(lvlName).join(' › ')));
  if(C){for(const cv of cvals)hr1.append(h('th',{class:'n',colspan:vals.length},catLabel(cv,C.lvl)));hr1.append(h('th',{class:'n',colspan:vals.length},'Total'))}else vals.forEach(it=>hr1.append(h('th',{class:'n'},dispName(it))));
  const th=h('thead',{},hr1);if(C&&vals.length>1){const hr2=h('tr');for(let k=0;k<=cvals.length;k++)vals.forEach(it=>hr2.append(h('th',{class:'n'},dispName(it))));th.append(hr2)}tb.append(th);
  const tbd=h('tbody');
  const emit=(nodes)=>{for(const n of nodes){const tr=h('tr',{class:n.kids&&n.kids.length?'sub':''});const can=n.depth<levels.length-1;const tg=can?h('button',{class:'tg',onclick:e=>{e.stopPropagation();exp[n.key]=!exp[n.key];if(!exp[n.key])for(const k in exp)if(k.startsWith(n.key+'\u0001'))delete exp[k];biRenderVisualById(v.id)}},n.kids?'−':'+'):h('span',{style:{display:'inline-block',width:'19px'}});
      tr.append(h('td',{style:{paddingLeft:(8+n.depth*16)+'px'}},tg,catLabel(n.x,n.L.lvl)));n.cells.forEach(r=>r.forEach((q,j)=>tr.append(tdCell(vals[j],q,stats[j]))));if(n.tot)n.tot.forEach((q,j)=>tr.append(h('td',{class:'n',style:{fontWeight:600}},q==null?'':fmtValue(q,itemFmt(vals[j])))));tbd.append(tr);if(n.kids)emit(n.kids)}};
  emit(tree);tb.append(tbd);
  const gt=h('tr');gt.append(h('td',{},'Total'));for(const cv of cvals)vals.forEach(it=>{const q=evalItem(it,[...F,...colF(cv)]);gt.append(h('td',{class:'n'},q==null?'':fmtValue(q,itemFmt(it))))});if(C)vals.forEach(it=>{const q=evalItem(it,F);gt.append(h('td',{class:'n'},q==null?'':fmtValue(q,itemFmt(it))))});tb.append(h('tfoot',{},gt));
  body.innerHTML='';body.append(h('div',{class:'vtable'},tb))}
function renderSlicer(v,body){disposeChart(v.id);const it=v.fields.axis&&v.fields.axis[0];if(!it||!TB(it.t))return emptyState(body,v,'Adicione um campo');const p=curPage();const F=visFilters(v,p);const s=v.slicer||(v.slicer={mode:null,sel:[]});const ty=fieldType(it.t,it.c);
  if(!s.mode)s.mode=(ty==='date'||((ty==='num'||ty==='int')&&!it.lvl))?'range':'list';
  body.innerHTML='';const box=h('div',{class:'slc'});
  if(s.mode==='range'){const all=distinctVals(TB(it.t).name,it.c,F.filter(f=>!(f.t===TB(it.t).name&&f.c===it.c)),it.lvl).filter(x=>typeof x==='number').sort((a,b)=>a-b);if(!all.length){box.append(h('div',{class:'small'},'Sem valores'));body.append(box);return}
    const lo=all[0],hi=all[all.length-1];const a=s.min??lo,b=s.max??hi;const isD=ty==='date'&&!it.lvl;const fm=x=>isD?fmtValue(x,'dd/mm/yyyy'):fmtGeneral(x);
    const ia=h('input',{type:isD?'date':'number',class:'inp',value:isD?isoOf(a):a}),ib=h('input',{type:isD?'date':'number',class:'inp',value:isD?isoOf(b):b});
    const ra=h('input',{type:'range',min:lo,max:hi,value:a,step:isD?1:(hi-lo)/200||1}),rb=h('input',{type:'range',min:lo,max:hi,value:b,step:isD?1:(hi-lo)/200||1});
    const apply=debounce(()=>{let x=isD?fromIso(ia.value):+ia.value,y=isD?fromIso(ib.value):+ib.value;if(x>y)[x,y]=[y,x];s.min=x<=lo?null:x;s.max=y>=hi?null:y;biRenderPage(v.id)},250);
    ra.oninput=()=>{ia.value=isD?isoOf(+ra.value):+ra.value;apply()};rb.oninput=()=>{ib.value=isD?isoOf(+rb.value):+rb.value;apply()};ia.onchange=apply;ib.onchange=apply;
    box.append(h('div',{class:'rng'},ia,ib,ra,rb,h('div',{class:'small'},`${fm(lo)} — ${fm(hi)}`)));body.append(box);return}
  const others=F.filter(f=>!(f.t===TB(it.t).name&&f.c===it.c));const vals=distinctVals(TB(it.t).name,it.c,others,it.lvl).sort(cmpVals);const cur=new Set((s.sel||[]).map(x=>x==null?'\u0000':String(x)));
  const toggle=(x,single)=>{const k=x==null?'\u0000':String(x);let sel=(s.sel||[]).slice();const has=cur.has(k);if(single&&!has)sel=[x];else if(has)sel=sel.filter(q=>(q==null?'\u0000':String(q))!==k);else sel.push(x);s.sel=sel;biRenderPage(v.id)};
  if(s.mode==='chips'){const c=h('div',{class:'chipsel'});for(const x of vals)c.append(h('button',{'aria-pressed':cur.has(x==null?'\u0000':String(x))?'true':'false',onclick:e=>toggle(x,!(e.ctrlKey||e.metaKey)&&!s.multi)},catLabel(x,it.lvl)));box.append(c)}
  else if(s.mode==='dropdown'){const sl=h('select',{class:'inp',onchange:e=>{s.sel=e.target.value===''?[]:[vals[+e.target.value]];biRenderPage(v.id)}});sl.append(h('option',{value:''},'Todos'));vals.forEach((x,i)=>sl.append(h('option',{value:i,selected:cur.has(x==null?'\u0000':String(x))||null},catLabel(x,it.lvl))));box.append(sl)}
  else{if(cur.size)box.append(h('label',{style:{color:'var(--accent)'},onclick:()=>{s.sel=[];biRenderPage(v.id)}},'× Limpar seleção'));for(const x of vals.slice(0,500)){const cb=h('input',{type:'checkbox',checked:cur.has(x==null?'\u0000':String(x))||null});const l=h('label',{},cb,catLabel(x,it.lvl));cb.onclick=e=>{e.stopPropagation();toggle(x,false)};box.append(l)}}
  body.append(box)}
const isoOf=s=>{const p=serialParts(s);return`${p.y}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`};
const fromIso=t=>{const m=/(\d{4})-(\d{2})-(\d{2})/.exec(t);return m?dateToSerial(+m[1],+m[2],+m[3]):null};
function mdLite(s){const inl=x=>x.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\*(.+?)\*/g,'<i>$1</i>');return esc(s).split(/\n{2,}/).map(b=>{const out=[];let para=[];const flush=()=>{if(para.length){out.push('<p>'+inl(para.join('<br>'))+'</p>');para=[]}};for(const ln of b.split('\n')){const m=/^(#{1,3}) (.*)$/.exec(ln);if(m){flush();out.push(`<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`)}else para.push(ln)}flush();return out.join('')}).join('')}
function editText(v){const t=h('textarea',{class:'inp',rows:8},v.text||'');dlg('Caixa de texto',h('div',{},t,h('div',{class:'small'},'Use # Título, ## Subtítulo, **negrito**, *itálico*. Linha em branco separa parágrafos.')),[{label:'Cancelar'},{label:'Aplicar',primary:true,act:()=>{v.text=t.value;biRenderPage();biSave()}}])}
/* ---- dados de um visual em forma de tabela (exportar / enviar à planilha) ---- */
function visualData(v){const f=v.fields;
  if(['table','matrix','slicer','text','gauge','scatter'].includes(v.type)||!(f.axis||[]).length){const items=v.type==='table'?f.cols:[...(f.rows||[]),...(f.values||[])];const F=visFilters(v);if(v.type==='table'||v.type==='matrix'){const dims=items.filter(c=>!c.m&&(!c.agg||c.agg==='none')),meas=items.filter(c=>c.m||(c.agg&&c.agg!=='none'));const T0=dims[0]&&TB(dims[0].t);const keys=new Map();if(T0)for(const r of rowsOf(T0.name,F)){const k=dims.map(d=>TB(d.t)===T0?lvlVal(T0.rows[r][colIdx(T0,d.c)],d.lvl):null);keys.set(k.map(String).join('\u0001'),k)}const rows=T0?[...keys.values()].map(k=>[...k.map((x,i)=>dims[i].lvl?catLabel(x,dims[i].lvl):x),...meas.map(m=>evalItem(m,[...F,...dims.map((d,i)=>fIn(TB(d.t).name,d.c,[k[i]],d.lvl))]))]):[meas.map(m=>evalItem(m,F))];return{head:[...dims.map(itemName),...meas.map(dispName)],rows,fmts:[...dims.map(()=>null),...meas.map(itemFmt)]}}
    const vals=f.values||[];return{head:vals.map(dispName),rows:[vals.map(it=>evalItem(it,F))],fmts:vals.map(itemFmt)}}
  const D=computeCat(v);const head=[lvlName(D.L)];const fmts=[null];let rows;
  if(D.leg){head.push(...D.legVals.map(x=>catLabel(x,D.leg.lvl)));fmts.push(...D.legVals.map(()=>itemFmt(D.vals[0])));rows=D.rows.map((o,i)=>[D.labels[i],...o.leg])}
  else{head.push(...D.vals.map(dispName),...D.vals2.map(dispName));fmts.push(...D.vals.map(itemFmt),...D.vals2.map(itemFmt));rows=D.rows.map((o,i)=>[D.labels[i],...o.vals,...o.vals2])}
  return{head,rows,fmts}}

function fitCard(body,el,frac=1){const H=body.clientHeight*frac,W=body.clientWidth;const kv=el.querySelector('.kv');if(!kv||!H)return;const len=Math.max(3,kv.textContent.length);const sz=Math.max(14,Math.min(H*.42,W/(len*.6),64));kv.style.fontSize=sz+'px';const kl=el.querySelector('.kl');if(kl)kl.style.fontSize=Math.max(10.5,Math.min(13,sz*.34))+'px'}
