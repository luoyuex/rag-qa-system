from sqlalchemy.orm import Session

from app.models import Agent, Department, KnowledgeBase, User, department_agents


def accessible_agents_query(db: Session, user: User):
    query = db.query(Agent).join(KnowledgeBase).filter(
        Agent.is_active.is_(True), KnowledgeBase.is_active.is_(True)
    )
    if user.role == "admin":
        return query
    return query.join(
        department_agents, department_agents.c.agent_id == Agent.id
    ).join(Department).filter(
        Department.id == user.department_id, Department.is_active.is_(True)
    )


def can_access_agent(db: Session, user: User, agent_id: str) -> bool:
    return accessible_agents_query(db, user).filter(Agent.id == agent_id).first() is not None
