'use strict';
/* ================= integração com o GPlanSiS|Docs =================
   Como no Writer e no Drawings: a pasta vira um documento controlado no Docs (lista mestra, revisões, fluxo
   de verificação). Cada envio leva PDF (planilhas como na impressão, com código e revisão no cabeçalho),
   Excel (.xlsx) e o arquivo nativo (.json, com o modelo e os relatórios de BI). Revisões e comentários feitos
   no Docs voltam para cá por eventos assinados e aparecem no selo do topo. Entrada única nos dois sentidos. */
const DX={id:null,v:null,assin:'',timer:null};
const ST_DOCS={EM_ELABORACAO:['Em elaboração',''],EM_VERIFICACAO:['Em verificação','warn'],APROVADA_INTERNA:['Aprovada internamente','info'],EMITIDA:['Emitida','info'],
  APROVADA:['Aprovada (A)','ok'],APROVADA_COM_COMENTARIOS:['Aprovada c/ comentários (B)','warn'],REPROVADA:['Reprovada','bad'],SUPERADA:['Superada',''],CANCELADA:['Cancelada','bad']};
const FIN={PI:'Para informação',PA:'Para aprovação',PC:'Para construção',CE:'Conforme construído',CA:'Cancelamento'};
const stDocs=s=>ST_DOCS[s]||[s||'—',''];
const docsOn=()=>!SRV.local&&!!(SRV.me&&SRV.docs);
const fmtIso=t=>t?new Date(typeof t==='number'?t*1000:t).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';

function abrirNoDocs(para){if(!docsOn())return toast('A integração com o GPlanSiS|Docs não está configurada no servidor','err');
  const w=window.open('about:blank','_blank');// a aba abre já no clique (senão o navegador bloqueia); o endereço chega depois
  api('/api/gpdocs/sso',{method:'POST',body:{para:para||''}}).then(r=>{if(w)w.location.href=r.url;else location.href=r.url}).catch(e=>{if(w)w.close();toast(e.message,'err')})}

/* ---- selo do topo e sincronização ---- */
function pintaEdms(){const el=$('#docsChip');if(!el)return;const v=DX.v;el.hidden=!(docsOn()&&v&&APP.book&&DX.id===APP.book.id);if(el.hidden)return;
  const[st,tom]=stDocs(v.revisao.status);el.innerHTML='';
  el.append(h('i',{class:'dot '+tom}),h('b',{},v.codigo||''),h('span',{},` · Rev. ${v.revisao.label||'—'} · ${st}${v.comentariosAbertos?` · ${v.comentariosAbertos} coment.`:''}`));
  el.title=`GPlanSiS|Docs — ${v.titulo||''}. Clique para ver revisões e comentários.`}
async function syncEdms(forcar){if(!docsOn()||!APP.book){DX.v=null;DX.id=null;pintaEdms();return}
  const id=APP.book.id;
  try{const r=await api(`/api/gpdocs/vinculo/${encodeURIComponent(id)}${forcar?'?atualizar=1':''}`);if(!APP.book||APP.book.id!==id)return;
    const v=r.vinculo,ant=DX.id===id?DX.v:null;DX.v=v;DX.id=id;
    const assin=v?`${v.revisao.id}|${v.revisao.status}|${v.comentarios.map(c=>c.id+c.status).join(',')}`:'';
    if(ant&&v&&DX.assin&&assin!==DX.assin){
      if(ant.revisao.status!==v.revisao.status||ant.revisao.label!==v.revisao.label)toast(`Docs: ${v.codigo} rev. ${v.revisao.label} — ${stDocs(v.revisao.status)[0]}`);
      else if(v.comentariosAbertos>ant.comentariosAbertos)toast(`Docs: ${v.comentariosAbertos-ant.comentariosAbertos} comentário(s) novo(s) em ${v.codigo}`)}
    DX.assin=assin;pintaEdms()}
  catch(e){if(forcar)toast('Docs: '+e.message,'err')}}
function agendaEdms(){clearInterval(DX.timer);if(docsOn())DX.timer=setInterval(()=>{if(!document.hidden&&DX.v)syncEdms(false)},20000)}

