import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from dotenv import load_dotenv
import os
from app.db import connect_to_mongo, close_mongo_connection
from app.auth.config import auth_settings
from app.auth.router import router as auth_router
from app.video_analysis.router import router as video_router
from app.auth.service import ensure_user_indexes
from app.interviews.router import router as interviews_router
from app.interviews.service import ensure_interview_indexes
from app.resume_parser.router import router as resume_parser_router
from app.resume_parser.repository import ensure_resume_indexes
from app.db import mongodb
from app.middlewares.auth_context import attach_auth_context
from app.voice.websocket_handler import router as voice_router
from app.interview_agent.realtime_router import router as interview_agent_realtime_router
from app.meeting_room.router import router as meeting_router, team_fit_router
from app.meeting_room.realtime_router import router as meeting_room_realtime_router
from app.meeting_room.service import ensure_meeting_indexes
from app.group_interview.router import router as group_interview_router
from app.group_interview.service import ensure_group_interview_indexes
from app.results.router import router as results_router
from app.results.service import ensure_results_indexes

load_dotenv()

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app.log")),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI()
app.middleware("http")(attach_auth_context)

app.add_middleware(
    SessionMiddleware,
    secret_key=auth_settings.secret_key,
    same_site="lax",
    https_only=auth_settings.cookie_secure,
)

allowed_origins = [origin.strip() for origin in auth_settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(video_router)
app.include_router(interviews_router)
app.include_router(interview_agent_realtime_router)
app.include_router(resume_parser_router)
app.include_router(voice_router)
app.include_router(meeting_router)
app.include_router(team_fit_router)
app.include_router(meeting_room_realtime_router)
app.include_router(group_interview_router)
app.include_router(results_router)

@app.on_event("startup")
async def startup_event():
    logger.info("Application startup initiated")
    await connect_to_mongo()
    await ensure_user_indexes()
    if mongodb.db is not None:
        await ensure_interview_indexes(mongodb.db)
        await ensure_meeting_indexes(mongodb.db)
        await ensure_group_interview_indexes(mongodb.db)
        await ensure_results_indexes(mongodb.db)
    if mongodb.sync_db is not None:
        await ensure_resume_indexes(mongodb.sync_db)
    logger.info("Application startup completed")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Application shutdown initiated")
    await close_mongo_connection()
    logger.info("Application shutdown completed")

@app.get("/")
def read_root():
    return {"Hello": "World"}
