import { createRoot } from "react-dom/client";
import App from "./tempo-training.jsx";

/* Claudeアーティファクトの window.storage 互換シム(localStorage版) */
const PREFIX = "kt:";
window.storage = {
  async get(key) {
    const v = localStorage.getItem(PREFIX + key);
    if (v == null) throw new Error("not found");
    return { key, value: v, shared: false };
  },
  async set(key, value) {
    localStorage.setItem(PREFIX + key, value);
    return { key, value, shared: false };
  },
  async delete(key) {
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: true, shared: false };
  },
  async list(prefix = "") {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
    }
    return { keys, prefix, shared: false };
  },
};

createRoot(document.getElementById("root")).render(<App />);
