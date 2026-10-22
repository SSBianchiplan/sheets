'use strict';
/* ================= modo Configurações: perfil, preferências, segurança e administração ================= */
const CFG={sec:'perfil',chart:null};
const AV_COLORS=['#EB6A20','#2F7DE1','#2F8F55','#8E24AA','#C8402E','#00838F','#5D4037','#3949AB','#F6A709','#2D3336'];
const CFG_SECS=[{k:'perfil',l:'Perfil e avatar',i:'user'},{k:'pref',l:'Preferências',i:'sliders'},{k:'seg',l:'Segurança',i:'lock'},{k:'perm',l:'Minhas permissões',i:'key'},
  {h:'Administração'},{k:'painel',l:'Painel do sistema',i:'pulse',need:['users.manage','system.settings','audit.view']},{k:'users',l:'Usuários',i:'users',need:['users.manage']},
  {k:'roles',l:'Papéis e permissões',i:'shield',need:['users.manage']},{k:'audit',l:'Auditoria',i:'list',need:['audit.view']},{k:'ia',l:'Inteligência artificial',i:'ai',need:['system.settings']},{k:'integ',l:'Integrações',i:'link',need:['system.settings']},{k:'sys',l:'Sistema',i:'server',need:['system.settings']}];
const cfgAllowed=s=>!s.need||s.need.some(p=>can(p));
function renderCfg(){if(CFG.chart){CFG.chart.dispose();CFG.chart=null}const N=$('#cfgNav');N.innerHTML='';const visible=CFG_SECS.filter(s=>s.h?CFG_SECS.some(x=>x.need&&cfgAllowed(x)):cfgAllowed(s));
  if(!visible.some(s=>s.k===CFG.sec))CFG.sec='perfil';
  for(const s of visible){if(s.h){N.append(h('div',{class:'cfgh'},s.h));continue}N.append(h('button',{class:'cfgb','aria-current':s.k===CFG.sec?'page':null,onclick:()=>{CFG.sec=s.k;renderCfg()}},icoEl(s.i),h('span',{},s.l)))}
  N.append(h('div',{class:'cfgfoot small'},`GPlanSiS|Sheets ${SRV.version||''}`));
  const V=$('#cfgView');V.innerHTML='';V.scrollTop=0;({perfil:cfgPerfil,pref:cfgPref,seg:cfgSeg,perm:cfgPerm,painel:cfgPainel,users:cfgUsers,roles:cfgRoles,audit:cfgAudit,ia:cfgIA,integ:cfgInteg,sys:cfgSys}[CFG.sec])(V)}
const card=(title,sub,...kids)=>h('section',{class:'card'},h('header',{},h('h2',{},title),sub?h('div',{class:'small'},sub):null),...kids);
const actions=(...b)=>h('div',{class:'cacts'},...b);
const btn=(label,act,primary,extra={})=>h('button',{class:'tb'+(primary?' primary':''),type:'button',onclick:act,...extra},label);
async function busy(b,f){b.disabled=true;try{return await f()}catch(e){toast(e.message,'err')}finally{b.disabled=false}}

/* ---- perfil ---- */
function cfgPerfil(V){const u=SRV.me;let avatar;let color=u.color;
  const big=h('div',{class:'avbig'},avatarEl(u,112));
  const file=h('input',{type:'file',accept:'image/png,image/jpeg,image/webp,image/gif',hidden:true,onchange:e=>{const f=e.target.files[0];e.target.value='';if(f)cropAvatar(f,url=>{avatar=url;big.innerHTML='';big.append(h('img',{class:'avatar',src:url,alt:'',style:{width:'112px',height:'112px'}}));save.disabled=false})}});
  const sw=h('div',{class:'swrow'},...AV_COLORS.map(c=>h('button',{class:'swc',type:'button',title:c,style:{background:c},'aria-pressed':c.toLowerCase()===(color||'').toLowerCase()?'true':'false',onclick:e=>{color=c;$$('.swc',sw).forEach(x=>x.setAttribute('aria-pressed',x===e.currentTarget?'true':'false'));if(!avatar&&!u.avatar){big.innerHTML='';big.append(avatarEl({...u,color},112))}save.disabled=false}})));
  const nm=inp(u.name,{maxlength:80}),ti=inp(u.title||'',{maxlength:80,placeholder:'Ex.: Engenheiro de processos'}),dp=inp(u.dept||'',{maxlength:80,placeholder:'Ex.: PCP'});
  [nm,ti,dp].forEach(i=>i.oninput=()=>save.disabled=false);
  const save=btn('Salvar perfil',()=>busy(save,async()=>{const body={name:nm.value,title:ti.value,dept:dp.value,color};if(avatar!==undefined)body.avatar=avatar;setMe(await api('/api/me',{method:'PATCH',body}));toast('Perfil atualizado');renderCfg()}),true,{disabled:true});
  V.append(card('Perfil e avatar','Como você aparece para as outras pessoas: no topo, no compartilhamento, no histórico de versões e na auditoria.',
    h('div',{class:'prof'},h('div',{class:'avcol'},big,file,btn('Enviar foto…',()=>file.click()),u.avatar||avatar?btn('Remover foto',()=>{avatar=null;big.innerHTML='';big.append(avatarEl({...u,avatar:null,color},112));save.disabled=false}):null,h('div',{class:'small'},'PNG, JPG ou WEBP. Você recorta antes de enviar.')),
      h('div',{class:'pform'},h('div',{class:'row2'},field('Nome',nm),field('E-mail',inp(u.email,{disabled:true}))),h('div',{class:'row2'},field('Cargo',ti),field('Departamento',dp)),
        field('Cor das iniciais (quando não há foto)',sw),h('div',{class:'kv'},h('span',{class:'small'},'Papel'),h('span',{},h('span',{class:'tag'},roleName(u.role))),h('span',{class:'small'},'Conta criada'),h('span',{},fmtWhen(u.created)),h('span',{class:'small'},'Último acesso'),h('span',{},fmtWhen(u.last_login)||'—')))),
    actions(save)))}
