import { supabase } from "@/lib/supabase";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ── Token cache ──────────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

// Invalidate cache on sign-out
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    cachedToken = null;
    tokenExpiresAt = 0;
  }
});

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const now = Date.now();
    if (cachedToken && tokenExpiresAt > now) {
      return { Authorization: `Bearer ${cachedToken}` };
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      cachedToken = session.access_token;
      // Cache until 60s before expiry (session.expires_at is in seconds)
      tokenExpiresAt = session.expires_at
        ? session.expires_at * 1000 - 60_000
        : now + 4 * 60 * 1000;
      return { Authorization: `Bearer ${cachedToken}` };
    }
  } catch {
    // If we can't get the session, proceed without auth header
  }
  return {};
}

async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  const authHeaders = await getAuthHeaders();

  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...headers,
    },
  };

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, config);

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = await response.json();
      message = data?.message || message;
    } catch {
      // ignore
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  get: <T>(path: string, headers?: Record<string, string>) =>
    request<T>(path, { method: "GET", headers }),

  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body }),

  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body }),

  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body }),

  delete: <T>(path: string) =>
    request<T>(path, { method: "DELETE" }),
};

export { ApiError };
