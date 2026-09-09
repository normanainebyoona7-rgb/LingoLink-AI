"""
LingoLink AI - Model Manager
Using OpenAI API for translations (local models disabled)
"""

import os
import io
import time
import threading
import hashlib
from typing import Optional, List, Dict, Any
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor

import torch

@dataclass
class ModelConfig:
    device: str = "cpu"
    use_fp16: bool = False
    use_onnx: bool = False
    use_tensorrt: bool = False
    batch_size: int = 8
    max_workers: int = 4
    cache_size: int = 10000
    model_dir: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "models")

class TranslationCache:
    """Thread-safe LRU cache for translations"""
    
    def __init__(self, max_size: int = 10000):
        self.max_size = max_size
        self.cache: Dict[str, str] = {}
        self.lock = threading.Lock()
    
    def get(self, key: str) -> Optional[str]:
        with self.lock:
            return self.cache.get(key)
    
    def set(self, key: str, value: str):
        with self.lock:
            if len(self.cache) >= self.max_size:
                for _ in range(self.max_size // 4):
                    if self.cache:
                        self.cache.pop(next(iter(self.cache)))
            self.cache[key] = value
    
    def clear(self):
        with self.lock:
            self.cache.clear()

class ModelManager:
    """Centralized model management (Singleton) - Using OpenAI API only"""
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if not hasattr(self, 'initialized'):
            self.config = ModelConfig()
            self.nllb = None  # DISABLED - using OpenAI API
            self.whisper = None  # DISABLED
            self.tts = None  # DISABLED
            self.executor = ThreadPoolExecutor(max_workers=self.config.max_workers)
            self.cache = TranslationCache(self.config.cache_size)
            self.initialized = True
            print("✅ Using OpenAI API for translations (local models disabled)")
    
    def translate(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        """Translation handled by OpenAI API in translation.py"""
        return None
    
    def transcribe(self, audio_path: str) -> str:
        """Transcription handled by API"""
        return ""
    
    def synthesize_speech(self, text: str, language: str = "en") -> Optional[bytes]:
        """TTS handled by API"""
        return None

# Export singleton
model_manager = ModelManager()