"""Debug endpoint — shows environment variables (safe subset)"""
import os
from fastapi import APIRouter

router = APIRouter(prefix="/debug", tags=["debug"])


@router.get("/env")
async def debug_env():
    return {
        "RENDER": os.getenv("RENDER", "<unset>"),
        "IS_CLOUD": os.getenv("RENDER", "") == "true" or os.getenv("IS_CLOUD", "") == "true",
        "GROQ_API_KEY_LEN": len(os.getenv("GROQ_API_KEY", "")),
        "SUNBIRD_API_KEY_LEN": len(os.getenv("SUNBIRD_API_KEY", "")),
        "DATABASE_URL_PREFIX": os.getenv("DATABASE_URL", "")[:20],
    }