'use strict';
/* ================= BI avançado: análise por visual, paletas, indicadores e insights ================= */
const ADV_TYPES=['col','stackcol','bar','stackbar','line','area','combo'];
const ADV_SHOW={'':'Valor','pct':'% do total','cum':'Total acumulado','cumpct':'% acumulado (Pareto)','diff':'Diferença vs. anterior','pctdiff':'Variação % vs. anterior'};
const BI_PALETTES={
  gplansis:{n:'GPlanSiS (padrão)',c:null},
  industrial:{n:'Industrial',c:d=>['#EB6A20',d?'#C9CED1':'#2D3336','#3C8DAD','#F6A709',d?'#9AA4AA':'#7D8286','#1F4E5F','#B4532A','#5B6B73','#8E5A2B','#2F8F55']},
  acessivel:{n:'Acessível (daltonismo)',c:d=>['#E69F00','#56B4E9','#009E73','#F0E442','#0072B2','#D55E00','#CC79A7',d?'#BBBBBB':'#000000']},
  contraste:{n:'Alto contraste',c:d=>[d?'#FFFFFF':'#000000','#E4002B','#0057B8','#FFB81C','#00843D','#6F2DA8','#00A3E0','#FF6A13']},
  azul:{n:'Azul sequencial',c:d=>d?['#C6DBEF','#9ECAE1','#6BAED6','#4292C6','#2171B5','#08519C','#DEEBF7','#F7FBFF']:['#08306B','#08519C','#2171B5','#4292C6','#6BAED6','#9ECAE1','#C6DBEF','#DEEBF7']},
  terra:{n:'Terra e água',c:()=>['#8C510A','#35978F','#BF812D','#01665E','#DFC27D','#80CDC1','#543005','#003C30']},
  semaforo:{n:'Semáforo',c:()=>['#2F8F55','#F6A709','#C8402E','#3C8DAD','#7D8286','#8456D0']}};
function advPalette(){const p=BI&&BI.palette&&BI_PALETTES[BI.palette];return p&&p.c?p.c(PAL.dark):null}

/* ---- estatística ---- */
const aNums=a=>a.filter(x=>typeof x==='number'&&isFinite(x));
const aSum=a=>aNums(a).reduce((s,x)=>s+x,0);
const aMean=a=>{const n=aNums(a);return n.length?aSum(n)/n.length:null};
const aMedian=a=>{const n=aNums(a).sort((x,y)=>x-y);if(!n.length)return null;const m=n.length>>1;return n.length%2?n[m]:(n[m-1]+n[m])/2};
const aStdev=a=>{const n=aNums(a);if(n.length<2)return null;const m=aMean(n);return Math.sqrt(n.reduce((s,x)=>s+(x-m)**2,0)/(n.length-1))};
function aReg(ys){const pts=ys.map((y,i)=>[i,y]).filter(p=>typeof p[1]==='number'&&isFinite(p[1]));if(pts.length<3)return null;const n=pts.length;const mx=pts.reduce((s,p)=>s+p[0],0)/n,my=pts.reduce((s,p)=>s+p[1],0)/n;
  let sxy=0,sxx=0,syy=0;for(const [x,y] of pts){sxy+=(x-mx)*(y-my);sxx+=(x-mx)**2;syy+=(y-my)**2}if(!sxx)return null;const b=sxy/sxx,a=my-b*mx;return{a,b,r2:syy?(sxy*sxy)/(sxx*syy):1,at:x=>a+b*x}}
function transformArr(arr,mode){const tot=aSum(arr);let acc=0;
  return arr.map((x,i)=>{const v=typeof x==='number'?x:null;
    if(mode==='pct')return v==null||!tot?null:v/tot;
    if(mode==='cum'){acc+=v||0;return acc}
    if(mode==='cumpct'){acc+=v||0;return tot?acc/tot:null}
    const p=i>0&&typeof arr[i-1]==='number'?arr[i-1]:null;
    if(mode==='diff')return v==null||p==null?null:v-p;
    if(mode==='pctdiff')return v==null||!p?null:(v-p)/Math.abs(p);return v})}

