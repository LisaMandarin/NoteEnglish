import { useEffect, useState } from "react";
import { Input, Button, Alert, Typography } from "antd";

const { Text } = Typography;
const { TextArea } = Input;

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

export default function App() {
  const [text, setText] = useState(
    "I like apples. I like bananas.\nThis is a new sentence."
  );
  const [status, setStatus] = useState("checking...");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sentences, setSentences] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then((res) => res.json())
      .then((data) => setStatus(data.status ?? "unknown"))
      .catch(() => setStatus("error"));
  }, []);

  async function handleTranslate() {
    setError("");
    setLoading(true);
    setSentences([]);

    try {
      const res = await fetch(`${API_BASE}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`HTTP ${res.status} - ${msg}`);
      }

      const data = await res.json();
      setSentences(data.sentences ?? []);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setText("");
    setSentences([]);
    setError("");
  }

  const backendOk = status === "ok";

  return (
    <div className="min-h-screen w-full px-6 py-10 sm:px-10">
        <div className="rounded-[30px] bg-[#f3fafa] shadow-md ring-1 ring-white/60">
          <div className="w-full m-0 px-12 py-10 box-border font-sans">
            {/* Title */}
            <h1 className="mb-1 text-3xl font-semibold">NoteEnglish</h1>

            {/* Backend status */}
            <div className="mb-4">
              <Text>
                Backend status:{" "}
                <Text strong type={backendOk ? "success" : "danger"}>
                  {status}
                </Text>
              </Text>
            </div>

            {/* Backend warning */}
            {!backendOk && (
              <Alert
                type="warning"
                showIcon
                message="Backend is not ready"
                description="Please start FastAPI first."
                className="mb-4"
              />
            )}

            {/* Textarea */}
            <div className="mb-3">
              <Text strong>Paste a passage:</Text>
              <TextArea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={8}
                placeholder="Paste a passage here..."
                className="mt-2"
              />
            </div>

            {/* Buttons */}
            <div className="flex gap-3 mb-4">
              <Button
                type="primary"
                onClick={handleTranslate}
                loading={loading}
                disabled={!backendOk}
              >
                Translate (fake)
              </Button>

              <Button onClick={handleClear} disabled={loading}>
                Clear
              </Button>
            </div>

            {/* Error */}
            {error && (
              <Alert
                type="error"
                showIcon
                message="Request failed"
                description={
                  <pre className="m-0 whitespace-pre-wrap">{error}</pre>
                }
                className="mb-4"
              />
            )}

            {/* Results */}
            <div>
              <h2 className="text-xl font-semibold mb-2">Results</h2>

              {sentences.length === 0 ? (
                <Text type="secondary">
                  No results yet. Paste text and click “Translate (fake)”.
                </Text>
              ) : (
                <ol className="list-decimal pl-5 space-y-3">
                  {sentences.map((s, idx) => (
                    <li key={idx}>
                      <div>
                        <Text strong>Original:</Text> <Text>{s.original}</Text>
                      </div>
                      <div>
                        <Text strong>Translation:</Text>{" "}
                        <Text>{s.translation}</Text>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      {/* </div> */}
    </div>
  );
}
