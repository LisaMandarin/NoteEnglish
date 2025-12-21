import { useEffect, useState } from "react";

function App() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    fetch("http://127.0.0.1:8000/health")
    .then((res) => res.json())
    .then((data) => setStatus(data.status))
    .catch(() => setStatus("error"));
  }, []);

  return (
    <div style={{ padding: "2rem"}}>
      <h1>NoteEnglish</h1>
      <p>
        Backend status: <strong>{status}</strong>
      </p>
    </div>
  );
}

export default App;