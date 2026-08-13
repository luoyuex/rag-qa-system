import os

# ============================================================
# Milvus
# ============================================================

MILVUS_URI = os.getenv("MILVUS_URI", "http://192.168.31.204:19530")
MILVUS_COLLECTION = os.getenv("MILVUS_COLLECTION", "knowledge_base_v2")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "768"))

# ============================================================
# MySQL
# ============================================================

MYSQL_URL = os.getenv(
    "MYSQL_URL",
    "mysql+pymysql://root:root@localhost:3306/rag_system",
)

# ============================================================
# Ollama 模型
# ============================================================

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "embeddinggemma:300m")
CHAT_MODEL = os.getenv("CHAT_MODEL", "deepseek-r1:1.5b")

# ============================================================
# 对话模型 Provider
#
# local  -> 本地 Ollama（CHAT_MODEL）
# online -> 线上 OpenAI 兼容接口（base_url/api_key/model 在后台配置）
# 以下是没有在后台设置过时的默认值
# ============================================================

DEFAULT_CHAT_PROVIDER = os.getenv("DEFAULT_CHAT_PROVIDER", "local")
DEFAULT_ONLINE_BASE_URL = os.getenv("DEFAULT_ONLINE_BASE_URL", "")
DEFAULT_ONLINE_API_KEY = os.getenv("DEFAULT_ONLINE_API_KEY", "")
DEFAULT_ONLINE_MODEL = os.getenv("DEFAULT_ONLINE_MODEL", "")

# ============================================================
# 切片参数
# ============================================================

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "800"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "120"))

# ============================================================
# 文档上传
# ============================================================

UPLOAD_DIR = os.getenv("UPLOAD_DIR", str(os.path.join(os.path.dirname(__file__), "..", "uploads")))
AGENT_AVATAR_DIR = os.getenv("AGENT_AVATAR_DIR", str(os.path.join(UPLOAD_DIR, "agent-avatars")))

# ============================================================
# 聊天上下文
# ============================================================

DEFAULT_CONTEXT_ROUNDS = int(os.getenv("DEFAULT_CONTEXT_ROUNDS", "5"))

# ============================================================
# 鉴权
# ============================================================

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "480"))

# 首次启动、users 表为空时自动创建的管理员账号
INITIAL_ADMIN_USERNAME = os.getenv("INITIAL_ADMIN_USERNAME", "admin")
INITIAL_ADMIN_PASSWORD = os.getenv("INITIAL_ADMIN_PASSWORD", "admin123")
