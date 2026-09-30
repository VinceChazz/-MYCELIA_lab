import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, AudioLines, BookOpenText, CircleHelp, CloudOff, Globe2, Leaf, LockKeyhole, Mic, Send, ShieldCheck, Sparkles, Volume2, WifiOff } from 'lucide-react';
import { browserVoice } from '../lib/voice';
import { timeAgo } from '../lib/model';
import type { ChatMessage, FarmSnapshot, FieldData, LanguageCode } from '../lib/types';

const languages: {code:LanguageCode;name:string;native:string}[] = [
  {code:'en',name:'English',native:'English'}, {code:'hi',name:'Hindi',native:'हिन्दी'},
  {code:'te',name:'Telugu',native:'తెలుగు'}, {code:'mr',name:'Marathi',native:'मराठी'},
  {code:'ta',name:'Tamil',native:'தமிழ்'}, {code:'kn',name:'Kannada',native:'ಕನ್ನಡ'},
  {code:'bn',name:'Bengali',native:'বাংলা'}, {code:'gu',name:'Gujarati',native:'ગુજરાતી'},
  {code:'pa',name:'Punjabi',native:'ਪੰਜਾਬੀ'},
];
const prompts = [
  {icon:'💧',text:'Should I water my tomato field?'},
  {icon:'🌱',text:'Why is my field showing stress?'},
  {icon:'🌦',text:'Is rain expected tomorrow?'},
  {icon:'₹',text:"What's today's tomato price?"},
];

