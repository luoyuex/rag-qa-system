import ollama
from openai import OpenAI

from app import config


def _get_embedding_settings() -> dict:
    """读取数据库中的 embedding 独立配置，fallback 到环境变量默认值。"""
    from app.db import SessionLocal
    from app.models import Setting

    db = SessionLocal()

    try:
        rows = db.query(Setting).filter(
            Setting.key.in_([
                "embedding_provider",
                "embedding_model",
                "embedding_online_base_url",
                "embedding_online_api_key",
            ])
        ).all()

        values = {row.key: row.value for row in rows}
    finally:
        db.close()

    return {
        "provider": values.get("embedding_provider", "local"),
        "model": values.get("embedding_model", config.EMBEDDING_MODEL),
        "online_base_url": values.get("embedding_online_base_url", config.DEFAULT_ONLINE_BASE_URL),
        "online_api_key": values.get("embedding_online_api_key", config.DEFAULT_ONLINE_API_KEY),
    }


def get_embedding(text: str) -> list[float]:
    settings = _get_embedding_settings()

    if settings["provider"] == "online" and settings["online_base_url"] and settings["online_api_key"]:
        return _get_embedding_online(text, settings)

    return _get_embedding_local(text, settings)


def _get_embedding_local(text: str, settings: dict) -> list[float]:
    response = ollama.embeddings(
        model=settings["model"],
        prompt=text,
    )
    return response["embedding"]


def _get_embedding_online(text: str, settings: dict) -> list[float]:
    client = OpenAI(
        base_url=settings["online_base_url"],
        api_key=settings["online_api_key"],
    )

    response = client.embeddings.create(
        model=settings["model"],
        input=text,
    )

    return response.data[0].embedding
