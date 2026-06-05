const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/v1";

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
    const url = new URL(`${this.baseUrl}${path}`);
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
    retry = true,
  ): Promise<T> {
    const { params, body, headers: customHeaders } = options;
    const url = this.buildUrl(path, params);

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...customHeaders,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });

    if (response.status === 401) {
      if (retry && path !== "/auth/refresh" && path !== "/auth/login") {
        const refreshed = await this.tryRefresh();
        if (refreshed) {
          return this.request<T>(method, path, options, false);
        }
      }
      if (typeof window !== "undefined") window.location.href = "/login";
      throw new ApiError(401, "Sessão expirada. Faça login novamente.");
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        (errorBody as { message?: string }).message ?? `Erro ${response.status}`,
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

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async tryRefresh(): Promise<boolean> {
    const response = await fetch(this.buildUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    return response.ok;
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
