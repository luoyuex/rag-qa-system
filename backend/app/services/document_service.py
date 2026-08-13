import hashlib
from pathlib import Path

from sqlalchemy.orm import Session

from app import config
from app.models import Document, DocumentStatus
from app.services.chunker import create_chunks
from app.services.embedding import get_embedding
from app.services.milvus_client import client, COLLECTION_NAME

BATCH_SIZE = 10


def _milvus_primary_id(chunk_id: str) -> int:
    """Milvus 快速创建的 Collection 使用必填 INT64 主键。"""
    digest = hashlib.blake2b(chunk_id.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, byteorder="big") & 0x7FFFFFFFFFFFFFFF


# ============================================================
# 保存上传文件
# ============================================================

def save_upload(file_bytes: bytes, filename: str) -> Path:

    upload_dir = Path(config.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    path = upload_dir / filename
    path.write_bytes(file_bytes)

    return path


# ============================================================
# 创建文档记录
# ============================================================

def create_document_record(db: Session, filename: str, knowledge_base_id: str) -> Document:

    document = Document(
        filename=filename,
        knowledge_base_id=knowledge_base_id,
        title=filename,
        status=DocumentStatus.pending,
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    return document


# ============================================================
# 批量写入 Milvus
# ============================================================

def _insert_batch(batch, knowledge_base_id: str):

    data = []

    for chunk in batch:

        vector = get_embedding(chunk.text)

        data.append({
            "id": _milvus_primary_id(chunk.chunk_id),
            "vector": vector,
            "knowledge_base_id": knowledge_base_id,
            "text": chunk.text,
            "chunk_id": chunk.chunk_id,
            "document_id": chunk.document_id,
            "title": chunk.title,
            "section": chunk.section,
            "chunk_index": chunk.chunk_index,
        })

    client.insert(
        collection_name=COLLECTION_NAME,
        data=data,
    )


# ============================================================
# 处理文档：切片 -> embedding -> 写入 Milvus -> 更新状态
#
# 在 BackgroundTasks 里跑，使用独立的 db session（session_factory）
# 而不是复用请求的 session，因为请求结束后请求的 session 就关闭了
# ============================================================

def process_document(document_id: str, file_path: Path, session_factory):

    db = session_factory()

    try:

        document = db.get(Document, document_id)

        if document is None:
            return

        document.status = DocumentStatus.chunking
        db.commit()

        text = file_path.read_text(encoding="utf-8")

        chunks = create_chunks(
            text=text,
            document_id=document_id,
            chunk_size=config.CHUNK_SIZE,
            overlap=config.CHUNK_OVERLAP,
        )

        document.status = DocumentStatus.embedding
        db.commit()

        for start in range(0, len(chunks), BATCH_SIZE):

            batch = chunks[start:start + BATCH_SIZE]
            _insert_batch(batch, document.knowledge_base_id)

        document.status = DocumentStatus.completed
        document.chunk_count = len(chunks)
        db.commit()

    except Exception as e:

        document = db.get(Document, document_id)

        if document is not None:
            document.status = DocumentStatus.failed
            document.error_message = str(e)
            db.commit()

    finally:
        db.close()


# ============================================================
# 删除文档：同时删除 Milvus 向量和 MySQL 记录
# ============================================================

def delete_document(db: Session, document: Document):

    client.delete(
        collection_name=COLLECTION_NAME,
        filter=f'document_id == "{document.id}"',
    )

    db.delete(document)
    db.commit()
