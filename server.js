'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const database = require('./database');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 4173);
// Local Wi-Fi access was explicitly enabled for the phone preview.
const HOST = process.env.HOST || '0.0.0.0';
const TYPES = ['clients', 'invoices', 'transactions', 'obligations'];
const PERMISSIONS = { admin: ['read', 'write', 'delete', 'users'], accountant: ['read', 'write'], viewer: ['read'] };
const sessions = new Map();
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const SESSION_MS = 30 * 60 * 1000;
const loginFailures = new Map();
const MAX_LOGIN_FAILURES = 8;
const LOGIN_COOLDOWN_MS = 15 * 60 * 1000;
setInterval(()=>{const cutoff=Date.now()-SESSION_MS;for(const [token,session] of sessions)if(session.lastActivity<cutoff)sessions.delete(token);},60_000).unref();
setInterval(()=>{const now=Date.now();for(const [key,entry] of loginFailures)if(entry.resetAt<=now)loginFailures.delete(key);},60_000).unref();

function isoDay(offset = 0) { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); }
function randomPassword() { return crypto.randomBytes(18).toString('base64url'); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return { salt, passwordHash: crypto.scryptSync(password, salt, 64).toString('hex') }; }
function verifyPassword(password, user) { const candidate = crypto.scryptSync(password, user.salt, 64); const stored=user.passwordHash||user.hash; return Boolean(stored)&&crypto.timingSafeEqual(candidate, Buffer.from(stored, 'hex')); }
function seed() {
  const firstPassword = randomPassword();
  const admin = { id: 'usr-admin', username: 'admin', name: 'Administración', role: 'admin', ...hashPassword(firstPassword), mustChangePassword: true, active: true };
  console.log(`\nAcceso inicial de demostración (cámbialo al entrar):\nUsuario: admin\nContraseña temporal: ${firstPassword}\n`);
  return {
    clients: [
      { id: 'cli-1', name: 'Empresa de Prueba 001', type: 'Persona moral', rfc: 'AAA000101AAA', email: 'empresa001@example.invalid', phone: '000 000 0000', status: 'Activo', notes: '' },
      { id: 'cli-2', name: 'Persona de Prueba 001', type: 'Persona física', rfc: 'AAAA000101AAA', email: 'persona001@example.invalid', phone: '000 000 0000', status: 'Activo', notes: '' },
      { id: 'cli-3', name: 'Empresa de Prueba 002', type: 'Persona moral', rfc: 'BBB000101BBB', email: 'empresa002@example.invalid', phone: '000 000 0000', status: 'Activo', notes: '' },
      { id: 'cli-4', name: 'Persona de Prueba 002', type: 'Persona física', rfc: 'BBBB000101BBB', email: 'persona002@example.invalid', phone: '000 000 0000', status: 'Inactivo', notes: '' }
    ],
    invoices: [
      { id: 'fac-1', folio: 'FAC-DEMO-001', clientId: 'cli-1', date: isoDay(-2), dueDate: isoDay(12), concept: 'Servicio de demostración', amount: 1500, status: 'Pendiente', notes: '' },
      { id: 'fac-2', folio: 'FAC-DEMO-002', clientId: 'cli-2', date: isoDay(-8), dueDate: isoDay(-1), concept: 'Concepto de muestra', amount: 800, status: 'Vencida', notes: '' },
      { id: 'fac-3', folio: 'FAC-DEMO-003', clientId: 'cli-3', date: isoDay(-16), dueDate: isoDay(-5), concept: 'Servicio de demostración', amount: 1200, status: 'Pagada', notes: '' }
    ],
    transactions: [
      { id: 'mov-1', type: 'Ingreso', date: isoDay(-2), category: 'Demostración', concept: 'Movimiento de muestra', clientId: 'cli-1', amount: 1500, method: 'Transferencia', notes: '' },
      { id: 'mov-2', type: 'Egreso', date: isoDay(-4), category: 'Demostración', concept: 'Gasto de muestra', clientId: '', amount: 100, method: 'Transferencia', notes: '' },
      { id: 'mov-3', type: 'Ingreso', date: isoDay(-7), category: 'Demostración', concept: 'Movimiento de muestra', clientId: 'cli-3', amount: 1200, method: 'Transferencia', notes: '' },
      { id: 'mov-4', type: 'Egreso', date: isoDay(-9), category: 'Demostración', concept: 'Gasto de muestra', clientId: '', amount: 80, method: 'Efectivo', notes: '' },
      { id: 'mov-5', type: 'Ingreso', date: isoDay(-38), category: 'Demostración', concept: 'Movimiento de muestra', clientId: 'cli-2', amount: 900, method: 'Transferencia', notes: '' },
      { id: 'mov-6', type: 'Egreso', date: isoDay(-52), category: 'Demostración', concept: 'Gasto de muestra', clientId: '', amount: 250, method: 'Transferencia', notes: '' }
    ],
    obligations: [
      { id: 'obl-1', clientId: 'cli-1', name: 'Obligación de demostración 001', period: 'Periodo de muestra A', dueDate: isoDay(4), status: 'En proceso', owner: 'Usuario de prueba', notes: '' },
      { id: 'obl-2', clientId: 'cli-2', name: 'Obligación de demostración 002', period: 'Periodo de muestra A', dueDate: isoDay(-2), status: 'Pendiente', owner: 'Usuario de prueba', notes: '' },
      { id: 'obl-3', clientId: 'cli-3', name: 'Obligación de demostración 003', period: 'Periodo de muestra B', dueDate: isoDay(-10), status: 'Presentada', owner: 'Usuario de prueba', notes: '' }
    ],
    users: [admin],
    audit: [{ id: crypto.randomUUID(), at: new Date().toISOString(), action: 'Sistema inicializado con registros de demostración', user: 'Sistema' }]
  };
}
function readStore() { return database.readStore(); }
function saveStore(data) { database.saveStore(data); }
function publicUser(user) { return { id:user.id, username:user.username, name:user.name, role:user.role, mustChangePassword:user.mustChangePassword, active:user.active }; }
function reply(res, status, data, type = 'application/json; charset=utf-8', extra = {}) {
  if (typeof type === "object") { extra = type; type = "application/json; charset=utf-8"; }
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; img-src 'self' data:", ...(process.env.NODE_ENV === 'production' ? { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' } : {}), ...extra });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
function getBody(req) { return new Promise((resolve, reject) => { let body=''; req.on('data',c=>{body+=c;if(body.length>1_000_000)reject(new Error('El registro es demasiado grande.'));}); req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch{reject(new Error('El formato enviado no es JSON válido.'));}});req.on('error',reject); }); }
function audit(data, action, user) { data.audit.unshift({ id:crypto.randomUUID(), at:new Date().toISOString(), action, user:user.name }); data.audit=data.audit.slice(0,500); }
function getSession(req) {
  const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sid='))?.slice(4);
  if(!token)return null;
  const session=sessions.get(token); if(!session)return null;
  if(Date.now()-session.lastActivity>SESSION_MS){sessions.delete(token);return null;}
  const store=readStore();const user=store.users.find(u=>u.id===session.userId&&u.active);
  if(!user){sessions.delete(token);return null;}
  session.lastActivity=Date.now();return { token, user };
}
function cleanRecord(type, input) {
  const fields={clients:['name','type','rfc','email','phone','status','notes'],invoices:['folio','clientId','date','dueDate','concept','amount','status','notes'],transactions:['type','date','category','concept','clientId','amount','method','notes'],obligations:['clientId','name','period','dueDate','status','owner','notes']}[type];
  const out={}; for(const key of fields){if(input[key]!==undefined)out[key]=typeof input[key]==='string'?input[key].trim():input[key];}
  for(const key of ['name','folio','concept','category','period','owner','email','phone','notes','rfc']) if(typeof out[key]==='string'&&out[key].length>500)throw new Error(`${key} excede el tamaño permitido.`);
  if('amount' in out){out.amount=Number(out.amount);if(!Number.isFinite(out.amount)||out.amount<=0||out.amount>1e12)throw new Error('El importe debe ser mayor que cero y válido.');}
  if(type==='clients'){
    if(!out.name||!out.rfc)throw new Error('El nombre y el RFC son obligatorios.');
    if(!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(String(out.rfc).toUpperCase()))throw new Error('El RFC no tiene el formato esperado.');
    out.rfc=out.rfc.toUpperCase();
  }
  if(type==='invoices'&&(!out.folio||!out.clientId||!out.date||!out.dueDate||!out.concept||!('amount'in out)))throw new Error('Completa folio, cliente, fechas, concepto e importe.');
  if(type==='transactions'&&(!out.type||!out.date||!out.category||!out.concept||!('amount'in out)))throw new Error('Completa tipo, fecha, categoría, concepto e importe.');
  if(type==='obligations'&&(!out.clientId||!out.name||!out.period||!out.dueDate))throw new Error('Completa cliente, obligación, periodo y fecha límite.');
  return out;
}
function serveStatic(res, pathname) {
  const file=pathname==='/'?path.join(PUBLIC,'index.html'):path.resolve(PUBLIC,`.${pathname}`);
  if(!file.startsWith(PUBLIC+path.sep)&&file!==path.join(PUBLIC,'index.html'))return reply(res,403,{error:'Acceso denegado.'});
  fs.readFile(file,(err,bytes)=>err?reply(res,404,{error:'No se encontró el archivo solicitado.'}):reply(res,200,bytes,MIME[path.extname(file)]||'application/octet-stream'));
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${HOST}:${PORT}`);
  if(!url.pathname.startsWith('/api/'))return serveStatic(res,url.pathname);
  try{
    if(req.method==='POST'&&url.pathname==='/api/login'){
      const {username,password}=await getBody(req);const loginName=String(username||'').toLowerCase();
      const clientAddress=process.env.TRUST_PROXY==='1'?String(req.headers['x-forwarded-for']||'').split(',')[0].trim():(req.socket.remoteAddress||'local');
      const attemptKey=`${clientAddress}\0${loginName}`;const prior=loginFailures.get(attemptKey);
      if(prior&&prior.count>=MAX_LOGIN_FAILURES&&prior.resetAt>Date.now())return reply(res,429,{error:'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.'});
      const data=readStore();const user=data.users.find(u=>u.username.toLowerCase()===loginName&&u.active);
      const ok=user&&typeof password==='string'&&password.length<=256&&verifyPassword(password,user);
      if(!ok){const current=loginFailures.get(attemptKey);loginFailures.set(attemptKey,{count:current&&current.resetAt>Date.now()?current.count+1:1,resetAt:current&&current.resetAt>Date.now()?current.resetAt:Date.now()+LOGIN_COOLDOWN_MS});await new Promise(r=>setTimeout(r,200));return reply(res,401,{error:'Usuario o contraseña incorrectos.'});}
      loginFailures.delete(attemptKey);
      const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{userId:user.id,lastActivity:Date.now()});audit(data,`Inicio de sesión: ${user.username}`,user);saveStore(data);
      const secureCookie=process.env.NODE_ENV==='production'?'; Secure':'';
      return reply(res,200,{user:publicUser(user)},{'Content-Type':'application/json; charset=utf-8','Set-Cookie':`sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800${secureCookie}`});
    }
    const auth=getSession(req);
    if(req.method==='GET'&&url.pathname==='/api/me')return auth?reply(res,200,{user:publicUser(auth.user)}):reply(res,401,{error:'Inicia sesión para continuar.'});
    if(!auth)return reply(res,401,{error:'La sesión terminó. Inicia sesión nuevamente.'});
    const role=auth.user.role;const permissions=PERMISSIONS[role]||[];
    if(req.method==='POST'&&url.pathname==='/api/logout'){
      sessions.delete(auth.token);const data=readStore();audit(data,`Cierre de sesión: ${auth.user.username}`,auth.user);saveStore(data);
      const secureCookie=process.env.NODE_ENV==='production'?'; Secure':'';
      return reply(res,200,{ok:true},'application/json; charset=utf-8',{'Set-Cookie':`sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}`});
    }
    if(req.method==='POST'&&url.pathname==='/api/password'){
      const {currentPassword,newPassword}=await getBody(req);if(!verifyPassword(String(currentPassword||''),auth.user))return reply(res,400,{error:'La contraseña actual no es correcta.'});
      if(typeof newPassword!=='string'||newPassword.length<12||newPassword.length>128)return reply(res,400,{error:'Usa una contraseña de 12 a 128 caracteres.'});
      const data=readStore(),u=data.users.find(x=>x.id===auth.user.id);Object.assign(u,hashPassword(newPassword),{mustChangePassword:false});audit(data,'Cambio de contraseña',u);saveStore(data);return reply(res,200,{user:publicUser(u)});
    }
    if(auth.user.mustChangePassword)return reply(res,403,{error:'Debes cambiar la contraseña temporal antes de continuar.',mustChangePassword:true});
    if(req.method==='GET'&&url.pathname==='/api/state'){
      const data=readStore();return reply(res,200,{...data,users:permissions.includes('users')?data.users.map(publicUser):[],currentUser:publicUser(auth.user)});
    }
    if(url.pathname==='/api/users'){
      if(!permissions.includes('users'))return reply(res,403,{error:'No tienes permisos para administrar usuarios.'});
      const data=readStore();
      if(req.method==='GET')return reply(res,200,data.users.map(publicUser));
      if(req.method==='POST'){
        const body=await getBody(req);const username=String(body.username||'').trim().toLowerCase(),name=String(body.name||'').trim(),roleName=body.role;
        if(!/^[a-z0-9._-]{3,40}$/.test(username)||!name||name.length>100||!['admin','accountant','viewer'].includes(roleName))return reply(res,400,{error:'Revisa usuario, nombre y rol.'});
        if(data.users.some(u=>u.username===username))return reply(res,409,{error:'Ese nombre de usuario ya existe.'});
        const password=randomPassword();const user={id:crypto.randomUUID(),username,name,role:roleName,...hashPassword(password),mustChangePassword:true,active:true};data.users.push(user);audit(data,`Alta de usuario: ${username}`,auth.user);saveStore(data);return reply(res,201,{user:publicUser(user),temporaryPassword:password});
      }
      return reply(res,405,{error:'Método no permitido.'});
    }
    const userMatch=url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if(userMatch&&req.method==='DELETE'){
      if(!permissions.includes('users'))return reply(res,403,{error:'No tienes permisos para administrar usuarios.'});
      const data=readStore(),index=data.users.findIndex(u=>u.id===userMatch[1]);if(index<0)return reply(res,404,{error:'Usuario no encontrado.'});
      if(data.users[index].id===auth.user.id)return reply(res,400,{error:'No puedes eliminar tu propia cuenta.'});
      if(data.users[index].role==='admin'&&data.users.filter(u=>u.role==='admin'&&u.active).length===1)return reply(res,400,{error:'Debe existir al menos una cuenta de administración.'});
      const [removed]=data.users.splice(index,1);audit(data,`Eliminación de usuario: ${removed.username}`,auth.user);saveStore(data);return reply(res,200,{ok:true});
    }
    const match=url.pathname.match(/^\/api\/(clients|invoices|transactions|obligations)(?:\/([^/]+))?$/);
    if(!match||!TYPES.includes(match[1]))return reply(res,404,{error:'Recurso no disponible.'});
    const [,type,id]=match,data=readStore();
    if(req.method==='GET'){
      if(id){const item=data[type].find(x=>x.id===id);return item?reply(res,200,item):reply(res,404,{error:'Registro no encontrado.'});}
      return reply(res,200,data[type]);
    }
    const mutating=req.method==='POST'||req.method==='PUT'||req.method==='DELETE';if(mutating&&!permissions.includes('write'))return reply(res,403,{error:'Tu perfil puede consultar información, pero no modificarla.'});
    if(req.method==='POST'&&!id){
      const item=cleanRecord(type,await getBody(req));
      if(type==='clients'&&data.clients.some(x=>x.rfc===item.rfc))return reply(res,409,{error:'Ya existe un cliente con ese RFC.'});
      if(type==='invoices'&&data.invoices.some(x=>x.folio===item.folio))return reply(res,409,{error:'Ese folio ya está registrado.'});
      if(['invoices','obligations'].includes(type)&&!data.clients.some(x=>x.id===item.clientId))return reply(res,400,{error:'Selecciona un cliente existente.'});
      if(type==='transactions'&&item.clientId&&!data.clients.some(x=>x.id===item.clientId))return reply(res,400,{error:'Selecciona un cliente existente.'});
      item.id=crypto.randomUUID();data[type].unshift(item);audit(data,`Alta de ${type}: ${item.name||item.folio||item.concept||item.id}`,auth.user);saveStore(data);return reply(res,201,item);
    }
    if(req.method==='PUT'&&id){const raw=await getBody(req);const index=data[type].findIndex(x=>x.id===id);if(index<0)return reply(res,404,{error:'Registro no encontrado.'});const clean=cleanRecord(type,{...data[type][index],...raw});
      if(type==='clients'&&data.clients.some(x=>x.id!==id&&x.rfc===clean.rfc))return reply(res,409,{error:'Ya existe un cliente con ese RFC.'});
      if(type==='invoices'&&data.invoices.some(x=>x.id!==id&&x.folio===clean.folio))return reply(res,409,{error:'Ese folio ya está registrado.'});
      if(['invoices','obligations'].includes(type)&&!data.clients.some(x=>x.id===clean.clientId))return reply(res,400,{error:'Selecciona un cliente existente.'});
      if(type==='transactions'&&clean.clientId&&!data.clients.some(x=>x.id===clean.clientId))return reply(res,400,{error:'Selecciona un cliente existente.'});
      data[type][index]={...data[type][index],...clean,id};audit(data,`Actualización de ${type}: ${clean.name||clean.folio||clean.concept||id}`,auth.user);saveStore(data);return reply(res,200,data[type][index]);}
    if(req.method==='DELETE'&&id){if(!permissions.includes('delete'))return reply(res,403,{error:'Tu perfil no puede eliminar registros.'});const index=data[type].findIndex(x=>x.id===id);if(index<0)return reply(res,404,{error:'Registro no encontrado.'});
      if(type==='clients'&&[...data.invoices,...data.transactions,...data.obligations].some(x=>x.clientId===id))return reply(res,409,{error:'No se puede eliminar este cliente porque tiene facturas, movimientos u obligaciones asociados.'});
      const [deleted]=data[type].splice(index,1);audit(data,`Eliminación de ${type}: ${deleted.name||deleted.folio||deleted.concept||id}`,auth.user);saveStore(data);return reply(res,200,{ok:true});}
    return reply(res,405,{error:'Método no permitido.'});
  }catch(error){return reply(res,400,{error:error.message||'No se pudo procesar la solicitud.'});}
});
database.initialize(seed).then(()=>server.listen(PORT,HOST,()=>console.log(`Despacho Contable disponible en http://${HOST}:${PORT}`))).catch(error=>{console.error('No se pudo iniciar la base de datos:',error);process.exitCode=1;});
