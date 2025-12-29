import { useEffect, useRef, useState } from "react";
import { Typography, Divider } from "antd";
import { useTranslation } from "../context/translationContext";
import SelectionMenu from "./SelectionMenu";
const { Text } = Typography;

export default function TranslationsList() {
  const {
    state: { sentences },
  } = useTranslation();
  const containerRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [options, setOptions] = useState([]);

  function closeMenu() {
    setMenuOpen(false);
    setSelectedText("");
  }

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      closeMenu();
      return;
    }

    const text = sel.toString().trim();
    if (!text) {
      closeMenu();
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const range = sel.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    const node = commonAncestor.nodeType === 1 ? commonAncestor : commonAncestor.parentElement;

    if (!node || !container.contains(node)) {
      closeMenu();
      return;
    }

    const rect = range.getBoundingClientRect();
    const x = Math.min(rect.left, window.innerWidth -280);
    const y = rect.bottom + 8;

    setSelectedText(text);
    setMenuPos({x, y});
    setMenuOpen(true);
  }

  function handleLookUp() {
    console.log("lookup: ", selectedText, "options: ", options);
    closeMenu();
  }

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!menuOpen) return;

      if (!containerRef.current?.contains(e.target)) {
        closeMenu();
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [menuOpen]);

  if (!sentences.length) {
    return <Text type="secondary">No translations yet.</Text>;
  }
  return (
    <div ref={containerRef} onMouseUp={handleMouseUp}>
      <ol className="list-decimal pl-5 space-y-3">
        {sentences.map((s, idx) => (
          <li key={idx}>
            <div>
              <Text type="secondary" strong>
                Original:
              </Text>{" "}
              <Text type="secondary">{s.original}</Text>
            </div>
            <div>
              <Text strong>Translation:</Text> <Text>{s.translation}</Text>
            </div>
            <Divider />
          </li>
        ))}
      </ol>

      <SelectionMenu 
        open={menuOpen}
        x={menuPos.x}
        y={menuPos.y}
        options={options}
        setOptions={setOptions} 
        onLookUp={handleLookUp} 
        onCancel={closeMenu}
      />
    </div>
  );
}
