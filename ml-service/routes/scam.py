from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
def health():
    return {"scamClassifier": "mock — coming soon"}