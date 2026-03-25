import json
from datetime import datetime, timezone
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ai.llm_client import call_llm

router = APIRouter(tags=["chat"])

SYSTEM_PROMPT = (
    "You are SecureIQ AI assistant for Indian small businesses. "
    "Answer questions about the security scan in plain English. "
    "Be helpful, specific, and concise. Max 100 words."
)


class ChatRequest(BaseModel):
    message: str
    scan_context: dict = {}
    clerk_user_id: str = "anonymous"


@router.post("/chat")
async def chat(req: ChatRequest):
    user_content = (
        f"Scan: {json.dumps(req.scan_context, default=str)} "
        f"Question: {req.message}"
    )
    text = await call_llm(SYSTEM_PROMPT, user_content)
    ts = datetime.now(timezone.utc).isoformat()
    return JSONResponse(
        content={
            "response": text,
            "timestamp": ts,
        }
    )
