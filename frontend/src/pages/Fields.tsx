import { ArrowRight, ArrowUpRight, CalendarDays, Droplets, Leaf, MapPin, ScanEye, Sprout, SunMedium, Thermometer, Waves } from 'lucide-react';
import { DataChart } from '../components/Charts';
import { FieldMap } from '../components/FieldMap';
import { SectionHeading, SourceNote, StatusBadge, WhyButton } from '../components/Shared';
import { dayTime, timeAgo } from '../lib/model';
import type { FarmSnapshot, FieldData, View } from '../lib/types';

type Props = {snapshot:FarmSnapshot;selected:FieldData;selectField:(id:string)=>void;navigate:(view:View)=>void;
  why:(id:string,kind:'health'|'irrigation')=>void;irrigate:(id:string)=>void};

export function Fields({snapshot,selected,selectField,navigate,why,irrigate}:Props) {
  const moistureData = selected.sensor_history.slice(-12).map(o=>({label:new Date(o.timestamp).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}), moisture:o.soil_moisture}));
  return <div className="page-stack">
    <div className="page-intro"><div><p className="eyebrow">FIELD INTELLIGENCE / {snapshot.farm.village.toUpperCase()}</p><h1>Know every corner.</h1><p>Five fields. One connected picture from soil to sky.</p></div><div className="intro-detail"><MapPin size={16}/>{snapshot.farm.district}, {snapshot.farm.state}</div></div>
    <div className="fields-layout"><aside className="surface field-list"><div className="field-list-head"><p className="eyebrow">YOUR FIELDS</p><strong>{snapshot.fields.length} active</strong></div>
      {snapshot.fields.map(f=><button key={f.id} onClick={()=>selectField(f.id)} className={`field-list-item ${selected.id===f.id?'field-list-item--active':''}`}>
        <span className={`field-list-indicator ${f.health.score<78?'attention':''}`}/><span className="field-list-text"><strong>{f.name}</strong><small>{f.crop} · {f.area_acres} acres</small></span><span className="field-list-health">{f.health.score}%</span><ArrowRight size={15}/></button>)}
      <div className="field-list-footer"><ScanEye size={17}/><span>All readings are simulated in Demo Mode.</span></div></aside>
      <section className="surface fields-map-panel"><SectionHeading eyebrow="INTERACTIVE FIELD MAP" title="The whole farm, at a glance." description="Select a field to explore its data."/><FieldMap fields={snapshot.fields} selectedId={selected.id} onSelect={selectField}/></section></div>
    <section className="surface field-detail-panel"><div className="field-detail-top"><div><p className="eyebrow">FIELD DETAILS · {selected.id.replace('_',' ')}</p><h2>{selected.name} <span>/ {selected.crop}</span></h2><p>{selected.variety} variety · {selected.area_acres} acres · {selected.soil_type} soil · {selected.irrigation_method} irrigation</p></div><StatusBadge label={selected.health.status} tone={selected.health.score<78?'amber':'green'}/></div>
      <div className="field-detail-stats"><div><span><Sprout size={17}/> Growth stage</span><strong>{selected.growth.stage}</strong><small>Day {selected.growth.days_after_sowing} from sowing</small></div>
        <div><span><Droplets size={17}/> Soil moisture</span><strong>{selected.sensor.soil_moisture.toFixed(1)}<em>%</em></strong><small>Target {selected.irrigation.threshold}%</small></div>
        <div><span><Leaf size={17}/> Crop health</span><strong>{selected.health.score}<em>%</em></strong><small>Estimate · {Math.round(selected.health.confidence*100)}% confidence</small></div>
        <div><span><ScanEye size={17}/> NDVI</span><strong>{selected.satellite?.ndvi.toFixed(2) ?? '—'}</strong><small>Observed {selected.satellite ? timeAgo(selected.satellite.timestamp):'never'}</small></div>
        <div><span><Thermometer size={17}/> Air temperature</span><strong>{selected.sensor.air_temperature.toFixed(1)}<em>°C</em></strong><small>{selected.sensor.source} sensor</small></div></div>
      <div className="field-detail-lower"><div className="field-detail-chart"><div className="mini-section-heading"><div><p className="eyebrow">SOIL MOISTURE HISTORY</p><h3>What's changing on the ground</h3></div><StatusBadge label="Local sensor" tone="blue"/></div><DataChart data={moistureData} series={[{key:'moisture',label:'Moisture',color:'#2f8768'}]} unit="%" reference={selected.irrigation.threshold}/><SourceNote>Orange line shows the local crop-stage irrigation threshold.</SourceNote></div>
        <div className="field-recommendation"><span className="recommendation-icon"><Waves size={24}/></span><p className="eyebrow">NEXT BEST STEP · RULE-BASED</p><h3>{selected.irrigation.recommendation}</h3><p>{selected.health.possible_causes[0]}. Check the field before acting; this is not a confirmed diagnosis.</p>
          <div className="field-recommendation-meta"><span>Last irrigation<strong>{selected.last_irrigated_at?timeAgo(selected.last_irrigated_at):'Unknown'}</strong></span><span>Water used today<strong>{selected.pump.today_water_liters.toFixed(0)} L</strong></span><span>Energy used<strong>{selected.energy.pump_energy_kwh.toFixed(1)} kWh</strong></span></div>
          <div className="recommendation-actions"><button className="button button--primary" onClick={()=>selected.irrigation.needed?irrigate(selected.id):navigate('irrigation')}>{selected.irrigation.needed?'Plan irrigation':'View irrigation'}<ArrowUpRight size={16}/></button><WhyButton onClick={()=>why(selected.id,'irrigation')}/></div>
        </div></div></section>
    <div className="two-note-row"><div className="inline-note"><CalendarDays size={19}/><span><strong>Expected harvest window</strong><br/>{selected.growth.harvest_window_start} – {selected.growth.harvest_window_end} <small>· simplified model estimate</small></span></div><div className="inline-note"><SunMedium size={19}/><span><strong>Solar available now</strong><br/>{selected.energy.solar_kw} kW · {selected.energy.energy_status.toLowerCase()} for the suggested cycle</span></div>
      <div className="inline-note"><Sprout size={19}/><span><strong>Previous crop cycle</strong><br/>{selected.crop_cycles?.[0]?.crop ?? 'No record'} · {selected.crop_cycles?.[0]?.yield_kg ?? '—'} kg recorded <small>· simulated history</small></span></div></div>
    <p className="under-page-note">Latest field reading: {dayTime(selected.sensor.timestamp)} · Simulated demo sensor · Satellite observation: {selected.satellite?.source ?? 'none'}</p>
  </div>;
}
