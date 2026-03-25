import re
import time
from ai.llm_client import call_llm_json

# ─── Pattern Libraries ──────────────────────────────────────────────────

THREAT_INDICATORS = {
    "soft_power": [
        r"\burgent\b", r"\bimmediately\b", r"\basap\b", r"\bright now\b",
        r"\bdeadline\b", r"\bexpires?\b", r"\blast chance\b", r"\bfinal notice\b",
        r"\bact now\b", r"\bdon.t delay\b", r"\blimited time\b", r"\bhurry\b",
    ],
    "hierarchy_leverage": [
        r"\b(cbi|cid|police|enforcement|ed|income tax|cybercrime)\b",
        r"\b(rbi|sebi|irdai|trai|meity)\b",
        r"\b(manager|director|ceo|md|boss|hr department)\b",
        r"\b(court|legal action|arrest|warrant|fir)\b",
        r"\bgovernment of india\b",
    ],
    "channel_shift": [
        r"\bwhatsapp\b", r"\btelegram\b", r"\bsignal\b",
        r"\bcall me\b", r"\bcall (on|at)\b", r"\bcontact (me|us) on\b",
        r"\bprivate\b.*\bchannel\b", r"\bdo not share\b", r"\bkeep (this )?confidential\b",
    ],
    "financial_manipulation": [
        r"\bupi\b", r"\bpaytm\b", r"\bphonepe\b", r"\bgpay\b",
        r"\bwire transfer\b", r"\bneft\b", r"\brtgs\b",
        r"\bsend money\b", r"\btransfer funds\b", r"\bamount\b.*\baccount\b",
    ],
    "credential_harvesting": [
        r"\botp\b", r"\bpassword\b", r"\bpin\b", r"\bkyc\b",
        r"\baadhaar\b", r"\bpan card\b", r"\baccount number\b",
        r"\bverif(y|ication)\b.*\b(link|click|login)\b",
    ],
}

INDIA_SCAM_PATTERNS = {
    "digital_arrest": {
        "patterns": [
            r"\bdigital arrest\b", r"\b(cbi|cybercrime|ed)\b.*\b(case|notice|officer)\b",
            r"\byou are under\b.*\binvestigation\b", r"\bnarcotics\b",
        ],
        "description": "Digital Arrest Scam — Fraudsters impersonate CBI/police to extort money",
    },
    "kyc_scam": {
        "patterns": [
            r"\bkyc\b.*\b(update|verify|expire|block)\b",
            r"\b(bank|account)\b.*\b(suspend|block|close)\b.*\bkyc\b",
            r"\bupdate your kyc\b",
        ],
        "description": "KYC Update Scam — Fake bank/wallet KYC update to steal credentials",
    },
    "gst_phishing": {
        "patterns": [
            r"\bgst\b.*\b(notice|penalty|fine|portal|number)\b",
            r"\bgstin\b", r"\bgst (council|department|officer)\b",
        ],
        "description": "GST Phishing — Fake GST notices targeting businesses",
    },
    "upi_fraud": {
        "patterns": [
            r"\bupi\b.*\b(collect|request|link|pay)\b",
            r"\bsend ₹\b", r"\btransfer ₹\b",
            r"\bscan (and|the) qr\b", r"\bpayment (link|request)\b",
        ],
        "description": "UPI Payment Fraud — Fake payment requests or reverse-UPI scams",
    },
    "ceo_fraud": {
        "patterns": [
            r"\b(ceo|md|director|sir|boss|ma.?am)\b.*\b(urgent|immediate|transfer|send)\b",
            r"\bdon.t tell anyone\b", r"\bconfidential transfer\b",
        ],
        "description": "CEO/Boss Fraud — Impersonating authority figures to request urgent transfers",
    },
}


def _pattern_score(text: str) -> tuple[int, dict]:
    text_lower = text.lower()
    matched = {k: [] for k in THREAT_INDICATORS}
    total_matches = 0

    for category, patterns in THREAT_INDICATORS.items():
        for p in patterns:
            if re.search(p, text_lower, re.IGNORECASE):
                matched[category].append(p)
                total_matches += 1

    score = min(total_matches * 8, 60)
    return score, matched


