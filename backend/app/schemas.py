from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    title: Optional[str] = None
    status: str
    chunk_count: int
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SettingsOut(BaseModel):
    context_rounds: int


class SettingsUpdate(BaseModel):
    context_rounds: int


class ModelSettingsOut(BaseModel):
    provider: str  # "local" | "online"
    local_model: str
    online_base_url: str
    online_model: str
    has_online_api_key: bool


class ModelSettingsUpdate(BaseModel):
    provider: str
    local_model: Optional[str] = None
    online_base_url: Optional[str] = None
    online_api_key: Optional[str] = None  # 留空则保留原有 key 不变
    online_model: Optional[str] = None


class ChatSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    created_at: datetime


class ChatMessageIn(BaseModel):
    content: str
