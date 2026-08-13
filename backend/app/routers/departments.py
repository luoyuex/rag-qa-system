from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import require_role
from app.db import get_db
from app.models import Agent, Department, User
from app.schemas import DepartmentIn, DepartmentOut

router = APIRouter(prefix="/api/admin/departments", tags=["departments"], dependencies=[Depends(require_role("admin"))])


def _set_agents(db: Session, department: Department, agent_ids: list[str]):
    agents = db.query(Agent).filter(Agent.id.in_(agent_ids)).all() if agent_ids else []
    if len(agents) != len(set(agent_ids)):
        raise HTTPException(400, "包含不存在的 Agent")
    department.agents = agents


@router.get("", response_model=List[DepartmentOut])
def list_departments(db: Session = Depends(get_db)):
    return db.query(Department).order_by(Department.created_at).all()


@router.post("", response_model=DepartmentOut)
def create_department(payload: DepartmentIn, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name or db.query(Department).filter(Department.name == name).first():
        raise HTTPException(400, "部门名称为空或已存在")
    item = Department(name=name, description=payload.description, is_active=payload.is_active)
    db.add(item)
    _set_agents(db, item, payload.agent_ids)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{department_id}", response_model=DepartmentOut)
def update_department(department_id: str, payload: DepartmentIn, db: Session = Depends(get_db)):
    item = db.get(Department, department_id)
    if item is None:
        raise HTTPException(404, "部门不存在")
    item.name, item.description, item.is_active = payload.name.strip(), payload.description, payload.is_active
    _set_agents(db, item, payload.agent_ids)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{department_id}")
def delete_department(department_id: str, db: Session = Depends(get_db)):
    item = db.get(Department, department_id)
    if item is None:
        raise HTTPException(404, "部门不存在")
    if db.query(User).filter(User.department_id == department_id).first():
        raise HTTPException(409, "该部门下仍有用户")
    db.delete(item)
    db.commit()
    return {"ok": True}
