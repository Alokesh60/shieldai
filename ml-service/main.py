from fastapi import FastAPI
from routes.currency import router as currency_router
from routes.scam import router as scam_router

app = FastAPI(
    title="ShieldAI ML Service",
    description="Computer Vision and NLP ML models for ShieldAI",
    version="1.0.0"
)

app.include_router(currency_router, prefix="/api/v1/currency", tags=["Currency"])
app.include_router(scam_router, prefix="/api/v1/scam", tags=["Scam"])

@app.get("/health")
def health():
    return {
        "mlService": "ok",
        "models": {
            "currencyModel": "mock",
            "scamClassifier": "mock"
        }
    }