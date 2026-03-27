import json
import re
from fastapi import APIRouter
from pydantic import BaseModel
from database import (
    save_scan_result,
    get_scan_by_id,
    get_scan_history,
    get_user_profile,
    update_scan_simulation,
    update_scan_score,
)
from scanners.orchestrator import run_full_scan
from ai.explainer import explain_findings, generate_plain_summary
from ai.attack_chain import generate_attack_chain
from ai.fix_generator import generate_fixes
from ai.damage_calculator import calculate_damage
from ai.hacker_simulation import generate_hacker_simulation

router = APIRouter(tags=["scan"])


class ScanRequest(BaseModel):
    domain: str
    clerk_user_id: str = "anonymous"


class SimulateRequest(BaseModel):
    scan_id: int
    business_type: str = "small_business"
    estimated_customers: int = 1000


class VerifyFixRequest(BaseModel):
    scan_id: int
    check_name: str
    domain: str


def clean_domain(domain: str) -> str:
    domain = domain.strip().lower()
    for prefix in ["https://", "http://", "www."]:
        if domain.startswith(prefix):
            domain = domain[len(prefix):]
    return domain.rstrip("/").split("/")[0]


def _score_breakdown_from_findings(findings: list) -> dict:
    categories = {
        "email": {"max": 30, "earned": 0},
        "ssl": {"max": 25, "earned": 0},
        "headers": {"max": 20, "earned": 0},
        "network": {"max": 15, "earned": 0},
        "exposure": {"max": 10, "earned": 0},
    }

    for f in findings or []:
        if not isinstance(f, dict):
            continue
        cat = f.get("category", "")
        impact = f.get("score_impact", 0) or 0
        if cat in categories:
            categories[cat]["earned"] = min(categories[cat]["earned"] + impact, categories[cat]["max"])

    return {k: {"earned": int(v["earned"]), "max": int(v["max"])} for k, v in categories.items()}


@router.post("/scan")
async def start_scan(req: ScanRequest):
    domain = clean_domain(req.domain)
    profile = await get_user_profile(req.clerk_user_id)

    # Run all scanners
    scan_data = await run_full_scan(domain, req.clerk_user_id)

    # AI enrichment
    findings = await explain_findings(
        scan_data["findings"], domain, scan_data["hosting_provider"]
    )
    attack_chain = await generate_attack_chain(findings, domain)
    fixes = await generate_fixes(findings, domain, scan_data["hosting_provider"])
    damage = await calculate_damage(
        findings,
        score=scan_data.get("score", 50),
        profile=profile,
    )

    # Attach per-finding fixes for consistent frontend rendering
    if isinstance(fixes, dict):
        for f in findings:
            if isinstance(f, dict):
                f["fixes"] = fixes.get(f.get("check", ""), {}) or {}

    # Plain-English summary for non-technical users
    summary = await generate_plain_summary(findings, domain, scan_data.get("score", 0))

    scan_data["findings"] = findings
    scan_data["attack_chain"] = attack_chain
    scan_data["fixes"] = fixes
    scan_data["damage"] = damage
    scan_data["summary"] = summary

    # Save to DB
    saved = await save_scan_result(scan_data)
    scan_data["scan_id"] = saved.id

    return scan_data


@router.get("/scan/{scan_id}")
async def get_scan(scan_id: int):
    scan = await get_scan_by_id(scan_id)
    if not scan:
        return {"error": "Scan not found"}
    findings = json.loads(scan.findings_json or "[]")
    critical_count = sum(1 for f in findings if isinstance(f, dict) and f.get("status") == "critical")
    warning_count = sum(1 for f in findings if isinstance(f, dict) and f.get("status") == "warning")
    pass_count = sum(1 for f in findings if isinstance(f, dict) and f.get("status") == "pass")
    return {
        "scan_id": scan.id,
        "domain": scan.domain,
        "score": scan.score,
        "findings": findings,
        "score_breakdown": _score_breakdown_from_findings(findings),
        "critical_count": critical_count,
        "warning_count": warning_count,
        "pass_count": pass_count,
        "attack_chain": json.loads(scan.attack_chain_json or "{}"),
        "simulation": json.loads(scan.simulation_json or "{}"),
        "damage": json.loads(scan.damage_json or "{}"),
        "hosting_provider": scan.hosting_provider,
        "created_at": str(scan.created_at),
    }


@router.get("/history/{domain}/{clerk_user_id}")
async def get_history(domain: str, clerk_user_id: str):
    history = await get_scan_history(domain, clerk_user_id)
    return [{"id": h.id, "domain": h.domain, "score": h.score, "scanned_at": str(h.scanned_at)} for h in history]


