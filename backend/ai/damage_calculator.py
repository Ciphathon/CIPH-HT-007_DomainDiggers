INDUSTRY_MULTIPLIERS = {
    "ecommerce": 2.5,
    "e-commerce": 2.5,
    "fintech": 3.0,
    "healthcare": 2.8,
    "education": 1.5,
    "restaurant": 1.2,
    "retail": 1.8,
    "saas": 2.2,
    "media": 1.4,
    "real_estate": 1.6,
    "logistics": 1.7,
    "government": 2.0,
    "banking": 3.5,
    "ngo": 1.0,
    "small_business": 1.3,
    "other": 1.5,
    "default": 1.5,
}

VISITOR_MULTIPLIERS = {
    "under_1k": 0.6,
    "1k_10k": 1.1,
    "10k_100k": 2.2,
    "100k_plus": 4.0,
    "1000_to_10000": 1.1,
}

VISITOR_BASELINES = {
    "under_1k": 800,
    "1k_10k": 5000,
    "10k_100k": 50000,
    "100k_plus": 500000,
    "1000_to_10000": 5000,
}

BRAND_FLOORS = {
    "under_1k": 150000,
    "1k_10k": 600000,
    "10k_100k": 2500000,
    "100k_plus": 9000000,
    "1000_to_10000": 600000,
}

FINDING_DAMAGE_MAP = {
    "SSL Certificate": {
        "label": "Man-in-the-Middle Attack",
        "risks": ["Payment data interception", "Customer credential theft", "Session hijacking"],
        "base_cost": 500000,
    },
    "SPF Record": {
        "label": "Email Spoofing & Phishing",
        "risks": ["Fake invoice fraud", "CEO fraud to employees", "Customer phishing via your domain"],
        "base_cost": 300000,
    },
    "DMARC Policy": {
        "label": "Email Brand Abuse",
        "risks": ["Phishing emails sent in your name", "Customer trust damage", "Regulatory fines"],
        "base_cost": 400000,
    },
    "DKIM Signing": {
        "label": "Email Authenticity Gap",
        "risks": ["Email spoofing", "Phishing campaigns"],
        "base_cost": 150000,
    },
    "Open Port: MySQL (3306)": {
        "label": "Database Breach",
        "risks": ["Complete customer data theft", "GST/financial data exposure", "GDPR/IT Act violation"],
        "base_cost": 2000000,
    },
    "Open Port: MongoDB (27017)": {
        "label": "NoSQL Database Exposure",
        "risks": ["All stored data theft", "Ransomware infection", "Competitor intelligence theft"],
        "base_cost": 1800000,
    },
    "Open Port: Redis (6379)": {
        "label": "Cache/Session Theft",
        "risks": ["User session hijacking", "Cached payment token theft", "Admin panel bypass"],
        "base_cost": 800000,
    },
    "Open Port: Telnet (23)": {
        "label": "Unencrypted Admin Access",
        "risks": ["Root server access", "Complete system takeover", "Ransomware deployment"],
        "base_cost": 2500000,
    },
    "Content Security Policy": {
        "label": "XSS Attack Surface",
        "risks": ["Customer browser hijacking", "Credential harvesting", "Defacement"],
        "base_cost": 200000,
    },
    "HSTS": {
        "label": "HTTPS Downgrade Attack",
        "risks": ["Payment interception", "Login credential theft"],
        "base_cost": 350000,
    },
    "Clickjacking Protection": {
        "label": "UI Redress Attack",
        "risks": ["Fraudulent clicks", "Unauthorized transactions"],
        "base_cost": 100000,
    },
    "default": {
        "label": "Security Vulnerability",
        "risks": ["Data exposure risk", "Compliance violation"],
        "base_cost": 100000,
    },
}


def _normalize_type(business_type: str) -> str:
    return (business_type or "default").strip().lower().replace(" ", "_")


def _profile_value(profile, key: str, default=None):
    if profile is None:
        return default
    if isinstance(profile, dict):
        return profile.get(key, default)
    return getattr(profile, key, default)


def _finding_damage_info(check_name: str) -> dict:
    check_name_l = (check_name or "").lower()
    for key, value in FINDING_DAMAGE_MAP.items():
        key_l = key.lower()
        if key_l in check_name_l or check_name_l in key_l:
            return value
    return FINDING_DAMAGE_MAP["default"]


def format_rupees(amount: int) -> str:
    if amount >= 10000000:
        return f"₹{amount / 10000000:.1f} Cr"
    if amount >= 100000:
        return f"₹{amount / 100000:.1f}L"
    if amount >= 1000:
        return f"₹{amount / 1000:.0f}K"
    return f"₹{amount}"


