(() => {
  const seed = Array.isArray(window.SEED_SNAPSHOTS) ? window.SEED_SNAPSHOTS : [];
  const LS_KEY = 'expedientes_pendientes_snapshots_v1';
  const state = { view:'resumen', date:null, compare:null, auditor:'ALL', type:'ALL', age:'ALL', search:'', snapshots:[], pendingUpload:null };
  const USERS={dcolan:{role:'admin',canManageCuts:true},avillanueva:{role:'viewer',canManageCuts:false},ctejada:{role:'viewer',canManageCuts:false}};
  const SESSION_KEY='expedientes_usuario_activo_v1';
  let activeUser=null;
  const userCanManageCuts=()=>window.HUB_ACTIVE_ROLE==='administrador';
  const getLocalSnapshots = () => window.hubPendingSnapshots||[];
  const setLocalSnapshots = (rows) => {window.hubPendingSnapshots=rows};
  const isSeedDate = (date) => seed.some(s => s.date===date);
  const isLocalDate = (date) => state.snapshots.some(s=>s.date===date);
  function rebuildSnapshots(){
    const local=getLocalSnapshots();
    const seedByDate=new Map(seed.map(s=>[s.date,s]));
    const enrichedLocal=local.map(snap=>{
      const base=seedByDate.get(snap.date);
      if(!base) return snap;
      const baseMap=new Map(base.records.map(r=>[`${r.type}|${r.key}`,r]));
      return {...snap,records:(snap.records||[]).map(r=>{
        const b=baseMap.get(`${r.type}|${r.key}`);
        return b ? {...b,...r,observationItems:(r.observationItems?.length?r.observationItems:b.observationItems)||[],milestones:(r.milestones?.length?r.milestones:b.milestones)||[]} : r;
      })};
    });
    const map=new Map(); [...seed,...enrichedLocal].forEach(s=>map.set(s.date,s)); state.snapshots=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
  const $ = (s) => document.querySelector(s);
  const esc = (v='') => String(v ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtMoney = n => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',maximumFractionDigits:0}).format(Number(n)||0);
  const fmtMoney2 = n => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
  const fmtNum = n => new Intl.NumberFormat('es-PE').format(Number(n)||0);
  const fmtPct = n => `${(Number(n)||0).toFixed(1)}%`;
  const fmtDate = iso => iso ? new Date(iso+'T00:00:00').toLocaleDateString('es-PE') : '—';
  const norm = v => String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  const sum = (arr,fn) => arr.reduce((a,x)=>a+(fn?Number(fn(x)||0):Number(x||0)),0);
  const mean = arr => arr.length ? sum(arr)/arr.length : 0;
  const pctDelta = (cur,prev) => prev ? ((cur-prev)/Math.abs(prev))*100 : null;

  function loadSnapshots(){
    rebuildSnapshots();
    state.date=state.snapshots.at(-1)?.date||null;
    state.compare=state.snapshots.at(-2)?.date||null;
  }

  function currentSnapshot(date=state.date){ return state.snapshots.find(s=>s.date===date); }
  function filteredRecords(snapshot=currentSnapshot()){
    if(!snapshot) return [];
    const useSearch = state.view==='expedientes';
    const q=useSearch?norm(state.search):'';
    return snapshot.records.filter(r => {
      if(state.auditor!=='ALL' && r.auditor!==state.auditor) return false;
      if(state.type!=='ALL' && r.type!==state.type) return false;
      if(useSearch && state.age!=='ALL' && ageBucket(r.days)!==state.age) return false;
      if(q){ const hay=norm([r.account,r.attention,r.invoice,r.patient,r.company,r.auditor,r.type].join(' ')); if(!hay.includes(q)) return false; }
      return true;
    });
  }
  function comparableRecords(snapshot){
    if(!snapshot) return [];
    return snapshot.records.filter(r => {
      if(state.auditor!=='ALL' && r.auditor!==state.auditor) return false;
      if(state.type!=='ALL' && r.type!==state.type) return false;
      return true;
    });
  }
  function metrics(records){
    const validDays=records.map(r=>r.days).filter(v=>Number.isFinite(v) && v>=0);
    return { count:records.length, amount:sum(records,r=>r.amount), avgDays:mean(validDays), over30:records.filter(r=>r.days>30).length, over60:records.filter(r=>r.days>60).length, over90:records.filter(r=>r.days>90).length, agedAmount:sum(records.filter(r=>r.days>30),r=>r.amount) };
  }
  function groupBy(records,key){ const m={}; records.forEach(r=>{ const k=r[key]||'Sin dato'; (m[k]??=[]).push(r); }); return m; }
  function ageBucket(d){ if(!Number.isFinite(d)||d<0)return 'Sin fecha'; if(d<=15)return '0–15 días'; if(d<=30)return '16–30 días'; if(d<=60)return '31–60 días'; if(d<=90)return '61–90 días'; return '>90 días'; }
  function quarterFromDate(iso){ if(!iso)return 'Sin fecha'; const m=Number(iso.slice(5,7)); return `T${Math.floor((m-1)/3)+1}`; }

  function populateControls(){
    const dateSel=$('#dateFilter'), cmpSel=$('#compareFilter');
    dateSel.innerHTML=state.snapshots.map(s=>`<option value="${s.date}" ${s.date===state.date?'selected':''}>${esc(s.label||fmtDate(s.date))}</option>`).join('');
    cmpSel.innerHTML='<option value="">Sin comparación</option>'+state.snapshots.filter(s=>s.date!==state.date).map(s=>`<option value="${s.date}" ${s.date===state.compare?'selected':''}>${esc(s.label||fmtDate(s.date))}</option>`).join('');
    const snap=currentSnapshot();
    const auditors=[...new Set((snap?.records||[]).map(r=>r.auditor||'Sin asignar'))].sort((a,b)=>a.localeCompare(b));
    $('#auditorFilter').innerHTML='<option value="ALL">Todos</option>'+auditors.map(a=>`<option value="${esc(a)}" ${a===state.auditor?'selected':''}>${esc(a)}</option>`).join('');
    const types=[...new Set((snap?.records||[]).map(r=>r.type))].sort();
    $('#typeFilter').innerHTML='<option value="ALL">Todos</option>'+types.map(a=>`<option value="${esc(a)}" ${a===state.type?'selected':''}>${esc(a)}</option>`).join('');
    $('#searchFilter').value=state.search;
    $('#ageFilter').value=state.age;
  }

  function updateDeleteButton(){
    const btn=$('#deleteCutBtn');
    const upload=$('#uploadBtn');
    if(!btn||!upload) return;
    const canManage=userCanManageCuts();
    upload.classList.toggle('permission-hidden',!canManage);
    btn.classList.toggle('permission-hidden',!canManage);
    const local = isLocalDate(state.date);
    btn.disabled=!canManage||!local;
    btn.title=!canManage?'Tu usuario no tiene permiso para eliminar cortes':(local?'Eliminar el corte actual del histórico local':'Solo se pueden eliminar cortes cargados localmente');
  }

  function deltaHtml(cur,prev,increaseBad=true){
    if(prev==null) return '<div class="delta neutral">Sin comparación</div>';
    const d=pctDelta(cur,prev); if(d===null)return '<div class="delta neutral">Sin base comparable</div>';
    const arrow=d>0?'↑':d<0?'↓':'→'; const good=increaseBad ? d<0 : d>0; const cls=d===0?'neutral':good?'good':'bad';
    return `<div class="delta ${d>0?'up':d<0?'down':''} ${cls}">${arrow} ${Math.abs(d).toFixed(1)}% vs. corte comparado</div>`;
  }

  function svgLine(series, valueKey='amount', showValues=false){
    const W=720,H=260,p={l:58,r:24,t:showValues?34:20,b:38}; const vals=series.map(x=>x[valueKey]); const max=Math.max(...vals,1); const min=0;
    const x=i=>p.l+(series.length===1?0:(W-p.l-p.r)*i/(series.length-1)); const y=v=>p.t+(H-p.t-p.b)*(1-(v-min)/(max-min||1));
    const pts=series.map((d,i)=>`${x(i)},${y(d[valueKey])}`).join(' ');
    const ticks=[0,.25,.5,.75,1].map(t=>{const v=max*t,yy=y(v);return `<line x1="${p.l}" y1="${yy}" x2="${W-p.r}" y2="${yy}" class="gridline"/><text x="${p.l-8}" y="${yy+3}" text-anchor="end" class="axis">${valueKey==='amount'?compactMoney(v):fmtNum(v)}</text>`}).join('');
    const labels=series.map((d,i)=>`<text x="${x(i)}" y="${H-10}" text-anchor="middle" class="axis">${fmtDate(d.date).slice(0,5)}</text>`).join('');
    const circles=series.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d[valueKey])}" r="4" class="point"><title>${fmtDate(d.date)} · ${valueKey==='amount'?fmtMoney2(d[valueKey]):fmtNum(d[valueKey])}</title></circle>`).join('');
    const values=showValues?series.map((d,i)=>{const raw=d[valueKey];const label=valueKey==='amount'?fmtMoney2(raw):fmtNum(raw);const yy=Math.max(13,y(raw)-11);return `<g class="pdf-value-label"><rect x="${x(i)-48}" y="${yy-11}" width="96" height="17" rx="6"></rect><text x="${x(i)}" y="${yy+1}" text-anchor="middle">${esc(label)}</text></g>`}).join(''):'';
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${ticks}<polyline points="${pts}" class="line-main"/>${circles}${values}${labels}</svg>`;
  }
  function compactMoney(v){ const n=Number(v)||0; return n>=1e6?`S/${(n/1e6).toFixed(1)}M`:n>=1000?`S/${(n/1000).toFixed(0)}K`:`S/${n.toFixed(0)}`; }
  function svgBars(items, field='amount', labelField='label'){
    const W=650,H=260,p={l:34,r:15,t:18,b:50}; const max=Math.max(...items.map(x=>x[field]),1); const bw=Math.max(28,Math.min(86,(W-p.l-p.r)/Math.max(items.length,1)*.58)); const gap=(W-p.l-p.r)/Math.max(items.length,1);
    const bars=items.map((d,i)=>{ const h=(H-p.t-p.b)*(d[field]/max),x=p.l+gap*i+(gap-bw)/2,y=H-p.b-h; const lbl=String(d[labelField]||'').replace('Hospitalario','Hospital.').replace('Ambulatorio','Ambulat.'); return `<rect class="bar" data-type="${esc(d.type||'')}" x="${x}" y="${y}" width="${bw}" height="${h}" rx="6"><title>${esc(d[labelField])}: ${field==='amount'?fmtMoney2(d[field]):fmtNum(d[field])}</title></rect><text x="${x+bw/2}" y="${Math.max(y-6,12)}" text-anchor="middle" class="chart-value">${field==='amount'?compactMoney(d[field]):fmtNum(d[field])}</text><text x="${x+bw/2}" y="${H-26}" text-anchor="middle" class="chart-label">${esc(lbl)}</text>`}).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="${p.l}" y1="${H-p.b}" x2="${W-p.r}" y2="${H-p.b}" class="gridline"/>${bars}</svg>`;
  }

  function executiveAnalysis(curRecords,prevRecords){
    const cur=metrics(curRecords), prev=metrics(prevRecords||[]);
    const amountDelta=prev.count?pctDelta(cur.amount,prev.amount):null;
    const countDelta=prev.count?pctDelta(cur.count,prev.count):null;
    const aged60=curRecords.filter(r=>Number.isFinite(r.days)&&r.days>60);
    const aged60Amount=sum(aged60,r=>r.amount);
    const missingDates=curRecords.filter(r=>!Number.isFinite(r.days));

    const byType=Object.entries(groupBy(curRecords,'type')).map(([type,rows])=>({type,rows,count:rows.length,amount:sum(rows,r=>r.amount)})).sort((a,b)=>b.amount-a.amount);
    const topType=byType[0];
    const prevByType=groupBy(prevRecords||[],'type');
    const typeDrivers=byType.map(x=>({type:x.type,delta:x.amount-sum(prevByType[x.type]||[],r=>r.amount)})).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    const mainDriver=typeDrivers[0];

    const byAuditor=Object.entries(groupBy(curRecords,'auditor')).map(([auditor,rows])=>({auditor,rows,count:rows.length,amount:sum(rows,r=>r.amount)})).sort((a,b)=>b.amount-a.amount);
    const topAuditor=byAuditor[0];
    const agedByAuditor=Object.entries(groupBy(aged60,'auditor')).map(([auditor,rows])=>({auditor,count:rows.length,amount:sum(rows,r=>r.amount)})).sort((a,b)=>b.amount-a.amount);
    const agedLead=agedByAuditor[0];
    const concentration=topAuditor&&cur.amount?topAuditor.amount/cur.amount:0;
    const agedShare=cur.amount?aged60Amount/cur.amount:0;

    let level='CONTROLADO';
    if((amountDelta!==null&&amountDelta>20)||agedShare>.25||cur.over90>0) level='ALTA ATENCIÓN';
    else if((amountDelta!==null&&amountDelta>5)||agedShare>.10||cur.over60>0) level='SEGUIMIENTO';

    let headline='El corte requiere lectura operativa, no solo seguimiento numérico.';
    if(amountDelta!==null){
      headline=`El importe pendiente ${amountDelta>=0?'creció':'disminuyó'} ${Math.abs(amountDelta).toFixed(1)}% frente al corte comparado.`;
    } else if(cur.count){
      headline=`El corte concentra ${fmtMoney(cur.amount)} en ${fmtNum(cur.count)} expedientes y aún no tiene una base comparativa activa.`;
    }

    const signals=[];
    if(mainDriver) signals.push(`${mainDriver.type} es el principal impulsor de la variación por importe (${mainDriver.delta>=0?'+':''}${fmtMoney(mainDriver.delta)} frente al comparador).`);
    if(topType) signals.push(`${topType.type} concentra ${cur.amount?fmtPct(topType.amount/cur.amount*100):'0.0%'} del importe pendiente actual.`);
    if(aged60.length) signals.push(`${aged60.length} expedientes superan 60 días y representan ${fmtMoney(aged60Amount)} (${cur.amount?fmtPct(agedShare*100):'0.0%'} del importe).`);
    else signals.push('No se observan expedientes con más de 60 días dentro de los filtros actuales.');
    if(topAuditor) signals.push(`${topAuditor.auditor} concentra ${fmtMoney(topAuditor.amount)} (${cur.amount?fmtPct(concentration*100):'0.0%'}) del importe del corte.`);
    if(missingDates.length) signals.push(`${missingDates.length} expedientes no tienen una fecha utilizable para medir antigüedad, por lo que el riesgo de envejecimiento está subestimado.`);

    const actions=[];
    if(aged60.length){
      actions.push({title:'Atender cartera envejecida',text:`Priorizar los ${aged60.length} expedientes >60 días por ${fmtMoney(aged60Amount)}${agedLead?`; iniciar por ${agedLead.auditor}, que concentra ${fmtMoney(agedLead.amount)} de ese importe`:''}.`});
    }
    if(mainDriver&&mainDriver.delta>0){
      actions.push({title:'Contener el principal crecimiento',text:`Revisar los expedientes de ${mainDriver.type} que explican el mayor incremento absoluto (${fmtMoney(mainDriver.delta)}). Validar si corresponden a ingresos nuevos o a expedientes que no están rotando.`});
    }
    if(concentration>.35&&topAuditor){
      actions.push({title:'Revisar concentración de carga',text:`${topAuditor.auditor} concentra ${fmtPct(concentration*100)} del importe pendiente. Conviene contrastarlo con su volumen, antigüedad y disponibilidad antes de redistribuir.`});
    }
    if(missingDates.length){
      actions.push({title:'Corregir calidad del dato',text:`Completar la fecha de ingreso a Auditoría en ${missingDates.length} expedientes para que la priorización por antigüedad sea confiable.`});
    }
    if(!prev.count){
      actions.push({title:'Activar comparación',text:'Seleccionar un corte previo comparable para medir tendencia. Mientras tanto, la decisión debe apoyarse en antigüedad, importe y concentración por responsable.'});
    }
    if(!actions.length){
      actions.push({title:'Mantener seguimiento',text:'No se identifica una alerta dominante con los filtros actuales. Mantener revisión por antigüedad y verificar que el siguiente corte confirme la tendencia.'});
    }

    return {level,headline,signals:signals.slice(0,5),actions:actions.slice(0,4),amountDelta,countDelta,agedShare};
  }

  function renderExecutiveAnalysis(curRecords,prevRecords){
    const a=executiveAnalysis(curRecords,prevRecords);
    return `<div class="analysis-shell">
      <div class="analysis-lead"><span class="analysis-status">${esc(a.level)}</span><h4>${esc(a.headline)}</h4></div>
      <div class="analysis-columns">
        <div class="analysis-block"><span class="analysis-label">Señales para decidir</span><ul>${a.signals.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="analysis-block action-block"><span class="analysis-label">Acciones sugeridas</span><div class="action-list">${a.actions.map((x,i)=>`<div class="action-item"><b>${String(i+1).padStart(2,'0')}</b><div><strong>${esc(x.title)}</strong><p>${esc(x.text)}</p></div></div>`).join('')}</div></div>
      </div>
      <div class="analysis-footnote">Las acciones son recomendaciones operativas basadas en los datos del corte y deben validarse con el contexto del equipo antes de ejecutarse.</div>
    </div>`;
  }

  function renderInicio(){
    const snap=currentSnapshot();
    const rec=snap?.records||[];
    const m=metrics(rec);
    const prev=state.snapshots.filter(s=>s.date<state.date).at(-1);
    const pm=metrics(prev?.records||[]);
    const delta=pctDelta(m.amount,pm.amount);
    const critical=rec.filter(r=>r.days>60);
    const topType=Object.entries(groupBy(rec,'type')).map(([type,rows])=>({type,amount:sum(rows,r=>r.amount)})).sort((a,b)=>b.amount-a.amount)[0];
    return `
      <section class="landing-hero">
        <div class="hero-orbit orbit-a"></div><div class="hero-orbit orbit-b"></div><div class="hero-shape shape-a"></div>
        <div class="landing-copy">
          <div class="landing-kicker">EXPEDIENTES PENDIENTES · AUDITORÍA MÉDICA</div>
          <h2>Del pendiente<br><span>a la decisión.</span></h2>
          <p>Un espacio para entender qué está detenido, cuánto representa, desde cuándo y dónde concentrar la gestión. Cada corte se convierte en una lectura histórica y accionable.</p>
          <div class="landing-actions">
            <button class="hero-btn primary" data-go-view="resumen">Explorar el resumen <span>↗</span></button>
            <button class="hero-btn ghost" data-go-view="historico">Ver histórico de cortes</button>
          </div>
          <div class="landing-meta"><span>Último corte</span><strong>${fmtDate(state.date)}</strong><i></i><span>${state.snapshots.length} cortes disponibles</span></div>
        </div>
        <div class="hero-visual" aria-hidden="true">
          <div class="hero-ring ring-one"></div><div class="hero-ring ring-two"></div><div class="hero-ring ring-three"></div>
          <div class="hero-core"><span>Backlog actual</span><strong>${fmtNum(m.count)}</strong><small>expedientes</small></div>
          <div class="float-chip chip-a"><span>Importe pendiente</span><strong>${fmtMoney(m.amount)}</strong></div>
          <div class="float-chip chip-b"><span>&gt;60 días</span><strong>${fmtNum(m.over60)}</strong></div>
        </div>
      </section>

      <section class="landing-section intro-section">
        <div class="section-index">01</div>
        <div class="section-copy"><span>UNA LECTURA, NO SOLO CIFRAS</span><h3>Qué podrás entender aquí</h3></div>
        <div class="feature-grid">
          <article class="feature-card feature-dark"><div class="feature-icon">↗</div><span>Evolución</span><h4>Cómo cambia el backlog entre cortes.</h4><p>Compara cantidad, importe y antigüedad sin reconstruir reportes manualmente.</p><button data-go-view="evolucion">Ir a evolución →</button></article>
          <article class="feature-card"><div class="feature-icon">◷</div><span>Antigüedad</span><h4>Dónde se concentra el riesgo operativo.</h4><p>Identifica expedientes envejecidos y el importe que permanece pendiente por más tiempo.</p><button data-go-view="antiguedad">Revisar antigüedad →</button></article>
          <article class="feature-card feature-accent"><div class="feature-icon">◎</div><span>Responsables</span><h4>Quién necesita atención y seguimiento.</h4><p>Filtra por auditor médico y llega directamente al detalle de sus expedientes pendientes.</p><button data-go-view="auditores">Ver por auditor →</button></article>
        </div>
      </section>

      <section class="landing-section signal-section">
        <div class="section-index">02</div>
        <div class="signal-copy"><span>SEÑAL DEL ÚLTIMO CORTE</span><h3>${delta===null?'Lectura disponible con el próximo corte':`El importe ${delta>=0?'creció':'disminuyó'} ${Math.abs(delta).toFixed(1)}%`}</h3><p>${topType?`${topType.type} concentra el mayor importe pendiente del corte actual.`:'La estructura está lista para analizar la composición del corte.'} ${critical.length?`${critical.length} expedientes ya superan los 60 días.`:''}</p></div>
        <div class="signal-stat"><span>Importe actual</span><strong>${fmtMoney(m.amount)}</strong><small>${m.count} expedientes abiertos</small></div>
      </section>
    `;
  }

  function renderResumen(){
    const rec=filteredRecords(), cmpRec=comparableRecords(currentSnapshot(state.compare)); const m=metrics(rec), pm=metrics(cmpRec);
    const byType=Object.entries(groupBy(rec,'type')).map(([type,rows])=>({type,label:type,count:rows.length,amount:sum(rows,r=>r.amount)})).sort((a,b)=>b.amount-a.amount);
    const series=state.snapshots.map(s=>{const rr=comparableRecords(s);return {date:s.date,count:rr.length,amount:sum(rr,r=>r.amount)}});
    return `
      <div class="kpi-grid">
        <div class="kpi kpi-primary"><div class="label">Expedientes pendientes</div><div class="value">${fmtNum(m.count)}</div>${deltaHtml(m.count,pm.count,true)}</div>
        <div class="kpi kpi-primary"><div class="label">Importe pendiente</div><div class="value">${fmtMoney(m.amount)}</div>${deltaHtml(m.amount,pm.amount,true)}</div>
        <div class="kpi"><div class="label">Antigüedad promedio</div><div class="value">${m.avgDays.toFixed(1)} días</div>${deltaHtml(m.avgDays,pm.avgDays,true)}</div>
        <div class="kpi"><div class="label">Expedientes &gt;30 días</div><div class="value">${fmtNum(m.over30)}</div><div class="delta neutral">${m.count?fmtPct(m.over30/m.count*100):'0.0%'} del total</div></div>
        <div class="kpi"><div class="label">Expedientes &gt;60 días</div><div class="value">${fmtNum(m.over60)}</div><div class="delta neutral">${fmtMoney(sum(rec.filter(r=>r.days>60),r=>r.amount))} comprometidos</div></div>
        <div class="kpi"><div class="label">Importe envejecido &gt;30d</div><div class="value">${fmtMoney(m.agedAmount)}</div><div class="delta neutral">${m.amount?fmtPct(m.agedAmount/m.amount*100):'0.0%'} del importe</div></div>
      </div>
      <div class="grid-2 summary-decision-grid">
        <div class="card"><div class="card-head"><div><h3>Evolución del importe pendiente</h3><div class="sub">Todos los cortes cargados · filtros aplicados</div></div><span class="badge">${series.length} cortes</span></div><div class="chart">${svgLine(series,'amount')}</div></div>
        <div class="card insight-card"><div class="card-head"><div><h3>Análisis ejecutivo del corte</h3><div class="sub">Lectura de situación, concentración, riesgo y acciones sugeridas</div></div><span class="badge insight-badge">DECISIÓN</span></div>${renderExecutiveAnalysis(rec,cmpRec)}</div>
      </div>
      <div class="grid-equal">
        <div class="card"><div class="card-head"><div><h3>Importe por tipo de expediente</h3><div class="sub">Selecciona una barra para filtrar</div></div></div><div class="chart">${svgBars(byType,'amount')}</div></div>
        <div class="card"><div class="card-head"><div><h3>Composición del corte</h3><div class="sub">Cantidad e importe por tipo</div></div></div><table class="type-table"><thead><tr><th>Tipo</th><th class="num">Exp.</th><th class="num">Importe</th><th class="num">Part.</th></tr></thead><tbody>${byType.map(x=>`<tr><td><span class="type-link" data-type="${esc(x.type)}">${esc(x.type)}</span></td><td class="num">${x.count}</td><td class="num">${fmtMoney2(x.amount)}</td><td class="num">${m.amount?fmtPct(x.amount/m.amount*100):'0%'}</td></tr>`).join('')}</tbody></table></div>
      </div>`;
  }

  function renderPdfSummaryPage(){
    const rec=filteredRecords(), cmpRec=comparableRecords(currentSnapshot(state.compare)); const m=metrics(rec), pm=metrics(cmpRec);
    const byType=Object.entries(groupBy(rec,'type')).map(([type,rows])=>({type,label:type,count:rows.length,amount:sum(rows,r=>r.amount)})).sort((a,b)=>b.amount-a.amount);
    return `
      <div class="kpi-grid pdf-kpi-grid">
        <div class="kpi kpi-primary"><div class="label">Expedientes pendientes</div><div class="value">${fmtNum(m.count)}</div>${deltaHtml(m.count,pm.count,true)}</div>
        <div class="kpi kpi-primary"><div class="label">Importe pendiente</div><div class="value">${fmtMoney(m.amount)}</div>${deltaHtml(m.amount,pm.amount,true)}</div>
        <div class="kpi"><div class="label">Antigüedad promedio</div><div class="value">${m.avgDays.toFixed(1)} días</div>${deltaHtml(m.avgDays,pm.avgDays,true)}</div>
        <div class="kpi"><div class="label">Expedientes &gt;60 días</div><div class="value">${fmtNum(m.over60)}</div><div class="delta neutral">${fmtMoney(sum(rec.filter(r=>r.days>60),r=>r.amount))} comprometidos</div></div>
        <div class="kpi"><div class="label">Importe envejecido &gt;30d</div><div class="value">${fmtMoney(m.agedAmount)}</div><div class="delta neutral">${m.amount?fmtPct(m.agedAmount/m.amount*100):'0.0%'} del importe</div></div>
      </div>
      <div class="pdf-summary-main">
        <div class="card insight-card"><div class="card-head"><div><h3>Análisis ejecutivo del corte</h3><div class="sub">Lectura de situación, concentración, riesgo y acciones sugeridas</div></div><span class="badge insight-badge">DECISIÓN</span></div>${renderExecutiveAnalysis(rec,cmpRec)}</div>
        <div class="card"><div class="card-head"><div><h3>Composición del corte</h3><div class="sub">Cantidad, importe y participación por tipo</div></div></div><table class="type-table"><thead><tr><th>Tipo</th><th class="num">Exp.</th><th class="num">Importe</th><th class="num">Part.</th></tr></thead><tbody>${byType.map(x=>`<tr><td>${esc(x.type)}</td><td class="num">${x.count}</td><td class="num">${fmtMoney2(x.amount)}</td><td class="num">${m.amount?fmtPct(x.amount/m.amount*100):'0%'}</td></tr>`).join('')}</tbody></table></div>
      </div>`;
  }

  function renderPdfChartsPage(){
    const series=state.snapshots.map(s=>{const rr=comparableRecords(s);return {date:s.date,count:rr.length,amount:sum(rr,r=>r.amount),avgDays:metrics(rr).avgDays}});
    const rec=filteredRecords(); const order=['0–15 días','16–30 días','31–60 días','61–90 días','>90 días','Sin fecha']; const grouped=groupBy(rec.map(r=>({...r,age:ageBucket(r.days)})),'age'); const rows=order.map(label=>({label,rows:grouped[label]||[]})).filter(x=>x.rows.length); const max=Math.max(...rows.map(x=>x.rows.length),1);
    const quarters=Object.entries(groupBy(rec.map(r=>({...r,q:r.quarter||quarterFromDate(r.receivedDate)})),'q')).map(([q,rs])=>({label:q,count:rs.length,amount:sum(rs,r=>r.amount)})).sort((a,b)=>a.label.localeCompare(b.label));
    return `<div class="pdf-chart-grid">
      <div class="card"><div class="card-head"><div><h3>Importe pendiente por corte</h3><div class="sub">Montos impresos para lectura directa del PDF</div></div></div><div class="chart">${svgLine(series,'amount',true)}</div></div>
      <div class="card"><div class="card-head"><div><h3>Cantidad de expedientes por corte</h3><div class="sub">Evolución histórica del backlog</div></div></div><div class="chart">${svgLine(series,'count',true)}</div></div>
      <div class="card"><div class="card-head"><div><h3>Antigüedad de la cartera</h3><div class="sub">Distribución actual por días pendientes</div></div></div><div class="age-bars">${rows.map(x=>`<div class="age-row"><div class="age-label">${x.label}</div><div class="track"><div class="fill" style="width:${x.rows.length/max*100}%"></div></div><div class="age-count">${x.rows.length} exp.</div><div class="age-amount">${fmtMoney(sum(x.rows,r=>r.amount))}</div></div>`).join('')}</div></div>
      <div class="card"><div class="card-head"><div><h3>Importe por trimestre de ingreso</h3><div class="sub">Según fecha de ingreso / entrega a Auditoría Médica</div></div></div><div class="chart">${svgBars(quarters,'amount')}</div></div>
    </div>`;
  }

  function renderEvolucion(){
    const series=state.snapshots.map(s=>{const rr=comparableRecords(s);return {date:s.date,count:rr.length,amount:sum(rr,r=>r.amount),avgDays:metrics(rr).avgDays}});
    const current=series.find(x=>x.date===state.date)||series.at(-1); const compare=series.find(x=>x.date===state.compare); const rec=filteredRecords(), prev=comparableRecords(currentSnapshot(state.compare));
    const types=[...new Set(state.snapshots.flatMap(s=>s.records.map(r=>r.type)))];
    const rows=types.map(type=>{const c=metrics(rec.filter(r=>r.type===type)),p=metrics(prev.filter(r=>r.type===type));return {type,c,p}});
    return `<div class="grid-equal"><div class="card"><div class="card-head"><div><h3>Importe pendiente por corte</h3><div class="sub">Tendencia histórica</div></div></div><div class="chart">${svgLine(series,'amount')}</div></div><div class="card"><div class="card-head"><div><h3>Cantidad de expedientes por corte</h3><div class="sub">Tendencia histórica</div></div></div><div class="chart">${svgLine(series,'count')}</div></div></div>
    <div class="card" style="margin-top:14px"><div class="card-head"><div><h3>Variación por tipo</h3><div class="sub">Corte ${fmtDate(state.date)} vs. ${state.compare?fmtDate(state.compare):'sin comparación'}</div></div></div><table class="type-table"><thead><tr><th>Tipo</th><th class="num">Exp. actual</th><th class="num">Δ cantidad</th><th class="num">Importe actual</th><th class="num">Δ importe</th></tr></thead><tbody>${rows.map(x=>{const dc=x.c.count-x.p.count, da=x.c.amount-x.p.amount;return `<tr><td><span class="type-link" data-type="${esc(x.type)}">${esc(x.type)}</span></td><td class="num">${x.c.count}</td><td class="num">${dc>=0?'+':''}${dc}</td><td class="num">${fmtMoney2(x.c.amount)}</td><td class="num" style="color:${da>0?'var(--bad)':da<0?'var(--good)':'inherit'}">${da>=0?'+':''}${fmtMoney2(da)}</td></tr>`}).join('')}</tbody></table></div>`;
  }

  function renderAntiguedad(){
    const rec=filteredRecords(); const order=['0–15 días','16–30 días','31–60 días','61–90 días','>90 días','Sin fecha']; const grouped=groupBy(rec.map(r=>({...r,age:ageBucket(r.days)})),'age'); const rows=order.map(label=>({label,rows:grouped[label]||[]})).filter(x=>x.rows.length); const max=Math.max(...rows.map(x=>x.rows.length),1);
    const quarters=Object.entries(groupBy(rec.map(r=>({...r,q:r.quarter||quarterFromDate(r.receivedDate)})),'q')).map(([q,rs])=>({label:q,count:rs.length,amount:sum(rs,r=>r.amount)})).sort((a,b)=>a.label.localeCompare(b.label));
    return `<div class="grid-2"><div class="card"><div class="card-head"><div><h3>Antigüedad de la cartera</h3><div class="sub">Calculada contra la fecha real del corte, no contra el día de hoy</div></div></div><div class="age-bars">${rows.map(x=>`<div class="age-row"><div class="age-label">${x.label}</div><div class="track"><div class="fill" style="width:${x.rows.length/max*100}%"></div></div><div class="age-count">${x.rows.length} exp.</div><div class="age-amount">${fmtMoney(sum(x.rows,r=>r.amount))}</div></div>`).join('')}</div></div><div class="card"><div class="card-head"><div><h3>Importe por trimestre de ingreso</h3><div class="sub">Según fecha de ingreso / entrega a Auditoría Médica</div></div></div><div class="chart">${svgBars(quarters,'amount')}</div></div></div>
    <div class="card" style="margin-top:14px"><div class="card-head"><div><h3>Expedientes con mayor antigüedad</h3><div class="sub">Prioridad de revisión operacional</div></div></div>${recordsTable([...rec].sort((a,b)=>(b.days??-1)-(a.days??-1)).slice(0,20))}</div>`;
  }

  function renderAuditores(){
    const rec=filteredRecords(); const groups=Object.entries(groupBy(rec,'auditor')).map(([auditor,rows])=>({auditor,rows,m:metrics(rows)})).sort((a,b)=>b.m.amount-a.m.amount);
    return `<div class="card"><div class="card-head"><div><h3>Carga pendiente por médico auditor</h3><div class="sub">Haz clic en un auditor para filtrar todo el panel</div></div><span class="badge">${groups.length} responsables</span></div><div class="auditor-grid">${groups.map(x=>`<div class="auditor-card" data-auditor="${esc(x.auditor)}"><div class="auditor-name">${esc(x.auditor)}</div><div class="auditor-metrics"><div><span>Expedientes</span><strong>${x.m.count}</strong></div><div><span>Importe</span><strong>${fmtMoney(x.m.amount)}</strong></div><div><span>Promedio días</span><strong>${x.m.avgDays.toFixed(1)}</strong></div><div><span>&gt;30 días</span><strong>${x.m.over30}</strong></div></div></div>`).join('')}</div></div>
      <div class="card" style="margin-top:14px"><div class="card-head"><div><h3>Detalle operativo</h3><div class="sub">Expedientes del filtro actual</div></div><button class="btn secondary" id="exportAuditorBtn">Descargar pendientes</button></div>${recordsTable(rec)}</div>`;
  }

  function recordsTable(records,withDetail=false){
    if(!records.length)return '<div class="empty">No hay expedientes para los filtros seleccionados.</div>';
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>Tipo</th><th>Cuenta / Factura</th><th>IAFA / empresa</th><th>Paciente</th><th>Ingreso a Auditoría</th><th class="num">Días</th><th class="num">Importe</th><th>Auditor</th><th>Antigüedad</th>${withDetail?'<th>Detalle</th>':''}</tr></thead><tbody>${records.map(r=>{const bucket=ageBucket(r.days);const cls=(r.days>60?'danger':r.days>30?'warn':'good');const identity=encodeURIComponent(`${r.type}|${r.key}`);return `<tr><td>${esc(r.type)}</td><td>${esc(r.account||r.invoice||r.attention||'—')}</td><td>${esc(r.company||'—')}</td><td>${esc(r.patient||'—')}</td><td>${fmtDate(r.receivedDate)}</td><td class="num">${Number.isFinite(r.days)?r.days:'—'}</td><td class="num">${fmtMoney2(r.amount)}</td><td>${esc(r.auditor)}</td><td><span class="pill ${cls}">${bucket}</span></td>${withDetail?`<td><button class="table-view-btn" data-expediente="${identity}">Ver</button></td>`:''}</tr>`}).join('')}</tbody></table></div>`;
  }

  function renderExpedientes(){
    const rec=filteredRecords();
    return `<div class="card"><div class="card-head"><div><h3>Detalle de expedientes</h3><div class="sub">${rec.length} registros · ${fmtMoney2(sum(rec,r=>r.amount))}</div></div><button class="btn secondary" id="exportDetailBtn">Exportar Excel</button></div>${recordsTable(rec,true)}</div>`;
  }

  function expedienteIdentity(r){ return `${r.type}|${r.key}`; }
  function findRecordByIdentity(identity,snapshot=currentSnapshot()){
    return (snapshot?.records||[]).find(r=>expedienteIdentity(r)===identity) || null;
  }
  function cleanStatus(v){ const t=String(v||'').trim(); return t || 'EXPEDIENTE PENDIENTE'; }
  function renderObservationItems(record){
    const items=record?.observationItems||[];
    if(!items.length) return '<div class="detail-empty">No hay observaciones registradas en las columnas configuradas para este expediente.</div>';
    return `<div class="observation-stack">${items.map((o,i)=>`<article class="observation-item"><div class="observation-index">${String(i+1).padStart(2,'0')}</div><div><span>${esc(o.label)}</span><p>${esc(o.text)}</p></div></article>`).join('')}</div>`;
  }
  function recordTimeline(identity){
    const points=[];
    let appeared=false;
    state.snapshots.filter(s=>s.date<=state.date).forEach(s=>{
      const rec=findRecordByIdentity(identity,s);
      if(rec){ appeared=true; points.push({date:s.date,present:true,record:rec}); }
      else if(appeared){ points.push({date:s.date,present:false,record:null}); }
    });
    return points;
  }
  function openExpedienteDetail(identity){
    const record=findRecordByIdentity(identity);
    if(!record){toast('No pude localizar el expediente en el corte actual.');return;}
    const timelines=recordTimeline(identity);
    const milestones=(record.milestones||[]).filter(m=>m?.date).sort((a,b)=>a.date.localeCompare(b.date));
    const keyLabel=record.account||record.invoice||record.attention||'Sin identificador';
    const status=cleanStatus(record.status);
    const modal=document.createElement('div');
    modal.className='record-modal-backdrop';
    modal.innerHTML=`<div class="record-modal" role="dialog" aria-modal="true" aria-label="Detalle del expediente">
      <div class="record-modal-top">
        <div><span class="record-eyebrow">${esc(record.type)} · ${esc(record.company||'Sin IAFA')}</span><h2>${esc(keyLabel)}</h2><p>${esc(record.patient||'Paciente no registrado')}</p></div>
        <button class="record-close" aria-label="Cerrar">×</button>
      </div>
      <div class="record-status-row"><span class="record-status">${esc(status)}</span><span>Corte ${fmtDate(state.date)}</span></div>
      <div class="record-metrics">
        <div><span>Importe pendiente</span><strong>${fmtMoney2(record.amount)}</strong></div>
        <div><span>Días pendientes</span><strong>${Number.isFinite(record.days)?record.days:'—'}</strong></div>
        <div><span>Auditor médico</span><strong>${esc(record.auditor||'Sin asignar')}</strong></div>
        <div><span>Ingreso a Auditoría</span><strong>${fmtDate(record.receivedDate)}</strong></div>
      </div>
      <section class="record-section"><div class="record-section-head"><span>01</span><div><h3>Motivo de demora / observaciones</h3><p>Información tomada de las columnas específicas del Excel según el tipo de expediente.</p></div></div>${renderObservationItems(record)}</section>
      <section class="record-section"><div class="record-section-head"><span>02</span><div><h3>Cronología operativa</h3><p>Fechas registradas en el expediente que permiten reconstruir su recorrido.</p></div></div>${milestones.length?`<div class="operational-timeline">${milestones.map(m=>`<div class="op-event"><time>${fmtDate(m.date)}</time><i></i><p>${esc(m.label)}</p></div>`).join('')}</div>`:'<div class="detail-empty">No hay hitos operativos con fecha registrados en este corte.</div>'}</section>
      <section class="record-section"><div class="record-section-head"><span>03</span><div><h3>Evolución entre cortes</h3><p>Seguimiento del mismo expediente en los reportes históricos cargados.</p></div></div><div class="cut-timeline">${timelines.map(t=>t.present?`<article class="cut-event present"><div class="cut-date">${fmtDate(t.date)}</div><div class="cut-dot"></div><div class="cut-content"><strong>${esc(cleanStatus(t.record.status))}</strong><span>${Number.isFinite(t.record.days)?`${t.record.days} días`:''} · ${fmtMoney2(t.record.amount)} · ${esc(t.record.auditor||'Sin asignar')}</span>${(t.record.observationItems||[]).length?`<small>${esc(t.record.observationItems[0].text)}</small>`:''}</div></article>`:`<article class="cut-event absent"><div class="cut-date">${fmtDate(t.date)}</div><div class="cut-dot"></div><div class="cut-content"><strong>No figura en pendientes</strong><span>El expediente no aparece en este corte.</span></div></article>`).join('')}</div></section>
    </div>`;
    document.body.appendChild(modal);
    const close=()=>modal.remove();
    modal.querySelector('.record-close').addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});
    const escHandler=e=>{if(e.key==='Escape'){close();document.removeEventListener('keydown',escHandler)}};
    document.addEventListener('keydown',escHandler);
  }

  function renderHistorico(){
    const items=[...state.snapshots].sort((a,b)=>b.date.localeCompare(a.date));
    return `<div class="card"><div class="card-head"><div><h3>Histórico de cargas</h3><div class="sub">Cada corte se conserva como una foto independiente para comparaciones futuras</div></div><span class="badge">${items.length} cortes</span></div><div class="history-list">${items.map(s=>{const m=metrics(s.records),seeded=isSeedDate(s.date),local=isLocalDate(s.date);return `<div class="history-item"><div class="history-date">${fmtDate(s.date)}</div><div><div class="history-file">${esc(s.sourceFile||'Carga local')}</div><span class="source-tag">${seeded&&!local?'Base inicial':'Carga local'}</span></div><div class="history-kpi"><span>Expedientes</span><strong>${m.count}</strong></div><div class="history-kpi"><span>Importe</span><strong>${fmtMoney(m.amount)}</strong></div><div class="history-actions"><button class="icon-btn history-open" data-date="${s.date}" title="Abrir corte">→</button>${local&&userCanManageCuts()?`<button class="icon-btn history-delete" data-delete-date="${s.date}" title="Eliminar corte">✕</button>`:''}</div></div>`}).join('')}</div><div class="delete-note">Solo los cortes cargados localmente pueden eliminarse. La base inicial permanece protegida.</div></div>`;
  }

  function render(){
    populateControls();
    const titleMap={inicio:'Expedientes pendientes',resumen:'Resumen ejecutivo',evolucion:'Evolución y variación',antiguedad:'Antigüedad de cartera',auditores:'Gestión por médico auditor',expedientes:'Detalle de expedientes',historico:'Histórico de cargas'};
    $('#pageTitle').textContent=titleMap[state.view];
    document.body.classList.toggle('home-mode',state.view==='inicio');
    $('#searchLabel')?.classList.toggle('hidden-control',state.view!=='expedientes');
    $('#ageLabel')?.classList.toggle('hidden-control',state.view!=='expedientes');
    $('#pdfSummaryBtn')?.classList.toggle('hidden-control',state.view!=='resumen');
    const root=$('#viewRoot');
    root.innerHTML=state.view==='inicio'?renderInicio():state.view==='resumen'?renderResumen():state.view==='evolucion'?renderEvolucion():state.view==='antiguedad'?renderAntiguedad():state.view==='auditores'?renderAuditores():state.view==='expedientes'?renderExpedientes():renderHistorico();
    updateDeleteButton();
    bindDynamic();
  }

  function bindDynamic(){
    document.querySelectorAll('[data-go-view]').forEach(el=>el.addEventListener('click',()=>{state.view=el.dataset.goView;syncNav();render();window.scrollTo({top:0,behavior:'smooth'});}));
    document.querySelectorAll('.type-link,[data-type].bar').forEach(el=>el.addEventListener('click',()=>{state.type=el.dataset.type||'ALL'; render();}));
    document.querySelectorAll('.auditor-card').forEach(el=>el.addEventListener('click',()=>{state.auditor=el.dataset.auditor; render();}));
    document.querySelectorAll('.history-open').forEach(el=>el.addEventListener('click',()=>{state.date=el.dataset.date; const prior=state.snapshots.filter(s=>s.date<state.date).at(-1);state.compare=prior?.date||'';state.view='resumen';syncNav();render();}));
    document.querySelectorAll('[data-delete-date]').forEach(el=>el.addEventListener('click',()=>deleteCut(el.dataset.deleteDate)));
    document.querySelectorAll('[data-expediente]').forEach(el=>el.addEventListener('click',()=>openExpedienteDetail(decodeURIComponent(el.dataset.expediente))));
    ['#exportAuditorBtn','#exportDetailBtn'].forEach(sel=>$(sel)?.addEventListener('click',exportCurrent));
  }

  function deleteCut(date){
    if(!userCanManageCuts()){ toast('Tu usuario no tiene permiso para eliminar cortes.'); return; }
    if(!isLocalDate(date)){ toast('Solo se pueden eliminar cortes cargados localmente.'); return; }
    const label = currentSnapshot(date)?.label || fmtDate(date);
    if(!window.confirm(`¿Eliminar el corte ${label} del histórico local? Esta acción no se puede deshacer.`)) return;
    const remaining = getLocalSnapshots().filter(s=>s.date!==date);
    fetch('/api/expedientes/snapshots/'+encodeURIComponent(date),{method:'DELETE',credentials:'same-origin'}).then(async r=>{if(!r.ok)throw Error((await r.json()).error||'Error de eliminación');setLocalSnapshots(remaining);const ix=seed.findIndex(x=>x.date===date);if(ix>=0)seed.splice(ix,1);rebuildSnapshots();if(state.date===date)state.date=state.snapshots.at(-1)?.date||null;render();toast('Corte eliminado del histórico compartido.')}).catch(e=>toast(e.message));
    // La eliminación solo se aplica tras confirmar Supabase.
    return;
    rebuildSnapshots();
    if(state.date===date){
      state.date=state.snapshots.at(-1)?.date||null;
      state.compare=state.snapshots.filter(s=>s.date<state.date).at(-1)?.date||'';
    } else if(state.compare===date){
      state.compare=state.snapshots.filter(s=>s.date<state.date).map(s=>s.date).filter(d=>d!==date).at(-1)||'';
    }
    render();
    toast('Corte eliminado del histórico local.');
  }

  function syncNav(){ document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view)); }
  function toast(msg){ const t=$('#toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),2800); }

  async function exportSummaryPdf(){
    if(typeof html2canvas==='undefined' || !window.jspdf?.jsPDF){toast('No se pudo cargar el generador de PDF. Verifica tu conexión e inténtalo nuevamente.');return;}
    const btn=$('#pdfSummaryBtn'); const original=btn?.textContent;
    if(btn){btn.disabled=true;btn.textContent='Generando PDF…';}
    const host=document.createElement('div');
    host.className='pdf-report-host';
    const filterText=[state.auditor!=='ALL'?`Auditor: ${state.auditor}`:'Todos los auditores',state.type!=='ALL'?`Tipo: ${state.type}`:'Todos los tipos'].join(' · ');
    host.innerHTML=`
      <section class="pdf-sheet pdf-summary-sheet"><div class="pdf-sheet-head"><div><span>EXPEDIENTES PENDIENTES · AUDITORÍA MÉDICA</span><h2>Resumen ejecutivo</h2><div class="pdf-report-author">Reporte realizado por: <b>Darwen Colan</b></div></div><div><strong>Corte ${fmtDate(state.date)}</strong><small>${esc(filterText)}</small></div></div>${renderPdfSummaryPage()}<div class="pdf-page-footer"><span>Reporte ejecutivo de expedientes pendientes</span><span>01 / 02</span></div></section>
      <section class="pdf-sheet pdf-charts-sheet"><div class="pdf-sheet-head"><div><span>ANEXO GRÁFICO</span><h2>Evolución y antigüedad</h2><div class="pdf-report-author">Reporte realizado por: <b>Darwen Colan</b></div></div><div><strong>Corte ${fmtDate(state.date)}</strong><small>${esc(filterText)}</small></div></div>${renderPdfChartsPage()}<div class="pdf-page-footer"><span>Gráficos complementarios · valores visibles para lectura impresa</span><span>02 / 02</span></div></section>`;
    document.body.appendChild(host);
    try{
      if(document.fonts?.ready) await document.fonts.ready;
      await new Promise(r=>setTimeout(r,180));
      const sheets=[...host.querySelectorAll('.pdf-sheet')];
      let pdf=null;
      for(let i=0;i<sheets.length;i++){
        const sheet=sheets[i];
        const w=Math.ceil(sheet.scrollWidth), h=Math.ceil(sheet.scrollHeight);
        // Render each page at true 4K-class density. The CSS page remains the same size,
        // but the embedded image has ~4096 px of horizontal detail (lossless PNG).
        const targetWidth=4096;
        const exportScale=Math.max(2.4,Math.min(4,targetWidth/w));
        const canvas=await html2canvas(sheet,{scale:exportScale,backgroundColor:'#F0FFE3',useCORS:true,allowTaint:false,logging:false,width:w,height:h,windowWidth:w,windowHeight:h,imageTimeout:15000,removeContainer:true});
        const orientation=w>=h?'landscape':'portrait';
        if(!pdf) pdf=new window.jspdf.jsPDF({orientation,unit:'px',format:[w,h],hotfixes:['px_scaling'],compress:true,precision:16});
        else pdf.addPage([w,h],orientation);
        const imageData=canvas.toDataURL('image/png');
        pdf.addImage(imageData,'PNG',0,0,w,h,undefined,'SLOW');
      }
      pdf.save(`Resumen_Expedientes_${state.date}.pdf`);
      toast('PDF ejecutivo generado en 2 páginas, con evolución y antigüedad sin duplicados.');
    }catch(err){console.error(err);toast('No se pudo generar el PDF. Inténtalo nuevamente.');}
    finally{host.remove();if(btn){btn.disabled=false;btn.textContent=original;}}
  }

  async function exportCurrent(){
    const rec=filteredRecords(); if(!rec.length){toast('No hay registros para exportar.');return;}
    if(typeof XLSX==='undefined'){toast('Se necesita conexión a internet para habilitar la exportación Excel en esta versión.');return;}
    await window.HubDownload.run(async()=>{
    const rows=rec.map(r=>({'Fecha corte':fmtDate(r.snapshotDate),'Tipo':r.type,'Cuenta':r.account,'Factura':r.invoice,'Atención':r.attention,'IAFA / Empresa':r.company,'Paciente':r.patient,'Fecha ingreso Auditoría':fmtDate(r.receivedDate),'Días pendientes':r.days,'Antigüedad':ageBucket(r.days),'Importe':r.amount,'Auditor médico':r.auditor,'Estado':r.status,'Trimestre':r.quarter,'Observaciones':(r.observationItems||[]).map(o=>`${o.label}: ${o.text}`).join(' | ')}));
    const ws=XLSX.utils.json_to_sheet(rows);const headers=Object.keys(rows[0]);
    ws['!cols']=headers.map(h=>({wch:Math.min(65,Math.max(16,h.length+3,...rows.slice(0,80).map(r=>String(r[h]??'').length+2)))}));
    ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:rows.length,c:headers.length-1}})};
    ws['!freeze']={xSplit:0,ySplit:1,topLeftCell:'A2',activePane:'bottomLeft',state:'frozen'};
    const amountCol=headers.indexOf('Importe'),daysCol=headers.indexOf('Días pendientes');
    rows.forEach((_,i)=>{if(amountCol>=0){const cell=ws[XLSX.utils.encode_cell({r:i+1,c:amountCol})];if(cell&&cell.t==='n')cell.z='"S/ "#,##0.00'}if(daysCol>=0){const cell=ws[XLSX.utils.encode_cell({r:i+1,c:daysCol})];if(cell&&cell.t==='n')cell.z='#,##0'}});
    const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Pendientes');
    const bytes=XLSX.write(wb,{bookType:'xlsx',type:'array',compression:true});
    return {blob:await HubExcel.format(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),filename:`Pendientes_${state.date}_${state.auditor==='ALL'?'Todos':state.auditor.replace(/\W+/g,'_')}.xlsx`};
    });
  }

  function detectDateFromWorkbook(wb){
    const ws=wb.Sheets['VARIACIÓN']||wb.Sheets['VARIACION']; if(!ws)return null;
    const range=XLSX.utils.decode_range(ws['!ref']||'A1:D6');
    for(let r=range.s.r;r<=Math.min(range.e.r,8);r++) for(let c=range.s.c;c<=Math.min(range.e.c,4);c++){
      const cell=ws[XLSX.utils.encode_cell({r,c})]; const txt=String(cell?.w??cell?.v??''); const m=txt.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    } return null;
  }
  function parseExcelDate(v){
    if(v instanceof Date && !isNaN(v))return v.toISOString().slice(0,10);
    if(typeof v==='number' && typeof XLSX!=='undefined'){ const d=XLSX.SSF.parse_date_code(v); if(d)return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`; }
    if(typeof v==='string'){ const m=v.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/); if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`; }
    return null;
  }
  function findHeader(headers, opts={}){
    const ins=(opts.any||[]).map(norm), all=(opts.all||[]).map(norm), ex=(opts.exclude||[]).map(norm); const hits=[];
    headers.forEach((h,i)=>{const n=norm(h); if(all.length&&!all.every(x=>n.includes(x)))return;if(ins.length&&!ins.some(x=>n.includes(x)))return;if(ex.some(x=>n.includes(x)))return;hits.push(i)}); return hits.length?(opts.last?hits.at(-1):hits[0]):null;
  }

  function findExactHeader(headers,name){ const target=norm(name); const idx=headers.findIndex(h=>norm(h)===target); return idx>=0?idx:null; }
  function cellText(v){ if(v===null||v===undefined)return ''; if(v instanceof Date&&!isNaN(v))return v.toLocaleDateString('es-PE'); return String(v).trim(); }
  function extractObservationItems(sheet,headers,row){
    const specs=[];
    if(sheet==='AMB'){
      let oma=findExactHeader(headers,'OMA');
      let detail=findHeader(headers,{any:['DETALLE INCONFORMIDAD INGRESADA','DETALLE INCONFORMIDAD REINGRESADA']});
      if(oma===null&&headers.length>=18)oma=17; if(detail===null&&headers.length>=27)detail=26;
      specs.push(['OMA',oma],['Detalle inconformidad ingresada / reingresada',detail]);
    }else if(sheet==='HOS'){
      let idx=findExactHeader(headers,'OBSERVACIONES ADICIONALES'); if(idx===null&&headers.length>=41)idx=40; specs.push(['Observaciones adicionales',idx]);
    }else if(sheet==='PAQ'){
      let idx=findExactHeader(headers,'OBSERVACION'); if(idx===null&&headers.length>=20)idx=19; specs.push(['Observación',idx]);
    }else if(sheet==='DCL'){
      let first=headers.length>=18?17:null;
      let second=findHeader(headers,{any:['2 DA OBSERVACION DEL AUDITOR EXTERNO','2DA OBSERVACION DEL AUDITOR EXTERNO']});
      let third=findExactHeader(headers,'DETALLE INCONFORMIDAD REINGRESADA');
      if(second===null&&headers.length>=27)second=26; if(third===null&&headers.length>=29)third=28;
      specs.push(['Observación (columna R)',first],['2da observación del auditor externo',second],['Detalle inconformidad reingresada',third]);
    }
    return specs.map(([label,idx])=>({label,text:idx===null?'':cellText(row[idx])})).filter(x=>x.text&&x.text!=='0'&&x.text!=='-');
  }
  function extractMilestones(headers,row){
    const out=[];
    headers.forEach((h,i)=>{
      const hn=norm(h); if(!hn||!['FECHA','ALTA','RECIBIDO','INGRESO','ENTREGA'].some(t=>hn.includes(t)))return;
      const d=parseExcelDate(row[i]); if(d)out.push({date:d,label:String(h||'').replace(/\s+/g,' ').trim()});
    });
    const seen=new Set(); return out.sort((a,b)=>a.date.localeCompare(b.date)||a.label.localeCompare(b.label)).filter(x=>{const k=`${x.date}|${x.label}`;if(seen.has(k))return false;seen.add(k);return true;});
  }
  function parseWorkbook(file,buffer){
    if(typeof XLSX==='undefined') throw new Error('No se pudo cargar el lector de Excel. Verifica tu conexión a internet e inténtalo nuevamente.');
    const wb=XLSX.read(buffer,{type:'array',cellDates:true}); const date=detectDateFromWorkbook(wb); if(!date) throw new Error('No pude detectar la fecha de corte en la hoja VARIACIÓN.');
    const records=[]; const warnings=[]; const sheetMap={DCL:'Day Clinic',AMB:'Ambulatorio',HOS:'Hospitalario',PAQ:'Paquetes'};
    Object.entries(sheetMap).forEach(([sheet,type])=>{
      const ws=wb.Sheets[sheet]; if(!ws){ if(sheet!=='DCL')warnings.push(`No se encontró la hoja ${sheet}.`); return; }
      const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true}); if(matrix.length<2)return; const headers=matrix[0].map(x=>x??'');
      const amountIdx=findHeader(headers,{any:['IMPORTE INICIAL','VALOR INICIAL','IMPORTE FACTURA INICIAL','IMPORTE TOTAL CONSUMIDO']}) ?? (sheet==='PAQ'?9:null);
      const companyIdx=findExactHeader(headers,'COMPAÑIA') ?? findHeader(headers,{any:['COMPAÑIA']});
      let invoiceIdx=sheet==='AMB'?findExactHeader(headers,'CODIGO DE FACTURA'):findExactHeader(headers,'FACTURA'); if(invoiceIdx===null)invoiceIdx=findHeader(headers,{any:['CODIGO DE FACTURA','FACTURA'],exclude:['USUARIO']});
      const attIdx=findExactHeader(headers,'ATENCION') ?? findHeader(headers,{any:['ATENCION'],exclude:['TIPO']}); const accIdx=findExactHeader(headers,'CUENTA') ?? findHeader(headers,{any:['CUENTA']});
      let patientIdx=findHeader(headers,{any:['NOMBRE DEL AFILIADO','NOMBRE DEL PACIENTE']}); if(patientIdx===null)patientIdx=findExactHeader(headers,'PACIENTE');
      let audIdx=findHeader(headers,{all:['AUDITOR','MEDICO'],any:['RESPONSABLE','CGH']}); if(audIdx===null)audIdx=findHeader(headers,{all:['AUDITOR','MEDICO']});
      const receivedPatterns={DCL:['FECHA ENTREGA A GERENCIA AUD. MEDICA','FECHA DE RECPECION AUDITORIA MEDICA','FECHA DE RECEPCION AUDITORIA MEDICA'],AMB:['FECHA DE RECPECION AUDITORIA MEDICA','FECHA DE RECEPCION AUDITORIA MEDICA'],HOS:['FECHA DE INGRESO A AUD. MEDICA','FECHA DE INGRESO A AUDITORIA MEDICA'],PAQ:['FECHA DE ENTREGA A. M.']}[sheet];
      const receivedIdx=findHeader(headers,{any:receivedPatterns}); const stateCandidates=headers.map((h,i)=>({h:norm(h),i})).filter(x=>x.h.includes('ESTADO DE EXPEDIENTE')&&!x.h.includes('REGULAR/DEVOLUCION')); const statusIdx=stateCandidates.length?stateCandidates.at(-1).i:null;
      if(amountIdx===null)warnings.push(`${sheet}: no se reconoció la columna de importe.`); if(audIdx===null)warnings.push(`${sheet}: no se reconoció el auditor médico.`); if(receivedIdx===null)warnings.push(`${sheet}: no se reconoció la fecha de ingreso a Auditoría.`);
      matrix.slice(1).forEach((row,j)=>{ if(!row.some(v=>v!==null&&v!==''))return; const received=parseExcelDate(row[receivedIdx]); let days=null;if(received){days=Math.round((new Date(date+'T00:00:00')-new Date(received+'T00:00:00'))/86400000);} const company=String(row[companyIdx]??'').trim(),invoice=String(row[invoiceIdx]??'').trim(),attention=String(row[attIdx]??'').trim(),account=String(row[accIdx]??'').trim(),patient=String(row[patientIdx]??'').trim(),auditor=String(row[audIdx]??'').trim()||'Sin asignar'; const key=account||invoice||attention||`${patient}|${received}|${sheet}|${j+2}`;
        const initialIdx=findExactHeader(headers,'ESTADO DE EXPEDIENTE (REGULAR/DEVOLUCION)');
        const observationItems=extractObservationItems(sheet,headers,row); const milestones=extractMilestones(headers,row);
        records.push({snapshotDate:date,sourceFile:file.name,sourceSheet:sheet,sourceRow:j+2,type,company,invoice,attention,account,amount:Number(row[amountIdx]||0),patient,receivedDate:received,auditor,status:String(row[statusIdx]??'EXPEDIENTE PENDIENTE'),initialState:cellText(row[initialIdx]),days,quarter:received?quarterFromDate(received):null,userBilling:'',key,observationItems,milestones});
      });
    });
    const duplicateKeys=records.map(r=>r.key).filter((k,i,a)=>k&&a.indexOf(k)!==i); if(duplicateKeys.length)warnings.push(`${new Set(duplicateKeys).size} posibles claves repetidas dentro del corte.`);
    return {date,label:fmtDate(date),sourceFile:file.name,records,warnings};
  }

  function previewUpload(snapshot){
    const m=metrics(snapshot.records), by=Object.entries(groupBy(snapshot.records,'type')).map(([type,rs])=>({type,count:rs.length,amount:sum(rs,r=>r.amount)}));
    $('#uploadPreview').innerHTML=`<div><strong>Fecha detectada: ${fmtDate(snapshot.date)}</strong><div class="sub" style="margin-top:4px">${esc(snapshot.sourceFile)}</div></div><div class="preview-grid">${by.map(x=>`<div class="preview-kpi"><span>${esc(x.type)}</span><strong>${x.count} · ${fmtMoney(x.amount)}</strong></div>`).join('')}</div><div class="check-list">✓ ${m.count} registros detectados<br>✓ Importe total: ${fmtMoney2(m.amount)}<br>${snapshot.warnings.length?snapshot.warnings.map(x=>`⚠ ${esc(x)}`).join('<br>'):'✓ Estructura reconocida sin alertas críticas'}</div>`;
    $('#uploadPreview').classList.remove('hidden'); $('#processUpload').disabled=false;
  }

  function handleFile(file){
    if(!file)return; const reader=new FileReader(); reader.onload=e=>{try{state.pendingUpload=parseWorkbook(file,e.target.result);previewUpload(state.pendingUpload);}catch(err){toast(err.message);}};reader.readAsArrayBuffer(file);
  }
  async function savePending(){
    if(!userCanManageCuts()){ toast('Tu usuario no tiene permiso para cargar cortes.'); return; }
    if(!state.pendingUpload)return; const snap={...state.pendingUpload,warnings:undefined};const save=await fetch('/api/expedientes/snapshots',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot:snap})}).then(async r=>{const j=await r.json();if(!r.ok||!j.ok)throw Error(j.error||'No se pudo guardar en Supabase');return j}).catch(e=>{toast('No se guardó el corte: '+e.message);return null});if(!save)return;let local=getLocalSnapshots();local=local.filter(x=>x.date!==snap.date);local.push(snap);setLocalSnapshots(local);rebuildSnapshots(); state.date=state.pendingUpload.date;state.compare=state.snapshots.filter(s=>s.date<state.date).at(-1)?.date||'';state.pendingUpload=null;closeModal();state.view='resumen';syncNav();render();toast('Corte guardado en Supabase correctamente.');
  }
  function openModal(){ if(!userCanManageCuts()){toast('Tu usuario no tiene permiso para cargar cortes.');return;} $('#uploadModal').classList.remove('hidden'); $('#uploadPreview').classList.add('hidden'); $('#processUpload').disabled=true; $('#fileInput').value='';state.pendingUpload=null; }
  function closeModal(){ $('#uploadModal').classList.add('hidden'); }

  function applyUserPermissions(){
    $('#currentUserLabel').textContent=activeUser||'—';
    updateDeleteButton();
    if(state.view==='historico') render();
  }
  function login(username){
    const u=String(username||'').trim().toLowerCase();
    if(!window.HUB_ACTIVE_USERNAME||u!==window.HUB_ACTIVE_USERNAME)return false;
    activeUser=u;
    sessionStorage.setItem(SESSION_KEY,u);
    $('#authGate').classList.add('hidden');
    $('#loginError').classList.add('hidden');
    applyUserPermissions();
    return true;
  }
  function logout(){
    sessionStorage.removeItem(SESSION_KEY);
    activeUser=null;
    $('#loginUser').value='';
    $('#authGate').classList.remove('hidden');
    $('#loginError').classList.add('hidden');
  }
  function initAuth(){
    const remembered=sessionStorage.getItem(SESSION_KEY);
    if(remembered&&remembered===window.HUB_ACTIVE_USERNAME){ activeUser=remembered; $('#authGate').classList.add('hidden'); }
    else { $('#authGate').classList.remove('hidden'); }
    $('#currentUserLabel').textContent=activeUser||'—';
    $('#loginForm').addEventListener('submit',e=>{e.preventDefault(); if(!login($('#loginUser').value)) $('#loginError').classList.remove('hidden');});
    $('#logoutBtn').addEventListener('click',logout);
  }

  function bindStatic(){
    document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.view;syncNav();render();$('#sidebar').classList.remove('open');}));
    $('#dateFilter').addEventListener('change',e=>{state.date=e.target.value; const prior=state.snapshots.filter(s=>s.date<state.date).at(-1); if(!state.compare||state.compare===state.date)state.compare=prior?.date||'';state.auditor='ALL';state.type='ALL';state.age='ALL';render();});
    $('#compareFilter').addEventListener('change',e=>{state.compare=e.target.value;render();}); $('#auditorFilter').addEventListener('change',e=>{state.auditor=e.target.value;render();}); $('#typeFilter').addEventListener('change',e=>{state.type=e.target.value;render();}); $('#ageFilter').addEventListener('change',e=>{state.age=e.target.value;render();});
    $('#searchFilter').addEventListener('input',e=>{state.search=e.target.value;clearTimeout(window.__searchT);window.__searchT=setTimeout(()=>{if(state.view==='expedientes')render();},180)});
    $('#clearFilters').addEventListener('click',()=>{state.auditor='ALL';state.type='ALL';state.age='ALL';if(state.view==='expedientes')state.search='';render();}); $('#pdfSummaryBtn').addEventListener('click',exportSummaryPdf); $('#uploadBtn').addEventListener('click',openModal); $('#deleteCutBtn').addEventListener('click',()=>deleteCut(state.date)); $('#closeModal').addEventListener('click',closeModal); $('#cancelUpload').addEventListener('click',closeModal); $('#processUpload').addEventListener('click',savePending); $('#chooseFile').addEventListener('click',()=>$('#fileInput').click()); $('#fileInput').addEventListener('change',e=>handleFile(e.target.files[0])); $('#exportBtn').addEventListener('click',exportCurrent); $('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
    const dz=$('#dropZone'); ['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag')})); ['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag')})); dz.addEventListener('drop',e=>handleFile(e.dataTransfer.files[0]));
    $('#uploadModal').addEventListener('click',e=>{if(e.target===$('#uploadModal'))closeModal()});
  }

  loadSnapshots(); bindStatic(); initAuth(); render(); applyUserPermissions();
})();
