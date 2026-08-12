from typing import List

from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app import config
from app.db import get_db, SessionLocal
from app.models import Document, Setting
from app.schemas import (
    DocumentOut,
    SettingsOut,
    SettingsUpdate,
    ModelSettingsOut,
    ModelSettingsUpdate,
)
from app.services import document_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ============================================================
# 上传文档
# ============================================================

@router.post("/documents", response_model=DocumentOut)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):

    if not file.filename.endswith(".txt"):
        raise HTTPException(400, "目前只支持 .txt 文档")

    content = await file.read()

    document = document_service.create_document_record(db, file.filename)

    saved_path = document_service.save_upload(
        content,
        f"{document.id}_{file.filename}",
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
def list_documents(db: Session = Depends(get_db)):

    return (
        db.query(Document)
        .order_by(Document.created_at.desc())
        .all()
    )


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
    "provider": "chat_provider",
    "local_model": "chat_local_model",
    "online_base_url": "chat_online_base_url",
    "online_api_key": "chat_online_api_key",
    "online_model": "chat_online_model",
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

    provider = _get_setting_value(db, MODEL_SETTING_KEYS["provider"], config.DEFAULT_CHAT_PROVIDER)
    local_model = _get_setting_value(db, MODEL_SETTING_KEYS["local_model"], config.CHAT_MODEL)
    online_base_url = _get_setting_value(db, MODEL_SETTING_KEYS["online_base_url"], config.DEFAULT_ONLINE_BASE_URL)
    online_api_key = _get_setting_value(db, MODEL_SETTING_KEYS["online_api_key"], config.DEFAULT_ONLINE_API_KEY)
    online_model = _get_setting_value(db, MODEL_SETTING_KEYS["online_model"], config.DEFAULT_ONLINE_MODEL)

    return ModelSettingsOut(
        provider=provider,
        local_model=local_model,
        online_base_url=online_base_url,
        online_model=online_model,
        has_online_api_key=bool(online_api_key),
    )


@router.put("/model-settings", response_model=ModelSettingsOut)
def update_model_settings(payload: ModelSettingsUpdate, db: Session = Depends(get_db)):

    if payload.provider not in ("local", "online"):
        raise HTTPException(400, "provider 只能是 local 或 online")

    _set_setting_value(db, MODEL_SETTING_KEYS["provider"], payload.provider)

    if payload.local_model is not None:
        _set_setting_value(db, MODEL_SETTING_KEYS["local_model"], payload.local_model)

    if payload.online_base_url is not None:
        _set_setting_value(db, MODEL_SETTING_KEYS["online_base_url"], payload.online_base_url)

    if payload.online_model is not None:
        _set_setting_value(db, MODEL_SETTING_KEYS["online_model"], payload.online_model)

    # api_key 留空表示不修改，避免每次保存都要求重新输入
    if payload.online_api_key:
        _set_setting_value(db, MODEL_SETTING_KEYS["online_api_key"], payload.online_api_key)

    db.commit()

    return get_model_settings(db)
