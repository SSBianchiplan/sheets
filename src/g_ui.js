/* ================= interface: menus, diálogos, ribbon ================= */
function hideMenus(){$$('.menu').forEach(m=>m.remove())}
function menu(items,x,y,opts={}){hideMenus();const m=h('div',{class:'menu',role:'menu'});
  for(const it of items){if(!it)continue;if(it==='-'){m.append(h('div',{class:'sep'}));continue}if(it.h){m.append(h('div',{class:'mh'},it.h));continue}if(it.el){m.append(it.el);continue}
    const b=h('button',{class:'mi',role:'menuitem',disabled:it.disabled||null,onclick:e=>{e.stopPropagation();if(!it.keep)hideMenus();it.act&&it.act(e)}});b.innerHTML=(it.icon?ico(it.icon):'<svg></svg>')+'<span>'+esc(it.label)+'</span>'+(it.kbd?'<kbd>'+esc(it.kbd)+'</kbd>':'')+(it.check?'<span style="margin-left:auto;color:var(--accent)">✓</span>':'');m.append(b)}
  document.body.append(m);const r=m.getBoundingClientRect();const W=innerWidth,H=innerHeight;m.style.left=Math.max(4,Math.min(x,W-r.width-6))+'px';m.style.top=Math.max(4,(y+r.height>H-6?Math.max(4,y-r.height-(opts.up||0)):y))+'px';
  setTimeout(()=>{const f=m.querySelector('.mi:not([disabled])');f&&opts.focus!==false&&f.focus()},0);return m}
function menuAt(el,items){const r=el.getBoundingClientRect();return menu(items,r.left,r.bottom+2,{up:r.height+4})}
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.menu'))hideMenus()},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('.menu')){hideMenus();e.stopPropagation()}},true);

let DLG_CLOSE=null;
function dlg(title,body,buttons=[],{wide=false,onClose}={}){const md=$('#modal');md.innerHTML='';
  const close=()=>{md.classList.remove('open');md.innerHTML='';DLG_CLOSE=null;onClose&&onClose();if(APP.mode==='sheet')focusGrid()};
  const foot=h('footer');for(const b of buttons){foot.append(h('button',{class:'tb'+(b.primary?' primary':''),onclick:()=>{const r=b.act?b.act():undefined;if(r!==false)close()}},b.label))}
  const d=h('div',{class:'dlg'+(wide?' wide':''),role:'dialog','aria-modal':'true','aria-label':title},h('header',{},title,h('button',{class:'x','aria-label':'Fechar',onclick:close},'×')),h('div',{class:'body'},body),buttons.length?foot:null);
  md.append(d);md.classList.add('open');DLG_CLOSE=close;setTimeout(()=>{const f=d.querySelector('input,select,textarea');f&&f.focus()},30);return close}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&DLG_CLOSE&&!$('.menu')){e.preventDefault();DLG_CLOSE()}});
$('#modal')?.addEventListener('pointerdown',e=>{if(e.target.id==='modal')DLG_CLOSE&&DLG_CLOSE()});
const field=(label,el)=>h('div',{class:'fld'},h('label',{},label),el);
const inp=(v='',attrs={})=>h('input',Object.assign({class:'inp',value:v},attrs));
const sel=(opts,v,attrs={})=>{const s=h('select',Object.assign({class:'inp'},attrs));for(const o of opts){const [val,lab]=Array.isArray(o)?o:[o,o];s.append(h('option',{value:val,selected:String(val)===String(v)||null},lab))}return s};

/* ---- paleta de cores ---- */
const SWATCH=['#000000','#2D3336','#5E676C','#7D8286','#A9AFB3','#D3D8DC','#ECEFF1','#FFFFFF','#EB6A20','#F6A709',
'#C8402E','#E2B100','#2F8F55','#118E9C','#2F7DE1','#8456D0','#C93A8E','#7A3510','#6B4700','#1F5F3A',
'#FDE2D5','#FEF0C9','#F8D6D0','#FBF0B8','#D5ECDD','#CDEBEE','#D6E6FA','#E6DCF6','#F5D8E9','#E8EAEC'];
function colorMenu(el,onPick,noneLabel='Sem cor'){const wrap=h('div',{class:'swatches'});SWATCH.forEach(c=>wrap.append(h('button',{class:'sw',style:{background:c},title:c,onclick:()=>{hideMenus();onPick(c)}})));
  const custom=h('input',{type:'color',style:{width:'100%',height:'28px',border:'0',background:'none'},onchange:e=>{hideMenus();onPick(e.target.value)}});
  menuAt(el,[{el:wrap},{label:noneLabel,icon:'x',act:()=>onPick(null)},{el:h('div',{style:{padding:'4px 10px'}},h('div',{class:'small'},'Personalizada'),custom)}])}

