import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Form, Input, Button, Alert } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { login, setToken } from "../api";

export default function LoginPage({ onLoggedIn }) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(values) {
    setError("");
    setSubmitting(true);

    try {
      const { access_token } = await login(values.username, values.password);
      setToken(access_token);
      await onLoggedIn();
      navigate("/chat");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <Card className="login-card">
        <h1 style={{ textAlign: "center", margin: "0 0 24px" }}>知识库助手</h1>

        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

        <Form onFinish={handleSubmit} autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" size="large" />
          </Form.Item>

          <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={submitting} block size="large">
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
