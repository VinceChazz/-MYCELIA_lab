import { Activity, ArrowRight, Database, Globe2, HardDrive, LockKeyhole, Play, Radio, RefreshCw, RotateCcw, ShieldCheck, Smartphone, WifiOff } from 'lucide-react';
import { StatusBadge } from '../components/Shared';
import type { FarmSnapshot, LanguageCode, View } from '../lib/types';

const langs: {code:LanguageCode;name:string}[] = [
  {code:'en',name:'English'},{code:'hi',name:'हिन्दी · Hindi'},{code:'te',name:'తెలుగు · Telugu'},
  {code:'mr',name:'मराठी · Marathi'},{code:'ta',name:'தமிழ் · Tamil'},{code:'kn',name:'ಕನ್ನಡ · Kannada'},
  {code:'bn',name:'বাংলা · Bengali'},{code:'gu',name:'ગુજરાતી · Gujarati'},{code:'pa',name:'ਪੰਜਾਬੀ · Punjabi'},
];

export function Settings({snapshot,forcedOffline,setOffline,simulationRunning,setSimulationRunning,tick,resetDemo,language,setLanguage,navigate}: {
  snapshot:FarmSnapshot;forcedOffline:boolean;setOffline:(v:boolean)=>Promise<void>;simulationRunning:boolean;
  setSimulationRunning:(v:boolean)=>void;tick:()=>Promise<void>;resetDemo:()=>Promise<void>;
  language:LanguageCode;setLanguage:(v:LanguageCode)=>void;navigate:(v:View)=>void}) {
  return <div className="page-stack"><div className="page-intro"><div><p className="eyebrow">YOUR FARM, YOUR SETTINGS</p><h1>Make it yours.</h1><p>Control the demo, your language and how your data is saved.</p></div><StatusBadge label="Demo Mode" tone="green"/></div>
    <div className="settings-grid"><section className="surface settings-card"><div className="settings-card-head"><span><Activity size={21}/></span><div><p className="eyebrow">DEMONSTRATION CONTROLS</p><h2>See the system in action.</h2></div></div>
      <div className="settings-row"><div><strong>Simulate offline mode</strong><small>Keep using local sensors, crop models, advisory and memory.</small></div><button className={`toggle-switch ${forcedOffline?'toggle-switch--on':''}`} role="switch" aria-checked={forcedOffline} aria-label="Simulate offline mode" onClick={()=>void setOffline(!forcedOffline)}><i/></button></div>
      <div className="settings-row"><div><strong>Simulated sensor stream</strong><small>New readings every 12 seconds; 3 demo minutes per pump tick.</small></div><button className={`toggle-switch ${simulationRunning?'toggle-switch--on':''}`} role="switch" aria-checked={simulationRunning} aria-label="Sensor simulation" onClick={()=>setSimulationRunning(!simulationRunning)}><i/></button></div>
      <div className="settings-actions"><button className="button button--secondary" onClick={()=>void tick()}><Play size={15}/> Generate a reading</button><button className="button button--ghost-danger" onClick={()=>void resetDemo()}><RotateCcw size={16}/> Reset local demo</button></div></section>
      <section className="surface settings-card"><div className="settings-card-head"><span><Globe2 size={21}/></span><div><p className="eyebrow">FARMER ACCESSIBILITY</p><h2>Speak your language.</h2></div></div><label className="form-label">Assistant language<select value={language} onChange={e=>setLanguage(e.target.value as LanguageCode)}>{langs.map(l=><option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
        <p className="settings-description">Offline advisory covers common farm questions. Browser voice input works when your device supports it; local speech models can be added later. Text always works.</p><button className="text-button" onClick={()=>navigate('assistant')}>Open the assistant <ArrowRight size={16}/></button></section>
      <section className="surface settings-card"><div className="settings-card-head"><span><HardDrive size={21}/></span><div><p className="eyebrow">OFFLINE STORAGE</p><h2>Saved on this device.</h2></div></div>
        <div className="settings-fact"><Database size={18}/><span>IndexedDB keeps the last farm picture, chat history and unsent records on this device.</span></div><div className="settings-fact"><RefreshCw size={18}/><span>The local server stores farm history in SQLite. Duplicate sync operations are safely ignored.</span></div><div className="settings-fact"><Smartphone size={18}/><span>Install the built PWA to open the interface after the network drops.</span></div><button className="text-button" onClick={()=>navigate('activity')}>View sync status <ArrowRight size={16}/></button></section>
      <section className="surface settings-card"><div className="settings-card-head"><span><ShieldCheck size={21}/></span><div><p className="eyebrow">SAFETY & TRANSPARENCY</p><h2>Farmer first. Always.</h2></div></div><div className="settings-fact"><LockKeyhole size={18}/><span>AI API keys live only on the server, loaded from environment variables.</span></div><div className="settings-fact"><Radio size={18}/><span>Real hardware is not connected. Only a simulated pump can run in Demo Mode.</span></div><div className="settings-fact"><WifiOff size={18}/><span>Queued offline pump events are history only and never replay as actuator commands.</span></div></section></div>
    <section className="settings-data-banner"><strong>About this demo</strong><span>{snapshot.fields.length} simulated fields in {snapshot.farm.village}, {snapshot.farm.district}. Sensor, satellite, weather, market and energy data are illustrative. The app is not a source of official agronomic or mandi information.</span></section>
  </div>;
}
