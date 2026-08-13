const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const TOKEN_STORAGE_KEY = "rag_auth_token";

export function getToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// 未登录 / 登录状态失效时触发，由 App 负责跳回登录页
let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearToken();
    if (onUnauthorized) onUnauthorized();
    throw new Error("登录状态已失效，请重新登录");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`请求失败 (${res.status})：${text || res.statusText}`);
  }

  return res;
}

// ============================================================
// 鉴权
// ============================================================

export async function login(username, password) {
  const res = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}

export async function getCurrentUser() {
  const res = await request("/api/auth/me");
  return res.json();
}

// ============================================================
// 用户管理（仅管理员）
// ============================================================

export async function listUsers() {
  const res = await request("/api/admin/users");
  return res.json();
}

export async function createUser(payload) {
  const res = await request("/api/admin/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function updateUser(userId, payload) {
  const res = await request(`/api/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function deleteUser(userId) {
  await request(`/api/admin/users/${userId}`, { method: "DELETE" });
}

export async function listDepartments() {
  const res = await request("/api/admin/departments");
  return res.json();
}

export async function createDepartment(payload) {
  const res = await request("/api/admin/departments", { method: "POST", body: JSON.stringify(payload) });
  return res.json();
}

export async function updateDepartment(id, payload) {
  const res = await request(`/api/admin/departments/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  return res.json();
}

export async function deleteDepartment(id) {
  await request(`/api/admin/departments/${id}`, { method: "DELETE" });
}

// ============================================================
// 聊天
// ============================================================

export async function listAgents() {
  const res = await request("/api/agents", { cache: "no-store" });
  return res.json();
}

export async function createSession(agentId) {
  const res = await request("/api/chat/sessions", {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId }),
  });
  return res.json();
}

export async function listSessions(agentId) {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
  const res = await request(`/api/chat/sessions${query}`, { cache: "no-store" });
  return res.json();
}

export async function getSession(sessionId) {
  const res = await request(`/api/chat/sessions/${sessionId}`, { cache: "no-store" });
  return res.json();
}

export async function deleteSession(sessionId) {
  await request(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
}

export async function getMessages(sessionId) {
  const res = await request(`/api/chat/sessions/${sessionId}/messages`);
  return res.json();
}

export async function sendMessageStream(sessionId, content, onChunk) {
  const res = await request(`/api/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value, { stream: true });
    if (text) onChunk(text);
  }
}

// ============================================================
// 后台管理
// ============================================================

export async function listDocuments(knowledgeBaseId) {
  const query = knowledgeBaseId ? `?knowledge_base_id=${encodeURIComponent(knowledgeBaseId)}` : "";
  const res = await request(`/api/admin/documents${query}`);
  return res.json();
}

export async function uploadDocument(file, knowledgeBaseId) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/admin/documents?knowledge_base_id=${encodeURIComponent(knowledgeBaseId)}`, {
    method: "POST",
    body: formData,
    headers: authHeaders(),
  });

  if (res.status === 401) {
    clearToken();
    if (onUnauthorized) onUnauthorized();
    throw new Error("登录状态已失效，请重新登录");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`上传失败：${text || res.statusText}`);
  }

  return res.json();
}

export async function deleteDocument(documentId) {
  await request(`/api/admin/documents/${documentId}`, { method: "DELETE" });
}

export async function listKnowledgeBases() {
  const res = await request("/api/admin/knowledge-bases");
  return res.json();
}

export async function createKnowledgeBase(payload) {
  const res = await request("/api/admin/knowledge-bases", { method: "POST", body: JSON.stringify(payload) });
  return res.json();
}

export async function updateKnowledgeBase(id, payload) {
  const res = await request(`/api/admin/knowledge-bases/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  return res.json();
}

export async function deleteKnowledgeBase(id) {
  await request(`/api/admin/knowledge-bases/${id}`, { method: "DELETE" });
}

export async function listAdminAgents() {
  const res = await request("/api/admin/agents");
  return res.json();
}

export async function createAgent(payload) {
  const res = await request("/api/admin/agents", { method: "POST", body: JSON.stringify(payload) });
  return res.json();
}

export async function updateAgent(id, payload) {
  const res = await request(`/api/admin/agents/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  return res.json();
}

export async function deleteAgent(id) {
  await request(`/api/admin/agents/${id}`, { method: "DELETE" });
}

export async function uploadAgentAvatar(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/admin/agent-avatar`, {
    method: "POST",
    body: formData,
    headers: authHeaders(),
  });
  if (res.status === 401) {
    clearToken();
    if (onUnauthorized) onUnauthorized();
    throw new Error("登录状态已失效，请重新登录");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`头像上传失败：${text || res.statusText}`);
  }
  return res.json();
}

export async function getSettings() {
  const res = await request("/api/admin/settings");
  return res.json();
}

export async function updateSettings(contextRounds) {
  const res = await request("/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify({ context_rounds: contextRounds }),
  });
  return res.json();
}

export async function getModelSettings() {
  const res = await request("/api/admin/model-settings");
  return res.json();
}

export async function updateModelSettings(payload) {
  const res = await request("/api/admin/model-settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.json();
}
