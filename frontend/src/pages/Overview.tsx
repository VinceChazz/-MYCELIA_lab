import { ArrowRight, ArrowUpRight, BatteryFull, CloudSun, Droplets, Leaf, MessageCircle, Mic, MoveUpRight, Radio, ShieldCheck, Sprout, SunMedium, Waves, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { FieldMap } from '../components/FieldMap';
import { Sparkline } from '../components/Sparkline';
import { SectionHeading, SourceNote, StatusBadge, WhyButton } from '../components/Shared';
import { timeAgo } from '../lib/model';
import type { ConnectionState, FarmSnapshot, FieldData, View } from '../lib/types';

type Props = {snapshot:FarmSnapshot;selected:FieldData;connection:ConnectionState;selectField:(id:string)=>void;
  navigate:(v:View)=>void;openField:(id:string)=>void;why:(id:string,kind:'health'|'irrigation'|'energy')=>void;
  irrigate:(id:string)=>void;ask:(prompt?:string,voice?:boolean)=>void};

function MetricCard({icon:Icon,label,value,unit,detail,tone='green',chart,onClick}: {icon:LucideIcon;label:string;value:string|number;
  unit?:string;detail:string;tone?:'green'|'amber'|'blue'|'gold';chart?:number[];onClick?:()=>void}) {
  return <button className={`metric-card metric-card--${tone}`} onClick={onClick}><div className="metric-top"><span className="metric-icon"><Icon size={19} strokeWidth={1.85}/></span><ArrowUpRight size={15} className="metric-arrow"/></div>
    <span className="metric-label">{label}</span><div className="metric-reading"><strong>{value}</strong>{unit&&<span>{unit}</span>}</div><div className="metric-bottom"><span>{detail}</span>{chart&&<Sparkline values={chart} color={tone==='amber'?'#bd8154':'#4a9263'}/>}</div></button>;
}

export function Overview({snapshot,selected,connection,selectField,navigate,openField,why,irrigate,ask}:Props) {
  const date = new Date().toLocaleDateString('en-IN',{weekday:'long',month:'long',day:'numeric'});
  const focus = snapshot.fields.find(f=>f.id==='FIELD_02') ?? snapshot.fields[1];
  const low = snapshot.fields.filter(f=>f.irrigation.needed).length;
  const plans = [
    {number:'01',icon:Droplets,title:`Check ${focus.name} soil`,body:`${focus.crop} moisture is ${focus.sensor.soil_moisture.toFixed(1)}% — below its ${focus.irrigation.threshold}% target.`,tone:'amber',onClick:()=>irrigate(focus.id)},
    {number:'02',icon:Leaf,title:'Review vegetation trend',body:`${focus.name} NDVI declined across ${focus.satellite_trend.consecutive_declines} observations. Cause unconfirmed.`,tone:'red',onClick:()=>{selectField(focus.id);navigate('crop');}},
    {number:'03',icon:Sprout,title:'Keep an eye on Field 03',body:'Chilli soil moisture is approaching its target.',tone:'green',onClick:()=>openField('FIELD_03')},
    {number:'04',icon:SunMedium,title:'Solar window is open',body:`${selected.energy.solar_kw.toFixed(1)} kW available for a planned irrigation cycle.`,tone:'gold',onClick:()=>navigate('energy')},
  ];
  return <div className="page-stack overview-page">
    <div className="page-intro"><div><p className="eyebrow">{date.toUpperCase()} · {snapshot.farm.village.toUpperCase()}</p><h1>Your farm, in focus.</h1><p>Good to see you. Here's what needs your attention today.</p></div><div className="demo-pill"><span className="demo-pill-dot"/> DEMO FARM · 5 FIELDS</div></div>
    <section className="hero-card"><div className="hero-content"><span className="hero-overline"><Sprout size={15}/> ROOTED IN BETTER DECISIONS</span><h2>From the roots<br/>to a brighter harvest.</h2><p>Soil signals, satellite insight and solar energy. One clear picture of your farm, even offline.</p>
      <button className="button button--light" onClick={()=>openField(focus.id)}>Explore Field 02 <ArrowRight size={17}/></button></div><div className="hero-corner"><span className="hero-mini-dot"/> ALL SYSTEMS MONITORING</div></section>
    <div className="section-topline"><div><span className="eyebrow">LIVE FARM PICTURE</span><span className="topline-note">{selected.name} · {selected.crop}</span></div><SourceNote>Simulated demo readings · refreshed {timeAgo(selected.sensor.timestamp)}</SourceNote></div>
    <section className="metrics-grid" aria-label="Selected field farm metrics">
      <MetricCard icon={Leaf} label="CROP HEALTH" value={selected.health.score} unit="%" detail={selected.health.status} tone={selected.health.score<78?'amber':'green'} chart={selected.satellite_history.map(o=>o.ndvi)} onClick={()=>navigate('crop')}/>
      <MetricCard icon={Droplets} label="SOIL MOISTURE" value={selected.sensor.soil_moisture.toFixed(1)} unit="%" detail={selected.sensor.soil_moisture>=selected.irrigation.threshold?'In range':'Below target'} tone={selected.irrigation.needed?'amber':'blue'} chart={selected.sensor_history.slice(-8).map(o=>o.soil_moisture)} onClick={()=>navigate('irrigation')}/>
      <MetricCard icon={SunMedium} label="SOLAR ENERGY" value={selected.energy.generation_kwh.toFixed(1)} unit="kWh" detail="Generated today" tone="gold" onClick={()=>navigate('energy')}/>
      <MetricCard icon={Zap} label="BIOELECTRIC NODE" value={selected.sensor.node_voltage.toFixed(2)} unit="V" detail="Environmental signal" tone="green" chart={selected.energy.history.map(o=>o.node_voltage)} onClick={()=>navigate('energy')}/>
      <MetricCard icon={Waves} label="IRRIGATION" value={selected.pump.status} detail={selected.irrigation.needed?`${selected.irrigation.duration_min} min suggested`:'No cycle scheduled'} tone={selected.irrigation.needed?'amber':'blue'} onClick={()=>navigate('irrigation')}/>
      <MetricCard icon={CloudSun} label="WEATHER" value={snapshot.weather.temperature} unit="°C" detail={`${snapshot.weather.rain_probability}% chance of rain`} tone="gold" onClick={()=>navigate('weather')}/>
    </section>
    <div className="overview-main-grid">
      <section className="surface map-panel"><SectionHeading eyebrow="FARM MAP" title="Every field has a story." description="Tap a field to see its crop, sensors and next step." action="View all fields" onAction={()=>navigate('fields')}/>
        <FieldMap fields={snapshot.fields} selectedId={selected.id} compact onSelect={openField}/></section>
      <section className="surface plan-panel"><div className="plan-panel-heading"><div><span className="eyebrow">YOUR NEXT STEPS</span><h2>Today's plan <span>{low} to check</span></h2></div><button className="icon-button plan-arrow" onClick={()=>navigate('activity')} title="View all alerts"><ArrowUpRight size={20}/></button></div>
        <div className="plan-list">{plans.map(item=><button className="plan-item" onClick={item.onClick} key={item.number}><span className={`plan-item-icon plan-item-icon--${item.tone}`}><item.icon size={18}/></span><span className="plan-item-body"><strong>{item.title}</strong><small>{item.body}</small></span><ArrowRight size={16} className="plan-item-arrow"/></button>)}</div>
        <div className="plan-footer"><ShieldCheck size={16}/> Advice first. Your confirmation before any pump action. <WhyButton onClick={()=>why(focus.id,'irrigation')}/></div>
      </section>
    </div>
    <div className="overview-secondary-grid"><section className="surface mini-energy"><div className="mini-section-heading"><div><p className="eyebrow">ROOT-TO-POWER NODE</p><h3>Small signal. Big picture.</h3></div><span className="mini-icon"><Radio size={20}/></span></div>
      <div className="node-large-reading">{selected.energy.node_voltage.toFixed(2)}<span>V</span><StatusBadge label={selected.energy.node_health} tone="green"/></div><p>Bioelectric signal is tracked alongside moisture and climate, never treated as a direct plant-health score.</p>
      <div className="mini-stats"><span><BatteryFull size={16}/> Storage <strong>{selected.energy.battery_pct}%</strong></span><span><Radio size={16}/> Link <strong>Connected</strong></span></div><button className="text-button" onClick={()=>navigate('energy')}>Explore energy <ArrowRight size={16}/></button></section>
      <section className="surface mini-weather"><div className="mini-section-heading"><div><p className="eyebrow">WEATHER OUTLOOK</p><h3>A look ahead.</h3></div><span className="mini-icon mini-icon--sun"><CloudSun size={22}/></span></div>
        <div className="weather-feature"><strong>{snapshot.weather.temperature}°</strong><span>Partly cloudy<br/><small>{snapshot.weather.humidity}% humidity · {snapshot.weather.wind_kmh} km/h wind</small></span></div>
        <div className="rain-track"><div><span>Rain tomorrow</span><strong>{snapshot.weather.forecast[1]?.rain_probability}%</strong></div><div className="rain-bar"><i style={{width:`${snapshot.weather.forecast[1]?.rain_probability}%`}}/></div></div><SourceNote>{snapshot.weather.source} · {timeAgo(snapshot.weather.timestamp)}</SourceNote></section>
    </div>
    <section className="ask-banner"><div className="ask-banner-icon"><MessageCircle size={22}/></div><div><p className="eyebrow">ASK ROOT TO POWER AI</p><h3>Not sure what to do next?</h3><span>Ask in your language. Get practical answers, with or without internet.</span></div><div className="ask-banner-actions"><button className="button button--outline-light" onClick={()=>ask(undefined,true)}><Mic size={17}/> Ask by voice</button><button className="button button--light" onClick={()=>ask()}>Type a question <MoveUpRight size={17}/></button></div></section>
    <footer className="page-footer"><span>ROOT TO POWER · FARM INTELLIGENCE, GROUNDED</span><span>{connection==='offline'?'Working offline':'Connected to local farm server'} · All field data is simulated for demo</span></footer>
  </div>;
}
