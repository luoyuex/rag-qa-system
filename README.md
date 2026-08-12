# RAG QA System

一个基于检索增强生成（RAG）的通用智能问答系统。支持上传任意主题的知识文档构建专属知识库，并基于该知识库进行语义检索与流式问答（不限定于某一领域，具体可回答内容取决于知识库中上传的文档）。

## 项目结构

```
.
├── backend/     # FastAPI 后端服务：会话管理、知识库文档管理、RAG 问答
└── frontend/    # React + Vite 前端界面：问答页面、后台管理页面
```

## 技术栈

- **后端**：FastAPI、MySQL（结构化数据）、Milvus（向量检索）、Ollama / OpenAI 兼容接口（Embedding 与对话模型）
- **前端**：React 19、Vite 8

## 快速开始

分别参考两个子目录的说明文档：

- [backend/README.md](backend/README.md) — 环境准备、环境变量、接口说明、启动命令
- [frontend/README.md](frontend/README.md) — 页面功能、环境变量、启动命令

大致流程：

1. 准备好 MySQL、Milvus、Ollama（或在线模型的 API Key）等依赖服务
2. 启动后端：`cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`
3. 启动前端：`cd frontend && npm install && npm run dev`
4. 打开前端页面，在「后台管理」中上传知识文档，再到「问答」页面进行提问

## 功能概览

- 知识文档上传、自动分块、向量化、入库
- 基于语义检索的流式问答，支持多轮对话上下文
- 对话模型可切换本地（Ollama）或在线（OpenAI 兼容接口）
- 知识库文档的查看与删除、系统参数（历史对话轮数等）配置
