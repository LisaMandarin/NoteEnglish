import { useState } from "react";
import { Button, Input } from "antd";
import { supabase } from "../lib/supabase";

const PASSWORD_RULES_TEXT =
  "Use only letters and numbers, with at least 5 characters.";

function validatePassword(password) {
  return /^[A-Za-z0-9]{5,}$/.test(password);
}

function getValidationError({ mode, displayName, email, password, confirmPassword }) {
  if (mode === "sign_up" && !displayName.trim()) {
    return "Display name is required.";
  }

  if (!email.trim()) {
    return "Email is required.";
  }

  if (!password.trim()) {
    return "Password is required.";
  }

  if (mode === "sign_up" && !confirmPassword.trim()) {
    return "Confirm password is required.";
  }

  if (mode === "sign_up" && !validatePassword(password)) {
    return PASSWORD_RULES_TEXT;
  }

  if (mode === "sign_up" && password !== confirmPassword) {
    return "Passwords do not match.";
  }

  return "";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("sign_in");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

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
        setMessage(
          "Account created. Check your email for the confirmation link before signing in."
        );
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
    } catch (authError) {
      setError(authError?.message || "Authentication failed.");
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
                ? "Sign in to continue your saved sessions."
                : "Create an account to save translations and vocabulary notes."}
            </p>

            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              {mode === "sign_up" ? (
                <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                  <span>Display Name</span>
                  <Input
                    allowClear
                    className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="How should your name appear?"
                    autoComplete="name"
                    size="large"
                  />
                </label>
              ) : null}

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
                  autoComplete={
                    mode === "sign_in" ? "current-password" : "new-password"
                  }
                  size="large"
                />
              </label>

              {mode === "sign_up" ? (
                <>
                  <label className="flex flex-col gap-2 text-[0.95rem] font-semibold">
                    <span>Confirm Password</span>
                    <Input.Password
                      allowClear
                      className="rounded-2xl border border-black/15 bg-white text-inherit transition"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      placeholder="Re-enter your password"
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
              {message ? (
                <p className="m-0 text-sm text-emerald-700">{message}</p>
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
                {mode === "sign_in" ? "Sign in" : "Create account"}
              </Button>

              <Button
                block
                type="default"
                size="large"
                disabled={loading}
                onClick={() => {
                  setError("");
                  setMessage("");
                  setPassword("");
                  setConfirmPassword("");
                  setMode((currentMode) =>
                    currentMode === "sign_in" ? "sign_up" : "sign_in"
                  );
                }}
              >
                {mode === "sign_in"
                  ? "Need an account? Sign up"
                  : "Already registered? Sign in"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
