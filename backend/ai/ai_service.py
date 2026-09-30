"""Advisory-only AI: optional API-backed explanation, always available local fallback."""
from uuid import uuid4

from backend.config import settings
from backend.db import Database
from backend.memory.memory_manager import MemoryManager
from backend.network import request_json

LANGUAGES = {"en": "English", "hi": "Hindi", "te": "Telugu", "mr": "Marathi", "ta": "Tamil",
             "kn": "Kannada", "bn": "Bengali", "gu": "Gujarati", "pa": "Punjabi"}

# Short, practical local advisories work without any network or AI API key.
LOCAL_MESSAGES = {
    "en": {
        "water": "{field} soil moisture is {moisture}%. {recommendation}. Suggested cycle: {duration} minutes, about {water} L. Check the field first; the pump needs your confirmation.",
        "stress": "{field} has an estimated health score of {score}%. Soil moisture is {moisture}% and NDVI is {ndvi}. Water stress is possible, not confirmed. Inspect leaves, soil and irrigation lines.",
        "rain": "Rain chance is {rain}% in the cached forecast. {recommendation}. Forecasts can change; check locally before watering.",
        "price": "The last saved {crop} price at {market} is ₹{price}/kg. This is a {source} quote, not a live price; check with the mandi before selling.",
        "fertilizer": "I can't give a safe fertilizer dose without a soil test and crop history. Check soil pH ({ph}) and EC ({ec}), and ask a local agronomist for a dose for {crop}.",
        "energy": "Solar output is {solar} kW and storage is {battery}%. The estimated irrigation needs {needed} kWh. Check the safety conditions before starting the simulated pump.",
        "general": "For {field}, soil moisture is {moisture}% and estimated crop health is {score}%. {recommendation}. Ask me about watering, rain, crop stress, price or energy.",
    },
    "hi": {
        "water": "{field} में मिट्टी की नमी {moisture}% है। {recommendation}। लगभग {duration} मिनट और {water} लीटर पानी लग सकता है। पहले खेत देखें; पंप आपकी अनुमति के बिना नहीं चलेगा।",
        "stress": "{field} का अनुमानित फसल स्वास्थ्य {score}% है। नमी {moisture}% और NDVI {ndvi} है। पानी की कमी हो सकती है, यह पक्की पहचान नहीं है। खेत की जाँच करें।",
        "rain": "सहेजे गए पूर्वानुमान में बारिश की संभावना {rain}% है। {recommendation}। सिंचाई से पहले स्थानीय मौसम देखें।",
        "price": "{market} में {crop} का पिछला सहेजा भाव ₹{price}/किलो है। यह लाइव भाव नहीं है; बेचने से पहले मंडी में जाँच करें।",
        "fertilizer": "मिट्टी की जाँच के बिना खाद की सुरक्षित मात्रा बताना संभव नहीं है। pH {ph} और EC {ec} है। स्थानीय कृषि विशेषज्ञ से सलाह लें।",
        "energy": "सौर ऊर्जा {solar} kW और बैटरी {battery}% है। सिंचाई को करीब {needed} kWh चाहिए। पंप चलाने से पहले सुरक्षा जाँच करें।",
        "general": "{field} की मिट्टी की नमी {moisture}% है और अनुमानित फसल स्वास्थ्य {score}% है। {recommendation}। पानी, मौसम या मंडी भाव के बारे में पूछें।",
    },
    "te": {"general": "{field}లో నేల తేమ {moisture}%, అంచనా పంట ఆరోగ్యం {score}%. {recommendation}. నీరు పెట్టే ముందు పొలాన్ని పరిశీలించండి.",
           "water": "{field}లో నేల తేమ {moisture}%. సుమారు {duration} నిమిషాలు, {water} లీటర్ల నీరు అవసరం కావచ్చు. ముందుగా పొలాన్ని పరిశీలించండి; మీ అనుమతి లేకుండా పంపు పనిచేయదు.",
           "rain": "నిల్వ చేసిన వాతావరణ అంచనాలో వర్షం అవకాశం {rain}%. నీరు పెట్టే ముందు స్థానిక వాతావరణం పరిశీలించండి.",
           "price": "{market}లో {crop} గతంలో నిల్వ చేసిన ధర ₹{price}/కిలో. ఇది ప్రత్యక్ష ధర కాదు; మార్కెట్‌లో నిర్ధారించండి."},
    "mr": {"general": "{field} मध्ये मातीतील ओलावा {moisture}% आहे आणि अंदाजे पीक आरोग्य {score}% आहे. {recommendation}. शेत तपासा.",
           "water": "{field} मध्ये मातीतील ओलावा {moisture}% आहे. अंदाजे {duration} मिनिटे, {water} लिटर पाणी लागू शकते. आधी शेत तपासा; तुमच्या परवानगीशिवाय पंप सुरू होणार नाही.",
           "rain": "जतन केलेल्या अंदाजानुसार पावसाची शक्यता {rain}% आहे. पाणी देण्याआधी स्थानिक हवामान तपासा.",
           "price": "{market} मध्ये {crop} चा मागील जतन केलेला भाव ₹{price}/किलो आहे. हा थेट भाव नाही; मंडीत खात्री करा."},
    "ta": {"general": "{field} இல் மண் ஈரம் {moisture}%; மதிப்பிடப்பட்ட பயிர் நலம் {score}%. {recommendation}. வயலைச் சரிபார்க்கவும்.",
           "water": "{field} இல் மண் ஈரம் {moisture}%. சுமார் {duration} நிமிடங்கள், {water} லிட்டர் நீர் தேவைப்படலாம். முதலில் வயலைச் சரிபார்க்கவும்; உங்கள் ஒப்புதல் இன்றி பம்ப் இயங்காது.",
           "rain": "சேமித்த வானிலை முன்னறிவிப்பில் மழை வாய்ப்பு {rain}%. பாசனத்திற்கு முன் உள்ளூர் வானிலையைச் சரிபார்க்கவும்.",
           "price": "{market} இல் {crop} கடைசியாகச் சேமித்த விலை ₹{price}/கிலோ. இது நேரடி விலை அல்ல; சந்தையில் உறுதிப்படுத்தவும்."},
    "kn": {"general": "{field} ನಲ್ಲಿ ಮಣ್ಣಿನ ತೇವಾಂಶ {moisture}%, ಅಂದಾಜು ಬೆಳೆ ಆರೋಗ್ಯ {score}%. {recommendation}. ಹೊಲ ಪರಿಶೀಲಿಸಿ.",
           "water": "{field} ನಲ್ಲಿ ಮಣ್ಣಿನ ತೇವಾಂಶ {moisture}%. ಸುಮಾರು {duration} ನಿಮಿಷ, {water} ಲೀಟರ್ ನೀರು ಬೇಕಾಗಬಹುದು. ಮೊದಲು ಹೊಲ ಪರಿಶೀಲಿಸಿ; ನಿಮ್ಮ ಅನುಮತಿ ಇಲ್ಲದೆ ಪಂಪ್ ಚಾಲನೆಯಾಗುವುದಿಲ್ಲ.",
           "rain": "ಉಳಿಸಿದ ಮುನ್ಸೂಚನೆಯಲ್ಲಿ ಮಳೆಯ ಸಾಧ್ಯತೆ {rain}%. ನೀರುಣಿಸುವ ಮೊದಲು ಸ್ಥಳೀಯ ಹವಾಮಾನ ಪರಿಶೀಲಿಸಿ.",
           "price": "{market} ನಲ್ಲಿ {crop} ಉಳಿಸಿದ ಕೊನೆಯ ಬೆಲೆ ₹{price}/ಕೆಜಿ. ಇದು ನೇರ ಬೆಲೆಯಲ್ಲ; ಮಾರುಕಟ್ಟೆಯಲ್ಲಿ ಖಚಿತಪಡಿಸಿ."},
    "bn": {"general": "{field}-এ মাটির আর্দ্রতা {moisture}%, আনুমানিক ফসলের স্বাস্থ্য {score}%. {recommendation}. জমি পরীক্ষা করুন।",
           "water": "{field}-এ মাটির আর্দ্রতা {moisture}%. প্রায় {duration} মিনিটে {water} লিটার জল লাগতে পারে। আগে জমি পরীক্ষা করুন; আপনার অনুমতি ছাড়া পাম্প চালু হবে না।",
           "rain": "সংরক্ষিত পূর্বাভাসে বৃষ্টির সম্ভাবনা {rain}%. সেচের আগে স্থানীয় আবহাওয়া দেখুন।",
           "price": "{market}-এ {crop}-এর সর্বশেষ সংরক্ষিত দাম ₹{price}/কেজি। এটি সরাসরি দাম নয়; বাজারে যাচাই করুন।"},
    "gu": {"general": "{field} માં જમીનનો ભેજ {moisture}% છે અને અંદાજિત પાક સ્વાસ્થ્ય {score}% છે. {recommendation}. ખેતર તપાસો.",
           "water": "{field} માં ભેજ {moisture}% છે. અંદાજે {duration} મિનિટમાં {water} લિટર પાણી લાગી શકે. પહેલાં ખેતર તપાસો; તમારી મંજૂરી વગર પંપ ચાલુ નહીં થાય.",
           "rain": "સાચવેલી આગાહીમાં વરસાદની શક્યતા {rain}% છે. સિંચાઈ પહેલાં સ્થાનિક હવામાન તપાસો.",
           "price": "{market} માં {crop} નો છેલ્લે સાચવેલો ભાવ ₹{price}/કિલો છે. આ જીવંત ભાવ નથી; બજારમાં ખાતરી કરો."},
    "pa": {"general": "{field} ਵਿੱਚ ਮਿੱਟੀ ਦੀ ਨਮੀ {moisture}% ਅਤੇ ਅਨੁਮਾਨਿਤ ਫ਼ਸਲ ਸਿਹਤ {score}% ਹੈ। {recommendation}। ਖੇਤ ਦੀ ਜਾਂਚ ਕਰੋ।",
           "water": "{field} ਵਿੱਚ ਨਮੀ {moisture}% ਹੈ। ਲਗਭਗ {duration} ਮਿੰਟ ਅਤੇ {water} ਲੀਟਰ ਪਾਣੀ ਲੱਗ ਸਕਦਾ ਹੈ। ਪਹਿਲਾਂ ਖੇਤ ਦੇਖੋ; ਤੁਹਾਡੀ ਮਨਜ਼ੂਰੀ ਬਿਨਾਂ ਪੰਪ ਨਹੀਂ ਚੱਲੇਗਾ।",
           "rain": "ਸੰਭਾਲੀ ਹੋਈ ਭਵਿੱਖਬਾਣੀ ਵਿੱਚ ਮੀਂਹ ਦੀ ਸੰਭਾਵਨਾ {rain}% ਹੈ। ਸਿੰਚਾਈ ਤੋਂ ਪਹਿਲਾਂ ਸਥਾਨਕ ਮੌਸਮ ਦੇਖੋ।",
           "price": "{market} ਵਿੱਚ {crop} ਦੀ ਪਿਛਲੀ ਸੰਭਾਲੀ ਕੀਮਤ ₹{price}/ਕਿਲੋ ਹੈ। ਇਹ ਲਾਈਵ ਕੀਮਤ ਨਹੀਂ; ਮੰਡੀ ਵਿੱਚ ਪੁਸ਼ਟੀ ਕਰੋ।"},
}

