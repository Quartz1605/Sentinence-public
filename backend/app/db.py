from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import MongoClient
from pymongo.database import Database
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URI")
DB_NAME = "airavat"


class MongoDB:
    client: AsyncIOMotorClient = None
    db: AsyncIOMotorDatabase | None = None
    sync_client: MongoClient | None = None
    sync_db: Database | None = None

mongodb = MongoDB()

async def connect_to_mongo():
    print("Connecting to MongoDB...")
    mongodb.client = AsyncIOMotorClient(MONGO_URL)
    mongodb.db = mongodb.client[DB_NAME]
    mongodb.sync_client = MongoClient(MONGO_URL)
    mongodb.sync_db = mongodb.sync_client[DB_NAME]

    
    try:
        await mongodb.client.admin.command("ping")
        print(" Connected to MongoDB successfully!")
    except Exception as e:
        print("MongoDB connection failed:", e)


async def close_mongo_connection():
    print("Closing MongoDB connection...")
    if mongodb.client:
        mongodb.client.close()
    if mongodb.sync_client:
        mongodb.sync_client.close()
        print("MongoDB connection closed.")


def get_database() -> AsyncIOMotorDatabase:
    if mongodb.db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database is not initialized",
        )
    return mongodb.db


def get_sync_database() -> Database:
    if mongodb.sync_db is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Sync database is not initialized",
        )
    return mongodb.sync_db