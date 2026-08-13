import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Layout, Menu, Button, Typography, Spin } from "antd";
import { MessageOutlined, SettingOutlined, LogoutOutlined, UserOutlined } from "@ant-design/icons";
import ChatPage from "./pages/ChatPage";
import AdminPage from "./pages/AdminPage";
import LoginPage from "./pages/LoginPage";
import { clearToken, getCurrentUser, getToken, setUnauthorizedHandler } from "./api";
import "./App.css";

const { Header, Content } = Layout;

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      navigate("/login");
    });
    refreshCurrentUser();
  }, [navigate]);

  async function refreshCurrentUser() {
    if (!getToken()) {
      setCheckingAuth(false);
      return;
    }

    try {
      const current = await getCurrentUser();
      setUser(current);
    } catch {
      // handler 已处理
    } finally {
      setCheckingAuth(false);
    }
  }

  function handleLogout() {
    clearToken();
    setUser(null);
    navigate("/login");
  }

  function handleMenuClick({ key }) {
    navigate(key);
  }

  if (checkingAuth) {
    return (
      <div className="spin-center">
        <Spin size="large" />
      </div>
    );
  }

  const menuItems = [
    { key: "/chat", icon: <MessageOutlined />, label: "聊天" },
    ...(user?.role === "admin"
      ? [{ key: "/admin", icon: <SettingOutlined />, label: "后台管理" }]
      : []),
  ];

  const selectedMenuKey = location.pathname.startsWith("/chat") ? "/chat" : location.pathname;

  return (
    <Layout className="app-layout">
      {user && (
        <Header className="app-header">
          <Typography.Text strong className="app-title">知识库助手</Typography.Text>
          <Menu
            mode="horizontal"
            selectedKeys={[selectedMenuKey]}
            items={menuItems}
            onClick={handleMenuClick}
            className="app-menu"
          />
          <div className="app-header-right">
            <UserOutlined style={{ marginRight: 6 }} />
            <Typography.Text className="current-user">{user.display_name || user.username}</Typography.Text>
            <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
              退出
            </Button>
          </div>
        </Header>
      )}

      <Content className={location.pathname.startsWith("/chat") ? "app-content-chat" : "app-content"}>
        <Routes>
          <Route
            path="/login"
            element={
              user ? <Navigate to="/chat" replace /> : <LoginPage onLoggedIn={refreshCurrentUser} />
            }
          />
          <Route
            path="/chat"
            element={user ? <ChatPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/chat/:sessionId"
            element={user ? <ChatPage /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/admin"
            element={
              user
                ? user.role === "admin"
                  ? <AdminPage />
                  : <Navigate to="/chat" replace />
                : <Navigate to="/login" replace />
            }
          />
          <Route path="*" element={<Navigate to="/chat" replace />} />
        </Routes>
      </Content>
    </Layout>
  );
}