# Additional local safety-critical explanations; remote language models can expand these.
EXTRA_LOCAL_MESSAGES = {
    "te": {
        "stress": "{field} పంట ఆరోగ్యం అంచనా {score}%. నేల తేమ {moisture}%, NDVI {ndvi}. నీటి ఒత్తిడి ఉండవచ్చు; ఇది నిర్ధారణ కాదు. పొలాన్ని పరిశీలించండి.",
        "fertilizer": "నేల పరీక్ష లేకుండా సురక్షితమైన ఎరువు మోతాదు చెప్పలేం. pH {ph}, EC {ec}. స్థానిక వ్యవసాయ నిపుణుడిని సంప్రదించండి.",
        "energy": "సౌర ఉత్పత్తి {solar} kW, బ్యాటరీ {battery}%. పంపు ప్రారంభానికి ముందుగా భద్రతా తనిఖీ మరియు మీ అనుమతి అవసరం.",
    },
    "mr": {
        "stress": "{field} चे अंदाजे पीक आरोग्य {score}% आहे. ओलावा {moisture}%, NDVI {ndvi}. पाण्याचा ताण असू शकतो; ही निश्चित ओळख नाही. शेत तपासा.",
        "fertilizer": "माती तपासणीशिवाय खताची सुरक्षित मात्रा सांगता येत नाही. pH {ph}, EC {ec}. स्थानिक कृषी तज्ज्ञांचा सल्ला घ्या.",
        "energy": "सौर उत्पादन {solar} kW व बॅटरी {battery}% आहे. पंप सुरू करण्याआधी सुरक्षा तपासणी व तुमची परवानगी आवश्यक आहे.",
    },
    "ta": {
        "stress": "{field} பயிர் நல மதிப்பீடு {score}%. மண் ஈரம் {moisture}%, NDVI {ndvi}. நீர்ப்பற்றாக்குறை இருக்கலாம்; இது உறுதியான நோயறிதல் அல்ல. வயலைப் பாருங்கள்.",
        "fertilizer": "மண் பரிசோதனை இல்லாமல் பாதுகாப்பான உர அளவைச் சொல்ல முடியாது. pH {ph}, EC {ec}. உள்ளூர் வேளாண் நிபுணரை அணுகவும்.",
        "energy": "சூரிய உற்பத்தி {solar} kW; பேட்டரி {battery}%. பம்பை இயக்க முன் பாதுகாப்பு சோதனையும் உங்கள் ஒப்புதலும் தேவை.",
    },
    "kn": {
        "stress": "{field} ಬೆಳೆ ಆರೋಗ್ಯ ಅಂದಾಜು {score}%. ತೇವಾಂಶ {moisture}%, NDVI {ndvi}. ನೀರಿನ ಒತ್ತಡ ಇರಬಹುದು; ಇದು ಖಚಿತ ರೋಗನಿರ್ಣಯವಲ್ಲ. ಹೊಲ ಪರಿಶೀಲಿಸಿ.",
        "fertilizer": "ಮಣ್ಣಿನ ಪರೀಕ್ಷೆ ಇಲ್ಲದೆ ಸುರಕ್ಷಿತ ಗೊಬ್ಬರ ಪ್ರಮಾಣ ಹೇಳಲು ಸಾಧ್ಯವಿಲ್ಲ. pH {ph}, EC {ec}. ಸ್ಥಳೀಯ ಕೃಷಿ ತಜ್ಞರನ್ನು ಕೇಳಿ.",
        "energy": "ಸೌರ ಉತ್ಪಾದನೆ {solar} kW, ಬ್ಯಾಟರಿ {battery}%. ಪಂಪ್ ಆರಂಭಿಸಲು ಮುಂಚೆ ಸುರಕ್ಷತಾ ಪರಿಶೀಲನೆ ಮತ್ತು ನಿಮ್ಮ ಅನುಮತಿ ಅಗತ್ಯ.",
    },
    "bn": {
        "stress": "{field}-এর আনুমানিক ফসলের স্বাস্থ্য {score}%. আর্দ্রতা {moisture}%, NDVI {ndvi}. জলের চাপ থাকতে পারে; এটি নিশ্চিত রোগ নির্ণয় নয়। জমি দেখুন।",
        "fertilizer": "মাটি পরীক্ষা ছাড়া নিরাপদ সারের মাত্রা বলা যায় না। pH {ph}, EC {ec}। স্থানীয় কৃষিবিদের পরামর্শ নিন।",
        "energy": "সৌর উৎপাদন {solar} kW, ব্যাটারি {battery}%. পাম্প চালুর আগে নিরাপত্তা পরীক্ষা ও আপনার অনুমতি দরকার।",
    },
    "gu": {
        "stress": "{field} નો અંદાજિત પાક આરોગ્ય સ્કોર {score}% છે. ભેજ {moisture}%, NDVI {ndvi}. પાણીની તાણ હોઈ શકે; આ ખાતરીપૂર્વકનું નિદાન નથી. ખેતર તપાસો.",
        "fertilizer": "માટીની તપાસ વગર ખાતરની સુરક્ષિત માત્રા કહી શકાય નહીં. pH {ph}, EC {ec}. સ્થાનિક કૃષિ નિષ્ણાતને પૂછો.",
        "energy": "સૌર ઉત્પાદન {solar} kW અને બેટરી {battery}% છે. પંપ માટે પહેલાં સુરક્ષા તપાસ અને તમારી મંજૂરી જરૂરી છે.",
    },
    "pa": {
        "stress": "{field} ਦੀ ਅਨੁਮਾਨਿਤ ਫ਼ਸਲ ਸਿਹਤ {score}% ਹੈ। ਨਮੀ {moisture}%, NDVI {ndvi}। ਪਾਣੀ ਦੀ ਘਾਟ ਹੋ ਸਕਦੀ ਹੈ; ਇਹ ਪੱਕਾ ਨਿਦਾਨ ਨਹੀਂ। ਖੇਤ ਦੇਖੋ।",
        "fertilizer": "ਮਿੱਟੀ ਦੀ ਜਾਂਚ ਬਿਨਾਂ ਖਾਦ ਦੀ ਸੁਰੱਖਿਅਤ ਮਾਤਰਾ ਨਹੀਂ ਦੱਸੀ ਜਾ ਸਕਦੀ। pH {ph}, EC {ec}। ਸਥਾਨਕ ਖੇਤੀ ਮਾਹਿਰ ਨੂੰ ਪੁੱਛੋ।",
        "energy": "ਸੂਰਜੀ ਉਤਪਾਦਨ {solar} kW ਤੇ ਬੈਟਰੀ {battery}% ਹੈ। ਪੰਪ ਲਈ ਪਹਿਲਾਂ ਸੁਰੱਖਿਆ ਜਾਂਚ ਅਤੇ ਤੁਹਾਡੀ ਮਨਜ਼ੂਰੀ ਜ਼ਰੂਰੀ ਹੈ।",
    },
}

