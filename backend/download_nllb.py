from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import os

# Create model directory
model_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nllb_model")
os.makedirs(model_dir, exist_ok=True)

print("Downloading NLLB-200 model...")
print("This may take a few minutes...")

# Download smaller model for faster inference
model_name = "facebook/nllb-200-distilled-600M"

print(f"Downloading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(model_name)
print(f"Downloading model...")
model = AutoModelForSeq2SeqLM.from_pretrained(model_name)

print("Saving model locally...")
tokenizer.save_pretrained(model_dir)
model.save_pretrained(model_dir)

print(f"Model saved to: {model_dir}")
print("Done!")