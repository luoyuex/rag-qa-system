from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, Field


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    knowledge_base_id: str
    filename: str
    title: Optional[str] = None
    content_type: Optional[str] = None
    file_extension: Optional[str] = None
    mime_type: Optional[str] = None
    file_size: Optional[int] = None
    parser_name: Optional[str] = None
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
    # 对话模型
    chat_provider: str  # "local" | "online"
    local_model: str
    online_base_url: str
    online_model: str
    has_online_api_key: bool
    # Embedding 模型
    embedding_provider: str  # "local" | "online"
    embedding_model: str
    embedding_online_base_url: str
    has_embedding_online_api_key: bool


class ModelSettingsUpdate(BaseModel):
    # 对话模型
    chat_provider: Optional[str] = None
    local_model: Optional[str] = None
    online_base_url: Optional[str] = None
    online_api_key: Optional[str] = None  # 留空则保留原有 key 不变
    online_model: Optional[str] = None
    # Embedding 模型
    embedding_provider: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_online_base_url: Optional[str] = None
    embedding_online_api_key: Optional[str] = None


class ChatSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    agent_id: str
    title: Optional[str] = None
    created_at: datetime


class ChatMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    created_at: datetime


class ChatMessageIn(BaseModel):
    content: str


class ChatSessionIn(BaseModel):
    agent_id: str


class KnowledgeBaseIn(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True


class KnowledgeBaseOut(KnowledgeBaseIn):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime


class AgentIn(BaseModel):
    name: str
    description: Optional[str] = None
    avatar: Optional[str] = None
    system_prompt: str
    knowledge_base_id: str
    is_active: bool = True


class AgentOut(AgentIn):
    model_config = ConfigDict(from_attributes=True)
    id: str
    created_at: datetime
    updated_at: datetime


class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    display_name: Optional[str] = None
    role: str
    department_id: Optional[str] = None
    is_active: bool
    created_at: datetime


class UserCreateIn(BaseModel):
    username: str
    password: str
    display_name: Optional[str] = None
    role: str = "user"
    department_id: Optional[str] = None


class UserUpdateIn(BaseModel):
    password: Optional[str] = None  # 留空则不修改
    display_name: Optional[str] = None
    role: Optional[str] = None
    department_id: Optional[str] = None
    is_active: Optional[bool] = None


class DepartmentIn(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    agent_ids: List[str] = Field(default_factory=list)


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: Optional[str] = None
    is_active: bool
    agent_ids: List[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