/* ---- ribbon da planilha ---- */
const RB={tab:'home'};
let LAST_FC='#C8402E',LAST_BG='#FEF0C9';
function rbBig(icon,label,act,opts={}){const b=h('button',{class:'tool',title:opts.title||label,'aria-pressed':opts.pressed?'true':null,'data-k':opts.k||null,onclick:e=>act(e.currentTarget,e)});b.innerHTML=ico(icon)+'<span>'+esc(label)+(opts.menu?' ▾':'')+'</span>';return b}
function rbSm(icon,title,act,opts={}){const b=h('button',{class:'ibtn'+(opts.wide?' wide':''),title,'aria-label':title,'data-k':opts.k||null,onclick:e=>act(e.currentTarget,e)});b.innerHTML=ico(icon)+(opts.label?'<span>'+esc(opts.label)+'</span>':'')+(opts.menu?ico('caret','caret'):'');if(opts.bar){const bar=h('span',{class:'cbar',style:{background:opts.bar}});b.style.flexDirection='column';b.style.paddingTop='2px';b.append(bar)}return b}
const grp=(label,...kids)=>h('div',{class:'rgrp'},h('div',{class:'rbody'},...kids),h('div',{class:'glbl'},label));
const rcol=(...k)=>h('div',{class:'rcol'},...k);const rrow=(...k)=>h('div',{class:'rrow'},...k);
function buildSheetRibbon(){
  const tabs=[['home','Início'],['insert','Inserir'],['formulas','Fórmulas'],['data','Dados'],['view','Exibir']];
  const tt=$('#rtabsS');tt.innerHTML='';for(const [k,l] of tabs)tt.append(h('button',{class:'rtab',role:'tab','aria-selected':RB.tab===k?'true':'false',onclick:()=>{RB.tab=k;buildSheetRibbon()}},l));
  const T=$('#rtoolsS');T.innerHTML='';
  if(RB.tab==='home'){
    const fsSel=sel([8,9,10,11,12,14,16,18,20,24,28,36],11,{class:'rsel',title:'Tamanho da fonte','data-k':'fs',style:{width:'58px'},onchange:e=>styleSel({fs:+e.target.value})});
    const nfSel=sel(NF_PRESETS.map(([l,c])=>[c,l]),'General',{class:'rsel',title:'Formato de número','data-k':'nf',style:{width:'128px'},onchange:e=>styleSel({nf:e.target.value})});
    T.append(
      grp('Área de transferência',rbBig('paste','Colar',el=>menuAt(el,[{label:'Colar',icon:'paste',kbd:'Ctrl+V',act:()=>pasteCmd('all')},{label:'Colar valores',act:()=>doPaste('values')},{label:'Colar fórmulas',act:()=>doPaste('formulas')},{label:'Colar formatação',act:()=>doPaste('formats')},{label:'Colar transposto',act:()=>doPaste('transpose')}]),{menu:1}),rcol(rbSm('cut','Recortar (Ctrl+X)',()=>{doCopy(true);toast('Recortado: selecione o destino e cole')}),rbSm('copy','Copiar (Ctrl+C)',()=>copyCmd()),rbSm('brush','Pincel de formatação',()=>startPainter(),{k:'painter'}))),
      grp('Fonte',rcol(rrow(fsSel),rrow(rbSm('bold','Negrito (Ctrl+B)',()=>toggleStyle('b'),{k:'b'}),rbSm('italic','Itálico (Ctrl+I)',()=>toggleStyle('i'),{k:'i'}),rbSm('under','Sublinhado (Ctrl+U)',()=>toggleStyle('u'),{k:'u'}),rbSm('strike','Tachado',()=>toggleStyle('s'),{k:'s'}))),
        rcol(rrow(rbSm('tcolor','Cor da fonte',()=>styleSel({fc:LAST_FC}),{bar:LAST_FC}),rbSm('caret','Escolher cor da fonte',el=>colorMenu(el,c=>{if(c)LAST_FC=c;styleSel({fc:c});buildSheetRibbon()},'Automática'))),rrow(rbSm('fill','Cor de preenchimento',()=>styleSel({bg:LAST_BG}),{bar:LAST_BG}),rbSm('caret','Escolher preenchimento',el=>colorMenu(el,c=>{if(c)LAST_BG=c;styleSel({bg:c});buildSheetRibbon()})))),
        rcol(rbSm('border','Bordas',el=>menuAt(el,[{label:'Todas as bordas',act:()=>bordersSel('all')},{label:'Bordas externas',act:()=>bordersSel('outer')},{label:'Borda externa espessa',act:()=>bordersSel('thick')},'-',{label:'Inferior',act:()=>bordersSel('bottom')},{label:'Inferior dupla espessura',act:()=>bordersSel('dbottom')},{label:'Superior',act:()=>bordersSel('top')},{label:'Esquerda',act:()=>bordersSel('left')},{label:'Direita',act:()=>bordersSel('right')},'-',{label:'Sem bordas',act:()=>bordersSel('none')}]),{menu:1}))),
      grp('Alinhamento',rcol(rrow(rbSm('atop','Alinhar em cima',()=>styleSel({va:'top'}),{k:'va-top'}),rbSm('amid','Alinhar no meio',()=>styleSel({va:'middle'}),{k:'va-middle'}),rbSm('abot','Alinhar embaixo',()=>styleSel({va:null}),{k:'va-bottom'}),rbSm('wrap','Quebrar texto automaticamente',()=>{const st=styleOf(curSheet(),UI.act.r,UI.act.c)||{};styleSel({wrap:st.wrap?null:true})},{k:'wrap'})),
        rrow(rbSm('aleft','Alinhar à esquerda',()=>styleSel({ha:'left'}),{k:'ha-left'}),rbSm('acenter','Centralizar',()=>styleSel({ha:'center'}),{k:'ha-center'}),rbSm('aright','Alinhar à direita',()=>styleSel({ha:'right'}),{k:'ha-right'}),rbSm('merge','Mesclar e centralizar',el=>menuAt(el,[{label:'Mesclar e centralizar',act:()=>mergeSel('center')},{label:'Mesclar através',act:()=>mergeSel('across')},{label:'Mesclar células',act:()=>mergeSel('plain')},{label:'Desfazer mesclagem',act:()=>mergeSel('unmerge')}]),{menu:1})))),
      grp('Número',rcol(rrow(nfSel),rrow(rbSm('money','Moeda (R$)',()=>styleSel({nf:'"R$" #,##0.00'})),rbSm('pct','Porcentagem',()=>styleSel({nf:'0%'})),rbSm('thou','Separador de milhares',()=>styleSel({nf:'#,##0.00'})),rbSm('decup','Aumentar casas decimais',()=>bumpDecimals(1)),rbSm('decdn','Diminuir casas decimais',()=>bumpDecimals(-1))))),
      grp('Estilos',rbBig('cf','Formatação condicional',el=>cfMenu(el),{menu:1}),rbBig('table','Formatar como tabela',el=>menuAt(el,Object.keys(TSTYLE).map(k=>({label:'Estilo '+k,act:()=>makeTable(k)})))),rbBig('format','Formatar células',()=>dlgFormat())),
      grp('Células',rcol(rbSm('insrow','Inserir',el=>menuAt(el,[{label:'Inserir linhas acima',act:()=>insertRowsCols('r')},{label:'Inserir colunas à esquerda',act:()=>insertRowsCols('c')},{label:'Inserir planilha',act:()=>addSheet()}]),{label:'Inserir',wide:1,menu:1}),rbSm('trash','Excluir',el=>menuAt(el,[{label:'Excluir linhas',act:()=>deleteRowsCols('r')},{label:'Excluir colunas',act:()=>deleteRowsCols('c')},{label:'Excluir planilha',act:()=>delSheet(WB.active)}]),{label:'Excluir',wide:1,menu:1}),rbSm('format','Formatar',el=>menuAt(el,[{label:'Altura da linha…',act:()=>dlgSize('r')},{label:'Largura da coluna…',act:()=>dlgSize('c')},{label:'Autoajustar largura',act:()=>autoFitCols(range(UI.sel.c1,Math.min(UI.sel.c2,UI.sel.c1+200)))},'-',{label:'Ocultar linhas',act:()=>hideRowsCols('r')},{label:'Reexibir linhas',act:()=>hideRowsCols('r',true)},{label:'Ocultar colunas',act:()=>hideRowsCols('c')},{label:'Reexibir colunas',act:()=>hideRowsCols('c',true)},'-',{label:'Renomear planilha',act:()=>renameSheet(WB.active)},{label:'Cor da guia',act:()=>{colorMenu($('#tabsS .stab[aria-selected="true"]')||el,c=>{curSheet().tabColor=c;renderTabs();save()})}}]),{label:'Formatar',wide:1,menu:1}))),
      grp('Edição',rcol(rbSm('sigma','AutoSoma',el=>menuAt(el,[['SUM','Soma'],['AVERAGE','Média'],['COUNT','Contar números'],['MAX','Máx'],['MIN','Mín']].map(([f,l])=>({label:l,act:()=>autoSum(f)}))),{label:'AutoSoma',wide:1,menu:1}),rbSm('fillDown','Preencher',el=>menuAt(el,[{label:'Para baixo',kbd:'Ctrl+D',act:()=>fillDir('down')},{label:'À direita',kbd:'Ctrl+R',act:()=>fillDir('right')},{label:'Série…',act:()=>dlgSeries()}]),{label:'Preencher',wide:1,menu:1}),rbSm('eraser','Limpar',el=>menuAt(el,[{label:'Limpar tudo',act:()=>clearSel('all')},{label:'Limpar formatos',act:()=>clearSel('formats')},{label:'Limpar conteúdo',kbd:'Del',act:()=>clearSel('contents')},{label:'Limpar notas',act:()=>clearSel('notes')}]),{label:'Limpar',wide:1,menu:1})),
        rcol(rbSm('sort','Classificar e filtrar',el=>menuAt(el,[{label:'Classificar de A a Z',icon:'sortaz',act:()=>quickSort(false)},{label:'Classificar de Z a A',icon:'sortza',act:()=>quickSort(true)},{label:'Classificação personalizada…',act:()=>dlgSort()},'-',{label:curSheet().filter?'Remover filtro':'Filtro',icon:'filter',kbd:'Ctrl+Shift+L',act:()=>toggleFilter()},{label:'Limpar critérios',act:()=>{const sh=curSheet();if(sh.filter){sh.filter.crit={};applyFilterHidden(sh);geoDirty();onChange()}}}]),{label:'Classificar',wide:1,menu:1}),rbSm('search','Localizar e substituir (Ctrl+F)',()=>dlgFind(),{label:'Localizar',wide:1}))),
    );
  }else if(RB.tab==='insert'){
    T.append(grp('Tabelas',rbBig('table','Tabela',()=>makeTable('laranja')),rbBig('pivot','Tabela dinâmica',()=>dlgPivot())),
      grp('Gráficos e BI',rbBig('chart','Gráfico no BI',()=>quickChart()),rbBig('bi','Analisar no BI',()=>sendToBI())),
      grp('Funções',rbBig('fx','Inserir função',()=>dlgInsertFn()),rbBig('sigma','AutoSoma',()=>autoSum())),
      grp('Anotações',rbBig('note','Nota',()=>dlgNote()),rbBig('link','Link',()=>dlgLink())),
      grp('Planilha',rbBig('plus','Nova planilha',()=>addSheet())));
  }else if(RB.tab==='formulas'){
    const cats=[...new Set(FN_LIST().map(f=>f.cat))];
    T.append(grp('Biblioteca de funções',rbBig('fx','Inserir função',()=>dlgInsertFn()),rbBig('sigma','AutoSoma',el=>menuAt(el,[['SUM','Soma'],['AVERAGE','Média'],['COUNT','Contar números'],['MAX','Máx'],['MIN','Mín']].map(([f,l])=>({label:l,act:()=>autoSum(f)})))),
        ...cats.map(c=>rbBig({Matemática:'calc',Lógica:'check',Pesquisa:'search',Texto:'text',['Data e hora']:'calc',Estatística:'chart',Financeira:'money',Informação:'info',['Matriz dinâmica']:'grid'}[c]||'fx',c,el=>menuAt(el,FN_LIST().filter(f=>f.cat===c).sort((a,b)=>(EN2PT[a.en]||a.en).localeCompare(EN2PT[b.en]||b.en)).map(f=>({label:(EN2PT[f.en]||f.en),act:()=>insertFnText(EN2PT[f.en]||f.en)}))),{menu:1}))),
      grp('Nomes definidos',rbBig('names','Gerenciador de nomes',()=>dlgNames()),rbBig('plus','Definir nome',()=>dlgDefineName())),
      grp('Auditoria',rbBig('trace','Rastrear precedentes',()=>traceRefs()),rbBig('trace','Rastrear dependentes',()=>traceDeps()),rbBig('eye','Mostrar fórmulas',()=>toggleShowF(),{k:'showF',pressed:UI.showF})),
      grp('Cálculo',rbBig('refresh','Calcular agora',()=>{recalc();draw();toast('Recalculado')})));
  }else if(RB.tab==='data'){
    T.append(grp('Obter dados',rbBig('import','Importar arquivo',()=>$('#fileIn').click()),rbBig('bi','Analisar no BI',()=>sendToBI())),
      grp('Classificar e filtrar',rbBig('sortaz','A → Z',()=>quickSort(false)),rbBig('sortza','Z → A',()=>quickSort(true)),rbBig('sort','Classificar',()=>dlgSort()),rbBig('filter','Filtro',()=>toggleFilter(),{pressed:!!curSheet().filter,k:'filter'})),
      grp('Ferramentas de dados',rbBig('textcol','Texto para colunas',()=>dlgTextCols()),rbBig('dedupe','Remover duplicatas',()=>dlgDedupe()),rbBig('valid','Validação de dados',()=>dlgValidation())),
      grp('Estrutura',rbBig('table','Formatar como tabela',()=>makeTable('laranja')),rbBig('pivot','Tabela dinâmica',()=>dlgPivot())));
  }else if(RB.tab==='view'){
    T.append(grp('Mostrar',rbBig('grid','Linhas de grade',()=>{curSheet().showGrid=!curSheet().showGrid;draw();buildSheetRibbon()},{pressed:curSheet().showGrid}),rbBig('eye','Fórmulas',()=>toggleShowF(),{pressed:UI.showF,k:'showF'})),
      grp('Zoom',rbBig('zoomout','Diminuir',()=>setZoom(UI.zoom-.1)),rbBig('zoomin','Aumentar',()=>setZoom(UI.zoom+.1)),rbBig('search','100%',()=>setZoom(1))),
      grp('Janela',rbBig('freeze','Congelar painéis',el=>menuAt(el,[{label:'Congelar painéis na seleção',act:()=>setFreeze(UI.act.r,UI.act.c)},{label:'Congelar linha superior',act:()=>setFreeze(1,0)},{label:'Congelar primeira coluna',act:()=>setFreeze(0,1)},{label:'Descongelar',act:()=>setFreeze(0,0)}]),{menu:1}),rbBig('theme','Tema',()=>toggleTheme())));
  }
  updateRibbonState();
}
function updateRibbonState(){if(APP.mode!=='sheet')return;const st=styleOf(curSheet(),UI.act.r,UI.act.c)||{};
  $$('#rtoolsS [data-k]').forEach(b=>{const k=b.dataset.k;let on=null;if(['b','i','u','s','wrap'].includes(k))on=!!st[k];else if(k.startsWith('ha-'))on=st.ha===k.slice(3);else if(k==='va-top'||k==='va-middle')on=st.va===k.slice(3);else if(k==='va-bottom')on=!st.va;else if(k==='painter')on=!!UI.painter;else if(k==='showF')on=UI.showF;else if(k==='filter')on=!!curSheet().filter;if(on!=null)b.setAttribute('aria-pressed',on?'true':'false')});
  const fs=$('#rtoolsS [data-k="fs"]');if(fs)fs.value=st.fs||11;const nf=$('#rtoolsS [data-k="nf"]');if(nf){const has=[...nf.options].some(o=>o.value===(st.nf||'General'));if(!has&&st.nf){nf.append(h('option',{value:st.nf},'Personalizado'))}nf.value=st.nf||'General'}}
