"""Extract dictionary entries from PDFs - handles 1 and 2 column layouts"""
import pdfplumber
import re
import json
import sys
import os

def clean_word(word):
    return word.strip().lower()

def clean_definition(defn):
    defn = defn.strip()
    defn = re.sub(r'\s+', ' ', defn)
    # Cut off any trailing column bleed (single chars, digits, short fragments)
    defn = re.sub(r'\s+\d+\s+[a-z]{1,5}\s+[a-z]\.\s*$', '', defn)
    defn = re.sub(r'\s+[a-z]{1,3}\s+[a-z]{1,3}\s*$', '', defn)
    return defn.strip()

# Match: word + pos tag + definition
ENTRY_PATTERN = re.compile(
    r'\b([a-zA-Z\-\u00C0-\u024F\u0100-\u017F]{2,30})\s+(n|v|adj|adv|idiom|int|conj|prep|pron|num)\.\s+([^\.]{5,300}\.)',
    re.MULTILINE
)

def extract_from_text(text):
    entries = {}
    if not text:
        return entries
    for match in ENTRY_PATTERN.finditer(text):
        word = clean_word(match.group(1))
        definition = clean_definition(match.group(3))
        if len(word) < 3 or len(definition) < 3:
            continue
        # Skip if word is too common English
        if word in ('the', 'and', 'for', 'with', 'from', 'this', 'that'):
            continue
        if word not in entries:
            entries[word] = definition
    return entries

def extract_pdf(pdf_path, output_json):
    print(f'\n📖 Opening {os.path.basename(pdf_path)}...')
    all_entries = {}
    
    with pdfplumber.open(pdf_path) as pdf:
        total = len(pdf.pages)
        print(f'   Total pages: {total}')
        
        for i, page in enumerate(pdf.pages):
            try:
                width = page.width
                height = page.height
                
                # Try 2-column split first (most dictionaries use this)
                left = page.crop((0, 0, width * 0.52, height))
                right = page.crop((width * 0.48, 0, width, height))
                
                left_text = left.extract_text() or ''
                right_text = right.extract_text() or ''
                
                entries = {}
                entries.update(extract_from_text(left_text))
                entries.update(extract_from_text(right_text))
                
                # If nothing found, try full page as single column
                if len(entries) < 3:
                    full_text = page.extract_text() or ''
                    entries.update(extract_from_text(full_text))
                
                for word, defn in entries.items():
                    if word not in all_entries:
                        all_entries[word] = defn
                
                if (i + 1) % 25 == 0:
                    print(f'   Page {i+1}/{total} - {len(all_entries)} entries')
            except Exception as e:
                print(f'   Error on page {i+1}: {e}')
    
    print(f'   ✅ Total unique entries: {len(all_entries)}')
    
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(all_entries, f, ensure_ascii=False, indent=2)
    
    print(f'   💾 Saved to {output_json}')
    
    # Sample
    print('   Sample entries:')
    for i, (word, defn) in enumerate(list(all_entries.items())[:5]):
        print(f'     {word} = {defn[:80]}')
    
    return len(all_entries)

if __name__ == '__main__':
    base = r'C:\Users\user\Documents\language dictionaries'
    
    dicts = [
        ('Runyankore-Rukiga-Dictionary.pdf', 'runyankore_extracted.json'),
        ('acholi.pdf', 'acholi_extracted.json'),
        ('rutooro.pdf', 'rutooro_extracted.json'),
        ('luganda.pdf', 'luganda_extracted.json'),
    ]
    
    totals = {}
    for pdf_name, json_name in dicts:
        path = os.path.join(base, pdf_name)
        if os.path.exists(path):
            count = extract_pdf(path, json_name)
            totals[pdf_name] = count
        else:
            print(f'⚠️ Not found: {path}')
    
    print('\n' + '=' * 60)
    print('📊 FINAL RESULTS:')
    for name, count in totals.items():
        print(f'   {name}: {count} entries')