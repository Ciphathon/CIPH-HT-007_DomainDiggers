import json
import hashlib
import io
from datetime import datetime, timedelta
from fastapi import APIRouter
from fastapi.responses import StreamingResponse, JSONResponse
from database import get_scan_by_id, save_certificate

router = APIRouter(tags=["certificate"])


def generate_cert_id(scan_id: int, domain: str) -> str:
    year = datetime.now().year
    hash_val = hashlib.md5(f"{scan_id}{domain}".encode()).hexdigest()[:6].upper()
    return f"SIQ-{year}-{hash_val}"


@router.get("/certificate/{scan_id}/eligibility")
async def check_eligibility(scan_id: int):
    scan = await get_scan_by_id(scan_id)
    if not scan:
        return JSONResponse({"error": "Scan not found"}, status_code=404)

    required = 70
    gap = max(0, required - scan.score)
    eligible = scan.score >= required

    return {
        "eligible": eligible,
        "score": scan.score,
        "required": required,
        "gap": gap,
        "message": (
            f"Congratulations! {scan.domain} qualifies for a SecureIQ Security Certificate."
            if eligible
            else f"Fix {gap} more points worth of issues to earn your certificate."
        ),
    }


@router.get("/certificate/{scan_id}")
async def get_certificate(scan_id: int):
    scan = await get_scan_by_id(scan_id)
    if not scan:
        return JSONResponse({"error": "Scan not found"}, status_code=404)

    if scan.score < 70:
        return JSONResponse(
            {"error": f"Score {scan.score}/100 too low. Need 70+ for certificate."},
            status_code=400
        )

    cert_id = generate_cert_id(scan_id, scan.domain)
    issued_at = datetime.utcnow()
    expires_at = issued_at + timedelta(days=365)
    findings = json.loads(scan.findings_json or "[]")
    damage = json.loads(scan.damage_json or "{}")
    attack_chain = json.loads(scan.attack_chain_json or "{}")

    pdf_buffer = _generate_pdf(
        cert_id=cert_id,
        domain=scan.domain,
        score=scan.score,
        issued_at=issued_at,
        expires_at=expires_at,
        findings=findings,
        damage=damage,
        attack_chain=attack_chain,
        hosting_provider=scan.hosting_provider,
    )

    # Save record
    try:
        await save_certificate({
            "scan_id": scan_id,
            "domain": scan.domain,
            "cert_id": cert_id,
            "score": scan.score,
            "issued_at": issued_at,
            "expires_at": expires_at,
            "clerk_user_id": scan.clerk_user_id,
        })
    except Exception:
        pass  # Already exists, continue

    return StreamingResponse(
        io.BytesIO(pdf_buffer),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="secureiq-cert-{scan.domain}.pdf"'},
    )
