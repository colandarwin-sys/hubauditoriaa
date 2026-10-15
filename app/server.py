import os, sys, json, sqlite3, hashlib, secrets, mimetypes, urllib.parse, threading, webbrowser, time, zipfile, io, html, unicodedata, shutil, re
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / 'static'
DB_PATH = ROOT / 'data' / 'auditoria.db'
HOST = '127.0.0.1'
PORT = 8765
SESSIONS = {}
SESSION_LOCK = threading.Lock()

ACCESS_TEMPLATE = {
    'home': True,
    'users': False,
    'modules': {
        'expedientes': {'enabled': True, 'views': {'resumen': True, 'evolucion': True, 'antiguedad': True, 'auditor': True, 'expedientes': True, 'historico': True}},
        'tarifarios': {'enabled': True, 'views': {'Directorio': True, 'Comparador cruzado': True, 'Matriz catálogo': True, 'Tarifas': True, 'Histórico': True, 'Actualizar tarifario': True}},
        'distribucion': {'enabled': True, 'views': {'Operación mensual': True, 'Resultados': True, 'Seguimiento operativo': True, 'Dashboard': True, 'Históricos': True, 'Perfiles del equipo': True, 'Configuración': True}}
    }
}

def clone_access_template():
    return json.loads(json.dumps(ACCESS_TEMPLATE))

def normalize_access_json(raw, role='coordinador'):
    base = clone_access_template()
    if role == 'administrador':
        base['users'] = True
    if raw:
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = {}
        if isinstance(raw, dict):
            base['home'] = bool(raw.get('home', base['home']))
            base['users'] = bool(raw.get('users', base['users'])) or role == 'administrador'
            mods = raw.get('modules') or {}
            for mk, mv in base['modules'].items():
                src = mods.get(mk) or {}
                mv['enabled'] = bool(src.get('enabled', mv['enabled']))
                srcv = src.get('views') or {}
                for vk in list(mv['views'].keys()):
                    if vk in srcv: mv['views'][vk] = bool(srcv.get(vk))
    if role == 'administrador':
        base['home'] = True
        base['users'] = True
        for mk, mv in base['modules'].items():
            mv['enabled'] = True
            for vk in list(mv['views'].keys()):
                mv['views'][vk] = True
    return base

def get_user_access(conn, user_row):
    if not user_row: return clone_access_template()
    return normalize_access_json(user_row['access_json'] if 'access_json' in user_row.keys() else None, user_row['role'])

def get_full_user(user_id):
    conn = db()
    row = conn.execute('SELECT id,username,display_name,role,active,access_json FROM users WHERE id=?', (user_id,)).fetchone()
    if not row:
        conn.close()
        return None
    data = dict(row)
    data['access'] = get_user_access(conn, row)
    data.pop('access_json', None)
    conn.close()
    return data

def parse_access_payload(body, role='coordinador'):
    return normalize_access_json(body.get('access') or body.get('access_json') or {}, role)


def now_iso():
    return datetime.now().isoformat(timespec='seconds')


def normalize_name(value):
    value = unicodedata.normalize('NFD', str(value or ''))
    value = ''.join(ch for ch in value if unicodedata.category(ch) != 'Mn')
    return ' '.join(value.upper().split())


def hash_password(password: str, salt: bytes) -> str:
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 150_000).hex()


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    return conn


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = db()
    conn.executescript('''
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'usuario',
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schedules(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      month TEXT,
      year INTEGER,
      sheet_name TEXT,
      file_name TEXT,
      team_json TEXT NOT NULL,
      demand_json TEXT NOT NULL,
      beds_json TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS runs(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER,
      month TEXT,
      year INTEGER,
      summary_json TEXT NOT NULL,
      medical_json TEXT NOT NULL,
      nursing_json TEXT NOT NULL,
      alerts_json TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(schedule_id) REFERENCES schedules(id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS assignments(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      stream TEXT NOT NULL,
      person_name TEXT NOT NULL,
      task_label TEXT NOT NULL,
      task_kind TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 0,
      hours REAL NOT NULL DEFAULT 0,
      meta TEXT,
      FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS app_settings(
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_by INTEGER,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(updated_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS audit_log(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS person_profiles(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'Revisar',
      mode TEXT NOT NULL DEFAULT 'Presencial',
      strength TEXT NOT NULL DEFAULT '',
      fact INTEGER NOT NULL DEFAULT 0,
      concurrence INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      updated_by INTEGER,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(updated_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS tracking_entries(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      entry_date TEXT NOT NULL,
      person_name TEXT NOT NULL,
      stream TEXT NOT NULL,
      metric_type TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 0,
      hours REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
    ''')
    cols = {r['name'] for r in conn.execute("PRAGMA table_info(users)").fetchall()}
    if 'access_json' not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN access_json TEXT")
    # Seguridad: la publicación no incluye contraseñas predeterminadas.
    # En una nueva instalación local, se crea un administrador únicamente si
    # ADMIN_USERNAME y ADMIN_PASSWORD se definen explícitamente en el entorno.
    admin_username = os.environ.get('ADMIN_USERNAME', '').strip().lower()
    admin_password = os.environ.get('ADMIN_PASSWORD', '')
    existing_count = conn.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    if existing_count == 0 and admin_username and admin_password:
        salt = secrets.token_bytes(16)
        conn.execute('INSERT INTO users(username,display_name,role,password_hash,salt,active,created_at,access_json) VALUES(?,?,?,?,?,?,?,?)',
                     (admin_username, os.environ.get('ADMIN_DISPLAY_NAME', 'Administrador'), 'administrador', hash_password(admin_password, salt), salt.hex(), 1, now_iso(), json.dumps(normalize_access_json({}, 'administrador'), ensure_ascii=False)))
    for row in conn.execute('SELECT id, role, access_json FROM users').fetchall():
        if not row['access_json']:
            conn.execute('UPDATE users SET access_json=? WHERE id=?', (json.dumps(normalize_access_json({}, row['role']), ensure_ascii=False), row['id']))
    default_settings = {
        'workDays':20,'dailyHours':7.5,'freeMin':1,'freeMax':2,
        'hosp':60,'daycare':15,'package':30,'ambul':20,'bedMin':15,'trainingPct':20,'equityTolerance':3
    }
    row_settings=conn.execute("SELECT value_json FROM app_settings WHERE key='distribution'").fetchone()
    if not row_settings:
        conn.execute('INSERT INTO app_settings(key,value_json,updated_at) VALUES(?,?,?)',('distribution',json.dumps(default_settings,ensure_ascii=False),now_iso()))
    else:
        try:
            current=json.loads(row_settings['value_json'] or '{}')
        except Exception:
            current={}
        merged={**default_settings,**current}
        if merged!=current:
            conn.execute("UPDATE app_settings SET value_json=?,updated_at=? WHERE key='distribution'",(json.dumps(merged,ensure_ascii=False),now_iso()))
    seed_profiles = [
      ('Ricardo Contreras','Médico','Virtual','Concurrencia virtual',0,1),
      ('Liz Coronel','Médico','Presencial','Paquetes Pacífico · Pediatría',1,1),
      ('Karla Huamani','Médico','Mixto','Positiva · Mapfre · paquetes',1,1),
      ('Karla Loli','Médico','Presencial','Medicina interna · entrenamiento paquetes',1,1),
      ('Francisco Morales','Médico','Presencial','General · entrenamiento paquetes',1,1),
      ('Jhonatan Vargas','Médico','Presencial','Facturación · conciliación',1,0),
      ('Dr. Segundo','Médico','Virtual','Medicina interna · concurrencia virtual',0,1),
      ('Diana Serveleon','Enfermería','Presencial','Auditoría de enfermería',0,1),
      ('Evelym Nuñez','Enfermería','Presencial','Auditoría de enfermería',0,1),
      ('Margoth Moran','Enfermería','Presencial','Auditoría de enfermería',0,1)
    ]
    for name,kind,mode,strength,fact,concurrence in seed_profiles:
        conn.execute('''INSERT INTO person_profiles(normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_at)
                        VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(normalized_name) DO NOTHING''',
                     (normalize_name(name),name,kind,mode,strength,fact,concurrence,1,now_iso()))
    conn.commit(); conn.close()


