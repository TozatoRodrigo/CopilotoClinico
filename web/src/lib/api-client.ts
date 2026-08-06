import { messages } from "@/lib/messages";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/v1";

// Exportado para usos fora do ApiClient (ex.: hrefs de download que precisam
// apontar para a mesma origem/prefixo `/v1` roteado pelo Traefik ao backend —
// um link relativo a `/api/...` cairia no catch-all do Next.js e daria 404).
export const API_BASE_URL = BASE_URL;

// A page can have several queries in flight when the access token expires
// (e.g. the dashboard's 3 parallel fetches). Without this guard, each 401
// independently assigns `window.location.href`, racing several redirects
// against each other and producing the flapping/looping reload the browser
// shows while none of them settle.
let redirectingToLogin = false;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  params?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url = new URL(`${this.baseUrl}${path}`, base);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    return url.toString();
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { params, body, headers: customHeaders } = options;
    const url = this.buildUrl(path, params);

    const headers: Record<string, string> = {
      ...customHeaders,
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith("/login") &&
        !redirectingToLogin
      ) {
        redirectingToLogin = true;
        window.location.href = "/login";
      }
      throw new ApiError(401, messages.errors.sessionExpired);
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        (errorBody as { message?: string }).message ?? messages.errors.httpError(response.status),
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", path, { params });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, { body });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, { body });
  }

  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("DELETE", path, { body });
  }
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const apiClient = new ApiClient(BASE_URL);
