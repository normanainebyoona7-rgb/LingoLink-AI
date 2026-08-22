from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models
from datetime import datetime, timedelta

router = APIRouter(prefix="/admin", tags=["admin"])

def require_admin(current_user: models.User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

@router.get("/dashboard")
async def get_dashboard(
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(require_admin)
):
    total_users = db.query(func.count(models.User.id)).scalar()
    premium_users = db.query(func.count(models.User.id)).filter(models.User.is_premium == True).scalar()
    free_users = total_users - premium_users
    total_translations = db.query(func.count(models.Translation.id)).scalar()
    
    today = datetime.utcnow().date()
    today_translations = db.query(func.count(models.Translation.id)).filter(
        func.date(models.Translation.created_at) == today
    ).scalar()
    
    week_ago = today - timedelta(days=7)
    week_translations = db.query(func.count(models.Translation.id)).filter(
        models.Translation.created_at >= week_ago
    ).scalar()
    
    text_count = db.query(func.count(models.Translation.id)).filter(models.Translation.translation_type == "text").scalar()
    voice_count = db.query(func.count(models.Translation.id)).filter(models.Translation.translation_type == "voice").scalar()
    video_count = db.query(func.count(models.Translation.id)).filter(models.Translation.translation_type == "video").scalar()
    
    billing_estimate = premium_users * 10
    
    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "free_users": free_users,
        "total_translations": total_translations,
        "today_translations": today_translations,
        "week_translations": week_translations,
        "text_translations": text_count,
        "voice_translations": voice_count,
        "video_translations": video_count,
        "billing_estimate": billing_estimate
    }

@router.get("/users")
async def get_all_users(
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(require_admin)
):
    users = db.query(models.User).order_by(models.User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "is_premium": u.is_premium,
            "is_admin": u.is_admin,
            "daily_translation_count": u.daily_translation_count,
            "created_at": u.created_at
        }
        for u in users
    ]

@router.get("/translations")
async def get_all_translations(
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(require_admin)
):
    translations = db.query(models.Translation).order_by(models.Translation.created_at.desc()).limit(100).all()
    return [
        {
            "id": t.id,
            "user_id": t.user_id,
            "source_text": t.source_text,
            "translated_text": t.translated_text,
            "source_language": t.source_language,
            "target_language": t.target_language,
            "translation_type": t.translation_type,
            "created_at": t.created_at
        }
        for t in translations
    ]

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(require_admin)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}

@router.post("/make-admin/{user_id}")
async def make_admin(
    user_id: int,
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(require_admin)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = True
    db.commit()
    return {"message": "User is now admin"}

@router.get("/export-srt")
async def export_srt(
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(require_admin)
):
    translations = db.query(models.Translation).order_by(models.Translation.created_at.desc()).limit(50).all()
    srt_lines = []
    for i, t in enumerate(translations, 1):
        srt_lines.append(f"{i}\n00:00:{i:02d},000 --> 00:00:{i+1:02d},000\n{t.translated_text}\n")
    return {"srt_content": "\n".join(srt_lines)}

@router.get("/export-vtt")
async def export_vtt(
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(require_admin)
):
    translations = db.query(models.Translation).order_by(models.Translation.created_at.desc()).limit(50).all()
    vtt_lines = ["WEBVTT\n"]
    for i, t in enumerate(translations, 1):
        vtt_lines.append(f"{i}\n00:00:{i:02d}.000 --> 00:00:{i+1:02d}.000\n{t.translated_text}\n")
    return {"vtt_content": "\n".join(vtt_lines)}

@router.get("/agent-metrics")
async def get_agent_metrics(
    db: Session = Depends(get_db),
    admin_user: models.User = Depends(require_admin)
):
    agents = db.query(models.User).filter(models.User.is_admin == False).all()
    metrics = []
    for agent in agents:
        translations = db.query(func.count(models.Translation.id)).filter(models.Translation.user_id == agent.id).scalar()
        last_active = db.query(func.max(models.Translation.created_at)).filter(models.Translation.user_id == agent.id).scalar()
        metrics.append({
            "agent_id": agent.id,
            "username": agent.username,
            "total_translations": translations,
            "last_active": last_active,
            "is_premium": agent.is_premium,
            "status": "active" if last_active and (datetime.utcnow() - last_active).days < 7 else "inactive"
        })
    return metrics