'use strict';
const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

// Set DATA_DIR to the hosting provider's persistent volume in production.
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DB_FILE = path.join(DATA_DIR, 'despacho.sqlite');
const LEGACY_FILE = path.join(DATA_DIR, 'store.json');
let db;

function all(sql) {
  const statement = db.prepare(sql), rows=[];
  try { while(statement.step()) rows.push(statement.getAsObject()); }
  finally { statement.free(); }
  return rows;
}
function run(sql, values=[]) { db.run(sql, values); }
function migrateLegacy(data) {
  for (const u of data.users || []) {
    if (!u.passwordHash && u.hash) u.passwordHash=u.hash;
    delete u.hash;
  }
  return data;
}
function replaceAll(data) {
  db.run('BEGIN');
  try {
    for (const table of ['audit','obligations','transactions','invoices','clients','users']) run(`DELETE FROM ${table}`);
    for (const u of data.users||[]) run('INSERT INTO users (id,username,name,role,salt,password_hash,must_change_password,active) VALUES (?,?,?,?,?,?,?,?)',[u.id,u.username,u.name,u.role,u.salt,u.passwordHash,Number(Boolean(u.mustChangePassword)),Number(Boolean(u.active))]);
    for (const c of data.clients||[]) run('INSERT INTO clients (id,name,type,rfc,email,phone,status,notes) VALUES (?,?,?,?,?,?,?,?)',[c.id,c.name,c.type,c.rfc,c.email||'',c.phone||'',c.status||'Activo',c.notes||'']);
    for (const x of data.invoices||[]) run('INSERT INTO invoices (id,folio,client_id,date,due_date,concept,amount,status,notes) VALUES (?,?,?,?,?,?,?,?,?)',[x.id,x.folio,x.clientId,x.date,x.dueDate,x.concept,Number(x.amount),x.status||'Pendiente',x.notes||'']);
    for (const x of data.transactions||[]) run('INSERT INTO transactions (id,type,date,category,concept,client_id,amount,method,notes) VALUES (?,?,?,?,?,?,?,?,?)',[x.id,x.type,x.date,x.category,x.concept,x.clientId||null,Number(x.amount),x.method||'',x.notes||'']);
    for (const x of data.obligations||[]) run('INSERT INTO obligations (id,client_id,name,period,due_date,status,owner,notes) VALUES (?,?,?,?,?,?,?,?)',[x.id,x.clientId,x.name,x.period,x.dueDate,x.status||'Pendiente',x.owner||'',x.notes||'']);
    for (const x of data.audit||[]) run('INSERT INTO audit (id,at,action,user) VALUES (?,?,?,?)',[x.id,x.at,x.action,x.user]);
    db.run('COMMIT');persist();
  } catch (error) { try{db.run('ROLLBACK');}catch{} throw error; }
}
function persist() {
  const tmp=DB_FILE+'.tmp';fs.writeFileSync(tmp,Buffer.from(db.export()),{mode:0o600});fs.renameSync(tmp,DB_FILE);fs.chmodSync(DB_FILE,0o600);
}
async function initialize(seedFactory) {
  fs.mkdirSync(DATA_DIR,{recursive:true});
  const SQL=await initSqlJs({locateFile:file=>require.resolve(`sql.js/dist/${file}`)});
  if(fs.existsSync(DB_FILE)) db=new SQL.Database(new Uint8Array(fs.readFileSync(DB_FILE)));
  else db=new SQL.Database();
  db.run(fs.readFileSync(path.join(__dirname,'schema.sqlite.sql'),'utf8'));
  db.run('PRAGMA foreign_keys = ON');
  const userCount=all('SELECT COUNT(*) AS n FROM users')[0].n;
  if(!userCount){
    let data;
    if(fs.existsSync(LEGACY_FILE))data=migrateLegacy(JSON.parse(fs.readFileSync(LEGACY_FILE,'utf8')));
    else data=seedFactory();
    replaceAll(data);
  }else persist();
}
function readStore() {
  if(!db)throw new Error('La base de datos no está inicializada.');
  return {
    clients:all('SELECT id,name,type,rfc,email,phone,status,notes FROM clients ORDER BY rowid ASC'),
    invoices:all('SELECT id,folio,client_id AS clientId,date,due_date AS dueDate,concept,amount,status,notes FROM invoices ORDER BY rowid ASC'),
    transactions:all('SELECT id,type,date,category,concept,COALESCE(client_id,\'\') AS clientId,amount,method,notes FROM transactions ORDER BY rowid ASC'),
    obligations:all('SELECT id,client_id AS clientId,name,period,due_date AS dueDate,status,owner,notes FROM obligations ORDER BY rowid ASC'),
    users:all('SELECT id,username,name,role,salt,password_hash AS passwordHash,must_change_password AS mustChangePassword,active FROM users').map(u=>({...u,mustChangePassword:Boolean(u.mustChangePassword),active:Boolean(u.active)})),
    audit:all('SELECT id,at,action,user FROM audit ORDER BY rowid ASC')
  };
}
function saveStore(data) { replaceAll(migrateLegacy(data)); }
module.exports={initialize,readStore,saveStore,DB_FILE};
