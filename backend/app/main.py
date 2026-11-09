from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, SessionLocal
import app.models as models
from app.routers import translation, speech, tts, auth, video, admin, oauth, call, ai
import bcrypt
import logging
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("startup")

# --- Create tables (retry once in case the DB is slow to wake on Render) ---
try:
    models.Base.metadata.create_all(bind=engine)
except Exception as e:
    logger.warning("create_all failed (%s) — retrying in 3s", e)
    time.sleep(3)
    models.Base.metadata.create_all(bind=engine)


def _hash_password(password: str) -> str:
    pw = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pw, salt).decode("utf-8")


def create_default_users():
    db = SessionLocal()
    try:
        default_users = [
            {"username": "admin",  "password": "admin123",    "is_admin": True,  "is_premium": True},
            {"username": "agent1", "password": "password123", "is_admin": False, "is_premium": True},
            {"username": "agent2", "password": "password123", "is_admin": False, "is_premium": False},
            {"username": "agent3", "password": "password123", "is_admin": False, "is_premium": False},
        ]
        for u in default_users:
            existing = db.query(models.User).filter(models.User.username == u["username"]).first()
            if not existing:
                db.add(models.User(
                    username=u["username"],
                    email=f"{u['username']}@lingolink.ai",
                    hashed_password=_hash_password(u["password"]),
                    is_admin=u["is_admin"],
                    is_premium=u["is_premium"],
                ))
                logger.info("Created user: %s", u["username"])
            else:
                existing.hashed_password = _hash_password(u["password"])
                logger.info("Reset password for: %s", u["username"])
        db.commit()
        logger.info("Default users ready")
    except Exception as e:
        logger.error("User creation error: %s", e)
        db.rollback()
    finally:
        db.close()


create_default_users()

app = FastAPI(
    title="LingoLink AI API",
    description="Enterprise-grade AI translation platform",
    version="1.0.0",
)

# CORS: explicit origins for Vercel + local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://lingolink-ai.vercel.app",
        "http://localhost:3000",
        "http://localhost:5173",
    ],
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
app.include_router(oauth.router)
app.include_router(call.router)
app.include_router(ai.router)


@app.get("/")
async def root():
    return {"message": "Welcome to LingoLink AI", "status": "operational"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}