/* ================= aplicação: estado, arquivos, E/S ================= */
const APP={mode:'sheet',caps:{}};
const STORE_KEY='gps-sheets-books-v1';
function onChange(){recalc();for(const s of WB.sheets)if(s.filter)applyFilterHidden(s);geoDirty();draw();updateFx();updateStatus();updateRibbonState();renderTabs();saveSoon();BI_DIRTY=true;$('#undoB')&&($('#undoB').disabled=!HIST.undo.length);$('#redoB')&&($('#redoB').disabled=!HIST.redo.length)}
const saveSoon=debounce(()=>save(),900);
function books(){return LS.get(STORE_KEY,{})}
function saveLocal(explicit){WB.name=$('#fname').value.trim()||WB.name;const all=books();const data=serializeWB();data.saved=Date.now();all[WB.id]=data;const ok=LS.set(STORE_KEY,all);LS.set('gps-sheets-last',WB.id);if(explicit)toast(ok?'Salvo no navegador':'Não foi possível salvar: armazenamento do navegador cheio. Exporte em .json ou .xlsx.',ok?'':'err');return ok}
function dlgOpenLocal(){const all=books();const L=h('div',{class:'list'});const ids=Object.keys(all).sort((a,b)=>(all[b].saved||0)-(all[a].saved||0));
  if(!ids.length)L.append(h('div',{class:'li small'},'Nenhuma pasta salva neste navegador ainda.'));
  for(const id of ids){const b=all[id];L.append(h('div',{class:'li',onclick:()=>{DLG_CLOSE();loadWB(b);afterLoad()}},icoEl('sheet'),h('div',{},h('b',{},b.name||'Pasta'),h('div',{class:'small'},`${(b.sheets||[]).length} planilha(s)${b.bi?' · com relatório BI':''}`)),h('span',{class:'meta'},b.saved?new Date(b.saved).toLocaleString('pt-BR'):''),h('button',{class:'ibtn',title:'Excluir',onclick:e=>{e.stopPropagation();if(confirm('Excluir "'+(b.name||'Pasta')+'" deste navegador?')){delete all[id];LS.set(STORE_KEY,all);DLG_CLOSE();dlgOpenLocal()}}},'×')))}
  dlg('Abrir pasta salva',L,[{label:'Importar arquivo…',act:()=>$('#fileIn').click()},{label:'Fechar',primary:true}])}
function newBookLocal(){if(!confirm('Criar uma pasta nova? A atual continua salva neste navegador.'))return;save();WB=newWorkbook('Pasta '+(Object.keys(books()).length+1));biLoad(null);HIST.undo=[];HIST.redo=[];afterLoad();save()}
function afterLoad(){$('#fname').value=WB.name;UI.sel={r1:0,c1:0,r2:0,c2:0};UI.act={r:0,c:0};UI.anc={r:0,c:0};geoDirty();renderTabs();buildSheetRibbon();onSelChange();onChange();if(APP.mode==='bi'){biRenderAll()}}

/* ---- download ---- */
async function downloadFile(filename,data,mime){
  if(!can('export'))return toast('Sem permissão para exportar arquivos','err');logEvent('exportou',(filename.split('.').pop()||'').toLowerCase(),filename);
  try{if(window.claude&&window.claude.use){const d=await Promise.race([window.claude.use('downloads'),new Promise(r=>setTimeout(()=>r(null),1500))]);if(d){try{await d.save({filename,data});toast('Arquivo pronto: '+filename);return}catch(e){if(e&&e.code==='declined')return;if(e&&e.code!=='unavailable'&&e.code!=='not_granted'){toast('Não foi possível salvar: '+(e.message||e.code),'err');return}}}}}catch(e){}
  const blob=data instanceof Blob?data:new Blob([data],{type:mime||'application/octet-stream'});const a=h('a',{href:URL.createObjectURL(blob),download:filename});document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}
