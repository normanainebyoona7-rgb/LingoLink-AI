"""
Convert NLLB-200 model to ONNX format for faster CPU inference
"""

import os
import time
import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

def convert_nllb_to_onnx():
    print("🔄 Starting NLLB to ONNX conversion...")
    print("=" * 50)
    
    model_name = "facebook/nllb-200-distilled-600M"
    models_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "models")
    os.makedirs(models_dir, exist_ok=True)
    
    onnx_path = os.path.join(models_dir, "nllb.onnx")
    
    # Check if already converted
    if os.path.exists(onnx_path):
        print(f"✅ ONNX model already exists at: {onnx_path}")
        return
    
    print(f"📦 Loading NLLB model: {model_name}")
    start = time.time()
    
    # Load model
    model = AutoModelForSeq2SeqLM.from_pretrained(
        model_name,
        torch_dtype=torch.float32  # Use float32 for CPU ONNX
    )
    model.eval()
    
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    tokenizer.src_lang = "eng_Latn"
    
    print(f"✅ Model loaded in {time.time()-start:.1f}s")
    
    # Create dummy input for ONNX export
    print("🔄 Creating dummy input...")
    sample_text = "Hello, how are you?"
    inputs = tokenizer(sample_text, return_tensors="pt", padding=True, truncation=True, max_length=512)
    
    # Export to ONNX
    print("🔄 Exporting to ONNX (this may take 5-10 minutes)...")
    start = time.time()
    
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
    print(f"✅ ONNX model saved to: {onnx_path}")
    
    # Verify file exists and size
    file_size = os.path.getsize(onnx_path) / (1024 * 1024)  # MB
    print(f"📦 ONNX model size: {file_size:.1f} MB")

if __name__ == "__main__":
    convert_nllb_to_onnx()