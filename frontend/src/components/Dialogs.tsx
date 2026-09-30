import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CircleHelp, Droplets, ShieldCheck, Sun, X } from 'lucide-react';
import { checkSafety, timeAgo } from '../lib/model';
import type { FieldData } from '../lib/types';

type WhyKind = 'health' | 'irrigation' | 'energy';
export function WhyDialog({field,kind,onClose}: {field:FieldData;kind:WhyKind;onClose:()=>void}) {
  useEffect(()=>{ const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
  const irrigation = kind==='irrigation';
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="dialog why-dialog" role="dialog" aria-modal="true" aria-labelledby="why-title"><div className="dialog-top"><span className="dialog-icon"><CircleHelp size={23}/></span><button className="icon-button" aria-label="Close explanation" onClick={onClose}><X size={20}/></button></div>
      <p className="eyebrow">SHOW YOUR WORK</p><h2 id="why-title">Why {irrigation ? 'this irrigation advice' : kind==='energy' ? 'this energy status' : 'this crop-health estimate'}?</h2>
      <p className="dialog-lead">Here is what we observed, what the local model inferred, and what we suggest you do. A model estimate is not a confirmed diagnosis.</p>
      {kind==='energy' ? <>
        <div className="evidence-group"><h3>01 <span>Observed / simulated signals</span></h3><div className="evidence-list">
          {[['Solar output',`${field.energy.solar_kw} kW`],['Battery / capacitor',`${field.energy.battery_pct}%`],['RTP node voltage',`${field.energy.node_voltage.toFixed(2)} V`],['Communication',field.energy.comm_status]].map(([label,value])=><div className="evidence-row" key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div></div><div className="evidence-group"><h3>02 <span>Rule-based interpretation</span></h3><p>{field.energy.energy_status==='SUFFICIENT'?'Available solar or storage meets the demo pump energy threshold.':'Available solar and storage are below the demo pump energy threshold.'}</p><p>Node voltage can vary with its environment; it does <strong>not</strong> directly measure plant health.</p></div>
      </> : <>
        <div className="evidence-group"><h3>01 <span>Observed data</span></h3><div className="evidence-list">{(irrigation ? field.irrigation.why : field.health.observed).map(e=><div className="evidence-row" key={e.label}><span>{e.label}<small>{e.kind ?? e.source}{e.timestamp ? ` · ${timeAgo(e.timestamp)}` : ''}</small></span><strong>{e.label==='Last irrigation' && e.value.includes('T') ? timeAgo(e.value) : e.value}</strong></div>)}</div></div>
        <div className="evidence-group"><h3>02 <span>Model inference</span></h3><p>{irrigation ? `The local crop model estimates a ${field.irrigation.threshold}% moisture threshold at the ${field.growth.stage.toLowerCase()} stage. ${field.irrigation.needed ? 'Soil is below that threshold. The rule engine suggests '+field.irrigation.duration_min+' minutes; rain chance is '+field.irrigation.why[2].value+'.' : 'Current conditions do not call for irrigation.'}` : field.health.inference}</p>
          {!irrigation && <span className="confidence-inline">Model confidence: {Math.round(field.health.confidence*100)}% · source: {field.health.model}</span>}</div>
        <div className="evidence-group"><h3>03 <span>Suggested next step</span></h3><p>{irrigation ? field.irrigation.recommendation + '. Inspect the field and confirm before any simulated pump action.' : field.health.advice}</p></div>
      </>}
      <div className="dialog-footnote"><ShieldCheck size={17}/><span>Safety rules and farmer confirmation always come before pump control. Satellite and sensor readings here are simulated.</span></div>
      <button className="button button--primary dialog-done" onClick={onClose}>Got it <Check size={16}/></button>
    </div></div>;
}

export function ConfirmIrrigation({field,onClose,onConfirm}: {field:FieldData;onClose:()=>void;onConfirm:(minutes:number)=>Promise<string|null>}) {
  const [duration,setDuration] = useState(field.irrigation.duration_min || 18);
  const [typed,setTyped] = useState(''); const [checked,setChecked] = useState(false);
  const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  const checkedSafety = checkSafety(field.sensor,field.pump,field.energy,duration);
  const safety = duration > field.irrigation.duration_min ?
    {...checkedSafety,allowed:false,reasons:[`Duration exceeds the local plan (${field.irrigation.duration_min} min maximum).`]} : checkedSafety;
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { const issue = await onConfirm(duration); if(issue)setError(issue); else onClose(); }
    catch(e) {setError(e instanceof Error ? e.message : 'Could not start simulated irrigation.');}
    finally {setBusy(false);}
  };
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="dialog confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className="dialog-top"><span className="dialog-icon dialog-icon--water"><Droplets size={24}/></span><button className="icon-button" onClick={onClose} aria-label="Close confirmation"><X size={20}/></button></div>
      <p className="eyebrow">FARMER CONFIRMATION REQUIRED</p><h2 id="confirm-title">Start simulated irrigation?</h2>
      <p className="dialog-lead">Please inspect <strong>{field.name} · {field.crop}</strong> and confirm the plan. This demo controls no physical pump.</p>
      <div className="confirm-metrics"><div><Droplets size={18}/><span>Estimated water</span><strong>{duration*16} L</strong></div><div><Sun size={18}/><span>Estimated energy</span><strong>{(duration/60*.85).toFixed(2)} kWh</strong></div></div>
      <form onSubmit={e=>void submit(e)}><label className="form-label">Duration (minutes) <span>Plan limit: {field.irrigation.duration_min} min · hard limit: 45</span><input type="number" min="1" max={field.irrigation.duration_min} step="1" value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label>
        <div className={`safety-check ${safety.allowed?'safety-check--ok':'safety-check--blocked'}`}><span>{safety.allowed?<ShieldCheck size={19}/>:<AlertTriangle size={19}/>}</span><div><strong>{safety.allowed?'Safety checks passed':'Cannot start automatically'}</strong><p>{safety.allowed?'Sensor fresh · tank has water · energy available · pump off':safety.reasons.join('. ')}</p></div></div>
        <label className="form-label">Type <strong>{field.name}</strong> to confirm <input type="text" autoComplete="off" placeholder={field.name} value={typed} onChange={e=>setTyped(e.target.value)}/></label>
        <label className="check-label"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>I inspected the field and approve this <strong>simulated</strong> cycle.</span></label>
        {error && <p className="form-error" role="alert"><AlertTriangle size={16}/>{error}</p>}
        <button type="submit" className="button button--primary button--full" disabled={busy||!safety.allowed||typed.trim()!==field.name||!checked}>{busy?'Checking safety…':'Confirm & start simulation'}<ArrowRight size={17}/></button>
      </form><p className="dialog-small">The AI cannot start the pump. Offline commands are never replayed to hardware on reconnection.</p>
    </div></div>;
}
