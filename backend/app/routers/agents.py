from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import Agent, KnowledgeBase
from app.schemas import AgentOut

router = APIRouter(prefix="/api/agents", tags=["agents"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=List[AgentOut])
def list_agents(db: Session = Depends(get_db)):
    return (
        db.query(Agent)
        .join(KnowledgeBase)
        .filter(Agent.is_active.is_(True), KnowledgeBase.is_active.is_(True))
        .order_by(Agent.created_at)
        .all()
    )
