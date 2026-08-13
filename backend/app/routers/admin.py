from pathlib import Path
from typing import List
import uuid

from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import config
from app.auth import require_role
from app.db import get_db, SessionLocal
from app.models import Agent, ChatSession, Document, KnowledgeBase, Setting
from app.schemas import (
    DocumentOut,
    SettingsOut,
    SettingsUpdate,
    ModelSettingsOut,
    ModelSettingsUpdate,
    AgentIn,
    AgentOut,
    KnowledgeBaseIn,
    KnowledgeBaseOut,
)
from app.services import document_service
from app.services.ingestion import supported_extensions

router = APIRouter(
    prefix="/api/admin",
    tags=["admin"],
    dependencies=[Depends(require_role("admin"))],
)

AVATAR_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_AVATAR_SIZE = 2 * 1024 * 1024


@router.post("/agent-avatar")
async def upload_agent_avatar(request: Request, file: UploadFile = File(...)):
    extension = AVATAR_CONTENT_TYPES.get(file.content_type or "")
    if extension is None:
        raise HTTPException(400, "头像仅支持 JPG、PNG、WebP 或 GIF")
    content = await file.read(MAX_AVATAR_SIZE + 1)
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(400, "头像大小不能超过 2MB")
    filename = f"{uuid.uuid4().hex}{extension}"
    avatar_dir = Path(config.AGENT_AVATAR_DIR)
    avatar_dir.mkdir(parents=True, exist_ok=True)
    (avatar_dir / filename).write_bytes(content)
    return {"url": f"{str(request.base_url).rstrip('/')}/agent-avatars/{filename}"}


# ============================================================
# 上传文档
# ============================================================

@router.post("/documents", response_model=DocumentOut)
async def upload_document(
    background_tasks: BackgroundTasks,
    knowledge_base_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):

    filename = Path(file.filename or "").name
    extension = Path(filename).suffix.lower()
    if extension not in supported_extensions():
        allowed = ", ".join(sorted(supported_extensions()))
        raise HTTPException(400, f"不支持的文件类型。当前支持：{allowed}")

    content = await file.read(config.MAX_DOCUMENT_SIZE + 1)
    if len(content) > config.MAX_DOCUMENT_SIZE:
        raise HTTPException(400, "文档大小不能超过 25MB")
    if not content:
        raise HTTPException(400, "不能上传空文件")

    knowledge_base = db.get(KnowledgeBase, knowledge_base_id)
    if knowledge_base is None or not knowledge_base.is_active:
        raise HTTPException(404, "知识库不存在或已停用")

    document = document_service.create_document_record(
        db, filename, knowledge_base_id, file.content_type, len(content)
    )

    saved_path = document_service.save_upload(
        content,
        f"{document.id}_{filename}",
    )

    background_tasks.add_task(
        document_service.process_document,
        document.id,
        saved_path,
        SessionLocal,
    )

    return document


# ============================================================
# 文档列表
# ============================================================

@router.get("/documents", response_model=List[DocumentOut])
def list_documents(knowledge_base_id: str = None, db: Session = Depends(get_db)):

    query = db.query(Document)
    if knowledge_base_id:
        query = query.filter(Document.knowledge_base_id == knowledge_base_id)
    return query.order_by(Document.created_at.desc()).all()


@router.get("/knowledge-bases", response_model=List[KnowledgeBaseOut])
def list_knowledge_bases(db: Session = Depends(get_db)):
    return db.query(KnowledgeBase).order_by(KnowledgeBase.created_at).all()


@router.post("/knowledge-bases", response_model=KnowledgeBaseOut)
def create_knowledge_base(payload: KnowledgeBaseIn, db: Session = Depends(get_db)):
    if db.query(KnowledgeBase).filter(KnowledgeBase.name == payload.name.strip()).first():
        raise HTTPException(400, "知识库名称已存在")
    item = KnowledgeBase(**payload.model_dump())
    item.name = item.name.strip()
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/knowledge-bases/{knowledge_base_id}", response_model=KnowledgeBaseOut)
def update_knowledge_base(knowledge_base_id: str, payload: KnowledgeBaseIn, db: Session = Depends(get_db)):
    item = db.get(KnowledgeBase, knowledge_base_id)
    if item is None:
        raise HTTPException(404, "知识库不存在")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/knowledge-bases/{knowledge_base_id}")
