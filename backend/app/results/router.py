import logging

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db import get_database
from app.middlewares.auth_context import get_authenticated_user_id
from app.results.schemas import ResultsAnalysisResponse
from app.results.service import get_user_results_analysis


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/results", tags=["results"])


@router.get("/analysis", response_model=ResultsAnalysisResponse)
async def get_results_analysis_route(
    db: AsyncIOMotorDatabase = Depends(get_database),
    user_id: str = Depends(get_authenticated_user_id),
):
    logger.info("GET /results/analysis called", extra={"user_id": user_id})
    return await get_user_results_analysis(db, user_id, force_refresh=False)


@router.post("/analysis/refresh", response_model=ResultsAnalysisResponse)
async def refresh_results_analysis_route(
    db: AsyncIOMotorDatabase = Depends(get_database),
    user_id: str = Depends(get_authenticated_user_id),
):
    logger.info("POST /results/analysis/refresh called", extra={"user_id": user_id})
    return await get_user_results_analysis(db, user_id, force_refresh=True)
