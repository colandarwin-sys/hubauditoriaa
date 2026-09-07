const { Pool } = require('pg');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL_DISABLE === '1' ? false : { rejectUnauthorized: false },
  max: 3,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000
});

const json = (status, body, headers={}) => ({ statusCode: status, headers: {'Content-Type':'application/json; charset=utf-8', ...headers}, body: JSON.stringify(body) });
const ok = (body={}, headers={}) => json(200, {ok:true, ...body}, headers);
const err = (status, message) => json(status, {ok:false,error:message});
const now = () => new Date().toISOString();
const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const cookieMap = s => Object.fromEntries(String(s||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return i<0?[x,'']:[x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));
const bodyJson = e => { try { return e.body ? JSON.parse(e.body) : {}; } catch { return {}; } };
const pathOf = event => {
  const raw = event.path || '';
  const marker='/.netlify/functions/api';
  let p = raw.startsWith(marker) ? raw.slice(marker.length) : raw.replace(/^\/api/,'');
  if(!p.startsWith('/')) p='/'+p;
  return '/api'+p;
};
const qsOf = e => e.queryStringParameters || {};
function hashPassword(password,saltHex){return crypto.pbkdf2Sync(String(password),Buffer.from(saltHex,'hex'),150000,32,'sha256').toString('hex')}
function newSalt(){return crypto.randomBytes(16).toString('hex')}
function newToken(){return crypto.randomBytes(32).toString('hex')}
async function q(text,params=[]){return pool.query(text,params)}
async function log(userId,action,details=''){await q('insert into audit_log(user_id,action,details,created_at) values($1,$2,$3,now())',[userId,action,details]).catch(()=>{})}
async function sessionUser(event){
  const token=cookieMap(event.headers.cookie || event.headers.Cookie || '').audit_session;
  if(!token) return null;
  const r=await q(`select u.id,u.username,u.display_name,u.role,u.active from web_sessions s join users u on u.id=s.user_id where s.token=$1 and s.expires_at>now() and u.active=true`,[token]);
  return r.rows[0]||null;
}
async function requireUser(event,admin=false){const u=await sessionUser(event); if(!u) return {error:err(401,'No autenticado')}; if(admin&&u.role!=='administrador')return{error:err(403,'Permiso denegado')};return{user:u}}
function bool(v){return v===true||v===1||v==='1'||v==='true'}
async function workbookBuffer(sheets){
  const wb=new ExcelJS.Workbook(); wb.creator='Portal Distribución de Auditoría'; wb.created=new Date();
  for(const sh of sheets){
    const ws=wb.addWorksheet((sh.name||'Hoja').slice(0,31));
    ws.views=[{state:'frozen',ySplit:sh.subtitle?4:3}];
    const maxCols=Math.max(sh.headers?.length||1,...(sh.rows||[]).map(r=>r.length));
    ws.mergeCells(1,1,1,maxCols); const t=ws.getCell(1,1); t.value=sh.title||sh.name||''; t.font={bold:true,size:16,color:{argb:'FFFFFFFF'}}; t.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0A2D6A'}}; t.alignment={vertical:'middle'}; ws.getRow(1).height=26;
    let hr=3;
    if(sh.subtitle){ws.mergeCells(2,1,2,maxCols);const s=ws.getCell(2,1);s.value=sh.subtitle;s.font={italic:true,color:{argb:'FF53657D'}};hr=4}
    ws.getRow(hr).values=sh.headers||[];
    ws.getRow(hr).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF176BFF'}};c.alignment={vertical:'middle'}});
    (sh.rows||[]).forEach(r=>ws.addRow(r));
    (sh.widths||[]).forEach((w,i)=>{ ws.getColumn(i+1).width=w||18; });
    ws.autoFilter={from:{row:hr,column:1},to:{row:Math.max(hr,hr+(sh.rows||[]).length),column:maxCols}};
    ws.eachRow((row,ri)=>{if(ri>hr)row.eachCell(c=>{c.border={bottom:{style:'hair',color:{argb:'FFE5ECF6'}}}})});
  }
  return wb.xlsx.writeBuffer();
}
const fileResp=(buf,name)=>({statusCode:200,isBase64Encoded:true,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store'},body:Buffer.from(buf).toString('base64')});

exports.handler = async (event) => {
  try{
    if(!process.env.DATABASE_URL) return err(500,'Falta configurar DATABASE_URL en Netlify.');
    const path=pathOf(event), method=event.httpMethod||'GET', body=bodyJson(event), qs=qsOf(event);

    if(path==='/api/login' && method==='POST'){
      const username=String(body.username||'').trim().toLowerCase(), password=String(body.password||'');
      const r=await q('select * from users where lower(username)=$1 and active=true',[username]); const u=r.rows[0];
      if(!u || hashPassword(password,u.salt)!==u.password_hash) return err(401,'Usuario o contraseña incorrectos');
      const token=newToken(); await q('delete from web_sessions where expires_at<=now()'); await q(`insert into web_sessions(token,user_id,expires_at) values($1,$2,now()+interval '7 days')`,[token,u.id]); await log(u.id,'login','Inicio de sesión web');
      return ok({user:{id:u.id,username:u.username,display_name:u.display_name,role:u.role},},{'Set-Cookie':`audit_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`});
    }
    if(path==='/api/session' && method==='GET'){const u=await sessionUser(event);return ok({user:u||null,ok:!!u})}
    if(path==='/api/logout' && method==='POST'){
      const token=cookieMap(event.headers.cookie||'').audit_session; const u=await sessionUser(event); if(token)await q('delete from web_sessions where token=$1',[token]); if(u)await log(u.id,'logout','Cierre de sesión web');
      return ok({}, {'Set-Cookie':'audit_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});
    }

    const auth=await requireUser(event); if(auth.error)return auth.error; const user=auth.user;

    if(path==='/api/settings' && method==='GET'){const r=await q("select value_json from app_settings where key='distribution'");return ok({settings:r.rows[0]?.value_json||{}})}
    if(path==='/api/settings' && method==='POST'){await q(`insert into app_settings(key,value_json,updated_by,updated_at) values('distribution',$1::jsonb,$2,now()) on conflict(key) do update set value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,[JSON.stringify(body.settings||{}),user.id]);await log(user.id,'actualizar_configuracion','Parámetros de distribución');return ok()}

    if(path==='/api/users' && method==='GET'){
      if(user.role!=='administrador')return err(403,'Permiso denegado'); const r=await q('select id,username,display_name,role,active,created_at from users order by active desc,display_name');return ok({users:r.rows});
    }
    if(path==='/api/users' && method==='POST'){
      if(user.role!=='administrador')return err(403,'Permiso denegado'); const username=String(body.username||'').trim().toLowerCase(),display=String(body.display_name||'').trim(),role=String(body.role||'coordinador'),password=String(body.password||'');
      if(!username||!display||!password)return err(400,'Usuario, nombre y contraseña son obligatorios'); if(!['administrador','gerente','coordinador'].includes(role))return err(400,'Rol inválido');
      const salt=newSalt(),hash=hashPassword(password,salt); try{const r=await q('insert into users(username,display_name,role,password_hash,salt,active,created_at) values($1,$2,$3,$4,$5,true,now()) returning id',[username,display,role,hash,salt]);await log(user.id,'crear_usuario',username);return ok({id:r.rows[0].id})}catch(e){if(e.code==='23505')return err(409,'Ese nombre de usuario ya está en uso');throw e}
    }
    if(path.startsWith('/api/users/') && method==='POST'){
      if(user.role!=='administrador')return err(403,'Permiso denegado'); const id=Number(path.split('/').pop()); const cur=(await q('select * from users where id=$1',[id])).rows[0]; if(!cur)return err(404,'Usuario no encontrado');
      const username=String(body.username||'').trim().toLowerCase(),display=String(body.display_name||'').trim()||username,role=String(body.role||'coordinador'),active=body.active===undefined?true:bool(body.active),password=String(body.password||'');
      if(!username||!display)return err(400,'Usuario y nombre son obligatorios'); if(!['administrador','gerente','coordinador'].includes(role))return err(400,'Rol inválido');
      const dup=await q('select id from users where lower(username)=$1 and id<>$2',[username,id]);if(dup.rowCount)return err(409,'Ese nombre de usuario ya está en uso');
      if(cur.role==='administrador'&&cur.active&&(role!=='administrador'||!active)){const n=Number((await q("select count(*) n from users where role='administrador' and active=true")).rows[0].n);if(n<=1)return err(400,'Debe existir al menos un administrador activo')}
      if(password){const salt=newSalt();await q('update users set username=$1,display_name=$2,role=$3,password_hash=$4,salt=$5,active=$6 where id=$7',[username,display,role,hashPassword(password,salt),salt,active,id])}else await q('update users set username=$1,display_name=$2,role=$3,active=$4 where id=$5',[username,display,role,active,id]);
      if(!active)await q('delete from web_sessions where user_id=$1',[id]); await log(user.id,'actualizar_usuario',`${id} · ${username}`);return ok({id});
    }
    if(path.startsWith('/api/users/') && method==='DELETE'){
      if(user.role!=='administrador')return err(403,'Permiso denegado'); const id=Number(path.split('/').pop());const cur=(await q('select * from users where id=$1',[id])).rows[0];if(!cur)return err(404,'Usuario no encontrado');
      if(cur.role==='administrador'&&cur.active){const n=Number((await q("select count(*) n from users where role='administrador' and active=true")).rows[0].n);if(n<=1)return err(400,'Debe existir al menos un administrador activo')}
      await q('update users set active=false where id=$1',[id]);await q('delete from web_sessions where user_id=$1',[id]);await log(user.id,'desactivar_usuario',String(id));return ok();
    }

    if(path==='/api/profiles' && method==='GET'){const r=await q('select id,display_name,kind,mode,strength,fact,concurrence,active,updated_at from person_profiles order by active desc,display_name');return ok({profiles:r.rows})}
    if(path==='/api/profiles' && method==='POST'){
      const id=Number(body.id||0),name=String(body.display_name||body.name||'').trim(),kind=String(body.kind||'Revisar'),mode=String(body.mode||'Presencial'),strength=String(body.strength||'').trim(),fact=bool(body.fact),concurrence=body.concurrence===undefined?true:bool(body.concurrence),active=body.active===undefined?true:bool(body.active);
      if(!name)return err(400,'El nombre es obligatorio');if(!['Médico','Enfermería','Otro','Revisar'].includes(kind))return err(400,'Tipo de perfil inválido');if(!['Presencial','Virtual','Mixto'].includes(mode))return err(400,'Modalidad inválida');const normalized=norm(name);
      try{let saved=id;if(id){const x=await q('update person_profiles set normalized_name=$1,display_name=$2,kind=$3,mode=$4,strength=$5,fact=$6,concurrence=$7,active=$8,updated_by=$9,updated_at=now() where id=$10 returning id',[normalized,name,kind,mode,strength,fact,concurrence,active,user.id,id]);if(!x.rowCount)return err(404,'El perfil ya no existe')}else{const x=await q(`insert into person_profiles(normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) on conflict(normalized_name) do update set display_name=excluded.display_name,kind=excluded.kind,mode=excluded.mode,strength=excluded.strength,fact=excluded.fact,concurrence=excluded.concurrence,active=excluded.active,updated_by=excluded.updated_by,updated_at=excluded.updated_at returning id`,[normalized,name,kind,mode,strength,fact,concurrence,active,user.id]);saved=x.rows[0].id}await log(user.id,id?'actualizar_perfil':'crear_perfil',name);return ok({id:saved})}catch(e){if(e.code==='23505')return err(409,'Ya existe otro perfil con ese nombre');throw e}
    }
    if(path.startsWith('/api/profiles/') && method==='DELETE'){if(user.role!=='administrador')return err(403,'Permiso denegado');const id=Number(path.split('/').pop());await q('update person_profiles set active=false,updated_by=$1,updated_at=now() where id=$2',[user.id,id]);await log(user.id,'desactivar_perfil',String(id));return ok()}

    if(path==='/api/schedules' && method==='GET'){const r=await q(`select s.id,s.month,s.year,s.sheet_name,s.file_name,s.created_at,u.display_name created_by_name from schedules s left join users u on u.id=s.created_by order by s.id desc limit 100`);return ok({schedules:r.rows})}
    if(path==='/api/schedules' && method==='POST'){
      const team=body.team||[];const r=await q(`insert into schedules(month,year,sheet_name,file_name,team_json,demand_json,beds_json,settings_json,created_by,created_at) values($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,now()) returning id`,[body.month,body.year,body.sheet_name,body.file_name,JSON.stringify(team),JSON.stringify(body.demand||[]),JSON.stringify(body.beds||[]),JSON.stringify(body.settings||{}),user.id]);const id=r.rows[0].id;
      for(const p of team){const name=String(p.name||'').trim(),kind=String(p.kind||'Revisar');if(!name||kind==='Revisar')continue;await q(`insert into person_profiles(normalized_name,display_name,kind,mode,strength,fact,concurrence,active,updated_by,updated_at) values($1,$2,$3,$4,$5,$6,$7,true,$8,now()) on conflict(normalized_name) do update set display_name=excluded.display_name,kind=excluded.kind,mode=excluded.mode,strength=excluded.strength,fact=excluded.fact,concurrence=excluded.concurrence,active=true,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,[norm(name),name,kind,p.mode||'Presencial',p.strength||'',bool(p.fact),p.concurrence===undefined?true:bool(p.concurrence),user.id])}
      await log(user.id,'guardar_horario',`ID ${id} ${body.month||''} ${body.year||''}`);return ok({id});
    }
    if(path.startsWith('/api/schedules/') && method==='GET'){const id=Number(path.split('/').pop());const r=await q('select * from schedules where id=$1',[id]);if(!r.rowCount)return err(404,'No encontrado');const x=r.rows[0];return ok({schedule:{...x,team:x.team_json,demand:x.demand_json,beds:x.beds_json,settings:x.settings_json}})}

    if(path==='/api/runs' && method==='GET'){const r=await q(`select r.id,r.schedule_id,r.month,r.year,r.created_at,u.display_name created_by_name from runs r left join users u on u.id=r.created_by order by r.id desc limit 100`);return ok({runs:r.rows})}
    if(path==='/api/runs' && method==='POST'){
      const r=await q(`insert into runs(schedule_id,month,year,summary_json,medical_json,nursing_json,alerts_json,created_by,created_at) values($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,now()) returning id`,[body.schedule_id||null,body.month,body.year,JSON.stringify(body.summary||{}),JSON.stringify(body.medical||{}),JSON.stringify(body.nursing||{}),JSON.stringify(body.alerts||[]),user.id]);const id=r.rows[0].id;
      for(const a of body.assignments||[])await q('insert into assignments(run_id,stream,person_name,task_label,task_kind,qty,hours,meta) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,a.stream||'',a.person_name||'',a.task_label||'',a.task_kind||'',Number(a.qty||0),Number(a.hours||0),a.meta||'']);await log(user.id,'generar_distribucion',`Run ${id}`);return ok({id});
    }
    if((path==='/api/runs/latest'||path.startsWith('/api/runs/')) && method==='GET'){
      const r=path==='/api/runs/latest'?await q('select * from runs order by id desc limit 1'):await q('select * from runs where id=$1',[Number(path.split('/').pop())]); if(!r.rowCount)return ok({run:null});const x=r.rows[0];const a=await q('select id,stream,person_name,task_label,task_kind,qty,hours,meta from assignments where run_id=$1 order by stream,person_name,task_kind,task_label',[x.id]);return ok({run:{...x,summary:x.summary_json,medical:x.medical_json,nursing:x.nursing_json,alerts:x.alerts_json,assignments:a.rows}})
    }

    if(path==='/api/tracking' && method==='GET'){
      let id=Number(qs.run_id||0);if(!id){id=Number((await q('select max(id) id from runs')).rows[0].id||0)};if(!id)return ok({run:null,entries:[],plan:[]});
      const entries=await q(`select t.id,t.run_id,t.entry_date,t.person_name,t.stream,t.metric_type,t.qty,t.hours,t.notes,t.created_at,u.display_name created_by_name from tracking_entries t left join users u on u.id=t.created_by where t.run_id=$1 order by t.entry_date desc,t.id desc`,[id]);const run=(await q('select id,month,year,schedule_id from runs where id=$1',[id])).rows[0]||null;const plan=await q('select stream,person_name,task_kind,sum(qty) qty,sum(hours) hours from assignments where run_id=$1 group by stream,person_name,task_kind order by stream,person_name',[id]);return ok({run,entries:entries.rows,plan:plan.rows});
    }
    if(path==='/api/tracking' && method==='POST'){
      const id=Number(body.run_id||0),date=String(body.entry_date||''),person=String(body.person_name||''),stream=String(body.stream||''),metric=String(body.metric_type||'');if(!id||!date||!person||!stream||!metric)return err(400,'Run, fecha, colaborador, flujo y tipo son obligatorios');const r=await q('insert into tracking_entries(run_id,entry_date,person_name,stream,metric_type,qty,hours,notes,created_by,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) returning id',[id,date,person,stream,metric,Number(body.qty||0),Number(body.hours||0),body.notes||'',user.id]);await log(user.id,'registrar_seguimiento',`Run ${id} · ${person} · ${date}`);return ok({id:r.rows[0].id});
    }
    if(path.startsWith('/api/tracking/') && method==='DELETE'){const id=Number(path.split('/').pop());await q('delete from tracking_entries where id=$1',[id]);await log(user.id,'eliminar_seguimiento',String(id));return ok()}

    if(path==='/api/dashboard' && method==='GET'){
      const counts=(await q(`select (select count(*) from schedules) schedules,(select count(*) from runs) runs,(select count(*) from users where active=true) users`)).rows[0];const recent=(await q('select id,month,year,created_at,summary_json from runs order by id desc limit 12')).rows.map(r=>({...r,summary:r.summary_json}));const latest=await q('select stream,person_name,sum(hours) hours,sum(qty) qty from assignments where run_id=(select max(id) from runs) group by stream,person_name order by stream,hours desc');return ok({counts,recent,latest_assignments:latest.rows});
    }

    if(path==='/api/export/historicos.xlsx' && method==='GET'){
      const r=await q(`select r.id,r.month,r.year,r.created_at,u.display_name,(select count(*) from assignments a where a.run_id=r.id) assignment_count from runs r left join users u on u.id=r.created_by order by r.id desc`);const buf=await workbookBuffer([{name:'Históricos',title:'Histórico de distribuciones',subtitle:'Portal de Distribución de Auditoría',headers:['ID','Mes','Año','Fecha','Usuario','Asignaciones'],rows:r.rows.map(x=>[x.id,x.month,x.year,String(x.created_at),x.display_name||'',Number(x.assignment_count)]),widths:[10,16,10,24,24,16]}]);return fileResp(buf,'historicos_auditoria.xlsx');
    }
    if(path==='/api/export/resultados.xlsx' && method==='GET'){
      let id=Number(qs.run_id||0);if(!id)id=Number((await q('select max(id) id from runs')).rows[0].id||0);const run=(await q('select * from runs where id=$1',[id])).rows[0];if(!run)return err(404,'No hay distribución para exportar');const sch=run.schedule_id?(await q('select * from schedules where id=$1',[run.schedule_id])).rows[0]:null;const rows=(await q('select stream,person_name,task_label,task_kind,qty,hours,meta from assignments where run_id=$1 order by stream,person_name,task_kind,task_label',[id])).rows;const team=sch?.team_json||[],workDays=Number(sch?.settings_json?.workDays||20),tm=Object.fromEntries(team.map(p=>[norm(p.name),p]));const grouped={};for(const a of rows){const k=a.stream+'||'+a.person_name;grouped[k]??={stream:a.stream,name:a.person_name,hours:0,fact:0,conc:0};grouped[k].hours+=Number(a.hours||0);if(norm(a.task_kind).includes('FACTUR'))grouped[k].fact+=Number(a.qty||0);if(norm(a.task_kind).includes('CONCURRENCIA'))grouped[k].conc+=Number(a.qty||0)}const summaryRows=Object.values(grouped).map(g=>{const p=tm[norm(g.name)]||{},avail=Number(p.hours||0),load=avail?g.hours/avail*100:'',free=avail?(avail-g.hours)/Math.max(1,workDays):'';return[g.stream,g.name,p.kind||'',avail,g.hours,load===''?'':+load.toFixed(1),g.fact,g.conc,free===''?'':+free.toFixed(1)]});const med=rows.filter(x=>x.stream==='Médica').map(x=>[x.person_name,x.task_label,x.task_kind,Number(x.qty),Number(x.hours),x.meta||'']);const nur=rows.filter(x=>x.stream==='Enfermería').map(x=>[x.person_name,x.task_label,x.task_kind,Number(x.qty),Number(x.hours),x.meta||'']);const alerts=(run.alerts_json||[]).map(x=>[x]);const buf=await workbookBuffer([{name:'Resumen',title:`Distribución ${run.month||''} ${run.year||''}`,subtitle:'Resumen ejecutivo por colaborador',headers:['Flujo','Colaborador','Perfil','Horas disponibles','Horas asignadas','Carga %','Expedientes','Concurrencia','Libre/día'],rows:summaryRows,widths:[16,24,18,18,18,12,14,16,14]},{name:'Auditoría Médica',title:'Detalle de Auditoría Médica',headers:['Colaborador','Concepto','Tipo','Cantidad','Horas','Detalle'],rows:med,widths:[24,38,22,12,12,42]},{name:'Enfermería',title:'Detalle de Auditoría de Enfermería',headers:['Colaborador','Unidad','Tipo','Revisiones','Horas','Detalle'],rows:nur,widths:[24,34,24,14,12,42]},{name:'Alertas',title:'Alertas de distribución',headers:['Alerta'],rows:alerts,widths:[90]}]);return fileResp(buf,`distribucion_${String(run.month||'mes').toLowerCase()}_${run.year||''}.xlsx`);
    }
    if(path==='/api/export/seguimiento.xlsx' && method==='GET'){
      let id=Number(qs.run_id||0);if(!id)id=Number((await q('select max(id) id from runs')).rows[0].id||0);const run=(await q('select id,month,year from runs where id=$1',[id])).rows[0];if(!run)return err(404,'No hay distribución');const entries=(await q('select entry_date,person_name,stream,metric_type,qty,hours,notes,created_at from tracking_entries where run_id=$1 order by entry_date,person_name',[id])).rows;const plan=(await q('select stream,person_name,task_kind,sum(qty) qty,sum(hours) hours from assignments where run_id=$1 group by stream,person_name,task_kind order by stream,person_name',[id])).rows;const buf=await workbookBuffer([{name:'Seguimiento',title:`Seguimiento ${run.month||''} ${run.year||''}`,headers:['Fecha','Colaborador','Flujo','Tipo','Cantidad','Horas','Observación','Registrado'],rows:entries.map(x=>[String(x.entry_date).slice(0,10),x.person_name,x.stream,x.metric_type,Number(x.qty),Number(x.hours),x.notes||'',String(x.created_at)]),widths:[14,24,16,18,12,12,40,24]},{name:'Plan',title:'Plan mensual base',headers:['Flujo','Colaborador','Tipo','Cantidad plan','Horas plan'],rows:plan.map(x=>[x.stream,x.person_name,x.task_kind,Number(x.qty),Number(x.hours)]),widths:[16,24,24,16,14]}]);return fileResp(buf,`seguimiento_${String(run.month||'mes').toLowerCase()}_${run.year||''}.xlsx`);
    }

    if(path==='/api/audit' && method==='GET'){const r=await q(`select a.id,a.action,a.details,a.created_at,u.display_name from audit_log a left join users u on u.id=a.user_id order by a.id desc limit 200`);return ok({audit:r.rows})}
    return err(404,'No encontrado');
  }catch(e){console.error(e);return err(500,e.message||'Error interno')}
};