def delete_knowledge_base(knowledge_base_id: str, db: Session = Depends(get_db)):
    item = db.get(KnowledgeBase, knowledge_base_id)
    if item is None:
        raise HTTPException(404, "知识库不存在")
    if item.documents or item.agents:
        raise HTTPException(409, "请先删除该知识库下的文档和 Agent")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.get("/agents", response_model=List[AgentOut])
def list_admin_agents(db: Session = Depends(get_db)):
    return db.query(Agent).order_by(Agent.created_at).all()


@router.post("/agents", response_model=AgentOut)
def create_agent(payload: AgentIn, db: Session = Depends(get_db)):
    if db.get(KnowledgeBase, payload.knowledge_base_id) is None:
        raise HTTPException(404, "知识库不存在")
    if db.query(Agent).filter(Agent.name == payload.name.strip()).first():
        raise HTTPException(400, "Agent 名称已存在")
    item = Agent(**payload.model_dump())
    item.name = item.name.strip()
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/agents/{agent_id}", response_model=AgentOut)
def update_agent(agent_id: str, payload: AgentIn, db: Session = Depends(get_db)):
    item = db.get(Agent, agent_id)
    if item is None:
        raise HTTPException(404, "Agent 不存在")
    if db.get(KnowledgeBase, payload.knowledge_base_id) is None:
        raise HTTPException(404, "知识库不存在")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/agents/{agent_id}")
def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    item = db.get(Agent, agent_id)
    if item is None:
        raise HTTPException(404, "Agent 不存在")
    if db.query(ChatSession).filter(ChatSession.agent_id == agent_id).first():
        raise HTTPException(409, "该 Agent 已有历史会话，请改为停用")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ============================================================
# 删除文档
# ============================================================

@router.delete("/documents/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db)):

    document = db.get(Document, document_id)

    if document is None:
        raise HTTPException(404, "文档不存在")

    document_service.delete_document(db, document)

    return {"ok": True}


# ============================================================
# 设置：对话上下文轮数
# ============================================================

@router.get("/settings", response_model=SettingsOut)
def get_settings(db: Session = Depends(get_db)):

    setting = db.query(Setting).filter(Setting.key == "context_rounds").first()

    rounds = int(setting.value) if setting else config.DEFAULT_CONTEXT_ROUNDS

    return SettingsOut(context_rounds=rounds)


@router.put("/settings", response_model=SettingsOut)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):

    setting = db.query(Setting).filter(Setting.key == "context_rounds").first()

    if setting is None:
        setting = Setting(key="context_rounds", value=str(payload.context_rounds))
        db.add(setting)
    else:
        setting.value = str(payload.context_rounds)

    db.commit()

    return SettingsOut(context_rounds=payload.context_rounds)


# ============================================================
# 设置：对话模型（本地 Ollama / 线上 OpenAI 兼容接口）
# ============================================================

MODEL_SETTING_KEYS = {
    # 对话模型
    "chat_provider": "chat_provider",
    "local_model": "chat_local_model",
    "online_base_url": "chat_online_base_url",
    "online_api_key": "chat_online_api_key",
    "online_model": "chat_online_model",
    # Embedding 模型
    "embedding_provider": "embedding_provider",
    "embedding_model": "embedding_model",
    "embedding_online_base_url": "embedding_online_base_url",
    "embedding_online_api_key": "embedding_online_api_key",
}


def _get_setting_value(db: Session, key: str, default: str) -> str:

    setting = db.query(Setting).filter(Setting.key == key).first()

    return setting.value if setting else default


