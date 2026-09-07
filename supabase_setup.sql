-- Portal de Distribución de Auditoría - esquema web para Supabase/PostgreSQL
-- Ejecutar una sola vez en Supabase > SQL Editor.

CREATE TABLE IF NOT EXISTS users(
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'coordinador',
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS web_sessions(
  token TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_web_sessions_user ON web_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_web_sessions_exp ON web_sessions(expires_at);

CREATE TABLE IF NOT EXISTS schedules(
  id BIGSERIAL PRIMARY KEY,
  month TEXT,
  year INTEGER,
  sheet_name TEXT,
  file_name TEXT,
  team_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  demand_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  beds_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS runs(
  id BIGSERIAL PRIMARY KEY,
  schedule_id BIGINT REFERENCES schedules(id),
  month TEXT,
  year INTEGER,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  medical_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  nursing_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  alerts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS assignments(
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  stream TEXT NOT NULL,
  person_name TEXT NOT NULL,
  task_label TEXT NOT NULL,
  task_kind TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL DEFAULT 0,
  hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  meta TEXT
);
CREATE TABLE IF NOT EXISTS app_settings(
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by BIGINT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_log(
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS person_profiles(
  id BIGSERIAL PRIMARY KEY,
  normalized_name TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'Revisar',
  mode TEXT NOT NULL DEFAULT 'Presencial',
  strength TEXT NOT NULL DEFAULT '',
  fact BOOLEAN NOT NULL DEFAULT FALSE,
  concurrence BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by BIGINT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tracking_entries(
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  person_name TEXT NOT NULL,
  stream TEXT NOT NULL,
  metric_type TEXT NOT NULL,
  qty DOUBLE PRECISION NOT NULL DEFAULT 0,
  hours DOUBLE PRECISION NOT NULL DEFAULT 0,
  notes TEXT,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La función de Netlify usa una conexión privada a PostgreSQL.
-- No se habilita acceso directo anónimo a estas tablas.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE web_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_entries ENABLE ROW LEVEL SECURITY;

INSERT INTO users(id,username,display_name,role,password_hash,salt,active,created_at) VALUES(1,'dcolan','Darwen Colán','administrador','da986b71c29bdfceed824afe7be1e3698d959cfbea2237f3e7d5c22d6842f9ce','c18a02e5efa4a46695f7affc47ecc153',TRUE,'2026-09-03T20:41:01'::timestamptz) ON CONFLICT (username) DO UPDATE SET display_name=EXCLUDED.display_name,role=EXCLUDED.role,password_hash=EXCLUDED.password_hash,salt=EXCLUDED.salt,active=EXCLUDED.active;
INSERT INTO users(id,username,display_name,role,password_hash,salt,active,created_at) VALUES(2,'ctejada','Cindy Tejada','gerente','44477708f5f1bdff571455034f2d1e91c104dcb77f7011757a1c6e9c6007a505','ae556e7f7710ff4c2e9b940dbc9d2115',TRUE,'2026-09-07T14:06:19'::timestamptz) ON CONFLICT (username) DO UPDATE SET display_name=EXCLUDED.display_name,role=EXCLUDED.role,password_hash=EXCLUDED.password_hash,salt=EXCLUDED.salt,active=EXCLUDED.active;
INSERT INTO users(id,username,display_name,role,password_hash,salt,active,created_at) VALUES(3,'avillanueva','Aryana Villanueva','coordinador','2ea36d313144a5f959e9b27d2b80695d28e81bbc2c5a3293a89fd14d8dd90750','3aba4bd630a5d0d47badbe760ed2d9b4',TRUE,'2026-09-07T14:06:19'::timestamptz) ON CONFLICT (username) DO UPDATE SET display_name=EXCLUDED.display_name,role=EXCLUDED.role,password_hash=EXCLUDED.password_hash,salt=EXCLUDED.salt,active=EXCLUDED.active;
SELECT setval(pg_get_serial_sequence('users','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM users),1), true);
INSERT INTO person_profiles(id,normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(1,'RICARDO CONTRERAS','Ricardo Contreras','Médico','Virtual','Concurrencia virtual',FALSE,TRUE,TRUE,NULL,'2026-09-07T04:51:02'::timestamptz) ON CONFLICT (normalized_name) DO UPDATE SET display_name=EXCLUDED.display_name,kind=EXCLUDED.kind,mode=EXCLUDED.mode,strength=EXCLUDED.strength,fact=EXCLUDED.fact,concurrence=EXCLUDED.concurrence,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at;
INSERT INTO person_profiles(id,normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(2,'LIZ CORONEL','Liz Coronel','Médico','Presencial','Paquetes Pacífico · Pediatría',TRUE,TRUE,TRUE,NULL,'2026-09-07T04:51:02'::timestamptz) ON CONFLICT (normalized_name) DO UPDATE SET display_name=EXCLUDED.display_name,kind=EXCLUDED.kind,mode=EXCLUDED.mode,strength=EXCLUDED.strength,fact=EXCLUDED.fact,concurrence=EXCLUDED.concurrence,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at;
INSERT INTO person_profiles(id,normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(3,'KARLA HUAMANI','Karla Huamani','Médico','Mixto','Positiva · Mapfre · paquetes',TRUE,TRUE,TRUE,NULL,'2026-09-07T04:51:02'::timestamptz) ON CONFLICT (normalized_name) DO UPDATE SET display_name=EXCLUDED.display_name,kind=EXCLUDED.kind,mode=EXCLUDED.mode,strength=EXCLUDED.strength,fact=EXCLUDED.fact,concurrence=EXCLUDED.concurrence,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at;
INSERT INTO person_profiles(id,normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(4,'KARLA LOLI','Karla Loli','Médico','Presencial','Medicina interna · entrenamiento paquetes',TRUE,TRUE,TRUE,NULL,'2026-09-07T04:51:02'::timestamptz) ON CONFLICT (normalized_name) DO UPDATE SET display_name=EXCLUDED.display_name,kind=EXCLUDED.kind,mode=EXCLUDED.mode,strength=EXCLUDED.strength,fact=EXCLUDED.fact,concurrence=EXCLUDED.concurrence,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at;
INSERT INTO person_profiles(id,normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(5,'FRANCISCO MORALES','Francisco Morales','Médico','Presencial','General · entrenamiento paquetes',TRUE,TRUE,TRUE,NULL,'2026-09-07T04:51:02'::timestamptz) ON CONFLICT (normalized_name) DO UPDATE SET display_name=EXCLUDED.display_name,kind=EXCLUDED.kind,mode=EXCLUDED.mode,strength=EXCLUDED.strength,fact=EXCLUDED.fact,concurrence=EXCLUDED.concurrence,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at;
INSERT INTO person_profiles(id,normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(6,'JHONATAN VARGAS','Jhonatan Vargas','Médico','Presencial','Facturación · conciliación',TRUE,FALSE,TRUE,NULL,'2026-09-07T04:51:02'::timestamptz) ON CONFLICT (normalized_name) DO UPDATE SET display_name=EXCLUDED.display_name,kind=EXCLUDED.kind,mode=EXCLUDED.mode,strength=EXCLUDED.strength,fact=EXCLUDED.fact,concurrence=EXCLUDED.concurrence,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at;
INSERT INTO person_profiles(id,normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(7,'DR. SEGUNDO','Dr. Segundo','Médico','Virtual','Medicina interna · concurrencia virtual',FALSE,TRUE,TRUE,NULL,'2026-09-07T04:51:02'::timestamptz) ON CONFLICT (normalized_name) DO UPDATE SET display_name=EXCLUDED.display_name,kind=EXCLUDED.kind,mode=EXCLUDED.mode,strength=EXCLUDED.strength,fact=EXCLUDED.fact,concurrence=EXCLUDED.concurrence,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at;
INSERT INTO person_profiles(id,normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(8,'DIANA SERVELEON','Diana Serveleon','Enfermería','Presencial','Auditoría de enfermería',FALSE,TRUE,TRUE,NULL,'2026-09-07T04:51:02'::timestamptz) ON CONFLICT (normalized_name) DO UPDATE SET display_name=EXCLUDED.display_name,kind=EXCLUDED.kind,mode=EXCLUDED.mode,strength=EXCLUDED.strength,fact=EXCLUDED.fact,concurrence=EXCLUDED.concurrence,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at;
INSERT INTO person_profiles(id,normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(9,'EVELYM NUNEZ','Evelym Nuñez','Enfermería','Presencial','Auditoría de enfermería',FALSE,TRUE,TRUE,NULL,'2026-09-07T04:51:02'::timestamptz) ON CONFLICT (normalized_name) DO UPDATE SET display_name=EXCLUDED.display_name,kind=EXCLUDED.kind,mode=EXCLUDED.mode,strength=EXCLUDED.strength,fact=EXCLUDED.fact,concurrence=EXCLUDED.concurrence,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at;
INSERT INTO person_profiles(id,normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(10,'MARGOTH MORAN','Margoth Moran','Enfermería','Presencial','Auditoría de enfermería',FALSE,TRUE,TRUE,NULL,'2026-09-07T04:51:02'::timestamptz) ON CONFLICT (normalized_name) DO UPDATE SET display_name=EXCLUDED.display_name,kind=EXCLUDED.kind,mode=EXCLUDED.mode,strength=EXCLUDED.strength,fact=EXCLUDED.fact,concurrence=EXCLUDED.concurrence,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at;
SELECT setval(pg_get_serial_sequence('person_profiles','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM person_profiles),1), true);
INSERT INTO app_settings(key,value_json,updated_by,updated_at) VALUES('distribution','{"workDays": 20, "dailyHours": 7.5, "freeMin": 1, "freeMax": 2, "hosp": 60, "daycare": 15, "package": 30, "ambul": 20, "bedMin": 15, "trainingPct": 20, "equityTolerance": 3}'::jsonb,NULL,'2026-09-07T04:53:44'::timestamptz) ON CONFLICT (key) DO UPDATE SET value_json=EXCLUDED.value_json,updated_at=EXCLUDED.updated_at;

-- IMPORTANTE: después del primer ingreso, cambia las contraseñas desde Usuarios.
