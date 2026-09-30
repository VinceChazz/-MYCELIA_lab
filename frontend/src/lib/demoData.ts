import { makeAlerts, updateFieldModel, round } from './model';
import type { EnergyReading, FarmSnapshot, FieldData, SatelliteObservation, SensorReading, Weather } from './types';

const seeds = [
  { id: 'FIELD_01', name: 'Field 01', crop: 'Rice', variety: 'Swarna', days: 66, area: 1.4, soil: 'Clay loam', method: 'Drip', moisture: 31.5, ndvi: .79, voltage: .49, battery: 85, water: 310, boundary: [[44,67],[329,53],[326,196],[58,211]] },
  { id: 'FIELD_02', name: 'Field 02', crop: 'Tomato', variety: 'Arka Rakshak', days: 54, area: .9, soil: 'Sandy loam', method: 'Drip', moisture: 23.5, ndvi: .58, voltage: .47, battery: 78, water: 210, boundary: [[344,53],[588,42],[611,180],[338,195]] },
  { id: 'FIELD_03', name: 'Field 03', crop: 'Chilli', variety: 'Teja', days: 43, area: .7, soil: 'Red loam', method: 'Drip', moisture: 26.8, ndvi: .62, voltage: .44, battery: 72, water: 135, boundary: [[607,40],[793,68],[785,204],[625,180]] },
  { id: 'FIELD_04', name: 'Field 04', crop: 'Cotton', variety: 'NCS-145', days: 71, area: 1.2, soil: 'Black soil', method: 'Furrow', moisture: 34.4, ndvi: .76, voltage: .51, battery: 91, water: 365, boundary: [[56,225],[324,209],[326,377],[41,375]] },
  { id: 'FIELD_05', name: 'Field 05', crop: 'Groundnut', variety: 'Kadiri-6', days: 40, area: .8, soil: 'Sandy loam', method: 'Sprinkler', moisture: 29.6, ndvi: .71, voltage: .46, battery: 80, water: 220, boundary: [[340,211],[626,195],[788,220],[776,370],[339,376]] },
] as const;
const jitter = [.10,-.04,.06,-.07,.03,-.05,.09,-.02,.04,-.08,.02,0];
const at = (date: number) => new Date(date).toISOString();