function cropAvatar(f,done){if(f.size>15*1048576)return toast('Imagem grande demais (máx. 15 MB)','err');const url=URL.createObjectURL(f);const img=new Image();
  img.onload=()=>{const S=280;const cv=h('canvas',{width:S,height:S,class:'cropcv'});const ctx=cv.getContext('2d');const base=Math.max(S/img.width,S/img.height);let z=1,ox=0,oy=0;
    const zoom=h('input',{type:'range',min:1,max:4,step:.01,value:1,style:{width:'100%'}});
    const lim=()=>{const w=img.width*base*z,hh=img.height*base*z;ox=clamp(ox,-(w-S)/2,(w-S)/2);oy=clamp(oy,-(hh-S)/2,(hh-S)/2)};
    const draw2=()=>{lim();const w=img.width*base*z,hh=img.height*base*z;ctx.clearRect(0,0,S,S);ctx.drawImage(img,(S-w)/2+ox,(S-hh)/2+oy,w,hh);ctx.save();ctx.fillStyle='rgba(0,0,0,.45)';ctx.beginPath();ctx.rect(0,0,S,S);ctx.arc(S/2,S/2,S/2-2,0,Math.PI*2,true);ctx.fill('evenodd');ctx.restore()};
    zoom.oninput=()=>{z=+zoom.value;draw2()};let drag=null;
    cv.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,ox,oy};cv.setPointerCapture(e.pointerId)};cv.onpointermove=e=>{if(!drag)return;ox=drag.ox+e.clientX-drag.x;oy=drag.oy+e.clientY-drag.y;draw2()};cv.onpointerup=()=>drag=null;
    cv.onwheel=e=>{e.preventDefault();z=clamp(z*(e.deltaY<0?1.08:1/1.08),1,4);zoom.value=z;draw2()};draw2();
    dlg('Recortar foto',h('div',{class:'dstack',style:{alignItems:'center'}},cv,h('div',{class:'small'},'Arraste para posicionar; use o controle ou a roda do mouse para aproximar.'),zoom),[{label:'Cancelar'},{label:'Usar esta foto',primary:true,act:()=>{
      const O=256;const out=h('canvas',{width:O,height:O});const o=out.getContext('2d');const k=O/S;const w=img.width*base*z,hh=img.height*base*z;o.imageSmoothingQuality='high';o.drawImage(img,((S-w)/2+ox)*k,((S-hh)/2+oy)*k,w*k,hh*k);
      let d=out.toDataURL('image/webp',.9);if(!d.startsWith('data:image/webp'))d=out.toDataURL('image/jpeg',.9);URL.revokeObjectURL(url);done(d)}}])};
  img.onerror=()=>{URL.revokeObjectURL(url);toast('Não foi possível ler a imagem','err')};img.src=url}

