/* V27 - Retroalimentación visual de exportaciones */
(function(){
  let busy=false;
  // V28: el boton activo queda bloqueado mientras se genera el archivo.
  function ensure(){
    let root=document.getElementById('hub-download-feedback');
    if(root)return root;
    const css=document.createElement('style');
    css.textContent=`
    #hub-download-feedback{position:fixed;z-index:2147483600;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(8,20,9,.36);backdrop-filter:blur(3px);opacity:0;visibility:hidden;transition:opacity .22s ease,visibility .22s ease;pointer-events:none;font-family:Manrope,Arial,sans-serif}
    #hub-download-feedback.visible{opacity:1;visibility:visible;pointer-events:auto}
    #hub-download-feedback .hub-dl-panel{position:relative;max-width:min(390px,calc(100vw - 32px));width:340px;border:1px solid #b6ee60;background:#fcfff6;padding:34px 25px 28px;border-radius:25px;box-shadow:0 24px 80px rgba(12,26,7,.27);display:flex;align-items:center;flex-direction:column;text-align:center;gap:13px;color:#14200a}
    #hub-download-feedback .hub-dl-indicator{width:68px;height:68px;display:grid;place-items:center;border-radius:50%;background:#cdff00;color:#132200}
    #hub-download-feedback .hub-dl-spinner{width:34px;height:34px;border:4px solid rgba(23,48,10,.14);border-top-color:#173b0a;border-radius:50%;animation:hub-dl-rotate .8s linear infinite}
    #hub-download-feedback .hub-dl-face{display:none;font-size:43px;line-height:1;animation:hub-dl-pop .35s ease-out}
    #hub-download-feedback .hub-dl-title{font-size:20px;font-weight:850;letter-spacing:-.04em}
    #hub-download-feedback .hub-dl-note{font-size:12px;line-height:1.5;color:#4d6546}
    #hub-download-feedback.complete .hub-dl-spinner,#hub-download-feedback.error .hub-dl-spinner{display:none}
    #hub-download-feedback.complete .hub-dl-face,#hub-download-feedback.error .hub-dl-face{display:block}
    #hub-download-feedback.error .hub-dl-indicator{background:#fce8e8;color:#a92121}
    @keyframes hub-dl-rotate{to{transform:rotate(360deg)}}@keyframes hub-dl-pop{0%{transform:scale(.55)}70%{transform:scale(1.13)}100%{transform:scale(1)}}
    @media(prefers-reduced-motion:reduce){#hub-download-feedback *,#hub-download-feedback{animation:none!important;transition:none!important}}
    `;
    document.head.appendChild(css);
    root=document.createElement('div');root.id='hub-download-feedback';root.setAttribute('role','status');root.setAttribute('aria-live','polite');root.innerHTML='<div class="hub-dl-panel"><div class="hub-dl-indicator"><div class="hub-dl-spinner"></div><div class="hub-dl-face" aria-hidden="true">☺</div></div><div class="hub-dl-title"></div><div class="hub-dl-note"></div></div>';
    document.body.appendChild(root);return root;
  }
  function show(root,state,title,note){root.className='visible '+state;root.querySelector('.hub-dl-title').textContent=title;root.querySelector('.hub-dl-note').textContent=note;root.querySelector('.hub-dl-face').textContent=state==='error'?'!':'☺'}
  async function run(createFile){
    if(busy)return;
    busy=true;const root=ensure();
    const trigger=document.activeElement instanceof HTMLButtonElement?document.activeElement:null;
    if(trigger){trigger.disabled=true;trigger.setAttribute('aria-busy','true');}
    try{
      show(root,'loading','Preparando descarga…','Estamos organizando tu archivo Excel.');
      await new Promise(resolve=>setTimeout(resolve,240));
      const result=await createFile();
      if(!result||!result.blob||!result.filename)throw new Error('El archivo no se pudo generar.');
      const link=document.createElement('a');const url=URL.createObjectURL(result.blob);
      link.href=url;link.download=result.filename;link.style.display='none';document.body.appendChild(link);
      try{link.click()}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
      show(root,'complete','Descarga completada','Archivo generado y enviado al navegador. Revisa tu carpeta de descargas.');
      await new Promise(resolve=>setTimeout(resolve,1850));
    }catch(err){console.error('Error de descarga',err);show(root,'error','No se pudo descargar',err?.message||'Por favor, vuelve a intentarlo.');await new Promise(resolve=>setTimeout(resolve,2600));}
    finally{root.className='';busy=false;if(trigger){trigger.disabled=false;trigger.removeAttribute('aria-busy');}}
  }
  window.HubDownload={run};
})();
