import json

from fastapi import APIRouter
from pydantic import BaseModel

from database import get_scan_by_id


router = APIRouter(tags=["predict"])


class PredictRequest(BaseModel):
    scan_id: int
    horizon_days: int = 30
    clerk_user_id: str = "anonymous"


def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


@router.post("/predict")
async def predict_threat(req: PredictRequest):
    scan = await get_scan_by_id(req.scan_id)
    if not scan:
        return {"error": "Scan not found"}

    findings = json.loads(scan.findings_json or "[]")
    current_score = int(scan.score or 0)

    critical = [f for f in findings if f.get("status") == "critical"]
    warning = [f for f in findings if f.get("status") == "warning"]
    passed = [f for f in findings if f.get("status") == "pass"]

    critical_count = len(critical)
    warning_count = len(warning)

    # Heuristic degradation:
    # - critical issues degrade security posture faster
    # - warnings degrade more slowly
    degradation = critical_count * 7 + warning_count * 3
    # Horizon scaling (keep it simple)
    if req.horizon_days >= 60:
        degradation = int(degradation * 1.4)
    elif req.horizon_days <= 15:
        degradation = int(degradation * 0.75)

    predicted_security_score = _clamp(current_score - degradation, 0, 100)
    predicted_threat_score = _clamp(100 - predicted_security_score, 0, 100)

    actionable = critical + warning
    actionable_count = len(actionable)

    # Confidence increases with actionable evidence, decreases if everything is "pass".
    if actionable_count == 0:
        confidence_percent = 35
    else:
        confidence_percent = _clamp(45 + actionable_count * 8, 0, 95)

    confidence_label = "Low" if confidence_percent < 45 else "Medium" if confidence_percent < 75 else "High"

    # Key drivers: top score-impact checks among actionable findings
    def impact_of(f):
        try:
            return int(f.get("score_impact") or 0)
        except Exception:
            return 0

    top_drivers = sorted(actionable, key=impact_of, reverse=True)[:3]
    key_drivers = [
        {
            "check": f.get("check"),
            "status": f.get("status"),
            "impact": impact_of(f),
        }
        for f in top_drivers
    ]

    return {
        "scan_id": req.scan_id,
        "horizon_days": req.horizon_days,
        "current_security_score": current_score,
        "predicted_security_score": predicted_security_score,
        "predicted_threat_score": predicted_threat_score,
        "degradation_estimate": int(current_score - predicted_security_score),
        "confidence_percent": confidence_percent,
        "confidence": confidence_label,
        "key_drivers": key_drivers,
        "counts": {
            "critical": critical_count,
            "warning": warning_count,
            "pass": len(passed),
            "total_findings": len(findings),
        },
    }

