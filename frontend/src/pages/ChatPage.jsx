import { Children, isValidElement, memo, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Input, Button, Avatar, Alert, Dropdown, Menu, Popconfirm, message } from "antd";
import { CheckOutlined, CopyOutlined, PlusOutlined, SendOutlined, DeleteOutlined, UserOutlined, RobotOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import { createSession, deleteSession, getMessages, getSession, listAgents, listSessions, sendMessageStream } from "../api";

const AGENT_STORAGE_KEY = "rag_selected_agent_id";

function getTextContent(value) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(getTextContent).join("");
  if (isValidElement(value)) return getTextContent(value.props.children);
  return "";
}

const CodeBlock = memo(function CodeBlock({ children }) {
  const child = Children.only(children);
  const className = isValidElement(child) ? child.props.className || "" : "";
  const match = /language-([\w+-]+)/.exec(className);
  const language = match?.[1] || "text";
  const code = getTextContent(child).replace(/\n$/, "");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const succeeded = document.execCommand("copy");
        textarea.remove();
        if (!succeeded) throw new Error("copy failed");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      message.error("复制失败，请手动选择代码复制");
    }
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-language">{language}</span>
        <button type="button" className="code-copy-button" onClick={handleCopy}>
          {copied ? <CheckOutlined /> : <CopyOutlined />}
          <span>{copied ? "已复制" : "复制代码"}</span>
        </button>
      </div>
      <pre>{child}</pre>
    </div>
  );
});

const MarkdownMessage = memo(function MarkdownMessage({ content }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: CodeBlock,
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer">{children}</a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

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
  const creatingSessionRef = useRef(null);

  useEffect(() => {
    initAgents();
    // Agent 只在页面初始化时恢复；后续路由变化由 agentId/sessionId effect 处理。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!sessionId) return;
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
      if (list.length === 0) return;

      let nextAgentId = "";
      if (sessionId) {
        try {
          const session = await getSession(sessionId);
          if (list.some((agent) => agent.id === session.agent_id)) {
            nextAgentId = session.agent_id;
          }
        } catch {
          // 会话失效时交给后续会话列表逻辑选择可用会话。
        }
      }

      if (!nextAgentId) {
        const savedAgentId = localStorage.getItem(AGENT_STORAGE_KEY);
        if (list.some((agent) => agent.id === savedAgentId)) {
          nextAgentId = savedAgentId;
        }
      }

      nextAgentId ||= list[0].id;
      localStorage.setItem(AGENT_STORAGE_KEY, nextAgentId);
      setAgentId(nextAgentId);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!agentId) return;
    refreshSessions().then(async (list) => {
      if (!sessionId || !list.some((item) => item.id === sessionId)) {
        if (list.length) {
          navigate(`/chat/${list[0].id}`, { replace: true });
        } else {
          setMessages([]);
          await createAndOpenSession(true);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

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

  async function createAndOpenSession(replace = false) {
    try {
      if (!agentId) return null;
      if (!creatingSessionRef.current || creatingSessionRef.current.agentId !== agentId) {
        creatingSessionRef.current = {
          agentId,
          promise: createSession(agentId),
        };
      }
      const session = await creatingSessionRef.current.promise;
      setSessions((previous) => previous.some((item) => item.id === session.id)
        ? previous
        : [session, ...previous]);
      navigate(`/chat/${session.id}`, { replace });
      return session.id;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      if (creatingSessionRef.current?.agentId === agentId) {
        creatingSessionRef.current = null;
      }
    }
  }

  async function handleNewSession() {
    await createAndOpenSession();
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
    if (!question || sending || !agentId) return;

    const activeSessionId = sessionId || await createAndOpenSession(true);
    if (!activeSessionId) return;

    setError("");
    setInput("");
    setSending(true);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: question },
      { role: "assistant", content: "" },
    ]);

    try {
      await sendMessageStream(activeSessionId, question, (chunk) => {
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
    onClick: ({ key }) => {
      localStorage.setItem(AGENT_STORAGE_KEY, key);
      setAgentId(key);
    },
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
                  <Avatar
                    className="chat-avatar assistant"
                    src={selectedAgent?.avatar || undefined}
                    icon={!selectedAgent?.avatar ? <RobotOutlined /> : undefined}
                  />
                )}
                <div className={`chat-content ${m.role}`}>
                  {m.content ? (
                    m.role === "assistant"
                      ? <MarkdownMessage content={m.content} />
                      : m.content
                  ) : (sending && i === messages.length - 1 ? (
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
              disabled={sending || !agentId || !input.trim()}
              loading={sending}
              className="chat-send-btn"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
