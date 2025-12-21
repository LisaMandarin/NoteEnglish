import { useEffect, useState } from "react";
import { Input, Button, Alert, Typography } from "antd";

const { Text } = Typography;
const { TextArea } = Input;

const API_BASE = "http://127.0.0.1:8000";

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
    <div
      style={{
        width: "100%",
        minHeight: "100vh",
        margin: 0,
        padding: "2.5rem 3rem",
        boxSizing: "border-box",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont",
      }}
    >
      {/* Title */}
      <h1 style={{ marginBottom: 4 }}>NoteEnglish</h1>

      {/* Backend status */}
      <div style={{ marginBottom: 16 }}>
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
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Textarea */}
      <div style={{ marginBottom: 12 }}>
        <Text strong>Paste a passage:</Text>
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="Paste a passage here..."
          style={{ marginTop: 8 }}
        />
      </div>

      {/* Buttons */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
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
          description={<pre style={{ margin: 0 }}>{error}</pre>}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Results */}
      <div>
        <h2>Results</h2>

        {sentences.length === 0 ? (
          <Text type="secondary">
            No results yet. Paste text and click “Translate (fake)”.
          </Text>
        ) : (
          <ol style={{ paddingLeft: 20 }}>
            {sentences.map((s, idx) => (
              <li key={idx} style={{ marginBottom: 12 }}>
                <div>
                  <Text strong>Original:</Text>{" "}
                  <Text>{s.original}</Text>
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
  );
}
