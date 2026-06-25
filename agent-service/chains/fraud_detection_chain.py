import logging
from typing import Dict, Any
from agents.scam_classifier import get_scam_classifier
from agents.rag_retriever import get_rag_retriever
from agents.legal_report import get_legal_report_generator

# ─── Logger ──────────────────────────────────────────────────
logger = logging.getLogger(__name__)


# ─── Fraud Detection Chain ────────────────────────────────────
class FraudDetectionChain:
    """
    Orchestrates all 3 agents in sequence:

    Agent 1 (ScamClassifier)
         ↓
    Agent 2 (RAGRetriever)
         ↓
    Agent 3 (LegalReportGenerator)
         ↓
    Final Result

    This is the brain of ShieldAI agent-service.
    TypeScript api-service calls this chain for every
    scam detection request.
    """

    def __init__(self):
        # ─── Initialize All 3 Agents ──────────────────────
        # Singleton instances — created once, reused always
        self.classifier = get_scam_classifier()
        self.retriever = get_rag_retriever()
        self.report_generator = get_legal_report_generator()

        logger.info("✅ FraudDetectionChain initialized with 3 agents")

    def run(
        self,
        message: str,
        location: str = "Unknown",
    ) -> Dict[str, Any]:
        """
        Runs the complete 3-agent fraud detection pipeline

        Args:
            message: Suspicious message from user
            location: User location (optional)

        Returns:
            Complete fraud detection result with legal evidence report
        """
        logger.info("🚀 Starting fraud detection chain...")

        # ════════════════════════════════════════════════════
        # AGENT 1 — Scam Classification
        # ════════════════════════════════════════════════════
        logger.info("🔍 Agent 1: Classifying scam...")

        classification = self.classifier.classify(
            message=message,
            location=location,
        )

        logger.info(
            f"✅ Agent 1 complete: {classification['verdict']} "
            f"({classification['confidence']}%)"
        )

        # ─── Early Exit for SAFE messages ─────────────────
        # No need to run Agent 2 + 3 if message is safe
        # Saves time + API calls
        if (
            classification["verdict"] == "SAFE"
            and classification["confidence"] >= 85
        ):
            logger.info("✅ Message is SAFE — skipping Agent 2 + 3")
            return {
                "verdict": "SAFE",
                "confidence": classification["confidence"],
                "scamType": "NONE",
                "reasoning": classification["reasoning"],
                "evidenceReport": None,
                "redFlagsFound": [],
                "isUrgent": False,
            }

        # ════════════════════════════════════════════════════
        # AGENT 2 — RAG Pattern Retrieval
        # ════════════════════════════════════════════════════
        logger.info("🔍 Agent 2: Retrieving similar patterns...")

        retrieval_result = self.retriever.retrieve(
            message=message,
            scam_type=classification["scam_type"],
            n_results=3,
        )

        # Format retrieval result as text for Agent 3
        rag_context = self.retriever.get_context_for_agent3(
            retrieval_result
        )

        logger.info(
            f"✅ Agent 2 complete: {retrieval_result['total_matches']} "
            f"patterns found"
        )

        # ════════════════════════════════════════════════════
        # AGENT 3 — Legal Evidence Report Generation
        # ════════════════════════════════════════════════════
        logger.info("📄 Agent 3: Generating legal evidence report...")

        evidence_report = self.report_generator.generate(
            original_message=message,
            classification_result=classification,
            rag_context=rag_context,
        )

        logger.info(
            f"✅ Agent 3 complete: Report {evidence_report['reportId']}"
        )

        # ════════════════════════════════════════════════════
        # FINAL RESULT — Combined output of all 3 agents
        # ════════════════════════════════════════════════════
        final_result = {
            "verdict": classification["verdict"],
            "confidence": classification["confidence"],
            "scamType": classification["scam_type"],
            "reasoning": classification["reasoning"],
            "redFlagsFound": classification["red_flags_found"],
            "isUrgent": classification["is_urgent"],
            "evidenceReport": evidence_report,
            "ragMatches": retrieval_result["total_matches"],
            "severity": retrieval_result["highest_severity"],
        }

        logger.info(
            f"🎉 Fraud detection chain complete: "
            f"{final_result['verdict']} | "
            f"Severity: {final_result['severity']} | "
            f"Report: {evidence_report['reportId']}"
        )

        return final_result


# ─── Singleton Instance ───────────────────────────────────────
_chain_instance = None


def get_fraud_detection_chain() -> FraudDetectionChain:
    """Returns singleton instance of FraudDetectionChain"""
    global _chain_instance
    if _chain_instance is None:
        _chain_instance = FraudDetectionChain()
    return _chain_instance