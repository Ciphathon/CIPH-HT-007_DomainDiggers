import json
import os
import asyncio

import dns.resolver
from fastapi import APIRouter
from pydantic import BaseModel
from groq import Groq

from database import get_scan_by_id, update_scan_score
from scanners.email_security import check_email_security


router = APIRouter(tags=["autofix"])


class GenerateAutoFixRequest(BaseModel):
    check_name: str
    domain: str
    hosting_provider: str | None = None
    email_provider: str | None = None


class VerifyAutoFixRequest(BaseModel):
    domain: str
    check_name: str
    expected_value: str
    scan_id: int


def _clean_domain(domain: str) -> str:
    domain = (domain or "").strip().lower()
    for prefix in ["https://", "http://", "www."]:
        if domain.startswith(prefix):
            domain = domain[len(prefix):]
    return domain.rstrip("/").split("/")[0]


def _first_json_object_or_array(text: str):
    """
    Best-effort extraction when the model adds surrounding text.
    """
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        pass

    start_obj = text.find("{")
    start_arr = text.find("[")
    start = -1
    if start_obj != -1 and start_arr != -1:
        start = min(start_obj, start_arr)
    else:
        start = start_obj if start_obj != -1 else start_arr

    if start == -1:
        return None

    end_obj = text.rfind("}")
    end_arr = text.rfind("]")
    end = max(end_obj, end_arr)
    if end <= start:
        return None
    return json.loads(text[start : end + 1])


async def _dns_txt(name: str) -> list[str]:
    loop = asyncio.get_event_loop()

    def _query():
        answers = dns.resolver.resolve(name, "TXT", lifetime=5)
        out = []
        for rdata in answers:
            # rdata.to_text() usually wraps each chunk in quotes.
            txt = rdata.to_text().strip('"')
            out.append(txt)
        return out

    return await loop.run_in_executor(None, _query)


def _normalize_expected(expected: str) -> str:
    if expected is None:
        return ""
    return str(expected).strip().strip('"').strip("'")


@router.post("/autofix/generate-record")
async def generate_auto_fix(req: GenerateAutoFixRequest):
    domain = _clean_domain(req.domain)
    check_name = (req.check_name or "").strip()

    groq_model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return {"error": "GROQ_API_KEY not configured"}

    client = Groq(api_key=api_key)

    system_prompt = (
        "You are SecureIQ DNS Auto-fix generator for Indian small businesses. "
        "Generate the exact DNS record update that would fix the provided security check. "
        "Respond ONLY with raw valid JSON (no markdown, no backticks). "
        "JSON schema: {"
        "\"record_type\": string,"
        "\"record_name\": string,"
        "\"record_value\": string,"
        "\"ttl\": number,"
        "\"verification_command\": string,"
        "\"time_estimate\": string"
        "}"
    )

    user_prompt = f"""
Security check: {check_name}
Domain: {domain}
Hosting provider (may be unknown): {req.hosting_provider or "unknown"}
Email provider (may be unknown): {req.email_provider or "google"}

Rules:
- SPF Record -> TXT at: @{domain}, value should include v=spf1 ...
- DMARC Policy -> TXT at: _dmarc.{domain}, value should include v=DMARC1 and a policy like quarantine or reject
- DKIM Signing -> TXT at: default._domainkey.{domain}, value should include v=DKIM1 and be a valid-looking DKIM public key record

Return the best record update as exact strings that an operator can paste into their DNS panel.
"""

    try:
        response = client.chat.completions.create(
            model=groq_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=800,
        )
        content = response.choices[0].message.content or ""
        parsed = _first_json_object_or_array(content)
        if isinstance(parsed, dict):
            return parsed
        return {"error": "Model did not return a JSON object"}
    except Exception as e:
        return {"error": f"Failed to generate DNS record: {str(e)}"}


@router.post("/autofix/verify-applied")
async def verify_auto_fix_applied(req: VerifyAutoFixRequest):
    domain = _clean_domain(req.domain)
    check_name = (req.check_name or "").strip()
    expected_value = _normalize_expected(req.expected_value)

    # 1) Verify DNS record contains expected value.
    try:
        if check_name.lower() == "spf record":
            txts = await _dns_txt(domain)
            verified = any(expected_value and expected_value in t for t in txts) and any(
                "v=spf1" in t.lower() for t in txts
            )
            dns_detail = txts
        elif check_name.lower() == "dmarc policy":
            txts = await _dns_txt(f"_dmarc.{domain}")
            verified = any(expected_value and expected_value in t for t in txts) and any(
                "v=dmarc1" in t.lower() or "v=dmarc1" in t.lower() for t in txts
            )
            dns_detail = txts
        elif check_name.lower() == "dkim signing":
            txts = await _dns_txt(f"default._domainkey.{domain}")
            verified = any(expected_value and expected_value in t for t in txts) and any(
                "v=dkim1" in t.lower() for t in txts
            )
            dns_detail = txts
        else:
            return {"verified": False, "new_score": None, "points_gained": 0, "message": "Unsupported check"}
    except Exception as e:
        return {
            "verified": False,
            "new_score": None,
            "points_gained": 0,
            "message": f"DNS verification failed: {str(e)}",
        }

    if not verified:
        return {
            "verified": False,
            "new_score": None,
            "points_gained": 0,
            "message": "Expected DNS record not detected yet. Apply the suggested record, then try VERIFY again.",
            "dns_detail": dns_detail,
        }

    # 2) Update scan findings + recalculate score/damage in DB.
    scan = await get_scan_by_id(req.scan_id)
    if not scan:
        return {
            "verified": False,
            "new_score": None,
            "points_gained": 0,
            "message": "Scan not found.",
        }

    existing_findings = json.loads(scan.findings_json or "[]")
    # Re-check the email security suite to get accurate status/score_impact.
    refreshed_findings = await check_email_security(domain)

    def _match_check(f, target: str) -> bool:
        return (f.get("check") or "").strip().lower() == target.strip().lower()

    refreshed_match = None
    for rf in refreshed_findings:
        if _match_check(rf, check_name):
            refreshed_match = rf
            break

    if not refreshed_match:
        return {
            "verified": False,
            "new_score": int(scan.score or 0),
            "points_gained": 0,
            "message": "Could not refresh finding for that check.",
        }

    updated_findings = []
    replaced = False
    for f in existing_findings:
        if not replaced and _match_check(f, check_name):
            # Keep existing enriched fields (fix_steps, explanation) if they exist.
            merged = dict(f)
            for k in ["status", "detail", "score_impact", "category", "raw_data"]:
                if k in refreshed_match:
                    merged[k] = refreshed_match[k]
            if not merged.get("explanation") and merged.get("detail"):
                merged["explanation"] = merged["detail"]
            updated_findings.append(merged)
            replaced = True
        else:
            updated_findings.append(f)

    if not replaced:
        # If the findings list is unexpectedly missing this finding, just append it.
        updated_findings.append(refreshed_match)

    update_res = await update_scan_score(req.scan_id, updated_findings)
    new_score = update_res.get("new_score")
    points_gained = update_res.get("points_gained", 0)

    return {
        "verified": True,
        "new_score": new_score,
        "points_gained": points_gained,
        "message": "DNS auto-fix verified and score updated.",
    }

