from sqlalchemy import Column, Integer, String, DateTime, Text, Float, Boolean
from sqlalchemy.sql import func
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_premium = Column(Boolean, default=False)
    daily_translation_count = Column(Integer, default=0)
    last_translation_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

class Translation(Base):
    __tablename__ = "translations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False)
    source_text = Column(Text, nullable=False)
    translated_text = Column(Text, nullable=False)
    source_language = Column(String(10), nullable=False)
    target_language = Column(String(10), nullable=False)
    translation_type = Column(String(20))
    confidence_score = Column(Float)
    created_at = Column(DateTime, server_default=func.now())