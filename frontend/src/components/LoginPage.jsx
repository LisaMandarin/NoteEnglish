import { useState } from "react";
import { Button, Input } from "antd";

const DUMMY_EMAIL = "testuser@example.com";
const DUMMY_PASSWORD = "test1234";

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();

    if (email === DUMMY_EMAIL && password === DUMMY_PASSWORD) {
      setError("");
      onLoginSuccess(DUMMY_EMAIL.split("@")[0]);
      return;
    }

    setError("Invalid email or password.");
  }

  return (
    <div className="min-h-screen w-full px-6 py-10 sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
          <div className="w-full m-0 px-8 py-10 box-border sm:px-12">
            <h1 className="mb-2 text-4xl">NoteEnglish</h1>
            <p className="mb-8 text-base text-black/70">
              Sign in to continue. Use the demo account below to access the app.
            </p>

            <div className="mb-8 rounded-[20px] border-2 border-[color-mix(in_srgb,var(--card-border)_20%,transparent)] bg-[color-mix(in_srgb,white_50%,var(--card-bg))] px-5 py-4">
              <p className="m-0 text-sm font-semibold">Demo Login</p>
              <p className="mt-3 mb-1 text-sm">Email: {DUMMY_EMAIL}</p>
              <p className="m-0 text-sm">Password: {DUMMY_PASSWORD}</p>
            </div>

            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                <span>Email</span>
                <Input
                  allowClear
                  className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email"
                  autoComplete="email"
                  type="email"
                  size="large"
                />
              </label>

              <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                <span>Password</span>
                <Input.Password
                  allowClear
                  className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  size="large"
                />
              </label>

              {error ? <p className="m-0 text-sm text-red-600">{error}</p> : null}

              <Button
                block
                htmlType="submit"
                size="large"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "#ffffff",
                  fontWeight: 700,
                  height: "3.5rem",
                }}
              >
                Sign in
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
