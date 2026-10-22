'use strict';
/* ================= servidor: sessão, permissões e pastas no servidor =================
   Aberto por http(s) o sistema exige login e guarda as pastas no servidor (com versão,
   compartilhamento e auditoria). Aberto como arquivo (versão offline) funciona como antes,
   no armazenamento local do navegador. */
const SRV={me:null,org:null,ai:false,roles:{},perms:{},version:'',local:location.protocol==='file:'};
const LV={none:0,view:1,edit:2,owner:3};
const LV_TXT={owner:'Dono',edit:'Pode editar',view:'Somente leitura'};
const VIS_TXT={'private':'Privada (só quem eu escolher)','org-view':'Toda a organização pode ver','org-edit':'Toda a organização pode editar'};
APP.book=null;APP.lastKey=null;APP.baseBI=null;APP.ready=false;APP.origin=null;
const can=p=>SRV.local||!!(SRV.me&&SRV.me.perms.includes(p));
const bookLevel=()=>APP.book?LV[APP.book.level]||0:LV.owner;
const canEditBook=()=>SRV.local||(can('books.edit')&&(APP.book?bookLevel()>=LV.edit:can('books.create')));
const canEditBI=()=>SRV.local||(can('bi.edit')&&(APP.book?bookLevel()>=LV.edit:can('books.create')));
const fmtWhen=t=>t?new Date(t*1000).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'';
const fmtBytes=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const roleName=r=>(SRV.roles[r]&&SRV.roles[r].n)||r;

async function api(path,{method='GET',body}={}){
  const o={method,headers:{},credentials:'same-origin'};
  if(method!=='GET')o.headers['X-Requested-With']='sheets';
  if(body!==undefined){o.headers['Content-Type']='application/json';o.body=JSON.stringify(body)}
  let r;try{r=await fetch(path,o)}catch(e){const er=new Error('Sem conexão com o servidor');er.status=0;throw er}
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok){if(r.status===401&&!path.startsWith('/api/auth/'))sessionLost();if(r.status===428)forcePassword();
    const er=new Error((j&&typeof j.detail==='string'&&j.detail)||('Erro '+r.status));er.status=r.status;er.data=j;throw er}
  return j}

/* ---- avatar ---- */
const initials=n=>String(n||'?').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';
function avatarEl(u,size=28,extra={}){const st={width:size+'px',height:size+'px',fontSize:Math.round(size*.4)+'px'};
  if(u&&u.avatar)return h('img',{class:'avatar',src:u.avatar,alt:'',style:st,...extra});
  return h('span',{class:'avatar',style:{...st,background:(u&&u.color)||'var(--aco)'},'aria-hidden':'true',...extra},initials(u&&u.name))}

/* ---- tela de acesso ---- */
function authCard(...kids){const A=$('#auth');A.innerHTML='';A.hidden=false;
  A.append(h('div',{class:'acard'},h('div',{class:'abrand'},h('img',{src:'favicon.svg',alt:'',width:36,height:36}),h('div',{},h('div',{class:'an'},'GPlanSiS',h('span',{},'|Sheets')),h('div',{class:'small'},(SRV.org&&SRV.org.name)||'Planilha avançada com BI integrado'))),...kids));
  setTimeout(()=>{const f=A.querySelector('input');f&&f.focus()},30)}
function showLogin(msg){const em=inp(LS.get('gps-last-email','')||'',{type:'email',autocomplete:'username',placeholder:'voce@empresa.com.br'});
  const pw=inp('',{type:'password',autocomplete:'current-password'});const err=h('div',{class:'aerr',role:'alert'},msg||'');
  const btn=h('button',{class:'tb primary abtn',type:'submit'},'Entrar');
  const eye=h('button',{class:'ibtn',type:'button',title:'Mostrar senha',onclick:()=>{pw.type=pw.type==='password'?'text':'password'}},icoEl('eye'));
  const f=h('form',{class:'aform',onsubmit:async e=>{e.preventDefault();err.textContent='';btn.disabled=true;btn.textContent='Entrando…';
    try{const r=await api('/api/auth/login',{method:'POST',body:{email:em.value,password:pw.value}});LS.set('gps-last-email',em.value.trim().toLowerCase());setMe(r);
      if(r.user.must_change)forcePassword();else enterApp()}
    catch(ex){err.textContent=ex.message;pw.select()}finally{btn.disabled=false;btn.textContent='Entrar'}}},
    field('E-mail',em),field('Senha',h('div',{class:'pwrow'},pw,eye)),err,btn,h('div',{class:'small',style:{textAlign:'center'}},'Acesso restrito. Esqueceu a senha? Peça ao administrador uma senha temporária.'));
  authCard(f)}
