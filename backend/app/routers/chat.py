from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db, SessionLocal
from app.models import Agent, ChatSession, ChatMessage, KnowledgeBase, User
from app.schemas import ChatSessionOut, ChatMessageOut, ChatMessageIn, ChatSessionIn
from app.services import chat_service

router = APIRouter(prefix="/api/chat", tags=["chat"], dependencies=[Depends(get_current_user)])


def _get_user_session(db: Session, session_id: str, user: User) -> ChatSession:
    """获取属于当前用户的会话，不存在或不属于该用户则 404。"""
    session = db.get(ChatSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(404, "会话不存在")
    return session


# ============================================================
# 列出当前用户的会话
# ============================================================

@router.get("/sessions", response_model=List[ChatSessionOut])
def list_sessions(agent_id: str = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):

    query = db.query(ChatSession).filter(ChatSession.user_id == user.id)
    if agent_id:
        query = query.filter(ChatSession.agent_id == agent_id)
    return query.order_by(ChatSession.created_at.desc()).all()


# ============================================================
# 新建会话
# ============================================================

@router.post("/sessions", response_model=ChatSessionOut)
def create_session(payload: ChatSessionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):

    agent = (
        db.query(Agent).join(KnowledgeBase).filter(
            Agent.id == payload.agent_id,
            Agent.is_active.is_(True),
            KnowledgeBase.is_active.is_(True),
        ).first()
    )
    if agent is None:
        raise HTTPException(404, "Agent 不存在或已停用")
    session = ChatSession(user_id=user.id, agent_id=agent.id)

    db.add(session)
    db.commit()
    db.refresh(session)

    return session


# ============================================================
# 删除会话
# ============================================================

@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):

    session = _get_user_session(db, session_id, user)

    db.delete(session)
    db.commit()

    return {"ok": True}


# ============================================================
# 拉取历史消息
# ============================================================

@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageOut])
def list_messages(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):

    _get_user_session(db, session_id, user)

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
def send_message(session_id: str, payload: ChatMessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):

    _get_user_session(db, session_id, user)

    def event_stream():
        yield from chat_service.stream_answer(SessionLocal, session_id, payload.content)

    return StreamingResponse(event_stream(), media_type="text/plain; charset=utf-8")
