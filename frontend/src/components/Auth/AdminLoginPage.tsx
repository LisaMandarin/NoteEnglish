import { useState } from "react";
import { Button, Input } from "antd";
import { supabase } from "../../lib/supabase";
import { checkAdminAccess } from "../../lib/api";

export default function AdminLoginPage(): React.ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"sign_in" | "forgot_password">("sign_in");

  function showForgotPassword(): void {
    setError("");
    setSuccessMessage("");
    setPassword("");
    setMode("forgot_password");
  }

  function backToSignIn(): void {
    setError("");
    setSuccessMessage("");
    setPassword("");
    setMode("sign_in");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMessage("");

    try {
      if (!email.trim()) throw new Error("Email is required.");

      if (mode === "forgot_password") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}${window.location.pathname}?view=reset-password`,
          }
        );

        if (resetError) throw resetError;

        setSuccessMessage("A password reset link has been sent to your email.");
        return;
      }

      if (!password.trim()) throw new Error("Password is required.");

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      // Verify admin role via backend — signs out immediately if not admin.
      try {
        await checkAdminAccess();
      } catch {
        await supabase.auth.signOut();
        throw new Error("This account does not have admin access.");
      }
    } catch (authError: unknown) {
      const msg = authError instanceof Error ? authError.message : "Authentication failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full px-6 py-10 sm:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <div className="w-full rounded-[30px] border-4 border-(--card-border) bg-(--card-bg) shadow-md">
          <div className="w-full m-0 px-8 py-10 box-border sm:px-12">
            <h1 className="mb-1 text-4xl">句句通</h1>
            <p className="mb-8 text-sm font-semibold uppercase tracking-[0.18em] text-(--accent)">
              Admin Dashboard
            </p>
            <p className="mb-8 text-base text-black/70">
              {mode === "sign_in"
                ? "Sign in with your admin account to continue."
                : "Enter your email and we'll send you a password reset link."}
            </p>

            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                <span>Email</span>
                <Input
                  allowClear
                  className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  autoComplete="email"
                  type="email"
                  size="large"
                />
              </label>

              {mode === "sign_in" ? (
                <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                  <span>Password</span>
                  <Input.Password
                    allowClear
                    className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    size="large"
                  />
                </label>
              ) : null}

              {mode === "sign_in" ? (
                <Button
                  type="link"
                  size="small"
                  className="self-end p-0"
                  style={{ color: "var(--accent)" }}
                  disabled={loading}
                  onClick={showForgotPassword}
                >
                  Forgot password?
                </Button>
              ) : null}

              {error ? <p className="m-0 text-sm text-red-600">{error}</p> : null}
              {successMessage ? (
                <p className="m-0 text-sm text-green-700">{successMessage}</p>
              ) : null}

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
                {mode === "sign_in" ? "Sign in" : "Send reset link"}
              </Button>

              {mode === "forgot_password" ? (
                <Button
                  block
                  type="default"
                  size="large"
                  disabled={loading}
                  onClick={backToSignIn}
                >
                  Back to sign in
                </Button>
              ) : null}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