const safeName=s=>(s||'pasta').replace(/[\\\/:*?"<>|]+/g,'_').slice(0,80);

/* ---- conversão de fórmulas pt ⇄ en (para .xlsx) ---- */
const XLFN=new Set(['XLOOKUP','XMATCH','FILTER','SORT','SORTBY','UNIQUE','SEQUENCE','LET','IFS','SWITCH','MAXIFS','MINIFS','CONCAT','TEXTJOIN','IFNA','XOR','TAKE','DROP','CHOOSECOLS','CHOOSEROWS','VSTACK','HSTACK','TOCOL','TOROW','TEXTSPLIT','TEXTBEFORE','TEXTAFTER','STDEV.S','STDEV.P','VAR.S','VAR.P','MODE.SNGL','RANK.EQ','PERCENTILE.INC','QUARTILE.INC','FORECAST.LINEAR','NORM.DIST','NORM.INV','CEILING.MATH','FLOOR.MATH','AGGREGATE','DAYS','ISOWEEKNUM','NUMBERVALUE','ISFORMULA']);
const ERR_EN={'#N/D':'#N/A','#VALOR!':'#VALUE!','#NOME?':'#NAME?','#NÚM!':'#NUM!','#DESPEJAR!':'#SPILL!','#NULO!':'#NULL!'};
function absRef(ref,own){const g={r1:ref.r1,c1:ref.c1,r2:ref.r2,c2:ref.c2};const a='$'+colName(g.c1)+'$'+(g.r1+1),b='$'+colName(g.c2)+'$'+(g.r2+1);return(ref.sh!==own?quoteSheet(ref.sh.name)+'!':'')+(a===b?a:a+':'+b)}
function toEnFormula(raw,own,r,c){if(!raw||raw[0]!=='=')return null;let out='';const ctx={r,c};for(const t of tokenize(raw.slice(1))){if(t.t==='col'&&own){const tb=own.tables.find(x=>inRange(x,r,c));const ref=tb&&resolveTCol(tb.name,t.v,ctx);if(ref){out+=absRef(ref,own);continue}}if(t.t==='tcol'){const ref=resolveTCol(t.tb,t.cl,ctx);if(ref){out+=absRef(ref,own);continue}}if(t.t==='func'){const en=canonFn(t.v);out+=(XLFN.has(en)?'_xlfn.':'')+en}else if(t.t==='sep')out+=',';else if(t.t==='bool')out+=t.v?'TRUE':'FALSE';else if(t.t==='err')out+=ERR_EN[t.v.err]||t.v.err;else if(t.t==='num')out+=String(t.v);else out+=t.text}return out}
function fromEnFormula(f){let out='=';for(const t of tokenize(f,'en')){if(t.t==='func'){const en=canonFn(t.v);out+=EN2PT[en]||en}else if(t.t==='sep')out+=';';else if(t.t==='bool')out+=t.v?'VERDADEIRO':'FALSO';else if(t.t==='num')out+=String(t.v).replace('.',',');else out+=t.text}return out}

/* ---- exportar ---- */
function exportXLSX(){if(!window.XLSX)return toast('Biblioteca de planilhas indisponível. Verifique a conexão ou use a versão offline.','err');downloadFile(safeName(WB.name)+'.xlsx',new Blob([buildXLSX()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))}
function buildXLSX(){const wb=XLSX.utils.book_new();
  for(const sh of WB.sheets){const ws={};let maxR=0,maxC=0;
    for(const [k,cell] of sh.cells){const r=KR(k),c=KC(k);if(!cell.raw&&!cell.st)continue;const ref=XLSX.utils.encode_cell({r,c});const v=getVal(sh,r,c);const o={};
      if(cell.ast){o.f=toEnFormula(cell.raw,sh,r,c);if(cell.arr){o.F=XLSX.utils.encode_range({s:{r,c},e:{r:r+cell.arr.length-1,c:c+cell.arr[0].length-1}})}}
      if(typeof v==='number'){o.t='n';o.v=v}else if(typeof v==='boolean'){o.t='b';o.v=v}else if(isErr(v)){o.t='e';o.v=0;o.w=ERR_EN[v.err]||v.err}else if(v==null||v===''){if(!o.f){o.t='z'}else{o.t='s';o.v=''}}else{o.t='s';o.v=String(v)}
      if(cell.st&&cell.st.nf)o.z=cell.st.nf;ws[ref]=o;maxR=Math.max(maxR,r);maxC=Math.max(maxC,c)}
    for(const [k,ak] of sh.spill){const r=KR(k),c=KC(k);const ref=XLSX.utils.encode_cell({r,c});if(ws[ref])continue;const v=getVal(sh,r,c);ws[ref]=typeof v==='number'?{t:'n',v}:{t:'s',v:txt(v)};maxR=Math.max(maxR,r);maxC=Math.max(maxC,c)}
    ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(0,maxR),c:Math.max(0,maxC)}});
    ws['!cols']=range(0,maxC).map(c=>({wpx:sh.colW[c]??DEF_W,hidden:sh.hcols.has(c)||undefined}));
    if(sh.merges.length)ws['!merges']=sh.merges.map(m=>({s:{r:m.r1,c:m.c1},e:{r:m.r2,c:m.c2}}));
    if(sh.filter)ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:sh.filter.r1,c:sh.filter.c1},e:{r:sh.filter.r2,c:sh.filter.c2}})};
    XLSX.utils.book_append_sheet(wb,ws,sh.name.slice(0,31))}
  wb.Workbook={Names:Object.entries(WB.names).filter(([k,d])=>d.ref).map(([k,d])=>({Name:d.label||k,Ref:d.ref}))};
  return XLSX.write(wb,{bookType:'xlsx',type:'array'})}