function forcePassword(){if(!SRV.me)return showLogin();const min=(SRV.org&&SRV.org.pw_min)||10;
  const cur=inp('',{type:'password',autocomplete:'current-password'}),n1=inp('',{type:'password',autocomplete:'new-password'}),n2=inp('',{type:'password',autocomplete:'new-password'});
  const meter=pwMeter(n1,min);const err=h('div',{class:'aerr',role:'alert'});const btn=h('button',{class:'tb primary abtn',type:'submit'},'Definir senha e entrar');
  const f=h('form',{class:'aform',onsubmit:async e=>{e.preventDefault();err.textContent='';if(n1.value!==n2.value){err.textContent='A confirmação não confere.';return}
    btn.disabled=true;try{await api('/api/me/password',{method:'POST',body:{current:cur.value,new:n1.value}});setMe(await api('/api/me'));toast('Senha definida');enterApp()}catch(ex){err.textContent=ex.message}finally{btn.disabled=false}}},
    h('p',{style:{margin:'0 0 4px'}},'Olá, ',h('b',{},SRV.me.name),'. Antes de continuar, defina uma senha pessoal.'),
    field('Senha atual (temporária)',cur),field('Nova senha',n1),meter,field('Confirmar nova senha',n2),err,btn,
    h('button',{class:'tb ghost',type:'button',onclick:()=>logout()},'Sair'));
  authCard(f)}
function pwMeter(input,min){const bar=h('div',{class:'pwbar'},h('i')),txt=h('div',{class:'small'},`Mínimo ${min} caracteres e três tipos entre minúsculas, maiúsculas, números e símbolos.`);
  const upd=()=>{const v=input.value;const kinds=[/[a-z]/,/[A-Z]/,/\d/,/[^\w]/].filter(r=>r.test(v)).length;const sc=Math.min(4,(v.length>=min?1:0)+(kinds>=3?1:0)+(v.length>=min+4?1:0)+(kinds===4?1:0));
    bar.firstChild.style.width=(sc*25)+'%';bar.firstChild.style.background=['var(--danger)','var(--danger)','var(--amber)','var(--ok)','var(--ok)'][sc]};
  input.addEventListener('input',upd);upd();return h('div',{class:'fld'},bar,txt)}
function setMe(r){SAMPLE=undefined;SRV.me=r.user;SRV.docs=!!r.docs;SRV.docsUrl=r.docsUrl||'';SRV.org=r.org;SRV.ai=r.ai;SRV.roles=r.roles||SRV.roles;SRV.perms=r.perms||SRV.perms;SRV.version=r.version||SRV.version;renderAccount()}
let LOST=false;
function sessionLost(){if(LOST||!SRV.me)return;LOST=true;showLogin('Sua sessão expirou. Entre de novo; o que não foi salvo continua na tela.')}
async function logout(){try{await flushSave()}catch(e){}try{await api('/api/auth/logout',{method:'POST'})}catch(e){}location.reload()}

/* ---- entrada no sistema ---- */
let BOOTED=false;
async function start(){if(SRV.local){boot();return}
  const sso=await ssoEntrada();if(sso==='erro')return;
  if(!sso){try{setMe(await api('/api/me'))}catch(e){if(e.status===0){return showLogin('Servidor indisponível. Tente de novo em instantes.')}return showLogin()}}
  if(SRV.me.must_change)return forcePassword();enterApp()}
