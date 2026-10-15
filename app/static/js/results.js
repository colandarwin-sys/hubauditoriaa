const qs=new URLSearchParams(location.search);
const rid=qs.get('run_id');
const fmt=(v,n=1)=>Number(v||0).toFixed(n);
const norm=s=>(s??'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();

function personAggregate(stream,name,arr,team,workDays){
  const person=team.find(p=>norm(p.name)===norm(name));
  const hours=arr.reduce((s,a)=>s+Number(a.hours||0),0);
  const factQty=arr.filter(a=>norm(a.task_kind).includes('FACTUR')).reduce((s,a)=>s+Number(a.qty||0),0);
  const concQty=arr.filter(a=>norm(a.task_kind).includes('CONCURRENCIA')).reduce((s,a)=>s+Number(a.qty||0),0);
  const totalQty=arr.reduce((s,a)=>s+Number(a.qty||0),0);
  const available=person?Number(person.hours||0):null;
  const load=available&&available>0?hours/available*100:null;
  const free=available!==null?Math.max(0,(available-hours)/Math.max(1,workDays)):null;
  return {name,person,arr,hours,factQty,concQty,totalQty,available,load,free};
}
function loadClass(load){
  if(load===null)return 'neutral';
  if(load>=95)return 'danger';
  if(load>=88)return 'warn';
  if(load>=70)return 'good';
  return 'low';
}
function equityLabel(gap){
  gap=Number(gap||0);
  if(gap<=10)return ['Equilibrada','good'];
  if(gap<=20)return ['Revisar equilibrio','warn'];
  return ['Desbalance relevante','danger'];
}
function taskRows(arr){
  return arr.map(a=>`<div class="result-task-row">
    <div class="task-main"><b>${a.task_label}</b><small>${a.meta||''}</small></div>
    <div><span class="result-type ${norm(a.task_kind).includes('CONCURRENCIA')?'conc':'fact'}">${a.task_kind}</span></div>
    <div class="task-num"><b>${fmt(a.qty,0)}</b><small>${norm(a.task_kind).includes('FACTUR')?'cuentas':'revisiones'}</small></div>
    <div class="task-num"><b>${fmt(a.hours)} h</b><small>horas</small></div>
  </div>`).join('');
}
function personCard(p,stream){
  const isMedical=stream==='Médica';
  const qty=isMedical?p.factQty:p.concQty;
  const qtyLabel=isMedical?'Expedientes':'Revisiones mes';
  const loadText=p.load===null?'—':`${Math.round(p.load)}%`;
  const freeText=p.free===null?'—':`${fmt(p.free)} h`;
  const available=p.available===null?'—':`${fmt(p.available,0)} h`;
  return `<article class="result-person-card">
    <div class="rpc-head"><div><h4>${p.name}</h4><p>${p.person?.strength||p.person?.kind||stream}</p></div><span class="result-load ${loadClass(p.load)}">${loadText}</span></div>
    <div class="rpc-stats"><div><small>${qtyLabel}</small><b>${fmt(qty,0)}</b></div><div><small>Horas asignadas</small><b>${fmt(p.hours)} h</b></div></div>
    <div class="rpc-footer"><span>${freeText} libres/día</span><span>${available} disponibles</span></div>
  </article>`;
}
function personAccordion(p,stream,index){
  const isMedical=stream==='Médica';
  const loadText=p.load===null?'—':`${Math.round(p.load)}%`;
  const freeText=p.free===null?'—':`${fmt(p.free)} h`;
  return `<details class="result-person-detail">
    <summary>
      <div class="rpd-name"><b>${p.name}</b><small>${p.person?.strength||p.person?.kind||stream}</small></div>
      <div class="rpd-metric"><small>Carga</small><b>${loadText}</b></div>
      <div class="rpd-metric"><small>${isMedical?'Expedientes':'Revisiones'}</small><b>${fmt(isMedical?p.factQty:p.concQty,0)}</b></div>
      <div class="rpd-metric"><small>Concurrencia</small><b>${fmt(p.concQty,0)}</b></div>
      <div class="rpd-metric"><small>Libre/día</small><b>${freeText}</b></div>
      <div class="rpd-chevron">⌄</div>
    </summary>
    <div class="rpd-body">${taskRows(p.arr)}</div>
  </details>`;
}
function streamSection(stream,people,summary,workDays){
  const isMedical=stream==='Médica';
  if(!people.length)return `<section class="result-stream" data-stream-section="${isMedical?'medical':'nursing'}"><div class="empty">Sin asignaciones registradas para ${stream.toLowerCase()}.</div></section>`;
  const gap=isMedical?summary.medical_equity_gap:summary.nursing_equity_gap;
  const avg=isMedical?summary.medical_avg_load:summary.nursing_avg_load;
  const [eqLabel,eqClass]=equityLabel(gap);
  const totalHours=people.reduce((s,p)=>s+p.hours,0);
  const totalQty=people.reduce((s,p)=>s+(isMedical?p.factQty:p.concQty),0);
  const avgFree=people.filter(p=>p.free!==null).length?people.filter(p=>p.free!==null).reduce((s,p)=>s+p.free,0)/people.filter(p=>p.free!==null).length:0;
  const title=isMedical?'Auditoría médica':'Auditoría de enfermería';
  const desc=isMedical?'Facturación + concurrencia médica, respetando especialidades, horarios y reglas de compañía.':'Concurrencia de enfermería distribuida de manera independiente sobre las unidades asistenciales.';
  return `<section class="result-stream" data-stream-section="${isMedical?'medical':'nursing'}">
    <div class="result-stream-head">
      <div><span class="stream-tag ${isMedical?'medical':'nursing'}">${title}</span><h2>${title}</h2><p>${desc}</p></div>
      <div class="equity-panel ${eqClass}"><strong>${fmt(gap,0)} pp</strong><div><b>${eqLabel}</b><small>Diferencia entre el más y el menos cargado</small><div class="eq-track"><i style="width:${Math.max(8,100-Math.min(100,Number(gap||0)*3))}%"></i></div></div></div>
    </div>
    <div class="stream-kpis">
      <div><small>Horas programadas</small><b>${fmt(totalHours)} h</b></div>
      <div><small>${isMedical?'Expedientes':'Revisiones'}</small><b>${fmt(totalQty,0)}</b></div>
      <div><small>Promedio de carga</small><b>${fmt(avg,0)}%</b></div>
      <div><small>Libre promedio/día</small><b>${fmt(avgFree)} h</b></div>
    </div>
    <p class="equity-note">La equidad se evalúa por porcentaje de horas utilizadas, no por cantidad bruta de casos.</p>
    <div class="result-person-grid">${people.map(p=>personCard(p,stream)).join('')}</div>
    <div class="detail-title">Detalle por ${isMedical?'auditor':'enfermera'}</div>
    <div class="result-details">${people.map((p,i)=>personAccordion(p,stream,i)).join('')}</div>
  </section>`;
}

function applyResultFilter(value){
  document.querySelectorAll('[data-stream-section]').forEach(el=>{
    el.style.display=(value==='all'||el.dataset.streamSection===value)?'':'none';
  });
  document.querySelectorAll('[data-filter-btn]').forEach(btn=>btn.classList.toggle('active',btn.dataset.filterBtn===value));
}
async function load(){
  try{
    const j=await api(rid?'/api/runs/'+rid:'/api/runs/latest');
    const r=j.run;
    if(!r){document.getElementById('resultContent').innerHTML='<div class="empty">Aún no existe una distribución guardada.</div>';return}
    let schedule={team:[],settings:{workDays:20}};
    if(r.schedule_id){
      try{const sj=await api('/api/schedules/'+r.schedule_id);schedule=sj.schedule||schedule}catch{}
    }
    const workDays=Number(schedule.settings?.workDays||20);
    const team=schedule.team||[];
    const s=r.summary||{};
    const assignments=r.assignments||[];
    const grouped={Médica:{},Enfermería:{}};
    for(const a of assignments){grouped[a.stream]??={};grouped[a.stream][a.person_name]??=[];grouped[a.stream][a.person_name].push(a)}
    const medPeople=Object.entries(grouped['Médica']||{}).filter(([name])=>norm(name)!=='EMPRESA').map(([name,arr])=>personAggregate('Médica',name,arr,team,workDays)).sort((a,b)=>(b.load??0)-(a.load??0));
    const nurPeople=Object.entries(grouped['Enfermería']||{}).map(([name,arr])=>personAggregate('Enfermería',name,arr,team,workDays)).sort((a,b)=>(b.load??0)-(a.load??0));
    const companyRows=Object.entries(grouped['Médica']||{}).filter(([name])=>norm(name)==='EMPRESA').flatMap(([,arr])=>arr);
    const [medLabel,medClass]=equityLabel(s.medical_equity_gap);
    const [nurLabel,nurClass]=equityLabel(s.nursing_equity_gap);
    const alerts=(r.alerts||[]).map(x=>`<div class="result-alert">⚠ ${x}</div>`).join('');
    document.getElementById('resultContent').innerHTML=`
      <div class="results-toolbar"><div><span class="result-period">${r.month||'—'} ${r.year||''}</span><small>Distribución guardada · Run #${r.id}</small></div><div class="actions"><a class="btn primary" href="/operacion.html?schedule_id=${r.schedule_id||''}&redo=1">Rehacer distribución</a><a class="btn" href="/operacion.html?new=1">Iniciar nuevo mes</a><a class="btn" href="/api/export/resultados.xlsx?run_id=${r.id}">Descargar Excel</a><a class="btn" href="/seguimiento.html?run_id=${r.id}">Seguimiento operativo</a><a class="btn" href="/historicos.html">Históricos</a></div></div>
      <div class="result-filterbar"><span>Mostrar</span><button class="filter-btn active" data-filter-btn="all">Todo</button><button class="filter-btn" data-filter-btn="medical">Auditoría médica</button><button class="filter-btn" data-filter-btn="nursing">Enfermería</button><button class="btn small" id="collapseAll">Cerrar detalles</button></div>
      ${alerts?`<div class="result-alerts">${alerts}</div>`:''}
      <div class="results-overview">
        <div class="overview-card"><small>Equidad médica</small><b class="${medClass}">${fmt(s.medical_equity_gap,0)} pp</b><span>${medLabel}</span></div>
        <div class="overview-card"><small>Equidad enfermería</small><b class="${nurClass}">${fmt(s.nursing_equity_gap,0)} pp</b><span>${nurLabel}</span></div>
        <div class="overview-card"><small>Médicos activos</small><b>${medPeople.length}</b><span>Reparto independiente</span></div>
        <div class="overview-card"><small>Enfermería activa</small><b>${nurPeople.length}</b><span>Concurrencia enfermería</span></div>
      </div>
      ${streamSection('Médica',medPeople,s,workDays)}
      ${companyRows.length?`<section class="company-block" data-stream-section="medical"><div><span>Asignación fija</span><h3>EMPRESA · Rímac y Sanitas hospitalarias</h3></div><div class="company-tasks">${taskRows(companyRows)}</div></section>`:''}
      ${streamSection('Enfermería',nurPeople,s,workDays)}
    `;
    document.querySelectorAll('[data-filter-btn]').forEach(btn=>btn.onclick=()=>applyResultFilter(btn.dataset.filterBtn));
    const collapse=document.getElementById('collapseAll');if(collapse)collapse.onclick=()=>document.querySelectorAll('.result-person-detail[open]').forEach(d=>d.removeAttribute('open'));
    applyResultFilter('all');
  }catch(e){document.getElementById('resultContent').innerHTML=`<div class="alert warn">${e.message}</div>`}
}
load();
