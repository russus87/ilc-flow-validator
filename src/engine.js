// Motore di validazione del flusso ILCM01 — logica pura (nessuna dipendenza dal browser).
// Usato sia dall'interfaccia (index.html) sia dai test.
(function(root){
  const M = root.ILC_MODEL;
  const byDisc = {}; M.entities.forEach(e=>byDisc[e.disc]=e);
  const byName = {}; M.entities.forEach(e=>byName[e.name]=e);
  const STREAM = "ILCM01"; // flusso atteso da questa lavorazione

  const trim = s => (s||"").replace(/\s+$/,'').replace(/^\s+/,'');
  const esc = s => (s==null?"":String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  function field(entity, line, name){
    const f = entity.fields.find(x=>x.name===name); if(!f) return "";
    if(f.off >= line.length) return "";
    return line.substr(f.off, f.len);
  }
  function allFields(entity, line){
    const o={};
    entity.fields.forEach(f=>{ o[f.name] = (f.off>=line.length)? "" : line.substr(f.off,f.len); });
    return o;
  }

  function parseFlow(text){
    const rows = text.split(/\r?\n/).map((l,i)=>({l, no:i+1})).filter(r=>r.l.trim()!=="");
    const model = {header:{}, footer:null, envelopes:[], unknown:[], overlong:[], streamsInDocs:{}, rows:rows.length};
    let curEnv=null, curDoc=null;
    for(const r of rows){
      const line=r.l;
      const st=line.substr(0,6), rt=line.substr(6,12);
      const ent=byDisc[rt];
      if(!ent){ model.unknown.push({no:r.no, rt, st, prefix:line.substr(0,30)}); continue; }
      if(line.length > ent.lineLen) model.overlong.push({no:r.no, name:ent.name, len:line.length, exp:ent.lineLen, st});
      const rec={st, ent, line, no:r.no, f:allFields(ent,line)};
      switch(ent.name){
        case "TemplateStartFile": model.header.start=rec; break;
        case "TemplateNoplFormat": model.header.nopl=rec; break;
        case "TemplateBollettino": model.header.bol=rec; break;
        case "TemplateEndFile": model.footer=rec; break;
        case "EnvelopeBegin": curEnv={begin:rec,nop0:null,end:null,docs:[]}; model.envelopes.push(curEnv); curDoc=null; break;
        case "EnvelopeNop0Format": if(curEnv) curEnv.nop0=rec; break;
        case "EnvelopeEnd": if(curEnv) curEnv.end=rec; curDoc=null; break;
        case "DocumentStart":
          curDoc={start:rec, st, headings:{}, template:"", lingua:"", streamilc:""};
          curDoc.streamilc = trim(field(ent,line,"streamilc"));
          curDoc.lingua = trim(field(ent,line,"lingua"));
          if(curEnv) curEnv.docs.push(curDoc);
          model.streamsInDocs[st]=(model.streamsInDocs[st]||0)+1;
          break;
        default:
          if(curDoc){
            curDoc.headings[ent.name]=rec;
            if(ent.name==="BodyLetterText") curDoc.template = trim(field(ent,line,"templateilc"));
          }
      }
    }
    model.docs=[];
    model.envelopes.forEach((e,ei)=> e.docs.forEach((d,di)=>{ d.env=e; d.envIdx=ei; d.docIdx=di; model.docs.push(d); }));
    return model;
  }

  function validate(m){
    const c=[]; const add=(level,title,detail)=>c.push({level,title,detail});
    add(m.rows>0?'ok':'error','File leggibile', m.rows>0? `Trovate ${m.rows} righe di dati.` : 'Il file è vuoto o non contiene righe valide.');
    const hasStart=!!m.header.start, hasEnd=!!m.footer;
    add(hasStart&&hasEnd?'ok':'error','Record di inizio e fine file',
        (hasStart?'Inizio file presente. ':'Manca il record di <b>inizio file</b>. ')+(hasEnd?'Fine file presente.':'Manca il record di <b>fine file</b>.'));
    const nb=m.envelopes.length, closed=m.envelopes.filter(e=>e.end).length;
    add(nb>0 && closed===nb?'ok': (nb===0?'error':'warn'),'Buste complete',
        nb===0?'Nessuna busta trovata nel file.':`${nb} buste, di cui ${closed} correttamente chiuse.`+(closed<nb?' Alcune buste non hanno il record di chiusura.':''));
    add(m.unknown.length===0?'ok':'error','Tutti i record riconosciuti',
        m.unknown.length===0?'Tutti i tipi di record corrispondono al tracciato ILCM01.':
        `${m.unknown.length} righe hanno un tipo di record sconosciuto (righe: ${m.unknown.slice(0,8).map(u=>u.no).join(', ')}${m.unknown.length>8?'…':''}).`);
    const streams=Object.keys(m.streamsInDocs);
    const others=streams.filter(s=>s.trim()!=="" && s!==STREAM);
    if(others.length===0){
      add('ok','Un solo flusso ('+STREAM+')', `Tutti i ${m.docs.length} documenti appartengono al flusso ${STREAM}, quello gestito da questa lavorazione.`);
    }else{
      const dett=others.map(s=>`<code>${esc(s)}</code> (${m.streamsInDocs[s]} documenti)`).join(', ');
      add('error','Flusso misto: presenti documenti di un altro flusso',
        `La lavorazione gestisce solo il flusso <code>${STREAM}</code>, ma il file contiene anche: ${dett}. `+
        `Questi documenti hanno gli stessi codici record di <code>${STREAM}</code> ma un contenuto diverso: verrebbero interpretati in modo errato e mandano il lotto in errore.`);
    }
    const noTpl=m.docs.filter(d=>!d.template);
    if(m.docs.length===0){ add('warn','Template di stampa','Nessun documento da verificare.'); }
    else if(noTpl.length===0){ add('ok','Template di stampa presente', `Tutti i ${m.docs.length} documenti indicano un template di stampa.`); }
    else{
      const perStream={}; noTpl.forEach(d=>{const s=d.st.trim()||'(vuoto)';perStream[s]=(perStream[s]||0)+1;});
      add('error','Documenti senza template di stampa',
        `${noTpl.length} documenti su ${m.docs.length} non hanno un template (campo del corpo lettera assente). Senza template il PDF non può essere generato → errore del lotto. `+
        `Dettaglio per flusso: ${Object.entries(perStream).map(([s,n])=>`<code>${esc(s)}</code>: ${n}`).join(', ')}.`);
    }
    if(m.overlong.length>0){
      add('warn','Righe più lunghe del tracciato',
        `${m.overlong.length} righe superano la lunghezza prevista: i caratteri in eccesso vengono ignorati. Spesso è normale, ma può indicare dati non mappati.`);
    }else{
      add('ok','Lunghezza delle righe','Nessuna riga supera la lunghezza prevista dal tracciato.');
    }
    return c;
  }

  function resolveSource(src, ctx){
    const parts = src.split('.');
    const head = parts[0];
    const map = {
      "EnvelopeBegin": ctx.env&&ctx.env.begin, "EnvelopeNop0Format": ctx.env&&ctx.env.nop0,
      "TemplateNoplFormat": ctx.m.header.nopl, "TemplateEndFile": ctx.m.footer, "TemplateBollettino": ctx.m.header.bol
    };
    if(map[head]!==undefined){
      const rec=map[head];
      if(!rec) return {val:"", calc:false};
      return {val: trim(rec.f[parts[1]])||"", calc:false};
    }
    if(head==="DocProperties"){
      if(parts[1]==="templateilc") return {val: ctx.doc.template||"", calc:false};
      if(parts[1]==="lingua") return {val: ctx.doc.lingua||"", calc:false};
      if(parts[1]==="streamilc") return {val: ctx.doc.streamilc||"", calc:false};
    }
    return {val:"", calc:true};
  }
  function cellFor(f, ctx){
    if(f.computed) return {calc:true, text: f.note||"«calcolato in stampa»"};
    const r=resolveSource(f.src, ctx);
    if(r.calc) return {calc:true, text: f.note||"«calcolato in stampa»"};
    return {calc:false, text: r.val};
  }

  // --- Ricostruzione fedele dell'oggetto di staging + XML (come StagingAreaToXML) ---
  // StagingAreaToXMLExtension serializza il JSON di ogni documento e lo converte in XML
  // con JsonConvert.DeserializeXmlNode: i tag interni sono quindi i nomi reali dei campi.
  function fieldsObj(rec, exclude){
    const o={};
    for(const k in rec.f){ if(exclude && exclude.includes(k)) continue; o[k]=trim(rec.f[k]); }
    return o;
  }
  const CHILD_ORDER = ['HeadingBranchAddress','HeadingAddress','HeadingAddressEpc','HeadingPlaceDate',
    'HeadingFlagEpc','HeadingFlagRaccomandata','HeadingImageSottoLogo','HeadingDocumentTitle',
    'Signature1','Signature2','OnBehalfOf','AccompanyingLetter','BodyLetterVariables1','BodyLetterVariables2',
    'BodyAttachmentText','BodyAttachmentVariables'];
  function buildDocObject(m, doc){
    const out={};
    const ilc = fieldsObj(doc.start, ['streamType','recordType','lingua','streamilc']);
    for(const nm of CHILD_ORDER){ if(doc.headings[nm]) ilc[nm]=fieldsObj(doc.headings[nm],['streamType','recordType']); }
    // templateilc (dal BodyLetterText) e lingua/streamilc (dal DocumentStart) sono rimappati sotto DocProperties
    ilc['DocProperties']={ templateilc: doc.template, lingua: doc.lingua, streamilc: doc.streamilc };
    out['ILC']=ilc;
    // oggetti "pinned" uniti a ogni documento
    if(m.header.start) out['TemplateStartFile']=fieldsObj(m.header.start,['streamType','recordType']);
    if(m.header.nopl)  out['TemplateNoplFormat']=fieldsObj(m.header.nopl,['streamType','recordType']);
    if(doc.env.begin)  out['EnvelopeBegin']=fieldsObj(doc.env.begin,['streamType','recordType']);
    if(doc.env.nop0)   out['EnvelopeNop0Format']=fieldsObj(doc.env.nop0,['streamType','recordType']);
    return out;
  }
  function objToXml(obj, indent){
    let s=''; const pad='  '.repeat(indent);
    for(const k in obj){
      const v=obj[k];
      if(v && typeof v==='object') s+=`${pad}<${k}>\n${objToXml(v,indent+1)}${pad}</${k}>\n`;
      else s+= (v==='' ? `${pad}<${k}/>\n` : `${pad}<${k}>${esc(v)}</${k}>\n`);
    }
    return s;
  }
  // XReport (il file <lotto>.xml): dump <Documents><Document> del contenuto documento.
  function buildXReportXml(m){
    let x='<?xml version="1.0" encoding="UTF-8"?>\n<Documents>\n';
    m.docs.forEach(d=>{ x+='  <Document>\n'+objToXml(buildDocObject(m,d),2)+'  </Document>\n'; });
    x+='</Documents>';
    return x;
  }

  // cust_data.xml: stessa logica dell'estensione StagingAreaProcessing.
  // <DATASET><GLOBAL RECAPITISTA="..."/> + una <BUSTA ID=coduni> per busta con ADDCART1..5.
  // RECAPITISTA = TemplateNoplFormat.codrecap (DelivererFieldPath); ID busta = EnvelopeNop0Format.coduni;
  // ADDCART1..5 = EnvelopeNop0Format.addcart1..5; dedup per coduni (una <BUSTA> per busta).
  function attr(s){ return esc(s).replace(/"/g,'&quot;'); }
  function buildCustDataXml(m){
    const recap = m.header.nopl ? trim(m.header.nopl.f.codrecap) : "";
    let x='<?xml version="1.0" encoding="UTF-8"?>\n<DATASET>\n';
    x+=`  <GLOBAL RECAPITISTA="${attr(recap)}" />\n`;
    const seen = new Set();
    m.envelopes.forEach(e=>{
      if(!e.nop0) return;
      const f=e.nop0.f;
      const id=trim(f.coduni);
      if(!id || seen.has(id)) return;
      seen.add(id);
      x+=`  <BUSTA ID="${attr(id)}">\n`;
      for(let n=1;n<=5;n++) x+=`    <ADDCART${n}>${esc(trim(f["addcart"+n]))}</ADDCART${n}>\n`;
      x+='  </BUSTA>\n';
    });
    x+='</DATASET>';
    return x;
  }

  // Ricostruzione testuale a larghezza fissa di .bol / .dat (intestazione + una riga per documento).
  // Padding: stringhe giustificate a sinistra (spazi a destra), numerici a destra (zeri a sinistra).
  // I campi calcolati a runtime (nomi PDF, pagine, fogli) restano vuoti nell'anteprima.
  function pad(value, len, type){
    let v = value == null ? '' : String(value);
    if(v.length > len) v = v.substr(0, len);
    return type === 'num' ? v.padStart(len, '0') : v.padEnd(len, ' ');
  }
  function buildFlatText(m, fields, ctxs){
    return ctxs.map(ctx => fields.map(f => {
      const c = cellFor(f, ctx);
      return pad(c.calc ? '' : c.text, f.len, f.type);
    }).join('')).join('\n');
  }
  function buildBolText(m){
    return buildFlatText(m, M.outputs.bolHeader, [{m, env:null, doc:null}]) + '\n' +
           buildFlatText(m, M.outputs.bolData, m.docs.map(d => ({m, env:d.env, doc:d})));
  }
  function buildDatText(m){
    return buildFlatText(m, M.outputs.datHeader, [{m, env:null, doc:null}]) + '\n' +
           buildFlatText(m, M.outputs.datData, m.docs.map(d => ({m, env:d.env, doc:d})));
  }

  root.ILC_ENGINE = { M, byDisc, byName, STREAM, trim, esc, field, allFields, parseFlow, validate, resolveSource, cellFor, buildDocObject, buildXReportXml, buildCustDataXml, buildBolText, buildDatText };
})(typeof window!=='undefined'? window : global);