async function enterApp(){$('#auth').hidden=true;$('#auth').innerHTML='';applyPrefs();
  if(LOST){LOST=false;renderAccount();toast('Sessão restabelecida');save();return}
  if(!BOOTED){BOOTED=true;boot()}renderAccount();
  const p=SRV.me.prefs||{};const draft=LS.get(draftKey(),null);
  if(draft&&draft.data&&await offerDraft(draft))return finishEnter(p);
  const last=LS.get('gps-last-'+SRV.me.id,null);let ok=false;const want=pastaDoEndereco();
  if(want){history.replaceState(null,'',location.pathname);try{await loadBook(want);ok=true}catch(e){toast('Pasta não encontrada ou sem acesso para a sua conta','err')}}
  if(!ok&&last){try{await loadBook(last);ok=true}catch(e){}}
  if(!ok){try{const L=await api('/api/books');if(L.length){await loadBook(L[0].id);ok=true}}catch(e){}}
  if(!ok){if(can('books.create')){resetBook('Demonstração');APP.ready=true;loadDemo()}else{resetBook();WB=newWorkbook('Sem pastas');afterLoad();APP.lastKey=saveKey(serializeWB());setTimeout(()=>dlgOpen(),300)}}
  finishEnter(p)}
function finishEnter(p){APP.ready=true;if(p.startMode==='bi'&&APP.mode!=='bi')setMode('bi');if(p.zoom)setZoom(+p.zoom);updateBookUI();
  if(SRV.org&&SRV.org.banner){const b=$('#banner');b.textContent=SRV.org.banner;b.hidden=false}
  $('#aiB').title=SRV.ai&&can('ai.use')?'Assistente de IA (Claude)':'Assistente de IA (desativado neste servidor ou sem permissão)';
  if(!HEAD_T)HEAD_T=setInterval(pollHead,25000);agendaEdms();syncEdms(false)}
function applyPrefs(){const p=(SRV.me&&SRV.me.prefs)||{};const d=document.documentElement;if(p.theme==='light'||p.theme==='dark')d.dataset.theme=p.theme;else if(p.theme==='system')delete d.dataset.theme;if(BOOTED){readPal();draw()}}
async function savePrefs(patch){const prefs={...(SRV.me.prefs||{}),...patch};const r=await api('/api/me',{method:'PATCH',body:{prefs}});setMe(r);return r}

/* ---- conta (barra superior) ---- */
function renderAccount(){const b=$('#acctB');if(!b||SRV.local||!SRV.me){b&&(b.hidden=true);return}b.hidden=false;b.innerHTML='';b.append(avatarEl(SRV.me,28));b.title=SRV.me.name+' · '+roleName(SRV.me.role)}
function accountMenu(el){const u=SRV.me;const head=h('div',{class:'acmh'},avatarEl(u,40),h('div',{},h('b',{},u.name),h('div',{class:'small'},u.email),h('span',{class:'tag'},roleName(u.role))));
  menuAt(el,[{el:head},'-',{label:'Configurações',icon:'gear',act:()=>{CFG.sec='perfil';setMode('cfg')}},{label:'Alterar foto e perfil',icon:'user',act:()=>{CFG.sec='perfil';setMode('cfg')}},{label:'Segurança e sessões',icon:'lock',act:()=>{CFG.sec='seg';setMode('cfg')}},
    (can('users.manage')||can('system.settings')||can('audit.view'))?{label:'Administração',icon:'shield',act:()=>{CFG.sec=can('users.manage')?'users':'painel';setMode('cfg')}}:null,'-',
    docsOn()?{label:'Abrir o GPlanSiS|Docs',icon:'link',act:()=>abrirNoDocs('/sheets')}:null,
    {label:'Tema claro/escuro',icon:'theme',act:()=>{toggleTheme();savePrefs({theme:document.documentElement.dataset.theme}).catch(()=>{})}},
    {label:'Sair',icon:'logout',act:()=>logout()}])}

/* ---- estado da pasta ---- */
function resetBook(origin){APP.book=null;APP.lastKey=null;APP.baseBI=null;APP.origin=origin||null;DX.v=null;DX.id=null;updateBookUI();pintaEdms()}
function setBook(r){APP.book={id:r.id,ver:r.ver,level:r.level,name:r.name,owner:r.owner,mine:r.mine,vis:r.vis,updated_by:r.updated_by,updated:r.updated};
  if(SRV.me)LS.set('gps-last-'+SRV.me.id,r.id);updateBookUI();if(DX.id!==r.id){DX.v=null;DX.id=null;DX.assin='';pintaEdms();setTimeout(()=>syncEdms(false),80)}}