def _generate_pdf(
    cert_id: str,
    domain: str,
    score: int,
    issued_at: datetime,
    expires_at: datetime,
    findings: list,
    damage: dict,
    attack_chain: dict,
    hosting_provider: str | None,
) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.colors import HexColor, white
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader

    def trim(text: str, limit: int = 92) -> str:
        value = " ".join((text or "").split())
        if len(value) <= limit:
            return value
        return value[: limit - 1] + "..."

    def score_breakdown(items: list) -> dict:
        categories = {
            "email": {"label": "Email", "max": 30, "earned": 0},
            "ssl": {"label": "SSL/TLS", "max": 25, "earned": 0},
            "headers": {"label": "Headers", "max": 20, "earned": 0},
            "network": {"label": "Network", "max": 15, "earned": 0},
            "exposure": {"label": "Exposure", "max": 10, "earned": 0},
        }
        for item in items or []:
            cat = item.get("category")
            if cat in categories:
                categories[cat]["earned"] = min(
                    categories[cat]["max"],
                    categories[cat]["earned"] + int(item.get("score_impact", 0) or 0),
                )
        return categories

    def summary_text(items: list) -> str:
        critical = sum(1 for item in items if item.get("status") == "critical")
        warning = sum(1 for item in items if item.get("status") == "warning")
        if critical == 0 and warning == 0:
            return "The domain cleared the analysed checks with no active remediation blockers at certificate issue time."
        if critical > 0:
            return (
                f"The domain achieved certificate threshold with {critical} critical and {warning} warning findings still requiring monitoring. "
                "Certificate status reflects score threshold, not a guarantee of zero residual risk."
            )
        return (
            f"The domain met the verification threshold with {warning} warning findings remaining. "
            "Core trust controls are in place, with follow-up hardening recommended."
        )

    buffer = io.BytesIO()
    width, height = A4
    c = canvas.Canvas(buffer, pagesize=A4)

    bg = HexColor("#181818")
    card = HexColor("#211b19")
    border = HexColor("#35211A")
    accent = HexColor("#DC9F85")
    text = HexColor("#EBDCC4")
    muted = HexColor("#B6A596")
    green = HexColor("#3FB950")
    amber = HexColor("#D29922")

    critical = [item for item in findings if item.get("status") == "critical"][:3]
    warning = [item for item in findings if item.get("status") == "warning"][:3]
    analysis_lines = critical or warning or (findings or [])[:3]
    breakdown = score_breakdown(findings)
    projected_exposure = damage.get("formatted_total", "N/A")
    chain_title = trim((attack_chain or {}).get("attack_name") or "Continuous monitoring recommended", 64)

    c.setFillColor(bg)
    c.rect(0, 0, width, height, fill=1, stroke=0)

    c.setFillColor(accent)
    c.rect(0, height - 10, width, 10, fill=1, stroke=0)

    c.setFillColor(text)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(42, height - 48, "SEQUREIQ")
    c.setFillColor(muted)
    c.setFont("Helvetica", 11)
    c.drawString(42, height - 64, "AI-Powered Website Security Intelligence")

    c.setFillColor(green)
    c.roundRect(width - 195, height - 74, 150, 28, 14, fill=1, stroke=0)
    c.setFillColor(bg)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(width - 120, height - 56, "SEQUREIQ VERIFIED")

    c.setFillColor(text)
    c.setFont("Helvetica-Bold", 28)
    c.drawString(42, height - 122, "Security Verification Certificate")
    c.setFillColor(muted)
    c.setFont("Helvetica", 12)
    c.drawString(42, height - 141, "Issued when a domain maintains a verified security score of 70 or above.")

    c.setFillColor(card)
    c.roundRect(42, height - 255, width - 84, 92, 18, fill=1, stroke=0)
    c.setStrokeColor(border)
    c.roundRect(42, height - 255, width - 84, 92, 18, fill=0, stroke=1)
    c.setFillColor(muted)
    c.setFont("Helvetica", 11)
    c.drawString(64, height - 192, "Verified Domain")
    c.setFillColor(text)
    c.setFont("Helvetica-Bold", 30)
    c.drawString(64, height - 224, domain)

    score_box_x = width - 190
    c.setFillColor(green if score >= 85 else amber)
    c.circle(score_box_x, height - 209, 34, fill=1, stroke=0)
    c.setFillColor(bg)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(score_box_x, height - 215, str(score))
    c.setFont("Helvetica", 9)
    c.drawCentredString(score_box_x, height - 228, "/100")
    c.setFillColor(muted)
    c.setFont("Helvetica", 10)
    c.drawCentredString(score_box_x, height - 250, "Verified Score")

    top_y = height - 286
    box_w = (width - 98) / 3
    top_cards = [
        ("Certificate ID", cert_id),
        ("Issued / Valid", f"{issued_at.strftime('%d %b %Y')}  -  {expires_at.strftime('%d %b %Y')}"),
        ("Hosting / Exposure", trim(hosting_provider or "Provider not detected", 30)),
    ]
    for idx, (label, value) in enumerate(top_cards):
        x = 42 + (idx * (box_w + 7))
        c.setFillColor(card)
        c.roundRect(x, top_y - 56, box_w, 56, 14, fill=1, stroke=0)
        c.setStrokeColor(border)
        c.roundRect(x, top_y - 56, box_w, 56, 14, fill=0, stroke=1)
        c.setFillColor(muted)
        c.setFont("Helvetica", 9)
        c.drawString(x + 14, top_y - 18, label)
        c.setFillColor(text)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(x + 14, top_y - 36, trim(value, 32))

    left_x = 42
    right_x = 315
    section_top = height - 366

    c.setFillColor(card)
    c.roundRect(left_x, 116, 248, section_top - 116, 16, fill=1, stroke=0)
    c.setStrokeColor(border)
    c.roundRect(left_x, 116, 248, section_top - 116, 16, fill=0, stroke=1)

    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left_x + 16, section_top - 24, "ANALYSIS SNAPSHOT")
    c.setFillColor(text)
    c.setFont("Helvetica", 10)
    text_obj = c.beginText(left_x + 16, section_top - 46)
    text_obj.setFillColor(text)
    text_obj.setFont("Helvetica", 10)
    for line in [trim(summary_text(findings), 58), "", f"Projected exposure: {projected_exposure}", f"Likely attack path: {chain_title}"]:
        text_obj.textLine(line)
    c.drawText(text_obj)

    y = section_top - 122
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left_x + 16, y, "KEY FINDINGS")
    y -= 18
    c.setFillColor(muted)
    c.setFont("Helvetica", 9)
    for item in analysis_lines[:3]:
        status = str(item.get("status", "info")).upper()
        c.drawString(left_x + 16, y, f"{status}  {trim(item.get('check', 'Security finding'), 34)}")
        y -= 13
        c.drawString(left_x + 26, y, trim(item.get("explanation") or item.get("detail") or "Manual review advised.", 48))
        y -= 20

    c.setFillColor(card)
    c.roundRect(right_x, 116, width - right_x - 42, section_top - 116, 16, fill=1, stroke=0)
    c.setStrokeColor(border)
    c.roundRect(right_x, 116, width - right_x - 42, section_top - 116, 16, fill=0, stroke=1)
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(right_x + 16, section_top - 24, "SCORE BREAKDOWN")

    bar_y = section_top - 52
    for item in breakdown.values():
        c.setFillColor(muted)
        c.setFont("Helvetica", 9)
        c.drawString(right_x + 16, bar_y, item["label"])
        c.drawRightString(width - 58, bar_y, f'{item["earned"]}/{item["max"]}')
        c.setFillColor(border)
        c.roundRect(right_x + 16, bar_y - 12, width - right_x - 74, 6, 3, fill=1, stroke=0)
        fill_w = (width - right_x - 74) * (item["earned"] / item["max"] if item["max"] else 0)
        c.setFillColor(accent)
        c.roundRect(right_x + 16, bar_y - 12, max(fill_w, 6 if item["earned"] else 0), 6, 3, fill=1, stroke=0)
        bar_y -= 28

    c.setFillColor(muted)
    c.setFont("Helvetica", 9)
    c.drawString(right_x + 16, bar_y - 4, "This certificate confirms score-threshold verification at issue time.")
    c.drawString(right_x + 16, bar_y - 18, "It should be renewed after material infra or application changes.")

    try:
        import qrcode

        qr = qrcode.QRCode(box_size=3, border=1)
        qr.add_data(f"https://secureiq.in/verify/{cert_id}")
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        qr_buffer = io.BytesIO()
        img.save(qr_buffer, format="PNG")
        qr_buffer.seek(0)
        c.drawImage(ImageReader(qr_buffer), width - 112, 34, width=54, height=54)
    except Exception:
        pass

    c.setFillColor(border)
    c.rect(0, 0, width, 24, fill=1, stroke=0)
    c.setFillColor(text)
    c.setFont("Helvetica", 8)
    c.drawString(42, 9, f"SEQUREIQ VERIFIED  |  {cert_id}  |  valid until {expires_at.strftime('%d %b %Y')}")
    c.drawRightString(width - 42, 9, "Generated from scan analysis and score breakdown")

    c.save()
    return buffer.getvalue()
