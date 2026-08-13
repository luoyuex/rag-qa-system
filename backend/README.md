# 智能问答系统 - 后端

基于 FastAPI + RAG（检索增强生成）的智能问答系统后端服务。系统本身与具体领域无关，可通过后台上传任意 `.txt` 知识文档来构建知识库，从而支持任意主题的问答（项目中的示例数据以水果为主题，仅用于演示）。

## 技术栈

- **Web 框架**：FastAPI
- **数据库**：MySQL（通过 SQLAlchemy 存储会话、消息、文档、系统设置等结构化数据）
- **向量数据库**：Milvus（存储文档分块的向量表示，用于语义检索）
- **Embedding 模型**：Ollama 本地模型（默认 `embeddinggemma:300m`）
- **对话模型**：支持两种模式
  - `local`：Ollama 本地模型（默认 `deepseek-r1:1.5b`）
  - `online`：任意 OpenAI 兼容接口（可配置 base_url / api_key / model）

## 目录结构

```
backend/
├── app/
│   ├── main.py           # FastAPI 入口，挂载路由、CORS、启动时建表
│   ├── config.py         # 环境变量与默认配置
│   ├── db.py              # SQLAlchemy 引擎与 Session
│   ├── models.py          # 数据表模型（会话、消息、文档、设置、用户）
│   ├── schemas.py         # Pydantic 请求/响应模型
│   ├── auth.py             # 密码哈希、JWT 生成/校验、鉴权依赖
│   ├── routers/
│   │   ├── auth.py         # 登录、当前用户接口
│   │   ├── users.py        # 用户管理接口（仅 admin）
│   │   ├── chat.py        # 会话与问答相关接口
│   │   └── admin.py       # 知识库文档与系统配置相关接口
│   └── services/           # 业务逻辑（RAG 编排、文档处理、分块、向量化等）
├── uploads/                # 上传的原始文档存储目录
└── requirements.txt
```

## 环境准备

在启动前，需要准备好以下依赖服务：

1. **MySQL**：创建数据库（默认名为 `rag_system`），表结构会在服务启动时自动创建（无需手动执行迁移）。
2. **Milvus**：向量数据库服务，用于存储和检索文档向量。
3. **Ollama**（如使用本地模式）：需拉取 embedding 模型与对话模型，例如：
   ```bash
   ollama pull embeddinggemma:300m
   ollama pull deepseek-r1:1.5b
   ```

## 环境变量

可通过环境变量或 `.env` 文件配置，未设置时使用以下默认值：

| 变量名 | 说明 | 默认值 |
| --- | --- | --- |
| `MILVUS_URI` | Milvus 服务地址 | `http://192.168.31.204:19530` |
| `MILVUS_COLLECTION` | Milvus 集合名 | `knowledge_base` |
| `MYSQL_URL` | MySQL 连接串 | `mysql+pymysql://root:root@localhost:3306/rag_system` |
| `EMBEDDING_MODEL` | 向量化模型（Ollama） | `embeddinggemma:300m` |
| `CHAT_MODEL` | 本地对话模型（Ollama） | `deepseek-r1:1.5b` |
| `DEFAULT_CHAT_PROVIDER` | 默认对话模式，`local` 或 `online` | `local` |
| `EMBEDDING_DIMENSION` | Milvus 向量维度，必须与 Embedding 模型一致 | `768` |
| `DEFAULT_ONLINE_BASE_URL` | 在线模式的 API 地址 | - |
| `DEFAULT_ONLINE_API_KEY` | 在线模式的 API Key | - |
| `DEFAULT_ONLINE_MODEL` | 在线模式使用的模型名 | - |
| `CHUNK_SIZE` | 文档分块大小 | `800` |
| `CHUNK_OVERLAP` | 分块重叠长度 | `120` |
| `UPLOAD_DIR` | 上传文件存储目录 | `uploads/` |
| `DEFAULT_CONTEXT_ROUNDS` | 默认携带的历史对话轮数 | `5` |
| `JWT_SECRET` | JWT 签名密钥，生产环境必须修改 | `change-me-in-production` |
| `JWT_EXPIRE_MINUTES` | JWT 有效期（分钟） | `480` |
| `INITIAL_ADMIN_USERNAME` | 首次启动、`users` 表为空时自动创建的管理员用户名 | `admin` |
| `INITIAL_ADMIN_PASSWORD` | 首次启动自动创建管理员时使用的密码，留空则不自动创建 | - |

> 对话模型、上下文轮数等设置也可在服务启动后，通过管理接口在运行时动态修改（持久化到数据库）。

## 安装与运行

```bash
# 安装依赖
pip install -r requirements.txt

# 启动开发服务（默认监听 http://localhost:8000）
uvicorn app.main:app --reload
```

启动成功后可访问 `GET /health` 检查服务状态，`http://localhost:8000/docs` 查看自动生成的接口文档。

## 主要接口

### 鉴权（`/api/auth`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | 用户名密码登录，返回 JWT access token |
| GET | `/api/auth/me` | 获取当前登录用户信息（需带 `Authorization: Bearer <token>`） |

### 用户管理（`/api/admin/users`，仅 admin 可访问）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/users` | 获取用户列表 |
| POST | `/api/admin/users` | 创建用户（用户名、密码、角色、部门） |
| PUT | `/api/admin/users/{user_id}` | 修改用户（密码、角色、部门、启用/停用） |
| DELETE | `/api/admin/users/{user_id}` | 删除用户 |

### 问答相关（`/api/chat`，需登录）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/chat/sessions` | 创建一个新的会话 |
| GET | `/api/chat/sessions/{session_id}/messages` | 获取该会话的历史消息 |
| POST | `/api/chat/sessions/{session_id}/messages` | 发送问题，以流式（`text/plain`）方式返回回答，内部会先在向量库中检索相关知识片段，再交由大模型生成回答 |

### 知识库与配置管理（`/api/admin`，仅 admin 可访问）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/admin/documents` | 上传 `.txt` 文档，后台异步完成分块、向量化并写入 Milvus |
| GET | `/api/admin/documents` | 获取已上传文档列表及处理状态 |
| DELETE | `/api/admin/documents/{doc_id}` | 删除文档（同时清理 Milvus 中对应向量与 MySQL 记录） |
| GET / PUT | `/api/admin/settings` | 获取 / 修改问答时携带的历史上下文轮数 |
| GET / PUT | `/api/admin/model-settings` | 获取 / 修改对话模型配置（本地 Ollama 或在线 OpenAI 兼容接口） |

## 说明：根目录脚本

项目根目录下的 `chunk.py`、`embedding.py`、`milvus.py`、`insert.py`、`search.py`、`chat.py` 为早期原型脚本（命令行方式验证分块、向量化、Milvus 检索、RAG 问答流程），与本 `backend` 服务相互独立、不被其引用，仅作为参考/历史留存，不建议在生产中使用。

### Agent 与知识库

- 后台可创建知识库，并向指定知识库上传文档。
- 每个 Agent 绑定一个知识库，会话创建后固定绑定该 Agent。
- Milvus Chunk 使用 `knowledge_base_id` 隔离，检索不会跨知识库。
- 旧 MySQL 表在首次启动时会自动补充关联字段，并绑定到默认的“水果知识库 / 水果知识助手”。
- 旧 Milvus 向量没有 `knowledge_base_id`，不会进入隔离检索结果；升级后需在后台将原始水果文档重新上传一次。确认新数据可正常检索后，再自行清理旧向量。