async def calculate_damage(
    findings: list,
    business_type: str = "small_business",
    monthly_visitors: str = "1k_10k",
    has_payment_processing: bool = False,
    has_customer_data: bool = False,
    has_user_login: bool = False,
    score: int = 50,
    profile=None,
) -> dict:
    business_type = _profile_value(profile, "website_type", business_type)
    monthly_visitors = _profile_value(profile, "monthly_visitors", monthly_visitors)
    has_payment_processing = bool(_profile_value(profile, "has_payment_processing", has_payment_processing))
    has_customer_data = bool(_profile_value(profile, "has_customer_data", has_customer_data))
    has_user_login = bool(_profile_value(profile, "has_user_login", has_user_login))

    normalized_type = _normalize_type(business_type)
    industry_mult = INDUSTRY_MULTIPLIERS.get(normalized_type, INDUSTRY_MULTIPLIERS["default"])
    visitor_mult = VISITOR_MULTIPLIERS.get(monthly_visitors, VISITOR_MULTIPLIERS["1k_10k"])
    payment_mult = 1.35 if has_payment_processing else 1.0
    trust_mult = 1.0
    if has_customer_data:
        trust_mult += 0.3
    if has_user_login:
        trust_mult += 0.2
    if has_payment_processing:
        trust_mult += 0.2

    actionable = [f for f in findings if f.get("status") in {"critical", "warning"}]
    critical_count = sum(1 for f in actionable if f.get("status") == "critical")
    warning_count = sum(1 for f in actionable if f.get("status") == "warning")
    score_penalty = max(0, min(1, (100 - (score or 50)) / 100))
    exploitability = 0.9 + (critical_count * 0.22) + (warning_count * 0.09) + (score_penalty * 1.1)
    business_impact = 0.95 + (visitor_mult * 0.4) + ((industry_mult - 1) * 0.35) + ((trust_mult - 1) * 0.9)

    total = 0
    finding_costs = []
    customer_baseline = VISITOR_BASELINES.get(monthly_visitors, VISITOR_BASELINES["1k_10k"])

    for finding in actionable:
        check_name = finding.get("check", "")
        damage_info = _finding_damage_info(check_name)
        severity_mult = 1.65 if finding.get("status") == "critical" else 0.95
        estimated_cost = int(
            damage_info["base_cost"]
            * severity_mult
            * exploitability
            * business_impact
            * payment_mult
        )
        total += estimated_cost

        affected_customers = int(
            customer_baseline
            * min(0.8, 0.16 + (0.12 if finding.get("status") == "critical" else 0.05) + (score_penalty * 0.22))
        )

        finding_costs.append({
            "check": check_name,
            "label": damage_info["label"],
            "status": finding.get("status"),
            "risks": damage_info["risks"],
            "estimated_cost": estimated_cost,
            "formatted_cost": format_rupees(estimated_cost),
            "affected_customers": affected_customers,
        })

    brand_floor = int(
        BRAND_FLOORS.get(monthly_visitors, BRAND_FLOORS["1k_10k"])
        * (0.65 + (critical_count * 0.18) + (warning_count * 0.07) + (score_penalty * 0.6))
        * (1 + ((industry_mult - 1) * 0.45))
        * (1 + ((trust_mult - 1) * 0.8))
    )

    total = max(total, brand_floor) if actionable else 0

    for finding in finding_costs:
        if total > 0:
            share = finding["estimated_cost"] / total
            finding["affected_customers"] = max(
                finding["affected_customers"],
                int(customer_baseline * min(0.85, 0.08 + (share * 0.95)))
            )

    industry_avg = 70 if industry_mult > 2 else 55

    time_parts = []
    if critical_count:
        time_parts.append("critical fixes: 2-4 hours")
    if warning_count:
        time_parts.append("warning fixes: 4-8 hours")

    return {
        "total_financial_risk": total,
        "formatted_total": format_rupees(total),
        "finding_costs": finding_costs,
        "industry_avg_score": industry_avg,
        "brand_value_floor": brand_floor,
        "formatted_brand_value_floor": format_rupees(brand_floor),
        "loss_model": {
            "security_pressure": round(exploitability, 2),
            "business_impact": round(business_impact, 2),
            "industry_multiplier": round(industry_mult, 2),
            "visitor_multiplier": round(visitor_mult, 2),
            "trust_multiplier": round(trust_mult, 2),
        },
        "prevention_message": (
            f"These {len(actionable)} issues expose both technical weaknesses and brand-value downside. "
            f"For your business profile, the 30-day loss exposure can reach {format_rupees(total)} even if the raw issue count is lower."
        ),
        "time_to_fix_all": " | ".join(time_parts) if time_parts else "4-8 hours total",
    }
