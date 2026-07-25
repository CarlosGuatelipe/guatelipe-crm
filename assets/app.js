const STORAGE_KEY = 'guatelipe_crm_v2';
const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : 'id-'+Date.now()+'-'+Math.random().toString(16).slice(2));
const stages = ['Novo lead','Contato realizado','Reunião','Proposta enviada','Negociação','Fechado'];
const stageClass = {'Novo lead':'blue','Contato realizado':'','Reunião':'orange','Proposta enviada':'blue','Negociação':'orange','Fechado':'green','Perdido':'red'};

const seed = {
  leads: [
    {id: uid(), name:'Marina Alves', company:'Studio Norte', email:'marina@exemplo.com', phone:'(31) 99999-1122', instagram:'@studionorte', service:'Site institucional', source:'Instagram', status:'Novo lead', value:1800, nextAction:'2026-07-26', notes:'Quer modernizar o site e captar orçamentos.'},
    {id: uid(), name:'Rafael Lima', company:'Lima Planejados', email:'rafael@exemplo.com', phone:'(31) 98888-4455', instagram:'@limaplanejados', service:'Landing page', source:'Prospecção', status:'Negociação', value:1200, nextAction:'2026-07-27', notes:'Aguardando retorno sobre a proposta.'},
    {id: uid(), name:'Amanda Souza', company:'Clínica Vitta', email:'amanda@exemplo.com', phone:'(31) 97777-2200', instagram:'@clinicavitta', service:'Site completo', source:'Indicação', status:'Proposta enviada', value:2900, nextAction:'2026-07-29', notes:'Proposta enviada com duas opções.'},
    {id: uid(), name:'Bruno Costa', company:'Burguer 027', email:'bruno@exemplo.com', phone:'(31) 96666-8800', instagram:'@burguer027', service:'Cardápio digital', source:'Site', status:'Fechado', value:950, nextAction:'2026-08-02', notes:'Projeto aprovado.'}
  ],
  projects: [
    {id: uid(), name:'Site Burguer 027', client:'Bruno Costa', stage:'Desenvolvimento', progress:62, deadline:'2026-08-08', description:'Landing page com cardápio, WhatsApp e localização.'}
  ],
  transactions: [
    {id: uid(), description:'Entrada — Site Burguer 027', client:'Bruno Costa', due:'2026-07-25', status:'Recebido', value:475},
    {id: uid(), description:'Saldo — Site Burguer 027', client:'Bruno Costa', due:'2026-08-08', status:'Pendente', value:475}
  ]
};

let db = loadDB();
let draggedLeadId = null;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (n) => Number(n || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtDate = (v) => v ? new Date(v+'T12:00:00').toLocaleDateString('pt-BR') : '—';

function loadDB(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(seed); }
  catch { return structuredClone(seed); }
}
function saveDB(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); renderAll(); }
function toast(msg){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2200); }

function switchView(view){
  $$('.view').forEach(v=>v.classList.remove('active'));
  $(`#${view}View`).classList.add('active');
  $$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const titles={dashboard:'Visão geral',leads:'Leads',pipeline:'Funil de vendas',projects:'Projetos',finance:'Financeiro',settings:'Integrações'};
  $('#pageTitle').textContent=titles[view];
  $('#sidebar').classList.remove('open');
}

function renderAll(){ renderDashboard(); renderLeads(); renderKanban(); renderProjects(); renderFinance(); }

