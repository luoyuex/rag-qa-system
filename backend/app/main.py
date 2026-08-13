from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from sqlalchemy import inspect, text

from app import config
from app.auth import hash_password
from app.db import Base, SessionLocal, engine
from app.models import Agent, Department, KnowledgeBase, User
from app.routers import agents, auth, chat, admin, departments, users
from app.services.milvus_client import ensure_collection

Base.metadata.create_all(bind=engine)


def _ensure_legacy_columns():
    """为 create_all 无法修改的旧表补充可空列，随后由默认数据回填。"""
    inspector = inspect(engine)
    with engine.begin() as connection:
        document_columns = {column["name"] for column in inspector.get_columns("documents")}
        if "knowledge_base_id" not in document_columns:
            connection.execute(text("ALTER TABLE documents ADD COLUMN knowledge_base_id VARCHAR(36) NULL"))
        session_columns = {column["name"] for column in inspector.get_columns("chat_sessions")}
        if "agent_id" not in session_columns:
            connection.execute(text("ALTER TABLE chat_sessions ADD COLUMN agent_id VARCHAR(36) NULL"))
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        if "department_id" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN department_id VARCHAR(36) NULL"))


_ensure_legacy_columns()


def _migrate_legacy_departments():
    inspector = inspect(engine)
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "department" not in user_columns:
        return
    db = SessionLocal()
    try:
        names = [row[0] for row in db.execute(text(
            "SELECT DISTINCT department FROM users WHERE department IS NOT NULL AND department <> ''"
        )).all()]
        for name in names:
            department = db.query(Department).filter(Department.name == name).first()
            if department is None:
                department = Department(name=name, description="由旧用户部门字段自动迁移")
                db.add(department)
                db.flush()
            db.execute(text(
                "UPDATE users SET department_id = :department_id WHERE department = :name AND department_id IS NULL"
            ), {"department_id": department.id, "name": name})
        db.commit()
    finally:
        db.close()


_migrate_legacy_departments()


def _create_initial_admin():
    db = SessionLocal()

    try:
        if db.query(User).first() is not None:
            return

        if not config.INITIAL_ADMIN_PASSWORD:
            return

        admin_user = User(
            username=config.INITIAL_ADMIN_USERNAME,
            password_hash=hash_password(config.INITIAL_ADMIN_PASSWORD),
            display_name="管理员",
            role="admin",
        )

        db.add(admin_user)
        db.commit()
    finally:
        db.close()


_create_initial_admin()


def _create_default_agent():
    db = SessionLocal()
    try:
        knowledge_base = db.query(KnowledgeBase).first()
        if knowledge_base is None:
            knowledge_base = KnowledgeBase(name="水果知识库", description="现有水果知识数据")
            db.add(knowledge_base)
            db.flush()
        if db.query(Agent).first() is None:
            db.add(Agent(
                name="水果知识助手",
                description="回答水果相关问题",
                system_prompt="你是水果知识助手。请只依据知识库资料准确回答；没有相关资料时明确说明。",
                knowledge_base_id=knowledge_base.id,
            ))
        db.commit()
        default_agent = db.query(Agent).first()
        db.execute(text(
            "UPDATE documents SET knowledge_base_id = :knowledge_base_id WHERE knowledge_base_id IS NULL"
        ), {"knowledge_base_id": knowledge_base.id})
        db.execute(text(
            "UPDATE chat_sessions SET agent_id = :agent_id WHERE agent_id IS NULL"
        ), {"agent_id": default_agent.id})
        db.commit()
    finally:
        db.close()


_create_default_agent()
ensure_collection()

app = FastAPI(title="RAG System")

Path(config.AGENT_AVATAR_DIR).mkdir(parents=True, exist_ok=True)
app.mount("/agent-avatars", StaticFiles(directory=config.AGENT_AVATAR_DIR), name="agent-avatars")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(admin.router)
app.include_router(users.router)
app.include_router(agents.router)
app.include_router(departments.router)


@app.get("/health")
def health():
    return {"status": "ok"}
