from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, SessionLocal
import app.models as models
from app.routers import translation, speech, tts, auth, video, admin, oauth, call, ai
import bcrypt

models.Base.metadata.create_all(bind=engine)

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_default_users():
    db = SessionLocal()
    try:
        default_users = [
            {"username": "admin", "password": "admin123", "is_admin": True, "is_premium": True},
            {"username": "agent1", "password": "password123", "is_admin": False, "is_premium": True},
            {"username": "agent2", "password": "password123", "is_admin": False, "is_premium": False},
            {"username": "agent3", "password": "password123", "is_admin": False, "is_premium": False},
        ]
        for u in default_users:
            existing = db.query(models.User).filter(models.User.username == u["username"]).first()
            if not existing:
                user = models.User(
                    username=u["username"],
                    email=f"{u['username']}@lingolink.ai",
                    hashed_password=hash_password(u["password"]),
                    is_admin=u["is_admin"],
                    is_premium=u["is_premium"],
                )
                db.add(user)
                print(f"✅ Created user: {u['username']}")
            else:
                existing.hashed_password = hash_password(u["password"])
                print(f"🔄 Reset password for: {u['username']}")
        db.commit()
    except Exception as e:
        print(f"User creation error: {e}")
        db.rollback()
    finally:
        db.close()

create_default_users()

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
app.include_router(oauth.router)
app.include_router(call.router)
app.include_router(ai.router)

@app.get("/")
async def root():
    return {"message": "Welcome to LingoLink AI", "status": "operational"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}