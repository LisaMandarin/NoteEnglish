import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import ThemedApp from "./ThemedApp";
import "antd/dist/reset.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ThemedApp />
  </StrictMode>
);
