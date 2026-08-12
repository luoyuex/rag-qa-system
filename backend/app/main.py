from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config
from app.auth import hash_password
from app.db import Base, SessionLocal, engine
from app.models import User
from app.routers import auth, chat, admin, users

Base.metadata.create_all(bind=engine)


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

app = FastAPI(title="RAG System")

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


@app.get("/health")
def health():
    return {"status": "ok"}
