import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Input, Button, Avatar, Alert, Dropdown, Menu, Popconfirm, message } from "antd";
import { PlusOutlined, SendOutlined, DeleteOutlined, UserOutlined, RobotOutlined } from "@ant-design/icons";
import { createSession, deleteSession, getMessages, listAgents, listSessions, sendMessageStream } from "../api";

export default function ChatPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [sessions, setSessions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [agentId, setAgentId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const sessionsRequestRef = useRef(0);

  useEffect(() => {
    initAgents();
  }, []);

  useEffect(() => {
    if (!sessionId) {
      // 没有指定会话：有历史会话就打开最新的，否则新建一个
      initWithoutSessionId();
      return;
    }
    loadMessages(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function refreshSessions() {
    const requestId = ++sessionsRequestRef.current;

    try {
      const list = await listSessions(agentId);
      // 只接受最后一次请求的结果，避免较早的列表请求覆盖刚生成的标题。
      if (requestId === sessionsRequestRef.current) {
        setSessions(list);
      }
      return list;
    } catch (err) {
      setError(err.message);
      return [];
    }
  }

  async function initAgents() {
    try {
      const list = await listAgents();
      setAgents(list);
      if (list.length > 0) setAgentId(list[0].id);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!agentId) return;
    refreshSessions().then((list) => {
      if (!sessionId || !list.some((item) => item.id === sessionId)) {
        navigate(list.length ? `/chat/${list[0].id}` : "/chat", { replace: true });
        if (!list.length) setMessages([]);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  async function initWithoutSessionId() {
    const list = await refreshSessions();

    if (list.length > 0) {
      navigate(`/chat/${list[0].id}`, { replace: true });
      return;
    }

    await handleNewSession();
  }

  async function loadMessages(id) {
    setError("");
    try {
      const history = await getMessages(id);
      setMessages(history.map((m) => ({ role: m.role, content: m.content })));
    } catch (err) {
      setError(err.message);
      setMessages([]);
    }
  }

  async function handleNewSession() {
    try {
      if (!agentId) return;
      const session = await createSession(agentId);
      await refreshSessions();
      navigate(`/chat/${session.id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeleteSession(id, e) {
    e?.stopPropagation();

    try {
      await deleteSession(id);
      const list = await refreshSessions();
      message.success("会话已删除");

      if (id === sessionId) {
        if (list.length > 0) {
          navigate(`/chat/${list[0].id}`, { replace: true });
        } else {
          await handleNewSession();
        }
      }
    } catch (err) {
      setError(err.message);
      message.error(err.message);
    }
  }

  async function handleSend() {
    const question = input.trim();
    if (!question || sending || !sessionId) return;

    setError("");
    setInput("");
    setSending(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);

    try {
      await sendMessageStream(sessionId, question, (chunk) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      });
    } catch (err) {
      setError(err.message);
    } finally {
      // 流结束时后端已保存首轮标题；等待列表更新完成后再结束发送状态。
      await refreshSessions();
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const menuItems = sessions.map((s) => ({
    key: s.id,
    label: (
      <div className="session-item">
        <span className="session-item-title">{s.title || new Date(s.created_at).toLocaleString()}</span>
        <Popconfirm title="确定删除该会话吗？" onConfirm={(e) => handleDeleteSession(s.id, e)}>
          <DeleteOutlined className="session-item-delete" onClick={(e) => e.stopPropagation()} />
        </Popconfirm>
      </div>
    ),
  }));

  const selectedAgent = agents.find((agent) => agent.id === agentId);
  const agentMenu = {
    selectedKeys: agentId ? [agentId] : [],
    items: agents.map((agent) => ({
      key: agent.id,
      label: (
        <span className="agent-menu-item">
          <Avatar size={24} src={agent.avatar || undefined} icon={!agent.avatar ? <RobotOutlined /> : undefined} />
          <span>{agent.name}</span>
        </span>
      ),
    })),
    onClick: ({ key }) => setAgentId(key),
  };

  return (
    <div className="chat-layout">
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <Button icon={<PlusOutlined />} onClick={handleNewSession} className="chat-sidebar-new">
            新建会话
          </Button>
        </div>
        <Menu
          mode="inline"
          selectedKeys={sessionId ? [sessionId] : []}
          items={menuItems}
          onClick={({ key }) => navigate(`/chat/${key}`)}
          className="chat-sidebar-menu"
        />
      </div>

      <div className="chat-main">
        <div className="chat-messages">
          <div className="chat-messages-inner">
            {messages.map((m, i) => (
              <div key={i} className={`chat-row ${m.role}`}>
                {m.role === "assistant" && (
                  <Avatar className="chat-avatar assistant" icon={<RobotOutlined />} />
                )}
                <div className={`chat-content ${m.role}`}>
                  {m.content || (sending && i === messages.length - 1 ? (
                    <span className="chat-typing">
                      <span></span><span></span><span></span>
                    </span>
                  ) : "")}
                </div>
                {m.role === "user" && (
                  <Avatar className="chat-avatar user" icon={<UserOutlined />} />
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {error && <Alert type="error" message={error} showIcon className="chat-alert" />}

        <div className="chat-input-wrap">
          <div className="chat-input-bar">
            <Dropdown menu={agentMenu} trigger={["click"]} placement="topLeft" disabled={sending || agents.length === 0}>
              <button
                type="button"
                className="chat-agent-trigger"
                title={selectedAgent ? `当前 Agent：${selectedAgent.name}` : "选择 Agent"}
                aria-label={selectedAgent ? `当前 Agent：${selectedAgent.name}，点击切换` : "选择 Agent"}
              >
                <Avatar
                  size={32}
                  src={selectedAgent?.avatar || undefined}
                  icon={!selectedAgent?.avatar ? <RobotOutlined /> : undefined}
                />
              </button>
            </Dropdown>
            <Input.TextArea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="给知识库助手发送消息"
              autoSize={{ minRows: 1, maxRows: 6 }}
              variant="borderless"
            />
            <Button
              type="text"
              shape="circle"
              icon={<SendOutlined />}
              onClick={handleSend}
              disabled={sending || !input.trim()}
              loading={sending}
              className="chat-send-btn"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