function saveKey(d){return JSON.stringify({...d,id:'',active:0,bi:d.bi?{...d.bi,page:0,view:''}:null})}
function updateBookUI(){if(SRV.local)return;const ro=!canEditBook();$('#fname').disabled=ro;const t=$('#roTag');
  t.hidden=!ro&&canEditBI();t.textContent=ro?(canEditBI()?'Planilha somente leitura':'Somente leitura'):'BI somente leitura';
  t.title=ro?'Você pode ver esta pasta, mas não alterar as planilhas.':'Você pode editar as planilhas, mas não o modelo e os relatórios de BI.';
  const sb=$('#shareB');sb.hidden=!APP.book||!can('books.share')||!(APP.book.level==='owner'||can('books.all'))}
function saveStatus(s,kind=''){const e=$('#saveSt');if(!e)return;e.textContent=s;e.className=kind;e.hidden=!s}
function guardEdit(){if(canEditBook())return true;toast(APP.book?'Esta pasta está aberta somente para leitura':'Sem permissão para criar ou editar pastas','err');return false}

async function loadBook(id,{keepView=false}={}){const r=await api('/api/books/'+encodeURIComponent(id));APP.ready=false;
  const keep=keepView?{a:WB.active,sel:{...UI.sel},act:{...UI.act},mode:APP.mode,pg:BI&&BI.page}:null;
  loadWB(r.data);APP.baseBI=r.data.bi||null;setBook(r);APP.origin=null;afterLoad();
  if(keep){WB.active=Math.min(keep.a,WB.sheets.length-1);renderTabs();if(keep.pg!=null&&BI.pages[keep.pg])BI.page=keep.pg;UI.sel=keep.sel;UI.act=keep.act;onSelChange();if(keep.mode==='bi')biRenderAll();draw()}
  APP.lastKey=saveKey(serializeWB());APP.ready=true;saveStatus('Salvo');return r}

/* ---- salvar ---- */
let SAVING=null,SAVE_AGAIN=false,SAVE_EXPL=false,RETRY_T=null;
function save(explicit){if(SRV.local)return saveLocal(explicit);if(!APP.ready||!SRV.me||LOST)return Promise.resolve(false);
  WB.name=$('#fname').value.trim()||WB.name;if(SAVING){SAVE_AGAIN=true;SAVE_EXPL=SAVE_EXPL||!!explicit;return SAVING}
  SAVING=doSave(explicit).finally(()=>{SAVING=null;if(SAVE_AGAIN){const ex=SAVE_EXPL;SAVE_AGAIN=SAVE_EXPL=false;save(ex)}});return SAVING}
async function flushSave(){if(SRV.local)return;if(SAVING)await SAVING;await save()}
const draftKey=()=>'gps-draft-'+(SRV.me?SRV.me.id:0);
async function doSave(explicit){const data=serializeWB();if(APP.book&&!canEditBI())data.bi=APP.baseBI;const key=saveKey(data);
  if(key===APP.lastKey){if(explicit)toast('Tudo salvo');return true}
  if(!canEditBook()&&!(APP.book&&canEditBI())){if(explicit)toast(APP.book?'Esta pasta está aberta somente para leitura':'Sem permissão para criar pastas','err');saveStatus(APP.book?'Somente leitura':'Não salvo','warn');return false}
  saveStatus('Salvando…');
  try{if(!APP.book){const r=await api('/api/books',{method:'POST',body:{data,origin:APP.origin||'Nova pasta'}});WB.id=r.id;setBook(r);APP.baseBI=data.bi;APP.origin=null}
    else{const r=await api('/api/books/'+APP.book.id,{method:'PUT',body:{data,base:APP.book.ver}});APP.book.ver=r.ver;APP.baseBI=data.bi}
    APP.lastKey=key;LS.del(draftKey());clearTimeout(RETRY_T);saveStatus('Salvo');if(explicit)toast('Salvo no servidor');return true}
  catch(e){if(e.status===409)return conflictDlg(e.data||{},data);
    if(e.status===0||e.status>=500){LS.set(draftKey(),{book:APP.book&&APP.book.id,base:APP.book&&APP.book.ver,name:WB.name,data,at:Date.now()});saveStatus('Sem conexão · guardado neste navegador','warn');clearTimeout(RETRY_T);RETRY_T=setTimeout(()=>save(),15000);if(explicit)toast('Sem conexão: as alterações ficaram guardadas neste navegador e serão enviadas assim que possível','err');return false}
    if(e.status===401)return false;saveStatus('Não salvo','err');toast('Não foi possível salvar: '+e.message,'err');return false}}
