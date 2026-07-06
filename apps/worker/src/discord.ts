import type { DiscordGuildMember, DiscordUser, Env } from "./types";

const DISCORD_API = "https://discord.com/api";

export function discordAuthorizeUrl(env: Env, state: string, redirectUri = requireEnv(env, "DISCORD_REDIRECT_URI")): string {
  const params = new URLSearchParams({
    client_id: requireEnv(env, "DISCORD_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds.members.read",
    state
  });
  return `${DISCORD_API}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeDiscordCode(env: Env, code: string, redirectUri = requireEnv(env, "DISCORD_REDIRECT_URI")): Promise<string> {
  const body = new URLSearchParams({
    client_id: requireEnv(env, "DISCORD_CLIENT_ID"),
    client_secret: requireEnv(env, "DISCORD_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  });
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) throw new Error(`Discord token exchange failed with ${response.status}`);
  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Discord token response did not include an access token.");
  return token.access_token;
}

export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`Discord user fetch failed with ${response.status}`);
  const user = (await response.json()) as DiscordUser;
  if (!user.id || !user.username) throw new Error("Discord user response was missing identity fields.");
  return user;
}

export async function fetchGuildMember(env: Env, discordUserId: string): Promise<DiscordGuildMember | null> {
  const guildId = requireEnv(env, "DISCORD_GUILD_ID");
  const botToken = requireEnv(env, "DISCORD_BOT_TOKEN");
  const response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordUserId}`, {
    headers: { authorization: `Bot ${botToken}` }
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Discord guild member fetch failed with ${response.status}`);
  return (await response.json()) as DiscordGuildMember;
}

export async function fetchBotUser(env: Env): Promise<DiscordUser> {
  const botToken = requireEnv(env, "DISCORD_BOT_TOKEN");
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { authorization: `Bot ${botToken}` }
  });
  if (!response.ok) throw new Error(`Discord bot user fetch failed with ${response.status}`);
  return (await response.json()) as DiscordUser;
}

export async function discordApi(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const botToken = requireEnv(env, "DISCORD_BOT_TOKEN");
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bot ${botToken}`,
      "content-type": "application/json",
      ...init.headers
    }
  });
}

export function avatarUrl(user: DiscordUser): string | null {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
}

export function requireEnv(env: Env, key: keyof Env): string {
  const value = env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new MissingEnvironmentError(String(key));
  }
  return value;
}

export class MissingEnvironmentError extends Error {
  constructor(public readonly key: string) {
    super(`Missing required environment variable: ${key}`);
  }
}

export async function assignMemberRole(
  env: Env,
  discordUserId: string,
  roleId: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const guildId = requireEnv(env, "DISCORD_GUILD_ID");
    const response = await discordApi(env, `/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, {
      method: "PUT"
    });
    if (response.ok) return { ok: true };
    const text = await response.text();
    return { ok: false, status: response.status, error: text || response.statusText };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Unknown error" };
  }
}
