from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
from jose import jwt
from app.database import get_db
import app.models as models
import bcrypt
import secrets

router = APIRouter(prefix="/oauth", tags=["oauth"])

SECRET_KEY = "lingolink-secret-key-2026"
ALGORITHM = "HS256"

# Store OAuth clients (in production, use database)
OAUTH_CLIENTS = {
    "lingolink-extension": {
        "client_secret": "extension-secret-2026",
        "name": "LingoLink Chrome Extension",
        "redirect_uris": ["chrome-extension://nmmieibbadkfnpagljdlboobkeaeinpp/callback"]
    },
    "lingolink-crm": {
        "client_secret": "crm-secret-2026",
        "name": "LingoLink CRM Widget",
        "redirect_uris": ["http://127.0.0.1:5500/callback", "https://zendesk.example.com/callback"]
    }
}

# Store authorization codes (in production, use Redis)
AUTH_CODES = {}

class OAuthAuthorizeRequest(BaseModel):
    client_id: str
    redirect_uri: str
    response_type: str = "code"
    state: str = ""

class OAuthTokenRequest(BaseModel):
    grant_type: str
    code: str = None
    client_id: str
    client_secret: str
    redirect_uri: str = None

@router.post("/authorize")
async def authorize(
    request: OAuthAuthorizeRequest,
    db: Session = Depends(get_db)
):
    """Generate authorization code"""
    client = OAUTH_CLIENTS.get(request.client_id)
    if not client:
        raise HTTPException(status_code=400, detail="Invalid client_id")

    if request.redirect_uri not in client["redirect_uris"]:
        raise HTTPException(status_code=400, detail="Invalid redirect_uri")

    # Generate authorization code
    auth_code = secrets.token_urlsafe(32)
    AUTH_CODES[auth_code] = {
        "client_id": request.client_id,
        "redirect_uri": request.redirect_uri,
        "expires": datetime.utcnow() + timedelta(minutes=10)
    }

    return {
        "authorization_code": auth_code,
        "expires_in": 600,
        "state": request.state
    }

@router.post("/token")
async def token(
    request: OAuthTokenRequest,
    db: Session = Depends(get_db)
):
    """Exchange authorization code for access token"""
    client = OAUTH_CLIENTS.get(request.client_id)
    if not client:
        raise HTTPException(status_code=400, detail="Invalid client_id")

    if request.client_secret != client["client_secret"]:
        raise HTTPException(status_code=400, detail="Invalid client_secret")

    if request.grant_type == "authorization_code":
        auth_data = AUTH_CODES.get(request.code)
        if not auth_data:
            raise HTTPException(status_code=400, detail="Invalid authorization code")

        if datetime.utcnow() > auth_data["expires"]:
            del AUTH_CODES[request.code]
            raise HTTPException(status_code=400, detail="Authorization code expired")

        if request.redirect_uri != auth_data["redirect_uri"]:
            raise HTTPException(status_code=400, detail="Invalid redirect_uri")

        # Create access token
        access_token = jwt.encode(
            {
                "sub": "oauth-client",
                "client_id": request.client_id,
                "exp": datetime.utcnow() + timedelta(hours=24)
            },
            SECRET_KEY,
            algorithm=ALGORITHM
        )

        # Clean up used code
        del AUTH_CODES[request.code]

        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": 86400
        }
    elif request.grant_type == "refresh_token":
        # Simplified refresh token
        access_token = jwt.encode(
            {
                "sub": "oauth-client",
                "client_id": request.client_id,
                "exp": datetime.utcnow() + timedelta(hours=24)
            },
            SECRET_KEY,
            algorithm=ALGORITHM
        )
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "expires_in": 86400
        }
    else:
        raise HTTPException(status_code=400, detail="Invalid grant_type")

@router.post("/verify")
async def verify_token(
    token: str
):
    """Verify OAuth token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {
            "valid": True,
            "client_id": payload.get("client_id"),
            "expires": payload.get("exp")
        }
    except:
        return {"valid": False}