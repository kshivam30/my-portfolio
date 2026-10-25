const SESSION_KEY = "atlas.session";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function authRequest(path, body, token = getToken()) {
  const response = await fetch(`${API_BASE}/auth/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.detail || "Sign-in failed.");
  return result;
}

export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}

export function getToken() {
  return sessionStorage.getItem("atlas.token");
}

function saveSession(session, token = null) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  if (token) sessionStorage.setItem("atlas.token", token);
  return session;
}

export async function signIn(key) {
  const result = await authRequest("login", { key }, null);
  return saveSession({ username: "Owner", guest: false }, result.token);
}

export async function signInAsGuest() {
  return saveSession({ username: "Guest", guest: true });
}

export async function checkSession() {
  if (!getToken()) return null;
  try {
    const result = await authRequest("session");
    return result.authenticated ? saveSession({ username: "Owner", guest: false }) : null;
  } catch {
    return null;
  }
}

export function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem("atlas.token");
}
