import { Button } from "antd";

export default function SelectionMenu({ open, x, y, options, setOptions, onLookUp, onCancel }) {
  if (!open) return null;

  function toggle(value) {
    setOptions((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  const items = [
    { value: "zh", label: "中文" },
    { value: "en", label: "英文" },
    { value: "ex", label: "例句" },
    { value: "level", label: "程度" },
  ];

  return (
    <div
      style={{ position: "fixed", left: x, top: y, zIndex: 9999 }}
      className="select-none"
    >
      <div className="w-65 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-lg p-3">
        <div className="mb-2 text-sm font-semibold text-[var(--text-main)]">
          查單字選項
        </div>
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => {
            const checked = options.includes(item.value);

            return (
              <label
                key={item.value}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-black/5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item.value)}
                  className="h-4 w-4 accent-[var(--card-border)]"
                />
                <span className="text-sm">{item.label}</span>
              </label>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
            <Button 
                type="primary" 
                onClick={onLookUp}
                className="flex-1 rounded-xl !bg-[var(--card-border)] !border-[var(--card-border)] !text-white"
            >
                查單字
            </Button>
            <Button
                onClick={onCancel}
                className="flex-1 rounded-xl !border-[var(--card-border)] !text-[var(--text-main)]"
            >
                取消
            </Button>

        </div>
      </div>
    </div>
  );
}
