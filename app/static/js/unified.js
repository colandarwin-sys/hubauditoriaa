const AUD_MENU = [
  {key:'expedientes', title:'Expedientes pendientes', icon:'▤', route:'/expedientes/index.html', views:[['Resumen','resumen'],['Evolución','evolucion'],['Antigüedad','antiguedad'],['Por auditor','auditor'],['Expedientes','expedientes'],['Histórico de cargas','historico']]},
  {key:'tarifarios', title:'Gestión de tarifarios', icon:'↗', route:'/tarifarios/index.html', views:[['Directorio','Directorio'],['Comparador cruzado','Comparador cruzado'],['Matriz catálogo','Matriz catálogo'],['Tarifas','Tarifas'],['Histórico','Histórico'],['Actualizar tarifario','Actualizar tarifario']]},
  {key:'distribucion', title:'Distribución de tareas', icon:'▦', route:'/operacion.html', views:[['Operación mensual','Operación mensual'],['Resultados','Resultados'],['Seguimiento operativo','Seguimiento operativo'],['Dashboard','Dashboard'],['Históricos','Históricos'],['Perfiles del equipo','Perfiles del equipo'],['Configuración','Configuración']]}
];
const DIST_ROUTES=['operacion','resultados','seguimiento','dashboard','historicos','perfiles','configuracion'];
const DIST_LABELS=['Operación mensual','Resultados','Seguimiento operativo','Dashboard','Históricos','Perfiles del equipo','Configuración'];
let audUser=null;
const audClone=o=>JSON.parse(JSON.stringify(o));
function audDefaultAccess(role='coordinador'){
  const access={home:true,users:role==='administrador',modules:{expedientes:{enabled:true,views:{resumen:true,evolucion:true,antiguedad:true,auditor:true,expedientes:true,historico:true}},tarifarios:{enabled:true,views:{'Directorio':true,'Comparador cruzado':true,'Matriz catálogo':true,'Tarifas':true,'Histórico':true,'Actualizar tarifario':true}},distribucion:{enabled:true,views:{'Operación mensual':true,'Resultados':true,'Seguimiento operativo':true,'Dashboard':true,'Históricos':true,'Perfiles del equipo':true,'Configuración':true}}}};
  if(role==='administrador'){
    access.users=true;
    Object.values(access.modules).forEach(m=>{m.enabled=true;Object.keys(m.views).forEach(k=>m.views[k]=true)});
  }
  return access;
}
function audAccess(){return audUser?.access||audDefaultAccess(audUser?.role||'coordinador')}
async function audRefreshSession(redirectOnFail=true){try{const r=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});if(r.ok){const j=await r.json();if(j.ok&&j.user){audUser=j.user;try{sessionStorage.setItem('aud_cached_user',JSON.stringify(j.user));}catch(e){}return audUser;}}}catch(e){}try{sessionStorage.removeItem('aud_cached_user');}catch(e){}if(redirectOnFail)location.href='/login.html';return null;}
async function audLoadUser(){try{const cached=sessionStorage.getItem('aud_cached_user');if(cached){audUser=JSON.parse(cached);audRefreshSession(false).then(fresh=>{if(fresh)audUser=fresh;});return audUser;}}catch(e){}return await audRefreshSession(true);}
function audUrl(moduleKey,choice){if(moduleKey==='expedientes')return '/expedientes/index.html#'+choice;if(moduleKey==='tarifarios')return '/tarifarios/index.html#'+encodeURIComponent(choice);return '/'+(DIST_ROUTES[DIST_LABELS.indexOf(choice)]||'operacion')+'.html';}
function audModuleAllowed(key){return !!audAccess().modules?.[key]?.enabled}
function audViewAllowed(key,view){return !!audAccess().modules?.[key]?.views?.[view]}
function audVisibleMenu(){return AUD_MENU.filter(g=>audModuleAllowed(g.key)).map(g=>({...g,views:g.views.filter(v=>audViewAllowed(g.key,v[1]))}))}
function audActiveSectionKey(){const p=location.pathname;if(p==='/'||p==='/inicio.html')return 'home';if(p.startsWith('/expedientes/'))return 'expedientes';if(p.startsWith('/tarifarios/'))return 'tarifarios';if(p==='/usuarios.html')return 'usuarios';return 'distribucion';}
function audCurrentViewKey(moduleKey){if(moduleKey==='expedientes'){const raw=location.hash.slice(1)||'resumen';return raw==='auditores'?'auditor':raw;}if(moduleKey==='tarifarios'){return decodeURIComponent(location.hash.slice(1))||'Directorio';}if(moduleKey==='distribucion'){return DIST_LABELS[DIST_ROUTES.indexOf(location.pathname.slice(1).replace('.html',''))]||'Operación mensual';}return '';}
function audFirstAllowedView(moduleKey){const group=AUD_MENU.find(g=>g.key===moduleKey);if(!group)return null;const item=group.views.find(v=>audViewAllowed(moduleKey,v[1]));return item?item[1]:null;}
function audEnsureAllowed(){const section=audActiveSectionKey();if(section==='home'){if(audAccess().home===false){const first=AUD_MENU.find(g=>audModuleAllowed(g.key)&&audFirstAllowedView(g.key));location.href=first?audUrl(first.key,audFirstAllowedView(first.key)):'/login.html';return false;}return true;}if(section==='usuarios'){if(!(audUser?.role==='administrador'||audAccess().users)){location.href='/inicio.html';return false;}return true;}if(section==='expedientes'||section==='tarifarios'||section==='distribucion'){
  if(!audModuleAllowed(section)){location.href='/inicio.html';return false;}
  const current=audCurrentViewKey(section);
  if(!audViewAllowed(section,current)){
    const first=audFirstAllowedView(section);
    if(first){location.href=audUrl(section, section==='distribucion'?first:first);}
    else{location.href='/inicio.html';}
    return false;
  }
}
return true;}
function audHubLogo(){return `<svg viewBox="0 0 72 72" aria-hidden="true" focusable="false"><rect x="5" y="5" width="62" height="62" rx="18" fill="#09120c" stroke="rgba(205,255,0,.18)"/><path d="M46 21.5A17.5 17.5 0 1 0 46 50.5" fill="none" stroke="#cdff00" stroke-width="8.5" stroke-linecap="round"/><circle cx="49" cy="36" r="4.9" fill="#cdff00"/></svg>`}
function audMarkup(){const active=audActiveSectionKey();const visible=audVisibleMenu();return `<aside id="aud-menu" class="aud-menu"><div class="aud-brand"><div class="aud-logo">${audHubLogo()}</div><div><small>PORTAL INTEGRADO</small><strong>Hub Auditoría</strong><span>Control operativo y analítico</span></div></div><div class="aud-navtitle">NAVEGACIÓN</div><a class="aud-global ${location.pathname==='/inicio.html'?'selected':''}" href="/inicio.html">Vista general</a>${visible.map(group=>`<div class="aud-group ${group.key===active?'open':''}"><button type="button" class="aud-group-btn" data-group="${group.key}"><span>${group.icon} &nbsp; ${group.title}</span><span>⌄</span></button><div class="aud-sub">${group.views.map(([label,id])=>`<a data-module="${group.key}" data-choice="${id}" href="${audUrl(group.key,id)}">${label}</a>`).join('')}</div></div>`).join('')}<a class="aud-global aud-users-link ${(active==='usuarios')?'selected':''}" href="/usuarios.html" style="display:${(audUser?.role==='administrador'||audAccess().users)?'block':'none'}">⚙ &nbsp; Gestión de usuarios</a><div class="aud-footer"><div class="aud-author"><label class="aud-photo-picker" title="Actualizar foto de perfil"><span class="aud-avatar" id="aud-avatar">👤</span><span class="aud-edit-avatar">✎</span><input type="file" accept="image/png,image/jpeg,image/webp" id="aud-photo-file" hidden></label><span id="aud-username" class="aud-username"></span><div class="aud-author-text"><small>Herramienta diseñada por Darwen Colán</small></div></div><button type="button" id="aud-logout">Cerrar sesión</button></div></aside>`}
async function audSetup(){if(document.getElementById('aud-menu'))return;if(!audUser){const loaded=await audLoadUser();if(!loaded)return;}if(!audEnsureAllowed())return;document.body.insertAdjacentHTML('afterbegin',audMarkup());document.querySelectorAll('.aud-group-btn').forEach(b=>b.addEventListener('click',()=>b.parentElement.classList.toggle('open')));const l=document.getElementById('aud-logout');if(l)l.onclick=async()=>{await fetch('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});location.href='/login.html'};if(audUser){const n=document.getElementById('aud-username');if(n)n.textContent=audUser.display_name||audUser.username||'';}audHighlight();audInitAvatar();audPrimeNavigation();}
function audInitAvatar(){
  const inp=document.getElementById('aud-photo-file'),avatar=document.getElementById('aud-avatar');
  if(!inp||!avatar)return;
  const key='audit_avatar_'+(audUser?.username||'user');
  const show=(data)=>{avatar.style.backgroundImage=data?'url('+JSON.stringify(data)+')':'';avatar.textContent=data?'':'👤';};
  const persist=(data)=>{
    try{localStorage.setItem(key,data);show(data);}catch(e){alert('No se pudo guardar la foto en este navegador.');}
  };
  const downscaleImage=(file)=>new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('No se pudo leer la imagen.'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('La imagen no es válida.'));
      img.onload=()=>{
        const maxSide=520;
        const scale=Math.min(1,maxSide/Math.max(img.width,img.height));
        const w=Math.max(1,Math.round(img.width*scale));
        const h=Math.max(1,Math.round(img.height*scale));
        const canvas=document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        const mime=file.type==='image/png'?'image/png':'image/jpeg';
        const quality=mime==='image/png'?undefined:0.84;
        resolve(canvas.toDataURL(mime,quality));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
  try{show(localStorage.getItem(key));}catch(e){}
  inp.addEventListener('change',async()=>{
    const file=inp.files&&inp.files[0]; if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){alert('Selecciona una imagen JPG, PNG o WebP.'); inp.value=''; return;}
    if(file.size>8*1024*1024){alert('La imagen supera el límite de 8 MB.'); inp.value=''; return;}
    try{
      const data=await downscaleImage(file);
      persist(data);
    }catch(e){
      alert(e.message||'No se pudo procesar la imagen.');
    }
    inp.value='';
  });
}
function audHighlight(){const active=audActiveSectionKey();const current=audCurrentViewKey(active);document.querySelectorAll('.aud-group').forEach(g=>{if(g.querySelector(`[data-module="${active}"]`))g.classList.add('open')});document.querySelectorAll('#aud-menu .aud-sub a').forEach(a=>{const ok=a.dataset.module===active&&(a.dataset.choice===current||(active==='expedientes'&&current==='auditor'&&a.dataset.choice==='auditor'));a.classList.toggle('selected',ok)});document.querySelectorAll('#aud-menu .aud-global').forEach(a=>{if(a.getAttribute('href')==='/inicio.html')a.classList.toggle('selected',location.pathname==='/inicio.html');if(a.getAttribute('href')==='/usuarios.html')a.classList.toggle('selected',location.pathname==='/usuarios.html');});}

function audPrefetch(url){
  try{
    if(!url)return;
    const u=new URL(url,location.origin);
    if(u.origin!==location.origin)return;
    // Hash changes within a module do not need document loading.
    if(u.pathname===location.pathname)return;
    if(!(/\.html$/.test(u.pathname)))return;
    const key=u.pathname;
    if(document.querySelector('link[data-aud-prefetch="'+key+'"]'))return;
    const link=document.createElement('link');
    link.rel='prefetch';
    link.href=key;
    link.dataset.audPrefetch=key;
    document.head.appendChild(link);
  }catch(e){}
}
function audPrimeNavigation(){
  // Preload only on user intent, never all modules simultaneously.
  document.addEventListener('pointerover',e=>{
    const a=e.target.closest('a[href]');
    if(a)audPrefetch(a.getAttribute('href'));
  },{passive:true});
  document.addEventListener('focusin',e=>{
    const a=e.target.closest('a[href]');
    if(a)audPrefetch(a.getAttribute('href'));
  });
  document.addEventListener('touchstart',e=>{
    const a=e.target.closest('a[href]');
    if(a)audPrefetch(a.getAttribute('href'));
  },{passive:true});
}

window.audLoadUser=audLoadUser;window.audSetup=audSetup;window.audHighlight=audHighlight;window.audUser=audUser;window.audDefaultAccess=audDefaultAccess;window.audAccess=audAccess;window.audViewAllowed=audViewAllowed;window.audModuleAllowed=audModuleAllowed;window.audFirstAllowedView=audFirstAllowedView;window.AUD_MENU=AUD_MENU;
