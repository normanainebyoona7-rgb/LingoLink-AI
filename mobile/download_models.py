"""
Download ONNX models for offline mode.
Run: python download_models.py
"""
import os
import urllib.request

MODELS_DIR = os.path.join(os.path.dirname(__file__), "assets", "models")
os.makedirs(MODELS_DIR, exist_ok=True)

MODELS = {
    "stt_tiny.onnx": "https://huggingface.co/onnx-community/whisper-tiny/resolve/main/onnx/model.onnx",
    "tts_tiny.onnx": "https://huggingface.co/onnx-community/piper-tts/resolve/main/onnx/model.onnx",
}

for filename, url in MODELS.items():
    path = os.path.join(MODELS_DIR, filename)
    if os.path.exists(path):
        print(f"✅ {filename} already exists")
        continue
    
    print(f"Downloading {filename}...")
    try:
        urllib.request.urlretrieve(url, path)
        print(f"✅ Downloaded {filename}")
    except Exception as e:
        print(f"❌ Failed to download {filename}: {e}")

print("\nDone! Models are in assets/models/")