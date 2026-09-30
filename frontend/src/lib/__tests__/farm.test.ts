import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../demoData';
import { checkSafety, offlineAnswer, updateFieldModel } from '../model';

describe('bundled farm intelligence stays useful offline', () => {
  it('ships five connected fields with declining Tomato NDVI and a safe plan', () => {
    const farm = createDemoSnapshot();
    expect(farm.fields).toHaveLength(5);
    const tomato = farm.fields.find(f => f.crop === 'Tomato')!;
    expect(tomato.satellite_trend.consecutive_declines).toBeGreaterThanOrEqual(3);
    expect(tomato.sensor.soil_moisture).toBe(23.5);
    expect(tomato.crop_cycles[0].crop).toBe('Chilli');
    expect(tomato.health.status).toBe('Moderate stress');
    expect(tomato.health.node_anomaly).toBe(true);
    expect(tomato.energy.node_associations?.sample_count).toBe(12);
    expect(tomato.irrigation.duration_min).toBe(18);
    expect(tomato.irrigation.water_liters_est).toBe(288);
    expect(tomato.irrigation.safety.allowed).toBe(true);
  });

  it('fails closed for suspect sensors, empty tanks, low energy and long cycles', () => {
    const f = createDemoSnapshot().fields[1];
    expect(checkSafety({...f.sensor,quality:'suspect'},f.pump,f.energy,18).allowed).toBe(false);
    expect(checkSafety({...f.sensor,water_level:1},f.pump,f.energy,18).allowed).toBe(false);
    expect(checkSafety(f.sensor,f.pump,{...f.energy,battery_pct:5,solar_kw:0},18).allowed).toBe(false);
    expect(checkSafety(f.sensor,f.pump,f.energy,46).allowed).toBe(false);
    expect(checkSafety(f.sensor,{...f.pump,emergency_latched:1},f.energy,18).allowed).toBe(false);
  });

  it('recovers moisture after a simulated cycle, without changing satellite observations', () => {
    const farm = createDemoSnapshot(); const f = farm.fields[1];
    const oldSatellite = f.satellite?.ndvi;
    const newSensor = {...f.sensor,soil_moisture:31, timestamp:new Date().toISOString()};
    const updated = updateFieldModel({...f,sensor:newSensor,sensor_history:[...f.sensor_history,newSensor]},farm.weather);
    expect(updated.health.score).toBeGreaterThan(f.health.score);
    expect(updated.irrigation.needed).toBe(false);
    expect(updated.satellite?.ndvi).toBe(oldSatellite); // satellite revisit is not invented
  });

  it('provides practical offline advice in local languages and labels stale prices', () => {
    const farm=createDemoSnapshot(); const f=farm.fields[1];
    expect(offlineAnswer('Should I water?',f,farm,'en')).toContain('288 L');
    expect(offlineAnswer('पानी देना चाहिए?',f,farm,'hi')).toContain('बिना पंप नहीं');
    expect(offlineAnswer('నీరు పెట్టాలా?',f,farm,'te')).toContain('మీ అనుమతి');
    expect(offlineAnswer('tomato price?',f,farm,'en')).toContain('not live');
    expect(offlineAnswer('Should I water?',farm.fields[0],farm,'en')).toContain('No watering needed');
    expect(offlineAnswer('पानी देना चाहिए?',farm.fields[0],farm,'hi')).toContain('ज़रूरत नहीं');
    expect(offlineAnswer('ఎరువు ఎంత?',f,farm,'te')).toContain('నేల పరీక్ష');
  });
});
