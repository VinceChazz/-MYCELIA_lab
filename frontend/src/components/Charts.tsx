import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Datum = { label: string; [key: string]: string | number };
type Props = { data: Datum[]; series: {key:string;label:string;color:string}[]; type?: 'area' | 'line' | 'bar';
  height?: number; domain?: [number,number]; reference?: number; unit?: string };

const tooltipStyle = { backgroundColor: '#ffffff', border: '1px solid #e1e9dd', borderRadius: '12px',
  fontSize: '12px', boxShadow: '0 12px 30px rgba(27,57,35,.10)', padding: '10px 12px' };

export function DataChart({data,series,type='area',height=216,domain,reference,unit=''}: Props) {
  const common = <>
    <CartesianGrid vertical={false} stroke="#e8ede6" strokeDasharray="3 5"/>
    <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{fill:'#849185',fontSize:11}} dy={10} minTickGap={20}/>
    <YAxis tickLine={false} axisLine={false} tick={{fill:'#849185',fontSize:11}} width={38} domain={domain ?? ['auto','auto']}
      tickFormatter={v => `${v}${unit}`}/>
    <Tooltip contentStyle={tooltipStyle} cursor={{stroke:'#b9cabc',strokeDasharray:'4 4'}}
      formatter={(value, name) => [`${typeof value === 'number' ? Number(value.toFixed(2)) : value}${unit}`, name]}/>
    {reference !== undefined && <ReferenceLine y={reference} stroke="#dd9e66" strokeDasharray="5 5" strokeWidth={1.5}/>}
  </>;
  return <div className="chart-container" style={{height}}>
    <ResponsiveContainer width="100%" height="100%">
      {type === 'bar' ? <BarChart data={data} margin={{top:10,right:4,bottom:0,left:-10}}>{common}
        {series.map(s => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4,4,0,0]} maxBarSize={30}/>)}</BarChart>
      : type === 'line' ? <LineChart data={data} margin={{top:10,right:4,bottom:0,left:-10}}>{common}
        {series.map(s => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.6} dot={{r:3,fill:s.color,stroke:'#fff',strokeWidth:1.5}} activeDot={{r:5}}/>)}</LineChart>
      : <AreaChart data={data} margin={{top:10,right:4,bottom:0,left:-10}}>{common}
        <defs>{series.map(s => <linearGradient id={`gradient-${s.key}`} key={s.key} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity={.24}/><stop offset="100%" stopColor={s.color} stopOpacity={0}/></linearGradient>)}</defs>
        {series.map(s => <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.6} fill={`url(#gradient-${s.key})`} dot={false} activeDot={{r:5,stroke:'#fff',strokeWidth:2}}/>)}</AreaChart>}
    </ResponsiveContainer>
  </div>;
}

