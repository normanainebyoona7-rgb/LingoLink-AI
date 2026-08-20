from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.routers.auth import get_current_user
import app.models as models

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
    text_translations = db.query(func.count(models.Translation.id)).filter(models.Translation.translation_type == "text").scalar()
    voice_translations = db.query(func.count(models.Translation.id)).filter(models.Translation.translation_type == "voice").scalar()
    video_translations = db.query(func.count(models.Translation.id)).filter(models.Translation.translation_type == "video").scalar()

    return {
        "total_users": total_users,
        "premium_users": premium_users,
        "free_users": free_users,
        "total_translations": total_translations,
        "text_translations": text_translations,
        "voice_translations": voice_translations,
        "video_translations": video_translations
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

    return {"message": f"User {user.username} deleted successfully"}

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

    return {"message": f"User {user.username} is now an admin"}