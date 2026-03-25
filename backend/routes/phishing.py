import json
from fastapi import APIRouter
from pydantic import BaseModel
from database import save_phishing_analysis, get_phishing_history, get_phishing_stats
from ai.phishing_detector import analyze_message, analyze_conversation

router = APIRouter(prefix="/phishing", tags=["phishing"])


class PhishingRequest(BaseModel):
    message_text: str
    message_type: str = "email"
    sender_info: str = ""
    clerk_user_id: str = "anonymous"


class ConversationPhishingRequest(BaseModel):
    conversation_text: str
    message_type: str = "email"
    sender_info: str = ""
    clerk_user_id: str = "anonymous"


@router.post("/analyze")
async def analyze_phishing(req: PhishingRequest):
    result = await analyze_message(req.message_text, req.message_type, req.sender_info)

    await save_phishing_analysis({
        "clerk_user_id": req.clerk_user_id,
        "message_preview": req.message_text[:200],
        "message_type": req.message_type,
        "risk_score": result["risk_score"],
        "risk_level": result["risk_level"],
        "verdict": result["verdict"],
        "attack_type": result.get("attack_type"),
        "is_phishing": result["is_phishing"],
        "india_specific_scam": result.get("india_specific_scam"),
        "full_result": result,
    })

    return result


@router.post("/analyze-conversation")
async def analyze_conversation_endpoint(req: ConversationPhishingRequest):
    result = await analyze_conversation(req.conversation_text, req.message_type, req.sender_info)

    # Store as a phishing analysis record for history/stats reuse.
    await save_phishing_analysis(
        {
            "clerk_user_id": req.clerk_user_id,
            "message_preview": (req.conversation_text or "")[:200],
            "message_type": "conversation",
            "risk_score": result.get("risk_score", 0),
            "risk_level": result.get("risk_level"),
            "verdict": result.get("verdict"),
            "attack_type": result.get("attack_type"),
            "is_phishing": result.get("is_phishing", False),
            "india_specific_scam": result.get("india_specific_scam"),
            "full_result": result,
        }
    )

    return result


@router.get("/history/{clerk_user_id}")
async def phishing_history(clerk_user_id: str):
    history = await get_phishing_history(clerk_user_id)
    return [
        {
            "id": h.id,
            "message_preview": h.message_preview,
            "message_type": h.message_type,
            "verdict": h.verdict,
            "risk_score": h.risk_score,
            "attack_type": h.attack_type,
            "is_phishing": h.is_phishing,
            "india_specific_scam": h.india_specific_scam,
            "analyzed_at": str(h.analyzed_at),
            "full_result": json.loads(h.full_result_json or "{}"),
        }
        for h in history
    ]


@router.get("/stats/{clerk_user_id}")
async def phishing_stats(clerk_user_id: str):
    return await get_phishing_stats(clerk_user_id)
