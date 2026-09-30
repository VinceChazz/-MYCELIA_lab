import { ArrowDownRight, ArrowUpRight, Calculator, CircleHelp, IndianRupee, MapPin, PencilLine, RefreshCw, TrendingUp, Truck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SectionHeading, SourceNote } from '../components/Shared';
import { timeAgo } from '../lib/model';
import type { FarmSnapshot, FieldData } from '../lib/types';

type CostKey = 'seed'|'fertilizer'|'pesticide'|'irrigation'|'energy'|'labour'|'transport';
const costLabels: Record<CostKey,string> = {seed:'Seeds / planting',fertilizer:'Fertilizer',pesticide:'Crop protection',
  irrigation:'Water & irrigation',energy:'Electricity / diesel',labour:'Labour',transport:'Transportation'};
const defaults: Record<string,{costs:Record<CostKey,number>;yieldKg:number}> = {
  Tomato:{costs:{seed:4300,fertilizer:9800,pesticide:7600,irrigation:5400,energy:2500,labour:25500,transport:6800},yieldKg:7000},
  Rice:{costs:{seed:1100,fertilizer:5600,pesticide:2200,irrigation:4500,energy:3300,labour:12600,transport:2800},yieldKg:2200},
  Chilli:{costs:{seed:1900,fertilizer:9200,pesticide:8500,irrigation:4100,energy:2600,labour:24000,transport:5300},yieldKg:1100},
  Cotton:{costs:{seed:2400,fertilizer:6200,pesticide:5500,irrigation:3200,energy:2800,labour:16800,transport:4400},yieldKg:1200},
  Groundnut:{costs:{seed:4200,fertilizer:3700,pesticide:2100,irrigation:2800,energy:2300,labour:12100,transport:2900},yieldKg:1100},
};
const money=(value:number)=>`₹${Math.round(value).toLocaleString('en-IN')}`;