/* ---- dados do visual (antes de montar as séries) ---- */
function advData(v,D){const A=v.opts.adv;if(!A||!A.showAs||!ADV_TYPES.includes(v.type)||!D.rows.length)return D;
  const nv=D.rows[0].vals?D.rows[0].vals.length:0,nl=D.leg&&D.rows[0].leg?D.rows[0].leg.length:0;
  const cols=(k,n)=>Array.from({length:n},(_,i)=>transformArr(D.rows.map(r=>r[k][i]),A.showAs));
  const V=cols('vals',nv),L=nl?cols('leg',nl):null;
  return{...D,rows:D.rows.map((r,j)=>({...r,vals:V.map(c=>c[j]),leg:L?L.map(c=>c[j]):r.leg})),advMode:A.showAs}}

/* ---- opções do gráfico (depois de montar as séries) ---- */
function advOptions(v,D,opt,fmt0){
  const A=v.opts.adv;if(!A||!ADV_TYPES.includes(v.type)||!opt.series.length)return;
  const horiz=v.type==='bar'||v.type==='stackbar';const pct=['pct','cumpct','pctdiff'].includes(A.showAs);const F=pct?'0.0%':fmt0;const fx=x=>x==null?'':pct?fmtValue(x,F):fmtShort(x,F);
  const valAx=horiz?opt.xAxis:(Array.isArray(opt.yAxis)?opt.yAxis[0]:opt.yAxis);const catAx=horiz?opt.yAxis:opt.xAxis;const key=horiz?'xAxis':'yAxis';
  if(pct){valAx.axisLabel={...valAx.axisLabel,formatter:x=>fmtValue(x,'0%')};opt.tooltip.valueFormatter=x=>x==null?'(Em branco)':fmtValue(x,F);for(const s of opt.series)if(s.yAxisIndex!==1&&s.label)s.label.formatter=p=>fx(p.value)}
  if(A.log){valAx.type='log';valAx.logBase=10;delete valAx.scale}
  if(A.min!=null&&A.min!=='')valAx.min=+A.min;if(A.max!=null&&A.max!=='')valAx.max=+A.max;
  const s0=opt.series[0];const ys=s0.data.map(d=>d&&typeof d==='object'?d.value:d);const n=ys.length;
  // cor condicional
  if(A.cond&&A.thr!==''&&A.thr!=null&&!D.leg)for(const s of opt.series){if(s.type!=='bar')continue;s.data=s.data.map(d=>{const o=d&&typeof d==='object'?{...d}:{value:d};const val=o.value;if(typeof val!=='number')return o;o.itemStyle={...(o.itemStyle||{}),color:val>=+A.thr?(A.above||'#2F8F55'):(A.below||'#C8402E')};return o})}
  // linhas de referência
  const ml=[];const med=aMedian(ys);
  const pos=pp=>({label:{position:pp}});if(A.avg)ml.push({type:'average',name:'Média',...pos('insideStartTop')});if(A.median&&med!=null)ml.push({[key]:med,name:'Mediana',...pos('insideMiddleTop')});
  if(A.min_l)ml.push({type:'min',name:'Mínimo',...pos('insideEndBottom')});if(A.max_l)ml.push({type:'max',name:'Máximo',...pos('insideMiddleBottom')});
  if(A.target!==''&&A.target!=null&&isFinite(+A.target))ml.push({[key]:+A.target,name:A.targetLabel||'Meta',lineStyle:{color:'#C8402E',type:'solid',width:1.6},label:{position:'insideEndTop',color:'#C8402E'}});
  if(ml.length)s0.markLine={symbol:'none',silent:true,precision:6,label:{formatter:p=>p.name+': '+fx(p.value),position:'insideEndTop',color:PAL.muted,fontSize:10.5,fontFamily:FF},lineStyle:{type:'dashed',color:PAL.muted,width:1.2},data:ml};
  // anomalias (fora de média ± 2 desvios)
  if(A.anom){const m=aMean(ys),sd=aStdev(ys);if(sd&&aNums(ys).length>=5){const pts=[];ys.forEach((y,i)=>{if(typeof y==='number'&&Math.abs(y-m)>2*sd)pts.push({coord:horiz?[y,i]:[i,y],value:'!'})});
    if(pts.length)s0.markPoint={symbol:'pin',symbolSize:34,itemStyle:{color:'#C8402E'},label:{color:'#fff',fontWeight:700,formatter:'!'},data:pts}}}
  // tendência e previsão (eixo de categorias horizontal)
  const reg=(A.trend||A.fc>0)&&!horiz?aReg(ys):null;
  if(reg){const k=Math.max(0,Math.min(24,+A.fc||0));
    if(k&&catAx&&Array.isArray(catAx.data)){catAx.data=[...catAx.data,...Array.from({length:k},(_,i)=>'Prev. +'+(i+1))];
      opt.series.push({name:'Previsão',type:'line',data:[...Array(n-1).fill(null),ys[n-1],...Array.from({length:k},(_,i)=>reg.at(n+i))],symbol:'circle',symbolSize:6,lineStyle:{type:'dashed',width:2},itemStyle:{color:'#3C8DAD'},label:{show:!!v.opts.labels,position:'top',fontSize:10,color:PAL.muted,formatter:p=>p.dataIndex>=n?fx(p.value):''},z:5})}
    if(A.trend)opt.series.push({name:'Tendência (R² '+fmtNumPlain(reg.r2,2,2,false)+')',type:'line',data:Array.from({length:n+k},(_,i)=>reg.at(i)),symbol:'none',lineStyle:{type:'dotted',width:1.6,color:PAL.muted},itemStyle:{color:PAL.muted},tooltip:{show:false},silent:true,z:4})}
  if(opt.series.length>1&&v.opts.legend!==false)opt.legend.show=true;
  // legenda e zoom
  const lp=A.legendPos||'bottom';
  if(lp==='none')opt.legend.show=false;
  else if(lp==='top'){delete opt.legend.bottom;opt.legend.top=0;if(opt.grid){opt.grid.top=34;opt.grid.bottom=10}}
  else if(lp==='right'){delete opt.legend.bottom;Object.assign(opt.legend,{orient:'vertical',right:0,top:'middle'});if(opt.grid){opt.grid.right=130;opt.grid.bottom=10}}
  else if(opt.grid&&opt.legend.show)opt.grid.bottom=34;
  if(A.zoom&&!horiz){opt.dataZoom=[{type:'inside'},{type:'slider',height:14,bottom:opt.legend.show&&lp==='bottom'?28:4,borderColor:PAL.line,textStyle:{color:PAL.muted}}];if(opt.grid)opt.grid.bottom=(opt.grid.bottom||10)+26}}