function conflictDlg(info,mine){saveStatus('Conflito de versão','err');const who=info.updated_by?info.updated_by.name:'outra pessoa';
  const owner=APP.book&&(APP.book.level==='owner'||can('books.all'));
  dlg('Esta pasta mudou no servidor',h('div',{},h('p',{style:{margin:0}},`${who} salvou uma versão mais nova (${fmtWhen(info.updated)}) enquanto você editava.`),h('p',{class:'small'},'Escolha o que fazer com as suas alterações. Nada é perdido sem você confirmar: a versão do servidor fica no histórico.')),
    [{label:'Salvar a minha como cópia',act:()=>{if(!can('books.create')){toast('Sem permissão para criar pastas','err');return false}WB.name=(WB.name+' (minha versão)').slice(0,150);$('#fname').value=WB.name;resetBook('Cópia por conflito de versão');save(true)}},
     owner?{label:'Sobrescrever com a minha',act:()=>{api('/api/books/'+APP.book.id,{method:'PUT',body:{data:mine,base:APP.book.ver,force:true}}).then(r=>{APP.book.ver=r.ver;APP.lastKey=saveKey(mine);saveStatus('Salvo');toast('Versão do servidor substituída (a anterior está no histórico)')}).catch(e=>toast(e.message,'err'))}}:null,
     {label:'Descartar as minhas e recarregar',primary:true,act:()=>{loadBook(APP.book.id,{keepView:true}).then(()=>toast('Pasta recarregada do servidor'))}}].filter(Boolean));
  return false}
async function offerDraft(d){const when=new Date(d.at).toLocaleString('pt-BR');
  return new Promise(res=>{let busy=false;dlg('Alterações não enviadas',h('div',{},h('p',{style:{margin:0}},`Há alterações de "${d.name||'Pasta'}" feitas em ${when} que não chegaram ao servidor.`),h('p',{class:'small'},'Recuperar abre essas alterações e tenta salvá-las. Se a pasta mudou no servidor nesse meio-tempo, você poderá escolher o que fazer.')),
    [{label:'Descartar',act:()=>{LS.del(draftKey());res(false)}},{label:'Recuperar',primary:true,act:()=>{busy=true;(async()=>{try{if(d.book){const r=await api('/api/books/'+d.book);setBook({...r,ver:d.base});APP.baseBI=r.data.bi||null}else resetBook('Recuperado');
      APP.ready=false;loadWB(d.data);afterLoad();APP.lastKey=null;APP.ready=true;await save(true);res(true)}catch(e){toast('Não foi possível recuperar: '+e.message,'err');res(false)}})()}}],{onClose:()=>{if(!busy)res(false)}})})}

/* ---- versão mais nova no servidor e presença ---- */
let HEAD_T=null;
async function pollHead(){if(!APP.book||!APP.ready||LOST||document.visibilityState!=='visible')return;
  try{const r=await api('/api/books/'+APP.book.id+'/head');const P=$('#presence');P.innerHTML='';
    for(const u of r.viewers.slice(0,4))P.append(avatarEl(u,24,{title:u.name+' também está nesta pasta'}));if(r.viewers.length>4)P.append(h('span',{class:'small'},'+'+(r.viewers.length-4)));
    if(r.level!==APP.book.level){APP.book.level=r.level;updateBookUI()}
    if(r.ver>APP.book.ver&&!SAVING&&!UI.ed){const dirty=saveKey(serializeWB())!==APP.lastKey;
      if(!dirty){await loadBook(APP.book.id,{keepView:true});toast('Atualizado com as alterações de '+(r.updated_by?r.updated_by.name:'outra pessoa'))}
      else saveStatus('Há uma versão mais nova no servidor','warn')}}
  catch(e){if(e.status===404){toast('Esta pasta foi removida ou o seu acesso foi revogado','err');resetBook();saveStatus('Sem acesso','err')}}}

