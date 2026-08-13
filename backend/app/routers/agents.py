from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import Agent, User
from app.schemas import AgentOut
from app.services.agent_access import accessible_agents_query

router = APIRouter(prefix="/api/agents", tags=["agents"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=List[AgentOut])
def list_agents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return accessible_agents_query(db, user).order_by(Agent.created_at).all()
