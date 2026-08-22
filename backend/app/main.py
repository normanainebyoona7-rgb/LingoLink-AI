from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
import app.models as models
from app.routers import translation, speech, tts, auth, video, admin

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="LingoLink AI API",
    description="Enterprise-grade AI translation platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(translation.router)
app.include_router(speech.router)
app.include_router(tts.router)
app.include_router(auth.router)
app.include_router(video.router)
app.include_router(admin.router)

@app.get("/")
async def root():
    return {"message": "Welcome to LingoLink AI", "status": "operational"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}