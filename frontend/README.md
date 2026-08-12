# 智能问答系统 - 前端

基于 React + Vite 构建的智能问答系统前端界面，配合后端 RAG 服务，提供通用领域的问答体验（不限于某一特定主题，具体可回答内容取决于后台知识库中上传的文档）。

## 技术栈

- **React 19**
- **Vite 8**（开发/构建工具）
- **Oxlint**（代码检查）
- 无第三方 UI 组件库、无路由库，页面切换通过组件内状态管理实现

## 目录结构

```
frontend/
├── public/                # 静态资源（图标等）
├── src/
│   ├── main.jsx           # 应用入口
│   ├── App.jsx             # 根组件，负责登录态判断，以及在「问答」「后台管理」页面间切换
│   ├── api.js               # 封装与后端接口的所有请求（含 token 存取、鉴权头）
│   ├── pages/
│   │   ├── LoginPage.jsx   # 登录页
│   │   ├── ChatPage.jsx    # 问答对话页面
│   │   └── AdminPage.jsx   # 后台管理页面：文档上传/列表/删除、模型与上下文轮数配置、用户管理
│   ├── App.css / index.css
│   └── assets/
├── index.html
├── package.json
└── vite.config.js
```

## 功能说明

- **登录页（Login）**：用户名密码登录，登录成功后 token 存于 `localStorage`，之后请求自动带上 `Authorization` 头；token 失效（401）时自动清空并跳回登录页。
- **问答页面（Chat）**：支持创建会话、发送问题并以流式方式实时展示大模型回答，回答内容基于知识库中检索到的相关文档片段生成。任意登录用户可访问。
- **后台管理页面（Admin）**：仅 `admin` 角色可见和访问。
  - 上传 `.txt` 格式文档构建/扩充知识库，可查看文档处理状态
  - 删除已有文档
  - 配置问答时携带的历史对话轮数
  - 配置对话模型（本地 Ollama 模型 或 在线 OpenAI 兼容接口，可填写 base_url / api_key / model）
  - 用户管理：创建/停用/删除用户，设置角色（admin/user）与部门

## 环境变量

| 变量名 | 说明 | 默认值 |
| --- | --- | --- |
| `VITE_API_BASE` | 后端服务地址 | `http://localhost:8000` |

如需自定义后端地址，可在 `frontend/` 目录下创建 `.env` 文件：

```
VITE_API_BASE=http://your-backend-host:8000
```

## 安装与运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产包
npm run build

# 本地预览生产构建
npm run preview

# 代码检查
npm run lint
```

开发服务器启动后，需确保对应的[后端服务](../backend/README.md)已启动并可访问，前端才能正常完成问答与知识库管理功能。
