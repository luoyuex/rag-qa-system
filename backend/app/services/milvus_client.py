from pymilvus import MilvusClient

from app.config import EMBEDDING_DIMENSION, MILVUS_URI, MILVUS_COLLECTION


client = MilvusClient(uri=MILVUS_URI)

COLLECTION_NAME = MILVUS_COLLECTION


def ensure_collection():
    if not client.has_collection(collection_name=COLLECTION_NAME):
        client.create_collection(
            collection_name=COLLECTION_NAME,
            dimension=EMBEDDING_DIMENSION,
            metric_type="COSINE",
            id_type="int",
            auto_id=False,
            enable_dynamic_field=True,
        )