/* ---- painel do visual: seção "Análise avançada" ---- */
function advPane(v,fm){if(!ADV_TYPES.includes(v.type))return;const A=v.opts.adv||(v.opts.adv={});const horiz=v.type==='bar'||v.type==='stackbar';
  const upd=()=>{biRenderVisualById(v.id);biSave()};const set=(k,val)=>{A[k]=val;upd()};
  const ck=(label,k,title)=>h('label',{class:'chk',title:title||null},h('input',{type:'checkbox',checked:A[k]||null,onchange:e=>set(k,e.target.checked)}),label);
  const num=(k,ph,attrs={})=>{const i=inp(A[k]??'',{type:'number',placeholder:ph,step:'any',...attrs});i.onchange=()=>set(k,i.value===''?'':+i.value);return i};
  const sw=(k,def,label)=>h('button',{class:'tb',type:'button',onclick:e=>colorMenu(e.currentTarget,c=>set(k,c),'Padrão')},h('span',{style:{width:'14px',height:'14px',borderRadius:'3px',background:A[k]||def,display:'inline-block'}}),label);
  const sec=(t,...k)=>h('div',{class:'advsec'},h('div',{class:'advh'},t),...k);
  const d=h('details',{class:'adv',open:BIUI.advOpen?'':null,ontoggle:e=>{BIUI.advOpen=e.target.open}},h('summary',{},'Análise avançada',Object.keys(A).some(k=>A[k]&&A[k]!=='bottom')?h('span',{class:'advdot',title:'Há opções ativas'}):null),
    sec('Mostrar valores como',sel(Object.entries(ADV_SHOW),A.showAs||'',{onchange:e=>set('showAs',e.target.value)}),A.showAs==='cumpct'?h('div',{class:'small'},'Para a curva de Pareto, classifique por valor ↓ (menu ⋯ do visual).'):null),
    sec('Linhas de referência',h('div',{class:'advg'},ck('Média','avg'),ck('Mediana','median'),ck('Mínimo','min_l'),ck('Máximo','max_l')),
      h('div',{class:'row2'},field('Meta (valor)',num('target','sem meta')),field('Rótulo da meta',(()=>{const i=inp(A.targetLabel||'',{placeholder:'Meta'});i.onchange=()=>set('targetLabel',i.value);return i})()))),
    !horiz?sec('Tendência e previsão',ck('Linha de tendência (regressão linear)','trend'),field('Prever os próximos períodos',num('fc','0',{min:0,max:24,step:1})),h('div',{class:'small'},'A previsão projeta a reta de tendência da primeira série; use com eixo de datas ordenado.')):null,
    sec('Destaques',ck('Marcar anomalias (fora de média ± 2 desvios)','anom'),ck('Cor condicional por limite','cond'),
      A.cond?h('div',{class:'advg'},field('Limite',num('thr','ex.: 0,9')),sw('above','#2F8F55','≥ limite'),sw('below','#C8402E','< limite')):null),
    sec('Eixo de valores',ck('Escala logarítmica','log','Só para valores positivos'),h('div',{class:'row2'},field('Mínimo',num('min','auto')),field('Máximo',num('max','auto')))),
    sec('Legenda e navegação',field('Posição da legenda',sel([['bottom','Embaixo'],['top','Em cima'],['right','À direita'],['none','Oculta']],A.legendPos||'bottom',{onchange:e=>set('legendPos',e.target.value)})),!horiz?ck('Barra de zoom no eixo','zoom'):null),
    h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},h('button',{class:'tb',type:'button',onclick:()=>dlgInsights(v)},icoEl('ai'),'Insights'),h('button',{class:'tb',type:'button',onclick:()=>{v.opts.adv={};biChanged()}},'Limpar análise')));
  fm.append(d)}