function exportCSV(){const sh=curSheet();const g={r1:0,c1:0,r2:Math.max(0,sh.maxR),c2:Math.max(0,sh.maxC)};const rows=[];for(let r=g.r1;r<=g.r2;r++){const row=[];for(let c=g.c1;c<=g.c2;c++){let t=displayOf(sh,r,c);if(/[;"\n]/.test(t))t='"'+t.replace(/"/g,'""')+'"';row.push(t)}rows.push(row.join(';'))}downloadFile(safeName(WB.name+' - '+sh.name)+'.csv','\ufeff'+rows.join('\r\n'),'text/csv')}
function exportJSON(){downloadFile(safeName(WB.name)+'.json',JSON.stringify(serializeWB()),'application/json')}

/* ---- importar ---- */
async function importFile(file){const name=file.name.replace(/\.[^.]+$/,'');const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(!can('import'))return toast('Sem permissão para importar arquivos','err');const asNew=ext!=='csv'&&ext!=='txt'&&ext!=='tsv';
  if(asNew&&!can('books.create'))return toast('Sem permissão para criar pastas','err');if(!asNew&&!guardEdit())return;logEvent('importou',ext,file.name);
  try{
    if(ext==='json'){const o=JSON.parse(await file.text());if(o.sheets){await flushSave();if(!SRV.local)resetBook('Importado de '+file.name);loadWB({...o,id:uid('wb')});afterLoad();toast('Pasta importada');return}throw new Error('JSON não reconhecido')}
    if(ext==='csv'||ext==='txt'||ext==='tsv'){const t=await file.text();const rows=parseTSV(t);const sh=WB.sheets.length===1&&curSheet().cells.size===0?curSheet():addSheet(uniqueSheetName(name.slice(0,28)));beginTx('Importar CSV');snapTx();rows.forEach((row,i)=>row.forEach((v,j)=>applyRaw(sh,i,j,v)));commitTx();if(sh.name==='Planilha1'&&WB.sheets.length===1){sh.name=uniqueSheetName(name.slice(0,28));renderTabs()}autoFitCols(range(0,Math.min(sh.maxC,60)));toast(`${rows.length} linhas importadas`);return}
    if(!window.XLSX)throw new Error('Biblioteca de planilhas indisponível');
    const buf=await file.arrayBuffer();const xb=XLSX.read(buf,{type:'array',cellFormula:true,cellNF:true,cellDates:false});
    await flushSave();const nw=newWorkbook(name);nw.sheets=[];
    for(const sn of xb.SheetNames){const ws=xb.Sheets[sn];const s=newSheet(sn);if(!ws['!ref']){nw.sheets.push(s);continue}const rg=XLSX.utils.decode_range(ws['!ref']);const lim=Math.min(rg.e.r,200000);const arrs=[];for(const k in ws){if(k[0]==='!')continue;const o=ws[k];if(o&&o.f&&o.F&&o.F.includes(':')){const g=XLSX.utils.decode_range(o.F);const a=XLSX.utils.decode_cell(k);if(g.s.r===a.r&&g.s.c===a.c)arrs.push(g)}}const inArr=(r,c)=>arrs.some(g=>r>=g.s.r&&r<=g.e.r&&c>=g.s.c&&c<=g.e.c&&!(r===g.s.r&&c===g.s.c));
      for(let r=rg.s.r;r<=lim;r++)for(let c=rg.s.c;c<=Math.min(rg.e.c,1000);c++){const o=ws[XLSX.utils.encode_cell({r,c})];if(!o)continue;if(arrs.length&&!o.f&&inArr(r,c)){if(o.z&&o.z!=='General'){const cl={raw:'',v:null,st:{nf:String(o.z)}};s.cells.set(K(r,c),cl)}continue}let raw;
        if(o.f)raw=fromEnFormula(o.f.replace(/_xlfn\.|_xlws\./g,''));else if(o.t==='n')raw=o.v;else if(o.t==='b')raw=o.v?'VERDADEIRO':'FALSO';else if(o.t==='e')raw=o.w||'#N/D';else if(o.t==='s'){raw=String(o.v);if(/^[=+\-]/.test(raw)||parseInput(raw).v!==raw)raw="'"+raw}else raw=o.v!=null?String(o.v):'';
        const k=K(r,c);const cell={raw:'',v:null};s.cells.set(k,cell);applyRaw(s,r,c,raw,{keepFmt:true});const z=o.z&&o.z!=='General'?String(o.z):null;if(z)cell.st={nf:z};if(o.c&&o.c[0])cell.note=o.c.map(x=>x.t).join('\n')}
      (ws['!cols']||[]).forEach((cc,i)=>{if(!cc)return;if(cc.wpx)s.colW[i]=Math.round(cc.wpx);else if(cc.wch)s.colW[i]=Math.round(cc.wch*7+5);if(cc.hidden)s.hcols.add(i)});
      (ws['!rows']||[]).forEach((rr,i)=>{if(!rr)return;if(rr.hpx)s.rowH[i]=Math.round(rr.hpx);if(rr.hidden)s.hidden.add(i)});
      s.merges=(ws['!merges']||[]).map(m=>({r1:m.s.r,c1:m.s.c,r2:m.e.r,c2:m.e.c}));
      if(ws['!autofilter']){const g=XLSX.utils.decode_range(ws['!autofilter'].ref);s.filter={r1:g.s.r,c1:g.s.c,r2:g.e.r,c2:g.e.c,crit:{}}}
      nw.sheets.push(s)}
    if(xb.Workbook&&xb.Workbook.Names)for(const n of xb.Workbook.Names){if(n.Ref&&!n.Name.startsWith('_xlnm'))nw.names[stripAcc(n.Name).toUpperCase()]={ref:n.Ref,label:n.Name}}
    if(!SRV.local)resetBook('Importado de '+file.name);WB=nw;if(!WB.sheets.length)WB.sheets.push(newSheet('Planilha1'));biLoad(null);HIST.undo=[];HIST.redo=[];recalc();afterLoad();save();toast(`${xb.SheetNames.length} planilha(s) importada(s) de ${file.name}`);
  }catch(e){console.error(e);toast('Não foi possível importar: '+e.message,'err')}}

/* ---- menu Arquivo ---- */
function fileMenu(el){const srv=!SRV.local,ro=!canEditBook();
  // no celular os botões da barra superior ficam escondidos e aparecem no topo deste menu
  const mob=typeof MOBQ!=='undefined'&&MOBQ.matches;
  const quick=mob?[{label:'Desfazer',icon:'undo',disabled:$('#undoB').disabled,act:()=>$('#undoB').click()},{label:'Refazer',icon:'refresh',disabled:$('#redoB').disabled,act:()=>$('#redoB').click()},{label:'Assistente de IA',icon:'ai',act:()=>dlgAI()},{label:'Tema claro/escuro',icon:'theme',act:()=>toggleTheme()},'-']:[];
  menuAt(el,[...quick,{label:'Nova pasta',icon:'plus',disabled:!can('books.create'),act:()=>newBook()},{label:'Abrir…',icon:'sheet',kbd:'Ctrl+O',act:()=>dlgOpen()},{label:'Salvar',icon:'save',kbd:'Ctrl+S',disabled:ro&&!canEditBI(),act:()=>save(true)},{label:'Salvar como cópia',icon:'copy',disabled:!can('books.create'),act:()=>{const n=prompt('Nome da cópia',WB.name+' (cópia)');if(!n)return;if(srv){flushSave().finally(()=>{resetBook('Cópia de '+WB.name);WB.name=n;$('#fname').value=n;save(true)})}else{WB.id=uid('wb');WB.name=n;$('#fname').value=n;save(true)}}},
  srv?'-':null,srv?{label:'Compartilhar…',icon:'user',disabled:!APP.book||!can('books.share')||!(APP.book.level==='owner'||can('books.all')),act:()=>dlgShare()}:null,srv?{label:'Histórico de versões…',icon:'refresh',disabled:!APP.book,act:()=>dlgVersions()}:null,srv?{label:'Salvar versão nomeada…',icon:'save',disabled:!APP.book||ro,act:()=>namedVersion()}:null,
  srv&&docsOn()?{h:'GPlanSiS|Docs'}:null,srv&&docsOn()?{label:DX.v?'Enviar nova versão ao Docs…':'Enviar ao GPlanSiS|Docs…',icon:'link',disabled:!APP.book||ro||!can('docs.send'),act:()=>dlgEnviarDocs()}:null,srv&&docsOn()&&DX.v?{label:'Revisões e comentários no Docs…',icon:'list',act:()=>dlgEdms()}:null,srv&&docsOn()?{label:'Abrir o GPlanSiS|Docs',icon:'link',act:()=>abrirNoDocs(DX.v?'/documentos/'+DX.v.docId:'/sheets')}:null,
  '-',{label:'Importar (.xlsx, .xls, .ods, .csv, .json)…',icon:'import',disabled:!can('import'),act:()=>$('#fileIn').click()},{h:'Exportar'},{label:'Excel (.xlsx)',icon:'export',disabled:!can('export'),act:()=>exportXLSX()},{label:'CSV da planilha atual',icon:'export',disabled:!can('export'),act:()=>exportCSV()},{label:'GPlanSiS|Sheets (.json, com BI)',icon:'export',disabled:!can('export'),act:()=>exportJSON()},'-',
  {label:'Carregar demonstração industrial',icon:'play',disabled:!can('books.create'),act:()=>{if(confirm('Abrir a pasta de demonstração (produção industrial, 3 tabelas e relatório BI)? A pasta atual continua salva.')){if(srv)openDemo();else{save();loadDemo()}}}},{label:'Atalhos de teclado',icon:'info',act:()=>dlgKeys()},{label:'Sobre e recursos',icon:'info',act:()=>dlgAbout()}])}
function dlgKeys(){const rows=[['Ctrl+C / X / V','Copiar, recortar, colar (fórmulas ajustam referências)'],['Ctrl+Z / Y','Desfazer / refazer'],['F2','Editar célula · alterna modo editar/inserir'],['F4','Alterna $ absoluto na referência (editando) · repete a última formatação'],['Ctrl+Enter','Preenche a seleção com o valor digitado'],['Alt+Enter','Quebra de linha na célula'],['Ctrl+setas','Salta para o fim do bloco de dados'],['Shift+setas','Estende a seleção'],['Ctrl+A','Seleciona a região atual, depois tudo'],['Ctrl+D / R','Preencher para baixo / à direita'],['Ctrl+;','Data de hoje'],['Ctrl+1','Formatar células'],['Ctrl+F / H','Localizar / substituir'],['Ctrl+G','Ir para (caixa de nome)'],['Ctrl+K','Nota'],["Ctrl+'",'Mostrar fórmulas'],['Ctrl+PgUp / PgDn','Planilha anterior / próxima'],['F9','Recalcular'],['Tab / Enter','Aceita a sugestão do autocompletar']];
  dlg('Atalhos de teclado',h('div',{class:'kv'},...rows.flatMap(([a,b])=>[h('span',{class:'tag'},a),h('span',{},b)])),[{label:'Fechar',primary:true}])}
function dlgAbout(){dlg('GPlanSiS|Sheets',h('div',{},h('p',{style:{margin:0}},`Planilha web com ${FN_LIST().length} funções (nomes em português e inglês), matrizes dinâmicas com despejo, tabelas estruturadas, formatação condicional, validação, filtros, tabela dinâmica e o módulo BI integrado (consultas com etapas aplicadas, modelo com relacionamentos, medidas estilo DAX e relatórios com filtro cruzado).`),h('p',{class:'small'},'Referências de código aberto que inspiraram os recursos: Univer e Luckysheet (renderização em canvas, matrizes dinâmicas, formatação condicional), HyperFormula e Formula.js (cobertura de funções), Apache Superset e Metabase (filtro cruzado, drill-down, Q&A), e o Power Query (etapas aplicadas). Nenhum código desses projetos foi copiado; os recursos foram reimplementados.'),h('p',{class:'small'},'Os dados ficam no navegador (armazenamento local) e nos arquivos que você exportar. Na exportação .xlsx, valores, fórmulas, formatos de número, larguras, mesclagens e filtro são preservados; cores e fontes não são gravadas pela biblioteca aberta usada.')),[{label:'Fechar',primary:true}])}
