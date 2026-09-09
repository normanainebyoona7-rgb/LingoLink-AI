"""
Simple NLLB to ONNX conversion for CPU inference
"""

import os
import time
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

print("🔄 Starting NLLB to ONNX conversion...")
print("=" * 50)

model_name = "facebook/nllb-200-distilled-600M"
models_dir = "C:/Users/user/projects/LingoLink-AI/models"
os.makedirs(models_dir, exist_ok=True)

onnx_path = os.path.join(models_dir, "nllb.onnx")

if os.path.exists(onnx_path):
    print(f"✅ ONNX model already exists: {onnx_path}")
    print(f"📦 Size: {os.path.getsize(onnx_path) / (1024*1024):.1f} MB")
    exit()

print(f"📦 Loading model: {model_name}")
start = time.time()

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
model.eval()

print(f"✅ Model loaded in {time.time()-start:.1f}s")

# Create dummy input
print("🔄 Creating dummy input...")
sample_text = "Hello, how are you today?"
tokenizer.src_lang = "eng_Latn"
inputs = tokenizer(sample_text, return_tensors="pt", padding=True, truncation=True, max_length=512)

print("🔄 Exporting to ONNX...")
print("   This will take 5-10 minutes. Please wait...")
start = time.time()

try:
    torch.onnx.export(
        model,
        (inputs['input_ids'], inputs['attention_mask']),
        onnx_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=['input_ids', 'attention_mask'],
        output_names=['output'],
        dynamic_axes={
            'input_ids': {0: 'batch_size', 1: 'sequence_length'},
            'attention_mask': {0: 'batch_size', 1: 'sequence_length'},
            'output': {0: 'batch_size', 1: 'sequence_length'}
        }
    )
    print(f"✅ ONNX conversion complete in {time.time()-start:.1f}s")
    print(f"✅ File saved: {onnx_path}")
    print(f"📦 Size: {os.path.getsize(onnx_path) / (1024*1024):.1f} MB")
except Exception as e:
    print(f"❌ Conversion error: {e}")
    print("   Try using a simpler export approach...")
    
    # Alternative: Use simpler export
    try:
        print("🔄 Trying alternative export method...")
        torch.onnx.export(
            model,
            inputs['input_ids'],
            onnx_path,
            export_params=True,
            opset_version=11,
            input_names=['input_ids'],
            output_names=['output'],
            dynamic_axes={'input_ids': {0: 'batch_size', 1: 'sequence_length'}}
        )
        print(f"✅ Alternative ONNX conversion complete!")
        print(f"📦 Size: {os.path.getsize(onnx_path) / (1024*1024):.1f} MB")
    except Exception as e2:
        print(f"❌ Alternative also failed: {e2}")
        print("   ONNX conversion not possible. Continuing with PyTorch.")