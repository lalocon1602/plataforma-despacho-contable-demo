'use strict';
const $ = (sel, root = document) => root.querySelector(sel);
const state = { data: null, view: location.hash.slice(1) || 'dashboard', search: '', status: 'Todos', type: 'Todos', period: 'this-month' };
const PAGE_NAMES = { dashboard: 'Resumen', clients: 'Clientes', invoices: 'Facturación', transactions: 'Ingresos y egresos', obligations: 'Obligaciones', reports: 'Reportes', activity: 'Actividad', users: 'Usuarios y roles' };
const money = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n || 0));
const fullMoney = n => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n || 0));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const todayISO = () => new Date().toISOString().slice(0,10);
const shortDate = s => s ? new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${s}T12:00:00`)).replace('.', '') : '—';
const dayNo = s => s ? new Date(`${s}T12:00:00`).getDate() : '—';
const monthName = s => s ? new Intl.DateTimeFormat('es-MX',{month:'short'}).format(new Date(`${s}T12:00:00`)).replace('.', '').toUpperCase() : '';
const dateLong = new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
$('#todayPill').textContent = dateLong.charAt(0).toUpperCase()+dateLong.slice(1);

async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, { headers: { 'Content-Type':'application/json', ...(options.headers || {}) }, ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No se pudo completar la operación.');
  return result;
}
function showLogin(){ $('#appShell').hidden=true; $('#passwordScreen').hidden=true; $('#loginScreen').hidden=false; $('#loginForm input[name="username"]')?.focus(); }
async function openSession(user){
  $('#loginScreen').hidden=true;
  if(user.mustChangePassword){$('#appShell').hidden=true;$('#passwordScreen').hidden=false;$('#passwordForm input[name="currentPassword"]')?.focus();return;}
  $('#passwordScreen').hidden=true;$('#appShell').hidden=false;await refresh();
}
function toast(message, error = false) {
  const node = document.createElement('div'); node.className = `toast${error?' error':''}`; node.textContent = message;
  $('#toasts').append(node); setTimeout(() => node.remove(), 3200);
}
function clientName(id) { return state.data.clients.find(c => c.id === id)?.name || 'Cliente no disponible'; }
function badge(status) {
  const classes = { Pagada:'paid', Presentada:'presented', Activo:'active', Pendiente:'pending', 'En proceso':'progress', Vencida:'overdue', Vencido:'overdue', Inactivo:'inactive', Cancelada:'inactive', Borrador:'draft' };
  return `<span class="badge badge-${classes[status] || 'draft'}">${esc(status || 'Sin estado')}</span>`;
}
function pageHeader(kicker, title, desc, actions = '') {
  return `<div class="page-header"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${desc}</p></div><div class="header-actions">${actions}</div></div>`;
}
function statCard(title, value, foot, icon, tone = '') {
  return `<article class="stat-card"><div class="stat-top"><span>${title}</span><span class="stat-icon">${icon}</span></div><div class="stat-value ${tone}">${value}</div><div class="stat-foot">${foot}</div></article>`;
}
function sum(arr, predicate) { return arr.filter(predicate).reduce((total, x) => total + Number(x.amount || 0), 0); }
function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`; }
function dashboard() {
  const month = monthKey();
  const income = sum(state.data.transactions, x => x.type === 'Ingreso' && x.date.startsWith(month));
  const expense = sum(state.data.transactions, x => x.type === 'Egreso' && x.date.startsWith(month));
  const openInvoices = sum(state.data.invoices, x => x.status !== 'Pagada' && x.status !== 'Cancelada');
  const due = state.data.obligations.filter(x => x.status !== 'Presentada');
  const overdue = due.filter(x => x.dueDate < todayISO());
  const nextDue = due.sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0,4);
  const months = Array.from({length:6},(_,i)=>{ const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-5+i); return { key:monthKey(d), name:new Intl.DateTimeFormat('es-MX',{month:'short'}).format(d).replace('.','') }; });
  const mValues = months.map(m=>({ ...m, income:sum(state.data.transactions,x=>x.type==='Ingreso'&&x.date.startsWith(m.key)), expense:sum(state.data.transactions,x=>x.type==='Egreso'&&x.date.startsWith(m.key)) }));
  const max = Math.max(1,...mValues.flatMap(x=>[x.income,x.expense]));
  const bars = mValues.map(m=>`<div class="bar-group" title="${esc(m.name)}: ingresos ${money(m.income)}, egresos ${money(m.expense)}"><i class="bar" style="height:${Math.max(3,m.income/max*90)}%"></i><i class="bar expense" style="height:${Math.max(3,m.expense/max*90)}%"></i></div>`).join('');
  const rows = state.data.invoices.slice(0,5).map(inv=>`<tr><td class="cell-primary">${esc(inv.folio)}</td><td>${esc(clientName(inv.clientId))}</td><td class="cell-muted">${shortDate(inv.date)}</td><td>${fullMoney(inv.amount)}</td><td>${badge(inv.status)}</td><td><div class="table-actions"><button class="row-action" title="Editar" data-action="edit" data-type="invoices" data-id="${esc(inv.id)}">✎</button></div></td></tr>`).join('');
  return `${pageHeader('VISTA GENERAL','Resumen del despacho','Consulta rápida de la actividad contable y administrativa.', `<button class="btn" data-nav="reports">Ver reportes <span>↗</span></button><button class="btn btn-primary" data-action="new" data-type="invoices"><span>＋</span> Nueva factura</button>`)}
  <div class="stats-grid">${statCard('Ingresos del mes',money(income),'<span class="positive">●</span> Registrados en el periodo','↗')}${statCard('Egresos del mes',money(expense),'Movimientos registrados este mes','↘')}${statCard('Facturas por cobrar',money(openInvoices),`${state.data.invoices.filter(x=>x.status==='Vencida').length} vencidas`,'▤')}${statCard('Obligaciones pendientes',String(due.length),overdue.length?`<span class="negative">${overdue.length} vencidas</span>`:'Sin obligaciones vencidas','◷')}</div>
  <div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><div class="panel-title">Flujo de efectivo</div><div class="panel-subtitle">Ingresos y egresos registrados · últimos seis meses</div></div><div class="chart-legend"><span class="legend-key"><i></i>Ingresos</span><span class="legend-key expense"><i></i>Egresos</span></div></div><div class="chart-area">${bars}</div><div class="chart-labels">${mValues.map(m=>`<span>${esc(m.name)}</span>`).join('')}</div></section>
  <section class="panel"><div class="panel-head"><div><div class="panel-title">Próximos vencimientos</div><div class="panel-subtitle">Obligaciones que requieren seguimiento</div></div><button class="text-button" data-nav="obligations">Ver todas →</button></div><div class="due-list">${nextDue.length?nextDue.map(o=>`<div class="due-item"><span class="due-date ${o.dueDate<todayISO()?'overdue':''}"><strong>${dayNo(o.dueDate)}</strong>${monthName(o.dueDate)}</span><div class="due-copy"><strong>${esc(o.name)}</strong><small>${esc(clientName(o.clientId))}</small></div><span class="due-right">${o.dueDate<todayISO()?'Vencida':`En ${Math.ceil((new Date(`${o.dueDate}T12:00:00`)-new Date(`${todayISO()}T12:00:00`))/86400000)} días`}</span></div>`).join(''):'<div class="empty-state"><strong>Todo al día</strong><p>No hay obligaciones pendientes.</p></div>'}</div></section></div>
  <section class="panel table-panel"><div class="panel-head"><div><div class="panel-title">Facturación reciente</div><div class="panel-subtitle">Últimos comprobantes registrados</div></div><button class="text-button" data-nav="invoices">Ir a facturación →</button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Fecha</th><th>Total</th><th>Estado</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6"><div class="empty-state">Sin registros todavía.</div></td></tr>'}</tbody></table></div></section>`;
}
function toolbar(searchHint, filters = '', extra = '') { return `<div class="toolbar"><label class="searchbox"><input id="searchInput" type="search" placeholder="${searchHint}" value="${esc(state.search)}"></label>${filters}${extra}</div>`; }
function clientView() {
  const records = state.data.clients.filter(c => `${c.name} ${c.rfc} ${c.email}`.toLowerCase().includes(state.search.toLowerCase()) && (state.status==='Todos'||c.status===state.status));
  const rows=records.map(c=>`<tr><td class="cell-primary">${esc(c.name)}</td><td>${esc(c.type)}</td><td>${esc(c.rfc)}</td><td class="cell-muted">${esc(c.email||'—')}</td><td>${badge(c.status)}</td><td><div class="table-actions"><button class="row-action" title="Ver historial" data-action="detail-client" data-id="${esc(c.id)}">◉</button><button class="row-action" title="Editar" data-action="edit" data-type="clients" data-id="${esc(c.id)}">✎</button><button class="row-action" title="Eliminar" data-action="delete" data-type="clients" data-id="${esc(c.id)}">×</button></div></td></tr>`).join('');
  return `${pageHeader('GESTIÓN','Clientes','Administra el padrón de clientes y consulta su historial.',`<button class="btn btn-primary" data-action="new" data-type="clients"><span>＋</span> Nuevo cliente</button>`)}${toolbar('Buscar por nombre, RFC o correo',`<select class="filter-select" id="statusFilter"><option>Todos</option><option ${state.status==='Activo'?'selected':''}>Activo</option><option ${state.status==='Inactivo'?'selected':''}>Inactivo</option></select>`)}<section class="panel list-panel"><div class="panel-head"><div class="panel-title">Directorio de clientes</div><span class="list-summary">${records.length} de ${state.data.clients.length} registros</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Nombre / razón social</th><th>Tipo</th><th>RFC</th><th>Correo electrónico</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows||'<tr><td colspan="6"><div class="empty-state"><span class="empty-icon">♙</span><strong>No se encontraron clientes</strong><p>Prueba con otro término o registra un nuevo cliente.</p></div></td></tr>'}</tbody></table></div><div class="table-footer"><span>La búsqueda incluye nombre, RFC y correo.</span><span>${records.length} clientes</span></div></section>`;
}
function invoiceView() {
  const records=state.data.invoices.filter(x=>`${x.folio} ${clientName(x.clientId)} ${x.concept}`.toLowerCase().includes(state.search.toLowerCase())&&(state.status==='Todos'||x.status===state.status));
  const rows=records.map(x=>`<tr><td class="cell-primary">${esc(x.folio)}</td><td>${esc(clientName(x.clientId))}</td><td class="cell-muted">${shortDate(x.date)}</td><td>${shortDate(x.dueDate)}</td><td>${fullMoney(x.amount)}</td><td>${badge(x.status)}</td><td><div class="table-actions"><button class="row-action" title="Editar" data-action="edit" data-type="invoices" data-id="${esc(x.id)}">✎</button><button class="row-action" title="Eliminar" data-action="delete" data-type="invoices" data-id="${esc(x.id)}">×</button></div></td></tr>`).join('');
  return `${pageHeader('GESTIÓN','Facturación','Consulta y da seguimiento a las facturas del despacho.',`<button class="btn btn-primary" data-action="new" data-type="invoices"><span>＋</span> Nueva factura</button>`)}<div class="notice-box">Este módulo registra y consulta información administrativa de facturas. No emite CFDI, no timbra comprobantes ni se conecta automáticamente con el SAT.</div>${toolbar('Buscar por folio, cliente o concepto',`<select class="filter-select" id="statusFilter"><option>Todos</option>${['Pendiente','Pagada','Vencida','Cancelada'].map(s=>`<option ${state.status===s?'selected':''}>${s}</option>`).join('')}</select>`)}<section class="panel list-panel"><div class="panel-head"><div class="panel-title">Facturas registradas</div><span class="list-summary">${records.length} registros · ${money(sum(records,x=>x.status!=='Pagada'&&x.status!=='Cancelada'))} por cobrar</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Folio</th><th>Cliente</th><th>Emisión</th><th>Vencimiento</th><th>Importe</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows||'<tr><td colspan="7"><div class="empty-state"><strong>No hay facturas para mostrar</strong><p>Agrega una factura o cambia los filtros.</p></div></td></tr>'}</tbody></table></div><div class="table-footer"><span>El estado Vencida se actualiza con la fecha límite y el estado de pago.</span><span>${records.length} facturas</span></div></section>`;
}
function transactionView() {
  const records=state.data.transactions.filter(x=>`${x.concept} ${x.category} ${clientName(x.clientId)}`.toLowerCase().includes(state.search.toLowerCase())&&(state.type==='Todos'||x.type===state.type));
  const rows=records.map(x=>`<tr><td class="cell-muted">${shortDate(x.date)}</td><td class="cell-primary">${esc(x.concept)}</td><td>${esc(x.category)}</td><td>${x.clientId?esc(clientName(x.clientId)):'—'}</td><td><span class="badge ${x.type==='Ingreso'?'badge-paid':'badge-overdue'}">${esc(x.type)}</span></td><td class="${x.type==='Ingreso'?'income-text':'expense-text'}">${x.type==='Ingreso'?'+':'−'} ${fullMoney(x.amount)}</td><td><div class="table-actions"><button class="row-action" title="Editar" data-action="edit" data-type="transactions" data-id="${esc(x.id)}">✎</button><button class="row-action" title="Eliminar" data-action="delete" data-type="transactions" data-id="${esc(x.id)}">×</button></div></td></tr>`).join('');
  const inc=sum(records,x=>x.type==='Ingreso'), exp=sum(records,x=>x.type==='Egreso');
  return `${pageHeader('GESTIÓN','Ingresos y egresos','Registra movimientos y revisa el flujo de recursos del despacho.',`<button class="btn" data-action="new" data-type="transactions" data-flow="Egreso">− Registrar egreso</button><button class="btn btn-primary" data-action="new" data-type="transactions" data-flow="Ingreso"><span>＋</span> Registrar ingreso</button>`)}${toolbar('Buscar por concepto, categoría o cliente',`<select class="filter-select" id="typeFilter"><option>Todos</option><option ${state.type==='Ingreso'?'selected':''}>Ingreso</option><option ${state.type==='Egreso'?'selected':''}>Egreso</option></select>`)}<div class="stats-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-top:2px">${statCard('Ingresos filtrados',money(inc),'Movimientos del filtro actual','↗')}${statCard('Egresos filtrados',money(exp),'Movimientos del filtro actual','↘')}${statCard('Balance del filtro',money(inc-exp),'Ingresos menos egresos','∑')}</div><section class="panel list-panel"><div class="panel-head"><div class="panel-title">Movimientos</div><span class="list-summary">${records.length} registros</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Cliente</th><th>Tipo</th><th>Importe</th><th>Acciones</th></tr></thead><tbody>${rows||'<tr><td colspan="7"><div class="empty-state"><strong>No hay movimientos</strong><p>Registra un ingreso o un egreso para comenzar.</p></div></td></tr>'}</tbody></table></div></section>`;
}
function obligationView() {
  const records=state.data.obligations.filter(x=>`${x.name} ${clientName(x.clientId)} ${x.period}`.toLowerCase().includes(state.search.toLowerCase())&&(state.status==='Todos'||x.status===state.status));
  const rows=records.map(x=>`<tr><td class="cell-primary">${esc(x.name)}</td><td>${esc(clientName(x.clientId))}</td><td class="cell-muted">${esc(x.period)}</td><td>${shortDate(x.dueDate)}</td><td>${esc(x.owner||'—')}</td><td>${badge(x.dueDate<todayISO()&&x.status!=='Presentada'?'Vencida':x.status)}</td><td><div class="table-actions"><button class="row-action" title="Editar" data-action="edit" data-type="obligations" data-id="${esc(x.id)}">✎</button><button class="row-action" title="Eliminar" data-action="delete" data-type="obligations" data-id="${esc(x.id)}">×</button></div></td></tr>`).join('');
  const overdue=records.filter(x=>x.dueDate<todayISO()&&x.status!=='Presentada').length;
  return `${pageHeader('SEGUIMIENTO','Obligaciones','Organiza fechas límite, responsables y estatus de seguimiento.',`<button class="btn btn-primary" data-action="new" data-type="obligations"><span>＋</span> Nueva obligación</button>`)}${overdue?`<div class="notice-box">Hay ${overdue} obligación(es) con fecha límite vencida. Confirma su estado y actualiza el seguimiento.</div>`:''}${toolbar('Buscar por cliente, obligación o periodo',`<select class="filter-select" id="statusFilter"><option>Todos</option>${['Pendiente','En proceso','Presentada'].map(s=>`<option ${state.status===s?'selected':''}>${s}</option>`).join('')}</select>`)}<section class="panel list-panel"><div class="panel-head"><div class="panel-title">Calendario de obligaciones</div><span class="list-summary">${records.length} registros · ${overdue} vencidas</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Obligación</th><th>Cliente</th><th>Periodo</th><th>Fecha límite</th><th>Responsable</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows||'<tr><td colspan="7"><div class="empty-state"><strong>No hay obligaciones</strong><p>Agrega un seguimiento para comenzar.</p></div></td></tr>'}</tbody></table></div></section>`;
}
function reportView() {
  const now=new Date(); const selected=state.period;
  let label='Mes actual', matches;
  if(selected==='this-month') matches=state.data.transactions.filter(x=>x.date.startsWith(monthKey(now)));
  else if(selected==='last-month'){const d=new Date(now.getFullYear(),now.getMonth()-1,1);label='Mes anterior';matches=state.data.transactions.filter(x=>x.date.startsWith(monthKey(d)));}
  else {label='Todo el historial';matches=state.data.transactions;}
  const inc=sum(matches,x=>x.type==='Ingreso'),exp=sum(matches,x=>x.type==='Egreso');
  const cats={};matches.filter(x=>x.type==='Egreso').forEach(x=>cats[x.category]=(cats[x.category]||0)+Number(x.amount));
  const max=Math.max(1,...Object.values(cats));
  return `${pageHeader('CONSULTA','Reportes','Resume movimientos registrados y exporta la información para análisis.',`<button class="btn" id="downloadCsv">⇩ Exportar CSV</button>`)}<div class="toolbar"><select class="filter-select" id="periodFilter"><option value="this-month" ${selected==='this-month'?'selected':''}>Mes actual</option><option value="last-month" ${selected==='last-month'?'selected':''}>Mes anterior</option><option value="all" ${selected==='all'?'selected':''}>Todo el historial</option></select><span class="pill-subtle">Periodo: ${label}</span></div><div class="report-grid"><section class="panel"><div class="panel-head"><div><div class="panel-title">Resumen financiero</div><div class="panel-subtitle">Con base en los movimientos capturados</div></div></div><div class="report-kpis"><div class="report-kpi income"><small>Ingresos</small><strong>${money(inc)}</strong></div><div class="report-kpi expense"><small>Egresos</small><strong>${money(exp)}</strong></div><div class="report-kpi net"><small>Balance</small><strong>${money(inc-exp)}</strong></div></div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">Egresos por categoría</div><div class="panel-subtitle">Distribución del periodo</div></div></div><div class="category-list">${Object.keys(cats).length?Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,val])=>`<div class="category-row"><span>${esc(cat)}</span><span class="category-track"><i style="width:${val/max*100}%"></i></span><span class="category-value">${money(val)}</span></div>`).join(''):'<span class="pill-subtle">No hay egresos en este periodo.</span>'}</div></section></div><section class="panel list-panel"><div class="panel-head"><div class="panel-title">Movimientos incluidos</div><span class="list-summary">${matches.length} registros</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Fecha</th><th>Concepto</th><th>Tipo</th><th>Categoría</th><th>Importe</th></tr></thead><tbody>${matches.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(x=>`<tr><td class="cell-muted">${shortDate(x.date)}</td><td class="cell-primary">${esc(x.concept)}</td><td>${badge(x.type)}</td><td>${esc(x.category)}</td><td>${fullMoney(x.amount)}</td></tr>`).join('')||'<tr><td colspan="5"><div class="empty-state"><strong>Sin movimientos en el periodo</strong><p>Prueba con otro periodo o agrega movimientos.</p></div></td></tr>'}</tbody></table></div></section>`;
}
function activityView() {
  return `${pageHeader('CONTROL','Actividad reciente','Historial local de cambios realizados en esta instancia.',`<button class="btn" id="backupBtn">⇩ Descargar respaldo JSON</button>`)}<div class="notice-box">La bitácora conserva el usuario y la operación asociada a cada cambio. Descarga un respaldo antes de mover o reemplazar los datos de esta instancia.</div><section class="panel"><div class="panel-head"><div><div class="panel-title">Bitácora de operaciones</div><div class="panel-subtitle">Últimos cambios registrados</div></div><span class="list-summary">${state.data.audit.length} eventos</span></div><div class="activity-list">${state.data.audit.length?state.data.audit.map(a=>`<div class="activity-row"><span class="activity-dot">↻</span><div class="activity-copy"><strong>${esc(a.action)}</strong><small>${esc(a.user)}</small></div><span class="activity-time">${new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(a.at))}</span></div>`).join(''):'<div class="activity-empty">Aún no hay cambios en la bitácora.</div>'}</div></section>`;
}
function usersView(){
  const records=state.data.users||[];const labels={admin:'Administración',accountant:'Contabilidad',viewer:'Consulta'};
  const rows=records.map(u=>`<tr><td class="cell-primary">${esc(u.name)}</td><td>${esc(u.username)}</td><td><span class="role-chip">${labels[u.role]||esc(u.role)}</span></td><td>${badge(u.active?'Activo':'Inactivo')}</td><td>${u.mustChangePassword?'<span class="pill-subtle">Cambio de contraseña pendiente</span>':'<span class="pill-subtle">Acceso habilitado</span>'}</td><td><div class="table-actions">${u.id!==state.data.currentUser.id?`<button class="row-action" title="Eliminar usuario" data-action="delete" data-type="users" data-id="${esc(u.id)}">×</button>`:'<span class="pill-subtle">Cuenta actual</span>'}</div></td></tr>`).join('');
  return `${pageHeader('ADMINISTRACIÓN','Usuarios y roles','Controla quién puede consultar y modificar la información.',`<button class="btn btn-primary" data-action="new" data-type="users"><span>＋</span> Crear usuario</button>`)}<div class="notice-box">Las cuentas nuevas reciben una contraseña temporal generada al crearlas y deben cambiarla al iniciar sesión. Entrégala a la persona correspondiente por un canal privado.</div><section class="panel list-panel"><div class="panel-head"><div class="panel-title">Cuentas de acceso</div><span class="list-summary">${records.length} usuarios</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acceso</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></section><div class="split-section" style="margin-top:14px"><section class="panel"><div class="panel-title">Administración</div><p class="panel-subtitle">Puede consultar y modificar todos los módulos, administrar usuarios y descargar respaldos.</p></section><section class="panel"><div class="panel-title">Contabilidad</div><p class="panel-subtitle">Puede consultar, crear y actualizar registros contables y administrativos.</p></section><section class="panel"><div class="panel-title">Consulta</div><p class="panel-subtitle">Puede consultar registros y reportes sin crear, modificar ni eliminar información.</p></section></div>`;
}
function render() {
  if(!state.data)return;
  const role=state.data.currentUser?.role||'viewer';const allowed=Object.keys(PAGE_NAMES).concat(role==='admin'?['users']:[]); if(!allowed.includes(state.view))state.view='dashboard';
  $('.breadcrumbs strong').textContent=PAGE_NAMES[state.view]; $('#crumbCurrent').textContent=PAGE_NAMES[state.view];
  document.querySelectorAll('[data-view]').forEach(a=>a.classList.toggle('active',a.dataset.view===state.view));
  $('#usersNav').hidden=role!=='admin';
  const user=state.data.currentUser;const roleNames={admin:'Administración',accountant:'Contabilidad',viewer:'Consulta'};$('#sidebarUserName').textContent=user?.name||'Usuario';$('#sidebarUserRole').textContent=roleNames[role]||role;$('#sidebarUserAvatar').textContent=(user?.name||'U').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  $('#clientCount').textContent=state.data.clients.length;
  const pending=state.data.obligations.some(x=>x.status!=='Presentada'&&x.dueDate<todayISO()); $('#obligationDot').style.display=pending?'block':'none';$('#notificationMark').style.display=pending?'block':'none';
  const views={dashboard,clients:clientView,invoices:invoiceView,transactions:transactionView,obligations:obligationView,reports:reportView,activity:activityView,users:usersView};
  $('#page').innerHTML=views[state.view]();
  if(role==='viewer')$('#page').querySelectorAll('[data-action="new"],[data-action="edit"],[data-action="delete"]').forEach(el=>el.remove());
  else if(role!=='admin')$('#page').querySelectorAll('[data-action="delete"]').forEach(el=>el.remove());
}
async function refresh() { state.data=await api('state'); render(); }
function options(values,current='') { return values.map(x=>`<option value="${esc(x)}" ${x===current?'selected':''}>${esc(x)}</option>`).join(''); }
function field(label,name,value='',type='text',opts={}) {
  const required=opts.required?'required':''; const wide=opts.wide?' span-2':''; const hint=opts.hint?`<small class="field-hint">${opts.hint}</small>`:'';
  let control;
  if(type==='select') control=`<select name="${name}" ${required}>${opts.empty?'<option value="">Selecciona una opción</option>':''}${opts.choices.map(v=>{let val=typeof v==='string'?v:v.value,txt=typeof v==='string'?v:v.label;return `<option value="${esc(val)}" ${val===value?'selected':''}>${esc(txt)}</option>`}).join('')}</select>`;
  else if(type==='textarea') control=`<textarea name="${name}" ${required} placeholder="${esc(opts.placeholder||'')}">${esc(value)}</textarea>`;
  else control=`<input name="${name}" type="${type}" value="${esc(value)}" ${required} ${opts.min!==undefined?`min="${opts.min}"`:''} ${opts.step?`step="${opts.step}"`:''} placeholder="${esc(opts.placeholder||'')}">`;
  return `<div class="field${wide?' span-2':''}"><label>${label}${opts.required?' *':''}</label>${control}${hint}</div>`;
}
function formData(type,item={}) {
  const clients=state.data.clients.map(c=>({value:c.id,label:c.name}));
  if(type==='users')return field('Nombre completo','name','','text',{required:true})+field('Nombre de usuario','username','','text',{required:true,hint:'Solo letras minúsculas, números, punto, guion o guion bajo.'})+field('Rol','role','accountant','select',{choices:[{value:'admin',label:'Administración'},{value:'accountant',label:'Contabilidad'},{value:'viewer',label:'Consulta'}]});
  if(type==='clients')return field('Nombre o razón social','name',item.name||'','text',{required:true})+field('Tipo de persona','type',item.type||'Persona física','select',{choices:['Persona física','Persona moral']})+field('RFC','rfc',item.rfc||'','text',{required:true,hint:'13 caracteres para persona física, 12 para persona moral.'})+field('Correo electrónico','email',item.email||'','email')+field('Teléfono','phone',item.phone||'','tel')+field('Estado','status',item.status||'Activo','select',{choices:['Activo','Inactivo']})+field('Notas','notes',item.notes||'','textarea',{wide:true});
  if(type==='invoices')return field('Folio administrativo','folio',item.folio||`FAC-${new Date().getFullYear()}-${String(state.data.invoices.length+1).padStart(4,'0')}`,'text',{required:true})+field('Cliente','clientId',item.clientId||'','select',{choices:clients,empty:true,required:true})+field('Fecha de emisión','date',item.date||todayISO(),'date',{required:true})+field('Fecha límite de pago','dueDate',item.dueDate||todayISO(),'date',{required:true})+field('Importe (MXN)','amount',item.amount??'','number',{required:true,min:'0.01',step:'0.01'})+field('Estado','status',item.status||'Pendiente','select',{choices:['Pendiente','Pagada','Vencida','Cancelada']})+field('Concepto','concept',item.concept||'','text',{wide:true,required:true})+field('Notas','notes',item.notes||'','textarea',{wide:true});
  if(type==='transactions')return field('Tipo de movimiento','type',item.type||'Ingreso','select',{choices:['Ingreso','Egreso'],required:true})+field('Fecha','date',item.date||todayISO(),'date',{required:true})+field('Concepto','concept',item.concept||'','text',{required:true})+field('Categoría','category',item.category||'','text',{required:true,placeholder:'Ej. Honorarios, servicios, papelería'})+field('Importe (MXN)','amount',item.amount??'','number',{required:true,min:'0.01',step:'0.01'})+field('Método de pago','method',item.method||'Transferencia','select',{choices:['Transferencia','Efectivo','Tarjeta','Otro']})+field('Cliente relacionado','clientId',item.clientId||'','select',{choices:clients,empty:true})+field('Notas','notes',item.notes||'','textarea',{wide:true});
  return field('Cliente','clientId',item.clientId||'','select',{choices:clients,empty:true,required:true})+field('Obligación','name',item.name||'','text',{required:true})+field('Periodo','period',item.period||'','text',{required:true,placeholder:'Ej. Octubre 2026'})+field('Fecha límite','dueDate',item.dueDate||todayISO(),'date',{required:true})+field('Estado','status',item.status||'Pendiente','select',{choices:['Pendiente','En proceso','Presentada']})+field('Responsable','owner',item.owner||'','text')+field('Notas','notes',item.notes||'','textarea',{wide:true});
}
function openForm(type,id=null,flow=null) {
  const titles={clients:'cliente',invoices:'factura',transactions:'movimiento',obligations:'obligación',users:'usuario'};
  const existing=id?state.data[type].find(x=>x.id===id):null; const item={...(existing||{})};if(flow&&!existing)item.type=flow;
  $('#modalEyebrow').textContent=existing?'EDICIÓN':'NUEVO REGISTRO';$('#modalTitle').textContent=`${existing?'Editar':'Nuevo'} ${titles[type]}`;
  $('#modalBody').innerHTML=`<form id="recordForm" class="form-grid" data-type="${type}" data-id="${id||''}">${formData(type,item)}<div class="field span-2"><div class="modal-actions"><button type="button" class="btn" id="cancelForm">Cancelar</button><button class="btn btn-primary" type="submit">${existing?'Guardar cambios':'Crear registro'}</button></div></div></form>`;
  $('#modalBackdrop').hidden=false;document.body.style.overflow='hidden';
  $('#modalBody input')?.focus();
}
function closeModal(){ $('#modalBackdrop').hidden=true;document.body.style.overflow=''; }
async function saveForm(form) {
  const type=form.dataset.type,id=form.dataset.id||'';const fd=new FormData(form);const body=Object.fromEntries(fd.entries());
  if(body.amount!==undefined)body.amount=Number(body.amount);
  if(type==='users'){
    const result=await api('users',{method:'POST',body:JSON.stringify(body)});closeModal();await refresh();showTemporaryPassword(result.temporaryPassword);toast('Cuenta creada. La contraseña se muestra una sola vez.');return;
  }
  if(type==='clients'){
    body.name=body.name.trim();body.rfc=body.rfc.replace(/\s/g,'').toUpperCase();
    if(!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(body.rfc))throw new Error('Revisa el formato del RFC (12 o 13 caracteres).');
  }
  if(type==='invoices'){
    if(!state.data.clients.some(c=>c.id===body.clientId))throw new Error('Selecciona un cliente válido.');
    if(body.dueDate<body.date)throw new Error('La fecha límite no puede ser anterior a la fecha de emisión.');
    if(body.status==='Pendiente'&&body.dueDate<todayISO())body.status='Vencida';
  }
  if(type==='transactions'&&body.clientId&&!state.data.clients.some(c=>c.id===body.clientId))throw new Error('Selecciona un cliente válido.');
  if(type==='obligations'){
    if(!state.data.clients.some(c=>c.id===body.clientId))throw new Error('Selecciona un cliente válido.');
    if(body.status==='Pendiente'&&body.dueDate<todayISO())body.status='Pendiente';
  }
  if(id)await api(`${type}/${id}`,{method:'PUT',body:JSON.stringify(body)});else await api(type,{method:'POST',body:JSON.stringify(body)});
  closeModal();await refresh();toast(id?'Cambios guardados.':'Registro creado.');
}
async function removeRecord(type,id) {
  const record=(state.data[type]||[]).find(x=>x.id===id);const label=record?.name||record?.username||record?.folio||record?.concept||'este registro';
  if(!window.confirm(`¿Eliminar ${label}? Esta acción también quedará en la bitácora.`))return;
  try{await api(`${type}/${id}`,{method:'DELETE'});await refresh();toast('Registro eliminado.');}catch(e){toast(e.message,true);}
}
function showTemporaryPassword(password){
  $('#modalEyebrow').textContent='CREDENCIAL TEMPORAL';$('#modalTitle').textContent='Comparte el acceso de forma privada';$('#modalBody').innerHTML=`<div class="notice-box">Esta contraseña se muestra una sola vez. Entrégala directamente a la persona y pídele que la cambie en su primer acceso.</div><div class="field"><label>Contraseña temporal</label><input id="tempPassword" readonly value="${esc(password)}"></div><div class="modal-actions"><button class="btn" id="copyTempPassword">Copiar</button><button class="btn btn-primary" id="finishUserCreate">Listo</button></div>`;$('#modalBackdrop').hidden=false;
}
function clientDetail(id) {
  const c=state.data.clients.find(x=>x.id===id);if(!c)return;
  const invoices=state.data.invoices.filter(x=>x.clientId===id), tx=state.data.transactions.filter(x=>x.clientId===id), obs=state.data.obligations.filter(x=>x.clientId===id);
  const history=[...invoices.map(x=>({date:x.date,desc:`Factura ${x.folio}`,amount:x.amount,type:'Factura'})),...tx.map(x=>({date:x.date,desc:x.concept,amount:x.amount,type:x.type})),...obs.map(x=>({date:x.dueDate,desc:x.name,amount:null,type:'Obligación'}))].sort((a,b)=>b.date.localeCompare(a.date));
  $('#modalEyebrow').textContent='EXPEDIENTE DE CLIENTE';$('#modalTitle').textContent='Historial y datos';
  $('#modalBody').innerHTML=`<div class="detail-hero"><span class="detail-avatar">${esc(c.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase())}</span><div><strong>${esc(c.name)}</strong><small>${esc(c.type)} · ${badge(c.status)}</small></div></div><div class="detail-info"><div><small>RFC</small><strong>${esc(c.rfc||'—')}</strong></div><div><small>Teléfono</small><strong>${esc(c.phone||'—')}</strong></div><div><small>Correo</small><strong>${esc(c.email||'—')}</strong></div><div><small>Registros asociados</small><strong>${invoices.length} facturas · ${obs.length} obligaciones</strong></div></div><div class="detail-section-title">Historial</div><div class="detail-list">${history.length?history.map(h=>`<div class="detail-list-row"><span>${shortDate(h.date)} · ${esc(h.desc)}</span><span>${h.amount===null?esc(h.type):fullMoney(h.amount)}</span></div>`).join(''):'<div class="activity-empty">Todavía no hay actividad registrada.</div>'}</div>`;
  $('#modalBackdrop').hidden=false;document.body.style.overflow='hidden';
}
function csvEscape(v){return `"${String(v??'').replace(/"/g,'""')}"`;}
function exportCsv() {
  const now=new Date();let period=state.period==='all'?null:state.period==='last-month'?monthKey(new Date(now.getFullYear(),now.getMonth()-1,1)):monthKey(now);
  const entries=state.data.transactions.filter(x=>!period||x.date.startsWith(period));
  const rows=[['Fecha','Tipo','Concepto','Categoría','Cliente','Importe MXN','Método'],...entries.map(x=>[x.date,x.type,x.concept,x.category,x.clientId?clientName(x.clientId):'',Number(x.amount).toFixed(2),x.method||''])];
  const csv='\uFEFF'+rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');downloadBlob(csv,`movimientos_despacho_${period||'historico'}_${todayISO()}.csv`,'text/csv;charset=utf-8');toast('Reporte CSV descargado.');
}
function downloadBlob(content,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),800);}
async function backup(){try{const data=await api('state');downloadBlob(JSON.stringify({exportedAt:new Date().toISOString(),data},null,2),`respaldo_despacho_${todayISO()}.json`,'application/json');toast('Respaldo descargado.');}catch(e){toast(e.message,true);}}

