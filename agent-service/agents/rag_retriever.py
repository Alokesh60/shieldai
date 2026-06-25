import logging
from typing import List, Dict, Any
from vectorstore.chromadb_client import search_similar_patterns

# ─── Logger ──────────────────────────────────────────────────
logger = logging.getLogger(__name__)

# ─── Similarity Threshold ────────────────────────────────────
# Only return patterns with similarity above this score
# Below 30% similarity = not relevant enough
SIMILARITY_THRESHOLD = 30.0


# ─── RAG Retriever Agent ─────────────────────────────────────
class RAGRetrieverAgent:
    """
    Agent 2 — Retrieves similar historical scam patterns
    from ChromaDB vector database

    Takes scam_type from Agent 1 and finds matching
    historical cases to support legal evidence generation

    This is the RAG (Retrieval Augmented Generation) step:
    Retrieval  → search ChromaDB for similar patterns
    Augmented  → add retrieved patterns to context
    Generation → Agent 3 generates report with this context
    """

    def __init__(self):
        logger.info("✅ RAGRetrieverAgent initialized")

    def retrieve(
        self,
        message: str,
        scam_type: str,
        n_results: int = 3,
    ) -> Dict[str, Any]:
        """
        Retrieves similar scam patterns from ChromaDB

        Args:
            message: Original user message
            scam_type: Scam type from Agent 1
            n_results: Number of patterns to retrieve

        Returns:
            Dictionary with matched patterns + legal references
        """
        logger.info(
            f"🔍 Retrieving patterns for scam type: {scam_type}"
        )

        try:
            # ─── Build Search Query ───────────────────────
            # Combine message + scam type for better search
            # More context = better vector match
            search_query = f"{scam_type} {message}"

            # ─── Search ChromaDB ──────────────────────────
            raw_matches = search_similar_patterns(
                query=search_query,
                n_results=n_results,
            )

            # ─── Filter by Similarity Score ───────────────
            # Remove patterns that are not similar enough
            filtered_matches = [
                match for match in raw_matches
                if match["similarity_score"] >= SIMILARITY_THRESHOLD
            ]

            if not filtered_matches:
                logger.warning(
                    f"⚠️ No patterns found above threshold for: {scam_type}"
                )
                return self._get_fallback_response(scam_type)

            # ─── Extract Legal References ─────────────────
            # Collect all unique IPC sections from matches
            legal_references = list(set([
                match["legal_reference"]
                for match in filtered_matches
            ]))

            # ─── Extract Recommended Actions ─────────────
            recommended_actions = list(set([
                match["recommended_action"]
                for match in filtered_matches
            ]))

            # ─── Extract Historical Precedents ────────────
            # Format as readable strings for evidence report
            historical_precedents = [
                f"{match['title']} (Similarity: {match['similarity_score']}%)"
                for match in filtered_matches
            ]

            # ─── Get Highest Severity ─────────────────────
            severity_order = {
                "CRITICAL": 3,
                "HIGH": 2,
                "MEDIUM": 1,
                "LOW": 0
            }
            highest_severity = max(
                filtered_matches,
                key=lambda x: severity_order.get(x["severity"], 0)
            )["severity"]

            result = {
                "matched_patterns": filtered_matches,
                "legal_references": legal_references,
                "recommended_actions": recommended_actions,
                "historical_precedents": historical_precedents,
                "highest_severity": highest_severity,
                "total_matches": len(filtered_matches),
            }

            logger.info(
                f"✅ Retrieved {len(filtered_matches)} patterns "
                f"(severity: {highest_severity})"
            )
            return result

        except Exception as e:
            logger.error(f"❌ RAG retrieval failed: {str(e)}")
            return self._get_fallback_response(scam_type)

    def _get_fallback_response(
        self, scam_type: str
    ) -> Dict[str, Any]:
        """
        Returns fallback response when no patterns found
        Uses generic Indian fraud legal references
        """
        return {
            "matched_patterns": [],
            "legal_references": [
                "IPC Section 420 (Cheating)",
                "IT Act Section 66C (Identity theft)",
                "IT Act Section 66D (Cheating by impersonation)",
            ],
            "recommended_actions": [
                "Report to cybercrime.gov.in",
                "Call helpline 1930",
                "File complaint at nearest police station",
            ],
            "historical_precedents": [
                f"Generic {scam_type} fraud pattern"
            ],
            "highest_severity": "HIGH",
            "total_matches": 0,
        }

    def get_context_for_agent3(
        self,
        retrieval_result: Dict[str, Any],
    ) -> str:
        """
        Formats retrieval result as readable context
        for Agent 3 (Legal Evidence Generator)

        Agent 3 needs this as text to include in its prompt
        """
        if not retrieval_result["matched_patterns"]:
            return "No specific historical patterns found. Using generic fraud references."

        context_parts = []

        context_parts.append(
            f"Found {retrieval_result['total_matches']} matching scam patterns:"
        )

        for i, pattern in enumerate(
            retrieval_result["matched_patterns"], 1
        ):
            context_parts.append(f"""
Pattern {i}: {pattern['title']}
- Similarity: {pattern['similarity_score']}%
- Severity: {pattern['severity']}
- Legal Reference: {pattern['legal_reference']}
- Recommended Action: {pattern['recommended_action']}
            """.strip())

        context_parts.append(
            f"\nApplicable IPC Sections: "
            f"{', '.join(retrieval_result['legal_references'])}"
        )

        context_parts.append(
            f"\nRecommended Actions: "
            f"{'; '.join(retrieval_result['recommended_actions'])}"
        )

        return "\n\n".join(context_parts)


# ─── Singleton Instance ───────────────────────────────────────
_retriever_instance = None


def get_rag_retriever() -> RAGRetrieverAgent:
    """Returns singleton instance of RAGRetrieverAgent"""
    global _retriever_instance
    if _retriever_instance is None:
        _retriever_instance = RAGRetrieverAgent()
    return _retriever_instance