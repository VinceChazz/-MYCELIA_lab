import { AlertCircle, ArrowRight, Check, CheckCheck, CloudUpload, Database, Droplets, Info, Leaf, RefreshCw, ShieldAlert, SunMedium, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { timeAgo } from '../lib/model';
import { SectionHeading, SeverityBadge, SourceNote } from '../components/Shared';
import type { ConnectionState, FarmSnapshot, View } from '../lib/types';

type Event = {id:number;timestamp:string;kind:string;field_id:string|null;detail:Record<string,unknown>};
const labels:Record<string,string>={demo_seeded:'Demo farm prepared',sensor_ingested:'Sensor reading saved',irrigation_started:'Farmer confirmed irrigation',
  irrigation_stopped:'Irrigation cycle stopped',emergency_stop:'Emergency shutoff',ai_recommendation:'Advisory recorded',
  sync_accepted:'Device record synchronized',sync_rejected:'Sync record needs attention',ai_fallback:'AI fallback used',
  offline_irrigation_recorded:'Offline irrigation event saved',weather_refresh_failed:'Weather feed unavailable',market_refresh_failed:'Market feed unavailable'};

export function Activity({snapshot,connection,pending,syncError,forcedOffline,syncNow,setOffline,selectField,navigate}: {
  snapshot:FarmSnapshot;connection:ConnectionState;pending:number;syncError:string;forcedOffline:boolean;syncNow:()=>Promise<boolean>;
  setOffline:(value:boolean)=>Promise<void>;selectField:(id:string)=>void;navigate:(view:View)=>void}) {
  const [events,setEvents] = useState<Event[]>([]);
  const [eventSource,setEventSource] = useState('local activity');
  useEffect(()=>{
    try { const cached=JSON.parse(localStorage.getItem('rtp:events')??'[]') as Event[];setEvents(cached); }
    catch { /* no cached events */ }
    if (forcedOffline || connection==='offline') return;
    let active=true;
    void api<Event[]>('/events?limit=15',{timeoutMs:3500}).then(data=>{if(active){setEvents(data);setEventSource('local server audit log');
      try{localStorage.setItem('rtp:events',JSON.stringify(data));}catch{ /* storage full */ }}}).catch(()=>{if(active)setEventSource('last saved activity');});
    return()=>{active=false;};
  },[connection,forcedOffline,pending]);
  const severityCount={warning:snapshot.alerts.filter(a=>a.severity==='WARNING').length,critical:snapshot.alerts.filter(a=>a.severity==='CRITICAL').length};
  return <div className="page-stack"><div className="page-intro"><div><p className="eyebrow">ALERTS + OFFLINE SYNCHRONIZATION</p><h1>Nothing gets lost.</h1><p>Important changes, saved locally and ready when you reconnect.</p></div><button className="button button--secondary" onClick={()=>void syncNow()} disabled={forcedOffline||connection==='syncing'}><RefreshCw size={16} className={connection==='syncing'?'spin':''}/> Sync now</button></div>
    <div className="activity-summary"><div className="surface activity-count"><span><AlertCircle size={20}/></span><strong>{severityCount.warning+severityCount.critical}</strong><small>fields needing attention</small></div><div className="surface activity-count"><span><Database size={20}/></span><strong>{pending}</strong><small>records waiting to sync</small></div><div className="surface activity-count"><span><CheckCheck size={20}/></span><strong>{snapshot.sync.device_records_received}</strong><small>received by local server*</small></div></div>
    <div className="activity-grid"><section className="surface alerts-panel"><SectionHeading eyebrow="FIELD ALERTS" title="What needs a closer look" description="Alerts are generated locally from observed data and transparent rules."/>
      <div className="alerts-list">{snapshot.alerts.length===0?<div className="empty-alerts"><Check size={20}/> No alerts right now. Keep monitoring.</div>:
        snapshot.alerts.map(alert=><button className="alert-row" key={alert.id} onClick={()=>{if(alert.field_id)selectField(alert.field_id);navigate(alert.type.includes('VEGETATION')?'crop':alert.type.includes('ENERGY')?'energy':'irrigation');}}>
          <span className={`alert-icon alert-icon--${alert.severity.toLowerCase()}`}>{alert.type.includes('ENERGY')?<SunMedium size={20}/>:alert.type.includes('VEGETATION')?<Leaf size={20}/>:alert.type.includes('MOISTURE')?<Droplets size={20}/>:alert.severity==='INFO'?<Info size={20}/>:<ShieldAlert size={20}/>}</span>
          <span><strong>{alert.type}</strong><small>{alert.message}</small><em>Source: {alert.source}</em></span><SeverityBadge severity={alert.severity}/><ArrowRight size={16} className="alert-arrow"/></button>)}</div></section>
      <section className="surface sync-panel"><span className="sync-panel-icon">{connection==='offline'?<WifiOff size={24}/>:<CloudUpload size={24}/>}</span><p className="eyebrow">OFFLINE-FIRST BY DESIGN</p><h2>{connection==='offline'?'Still working. Still saving.':connection==='failed'?'Your data is safe. Try again.':'Your records stay with you.'}</h2><p>Sensor readings, questions and simulated irrigation events are written to this device first. When connected, they are sent to the local FastAPI / SQLite server with duplicate protection.</p>
        <div className="sync-steps"><div className="sync-step sync-step--done"><i><Check size={14}/></i><span>Saved on this device</span></div><div className={connection==='offline'?'sync-step':'sync-step sync-step--done'}><i>{connection==='offline'?'2':<Check size={14}/>}</i><span>{connection==='offline'?'Waiting for connection':'Connection detected'}</span></div><div className={pending===0&&connection!=='offline'?'sync-step sync-step--done':'sync-step'}><i>{pending===0&&connection!=='offline'?<Check size={14}/>:3}</i><span>{pending===0&&connection!=='offline'?'Confirmed by local server':`${pending} waiting to send`}</span></div></div>
        {syncError&&<p className="sync-error" role="alert"><AlertCircle size={16}/>{syncError}</p>}
        <button className="button button--primary button--full" onClick={()=>forcedOffline?void setOffline(false):void syncNow()} disabled={connection==='syncing'}>{forcedOffline?'Reconnect & sync':'Sync saved records'}<ArrowRight size={16}/></button>
        <div className="sync-local-only"><Database size={15}/> {snapshot.sync.upstream_configured?`${snapshot.sync.upstream_pending} waiting for optional cloud uplink`:'Cloud uplink not configured. Local SQLite is the confirmed server store.'}</div></section></div>
    <section className="surface event-panel"><SectionHeading eyebrow="AUDIT TRAIL" title="A record of what happened" description="Readings, advice and commands are logged. Offline events sync as history, never as delayed pump commands."/>
      <div className="event-list">{events.length?events.slice(0,10).map(event=><div key={event.id} className="event-row"><span className="event-bullet"/><div><strong>{labels[event.kind]??event.kind.replaceAll('_',' ')}</strong><small>{event.field_id?.replace('_',' ')??'Demo Farm'} · {timeAgo(event.timestamp)}</small></div></div>):<div className="empty-events">No saved server events yet. Sensor activity continues locally while offline.</div>}</div>
      <SourceNote>{eventSource} · server logs require a connection; local farm data is always available</SourceNote></section>
    <p className="under-page-note">* The counter reflects the last downloaded server snapshot. Use Sync now for a fresh confirmation. There is no cloud upload unless you configure an upstream endpoint.</p>
  </div>;
}
