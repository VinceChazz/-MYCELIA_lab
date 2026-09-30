export function Sparkline({values,color='#2b7751',height=35}: {values:number[];color?:string;height?:number}) {
  if (!values.length) return null;
  const min = Math.min(...values)-.5, max = Math.max(...values)+.5;
  const path = values.map((v,i) => `${i ? 'L':'M'}${i/(Math.max(values.length-1,1))*110},${height-4-(v-min)/(max-min)*(height-8)}`).join(' ');
  return <svg viewBox={`0 0 110 ${height}`} preserveAspectRatio="none" aria-hidden="true" className="sparkline"><path d={path} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
