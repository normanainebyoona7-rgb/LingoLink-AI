"""Dictionary lookup using Gemini + MyMemory + Wiktionary + Kamusi with full language coverage"""
import requests
from typing import Optional, Dict, List
import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Full language codes
LANG_CODES = {
    "english": "en", "french": "fr", "spanish": "es", "german": "de",
    "portuguese": "pt", "italian": "it", "dutch": "nl", "russian": "ru",
    "arabic": "ar", "hindi": "hi", "chinese": "zh", "japanese": "ja",
    "korean": "ko", "turkish": "tr", "vietnamese": "vi", "thai": "th",
    "indonesian": "id", "hebrew": "he", "greek": "el",
    "polish": "pl", "swedish": "sv", "danish": "da", "finnish": "fi",
    "norwegian": "no", "czech": "cs", "romanian": "ro",
    "hungarian": "hu", "ukrainian": "uk", "persian": "fa",
    "luganda": "lg", "swahili": "sw", "kinyarwanda": "rw",
    "kirundi": "rn", "amharic": "am", "somali": "so",
    "yoruba": "yo", "hausa": "ha", "igbo": "ig",
    "shona": "sn", "chichewa": "ny", "afrikaans": "af",
    "zulu": "zu", "xhosa": "xh", "sesotho": "st",
    "setswana": "tn", "fulfulde": "ff", "wolof": "wo",
    "bambara": "bm", "lingala": "ln", "kikongo": "kg",
    "bemba": "bem", "oromo": "om", "tigrinya": "ti",
    "kikuyu": "ki", "dholuo": "luo", "kabyle": "kab",
    "tachelhit": "shi", "ewe": "ee", "twi": "tw",
}

AFRICAN_LANGS = [
    "luganda", "acholi", "alur", "ateso", "rukiga", "runyankole",
    "swahili", "kinyarwanda", "kirundi", "amharic", "somali",
    "oromo", "tigrinya", "yoruba", "hausa", "igbo", "zulu",
    "xhosa", "shona", "chichewa", "bemba", "lingala", "kikongo"
]

def mymemory_lookup(word: str, source_lang: str, target_lang: str) -> Optional[List[Dict]]:
    """MyMemory API - free translation memory"""
    try:
        src = LANG_CODES.get(source_lang, "en")
        tgt = LANG_CODES.get(target_lang, "en")
        
        url = f"https://api.mymemory.translated.net/get?q={requests.utils.quote(word)}&langpair={src}|{tgt}"
        resp = requests.get(url, timeout=15)
        
        if resp.status_code == 200:
            data = resp.json()
            results = []
            
            translated = data.get("responseData", {}).get("translatedText", "")
            if translated and translated.lower() != word.lower():
                results.append({"word": translated, "meaning": "Main translation"})
            
            matches = data.get("matches", [])
            for match in matches[:10]:
                match_word = match.get("translation", "")
                if match_word and match_word.lower() != word.lower():
                    results.append({
                        "word": match_word,
                        "meaning": f"Quality: {match.get('quality', 'N/A')}"
                    })
            
            return results if results else None
    except Exception as e:
        print(f"MyMemory error: {e}")
    return None

def gemini_dictionary(word: str, source_lang: str, target_lang: str) -> Optional[List[Dict]]:
    """Use Gemini for accurate word translation"""
    if not GEMINI_API_KEY:
        return None
    
    try:
        prompt = f"Translate the word '{word}' from {source_lang} to {target_lang}. Return ONLY the translation, nothing else."
        
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={GEMINI_API_KEY}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": 50, "temperature": 0.1}
        }
        resp = requests.post(url, json=payload, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            candidates = data.get("candidates", [])
            if candidates:
                result = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                result = result.strip('"').strip("'")
                if result and result.lower() != word.lower():
                    return [{"word": result, "meaning": "AI translation"}]
    except Exception as e:
        print(f"Gemini dictionary error: {e}")
    return None

def wiktionary_lookup(word: str, lang: str) -> Optional[str]:
    """Free Wiktionary API for definitions"""
    try:
        code = LANG_CODES.get(lang, "en")
        
        url = f"https://{code}.wiktionary.org/api/rest_v1/page/definition/{requests.utils.quote(word)}"
        resp = requests.get(url, timeout=15)
        
        if resp.status_code == 200:
            data = resp.json()
            if data:
                for lang_section in data:
                    defs = lang_section.get("definitions", [])
                    if defs:
                        return defs[0].get("definition", "")
        
        url2 = f"https://en.wiktionary.org/api/rest_v1/page/definition/{requests.utils.quote(word)}"
        resp2 = requests.get(url2, timeout=15)
        if resp2.status_code == 200:
            data2 = resp2.json()
            if data2:
                for lang_section in data2:
                    defs = lang_section.get("definitions", [])
                    if defs:
                        return defs[0].get("definition", "")
    except Exception as e:
        print(f"Wiktionary error: {e}")
    return None

def kamusi_lookup(word: str, source_lang: str = "swahili", target_lang: str = "english") -> Optional[List[Dict]]:
    """Kamusi Project - African languages"""
    try:
        url = f"https://kamusi.org/api/search?q={requests.utils.quote(word)}"
        resp = requests.get(url, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if data:
                results = []
                items = data if isinstance(data, list) else data.get("results", [])
                for item in items[:10]:
                    if isinstance(item, dict):
                        results.append({
                            "word": item.get("word", item.get("term", "")),
                            "meaning": item.get("definition", item.get("meaning", ""))
                        })
                return results if results else None
    except:
        pass
    return None

def lookup_word(word: str, source_lang: str, target_lang: str) -> Dict:
    """Combined dictionary lookup - Gemini FIRST for African languages"""
    
    # 1. Gemini FIRST for African languages (most accurate)
    if source_lang in AFRICAN_LANGS or target_lang in AFRICAN_LANGS:
        gemini_results = gemini_dictionary(word, source_lang, target_lang)
        if gemini_results:
            return {"word": word, "translations": gemini_results, "source": "gemini", "success": True}
    
    # 2. MyMemory (fast, free)
    results = mymemory_lookup(word, source_lang, target_lang)
    if results:
        return {"word": word, "translations": results, "source": "mymemory", "success": True}
    
    # 3. Gemini backup
    gemini_results = gemini_dictionary(word, source_lang, target_lang)
    if gemini_results:
        return {"word": word, "translations": gemini_results, "source": "gemini", "success": True}
    
    # 4. Wiktionary
    definition = wiktionary_lookup(word, source_lang)
    if definition:
        return {"word": word, "definition": definition, "source": "wiktionary", "success": True}
    
    # 5. Kamusi
    kamusi_results = kamusi_lookup(word, source_lang, target_lang)
    if kamusi_results:
        return {"word": word, "translations": kamusi_results, "source": "kamusi", "success": True}
    
    return {"word": word, "translations": [], "source": "none", "success": False}