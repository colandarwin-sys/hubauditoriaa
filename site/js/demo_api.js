(()=>{'use strict';
const originalFetch=window.fetch.bind(window);
const KEY='hub_demo_v34_';
const load=(k,f)=>{try{return JSON.parse(localStorage.getItem(KEY+k))??f}catch{return f}};
const put=(k,x)=>{localStorage.setItem(KEY+k,JSON.stringify(x));return x};
const id=()=>Date.now()+Math.floor(Math.random()*1000);
const user={id:1,username:'demo',display_name:'Usuario de demostración',role:'administrador'};
let demoLogged= sessionStorage.getItem(KEY+'open')==='1';
const response=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'Content-Type':'application/json'}});
const date=()=>new Date().toISOString();
function list(k){return load(k,[])}
function edit(k,payload,idVal){const entries=list(k),i=entries.findIndex(x=>String(x.id)===String(idVal));const entry={...(i>=0?entries[i]:{}),...payload,id:idVal||id(),created_at:date(),created_by_name:'Demostración'};if(i>=0)entries[i]=entry;else entries.unshift(entry);put(k,entries);return entry;}
function queryRun(r){if(!r)return null;return {...r,assignments:r.assignments||[]}}
function deny(){return response({ok:false,error:'El entorno de demostración no dispone de servidor. Esta operación requiere Supabase.'},501)}
window.fetch=async(input,options={})=>{
 const u=new URL(typeof input==='string'?input:input.url,location.href);
 if(u.origin!==location.origin||!u.pathname.startsWith('/api/'))return originalFetch(input,options);
 const p=u.pathname,m=(options.method||'GET').toUpperCase();
 let d={};try{d=JSON.parse(options.body||'{}')}catch{}
 if(p==='/api/login'&&m==='POST'){demoLogged=true;sessionStorage.setItem(KEY+'open','1');return response({ok:true,user})}
 if(p==='/api/logout'){demoLogged=false;sessionStorage.removeItem(KEY+'open');return response({ok:true})}
 if(p==='/api/session')return response({ok:demoLogged,user:demoLogged?user:null});
 if(!demoLogged)return response({ok:false,error:'Accede a la vista de prueba.'},401);
 if(p==='/api/settings'){if(m==='POST')put('settings',d.settings||{});return response({ok:true,settings:load('settings',{})})}
 if(p==='/api/users'){if(m==='POST'){edit('users',d);return response({ok:true})}return response({ok:true,users:[{...user,active:true,access:null,created_at:date()},...list('users')]})}
 if(p.startsWith('/api/users/')){const target=p.split('/').pop();if(m==='DELETE'){put('users',list('users').map(x=>String(x.id)===target?{...x,active:false}:x));return response({ok:true})}if(m==='POST'){edit('users',d,target);return response({ok:true})}}
 if(p==='/api/profiles'){if(m==='POST'){edit('profiles',d,d.id);return response({ok:true})}return response({ok:true,profiles:list('profiles')})}
 if(p.startsWith('/api/profiles/')&&m==='DELETE'){const target=p.split('/').pop();put('profiles',list('profiles').map(x=>String(x.id)===target?{...x,active:false}:x));return response({ok:true})}
 if(p==='/api/schedules'){if(m==='POST'){const x=edit('schedules',d);return response({ok:true,id:x.id})}return response({ok:true,schedules:list('schedules')})}
 if(p.startsWith('/api/schedules/')){const x=list('schedules').find(s=>String(s.id)===p.split('/').pop());return response({ok:!!x,schedule:x||null})}
 if(p==='/api/runs'){if(m==='POST'){const x=edit('runs',d);return response({ok:true,id:x.id})}return response({ok:true,runs:list('runs')})}
 if(p.startsWith('/api/runs/')){const x=p.endsWith('/latest')?list('runs')[0]:list('runs').find(s=>String(s.id)===p.split('/').pop());return response({ok:true,run:queryRun(x)})}
 if(p==='/api/tracking'){const rid=u.searchParams.get('run_id')||String(list('runs')[0]?.id||'');if(m==='POST'){edit('tracking',d);return response({ok:true})}const run=list('runs').find(x=>String(x.id)===rid);return response({ok:true,run:run||null,entries:list('tracking').filter(x=>String(x.run_id)===rid),plan:(run?.assignments||[]).map(x=>({...x}))})}
 if(p.startsWith('/api/tracking/')&&m==='DELETE'){put('tracking',list('tracking').filter(x=>String(x.id)!==p.split('/').pop()));return response({ok:true})}
 if(p==='/api/dashboard'){const runs=list('runs'),schedules=list('schedules');const recent=runs.slice(0,12);return response({ok:true,counts:{schedules:schedules.length,runs:runs.length,users:list('users').length+1},recent,latest_assignments:runs[0]?.assignments||[]})}
 if(p==='/api/audit')return response({ok:true,log:[]});
 if(p==='/api/tarifarios/import')return response({ok:false,error:'La importación permanente de tarifarios se habilitará al conectar Supabase. Puedes probar la lectura y validación de Excel.'},501);
 return deny();
};
// All pages carry an explicit warning to prevent confusing local prototype with production.
document.addEventListener('DOMContentLoaded',()=>{
 const mark=document.createElement('div');mark.setAttribute('role','status');
 mark.style.cssText='position:fixed;right:14px;bottom:13px;z-index:999999;background:#08120a;color:#cdff00;border:1px solid #cdff00;border-radius:15px;padding:9px 14px;font:700 11px Manrope,Arial,sans-serif;box-shadow:0 3px 16px #0004;max-width:min(400px,90vw)';
 mark.textContent='V34 · VISTA DE PRUEBA · datos guardados solo en este navegador · NO USAR DATOS REALES';document.body.appendChild(mark);
});
})();