import { ArrowRight, CircleHelp, Info } from 'lucide-react';
import type { ConnectionState, Severity } from '../lib/types';

export function BrandMark({size=38}: {size?:number}) {
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect width="48" height="48" rx="14" fill="#dce9b3"/>
    <path d="M24 39V20M24 27C13 27 10 20 12 12c9 0 12 6 12 15Zm0-2c0-8 5-13 12-13 2 8-2 14-12 13Z" stroke="#194a32" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="24" cy="39" r="2.5" fill="#c97d4b"/></svg>;
}

const statusText: Record<ConnectionState,string> = {online:'Online',offline:'Offline',syncing:'Syncing',complete:'Sync complete',failed:'Sync failed'};
export function ConnectivityBadge({status,small=false}: {status:ConnectionState;small?:boolean}) {
  return <span className={`connectivity connectivity--${status} ${small ? 'connectivity--small' : ''}`} role="status"><i className="status-dot"/>{statusText[status]}</span>;
}
export function StatusBadge({label,tone='green'}: {label:string;tone?:'green'|'amber'|'red'|'neutral'|'blue'}) {
  return <span className={`status-badge status-badge--${tone}`}>{label}</span>;
}
export function SeverityBadge({severity}: {severity:Severity}) {
  return <span className={`severity severity--${severity.toLowerCase()}`}>{severity}</span>;
}
export function SectionHeading({eyebrow,title,description,action,onAction}: {eyebrow?:string;title:string;description?:string;action?:string;onAction?:()=>void}) {
  return <div className="section-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{description && <p className="section-description">{description}</p>}</div>
    {action && onAction && <button className="text-button" onClick={onAction}>{action}<ArrowRight size={16}/></button>}</div>;
}
export function WhyButton({onClick,label='Why?'}: {onClick:()=>void;label?:string}) {
  return <button className="why-button" onClick={onClick} aria-label={`Explain: ${label}`}><CircleHelp size={15}/>{label}</button>;
}
export function SourceNote({children}: {children:React.ReactNode}) {
  return <span className="source-note"><Info size={12}/>{children}</span>;
}
