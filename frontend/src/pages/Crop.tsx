import { Activity, ArrowDownRight, ArrowRight, BadgeCheck, CalendarDays, CircleHelp, Droplets, Leaf, ScanEye, ShieldAlert, Sprout, Thermometer } from 'lucide-react';
import { useState } from 'react';
import { DataChart } from '../components/Charts';
import { FieldMap } from '../components/FieldMap';
import { SectionHeading, SourceNote, StatusBadge, WhyButton } from '../components/Shared';
import { timeAgo } from '../lib/model';
import type { FarmSnapshot, FieldData, View } from '../lib/types';

type IndexKey = 'ndvi'|'ndre'|'evi'|'ndwi';
const indexNames: Record<IndexKey,string> = {ndvi:'NDVI',ndre:'NDRE',evi:'EVI',ndwi:'NDWI'};

export function Crop({snapshot,selected,selectField,navigate,why}: {snapshot:FarmSnapshot;selected:FieldData;selectField:(id:string)=>void;
  navigate:(v:View)=>void;why:(id:string,kind:'health')=>void}) {
  const [index,setIndex] = useState<IndexKey>('ndvi');
  const data = selected.satellite_history.map(o=>({label:new Date(o.timestamp).toLocaleDateString('en-IN',{day:'numeric',month:'short'}),[index]:o[index]}));
  const stages = ['Establishment','Vegetative','Flowering','Fruit / grain fill','Maturity'];
  const position = stages.indexOf(selected.growth.stage);
  const stressed = selected.health.score < 78;
  return <div className="page-stack">
    <div className="page-intro"><div><p className="eyebrow">SATELLITE + SOIL + CROP MODEL</p><h1>See beyond the surface.</h1><p>Understand what the field is showing — and what it might mean.</p></div><div className="intro-detail"><ScanEye size={16}/>{selected.name} · {selected.crop}</div></div>
    <div className="crop-top-grid"><section className="surface crop-score-panel"><div className="crop-score-heading"><span className="eyebrow">CROP HEALTH ESTIMATE</span><StatusBadge label="Model inference" tone="blue"/></div>
      <div className="score-gauge" style={{'--score':`${selected.health.score}%`,'--gauge-color':stressed?'#c28a59':'#3e8963'} as React.CSSProperties}>
        <div><strong>{selected.health.score}<small>%</small></strong><span>health score</span></div></div>
      <div className="score-status"><span className={`score-status-dot ${stressed?'stress':''}`}/><strong>{selected.health.status}</strong><span>· {Math.round(selected.health.confidence*100)}% model confidence</span></div>
      <p>{selected.health.primary_signal}. This is an estimate, not a confirmed diagnosis.</p><WhyButton onClick={()=>why(selected.id,'health')} label="Why this score?"/></section>
      <section className="surface crop-trend-panel"><div className="mini-section-heading"><div><p className="eyebrow">SATELLITE OBSERVATIONS</p><h2>Vegetation over time</h2><p className="section-description">Field-level multispectral index · {selected.satellite?.source ?? 'no source'}</p></div><span className={`trend-tag ${selected.satellite_trend.direction==='declining'?'trend-tag--down':''}`}>{selected.satellite_trend.direction==='declining'?<ArrowDownRight size={15}/>:<ArrowRight size={15}/>} {selected.satellite_trend.direction}</span></div>
        <div className="index-tabs" role="tablist" aria-label="Vegetation index">{(Object.keys(indexNames) as IndexKey[]).map(key=><button key={key} role="tab" aria-selected={key===index} className={index===key?'active':''} onClick={()=>setIndex(key)}>{indexNames[key]}</button>)}</div>
        <DataChart type="line" data={data} series={[{key:index,label:indexNames[index],color:'#3b8160'}]} domain={[0,1]} height={244}/>
        <div className="trend-footer"><span><span className="trend-small-dot"/> Last observation {selected.satellite ? timeAgo(selected.satellite.timestamp) : 'unavailable'}</span><span>{selected.satellite_trend.consecutive_declines} consecutive NDVI declines</span></div></section></div>
    <div className="crop-evidence-grid"><section className="surface crop-evidence"><div className="mini-section-heading"><div><p className="eyebrow">SENSOR FUSION</p><h2>What we know vs. what we think.</h2></div><CircleHelp size={20} className="muted-icon"/></div>
      <div className="evidence-columns"><div className="observed-column"><span className="evidence-category"><BadgeCheck size={16}/> OBSERVED DATA</span>
          <div className="observed-line"><span><Droplets size={17}/> Soil moisture</span><strong>{selected.sensor.soil_moisture.toFixed(1)}%</strong></div>
          <div className="observed-line"><span><Leaf size={17}/> NDVI</span><strong>{selected.satellite?.ndvi.toFixed(2) ?? '—'}</strong></div>
          <div className="observed-line"><span><Thermometer size={17}/> Temperature</span><strong>{selected.sensor.air_temperature.toFixed(1)}°C</strong></div>
          <div className="observed-line"><span><Activity size={17}/> Bioelectric node</span><strong>{selected.sensor.node_voltage.toFixed(2)} V</strong></div>
        </div><div className="inferred-column"><span className="evidence-category evidence-category--amber"><ShieldAlert size={16}/> MODEL INFERENCE</span><p>{selected.health.possible_causes[0]}.</p><span className="inference-flag">{selected.health.node_anomaly?'Combined-signal anomaly detected':'No combined node anomaly detected'}</span><small>Voltage is contextual data, never a direct measure of crop health.</small></div></div>
      <div className="advice-strip"><span><Sprout size={18}/> AI / RULE-GENERATED ADVICE</span><p>{selected.health.recommended_action}</p><button className="text-button" onClick={()=>navigate('assistant')}>Ask a question <ArrowRight size={15}/></button></div></section>
      <section className="surface crop-growth-panel"><p className="eyebrow">LOCAL CROP MODEL</p><h2>Where the crop is now.</h2><div className="growth-current"><span className="growth-icon"><Sprout size={24}/></span><div><small>CURRENT GROWTH STAGE</small><strong>{selected.growth.stage}</strong><span>Day {selected.growth.days_after_sowing} after sowing</span></div></div>
        <div className="stage-timeline">{stages.map((stage,i)=><div className={`stage ${i<position?'stage--done':i===position?'stage--current':''}`} key={stage}><i/><span>{stage}</span></div>)}</div>
        <div className="growth-facts"><div><Droplets size={18}/><span>Estimated water need<strong>{selected.growth.water_requirement_mm_day} mm / day</strong></span></div><div><CalendarDays size={18}/><span>Expected harvest<strong>{selected.growth.harvest_window_start} – {selected.growth.harvest_window_end}</strong></span></div></div><SourceNote>Simplified local crop calendar; dates are estimates.</SourceNote></section></div>
    <section className="surface crop-map-panel"><SectionHeading eyebrow="FIELD-LEVEL COMPARISON" title="Look at the whole picture." description="Simulated vegetation zones and sensor positions. Select another field to compare."/><FieldMap fields={snapshot.fields} selectedId={selected.id} onSelect={selectField} compact/></section>
  </div>;
}
