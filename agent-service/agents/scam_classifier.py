import os
import json
import logging
from typing import Dict, Any
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain.prompts import PromptTemplate
from langchain.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# ─── Load Environment Variables ──────────────────────────────
load_dotenv()

# ─── Logger ──────────────────────────────────────────────────
logger = logging.getLogger(__name__)

# ─── Output Schema ───────────────────────────────────────────
# Pydantic model defines exactly what Gemini must return
# Forces structured JSON output — no free text
class ScamClassificationOutput(BaseModel):
    verdict: str = Field(
        description="SCAM, SUSPICIOUS, or SAFE"
    )
    confidence: float = Field(
        description="Confidence score 0-100"
    )
    scam_type: str = Field(
        description="Type of scam: DIGITAL_ARREST, KYC_EXPIRY, LOTTERY, UPI_FRAUD, INVESTMENT, ROMANCE, or UNKNOWN"
    )
    reasoning: str = Field(
        description="Clear explanation of why this is a scam in simple Hindi-English (Hinglish) language"
    )
    red_flags_found: list = Field(
        description="List of specific red flags found in the message"
    )
    is_urgent: bool = Field(
        description="True if scammer is creating artificial urgency"
    )


# ─── Scam Classifier Agent ───────────────────────────────────
class ScamClassifierAgent:
    """
    Agent 1 — Analyses user message and classifies it
    as SCAM, SUSPICIOUS, or SAFE using Gemini AI

    This is the first agent in the 3-agent pipeline
    """

    def __init__(self):
        # ─── Initialize Gemini ────────────────────────────
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-pro",
            google_api_key=os.getenv("GEMINI_API_KEY"),
            temperature=0.1,
            # Low temperature = more consistent outputs
            # We want same message to always get same verdict
        )

        # ─── Output Parser ────────────────────────────────
        # Forces Gemini to return structured JSON
        # Automatically validates output against schema
        self.parser = PydanticOutputParser(
            pydantic_object=ScamClassificationOutput
        )

        # ─── Prompt Template ─────────────────────────────
        self.prompt = PromptTemplate(
            template="""
You are ShieldAI — India's most advanced fraud detection system.
Your job is to analyse messages and determine if they are scams.

You have deep knowledge of Indian scam patterns including:
- Digital Arrest Scams (fake CBI/ED/Customs officers)
- KYC Expiry Scams (fake bank employees)
- Lottery Scams (fake prize notifications)
- UPI Fraud (fake payment requests)
- Investment Scams (fake trading platforms)
- Romance Scams (honey trap)
- Tech Support Scams (fake Microsoft/Google)

IMPORTANT RULES:
1. Government officers (CBI, ED, Police) NEVER contact via WhatsApp/Telegram
2. You NEVER enter UPI PIN to RECEIVE money — only to SEND
3. Real banks NEVER ask for OTP over phone or message
4. Guaranteed high returns on investment is ALWAYS a scam
5. Real lotteries NEVER ask for upfront fees

MESSAGE TO ANALYSE:
{message}

LOCATION (if provided): {location}

Analyse this message carefully and respond with:
{format_instructions}

Be direct and clear. Explain in simple language that any Indian citizen can understand.
If it's a scam, be firm and clear. Lives and savings are at stake.
""",
            input_variables=["message", "location"],
            partial_variables={
                "format_instructions": self.parser.get_format_instructions()
            },
        )

        # ─── Chain: Prompt → Gemini → Parser ─────────────
        self.chain = self.prompt | self.llm | self.parser

        logger.info("✅ ScamClassifierAgent initialized")

    def classify(
        self,
        message: str,
        location: str = "Unknown"
    ) -> Dict[str, Any]:
        """
        Classifies a message as SCAM, SUSPICIOUS, or SAFE

        Args:
            message: The suspicious message to analyse
            location: User's location (optional)

        Returns:
            Dictionary with verdict, confidence, scam_type,
            reasoning, red_flags_found, is_urgent
        """
        logger.info(f"🔍 Classifying message (length: {len(message)})")

        try:
            # ─── Run Chain ────────────────────────────────
            result = self.chain.invoke({
                "message": message,
                "location": location,
            })

            output = {
                "verdict": result.verdict.upper(),
                "confidence": min(max(result.confidence, 0), 100),
                "scam_type": result.scam_type.upper(),
                "reasoning": result.reasoning,
                "red_flags_found": result.red_flags_found,
                "is_urgent": result.is_urgent,
            }

            logger.info(
                f"✅ Classification complete: {output['verdict']} "
                f"({output['confidence']}% confidence)"
            )
            return output

        except Exception as e:
            logger.error(f"❌ Classification failed: {str(e)}")
            # ─── Fallback Response ────────────────────────
            # If Gemini fails, return safe default
            return {
                "verdict": "SUSPICIOUS",
                "confidence": 50,
                "scam_type": "UNKNOWN",
                "reasoning": "Unable to analyse message. Please be cautious and verify before responding.",
                "red_flags_found": [],
                "is_urgent": False,
            }


# ─── Singleton Instance ───────────────────────────────────────
# Create once, reuse everywhere
# Avoids reinitializing Gemini model on every request
_classifier_instance = None


def get_scam_classifier() -> ScamClassifierAgent:
    """Returns singleton instance of ScamClassifierAgent"""
    global _classifier_instance
    if _classifier_instance is None:
        _classifier_instance = ScamClassifierAgent()
    return _classifier_instance