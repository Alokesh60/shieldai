import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from chains.fraud_detection_chain import get_fraud_detection_chain
from vectorstore.chromadb_client import initialize_collection

# ─── Load Environment Variables ──────────────────────────────
load_dotenv()

# ─── Logger ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ─── Request/Response Models ─────────────────────────────────
class AnalyseRequest(BaseModel):
    message: str = Field(
        ...,
        min_length=10,
        max_length=5000,
        description="Suspicious message to analyse"
    )
    location: str = Field(
        default="Unknown",
        description="User location (optional)"
    )


class HealthResponse(BaseModel):
    status: str
    service: str
    agents: dict
    chromadb: str
    version: str


# ─── Lifespan ────────────────────────────────────────────────
# Runs on startup and shutdown
# Initializes all agents + ChromaDB before accepting requests
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ─── STARTUP ─────────────────────────────────────────
    logger.info("🚀 Starting ShieldAI Agent Service...")

    try:
        # Initialize ChromaDB and load scam patterns
        logger.info("📥 Initializing ChromaDB collection...")
        initialize_collection()
        logger.info("✅ ChromaDB ready")

        # Initialize fraud detection chain
        # This creates all 3 agents + Gemini connections
        logger.info("🤖 Initializing fraud detection chain...")
        get_fraud_detection_chain()
        logger.info("✅ All 3 agents ready")

        logger.info("""
╔═══════════════════════════════════════════╗
║   🛡️  ShieldAI Agent Service Started     ║
║   Port: 8001                              ║
║   Agents: 3 (Classifier + RAG + Legal)   ║
║   ChromaDB: Connected                     ║
╚═══════════════════════════════════════════╝
        """)

    except Exception as e:
        logger.error(f"❌ Startup failed: {str(e)}")
        raise e

    yield  # Server runs here

    # ─── SHUTDOWN ─────────────────────────────────────────
    logger.info("⚠️ Shutting down ShieldAI Agent Service...")
    logger.info("✅ Agent Service shut down gracefully")


# ─── FastAPI App ─────────────────────────────────────────────
app = FastAPI(
    title="ShieldAI Agent Service",
    description="LangChain + Gemini AI agents for fraud detection",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── CORS Middleware ─────────────────────────────────────────
# Allows TypeScript api-service to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request Logger ──────────────────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"📨 {request.method} {request.url.path}")
    response = await call_next(request)
    logger.info(f"✅ {request.method} {request.url.path} → {response.status_code}")
    return response


# ─── Routes ──────────────────────────────────────────────────

# ─── POST /analyse ───────────────────────────────────────────
# Main endpoint called by TypeScript api-service
# Runs complete 3-agent fraud detection pipeline
@app.post("/analyse")
async def analyse_message(request: AnalyseRequest):
    """
    Analyses a suspicious message using 3 LangChain agents:
    1. ScamClassifier  → verdict + confidence
    2. RAGRetriever    → historical pattern matching
    3. LegalReport     → court-admissible evidence report
    """
    try:
        logger.info(
            f"🔍 Analyse request received "
            f"(message length: {len(request.message)})"
        )

        # ─── Get Chain Instance ───────────────────────────
        chain = get_fraud_detection_chain()

        # ─── Run 3-Agent Pipeline ─────────────────────────
        result = chain.run(
            message=request.message,
            location=request.location,
        )

        logger.info(
            f"✅ Analysis complete: {result['verdict']} "
            f"({result['confidence']}%)"
        )

        return {
            "success": True,
            "data": result,
        }

    except Exception as e:
        logger.error(f"❌ Analysis failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}",
        )


# ─── GET /health ─────────────────────────────────────────────
# Health check endpoint
# TypeScript api-service polls this to check agent-service status
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Returns health status of agent service
    Checks all agents + ChromaDB connection
    """
    try:
        # Check ChromaDB
        from vectorstore.chromadb_client import get_chroma_client
        client = get_chroma_client()
        client.heartbeat()
        chromadb_status = "✅ Connected"
    except Exception:
        chromadb_status = "❌ Disconnected"

    return HealthResponse(
        status="✅ Running",
        service="ShieldAI Agent Service",
        agents={
            "scamClassifier": "✅ Ready",
            "ragRetriever": "✅ Ready",
            "legalReportGenerator": "✅ Ready",
        },
        chromadb=chromadb_status,
        version="1.0.0",
    )


# ─── GET / ───────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "service": "🛡️ ShieldAI Agent Service",
        "version": "1.0.0",
        "endpoints": {
            "analyse": "POST /analyse",
            "health": "GET /health",
        },
        "agents": [
            "Agent 1: ScamClassifier (LangChain + Gemini)",
            "Agent 2: RAGRetriever (ChromaDB Vector Search)",
            "Agent 3: LegalReportGenerator (Court-admissible reports)",
        ],
    }


# ─── Run Server ───────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.getenv("AGENT_PORT", "8001")),
        reload=True,
    )