/* ---- preferências ---- */
function cfgPref(V){const p=SRV.me.prefs||{};const th=sel([['system','Acompanhar o sistema'],['light','Claro'],['dark','Escuro']],p.theme||'system'),sm=sel([['sheet','Planilha'],['bi','BI']],p.startMode||'sheet'),zm=sel([['0.8','80%'],['0.9','90%'],['1','100%'],['1.1','110%'],['1.25','125%'],['1.5','150%']],String(p.zoom||1));
  const save=btn('Salvar preferências',()=>busy(save,async()=>{await savePrefs({theme:th.value,startMode:sm.value,zoom:+zm.value});applyPrefs();setZoom(+zm.value);toast('Preferências salvas')}),true);
  V.append(card('Preferências','Valem para a sua conta em qualquer computador.',h('div',{class:'row2'},field('Tema',th),field('Abrir o sistema no módulo',sm)),h('div',{class:'row2'},field('Zoom padrão da planilha',zm),h('div')),actions(save)));
  if(can('export'))V.append(card('Versão offline','Um arquivo HTML único com a planilha e o BI, para usar sem servidor. Nele os dados ficam só no navegador, sem login nem compartilhamento.',actions(h('a',{class:'tb',href:'GPlanSiS-Sheets-offline.html',download:'GPlanSiS-Sheets-offline.html',onclick:()=>logEvent('exportou','offline','GPlanSiS-Sheets-offline.html')},'Baixar versão offline'))))}

/* ---- segurança ---- */
function cfgSeg(V){const min=(SRV.org&&SRV.org.pw_min)||10;const cur=inp('',{type:'password',autocomplete:'current-password'}),n1=inp('',{type:'password',autocomplete:'new-password'}),n2=inp('',{type:'password',autocomplete:'new-password'});
  const go=btn('Trocar senha',()=>busy(go,async()=>{if(n1.value!==n2.value)throw new Error('A confirmação não confere.');await api('/api/me/password',{method:'POST',body:{current:cur.value,new:n1.value}});cur.value=n1.value=n2.value='';toast('Senha trocada. As outras sessões foram encerradas.');renderCfg()}),true);
  V.append(card('Senha','Ao trocar a senha, todas as outras sessões abertas são encerradas.',h('div',{class:'row2'},field('Senha atual',cur),h('div')),h('div',{class:'row2'},field('Nova senha',n1),field('Confirmar',n2)),pwMeter(n1,min),actions(go)));
  const L=h('div',{class:'list'},h('div',{class:'li small'},'Carregando…'));V.append(card('Sessões ativas','Dispositivos em que a sua conta está conectada agora.',L));
  api('/api/me/sessions').then(rows=>{L.innerHTML='';for(const s of rows)L.append(h('div',{class:'li'},icoEl(/Mobile|Android|iPhone/.test(s.ua||'')?'sheet':'server'),h('div',{style:{flex:1,minWidth:0}},h('b',{class:'ell'},uaName(s.ua)+(s.current?' · esta sessão':'')),h('div',{class:'small'},`IP ${s.ip||'—'} · entrou ${fmtWhen(s.created)} · ativa ${fmtWhen(s.last_seen)}`)),
    s.current?h('span',{class:'tag'},'Atual'):h('button',{class:'tb',onclick:async e=>{await busy(e.currentTarget,()=>api('/api/me/sessions/'+s.id,{method:'DELETE'}));renderCfg()}},'Encerrar')))}).catch(e=>{L.innerHTML='';L.append(h('div',{class:'li small'},e.message))})}
