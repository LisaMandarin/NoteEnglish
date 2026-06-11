import { useState } from "react";
import { Button, Input } from "antd";
import { supabase } from "../lib/supabase";

const PASSWORD_RULES_TEXT =
  "密碼只能使用英文字母和數字，且至少需要 6 個字元。";
const DEMO_CREDENTIALS = {
  email: "testuser@example.com",
  password: "test1234",
};

function validatePassword(password) {
  return /^[A-Za-z0-9]{6,}$/.test(password);
}

function getValidationError({ mode, displayName, email, password, confirmPassword }) {
  if (mode === "sign_up" && !displayName.trim()) {
    return "請輸入顯示名稱。";
  }

  if (!email.trim()) {
    return "請輸入電子郵件。";
  }

  if (!password.trim()) {
    return "請輸入密碼。";
  }

  if (mode === "sign_up" && !confirmPassword.trim()) {
    return "請再次輸入密碼。";
  }

  if (mode === "sign_up" && !validatePassword(password)) {
    return PASSWORD_RULES_TEXT;
  }

  if (mode === "sign_up" && password !== confirmPassword) {
    return "兩次輸入的密碼不一致。";
  }

  return "";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("sign_in");

  function fillDemoCredentials() {
    setEmail(DEMO_CREDENTIALS.email);
    setPassword(DEMO_CREDENTIALS.password);
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const validationError = getValidationError({
        mode,
        displayName,
        email,
        password,
        confirmPassword,
      });

      if (validationError) {
        throw new Error(validationError);
      }

      if (mode === "sign_up") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName.trim(),
            },
          },
        });

        if (signUpError) throw signUpError;

        setPassword("");
        setConfirmPassword("");
        setMode("sign_in");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
    } catch (authError) {
      setError(authError?.message || "驗證失敗，請再試一次。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full px-6 py-10 sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
          <div className="w-full m-0 px-8 py-10 box-border sm:px-12">
            <h1 className="mb-2 text-4xl">NoteEnglish</h1>
            <p className="mb-8 text-base text-black/70">
              {mode === "sign_in"
                ? "登入以繼續您儲存的學習進度。"
                : "建立帳號，儲存您的翻譯與單字筆記。"}
            </p>

            {mode === "sign_in" ? (
              <div className="mb-8 rounded-3xl border border-black/10 bg-black/[0.03] px-5 py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-1">
                    <p className="m-0 text-sm font-semibold uppercase tracking-[0.18em] text-black/55">
                      示範帳號
                    </p>
                    <p className="m-0 text-sm text-black/75">
                      使用示範帳號體驗產品功能。
                    </p>
                    <p className="m-0 text-sm text-amber-700">
                      注意：示範帳號為公開帳號，任何測試者均可存取其中的內容。若您希望保有私人的學習記錄，請使用自己的電子郵件註冊專屬帳號。
                    </p>
                    <p className="m-0 text-sm text-black/75">
                      電子郵件：{" "}
                      <span className="font-semibold">
                        {DEMO_CREDENTIALS.email}
                      </span>
                    </p>
                    <p className="m-0 text-sm text-black/75">
                      密碼：{" "}
                      <span className="font-semibold">
                        {DEMO_CREDENTIALS.password}
                      </span>
                    </p>
                  </div>

                  <Button
                    size="large"
                    disabled={loading}
                    onClick={fillDemoCredentials}
                  >
                    使用示範帳號
                  </Button>
                </div>
              </div>
            ) : null}

            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              {mode === "sign_up" ? (
                <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                  <span>顯示名稱</span>
                  <Input
                    allowClear
                    className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="您希望顯示什麼名稱？"
                    autoComplete="name"
                    size="large"
                  />
                </label>
              ) : null}

              <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                <span>電子郵件</span>
                <Input
                  allowClear
                  className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="請輸入電子郵件"
                  autoComplete="email"
                  type="email"
                  size="large"
                />
              </label>

              <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                <span>密碼</span>
                <Input.Password
                  allowClear
                  className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="請輸入密碼"
                  autoComplete={
                    mode === "sign_in" ? "current-password" : "new-password"
                  }
                  size="large"
                />
              </label>

              {mode === "sign_up" ? (
                <>
                  <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                    <span>確認密碼</span>
                    <Input.Password
                      allowClear
                      className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="請再次輸入密碼"
                      autoComplete="new-password"
                      size="large"
                    />
                  </label>
                  <p className="m-0 text-sm text-black/65">
                    {PASSWORD_RULES_TEXT}
                  </p>
                </>
              ) : null}

              {error ? <p className="m-0 text-sm text-red-600">{error}</p> : null}

              <Button
                block
                htmlType="submit"
                size="large"
                loading={loading}
                style={{
                  backgroundColor: "var(--accent)",
                  color: "#ffffff",
                  fontWeight: 700,
                  height: "3.5rem",
                }}
              >
                {mode === "sign_in" ? "登入" : "建立帳號"}
              </Button>

              <Button
                block
                type="default"
                size="large"
                disabled={loading}
                onClick={() => {
                  setError("");
                  setPassword("");
                  setConfirmPassword("");
                  setMode((currentMode) =>
                    currentMode === "sign_in" ? "sign_up" : "sign_in"
                  );
                }}
              >
                {mode === "sign_in"
                  ? "還沒有帳號？立即註冊"
                  : "已有帳號？前往登入"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