$('#page').addEventListener('click',async e=>{
  const nav=e.target.closest('[data-nav]'); if(nav){e.preventDefault();go(nav.dataset.nav);return;}
  const action=e.target.closest('[data-action]'); if(!action)return;
  if(action.dataset.action==='new')openForm(action.dataset.type,null,action.dataset.flow);
  if(action.dataset.action==='edit')openForm(action.dataset.type,action.dataset.id);
  if(action.dataset.action==='delete')removeRecord(action.dataset.type,action.dataset.id);
  if(action.dataset.action==='detail-client')clientDetail(action.dataset.id);
});
$('#page').addEventListener('input',e=>{if(e.target.id==='searchInput'){const pos=e.target.selectionStart;state.search=e.target.value;render();const next=$('#searchInput');next.focus();next.setSelectionRange(pos,pos);}});
$('#page').addEventListener('change',e=>{if(e.target.id==='statusFilter'){state.status=e.target.value;render();}if(e.target.id==='typeFilter'){state.type=e.target.value;render();}if(e.target.id==='periodFilter'){state.period=e.target.value;render();}});
$('#page').addEventListener('submit',async e=>{if(e.target.id!=='recordForm')return;e.preventDefault();if(!e.target.reportValidity())return;try{await saveForm(e.target);}catch(err){toast(err.message,true);}});
$('#page').addEventListener('click',e=>{if(e.target.id==='downloadCsv')exportCsv();if(e.target.id==='backupBtn')backup();if(e.target.id==='copyTempPassword'){navigator.clipboard?.writeText($('#tempPassword').value);toast('Contraseña copiada.');}if(e.target.id==='finishUserCreate')closeModal();});
$('#modalClose').addEventListener('click',closeModal);$('#modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});$('#modalBody').addEventListener('click',e=>{if(e.target.id==='cancelForm'||e.target.id==='finishUserCreate')closeModal();if(e.target.id==='copyTempPassword'){navigator.clipboard?.writeText($('#tempPassword').value);toast('Contraseña copiada.');}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modalBackdrop').hidden)closeModal();});
function setSidebarOpen(open){$('#sidebar').classList.toggle('open',open);$('#sidebarBackdrop').hidden=!open;$('#menuBtn').setAttribute('aria-expanded',String(open));document.body.classList.toggle('sidebar-open',open);}
function go(view){state.view=view;state.search='';state.status='Todos';state.type='Todos';location.hash=view;render();setSidebarOpen(false);}
document.querySelectorAll('[data-view]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();go(a.dataset.view);}));$('#menuBtn').addEventListener('click',()=>setSidebarOpen(!$('#sidebar').classList.contains('open')));$('#sidebarBackdrop').addEventListener('click',()=>setSidebarOpen(false));
$('#notifyBtn').addEventListener('click',()=>go('obligations'));$('#helpBtn').addEventListener('click',()=>toast('Usa el menú para abrir cada módulo; los cambios se guardan en la instancia local.'));
$('#userMenu').addEventListener('click',async()=>{try{await api('logout',{method:'POST',body:'{}'});}catch{}state.data=null;showLogin();$('#loginForm input[name="password"]').value='';});
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;$('#loginError').textContent='';try{const result=await api('login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form).entries()))});form.reset();await openSession(result.user);}catch(err){$('#loginError').textContent=err.message;}});
$('#passwordForm').addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;$('#passwordError').textContent='';const body=Object.fromEntries(new FormData(form).entries());try{await api('password',{method:'POST',body:JSON.stringify(body)});form.reset();$('#passwordScreen').hidden=true;$('#appShell').hidden=false;await refresh();toast('Contraseña actualizada.');}catch(err){$('#passwordError').textContent=err.message;}});
window.addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(v&&v!==state.view){state.view=v;state.search='';render();}});
api('me').then(({user})=>openSession(user)).catch(()=>showLogin());
let lastUiActivity=Date.now();
for(const eventName of ['pointerdown','keydown','input','touchstart'])document.addEventListener(eventName,()=>{lastUiActivity=Date.now();},{passive:true});
setInterval(()=>{if(!$('#appShell').hidden&&Date.now()-lastUiActivity>=30*60*1000){state.data=null;showLogin();toast('La sesión terminó por inactividad. Inicia sesión nuevamente.',true);}},60_000);