/* ---- revisões e comentários ---- */
function dlgEdms(){const v=DX.v;if(!v)return;const[st]=stDocs(v.revisao.status);
  const coms=h('div',{class:'dcoms'});if(!v.comentarios.length)coms.append(h('div',{class:'small'},'Nenhum comentário.'));
  v.comentarios.forEach((c,i)=>coms.append(h('div',{class:'dcom'+(c.status==='ABERTO'?'':' res')},h('span',{class:'n'},String(i+1)),
    h('div',{style:{flex:1,minWidth:0}},h('b',{},c.author||''),h('span',{class:'small'},` · ${c.category||''} · rev. ${c.revision_label||''}${c.page?` · pág. ${c.page}`:''} · ${fmtIso(c.created_at)}`),
      h('p',{},c.body||''),c.resolution?h('p',{class:'small'},'Resolução: '+c.resolution):null),
    h('span',{class:'tag'+(c.status==='ABERTO'?' bad':'')},c.status==='ABERTO'?'aberto':c.status==='RESOLVIDO'?'resolvido':'n/a'))));
  const revs=h('table',{class:'tbl'},h('thead',{},h('tr',{},...['Rev.','Situação','Finalidade','Descrição','Data'].map(x=>h('th',{},x)))),
    h('tbody',{},...v.revisoes.slice().reverse().map(r=>h('tr',{},h('td',{class:'code'},r.label),h('td',{},stDocs(r.status)[0]),h('td',{},FIN[r.purpose]||r.purpose||'—'),h('td',{class:'small'},r.description||''),h('td',{class:'small nw'},fmtIso(r.issued_at||r.created_at))))));
  const pend=APP.book&&(APP.book.ver||0)>(v.versaoEnviada||0);
  dlg('GPlanSiS|Docs — '+v.codigo,h('div',{class:'dstack'},
    h('div',{class:'kv'},h('span',{class:'small'},'Documento'),h('span',{},`${v.codigo} · ${v.titulo||''}`),h('span',{class:'small'},'Projeto'),h('span',{},`${v.projeto.codigo||''}${v.projeto.nome?' · '+v.projeto.nome:''}`),
      h('span',{class:'small'},'Revisão'),h('span',{},`${v.revisao.label||''} · ${st}${v.revisao.finalidade?' · '+(FIN[v.revisao.finalidade]||v.revisao.finalidade):''}${v.revisao.retornoCliente?' · retorno do cliente '+v.revisao.retornoCliente:''}`),
      h('span',{class:'small'},'Último envio'),h('span',{},`${fmtIso(v.enviadoEm)}${v.enviadoPor?' por '+v.enviadoPor:''}${v.versaoEnviada?` · versão ${v.versaoEnviada} da pasta`:''}`,pend?h('span',{class:'tag rotag',style:{marginLeft:'6px'}},'há alterações não enviadas'):null)),
    h('b',{},`Comentários (${v.comentarios.length}${v.comentariosAbertos?`, ${v.comentariosAbertos} aberto(s)`:''})`),coms,h('b',{},'Revisões'),h('div',{class:'tblw'},revs)),
    [{label:'Atualizar',act:()=>{syncEdms(true).then(()=>dlgEdms());return false}},{label:'Abrir no Docs',act:()=>{abrirNoDocs('/documentos/'+v.docId);return false}},
     can('docs.send')&&canEditBook()?{label:'Enviar nova versão',act:()=>{setTimeout(dlgEnviarDocs,40)}}:null,{label:'Fechar',primary:true}].filter(Boolean),{wide:true})}

