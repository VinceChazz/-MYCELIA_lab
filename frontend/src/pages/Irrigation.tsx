import { AlertOctagon, AlertTriangle, ArrowRight, Check, CircleHelp, Clock3, Droplets, Gauge, LockKeyhole, Play, ShieldCheck, Square, Waves } from 'lucide-react';
import { DataChart } from '../components/Charts';
import { SectionHeading, SourceNote, StatusBadge, WhyButton } from '../components/Shared';
import { clockAgeMinutes, timeAgo } from '../lib/model';
import type { FarmSnapshot, FieldData, View } from '../lib/types';

export function Irrigation({snapshot,selected,navigate,why,irrigate,stop,reset}: {snapshot:FarmSnapshot;selected:FieldData;navigate:(v:View)=>void;
  why:(id:string,kind:'irrigation')=>void;irrigate:(id:string)=>void;stop:(id:string,emergency?:boolean)=>void;reset:(id:string)=>void}) {
  const plan = selected.irrigation, pump = selected.pump, sensor = selected.sensor;
  const farmWater = snapshot.fields.reduce((sum,f)=>sum+f.pump.today_water_liters,0);
  const chart = selected.sensor_history.slice(-20).map(o=>({label:new Date(o.timestamp).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}),moisture:o.soil_moisture}));
  const safety = [
    {label:'Sensor data reliable',detail:`Updated ${timeAgo(sensor.timestamp)}`,ok:clockAgeMinutes(sensor.timestamp)<=90 && sensor.quality==='valid'},
    {label:'Water in tank',detail:`${sensor.water_level}% available`,ok:sensor.water_level>=15},
    {label:'Renewable energy',detail:`${selected.energy.solar_kw} kW solar · ${selected.energy.battery_pct}% stored`,ok:selected.energy.solar_kw>=.6 || selected.energy.battery_pct>=20},
    {label:'Pump ready',detail:pump.status==='OFF'?'Off · ready to start':pump.status==='ON'?'Running · flow monitored':'Fault · inspect hardware',ok:pump.status!=='FAULT'},
  ];
  return <div className="page-stack">
    <div className="page-intro"><div><p className="eyebrow">PRECISION IRRIGATION / {selected.name.toUpperCase()}</p><h1>Every drop, with purpose.</h1><p>A clear water plan. Safe controls. Your decision, always.</p></div><StatusBadge label="Farmer approval required" tone="blue"/></div>
    <div className="irrigation-top"><section className={`irrigation-plan ${plan.needed?'irrigation-plan--needed':''}`}><div className="plan-head"><span className="irrigation-plan-icon"><Droplets size={23}/></span><StatusBadge label={`${plan.priority} PRIORITY`} tone={plan.priority==='HIGH'?'amber':'green'}/></div>
      <p className="eyebrow">RECOMMENDED FOR {selected.name.toUpperCase()}</p><h2>{plan.recommendation}</h2><p className="plan-description">{plan.needed ? `${selected.crop} at ${selected.growth.stage.toLowerCase()} stage · soil moisture is ${sensor.soil_moisture.toFixed(1)}%, below the ${plan.threshold}% target.` : `Soil moisture is ${sensor.soil_moisture.toFixed(1)}%. Keep monitoring before the next cycle.`}</p>
      <div className="irrigation-estimates"><div><span>Suggested duration</span><strong>{plan.duration_min}<small> min</small></strong></div><div><span>Water estimate</span><strong>{plan.water_liters_est}<small> L</small></strong></div><div><span>Energy estimate</span><strong>{plan.energy_kwh_est}<small> kWh</small></strong></div></div>
      <div className="irrigation-plan-actions"><button className="button button--primary" disabled={!plan.needed||!plan.safety.allowed||pump.status!=='OFF'} onClick={()=>irrigate(selected.id)}><Play size={17} fill="currentColor"/> Plan & confirm cycle</button><WhyButton onClick={()=>why(selected.id,'irrigation')} label="Why irrigate?"/></div>
      {!plan.safety.allowed && pump.status!=='ON' && <div className="warning-strip"><AlertTriangle size={18}/>{plan.safety.reasons[0]}</div>}
      <span className="plan-disclaimer"><LockKeyhole size={14}/> No pump can start without deterministic safety checks and farmer confirmation.</span></section>
      <section className="pump-panel"><div className="pump-panel-top"><div><p className="eyebrow">SIMULATED PUMP CONTROLLER</p><h2>Water, in your hands.</h2></div><span className={`pump-status ${pump.status==='ON'?'pump-status--on':pump.status==='FAULT'?'pump-status--fault':''}`}><i/>{pump.status}</span></div>
        <div className="pump-visual"><div className={`pump-ring ${pump.status==='ON'?'pump-ring--on':''}`}><Waves size={38} strokeWidth={1.6}/></div><div><small>WATER FLOW</small><strong>{pump.flow_rate.toFixed(0)} <span>L/min</span></strong>{pump.status==='ON'&&<p>{pump.elapsed_demo_min??0} of {pump.duration_min} demo minutes elapsed</p>}</div></div>
        <div className="pump-progress"><div><span>TODAY'S WATER USE · ALL FIELDS</span><strong>{farmWater.toLocaleString('en-IN')} / 1,500 L</strong></div><div className="pump-track"><i style={{width:`${Math.min(100,farmWater/1500*100)}%`}}/></div><div className="pump-progress-bottom"><span>Simulated daily target</span><span>Up to {pump.water_saved_pct}% less vs. a demo baseline*</span></div></div>
        {pump.status==='ON' && <div className="pump-buttons"><button className="button button--pump-stop" onClick={()=>stop(selected.id)}><Square size={16} fill="currentColor"/> Stop cycle</button><button className="button button--emergency" onClick={()=>stop(selected.id,true)}><AlertOctagon size={17}/> Emergency stop</button></div>}
        {pump.status==='FAULT' && <button className="button button--pump-stop" onClick={()=>reset(selected.id)}><ShieldCheck size={16}/> Reset after inspection</button>}
        <p className="pump-footnote">* Illustrative comparison, not a measured farm saving. No physical pump is connected.</p></section></div>
    <div className="irrigation-bottom"><section className="surface irrigation-chart"><SectionHeading eyebrow="GROUND TRUTH" title="Moisture through the day" description="Local sensor history continues collecting while offline."/>
      <DataChart data={chart} series={[{key:'moisture',label:'Soil moisture',color:'#328c88'}]} unit="%" reference={plan.threshold} height={248}/><div className="chart-key"><span><i className="chart-key-green"/> Soil moisture</span><span><i className="chart-key-orange"/> Crop-stage target ({plan.threshold}%)</span></div><SourceNote>Readings: {sensor.source} · sensor age {timeAgo(sensor.timestamp)}</SourceNote></section>
      <section className="surface safety-panel"><div className="mini-section-heading"><div><p className="eyebrow">BEFORE YOU WATER</p><h2>A safety check, every time.</h2></div><ShieldCheck size={22} className="safety-panel-icon"/></div>
        <div className="safety-list">{safety.map(item=><div key={item.label} className="safety-item"><span className={item.ok?'safety-icon-ok':'safety-icon-bad'}>{item.ok?<Check size={16}/>:<AlertTriangle size={16}/>}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><span className={item.ok?'safety-text-ok':'safety-text-bad'}>{item.ok?'OK':'CHECK'}</span></div>)}</div>
        <div className="safety-note"><Gauge size={19}/><span>Flow is verified after starting. No flow, unreliable sensors, low water or low power blocks automatic operation.</span></div>
        <button className="text-button" onClick={()=>navigate('energy')}>See available energy <ArrowRight size={15}/></button></section></div>
    <section className="surface irrigation-history"><SectionHeading eyebrow="FIELD HISTORY" title="Previous water cycles" description="Events are recorded locally, even with no internet."/>
      <div className="history-grid">{selected.irrigation_history.slice(-3).reverse().map(event=><div className="history-entry" key={event.id}><span className="history-entry-icon"><Clock3 size={18}/></span><div><strong>{event.status==='completed'?'Completed irrigation':event.status}</strong><small>{timeAgo(event.started_at)} · {event.source}</small></div><span>{event.water_liters.toFixed(0)} L</span></div>)}</div>
      <div className="history-hint"><CircleHelp size={15}/> The AI may explain a plan but cannot bypass the safety rule engine.</div></section>
  </div>;
}