def _linguistic_analysis(text: str) -> list:
    issues = []
    words = text.split()
    if len(words) == 0:
        return issues

    caps_count = sum(1 for w in words if w.isupper() and len(w) > 2)
    caps_ratio = caps_count / len(words)
    if caps_ratio > 0.15:
        issues.append("Excessive capitalization detected")

    if text.count("!") > 2:
        issues.append("Excessive exclamation marks — pressure tactic")

    generic_greets = ["dear customer", "dear user", "dear sir/madam", "valued customer", "dear account holder"]
    if any(g in text.lower() for g in generic_greets):
        issues.append("Generic greeting — not personalized, mass scam indicator")

    return issues


def _india_scam_match(text: str) -> tuple[str | None, str | None]:
    text_lower = text.lower()
    for scam_type, data in INDIA_SCAM_PATTERNS.items():
        matches = sum(1 for p in data["patterns"] if re.search(p, text_lower, re.IGNORECASE))
        if matches >= 1:
            return scam_type, data["description"]
    return None, None


def _zero_trust_triggers(text: str) -> list[str]:
    """
    Hard safety rails for phishing scoring.
    If any of these are present, we must not return verdict=SATE.
    """
    t = (text or "").lower()
    hits: list[str] = []

    urgency_re = r"\burgent\b|\bimmediately\b|\bact now\b|\basap\b|\bright now\b|\bdeadline\b|\bexpires?\b|\bfinal notice\b|\blimited time\b|\bhurry\b"
    if re.search(urgency_re, t, re.IGNORECASE):
        hits.append("urgency")

    links_re = r"https?://|www\."
    if re.search(links_re, t, re.IGNORECASE):
        hits.append("links")

    financial_re = (
        r"\b(payment|invoice|transfer|wire transfer|bank transfer|neft|rtgs|imps|upi transfer|pay now|remit)\b"
        r"|₹\s*\d+"
        r"|credit card|cvv|bank account"
    )
    if re.search(financial_re, t, re.IGNORECASE):
        hits.append("financial_request")

    account_threat_re = (
        r"\b(suspend|blocked?|block|verify|verification|locked|unauthorized|account)\b"
        r".{0,40}\b(suspend|block|verify|locked|unauthorized)\b"
    )
    if re.search(account_threat_re, t, re.IGNORECASE):
        hits.append("account_threats")

    otp_re = r"\b(otp|one[- ]?time password|pin|password|passcode|credential|kyc|aadhaar|pan)\b"
    if re.search(otp_re, t, re.IGNORECASE):
        hits.append("otp_or_sensitive_data")

    return hits


def _boost_from_triggers(trigger_hits: list[str]) -> int:
    """
    Convert trigger hits into a minimum risk score.
    """
    if not trigger_hits:
        return 0

    # Strongest indicators first.
    if "otp_or_sensitive_data" in trigger_hits:
        return 90
    if "links" in trigger_hits and "financial_request" in trigger_hits:
        return 88
    if "links" in trigger_hits and "account_threats" in trigger_hits:
        return 85
    if len(trigger_hits) >= 2:
        return 82
    # Single trigger: still enough to avoid SAFE.
    if "urgency" in trigger_hits or "account_threats" in trigger_hits or "financial_request" in trigger_hits:
        return 68
    if "links" in trigger_hits:
        return 65
    return 60


def _fallback_psychological_dimensions(message_text: str, matched_patterns: dict) -> list[dict]:
    """
    Provide deterministic psychological dimension scores when the LLM omits them.
    Values are 0-100 and names must match the frontend expectations.
    """
    triggers = _zero_trust_triggers(message_text)

    def has_cat(cat: str) -> bool:
        return bool(matched_patterns.get(cat))

    has_urgency = "urgency" in triggers
    has_links = "links" in triggers
    has_otp = "otp_or_sensitive_data" in triggers
    has_fin = "financial_request" in triggers

    soft_power_strength = 70 if has_cat("soft_power") or has_urgency else 25
    authority_strength = 70 if has_cat("hierarchy_leverage") else 20
    channel_migration_strength = 75 if has_cat("channel_shift") or has_links else 22
    credential_targeting_strength = 85 if has_cat("credential_harvesting") or has_otp else 18
    fear_fomo_strength = 75 if has_urgency or has_fin else 28

    return [
        {"dimension": "Urgency Pressure", "value": int(soft_power_strength if has_urgency else soft_power_strength * 0.85)},
        {"dimension": "Authority Leverage", "value": int(authority_strength)},
        {"dimension": "Fear / FOMO", "value": int(fear_fomo_strength)},
        {"dimension": "Channel Migration Pressure", "value": int(channel_migration_strength)},
        {"dimension": "Credential / OTP Targeting", "value": int(credential_targeting_strength)},
    ]