export function Market({snapshot,selected,selectField,refresh,online}: {snapshot:FarmSnapshot;selected:FieldData;selectField:(id:string)=>void;refresh:()=>void;online:boolean}) {
  const [costs,setCosts] = useState<Record<CostKey,number>>({...defaults[selected.crop].costs});
  const [yieldKg,setYieldKg] = useState(defaults[selected.crop].yieldKg);
  useEffect(()=>{
    try { const saved=JSON.parse(localStorage.getItem(`rtp:costs:${selected.id}`) || 'null') as {costs:Record<CostKey,number>;yieldKg:number}|null;
      setCosts(saved?.costs ?? {...defaults[selected.crop].costs});setYieldKg(saved?.yieldKg ?? defaults[selected.crop].yieldKg); }
    catch {setCosts({...defaults[selected.crop].costs});setYieldKg(defaults[selected.crop].yieldKg);}
  },[selected.id,selected.crop]);
  const updateCost=(key:CostKey,value:number)=>{const next={...costs,[key]:Math.max(0,Math.min(10000000,value||0))};setCosts(next);
    try{localStorage.setItem(`rtp:costs:${selected.id}`,JSON.stringify({costs:next,yieldKg}));}catch{ /* private mode */ }};
  const updateYield=(value:number)=>{const next=Math.max(0,Math.min(1000000,value||0));setYieldKg(next);
    try{localStorage.setItem(`rtp:costs:${selected.id}`,JSON.stringify({costs,yieldKg:next}));}catch{ /* private mode */ }};
  const price=snapshot.markets.find(q=>q.crop===selected.crop);
  const costPerAcre=Object.values(costs).reduce((sum,n)=>sum+n,0);
  const totalCost=costPerAcre*selected.area_acres;
  const revenue=yieldKg*(price?.price_per_kg??0)*selected.area_acres;
  const margin=revenue-totalCost;
  const tomato=snapshot.markets.find(q=>q.crop==='Tomato') ?? snapshot.markets[0];
  return <div className="page-stack"><div className="page-intro"><div><p className="eyebrow">MARKET INTELLIGENCE + INPUT ECONOMICS</p><h1>Know the value of your work.</h1><p>Saved mandi prices and an honest look at your growing costs.</p></div><button className="button button--secondary" onClick={refresh}><RefreshCw size={16}/> Check prices</button></div>
    <section className="market-feature"><div><p className="eyebrow">PRICE SPOTLIGHT · {tomato.market.toUpperCase()}</p><h2>Tomato <span>{money(tomato.price_per_kg)}<small>/ kg</small></span></h2><p>{tomato.price_per_kg>=tomato.previous_price?'↑':'↓'} {Math.abs(Math.round((tomato.price_per_kg-tomato.previous_price)/tomato.previous_price*100))}% vs. previous saved price <span className="market-split">·</span> Last saved {timeAgo(tomato.as_of)}</p><SourceNote>{tomato.source} · {online?'Saved quote, not a live feed':'Offline cached quote — not live'}</SourceNote></div><div className="market-feature-art"><IndianRupee size={70} strokeWidth={1}/><TrendingUp size={50} strokeWidth={1.3}/></div></section>
    <section className="surface prices-panel"><SectionHeading eyebrow="NEARBY MARKETS" title="Latest saved crop prices" description="Quotes are simulated for the demo. Always confirm at the mandi before selling."/>
      <div className="price-grid">{snapshot.markets.map(q=><button className={`price-card ${selected.crop===q.crop?'price-card--selected':''}`} key={q.id} onClick={()=>{const f=snapshot.fields.find(f=>f.crop===q.crop);if(f)selectField(f.id);}}>
        <div><strong>{q.crop}</strong>{q.price_per_kg>=q.previous_price?<ArrowUpRight size={18} className="price-up"/>:<ArrowDownRight size={18} className="price-down"/>}</div><span>{money(q.price_per_kg)}<small>/kg</small></span><p><MapPin size={13}/>{q.market} <i>·</i> {timeAgo(q.as_of)}</p></button>)}</div><div className="price-source"><CircleHelp size={15}/> {online?'Saved simulated prices':'Offline — showing the last saved prices'}. Timestamps are shown so you can judge freshness.</div></section>
    <div className="economics-grid"><section className="surface economics-inputs"><div className="mini-section-heading"><div><p className="eyebrow">INPUT ECONOMICS · {selected.name.toUpperCase()}</p><h2>What goes into your crop.</h2><p className="section-description">Edit these <strong>demo assumptions</strong> to match your farm. Values are per acre.</p></div><PencilLine size={20} className="muted-icon"/></div>
        <div className="cost-input-list">{(Object.keys(costLabels) as CostKey[]).map(key=><label className="cost-row" key={key}><span>{costLabels[key]}</span><span><i>₹</i><input type="number" inputMode="numeric" min="0" max="10000000" value={costs[key]} onChange={e=>updateCost(key,Number(e.target.value))} aria-label={`${costLabels[key]} cost per acre`}/></span></label>)}</div>
        <label className="yield-row"><span>Expected yield <small>kg / acre · estimate</small></span><input type="number" inputMode="numeric" min="0" max="1000000" value={yieldKg} onChange={e=>updateYield(Number(e.target.value))} aria-label="Expected yield kilograms per acre"/></label>
        <div className="cost-assumption"><Calculator size={16}/> Per-acre inputs × {selected.area_acres} acres. Revenue uses saved {selected.crop} price ({money(price?.price_per_kg??0)}/kg), not a future-price forecast.</div></section>
      <section className="economics-result"><p className="eyebrow">ILLUSTRATIVE FIELD ESTIMATE</p><h2>Know your numbers.</h2><div className="economics-hero-number"><small>ESTIMATED MARGIN · {selected.name.toUpperCase()}</small><strong>{money(margin)}</strong><span>Revenue minus inputs · not a profit guarantee</span></div>
        <div className="economics-totals"><div><span>Cost / acre</span><strong>{money(costPerAcre)}</strong></div><div><span>Total cultivation cost</span><strong>{money(totalCost)}</strong></div><div><span>Estimated revenue</span><strong>{money(revenue)}</strong></div><div><span>Water cost</span><strong>{money(costs.irrigation*selected.area_acres)}</strong></div><div><span>Energy cost</span><strong>{money(costs.energy*selected.area_acres)}</strong></div></div>
        <div className="economic-bars"><div><span>Inputs</span><div><i style={{width:`${revenue>0?Math.min(100,totalCost/revenue*100):100}%`}}/></div></div><div><span>Revenue</span><div><i style={{width:'100%'}}/></div></div></div>
        <div className="economic-note"><Truck size={16}/> Transport is included. Prices, yield and costs are adjustable demo assumptions; local market conditions will vary.</div></section></div>
    <p className="under-page-note">Never treat old cached prices as current. Source and age are shown on every quote.</p>
  </div>;
}
