'use strict';
const crypto=require('node:crypto');
const URL_BASE=()=>String(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const SERVICE=()=>process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const reply=(status,data,headers={})=>({statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers},body:JSON.stringify(data)});
const cookie=(n,v,age)=>`${n}=${encodeURIComponent(v)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const getCookies=(s)=>Object.fromEntries((s||'').split(';').map(x=>{const i=x.indexOf('=');return i<0?[]:[x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1).trim())]}).filter(x=>x.length));
const adminHeaders=(extra={})=>({'apikey':SERVICE(),'Authorization':'Bearer '+SERVICE(),'Content-Type':'application/json',...extra});
async function request(path,opts={}){
 const res=await fetch(URL_BASE()+path,{...opts,headers:{...adminHeaders(),...(opts.headers||{})}});
 const raw=await res.text();let data;try{data=JSON.parse(raw)}catch{data=raw}
 if(!res.ok)throw Object.assign(new Error(data?.message||data?.msg||data?.error_description||data?.error||`Supabase ${res.status}`),{status:res.status});
 return {data,headers:res.headers,status:res.status};
}
async function rows(table,query=''){return (await request(`/rest/v1/${table}?${query}`)).data}
async function insert(table,payload){const r=await request(`/rest/v1/${table}`,{method:'POST',headers:adminHeaders({'Prefer':'return=representation'}),body:JSON.stringify(payload)});return r.data[0]}
async function patch(table,query,payload){const r=await request(`/rest/v1/${table}?${query}`,{method:'PATCH',headers:adminHeaders({'Prefer':'return=representation'}),body:JSON.stringify(payload)});return r.data}
async function del(table,query){return request(`/rest/v1/${table}?${query}`,{method:'DELETE'})}
const eq=x=>encodeURIComponent(String(x));
const qid=(id)=>`id=eq.${eq(id)}`;
const getBody=e=>{try{return JSON.parse(e.body||'{}')}catch{return {}}};
const normal=s=>String(s||'').trim().toLowerCase();
const addr=username=>`${normal(username).replace(/[^a-z0-9._-]/g,'')}@hub-auditoria.example`;
const baseAccess=(role)=>({home:true,users:role==='administrador',modules:{expedientes:{enabled:true,views:{resumen:true,evolucion:true,antiguedad:true,auditor:true,expedientes:true,historico:true}},tarifarios:{enabled:true,views:Object.fromEntries(['Directorio','Comparador cruzado','Matriz catálogo','Tarifas','Histórico','Actualizar tarifario'].map(x=>[x,true]))},distribucion:{enabled:true,views:Object.fromEntries(['Operación mensual','Resultados','Seguimiento operativo','Dashboard','Históricos','Perfiles del equipo','Configuración'].map(x=>[x,true]))}}});
function publicUser(u){if(!u)return null;return {id:u.id,username:u.username,display_name:u.display_name,role:u.role,active:u.active,access:u.role==='administrador'?baseAccess('administrador'):{...baseAccess(u.role),...(u.access||{})}}}
async function authenticate(e){let c=getCookies(e.headers.cookie||e.headers.Cookie);let jwt=c.hub_access;let extra=[];if(!jwt)return {user:null,headers:extra};
 let check;try{check=await request('/auth/v1/user',{headers:adminHeaders({Authorization:'Bearer '+jwt})})}catch{
   if(c.hub_refresh){try{const r=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:c.hub_refresh})});jwt=r.data.access_token;extra=[cookie('hub_access',jwt,Math.max(300,r.data.expires_in||3600)),cookie('hub_refresh',r.data.refresh_token,60*60*24*30)];check=await request('/auth/v1/user',{headers:adminHeaders({Authorization:'Bearer '+jwt})})}catch{return {user:null,headers:[]}}}
   else return {user:null,headers:[]};
 }
 const result=await rows('hub_users',`auth_id=eq.${eq(check.data.id)}&select=*&limit=1`);return {user:result[0]?.active?publicUser(result[0]):null,headers:extra};
}
function wrap(status,obj,cookies=[]){const h=cookies.length?{'Set-Cookie':cookies[0]}:{};const r=reply(status,obj,h);if(cookies.length)r.multiValueHeaders={'Set-Cookie':cookies};return r}
function obj(r){return {id:r.id,...r.payload,created_at:r.created_at}}
function summaryOfTariffs(data){
 let payers=[...new Set(['Particular',...data.map(x=>x.payer)])],by={},values={},annual={};for(let p of payers){by[p]=new Map();values[p]=0;annual[p]={}}
 for(let r of data){by[r.payer]?.set(r.profat,r);values[r.payer]+=Number(r.amount)||0;const y=(String(r.vigencia||'').match(/(?:19|20)\d{2}/)||[])[0];if(y){const v=annual[r.payer][y]||={amount:0,count:0,groups:{}};v.amount+=Number(r.amount)||0;v.count++;const g=r.group||'SIN GRUPO';v.groups[g]=(v.groups[g]||0)+(Number(r.amount)||0)}}
 const sets=Object.fromEntries(payers.map(p=>[p,new Set([...by[p]].filter(([_,r])=>!String(r.group||'').toUpperCase().includes('PAQUETE')).map(([k])=>k))]));const pa=sets.Particular,ia=payers.filter(p=>p!=='Particular');let only=0,univ=0,penetration={};for(let i=0;i<=ia.length;i++)penetration[String(i)]=0;for(let code of pa){let n=ia.filter(p=>sets[p].has(code)).length;penetration[String(n)]++;if(!n)only++;if(n===ia.length)univ++}
 let coverage=ia.map(p=>({payer:p,total:by[p].size,common:[...pa].filter(x=>sets[p].has(x)).length,missing:[...pa].filter(x=>!sets[p].has(x)).length,coverage:pa.size?100*[...pa].filter(x=>sets[p].has(x)).length/pa.size:0}));let comparisons={};for(let a of payers)for(let b of payers)if(a!==b){let aa=sets[a],bb=sets[b],common=[...aa].filter(x=>bb.has(x)).length;comparisons[a+'|'+b]={a:aa.size,b:bb.size,common,onlyA:aa.size-common,onlyB:bb.size-common,coverageAB:aa.size?100*common/aa.size:0,coverageBA:bb.size?100*common/bb.size:0,packagesExcluded:a==='Particular'||b==='Particular'}}
 return {payers,particularCount:by.Particular.size,universeCount:new Set(data.map(x=>x.profat)).size,universalCount:univ,onlyParticularCount:only,coverage,values,annual,penetration,comparisons};
}
async function allTariffs(){let out=[],off=0;while(true){const x=await rows('hub_tariff_rows',`select=*&order=id.asc&limit=1000&offset=${off}`);out.push(...x);if(x.length<1000)break;off+=1000;if(off>300000)throw Error('Demasiadas tarifas')};return out.map(x=>({payer:x.payer,profat:x.profat,description:x.description,amount:+x.amount,group:x.group_name,group_num:x.group_num,segus:x.segus,vigencia:x.vigencia}))}
async function excel(sheets,filename){const ExcelJS=require('exceljs');const wb=new ExcelJS.Workbook();for(const sheet of sheets){const ws=wb.addWorksheet(sheet.name.slice(0,31));ws.addRow(sheet.headers);ws.addRows(sheet.rows);ws.views=[{state:'frozen',ySplit:1}];ws.getRow(1).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF101D12'}};c.font={bold:true,color:{argb:'FFCDFF00'}};c.alignment={vertical:'middle'}});ws.getRow(1).height=28;ws.autoFilter={from:'A1',to:ws.getRow(1).getCell(sheet.headers.length).address};ws.columns.forEach((c,i)=>{c.width=Math.min(48,Math.max(15,Math.max(sheet.headers[i].length,...sheet.rows.slice(0,100).map(r=>String(r[i]??'').length))+3))});for(let i=2;i<=ws.rowCount;i++){ws.getRow(i).eachCell(c=>{if(i%2===0)c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0FFDD'}}})}}let bytes=await wb.xlsx.writeBuffer();return {statusCode:200,isBase64Encoded:true,headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store'},body:Buffer.from(bytes).toString('base64')};}
exports.handler=async e=>{
 const path=(e.path.startsWith('/api/')?e.path:'/api/'+(e.path.split('/.netlify/functions/api/')[1]||'')).replace(/\/+$/,'');const qs=new URLSearchParams(e.rawQuery||e.queryStringParameters&&new URLSearchParams(e.queryStringParameters)||'');const method=e.httpMethod;const body=getBody(e);
 if(path==='/api/health')return reply(200,{ok:true,configured:!!(URL_BASE()&&SERVICE()),version:'Hub Auditoría Cloud'});
 if(!URL_BASE()||!SERVICE())return reply(503,{ok:false,error:'Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en las variables privadas de Netlify.'});
 try{
 if(path==='/api/bootstrap'&&method==='POST'){
   const current=await rows('hub_users','select=id&limit=1');if(current.length)return reply(403,{error:'La instalación inicial ya está completada'});
   if(!process.env.HUB_BOOTSTRAP_USERNAME||!process.env.HUB_BOOTSTRAP_PASSWORD||body.username!==process.env.HUB_BOOTSTRAP_USERNAME||body.password!==process.env.HUB_BOOTSTRAP_PASSWORD)return reply(403,{error:'Credenciales de instalación incorrectas'});
   const r=await request('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email:addr(body.username),password:body.password,email_confirm:true})});const profile=await insert('hub_users',{auth_id:r.data.id,username:normal(body.username),display_name:body.display_name||body.username,role:'administrador',access:baseAccess('administrador')});return reply(200,{ok:true,id:profile.id});
 }
 if(path==='/api/login'&&method==='POST'){
   const t=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:adminHeaders(),body:JSON.stringify({email:addr(body.username),password:body.password})});const profile=(await rows('hub_users',`auth_id=eq.${eq(t.data.user.id)}&limit=1`))[0];if(!profile?.active)return reply(403,{error:'Usuario inactivo o sin permisos'});return wrap(200,{ok:true,user:publicUser(profile)},[cookie('hub_access',t.data.access_token,t.data.expires_in||3600),cookie('hub_refresh',t.data.refresh_token,2592000)]);
 }
 if(path==='/api/logout'&&method==='POST')return wrap(200,{ok:true},[cookie('hub_access','',0),cookie('hub_refresh','',0)]);
 const auth=await authenticate(e);if(path==='/api/session')return wrap(200,{ok:!!auth.user,user:auth.user},auth.headers);const user=auth.user;if(!user)return reply(401,{ok:false,error:'No autenticado'});
 const admin=user.role==='administrador';const needAdmin=()=>{if(!admin)throw Object.assign(new Error('Permiso denegado'),{status:403})};
 if(path==='/api/users'&&method==='GET'){needAdmin();const x=await rows('hub_users','select=*&order=display_name.asc');return reply(200,{ok:true,users:x.map(publicUser)})}
 if(path==='/api/users'&&method==='POST'){needAdmin();const un=normal(body.username);if(!/^[a-z0-9._-]{3,60}$/.test(un)||String(body.password||'').length<10)return reply(400,{error:'Usuario inválido o contraseña menor de 10 caracteres'});if(!['administrador','gerente','coordinador'].includes(body.role))return reply(400,{error:'Rol inválido'});const r=await request('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email:addr(un),password:body.password,email_confirm:true})});const u=await insert('hub_users',{auth_id:r.data.id,username:un,display_name:body.display_name||un,role:body.role,access:body.access||baseAccess(body.role)});return reply(200,{ok:true,id:u.id})}
 const uid=path.match(/^\/api\/users\/(\d+)$/);if(uid){needAdmin();const u=(await rows('hub_users',qid(uid[1])))[0];if(!u)return reply(404,{error:'Usuario no encontrado'});if(method==='DELETE'){if(u.role==='administrador'){const admins=await rows('hub_users','role=eq.administrador&active=eq.true&select=id');if(admins.length<=1)return reply(400,{error:'Debe permanecer al menos un administrador'})}await patch('hub_users',qid(uid[1]),{active:false});return reply(200,{ok:true})}if(method==='POST'){const data={username:normal(body.username),display_name:body.display_name||body.username,role:body.role,active:!!body.active,access:body.access||baseAccess(body.role)};if(u.role==='administrador'&&(data.role!=='administrador'||!data.active)){const admins=await rows('hub_users','role=eq.administrador&active=eq.true&select=id');if(admins.length<=1)return reply(400,{error:'Debe permanecer al menos un administrador'})}if(body.password){if(String(body.password).length<10)return reply(400,{error:'La contraseña debe tener al menos 10 caracteres'});await request(`/auth/v1/admin/users/${u.auth_id}`,{method:'PUT',body:JSON.stringify({password:body.password})})}await patch('hub_users',qid(uid[1]),data);return reply(200,{ok:true,id:u.id})}}
 const rr=async kind=>{let a=await rows('hub_records',`kind=eq.${kind}&select=*&order=id.desc&limit=200`);return a.map(obj)};
 const save=async(kind,payload)=>insert('hub_records',{kind,payload,created_by:user.id});
 if(path==='/api/profiles'&&method==='GET')return reply(200,{ok:true,profiles:(await rr('profile')).map(x=>({...x,active:x.active!==false}))});
 if(path==='/api/profiles'&&method==='POST'){const id=Number(body.id)||0;const payload={display_name:body.display_name||body.name,kind:body.kind||'Revisar',mode:body.mode||'Presencial',strength:body.strength||'',fact:!!body.fact,concurrence:body.concurrence!==false,active:body.active!==false};if(id){await patch('hub_records',`id=eq.${id}&kind=eq.profile`,{payload});return reply(200,{ok:true,id})}const prior=(await rr('profile')).find(x=>normal(x.display_name)===normal(payload.display_name));if(prior){await patch('hub_records',qid(prior.id),{payload});return reply(200,{ok:true,id:prior.id})}const r=await save('profile',payload);return reply(200,{ok:true,id:r.id})}
 const pid=path.match(/^\/api\/profiles\/(\d+)$/);if(pid&&method==='DELETE'){needAdmin();const old=(await rr('profile')).find(x=>x.id===+pid[1]);if(old)await patch('hub_records',qid(pid[1]),{payload:{...old,active:false}});return reply(200,{ok:true})}
 if(path==='/api/settings'&&method==='GET'){const old=(await rr('settings'))[0];return reply(200,{ok:true,settings:old?.settings||{}})}
 if(path==='/api/settings'&&method==='POST'){const old=(await rr('settings'))[0];if(old)await patch('hub_records',qid(old.id),{payload:{settings:body.settings||{}}});else await save('settings',{settings:body.settings||{}});return reply(200,{ok:true})}
 if(path==='/api/schedules'&&method==='GET')return reply(200,{ok:true,schedules:(await rr('schedule')).map(({team,demand,beds,settings,...x})=>x)});
 if(path==='/api/schedules'&&method==='POST'){const r=await save('schedule',body);return reply(200,{ok:true,id:r.id})}
 const sid=path.match(/^\/api\/schedules\/(\d+)$/);if(sid){const r=(await rr('schedule')).find(x=>x.id===Number(sid[1]));return r?reply(200,{ok:true,schedule:r}):reply(404,{error:'No encontrado'})}
 if(path==='/api/runs'&&method==='GET')return reply(200,{ok:true,runs:(await rr('run')).map(({summary,medical,nursing,alerts,assignments,...x})=>x)});
 if(path==='/api/runs'&&method==='POST'){const r=await save('run',body);return reply(200,{ok:true,id:r.id})}
 if(path==='/api/runs/latest'||/^\/api\/runs\/\d+$/.test(path)){const r=path.endsWith('/latest')?(await rr('run'))[0]:(await rr('run')).find(x=>x.id===Number(path.split('/').pop()));return reply(200,{ok:true,run:r||null})}
 if(path==='/api/tracking'&&method==='GET'){const runs=await rr('run');const rid=Number(qs.get('run_id'))||runs[0]?.id||0;const run=runs.find(x=>x.id===rid);const entries=(await rr('tracking')).filter(x=>Number(x.run_id)===rid);const m=new Map();for(const a of run?.assignments||[]){const key=[a.stream,a.person_name,a.task_kind].join('|');const v=m.get(key)||{stream:a.stream,person_name:a.person_name,task_kind:a.task_kind,qty:0,hours:0};v.qty+=+a.qty||0;v.hours+=+a.hours||0;m.set(key,v)}return reply(200,{ok:true,run:run||null,entries,plan:[...m.values()]})}
 if(path==='/api/tracking'&&method==='POST'){const r=await save('tracking',body);return reply(200,{ok:true,id:r.id})}
 const tid=path.match(/^\/api\/tracking\/(\d+)$/);if(tid&&method==='DELETE'){await del('hub_records',`id=eq.${tid[1]}&kind=eq.tracking`);return reply(200,{ok:true})}
 if(path==='/api/dashboard'){const schedules=await rr('schedule'),runs=await rr('run'),users=await rows('hub_users','active=eq.true&select=id');let last=runs[0];const totals={};for(const a of last?.assignments||[]){const k=a.stream+'|'+a.person_name;totals[k]||={stream:a.stream,person_name:a.person_name,hours:0,qty:0};totals[k].hours+=+a.hours||0;totals[k].qty+=+a.qty||0}return reply(200,{ok:true,counts:{schedules:schedules.length,runs:runs.length,users:users.length},recent:runs.slice(0,12),latest_assignments:Object.values(totals)})}
 if(path==='/api/audit'){needAdmin();return reply(200,{ok:true,log:await rr('audit')})}
 if(path==='/api/tarifarios/rows'&&method==='GET')return reply(200,await allTariffs());
 if(path==='/api/tarifarios/summary'&&method==='GET')return reply(200,summaryOfTariffs(await allTariffs()));
 if(path==='/api/tarifarios/import'&&method==='POST'){
   if(!user.access?.modules?.tarifarios?.views?.['Actualizar tarifario'])return reply(403,{error:'No autorizado para actualizar tarifarios'});
   const payer=String(body.payer||'').trim(),lines=body.rows||[],mode=body.mode||'update';if(!payer||!['new','update'].includes(mode)||!Array.isArray(lines)||lines.length===0||lines.length>120000)return reply(400,{error:'Importación inválida'});
   const existing=await rows('hub_tariff_rows',`payer=eq.${eq(payer)}&select=profat&limit=1`);if(mode==='new'&&existing.length)return reply(400,{error:'La IAFA ya existe'});if(mode==='update'&&!existing.length)return reply(400,{error:'La IAFA todavía no existe'});
   let seen=new Set();const records=lines.map(r=>{const code=String(r.profat||'').trim(),amount=Number(r.amount);if(!code||!String(r.description||'').trim()||!Number.isFinite(amount)||amount<0||seen.has(code))throw Object.assign(new Error('PROFAT inválido o duplicado: '+code),{status:400});seen.add(code);return {payer,profat:code,description:String(r.description).trim(),amount,group_name:String(r.group||''),group_num:String(r.group_num||''),segus:String(r.segus||''),vigencia:String(r.vigencia||'')}});
   // Sequential chunks; errors stop the replacement before old records are removed.
   for(let i=0;i<records.length;i+=250){const chunk=records.slice(i,i+250);await request('/rest/v1/hub_tariff_rows?on_conflict=payer,profat',{method:'POST',headers:adminHeaders({'Prefer':'resolution=merge-duplicates,return=minimal'}),body:JSON.stringify(chunk)})}
   // NOTE: rows missing in the new file are deliberately retained until a full atomic import is implemented.
   await insert('hub_tariff_imports',{payer,mode,file_name:String(body.file||''),record_count:records.length,imported_by:user.id});return reply(200,{ok:true,count:records.length,payer,backup:'Histórico de importación en Supabase'});
 }
 if(path.startsWith('/api/export/')&&path.endsWith('.xlsx')){
   let runs=await rr('run'),rid=Number(qs.get('run_id'))||runs[0]?.id||0,run=runs.find(x=>x.id===rid);if(path.endsWith('historicos.xlsx'))return await excel([{name:'Históricos',headers:['ID','Mes','Año','Fecha'],rows:runs.map(r=>[r.id,r.month||'',r.year||'',r.created_at||''])}],'historicos_auditoria.xlsx');
   if(!run)return reply(404,{error:'No hay distribución para exportar'});
   if(path.endsWith('resultados.xlsx'))return await excel([{name:'Distribución',headers:['Flujo','Colaborador','Concepto','Tipo','Cantidad','Horas','Detalle'],rows:(run.assignments||[]).map(a=>[a.stream,a.person_name,a.task_label,a.task_kind,a.qty,a.hours,a.meta])},{name:'Alertas',headers:['Número','Alerta'],rows:(run.alerts||[]).map((a,i)=>[i+1,a])}],'distribucion_auditoria.xlsx');
   if(path.endsWith('seguimiento.xlsx'))return await excel([{name:'Seguimiento',headers:['Fecha','Colaborador','Flujo','Tipo','Cantidad','Horas','Notas'],rows:(await rr('tracking')).filter(x=>+x.run_id===rid).map(x=>[x.entry_date,x.person_name,x.stream,x.metric_type,x.qty,x.hours,x.notes])}],'seguimiento_auditoria.xlsx');
 }
 return reply(404,{ok:false,error:'Ruta no implementada'});
 }catch(err){console.error('Hub API:',err.message);return reply(err.status&&err.status>=400&&err.status<500?err.status:500,{ok:false,error:err.status>=500?'Error del servidor. Revisa Netlify Functions.':err.message})}
};
