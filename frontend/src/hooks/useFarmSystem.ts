import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { createDemoSnapshot } from '../lib/demoData';
import { checkSafety, makeAlerts, offlineAnswer, round, updateFieldModel } from '../lib/model';
import { clearDemoStorage, dequeue, enqueue, loadMessages, loadSnapshot, newId, pendingOperations, saveMessages, saveSnapshot } from '../lib/offlineStore';
import type { ChatMessage, ConnectionState, FarmSnapshot, FieldData, IrrigationEvent, LanguageCode, SyncOperation, Weather, MarketQuote } from '../lib/types';

const stored = (key: string, defaultValue: string) => { try { return localStorage.getItem(key) ?? defaultValue; } catch { return defaultValue; } };
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } };

type AIResult = { answer: string; mode: string; notice: string; memory_id: string };
type SyncResult = { accepted: string[]; rejected: {op_id:string;error:string}[]; server_confirmed_at: string };

export function useFarmSystem() {
  const [snapshot, setSnapshot] = useState<FarmSnapshot>(() => createDemoSnapshot());
  const snapshotRef = useRef(snapshot);
  const [selectedFieldId, setSelectedFieldId] = useState(() => stored('rtp:selectedField', 'FIELD_01'));
  const [forcedOffline, setForcedOffline] = useState(() => stored('rtp:forcedOffline', 'false') === 'true');
  const offlineRef = useRef(forcedOffline);
  const [connection, setConnection] = useState<ConnectionState>(forcedOffline || !navigator.onLine ? 'offline' : 'online');
  const [pending, setPending] = useState(0);
  const [syncError, setSyncError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [asking, setAsking] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [simulationRunning, setSimulationRunning] = useState(() => stored('rtp:simulation', 'true') === 'true');
  const [language, setLanguage] = useState<LanguageCode>(() => (stored('rtp:language', 'en') as LanguageCode));
  const [toast, setToast] = useState('');
  const syncingRef = useRef(false);
  const connectionRef = useRef(connection);
  useEffect(() => { connectionRef.current = connection; }, [connection]);
  const backendPumps = useRef<Map<string,string>>(new Map());
  const online = !forcedOffline && navigator.onLine && connection !== 'offline';
  const selected = snapshot.fields.find(f => f.id === selectedFieldId) ?? snapshot.fields[0];

  const apply = useCallback((next: FarmSnapshot) => { snapshotRef.current = next; setSnapshot(next); }, []);
  const notify = useCallback((message: string) => { setToast(message); window.setTimeout(() => setToast(''), 5500); }, []);

  const syncNow = useCallback(async (): Promise<boolean> => {
    if (offlineRef.current || !navigator.onLine || syncingRef.current) return false;
    syncingRef.current = true;
    setConnection('syncing');
    setSyncError('');
    try {
      let operations = await pendingOperations();
      while (operations.length) {
        const result = await api<SyncResult>('/sync/batch', {method: 'POST', body: {operations: operations.slice(0, 50)}, retries: 1, timeoutMs: 7000});
        if (result.accepted.length) await dequeue(result.accepted);
        operations = await pendingOperations();
        setPending(operations.length);
        if (result.rejected.length) throw new Error(`${result.rejected.length} record(s) need attention: ${result.rejected[0].error}`);
        if (!result.accepted.length) break;
      }
      try {
        const status = await api<FarmSnapshot['sync']>('/sync/status', {retries:0,timeoutMs:3500});
        apply({...snapshotRef.current,sync:status});
      } catch { /* local acknowledgements already received; the counter can refresh later */ }
      setConnection('complete');
      window.setTimeout(() => setConnection(current => current === 'complete' ? 'online' : current), 4500);
      return true;
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Sync failed; records remain on this device.');
      setConnection('failed');
      setPending((await pendingOperations()).length);
      return false;
    } finally { syncingRef.current = false; }
  }, [apply]);

  const queue = useCallback(async (entity: SyncOperation['entity'], entityId: string, payload: Record<string, unknown>) => {
    const operation: SyncOperation = { op_id: newId(), entity, entity_id: entityId, operation: 'upsert',
      payload, created_at: new Date().toISOString() };
    await enqueue(operation);
    setPending((await pendingOperations()).length);
    return operation;
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [cached, previousMessages, outbox] = await Promise.all([loadSnapshot(), loadMessages(), pendingOperations()]);
      if (!mounted) return;
      if (cached?.fields?.length) {
        const bundled = createDemoSnapshot();
        apply({...cached,ai_configured:cached.ai_configured ?? false,
          fields:cached.fields.map(f=>({...f,crop_cycles:f.crop_cycles ??
            bundled.fields.find(seed=>seed.id===f.id)?.crop_cycles ?? []}))});
      }
      setMessages(previousMessages);
      setPending(outbox.length);
      setHydrated(true);
      if (!offlineRef.current && navigator.onLine) {
        try {
          const remote = await api<FarmSnapshot>('/bootstrap', { timeoutMs: 4500 });
          if (!mounted) return;
          // An unsynced local farm always wins until its operations are confirmed.
          if (!cached || !outbox.length) apply(remote);
          remote.fields.forEach(f => { const running = [...f.irrigation_history].reverse().find(event => event.status === 'running');
            if (f.pump.status === 'ON' && running) backendPumps.current.set(f.id, running.id); });
          setConnection('online');
          if (outbox.length) void syncNow();
        } catch { if (mounted) { setConnection('offline'); notify('Local farm data is ready. Server unavailable; using offline mode.'); } }
      } else setConnection('offline');
    })();
    return () => { mounted = false; };
  }, [apply, notify, syncNow]);

  useEffect(() => { if (hydrated) void saveSnapshot(snapshot); }, [snapshot, hydrated]);
  useEffect(() => { if (hydrated) void saveMessages(messages); }, [messages, hydrated]);
  useEffect(() => { remember('rtp:selectedField', selectedFieldId); }, [selectedFieldId]);
  useEffect(() => { remember('rtp:language', language); }, [language]);
  useEffect(() => { remember('rtp:simulation', String(simulationRunning)); }, [simulationRunning]);

  const setOffline = useCallback(async (value: boolean) => {
    offlineRef.current = value;
    setForcedOffline(value);
    remember('rtp:forcedOffline', String(value));
    if (value) { setConnection('offline'); notify('Offline mode on. Local models, sensors and memory continue working.'); }
    else {
      try {
        await api<{status:string}>('/health', {timeoutMs: 2500, retries: 1});
        setConnection('online');
        const synced = await syncNow();
        notify(synced ? 'Connected. Pending records confirmed by the local server.' : 'Connected, but some records are still waiting to sync. Check Alerts & sync.');
      } catch { setConnection('failed'); setSyncError('Could not reach the local server; records stay on this device.'); notify('Could not connect. Your data is safe on this device.'); }
    }
  }, [notify, syncNow]);

  useEffect(() => {
    const onOnline = () => { if (!offlineRef.current) void syncNow(); };
    const onOffline = () => setConnection('offline');
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    const id = window.setInterval(() => {
      if (!offlineRef.current && navigator.onLine && !syncingRef.current) {
        void api<{status:string}>('/health', {retries: 0, timeoutMs: 2500})
          .then(() => { setConnection(current => current === 'offline' || current === 'failed' ? 'online' : current);
            void pendingOperations().then(items => { if (items.length) void syncNow(); }); })
          .catch(() => setConnection(current => current === 'syncing' ? current : 'offline'));
      }
    }, 20000);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.clearInterval(id); };
  }, [syncNow]);

  const tick = useCallback(async () => {
    const prev = snapshotRef.current;
    const now = new Date().toISOString();
    const completed: {field: FieldData; event: IrrigationEvent}[] = [];
    const readings: FieldData['sensor'][] = [];
    const fields = prev.fields.map(f => {
      const pumping = f.pump.status === 'ON';
      const remaining = Math.max(0, f.pump.duration_min - (f.pump.elapsed_demo_min ?? 0));
      const advance = pumping ? Math.min(3, remaining) : 0;
      const elapsed = (f.pump.elapsed_demo_min ?? 0) + advance;
      const complete = pumping && elapsed >= f.pump.duration_min;
      const water = advance*16;
      const pump = { ...f.pump, elapsed_demo_min: elapsed,
        today_water_liters: round(f.pump.today_water_liters+water),
        status: (complete ? 'OFF' : f.pump.status) as FieldData['pump']['status'],
        flow_rate: complete ? 0 : f.pump.flow_rate };
      const sensor = { ...f.sensor, id: newId(), timestamp: now,
        soil_moisture: round(Math.max(0, Math.min(100, f.sensor.soil_moisture + (pumping ? advance/3 : f.id === 'FIELD_02' ? -.16 : -.04)))),
        node_voltage: round(Math.max(0, f.sensor.node_voltage + (pumping ? .001 : -.0005)), 3),
        pump_status: (complete ? 'OFF' : pumping ? 'ON' : f.sensor.pump_status) as FieldData['sensor']['pump_status'],
        flow_rate: complete ? 0 : pumping ? 16 : 0,
      };
      readings.push(sensor);
      const energy = { ...f.energy, generation_kwh: round(f.energy.generation_kwh+.09, 2),
        pump_energy_kwh: round(f.energy.pump_energy_kwh + (pumping ? advance/60*.85 : 0), 2),
        node_voltage: sensor.node_voltage, battery_pct: sensor.battery,
        history: [...f.energy.history, {...f.energy, timestamp: now, node_voltage: sensor.node_voltage,
          generation_kwh: round(f.energy.generation_kwh+.09,2), pump_energy_kwh: round(f.energy.pump_energy_kwh+(pumping ? advance/60*.85 : 0),2)}].slice(-20),
      };
      const updated = updateFieldModel({ ...f, pump, energy, sensor, sensor_history: [...f.sensor_history, sensor].slice(-40),
        last_irrigated_at: complete ? now : f.last_irrigated_at }, prev.weather);
      if (complete) {
        const event: IrrigationEvent = { id: backendPumps.current.get(f.id) ?? newId(), field_id: f.id, started_at: f.pump.started_at ?? now,
          ended_at: now, duration_min: elapsed, water_liters: elapsed*16,
          energy_kwh: round(elapsed/60*.85,2), source: 'simulated', status: 'completed', confirmed_by: 'farmer' };
        updated.irrigation_history = [...f.irrigation_history, event];
        completed.push({field: updated, event});
      }
      return updated;
    });
    apply({...prev, fields, alerts: makeAlerts(fields, prev.weather), generated_at: now});
    for (const reading of readings) await queue('sensor', reading.id, reading as unknown as Record<string,unknown>);
    for (const {field: f, event} of completed) {
      if (backendPumps.current.has(f.id) && !offlineRef.current) {
        try { await api('/irrigation/stop', {method:'POST', body: {field_id:f.id,confirmed:true,confirmation:f.name,
          simulated_elapsed_min:event.duration_min}, retries: 0}); backendPumps.current.delete(f.id); }
        catch { await queue('irrigation_event', event.id, event as unknown as Record<string,unknown>); }
      } else await queue('irrigation_event', event.id, event as unknown as Record<string,unknown>);
      backendPumps.current.delete(f.id);
      notify(`${f.name} irrigation complete. ${event.water_liters} L used (simulated).`);
    }
    if (!offlineRef.current && navigator.onLine && connectionRef.current !== 'offline' && connectionRef.current !== 'failed') void syncNow();
  }, [apply, notify, queue, syncNow]);

  useEffect(() => {
    if (!simulationRunning || !hydrated) return;
    const id = window.setInterval(() => { void tick(); }, 12000);
    return () => window.clearInterval(id);
  }, [simulationRunning, hydrated, tick]);

  const startIrrigation = useCallback(async (fieldId: string, duration: number): Promise<string | null> => {
    const prev = snapshotRef.current;
    const f = prev.fields.find(item => item.id === fieldId);
    if (!f) return 'Field not found';
    const safety = checkSafety(f.sensor, f.pump, f.energy, duration);
    if (!safety.allowed) return safety.reasons.join('. ');
    if (!f.irrigation.needed) return 'The current field does not need irrigation. Inspect manually first.';
    if (duration > f.irrigation.duration_min) return 'Duration exceeds the local crop/water plan. Choose the suggested duration or less.';
    let startedAt = new Date().toISOString();
    if (!offlineRef.current && navigator.onLine && connection !== 'offline') {
      try {
        // The backend re-checks every safety condition. No command is queued for replay.
        const result = await api<{event_id:string;started_at:string}>('/irrigation/start', {method:'POST', body: {
          field_id:fieldId, duration_min: duration, confirmed:true, confirmation:f.name}, retries: 0, timeoutMs: 6000});
        backendPumps.current.set(fieldId,result.event_id);
        startedAt=result.started_at;
      } catch (error) {
        return `Server start was not confirmed: ${error instanceof Error ? error.message : 'unknown error'}. Check the controller before trying again.`;
      }
    }
    const now = startedAt;
    const fields = prev.fields.map(item => item.id === fieldId ? updateFieldModel({ ...item,
      pump: {...item.pump, status:'ON', flow_rate:16, duration_min:duration, elapsed_demo_min:0, started_at:now},
      sensor: {...item.sensor, pump_status:'ON', flow_rate:16} }, prev.weather) : item);
    apply({...prev, fields, alerts: makeAlerts(fields,prev.weather)});
    notify(`Simulated irrigation started for ${f.name}. You can stop it any time.`);
    return null;
  }, [apply, connection, notify]);

  const stopIrrigation = useCallback(async (fieldId: string, emergency = false): Promise<void> => {
    const prev = snapshotRef.current;
    const f = prev.fields.find(item => item.id === fieldId);
    if (!f) return;
    const serverEventId = backendPumps.current.get(fieldId);
    let serverConfirmed = false;
    if (serverEventId && !offlineRef.current) {
      try {
        await api(emergency ? `/irrigation/emergency-stop/${fieldId}` : '/irrigation/stop', {
          method:'POST', body: emergency ? undefined : {field_id:fieldId,confirmed:true,confirmation:f.name,
            simulated_elapsed_min:f.pump.elapsed_demo_min ?? 0}, retries:0 });
        serverConfirmed = true;
      } catch { notify('Server could not confirm the stop. Check the controller; simulated UI stopped.'); }
    }
    const now = new Date().toISOString();
    const elapsed = f.pump.elapsed_demo_min ?? 0;
    const event: IrrigationEvent = { id:serverEventId ?? newId(), field_id:fieldId, started_at:f.pump.started_at ?? now,
      ended_at:now, duration_min:elapsed, water_liters:elapsed*16, energy_kwh:round(elapsed/60*.85,2),
      source:'simulated', status: emergency ? 'emergency stopped' : 'stopped', confirmed_by:'farmer' };
    const fields = prev.fields.map(item => item.id === fieldId ? updateFieldModel({ ...item,
      pump:{...item.pump,status:emergency ? 'FAULT':'OFF',flow_rate:0,emergency_latched:emergency ? 1:item.pump.emergency_latched},
      sensor:{...item.sensor,pump_status:emergency ? 'FAULT':'OFF',flow_rate:0},
      last_irrigated_at:now, irrigation_history:[...item.irrigation_history,event] }, prev.weather) : item);
    apply({...prev,fields,alerts:makeAlerts(fields,prev.weather)});
    if (!serverConfirmed) await queue('irrigation_event', event.id, event as unknown as Record<string,unknown>);
    backendPumps.current.delete(fieldId);
    notify(emergency ? 'Emergency stop latched. Reset only after checking the equipment.' : `Simulated irrigation stopped. ${event.water_liters} L used.`);
    if (!offlineRef.current && navigator.onLine) void syncNow();
  }, [apply, notify, queue, syncNow]);

  const resetEmergency = useCallback(async (fieldId: string): Promise<string | null> => {
    const prev = snapshotRef.current;
    const f = prev.fields.find(item => item.id === fieldId);
    if (!f) return 'Field not found';
    if (!offlineRef.current && navigator.onLine) {
      try { await api('/irrigation/reset',{method:'POST',body:{field_id:fieldId,confirmed:true,confirmation:f.name},retries:0}); }
      catch (error) { return error instanceof Error ? error.message : 'Reset failed'; }
    }
    const fields = prev.fields.map(item => item.id === fieldId ? updateFieldModel({...item,
      pump:{...item.pump,status:'OFF',emergency_latched:0}, sensor:{...item.sensor,pump_status:'OFF'}},prev.weather) : item);
    apply({...prev,fields,alerts:makeAlerts(fields,prev.weather)});
    notify('Emergency latch reset after manual verification (simulation only).');
    return null;
  }, [apply, notify]);

  const askQuestion = useCallback(async (question: string, fieldId: string, lang: LanguageCode): Promise<void> => {
    const normalized = question.toLowerCase();
    const named = snapshotRef.current.fields.find(item => normalized.includes(item.name.toLowerCase()) ||
      normalized.includes(item.crop.toLowerCase()));
    const f = named ?? snapshotRef.current.fields.find(item => item.id === fieldId);
    if (!f || !question.trim() || asking) return;
    if (named && named.id !== fieldId) setSelectedFieldId(named.id);
    fieldId = f.id;
    const id = newId(); const now = new Date().toISOString();
    setMessages(prev => [...prev, {id,role:'farmer',text:question.trim(),time:now,language:lang,field_id:fieldId}]);
    setAsking(true);
    let answer = ''; let mode = 'offline intelligence';
    if (!offlineRef.current && navigator.onLine && connection !== 'offline') {
      try {
        const result = await api<AIResult>('/assistant/ask', {method:'POST',body:{question:question.trim(),
          field_id:fieldId,language:lang,message_id:id,allow_remote:true},retries:0,timeoutMs:9000});
        answer = result.answer; mode = result.mode;
      } catch { /* network / AI failure: local rules below */ }
    }
    if (!answer) answer = offlineAnswer(question, f, snapshotRef.current, lang);
    setMessages(prev => [...prev, {id:newId(),role:'assistant',text:answer,time:new Date().toISOString(),
      mode,language:lang,field_id:fieldId}]);
    await queue('conversation', id, {question:question.trim(),answer,field_id:fieldId,language:lang});
    if (!offlineRef.current && navigator.onLine) void syncNow();
    setAsking(false);
  }, [asking, connection, queue, syncNow]);

  const setPreferredLanguage = useCallback((lang: LanguageCode) => {
    setLanguage(lang);
    void queue('preference', `language-${snapshotRef.current.farm.id}-${newId()}`, {content:`Preferred language: ${lang}`,language:lang})
      .then(() => { if (!offlineRef.current && navigator.onLine) void syncNow(); });
  }, [queue, syncNow]);

  const refreshFeeds = useCallback(async () => {
    if (offlineRef.current || !navigator.onLine) { notify('Offline: showing last saved forecast and prices.'); return; }
    try {
      const [weather, markets] = await Promise.all([
        api<Weather>('/weather?refresh=true',{timeoutMs:6500}),api<MarketQuote[]>('/markets?refresh=true',{timeoutMs:6500})]);
      const prev = snapshotRef.current;
      const fields = prev.fields.map(f => updateFieldModel(f, weather));
      apply({...prev,weather,markets,fields,alerts:makeAlerts(fields,weather)});
      notify('Latest available provider data checked. Check source and timestamp for freshness.');
    } catch { notify('Feed unavailable. Last saved weather and prices remain visible.'); }
  }, [apply, notify]);

  const resetDemo = useCallback(async () => {
    if (!window.confirm('Reset the local demo? This removes local conversations and unsynced demo records.')) return;
    await clearDemoStorage();
    const fresh = createDemoSnapshot();
    apply(fresh); setMessages([]); setPending(0); setSelectedFieldId('FIELD_01');
    notify('Local demo reset. All five fields are ready.');
    if (!offlineRef.current && navigator.onLine) {
      try { await api('/demo/reset',{method:'POST',body:{confirmation:'RESET DEMO'},retries:0}); }
      catch { notify('Local demo reset. Server demo could not be reset; it may show earlier records.'); }
    }
  }, [apply, notify]);

  return { snapshot, selected, selectedFieldId, setSelectedFieldId, forcedOffline, setOffline,
    connection, online, pending, syncError, syncNow, messages, asking, askQuestion,
    simulationRunning, setSimulationRunning, tick, startIrrigation, stopIrrigation, resetEmergency,
    language, setPreferredLanguage, refreshFeeds, resetDemo, toast, notify };
}
