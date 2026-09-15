"""Rebuild Runyankore dictionary with clean keys from PDF"""
import pdfplumber
import re
import json

PDF_PATH = r'C:\Users\user\Documents\language dictionaries\Runyankore-Rukiga-Dictionary.pdf'

# Match: word + pos tag + definition
ENTRY_PATTERN = re.compile(
    r'\b([a-zA-Z\-\u00C0-\u024F\u0100-\u017F]{2,30})\s+(n|v|adj|adv|idiom|int|conj|prep|pron|num)\.\s+([^\.]{5,300}\.)',
    re.MULTILINE
)

def clean_def(d):
    d = d.strip()
    d = re.sub(r'\s+', ' ', d)
    # Remove trailing column bleed
    d = re.sub(r'\s+\d+\s+[a-z]{1,5}\s+[a-z]\.\s*$', '', d)
    return d.strip()

def extract(text):
    out = {}
    if not text:
        return out
    for match in ENTRY_PATTERN.finditer(text):
        word = match.group(1).lower().strip()
        defn = clean_def(match.group(3))
        if len(word) < 3 or len(defn) < 3:
            continue
        if word in ('the', 'and', 'for', 'with', 'from', 'this', 'that'):
            continue
        if word not in out:
            out[word] = defn
    return out

print('📖 Extracting Runyankore...')
all_entries = {}
with pdfplumber.open(PDF_PATH) as pdf:
    for i, page in enumerate(pdf.pages):
        try:
            w, h = page.width, page.height
            left = page.crop((0, 0, w * 0.52, h))
            right = page.crop((w * 0.48, 0, w, h))
            entries = {}
            entries.update(extract(left.extract_text() or ''))
            entries.update(extract(right.extract_text() or ''))
            if len(entries) < 3:
                entries.update(extract(page.extract_text() or ''))
            for k, v in entries.items():
                if k not in all_entries:
                    all_entries[k] = v
        except Exception as e:
            print(f'  Error page {i+1}: {e}')

print(f'✅ Extracted: {len(all_entries)} entries')

with open('runyankore_extracted.json', 'w', encoding='utf-8') as f:
    json.dump(all_entries, f, ensure_ascii=False, indent=2)

print('💾 Saved')
print(f'\n🔍 Sample:')
for k, v in list(all_entries.items())[:10]:
    print(f'  {k} = {v[:80]}')