/* ---- abrir, compartilhar, versões, lixeira ---- */
function newBook(){if(SRV.local)return newBookLocal();if(!can('books.create'))return toast('Sem permissão para criar pastas','err');
  flushSave().finally(()=>{resetBook('Nova pasta');WB=newWorkbook('Pasta nova');biLoad(null);HIST.undo=[];HIST.redo=[];afterLoad();save()})}
async function openDemo(){if(!can('books.create'))return toast('Sem permissão para criar pastas','err');await flushSave();resetBook('Demonstração');loadDemo()}
async function openBook(id){await flushSave();try{await loadBook(id);toast('Pasta aberta: '+WB.name)}catch(e){toast(e.message,'err')}}
async function dlgOpen(){if(SRV.local)return dlgOpenLocal();let tab='mine',q='',rows=[],rowsTrash=null;const L=h('div',{class:'list',style:{maxHeight:'52vh'}});
  const tabs=h('div',{class:'segs'});const search=inp('',{placeholder:'Pesquisar pela pasta ou pelo dono',type:'search'});
  const load=async()=>{L.innerHTML='';L.append(h('div',{class:'li small'},'Carregando…'));rowsTrash=tab==='trash';try{rows=await api('/api/books'+(rowsTrash?'?trash=1':''))}catch(e){rows=[];L.innerHTML='';L.append(h('div',{class:'li small'},e.message));return}render()};
  const render=()=>{L.innerHTML='';const Q=stripAcc(q.toLowerCase());
    const list=rows.filter(b=>tab==='trash'||(tab==='mine'?b.mine:!b.mine)).filter(b=>!Q||stripAcc((b.name+' '+(b.owner&&b.owner.name||'')).toLowerCase()).includes(Q));
    if(!list.length)L.append(h('div',{class:'li small'},tab==='trash'?'A lixeira está vazia.':tab==='mine'?'Você ainda não tem pastas. Use Nova pasta ou Importar.':'Nenhuma pasta compartilhada com você.'));
    for(const b of list){const cur=APP.book&&APP.book.id===b.id;
      const meta=h('div',{class:'small'},`${b.sheets} planilha(s)${b.has_bi?' · BI':''} · ${fmtBytes(b.size)} · ${b.updated_by?b.updated_by.name+', ':''}${fmtWhen(b.updated)}`);
      const acts=h('div',{class:'bacts'});
      if(tab==='trash'){acts.append(h('button',{class:'tb',onclick:async e=>{e.stopPropagation();try{await api('/api/books/'+b.id+'/restore',{method:'POST'});toast('Pasta restaurada');load()}catch(x){toast(x.message,'err')}}},'Restaurar'),
        h('button',{class:'ibtn',title:'Excluir definitivamente',onclick:async e=>{e.stopPropagation();if(!confirm(`Excluir "${b.name}" definitivamente? O histórico de versões também é apagado.`))return;try{await api('/api/books/'+b.id+'?hard=1',{method:'DELETE'});load()}catch(x){toast(x.message,'err')}}},icoEl('trash')))}
      else acts.append(...[h('span',{class:'tag'},LV_TXT[b.level]||b.level),b.vis!=='private'?h('span',{class:'tag',title:VIS_TXT[b.vis]},'Organização'):null,h('button',{class:'ibtn',title:'Mais ações',onclick:e=>{e.stopPropagation();bookMenu(b,e.currentTarget,load)}},icoEl('dots'))].filter(Boolean));
      L.append(h('div',{class:'li'+(cur?' on':''),onclick:()=>{if(tab==='trash')return;DLG_CLOSE();openBook(b.id)}},avatarEl(b.owner,26,{title:b.owner?b.owner.name:''}),h('div',{style:{minWidth:0,flex:1}},h('b',{class:'ell'},b.name+(cur?' (aberta)':'')),meta),acts))}};
  for(const [k,l] of [['mine','Minhas pastas'],['shared','Compartilhadas comigo'],['trash','Lixeira']])tabs.append(h('button',{class:'seg','aria-pressed':k===tab?'true':'false',onclick:e=>{tab=k;$$('.seg',tabs).forEach(x=>x.setAttribute('aria-pressed',x===e.currentTarget?'true':'false'));(tab==='trash')!==rowsTrash?load():render()}},l));
  search.oninput=()=>{q=search.value;render()};
  dlg('Abrir pasta',h('div',{},h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}},tabs,h('div',{style:{flex:'1',minWidth:'180px'}},search)),L),
    [can('import')?{label:'Importar arquivo…',act:()=>$('#fileIn').click()}:null,can('books.create')?{label:'Nova pasta',act:()=>newBook()}:null,{label:'Fechar',primary:true}].filter(Boolean),{wide:true});load()}
