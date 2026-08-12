const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`请求失败 (${res.status})：${text || res.statusText}`);
  }

  return res;
}

// ============================================================
// 聊天
// ============================================================

export async function createSession() {
  const res = await request("/api/chat/sessions", { method: "POST" });
  return res.json();
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

export async function listDocuments() {
  const res = await request("/api/admin/documents");
  return res.json();
}

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/api/admin/documents`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`上传失败：${text || res.statusText}`);
  }

  return res.json();
}

export async function deleteDocument(documentId) {
  await request(`/api/admin/documents/${documentId}`, { method: "DELETE" });
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