function renderDashboard(){
  const openStatuses = ['Novo lead','Contato realizado','Reunião','Proposta enviada','Negociação'];
  $('#statNewLeads').textContent=db.leads.filter(l=>l.status==='Novo lead').length;
  $('#statNegotiation').textContent=db.leads.filter(l=>['Proposta enviada','Negociação'].includes(l.status)).length;
  $('#statProjects').textContent=db.projects.filter(p=>p.progress<100).length;
  $('#statRevenue').textContent=money(db.leads.filter(l=>openStatuses.includes(l.status)).reduce((s,l)=>s+Number(l.value||0),0));

  const recent=[...db.leads].slice(-5).reverse();
  $('#recentLeads').innerHTML=recent.length?recent.map(l=>`<div class="recent-item"><div class="avatar">${esc(l.name[0]||'G')}</div><div><strong>${esc(l.company||l.name)}</strong><small>${esc(l.service)} · ${esc(l.status)}</small></div><div class="value">${money(l.value)}</div></div>`).join(''):'<div class="empty">Nenhum lead cadastrado.</div>';

  const counts={}; db.leads.forEach(l=>counts[l.source]=(counts[l.source]||0)+1); const max=Math.max(1,...Object.values(counts));
  $('#sourceBars').innerHTML=Object.keys(counts).length?Object.entries(counts).map(([k,v])=>`<div class="source-row"><span>${esc(k)}</span><div class="bar"><i style="width:${(v/max)*100}%"></i></div><b>${v}</b></div>`).join(''):'<div class="empty">Sem dados de origem.</div>';

  const upcoming=[...db.leads].filter(l=>l.nextAction).sort((a,b)=>a.nextAction.localeCompare(b.nextAction)).slice(0,5);
  $('#followups').innerHTML=upcoming.length?upcoming.map(l=>`<div class="timeline-item"><i></i><div><strong>${esc(l.company||l.name)}</strong><span>${fmtDate(l.nextAction)} · ${esc(l.status)}</span></div></div>`).join(''):'<div class="empty">Nenhum follow-up agendado.</div>';
}

