import type { ActionPermission, CurrentUserResponse, LogicalPermission } from "@shotta-doj/shared";

export interface Env {
  DB?: D1Database;
  PUBLIC_APP_URL?: string;
  WORKER_APP_URL?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_REDIRECT_URI?: string;
  DISCORD_BOT_TOKEN?: string;
  DISCORD_GUILD_ID?: string;
  DISCORD_PUBLIC_KEY?: string;
  SESSION_SECRET?: string;
  BOOTSTRAP_ADMIN_DISCORD_IDS?: string;
  LEGACY_BAR_EXAM_URL?: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  email?: string | null;
}

export interface DiscordGuildMember {
  user?: DiscordUser;
  roles: string[];
  nick?: string | null;
  avatar?: string | null;
}

export interface AuthUser {
  id: string;
  discordId: string;
  discordUsername: string;
  discordGlobalName: string | null;
  displayName: string;
  avatarUrl: string | null;
  lastLoginAt: string | null;
}

export interface CachedRole {
  discordRoleId: string;
  roleName: string | null;
  cachedAt: string;
}

export interface AuthContext {
  authenticated: true;
  sessionId: string;
  user: AuthUser;
  roles: CachedRole[];
  permissions: LogicalPermission[];
  actionPermissions: ActionPermission[];
  isBootstrapAdmin: boolean;
}

export type MaybeAuthContext = AuthContext | { authenticated: false };

export type MeResponse = CurrentUserResponse;
