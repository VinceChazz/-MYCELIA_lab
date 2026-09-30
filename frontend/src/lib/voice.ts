// Replaceable voice boundary; no speech service credentials in the client.
import type { LanguageCode } from './types';

const locale: Record<LanguageCode,string> = {en:'en-IN',hi:'hi-IN',te:'te-IN',mr:'mr-IN',ta:'ta-IN',kn:'kn-IN',bn:'bn-IN',gu:'gu-IN',pa:'pa-IN'};

type RecognitionEvent = { results: ArrayLike<ArrayLike<{transcript:string}>> };
type Recognition = { lang:string;continuous:boolean;interimResults:boolean;processLocally?:boolean;
  onresult:((event:RecognitionEvent)=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;
  start:()=>void;stop:()=>void };
type RecognitionConstructor = new()=>Recognition;

export interface VoiceAdapter {
  recognize(language:LanguageCode,offline:boolean):Promise<string>;
  speak(text:string,language:LanguageCode,offline:boolean):Promise<void>;
}

// A local Whisper/Vosk adapter can implement VoiceAdapter without changing the chat UI.
export const browserVoice: VoiceAdapter = {
  recognize(language,offline) {
    const browser=window as unknown as {SpeechRecognition?:RecognitionConstructor;webkitSpeechRecognition?:RecognitionConstructor};
    const Constructor=browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) return Promise.reject(new Error('Voice recognition is not available on this device. Please type instead.'));
    const recognition=new Constructor();
    if (offline && !('processLocally' in recognition)) return Promise.reject(new Error('Offline speech recognition is not installed here. Please type your question instead.'));
    recognition.lang=locale[language]; recognition.continuous=false; recognition.interimResults=false;
    if (offline) recognition.processLocally=true;
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(value?:string,error?:string)=>{if(done)return;done=true;window.clearTimeout(timer);if(error)reject(new Error(error));else resolve(value??'');};
      const timer=window.setTimeout(()=>{recognition.stop();finish(undefined,'Voice timed out. Please type your question instead.');},12000);
      recognition.onresult=e=>finish(e.results[0]?.[0]?.transcript?.trim()??'');
      recognition.onerror=e=>finish(undefined,`Voice recognition unavailable (${e.error}). Please type instead.`);
      recognition.onend=()=>finish(undefined,'No speech detected. Please type your question instead.');
      try{recognition.start();}catch{finish(undefined,'Microphone unavailable. Please type your question instead.');}
    });
  },
  async speak(text,language,offline) {
    if (!('speechSynthesis' in window)) throw new Error('Speech playback is not available. The answer is shown as text.');
    const voices=speechSynthesis.getVoices();
    const selected=voices.find(v=>v.lang.toLowerCase()===locale[language].toLowerCase() && (!offline || v.localService)) ??
      voices.find(v=>v.lang.startsWith(language) && (!offline || v.localService));
    if (offline && !selected) throw new Error('No offline voice for this language is installed. The answer is shown as text.');
    speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.lang=locale[language];utterance.rate=.92;
    if(selected)utterance.voice=selected;
    speechSynthesis.speak(utterance);
  },
};