def _set_setting_value(db: Session, key: str, value: str):

    setting = db.query(Setting).filter(Setting.key == key).first()

    if setting is None:
        db.add(Setting(key=key, value=value))
    else:
        setting.value = value


@router.get("/model-settings", response_model=ModelSettingsOut)
def get_model_settings(db: Session = Depends(get_db)):

    # 对话模型
    chat_provider = _get_setting_value(db, MODEL_SETTING_KEYS["chat_provider"], config.DEFAULT_CHAT_PROVIDER)
    local_model = _get_setting_value(db, MODEL_SETTING_KEYS["local_model"], config.CHAT_MODEL)
    online_base_url = _get_setting_value(db, MODEL_SETTING_KEYS["online_base_url"], config.DEFAULT_ONLINE_BASE_URL)
    online_api_key = _get_setting_value(db, MODEL_SETTING_KEYS["online_api_key"], config.DEFAULT_ONLINE_API_KEY)
    online_model = _get_setting_value(db, MODEL_SETTING_KEYS["online_model"], config.DEFAULT_ONLINE_MODEL)

    # Embedding 模型
    embedding_provider = _get_setting_value(db, MODEL_SETTING_KEYS["embedding_provider"], "local")
    embedding_model = _get_setting_value(db, MODEL_SETTING_KEYS["embedding_model"], config.EMBEDDING_MODEL)
    embedding_online_base_url = _get_setting_value(db, MODEL_SETTING_KEYS["embedding_online_base_url"], config.DEFAULT_ONLINE_BASE_URL)
    embedding_online_api_key = _get_setting_value(db, MODEL_SETTING_KEYS["embedding_online_api_key"], config.DEFAULT_ONLINE_API_KEY)

    return ModelSettingsOut(
        chat_provider=chat_provider,
        local_model=local_model,
        online_base_url=online_base_url,
        online_model=online_model,
        has_online_api_key=bool(online_api_key),
        embedding_provider=embedding_provider,
        embedding_model=embedding_model,
        embedding_online_base_url=embedding_online_base_url,
        has_embedding_online_api_key=bool(embedding_online_api_key),
    )


@router.put("/model-settings", response_model=ModelSettingsOut)
def update_model_settings(payload: ModelSettingsUpdate, db: Session = Depends(get_db)):

    # 对话模型
    if payload.chat_provider is not None:
        if payload.chat_provider not in ("local", "online"):
            raise HTTPException(400, "chat_provider 只能是 local 或 online")
        _set_setting_value(db, MODEL_SETTING_KEYS["chat_provider"], payload.chat_provider)

    if payload.local_model is not None:
        _set_setting_value(db, MODEL_SETTING_KEYS["local_model"], payload.local_model)

    if payload.online_base_url is not None:
        _set_setting_value(db, MODEL_SETTING_KEYS["online_base_url"], payload.online_base_url)

    if payload.online_model is not None:
        _set_setting_value(db, MODEL_SETTING_KEYS["online_model"], payload.online_model)

    if payload.online_api_key:
        _set_setting_value(db, MODEL_SETTING_KEYS["online_api_key"], payload.online_api_key)

    # Embedding 模型
    if payload.embedding_provider is not None:
        if payload.embedding_provider not in ("local", "online"):
            raise HTTPException(400, "embedding_provider 只能是 local 或 online")
        _set_setting_value(db, MODEL_SETTING_KEYS["embedding_provider"], payload.embedding_provider)

    if payload.embedding_model is not None:
        _set_setting_value(db, MODEL_SETTING_KEYS["embedding_model"], payload.embedding_model)

    if payload.embedding_online_base_url is not None:
        _set_setting_value(db, MODEL_SETTING_KEYS["embedding_online_base_url"], payload.embedding_online_base_url)

    if payload.embedding_online_api_key:
        _set_setting_value(db, MODEL_SETTING_KEYS["embedding_online_api_key"], payload.embedding_online_api_key)

    db.commit()

    return get_model_settings(db)
