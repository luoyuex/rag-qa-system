from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db, SessionLocal
from app.models import ChatSession, ChatMessage
from app.schemas import ChatSessionOut, ChatMessageOut, ChatMessageIn
from app.services import chat_service

router = APIRouter(prefix="/api/chat", tags=["chat"], dependencies=[Depends(get_current_user)])


# ============================================================
# 新建会话
# ============================================================

@router.post("/sessions", response_model=ChatSessionOut)
def create_session(db: Session = Depends(get_db)):

    session = ChatSession()

    db.add(session)
    db.commit()
    db.refresh(session)

    return session


# ============================================================
# 拉取历史消息
# ============================================================

@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageOut])
def list_messages(session_id: str, db: Session = Depends(get_db)):

    session = db.get(ChatSession, session_id)

    if session is None:
        raise HTTPException(404, "会话不存在")

    return (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at)
        .all()
    )


# ============================================================
# 发送消息（流式返回）
# ============================================================

@router.post("/sessions/{session_id}/messages")
def send_message(session_id: str, payload: ChatMessageIn, db: Session = Depends(get_db)):

    session = db.get(ChatSession, session_id)

    if session is None:
        raise HTTPException(404, "会话不存在")

    def event_stream():
        yield from chat_service.stream_answer(SessionLocal, session_id, payload.content)

    return StreamingResponse(event_stream(), media_type="text/plain; charset=utf-8")
