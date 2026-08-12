import { useState } from "react";
import "./App.css";
import ChatPage from "./pages/ChatPage";
import AdminPage from "./pages/AdminPage";

export default function App() {
  const [tab, setTab] = useState("chat");

  return (
    <div className="app">
      <header className="app-header">
        <h1>知识库助手</h1>
        <nav>
          <button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}>
            聊天
          </button>
          <button className={tab === "admin" ? "active" : ""} onClick={() => setTab("admin")}>
            后台管理
          </button>
        </nav>
      </header>

      <main className="app-main">
        {tab === "chat" ? <ChatPage /> : <AdminPage />}
      </main>
    </div>
  );
}
