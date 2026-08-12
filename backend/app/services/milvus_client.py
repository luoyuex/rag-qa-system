from pymilvus import MilvusClient

from app.config import MILVUS_URI, MILVUS_COLLECTION


client = MilvusClient(uri=MILVUS_URI)

COLLECTION_NAME = MILVUS_COLLECTION
