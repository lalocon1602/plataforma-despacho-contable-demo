-- Esquema propuesto para integrar la interfaz con MySQL.
-- No lo ejecuta el prototipo local, que persiste en data/store.json.
CREATE DATABASE IF NOT EXISTS despacho_contable
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE despacho_contable;

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(40) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','accountant','viewer') NOT NULL DEFAULT 'viewer',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE clients (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  person_type ENUM('Persona física','Persona moral') NOT NULL,
  rfc VARCHAR(13) NOT NULL UNIQUE,
  email VARCHAR(254),
  phone VARCHAR(40),
  status ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_clients_name (name),
  INDEX idx_clients_status (status)
) ENGINE=InnoDB;

CREATE TABLE invoices (
  id CHAR(36) PRIMARY KEY,
  folio VARCHAR(40) NOT NULL UNIQUE,
  client_id CHAR(36) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  concept VARCHAR(240) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  status ENUM('Pendiente','Pagada','Vencida','Cancelada') NOT NULL DEFAULT 'Pendiente',
  notes TEXT,
  created_by CHAR(36),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_invoice_client_date (client_id, issue_date),
  INDEX idx_invoice_due_status (due_date, status),
  CONSTRAINT fk_invoice_client FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_invoice_user FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_invoice_amount CHECK (amount > 0),
  CONSTRAINT chk_invoice_dates CHECK (due_date >= issue_date)
) ENGINE=InnoDB;

CREATE TABLE transactions (
  id CHAR(36) PRIMARY KEY,
  client_id CHAR(36),
  movement_type ENUM('Ingreso','Egreso') NOT NULL,
  movement_date DATE NOT NULL,
  category VARCHAR(100) NOT NULL,
  concept VARCHAR(240) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  payment_method VARCHAR(60),
  notes TEXT,
  created_by CHAR(36),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_transaction_date_type (movement_date, movement_type),
  INDEX idx_transaction_category_date (category, movement_date),
  CONSTRAINT fk_transaction_client FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_transaction_user FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_transaction_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE obligations (
  id CHAR(36) PRIMARY KEY,
  client_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL,
  period VARCHAR(40) NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('Pendiente','En proceso','Presentada') NOT NULL DEFAULT 'Pendiente',
  owner VARCHAR(100),
  notes TEXT,
  created_by CHAR(36),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_obligation_due_status (due_date, status),
  INDEX idx_obligation_client_period (client_id, period),
  CONSTRAINT fk_obligation_client FOREIGN KEY (client_id) REFERENCES clients(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_obligation_user FOREIGN KEY (created_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE audit_log (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36),
  action VARCHAR(240) NOT NULL,
  entity_type VARCHAR(40),
  entity_id CHAR(36),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- La consulta por vencimiento se recomienda controlar en la aplicación:
-- due_date < CURRENT_DATE() AND status <> 'Presentada'.
-- La integración debe ser solo administrativa; no se contempla timbrado CFDI ni conexión automática al SAT.
