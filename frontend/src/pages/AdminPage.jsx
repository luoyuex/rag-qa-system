import { useEffect, useRef, useState } from "react";
import {
  Table, Button, Upload, Avatar, Tag, Popconfirm, InputNumber, Radio, Input,
  Modal, Form, Select, Alert, Space, Menu, message,
} from "antd";
import {
  UploadOutlined, PlusOutlined, DeleteOutlined, StopOutlined, CheckCircleOutlined,
} from "@ant-design/icons";
import {
  listDocuments, uploadDocument, deleteDocument,
  getSettings, updateSettings,
  getModelSettings, updateModelSettings,
  listUsers, createUser, updateUser, deleteUser,
  listKnowledgeBases, createKnowledgeBase, updateKnowledgeBase, deleteKnowledgeBase,
  listAdminAgents, createAgent, updateAgent, deleteAgent,
  uploadAgentAvatar,
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
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
  const [editingUser, setEditingUser] = useState(null);
  const [userForm] = Form.useForm();
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedKnowledgeBaseId, setSelectedKnowledgeBaseId] = useState("");
  const [knowledgeBaseModalOpen, setKnowledgeBaseModalOpen] = useState(false);
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [editingKnowledgeBase, setEditingKnowledgeBase] = useState(null);
  const [editingAgent, setEditingAgent] = useState(null);
  const [uploadingAgentAvatar, setUploadingAgentAvatar] = useState(false);
  const [knowledgeBaseForm] = Form.useForm();
  const [agentForm] = Form.useForm();
  const [departments, setDepartments] = useState([]);
  const [departmentModalOpen, setDepartmentModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [departmentForm] = Form.useForm();
  const [adminMenu, setAdminMenu] = useState("knowledge");
  const pollTimerRef = useRef(null);

  useEffect(() => {
    refreshDocuments();
    refreshSettings();
    refreshModelSettings();
    refreshUsers();
    refreshKnowledgeBases();
    refreshAgents();
    refreshDepartments();
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
      const docs = await listDocuments(selectedKnowledgeBaseId);
      setDocuments(docs);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpload({ file }) {
    setError("");
    setUploading(true);
    try {
      if (!selectedKnowledgeBaseId) throw new Error("请先选择知识库");
      await uploadDocument(file, selectedKnowledgeBaseId);
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

  async function refreshKnowledgeBases() {
    try {
      const list = await listKnowledgeBases();
      setKnowledgeBases(list);
      setSelectedKnowledgeBaseId((current) => current || list[0]?.id || "");
    } catch (err) { setError(err.message); }
  }

  async function refreshAgents() {
    try { setAgents(await listAdminAgents()); } catch (err) { setError(err.message); }
  }

  async function refreshDepartments() {
    try { setDepartments(await listDepartments()); } catch (err) { setError(err.message); }
  }

  function openDepartmentModal(item = null) {
    setEditingDepartment(item);
    departmentForm.setFieldsValue(item || { name: "", description: "", agent_ids: [], is_active: true });
    setDepartmentModalOpen(true);
  }

  async function saveDepartment() {
    try {
      const values = await departmentForm.validateFields();
      if (editingDepartment) await updateDepartment(editingDepartment.id, values);
      else await createDepartment(values);
      setDepartmentModalOpen(false);
      await refreshDepartments();
      message.success("部门已保存");
    } catch (err) { if (!err.errorFields) message.error(err.message); }
  }

  useEffect(() => {
    if (selectedKnowledgeBaseId) refreshDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKnowledgeBaseId]);

  function openKnowledgeBaseModal(item = null) {
    setEditingKnowledgeBase(item);
    knowledgeBaseForm.setFieldsValue(item || { name: "", description: "", is_active: true });
    setKnowledgeBaseModalOpen(true);
  }

  async function saveKnowledgeBase() {
    try {
      const values = await knowledgeBaseForm.validateFields();
      if (editingKnowledgeBase) await updateKnowledgeBase(editingKnowledgeBase.id, values);
      else await createKnowledgeBase(values);
      setKnowledgeBaseModalOpen(false);
      await refreshKnowledgeBases();
      message.success("知识库已保存");
    } catch (err) { if (!err.errorFields) message.error(err.message); }
  }

  function openAgentModal(item = null) {
    setEditingAgent(item);
    agentForm.setFieldsValue(item || { name: "", description: "", system_prompt: "", is_active: true });
    setAgentModalOpen(true);
  }

  async function saveAgent() {
    try {
      const values = await agentForm.validateFields();
      if (editingAgent) await updateAgent(editingAgent.id, values);
      else await createAgent(values);
      setAgentModalOpen(false);
      await refreshAgents();
      message.success("Agent 已保存");
    } catch (err) { if (!err.errorFields) message.error(err.message); }
  }

  async function handleAgentAvatarUpload({ file, onSuccess, onError }) {
    setUploadingAgentAvatar(true);
    try {
      const result = await uploadAgentAvatar(file);
      agentForm.setFieldValue("avatar", result.url);
      onSuccess(result);
      message.success("头像上传成功");
    } catch (err) {
      onError(err);
      message.error(err.message);
    } finally {
      setUploadingAgentAvatar(false);
    }
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
    setEditingUser(null);
    userForm.resetFields();
    setUserModalOpen(true);
  }

  function openEditUserModal(user) {
    setEditingUser(user);
    userForm.setFieldsValue({
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      department_id: user.department_id,
      password: "",
    });
    setUserModalOpen(true);
  }

  async function handleCreateUser() {
    try {
      const values = await userForm.validateFields();
      setSavingUser(true);
      setError("");
      if (editingUser) {
        const { username, ...payload } = values;
        void username;
        if (!payload.password) delete payload.password;
        payload.department_id = payload.department_id || "";
        await updateUser(editingUser.id, payload);
      } else {
        await createUser(values);
      }
      setUserModalOpen(false);
      await refreshUsers();
      message.success(editingUser ? "用户已更新" : "用户创建成功");
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
    { title: "部门", dataIndex: "department_id", key: "department_id", render: (id) => departments.find((item) => item.id === id)?.name || "-" },
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
          <Button size="small" onClick={() => openEditUserModal(record)}>编辑</Button>
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

      <Menu
        mode="horizontal"
        selectedKeys={[adminMenu]}
        onClick={({ key }) => setAdminMenu(key)}
        items={[
          { key: "knowledge", label: "知识库与文档" },
          { key: "agents", label: "Agent 管理" },
          { key: "departments", label: "部门管理" },
          { key: "users", label: "用户管理" },
          { key: "settings", label: "系统设置" },
        ]}
        className="admin-menu"
      />

      {adminMenu === "knowledge" && <section className="admin-section">
        <h2>知识库管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openKnowledgeBaseModal()}>新建知识库</Button>
        <Table dataSource={knowledgeBases} rowKey="id" pagination={false} style={{ marginTop: 16 }} columns={[
          { title: "名称", dataIndex: "name" },
          { title: "描述", dataIndex: "description", render: (value) => value || "-" },
          { title: "状态", dataIndex: "is_active", render: (value) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
          { title: "操作", render: (_, item) => <Space><Button size="small" onClick={() => openKnowledgeBaseModal(item)}>编辑</Button><Popconfirm title="确定删除该知识库吗？" onConfirm={async () => { await deleteKnowledgeBase(item.id); await refreshKnowledgeBases(); }}><Button danger size="small">删除</Button></Popconfirm></Space> },
        ]} />
      </section>}

      {adminMenu === "agents" && <section className="admin-section">
        <h2>Agent 管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openAgentModal()}>新建 Agent</Button>
        <Table dataSource={agents} rowKey="id" pagination={false} style={{ marginTop: 16 }} columns={[
          { title: "名称", dataIndex: "name" },
          { title: "知识库", dataIndex: "knowledge_base_id", render: (id) => knowledgeBases.find((item) => item.id === id)?.name || id },
          { title: "状态", dataIndex: "is_active", render: (value) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
          { title: "操作", render: (_, item) => <Space><Button size="small" onClick={() => openAgentModal(item)}>编辑</Button><Popconfirm title="确定删除该 Agent 吗？" onConfirm={async () => { await deleteAgent(item.id); await refreshAgents(); }}><Button danger size="small">删除</Button></Popconfirm></Space> },
        ]} />
      </section>}

      {adminMenu === "departments" && <section className="admin-section">
        <h2>部门管理</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openDepartmentModal()}>新建部门</Button>
        <Table dataSource={departments} rowKey="id" pagination={false} style={{ marginTop: 16 }} columns={[
          { title: "名称", dataIndex: "name" },
          { title: "描述", dataIndex: "description", render: (value) => value || "-" },
          { title: "可访问 Agent", dataIndex: "agent_ids", render: (ids) => <Space wrap>{ids.map((id) => <Tag key={id}>{agents.find((agent) => agent.id === id)?.name || id}</Tag>)}</Space> },
          { title: "状态", dataIndex: "is_active", render: (value) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
          { title: "操作", render: (_, item) => <Space><Button size="small" onClick={() => openDepartmentModal(item)}>编辑</Button><Popconfirm title="确定删除该部门吗？" onConfirm={async () => { await deleteDepartment(item.id); await refreshDepartments(); }}><Button danger size="small">删除</Button></Popconfirm></Space> },
        ]} />
      </section>}

      {/* 文档管理 */}
      {adminMenu === "knowledge" && <section className="admin-section">
        <h2>文档管理</h2>
        <Select value={selectedKnowledgeBaseId || undefined} placeholder="选择知识库" options={knowledgeBases.map((item) => ({ value: item.id, label: item.name }))} onChange={setSelectedKnowledgeBaseId} style={{ width: 240, marginRight: 12 }} />
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
      </section>}

      {/* 对话设置 */}
      {adminMenu === "settings" && <section className="admin-section">
        <h2>对话设置</h2>
        <Space>
          <span>上下文轮数：</span>
          <InputNumber min={0} max={50} value={contextRounds} onChange={(v) => setContextRounds(v)} />
          <Button type="primary" loading={savingSettings} onClick={handleSaveSettings}>保存</Button>
        </Space>
      </section>}

      {/* 模型设置 */}
      {adminMenu === "settings" && <section className="admin-section">
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
      </section>}

      {/* 用户管理 */}
      {adminMenu === "users" && <section className="admin-section">
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
      </section>}

      {/* 新增用户弹窗 */}
      <Modal
        title={editingUser ? "编辑用户" : "新增用户"}
        open={userModalOpen}
        onOk={handleCreateUser}
        onCancel={() => setUserModalOpen(false)}
        confirmLoading={savingUser}
        okText={editingUser ? "保存" : "确认创建"}
        cancelText="取消"
      >
        <Form form={userForm} layout="vertical" initialValues={{ role: "user" }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input disabled={Boolean(editingUser)} />
          </Form.Item>
          <Form.Item name="password" label={editingUser ? "新密码（留空不修改）" : "密码"} rules={editingUser ? [] : [{ required: true, message: "请输入密码" }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="display_name" label="姓名">
            <Input />
          </Form.Item>
          <Form.Item name="role" label="角色">
            <Select options={[{ value: "user", label: "普通用户" }, { value: "admin", label: "管理员" }]} />
          </Form.Item>
          <Form.Item name="department_id" label="部门（选填）">
            <Select allowClear options={departments.filter((item) => item.is_active).map((item) => ({ value: item.id, label: item.name }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={editingDepartment ? "编辑部门" : "新建部门"} open={departmentModalOpen} onOk={saveDepartment} onCancel={() => setDepartmentModalOpen(false)}>
        <Form form={departmentForm} layout="vertical">
          <Form.Item name="name" label="部门名称" rules={[{ required: true, message: "请输入部门名称" }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="agent_ids" label="可访问 Agent"><Select mode="multiple" options={agents.map((agent) => ({ value: agent.id, label: agent.name }))} placeholder="可选择多个 Agent" /></Form.Item>
          <Form.Item name="is_active" label="状态"><Radio.Group options={[{ value: true, label: "启用" }, { value: false, label: "停用" }]} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={editingKnowledgeBase ? "编辑知识库" : "新建知识库"} open={knowledgeBaseModalOpen} onOk={saveKnowledgeBase} onCancel={() => setKnowledgeBaseModalOpen(false)}>
        <Form form={knowledgeBaseForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="is_active" label="状态"><Radio.Group options={[{ value: true, label: "启用" }, { value: false, label: "停用" }]} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={editingAgent ? "编辑 Agent" : "新建 Agent"} open={agentModalOpen} onOk={saveAgent} onCancel={() => setAgentModalOpen(false)}>
        <Form form={agentForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}><Input /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="knowledge_base_id" label="绑定知识库" rules={[{ required: true, message: "请选择知识库" }]}><Select options={knowledgeBases.map((item) => ({ value: item.id, label: item.name }))} /></Form.Item>
          <Form.Item name="system_prompt" label="系统提示词" rules={[{ required: true, message: "请输入系统提示词" }]}><Input.TextArea rows={5} /></Form.Item>
          <Form.Item label="头像">
            <Space align="center">
              <Form.Item name="avatar" noStyle>
                <Input type="hidden" />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(previous, current) => previous.avatar !== current.avatar}>
                {({ getFieldValue }) => (
                  <Avatar size={48} src={getFieldValue("avatar") || undefined}>AI</Avatar>
                )}
              </Form.Item>
              <Upload
                accept="image/jpeg,image/png,image/webp,image/gif"
                showUploadList={false}
                customRequest={handleAgentAvatarUpload}
              >
                <Button icon={<UploadOutlined />} loading={uploadingAgentAvatar}>上传头像</Button>
              </Upload>
              <span style={{ color: "#888", fontSize: 12 }}>JPG、PNG、WebP 或 GIF，最大 2MB</span>
            </Space>
          </Form.Item>
          <Form.Item name="is_active" label="状态"><Radio.Group options={[{ value: true, label: "启用" }, { value: false, label: "停用" }]} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
