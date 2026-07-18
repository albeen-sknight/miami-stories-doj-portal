/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Discord OAuth and Session Authentication
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: Â© 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

import type { ActionPermission, LogicalPermission } from "@shotta-doj/shared";
import { audit } from "./audit";
import {
  BOOTSTRAP_TTL_SECONDS,
  clearCookie,
  clearSessionCookies,
  getCookie,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  sessionSetCookies,
  stateCookie
} from "./cookies";
import { randomToken, sha256 } from "./crypto";
import { avatarUrl, discordAuthorizeUrl, exchangeDiscordCode, fetchDiscordUser, fetchGuildMember, MissingEnvironmentError } from "./discord";
import { errorJson, json, redirect } from "./http";
import { deriveActionPermissions } from "./permissions";
import { syncProfessionalProfileForUser } from "./professionalProfiles";
import type { AuthContext, AuthUser, CachedRole, DiscordGuildMember, DiscordUser, Env, MeResponse, MaybeAuthContext } from "./types";

const SESSION_TTL_SECONDS = 60 * 60 * 6;
const OAUTH_STATE_TTL_SECONDS = 60 * 10;
const PRODUCTION_FRONTEND_ORIGINS = ["https://miami-stories-doj.pages.dev", "https://www.miami-stories-doj.pages.dev", "https://miami-stories-doj.pages.dev"] as const;
const PRODUCTION_API_ORIGINS = ["https://api.miami-stories-doj.example", "https://miami-stories-doj-api.example"] as const;
const LOCAL_FRONTEND_ORIGINS = ["http://localhost:5173"] as const;
const LOCAL_API_ORIGINS = ["http://localhost:8787", "http://127.0.0.1:8787"] as const;

export async function startDiscordAuth(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for Discord login state.", 503);
  try {
    ensureAuthStartEnv(env);
    const requestUrl = new URL(request.url);
    const state = randomToken(32);
    const stateHash = await sha256(state);
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_SECONDS * 1000).toISOString();
    const redirectPath = safeRedirectAfter(requestUrl.searchParams.get("redirect")) ?? "/";
    const frontendOrigin = frontendOriginFromRequest(request, env);
    const redirectAfter = buildFrontendUrl(frontendOrigin, redirectPath);
    const oauthRedirectUri = discordRedirectUriForRequest(request, env);
    await env.DB.prepare("INSERT INTO oauth_states (id, state_hash, redirect_after, expires_at) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), stateHash, redirectAfter, expiresAt)
      .run();
    const authorizeUrl = discordAuthorizeUrl(env, state, oauthRedirectUri);
    console.log(JSON.stringify({ event: "oauth_login_url_generated", redirect_after: redirectAfter, oauth_redirect_uri: oauthRedirectUri }));
    const response = redirect(authorizeUrl);
    for (const cookie of clearSessionCookies(env)) {
      response.headers.append("set-cookie", cookie);
    }
    response.headers.append("set-cookie", stateCookie(state, env, OAUTH_STATE_TTL_SECONDS));
    return response;
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      return errorJson("MISSING_ENV", `Missing required authentication setting: ${cause.key}`, 500);
    }
    throw cause;
  }
}

