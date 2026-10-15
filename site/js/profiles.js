let profiles=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const grid=document.getElementById('profilesGrid');
const modal=document.getElementById('profileModal');
const form=document.getElementById('profileForm');
const newBtn=document.getElementById('newProfile');
const closeBtn=document.getElementById('closeProfile');

async function loadProfilesPage(){
  try{
    const j=await api('/api/profiles');
    profiles=j.profiles||[];
    grid.innerHTML=profiles.map(p=>`<div class="profile-row ${p.active?'':'inactive'}">
      <div><b>${esc(p.display_name)}</b><small>${esc(p.strength||'Sin observación')}</small></div>
      <span class="status ${p.kind==='Revisar'?'warn':''}">${esc(p.kind)}</span>
      <span>${esc(p.mode)}</span>
      <span>${p.fact?'Facturación':''}${p.fact&&p.concurrence?' · ':''}${p.concurrence?'Concurrencia':''}</span>
      <div class="actions">
        <button class="btn small" type="button" data-edit="${p.id}">Editar</button>
        ${p.active?`<button class="btn small" type="button" data-del="${p.id}">Desactivar</button>`:`<button class="btn small" type="button" data-reactivate="${p.id}">Reactivar</button>`}
      </div>
    </div>`).join('')||'<div class="empty">Sin perfiles registrados.</div>';

    document.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openProfile(Number(b.dataset.edit))));
    document.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{
      if(!confirm('¿Desactivar este perfil? Ya no se utilizará automáticamente en nuevas distribuciones.')) return;
      try{await api('/api/profiles/'+b.dataset.del,{method:'DELETE'});toast('Perfil desactivado');await loadProfilesPage()}catch(e){toast(e.message,true)}
    }));
    document.querySelectorAll('[data-reactivate]').forEach(b=>b.addEventListener('click',async()=>{
      const p=profiles.find(x=>x.id===Number(b.dataset.reactivate));
      if(!p)return;
      try{
        await api('/api/profiles',{method:'POST',body:JSON.stringify({...p,id:p.id,active:true})});
        toast('Perfil reactivado');await loadProfilesPage();
      }catch(e){toast(e.message,true)}
    }));
  }catch(e){grid.innerHTML=`<div class="empty">${esc(e.message)}</div>`;}
}

function openProfile(id=0){
  const p=profiles.find(x=>x.id===id)||{id:'',display_name:'',kind:'Revisar',mode:'Presencial',strength:'',fact:false,concurrence:true,active:true};
  form.elements.id.value=p.id||'';
  form.elements.display_name.value=p.display_name||'';
  form.elements.kind.value=p.kind||'Revisar';
  form.elements.mode.value=p.mode||'Presencial';
  form.elements.strength.value=p.strength||'';
  form.elements.fact.checked=!!p.fact;
  form.elements.concurrence.checked=p.concurrence!==0;
  const title=modal.querySelector('.modal-head h3'); if(title)title.textContent=p.id?'Editar perfil':'Nuevo perfil';
  modal.classList.remove('hidden');
  setTimeout(()=>form.elements.display_name.focus(),50);
}

newBtn.addEventListener('click',()=>openProfile());
closeBtn.addEventListener('click',()=>modal.classList.add('hidden'));
modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});
form.addEventListener('submit',async e=>{
  e.preventDefault();
  const f=e.currentTarget;
  const payload={
    id:Number(f.elements.id.value)||null,
    display_name:f.elements.display_name.value.trim(),
    kind:f.elements.kind.value,
    mode:f.elements.mode.value,
    strength:f.elements.strength.value.trim(),
    fact:f.elements.fact.checked,
    concurrence:f.elements.concurrence.checked,
    active:true
  };
  if(!payload.display_name){toast('El nombre es obligatorio',true);return;}
  const submit=f.querySelector('button[type="submit"],button.btn.primary');
  if(submit){submit.disabled=true;submit.textContent='Guardando…'}
  try{
    await api('/api/profiles',{method:'POST',body:JSON.stringify(payload)});
    modal.classList.add('hidden');
    toast(payload.id?'Perfil actualizado':'Perfil creado');
    await loadProfilesPage();
  }catch(err){toast(err.message,true)}finally{if(submit){submit.disabled=false;submit.textContent='Guardar perfil'}}
});
loadProfilesPage();