NO_WATER_MESSAGES = {
    "en": "No watering needed for {field} now. Soil moisture is {moisture}%, at or above the {threshold}% crop-stage target. Keep monitoring; the pump stays off.",
    "hi": "{field} में अभी सिंचाई की ज़रूरत नहीं है। मिट्टी की नमी {moisture}% है, जो {threshold}% लक्ष्य से ऊपर है। निगरानी करें; पंप बंद रहेगा।",
    "te": "{field}కు ఇప్పుడు నీరు అవసరం లేదు. నేల తేమ {moisture}%, {threshold}% లక్ష్యం కంటే ఎక్కువ. గమనిస్తూ ఉండండి; పంపు ఆఫ్‌లో ఉంటుంది.",
    "mr": "{field} मध्ये आत्ता पाणी देण्याची गरज नाही. मातीतील ओलावा {moisture}%, {threshold}% उद्दिष्टापेक्षा जास्त आहे. निरीक्षण सुरू ठेवा.",
    "ta": "{field} இல் இப்போது பாசனம் தேவையில்லை. மண் ஈரம் {moisture}%, {threshold}% இலக்கை விட அதிகம். தொடர்ந்து கண்காணிக்கவும்.",
    "kn": "{field} ಗೆ ಈಗ ನೀರುಣಿಸುವ ಅಗತ್ಯವಿಲ್ಲ. ಮಣ್ಣಿನ ತೇವಾಂಶ {moisture}%, {threshold}% ಗುರಿಗಿಂತ ಹೆಚ್ಚು. ಗಮನಿಸುತ್ತಿರಿ.",
    "bn": "{field}-এ এখন সেচের প্রয়োজন নেই। মাটির আর্দ্রতা {moisture}%, {threshold}% লক্ষ্যের উপরে। নজর রাখুন।",
    "gu": "{field} માં અત્યારે સિંચાઈની જરૂર નથી. ભેજ {moisture}%, {threshold}% લક્ષ્યથી વધારે છે. દેખરેખ રાખો.",
    "pa": "{field} ਨੂੰ ਇਸ ਵੇਲੇ ਸਿੰਚਾਈ ਦੀ ਲੋੜ ਨਹੀਂ। ਮਿੱਟੀ ਦੀ ਨਮੀ {moisture}%, {threshold}% ਟੀਚੇ ਤੋਂ ਉੱਪਰ ਹੈ। ਨਿਗਰਾਨੀ ਕਰੋ।",
}