async def analyze_message(
    message_text: str,
    message_type: str = "email",
    sender_info: str = "",
) -> dict:
    start = time.time()

    # Step 1: Pattern matching (instant)
    pattern_score, matched_patterns = _pattern_score(message_text)

    # Step 2: Linguistic analysis
    linguistic_issues = _linguistic_analysis(message_text)

    # Step 3: India scam pattern matching
    india_scam_type, india_scam_desc = _india_scam_match(message_text)

    pattern_indicators = {k: v for k, v in matched_patterns.items() if v}

    # Step 4: LLM deep analysis
    system = """You are a cybersecurity expert specializing in social engineering detection for 
Indian small businesses and individuals. Analyze messages for:
1. Soft-Power tactics (urgency, authority, FOMO, fear)
2. Hierarchy leverage (impersonating superiors, officials, government bodies)
3. Channel-shift requests (moving to WhatsApp, Telegram, private channels)
4. India-specific scams (Digital Arrest, KYC Update, GST notices, UPI fraud, CEO fraud)
5. Linguistic manipulation and deception patterns.
You run completely locally — no data ever leaves this device.
Respond ONLY with valid JSON."""

    user = f"""Message Type: {message_type}
Sender Info: {sender_info or "Unknown"}
Message to analyze:
---
{message_text[:2000]}
---
Pattern analysis already found: {list(pattern_indicators.keys())}
India scam match: {india_scam_type or "None"}

Return this exact JSON structure:
{{
  "risk_score": 0-100,
  "verdict": "SAFE|SUSPICIOUS|PHISHING|CRITICAL_THREAT",
  "attack_type": "Type of attack or manipulation",
  "confidence": "Low|Medium|High",
  "manipulation_techniques": [
    {{"technique": "name", "evidence": "exact quote from message", "explanation": "why this is suspicious"}}
  ],
  "soft_power_indicators": ["list", "of", "soft", "power", "tactics"],
  "channel_shift_detected": true/false,
  "channel_shift_evidence": "exact quote or null",
  "linguistic_deviations": ["list of linguistic anomalies"],
  "india_specific_scam": "scam type or null",
  "what_they_want": "What the attacker wants from the victim",
  "red_flags_summary": "2-3 sentence summary of red flags",
  "recommended_action": "IGNORE|VERIFY|BLOCK|REPORT",
  "safe_response_template": "Template for how to respond safely"
  ,
  "psychological_dimensions": [
    {{"dimension": "Urgency Pressure", "value": 0-100}},
    {{"dimension": "Authority Leverage", "value": 0-100}},
    {{"dimension": "Fear / FOMO", "value": 0-100}},
    {{"dimension": "Channel Migration Pressure", "value": 0-100}},
    {{"dimension": "Credential / OTP Targeting", "value": 0-100}}
  ]
}}"""

    llm_result = await call_llm_json(system, user)

    # Combine scores
    llm_score = 0
    if isinstance(llm_result, dict):
        llm_score = int(llm_result.get("risk_score", 0))

    final_score = int(pattern_score * 0.4 + llm_score * 0.6)
    final_score = min(final_score, 100)

    # Zero-trust safety rails: never return SAFE if classic phishing triggers exist.
    trigger_hits = _zero_trust_triggers(message_text)
    if trigger_hits:
        final_score = max(final_score, _boost_from_triggers(trigger_hits))
        # Ensure we never output SAFE when triggers exist.
        final_score = max(final_score, 40)

    # Determine risk level
    if final_score >= 80:
        risk_level = "CRITICAL"
        verdict = "CRITICAL_THREAT"
        is_phishing = True
    elif final_score >= 60:
        risk_level = "HIGH"
        verdict = "PHISHING"
        is_phishing = True
    elif final_score >= 35:
        risk_level = "MEDIUM"
        verdict = "SUSPICIOUS"
        is_phishing = False
    else:
        risk_level = "LOW"
        verdict = "SAFE"
        is_phishing = False

    # Override with LLM verdict if available
    if isinstance(llm_result, dict) and llm_result.get("verdict"):
        llm_verdict = llm_result["verdict"]
        if llm_verdict in ("PHISHING", "CRITICAL_THREAT"):
            is_phishing = True
            verdict = llm_verdict
        # If triggers are present, don't allow the LLM to downgrade to SAFE.
        if trigger_hits and llm_verdict == "SAFE":
            # Re-derive verdict from boosted final_score.
            if final_score >= 80:
                verdict = "CRITICAL_THREAT"
                risk_level = "CRITICAL"
                is_phishing = True
            elif final_score >= 60:
                verdict = "PHISHING"
                risk_level = "HIGH"
                is_phishing = True
            else:
                verdict = "SUSPICIOUS"
                risk_level = "MEDIUM"
                is_phishing = False

    processing_time = round(time.time() - start, 2)

    llm_psych = llm_result.get("psychological_dimensions", []) if isinstance(llm_result, dict) else []
    if not llm_psych:
        llm_psych = _fallback_psychological_dimensions(message_text, pattern_indicators)

    return {
        "risk_score": final_score,
        "risk_level": risk_level,
        "verdict": verdict,
        "is_phishing": is_phishing,
        "attack_type": llm_result.get("attack_type", "Unknown") if isinstance(llm_result, dict) else "Pattern Match",
        "confidence": llm_result.get("confidence", "Medium") if isinstance(llm_result, dict) else "Medium",
        "manipulation_techniques": llm_result.get("manipulation_techniques", []) if isinstance(llm_result, dict) else [],
        "soft_power_indicators": llm_result.get("soft_power_indicators", list(pattern_indicators.keys())) if isinstance(llm_result, dict) else list(pattern_indicators.keys()),
        "channel_shift_detected": llm_result.get("channel_shift_detected", bool(matched_patterns.get("channel_shift"))) if isinstance(llm_result, dict) else bool(matched_patterns.get("channel_shift")),
        "channel_shift_evidence": llm_result.get("channel_shift_evidence") if isinstance(llm_result, dict) else None,
        "linguistic_deviations": linguistic_issues + (llm_result.get("linguistic_deviations", []) if isinstance(llm_result, dict) else []),
        "india_specific_scam": india_scam_type or (llm_result.get("india_specific_scam") if isinstance(llm_result, dict) else None),
        "india_scam_description": india_scam_desc,
        "what_they_want": llm_result.get("what_they_want", "Unknown") if isinstance(llm_result, dict) else "Unknown",
        "red_flags_summary": llm_result.get("red_flags_summary", "") if isinstance(llm_result, dict) else "",
        "recommended_action": llm_result.get("recommended_action", "VERIFY") if isinstance(llm_result, dict) else "VERIFY",
        "safe_response_template": llm_result.get("safe_response_template", "") if isinstance(llm_result, dict) else "",
        "psychological_dimensions": llm_psych,
        "pattern_score": pattern_score,
        "llm_score": llm_score,
        "pattern_indicators": pattern_indicators,
        "processing_mode": "LOCAL-AI-ONLY",
        "cloud_data_sent": False,
        "processing_time_seconds": processing_time,
    }