/* ---- faixa de opções: aba Avançado ---- */
function advRibbon(){const v=selVisual();
  return[grp('Aparência',rbBig('theme','Paleta de cores',el=>menuAt(el,Object.entries(BI_PALETTES).map(([k,p])=>({label:p.n,check:(BI.palette||'gplansis')===k,act:()=>{BI.palette=k==='gplansis'?undefined:k;for(const c of CHARTS.keys())disposeChart(c);biChanged()}}))),{menu:1})),
    grp('Indicadores',rbBig('plus','Novo indicador',()=>addBookmark()),rbBig('list','Indicadores',el=>bookmarksMenu(el),{menu:1})),
    grp('Filtros',rbBig('eraser','Limpar filtros',()=>clearPageFilters(),{title:'Limpa segmentações, filtros da página e filtro cruzado'})),
    grp('Análise',rbBig('sliders','Opções do visual',()=>{if(!v)return toast('Selecione um visual');BIUI.advOpen=true;setSide('vis')}),rbBig('ai','Insights do visual',()=>v?dlgInsights(v):toast('Selecione um visual no relatório')),rbBig('pulse','Resumo da página',()=>dlgPageSummary()))]}

/* ---- indicadores (estado salvo de filtros da página) ---- */
function captureState(p){return{filters:deep(p.filters||[]),rfilters:deep(BI.rfilters||[]),slicers:Object.fromEntries(p.visuals.filter(x=>x.slicer).map(x=>[x.id,deep(x.slicer)])),drill:Object.fromEntries(p.visuals.filter(x=>x.drill).map(x=>[x.id,deep(x.drill)]))}}
function addBookmark(){if(!canEditBI())return toast('Sem permissão para alterar o BI desta pasta','err');const p=curPage();const n=prompt('Nome do indicador (ex.: Linha 2 · último trimestre)',p.name+' · '+new Date().toLocaleDateString('pt-BR'));if(!n)return;
  (BI.bookmarks||(BI.bookmarks=[])).push({id:uid('bm'),name:n.slice(0,80),page:p.id,at:Date.now(),state:captureState(p)});biChanged();toast('Indicador "'+n+'" salvo')}
function applyBookmark(b){const i=BI.pages.findIndex(p=>p.id===b.page);if(i<0)return toast('A página deste indicador não existe mais','err');BI.page=i;const p=BI.pages[i];const st=b.state;
  p.filters=deep(st.filters);BI.rfilters=deep(st.rfilters);p.xf=null;for(const x of p.visuals){if(x.slicer)x.slicer=st.slicers[x.id]?deep(st.slicers[x.id]):{...x.slicer,sel:[],min:null,max:null};if(x.drill)x.drill=st.drill[x.id]?deep(st.drill[x.id]):{lvl:0,path:[]}}
  for(const c of CHARTS.keys())disposeChart(c);biChanged();toast('Indicador aplicado: '+b.name)}
