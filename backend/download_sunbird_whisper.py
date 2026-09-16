"""
Download Sunbird faster-whisper model for local African language transcription.
Run this ONCE. Model is cached in ./sunbird_whisper_model/ (about 1.5 GB).
"""
import os
from faster_whisper import WhisperModel

MODEL_NAME = "Sunbird/faster-whisper-51-african-languages"
LOCAL_DIR = os.path.join(os.path.dirname(__file__), "sunbird_whisper_model")

print(f"📥 Downloading {MODEL_NAME}...")
print(f"📁 Cache: {LOCAL_DIR}")
print("(This downloads ~1.5 GB — takes a few minutes on first run)\n")

os.makedirs(LOCAL_DIR, exist_ok=True)

# WhisperModel auto-downloads to HF cache if not in LOCAL_DIR
model = WhisperModel(
    MODEL_NAME,
    device="cpu",
    compute_type="int8",
    download_root=LOCAL_DIR,
)

print("\n✅ Model downloaded and ready!")
print(f"📁 Location: {LOCAL_DIR}")
print("\nRestart the backend to use it.")