def _intent(question: str) -> str:
    q = question.casefold()
    if any(w in q for w in ("price", "market", "sell", "mandi", "भाव", "कीमत", "ధర", "விலை", "ಬೆಲೆ", "দাম", "ભાવ", "ਕੀਮਤ")):
        return "price"
    if any(w in q for w in ("fertil", "nutrient", "urea", "खाद", "खत", "खताची", "ఎరువు", "உரம்", "ಗೊಬ್ಬರ", "সার", "ખાતર", "ਖਾਦ")):
        return "fertilizer"
    if any(w in q for w in ("rain", "weather", "forecast", "बारिश", "मौसम", "వర్ష", "மழை", "ಮಳೆ", "বৃষ্টি")):
        return "rain"
    if any(w in q for w in ("solar", "battery", "energy", "power", "बिजली", "సౌర", "சூரிய")):
        return "energy"
    if any(w in q for w in ("stress", "health", "wrong", "yellow", "ndvi", "disease", "बीमारी", "पीला", "ఆరోగ్యం", "நோய்")):
        return "stress"
    if any(w in q for w in ("water", "irrigat", "pump", "moisture", "सिंचाई", "पानी", "నీరు", "தண்ணீர்", "ನೀರು", "পানি")):
        return "water"
    return "general"


class AIService:
    def __init__(self, db: Database):
        self.memory = MemoryManager(db)
        self.db = db

    def answer(self, question: str, field_context: dict, weather: dict, markets: list[dict],
               language: str = "en", allow_remote: bool = True, message_id: str | None = None) -> dict:
        if not question.strip() or len(question) > 2000:
            raise ValueError("Question must be 1–2000 characters")
        if language not in LANGUAGES:
            raise ValueError("Unsupported language")
        farm_field = field_context
        sensor, health, irrigation, energy = (farm_field[key] for key in ("sensor", "health", "irrigation", "energy"))
        market = next((m for m in markets if m["crop"] == farm_field["crop"]), markets[0] if markets else None)
        memories = self.memory.search_memory(question, farm_field["id"], 3)
        answer = None
        mode = "offline intelligence"
        if allow_remote and settings.ai_api_key and settings.ai_model:
            try:
                context = {
                    "field": farm_field["name"], "crop": farm_field["crop"],
                    "field_profile": {"variety": farm_field["variety"], "area_acres": farm_field["area_acres"],
                                      "soil_type": farm_field["soil_type"], "irrigation_method": farm_field["irrigation_method"],
                                      "sown_at": farm_field["sown_at"]},
                    "crop_growth_estimate": farm_field["growth"],
                    "previous_crop_cycles": farm_field["crop_cycles"][-2:],
                    "irrigation_history": farm_field["irrigation_history"][-3:],
                    "recent_satellite_indices": [{"ndvi": o["ndvi"], "ndwi": o["ndwi"], "timestamp": o["timestamp"]}
                                                 for o in farm_field["satellite_history"][-3:]],
                    "sensor": {
                        "soil_moisture_pct": sensor["soil_moisture"], "temperature_c": sensor["air_temperature"],
                        "quality": sensor["quality"], "source": sensor["source"]},
                    "health_estimate": {"score": health["score"], "inference": health["inference"],
                                        "confidence": health["confidence"]},
                    "irrigation_rule_result": irrigation, "weather": weather,
                    "market": market, "energy": {"solar_kw": energy["solar_kw"], "battery_pct": energy["battery_pct"]},
                    "relevant_local_history": [m["content"][:400] for m in memories],
                }
                import json
                data = request_json("POST", settings.ai_base_url.rstrip("/") + "/chat/completions",
                                    headers={"Authorization": f"Bearer {settings.ai_api_key}",
                                             "Content-Type": "application/json"},
                                    payload={"model": settings.ai_model, "temperature": .2, "max_tokens": 300,
                                             "messages": [
                                                 {"role": "system", "content": "You are a helpful Indian smallholder farm advisor. "
                                                  "Reply simply in " + LANGUAGES[language] + ". Label observations versus possible causes. "
                                                  "Simulated/cached observations are not live; don't assert a diagnosis or exact fertilizer dose. "
                                                  "NEVER claim to have switched on a pump or issue actuator commands. "
                                                  "The deterministic safety engine and farmer confirmation always decide pump control."},
                                                 {"role": "user", "content": "Farm context (JSON): " + json.dumps(context, default=str)
                                                  + "\nFarmer's question: " + question}],
                                             })
                candidate = data["choices"][0]["message"]["content"]
                if isinstance(candidate, str) and candidate.strip():
                    answer, mode = candidate.strip()[:2000], "AI API advisory"
            except (ConnectionError, ValueError, KeyError, IndexError, TypeError) as exc:
                self.db.audit("ai_fallback", farm_field["id"], {"reason": type(exc).__name__})
        if not answer:
            intent = _intent(question)
            templates = {**LOCAL_MESSAGES[language], **EXTRA_LOCAL_MESSAGES.get(language, {})}
            template = NO_WATER_MESSAGES[language] if intent == "water" and not irrigation["needed"] else templates.get(intent) or templates["general"]
            answer = template.format(
                field=farm_field["name"], crop=farm_field["crop"], moisture=sensor["soil_moisture"],
                threshold=irrigation["threshold"],
                score=health["score"], ndvi=f"{farm_field['satellite']['ndvi']:.2f}" if farm_field["satellite"] else "unknown",
                recommendation=irrigation["recommendation"], duration=irrigation["duration_min"],
                water=irrigation["water_liters_est"], rain=weather["rain_probability"],
                market=market["market"] if market else "nearby mandi", price=market["price_per_kg"] if market else "unknown",
                source=market["source"] if market else "cached", ph=sensor["soil_ph"], ec=sensor["soil_ec"],
                solar=energy["solar_kw"], battery=energy["battery_pct"], needed=irrigation["energy_kwh_est"],
            )
        mid = message_id or str(uuid4())
        self.memory.store_memory(f"Q: {question.strip()}\nA: {answer}", "farmer_question", farm_field["id"],
                                 {"language": language, "mode": mode}, mid)
        self.db.audit("ai_recommendation", farm_field["id"], {"mode": mode, "message_id": mid})
        return {"answer": answer, "mode": mode, "memory_id": mid,
                "memories_consulted": len(memories), "language": language,
                "notice": "AI service unavailable — operating in offline intelligence mode." if mode == "offline intelligence" else
                          "AI advice is not a confirmed diagnosis. Pump control stays with the farmer and safety rules."}
