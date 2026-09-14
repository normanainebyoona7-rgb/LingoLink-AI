from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
import torch

app = FastAPI(title="LingoLink NLLB Server")

print("🔄 Loading NLLB-200 model...")
MODEL_NAME = "facebook/nllb-200-distilled-600M"
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME)
model.eval()
print("✅ NLLB loaded!")

LANG_CODES = {
    "english": "eng_Latn", "luganda": "lug_Latn", "swahili": "swh_Latn",
    "acholi": "ach_Latn", "alur": "alz_Latn", "ateso": "teo_Latn",
    "runyankole": "nyn_Latn", "rukiga": "cgg_Latn", "lugbara": "lgg_Latn",
    "lango": "laj_Latn", "lusoga": "xog_Latn", "lugwere": "gwr_Latn",
    "kinyarwanda": "kin_Latn", "kirundi": "run_Latn",
    "amharic": "amh_Ethi", "somali": "som_Latn", "oromo": "gaz_Latn",
    "tigrinya": "tir_Ethi", "yoruba": "yor_Latn", "hausa": "hau_Latn",
    "igbo": "ibo_Latn", "zulu": "zul_Latn", "xhosa": "xho_Latn",
    "shona": "sna_Latn", "chichewa": "nya_Latn", "afrikaans": "afr_Latn",
    "french": "fra_Latn", "spanish": "spa_Latn", "german": "deu_Latn",
    "portuguese": "por_Latn", "italian": "ita_Latn", "arabic": "arb_Arab",
    "hindi": "hin_Deva", "chinese": "zho_Hans", "japanese": "jpn_Jpan",
    "korean": "kor_Hang", "turkish": "tur_Latn", "russian": "rus_Cyrl",
    "dutch": "nld_Latn", "polish": "pol_Latn", "vietnamese": "vie_Latn",
    "thai": "tha_Thai", "indonesian": "ind_Latn", "greek": "ell_Grek",
}

class TranslateRequest(BaseModel):
    text: str
    source_language: str = "english"
    target_language: str = "luganda"

@app.get("/")
def root():
    return {"status": "operational", "model": MODEL_NAME}

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/translate")
async def translate(req: TranslateRequest):
    try:
        src_code = LANG_CODES.get(req.source_language.lower(), "eng_Latn")
        tgt_code = LANG_CODES.get(req.target_language.lower(), "eng_Latn")
        
        tokenizer.src_lang = src_code
        inputs = tokenizer(req.text, return_tensors="pt", truncation=True, max_length=512)
        tgt_token_id = tokenizer.convert_tokens_to_ids(tgt_code)
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                forced_bos_token_id=tgt_token_id,
                max_length=512,
                num_beams=4,
                early_stopping=True
            )
        
        result = tokenizer.decode(outputs[0], skip_special_tokens=True)
        return {
            "translated_text": result,
            "source_language": req.source_language,
            "target_language": req.target_language
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))