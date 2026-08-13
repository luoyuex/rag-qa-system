from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db, SessionLocal
from app.models import Agent, ChatSession, ChatMessage, KnowledgeBase, User
from app.schemas import ChatSessionOut, ChatMessageOut, ChatMessageIn, ChatSessionIn
from app.services import chat_service
from app.services.agent_access import can_access_agent

router = APIRouter(prefix="/api/chat", tags=["chat"], dependencies=[Depends(get_current_user)])


def _get_user_session(db: Session, session_id: str, user: User) -> ChatSession:
    """获取属于当前用户的会话，不存在或不属于该用户则 404。"""
    session = db.get(ChatSession, session_id)
    if session is None or session.user_id != user.id:
        raise HTTPException(404, "会话不存在")
    if not can_access_agent(db, user, session.agent_id):
        raise HTTPException(403, "当前部门无权访问该 Agent")
    return session


# ============================================================
# 列出当前用户的会话
# ============================================================

@router.get("/sessions", response_model=List[ChatSessionOut])
def list_sessions(agent_id: str = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):

    query = db.query(ChatSession).filter(ChatSession.user_id == user.id)
    if agent_id:
        if not can_access_agent(db, user, agent_id):
            raise HTTPException(403, "当前部门无权访问该 Agent")
        query = query.filter(ChatSession.agent_id == agent_id)
    elif user.role != "admin":
        from app.services.agent_access import accessible_agents_query
        accessible_ids = [item.id for item in accessible_agents_query(db, user).all()]
        query = query.filter(ChatSession.agent_id.in_(accessible_ids))
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
    if not can_access_agent(db, user, agent.id):
        raise HTTPException(403, "当前部门无权访问该 Agent")
    session = ChatSession(user_id=user.id, agent_id=agent.id)

    db.add(session)
    db.commit()
    db.refresh(session)

    return session


# ============================================================
# 获取单个会话（用于刷新页面时恢复其所属 Agent）
# ============================================================

@router.get("/sessions/{session_id}", response_model=ChatSessionOut)
def get_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _get_user_session(db, session_id, user)


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
        try:
            yield from chat_service.stream_answer(SessionLocal, session_id, payload.content)
        except Exception as exc:
            # StreamingResponse 已发送响应头后不能再返回 JSON 错误，转为可读文本。
            detail = str(exc).strip() or exc.__class__.__name__
            yield f"[处理消息失败：{detail}]"

    return StreamingResponse(event_stream(), media_type="text/plain; charset=utf-8")