/* ---- PDF: HTML de impressão das planilhas (convertido pelo Chromium do Docs) ---- */
function sheetHtml(sh,o){const LR=5000,LC=60;const maxR=Math.min(sh.maxR,LR-1),maxC=Math.min(sh.maxC,LC-1);if(maxR<0||maxC<0)return'<p class="vazio">(planilha vazia)</p>';
  const rows=[],cols=[];for(let r=0;r<=maxR;r++)if(!sh.hidden.has(r)&&!sh.fhidden.has(r))rows.push(r);for(let c=0;c<=maxC;c++)if(!sh.hcols.has(c))cols.push(c);
  const W=c=>sh.colW[c]??DEF_W;const tot=cols.reduce((s,c)=>s+W(c),0);const avail=o.orient==='portrait'?718:1047;const zoom=o.fit?Math.min(1,avail/tot):1;
  const cover=new Set();const span=new Map();
  for(const m of sh.merges){const rs=rows.filter(r=>r>=m.r1&&r<=m.r2).length,cs=cols.filter(c=>c>=m.c1&&c<=m.c2).length;span.set(K(m.r1,m.c1),[rs,cs]);for(let r=m.r1;r<=m.r2;r++)for(let c=m.c1;c<=m.c2;c++)if(r!==m.r1||c!==m.c1)cover.add(K(r,c))}
  const head=o.repeat?Math.min(sh.freeze&&sh.freeze.r||0,20):0;
  const tr=r=>{let out=`<tr style="height:${sh.rowH[r]??DEF_H}px">`;
    cols.forEach((c,ci)=>{const k=K(r,c);if(cover.has(k))return;const cell=sh.cells.get(k);const st=(cell&&cell.st)||{};const v=getVal(sh,r,c);
      const cf=sh.cf.length?cfFor(sh,r,c,v):null;const t=sh.tables.length?tableAt(sh,r,c):null;let bg=st.bg,fc=st.fc,b=st.b;
      if(t){const ts=TSTYLE[t.style||'laranja'];if(r===t.r1){bg=bg||ts.h;fc=fc||'#fff';b=true}else if(t.banded!==false&&(r-t.r1)%2===0)bg=bg||ts.s}
      if(cf){if(cf.bg)bg=cf.bg;if(cf.fc)fc=cf.fc;if(cf.b)b=true}
      const css=[];if(bg)css.push('background:'+bg);if(cf&&cf.bar){const z=Math.round(cf.bar.z*100),tt=Math.round(cf.bar.t*100);css.push(`background:linear-gradient(90deg,transparent ${Math.min(z,tt)}%,${cf.bar.color}99 ${Math.min(z,tt)}%,${cf.bar.color}99 ${Math.max(z,tt)}%,transparent ${Math.max(z,tt)}%)`)}
      if(fc)css.push('color:'+fc);if(b)css.push('font-weight:600');if(st.i)css.push('font-style:italic');const dec=[st.u&&'underline',st.s&&'line-through'].filter(Boolean);if(dec.length)css.push('text-decoration:'+dec.join(' '));
      if(st.fs)css.push(`font-size:${st.fs}pt`);
      const ha=st.ha||(typeof v==='number'?'right':typeof v==='boolean'||isErr(v)?'center':'left');css.push('text-align:'+ha);css.push('vertical-align:'+(st.va==='top'?'top':st.va==='middle'?'middle':'bottom'));
      if(st.ind)css.push(`padding-left:${4+st.ind*9}px`);
      const nextEmpty=ci<cols.length-1&&!sh.cells.get(K(r,cols[ci+1]))&&!sh.spill.has(K(r,cols[ci+1]));
      css.push(st.wrap?'white-space:pre-wrap;word-break:break-word':'white-space:pre'+(nextEmpty&&ha==='left'?';overflow:visible':';overflow:hidden'));
      if(st.bd)for(const [s,p] of [['t','top'],['b','bottom'],['l','left'],['r','right']])if(st.bd[s]){const [wd,col]=st.bd[s].split(' ');css.push(`border-${p}:${Math.max(1,+wd||1)}px solid ${col||'#000'}`)}
      let txt2=v==null||v===''?'':displayOf(sh,r,c);if(cf&&cf.icon!=null){const ic=(ICONS[cf.iconSet]||ICONS.arrows)[cf.icon];if(ic)txt2=`<span style="color:${ic[1]}">${ic[0]}</span> `+esc(txt2);else txt2=esc(txt2)}else txt2=esc(txt2);
      const sp=span.get(k);out+=`<td${sp&&sp[0]>1?` rowspan="${sp[0]}"`:''}${sp&&sp[1]>1?` colspan="${sp[1]}"`:''} style="${css.join(';')}">${txt2}</td>`});return out+'</tr>'};
  const trunc=sh.maxR>=LR||sh.maxC>=LC;
  return`<table class="sh${o.grid&&sh.showGrid?' grade':''}" style="width:${tot}px;zoom:${zoom.toFixed(3)}"><colgroup>${cols.map(c=>`<col style="width:${W(c)}px">`).join('')}</colgroup>`+
    (head?`<thead>${rows.filter(r=>r<head).map(tr).join('')}</thead>`:'')+`<tbody>${rows.filter(r=>r>=head).map(tr).join('')}</tbody></table>`+
    (trunc?`<p class="vazio">Recorte: até ${LR.toLocaleString('pt-BR')} linhas e ${LC} colunas no PDF; a planilha completa está no Excel e no arquivo nativo.</p>`:'')}