def _parse_conversation_lines(conversation_text: str) -> list[dict]:
    """
    Accepts lines like:
      Sender: message...
    or:
      Sender - message...
    Returns list of {sender, text}.
    """
    text = (conversation_text or "").strip()
    if not text:
        return []

    messages: list[dict] = []
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines:
        # Try "Sender: message" or "Sender - message"
        m = re.match(r"^(.{1,60}?)(:|-)\s*(.+)$", ln)
        if m:
            sender = m.group(1).strip()
            msg_text = m.group(3).strip()
            messages.append({"sender": sender, "text": msg_text})
        else:
            messages.append({"sender": "Unknown", "text": ln})
    return messages


async def analyze_conversation(
    conversation_text: str,
    message_type: str = "email",
    sender_info: str = "",
) -> dict:
    """
    Conversation Graph Analysis (Innovation 5).
    Builds a lightweight graph (nodes=turns, edges=detected transitions) using the same
    local regex indicators already used for single-message scoring.
    """
    start = time.time()

    messages = _parse_conversation_lines(conversation_text)
    if not messages:
        return {
            "risk_score": 0,
            "risk_level": "LOW",
            "verdict": "SAFE",
            "is_phishing": False,
            "attack_type": "Unknown",
            "confidence": "Low",
            "manipulation_techniques": [],
            "soft_power_indicators": [],
            "channel_shift_detected": False,
            "channel_shift_evidence": None,
            "linguistic_deviations": [],
            "india_specific_scam": None,
            "what_they_want": "Unknown",
            "red_flags_summary": "",
            "recommended_action": "VERIFY",
            "safe_response_template": "",
            "conversation_graph": {"nodes": [], "edges": []},
            "processing_mode": "LOCAL-AI-ONLY",
            "cloud_data_sent": False,
            "processing_time_seconds": 0.0,
        }

    per_turn = []
    soft_power_union = set()
    channel_shift_turns = []

    for idx, m in enumerate(messages):
        pattern_score, matched_patterns = _pattern_score(m["text"])
        # Matched patterns keys are soft-power categories in this file
        if matched_patterns.get("channel_shift"):
            channel_shift_turns.append(idx)

        for cat, pats in matched_patterns.items():
            if pats:
                soft_power_union.add(cat)

        per_turn.append(
            {
                "index": idx,
                "sender": m["sender"],
                "text_excerpt": m["text"][:180],
                "pattern_score": int(pattern_score),
                "matched_categories": [k for k, v in matched_patterns.items() if v],
            }
        )

    # Simple graph: nodes=turns; edges between consecutive turns when a transition indicator appears.
    nodes = []
    edges = []
    for i, turn in enumerate(per_turn):
        nodes.append(
            {
                "id": i,
                "sender": turn["sender"],
                "turn_index": i,
                "risk": turn["pattern_score"],
                "labels": turn["matched_categories"],
                "text_excerpt": turn["text_excerpt"],
            }
        )

        if i < len(per_turn) - 1:
            next_turn = per_turn[i + 1]
            transition_labels = []
            if "channel_shift" in next_turn["matched_categories"]:
                transition_labels.append("channel_shift")
            if "soft_power" in next_turn["matched_categories"] or "hierarchy_leverage" in next_turn["matched_categories"]:
                transition_labels.append("social_engineering_escalation")
            if transition_labels:
                edges.append(
                    {
                        "from": i,
                        "to": i + 1,
                        "type": transition_labels[0],
                        "labels": transition_labels,
                    }
                )

    # Risk scoring: sum of pattern scores with normalization.
    raw = sum(t["pattern_score"] for t in per_turn)
    normalized = min(int(raw / max(len(per_turn), 1) * 1.6), 100)

    # Verdict thresholds aligned to analyze_message.
    if normalized >= 80:
        risk_level = "CRITICAL"
        verdict = "CRITICAL_THREAT"
        is_phishing = True
        confidence = "High"
    elif normalized >= 60:
        risk_level = "HIGH"
        verdict = "PHISHING"
        is_phishing = True
        confidence = "Medium"
    elif normalized >= 35:
        risk_level = "MEDIUM"
        verdict = "SUSPICIOUS"
        is_phishing = False
        confidence = "Medium"
    else:
        risk_level = "LOW"
        verdict = "SAFE"
        is_phishing = False
        confidence = "Low"

    channel_shift_detected = len(channel_shift_turns) > 0
    channel_shift_evidence = (
        conversation_text[:220] if channel_shift_detected else None
    )

    # Basic linguistic anomalies across the full thread.
    linguistic_deviations = _linguistic_analysis(conversation_text)

    processing_time = round(time.time() - start, 2)
    red_flags_summary = (
        "Multiple turns contain social-engineering signals. Consider verifying independently and avoiding any off-platform handoffs."
        if normalized >= 50
        else "No strong multi-turn manipulation indicators detected, but remain cautious and verify requests independently."
    )

    recommended_action = "REPORT" if verdict in ("PHISHING", "CRITICAL_THREAT") else "VERIFY"

    return {
        "risk_score": normalized,
        "risk_level": risk_level,
        "verdict": verdict,
        "is_phishing": is_phishing,
        "attack_type": "Conversation Social Engineering",
        "confidence": confidence,
        "manipulation_techniques": [],
        "soft_power_indicators": list(sorted(soft_power_union)),
        "channel_shift_detected": channel_shift_detected,
        "channel_shift_evidence": channel_shift_evidence,
        "linguistic_deviations": linguistic_deviations,
        "india_specific_scam": None,
        "what_they_want": "Unknown (analyze conversation context)",
        "red_flags_summary": red_flags_summary,
        "recommended_action": recommended_action,
        "safe_response_template": "Verify via official channels, do not share OTPs/credentials, and avoid clicking unknown links.",
        "conversation_graph": {"nodes": nodes, "edges": edges},
        "conversation_analysis": {
            "message_count": len(messages),
            "node_count": len(nodes),
            "edge_count": len(edges),
            "channel_shift_turns": channel_shift_turns,
            "top_risky_turns": sorted(per_turn, key=lambda x: x["pattern_score"], reverse=True)[:3],
        },
        "processing_mode": "LOCAL-AI-ONLY",
        "cloud_data_sent": False,
        "processing_time_seconds": processing_time,
    }
