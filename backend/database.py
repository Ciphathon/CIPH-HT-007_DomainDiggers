from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, mapped_column, Mapped
from sqlalchemy import String, Integer, Boolean, Float, Text, DateTime, func
from datetime import datetime
from typing import Optional
import json

DATABASE_URL = "sqlite+aiosqlite:///./secureiq.db"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clerk_user_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    full_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    business_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    website_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    website_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    monthly_visitors: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    team_size: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tech_comfort_level: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    has_customer_data: Mapped[bool] = mapped_column(Boolean, default=False)
    has_payment_processing: Mapped[bool] = mapped_column(Boolean, default=False)
    has_user_login: Mapped[bool] = mapped_column(Boolean, default=False)
    previous_security_audit: Mapped[bool] = mapped_column(Boolean, default=False)
    biggest_concern: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    hosting_provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    onboarding_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())


class ScanResult(Base):
    __tablename__ = "scan_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    domain: Mapped[str] = mapped_column(String, index=True)
    score: Mapped[int] = mapped_column(Integer, default=0)
    findings_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attack_chain_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    simulation_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    damage_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hosting_provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    clerk_user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class ScanHistory(Base):
    __tablename__ = "scan_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    domain: Mapped[str] = mapped_column(String, index=True)
    score: Mapped[int] = mapped_column(Integer, default=0)
    clerk_user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    scanned_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class PhishingAnalysis(Base):
    __tablename__ = "phishing_analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    clerk_user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    message_preview: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    message_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    risk_level: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    verdict: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    attack_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    is_phishing: Mapped[bool] = mapped_column(Boolean, default=False)
    india_specific_scam: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    full_result_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())


class CertificateRecord(Base):
    __tablename__ = "certificate_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scan_id: Mapped[int] = mapped_column(Integer, index=True)
    domain: Mapped[str] = mapped_column(String)
    cert_id: Mapped[str] = mapped_column(String, unique=True)
    score: Mapped[int] = mapped_column(Integer, default=0)
    issued_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    clerk_user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ─── CRUD helpers ────────────────────────────────────────────────────────────

async def create_or_get_user_profile(clerk_user_id: str, email: str = None, full_name: str = None) -> UserProfile:
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(UserProfile).where(UserProfile.clerk_user_id == clerk_user_id))
        profile = result.scalar_one_or_none()
        if not profile:
            profile = UserProfile(clerk_user_id=clerk_user_id, email=email, full_name=full_name)
            db.add(profile)
            await db.commit()
            await db.refresh(profile)
        return profile


async def get_user_profile(clerk_user_id: str) -> Optional[UserProfile]:
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(UserProfile).where(UserProfile.clerk_user_id == clerk_user_id))
        return result.scalar_one_or_none()


async def update_user_profile(clerk_user_id: str, data: dict) -> UserProfile:
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(UserProfile).where(UserProfile.clerk_user_id == clerk_user_id))
        profile = result.scalar_one_or_none()
        if not profile:
            profile = UserProfile(clerk_user_id=clerk_user_id)
            db.add(profile)
        for key, value in data.items():
            if hasattr(profile, key):
                setattr(profile, key, value)
        await db.commit()
        await db.refresh(profile)
        return profile


async def mark_onboarding_complete(clerk_user_id: str) -> UserProfile:
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(UserProfile).where(UserProfile.clerk_user_id == clerk_user_id))
        profile = result.scalar_one_or_none()
        if profile:
            profile.onboarding_completed = True
            profile.onboarding_completed_at = datetime.utcnow()
            await db.commit()
            await db.refresh(profile)
        return profile


async def save_scan_result(data: dict) -> ScanResult:
    async with AsyncSessionLocal() as db:
        scan = ScanResult(
            domain=data.get("domain", ""),
            score=data.get("score", 0),
            findings_json=json.dumps(data.get("findings", [])),
            attack_chain_json=json.dumps(data.get("attack_chain", {})),
            simulation_json=json.dumps(data.get("simulation", {})),
            damage_json=json.dumps(data.get("damage", {})),
            hosting_provider=data.get("hosting_provider"),
            clerk_user_id=data.get("clerk_user_id"),
        )
        db.add(scan)
        history = ScanHistory(
            domain=data.get("domain", ""),
            score=data.get("score", 0),
            clerk_user_id=data.get("clerk_user_id"),
        )
        db.add(history)
        await db.commit()
        await db.refresh(scan)
        return scan


async def get_scan_by_id(scan_id: int) -> Optional[ScanResult]:
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ScanResult).where(ScanResult.id == scan_id))
        return result.scalar_one_or_none()