@router.post("/simulate")
async def run_simulation(req: SimulateRequest):
    scan = await get_scan_by_id(req.scan_id)
    if not scan:
        return {"error": "Scan not found"}

    findings = json.loads(scan.findings_json or "[]")
    simulation = await generate_hacker_simulation(
        findings, scan.domain, req.business_type, req.estimated_customers
    )
    await update_scan_simulation(req.scan_id, simulation)
    return simulation


@router.post("/verify-fix")
async def verify_fix(req: VerifyFixRequest):
    from scanners.ssl_checker import check_ssl
    from scanners.email_security import check_email_security
    from scanners.headers_checker import check_headers
    from scanners.darkweb_checker import check_darkweb
    from scanners.cve_checker import check_cve_exposure
    from utils.dns_resolver import resolve_a
    import socket

    domain = clean_domain(req.domain)
    check = (req.check_name or "").strip()
    check_l = check.lower()

    refreshed: dict | None = None

    # SSL
    if "ssl" in check_l or "tls" in check_l:
        refreshed = await check_ssl(domain)

    # Email DNS auth suite
    elif "spf" in check_l or "dmarc" in check_l or "dkim" in check_l:
        email_findings = await check_email_security(domain)
        refreshed = next((f for f in email_findings if check_l == (f.get("check", "").strip().lower())), None)

    # Headers (normalized check names)
    elif check_l in {"hsts", "csp", "x-frame-options", "x-content-type-options", "xss protection", "referrer policy"}:
        header_findings = await check_headers(domain)
        refreshed = next((f for f in header_findings if check_l == (f.get("check", "").strip().lower())), None)

    # Ports
    elif check_l.startswith("open port:"):
        # Example: "Open Port: MySQL (3306)"
        m = re.search(r"\((\d{1,5})\)", check)
        port = int(m.group(1)) if m else None
        fixed = True
        if port:
            try:
                ip = socket.gethostbyname(domain)
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(3)
                fixed = sock.connect_ex((ip, port)) != 0
                sock.close()
            except Exception:
                # If we can't verify, don't claim it's fixed.
                fixed = False
        refreshed = {
            "check": check,
            "category": "network",
            "status": "pass" if fixed else "warning",
            "detail": "Port is no longer reachable from the internet." if fixed else "Port still appears reachable from the internet.",
            "score_impact": 3 if fixed else 0,
            "raw_data": {"port": port},
        }

    # Subdomain exposure
    elif check_l.startswith("exposed subdomain:"):
        fqdn = check.split(":", 1)[1].strip() if ":" in check else ""
        ips = await resolve_a(fqdn) if fqdn else []
        fixed = len(ips) == 0
        refreshed = {
            "check": check,
            "category": "exposure",
            "status": "pass" if fixed else "warning",
            "detail": "Subdomain is no longer publicly accessible." if fixed else f"{fqdn} still resolves publicly.",
            "score_impact": 2 if fixed else 0,
            "raw_data": {"subdomain": fqdn, "ips": ips},
        }

    # Dark web / HIBP
    elif "dark web" in check_l or "breach" in check_l:
        refreshed = await check_darkweb(domain)

    # CVE
    elif "cve" in check_l:
        refreshed = await check_cve_exposure(domain)

    if refreshed and isinstance(refreshed, dict) and refreshed.get("check"):
        fixed = refreshed.get("status") == "pass"

        scan = await get_scan_by_id(req.scan_id)
        if not scan:
            return {
                "fixed": fixed,
                "new_status": refreshed.get("status", "unknown"),
                "message": "Scan not found.",
                "points_gained": 0,
            }

        existing_findings = json.loads(scan.findings_json or "[]")
        target = check_l

        updated_findings = []
        replaced = False
        for ef in existing_findings:
            if not replaced and (ef.get("check", "").strip().lower() == target):
                merged = dict(ef)
                for k in ["status", "detail", "score_impact", "category", "raw_data"]:
                    if k in refreshed:
                        merged[k] = refreshed[k]
                updated_findings.append(merged)
                replaced = True
            else:
                updated_findings.append(ef)

        if not replaced:
            updated_findings.append(refreshed)

        update_res = await update_scan_score(req.scan_id, updated_findings)
        return {
            "fixed": bool(fixed),
            "new_status": refreshed.get("status", "unknown"),
            "message": refreshed.get("detail", "Re-verified."),
            "points_gained": update_res.get("points_gained", 0),
        }

    return {
        "fixed": False,
        "new_status": "unknown",
        "message": "Could not re-verify this check",
        "points_gained": 0,
    }
