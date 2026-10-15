
(async()=>{const u=await audLoadUser();if(!u)return; audSetup();
function init(){
  const name=String(u.username||u.login||u.display_name||'ctejada').toLowerCase();
  const input=document.getElementById('loginUser');
  if(input) input.value=['dcolan','ctejada','avillanueva'].includes(name)?name:'ctejada';
  const form=document.getElementById('loginForm');
  if(form) form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
  const aliases={auditor:'auditores'};
  let choice=location.hash.slice(1)||'resumen';
  if(choice==='inicio') choice='resumen';
  const internal=aliases[choice]||choice;
  const btn=document.querySelector('.nav-item[data-view="'+internal+'"]');
  if(btn) btn.click();
  audHighlight();
  document.body.classList.remove('aud-booting');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
window.addEventListener('hashchange',()=>{const aliases={auditor:'auditores'};let choice=location.hash.slice(1)||'resumen';if(choice==='inicio')choice='resumen';const b=document.querySelector('.nav-item[data-view="'+(aliases[choice]||choice)+'"]');if(b)b.click();audHighlight()});
document.querySelectorAll('#aud-menu .aud-sub a').forEach(a=>{if(a.href.includes('/expedientes/index.html'))a.addEventListener('click',e=>{e.preventDefault();location.hash=a.dataset.choice;});});
})();
