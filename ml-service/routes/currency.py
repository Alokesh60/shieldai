from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List
import random

router = APIRouter()

class CurrencyResponse(BaseModel):
    verdict: str
    confidence: float
    issuesFound: List[str]

@router.post("/detect", response_model=CurrencyResponse)
async def detect_currency(image: UploadFile = File(...)):
    # Validate file type
    if image.content_type not in ["image/jpeg", "image/png", "image/jpg"]:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG images are accepted")

    # Read and discard image (mock — no real model yet)
    await image.read()

    # Mock response — hardcoded FAKE verdict for demo
    return CurrencyResponse(
        verdict="FAKE",
        confidence=94.7,
        issuesFound=[
            "Security thread missing or misaligned",
            "Serial number pattern invalid",
            "Watermark not detected under UV simulation",
            "Microprint text illegible on left margin"
        ]
    )