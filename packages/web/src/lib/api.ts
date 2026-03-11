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

async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  const config: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
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
