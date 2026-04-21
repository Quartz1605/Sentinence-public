from datetime import datetime

from pydantic import BaseModel


class UserOut(BaseModel):
    id: str
    email: str
    name: str | None = None
    picture: str | None = None
    created_at: datetime
    last_login: datetime