function bookMenu(b,el,reload){const owner=b.level==='owner'||can('books.all');
  menuAt(el,[{label:'Abrir',icon:'sheet',act:()=>{DLG_CLOSE&&DLG_CLOSE();openBook(b.id)}},
    {label:'Duplicar',icon:'copy',disabled:!can('books.create'),act:async()=>{try{await api('/api/books/'+b.id+'/duplicate',{method:'POST',body:{}});toast('Cópia criada');reload()}catch(e){toast(e.message,'err')}}},
    {label:'Compartilhar…',icon:'user',disabled:!(owner&&can('books.share')),act:()=>dlgShare(b.id)},
    {label:'Histórico de versões…',icon:'refresh',act:()=>dlgVersions(b.id,b.name)},'-',
    {label:'Mover para a lixeira',icon:'trash',disabled:!((b.level==='owner'&&can('books.delete'))||['master','admin'].includes(SRV.me.role)),act:async()=>{if(!confirm(`Mover "${b.name}" para a lixeira?`))return;try{await api('/api/books/'+b.id,{method:'DELETE'});if(APP.book&&APP.book.id===b.id){resetBook();saveStatus('Na lixeira','warn')}toast('Movida para a lixeira');reload()}catch(e){toast(e.message,'err')}}}])}
async function dlgShare(id){id=id||(APP.book&&APP.book.id);if(!id)return toast('Salve a pasta antes de compartilhar','err');
  let acl,dir;try{[acl,dir]=await Promise.all([api('/api/books/'+id+'/acl'),api('/api/directory')])}catch(e){return toast(e.message,'err')}
  const vis=sel(Object.entries(VIS_TXT),acl.vis);const entries=new Map(acl.acl.map(a=>[a.user.id,a.level]));const L=h('div',{class:'list',style:{maxHeight:'40vh'}});
  const pick=sel([['','Adicionar pessoa…'],...dir.filter(u=>u.id!==(acl.owner&&acl.owner.id)).map(u=>[u.id,u.name+' · '+u.email])],'');
  const render=()=>{L.innerHTML='';L.append(h('div',{class:'li'},avatarEl(acl.owner,26),h('div',{style:{flex:1}},h('b',{},acl.owner?acl.owner.name:'—'),h('div',{class:'small'},acl.owner?acl.owner.email:'')),h('span',{class:'tag'},'Dono')));
    for(const [uid,lv] of entries){const u=dir.find(x=>x.id===uid);if(!u)continue;const s=sel([['view','Pode ver'],['edit','Pode editar']],lv);s.style.width='auto';s.onchange=()=>entries.set(uid,s.value);
      L.append(h('div',{class:'li'},avatarEl(u,26),h('div',{style:{flex:1}},h('b',{},u.name),h('div',{class:'small'},u.email)),s,h('button',{class:'ibtn',title:'Remover acesso',onclick:()=>{entries.delete(uid);render()}},'×')))}};
  pick.onchange=()=>{if(pick.value){entries.set(+pick.value,'view');pick.value='';render()}};render();
  dlg('Compartilhar pasta',h('div',{class:'dstack'},field('Acesso geral',vis),field('Pessoas com acesso',L),pick,h('div',{class:'small'},'O acesso efetivo também depende do papel de cada pessoa: um Leitor nunca edita, mesmo com "Pode editar".')),
    [{label:'Cancelar'},{label:'Salvar',primary:true,act:()=>{api('/api/books/'+id+'/acl',{method:'PUT',body:{vis:vis.value,acl:[...entries].map(([uid,level])=>({uid,level}))}}).then(()=>{toast('Compartilhamento atualizado');if(APP.book&&APP.book.id===id)APP.book.vis=vis.value}).catch(e=>toast(e.message,'err'))}}])}
