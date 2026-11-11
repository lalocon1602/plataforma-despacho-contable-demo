PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','accountant','viewer')),
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('Persona física','Persona moral')),
  rfc TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo','Inactivo')),
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  folio TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  concept TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente','Pagada','Vencida','Cancelada')),
  notes TEXT NOT NULL DEFAULT '',
  CHECK (due_date >= date)
);
CREATE INDEX IF NOT EXISTS idx_invoices_client_date ON invoices(client_id, date);
CREATE INDEX IF NOT EXISTS idx_invoices_due_status ON invoices(due_date, status);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('Ingreso','Egreso')),
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  concept TEXT NOT NULL,
  client_id TEXT REFERENCES clients(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_transactions_date_type ON transactions(date, type);
CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions(category, date);

CREATE TABLE IF NOT EXISTS obligations (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  name TEXT NOT NULL,
  period TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente','En proceso','Presentada')),
  owner TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_obligations_due_status ON obligations(due_date, status);
CREATE INDEX IF NOT EXISTS idx_obligations_client_period ON obligations(client_id, period);

CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  user TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at);