function renderLeads(){
  const filter=$('#leadStatusFilter'); const current=filter.value||'all';
  filter.innerHTML='<option value="all">Todos os status</option>'+[...stages,'Perdido'].map(s=>`<option ${current===s?'selected':''}>${s}</option>`).join('');
  const q=($('#leadSearch').value||'').toLowerCase(); const status=filter.value;
  const rows=db.leads.filter(l=>[l.name,l.company,l.instagram,l.service].join(' ').toLowerCase().includes(q)&&(status==='all'||l.status===status));
  $('#leadsTableBody').innerHTML=rows.length?rows.map(l=>`<tr><td><strong>${esc(l.company||l.name)}</strong><small>${esc(l.name)} ${l.instagram?'· '+esc(l.instagram):''}</small></td><td>${esc(l.source)}</td><td>${esc(l.service)}</td><td><span class="status-pill ${stageClass[l.status]||''}">${esc(l.status)}</span></td><td>${money(l.value)}</td><td>${fmtDate(l.nextAction)}</td><td><button class="text-btn edit-lead" data-id="${l.id}">Editar</button> <button class="danger-btn delete-lead" data-id="${l.id}">Excluir</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhum lead encontrado.</td></tr>';
  $$('.edit-lead').forEach(b=>b.onclick=()=>openLeadModal(db.leads.find(l=>l.id===b.dataset.id)));
  $$('.delete-lead').forEach(b=>b.onclick=()=>{ if(confirm('Excluir este lead?')){db.leads=db.leads.filter(l=>l.id!==b.dataset.id);saveDB();toast('Lead excluído.');}});
}

function renderKanban(){
  $('#kanbanBoard').innerHTML=stages.map(stage=>{const list=db.leads.filter(l=>l.status===stage);return `<section class="kanban-col" data-stage="${stage}"><div class="kanban-head"><strong>${stage}</strong><span>${list.length}</span></div><div class="kanban-list" data-stage="${stage}">${list.map(l=>`<article class="lead-card" draggable="true" data-id="${l.id}"><h3>${esc(l.company||l.name)}</h3><p>${esc(l.service)} · ${esc(l.source)}</p><footer><span>${esc(l.name)}</span><strong>${money(l.value)}</strong></footer></article>`).join('')}</div></section>`}).join('');
  $$('.lead-card').forEach(c=>{c.addEventListener('dragstart',()=>draggedLeadId=c.dataset.id);c.addEventListener('dblclick',()=>openLeadModal(db.leads.find(l=>l.id===c.dataset.id)));});
  $$('.kanban-list').forEach(col=>{col.addEventListener('dragover',e=>e.preventDefault());col.addEventListener('drop',()=>{const l=db.leads.find(x=>x.id===draggedLeadId);if(l){l.status=col.dataset.stage;saveDB();toast('Lead movido para '+col.dataset.stage);}})});
}

function renderProjects(){
  $('#projectsGrid').innerHTML=db.projects.length?db.projects.map(p=>`<article class="project-card"><span class="status-pill blue">${esc(p.stage)}</span><h3>${esc(p.name)}</h3><p>${esc(p.description||'')}</p><div class="progress"><i style="width:${Math.min(100,p.progress)}%"></i></div><div class="project-meta"><span>${p.progress}% concluído</span><span>Entrega ${fmtDate(p.deadline)}</span></div><div style="margin-top:14px"><button class="text-btn edit-project" data-id="${p.id}">Editar projeto</button> <button class="danger-btn delete-project" data-id="${p.id}">Excluir</button></div></article>`).join(''):'<div class="panel empty">Nenhum projeto cadastrado.</div>';
  $$('.edit-project').forEach(b=>b.onclick=()=>openProjectModal(db.projects.find(p=>p.id===b.dataset.id)));
  $$('.delete-project').forEach(b=>b.onclick=()=>{if(confirm('Excluir projeto?')){db.projects=db.projects.filter(p=>p.id!==b.dataset.id);saveDB();}});
}

function renderFinance(){
  const contracted=db.transactions.reduce((s,t)=>s+Number(t.value||0),0); const received=db.transactions.filter(t=>t.status==='Recebido').reduce((s,t)=>s+Number(t.value||0),0); const pending=contracted-received;
  $('#financeContracted').textContent=money(contracted); $('#financeReceived').textContent=money(received); $('#financePending').textContent=money(pending); $('#financeTicket').textContent=money(db.leads.length?db.leads.reduce((s,l)=>s+Number(l.value||0),0)/db.leads.length:0);
  $('#financeTableBody').innerHTML=db.transactions.length?db.transactions.map(t=>`<tr><td><strong>${esc(t.description)}</strong></td><td>${esc(t.client)}</td><td>${fmtDate(t.due)}</td><td><span class="status-pill ${t.status==='Recebido'?'green':'orange'}">${esc(t.status)}</span></td><td>${money(t.value)}</td><td><button class="text-btn edit-transaction" data-id="${t.id}">Editar</button> <button class="danger-btn delete-transaction" data-id="${t.id}">Excluir</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty">Nenhuma movimentação.</td></tr>';
  $$('.edit-transaction').forEach(b=>b.onclick=()=>openTransactionModal(db.transactions.find(t=>t.id===b.dataset.id)));
  $$('.delete-transaction').forEach(b=>b.onclick=()=>{if(confirm('Excluir lançamento?')){db.transactions=db.transactions.filter(t=>t.id!==b.dataset.id);saveDB();}});
}

function openModal(title, eyebrow, fields, onSubmit, data={}){
  $('#modalTitle').textContent=title; $('#modalEyebrow').textContent=eyebrow;
  const form=$('#dynamicForm');
  form.innerHTML=fields.map(f=>fieldHTML(f,data[f.name])).join('')+`<div class="form-actions"><button type="button" class="btn ghost" id="cancelModal">Cancelar</button><button class="btn primary" type="submit">Salvar</button></div>`;
  $('#modalBackdrop').hidden=false;
  $('#cancelModal').onclick=closeModal;
  form.onsubmit=e=>{e.preventDefault();const fd=new FormData(form);const obj=Object.fromEntries(fd.entries());fields.filter(f=>f.type==='number').forEach(f=>obj[f.name]=Number(obj[f.name]||0));onSubmit(obj);closeModal();};
}
function fieldHTML(f,val=''){
  const cls=f.full?'field full':'field'; const req=f.required?'required':'';
  if(f.type==='select') return `<div class="${cls}"><label>${f.label}</label><select name="${f.name}" ${req}>${f.options.map(o=>`<option ${String(val)===String(o)?'selected':''}>${esc(o)}</option>`).join('')}</select></div>`;
  if(f.type==='textarea') return `<div class="${cls}"><label>${f.label}</label><textarea name="${f.name}" ${req}>${esc(val||'')}</textarea></div>`;
  return `<div class="${cls}"><label>${f.label}</label><input name="${f.name}" type="${f.type||'text'}" value="${esc(val??'')}" ${req} ${f.min!==undefined?`min="${f.min}"`:''} ${f.max!==undefined?`max="${f.max}"`:''}></div>`;
}
function closeModal(){ $('#modalBackdrop').hidden=true; }

function openLeadModal(lead){
  const fields=[
    {name:'name',label:'Nome do contato',required:true},{name:'company',label:'Empresa'},{name:'email',label:'E-mail',type:'email'},{name:'phone',label:'Telefone'},{name:'instagram',label:'Instagram'},{name:'service',label:'Serviço desejado',required:true},{name:'source',label:'Origem',type:'select',options:['Instagram','Site','Prospecção','Indicação','WhatsApp','Outro']},{name:'status',label:'Status',type:'select',options:[...stages,'Perdido']},{name:'value',label:'Valor estimado (R$)',type:'number',min:0},{name:'nextAction',label:'Próxima ação',type:'date'},{name:'notes',label:'Observações',type:'textarea',full:true}
  ];
  openModal(lead?'Editar lead':'Novo lead','OPORTUNIDADE',fields,obj=>{if(lead)Object.assign(lead,obj);else db.leads.push({id:uid(),...obj});saveDB();toast(lead?'Lead atualizado.':'Novo lead criado.');},lead||{source:'Instagram',status:'Novo lead'});
}
function openProjectModal(project){
  const fields=[{name:'name',label:'Nome do projeto',required:true},{name:'client',label:'Cliente',required:true},{name:'stage',label:'Etapa',type:'select',options:['Briefing','Design','Desenvolvimento','Revisão','Publicação','Concluído']},{name:'progress',label:'Progresso (%)',type:'number',min:0,max:100},{name:'deadline',label:'Prazo',type:'date'},{name:'description',label:'Descrição',type:'textarea',full:true}];
  openModal(project?'Editar projeto':'Novo projeto','PROJETO',fields,obj=>{if(project)Object.assign(project,obj);else db.projects.push({id:uid(),...obj});saveDB();toast('Projeto salvo.');},project||{stage:'Briefing',progress:0});
}
function openTransactionModal(tx){
  const fields=[{name:'description',label:'Descrição',required:true},{name:'client',label:'Cliente',required:true},{name:'due',label:'Vencimento',type:'date'},{name:'status',label:'Status',type:'select',options:['Pendente','Recebido']},{name:'value',label:'Valor (R$)',type:'number',min:0,required:true}];
  openModal(tx?'Editar lançamento':'Novo lançamento','FINANCEIRO',fields,obj=>{if(tx)Object.assign(tx,obj);else db.transactions.push({id:uid(),...obj});saveDB();toast('Lançamento salvo.');},tx||{status:'Pendente'});
}
function esc(v){ return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

$$('.nav-item').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$$('[data-view-jump]').forEach(b=>b.onclick=()=>switchView(b.dataset.viewJump));
$('#newLeadBtn').onclick=()=>openLeadModal(); $('#newProjectBtn').onclick=()=>openProjectModal(); $('#newTransactionBtn').onclick=()=>openTransactionModal();
$('#closeModalBtn').onclick=closeModal; $('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});
$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
$('#leadSearch').addEventListener('input',renderLeads); $('#leadStatusFilter').addEventListener('change',renderLeads);
$('#exportBtn').onclick=()=>{const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='guatelipe-crm-backup.json';a.click();URL.revokeObjectURL(a.href);toast('Backup exportado.');};

$('#importBtn').onclick=()=>$('#importInput').click();
$('#importInput').addEventListener('change', async e=>{
  const file=e.target.files?.[0]; if(!file) return;
  try{
    const parsed=JSON.parse(await file.text());
    if(!parsed || !Array.isArray(parsed.leads) || !Array.isArray(parsed.projects) || !Array.isArray(parsed.transactions)) throw new Error('Formato inválido');
    db=parsed; saveDB(); toast('Backup importado com sucesso.');
  }catch(err){ alert('Não foi possível importar este arquivo. Selecione um backup JSON exportado pelo CRM.'); }
  e.target.value='';
});
$('#clearDataBtn').onclick=()=>{
  if(confirm('Tem certeza que deseja apagar todos os dados deste CRM neste navegador?')){
    db={leads:[],projects:[],transactions:[]}; saveDB(); toast('Todos os dados foram removidos.');
  }
};

$('#instagramGuideBtn').onclick=()=>openModal('Integração com Instagram','META API',[{name:'guide',label:'Etapas',type:'textarea',full:true}],()=>{}, {guide:'1. Transforme o Instagram em conta profissional.\n2. Crie um aplicativo no Meta for Developers.\n3. Adicione o produto Instagram e solicite as permissões necessárias.\n4. Crie um backend HTTPS para armazenar tokens com segurança.\n5. Configure um webhook para receber mensagens e eventos.\n6. Ao receber um Direct, envie os dados para o CRM por API.\n\nImportante: esta versão local não recebe Direct automaticamente. A ativação real depende do aplicativo Meta, permissões e backend.'});

// ---------------------------------------------------------------------------
// Integração com o backend do Instagram (Meta API)
// ---------------------------------------------------------------------------
const IG_CFG_KEY = 'guatelipe_ig_cfg';
function igCfg(){ try{ return JSON.parse(localStorage.getItem(IG_CFG_KEY))||{}; }catch{ return {}; } }
function igSaveCfg(c){ localStorage.setItem(IG_CFG_KEY, JSON.stringify(c)); }
function igStatusMsg(msg){ const el=$('#igStatus'); if(el) el.textContent=msg; }
function igSetBadge(connected){ const b=$('#igBadge'); if(!b) return; b.textContent=connected?'Conectado':'Não conectado'; b.className='badge '+(connected?'success':'warning'); }

function igLoadCfgToForm(){
  const c=igCfg();
  if($('#igBackendUrl')) $('#igBackendUrl').value=c.url||'';
  if($('#igApiKey')) $('#igApiKey').value=c.key||'';
}

async function igRefreshStatus(){
  const c=igCfg(); if(!c.url||!c.key){ igSetBadge(false); return; }
  try{
    const r=await fetch(c.url.replace(/\/$/,'')+'/api/status',{headers:{'x-api-key':c.key}});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const s=await r.json();
    igSetBadge(s.connected);
    igStatusMsg(s.connected?`Conta ${s.account?('@'+String(s.account).replace(/^@/,'')):'vinculada'} conectada · ${s.leadsCapturados} lead(s) no backend.`:'Backend acessível. Falta autorizar o Instagram — clique em "Conectar Instagram".');
  }catch(err){ igSetBadge(false); igStatusMsg('Não foi possível falar com o backend. Verifique a URL e a chave. ('+err.message+')'); }
}

async function igSync(){
  const c=igCfg(); if(!c.url||!c.key){ toast('Configure a URL e a chave primeiro.'); return; }
  igStatusMsg('Sincronizando…');
  try{
    const r=await fetch(c.url.replace(/\/$/,'')+'/api/leads',{headers:{'x-api-key':c.key}});
    if(!r.ok) throw new Error('HTTP '+r.status);
    const {leads=[]}=await r.json();
    let novos=0;
    for(const l of leads){
      if(db.leads.some(x=>x.id===l.id)) continue;
      db.leads.push({id:l.id||uid(),name:l.name||'Contato Instagram',company:l.company||'',email:l.email||'',phone:l.phone||'',instagram:l.instagram||'',service:l.service||'A definir',source:l.source||'Instagram',status:l.status||'Novo lead',value:Number(l.value||0),nextAction:l.nextAction||'',notes:l.notes||''});
      novos++;
    }
    if(novos){ saveDB(); }
    toast(novos?`${novos} novo(s) lead(s) importado(s) do Direct.`:'Nenhum lead novo no Direct.');
    igStatusMsg(novos?`${novos} lead(s) importado(s) agora.`:'Nada novo no Direct por enquanto.');
    igRefreshStatus();
  }catch(err){ toast('Falha ao sincronizar.'); igStatusMsg('Erro ao sincronizar: '+err.message); }
}

$('#igSaveBtn')?.addEventListener('click',()=>{
  const url=($('#igBackendUrl').value||'').trim(); const key=($('#igApiKey').value||'').trim();
  if(!url||!key){ toast('Preencha URL e chave.'); return; }
  igSaveCfg({url,key}); toast('Configuração salva.'); igRefreshStatus();
});
$('#igConnectBtn')?.addEventListener('click',()=>{
  const c=igCfg(); if(!c.url){ toast('Salve a URL do backend primeiro.'); return; }
  window.open(c.url.replace(/\/$/,'')+'/auth/instagram','_blank','noopener');
  igStatusMsg('Abrimos o login da Meta numa nova aba. Depois de autorizar, clique em "Sincronizar Direct".');
});
$('#igSyncBtn')?.addEventListener('click',igSync);

igLoadCfgToForm();
igRefreshStatus();

renderAll();