function biAppendix(){if(!biHasContent())return'';const M=MDL();const tabs=[...M.tables.values()];
  return`<h2 class="np">Modelo e relatórios de BI</h2><p class="vazio">Os relatórios interativos estão no arquivo nativo (.json) — abra no GPlanSiS|Sheets.</p>
  <table class="lst"><thead><tr><th>Tabela</th><th>Linhas</th><th>Colunas</th></tr></thead><tbody>${tabs.map(T=>`<tr><td>${esc(T.name)}</td><td class="n">${T.rows.length.toLocaleString('pt-BR')}</td><td>${esc(T.cols.map(c=>c.name).join(', '))}</td></tr>`).join('')}</tbody></table>
  ${BI.measures.length?`<table class="lst"><thead><tr><th>Medida</th><th>Expressão (DAX)</th></tr></thead><tbody>${BI.measures.map(m=>`<tr><td>${esc(m.name)}</td><td class="code">${esc(m.expr)}</td></tr>`).join('')}</tbody></table>`:''}
  <table class="lst"><thead><tr><th>Página do relatório</th><th>Visuais</th></tr></thead><tbody>${BI.pages.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.visuals.filter(v=>v.type!=='text').map(v=>v.title||autoTitle(v)).join(' · '))}</td></tr>`).join('')}</tbody></table>`}
function htmlParaPdf(codigo,rev,o){const sheets=WB.sheets.filter(s=>o.sheets.includes(s.id));const q=s=>JSON.stringify(s);
  const css=`@page{size:A4 ${o.orient==='portrait'?'portrait':'landscape'};margin:15mm 10mm 13mm;
    @top-left{content:${q(WB.name)};font:9pt 'IBM Plex Sans',Arial;color:#80878d}@top-right{content:${q(codigo+' · Rev. '+rev)};font:600 9pt 'IBM Plex Sans',Arial;color:#2D3336}
    @bottom-left{content:"GPlanSiS|Sheets";font:8pt 'IBM Plex Sans',Arial;color:#a0a6aa}@bottom-right{content:"Página " counter(page) " de " counter(pages);font:8pt 'IBM Plex Sans',Arial;color:#80878d}}
    html,body{margin:0;background:#fff;color:#22282B;font:10pt 'IBM Plex Sans',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    h2{font-size:12pt;margin:0 0 6px;font-weight:600}h2 small{font-weight:400;color:#80878d;font-size:9pt}.np{break-before:page}
    table.sh{border-collapse:collapse;table-layout:fixed}table.sh td{padding:1px 4px;font-size:10pt;line-height:1.25;text-overflow:clip}
    table.sh.grade td{border:0.5px solid #D9DDE0}table.sh thead{display:table-header-group}table.sh tr{break-inside:avoid}
    table.lst{border-collapse:collapse;width:100%;margin:8px 0 14px;font-size:9pt}table.lst th,table.lst td{border:0.5px solid #D3D8DC;padding:4px 6px;text-align:left;vertical-align:top}
    table.lst th{background:#F1F3F5}.n{text-align:right}.code{font-family:'IBM Plex Mono',monospace;font-size:8.5pt;white-space:pre-wrap}.vazio{color:#80878d;font-size:9pt}`;
  return`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(codigo+' — '+WB.name)}</title><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono&family=IBM+Plex+Sans:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet"><style>${css}</style></head><body>`+
    sheets.map((s,i)=>`<h2${i?' class="np"':''}>${esc(s.name)} <small>· ${esc(WB.name)}</small></h2>${sheetHtml(s,o)}`).join('')+(o.bi?biAppendix():'')+'</body></html>'}
const bytesB64=u8=>new Promise((ok,ko)=>{const fr=new FileReader();fr.onload=()=>ok(String(fr.result).split(',')[1]);fr.onerror=()=>ko(new Error('Falha ao ler o arquivo'));fr.readAsDataURL(new Blob([u8]))});

/* ---- enviar ---- */
async function dlgEnviarDocs(){
  if(!docsOn())return toast('A integração com o GPlanSiS|Docs não está configurada no servidor','err');
  if(!can('docs.send'))return toast('Seu perfil não permite enviar pastas ao GPlanSiS|Docs','err');
  if(!canEditBook())return toast('Você está com esta pasta só para leitura','err');
  if(!window.XLSX)return toast('Biblioteca de planilhas indisponível','err');
  if(UI.ed)commitEdit();
  await flushSave();if(!APP.book||saveKey(serializeWB())!==APP.lastKey)return toast('A pasta ainda não está salva no servidor — confira a conexão e tente de novo','err');
  await syncEdms(true);const v=DX.id===APP.book.id?DX.v:null;let op=null;
  if(!v){try{op=await api('/api/gpdocs/opcoes')}catch(e){return toast(e.message,'err')}
    if(!op.projetos.length)return dlg('Enviar ao GPlanSiS|Docs',h('div',{},h('p',{style:{margin:0}},'Você não é Autor, Controlador nem Administrador de nenhum projeto no Docs.'),h('p',{class:'small'},'Peça a um controlador do projeto para incluir você na equipe.')),[{label:'Fechar',primary:true}])}
  const[stA]=v?stDocs(v.revisao.status):[''];
  const acao=v?(v.revisao.status==='EM_ELABORACAO'?`Os arquivos da revisão ${v.revisao.label} (em elaboração) serão substituídos por esta versão.`:`A revisão ${v.revisao.label} está "${stA}": o Docs abrirá a próxima revisão com esta versão.`):'O Docs vai criar o documento na lista mestra, numerado pela máscara do projeto, na revisão inicial.';
  const box=h('div',{class:'dstack'},h('div',{class:'small'},acao+' Vão juntos: PDF (as planilhas como na impressão, com código e revisão no cabeçalho), Excel (.xlsx) e o arquivo nativo do Sheets (.json, com o BI).'));
  let proj,disc,tipo,tit,desc;
  if(v){box.append(field('Documento',inp(`${v.codigo} · ${v.titulo||''}`,{disabled:true})));if(v.revisao.status!=='EM_ELABORACAO'){desc=inp('',{maxlength:300,placeholder:'Ex.: atualiza as quantidades do bloco B; atende os comentários 1 a 3'});box.append(field('O que mudou nesta revisão',desc))}}
  else{proj=sel(op.projetos.map(p=>[p.id,p.code+' · '+p.name]),op.projetos[0].id);disc=sel([],'');tipo=sel(op.tipos.map(t=>[t.code,t.code+' · '+t.name]),op.tipos.some(t=>t.code==='MC')?'MC':op.tipos[0]&&op.tipos[0].code);tit=inp(WB.name,{maxlength:200});
    const pintaDisc=()=>{const hab=op.disciplinasProjeto.filter(x=>x.project_id===proj.value).map(x=>x.code);const L=op.disciplinas.filter(d=>!hab.length||hab.includes(d.code));disc.innerHTML='';for(const d of L)disc.append(h('option',{value:d.code,selected:d.code==='GER'||null},d.code+' · '+d.name))};
    pintaDisc();proj.onchange=()=>{pintaDisc();if(fl.checked)pintaFluxo()};
    box.append(h('div',{class:'row2'},field('Projeto',proj),field('Disciplina',disc)),h('div',{class:'row2'},field('Tipo de documento',tipo),field('Título',tit)))}
  // o que vai no PDF
  const shCk=WB.sheets.map(s=>{const c=h('input',{type:'checkbox',checked:(s.maxR>=0)||null,'data-id':s.id});return h('label',{class:'chk'},c,s.name)});
  const orient=sel([['landscape','Paisagem'],['portrait','Retrato']],'landscape'),fit=h('input',{type:'checkbox',checked:true}),grid=h('input',{type:'checkbox',checked:true}),rep=h('input',{type:'checkbox',checked:true}),bi=h('input',{type:'checkbox',checked:biHasContent()||null,disabled:!biHasContent()||null});
  const pdfBox=h('details',{class:'adv'},h('summary',{},'Páginas do PDF'),h('div',{class:'advg'},...shCk),h('div',{class:'row2'},field('Orientação (A4)',orient),h('div',{class:'dstack',style:{gap:'4px',marginTop:'18px'}},h('label',{class:'chk'},fit,'Ajustar a largura à página'),h('label',{class:'chk'},grid,'Linhas de grade'))),
    h('label',{class:'chk'},rep,'Repetir as linhas congeladas no topo de cada página'),h('label',{class:'chk'},bi,'Incluir o resumo do modelo e dos relatórios de BI'));
  box.append(pdfBox);
  // fluxo de verificação
  const fl=h('input',{type:'checkbox'});const flBox=h('div',{class:'dstack',hidden:true});let fluxos=op?op.fluxos:null;
  const pid=()=>v?v.projeto.id:proj.value;
  const pintaFluxo=async()=>{flBox.hidden=false;flBox.innerHTML='';flBox.append(h('div',{class:'small'},'Carregando a equipe do projeto…'));
    try{if(!fluxos)fluxos=(await api('/api/gpdocs/opcoes')).fluxos;const T=fluxos.filter(t=>!t.project_id||t.project_id===pid());
      if(!T.length){flBox.innerHTML='';flBox.append(h('div',{class:'small'},'Nenhum fluxo de verificação disponível para este projeto no Docs.'));return}
      const mem=await api(`/api/gpdocs/projetos/${pid()}/membros`);const pode=(papel,req)=>papel==='ADMIN'||papel===req||(req==='REVISOR'&&papel==='CONTROLADOR');
      const desenha=t=>{flBox.innerHTML='';const ts=sel(T.map(x=>[x.id,x.name]),t.id);ts.id='dxTpl';ts.onchange=()=>desenha(T.find(x=>x.id===ts.value));flBox.append(field('Fluxo',ts));
        for(const s of t.steps){const ok=mem.filter(m=>pode(m.role,s.role_required)&&m.email.toLowerCase()!==SRV.me.email).sort((x,y)=>(y.role===s.role_required)-(x.role===s.role_required));
          const ss=sel(ok.length?ok.map(m=>[m.id,m.name+' · '+m.role]):[['','ninguém com perfil '+s.role_required+' no projeto']],'');ss.dataset.step=s.step_order;flBox.append(field(`${s.step_order}. ${s.name}`,ss))}
        flBox.append(h('div',{class:'small'},'Prazos e regras seguem o fluxo do Docs; quem envia não pode aprovar a própria revisão.'))};desenha(T[0])}
    catch(e){flBox.innerHTML='';flBox.append(h('div',{class:'small badt'},e.message))}};
  fl.onchange=()=>{if(fl.checked)pintaFluxo();else flBox.hidden=true};
  const prog=h('div',{class:'preview',hidden:true}),err=h('div',{class:'small badt'});
  box.append(h('label',{class:'chk'},fl,'Enviar para verificação no Docs'),flBox,prog,err);
  const enviar=async()=>{err.textContent='';const passo=t=>{prog.hidden=false;prog.textContent=t};
    const o={sheets:shCk.map(l=>l.firstChild).filter(c=>c.checked).map(c=>c.dataset.id),orient:orient.value,fit:fit.checked,grid:grid.checked,repeat:rep.checked,bi:bi.checked};
    if(!o.sheets.length){err.textContent='Escolha ao menos uma planilha para o PDF';return}
    let fluxo=null;if(fl.checked){const t=$('#dxTpl',flBox);if(!t){err.textContent='Escolha o fluxo de verificação';return}const as={};for(const s of $$('[data-step]',flBox)){if(!s.value){err.textContent='Falta responsável numa etapa do fluxo';return}as[s.dataset.step]=s.value}fluxo={template_id:t.value,assignees:as}}
    const id=APP.book.id;const btnE=$('.dlg footer .tb.primary');if(btnE)btnE.disabled=true;
    try{passo('Preparando o documento no Docs…');
      const p=await api(`/api/gpdocs/preparar/${encodeURIComponent(id)}`,{method:'POST',body:v?{descricao:desc?desc.value:null}:{projetoId:proj.value,disciplina:disc.value,tipo:tipo.value,titulo:tit.value.trim()}});
      if(!APP.book||APP.book.id!==id)throw new Error('A pasta aberta mudou durante o envio');
      passo(`${p.codigo} · rev. ${p.revisaoLabel}: gerando o Excel…`);const xlsx=await bytesB64(buildXLSX());
      passo(`${p.codigo} · rev. ${p.revisaoLabel}: gerando o PDF e enviando PDF, Excel e arquivo nativo…`);
      const r=await api(`/api/gpdocs/enviar/${encodeURIComponent(id)}`,{method:'POST',body:{revisaoId:p.revisaoId,html:htmlParaPdf(p.codigo,p.revisaoLabel,o),xlsx,fluxo}});
      DX.v=r.vinculo;DX.id=id;DX.assin='';pintaEdms();DLG_CLOSE&&DLG_CLOSE();toast(`Enviado ao Docs: ${p.codigo} rev. ${p.revisaoLabel}${fluxo?' — em verificação':''}`)}
    catch(e){err.textContent=e.message;prog.hidden=true;syncEdms(true)}finally{if(btnE)btnE.disabled=false}};
  dlg('Enviar ao GPlanSiS|Docs',box,[{label:'Cancelar'},{label:'Enviar ao Docs',primary:true,act:()=>{enviar();return false}}],{wide:true})}

/* ---- entrada única vinda do Docs e endereço #s<id> ---- */
async function ssoEntrada(){const sso=new URLSearchParams(location.search).get('sso');if(!sso||SRV.local)return false;
  history.replaceState(null,'',location.pathname+location.hash);
  try{const r=await api('/api/auth/sso',{method:'POST',body:{token:sso}});if(r.para)history.replaceState(null,'',location.pathname+r.para);setMe(r);return true}
  catch(e){showLogin(e.message);return'erro'}}
const pastaDoEndereco=()=>{const m=/^#s([A-Za-z0-9]{4,40})$/.exec(location.hash);return m?m[1]:null};
addEventListener('hashchange',()=>{const id=pastaDoEndereco();if(!id||!APP.ready)return;history.replaceState(null,'',location.pathname);if(!APP.book||APP.book.id!==id)openBook(id)});

/* ---- Configurações › Integrações ---- */
function cfgInteg(V){const box=h('div',{},h('div',{class:'small'},'Verificando…'));V.append(box);
  api('/api/gpdocs/status').then(s=>{box.innerHTML='';const L=(k,v)=>[h('span',{class:'small'},k),h('span',{},v)];
    box.append(card('GPlanSiS|Docs','Pastas viram documentos controlados no Docs (lista mestra, revisões e fluxo de verificação). Cada envio leva PDF, Excel e o arquivo nativo; revisões e comentários voltam para cá. Entrada única entre os dois sistemas.',
      h('div',{class:'keyst '+(s.ativa?(s.alcance&&s.alcance.ok?'on':'bad'):'off')},h('i',{class:'kd'}),h('div',{},h('b',{},s.ativa?(s.alcance&&s.alcance.ok?'Integração ligada':'Ligada, mas o Docs não respondeu'):'Integração desligada'),
        h('div',{class:'small'},s.ativa?`Alcance a partir do servidor: ${s.alcance?s.alcance.detalhe+' · '+s.alcance.ms+' ms':'—'}`:'Falta o segredo compartilhado (SHEETS_DOCS_SEGREDO aqui e INTEGRACAO_SHEETS_SEGREDO no Docs).'))),
      h('div',{class:'kv'},...L('Endereço',s.url),...L('Pastas vinculadas',String(s.vinculadas)),...L('Em verificação',String(s.emVerificacao)),...L('Comentários abertos',String(s.comentariosAbertos)),...L('Eventos do Docs chegam em',s.webhook)),
      h('div',{class:'small'},'Quem envia: pessoas com a permissão "Enviar pastas ao GPlanSiS|Docs" e papel de Autor, Controlador ou Administrador no projeto do Docs (mesmo e-mail nos dois sistemas).'),
      actions(btn('Abrir o Docs',()=>abrirNoDocs('/sheets'),true))))}).catch(e=>{box.textContent=e.message})}
