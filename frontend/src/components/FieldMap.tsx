import { LocateFixed, ScanLine } from 'lucide-react';
import type { FieldData } from '../lib/types';

type Props = { fields: FieldData[]; selectedId: string; onSelect: (id: string) => void; compact?: boolean };
const points = (coordinates: number[][]) => coordinates.map(p => p.join(',')).join(' ');
const centroid = (coordinates: number[][]) => ({
  x: coordinates.reduce((sum, p) => sum+p[0],0)/coordinates.length,
  y: coordinates.reduce((sum, p) => sum+p[1],0)/coordinates.length,
});

export function FieldMap({ fields, selectedId, onSelect, compact = false }: Props) {
  return <div className={`field-map ${compact ? 'field-map--compact' : ''}`}>
    <div className="map-toolbar"><span className="map-live"><span className="map-pulse"/> FIELD VIEW <span className="map-separator">/</span> DEMO GEOMETRY</span><span className="map-toolbar-right"><LocateFixed size={13}/> Guntur, AP <ScanLine size={16}/></span></div>
    <div className="map-canvas">
      <svg viewBox="0 0 840 420" role="img" aria-label="Interactive schematic of five farm fields with crop condition and sensor nodes" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="map-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#b4c8ad" opacity=".46"/></pattern>
          <pattern id="furrows" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(-22)"><line x1="0" x2="0" y1="0" y2="12" stroke="#ffffff" strokeOpacity=".16" strokeWidth="3"/></pattern>
          <pattern id="stress-lines" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><line x1="0" x2="0" y1="0" y2="10" stroke="#f0b963" strokeOpacity=".26" strokeWidth="3"/></pattern>
          <pattern id="water-lines" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><line x1="0" x2="0" y1="0" y2="9" stroke="#b8d8df" strokeOpacity=".5" strokeWidth="3"/></pattern>
          {fields.map(f => <clipPath id={`clip-${f.id}`} key={f.id}><polygon points={points(f.boundary)}/></clipPath>)}
        </defs>
        <rect width="840" height="420" fill="#e8f0e3"/><rect width="840" height="420" fill="url(#map-dots)"/>
        <path d="M-20 54 Q153 -3 337 20 Q630 -2 853 47 M-25 91 Q92 28 298 42 Q600 6 863 90 M-25 410 Q158 390 323 410 M673 404 Q769 372 857 390" fill="none" stroke="#bfd2b9" strokeWidth="2" opacity=".46"/>
        <path d="M7 0 C-10 100 12 210 24 300 C29 361 17 405 3 427" fill="none" stroke="#b7d6d5" strokeWidth="20" opacity=".8"/>
        <path d="M7 0 C-10 100 12 210 24 300 C29 361 17 405 3 427" fill="none" stroke="#f5faf4" strokeWidth="2" strokeDasharray="10 7" opacity=".65"/>
        <path d="M8 214 L838 199 M330 10 L332 405 M597 7 L618 197" stroke="#f9f9ef" strokeWidth="15" fill="none" strokeLinejoin="round"/>
        <path d="M8 214 L838 199 M330 10 L332 405 M597 7 L618 197" stroke="#d0d9c7" strokeWidth="1.4" fill="none" strokeDasharray="4 7" opacity=".8"/>
        {fields.map(f => {
          const center = centroid(f.boundary);
          const selected = f.id === selectedId;
          const stressed = f.health.score < 78;
          const severe = f.health.score < 52;
          const fill = severe ? '#bc7258' : stressed ? '#c3aa68' : '#6b9666';
          return <g key={f.id} className={`map-field ${selected ? 'map-field--selected' : ''}`} onClick={() => onSelect(f.id)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(f.id); } }}
            tabIndex={0} role="button" aria-label={`Open ${f.name}, ${f.crop}, health ${f.health.score} percent, moisture ${f.sensor.soil_moisture} percent`}>
            <polygon points={points(f.boundary)} fill={fill} stroke={selected ? '#ffffff' : '#d8e4cf'} strokeWidth={selected ? 5 : 3} strokeLinejoin="round"/>
            <polygon points={points(f.boundary)} fill="url(#furrows)"/>
            {f.id === 'FIELD_02' && <g clipPath={`url(#clip-${f.id})`}>
              <path d="M455 10 L650 12 L672 218 L463 214Z" fill="#a98250" opacity=".35"/>
              <path d="M455 10 L650 12 L672 218 L463 214Z" fill="url(#stress-lines)"/>
              <path d="M552 105 L637 100 L648 196 L541 203Z" fill="#af654e" opacity=".44"/>
              <path d="M552 105 L637 100 L648 196 L541 203Z" fill="url(#stress-lines)"/>
            </g>}
            {f.id === 'FIELD_01' && <g clipPath={`url(#clip-${f.id})`}><path d="M48 153 L332 141 L332 222 L42 218Z" fill="#8eabb0" opacity=".39"/><path d="M48 153 L332 141 L332 222 L42 218Z" fill="url(#water-lines)"/></g>}
            {selected && <polygon points={points(f.boundary)} fill="none" stroke="#204e39" strokeWidth="1.5" strokeDasharray="5 4"/>}
            <rect x={center.x-48} y={center.y-24} width="96" height="48" rx="11" fill="#123b2b" fillOpacity={selected ? '.94' : '.72'}/>
            <text x={center.x} y={center.y-3} textAnchor="middle" fill="white" fontFamily="Manrope, sans-serif" fontWeight="700" fontSize="12">{f.name.toUpperCase()}</text>
            <text x={center.x} y={center.y+14} textAnchor="middle" fill="#d5e4d1" fontFamily="DM Sans, sans-serif" fontSize="10">{f.crop} · {f.sensor.soil_moisture.toFixed(0)}% moisture</text>
            <circle cx={center.x-58} cy={center.y+34} r="9" fill="#f8f8ed" stroke="#2c6446" strokeWidth="2"/>
            <circle cx={center.x-58} cy={center.y+34} r="3" fill="#2c6446"/>
            <circle cx={center.x-39} cy={center.y+34} r="8" fill="#e6b965" stroke="#f8f8ed" strokeWidth="2"/>
            <path d={`M${center.x-42} ${center.y+34}h6 M${center.x-39} ${center.y+31}v6`} stroke="#694e20" strokeWidth="1.5"/>
            {f.health.node_anomaly && <g><title>Multi-signal anomaly · inspect, not a diagnosis</title><circle cx={center.x+62} cy={center.y+34} r="9" fill="#8c5c50" stroke="#fff5e9" strokeWidth="2"/><text x={center.x+62} y={center.y+38} textAnchor="middle" fill="white" fontFamily="Manrope" fontWeight="800" fontSize="11">!</text></g>}
          </g>;
        })}
        <g transform="translate(790 28)"><circle r="21" fill="#fbfdf7" fillOpacity=".91"/><path d="M0 -13 L5 6 0 3 -5 6Z" fill="#285b40"/><text y="-17" textAnchor="middle" fill="#285b40" fontFamily="Manrope" fontWeight="800" fontSize="9">N</text></g>
        <g transform="translate(45 404)" fill="#46755c" fontFamily="DM Sans" fontSize="10"><text>SCHEMATIC · NOT GPS SURVEYED</text></g>
      </svg>
    </div>
    <div className="map-legend"><span><i className="legend-dot healthy"/> Healthy</span><span><i className="legend-dot moderate"/> Moderate stress</span><span><i className="legend-dot severe"/> Severe index zone</span><span><i className="legend-dot irrigated"/> Recently irrigated</span><span><i className="legend-dot decline"/> Declining</span><span><i className="legend-dot sensor"/> Sensor</span><span><i className="legend-dot node"/> RTP node</span><span><i className="legend-dot anomaly"/> Inspect anomaly</span></div>
  </div>;
}