function bookmarksMenu(el){const L=BI.bookmarks||[];if(!L.length)return menuAt(el,[{label:'Nenhum indicador salvo. Use "Novo indicador".',disabled:true}]);
  menuAt(el,[{h:'Aplicar'},...L.map(b=>({label:b.name+' · '+(BI.pages.find(p=>p.id===b.page)||{name:'?'}).name,act:()=>applyBookmark(b)})),'-',{h:'Excluir'},...L.map(b=>({label:b.name,icon:'trash',disabled:!canEditBI(),act:()=>{if(confirm('Excluir o indicador "'+b.name+'"?')){BI.bookmarks=L.filter(x=>x!==b);biChanged()}}}))])}
function clearPageFilters(){const p=curPage();p.filters=[];p.xf=null;for(const x of p.visuals){if(x.slicer)x.slicer={...x.slicer,sel:[],min:null,max:null};if(x.drill)x.drill={lvl:0,path:[]}}biChanged();toast('Filtros da página limpos')}

/* ---- insights ---- */
function insightsFor(v){const name=v.title||autoTitle(v);
  if(![...ADV_TYPES,'pie','donut','treemap','funnel','waterfall'].includes(v.type)){const d=visualData(v);return{name,lines:d.rows.length?d.head.map((hh,i)=>`${hh}: ${typeof d.rows[0][i]==='number'?fmtValue(d.rows[0][i],d.fmts[i]||'#,##0.##'):txt(d.rows[0][i]??'')}`).slice(0,8):['Sem dados.'],data:d}}
  const D=computeCat(v);const f=v.fields;const fmt=itemFmt(f.values[0]);const F=x=>fmtValue(x,fmt);const labs=D.labels;
  const ys=D.rows.map(r=>D.leg&&r.leg&&r.leg.length?aSum(r.leg):r.vals[0]);const n=aNums(ys).length;const L=[];if(!n)return{name,lines:['Sem valores para analisar.'],data:visualData(v)};
  const tot=aSum(ys),m=aMean(ys),md=aMedian(ys),sd=aStdev(ys);const imax=ys.indexOf(Math.max(...aNums(ys))),imin=ys.indexOf(Math.min(...aNums(ys)));
  const valName=dispName(f.values[0]),catName=lvlName(D.L);
  L.push(`${n} ${n===1?'categoria':'categorias'} em ${catName}; total de ${valName}: ${F(tot)} (média ${F(m)}, mediana ${F(md)}).`);
  L.push(`Maior: ${txt(labs[imax])} com ${F(ys[imax])}${tot>0?` (${fmtValue(ys[imax]/tot,'0.0%')} do total)`:''}. Menor: ${txt(labs[imin])} com ${F(ys[imin])}.`);
  if(tot>0&&n>=4){const s=aNums(ys).sort((a,b)=>b-a);let acc=0,k=0;while(k<s.length&&acc<.8*tot){acc+=s[k];k++}L.push(`Concentração: ${k} de ${n} categorias (${fmtValue(k/n,'0%')}) somam 80% do total${k/n<=.3?' — perfil de Pareto acentuado':''}.`)}
  if(sd&&m)L.push(`Dispersão: coeficiente de variação de ${fmtValue(sd/Math.abs(m),'0%')} (${sd/Math.abs(m)<.15?'valores homogêneos':sd/Math.abs(m)<.5?'variação moderada':'variação alta'}).`);
  const isTime=D.L&&(fieldType(D.L.t,D.L.c)==='date'||D.L.lvl);
  if(isTime&&n>=4){const r=aReg(ys);if(r){const dir=r.b>0?'alta':'queda';L.push(`Tendência de ${dir} de ${F(Math.abs(r.b))} por período (R² ${fmtNumPlain(r.r2,2,2,false)}; ${r.r2>.6?'tendência consistente':r.r2>.3?'tendência fraca':'sem tendência clara'}).`)}
    const a=ys[ys.length-1],b=ys[ys.length-2];if(typeof a==='number'&&typeof b==='number'&&b)L.push(`Último período (${txt(labs[labs.length-1])}): ${F(a)}, ${a>=b?'+':''}${fmtValue((a-b)/Math.abs(b),'0.0%')} sobre o anterior.`)}
  if(sd&&n>=5){const out=ys.map((y,i)=>[y,i]).filter(([y])=>typeof y==='number'&&Math.abs(y-m)>2*sd);if(out.length)L.push(`Anomalias (fora de ±2 desvios): ${out.map(([y,i])=>`${txt(labs[i])} (${F(y)})`).join(', ')}.`)}
  return{name,lines:L,data:visualData(v)}}
