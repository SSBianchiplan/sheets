/* ================= inicialização ================= */
function setMode(m){if(UI.ed)commitEdit();APP.mode=m;$('#wsSheet').hidden=m!=='sheet';$('#wsBI').hidden=m!=='bi';$('#wsCfg').hidden=m!=='cfg';$$('#modes button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===m?'true':'false'));
  if(m==='bi'){BI_DIRTY=true;biRenderAll()}else if(m==='cfg'){for(const c of CHARTS.keys())disposeChart(c);renderCfg()}else{for(const c of CHARTS.keys())disposeChart(c);buildSheetRibbon();geoDirty();requestAnimationFrame(()=>{drawNow();focusGrid()})}}
function boot(){
  const th=SRV.local?LS.get('gps-theme',null):null;if(th)document.documentElement.dataset.theme=th;
  G.cv=$('#gcv');G.ctx=G.cv.getContext('2d');readPal();
  const sc=$('#gscroll');sc.addEventListener('scroll',()=>{draw();if(UI.ed)positionEditor()},{passive:true});
  sc.addEventListener('mousedown',e=>{if(e.offsetX<=sc.clientWidth&&e.offsetY<=sc.clientHeight)e.preventDefault()});sc.addEventListener('pointerdown',e=>{if(e.offsetX>sc.clientWidth||e.offsetY>sc.clientHeight)return;gridDown(e)});sc.addEventListener('pointermove',gridMove);sc.addEventListener('pointerup',gridUp);sc.addEventListener('pointercancel',()=>{DRAG=null});
  sc.addEventListener('dblclick',gridDbl);sc.addEventListener('contextmenu',e=>{e.preventDefault();cellMenu(e)});
  sc.addEventListener('wheel',e=>{if(e.ctrlKey){e.preventDefault();setZoom(UI.zoom+(e.deltaY<0?.1:-.1))}},{passive:false});
  const kb=$('#kbd');kb.addEventListener('keydown',gridKey);
  const ed=$('#cellEd');ed.addEventListener('input',()=>edInput());ed.addEventListener('keydown',edKey);ed.addEventListener('click',()=>{UI.point=null;updateAC()});ed.addEventListener('keyup',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))updateAC()});
  const fx=$('#fx');fx.addEventListener('focus',()=>{UI.fxActive=true;if(!UI.ed){const sh=curSheet();if(sh.spill.has(K(UI.act.r,UI.act.c))&&!rawOf(sh,UI.act.r,UI.act.c))return;startEditFx()}});fx.addEventListener('blur',()=>{setTimeout(()=>{UI.fxActive=false},150)});fx.addEventListener('input',()=>edInput('fx'));fx.addEventListener('keydown',edKey);
  const nb=$('#namebox');nb.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();gotoRef(nb.value)}if(e.key==='Escape'){updateNameBox();focusGrid()}});nb.addEventListener('focus',()=>nb.select());
  $('#fxbtn').onclick=()=>dlgInsertFn();
  document.addEventListener('copy',e=>{if(APP.mode!=='sheet'||document.activeElement!==kb)return;e.preventDefault();e.clipboardData.setData('text/plain',doCopy(false));toast('Copiado')});
  document.addEventListener('cut',e=>{if(APP.mode!=='sheet'||document.activeElement!==kb)return;e.preventDefault();e.clipboardData.setData('text/plain',doCopy(true))});
  document.addEventListener('paste',e=>{if(APP.mode!=='sheet'||document.activeElement!==kb)return;e.preventDefault();doPaste('all',e.clipboardData.getData('text/plain'))});
  document.addEventListener('keydown',e=>{const t=e.target;const typing=/INPUT|TEXTAREA|SELECT/.test(t.tagName)&&t.id!=='kbd';if(APP.mode==='bi'&&!typing&&!DLG_CLOSE){if((e.key==='Delete'||e.key==='Backspace')&&BIUI.sel&&BI.view==='report'){e.preventDefault();const v=selVisual();if(v)removeVisual(v)}if(e.key==='Escape'&&curPage().xf){curPage().xf=null;biRenderPage()}}if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='l'&&APP.mode==='sheet'){e.preventDefault();toggleFilter()}});
  $('#fileIn').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;const toBI=APP.pendingBI;APP.pendingBI=false;await importFile(f);if(toBI){setMode('sheet');toast('Arquivo importado. Selecione os dados e use Analisar no BI.')}};
  $('#fname').addEventListener('change',()=>{WB.name=$('#fname').value.trim()||'Pasta';save()});
  $$('#modes button').forEach(b=>b.onclick=()=>setMode(b.dataset.m));
  $('#aiB').onclick=()=>dlgAI();$('#undoB').onclick=()=>{if(APP.mode==='sheet')undo();else toast('Desfazer está disponível na planilha; no BI, remova ou edite o item')};$('#redoB').onclick=()=>redo();$('#saveB').onclick=()=>save(true);$('#fileB').onclick=e=>fileMenu(e.currentTarget);$('#themeB').onclick=()=>toggleTheme();
  $('#addSheetB').onclick=()=>addSheet();$('#zoomOut').onclick=()=>setZoom(UI.zoom-.1);$('#zoomIn').onclick=()=>setZoom(UI.zoom+.1);$('#zoomLbl').onclick=()=>setZoom(1);
  $('#biSideBtn').onclick=()=>$('#biSide').classList.toggle('open');
  new ResizeObserver(()=>{if(APP.mode==='sheet')drawNow();else if(APP.mode==='cfg'){CFG.chart&&CFG.chart.resize()}else{for(const c of CHARTS.values())c.resize();if(BI.view==='report'&&APP._rsz!==innerWidth){APP._rsz=innerWidth;clearTimeout(APP._rt);APP._rt=setTimeout(()=>renderView(),180)}}}).observe(document.body);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{readPal();draw();if(APP.mode==='bi')biRenderAll()});
  $('#acctB').onclick=e=>accountMenu(e.currentTarget);$('#shareB').onclick=()=>dlgShare();$('#saveSt').onclick=()=>{if(APP.book)dlgVersions()};$('#docsChip').onclick=()=>dlgEdms();
  if(SRV.local){$('#acctB').hidden=true;$('#cfgModeB').hidden=true;const last=LS.get('gps-sheets-last',null);const all=books();
    if(last&&all[last]){try{loadWB(all[last]);afterLoad()}catch(e){console.error(e);loadDemo()}}else loadDemo()}
  pwaInit();
  setMode('sheet');selectCell(0,0);
  setInterval(()=>{if(UI.clip&&UI.clip.ants)draw()},120);
  if(SRV.local)getSample().then(s=>{if(!s)$('#aiB').title='Assistente de IA (disponível quando aberto pelo claude.ai)'});
  window.__gps={WB:()=>WB,BI:()=>BI,getVal,recalc,MDL,evalMeasure,daxCtx,curSheet,setMode,loadDemo,UI,setRaw,applyRaw,parseA1,computeCat};
}
function startEditFx(){const {r,c}=UI.act;const sh=curSheet();const cell=cellAt(sh,r,c);UI.ed={r,c,mode:'edit',orig:cell?cell.raw:''};const ed=$('#cellEd');ed.value=$('#fx').value;ed.style.font=fontOf(cell&&cell.st||{});ed.style.display='block';positionEditor();draw()}
window.addEventListener('DOMContentLoaded',start);
