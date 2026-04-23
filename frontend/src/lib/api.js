import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const API = `${BASE}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("pos_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export function wsUrl() {
  const u = new URL(BASE);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/api/ws";
  return u.toString();
}