function dataBlock(d,max=60){return[d.head.join(' | '),...d.rows.slice(0,max).map(r=>r.map((x,i)=>typeof x==='number'?fmtValue(x,d.fmts[i]||'#,##0.##'):txt(x??'')).join(' | '))].join('\n')+(d.rows.length>max?`\n(... ${d.rows.length-max} linhas omitidas)`:'')}
async function aiNarrative(out,btn,prompt){const sm=await getSample();if(!sm){out.textContent='IA indisponível: o administrador precisa configurar a chave da Anthropic em Configurações › Inteligência artificial.';return}
  btn.disabled=true;out.textContent='Analisando…';try{await sm(prompt,{onText:({text})=>{out.textContent=text}})}catch(e){out.textContent='Não foi possível consultar a IA: '+e.message}finally{btn.disabled=false}}
const AI_RULES='Escreva em português do Brasil, para um gestor industrial, em no máximo 6 tópicos curtos e uma recomendação final. Use somente os números fornecidos; não invente valores nem causas — quando sugerir uma causa, diga que é hipótese a verificar. Sem títulos markdown.';
function dlgInsights(v){const I=insightsFor(v);const ul=h('ul',{class:'insl'},...I.lines.map(l=>h('li',{},l)));const out=h('div',{class:'preview aiout'});
  const btn=h('button',{class:'tb',type:'button',onclick:()=>aiNarrative(out,btn,`${AI_RULES}\n\nVisual: ${I.name} (tipo ${VT[v.type].n}).\nAnálise estatística já calculada:\n- ${I.lines.join('\n- ')}\n\nDados do visual:\n${dataBlock(I.data)}\n\nExplique o que os dados mostram e o que merece atenção.`)},icoEl('ai'),'Narrativa com IA');
  dlg('Insights · '+I.name,h('div',{class:'dstack'},ul,h('div',{style:{display:'flex',gap:'8px',alignItems:'center'}},btn,h('span',{class:'small'},SRV.local?'':'Usa o modelo configurado pelo administrador.')),out),[{label:'Copiar',act:()=>{navigator.clipboard&&navigator.clipboard.writeText([I.name,...I.lines.map(l=>'• '+l),out.textContent].join('\n'));toast('Copiado');return false}},{label:'Fechar',primary:true}],{wide:true})}
function dlgPageSummary(){const p=curPage();const vis=p.visuals.filter(x=>!['text','slicer'].includes(x.type));if(!vis.length)return toast('Esta página não tem visuais para resumir');
  const all=vis.map(x=>{try{return insightsFor(x)}catch(e){return{name:x.title||autoTitle(x),lines:['Não foi possível analisar.'],data:{head:[],rows:[],fmts:[]}}}});
  const box=h('div',{class:'dstack'},...all.map(I=>h('div',{},h('b',{},I.name),h('ul',{class:'insl'},...I.lines.slice(0,3).map(l=>h('li',{},l))))));const out=h('div',{class:'preview aiout'});
  const btn=h('button',{class:'tb',type:'button',onclick:()=>aiNarrative(out,btn,`${AI_RULES}\n\nPágina de relatório "${p.name}" com ${all.length} visuais. Faça um resumo executivo que conecte os visuais.\n\n${all.map(I=>`## ${I.name}\n- ${I.lines.join('\n- ')}\nDados:\n${dataBlock(I.data,25)}`).join('\n\n')}`)},icoEl('ai'),'Resumo executivo com IA');
  dlg('Resumo da página · '+p.name,h('div',{class:'dstack'},box,btn,out),[{label:'Fechar',primary:true}],{wide:true})}
