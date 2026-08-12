import { useEffect, useRef, useState } from "react";
import { Input, Button, Tag, Alert, Space, Spin } from "antd";
import { PlusOutlined, SendOutlined } from "@ant-design/icons";
import { createSession, getMessages, sendMessageStream } from "../api";

const SESSION_STORAGE_KEY = "rag_chat_session_id";

export default function ChatPage() {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    initSession();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function initSession() {
    try {
      const savedId = localStorage.getItem(SESSION_STORAGE_KEY);

      if (savedId) {
        const history = await getMessages(savedId);
        setSessionId(savedId);
        setMessages(history.map((m) => ({ role: m.role, content: m.content })));
        return;
      }

      const session = await createSession();
      localStorage.setItem(SESSION_STORAGE_KEY, session.id);
      setSessionId(session.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleNewSession() {
    try {
      const session = await createSession();
      localStorage.setItem(SESSION_STORAGE_KEY, session.id);
      setSessionId(session.id);
      setMessages([]);
    } catch (err) {
      setError(err.message);
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
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-page">
      <div className="chat-toolbar">
        <Space>
          <Tag color="blue">会话：{sessionId ? sessionId.slice(0, 8) : "..."}</Tag>
        </Space>
        <Button icon={<PlusOutlined />} onClick={handleNewSession}>
          新建会话
        </Button>
      </div>

      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.role}`}>
            <div className="chat-role">
              <Tag color={m.role === "user" ? "blue" : "default"}>
                {m.role === "user" ? "我" : "AI"}
              </Tag>
            </div>
            <div className="chat-content">
              {m.content || (sending && i === messages.length - 1 ? <Spin size="small" /> : "")}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <Alert type="error" message={error} showIcon className="chat-alert" />}

      <div className="chat-input-bar">
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题，Enter 发送，Shift+Enter 换行"
          autoSize={{ minRows: 1, maxRows: 4 }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          disabled={sending || !input.trim()}
          loading={sending}
        >
          发送
        </Button>
      </div>
    </div>
  );
}