export async function completeDiscordAuth(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for Discord login.", 503);
  console.log(JSON.stringify({ event: "oauth_callback_reached" }));
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = getCookie(request, OAUTH_STATE_COOKIE);
  if (!code || !state) {
    await audit(env, "AUTH_LOGIN_FAILED", { reason: "missing_code_or_state" });
    console.log(JSON.stringify({ event: "oauth_callback_failed", reason: "missing_code_or_state" }));
    return redirectWithAuthError(env, "callback_failed");
  }

  let actorUserId: string | null = null;
  try {
    ensureAuthCallbackEnv(env);
    const stateRow = await consumeState(env, state);
    if (!stateRow) {
      await audit(env, "AUTH_LOGIN_FAILED", { reason: "expired_or_missing_state" });
      console.log(JSON.stringify({ event: "oauth_state_validation_failed", reason: "expired_or_missing_state" }));
      return redirectWithAuthError(env, "expired_state");
    }
    if (cookieState && cookieState !== state) {
      await audit(env, "AUTH_LOGIN_FAILED", { reason: "invalid_oauth_state_cookie" });
      console.log(JSON.stringify({ event: "oauth_state_validation_failed", reason: "cookie_mismatch" }));
      return redirectWithAuthError(env, "invalid_state");
    }
    if (!cookieState) {
      console.log(JSON.stringify({ event: "oauth_state_cookie_missing", note: "continuing_with_db_state" }));
    } else {
      console.log(JSON.stringify({ event: "oauth_state_validated" }));
    }

    let accessToken: string;
    const oauthRedirectUri = discordRedirectUriForRequest(request, env);
    try {
      accessToken = await exchangeDiscordCode(env, code, oauthRedirectUri);
      console.log(JSON.stringify({ event: "oauth_token_exchange_success", oauth_redirect_uri: oauthRedirectUri }));
    } catch (cause) {
      console.log(JSON.stringify({ event: "oauth_token_exchange_failed", cause: String(cause), oauth_redirect_uri: oauthRedirectUri }));
      throw cause;
    }

    const discordUser = await fetchDiscordUser(accessToken);
    console.log(JSON.stringify({ event: "discord_user_fetched", discord_user_id: discordUser.id }));

    let guildMember: DiscordGuildMember | null = null;
    try {
      guildMember = await fetchGuildMember(env, discordUser.id);
      console.log(JSON.stringify({
        event: "discord_guild_member_lookup",
        discord_user_id: discordUser.id,
        found: guildMember !== null
      }));
    } catch (cause) {
      await audit(env, "AUTH_LOGIN_FAILED", { discord_id: discordUser.id, reason: "guild_role_fetch_failed" });
      console.log(JSON.stringify({
        event: "discord_guild_member_lookup_failed",
        discord_user_id: discordUser.id,
        cause: String(cause)
      }));
      return redirectWithAuthError(env, "guild_verification_failed");
    }
    if (!guildMember) {
      await audit(env, "AUTH_LOGIN_FAILED", { discord_id: discordUser.id, reason: "not_in_guild" });
      console.log(JSON.stringify({ event: "discord_guild_member_not_found", discord_user_id: discordUser.id }));
      return redirectWithAuthError(env, "not_in_guild");
    }

    const user = await upsertUser(env, discordUser);
    actorUserId = user.id;
    await refreshRoleCacheForMember(env, user.id, guildMember);
    await syncProfessionalProfileForUser(env, user, guildMember.roles);
    const authContext = await buildAuthContext(env, user, crypto.randomUUID());
    const sessionToken = randomToken(48);
    const sessionHash = await sha256(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
    const sessionId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO sessions (id, user_id, session_hash, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
      .bind(sessionId, user.id, sessionHash, expiresAt, new Date().toISOString())
      .run();

    const bootstrapToken = randomToken(48);
    const bootstrapHash = await sha256(bootstrapToken);
    const bootstrapExpiresAt = new Date(Date.now() + BOOTSTRAP_TTL_SECONDS * 1000).toISOString();
    await env.DB.prepare(
      "INSERT INTO session_bootstrap_tokens (id, token_hash, session_id, expires_at) VALUES (?, ?, ?, ?)"
    )
      .bind(crypto.randomUUID(), bootstrapHash, sessionId, bootstrapExpiresAt)
      .run();
    console.log(JSON.stringify({ event: "bootstrap_token_created", session_id: sessionId, user_id: user.id }));

    await audit(
      env,
      "AUTH_LOGIN_SUCCESS",
      {
        discord_id: user.discordId,
        role_count: authContext.roles.length,
        permission_count: authContext.permissions.length,
        bootstrap_admin: authContext.isBootstrapAdmin
      },
      user.id
    );
    console.log(JSON.stringify({ event: "session_created", session_id: sessionId, user_id: user.id }));

    const redirectTarget = frontendRedirectTarget(stateRow.redirectAfter, env);
    const redirectUrl = new URL(redirectTarget);
    const redirectPath = `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
    const bootstrapUrl = buildFrontendUrl(
      redirectUrl.origin,
      `/auth/callback?bootstrap=${encodeURIComponent(bootstrapToken)}&redirect=${encodeURIComponent(redirectPath)}`
    );
    console.log(JSON.stringify({ event: "auth_callback_redirect", redirect_path: redirectPath, frontend_origin: redirectUrl.origin }));
    const response = redirect(bootstrapUrl);
    response.headers.append("set-cookie", clearCookie(OAUTH_STATE_COOKIE, env));
    return response;
  } catch (cause) {
    await audit(env, "AUTH_LOGIN_FAILED", { reason: "callback_error" }, actorUserId);
    if (cause instanceof MissingEnvironmentError) {
      return errorJson("MISSING_ENV", `Missing required authentication setting: ${cause.key}`, 500);
    }
    console.error(JSON.stringify({ event: "auth_callback_failed", cause: String(cause) }));
    return redirectWithAuthError(env, "callback_failed");
  }
}

export async function bootstrapSession(request: Request, env: Env): Promise<Response> {
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for session bootstrap.", 503);
  console.log(JSON.stringify({ event: "session_bootstrap_reached" }));
  let body: { token?: string };
  try {
    body = (await request.json()) as { token?: string };
  } catch {
    console.log(JSON.stringify({ event: "session_bootstrap_failed", reason: "invalid_json_body" }));
    return errorJson("INVALID_BODY", "Session bootstrap requires a JSON body with a token.", 400);
  }
  const token = body.token?.trim();
  if (!token) {
    console.log(JSON.stringify({ event: "session_bootstrap_failed", reason: "missing_token" }));
    return errorJson("INVALID_BODY", "Session bootstrap token is required.", 400);
  }

  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT id, session_id as sessionId, expires_at as expiresAt, consumed_at as consumedAt FROM session_bootstrap_tokens WHERE token_hash = ?"
  )
    .bind(tokenHash)
    .first<{ id: string; sessionId: string; expiresAt: string; consumedAt: string | null }>();
  if (!row || row.consumedAt || new Date(row.expiresAt).getTime() <= Date.now()) {
    console.log(JSON.stringify({ event: "session_bootstrap_failed", reason: "invalid_or_expired_token" }));
    return errorJson("INVALID_BOOTSTRAP", "Login session expired. Please sign in with Discord again.", 401);
  }

  await env.DB.prepare("UPDATE session_bootstrap_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
  const session = await env.DB.prepare("SELECT id, user_id as userId, expires_at as expiresAt FROM sessions WHERE id = ?")
    .bind(row.sessionId)
    .first<{ id: string; userId: string; expiresAt: string }>();
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    console.log(JSON.stringify({ event: "session_bootstrap_failed", reason: "session_expired", session_id: row.sessionId }));
    return errorJson("INVALID_BOOTSTRAP", "Login session expired. Please sign in with Discord again.", 401);
  }

  const sessionToken = randomToken(48);
  const sessionHash = await sha256(sessionToken);
  await env.DB.prepare("UPDATE sessions SET session_hash = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(sessionHash, session.id)
    .run();

  console.log(JSON.stringify({ event: "session_bootstrap_success", session_id: session.id, user_id: session.userId }));
  const response = json({ ok: true, authenticated: true });
  const cookies = sessionSetCookies(sessionToken, env, SESSION_TTL_SECONDS);
  for (const cookie of cookies) {
    response.headers.append("set-cookie", cookie);
  }
  console.log(JSON.stringify({ event: "session_cookie_set", session_id: session.id, variants: cookies.length }));
  return response;
}

export async function logout(request: Request, env: Env): Promise<Response> {
  if (env.DB) {
    const token = getCookie(request, SESSION_COOKIE);
    if (token) {
      const sessionHash = await sha256(token);
      const row = await env.DB.prepare("SELECT id, user_id as userId FROM sessions WHERE session_hash = ?")
        .bind(sessionHash)
        .first<{ id: string; userId: string }>();
      await env.DB.prepare("DELETE FROM sessions WHERE session_hash = ?").bind(sessionHash).run();
      await audit(env, "AUTH_LOGOUT", { route: new URL(request.url).pathname }, row?.userId ?? null);
    }
  }
  const response = json({ ok: true });
  for (const cookie of clearSessionCookies(env)) {
    response.headers.append("set-cookie", cookie);
  }
  console.log(JSON.stringify({ event: "session_cookie_cleared" }));
  console.log(JSON.stringify({ event: "logout_success" }));
  return response;
}

export async function me(request: Request, env: Env): Promise<Response> {
  const ctx = await authenticate(request, env);
  console.log(JSON.stringify({
    event: ctx.authenticated ? "api_me_authenticated" : "api_me_unauthenticated",
    authenticated: ctx.authenticated,
    user_id: ctx.authenticated ? ctx.user.id : null
  }));
  return json(toMeResponse(ctx));
}

export async function refreshOwnRoles(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAuth(request, env);
  try {
    const member = await fetchGuildMember(env, ctx.user.discordId);
    if (!member) {
      return errorJson(
        "NOT_IN_GUILD",
        "Unable to verify your Miami Stories Discord membership. Please make sure you are in the server and try again.",
        403
      );
    }
    await refreshRoleCacheForMember(env, ctx.user.id, member);
    await syncProfessionalProfileForUser(env, ctx.user, member.roles);
    const refreshed = await buildAuthContext(env, ctx.user, ctx.sessionId);
    await audit(
      env,
      "AUTH_REFRESH_ROLES",
      { discord_id: ctx.user.discordId, role_count: refreshed.roles.length, permission_count: refreshed.permissions.length },
      ctx.user.id
    );
    return json(toMeResponse(refreshed));
  } catch (cause) {
    await audit(env, "AUTH_REFRESH_ROLES", { discord_id: ctx.user.discordId, reason: "failed_closed" }, ctx.user.id);
    console.warn(JSON.stringify({ event: "refresh_roles_failed", cause: String(cause) }));
    return errorJson("ROLE_REFRESH_FAILED", "Discord roles could not be refreshed. Privileged access remains unchanged.", 502);
  }
}

export async function authenticate(request: Request, env: Env): Promise<MaybeAuthContext> {
  if (!env.DB) return { authenticated: false };
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return { authenticated: false };
  const sessionHash = await sha256(token);
  const session = await env.DB.prepare(
    "SELECT id, user_id as userId, expires_at as expiresAt FROM sessions WHERE session_hash = ?"
  )
    .bind(sessionHash)
    .first<{ id: string; userId: string; expiresAt: string }>();
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE session_hash = ?").bind(sessionHash).run();
    return { authenticated: false };
  }
  const user = await getUserById(env, session.userId);
  if (!user) return { authenticated: false };
  await env.DB.prepare("UPDATE sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE id = ?").bind(session.id).run();
  return buildAuthContext(env, user, session.id);
}

export async function requireAuth(request: Request, env: Env): Promise<AuthContext> {
  const ctx = await authenticate(request, env);
  if (!ctx.authenticated) {
    await audit(env, "AUTH_FORBIDDEN", { route: new URL(request.url).pathname, reason: "unauthenticated" });
    throw new AuthRequiredError();
  }
  return ctx;
}

async function buildAuthContext(env: Env, user: AuthUser, sessionId: string): Promise<AuthContext> {
  const roles = await getCachedRoles(env, user.id);
  const mappedPermissions = await getMappedPermissions(env, roles.map((role) => role.discordRoleId));
  const permissions = new Set<LogicalPermission>(["PUBLIC", ...mappedPermissions]);
  const isBootstrapAdmin = bootstrapAdminIds(env).includes(user.discordId);
  if (isBootstrapAdmin) {
    permissions.add("ADMIN");
    permissions.add("CHIEF_JUSTICE");
  }
  const logical = [...permissions].sort() as LogicalPermission[];
  return {
    authenticated: true,
    sessionId,
    user,
    roles,
    permissions: logical,
    actionPermissions: deriveActionPermissions(logical),
    isBootstrapAdmin
  };
}

async function upsertUser(env: Env, discordUser: DiscordUser): Promise<AuthUser> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const displayName = discordUser.global_name ?? discordUser.username;
  const userAvatarUrl = avatarUrl(discordUser);
  await env.DB!.prepare(
    `INSERT INTO users (id, discord_id, discord_username, discord_global_name, display_name, avatar_url, email, last_login_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET
       discord_username = excluded.discord_username,
       discord_global_name = excluded.discord_global_name,
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       email = excluded.email,
       last_login_at = excluded.last_login_at,
       updated_at = excluded.updated_at`
  )
    .bind(id, discordUser.id, discordUser.username, discordUser.global_name, displayName, userAvatarUrl, discordUser.email ?? null, now, now)
    .run();
  const user = await env.DB!.prepare(
    "SELECT id, discord_id as discordId, discord_username as discordUsername, discord_global_name as discordGlobalName, display_name as displayName, avatar_url as avatarUrl, last_login_at as lastLoginAt FROM users WHERE discord_id = ?"
  )
    .bind(discordUser.id)
    .first<AuthUser>();
  if (!user) throw new Error("User upsert failed.");
  return user;
}

async function getUserById(env: Env, userId: string): Promise<AuthUser | null> {
  return env.DB!.prepare(
    "SELECT id, discord_id as discordId, discord_username as discordUsername, discord_global_name as discordGlobalName, display_name as displayName, avatar_url as avatarUrl, last_login_at as lastLoginAt FROM users WHERE id = ?"
  )
    .bind(userId)
    .first<AuthUser>();
}

async function refreshRoleCacheForMember(env: Env, userId: string, member: DiscordGuildMember | null): Promise<void> {
  await env.DB!.prepare("DELETE FROM user_role_cache WHERE user_id = ?").bind(userId).run();
  if (!member) return;
  for (const roleId of member.roles) {
    const mapping = await env.DB!.prepare("SELECT role_name as roleName FROM role_mappings WHERE discord_role_id = ?")
      .bind(roleId)
      .first<{ roleName: string }>();
    await env.DB!.prepare("INSERT INTO user_role_cache (id, user_id, discord_role_id, role_name) VALUES (?, ?, ?, ?)")
      .bind(crypto.randomUUID(), userId, roleId, mapping?.roleName ?? null)
      .run();
  }
}

async function getCachedRoles(env: Env, userId: string): Promise<CachedRole[]> {
  const result = await env.DB!.prepare(
    `SELECT urc.discord_role_id as discordRoleId,
      COALESCE(rm.role_name, urc.role_name) as roleName,
      urc.cached_at as cachedAt
     FROM user_role_cache urc
     LEFT JOIN role_mappings rm ON rm.discord_role_id = urc.discord_role_id
     WHERE urc.user_id = ?
     ORDER BY urc.cached_at DESC`
  )
    .bind(userId)
    .all<CachedRole>();
  return result.results;
}

async function getMappedPermissions(env: Env, roleIds: string[]): Promise<LogicalPermission[]> {
  if (roleIds.length === 0) return [];
  const permissions = new Set<LogicalPermission>();
  for (const roleId of roleIds) {
    const row = await env.DB!.prepare("SELECT permission_key as permissionKey FROM role_mappings WHERE discord_role_id = ? AND is_reference_only = 0")
      .bind(roleId)
      .first<{ permissionKey: LogicalPermission | null }>();
    if (row?.permissionKey) permissions.add(row.permissionKey);
  }
  return [...permissions];
}

async function consumeState(env: Env, state: string): Promise<{ redirectAfter: string | null } | null> {
  const stateHash = await sha256(state);
  const row = await env.DB!.prepare(
    "SELECT id, redirect_after as redirectAfter, expires_at as expiresAt, consumed_at as consumedAt FROM oauth_states WHERE state_hash = ?"
  )
    .bind(stateHash)
    .first<{ id: string; redirectAfter: string | null; expiresAt: string; consumedAt: string | null }>();
  if (!row || row.consumedAt || new Date(row.expiresAt).getTime() <= Date.now()) return null;
  await env.DB!.prepare("UPDATE oauth_states SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(row.id).run();
  return { redirectAfter: row.redirectAfter };
}

function toMeResponse(ctx: MaybeAuthContext): MeResponse {
  if (!ctx.authenticated) {
    return {
      authenticated: false,
      user: null,
      roles: [],
      permissions: [],
      actionPermissions: [],
      isBootstrapAdmin: false
    };
  }
  return {
    authenticated: true,
    user: ctx.user,
    roles: ctx.roles,
    permissions: ctx.permissions,
    actionPermissions: ctx.actionPermissions,
    isBootstrapAdmin: ctx.isBootstrapAdmin
  };
}

function ensureAuthStartEnv(env: Env): void {
  for (const key of ["DISCORD_CLIENT_ID", "DISCORD_REDIRECT_URI"] as const) {
    if (!env[key]) throw new MissingEnvironmentError(key);
  }
}

function ensureAuthCallbackEnv(env: Env): void {
  for (const key of ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_REDIRECT_URI", "DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"] as const) {
    if (!env[key]) throw new MissingEnvironmentError(key);
  }
}

function bootstrapAdminIds(env: Env): string[] {
  return (env.BOOTSTRAP_ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

function safeRedirectAfter(value: string | null): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return null;
}

function redirectWithAuthError(env: Env, reason: string): Response {
  return redirect(appUrl(env, `/unauthorized?reason=${encodeURIComponent(reason)}`));
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "AuthRequiredError";
  }
}

function appUrl(env: Env, path: string): string {
  return buildFrontendUrl(appBaseOrigin(env), path);
}

function appBaseOrigin(env: Env): string {
  return originFromUrl(env.PUBLIC_APP_URL) ?? PRODUCTION_FRONTEND_ORIGINS[0];
}

function frontendOriginFromRequest(request: Request, env: Env): string {
  const origin = request.headers.get("Origin");
  if (origin && allowedFrontendOrigins(env).has(origin)) return origin;

  const referer = request.headers.get("Referer");
  const refererOrigin = originFromUrl(referer ?? undefined);
  if (refererOrigin && allowedFrontendOrigins(env).has(refererOrigin)) return refererOrigin;

  return appBaseOrigin(env);
}

function frontendRedirectTarget(value: string | null, env: Env): string {
  if (!value) return appUrl(env, "/");
  if (value.startsWith("/") && !value.startsWith("//")) return appUrl(env, value);

  try {
    const url = new URL(value);
    if (allowedFrontendOrigins(env).has(url.origin)) return url.toString();
  } catch {
    return appUrl(env, "/");
  }

  return appUrl(env, "/");
}

function discordRedirectUriForRequest(request: Request, env: Env): string {
  const requestOrigin = new URL(request.url).origin;
  if (allowedApiOrigins(env).has(requestOrigin)) return `${requestOrigin}/api/auth/discord/callback`;
  return env.DISCORD_REDIRECT_URI ?? `${PRODUCTION_API_ORIGINS[0]}/api/auth/discord/callback`;
}

function allowedFrontendOrigins(env: Env): Set<string> {
  return new Set(
    [originFromUrl(env.PUBLIC_APP_URL), ...PRODUCTION_FRONTEND_ORIGINS, ...LOCAL_FRONTEND_ORIGINS].filter((origin): origin is string => Boolean(origin))
  );
}

function allowedApiOrigins(env: Env): Set<string> {
  return new Set(
    [originFromUrl(env.WORKER_APP_URL), originFromUrl(env.DISCORD_REDIRECT_URI), ...PRODUCTION_API_ORIGINS, ...LOCAL_API_ORIGINS].filter(
      (origin): origin is string => Boolean(origin)
    )
  );
}

function buildFrontendUrl(origin: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${origin.replace(/\/$/, "")}${normalizedPath}`;
}

function originFromUrl(value?: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
