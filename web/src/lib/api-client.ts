import { messages } from "@/lib/messages";
import {
  LEGAL_ACCEPTANCE_PATH,
  TERMS_ACCEPTANCE_REQUIRED_STATUS,
  legalAcceptanceHref,
} from "@/lib/legal-paths";

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
// CC-905 — mesmo cuidado para a tela de aceite dos termos (428).
let redirectingToTermsAcceptance = false;

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
    // CC-905 — a conta não aceitou a versão vigente dos termos e da política
    // (LEGAL_TERMS_V2): toda rota protegida responde 428 até o aceite. Leva à
    // tela de aceite, que devolve o médico para onde ele estava.
    if (response.status === TERMS_ACCEPTANCE_REQUIRED_STATUS) {
      if (
        typeof window !== "undefined" &&
        !window.location.pathname.startsWith(LEGAL_ACCEPTANCE_PATH) &&
        !redirectingToTermsAcceptance
      ) {
        redirectingToTermsAcceptance = true;
        window.location.href = legalAcceptanceHref(window.location.pathname);
      }
      const termsBody = (await response.json().catch(() => ({}))) as { message?: string };
      throw new ApiError(
        response.status,
        termsBody.message ?? messages.errors.httpError(response.status),
      );
    }

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as {
        message?: string;
        code?: unknown;
      };
      throw new ApiError(
        response.status,
        errorBody.message ?? messages.errors.httpError(response.status),
        typeof errorBody.code === "string" ? errorBody.code : undefined,
        errorBody,
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
  /**
   * `code` do corpo do erro, quando a API manda um (ex.: `BETA_INVITE_REQUIRED`,
   * CC-702): distingue recusas com o mesmo status sem comparar a mensagem.
   */
  code: string | undefined;
  /**
   * Corpo JSON da resposta de erro, para quem precisa de mais que a mensagem
   * (ex.: os `issues` do 422 da correção de um cartão — CC-404). Não tipado:
   * quem lê valida a forma.
   */
  body: unknown;

  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export const apiClient = new ApiClient(BASE_URL);