async function dlgVersions(id,name){id=id||(APP.book&&APP.book.id);if(!id)return toast('A pasta ainda não foi salva','err');let rows;try{rows=await api('/api/books/'+id+'/versions')}catch(e){return toast(e.message,'err')}
  const isCur=APP.book&&APP.book.id===id;const L=h('div',{class:'list',style:{maxHeight:'50vh'}});const KIND={auto:'Automática',named:'Nomeada'};
  if(!rows.length)L.append(h('div',{class:'li small'},'Nenhuma versão guardada ainda.'));
  for(const v of rows)L.append(h('div',{class:'li'},avatarEl(v.by,24),h('div',{style:{flex:1,minWidth:0}},h('b',{class:'ell'},v.note||KIND[v.kind]||'Versão'),h('div',{class:'small'},`${fmtWhen(v.at)} · ${v.by?v.by.name:'—'} · v${v.ver} · ${fmtBytes(v.size)}`)),h('span',{class:'tag'},KIND[v.kind]||v.kind),
    h('button',{class:'tb',title:'Abrir esta versão como uma pasta nova',disabled:!can('books.create')||null,onclick:async()=>{try{const r=await api(`/api/books/${id}/versions/${v.id}`);await flushSave();resetBook('Cópia da versão de '+fmtWhen(v.at));DLG_CLOSE();loadWB({...r.data,name:(r.data.name||'Pasta')+' (versão de '+fmtWhen(v.at)+')'});afterLoad();toast('Versão aberta como cópia; ela será salva como uma pasta nova')}catch(e){toast(e.message,'err')}}},'Abrir cópia'),
    h('button',{class:'tb',disabled:!can('books.edit')||null,onclick:async()=>{if(!confirm('Restaurar esta versão? A atual fica guardada no histórico.'))return;try{if(isCur)await flushSave();await api(`/api/books/${id}/versions/${v.id}/restore`,{method:'POST'});DLG_CLOSE();if(isCur)await loadBook(id,{keepView:true});toast('Versão restaurada')}catch(e){toast(e.message,'err')}}},'Restaurar')));
  dlg('Histórico de versões'+(name?' · '+name:''),L,[isCur&&canEditBook()?{label:'Salvar versão nomeada…',act:()=>{namedVersion();}}:null,{label:'Fechar',primary:true}].filter(Boolean),{wide:true})}
async function namedVersion(){if(!APP.book)return toast('A pasta ainda não foi salva','err');const n=prompt('Nome da versão (ex.: Fechamento de outubro)');if(!n)return;
  try{await flushSave();await api('/api/books/'+APP.book.id+'/versions',{method:'POST',body:{note:n}});toast('Versão "'+n+'" guardada')}catch(e){toast(e.message,'err')}}
function logEvent(ev,fmt,file){if(SRV.local||!SRV.me)return;api('/api/events',{method:'POST',body:{ev,fmt,file,book:APP.book&&APP.book.id}}).catch(()=>{})}

/* ---- IA pelo servidor (mesma interface usada pelo m_ai.js) ---- */
const msgsText=m=>typeof m==='string'?m:(m||[]).map(x=>typeof x.content==='string'?x.content:(x.content||[]).map(c=>c.text||'').join('\n')).join('\n\n');
function serverSample(){
  const f=async(prompt,{onText,modelTier}={})=>{const r=await fetch('/api/ai/sample',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Requested-With':'sheets'},body:JSON.stringify({prompt:msgsText(prompt),tier:modelTier,kind:'texto'})});
    if(!r.ok){let d='';try{d=(await r.json()).detail}catch(e){}throw new Error(d||('Erro '+r.status))}
    const rd=r.body.getReader(),dec=new TextDecoder();let text='';
    for(;;){const {done,value}=await rd.read();if(done)break;text+=dec.decode(value,{stream:true});const i=text.indexOf('\u0000ERRO:');if(i>=0)throw new Error('falha no serviço de IA ('+text.slice(i+6).trim()+')');onText&&onText({text})}
    return text};
  f.json=async(msgs,opts={})=>(await api('/api/ai/json',{method:'POST',body:{prompt:msgsText(msgs),tier:opts.modelTier,kind:'json'}})).json;
  return f}
