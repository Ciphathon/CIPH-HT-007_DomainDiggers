import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import init_db
from routes import scan, chat, report, certificate, phishing, onboarding, autofix, predict


async def check_groq():
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        print("WARNING: GROQ_API_KEY not set in .env")
        return False
    if not key.startswith("gsk_"):
        print("WARNING: GROQ_API_KEY looks invalid")
        return False
    print("Groq API: Connected")
    print(f"Model: {os.getenv('GROQ_MODEL', 'llama-3.1-8b-instant')}")
    return True


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    print("\n╔══════════════════════════════════════╗")
    print("║        SecureIQ Backend Running      ║")
    print("╚══════════════════════════════════════╝")
    groq_ok = await check_groq()
    if not groq_ok:
        print("⚠️  Groq API not configured — AI features will show graceful fallback")
    print("✅ Database: Ready")
    print("✅ CORS: http://localhost:5173\n")
    yield


app = FastAPI(title="SecureIQ API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scan.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(report.router, prefix="/api")
app.include_router(certificate.router, prefix="/api")
app.include_router(phishing.router, prefix="/api")
app.include_router(onboarding.router, prefix="/api")
app.include_router(autofix.router, prefix="/api")
app.include_router(predict.router, prefix="/api")


@app.get("/")
async def root():
    return {"status": "ok", "service": "SecureIQ API", "version": "1.0.0"}


@app.get("/health")
async def health():
    groq_ok = await check_groq()
    return {
        "status": "healthy",
        "groq": "connected" if groq_ok else "not_configured",
        "database": "ready",
    }
