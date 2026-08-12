import { useEffect, useRef, useState } from "react";
import {
  Table, Button, Upload, Tag, Popconfirm, InputNumber, Radio, Input,
  Modal, Form, Select, Alert, Space, message,
} from "antd";
import {
  UploadOutlined, PlusOutlined, DeleteOutlined, StopOutlined, CheckCircleOutlined,
} from "@ant-design/icons";
import {
  listDocuments, uploadDocument, deleteDocument,
  getSettings, updateSettings,
  getModelSettings, updateModelSettings,
  listUsers, createUser, updateUser, deleteUser,
} from "../api";

const STATUS_TAG = {
  pending: { color: "orange", text: "等待处理" },
  chunking: { color: "orange", text: "切片中" },
  embedding: { color: "orange", text: "向量化中" },
  completed: { color: "green", text: "已完成" },
  failed: { color: "red", text: "失败" },
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
  const [embeddingApiKeyInput, setEmbeddingApiKeyInput] = useState("");
  const [savingModelSettings, setSavingModelSettings] = useState(false);
  const [users, setUsers] = useState([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [userForm] = Form.useForm();
  const pollTimerRef = useRef(null);

  useEffect(() => {
    refreshDocuments();
    refreshSettings();
    refreshModelSettings();
    refreshUsers();
    return () => clearTimeout(pollTimerRef.current);
  }, []);

  useEffect(() => {
    const hasActive = documents.some((d) => ACTIVE_STATUSES.has(d.status));
    if (hasActive) {
      pollTimerRef.current = setTimeout(refreshDocuments, 2000);
    }
    return () => clearTimeout(pollTimerRef.current);
  }, [documents]);

  // ---- 文档 ----

  async function refreshDocuments() {
    try {
      const docs = await listDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpload({ file }) {
    setError("");
    setUploading(true);
    try {
      await uploadDocument(file);
      await refreshDocuments();
      message.success("文档上传成功，正在处理中");
    } catch (err) {
      setError(err.message);
      message.error(err.message);
    } finally {
      setUploading(false);
    }
    return false;
  }

  async function handleDelete(id) {
    try {
      await deleteDocument(id);
      await refreshDocuments();
    } catch (err) {
      setError(err.message);
    }
  }

  const docColumns = [
    { title: "文件名", dataIndex: "filename", key: "filename" },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      render: (status, record) => (
        <span>
          <Tag color={STATUS_TAG[status]?.color || "default"}>
            {STATUS_TAG[status]?.text || status}
          </Tag>
          {status === "failed" && record.error_message && (
            <div style={{ color: "#d92d20", fontSize: 12, marginTop: 4 }}>{record.error_message}</div>
          )}
        </span>
      ),
    },
    { title: "Chunk 数", dataIndex: "chunk_count", key: "chunk_count" },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      render: (v) => new Date(v).toLocaleString(),
    },
    {
      title: "操作",
      key: "action",
      render: (_, record) => (
        <Popconfirm title="确定删除该文档及其向量数据吗？" onConfirm={() => handleDelete(record.id)}>
          <Button danger size="small" icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      ),
    },
  ];

  // ---- 对话设置 ----

  async function refreshSettings() {
    try {
      const settings = await getSettings();
      setContextRounds(settings.context_rounds);
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
      message.success("对话设置已保存");
    } catch (err) {
      setError(err.message);
      message.error(err.message);
    } finally {
      setSavingSettings(false);
    }
  }

  // ---- 模型设置 ----

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
        chat_provider: modelSettings.chat_provider,
        local_model: modelSettings.local_model,
        online_base_url: modelSettings.online_base_url,
        online_model: modelSettings.online_model,
        online_api_key: onlineApiKeyInput || undefined,
        embedding_provider: modelSettings.embedding_provider,
        embedding_model: modelSettings.embedding_model,
        embedding_online_base_url: modelSettings.embedding_online_base_url,
        embedding_online_api_key: embeddingApiKeyInput || undefined,
      });
      setModelSettings(result);
      setOnlineApiKeyInput("");
      setEmbeddingApiKeyInput("");
      message.success("模型设置已保存");
    } catch (err) {
      setError(err.message);
      message.error(err.message);
    } finally {
      setSavingModelSettings(false);
    }
  }

  // ---- 用户管理 ----

  async function refreshUsers() {
    try {
      const list = await listUsers();
      setUsers(list);
    } catch (err) {
      setError(err.message);
    }
  }

  function openUserModal() {
    userForm.resetFields();
    setUserModalOpen(true);
  }

  async function handleCreateUser() {
    try {
      const values = await userForm.validateFields();
      setSavingUser(true);
      setError("");
      await createUser(values);
      setUserModalOpen(false);
      await refreshUsers();
      message.success("用户创建成功");
    } catch (err) {
      if (err.errorFields) return;
      setError(err.message);
      message.error(err.message);
    } finally {
      setSavingUser(false);
    }
  }

  async function handleToggleActive(u) {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      await refreshUsers();
      message.success(u.is_active ? "已停用" : "已启用");
    } catch (err) {
      setError(err.message);
      message.error(err.message);
    }
  }

  async function handleDeleteUser(u) {
    try {
      await deleteUser(u.id);
      await refreshUsers();
      message.success("用户已删除");
    } catch (err) {
      setError(err.message);
      message.error(err.message);
    }
  }

  const userColumns = [
    { title: "用户名", dataIndex: "username", key: "username" },
    { title: "姓名", dataIndex: "display_name", key: "display_name", render: (v) => v || "-" },
    {
      title: "角色",
      dataIndex: "role",
      key: "role",
      render: (role) => (
        <Tag color={role === "admin" ? "red" : "blue"}>
          {role === "admin" ? "管理员" : "普通用户"}
        </Tag>
      ),
    },
    { title: "部门", dataIndex: "department", key: "department", render: (v) => v || "-" },
    {
      title: "状态",
      dataIndex: "is_active",
      key: "is_active",
      render: (active) => (
        <Tag color={active ? "green" : "default"}>{active ? "启用" : "已停用"}</Tag>
      ),
    },
    {
      title: "操作",
      key: "action",
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            icon={record.is_active ? <StopOutlined /> : <CheckCircleOutlined />}
            onClick={() => handleToggleActive(record)}
          >
            {record.is_active ? "停用" : "启用"}
          </Button>
          <Popconfirm title={`确定删除用户「${record.username}」吗？`} onConfirm={() => handleDeleteUser(record)}>
            <Button danger size="small" icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="admin-page">
      {error && <Alert type="error" message={error} showIcon closable onClose={() => setError("")} style={{ marginBottom: 16 }} />}

      {/* 文档管理 */}
      <section className="admin-section">
        <h2>文档管理</h2>
        <Upload
          accept=".txt"
          showUploadList={false}
          customRequest={({ file, onSuccess }) => {
            handleUpload({ file }).then(() => onSuccess());
          }}
        >
          <Button icon={<UploadOutlined />} loading={uploading}>上传文档</Button>
        </Upload>
        <Table
          dataSource={documents}
          columns={docColumns}
          rowKey="id"
          size="small"
          style={{ marginTop: 16 }}
          pagination={false}
          locale={{ emptyText: "暂无文档，先上传一个 .txt 文件" }}
        />
      </section>

      {/* 对话设置 */}
      <section className="admin-section">
        <h2>对话设置</h2>
        <Space>
          <span>上下文轮数：</span>
          <InputNumber min={0} max={50} value={contextRounds} onChange={(v) => setContextRounds(v)} />
          <Button type="primary" loading={savingSettings} onClick={handleSaveSettings}>保存</Button>
        </Space>
      </section>

      {/* 模型设置 */}
      <section className="admin-section">
        <h2>模型设置</h2>
        {modelSettings && (
          <div className="model-settings">
            {/* ---- 对话模型 ---- */}
            <h3 style={{ fontSize: 14, margin: 0 }}>对话模型</h3>
            <Radio.Group
              value={modelSettings.chat_provider}
              onChange={(e) => updateModelField("chat_provider", e.target.value)}
            >
              <Radio value="local">本地 Ollama</Radio>
              <Radio value="online">线上模型（OpenAI 兼容接口）</Radio>
            </Radio.Group>

            {modelSettings.chat_provider === "local" && (
              <div style={{ marginLeft: 24 }}>
                <Space>
                  <span>模型名称：</span>
                  <Input
                    value={modelSettings.local_model}
                    onChange={(e) => updateModelField("local_model", e.target.value)}
                    placeholder="deepseek-r1:1.5b"
                    style={{ width: 200 }}
                  />
                </Space>
              </div>
            )}

            {modelSettings.chat_provider === "online" && (
              <div style={{ marginLeft: 24, display: "flex", flexDirection: "column", gap: 8 }}>
                <Space>
                  <span>Base URL：</span>
                  <Input
                    value={modelSettings.online_base_url}
                    onChange={(e) => updateModelField("online_base_url", e.target.value)}
                    placeholder="https://api.deepseek.com/v1"
                    style={{ width: 300 }}
                  />
                </Space>
                <Space>
                  <span>模型名称：</span>
                  <Input
                    value={modelSettings.online_model}
                    onChange={(e) => updateModelField("online_model", e.target.value)}
                    placeholder="deepseek-chat"
                    style={{ width: 200 }}
                  />
                </Space>
                <Space>
                  <span>API Key：</span>
                  <Input.Password
                    value={onlineApiKeyInput}
                    onChange={(e) => setOnlineApiKeyInput(e.target.value)}
                    placeholder={modelSettings.has_online_api_key ? "已设置，留空则不修改" : "sk-..."}
                    style={{ width: 300 }}
                  />
                </Space>
              </div>
            )}

            {/* ---- Embedding 模型 ---- */}
            <div style={{ marginTop: 8 }}>
              <h3 style={{ fontSize: 14, margin: 0 }}>Embedding 模型</h3>
              <Radio.Group
                value={modelSettings.embedding_provider}
                onChange={(e) => updateModelField("embedding_provider", e.target.value)}
              >
                <Radio value="local">本地 Ollama</Radio>
                <Radio value="online">线上模型（OpenAI 兼容接口）</Radio>
              </Radio.Group>

              <div style={{ marginLeft: 24, display: "flex", flexDirection: "column", gap: 8 }}>
                <Space>
                  <span>模型名称：</span>
                  <Input
                    value={modelSettings.embedding_model}
                    onChange={(e) => updateModelField("embedding_model", e.target.value)}
                    placeholder={modelSettings.embedding_provider === "local" ? "embeddinggemma:300m" : "text-embedding-v3"}
                    style={{ width: 240 }}
                  />
                  <Tag color="orange">向量维度需为 768</Tag>
                </Space>

                {modelSettings.embedding_provider === "online" && (
                  <>
                    <Space>
                      <span>Base URL：</span>
                      <Input
                        value={modelSettings.embedding_online_base_url}
                        onChange={(e) => updateModelField("embedding_online_base_url", e.target.value)}
                        placeholder="https://api.deepseek.com/v1"
                        style={{ width: 300 }}
                      />
                    </Space>
                    <Space>
                      <span>API Key：</span>
                      <Input.Password
                        value={embeddingApiKeyInput}
                        onChange={(e) => setEmbeddingApiKeyInput(e.target.value)}
                        placeholder={modelSettings.has_embedding_online_api_key ? "已设置，留空则不修改" : "sk-..."}
                        style={{ width: 300 }}
                      />
                    </Space>
                  </>
                )}
              </div>
            </div>

            <Button type="primary" loading={savingModelSettings} onClick={handleSaveModelSettings}>
              保存
            </Button>
          </div>
        )}
      </section>

      {/* 用户管理 */}
      <section className="admin-section">
        <h2>用户管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openUserModal} style={{ marginBottom: 16 }}>
          新增用户
        </Button>
        <Table
          dataSource={users}
          columns={userColumns}
          rowKey="id"
          size="small"
          pagination={false}
          locale={{ emptyText: "暂无用户" }}
        />
      </section>

      {/* 新增用户弹窗 */}
      <Modal
        title="新增用户"
        open={userModalOpen}
        onOk={handleCreateUser}
        onCancel={() => setUserModalOpen(false)}
        confirmLoading={savingUser}
        okText="确认创建"
        cancelText="取消"
      >
        <Form form={userForm} layout="vertical" initialValues={{ role: "user" }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="display_name" label="姓名">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select options={[{ value: "user", label: "普通用户" }, { value: "admin", label: "管理员" }]} />
          </Form.Item>
          <Form.Item name="department" label="部门（选填）">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