async def get_scan_history(domain: str, clerk_user_id: str) -> list:
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ScanHistory)
            .where(ScanHistory.domain == domain, ScanHistory.clerk_user_id == clerk_user_id)
            .order_by(ScanHistory.scanned_at.desc())
            .limit(20)
        )
        return result.scalars().all()


async def save_phishing_analysis(data: dict) -> PhishingAnalysis:
    async with AsyncSessionLocal() as db:
        analysis = PhishingAnalysis(
            clerk_user_id=data.get("clerk_user_id"),
            message_preview=data.get("message_preview", "")[:200],
            message_type=data.get("message_type"),
            risk_score=data.get("risk_score", 0),
            risk_level=data.get("risk_level"),
            verdict=data.get("verdict"),
            attack_type=data.get("attack_type"),
            is_phishing=data.get("is_phishing", False),
            india_specific_scam=data.get("india_specific_scam"),
            full_result_json=json.dumps(data.get("full_result", {})),
        )
        db.add(analysis)
        await db.commit()
        await db.refresh(analysis)
        return analysis


async def get_phishing_history(clerk_user_id: str) -> list:
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(PhishingAnalysis)
            .where(PhishingAnalysis.clerk_user_id == clerk_user_id)
            .order_by(PhishingAnalysis.analyzed_at.desc())
            .limit(10)
        )
        return result.scalars().all()


async def get_phishing_stats(clerk_user_id: str) -> dict:
    from sqlalchemy import select, func as sqlfunc
    async with AsyncSessionLocal() as db:
        total = await db.execute(
            select(sqlfunc.count()).where(PhishingAnalysis.clerk_user_id == clerk_user_id)
        )
        threats = await db.execute(
            select(sqlfunc.count()).where(
                PhishingAnalysis.clerk_user_id == clerk_user_id,
                PhishingAnalysis.is_phishing == True,
            )
        )
        t = total.scalar() or 0
        th = threats.scalar() or 0
        return {"total_analyzed": t, "threats_detected": th, "safe_messages": t - th}


async def save_certificate(data: dict) -> CertificateRecord:
    async with AsyncSessionLocal() as db:
        cert = CertificateRecord(**data)
        db.add(cert)
        await db.commit()
        await db.refresh(cert)
        return cert


async def update_scan_simulation(scan_id: int, simulation: dict):
    from sqlalchemy import select
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ScanResult).where(ScanResult.id == scan_id))
        scan = result.scalar_one_or_none()
        if scan:
            scan.simulation_json = json.dumps(simulation)
            await db.commit()


def _calculate_score_from_findings(findings: list) -> dict:
    """
    Keep score logic consistent with scanners/orchestrator.py.
    """
    categories = {
        "email": {"max": 30, "earned": 0},
        "ssl": {"max": 25, "earned": 0},
        "headers": {"max": 20, "earned": 0},
        "network": {"max": 15, "earned": 0},
        "exposure": {"max": 10, "earned": 0},
    }

    for f in findings:
        cat = f.get("category", "")
        impact = f.get("score_impact", 0)
        if cat in categories:
            categories[cat]["earned"] = min(categories[cat]["earned"] + impact, categories[cat]["max"])

    total = sum(v["earned"] for v in categories.values())
    max_total = sum(v["max"] for v in categories.values())

    return {
        "total": int(total),
        "max": max_total,
        "categories": {k: {"earned": v["earned"], "max": v["max"]} for k, v in categories.items()},
    }


async def update_scan_score(scan_id: int, updated_findings: list) -> dict:
    """
    Update scan findings, then recalculate score and financial exposure (damage_json).
    Returns { new_score, points_gained } so the frontend can update the dashboard live.
    """
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(ScanResult).where(ScanResult.id == scan_id))
        scan = result.scalar_one_or_none()
        if not scan:
            return {"new_score": 0, "points_gained": 0, "message": "Scan not found"}

        old_score = scan.score or 0

        scan.findings_json = json.dumps(updated_findings)

        score_data = _calculate_score_from_findings(updated_findings)
        scan.score = score_data["total"]

        from ai.damage_calculator import calculate_damage

        profile = await get_user_profile(scan.clerk_user_id) if scan.clerk_user_id else None
        damage = await calculate_damage(
            updated_findings,
            score=scan.score,
            profile=profile,
        )
        scan.damage_json = json.dumps(damage)

        await db.commit()
        await db.refresh(scan)

        new_score = scan.score or 0
        points_gained = max(0, int(new_score) - int(old_score))
        return {"new_score": int(new_score), "points_gained": int(points_gained)}
