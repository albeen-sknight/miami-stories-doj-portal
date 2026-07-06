import type { Env } from "./types";

export const SESSION_COOKIE = "scdoj_session";
export const OAUTH_STATE_COOKIE = "scdoj_oauth_state";

const BOOTSTRAP_TTL_SECONDS = 60;

export function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return rawValue.join("=");
  }
  return null;
}

export function sessionCookie(value: string, env: Env, maxAgeSeconds = 60 * 60 * 6): string {
  return buildCookie(SESSION_COOKIE, value, env, maxAgeSeconds, true);
}

export function sessionSetCookies(value: string, env: Env, maxAgeSeconds = 60 * 60 * 6): string[] {
  if (!isProductionLike(env)) return [sessionCookie(value, env, maxAgeSeconds)];
  return [
    buildCookie(SESSION_COOKIE, value, env, maxAgeSeconds, true),
    buildCookie(SESSION_COOKIE, value, env, maxAgeSeconds, false)
  ];
}

export function stateCookie(value: string, env: Env, maxAgeSeconds = 60 * 10): string {
  return buildCookie(OAUTH_STATE_COOKIE, value, env, maxAgeSeconds, false);
}

export function clearCookie(name: string, env: Env): string {
  return buildCookie(name, "", env, 0, name === SESSION_COOKIE);
}

export function clearSessionCookies(env: Env): string[] {
  if (!isProductionLike(env)) return [clearCookie(SESSION_COOKIE, env)];
  return [
    buildCookie(SESSION_COOKIE, "", env, 0, true),
    buildCookie(SESSION_COOKIE, "", env, 0, false)
  ];
}

function buildCookie(name: string, value: string, env: Env, maxAgeSeconds: number, partitioned: boolean): string {
  if (isProductionLike(env)) {
    const attributes = ["SameSite=None", "Secure"];
    if (partitioned) attributes.push("Partitioned");
    return `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; ${attributes.join("; ")}`;
  }
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax`;
}

function isProductionLike(env: Env): boolean {
  const appUrl = env.PUBLIC_APP_URL ?? "";
  const workerUrl = env.WORKER_APP_URL ?? "";
  return appUrl.startsWith("https://") || workerUrl.startsWith("https://");
}

export { BOOTSTRAP_TTL_SECONDS };