def log_action(user_id, action, details=''):
    conn = db(); conn.execute('INSERT INTO audit_log(user_id,action,details,created_at) VALUES(?,?,?,?)',(user_id,action,details,now_iso())); conn.commit(); conn.close()


def get_cookie(headers, name):
    raw = headers.get('Cookie','')
    for part in raw.split(';'):
        if '=' in part:
            k,v = part.strip().split('=',1)
            if k == name: return v
    return None


def current_user(handler):
    token = get_cookie(handler.headers,'audit_session')
    if not token: return None
    with SESSION_LOCK:
        sess = SESSIONS.get(token)
    return sess


def excel_col(n):
    s=''
    while n:
        n, r = divmod(n-1,26)
        s=chr(65+r)+s
    return s


def xlsx_bytes(sheet_name, headers, rows):
    def cell(ref, value):
        if isinstance(value,(int,float)) and not isinstance(value,bool):
            return f'<c r="{ref}"><v>{value}</v></c>'
        safe = html.escape('' if value is None else str(value))
        return f'<c r="{ref}" t="inlineStr"><is><t>{safe}</t></is></c>'
    sheet_rows=[]
    all_rows=[headers]+rows
    for r_idx,row in enumerate(all_rows,1):
        cells=''.join(cell(f'{excel_col(c_idx)}{r_idx}',v) for c_idx,v in enumerate(row,1))
        sheet_rows.append(f'<row r="{r_idx}">{cells}</row>')
    sheet_xml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+''.join(sheet_rows)+'</sheetData></worksheet>'
    workbook_xml=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="{html.escape(sheet_name[:31])}" sheetId="1" r:id="rId1"/></sheets></workbook>'''
    content_types='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'''
    rels='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'''
    wb_rels='''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'''
    bio=io.BytesIO()
    with zipfile.ZipFile(bio,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml',content_types)
        z.writestr('_rels/.rels',rels)
        z.writestr('xl/workbook.xml',workbook_xml)
        z.writestr('xl/_rels/workbook.xml.rels',wb_rels)
        z.writestr('xl/worksheets/sheet1.xml',sheet_xml)
    return bio.getvalue()

def xlsx_workbook(sheets):
    """Create a styled multi-sheet XLSX using only the Python standard library."""
    def xml_cell(ref, value, style=0):
        style_attr = f' s="{style}"' if style else ''
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return f'<c r="{ref}"{style_attr}><v>{value}</v></c>'
        safe = html.escape('' if value is None else str(value))
        return f'<c r="{ref}" t="inlineStr"{style_attr}><is><t xml:space="preserve">{safe}</t></is></c>'

    style_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <font><sz val="10"/><name val="Calibri"/><color rgb="FF1F2937"/></font>
    <font><b/><sz val="16"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FFCDFF00"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF17340C"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0A180B"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0A180B"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF0FFCE"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color rgb="FFD8E8B9"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0"><alignment vertical="top" wrapText="1"/></xf>
    <xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0"><alignment vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>'''

    sheet_xmls = []
    sheet_defs = []
    rel_defs = []
    content_overrides = []
    for idx, sh in enumerate(sheets, 1):
        headers = sh.get('headers', [])
        rows = sh.get('rows', [])
        widths = sh.get('widths') or [22] * max(1, len(headers))
        max_cols = max(1, len(headers), max([len(r) for r in rows], default=0))
        title = sh.get('title') or sh.get('name', 'Sheet')
        subtitle = sh.get('subtitle', '')
        xml_rows = []
        xml_rows.append(f'<row r="1" ht="26" customHeight="1">{xml_cell("A1", title, 1)}</row>')
        if subtitle:
            xml_rows.append(f'<row r="2" ht="20" customHeight="1">{xml_cell("A2", subtitle, 4)}</row>')
        header_row = 4 if subtitle else 3
        hdr = ''.join(xml_cell(f'{excel_col(ci)}{header_row}', v, 2) for ci, v in enumerate(headers, 1))
        xml_rows.append(f'<row r="{header_row}" ht="22" customHeight="1">{hdr}</row>')
        for ri, row in enumerate(rows, header_row + 1):
            cells = []
            for ci, v in enumerate(row, 1):
                style = 5 if isinstance(v, (int, float)) and not isinstance(v, bool) else 3
                cells.append(xml_cell(f'{excel_col(ci)}{ri}', v, style))
            xml_rows.append(f'<row r="{ri}">' + ''.join(cells) + '</row>')
        cols = ''.join(
            f'<col min="{i}" max="{i}" width="{float(widths[i-1] if i-1 < len(widths) else 18)}" customWidth="1"/>'
            for i in range(1, max_cols + 1)
        )
        merge_end = excel_col(max_cols)
        if subtitle:
            merges = f'<mergeCells count="2"><mergeCell ref="A1:{merge_end}1"/><mergeCell ref="A2:{merge_end}2"/></mergeCells>'
        else:
            merges = f'<mergeCells count="1"><mergeCell ref="A1:{merge_end}1"/></mergeCells>'
        auto_end = max(header_row, header_row + len(rows))
        auto = ''  # El autofiltro pertenece ahora a la Tabla de Excel.
        xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<sheetViews><sheetView workbookViewId="0"><pane ySplit="{header_row}" topLeftCell="A{header_row+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            f'<cols>{cols}</cols><sheetData>{"".join(xml_rows)}</sheetData>{merges}{auto}'
            '<tableParts count="1"><tablePart r:id="rIdTable1"/></tableParts></worksheet>'
        )
        sheet_xmls.append(xml)
        sheet_name = html.escape(sh.get('name', f'Hoja {idx}')[:31])
        sheet_defs.append(f'<sheet name="{sheet_name}" sheetId="{idx}" r:id="rId{idx}"/>')
        rel_defs.append(f'<Relationship Id="rId{idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{idx}.xml"/>')
        content_overrides.append(f'<Override PartName="/xl/worksheets/sheet{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')
        content_overrides.append(f'<Override PartName="/xl/tables/table{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>')

    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{"".join(sheet_defs)}</sheets></workbook>'
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        f'{"".join(content_overrides)}</Types>'
    )
    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''
    wb_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'{"".join(rel_defs)}'
        '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>'
    )
    bio = io.BytesIO()
    with zipfile.ZipFile(bio, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', content_types)
        z.writestr('_rels/.rels', root_rels)
        z.writestr('xl/workbook.xml', workbook_xml)
        z.writestr('xl/_rels/workbook.xml.rels', wb_rels)
        z.writestr('xl/styles.xml', style_xml)
        for idx, xml in enumerate(sheet_xmls, 1):
            z.writestr(f'xl/worksheets/sheet{idx}.xml', xml)
            sh=sheets[idx-1]; hdrs=sh.get('headers', [])
            head_row=4 if sh.get('subtitle') else 3
            last_row=head_row+len(sh.get('rows', []))
            if not hdrs or last_row<=head_row: continue
            ref=f'A{head_row}:{excel_col(len(hdrs))}{last_row}'
            cols=''.join(f'<tableColumn id="{ci}" name="{html.escape(str(h) or f"Columna {ci}", quote=True)}"/>' for ci,h in enumerate(hdrs,1))
            table=(f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="{idx}" name="TablaHub{idx}" displayName="TablaHub{idx}" ref="{ref}" totalsRowShown="0">'
                f'<autoFilter ref="{ref}"/><tableColumns count="{len(hdrs)}">{cols}</tableColumns>'
                '<tableStyleInfo name="TableStyleMedium4" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>')
            z.writestr(f'xl/tables/table{idx}.xml', table)
            rel=(f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
              f'<Relationship Id="rIdTable1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table{idx}.xml"/></Relationships>')
            z.writestr(f'xl/worksheets/_rels/sheet{idx}.xml.rels',rel)
    return bio.getvalue()



TARIFF_LOCK=threading.Lock()

def rebuild_tariff_summary(rows,previous):
    payers=list(dict.fromkeys(previous['payers']+[str(r.get('payer')) for r in rows if r.get('payer')]))
    by_payer={p:{} for p in payers}
    values={p:0 for p in payers}
    annual={p:{} for p in payers}
    for r in rows:
        payer=r.get('payer')
        if payer not in by_payer:continue
        code=str(r.get('profat','')).strip()
        if not code:continue
        by_payer[payer][code]=r
        amt=float(r.get('amount') or 0)
        values[payer]+=amt
        date=str(r.get('vigencia') or '')
        m=re.search(r'(19|20)\d{2}',date)
        if m:
            year=m.group(0)
            obj=annual[payer].setdefault(year,{'amount':0,'count':0,'groups':{}})
            obj['amount']+=amt;obj['count']+=1
            gr=str(r.get('group') or 'SIN GRUPO')
            obj['groups'][gr]=obj['groups'].get(gr,0)+amt
    def filtered(p):
        return {k for k,r in by_payer[p].items() if 'PAQUETE' not in str(r.get('group') or '').upper()}
    part=filtered('Particular')
    all_iafas=payers[1:]
    sets={p:filtered(p) for p in payers}
    universe=set().union(*(set(v) for v in by_payer.values()))
    penetration={str(i):0 for i in range(len(all_iafas)+1)}
    onlypart=0;universal=0
    for code in part:
        n=sum(code in sets[p] for p in all_iafas)
        penetration[str(n)]+=1
        if n==0: onlypart+=1
        if n==len(all_iafas):universal+=1
    comparisons={}
    for a in payers:
        for b in payers:
            if a==b:continue
            aa=sets[a] if 'Particular' in [a,b] else set(by_payer[a])
            bb=sets[b] if 'Particular' in [a,b] else set(by_payer[b])
            common=len(aa&bb)
            comparisons[a+'|'+b]={'a':len(aa),'b':len(bb),'common':common,'onlyA':len(aa-bb),'onlyB':len(bb-aa),'coverageAB':round(100*common/len(aa),3) if aa else 0,'coverageBA':round(100*common/len(bb),3) if bb else 0,'packagesExcluded':'Particular' in (a,b)}
    coverage=[]
    for payer in all_iafas:
        a=part;b=sets[payer];common=len(a&b)
        coverage.append({'payer':payer,'total':len(by_payer[payer]),'common':common,'missing':len(a-b),'coverage':round(common/len(a)*100,3) if a else 0})
    result=dict(previous)
    result.update({'payers':payers,'particularCount':len(by_payer['Particular']),'universeCount':len(universe),'universalCount':universal,'onlyParticularCount':onlypart,'coverage':coverage,'values':values,'annual':annual,'penetration':penetration,'comparisons':comparisons})
    return result

def save_tariff_import(body,user):
    payer=str(body.get('payer') or '').strip()
    incoming=body.get('rows')
    mode=str(body.get('mode') or 'update')
    if mode not in ('new','update'):return {'ok':False,'error':'Operación desconocida'},400
    data_folder=STATIC/'tarifarios'/'data'
    path=data_folder/'tariffs.json'
    sum_path=data_folder/'summary.json'
    backup_folder=ROOT/'data'/'tariff_backups'
    if not isinstance(incoming,list) or not 1<=len(incoming)<=120000:
        return {'ok':False,'error':'El archivo no contiene un número válido de registros'},400
    with TARIFF_LOCK:
        old=json.loads(path.read_text(encoding='utf-8'))
        summary=json.loads(sum_path.read_text(encoding='utf-8'))
        if mode=='new' and payer in summary['payers']:
            return {'ok':False,'error':'Este tarifario ya existe. Utiliza Actualizar tarifario.'},400
        if mode=='update' and payer not in summary['payers']:
            return {'ok':False,'error':'Este tarifario aún no existe. Utiliza Nuevo tarifario.'},400
        if not payer or len(payer)>100 or payer.lower()=='regla':
            return {'ok':False,'error':'Se requiere un nombre de IAFA válido.'},400
        clean=[];codes=set()
        for row in incoming:
            if not isinstance(row,dict):return {'ok':False,'error':'Fila inválida'},400
            code=str(row.get('profat') or '').strip();desc=str(row.get('description') or '').strip()
            try:amount=float(row.get('amount'))
            except (TypeError,ValueError):amount=-1
            if not code or not desc or not 0<=amount<1e9 or code in codes:
                return {'ok':False,'error':'PROFAT duplicado o fila inválida: '+code},400
            codes.add(code)
            clean.append({'payer':payer,'profat':code,'description':desc,'segus':str(row.get('segus') or ''),'vigencia':str(row.get('vigencia') or ''),'amount':amount,'group':str(row.get('group') or ''),'group_num':str(row.get('group_num') or '')})
        oldpayer=[r for r in old if r.get('payer')==payer]
        prior={str(r.get('profat')):r for r in oldpayer}
        for r in clean:
            existing=prior.get(r['profat'])
            if existing:
                for f in ['group','group_num','segus','vigencia']:
                    if not r[f]:r[f]=existing.get(f,'')
        combined=[r for r in old if r.get('payer')!=payer]+clean
        next_summary=rebuild_tariff_summary(combined,summary)
        backup_folder.mkdir(parents=True,exist_ok=True)
        stamp=datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        backup=f'tariffs_{stamp}.json'
        shutil.copy2(path,backup_folder/backup)
        shutil.copy2(sum_path,backup_folder/f'summary_{stamp}.json')
        temp=path.with_suffix('.json.tmp');temp_s=sum_path.with_suffix('.json.tmp')
        temp.write_text(json.dumps(combined,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        temp_s.write_text(json.dumps(next_summary,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        os.replace(temp,path);os.replace(temp_s,sum_path)
        with (backup_folder/'historial_importaciones.jsonl').open('a',encoding='utf-8') as fp:
            fp.write(json.dumps({'fecha':now_iso(),'usuario':user.get('username'),'iafa':payer,'modo':mode,'archivo':str(body.get('file') or ''),'registros':len(clean),'backup':backup},ensure_ascii=False)+'\n')
        log_action(user['id'],'importar_tarifario',f'{payer}: {len(clean)} registros')
        return {'ok':True,'count':len(clean),'payer':payer,'backup':backup},200

class Handler(BaseHTTPRequestHandler):
    server_version = 'AuditoriaLocal/1.0'
    def log_message(self, fmt, *args):
        return

    def json_body(self):
        try:
            n=int(self.headers.get('Content-Length','0') or 0)
            return json.loads(self.rfile.read(n).decode('utf-8')) if n else {}
        except Exception:
            return {}

    def send_json(self, obj, status=200, headers=None):
        raw=json.dumps(obj,ensure_ascii=False).encode('utf-8')
        self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Content-Length',str(len(raw)))
        if headers:
            for k,v in headers.items(): self.send_header(k,v)
        self.end_headers(); self.wfile.write(raw)

    def redirect(self, location):
        self.send_response(302); self.send_header('Location',location); self.end_headers()

    def require_user(self, api=False, admin=False):
        user=current_user(self)
        if not user:
            if api: self.send_json({'ok':False,'error':'No autenticado'},401)
            else: self.redirect('/login.html')
            return None
        if admin and user.get('role')!='administrador':
            if api:self.send_json({'ok':False,'error':'Permiso denegado'},403)
            else:self.redirect('/inicio.html')
            return None
        return user

    def do_GET(self):
        parsed=urllib.parse.urlparse(self.path); path=parsed.path; qs=urllib.parse.parse_qs(parsed.query)
        if path=='/':
            return self.redirect('/inicio.html' if current_user(self) else '/login.html')
        if path.startswith('/api/'):
            return self.api_get(path,qs)
        if path!='/login.html' and (path.endswith('.html') or path.startswith('/expedientes/') or path.startswith('/tarifarios/')) and not current_user(self):
            return self.redirect('/login.html')
        if path=='/usuarios.html' and (not current_user(self) or current_user(self).get('role')!='administrador'):
            return self.redirect('/inicio.html')
        rel='login.html' if path=='/login.html' else path.lstrip('/')
        file=(STATIC/rel).resolve()
        if not str(file).startswith(str(STATIC.resolve())) or not file.exists() or file.is_dir():
            self.send_error(404); return
        ctype=mimetypes.guess_type(file.name)[0] or 'application/octet-stream'
        data=file.read_bytes(); self.send_response(200); self.send_header('Content-Type',ctype + ('; charset=utf-8' if ctype.startswith('text/') or ctype in ('application/javascript','application/json') else '')); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)

    def do_POST(self):
        path=urllib.parse.urlparse(self.path).path
        if not path.startswith('/api/'):
            self.send_error(404); return
        self.api_post(path,self.json_body())

    def do_DELETE(self):
        path=urllib.parse.urlparse(self.path).path
        user=self.require_user(api=True)
        if not user:return
        if path.startswith('/api/users/'):
            if user.get('role')!='administrador': return self.send_json({'ok':False,'error':'Permiso denegado'},403)
            try: uid=int(path.rsplit('/',1)[-1])
            except:return self.send_json({'ok':False,'error':'ID inválido'},400)
            conn=db(); target=conn.execute('SELECT id,username,role,active FROM users WHERE id=?',(uid,)).fetchone()
            if not target:
                conn.close(); return self.send_json({'ok':False,'error':'Usuario no encontrado'},404)
            if target['role']=='administrador' and target['active']:
                admins=conn.execute("SELECT COUNT(*) n FROM users WHERE role='administrador' AND active=1").fetchone()['n']
                if admins<=1:
                    conn.close(); return self.send_json({'ok':False,'error':'Debe existir al menos un administrador activo'},400)
            conn.execute('UPDATE users SET active=0 WHERE id=?',(uid,)); conn.commit(); conn.close(); log_action(user['id'],'desactivar_usuario',str(uid)); return self.send_json({'ok':True})
        if path.startswith('/api/tracking/'):
            try: tid=int(path.rsplit('/',1)[-1])
            except:return self.send_json({'ok':False,'error':'ID inválido'},400)
            conn=db(); conn.execute('DELETE FROM tracking_entries WHERE id=?',(tid,)); conn.commit(); conn.close(); log_action(user['id'],'eliminar_seguimiento',str(tid)); return self.send_json({'ok':True})
        if path.startswith('/api/profiles/'):
            if user.get('role')!='administrador': return self.send_json({'ok':False,'error':'Permiso denegado'},403)
            try: pid=int(path.rsplit('/',1)[-1])
            except:return self.send_json({'ok':False,'error':'ID inválido'},400)
            conn=db(); conn.execute('UPDATE person_profiles SET active=0,updated_by=?,updated_at=? WHERE id=?',(user['id'],now_iso(),pid)); conn.commit(); conn.close(); log_action(user['id'],'desactivar_perfil',str(pid)); return self.send_json({'ok':True})
        self.send_json({'ok':False,'error':'No encontrado'},404)

    def api_get(self,path,qs):
        if path=='/api/session':
            user=current_user(self)
            if not user:
                return self.send_json({'ok':False,'user':None})
            full = get_full_user(user.get('id'))
            if not full or not full.get('active'):
                return self.send_json({'ok':False,'user':None})
            return self.send_json({'ok':True,'user':{'id':full['id'],'username':full['username'],'display_name':full['display_name'],'role':full['role'],'access':full['access']}})
        user=self.require_user(api=True)
        if not user:return
        if path=='/api/settings':
            conn=db(); row=conn.execute("SELECT value_json FROM app_settings WHERE key='distribution'").fetchone(); conn.close(); return self.send_json({'ok':True,'settings':json.loads(row['value_json']) if row else {}})
        if path=='/api/profiles':
            conn=db(); rows=[dict(r) for r in conn.execute('SELECT id,display_name,kind,mode,strength,fact,concurrence,active,updated_at FROM person_profiles ORDER BY active DESC,display_name').fetchall()]; conn.close(); return self.send_json({'ok':True,'profiles':rows})
        if path=='/api/tracking':
            rid=int((qs.get('run_id') or ['0'])[0] or 0)
            conn=db();
            if not rid:
                rr=conn.execute('SELECT MAX(id) id FROM runs').fetchone(); rid=rr['id'] or 0
            entries=[dict(r) for r in conn.execute('''SELECT t.id,t.run_id,t.entry_date,t.person_name,t.stream,t.metric_type,t.qty,t.hours,t.notes,t.created_at,u.display_name created_by_name FROM tracking_entries t LEFT JOIN users u ON u.id=t.created_by WHERE t.run_id=? ORDER BY t.entry_date DESC,t.id DESC''',(rid,)).fetchall()] if rid else []
            run=conn.execute('SELECT id,month,year,schedule_id FROM runs WHERE id=?',(rid,)).fetchone() if rid else None
            plan=[dict(r) for r in conn.execute('''SELECT stream,person_name,task_kind,SUM(qty) qty,SUM(hours) hours FROM assignments WHERE run_id=? GROUP BY stream,person_name,task_kind ORDER BY stream,person_name''',(rid,)).fetchall()] if rid else []
            conn.close(); return self.send_json({'ok':True,'run':dict(run) if run else None,'entries':entries,'plan':plan})
        if path=='/api/users':
            if user['role']!='administrador': return self.send_json({'ok':False,'error':'Permiso denegado'},403)
            conn=db(); rows=[]
            for r in conn.execute('SELECT id,username,display_name,role,active,created_at,access_json FROM users ORDER BY active DESC, display_name').fetchall():
                d=dict(r)
                d['access']=get_user_access(conn, r)
                d.pop('access_json', None)
                rows.append(d)
            conn.close(); return self.send_json({'ok':True,'users':rows})
        if path=='/api/schedules':
            conn=db(); rows=[dict(r) for r in conn.execute('''SELECT s.id,s.month,s.year,s.sheet_name,s.file_name,s.created_at,u.display_name created_by_name FROM schedules s LEFT JOIN users u ON u.id=s.created_by ORDER BY s.id DESC LIMIT 100''').fetchall()]; conn.close(); return self.send_json({'ok':True,'schedules':rows})
        if path.startswith('/api/schedules/'):
            try: sid=int(path.rsplit('/',1)[-1])
            except:return self.send_json({'ok':False,'error':'ID inválido'},400)
            conn=db(); r=conn.execute('SELECT * FROM schedules WHERE id=?',(sid,)).fetchone(); conn.close()
            if not r:return self.send_json({'ok':False,'error':'No encontrado'},404)
            d=dict(r); d['team']=json.loads(d.pop('team_json')); d['demand']=json.loads(d.pop('demand_json')); d['beds']=json.loads(d.pop('beds_json')); d['settings']=json.loads(d.pop('settings_json')); return self.send_json({'ok':True,'schedule':d})
        if path=='/api/runs':
            conn=db(); rows=[dict(r) for r in conn.execute('''SELECT r.id,r.schedule_id,r.month,r.year,r.created_at,u.display_name created_by_name FROM runs r LEFT JOIN users u ON u.id=r.created_by ORDER BY r.id DESC LIMIT 100''').fetchall()]; conn.close(); return self.send_json({'ok':True,'runs':rows})
        if path=='/api/runs/latest':
            conn=db(); r=conn.execute('SELECT * FROM runs ORDER BY id DESC LIMIT 1').fetchone(); conn.close(); return self.send_run(r)
        if path.startswith('/api/runs/'):
            try: rid=int(path.rsplit('/',1)[-1])
            except:return self.send_json({'ok':False,'error':'ID inválido'},400)
            conn=db(); r=conn.execute('SELECT * FROM runs WHERE id=?',(rid,)).fetchone(); conn.close(); return self.send_run(r)
        if path=='/api/dashboard':
            conn=db()
            counts=dict(conn.execute('''SELECT (SELECT COUNT(*) FROM schedules) schedules,(SELECT COUNT(*) FROM runs) runs,(SELECT COUNT(*) FROM users WHERE active=1) users''').fetchone())
            recent=[dict(r) for r in conn.execute('''SELECT id,month,year,created_at,summary_json FROM runs ORDER BY id DESC LIMIT 12''').fetchall()]
            assignments=[dict(r) for r in conn.execute('''SELECT stream,person_name,SUM(hours) hours,SUM(qty) qty FROM assignments WHERE run_id=(SELECT MAX(id) FROM runs) GROUP BY stream,person_name ORDER BY stream,hours DESC''').fetchall()]
            conn.close()
            for r in recent:
                try:r['summary']=json.loads(r.pop('summary_json'))
                except:r['summary']={}
            return self.send_json({'ok':True,'counts':counts,'recent':recent,'latest_assignments':assignments})
        if path=='/api/export/historicos.xlsx':
            conn=db(); rows=conn.execute('''SELECT r.id,r.month,r.year,r.created_at,u.display_name, (SELECT COUNT(*) FROM assignments a WHERE a.run_id=r.id) assignment_count FROM runs r LEFT JOIN users u ON u.id=r.created_by ORDER BY r.id DESC''').fetchall(); conn.close()
            data=xlsx_workbook([{'name':'Historicos','title':'HISTÓRICO DE AUDITORÍA','headers':['ID','Mes','Año','Fecha','Usuario','Asignaciones'],'rows':[[r['id'],r['month'],r['year'],r['created_at'],r['display_name'] or '',r['assignment_count']] for r in rows]}]); return self.send_file_bytes(data,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','historicos_auditoria.xlsx')
        if path=='/api/export/resultados.xlsx':
            rid=int((qs.get('run_id') or ['0'])[0] or 0)
            conn=db()
            if not rid:
                rr=conn.execute('SELECT MAX(id) id FROM runs').fetchone(); rid=rr['id'] or 0
            run=conn.execute('SELECT * FROM runs WHERE id=?',(rid,)).fetchone()
            if not run:
                conn.close(); return self.send_json({'ok':False,'error':'No hay distribución para exportar'},404)
            schedule=conn.execute('SELECT * FROM schedules WHERE id=?',(run['schedule_id'],)).fetchone() if run['schedule_id'] else None
            rows=[dict(r) for r in conn.execute('SELECT stream,person_name,task_label,task_kind,qty,hours,meta FROM assignments WHERE run_id=? ORDER BY stream,person_name,task_kind,task_label',(rid,)).fetchall()]
            conn.close()
            summary=json.loads(run['summary_json'] or '{}'); alerts=json.loads(run['alerts_json'] or '[]')
            team=json.loads(schedule['team_json']) if schedule else []
            team_map={normalize_name(p.get('name')):p for p in team}
            grouped={}
            for r in rows:
                key=(r['stream'],r['person_name']); grouped.setdefault(key,{'hours':0,'qty':0,'fact':0,'conc':0})
                grouped[key]['hours']+=float(r['hours'] or 0); grouped[key]['qty']+=float(r['qty'] or 0)
                if 'FACTUR' in normalize_name(r['task_kind']): grouped[key]['fact']+=float(r['qty'] or 0)
                if 'CONCURRENCIA' in normalize_name(r['task_kind']): grouped[key]['conc']+=float(r['qty'] or 0)
            summary_rows=[]
            for (stream,name),g in grouped.items():
                p=team_map.get(normalize_name(name),{})
                avail=float(p.get('hours') or 0) if p else 0
                load=(g['hours']/avail*100) if avail else ''
                free=((avail-g['hours'])/max(1,float((json.loads(schedule['settings_json']) if schedule else {}).get('workDays',20)))) if avail else ''
                summary_rows.append([stream,name,p.get('kind',''),p.get('mode',''),avail,round(g['hours'],2),round(load,1) if load!='' else '',round(free,2) if free!='' else '',round(g['fact'],0),round(g['conc'],0)])
            period=f"{run['month'] or ''} {run['year'] or ''}".strip()
            sheets=[
              {'name':'Resumen','title':'Distribución mensual de Auditoría','subtitle':f'Periodo: {period} · Run #{rid}','headers':['Flujo','Colaborador','Perfil','Modalidad','Horas disponibles','Horas asignadas','Carga %','Libre/día h','Expedientes','Concurrencia'],'rows':summary_rows,'widths':[16,24,18,14,16,16,12,14,14,14]},
              {'name':'Auditoría Médica','title':'Detalle de Auditoría Médica','subtitle':f'Periodo: {period}','headers':['Colaborador','Concepto','Tipo','Cantidad','Horas','Detalle'],'rows':[[r['person_name'],r['task_label'],r['task_kind'],r['qty'],r['hours'],r['meta'] or ''] for r in rows if r['stream']=='Médica'],'widths':[24,30,22,12,12,34]},
              {'name':'Enfermería','title':'Detalle de Auditoría de Enfermería','subtitle':f'Periodo: {period}','headers':['Colaborador','Unidad / Concepto','Tipo','Cantidad','Horas','Detalle'],'rows':[[r['person_name'],r['task_label'],r['task_kind'],r['qty'],r['hours'],r['meta'] or ''] for r in rows if r['stream']=='Enfermería'],'widths':[24,30,24,12,12,34]},
              {'name':'Alertas','title':'Alertas y observaciones','subtitle':f'Periodo: {period}','headers':['N°','Alerta / observación'],'rows':[[i+1,a] for i,a in enumerate(alerts)] or [[1,'Sin alertas registradas']],'widths':[8,80]}
            ]
            data=xlsx_workbook(sheets); return self.send_file_bytes(data,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',f'distribucion_auditoria_{rid}.xlsx')
        if path=='/api/export/seguimiento.xlsx':
            rid=int((qs.get('run_id') or ['0'])[0] or 0)
            conn=db()
            if not rid:
                rr=conn.execute('SELECT MAX(id) id FROM runs').fetchone(); rid=rr['id'] or 0
            run=conn.execute('SELECT month,year FROM runs WHERE id=?',(rid,)).fetchone() if rid else None
            entries=[dict(r) for r in conn.execute('SELECT entry_date,person_name,stream,metric_type,qty,hours,notes,created_at FROM tracking_entries WHERE run_id=? ORDER BY entry_date,person_name',(rid,)).fetchall()] if rid else []
            plan=[dict(r) for r in conn.execute('SELECT stream,person_name,task_kind,SUM(qty) qty,SUM(hours) hours FROM assignments WHERE run_id=? GROUP BY stream,person_name,task_kind',(rid,)).fetchall()] if rid else []
            conn.close()
            period=f"{run['month'] if run else ''} {run['year'] if run else ''}".strip()
            data=xlsx_workbook([
              {'name':'Seguimiento','title':'Seguimiento operativo','subtitle':f'Periodo: {period}','headers':['Fecha','Colaborador','Flujo','Tipo','Cantidad real','Horas reales','Notas','Registrado'],'rows':[[e['entry_date'],e['person_name'],e['stream'],e['metric_type'],e['qty'],e['hours'],e['notes'] or '',e['created_at']] for e in entries],'widths':[14,24,16,20,14,14,36,20]},
              {'name':'Plan','title':'Carga planificada','subtitle':f'Periodo: {period}','headers':['Flujo','Colaborador','Tipo planificado','Cantidad planificada','Horas planificadas'],'rows':[[e['stream'],e['person_name'],e['task_kind'],e['qty'],e['hours']] for e in plan],'widths':[16,24,24,18,18]}
            ]); return self.send_file_bytes(data,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',f'seguimiento_auditoria_{rid}.xlsx')
        if path=='/api/audit':
            if user['role']!='administrador':return self.send_json({'ok':False,'error':'Permiso denegado'},403)
            conn=db(); rows=[dict(r) for r in conn.execute('''SELECT l.id,l.action,l.details,l.created_at,u.display_name FROM audit_log l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 100''').fetchall()]; conn.close(); return self.send_json({'ok':True,'log':rows})
        self.send_json({'ok':False,'error':'No encontrado'},404)

    def send_run(self,r):
        if not r:return self.send_json({'ok':True,'run':None})
        d=dict(r)
        for k in ['summary_json','medical_json','nursing_json','alerts_json']:
            d[k[:-5]]=json.loads(d.pop(k) or ('[]' if k=='alerts_json' else '{}'))
        conn=db(); d['assignments']=[dict(x) for x in conn.execute('SELECT stream,person_name,task_label,task_kind,qty,hours,meta FROM assignments WHERE run_id=? ORDER BY stream,person_name,task_kind,task_label',(d['id'],)).fetchall()]; conn.close(); return self.send_json({'ok':True,'run':d})

    def send_file_bytes(self,data,ctype,filename):
        self.send_response(200); self.send_header('Content-Type',ctype); self.send_header('Content-Disposition',f'attachment; filename="{filename}"'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)

    def api_post(self,path,body):
        if path=='/api/login':
            username=str(body.get('username','')).strip().lower(); password=str(body.get('password',''))
            conn=db(); row=conn.execute('SELECT * FROM users WHERE lower(username)=? AND active=1',(username,)).fetchone(); conn.close()
            if not row:return self.send_json({'ok':False,'error':'Usuario o contraseña incorrectos'},401)
            salt=bytes.fromhex(row['salt'])
            if not secrets.compare_digest(hash_password(password,salt),row['password_hash']):return self.send_json({'ok':False,'error':'Usuario o contraseña incorrectos'},401)
            token=secrets.token_urlsafe(32); user={'id':row['id'],'username':row['username'],'display_name':row['display_name'],'role':row['role'],'access':normalize_access_json(row['access_json'] if 'access_json' in row.keys() else None, row['role'])}
            with SESSION_LOCK:SESSIONS[token]=user
            log_action(user['id'],'login','Inicio de sesión')
            return self.send_json({'ok':True,'user':user},headers={'Set-Cookie':f'audit_session={token}; Path=/; HttpOnly; SameSite=Lax'})
        if path=='/api/logout':
            user=current_user(self); token=get_cookie(self.headers,'audit_session')
            if token:
                with SESSION_LOCK:SESSIONS.pop(token,None)
            if user:log_action(user['id'],'logout','Cierre de sesión')
            return self.send_json({'ok':True},headers={'Set-Cookie':'audit_session=; Path=/; Max-Age=0'})
        user=self.require_user(api=True)
        if not user:return
        if path=='/api/tarifarios/import':
            if not user.get('access',{}).get('modules',{}).get('tarifarios',{}).get('views',{}).get('Actualizar tarifario',False):return self.send_json({'ok':False,'error':'Sin permiso de actualización'},403)
            result,status=save_tariff_import(body,user)
            return self.send_json(result,status)
        if path=='/api/users':
            if user['role']!='administrador':return self.send_json({'ok':False,'error':'Permiso denegado'},403)
            username=str(body.get('username','')).strip().lower(); display=str(body.get('display_name','')).strip() or username; role=str(body.get('role','coordinador')); password=str(body.get('password',''))
            if role not in ('administrador','gerente','coordinador'): return self.send_json({'ok':False,'error':'Rol inválido'},400)
            if not username or not password:return self.send_json({'ok':False,'error':'Usuario y contraseña son obligatorios'},400)
            access=parse_access_payload(body, role)
            salt=secrets.token_bytes(16)
            try:
                conn=db(); cur=conn.execute('INSERT INTO users(username,display_name,role,password_hash,salt,active,created_at,access_json) VALUES(?,?,?,?,?,?,?,?)',(username,display,role,hash_password(password,salt),salt.hex(),1,now_iso(),json.dumps(access,ensure_ascii=False))); conn.commit(); uid=cur.lastrowid; conn.close()
            except sqlite3.IntegrityError:return self.send_json({'ok':False,'error':'El usuario ya existe'},409)
            log_action(user['id'],'crear_usuario',username); return self.send_json({'ok':True,'id':uid})
        if path.startswith('/api/users/'):
            if user['role']!='administrador':return self.send_json({'ok':False,'error':'Permiso denegado'},403)
            try: uid=int(path.rsplit('/',1)[-1])
            except:return self.send_json({'ok':False,'error':'ID inválido'},400)
            username=str(body.get('username','')).strip().lower(); display=str(body.get('display_name','')).strip() or username; role=str(body.get('role','coordinador')); password=str(body.get('password','')); active=1 if body.get('active',True) else 0
            access=parse_access_payload(body, role)
            if not username or not display:return self.send_json({'ok':False,'error':'Usuario y nombre son obligatorios'},400)
            if role not in ('administrador','gerente','coordinador'): return self.send_json({'ok':False,'error':'Rol inválido'},400)
            conn=db(); current=conn.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
            if not current:
                conn.close(); return self.send_json({'ok':False,'error':'Usuario no encontrado'},404)
            duplicate=conn.execute('SELECT id FROM users WHERE lower(username)=? AND id<>?',(username,uid)).fetchone()
            if duplicate:
                conn.close(); return self.send_json({'ok':False,'error':'Ese nombre de usuario ya está en uso'},409)
            if current['role']=='administrador' and current['active'] and (role!='administrador' or not active):
                admins=conn.execute("SELECT COUNT(*) n FROM users WHERE role='administrador' AND active=1").fetchone()['n']
                if admins<=1:
                    conn.close(); return self.send_json({'ok':False,'error':'Debe existir al menos un administrador activo'},400)
            if password:
                salt=secrets.token_bytes(16)
                conn.execute('''UPDATE users SET username=?,display_name=?,role=?,password_hash=?,salt=?,active=?,access_json=? WHERE id=?''',(username,display,role,hash_password(password,salt),salt.hex(),active,json.dumps(access,ensure_ascii=False),uid))
            else:
                conn.execute('''UPDATE users SET username=?,display_name=?,role=?,active=?,access_json=? WHERE id=?''',(username,display,role,active,json.dumps(access,ensure_ascii=False),uid))
            conn.commit(); conn.close()
            with SESSION_LOCK:
                for token,sess in list(SESSIONS.items()):
                    if sess.get('id')==uid:
                        sess.update({'username':username,'display_name':display,'role':role,'access':access})
                        if not active: SESSIONS.pop(token,None)
            log_action(user['id'],'actualizar_usuario',f'{uid} · {username}'); return self.send_json({'ok':True,'id':uid})
        if path=='/api/profiles':
            pid=int(body.get('id') or 0); name=str(body.get('display_name') or body.get('name') or '').strip(); kind=str(body.get('kind','Revisar')); mode=str(body.get('mode','Presencial')); strength=str(body.get('strength','')).strip(); fact=1 if body.get('fact') else 0; concurrence=1 if body.get('concurrence',True) else 0; active=1 if body.get('active',True) else 0
            if not name:return self.send_json({'ok':False,'error':'El nombre es obligatorio'},400)
            if kind not in ('Médico','Enfermería','Otro','Revisar'): return self.send_json({'ok':False,'error':'Tipo de perfil inválido'},400)
            if mode not in ('Presencial','Virtual','Mixto'): return self.send_json({'ok':False,'error':'Modalidad inválida'},400)
            normalized=normalize_name(name); conn=db()
            try:
                if pid:
                    current=conn.execute('SELECT id FROM person_profiles WHERE id=?',(pid,)).fetchone()
                    if not current:
                        conn.close(); return self.send_json({'ok':False,'error':'El perfil ya no existe'},404)
                    duplicate=conn.execute('SELECT id FROM person_profiles WHERE normalized_name=? AND id<>?',(normalized,pid)).fetchone()
                    if duplicate:
                        conn.close(); return self.send_json({'ok':False,'error':'Ya existe otro perfil con ese nombre'},409)
                    conn.execute('''UPDATE person_profiles SET normalized_name=?,display_name=?,kind=?,mode=?,strength=?,fact=?,concurrence=?,active=?,updated_by=?,updated_at=? WHERE id=?''',(normalized,name,kind,mode,strength,fact,concurrence,active,user['id'],now_iso(),pid))
                    saved_id=pid; action='actualizar_perfil'
                else:
                    existing=conn.execute('SELECT id FROM person_profiles WHERE normalized_name=?',(normalized,)).fetchone()
                    if existing:
                        saved_id=existing['id']; conn.execute('''UPDATE person_profiles SET display_name=?,kind=?,mode=?,strength=?,fact=?,concurrence=?,active=?,updated_by=?,updated_at=? WHERE id=?''',(name,kind,mode,strength,fact,concurrence,active,user['id'],now_iso(),saved_id)); action='actualizar_perfil'
                    else:
                        cur=conn.execute('''INSERT INTO person_profiles(normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)''',(normalized,name,kind,mode,strength,fact,concurrence,active,user['id'],now_iso())); saved_id=cur.lastrowid; action='crear_perfil'
                conn.commit()
            except sqlite3.IntegrityError:
                conn.rollback(); conn.close(); return self.send_json({'ok':False,'error':'Ya existe un perfil con esos datos'},409)
            conn.close(); log_action(user['id'],action,name); return self.send_json({'ok':True,'id':saved_id})
        if path=='/api/tracking':
            rid=int(body.get('run_id') or 0); date=str(body.get('entry_date') or '').strip(); person=str(body.get('person_name') or '').strip(); stream=str(body.get('stream') or '').strip(); metric=str(body.get('metric_type') or '').strip(); qty=float(body.get('qty') or 0); hours=float(body.get('hours') or 0); notes=str(body.get('notes') or '').strip()
            if not rid or not date or not person or not stream or not metric:return self.send_json({'ok':False,'error':'Run, fecha, colaborador, flujo y tipo son obligatorios'},400)
            conn=db(); cur=conn.execute('''INSERT INTO tracking_entries(run_id,entry_date,person_name,stream,metric_type,qty,hours,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)''',(rid,date,person,stream,metric,qty,hours,notes,user['id'],now_iso())); conn.commit(); tid=cur.lastrowid; conn.close(); log_action(user['id'],'registrar_seguimiento',f'Run {rid} · {person} · {date}'); return self.send_json({'ok':True,'id':tid})
        if path=='/api/settings':
            value=body.get('settings') or {}; conn=db(); conn.execute("INSERT INTO app_settings(key,value_json,updated_by,updated_at) VALUES('distribution',?,?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at",(json.dumps(value,ensure_ascii=False),user['id'],now_iso())); conn.commit(); conn.close(); log_action(user['id'],'actualizar_configuracion','Parámetros de distribución'); return self.send_json({'ok':True})
        if path=='/api/schedules':
            team=body.get('team',[]) or []
            conn=db(); cur=conn.execute('''INSERT INTO schedules(month,year,sheet_name,file_name,team_json,demand_json,beds_json,settings_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)''',(body.get('month'),body.get('year'),body.get('sheet_name'),body.get('file_name'),json.dumps(team,ensure_ascii=False),json.dumps(body.get('demand',[]),ensure_ascii=False),json.dumps(body.get('beds',[]),ensure_ascii=False),json.dumps(body.get('settings',{}),ensure_ascii=False),user['id'],now_iso())); sid=cur.lastrowid
            for p in team:
                name=str(p.get('name') or '').strip(); kind=str(p.get('kind') or 'Revisar')
                if not name or kind=='Revisar': continue
                conn.execute('''INSERT INTO person_profiles(normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(normalized_name) DO UPDATE SET display_name=excluded.display_name,kind=excluded.kind,mode=excluded.mode,strength=excluded.strength,fact=excluded.fact,concurrence=excluded.concurrence,active=1,updated_by=excluded.updated_by,updated_at=excluded.updated_at''',(normalize_name(name),name,kind,str(p.get('mode') or 'Presencial'),str(p.get('strength') or ''),1 if p.get('fact') else 0,1 if p.get('concurrence',True) else 0,1,user['id'],now_iso()))
            conn.commit(); conn.close(); log_action(user['id'],'guardar_horario',f'ID {sid} {body.get("month","")} {body.get("year","")}'); return self.send_json({'ok':True,'id':sid})
        if path=='/api/runs':
            schedule_id=body.get('schedule_id'); summary=body.get('summary',{}); medical=body.get('medical',{}); nursing=body.get('nursing',{}); alerts=body.get('alerts',[])
            conn=db(); cur=conn.execute('''INSERT INTO runs(schedule_id,month,year,summary_json,medical_json,nursing_json,alerts_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)''',(schedule_id,body.get('month'),body.get('year'),json.dumps(summary,ensure_ascii=False),json.dumps(medical,ensure_ascii=False),json.dumps(nursing,ensure_ascii=False),json.dumps(alerts,ensure_ascii=False),user['id'],now_iso())); rid=cur.lastrowid
            for a in body.get('assignments',[]):
                conn.execute('''INSERT INTO assignments(run_id,stream,person_name,task_label,task_kind,qty,hours,meta) VALUES(?,?,?,?,?,?,?,?)''',(rid,a.get('stream',''),a.get('person_name',''),a.get('task_label',''),a.get('task_kind',''),float(a.get('qty',0) or 0),float(a.get('hours',0) or 0),a.get('meta','')))
            conn.commit(); conn.close(); log_action(user['id'],'generar_distribucion',f'Run {rid}'); return self.send_json({'ok':True,'id':rid})
        self.send_json({'ok':False,'error':'No encontrado'},404)


def open_browser():
    time.sleep(1.0)
    try:webbrowser.open(f'http://{HOST}:{PORT}/')
    except:pass

if __name__=='__main__':
    init_db()
    if '--open' in sys.argv: threading.Thread(target=open_browser,daemon=True).start()
    try:
        print(f'Portal de Auditoría activo en http://{HOST}:{PORT}')
        ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
    except OSError as e:
        if 'address already in use' in str(e).lower() or getattr(e,'errno',None)==98:
            open_browser()
        else: raise
