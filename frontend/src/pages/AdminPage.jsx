import { useEffect, useRef, useState } from "react";
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  getSettings,
  updateSettings,
  getModelSettings,
  updateModelSettings,
} from "../api";

const STATUS_LABEL = {
  pending: "等待处理",
  chunking: "切片中",
  embedding: "向量化中",
  completed: "已完成",
  failed: "失败",
};

const ACTIVE_STATUSES = new Set(["pending", "chunking", "embedding"]);

export default function AdminPage() {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [contextRounds, setContextRounds] = useState(5);
  const [savingSettings, setSavingSettings] = useState(false);
  const [modelSettings, setModelSettings] = useState(null);
  const [onlineApiKeyInput, setOnlineApiKeyInput] = useState("");
  const [savingModelSettings, setSavingModelSettings] = useState(false);
  const fileInputRef = useRef(null);
  const pollTimerRef = useRef(null);

  useEffect(() => {
    refreshDocuments();
    refreshSettings();
    refreshModelSettings();
    return () => clearTimeout(pollTimerRef.current);
  }, []);

  useEffect(() => {
    const hasActive = documents.some((d) => ACTIVE_STATUSES.has(d.status));

    if (hasActive) {
      pollTimerRef.current = setTimeout(refreshDocuments, 2000);
    }

    return () => clearTimeout(pollTimerRef.current);
  }, [documents]);

  async function refreshDocuments() {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err.message);
    }
  }

  async function refreshSettings() {
    try {
      const settings = await getSettings();
      setContextRounds(settings.context_rounds);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setUploading(true);

    try {
      await uploadDocument(file);
      await refreshDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(id) {
    if (!confirm("确定删除该文档及其向量数据吗？")) return;

    try {
      await deleteDocument(id);
      await refreshDocuments();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    setError("");

    try {
      const result = await updateSettings(Number(contextRounds));
      setContextRounds(result.context_rounds);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function refreshModelSettings() {
    try {
      const settings = await getModelSettings();
      setModelSettings(settings);
    } catch (err) {
      setError(err.message);
    }
  }

  function updateModelField(field, value) {
    setModelSettings((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSaveModelSettings() {
    setSavingModelSettings(true);
    setError("");

    try {
      const result = await updateModelSettings({
        provider: modelSettings.provider,
        local_model: modelSettings.local_model,
        online_base_url: modelSettings.online_base_url,
        online_model: modelSettings.online_model,
        online_api_key: onlineApiKeyInput || undefined,
      });
      setModelSettings(result);
      setOnlineApiKeyInput("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingModelSettings(false);
    }
  }

  return (
    <div className="admin-page">
      <section className="admin-section">
        <h2>文档管理</h2>

        <div className="upload-bar">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            onChange={handleUpload}
            disabled={uploading}
          />
          {uploading && <span>上传中...</span>}
        </div>

        <table className="doc-table">
          <thead>
            <tr>
              <th>文件名</th>
              <th>状态</th>
              <th>Chunk 数</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.filename}</td>
                <td>
                  <span className={`status-badge ${doc.status}`}>
                    {STATUS_LABEL[doc.status] || doc.status}
                  </span>
                  {doc.status === "failed" && doc.error_message && (
                    <div className="error-message">{doc.error_message}</div>
                  )}
                </td>
                <td>{doc.chunk_count}</td>
                <td>{new Date(doc.updated_at).toLocaleString()}</td>
                <td>
                  <button onClick={() => handleDelete(doc.id)}>删除</button>
                </td>
              </tr>
            ))}
            {documents.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-row">
                  暂无文档，先上传一个 .txt 文件
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="admin-section">
        <h2>对话设置</h2>

        <div className="settings-bar">
          <label>
            上下文轮数：
            <input
              type="number"
              min={0}
              max={50}
              value={contextRounds}
              onChange={(e) => setContextRounds(e.target.value)}
            />
          </label>
          <button onClick={handleSaveSettings} disabled={savingSettings}>
            {savingSettings ? "保存中..." : "保存"}
          </button>
        </div>
      </section>

      <section className="admin-section">
        <h2>模型设置</h2>

        {modelSettings && (
          <div className="model-settings">
            <label className="radio-row">
              <input
                type="radio"
                name="provider"
                checked={modelSettings.provider === "local"}
                onChange={() => updateModelField("provider", "local")}
              />
              本地 Ollama
            </label>

            {modelSettings.provider === "local" && (
              <div className="model-field">
                <label>
                  模型名称：
                  <input
                    type="text"
                    value={modelSettings.local_model}
                    onChange={(e) => updateModelField("local_model", e.target.value)}
                    placeholder="deepseek-r1:1.5b"
                  />
                </label>
              </div>
            )}

            <label className="radio-row">
              <input
                type="radio"
                name="provider"
                checked={modelSettings.provider === "online"}
                onChange={() => updateModelField("provider", "online")}
              />
              线上模型（OpenAI 兼容接口）
            </label>

            {modelSettings.provider === "online" && (
              <div className="model-field online-fields">
                <label>
                  Base URL：
                  <input
                    type="text"
                    value={modelSettings.online_base_url}
                    onChange={(e) => updateModelField("online_base_url", e.target.value)}
                    placeholder="https://api.deepseek.com/v1"
                  />
                </label>
                <label>
                  模型名称：
                  <input
                    type="text"
                    value={modelSettings.online_model}
                    onChange={(e) => updateModelField("online_model", e.target.value)}
                    placeholder="deepseek-chat"
                  />
                </label>
                <label>
                  API Key：
                  <input
                    type="password"
                    value={onlineApiKeyInput}
                    onChange={(e) => setOnlineApiKeyInput(e.target.value)}
                    placeholder={modelSettings.has_online_api_key ? "已设置，留空则不修改" : "sk-..."}
                  />
                </label>
              </div>
            )}

            <button onClick={handleSaveModelSettings} disabled={savingModelSettings}>
              {savingModelSettings ? "保存中..." : "保存"}
            </button>
          </div>
        )}
      </section>

      {error && <div className="chat-error">{error}</div>}
    </div>
  );
}
