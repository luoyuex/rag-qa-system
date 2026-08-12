from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import hash_password, require_role
from app.db import get_db
from app.models import User
from app.schemas import UserCreateIn, UserOut, UserUpdateIn

router = APIRouter(
    prefix="/api/admin/users",
    tags=["users"],
    dependencies=[Depends(require_role("admin"))],
)


@router.get("", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db)):

    return db.query(User).order_by(User.created_at.desc()).all()


@router.post("", response_model=UserOut)
def create_user(payload: UserCreateIn, db: Session = Depends(get_db)):

    if payload.role not in ("admin", "user"):
        raise HTTPException(400, "role 只能是 admin 或 user")

    if db.query(User).filter(User.username == payload.username).first() is not None:
        raise HTTPException(400, "用户名已存在")

    user = User(
        username=payload.username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        role=payload.role,
        department=payload.department,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: str, payload: UserUpdateIn, db: Session = Depends(get_db)):

    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(404, "用户不存在")

    if payload.role is not None:
        if payload.role not in ("admin", "user"):
            raise HTTPException(400, "role 只能是 admin 或 user")
        user.role = payload.role

    if payload.password:
        user.password_hash = hash_password(payload.password)

    if payload.display_name is not None:
        user.display_name = payload.display_name

    if payload.department is not None:
        user.department = payload.department

    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)

    return user


@router.delete("/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db)):

    user = db.get(User, user_id)

    if user is None:
        raise HTTPException(404, "用户不存在")

    db.delete(user)
    db.commit()

    return {"ok": True}
