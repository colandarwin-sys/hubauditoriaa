/* Hub Auditoría V29: convierte exportaciones SheetJS en tablas nativas de Excel. */
(function(){
const MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG='http://schemas.openxmlformats.org/package/2006/relationships';
function xml(text){const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw Error('XML Excel inválido');return d}
function str(d){return new XMLSerializer().serializeToString(d)}
function el(d,n){return d.createElementNS(MAIN,n)}
function add(parent,d,name,attrs={}){const e=el(d,name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));parent.appendChild(e);return e}
function excelCol(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
async function format(blob){
if(!window.JSZip)throw Error('No está disponible el formato de tablas Excel');
const zip=await JSZip.loadAsync(await blob.arrayBuffer());
const sheetFiles=Object.keys(zip.files).filter(x=>/^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort();
if(!sheetFiles.length)return blob;
const styles=xml(await zip.file('xl/styles.xml').async('string'));
const root=styles.documentElement;const fonts=root.getElementsByTagNameNS(MAIN,'fonts')[0];const fills=root.getElementsByTagNameNS(MAIN,'fills')[0];const xfs=root.getElementsByTagNameNS(MAIN,'cellXfs')[0];
if(!fonts||!fills||!xfs)throw Error('Faltan estilos en el Excel');
const oldXfs=Array.from(xfs.children);const count=oldXfs.length;
function font(color,bold){const f=add(fonts,styles,'font');add(f,styles,'sz',{val:10});add(f,styles,'name',{val:'Aptos'});if(bold)add(f,styles,'b');add(f,styles,'color',{rgb:color});return fonts.children.length-1}
function fill(color){const f=add(fills,styles,'fill');const p=add(f,styles,'patternFill',{patternType:'solid'});add(p,styles,'fgColor',{rgb:color});add(p,styles,'bgColor',{indexed:64});return fills.children.length-1}
const hf=font('FFCDFF00',true), bf=font('FF132100',false),black=fill('FF0A180B'),pale=fill('FFF0FFCE'),white=fill('FFFFFFFF');
const idx=[];for(let variant=0;variant<3;variant++){
 idx[variant]=[];
 oldXfs.forEach((xf,i)=>{const copy=xf.cloneNode(true);copy.setAttribute('fontId',String(variant===0?hf:bf));copy.setAttribute('fillId',String(variant===0?black:(variant===1?white:pale)));copy.setAttribute('applyFont','1');copy.setAttribute('applyFill','1');xfs.appendChild(copy);idx[variant][i]=count+variant*count+i});
}
fonts.setAttribute('count',fonts.children.length);fills.setAttribute('count',fills.children.length);xfs.setAttribute('count',xfs.children.length);
zip.file('xl/styles.xml',str(styles));
const types=xml(await zip.file('[Content_Types].xml').async('string'));const tns='http://schemas.openxmlformats.org/package/2006/content-types';
let ti=0;
for(const path of sheetFiles){
 const d=xml(await zip.file(path).async('string'));const w=d.documentElement;const data=w.getElementsByTagNameNS(MAIN,'sheetData')[0];if(!data)continue;
 const rows=Array.from(data.getElementsByTagNameNS(MAIN,'row'));if(!rows.length)continue;
 const hr=rows[0];const hnum=Number(hr.getAttribute('r')||1);
 const cells=Array.from(hr.getElementsByTagNameNS(MAIN,'c'));
 if(!cells.length)continue;const colCount=cells.length, last=Number(rows[rows.length-1].getAttribute('r')||rows.length);
 if(last<=hnum)continue;
 const sheetRel=path.replace('xl/worksheets/','xl/worksheets/_rels/')+'.rels';
 const rr=xml('<?xml version="1.0"?><Relationships xmlns="'+PKG+'"/>');
 const used=new Set();const headers=cells.map((c,i)=>{
  let name=(c.getElementsByTagNameNS(MAIN,'t')[0]?.textContent||c.getElementsByTagNameNS(MAIN,'v')[0]?.textContent||'Columna '+(i+1)).trim();
  if(!name)name='Columna '+(i+1);const base=name;let n=2;while(used.has(name.toLowerCase()))name=base+' ('+(n++)+')';used.add(name.toLowerCase());
  if(name!==base){const t=c.getElementsByTagNameNS(MAIN,'t')[0];if(t)t.textContent=name;else {const v=c.getElementsByTagNameNS(MAIN,'v')[0];if(v)v.textContent=name;}}
  return name;
 });
 for(const r of rows){const num=Number(r.getAttribute('r')||0),variant=num===hnum?0:(num%2===0?2:1);for(const c of Array.from(r.getElementsByTagNameNS(MAIN,'c'))){const original=Number(c.getAttribute('s')||0);c.setAttribute('s',String(idx[variant][original]??idx[variant][0]));}if(num===hnum){r.setAttribute('ht','26');r.setAttribute('customHeight','1')}}
 // Las tablas proporcionan filtros propios, evitando un segundo filtro en la hoja.
 Array.from(w.getElementsByTagNameNS(MAIN,'autoFilter')).forEach(n=>{if(n.parentNode===w)w.removeChild(n)});
 const freeze=w.getElementsByTagNameNS(MAIN,'sheetViews')[0];if(!freeze){const sv=el(d,'sheetViews');const view=add(sv,d,'sheetView',{workbookViewId:0});add(view,d,'pane',{ySplit:hnum,topLeftCell:'A'+(hnum+1),activePane:'bottomLeft',state:'frozen'});w.insertBefore(sv,data)}
 const ref='A'+hnum+':'+excelCol(colCount)+last;ti++;
 const table=xml('<?xml version="1.0"?><table xmlns="'+MAIN+'"/>');const t=table.documentElement;t.setAttribute('id',String(ti));t.setAttribute('name','TablaHub'+ti);t.setAttribute('displayName','TablaHub'+ti);t.setAttribute('ref',ref);t.setAttribute('totalsRowShown','0');add(t,table,'autoFilter',{ref});const cs=add(t,table,'tableColumns',{count:colCount});headers.forEach((h,i)=>add(cs,table,'tableColumn',{id:i+1,name:h}));add(t,table,'tableStyleInfo',{name:'TableStyleMedium4',showFirstColumn:0,showLastColumn:0,showRowStripes:0,showColumnStripes:0});
 zip.file('xl/tables/table'+ti+'.xml',str(table));
 const re=rr.createElementNS(PKG,'Relationship');re.setAttribute('Id','rIdHubTable');re.setAttribute('Type',REL+'/table');re.setAttribute('Target','../tables/table'+ti+'.xml');rr.documentElement.appendChild(re);zip.file(sheetRel,str(rr));
 const tp=add(w,d,'tableParts',{count:1});const part=add(tp,d,'tablePart');part.setAttributeNS('http://www.w3.org/2000/xmlns/','xmlns:r',REL);part.setAttributeNS(REL,'r:id','rIdHubTable');
 zip.file(path,str(d));const ov=types.createElementNS(tns,'Override');ov.setAttribute('PartName','/xl/tables/table'+ti+'.xml');ov.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml');types.documentElement.appendChild(ov);
 }
 zip.file('[Content_Types].xml',str(types));
 return new Blob([await zip.generateAsync({type:'blob',compression:'DEFLATE'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
window.HubExcel={format};
})();
