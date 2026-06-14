import { NextRequest, NextResponse } from "next/server";

const AUTH_ROUTES = ["/login", "/register"];

const STAFF_ONLY_ROUTES = ["/audit"];

const ADMIN_ROUTES = ["/admin"];

function isProtectedPath(pathname: string): boolean {
  return (
    !AUTH_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/")) &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api") &&
    !pathname.includes(".")
  );
}

function getRoleFromCookie(request: NextRequest): string | undefined {
  const physicianRaw = request.cookies.get("auth_physician")?.value;
  if (!physicianRaw) return undefined;
  try {
    const decoded = decodeURIComponent(physicianRaw);
    const parsed = JSON.parse(decoded) as { role?: string };
    return parsed.role;
  } catch {
    return undefined;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const accessToken = request.cookies.get("access_token")?.value;
  const isAuthenticated = Boolean(accessToken);

  if (isAuthenticated && AUTH_ROUTES.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!isAuthenticated && isProtectedPath(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && STAFF_ONLY_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    const role = getRoleFromCookie(request);
    if (role === "PHYSICIAN") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  if (isAuthenticated && ADMIN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    const role = getRoleFromCookie(request);
    if (!role || role === "PHYSICIAN") {
      const url = new URL("/dashboard", request.url);
      url.searchParams.set("denied", "admin");
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
