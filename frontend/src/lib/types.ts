export type View = 'overview' | 'fields' | 'crop' | 'irrigation' | 'weather' | 'market' | 'energy' | 'assistant' | 'activity' | 'settings';
export type ConnectionState = 'online' | 'offline' | 'syncing' | 'complete' | 'failed';
export type Severity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface Farm { id: string; name: string; village: string; district: string; state: string; latitude: number; longitude: number }
export interface SensorReading {
  id: string; field_id: string; timestamp: string; soil_moisture: number; soil_temperature: number;
  air_temperature: number; humidity: number; rainfall: number; light_intensity: number; soil_ec: number;
  soil_ph: number; water_level: number; pump_status: 'ON' | 'OFF' | 'FAULT'; battery: number;
  solar_generation: number; flow_rate: number; node_voltage: number; energy_harvested: number;
  source: string; quality: string;
}
export interface SatelliteObservation {
  id: string; field_id: string; timestamp: string; ndvi: number; ndre: number; evi: number; ndwi: number;
  cloud_cover: number; zones: string[]; source: string;
}
export interface EnergyReading {
  id: string; field_id: string; timestamp: string; solar_kw: number; generation_kwh: number;
  pump_energy_kwh: number; battery_pct: number; node_voltage: number; node_energy_mwh: number;
  comm_status: string; source: string;
}
export interface Energy extends EnergyReading {
  history: EnergyReading[]; voltage_trend: number; node_health: string; energy_status: string; interpretation_note: string;
  node_associations?: NodeAssociations;
}
export interface Weather {
  id: string; timestamp: string; temperature: number; humidity: number; rainfall_mm: number;
  wind_kmh: number; rain_probability: number; forecast: { day: string; temperature: number; rain_probability: number; condition: string; rainfall_mm: number }[];
  source: string;
}
export interface MarketQuote { id: string; crop: string; market: string; price_per_kg: number; previous_price: number; as_of: string; source: string }
export interface Growth {
  stage: string; days_after_sowing: number; water_requirement_mm_day: number; stress_accumulation_days_est: number;
  expected_development: string; harvest_window_start: string; harvest_window_end: string; model: string; certainty: string;
}
export interface Evidence { label: string; value: string; source?: string; timestamp?: string | null; kind?: string }
export interface NodeAssociations { sample_count: number; anomaly: boolean; correlations: Record<string,number|null>;
  context: string[]; voltage_change_v?: number; note: string }
export interface Health {
  score: number; status: string; stress_level: string; growth_trend: string; primary_signal: string;
  confidence: number; possible_causes: string[]; recommended_action: string; node_anomaly: boolean;
  observed: Evidence[]; inference: string; advice: string; model: string; node_context?: NodeAssociations;
}
export interface Safety { allowed: boolean; reasons: string[]; max_duration_min: number; requires_confirmation: boolean; automation_enabled: boolean }
export interface Recommendation {
  recommendation: string; needed: boolean; duration_min: number; priority: string; threshold: number;
  water_liters_est: number; energy_kwh_est: number; safety: Safety; why: Evidence[];
  basis: string; requires_farmer_confirmation: boolean; automation_enabled: boolean;
}
export interface PumpState {
  field_id: string; status: 'ON' | 'OFF' | 'FAULT'; flow_rate: number; duration_min: number;
  started_at: string | null; emergency_latched: number; today_water_liters: number;
  water_saved_pct: number; elapsed_demo_min?: number;
}
export interface IrrigationEvent {
  id: string; field_id: string; started_at: string; ended_at: string | null; duration_min: number;
  water_liters: number; energy_kwh: number; source: string; status: string; confirmed_by: string;
}
export interface CropCycle { id: string; field_id: string; crop: string; variety: string; sown_at: string;
  harvested_at: string; yield_kg: number; notes: string; source: string }
export interface FieldData {
  id: string; farm_id: string; name: string; crop: string; variety: string; sown_at: string;
  area_acres: number; soil_type: string; irrigation_method: string; boundary: number[][];
  last_irrigated_at: string | null; sensor: SensorReading; sensor_history: SensorReading[];
  satellite: SatelliteObservation | null; satellite_history: SatelliteObservation[];
  satellite_trend: { direction: string; change: number; consecutive_declines: number };
  growth: Growth; health: Health; irrigation: Recommendation; energy: Energy;
  pump: PumpState; irrigation_history: IrrigationEvent[]; crop_cycles: CropCycle[];
}
export interface Alert { id: string; field_id: string | null; severity: Severity; type: string; message: string; source: string }
export interface FarmSnapshot {
  farm: Farm; fields: FieldData[]; weather: Weather; markets: MarketQuote[]; alerts: Alert[];
  sync: { device_records_received: number; upstream_pending: number; upstream_configured: boolean; local_database: string };
  generated_at: string; demo_mode: boolean; ai_configured: boolean; data_notice: string;
}
export interface ChatMessage {
  id: string; role: 'farmer' | 'assistant'; text: string; time: string;
  mode?: string; language?: string; field_id?: string;
}
export interface SyncOperation {
  op_id: string; entity: 'sensor' | 'conversation' | 'irrigation_event' | 'preference' | 'memory';
  entity_id: string; operation: string; payload: Record<string, unknown>; created_at: string;
}
export type LanguageCode = 'en' | 'hi' | 'te' | 'mr' | 'ta' | 'kn' | 'bn' | 'gu' | 'pa';