export function Assistant({snapshot,selected,messages,asking,askQuestion,language,setLanguage,offline,
  prefill,voiceRequest,onPrefillHandled,notify}: {snapshot:FarmSnapshot;selected:FieldData;messages:ChatMessage[];asking:boolean;
  askQuestion:(text:string,fieldId:string,lang:LanguageCode)=>Promise<void>;language:LanguageCode;setLanguage:(lang:LanguageCode)=>void;
  offline:boolean;prefill:string;voiceRequest:number;onPrefillHandled:()=>void;notify:(text:string)=>void}) {
  const [draft,setDraft] = useState(''); const [listening,setListening] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);const bottomRef=useRef<HTMLDivElement>(null);
  const seenVoiceRequest=useRef(0);
  const related=messages.filter(m=>m.field_id===selected.id);
  const lastMode=[...related].reverse().find(m=>m.role==='assistant')?.mode;
  useEffect(()=>{if(prefill){setDraft(prefill);inputRef.current?.focus();onPrefillHandled();}},[prefill,onPrefillHandled]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});},[messages.length,asking]);
  const startVoice=useCallback(async()=>{
    if(listening)return;
    setListening(true);
    try {const transcript=await browserVoice.recognize(language,offline);
      if(transcript){setDraft(transcript);notify(`Heard: “${transcript}” — review and tap send.`);inputRef.current?.focus();}}
    catch(e){notify(e instanceof Error?e.message:'Voice unavailable. Please type instead.');inputRef.current?.focus();}
    finally{setListening(false);}
  },[language,offline,listening,notify]);
  useEffect(()=>{if(voiceRequest>0 && voiceRequest!==seenVoiceRequest.current){seenVoiceRequest.current=voiceRequest;void startVoice();}},[voiceRequest,startVoice]);
  const send=async()=>{const text=draft.trim();if(!text||asking)return;setDraft('');await askQuestion(text,selected.id,language);};
  const speak=async(text:string,lang:LanguageCode)=>{try{await browserVoice.speak(text,lang,offline);}catch(e){notify(e instanceof Error?e.message:'Audio unavailable.');}};
  return <div className="page-stack assistant-page"><div className="page-intro"><div><p className="eyebrow">A FARM ADVISOR THAT REMEMBERS</p><h1>Ask. Understand. Grow.</h1><p>Simple, practical answers grounded in your field's data.</p></div><div className="assistant-language"><Globe2 size={18}/><select value={language} onChange={e=>setLanguage(e.target.value as LanguageCode)} aria-label="Assistant language">{languages.map(l=><option key={l.code} value={l.code}>{l.native} · {l.name}</option>)}</select></div></div>
    <div className="assistant-layout"><section className="surface chat-panel"><div className="chat-header"><div className="chat-identity"><span className="chat-avatar"><Leaf size={22}/></span><div><strong>Root to Power AI</strong><span><i/> {offline?'Local intelligence · offline':'Local + optional AI API'} · {selected.name}</span></div></div><div className="chat-header-icon"><LockKeyhole size={17}/> Private farm memory</div></div>
      {(offline||!snapshot.ai_configured||lastMode==='offline intelligence')&&<div className="chat-offline-notice"><CloudOff size={17}/><span>AI service unavailable — operating in offline intelligence mode. Your questions are saved locally.</span></div>}
      <div className="chat-messages" aria-live="polite">{related.length===0?<div className="chat-empty"><span className="chat-empty-logo"><Sparkles size={27}/></span><p className="eyebrow">HELLO, FARMER</p><h2>What would you like to know?</h2><p>I can help you understand {selected.name}'s soil, crop, weather, market prices and irrigation plan. I won't switch a pump on.</p>
        <div className="quick-prompts">{prompts.map(p=><button key={p.text} onClick={()=>{setDraft(p.text);inputRef.current?.focus();}}><span>{p.icon}</span>{p.text}<ArrowRight size={15}/></button>)}</div></div>:
        <>{related.map(message=><div className={`chat-row chat-row--${message.role}`} key={message.id}>{message.role==='assistant'&&<span className="chat-message-avatar"><Leaf size={15}/></span>}
          <div className="chat-message"><p>{message.text}</p><div className="chat-message-meta">{message.role==='farmer'?'YOU':message.mode==='offline intelligence'?'LOCAL RULES':'ROOT AI'} · {timeAgo(message.time)}
            {message.role==='assistant'&&<button aria-label="Read this answer aloud" title="Read aloud" onClick={()=>void speak(message.text,(message.language??language) as LanguageCode)}><Volume2 size={14}/></button>}</div></div></div>)}
          {asking&&<div className="chat-row chat-row--assistant"><span className="chat-message-avatar"><Leaf size={15}/></span><div className="chat-message typing"><i/><i/><i/> Checking the field's data…</div></div>}<div ref={bottomRef}/></>}
      </div>
      <div className="chat-compose"><div className="compose-field"><textarea ref={inputRef} rows={2} value={draft} onChange={e=>setDraft(e.target.value)} placeholder={`Ask about ${selected.name} in your language...`}
        onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send();}}} aria-label="Ask the farm assistant" maxLength={2000}/><div className="compose-actions"><button className={`mic-button ${listening?'mic-button--listening':''}`} onClick={()=>void startVoice()} disabled={listening} aria-label="Ask by voice" title="Ask by voice"><Mic size={19}/>{listening?'Listening…':'Ask by voice'}</button>
          <button className="send-button" onClick={()=>void send()} disabled={!draft.trim()||asking} aria-label="Send question"><Send size={18}/></button></div></div><span className="compose-note"><ShieldCheck size={14}/> Advice is not a confirmed diagnosis. Pump control requires your confirmation.</span></div></section>
      <aside className="assistant-side"><div className="surface assistant-context"><p className="eyebrow">YOUR FIELD CONTEXT</p><h3>{selected.name} <span>{selected.crop}</span></h3><div className="context-row"><span>Soil moisture</span><strong>{selected.sensor.soil_moisture.toFixed(1)}%</strong></div><div className="context-row"><span>Crop-health estimate</span><strong>{selected.health.score}%</strong></div><div className="context-row"><span>Growth stage</span><strong>{selected.growth.stage}</strong></div><div className="context-row"><span>Solar energy</span><strong>{selected.energy.solar_kw} kW</strong></div><small>Source: simulated sensor + local models</small></div>
        <div className="surface assistant-memory"><span className="memory-icon"><BookOpenText size={20}/></span><h3>Your farm has a memory.</h3><p>Previous questions and field observations stay on this device and sync when you're back online.</p><div><span>{Math.ceil(related.length/2)}<small>local conversations</small></span><span><WifiOff size={16}/><small>works offline</small></span></div></div>
        <div className="assistant-caution"><CircleHelp size={17}/><span>For pesticide or fertilizer dosage, consult a local agronomist and a soil test.</span></div>
        <div className="assistant-voice-note"><AudioLines size={17}/><span>Voice uses your device's speech services. If offline speech isn't installed, type your question instead.</span></div></aside></div>
    <p className="under-page-note">Assistant context combines {snapshot.fields.length} farm fields through one local data model. AI never acts as an unrestricted pump controller.</p>
  </div>;
}
