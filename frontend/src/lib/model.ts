import type { Alert, Energy, FieldData, FarmSnapshot, Health, LanguageCode, NodeAssociations, Recommendation, Safety, SensorReading, Weather } from './types';

export const clockAgeMinutes = (iso: string): number => Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
export function timeAgo(iso: string): string {
  const mins = clockAgeMinutes(iso);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)} hr ago`;
  return `${Math.floor(mins / 1440)} day${mins >= 2880 ? 's' : ''} ago`;
}
export const dayTime = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
export const round = (n: number, places = 1) => Number(n.toFixed(places));

export function checkSafety(sensor: SensorReading, pump: FieldData['pump'], energy: Energy, duration: number): Safety {
  const reasons: string[] = [];
  const age = (Date.now() - new Date(sensor.timestamp).getTime()) / 60000;
  if (age > 90 || age < -10 || sensor.quality !== 'valid') reasons.push('SENSOR DATA UNRELIABLE — MANUAL VERIFICATION REQUIRED');
  if (sensor.soil_moisture < 2 || sensor.soil_moisture > 90) reasons.push('Soil moisture is outside a reliable operating range');
  if (!Number.isInteger(duration) || duration < 1 || duration > 45) reasons.push('Duration must be between 1 and 45 minutes');
  if (sensor.water_level < 15) reasons.push('Water tank level is too low');
  if (energy.battery_pct < 20 && energy.solar_kw < .6) reasons.push('Not enough battery or solar power');
  if (pump.status !== 'OFF') reasons.push('Pump is already running or in a fault state');
  if (pump.emergency_latched) reasons.push('Emergency stop is latched; manual reset required');
  if (sensor.pump_status === 'FAULT') reasons.push('Pump reported a fault');
  return { allowed: reasons.length === 0, reasons, max_duration_min: 45, requires_confirmation: true, automation_enabled: false };
}

function localAssociations(f: FieldData, declines: number): NodeAssociations {
  const readings = f.sensor_history.slice(-24).filter(o=>o.quality==='valid');
  if (!readings.length) return {sample_count:0,anomaly:false,correlations:{},context:[],note:'Insufficient paired sensor history.'};
  const first=readings[0], last=readings[readings.length-1];
  const corr=(key:'soil_moisture'|'air_temperature'|'humidity')=>{
    if (readings.length<8) return null;
    const xs=readings.map(o=>o.node_voltage), ys=readings.map(o=>o[key]);
    const mx=xs.reduce((a,b)=>a+b,0)/xs.length,my=ys.reduce((a,b)=>a+b,0)/ys.length;
    const numerator=xs.reduce((sum,x,i)=>sum+(x-mx)*(ys[i]-my),0);
    const product=xs.reduce((sum,x)=>sum+(x-mx)**2,0)*ys.reduce((sum,y)=>sum+(y-my)**2,0);
    return product>1e-8 ? round(numerator/Math.sqrt(product),2):null;
  };
  const moistureFalling=first.soil_moisture-last.soil_moisture>=2;
  const warming=last.air_temperature-first.air_temperature>=.6;
  const dryingAir=first.humidity-last.humidity>=1.5;
  const voltageFalling=first.node_voltage-last.node_voltage>.018;
  return {sample_count:readings.length,anomaly:readings.length>=8&&moistureFalling&&voltageFalling&&(warming||dryingAir)&&declines>=2,
    correlations:{soil_moisture:corr('soil_moisture'),air_temperature:corr('air_temperature'),humidity:corr('humidity')},
    context:[`${f.growth.stage} stage`,`${declines} NDVI declines`,...(moistureFalling?['soil moisture falling']:[]),
      ...(warming?['air temperature rising']:[]),...(dryingAir?['humidity falling']:[])],
    voltage_change_v:round(last.node_voltage-first.node_voltage,3),
    note:'Exploratory local associations from paired sensor history, not a causal or plant-health diagnosis.'};
}

export function updateFieldModel(f: FieldData, weather: Weather): FieldData {
  const s = f.sensor;
  const values = f.satellite_history.map(o => o.ndvi);
  let declines = 0;
  for (let i = values.length - 1; i > 0 && values[i] < values[i-1] - .005; i--) declines++;
  const change = values.length > 1 ? round(values[values.length-1] - values[values.length-2], 3) : 0;
  const trend = { direction: change < -.01 ? 'declining' : change > .01 ? 'improving' : 'stable', change, consecutive_declines: declines };
  const ndvi = f.satellite?.ndvi ?? null;
  const score = Math.max(0, Math.min(100, Math.round(94 - Math.max(0, 30-s.soil_moisture)*2 -
    (ndvi === null ? 0 : Math.max(0, .70-ndvi)*55) - Math.min(12, declines*2.5) - Math.max(0, weather.temperature-33)*1.2)));
  const status = score >= 78 ? 'Healthy' : score >= 52 ? 'Moderate stress' : 'Severe stress';
  const nodeContext = localAssociations(f,declines);
  const nodeAnomaly = nodeContext.anomaly;
  const causes: string[] = [];
  if (s.soil_moisture < 28 && declines >= 2) causes.push('Water stress is possible: drying soil and vegetation decline occur together');
  else if (s.soil_moisture < 28) causes.push('Low soil moisture may be limiting growth');
  if (weather.temperature > 34) causes.push('Heat may be adding to crop stress');
  if (nodeAnomaly) causes.push('Bioelectric signal changed alongside other signals; inspect the node and field');
  if (!causes.length) causes.push('No clear stress pattern in the available observations');
  const action = score < 78 ? `Inspect ${f.name} for possible irrigation stress before watering.` : 'Continue routine monitoring; no urgent action indicated.';
  const sensorAgeHours = (Date.now()-new Date(s.timestamp).getTime())/3600000;
  const satelliteAgeDays = f.satellite ? (Date.now()-new Date(f.satellite.timestamp).getTime())/86400000 : 99;
  const confidence = Math.max(.25,Math.min(.86,.82 - (sensorAgeHours > 2 ? .20 : 0) -
    (satelliteAgeDays > 12 ? .17 : 0) - (s.quality !== 'valid' ? .12 : 0) - (f.satellite?.source.includes('simulated') ? .07 : 0)));
  const health: Health = { score, status, stress_level: status, growth_trend: trend.direction,
    primary_signal: declines >= 2 && s.soil_moisture < 28 ? 'Declining NDVI + low soil moisture' : s.soil_moisture < 28 ? 'Low soil moisture' : 'Vegetation index is steady',
    confidence: round(confidence,2), possible_causes: causes, recommended_action: action, node_anomaly: nodeAnomaly,
    observed: [
      { label: 'Soil moisture', value: `${s.soil_moisture.toFixed(1)}%`, source: s.source, timestamp: s.timestamp },
      { label: 'NDVI', value: ndvi?.toFixed(2) ?? 'Unavailable', source: f.satellite?.source ?? 'none', timestamp: f.satellite?.timestamp },
      { label: 'Air temperature', value: `${s.air_temperature.toFixed(1)}°C`, source: s.source, timestamp: s.timestamp },
    ], inference: `${declines} consecutive NDVI declines; ${f.growth.stage.toLowerCase()} stage. ${causes.join('; ')}`,
    advice: action, model: 'local multi-signal rule model',node_context:nodeContext };
  const energy = { ...f.energy, node_voltage: s.node_voltage, battery_pct: s.battery,
    node_health: s.battery < 20 || f.energy.comm_status !== 'CONNECTED' ? 'Needs attention' : 'Monitoring normally',
    energy_status: f.energy.solar_kw >= .6 || s.battery >= 30 ? 'SUFFICIENT' : 'LOW',node_associations:nodeContext };
  const thresholds: Record<string, number> = { Rice: 29, Tomato: 29, Chilli: 28, Cotton: 27, Groundnut: 27 };
  const threshold = (thresholds[f.crop] ?? 28) + (f.growth.stage === 'Flowering' && f.crop !== 'Tomato' ? 1 : 0);
  const deficit = round(threshold - s.soil_moisture);
  const rainExpected = weather.rain_probability >= 65;
  const needed = deficit > 0 && !(rainExpected && deficit < 6);
  const duration = needed ? Math.min(45, Math.max(8, Math.round(14 + Math.max(0, deficit)*.75))) : 0;
  const safety = checkSafety(s, f.pump, energy, duration || 1);
  const recommendation = f.pump.status === 'ON' ? 'Irrigation in progress' : !safety.allowed ?
    (needed ? 'Manual verification required' : 'Monitor') : needed ? 'Irrigate after checking the field' :
    rainExpected && deficit > 0 ? 'Consider delaying; rain is likely' : 'No irrigation needed now';
  const irrigation: Recommendation = { recommendation, needed, duration_min: duration,
    priority: deficit > 4 && !rainExpected ? 'HIGH' : needed ? 'MEDIUM' : 'LOW', threshold,
    water_liters_est: duration*16, energy_kwh_est: round(duration/60*.85, 2), safety,
    why: [
      { label: 'Soil moisture', value: `${s.soil_moisture.toFixed(1)}%`, kind: 'observed' },
      { label: 'Crop stage', value: f.growth.stage, kind: 'model estimate' },
      { label: 'Rain probability', value: `${weather.rain_probability}%`, kind: 'cached / simulated' },
      { label: 'Air temperature', value: `${s.air_temperature.toFixed(1)}°C`, kind: 'observed' },
      { label: 'Last irrigation', value: f.last_irrigated_at ?? 'No record', kind: 'recorded' },
      { label: 'Available solar', value: `${energy.solar_kw.toFixed(1)} kW`, kind: 'observed / simulated' },
    ], basis: 'local deterministic crop / soil / rain rules', requires_farmer_confirmation: true, automation_enabled: false };
  return { ...f, health, energy, satellite_trend: trend, irrigation };
}

export function makeAlerts(fields: FieldData[], weather: Weather): Alert[] {
  const alerts: Alert[] = [];
  fields.forEach(f => {
    if (f.sensor.quality !== 'valid') alerts.push({ id: `quality-${f.id}`, field_id: f.id, severity: 'CRITICAL', type: 'SENSOR DATA UNRELIABLE', message: 'Verify sensor data before irrigation.', source: 'validation rule' });
    if (f.sensor.soil_moisture < f.irrigation.threshold) alerts.push({ id: `dry-${f.id}`, field_id: f.id, severity: 'WARNING', type: 'LOW SOIL MOISTURE', message: `${f.name} is below its crop-stage threshold. Inspect the soil.`, source: 'sensor + crop rule' });
    if (f.satellite_trend.consecutive_declines >= 3) alerts.push({ id: `stress-${f.id}`, field_id: f.id, severity: 'WARNING', type: 'VEGETATION DECLINE', message: `${f.name} index declined in recent simulated observations. Cause unconfirmed.`, source: 'simulated satellite' });
    if (f.energy.battery_pct < 20) alerts.push({ id: `energy-${f.id}`, field_id: f.id, severity: 'CRITICAL', type: 'LOW NODE ENERGY', message: `Check ${f.name} sensor-node storage.`, source: 'energy sensor' });
  });
  if (weather.rain_probability >= 65) alerts.push({ id: 'rain', field_id: null, severity: 'INFO', type: 'RAIN EXPECTED', message: 'Irrigation may be delayed where soil moisture is adequate.', source: weather.source });
  if (fields.some(f => f.irrigation.needed && f.energy.energy_status === 'SUFFICIENT')) alerts.push({ id: 'solar', field_id: null, severity: 'INFO', type: 'ENERGY AVAILABLE', message: 'Solar power is available for a planned irrigation cycle.', source: 'energy rule' });
  return alerts.sort((a,b) => ({CRITICAL:0,WARNING:1,INFO:2}[a.severity] - {CRITICAL:0,WARNING:1,INFO:2}[b.severity]));
}

export function offlineAnswer(question: string, f: FieldData, farm: FarmSnapshot, lang: LanguageCode): string {
  const q = question.toLowerCase();
  const price = farm.markets.find(m => m.crop === f.crop);
  const water = /water|irrigat|pump|moisture|सिंचाई|पानी|నీరు|தண்ணீர்|ನೀರು|পানি/.test(q);
  const rain = /rain|weather|forecast|बारिश|मौसम|వర్ష|மழை|ಮಳೆ|বৃষ্টি/.test(q);
  const market = /price|market|sell|mandi|भाव|कीमत|ధర|விலை|ಬೆಲೆ|দাম|ભાવ|ਕੀਮਤ/.test(q);
  const fert = /fertil|nutrient|urea|खाद|खत|ఎరువు|உரம்|ಗೊಬ್ಬರ|সার|ખાતર|ਖਾਦ/.test(q);
  const stress = /stress|health|wrong|yellow|ndvi|disease|बीमारी|पीला|ఆరోగ్యం|நோய்/.test(q);
  const energy = /solar|battery|energy|power|बिजली|సౌర|சூரிய/.test(q);
  const s = f.sensor;
  const fallback = `${f.name}: soil moisture ${s.soil_moisture}%, estimated crop health ${f.health.score}%. ${f.irrigation.recommendation}. This is a simulated, local rule-based suggestion, not a confirmed diagnosis.`;
  if (water && !f.irrigation.needed) {
    const prefix: Partial<Record<LanguageCode,string>> = {
      hi:`${f.name} में अभी सिंचाई की ज़रूरत नहीं है। नमी ${s.soil_moisture}% है, जो ${f.irrigation.threshold}% लक्ष्य से ऊपर है। निगरानी करें; पंप बंद रहेगा।`,
      te:`${f.name}కు ఇప్పుడు నీరు అవసరం లేదు. నేల తేమ ${s.soil_moisture}%, ${f.irrigation.threshold}% లక్ష్యం కంటే ఎక్కువ. గమనిస్తూ ఉండండి.`,
      mr:`${f.name} मध्ये आत्ता पाणी देण्याची गरज नाही. मातीतील ओलावा ${s.soil_moisture}% आहे.`,
      ta:`${f.name} இல் இப்போது பாசனம் தேவையில்லை. மண் ஈரம் ${s.soil_moisture}% ஆக உள்ளது.`,
      kn:`${f.name} ಗೆ ಈಗ ನೀರುಣಿಸುವ ಅಗತ್ಯವಿಲ್ಲ. ಮಣ್ಣಿನ ತೇವಾಂಶ ${s.soil_moisture}%.`,
      bn:`${f.name}-এ এখন সেচের প্রয়োজন নেই। মাটির আর্দ্রতা ${s.soil_moisture}%.`,
      gu:`${f.name} માં અત્યારે સિંચાઈની જરૂર નથી. ભેજ ${s.soil_moisture}%.`,
      pa:`${f.name} ਨੂੰ ਇਸ ਵੇਲੇ ਸਿੰਚਾਈ ਦੀ ਲੋੜ ਨਹੀਂ। ਮਿੱਟੀ ਦੀ ਨਮੀ ${s.soil_moisture}%.`,
    };
    return prefix[lang] ?? `No watering needed for ${f.name} now. Soil moisture is ${s.soil_moisture}%, above the ${f.irrigation.threshold}% crop-stage target. Keep monitoring; the pump stays off.`;
  }
  if (fert) {
    const soilTest: Record<LanguageCode,string> = {
      en:`I can't give a safe fertilizer dose without a soil test. Soil pH is ${s.soil_ph} and EC is ${s.soil_ec}. Ask a local agronomist for a ${f.crop} recommendation.`,
      hi:`मिट्टी की जाँच के बिना खाद की सुरक्षित मात्रा नहीं बता सकते। pH ${s.soil_ph}, EC ${s.soil_ec} है। स्थानीय कृषि विशेषज्ञ से पूछें।`,
      te:`నేల పరీక్ష లేకుండా సురక్షితమైన ఎరువు మోతాదు చెప్పలేం. pH ${s.soil_ph}, EC ${s.soil_ec}. స్థానిక వ్యవసాయ నిపుణుడిని సంప్రదించండి.`,
      mr:`माती तपासणीशिवाय खताची सुरक्षित मात्रा सांगता येत नाही. pH ${s.soil_ph}, EC ${s.soil_ec}. स्थानिक कृषी तज्ज्ञांचा सल्ला घ्या.`,
      ta:`மண் பரிசோதனை இல்லாமல் பாதுகாப்பான உர அளவைச் சொல்ல முடியாது. pH ${s.soil_ph}, EC ${s.soil_ec}. உள்ளூர் வேளாண் நிபுணரை அணுகவும்.`,
      kn:`ಮಣ್ಣಿನ ಪರೀಕ್ಷೆ ಇಲ್ಲದೆ ಸುರಕ್ಷಿತ ಗೊಬ್ಬರ ಪ್ರಮಾಣ ಹೇಳಲು ಸಾಧ್ಯವಿಲ್ಲ. pH ${s.soil_ph}, EC ${s.soil_ec}. ಕೃಷಿ ತಜ್ಞರನ್ನು ಕೇಳಿ.`,
      bn:`মাটি পরীক্ষা ছাড়া নিরাপদ সারের মাত্রা বলা যায় না। pH ${s.soil_ph}, EC ${s.soil_ec}। কৃষিবিদের পরামর্শ নিন।`,
      gu:`માટીની તપાસ વગર ખાતરની સુરક્ષિત માત્રા કહી શકાય નહીં. pH ${s.soil_ph}, EC ${s.soil_ec}. કૃષિ નિષ્ણાતને પૂછો.`,
      pa:`ਮਿੱਟੀ ਦੀ ਜਾਂਚ ਬਿਨਾਂ ਖਾਦ ਦੀ ਸੁਰੱਖਿਅਤ ਮਾਤਰਾ ਨਹੀਂ ਦੱਸੀ ਜਾ ਸਕਦੀ। pH ${s.soil_ph}, EC ${s.soil_ec}। ਖੇਤੀ ਮਾਹਿਰ ਨੂੰ ਪੁੱਛੋ।`,
    };
    return soilTest[lang];
  }
  if (lang === 'hi') {
    if (water) return `${f.name} में मिट्टी की नमी ${s.soil_moisture}% है। लगभग ${f.irrigation.duration_min} मिनट और ${f.irrigation.water_liters_est} लीटर पानी लग सकता है। पहले खेत देखें; आपकी अनुमति के बिना पंप नहीं चलेगा।`;
    if (rain) return `सहेजे गए पूर्वानुमान में बारिश की संभावना ${farm.weather.rain_probability}% है। सिंचाई से पहले स्थानीय मौसम की जाँच करें।`;
    if (market) return `${price?.market ?? 'मंडी'} में ${f.crop} का सहेजा भाव ₹${price?.price_per_kg ?? 'अज्ञात'}/किलो है। यह लाइव भाव नहीं है; मंडी में पुष्टि करें।`;
    return `${f.name} में मिट्टी की नमी ${s.soil_moisture}% और अनुमानित फसल स्वास्थ्य ${f.health.score}% है। पानी की कमी हो सकती है, पक्की पहचान नहीं। खेत की जाँच करें।`;
  }
  if (lang === 'te') {
    if (water) return `${f.name}లో నేల తేమ ${s.soil_moisture}%. సుమారు ${f.irrigation.duration_min} నిమిషాలు, ${f.irrigation.water_liters_est} లీటర్ల నీరు అవసరం కావచ్చు. ముందుగా పొలాన్ని పరిశీలించండి; మీ అనుమతి లేకుండా పంపు పనిచేయదు.`;
    if (rain) return `నిల్వ చేసిన వాతావరణ అంచనాలో వర్షం అవకాశం ${farm.weather.rain_probability}%. నీరు పెట్టే ముందు స్థానిక వాతావరణం పరిశీలించండి.`;
    if (market) return `${price?.market ?? 'మార్కెట్'}లో ${f.crop} గతంలో నిల్వ చేసిన ధర ₹${price?.price_per_kg ?? '—'}/కిలో. ఇది ప్రత్యక్ష ధర కాదు.`;
    return `${f.name}లో నేల తేమ ${s.soil_moisture}%, అంచనా పంట ఆరోగ్యం ${f.health.score}%. ఇది నిర్ధారిత రోగ నిర్ధారణ కాదు; పొలాన్ని పరిశీలించండి.`;
  }
  const other: Partial<Record<LanguageCode, { intro: string; check: string }>> = {
    mr: { intro: 'मातीतील ओलावा', check: 'हा अंदाज आहे; शेत तपासा.' },
    ta: { intro: 'மண் ஈரம்', check: 'இது மதிப்பீடு; வயலைச் சரிபார்க்கவும்.' },
    kn: { intro: 'ಮಣ್ಣಿನ ತೇವಾಂಶ', check: 'ಇದು ಅಂದಾಜು; ಹೊಲ ಪರಿಶೀಲಿಸಿ.' },
    bn: { intro: 'মাটির আর্দ্রতা', check: 'এটি একটি অনুমান; জমি পরীক্ষা করুন।' },
    gu: { intro: 'જમીનનો ભેજ', check: 'આ એક અંદાજ છે; ખેતર તપાસો.' },
    pa: { intro: 'ਮਿੱਟੀ ਦੀ ਨਮੀ', check: 'ਇਹ ਇੱਕ ਅੰਦਾਜ਼ਾ ਹੈ; ਖੇਤ ਦੀ ਜਾਂਚ ਕਰੋ।' },
  };
  if (lang !== 'en' && other[lang]) return `${f.name}: ${other[lang].intro} ${s.soil_moisture}%. ${other[lang].check} ${water ? `~${f.irrigation.duration_min} min / ${f.irrigation.water_liters_est} L.` : ''}`;
  if (market) return `The last saved ${f.crop} price at ${price?.market ?? 'the mandi'} is ₹${price?.price_per_kg ?? '—'}/kg. This is not live; check the mandi before selling.`;
  if (rain) return `Rain chance in the cached forecast is ${farm.weather.rain_probability}%. ${f.irrigation.recommendation}. Check the local forecast before watering.`;
  if (energy) return `Solar output is ${f.energy.solar_kw} kW; battery is ${f.energy.battery_pct}%. A planned irrigation cycle needs about ${f.irrigation.energy_kwh_est} kWh. Farmer confirmation and safety checks are still required.`;
  if (stress) return `${f.name} has estimated crop health ${f.health.score}% (confidence ${Math.round(f.health.confidence*100)}%). Soil moisture ${s.soil_moisture}% and NDVI ${f.satellite?.ndvi ?? 'unknown'} may indicate water stress, not a diagnosis. Inspect the field.`;
  if (water) return `${f.name} soil moisture is ${s.soil_moisture}%. ${f.irrigation.recommendation}. Suggested cycle: ${f.irrigation.duration_min} minutes, about ${f.irrigation.water_liters_est} L. Check the field first; the pump needs your confirmation.`;
  return fallback;
}
