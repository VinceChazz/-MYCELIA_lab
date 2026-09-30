import { lazy, Suspense, useCallback, useState } from 'react';
import { Layout } from './components/Layout';
import { ConfirmIrrigation, WhyDialog } from './components/Dialogs';
import { useFarmSystem } from './hooks/useFarmSystem';
import { Overview } from './pages/Overview';
import type { View } from './lib/types';

// Modules are replaceable and loaded only when a farmer opens them.
const Fields = lazy(() => import('./pages/Fields').then(m => ({default:m.Fields})));
const Crop = lazy(() => import('./pages/Crop').then(m => ({default:m.Crop})));
const Irrigation = lazy(() => import('./pages/Irrigation').then(m => ({default:m.Irrigation})));
const Weather = lazy(() => import('./pages/Weather').then(m => ({default:m.Weather})));
const Market = lazy(() => import('./pages/Market').then(m => ({default:m.Market})));
const Energy = lazy(() => import('./pages/Energy').then(m => ({default:m.Energy})));
const Assistant = lazy(() => import('./pages/Assistant').then(m => ({default:m.Assistant})));
const Activity = lazy(() => import('./pages/Activity').then(m => ({default:m.Activity})));
const Settings = lazy(() => import('./pages/Settings').then(m => ({default:m.Settings})));

export default function App() {
  const farm = useFarmSystem();
  const [view,setView] = useState<View>('overview');
  const [mobileOpen,setMobileOpen] = useState(false);
  const [why,setWhy] = useState<{id:string;kind:'health'|'irrigation'|'energy'} | null>(null);
  const [confirmId,setConfirmId] = useState<string|null>(null);
  const [prefill,setPrefill] = useState('');
  const [voiceRequest,setVoiceRequest] = useState(0);
  const navigate=(target:View)=>{setView(target);window.scrollTo({top:0,behavior:'smooth'});};
  const openField=(id:string)=>{farm.setSelectedFieldId(id);navigate('fields');};
  const explain=(id:string,kind:'health'|'irrigation'|'energy')=>setWhy({id,kind});
  const irrigate=(id:string)=>{farm.setSelectedFieldId(id);setConfirmId(id);};
  const ask=(prompt?:string,voice=false)=>{if(prompt)setPrefill(prompt);if(voice)setVoiceRequest(n=>n+1);navigate('assistant');};
  const clearPrefill=useCallback(()=>setPrefill(''),[]);
  const selected=farm.selected;
  const whyField=why&&farm.snapshot.fields.find(f=>f.id===why.id);
  const confirmField=confirmId&&farm.snapshot.fields.find(f=>f.id===confirmId);
  return <Layout view={view} navigate={navigate} farm={farm.snapshot.farm} fields={farm.snapshot.fields}
    selectedFieldId={selected.id} selectField={farm.setSelectedFieldId} connection={farm.connection} forcedOffline={farm.forcedOffline}
    toggleOffline={farm.setOffline} pending={farm.pending} alertCount={farm.snapshot.alerts.filter(a=>a.severity!=='INFO').length}
    mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}>
    <Suspense fallback={<div className="surface loading-panel" role="status">Opening your farm module…</div>}>
    {view==='overview'&&<Overview snapshot={farm.snapshot} selected={selected} connection={farm.connection} selectField={farm.setSelectedFieldId} navigate={navigate} openField={openField} why={explain} irrigate={irrigate} ask={ask}/>}
    {view==='fields'&&<Fields snapshot={farm.snapshot} selected={selected} selectField={farm.setSelectedFieldId} navigate={navigate} why={explain} irrigate={irrigate}/>}
    {view==='crop'&&<Crop snapshot={farm.snapshot} selected={selected} selectField={farm.setSelectedFieldId} navigate={navigate} why={explain}/>}
    {view==='irrigation'&&<Irrigation snapshot={farm.snapshot} selected={selected} navigate={navigate} why={explain} irrigate={irrigate} stop={(id,emergency)=>void farm.stopIrrigation(id,emergency)} reset={id=>{if(window.confirm('Have you inspected the equipment? Reset the simulated emergency latch?'))void farm.resetEmergency(id).then(issue=>{if(issue)farm.notify(issue);});}}/>}
    {view==='weather'&&<Weather snapshot={farm.snapshot} selected={selected} navigate={navigate} selectField={farm.setSelectedFieldId} refresh={()=>void farm.refreshFeeds()} why={explain}/>}
    {view==='market'&&<Market snapshot={farm.snapshot} selected={selected} selectField={farm.setSelectedFieldId} refresh={()=>void farm.refreshFeeds()} online={farm.online}/>}
    {view==='energy'&&<Energy selected={selected} navigate={navigate} why={explain}/>}
    {view==='assistant'&&<Assistant snapshot={farm.snapshot} selected={selected} messages={farm.messages} asking={farm.asking} askQuestion={farm.askQuestion}
      language={farm.language} setLanguage={farm.setPreferredLanguage} offline={farm.connection==='offline'||farm.forcedOffline}
      prefill={prefill} voiceRequest={voiceRequest} onPrefillHandled={clearPrefill} notify={farm.notify}/>}
    {view==='activity'&&<Activity snapshot={farm.snapshot} connection={farm.connection} pending={farm.pending} syncError={farm.syncError} forcedOffline={farm.forcedOffline}
      syncNow={farm.syncNow} setOffline={farm.setOffline} selectField={farm.setSelectedFieldId} navigate={navigate}/>}
    {view==='settings'&&<Settings snapshot={farm.snapshot} forcedOffline={farm.forcedOffline} setOffline={farm.setOffline} simulationRunning={farm.simulationRunning}
      setSimulationRunning={farm.setSimulationRunning} tick={farm.tick} resetDemo={farm.resetDemo} language={farm.language} setLanguage={farm.setPreferredLanguage} navigate={navigate}/>}
    </Suspense>
    {why&&whyField&&<WhyDialog field={whyField} kind={why.kind} onClose={()=>setWhy(null)}/>}
    {confirmId&&confirmField&&<ConfirmIrrigation field={confirmField} onClose={()=>setConfirmId(null)} onConfirm={minutes=>farm.startIrrigation(confirmId,minutes)}/>}
    {farm.toast&&<div className="toast" role="status"><span>{farm.toast}</span><button aria-label="Dismiss" onClick={()=>farm.notify('')}>×</button></div>}
  </Layout>;
}
