import { useEffect, useState, type FormEvent } from "react";
import { Button, Input } from "antd";
import { supabase } from "../../lib/supabase";
import { PASSWORD_RULES_TEXT, validatePassword } from "../../lib/authValidation";

const SESSION_WAIT_MS = 4000;

function translateResetError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("should be different") || lower.includes("same password")) {
    return "新密碼不能與舊密碼相同。";
  }
  if (lower.includes("password should be at least")) {
    return "密碼至少需要 6 個字元。";
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return "網路連線異常，請檢查網路後再試。";
  }
  return "設定新密碼失敗，請重新申請忘記密碼連結。";
}

function goToLogin(): void {
  window.location.href = `${window.location.origin}${window.location.pathname}`;
}

export default function ResetPasswordPage(): React.ReactElement {
  const [sessionReady, setSessionReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") {
        setSessionReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        setSessionReady(true);
      }
    });

    const timeout = window.setTimeout(() => {
      if (!mounted) return;
      setSessionReady((ready) => {
        if (!ready) setLinkInvalid(true);
        return ready;
      });
    }, SESSION_WAIT_MS);

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");

    if (!password.trim() || !confirmPassword.trim()) {
      setError("請輸入新密碼並再次確認。");
      return;
    }
    if (!validatePassword(password)) {
      setError(PASSWORD_RULES_TEXT);
      return;
    }
    if (password !== confirmPassword) {
      setError("兩次輸入的密碼不一致。");
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      await supabase.auth.signOut();
      setSuccessMessage("密碼已重設成功，請使用新密碼重新登入。");
    } catch (submitError) {
      const raw = submitError instanceof Error ? submitError.message : "";
      setError(translateResetError(raw));
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

            {successMessage ? (
              <>
                <p className="mb-8 text-base text-black/70">{successMessage}</p>
                <Button
                  block
                  size="large"
                  onClick={goToLogin}
                  style={{
                    backgroundColor: "var(--accent)",
                    color: "#ffffff",
                    fontWeight: 700,
                    height: "3.5rem",
                  }}
                >
                  前往登入
                </Button>
              </>
            ) : linkInvalid ? (
              <>
                <p className="mb-8 text-base text-black/70">
                  此連結無效或已過期，請重新申請忘記密碼。
                </p>
                <Button block size="large" onClick={goToLogin}>
                  返回登入
                </Button>
              </>
            ) : !sessionReady ? (
              <p className="mb-8 text-base text-black/70">正在驗證重設密碼連結…</p>
            ) : (
              <>
                <p className="mb-8 text-base text-black/70">請輸入您的新密碼。</p>
                <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
                  <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                    <span>新密碼</span>
                    <Input.Password
                      allowClear
                      className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="請輸入新密碼"
                      autoComplete="new-password"
                      size="large"
                    />
                  </label>

                  <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                    <span>確認新密碼</span>
                    <Input.Password
                      allowClear
                      className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="請再次輸入新密碼"
                      autoComplete="new-password"
                      size="large"
                    />
                  </label>

                  <p className="m-0 text-sm text-black/65">{PASSWORD_RULES_TEXT}</p>

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
                    設定新密碼
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
