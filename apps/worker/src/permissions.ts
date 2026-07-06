import type { ActionPermission, LogicalPermission } from "@shotta-doj/shared";
import type { AuthContext } from "./types";

const ALL_ACTIONS: ActionPermission[] = [
  "VIEW_DASHBOARD",
  "SUBMIT_SERVICE_REQUEST",
  "VIEW_OWN_REQUESTS",
  "MANAGE_REQUESTS",
  "CREATE_DOCKET",
  "PUBLISH_DOCKET",
  "START_BAR_EXAM",
  "REVIEW_BAR_EXAMS",
  "MANAGE_RESOURCES",
  "MANAGE_FAQ",
  "MANAGE_ATTORNEY_REGISTRY",
  "MANAGE_ROLE_MAPPINGS",
  "MANAGE_DISCORD_CHANNELS",
  "VIEW_AUDIT_LOGS",
  "ADMIN"
];

const ACTIONS_BY_LOGICAL: Record<LogicalPermission, ActionPermission[]> = {
  PUBLIC: [],
  CIVILIAN: ["SUBMIT_SERVICE_REQUEST", "VIEW_OWN_REQUESTS"],
  BAR_CANDIDATE: ["START_BAR_EXAM"],
  BAR_ELIGIBLE: ["START_BAR_EXAM"],
  BAR_ACTIVE: ["VIEW_DASHBOARD"],
  PUBLIC_DEFENDER_CERTIFIED: ["VIEW_DASHBOARD"],
  DEFENSE_ATTORNEY: ["VIEW_DASHBOARD"],
  PROSECUTOR: ["VIEW_DASHBOARD", "MANAGE_REQUESTS", "CREATE_DOCKET"],
  JUDGE: ["VIEW_DASHBOARD", "CREATE_DOCKET", "PUBLISH_DOCKET", "MANAGE_REQUESTS"],
  JUSTICE: ["VIEW_DASHBOARD", "CREATE_DOCKET", "PUBLISH_DOCKET", "MANAGE_REQUESTS", "VIEW_AUDIT_LOGS"],
  BAR_ASSOCIATION_MEMBER: ["VIEW_DASHBOARD", "REVIEW_BAR_EXAMS"],
  CHIEF_JUSTICE: [
    "VIEW_DASHBOARD",
    "CREATE_DOCKET",
    "PUBLISH_DOCKET",
    "MANAGE_REQUESTS",
    "REVIEW_BAR_EXAMS",
    "MANAGE_RESOURCES",
    "MANAGE_FAQ",
    "MANAGE_ATTORNEY_REGISTRY",
    "MANAGE_ROLE_MAPPINGS",
    "MANAGE_DISCORD_CHANNELS",
    "VIEW_AUDIT_LOGS",
    "ADMIN"
  ],
  ADMIN: ALL_ACTIONS,
  REVIEW_BAR_EXAMS: ["REVIEW_BAR_EXAMS"]
};

export function deriveActionPermissions(logicalPermissions: LogicalPermission[]): ActionPermission[] {
  if (logicalPermissions.includes("ADMIN")) return ALL_ACTIONS;
  const actions = new Set<ActionPermission>();
  for (const permission of logicalPermissions) {
    for (const action of ACTIONS_BY_LOGICAL[permission] ?? []) actions.add(action);
  }
  return [...actions].sort();
}

export function hasActionPermission(ctx: AuthContext, permission: ActionPermission): boolean {
  return ctx.actionPermissions.includes("ADMIN") || ctx.actionPermissions.includes(permission);
}

export function hasLogicalPermission(ctx: AuthContext, permission: LogicalPermission): boolean {
  return ctx.permissions.includes("ADMIN") || ctx.permissions.includes(permission);
}

export function hasAnyActionPermission(ctx: AuthContext, permissions: ActionPermission[]): boolean {
  return permissions.some((permission) => hasActionPermission(ctx, permission));
}

export function requirePermission(ctx: AuthContext, permission: ActionPermission): AuthContext {
  if (!hasActionPermission(ctx, permission)) throw new PermissionError(permission);
  return ctx;
}

export function requireAnyPermission(ctx: AuthContext, permissions: ActionPermission[]): AuthContext {
  if (!hasAnyActionPermission(ctx, permissions)) throw new PermissionError(permissions.join(","));
  return ctx;
}

export class PermissionError extends Error {
  constructor(public readonly permission: string) {
    super(`Missing required permission: ${permission}`);
    this.name = "PermissionError";
  }
}