const uaName=ua=>{ua=ua||'';const b=/Edg\//.test(ua)?'Edge':/OPR\//.test(ua)?'Opera':/Chrome\//.test(ua)?'Chrome':/Firefox\//.test(ua)?'Firefox':/Safari\//.test(ua)?'Safari':'Navegador';const o=/Windows/.test(ua)?'Windows':/Mac OS X/.test(ua)?'macOS':/Android/.test(ua)?'Android':/iPhone|iPad/.test(ua)?'iOS':/Linux/.test(ua)?'Linux':'';return b+(o?' · '+o:'')};

/* ---- permissões ---- */
function permList(perms){return h('div',{class:'plist'},...Object.entries(SRV.perms).map(([k,d])=>h('div',{class:'pi'+(perms.includes(k)?' on':'')},h('span',{class:'pk'},perms.includes(k)?'✓':'—'),h('span',{},d),h('span',{class:'code small'},k))))}
function cfgPerm(V){const u=SRV.me;const r=SRV.roles[u.role]||{};V.append(card('Minhas permissões',`Papel: ${r.n||u.role}. ${r.d||''}${u.custom?' Suas permissões foram personalizadas pelo administrador.':''}`,permList(u.perms),
  h('div',{class:'small'},'Além do papel, cada pasta tem o próprio nível de acesso (dono, pode editar, somente leitura), definido por quem a compartilha.')))}

/* ---- painel ---- */
function cfgPainel(V){const K=h('div',{class:'kpis'}),C=h('div',{class:'chart'}),T=h('div',{class:'list'}),R=h('div',{class:'list'}),AI=h('div',{class:'small'});
  V.append(card('Painel do sistema','Uso, segurança e armazenamento.',K),card('Atividade nos últimos 14 dias','Eventos auditados por dia e acessos (logins).',C),h('div',{class:'cgrid'},card('Eventos mais frequentes','',T),card('Pastas alteradas recentemente','',R)),card('Assistente de IA','',AI));
  api('/api/stats').then(s=>{const k=(l,v,sub,warn)=>K.append(h('div',{class:'kpi'+(warn?' warn':'')},h('div',{class:'kl'},l),h('div',{class:'kv2 num'},v),sub?h('div',{class:'small'},sub):null));
    k('Usuários ativos',s.users,s.users_inactive?s.users_inactive+' inativo(s)':'');k('Online agora',s.online,'últimos 15 min');k('Pastas',s.books,s.books_bi+' com BI · '+s.trash+' na lixeira');k('Versões guardadas',s.versions);
    k('Armazenamento',fmtBytes(s.bytes),'banco: '+fmtBytes(s.db_bytes));k('Logins em 24 h',s.logins_24h);k('Falhas de login em 24 h',s.fails_24h,'',s.fails_24h>=10);k('Eventos auditados',s.audit.toLocaleString('pt-BR'));
    for(const e of s.top_events)T.append(h('div',{class:'li'},h('span',{class:'code'},e.ev),h('span',{class:'meta num'},e.n.toLocaleString('pt-BR'))));
    if(!s.recent_books.length)R.append(h('div',{class:'li small'},'Nenhuma pasta ainda.'));for(const b of s.recent_books)R.append(h('div',{class:'li'},h('b',{class:'ell',style:{flex:1}},b.name),h('span',{class:'meta'},(b.owner||'')+' · '+fmtWhen(b.updated))));
    AI.textContent=s.ai_key?`Chave da Anthropic configurada · modelo ${s.ai_model}. Ajuste em Inteligência artificial.`:'Sem chave da Anthropic: o assistente funciona só por palavras-chave. O admin master cadastra a chave em Configurações › Inteligência artificial.';
    if(window.echarts){const cs=getComputedStyle(document.documentElement);const col=n=>cs.getPropertyValue(n).trim();CFG.chart=echarts.init(C,null,{renderer:'svg'});
      CFG.chart.setOption({grid:{left:40,right:12,top:28,bottom:28},tooltip:{trigger:'axis'},legend:{top:0,textStyle:{color:col('--muted')}},textStyle:{fontFamily:col('--font')},
        xAxis:{type:'category',data:s.activity.map(d=>d.d.slice(8,10)+'/'+d.d.slice(5,7)),axisLabel:{color:col('--muted')},axisLine:{lineStyle:{color:col('--line')}}},
        yAxis:{type:'value',minInterval:1,axisLabel:{color:col('--muted')},splitLine:{lineStyle:{color:col('--grid')}}},
        series:[{name:'Eventos',type:'bar',data:s.activity.map(d=>d.n),itemStyle:{color:col('--accent'),borderRadius:[3,3,0,0]},barMaxWidth:26},{name:'Logins',type:'line',data:s.activity.map(d=>d.logins),itemStyle:{color:col('--info')},smooth:true,symbolSize:6}]})}})
    .catch(e=>K.append(h('div',{class:'small'},e.message)))}

/* ---- usuários ---- */
function userStatus(u){return!u.active?['Inativo','off']:u.locked?['Bloqueado','warn']:u.must_change?['Troca de senha pendente','warn']:['Ativo','ok']}
function cfgUsers(V){let rows=[];const q=inp('',{type:'search',placeholder:'Pesquisar nome, e-mail ou departamento'});const rf=sel([['','Todos os papéis'],...Object.entries(SRV.roles).map(([k,r])=>[k,r.n])],'');
  const T=h('div',{class:'tblw'});const render=()=>{const Q=stripAcc(q.value.toLowerCase());const list=rows.filter(u=>(!rf.value||u.role===rf.value)&&(!Q||stripAcc((u.name+' '+u.email+' '+u.dept).toLowerCase()).includes(Q)));
    const tb=h('table',{class:'tbl'},h('thead',{},h('tr',{},...['','Usuário','Papel','Situação','Pastas','Último acesso',''].map(x=>h('th',{},x)))));const body=h('tbody');
    for(const u of list){const [st,cls]=userStatus(u);body.append(h('tr',{onclick:()=>dlgUser(u,load)},h('td',{class:'avc'},avatarEl(u,30),u.online?h('i',{class:'dot',title:'Online'}):null),h('td',{},h('b',{},u.name),h('div',{class:'small'},u.email+(u.dept?' · '+u.dept:''))),
      h('td',{},h('span',{class:'tag'},roleName(u.role)),u.custom?h('span',{class:'tag',title:'Permissões personalizadas'},'personalizado'):null),h('td',{},h('span',{class:'st '+cls},st)),h('td',{class:'num'},u.books),h('td',{class:'small'},fmtWhen(u.last_login)||'nunca'),h('td',{},h('button',{class:'tb'},'Editar'))))}
    if(!list.length)body.append(h('tr',{},h('td',{colspan:7,class:'small'},'Nenhum usuário encontrado.')));tb.append(body);T.innerHTML='';T.append(tb)};
  const load=async()=>{try{rows=await api('/api/users');render()}catch(e){T.textContent=e.message}};q.oninput=render;rf.onchange=render;
  V.append(card('Usuários',`Crie contas, defina papéis e permissões, redefina senhas e desative acessos. Toda alteração fica na auditoria.`,h('div',{class:'ubar'},h('div',{style:{flex:'1 1 220px'}},q),h('div',{style:{flex:'0 1 200px'}},rf),btn('+ Novo usuário',()=>dlgUser(null,load),true)),T));load()}
function permEditor(perms,disabled){const box=h('div',{class:'pgrid'});const cbs={};for(const [k,d] of Object.entries(SRV.perms)){const c=h('input',{type:'checkbox',checked:perms.includes(k)||null,disabled:disabled||null});cbs[k]=c;box.append(h('label',{class:'chk'},c,h('span',{},d)))}
  return{el:box,get:()=>Object.keys(cbs).filter(k=>cbs[k].checked),set:(p,dis)=>{for(const k in cbs){cbs[k].checked=p.includes(k);cbs[k].disabled=!!dis}}}}
function dlgUser(u,reload){const isNew=!u;const me=SRV.me;const master=me.role==='master';const isMaster=u&&u.role==='master';
  const roles=Object.entries(SRV.roles).filter(([k])=>k!=='master'&&(master||k!=='admin')).map(([k,r])=>[k,r.n]);
  const nm=inp(u?u.name:''),em=inp(u?u.email:'',{type:'email',disabled:!isNew||null}),ti=inp(u?u.title:''),dp=inp(u?u.dept:'');
  const role=sel(isMaster?[['master','Admin master']]:roles,u?u.role:'editor',{disabled:isMaster||null});const desc=h('div',{class:'small'});
  const custom=h('input',{type:'checkbox',checked:(u&&u.custom)||null,disabled:isMaster||null});const pe=permEditor(u?u.perms:SRV.roles.editor.p,true);
  const active=h('input',{type:'checkbox',checked:!u||u.active||null,disabled:isMaster||(u&&u.id===me.id)||null});const pw=inp('',{type:'text',placeholder:'em branco: gerar senha temporária',autocomplete:'off'});
  const sync=()=>{const r=SRV.roles[role.value];desc.textContent=r?r.d:'';const full=['master','admin'].includes(role.value);custom.disabled=isMaster||full;if(full)custom.checked=false;pe.set(custom.checked?pe.get():(r?r.p:[]),!custom.checked)};
  role.onchange=()=>{if(!custom.checked)sync();else desc.textContent=(SRV.roles[role.value]||{}).d||''};custom.onchange=()=>{if(custom.checked)pe.set(pe.get(),false);else sync()};sync();if(u&&u.custom)pe.set(u.perms,false);
  const B=[];
  if(!isNew&&!isMaster&&u.id!==me.id){B.push({label:'Excluir',act:()=>{if(!confirm(`Excluir ${u.name}? As pastas dele passam a ser suas. Prefira desativar se quiser manter o histórico.`))return false;api('/api/users/'+u.id,{method:'DELETE'}).then(r=>{toast(`Usuário excluído${r.transferred?'; '+r.transferred+' pasta(s) transferida(s) para você':''}`);reload()}).catch(e=>toast(e.message,'err'))}},
    {label:'Redefinir senha',act:()=>{if(!confirm(`Gerar uma senha temporária para ${u.name}? As sessões dele serão encerradas.`))return false;api('/api/users/'+u.id+'/reset',{method:'POST'}).then(r=>showTempPw(u.email,r.temp_password)).catch(e=>toast(e.message,'err'))}});
    if(u.locked)B.push({label:'Desbloquear',act:()=>{api('/api/users/'+u.id,{method:'PATCH',body:{unlock:true}}).then(()=>{toast('Conta desbloqueada');reload()}).catch(e=>toast(e.message,'err'))}})}
  B.push({label:'Cancelar'},{label:isNew?'Criar usuário':'Salvar',primary:true,act:()=>{const body={name:nm.value,title:ti.value,dept:dp.value};
    if(!isMaster){body.role=role.value;body.custom=custom.checked;if(custom.checked)body.perms=pe.get();if(!(u&&u.id===me.id))body.active=active.checked}
    if(isNew){body.email=em.value;if(pw.value)body.password=pw.value;api('/api/users',{method:'POST',body}).then(r=>{reload();showTempPw(r.user.email,r.temp_password,!pw.value)}).catch(e=>toast(e.message,'err'))}
    else api('/api/users/'+u.id,{method:'PATCH',body}).then(()=>{toast('Usuário atualizado');reload()}).catch(e=>toast(e.message,'err'))}});
  dlg(isNew?'Novo usuário':'Editar usuário',h('div',{class:'dstack'},!isNew?h('div',{class:'uhead'},avatarEl(u,44),h('div',{},h('b',{},u.name),h('div',{class:'small'},`${u.email} · conta criada ${fmtWhen(u.created)} · último acesso ${fmtWhen(u.last_login)||'nunca'}`))):null,
    h('div',{class:'row2'},field('Nome',nm),field('E-mail (login)',em)),h('div',{class:'row2'},field('Cargo',ti),field('Departamento',dp)),
    h('div',{class:'row2'},field('Papel',role),isNew?field('Senha inicial',pw):h('label',{class:'chk',style:{marginTop:'20px'}},active,'Conta ativa (pode entrar)')),desc,
    h('label',{class:'chk'},custom,'Personalizar permissões deste usuário'),pe.el,isNew?h('div',{class:'small'},'Na primeira entrada o usuário é obrigado a trocar a senha.'):null),B,{wide:true})}
function showTempPw(email,pw,generated=true){const box=h('div',{class:'tmppw code'},pw);
  dlg('Senha temporária',h('div',{class:'dstack'},h('p',{style:{margin:0}},`Envie ao usuário ${email} por um canal seguro. ${generated?'Ela foi gerada agora e ':''}não será mostrada de novo; no primeiro acesso ele define a própria senha.`),box,
    h('div',{class:'small'},`Endereço de acesso: ${location.origin}`)),[{label:'Copiar',act:()=>{navigator.clipboard&&navigator.clipboard.writeText(`Acesso ao GPlanSiS|Sheets\n${location.origin}\nUsuário: ${email}\nSenha temporária: ${pw}`).then(()=>toast('Copiado'),()=>toast('Copie manualmente','err'));return false}},{label:'Fechar',primary:true}])}

/* ---- papéis ---- */
function cfgRoles(V){const R=Object.entries(SRV.roles);const tb=h('table',{class:'tbl matrix'},h('thead',{},h('tr',{},h('th',{},'Permissão'),...R.map(([k,r])=>h('th',{title:r.d},r.n)))));const body=h('tbody');
  for(const [p,d] of Object.entries(SRV.perms))body.append(h('tr',{},h('td',{},d,h('div',{class:'code small'},p)),...R.map(([,r])=>h('td',{class:'mc'},r.p.includes(p)?'✓':''))));tb.append(body);
  V.append(card('Papéis e permissões','Permissões padrão de cada papel. Em Usuários você pode personalizar as permissões de uma pessoa específica. Só o admin master gerencia administradores.',h('div',{class:'tblw'},tb),
    h('div',{class:'kv',style:{marginTop:'10px'}},...R.flatMap(([,r])=>[h('b',{},r.n),h('span',{class:'small'},r.d)]))))}

/* ---- auditoria ---- */
const EV_TXT={'auth.login':'Entrou','auth.logout':'Saiu','auth.falha':'Falha de login','pasta.criada':'Criou pasta','pasta.renomeada':'Renomeou pasta','pasta.lixeira':'Moveu para a lixeira','pasta.restaurada':'Restaurou pasta','pasta.excluida_definitivo':'Excluiu pasta','pasta.duplicada':'Duplicou pasta','pasta.compartilhada':'Compartilhou pasta','pasta.versao_salva':'Salvou versão','pasta.versao_restaurada':'Restaurou versão','pasta.sobrescrita':'Sobrescreveu versão','pasta.exportou':'Exportou','pasta.importou':'Importou','perfil.atualizado':'Atualizou perfil','perfil.senha_trocada':'Trocou a senha','perfil.sessao_encerrada':'Encerrou sessão','usuario.criado':'Criou usuário','usuario.alterado':'Alterou usuário','usuario.senha_redefinida':'Redefiniu senha','usuario.excluido':'Excluiu usuário','sistema.configuracoes':'Alterou configurações','sistema.master_criado':'Master criado','sistema.iniciado':'Sistema iniciado','ia.chamada':'Usou a IA','auditoria.exportada':'Exportou auditoria'};
function cfgAudit(V){const q=inp('',{type:'search',placeholder:'Filtrar por evento, e-mail ou conteúdo'});const T=h('div',{class:'tblw'});const more=btn('Carregar mais',()=>load(true));const ver=h('span',{class:'small'});let last=0;let tb;
  const load=async(append)=>{try{const r=await api(`/api/audit?limit=150${append&&last?'&before='+last:''}${q.value?'&q='+encodeURIComponent(q.value):''}`);
    if(!append){T.innerHTML='';tb=h('table',{class:'tbl'},h('thead',{},h('tr',{},...['#','Quando','Usuário','Evento','Detalhes','IP'].map(x=>h('th',{},x)))),h('tbody'));T.append(tb)}
    const body=tb.tBodies[0];for(const e of r.items){body.append(h('tr',{},h('td',{class:'num small'},e.seq),h('td',{class:'small nw'},new Date(e.at).toLocaleString('pt-BR')),h('td',{class:'small'},e.email||'—'),h('td',{},h('span',{class:'tag'+(e.ev==='auth.falha'?' bad':'')},EV_TXT[e.ev]||e.ev)),h('td',{class:'code small det'},Object.keys(e.data||{}).length?JSON.stringify(e.data):''),h('td',{class:'small'},e.ip||'')));last=e.seq}
    more.hidden=r.items.length<150;if(!append&&!r.items.length)body.append(h('tr',{},h('td',{colspan:6,class:'small'},'Nada encontrado.')))}catch(e){T.textContent=e.message}};
  q.onkeydown=e=>{if(e.key==='Enter'){last=0;load()}};
  const vb=btn('Verificar integridade',()=>busy(vb,async()=>{const r=await api('/api/audit/verify');ver.textContent=r.ok?`Íntegra: ${r.n} registros encadeados por SHA-256.`:`Corrompida no registro ${r.at}: ${r.why}.`;ver.className='small '+(r.ok?'okt':'badt')}));
  V.append(card('Auditoria','Trilha somente de inclusão: cada registro guarda o hash do anterior, então qualquer alteração no banco quebra a corrente.',h('div',{class:'ubar'},h('div',{style:{flex:'1 1 240px'}},q),btn('Filtrar',()=>{last=0;load()}),vb,h('a',{class:'tb',href:'/api/audit.csv',download:'sheets_auditoria.csv'},'Exportar CSV')),ver,T,actions(more)));load()}

/* ---- sistema ---- */
function cfgSys(V){const box=h('div',{},h('div',{class:'small'},'Carregando…'));V.append(card('Sistema','Valem para toda a organização.',box));
  api('/api/settings').then(s=>{box.innerHTML='';const org=inp(s.org_name),ban=inp(s.banner||'',{placeholder:'Ex.: Manutenção programada sábado às 22h'}),ses=inp(s.session_hours,{type:'number',min:1,max:720}),pwm=inp(s.pw_min,{type:'number',min:8,max:64}),vk=inp(s.versions_keep,{type:'number',min:5,max:500});
    const dr=sel(Object.entries(SRV.roles).filter(([k])=>!['master','admin'].includes(k)).map(([k,r])=>[k,r.n]),s.default_role);const ai=h('input',{type:'checkbox',checked:s.ai_enabled||null});
    const go=btn('Salvar configurações',()=>busy(go,async()=>{await api('/api/settings',{method:'PUT',body:{org_name:org.value,banner:ban.value,session_hours:+ses.value,pw_min:+pwm.value,versions_keep:+vk.value,default_role:dr.value}});setMe(await api('/api/me'));const b=$('#banner');b.textContent=SRV.org.banner;b.hidden=!SRV.org.banner;toast('Configurações salvas')}),true);
    box.append(h('div',{class:'row2'},field('Nome da organização',org),field('Papel padrão de novos usuários',dr)),field('Aviso no topo para todos (opcional)',ban),
      h('div',{class:'row2'},field('Sessão expira após inatividade de (horas)',ses),field('Tamanho mínimo da senha',pwm)),h('div',{class:'row2'},field('Versões automáticas guardadas por pasta',vk),h('div')),
      h('div',{class:'small'},`Versão ${SRV.version}. A chave e o modelo da IA ficam em Configurações › Inteligência artificial.`),actions(go))}).catch(e=>{box.textContent=e.message})}

/* ---- inteligência artificial (chave da Anthropic, modelo e esforço) ---- */
function cfgIA(V){const box=h('div',{},h('div',{class:'small'},'Carregando…'));V.append(box);
  api('/api/settings').then(s=>{box.innerHTML='';const K=s.ai_key||{};const master=SRV.me.role==='master';
    const st=h('div',{class:'keyst '+(K.broken?'bad':K.set?'on':'off')},h('i',{class:'kd'}),h('div',{},h('b',{},K.broken?'Chave guardada ilegível':K.set?'Chave configurada':'Nenhuma chave configurada'),
      h('div',{class:'small'},K.broken?'O segredo do servidor (SHEETS_SECRET) mudou depois que a chave foi salva. Cadastre a chave de novo.':K.set?`Termina em …${K.hint||'????'} · ${K.source==='painel'?`cadastrada por ${K.by||'—'} em ${fmtWhen(K.at)}`:'definida no .env do servidor'}`:'Sem chave, o assistente de fórmulas fica desligado e o "Perguntar aos dados" usa palavras-chave.')));
    const key=inp('',{type:'password',placeholder:'sk-ant-api03-…',autocomplete:'off',spellcheck:'false'});const res=h('div',{class:'small'});
    const saveK=btn(K.set?'Substituir e testar':'Salvar e testar',()=>busy(saveK,async()=>{if(!key.value.trim())throw new Error('Cole a chave da API.');res.textContent='Validando com a Anthropic…';
      try{const r=await api('/api/settings/ai-key',{method:'PUT',body:{key:key.value.trim()}});key.value='';toast('Chave salva e validada'+(r.test&&r.test.name?' · '+r.test.name:''));setMe(await api('/api/me'));renderCfg()}catch(e){res.textContent=e.message;res.className='small badt';throw e}}),true);
    const delK=K.source==='painel'?btn('Remover chave',()=>busy(delK,async()=>{if(!confirm('Remover a chave da Anthropic? O assistente de IA será desligado.'))return;await api('/api/settings/ai-key',{method:'DELETE'});setMe(await api('/api/me'));toast('Chave removida');renderCfg()})):null;
    box.append(card('Chave da API da Anthropic','A chave fica cifrada no servidor e nunca é enviada ao navegador; aqui aparecem só os 4 últimos caracteres. Crie uma chave em console.anthropic.com › API Keys.',st,
      master?h('div',{class:'dstack'},field(K.set?'Nova chave (substitui a atual)':'Chave da API',key),res,actions(delK,saveK)):h('div',{class:'small'},'Somente o admin master cadastra, troca ou remove a chave.')));
    const en=h('input',{type:'checkbox',checked:s.ai_enabled||null});const mo=sel(Object.entries(s.ai_models||{}),s.ai_model);const ef=sel([['low','Baixo · respostas mais rápidas e baratas'],['medium','Médio · equilibrado (recomendado)'],['high','Alto · mais cuidadoso, mais lento']],s.ai_effort||'medium');
    const tr=h('div',{class:'small'});const test=btn('Testar conexão',()=>busy(test,async()=>{tr.className='small';tr.textContent='Testando…';const r=await api('/api/ai/test',{method:'POST'});tr.textContent=r.ok?`Conexão OK · ${r.name||r.model}${r.warn?' · '+r.warn:''}`:r.why;tr.className='small '+(r.ok?'okt':'badt')}));
    const go=btn('Salvar',()=>busy(go,async()=>{await api('/api/settings',{method:'PUT',body:{ai_enabled:en.checked,ai_model:mo.value,ai_effort:ef.value}});setMe(await api('/api/me'));toast('Configurações de IA salvas')}),true);
    box.append(card('Modelo e uso','Vale para o assistente de fórmulas, o "Perguntar aos dados" e os insights do BI. Cada uso fica registrado na auditoria (evento "Usou a IA").',
      h('label',{class:'chk'},en,'Assistente de IA habilitado para a organização'),h('div',{class:'row2'},field('Modelo',mo),field('Nível de esforço',ef)),
      h('div',{class:'small'},'Quem usa: pessoas com a permissão "Usar o assistente de IA" (Analista, Editor, Gestor e administradores, por padrão).'),tr,actions(test,go)))}).catch(e=>{box.textContent=e.message})}
