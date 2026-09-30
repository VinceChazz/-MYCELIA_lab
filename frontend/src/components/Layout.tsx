import { Activity, ArrowUpRight, Bell, CloudSun, Droplets, LayoutDashboard, Leaf, Menu, MessageCircle, Settings2, ShoppingBasket, Sprout, SunMedium, Wifi, WifiOff, X } from 'lucide-react';
import { BrandMark, ConnectivityBadge } from './Shared';
import type { ConnectionState, Farm, FieldData, View } from '../lib/types';

const navigation: {view:View;label:string;icon:typeof LayoutDashboard;group:'main'|'intelligence'|'system'}[] = [
  {view:'overview',label:'Overview',icon:LayoutDashboard,group:'main'},
  {view:'fields',label:'My fields',icon:Leaf,group:'main'},
  {view:'crop',label:'Crop intelligence',icon:Sprout,group:'intelligence'},
  {view:'irrigation',label:'Irrigation',icon:Droplets,group:'intelligence'},
  {view:'weather',label:'Weather',icon:CloudSun,group:'intelligence'},
  {view:'market',label:'Markets & costs',icon:ShoppingBasket,group:'intelligence'},
  {view:'energy',label:'Energy & node',icon:SunMedium,group:'intelligence'},
  {view:'assistant',label:'Ask Root AI',icon:MessageCircle,group:'intelligence'},
  {view:'activity',label:'Alerts & sync',icon:Activity,group:'system'},
  {view:'settings',label:'Settings',icon:Settings2,group:'system'},
];
const titles: Record<View,string> = {overview:'Overview',fields:'My fields',crop:'Crop intelligence',irrigation:'Precision irrigation',
  weather:'Weather intelligence',market:'Markets & economics',energy:'Energy & sensing',assistant:'Farmer assistant',activity:'Alerts & sync',settings:'Settings'};

type Props = { children:React.ReactNode; view:View; navigate:(view:View)=>void; farm:Farm; fields:FieldData[];
  selectedFieldId:string; selectField:(id:string)=>void; connection:ConnectionState; forcedOffline:boolean;
  toggleOffline:(offline:boolean)=>void; pending:number; alertCount:number; mobileOpen:boolean; setMobileOpen:(v:boolean)=>void };

export function Layout({children,view,navigate,farm,fields,selectedFieldId,selectField,connection,forcedOffline,
  toggleOffline,pending,alertCount,mobileOpen,setMobileOpen}:Props) {
  const navigateAndClose = (target:View) => { navigate(target); setMobileOpen(false); window.scrollTo({top:0,behavior:'smooth'}); };
  return <div className="app-shell">
    {mobileOpen && <button className="sidebar-scrim" aria-label="Close menu" onClick={()=>setMobileOpen(false)}/>}
    <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
      <div className="sidebar-brand"><BrandMark/><div><strong>ROOT TO POWER</strong><span>FARM INTELLIGENCE</span></div><button className="mobile-close icon-button" aria-label="Close menu" onClick={()=>setMobileOpen(false)}><X size={19}/></button></div>
      <div className="sidebar-farm"><span className="farm-avatar">DF</span><div><strong>{farm.name}</strong><span>{farm.district}, {farm.state}</span></div><ArrowUpRight size={16}/></div>
      <nav aria-label="Main navigation" className="sidebar-nav">
        {(['main','intelligence','system'] as const).map(group => <div className="nav-group" key={group}>
          <p className="nav-group-title">{group === 'main' ? 'YOUR FARM' : group === 'intelligence' ? 'EXPLORE' : 'WORKSPACE'}</p>
          {navigation.filter(item=>item.group===group).map(({view:target,label,icon:Icon}) => <button key={target}
            className={`nav-item ${view===target ? 'nav-item--active' : ''}`} onClick={()=>navigateAndClose(target)} aria-current={view===target ? 'page' : undefined}>
            <Icon size={19} strokeWidth={1.9}/><span>{label}</span>{target==='activity' && alertCount>0 && <i className="nav-counter">{alertCount}</i>}</button>)}
        </div>)}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-insight"><span className="insight-icon"><Sprout size={18}/></span><strong>Better decisions grow here.</strong><p>Soil, sky and solar power, working together.</p></div>
        <div className="sidebar-foot"><ConnectivityBadge status={connection} small/><span>DEMO · v0.1</span></div></div>
    </aside>
    <div className="main-column">
      <header className="app-header"><div className="header-left"><button className="mobile-menu icon-button" onClick={()=>setMobileOpen(true)} aria-label="Open menu"><Menu size={21}/></button>
        <div className="breadcrumb"><span>Demo Farm</span><span className="breadcrumb-slash">/</span><strong>{titles[view]}</strong></div></div>
        <div className="header-actions"><span className="header-connectivity"><ConnectivityBadge status={connection}/></span><label className="field-select-wrap"><span className="sr-only">Selected field</span>
          <select value={selectedFieldId} onChange={e=>selectField(e.target.value)} aria-label="Select field">
            {fields.map(f=><option value={f.id} key={f.id}>{f.name} · {f.crop}</option>)}
          </select></label>
          <button className={`connection-toggle ${forcedOffline ? 'connection-toggle--offline' : ''}`} onClick={()=>void toggleOffline(!forcedOffline)}
            title={forcedOffline ? 'Reconnect the demo' : 'Simulate going offline'} aria-label={forcedOffline ? 'Reconnect to server' : 'Simulate offline mode'}>
            {forcedOffline ? <WifiOff size={16}/> : <Wifi size={16}/>}<span>{forcedOffline ? 'Go online' : 'Go offline'}</span></button>
          <button className="header-bell icon-button" onClick={()=>navigateAndClose('activity')} aria-label={`Open alerts, ${alertCount} alerts`}><Bell size={20}/>{alertCount>0 && <i/>}</button>
          <span className="header-avatar" title="Demo Farm">DF</span></div>
      </header>
      <main className="page-content" id="main-content">{connection==='offline' && <div className="connection-banner"><WifiOff size={16}/><span><strong>Offline intelligence mode.</strong> Local sensors, models and assistant still work. {pending} record{pending===1?'':'s'} waiting to sync.</span><button onClick={()=>void toggleOffline(false)}>Reconnect</button></div>}
        {connection==='failed' && <div className="connection-banner connection-banner--failed"><WifiOff size={16}/><span><strong>Sync failed.</strong> Your records are saved locally. Retry when connected.</span><button onClick={()=>navigateAndClose('activity')}>Details</button></div>}
        {children}</main>
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{(['overview','fields','irrigation','assistant'] as View[]).map(target=>{
        const item = navigation.find(n=>n.view===target)!; const Icon = item.icon;
        return <button key={target} className={view===target?'active':''} onClick={()=>navigateAndClose(target)}><Icon size={20}/><span>{target==='assistant'?'Ask AI':item.label}</span></button>;
      })}<button onClick={()=>setMobileOpen(true)}><Menu size={20}/><span>More</span></button></nav>
      {pending>0 && connection!=='offline' && <div className="sync-mini" role="status">{connection==='syncing' ? 'Syncing' : `${pending} to sync`} <span className={connection==='syncing'?'spin':''}>↻</span></div>}
    </div>
  </div>;
}