function setZoom(z){UI.zoom=clamp(Math.round(z*10)/10,.5,2);geoDirty();$('#zoomLbl').textContent=Math.round(UI.zoom*100)+'%';draw()}
function setFreeze(r,c){const sh=curSheet();beginTx('Congelar painéis');snapTx();sh.freeze={r,c};commitTx();scr().scrollTop=0;scr().scrollLeft=0;draw()}
function toggleTheme(){const d=document.documentElement;const cur=d.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');d.dataset.theme=cur==='dark'?'light':'dark';LS.set('gps-theme',d.dataset.theme);readPal();draw();if(APP.mode==='bi')biRenderAll()}
function copyCmd(){const t=doCopy(false);try{navigator.clipboard&&navigator.clipboard.writeText(t).catch(()=>{})}catch(e){}toast('Copiado')}
async function pasteCmd(mode){let t=null;try{if(navigator.clipboard&&navigator.clipboard.readText)t=await navigator.clipboard.readText()}catch(e){}if(t!=null&&t!==''&&(!UI.clip||t.replace(/\r/g,'')!==UI.clip.tsv))doPaste(mode,t);else doPaste(mode)}
function insertFnText(name){if(!UI.ed)startEdit('=','enter');const ed=$('#cellEd');const p=ed.selectionStart;ed.value=ed.value.slice(0,p)+name+'('+ed.value.slice(p);ed.setSelectionRange(p+name.length+1,p+name.length+1);edInput();ed.focus()}

/* ---- menu de contexto da grade ---- */
function cellMenu(e){const s=UI.sel;const sh=curSheet();const full=s.r1===0&&s.r2>=G.nR-1,fullR=s.c1===0&&s.c2>=G.nC-1;
  const items=[{label:'Recortar',icon:'cut',kbd:'Ctrl+X',act:()=>doCopy(true)},{label:'Copiar',icon:'copy',kbd:'Ctrl+C',act:()=>copyCmd()},{label:'Colar',icon:'paste',kbd:'Ctrl+V',act:()=>pasteCmd('all')},{label:'Colar especial',icon:'paste',act:()=>menu([{label:'Valores',act:()=>doPaste('values')},{label:'Fórmulas',act:()=>doPaste('formulas')},{label:'Formatação',act:()=>doPaste('formats')},{label:'Transpor',act:()=>doPaste('transpose')}],e.clientX+10,e.clientY+60)},'-'];
  if(full)items.push({label:'Inserir colunas',icon:'insrow',act:()=>insertRowsCols('c')},{label:'Excluir colunas',icon:'trash',act:()=>deleteRowsCols('c')},{label:'Largura da coluna…',act:()=>dlgSize('c')},{label:'Ocultar',act:()=>hideRowsCols('c')},{label:'Reexibir',act:()=>hideRowsCols('c',true)});
  else if(fullR)items.push({label:'Inserir linhas',icon:'insrow',act:()=>insertRowsCols('r')},{label:'Excluir linhas',icon:'trash',act:()=>deleteRowsCols('r')},{label:'Altura da linha…',act:()=>dlgSize('r')},{label:'Ocultar',act:()=>hideRowsCols('r')},{label:'Reexibir',act:()=>hideRowsCols('r',true)});
  else items.push({label:'Inserir linhas acima',icon:'insrow',act:()=>insertRowsCols('r')},{label:'Inserir colunas à esquerda',icon:'insrow',act:()=>insertRowsCols('c')},{label:'Excluir linhas',icon:'trash',act:()=>deleteRowsCols('r')},{label:'Excluir colunas',icon:'trash',act:()=>deleteRowsCols('c')});
  items.push('-',{label:'Limpar conteúdo',icon:'eraser',act:()=>clearSel('contents')},{label:'Classificar A → Z',icon:'sortaz',act:()=>quickSort(false)},{label:'Classificar Z → A',icon:'sortza',act:()=>quickSort(true)});
  if(sh.filter&&inRange(sh.filter,UI.act.r,UI.act.c))items.push({label:'Filtrar pelo valor da célula',icon:'filter',act:()=>setFilterCrit(UI.act.c,{vals:[displayOf(sh,UI.act.r,UI.act.c)]})});
  items.push('-',{label:cellAt(sh,UI.act.r,UI.act.c)?.note?'Editar nota':'Inserir nota',icon:'note',act:()=>dlgNote()},{label:'Formatar células…',icon:'format',kbd:'Ctrl+1',act:()=>dlgFormat()},{label:'Definir nome…',icon:'names',act:()=>dlgDefineName()},'-',{label:'Analisar seleção no BI',icon:'bi',act:()=>sendToBI()});
  menu(items,e.clientX,e.clientY)}

/* ---- filtros ---- */
function openFilterMenu(c,ev){const sh=curSheet();const f=sh.filter;const vals=new Map();
  for(let r=f.r1+1;r<=f.r2;r++){// considerar outros filtros
    let pass=true;for(const k in f.crit){if(+k===c)continue;if(!critPass(f.crit[k],getVal(sh,r,+k),sh,r,+k)){pass=false;break}}if(!pass)continue;const t=displayOf(sh,r,c);const v=getVal(sh,r,c);if(!vals.has(t))vals.set(t,v)}
  const list=[...vals.entries()].sort((a,b)=>cmpVals(a[1],b[1]));const cur=f.crit[c]&&f.crit[c].vals?new Set(f.crit[c].vals):null;
  const box=h('div',{style:{padding:'6px',width:'260px'}});const q=inp('',{placeholder:'Pesquisar',style:{marginBottom:'6px'}});const L=h('div',{class:'list',style:{maxHeight:'220px'}});
  const checks=new Map();const all=h('input',{type:'checkbox',checked:!cur||null});
  const render=()=>{L.innerHTML='';const qq=q.value.toLowerCase();L.append(h('label',{class:'li'},all,h('span',{},'(Selecionar tudo)')));for(const [t] of list){if(qq&&!t.toLowerCase().includes(qq))continue;let cb=checks.get(t);if(!cb){cb=h('input',{type:'checkbox',checked:(!cur||cur.has(t))||null});checks.set(t,cb)}L.append(h('label',{class:'li'},cb,h('span',{},t===''?'(Vazias)':t)))}};
  all.onchange=()=>{for(const cb of checks.values())cb.checked=all.checked};q.oninput=render;render();
  const apply=()=>{const qq=q.value.toLowerCase();const chosen=[...checks.entries()].filter(([t,cb])=>cb.checked&&(!qq||t.toLowerCase().includes(qq))).map(([t])=>t);hideMenus();if(chosen.length===list.length&&!qq)setFilterCrit(c,null);else setFilterCrit(c,{vals:chosen})};
  const condBtn=(label,op,needA=true,needB=false)=>({label,act:()=>{const a=needA?prompt(label+(needB?' (valor inicial)':'')):null;if(needA&&a==null)return;const b=needB?prompt('Valor final'):null;setFilterCrit(c,{cond:{op,a,b}})}});
  box.append(q,L,h('div',{style:{display:'flex',gap:'6px',justifyContent:'flex-end',marginTop:'8px'}},h('button',{class:'tb',onclick:()=>{hideMenus();setFilterCrit(c,null)}},'Limpar'),h('button',{class:'tb primary',onclick:apply},'Aplicar')));
  menu([{label:'Classificar A → Z',icon:'sortaz',act:()=>{UI.act={r:f.r1+1,c};sortRange(f,[{c,desc:false}],true)}},{label:'Classificar Z → A',icon:'sortza',act:()=>{sortRange(f,[{c,desc:true}],true)}},'-',
    {label:'Filtros de número / texto ▸',icon:'filter',keep:true,act:e=>menu([condBtn('É igual a…','eq'),condBtn('É diferente de…','ne'),condBtn('Maior que…','gt'),condBtn('Maior ou igual a…','ge'),condBtn('Menor que…','lt'),condBtn('Menor ou igual a…','le'),condBtn('Entre…','between',true,true),'-',condBtn('Contém…','contains'),condBtn('Não contém…','ncontains'),condBtn('Começa com…','starts'),condBtn('Termina com…','ends'),'-',condBtn('10 primeiros…','top'),{label:'Acima da média',act:()=>setFilterCrit(c,{cond:{op:'above'}})},{label:'Vazias',act:()=>setFilterCrit(c,{cond:{op:'empty'}})},{label:'Não vazias',act:()=>setFilterCrit(c,{cond:{op:'nempty'}})}],e.clientX+120,e.clientY-20)},'-',{el:box}],ev.clientX,ev.clientY+8,{focus:false});setTimeout(()=>q.focus(),20)}
function openDvList(ev){const sh=curSheet();const d=dvFor(sh,UI.act.r,UI.act.c);const items=dvList(sh,d).map(v=>({label:v,act:()=>{beginTx('Escolher da lista');setRaw(sh,UI.act.r,UI.act.c,v);commitTx()}}));const a=cellRect(UI.act.r,UI.act.c);const hr=$('#gridHost').getBoundingClientRect();menu(items.length?items:[{label:'(lista vazia)',disabled:true}],hr.left+a.x,hr.top+a.y+a.h)}

/* ---- abas de planilha ---- */
function renderTabs(){const T=$('#tabsS');T.innerHTML='';WB.sheets.forEach((s,i)=>{const b=h('button',{class:'stab',role:'tab','aria-selected':i===WB.active?'true':'false',style:s.tabColor?{boxShadow:`inset 0 -3px 0 ${s.tabColor}`}:null,onclick:()=>switchSheet(i),ondblclick:()=>renameSheet(i),oncontextmenu:e=>{e.preventDefault();sheetMenu(i,e)}},s.name);T.append(b)});}
function sheetMenu(i,e){switchSheet(i);menu([{label:'Renomear',icon:'edit',act:()=>renameSheet(i)},{label:'Duplicar',icon:'copy',act:()=>dupSheet(i)},{label:'Mover para a esquerda',disabled:i===0,act:()=>moveSheet(i,-1)},{label:'Mover para a direita',disabled:i===WB.sheets.length-1,act:()=>moveSheet(i,1)},{label:'Cor da guia',act:()=>colorMenu($$('#tabsS .stab')[i],c=>{WB.sheets[i].tabColor=c;renderTabs();save()})},'-',{label:'Excluir',icon:'trash',disabled:WB.sheets.length<2,act:()=>delSheet(i)}],e.clientX,e.clientY)}
function switchSheet(i){if(UI.ed)commitEdit();WB.active=i;const sh=curSheet();UI.sel={r1:0,c1:0,r2:0,c2:0};UI.act={r:0,c:0};UI.anc={r:0,c:0};UI.trace=null;geoDirty();scr().scrollTop=0;scr().scrollLeft=0;renderTabs();buildSheetRibbon();onSelChange()}
function uniqueSheetName(base){let n=base,i=1;while(sheetByName(n))n=base+' ('+(++i)+')';return n}
function addSheet(name){beginTx('Nova planilha');snapTx();let i=WB.sheets.length+1;while(sheetByName('Planilha'+i))i++;WB.sheets.push(newSheet(name||'Planilha'+i));commitTx();switchSheet(WB.sheets.length-1);return curSheet()}
function renameSheet(i){const s=WB.sheets[i];const n=prompt('Nome da planilha',s.name);if(!n||n===s.name)return;if(/[\\\/\?\*\[\]:]/.test(n)||n.length>31)return toast('Nome inválido (evite \\ / ? * [ ] : e mais de 31 caracteres)','err');if(sheetByName(n))return toast('Já existe uma planilha com esse nome','err');
  beginTx('Renomear planilha');snapTx();const old=s.name;
  for(const s2 of WB.sheets)for(const k of s2.fcells){const cell=s2.cells.get(k);const T=tokenize(cell.raw.slice(1));let out='=',ch=false;for(const t of T){if(t.t==='ref'&&t.sh&&t.sh.toLowerCase()===old.toLowerCase()){out+=quoteSheet(n)+'!'+t.text.slice(sheetPrefix(t).length);ch=true}else out+=t.text}if(ch){applyRaw(s2,KR(k),KC(k),out,{keepFmt:true})}}
  for(const nm in WB.names){const d=WB.names[nm];if(d.ref&&d.ref.replace(/'/g,'').toLowerCase().startsWith(old.toLowerCase()+'!'))d.ref=quoteSheet(n)+'!'+d.ref.split('!').pop()}
  s.name=n;commitTx();renderTabs();biSheetRenamed&&biSheetRenamed(old,n)}
function dupSheet(i){beginTx('Duplicar planilha');snapTx();const o=serSheet(WB.sheets[i]);o.id=uid('sh');o.name=uniqueSheetName(o.name);o.tables=(o.tables||[]).map(t=>({...t,name:t.name+'_2'}));WB.sheets.splice(i+1,0,deSheet(o));commitTx();switchSheet(i+1)}
function moveSheet(i,d){beginTx('Mover planilha');snapTx();const [s]=WB.sheets.splice(i,1);WB.sheets.splice(i+d,0,s);commitTx();switchSheet(i+d)}
function delSheet(i){if(WB.sheets.length<2)return toast('A pasta precisa de pelo menos uma planilha');if(!confirm(`Excluir a planilha "${WB.sheets[i].name}"? Fórmulas que apontam para ela passam a mostrar #REF!.`))return;beginTx('Excluir planilha');snapTx();WB.sheets.splice(i,1);commitTx();switchSheet(Math.max(0,i-1))}