export function createDemoSnapshot(): FarmSnapshot {
  const now = Date.now();
  const weather: Weather = { id: 'local-weather', timestamp: at(now), temperature: 32, humidity: 66,
    rainfall_mm: 0, wind_kmh: 9, rain_probability: 12, source: 'simulated weather', forecast: [
      { day: 'Today', temperature: 32, rain_probability: 12, condition: 'Partly cloudy', rainfall_mm: 0 },
      { day: 'Tomorrow', temperature: 34, rain_probability: 18, condition: 'Sunny intervals', rainfall_mm: 0 },
      { day: 'Friday', temperature: 31, rain_probability: 64, condition: 'Possible showers', rainfall_mm: 4 },
      { day: 'Saturday', temperature: 30, rain_probability: 72, condition: 'Showers', rainfall_mm: 7 },
    ] };
  const fields: FieldData[] = seeds.map((seed, index) => {
    const id = seed.id;
    const lastIrrigation = at(now - (id === 'FIELD_02' ? 31 : id === 'FIELD_03' ? 22 : 16)*3600000);
    const history: SensorReading[] = Array.from({length: 12}, (_, n) => {
      const age = 11-n;
      return { id: `local-sensor-${id}-${n}`, field_id: id, timestamp: at(now-age*15*60000),
        soil_moisture: round(seed.moisture + age*(index === 1 ? .85 : index === 2 ? .37 : .1)+jitter[n]),
        soil_temperature: round(26.2+index*.4+n*.08+jitter[n]*.4), air_temperature: round(31.4+n*.12+jitter[(n+3)%12]*.6),
        humidity: round(68-n*.3+jitter[n]*.8), rainfall: 0, light_intensity: 755+n*11, soil_ec: 1.2, soil_ph: 6.6,
        water_level: 82, pump_status: 'OFF', battery: seed.battery, solar_generation: 1.8, flow_rate: 0,
        node_voltage: round(seed.voltage+age*.002+jitter[(n+6)%12]*.04, 3), energy_harvested: .18, source: 'simulated', quality: 'valid' };
    });
    const trend = index === 1 ? [.71,.74,.75,.73,.69,.63,.58] : index === 2 ? [.61,.63,.65,.66,.65,.64,.62] :
      Array.from({length:7},(_,i) => round(seed.ndvi - .08 + i*.08/6, 2));
    const satellites: SatelliteObservation[] = trend.map((ndvi, n) => ({ id: `local-sat-${id}-${n}`, field_id: id,
      timestamp: at(now-((6-n)*5*24+6)*3600000), ndvi, ndre: round(ndvi*.68, 2),
      evi: round(ndvi*.87, 2), ndwi: round((ndvi-.09)*.72, 2), cloud_cover: 5.5,
      zones: index === 1 ? ['healthy', 'moderate stress', 'severe stress', 'declining vegetation', 'anomalous zone'] : index === 0 ? ['healthy','recently irrigated'] : ['healthy'],
      source: 'simulated satellite' }));
    const energyHistory: EnergyReading[] = Array.from({length:8}, (_, n) => ({ id: `local-energy-${id}-${n}`,
      field_id: id, timestamp: at(now-(7-n)*3600000), solar_kw: [.35,.48,.83,1.27,1.67,1.8,1.75,1.8][n],
      generation_kwh: [.4,.9,1.6,2.5,3.7,4.8,5.6,6.4][n],
      pump_energy_kwh: [.2,.3,.5,.8,1.2,1.5,1.8,2.1][n], battery_pct: seed.battery,
      node_voltage: round(seed.voltage+(7-n)*.004, 3), node_energy_mwh: round(.09+n*.015, 3),
      comm_status: 'CONNECTED', source: 'simulated' }));
    const latestEnergy = energyHistory[energyHistory.length-1];
    const stage = 'Flowering';
    const f: FieldData = { id, farm_id: 'DEMO_FARM', name: seed.name, crop: seed.crop, variety: seed.variety,
      sown_at: at(now-seed.days*86400000), area_acres: seed.area, soil_type: seed.soil,
      irrigation_method: seed.method, boundary: seed.boundary.map(point => [...point]), last_irrigated_at: lastIrrigation,
      sensor: history[history.length-1], sensor_history: history, satellite: satellites[satellites.length-1],
      satellite_history: satellites, satellite_trend: { direction: 'stable', change: 0, consecutive_declines: 0 },
      growth: { stage, days_after_sowing: seed.days, water_requirement_mm_day: 5.3,
        stress_accumulation_days_est: Math.max(0, Math.round((30-seed.moisture)/4)),
        expected_development: stage === 'Flowering' ? 'Monitor flowers and fruit set' : 'Growth expected to continue with adequate water and nutrients',
        harvest_window_start: at(now+(110-seed.days-7)*86400000).slice(0,10),
        harvest_window_end: at(now+(110-seed.days+10)*86400000).slice(0,10),
        model: 'local simplified crop calendar', certainty: 'estimate' },
      health: {} as FieldData['health'], irrigation: {} as FieldData['irrigation'],
      energy: { ...latestEnergy, voltage_trend: -.028, node_health: 'Monitoring normally', energy_status: 'SUFFICIENT',
        history: energyHistory, interpretation_note: 'Node voltage is an environmental signal, not a direct measure of plant health.' },
      pump: { field_id: id, status: 'OFF', flow_rate: 0, duration_min: 0, started_at: null, emergency_latched: 0,
        today_water_liters: seed.water, water_saved_pct: [28,24,19,31,26][index] },
      irrigation_history: [{ id: `local-irrigation-${id}`, field_id: id, started_at: lastIrrigation,
        ended_at: at(new Date(lastIrrigation).getTime()+19*60000), duration_min: 19, water_liters: 304,
        energy_kwh: .27, source: 'simulated', status: 'completed', confirmed_by: 'demo seed' }],
      crop_cycles: [{ id:`local-cycle-${id}`, field_id:id,
        crop:['Groundnut','Chilli','Rice','Groundnut','Rice'][index], variety:'Local variety',
        sown_at:at(now-(seed.days+35+108)*86400000), harvested_at:at(now-(seed.days+35)*86400000),
        yield_kg:[1780,820,960,1240,740][index], notes:'Previous season, simulated farmer record',
        source:'simulated farm history' }],
    };
    return updateFieldModel(f, weather);
  });
  return { farm: { id: 'DEMO_FARM', name: 'Demo Farm', village: 'Pedakakani', district: 'Guntur',
      state: 'Andhra Pradesh', latitude: 16.377, longitude: 80.497 },
    fields, weather, markets: [
      { crop: 'Tomato', market: 'Guntur', price_per_kg: 24, previous_price: 21 },
      { crop: 'Rice', market: 'Guntur', price_per_kg: 32, previous_price: 31 },
      { crop: 'Chilli', market: 'Guntur', price_per_kg: 86, previous_price: 91 },
      { crop: 'Cotton', market: 'Tenali', price_per_kg: 68, previous_price: 66 },
      { crop: 'Groundnut', market: 'Guntur', price_per_kg: 62, previous_price: 60 },
    ].map(m => ({ ...m, id: `local-market-${m.crop}`, as_of: at(now-2*3600000), source: 'simulated mandi price' })),
    alerts: makeAlerts(fields, weather), sync: {device_records_received:0,upstream_pending:0,upstream_configured:false,local_database:'SQLite'},
    generated_at: at(now), demo_mode: true, ai_configured: false,
    data_notice: 'All seeded sensors, satellite indices, weather, energy and prices are simulated demo data.' };
}
