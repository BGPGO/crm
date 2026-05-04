import { supabase } from "@/lib/supabase";

const BASE_URL = "/api";

/**
 * Reads the active brand at request time (fresh, never cached) so every fetch
 * uses the brand currently selected in the UI. Returns 'BGP' as default.
 *
 * SSR-safe: returns 'BGP' on the server.
 */
function getActiveBrand(): "BGP" | "AIMO" {
  if (typeof window === "undefined") return "BGP";
  try {
    const stored = window.localStorage.getItem("crm.brand");
    if (stored === "AIMO" || stored === "BGP") return stored;
  } catch {
    // ignore (storage disabled, etc.)
  }
  try {
    const match = document.cookie.match(/(?:^|;\s*)crm-brand=(BGP|AIMO)/);
    if (match) return match[1] as "BGP" | "AIMO";
  } catch {
    // ignore
  }
  return "BGP";
}

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

// Invalidate/refresh cache on auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT") {
    cachedToken = null;
    tokenExpiresAt = 0;
  } else if (event === "TOKEN_REFRESHED" && session?.access_token) {
    // Update cache with the fresh token immediately
    cachedToken = session.access_token;
    tokenExpiresAt = session.expires_at
      ? session.expires_at * 1000 - 60_000
      : Date.now() + 4 * 60 * 1000;
  }
});

export async function getAuthHeaders(): Promise<Record<string, string>> {
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
      "X-Brand": getActiveBrand(),
      ...authHeaders,
      ...headers,
    },
  };

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  let response = await fetch(`${BASE_URL}${path}`, config);

  // On 401: clear cached token, refresh from Supabase, retry once
  if (response.status === 401 && cachedToken) {
    cachedToken = null;
    tokenExpiresAt = 0;

    // Try to refresh the session
    const { data: refreshData } = await supabase.auth.refreshSession();
    if (refreshData.session?.access_token) {
      cachedToken = refreshData.session.access_token;
      tokenExpiresAt = refreshData.session.expires_at
        ? refreshData.session.expires_at * 1000 - 60_000
        : Date.now() + 4 * 60 * 1000;

      // Retry the request with the new token (re-read brand in case it changed)
      config.headers = {
        ...config.headers,
        "X-Brand": getActiveBrand(),
        Authorization: `Bearer ${cachedToken}`,
      };
      response = await fetch(`${BASE_URL}${path}`, config);
    } else {
      // Session is truly expired — sign out
      await supabase.auth.signOut();
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
      throw new ApiError('Sessão expirada', 401);
    }
  }

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

  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body }),
};

export { ApiError };
