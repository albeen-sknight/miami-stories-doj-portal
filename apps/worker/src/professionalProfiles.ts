import type {
  AttorneyProfileKind,
  AttorneyResponsibility,
  MyProfessionalProfileResponse,
  ProfessionalProfileAdminRecord,
  ProfessionalProfileInput,
  ProfessionalProfileSyncResponse
} from "@shotta-doj/shared";
import { audit } from "./audit";
import { requireAuth } from "./auth";
import { avatarUrl, discordApi, fetchGuildMember, requireEnv } from "./discord";
import { errorJson, json } from "./http";
import { requirePermission } from "./permissions";
import type { AuthContext, AuthUser, CachedRole, DiscordGuildMember, Env } from "./types";

const BRANCH_ROLES = [
  { roleId: "1523778635104780429", branch: "Judicial Branch", division: "Judicial Division", profileKind: "JUDICIAL_OFFICER" as const },
  { roleId: "1523779395716776016", branch: "Executive / Prosecutorial Branch", division: "Executive / Prosecutorial Division", profileKind: "ATTORNEY" as const },
  { roleId: "1523782369461403888", branch: "Defense Branch", division: "Defense Division", profileKind: "ATTORNEY" as const }
] as const;

const BRANCH_LABELS = BRANCH_ROLES.map((role) => role.branch);
const MAX_SHORT = 120;
const MAX_MEDIUM = 280;
const MAX_LONG = 4000;

type ProfessionalProfileSyncAction = "created" | "updated" | "inactive" | "none" | "skipped";

interface ProfessionalProfileSyncResult {
  action: ProfessionalProfileSyncAction;
  profileId?: string;
}

export function professionalProfileAffiliations(roles: CachedRole[] | string[]): string[] {
  const roleIds = roles.map((role) => typeof role === "string" ? role : role.discordRoleId);
  return BRANCH_ROLES.filter((role) => roleIds.includes(role.roleId)).map((role) => role.branch);
}

export function hasProfessionalProfileEligibility(ctx: AuthContext): boolean {
  return professionalProfileAffiliations(ctx.roles).length > 0;
}

export async function syncProfessionalProfileForUser(env: Env, user: AuthUser, roles: CachedRole[] | string[]): Promise<ProfessionalProfileSyncResult> {
  if (!env.DB) return { action: "skipped" };
  const affiliations = professionalProfileAffiliations(roles);
  const existing = await loadProfileByOwner(env, user.id, user.discordId);
  if (affiliations.length === 0) {
    if (existing) {
      await env.DB.prepare(
        "UPDATE attorney_profiles SET status = 'inactive', is_public = 0, affiliations_json = '[]', last_role_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      )
        .bind(existing.id)
        .run();
      return { action: "inactive", profileId: existing.id };
    }
    return { action: "none" };
  }

  const primary = affiliations[0];
  const branchConfig = BRANCH_ROLES.find((role) => role.branch === primary) ?? BRANCH_ROLES[0];
  if (!existing) {
    const id = crypto.randomUUID();
    const slug = await uniqueProfileSlug(env, user.displayName, null);
    await env.DB.prepare(
      `INSERT INTO attorney_profiles (
        id, user_id, discord_user_id, display_name, profile_slug, title, short_title, office, division, branch,
        affiliations_json, profile_kind, bar_number, practice_areas_json, status, contact, is_public,
        biography_markdown, experience_markdown, education_markdown, achievements_markdown, professional_history_markdown,
        profile_image_url, responsibilities_json, sort_order, created_at, updated_at, last_role_sync_at
      ) VALUES (?, ?, ?, ?, ?, '', ?, '', ?, ?, ?, ?, NULL, '[]', 'draft', '', 0, '', '', '', '', '', ?, '[]', 100, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
    )
      .bind(
        id,
        user.id,
        user.discordId,
        user.displayName,
        slug,
        primary,
        branchConfig.division,
        primary,
        JSON.stringify(affiliations),
        branchConfig.profileKind,
        user.avatarUrl
      )
      .run();
    await audit(env, "PROFESSIONAL_PROFILE_AUTO_PROVISIONED", { profile_id: id, branch: primary, affiliations: affiliations.join(", ") }, user.id);
    return { action: "created", profileId: id };
  }

  const nextStatus = existing.status === "inactive" ? "draft" : existing.status;
  await env.DB.prepare(
    `UPDATE attorney_profiles
     SET user_id = ?,
         discord_user_id = ?,
         branch = ?,
         affiliations_json = ?,
         profile_kind = CASE WHEN profile_kind IS NULL OR profile_kind = '' THEN ? ELSE profile_kind END,
         division = CASE WHEN division IS NULL OR division = '' THEN ? ELSE division END,
         profile_image_url = CASE WHEN profile_image_url IS NULL OR profile_image_url = '' THEN ? ELSE profile_image_url END,
         status = ?,
         is_public = CASE WHEN ? = 'published' THEN is_public ELSE 0 END,
         last_role_sync_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(
      user.id,
      user.discordId,
      primary,
      JSON.stringify(affiliations),
      branchConfig.profileKind,
      branchConfig.division,
      user.avatarUrl,
      nextStatus,
      nextStatus,
      existing.id
    )
    .run();
  return { action: "updated", profileId: existing.id };
}

export async function myProfessionalProfile(request: Request, env: Env): Promise<Response> {
  const ctx = await requireProfileEligible(request, env);
  await syncProfessionalProfileForUser(env, ctx.user, ctx.roles);
  const profile = await loadProfileByOwner(env, ctx.user.id, ctx.user.discordId);
  return json(myProfilePayload(ctx, profile ? mapAdminProfile(profile) : null));
}

export async function updateMyProfessionalProfile(request: Request, env: Env): Promise<Response> {
  const ctx = await requireProfileEligible(request, env);
  await syncProfessionalProfileForUser(env, ctx.user, ctx.roles);
  const profile = await loadProfileByOwner(env, ctx.user.id, ctx.user.discordId);
  if (!profile) return errorJson("PROFILE_NOT_FOUND", "Professional profile could not be provisioned.", 404);
  if (profile.discordUserId && profile.discordUserId !== ctx.user.discordId) return errorJson("FORBIDDEN", "You may edit only your own professional profile.", 403);

  const input = await parseProfileInput(request, { admin: false, affiliations: professionalProfileAffiliations(ctx.roles) });
  if (!input.ok) return errorJson("VALIDATION_ERROR", input.message, 400);
  const complete = profileReadyForPublication(input.value);
  if (input.value.status === "published" && !complete.ok) return errorJson("PROFILE_INCOMPLETE", complete.message, 400);
  await updateProfileRow(env, profile.id, input.value, { admin: false, ownerDiscordId: ctx.user.discordId });
  await audit(env, "PROFESSIONAL_PROFILE_SELF_UPDATED", { profile_id: profile.id, status: input.value.status }, ctx.user.id);
  const updated = await loadProfileById(env, profile.id);
  return json(myProfilePayload(ctx, updated ? mapAdminProfile(updated) : null));
}

export async function updateMyProfessionalProfileById(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = await requireProfileEligible(request, env);
  await syncProfessionalProfileForUser(env, ctx.user, ctx.roles);
  const profile = await loadProfileById(env, id);
  if (!profile) return errorJson("PROFILE_NOT_FOUND", "Professional profile not found.", 404);
  if (profile.discordUserId !== ctx.user.discordId) return errorJson("FORBIDDEN", "You may edit only your own professional profile.", 403);

  const input = await parseProfileInput(request, { admin: false, affiliations: professionalProfileAffiliations(ctx.roles) });
  if (!input.ok) return errorJson("VALIDATION_ERROR", input.message, 400);
  const complete = profileReadyForPublication(input.value);
  if (input.value.status === "published" && !complete.ok) return errorJson("PROFILE_INCOMPLETE", complete.message, 400);
  await updateProfileRow(env, profile.id, input.value, { admin: false, ownerDiscordId: ctx.user.discordId });
  await audit(env, "PROFESSIONAL_PROFILE_SELF_UPDATED", { profile_id: profile.id, status: input.value.status }, ctx.user.id);
  const updated = await loadProfileById(env, profile.id);
  return json(myProfilePayload(ctx, updated ? mapAdminProfile(updated) : null));
}

export async function adminProfessionalProfiles(request: Request, env: Env): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_ATTORNEY_REGISTRY");
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for professional profile management.", 503);
  const url = new URL(request.url);
  const filters = ["ap.deleted_at IS NULL"];
  const params: string[] = [];
  const q = clean(url.searchParams.get("q"), MAX_SHORT);
  const status = clean(url.searchParams.get("status"), MAX_SHORT);
  const branch = clean(url.searchParams.get("branch"), MAX_SHORT);
  if (q) {
    filters.push("(ap.display_name LIKE ? OR ap.title LIKE ? OR ap.office LIKE ? OR ap.division LIKE ? OR ap.discord_user_id LIKE ? OR u.discord_username LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    filters.push("ap.status = ?");
    params.push(status);
  }
  if (branch) {
    filters.push("ap.branch = ?");
    params.push(branch);
  }
  const result = await env.DB.prepare(`${adminProfileSelect()} WHERE ${filters.join(" AND ")} ORDER BY ap.is_public DESC, ap.status, ap.sort_order, ap.display_name LIMIT 250`)
    .bind(...params)
    .all<ProfileRow>();
  await audit(env, "PROFESSIONAL_PROFILE_ADMIN_LIST_VIEWED", { count: result.results.length }, ctx.user.id);
  return json({ data: result.results.map(mapAdminProfile), branches: BRANCH_LABELS });
}

export async function adminProfessionalProfileDetail(request: Request, env: Env, id: string): Promise<Response> {
  requirePermission(await requireAuth(request, env), "MANAGE_ATTORNEY_REGISTRY");
  const row = await loadProfileById(env, id);
  if (!row) return errorJson("NOT_FOUND", "Professional profile not found.", 404);
  return json({ data: mapAdminProfile(row), branches: BRANCH_LABELS });
}

export async function createAdminProfessionalProfile(request: Request, env: Env): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_ATTORNEY_REGISTRY");
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for professional profile management.", 503);
  const input = await parseProfileInput(request, { admin: true, affiliations: BRANCH_LABELS });
  if (!input.ok) return errorJson("VALIDATION_ERROR", input.message, 400);
  const complete = profileReadyForPublication(input.value);
  if (input.value.status === "published" && !complete.ok) return errorJson("PROFILE_INCOMPLETE", complete.message, 400);
  const linkCheck = await prepareAdminOwnerLink(env, null, input.value.discordUserId ?? "", { allowAutoDraftDetach: false });
  if (!linkCheck.ok) return linkCheck.response;
  const id = crypto.randomUUID();
  const slug = await uniqueProfileSlug(env, input.value.displayName, null);
  const linkedUserId = input.value.discordUserId ? await portalUserIdForDiscord(env, input.value.discordUserId) : null;
  await env.DB.prepare(
    `INSERT INTO attorney_profiles (
      id, user_id, discord_user_id, display_name, profile_slug, title, short_title, office, division, branch,
      affiliations_json, profile_kind, bar_number, practice_areas_json, status, contact, is_public,
      biography_markdown, experience_markdown, education_markdown, achievements_markdown, professional_history_markdown,
      profile_image_url, motto, quote, responsibilities_json, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  )
    .bind(...profileInsertBindings(id, slug, input.value, linkedUserId))
    .run();
  await audit(env, "PROFESSIONAL_PROFILE_ADMIN_CREATED", { profile_id: id, status: input.value.status }, ctx.user.id);
  return json({ data: mapAdminProfile((await loadProfileById(env, id))!) }, { status: 201 });
}

export async function updateAdminProfessionalProfile(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_ATTORNEY_REGISTRY");
  const existing = await loadProfileById(env, id);
  if (!existing) return errorJson("NOT_FOUND", "Professional profile not found.", 404);
  const input = await parseProfileInput(request, { admin: true, affiliations: BRANCH_LABELS });
  if (!input.ok) return errorJson("VALIDATION_ERROR", input.message, 400);
  const complete = profileReadyForPublication(input.value);
  if (input.value.status === "published" && !complete.ok) return errorJson("PROFILE_INCOMPLETE", complete.message, 400);
  const linkCheck = await prepareAdminOwnerLink(env, id, input.value.discordUserId ?? "", { allowAutoDraftDetach: true });
  if (!linkCheck.ok) return linkCheck.response;
  await updateProfileRow(env, id, input.value, { admin: true });
  await audit(env, "PROFESSIONAL_PROFILE_ADMIN_UPDATED", { profile_id: id, status: input.value.status }, ctx.user.id);
  return json({ data: mapAdminProfile((await loadProfileById(env, id))!) });
}

export async function setAdminProfessionalProfileStatus(request: Request, env: Env, id: string, status: "draft" | "published" | "inactive"): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_ATTORNEY_REGISTRY");
  const existing = await loadProfileById(env, id);
  if (!existing) return errorJson("NOT_FOUND", "Professional profile not found.", 404);
  const mapped = mapAdminProfile(existing);
  const complete = profileReadyForPublication(profileInputFromRecord(mapped, status));
  if (status === "published" && !complete.ok) return errorJson("PROFILE_INCOMPLETE", complete.message, 400);
  await env.DB!.prepare("UPDATE attorney_profiles SET status = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(status, status === "published" ? 1 : 0, id)
    .run();
  await audit(env, "PROFESSIONAL_PROFILE_STATUS_CHANGED", { profile_id: id, status }, ctx.user.id);
  return json({ data: mapAdminProfile((await loadProfileById(env, id))!) });
}

export async function linkAdminProfessionalProfileOwner(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_ATTORNEY_REGISTRY");
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for professional profile management.", 503);
  const existing = await loadProfileById(env, id);
  if (!existing) return errorJson("NOT_FOUND", "Professional profile not found.", 404);

  let body: { discordUserId?: string };
  try {
    body = (await request.json()) as { discordUserId?: string };
  } catch {
    return errorJson("VALIDATION_ERROR", "Linking a profile requires a JSON body with discordUserId.", 400);
  }

  const discordUserId = clean(body.discordUserId, 20);
  if (!validDiscordId(discordUserId)) return errorJson("VALIDATION_ERROR", "Linked Discord user ID must be a valid Discord snowflake.", 400);

  const linkCheck = await prepareAdminOwnerLink(env, id, discordUserId, { allowAutoDraftDetach: true });
  if (!linkCheck.ok) return linkCheck.response;
  const owner = await resolveDiscordOwnerForLink(env, discordUserId);
  if (!owner.ok) return owner.response;

  await env.DB.prepare(
    `UPDATE attorney_profiles
     SET user_id = ?,
         discord_user_id = ?,
         profile_image_url = CASE WHEN profile_image_url IS NULL OR profile_image_url = '' THEN ? ELSE profile_image_url END,
         last_role_sync_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(owner.user.id, discordUserId, owner.user.avatarUrl, id)
    .run();

  if (owner.roles) {
    await refreshRoleCacheForMember(env, owner.user.id, owner.roles);
    if (professionalProfileAffiliations(owner.roles).length > 0) {
      await syncProfessionalProfileForUser(env, owner.user, owner.roles);
    }
  }

  await audit(
    env,
    "PROFESSIONAL_PROFILE_OWNER_LINKED",
    {
      profile_id: id,
      discord_user_id: discordUserId,
      detached_duplicate_profile_id: linkCheck.detachedDuplicateProfileId ?? null,
      warning: owner.warning ?? null
    },
    ctx.user.id
  );
  return json({
    data: mapAdminProfile((await loadProfileById(env, id))!),
    detachedDuplicateProfileId: linkCheck.detachedDuplicateProfileId ?? null,
    warning: owner.warning ?? null
  });
}

export async function syncAdminProfessionalProfiles(request: Request, env: Env): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_ATTORNEY_REGISTRY");
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for professional profile management.", 503);

  const summary: ProfessionalProfileSyncResponse = {
    ok: true,
    eligibleMembersFound: 0,
    profilesCreated: 0,
    profilesUpdated: 0,
    profilesMarkedInactive: 0,
    roleCachesRefreshed: 0,
    skippedMembers: 0,
    errors: []
  };
  let guildId: string;
  try {
    guildId = requireEnv(env, "DISCORD_GUILD_ID");
    requireEnv(env, "DISCORD_BOT_TOKEN");
  } catch (cause) {
    return errorJson(
      "DISCORD_SYNC_NOT_CONFIGURED",
      `Discord sync requires DISCORD_GUILD_ID and DISCORD_BOT_TOKEN. ${cause instanceof Error ? cause.message : String(cause)}`,
      500
    );
  }
  const eligibleDiscordIds = new Set<string>();
  let after = "0";

  for (let page = 0; page < 25; page += 1) {
    const endpoint = `/guilds/${guildId}/members?limit=1000&after=${encodeURIComponent(after)}`;
    let response: Response;
    try {
      response = await discordApi(env, endpoint);
    } catch (cause) {
      return errorJson(
        "DISCORD_SYNC_NOT_CONFIGURED",
        `Discord sync could not contact the Discord API. ${cause instanceof Error ? cause.message : String(cause)}`,
        502
      );
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const details = parseDiscordErrorDetails(text);
      const message = response.status === 403
        ? "Discord bot cannot list guild members. Check bot guild access and enable Server Members Intent / GUILD_MEMBERS intent in the Discord Developer Portal."
        : `Discord guild member sync failed with ${response.status}: ${details.message ?? text.slice(0, 180)}`;
      await audit(env, "PROFESSIONAL_PROFILE_DISCORD_SYNC_FAILED", { status: response.status, discord_code: details.code, message }, ctx.user.id);
      return errorJson("DISCORD_SYNC_FAILED", message, 502);
    }

    const members = await response.json() as DiscordGuildMember[];
    if (members.length === 0) break;
    for (const member of members) {
      const discordUser = member.user;
      if (!discordUser?.id) {
        summary.skippedMembers += 1;
        continue;
      }
      const roles = member.roles ?? [];
      if (professionalProfileAffiliations(roles).length === 0) continue;
      eligibleDiscordIds.add(discordUser.id);
      summary.eligibleMembersFound += 1;
      try {
        const user = await upsertUserFromDiscordMember(env, guildId, member);
        await refreshRoleCacheForMember(env, user.id, roles);
        summary.roleCachesRefreshed += 1;
        const result = await syncProfessionalProfileForUser(env, user, roles);
        if (result.action === "created") summary.profilesCreated += 1;
        if (result.action === "updated") summary.profilesUpdated += 1;
        if (result.action === "inactive") summary.profilesMarkedInactive += 1;
      } catch (cause) {
        summary.errors.push({ discordUserId: discordUser.id, message: cause instanceof Error ? cause.message : String(cause) });
      }
    }

    after = members[members.length - 1]?.user?.id ?? after;
    if (members.length < 1000) break;
  }

  summary.profilesMarkedInactive += await markProfilesInactiveForMissingEligibleMembers(env, eligibleDiscordIds);
  summary.ok = summary.errors.length === 0;
  await audit(
    env,
    "PROFESSIONAL_PROFILE_DISCORD_SYNC_COMPLETED",
    {
      eligible_members_found: summary.eligibleMembersFound,
      profiles_created: summary.profilesCreated,
      profiles_updated: summary.profilesUpdated,
      profiles_marked_inactive: summary.profilesMarkedInactive,
      skipped_members: summary.skippedMembers,
      errors: summary.errors.length
    },
    ctx.user.id
  );
  return json({ data: summary });
}

async function requireProfileEligible(request: Request, env: Env): Promise<AuthContext> {
  const ctx = await requireAuth(request, env);
  if (!hasProfessionalProfileEligibility(ctx)) {
    await audit(env, "PROFESSIONAL_PROFILE_FORBIDDEN", { route: new URL(request.url).pathname, reason: "missing_branch_role" }, ctx.user.id);
    throw new ProfilePermissionError();
  }
  return ctx;
}

function myProfilePayload(ctx: AuthContext, profile: ProfessionalProfileAdminRecord | null): MyProfessionalProfileResponse {
  const affiliations = professionalProfileAffiliations(ctx.roles);
  return {
    eligible: affiliations.length > 0,
    affiliations,
    primaryBranch: affiliations[0] ?? null,
    profile
  };
}

async function parseProfileInput(
  request: Request,
  options: { admin: boolean; affiliations: string[] }
): Promise<{ ok: true; value: ProfessionalProfileInput } | { ok: false; message: string }> {
  let body: Partial<ProfessionalProfileInput>;
  try {
    body = (await request.json()) as Partial<ProfessionalProfileInput>;
  } catch {
    return { ok: false, message: "Profile update requires a JSON body." };
  }
  const displayName = clean(body.displayName, MAX_SHORT);
  const title = clean(body.title, MAX_SHORT);
  const requestedBranch = clean(body.branch, MAX_SHORT);
  const branch = branchAllowed(requestedBranch, options.affiliations) ? requestedBranch : options.affiliations[0] ?? "";
  const division = clean(body.division, MAX_SHORT) || defaultDivision(branch);
  const office = clean(body.office, MAX_SHORT);
  const status = body.status === "published" || body.status === "inactive" || body.status === "draft" ? body.status : "draft";
  const profileKind = body.profileKind === "JUDICIAL_OFFICER" || branch === "Judicial Branch" ? "JUDICIAL_OFFICER" : "ATTORNEY";
  const profileImageUrl = clean(body.profileImageUrl, MAX_MEDIUM);
  const discordUserId = options.admin ? clean(body.discordUserId, 20) : undefined;
  if (!displayName) return { ok: false, message: "Character/full professional name is required." };
  if (containsHtml(JSON.stringify(body))) return { ok: false, message: "HTML is not allowed in profile fields." };
  if (profileImageUrl && !validHttpUrl(profileImageUrl)) return { ok: false, message: "Profile image must be a valid http(s) URL." };
  if (discordUserId && !validDiscordId(discordUserId)) return { ok: false, message: "Linked Discord user ID must be a valid Discord snowflake." };
  if (requestedBranch && !branchAllowed(requestedBranch, options.admin ? BRANCH_LABELS : options.affiliations)) {
    return { ok: false, message: "Selected branch is not allowed for this profile." };
  }
  return {
    ok: true,
    value: {
      displayName,
      title,
      shortTitle: clean(body.shortTitle, MAX_SHORT) || title || branch || "DOJ Professional",
      branch,
      office,
      division,
      status,
      profileKind,
      barNumber: clean(body.barNumber, MAX_SHORT),
      practiceAreas: cleanStringList(body.practiceAreas),
      biographyMarkdown: clean(body.biographyMarkdown, MAX_LONG),
      experienceMarkdown: clean(body.experienceMarkdown, MAX_LONG),
      educationMarkdown: clean(body.educationMarkdown, MAX_LONG),
      achievementsMarkdown: clean(body.achievementsMarkdown, MAX_LONG),
      professionalHistoryMarkdown: clean(body.professionalHistoryMarkdown, MAX_LONG),
      profileImageUrl,
      motto: clean(body.motto, MAX_MEDIUM),
      quote: clean(body.quote, MAX_MEDIUM),
      responsibilities: cleanResponsibilities(body.responsibilities),
      sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 100,
      contact: clean(body.contact, MAX_MEDIUM),
      discordUserId
    }
  };
}

function profileReadyForPublication(input: ProfessionalProfileInput): { ok: true } | { ok: false; message: string } {
  if (!input.displayName) return { ok: false, message: "Name is required before publishing." };
  if (!input.title) return { ok: false, message: "Professional title is required before publishing." };
  if (!input.branch) return { ok: false, message: "Branch is required before publishing." };
  if (!input.office && !input.division) return { ok: false, message: "Office or division is required before publishing." };
  if (!input.biographyMarkdown || input.biographyMarkdown.length < 40) return { ok: false, message: "Professional biography must be completed before publishing." };
  return { ok: true };
}

async function updateProfileRow(env: Env, id: string, input: ProfessionalProfileInput, options: { admin: boolean; ownerDiscordId?: string }): Promise<void> {
  const isPublic = input.status === "published" ? 1 : 0;
  const linkedUserId = options.admin && input.discordUserId ? await portalUserIdForDiscord(env, input.discordUserId) : undefined;
  const ownerClause = options.admin ? "" : " AND discord_user_id = ?";
  await env.DB!.prepare(
    `UPDATE attorney_profiles
     SET ${options.admin ? "user_id = ?, discord_user_id = ?," : ""}
         display_name = ?,
         title = ?,
         short_title = ?,
         office = ?,
         division = ?,
         branch = ?,
         affiliations_json = ?,
         profile_kind = ?,
         bar_number = ?,
         practice_areas_json = ?,
         status = ?,
         contact = ?,
         is_public = ?,
         biography_markdown = ?,
         experience_markdown = ?,
         education_markdown = ?,
         achievements_markdown = ?,
         professional_history_markdown = ?,
         profile_image_url = ?,
         motto = ?,
         quote = ?,
         responsibilities_json = ?,
         sort_order = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?${ownerClause}`
  )
    .bind(...profileUpdateBindings(id, input, { admin: options.admin, linkedUserId, ownerDiscordId: options.ownerDiscordId }))
    .run();
}

function profileInsertBindings(id: string, slug: string, input: ProfessionalProfileInput, linkedUserId: string | null) {
  return [
    id,
    linkedUserId,
    input.discordUserId || null,
    input.displayName,
    slug,
    input.title,
    input.shortTitle || input.title,
    input.office || "",
    input.division || defaultDivision(input.branch || ""),
    input.branch || "",
    JSON.stringify(input.branch ? [input.branch] : []),
    input.profileKind || "ATTORNEY",
    input.barNumber || null,
    JSON.stringify(input.practiceAreas ?? []),
    input.status || "draft",
    input.contact || "",
    input.status === "published" ? 1 : 0,
    input.biographyMarkdown || "",
    input.experienceMarkdown || "",
    input.educationMarkdown || "",
    input.achievementsMarkdown || "",
    input.professionalHistoryMarkdown || "",
    input.profileImageUrl || null,
    input.motto || null,
    input.quote || null,
    JSON.stringify(input.responsibilities ?? []),
    input.sortOrder ?? 100
  ];
}

function profileUpdateBindings(
  id: string,
  input: ProfessionalProfileInput,
  options: { admin: boolean; linkedUserId?: string | null; ownerDiscordId?: string }
) {
  const base = [
    input.displayName,
    input.title,
    input.shortTitle || input.title,
    input.office || "",
    input.division || defaultDivision(input.branch || ""),
    input.branch || "",
    JSON.stringify(input.branch ? [input.branch] : []),
    input.profileKind || "ATTORNEY",
    input.barNumber || null,
    JSON.stringify(input.practiceAreas ?? []),
    input.status || "draft",
    input.contact || "",
    input.status === "published" ? 1 : 0,
    input.biographyMarkdown || "",
    input.experienceMarkdown || "",
    input.educationMarkdown || "",
    input.achievementsMarkdown || "",
    input.professionalHistoryMarkdown || "",
    input.profileImageUrl || null,
    input.motto || null,
    input.quote || null,
    JSON.stringify(input.responsibilities ?? []),
    input.sortOrder ?? 100,
    id
  ];
  if (!options.admin) return [...base, options.ownerDiscordId];
  return [options.linkedUserId ?? null, input.discordUserId || null, ...base];
}

async function prepareAdminOwnerLink(
  env: Env,
  targetProfileId: string | null,
  discordUserId: string,
  options: { allowAutoDraftDetach: boolean }
): Promise<{ ok: true; detachedDuplicateProfileId?: string | null } | { ok: false; response: Response }> {
  if (!discordUserId) return { ok: true, detachedDuplicateProfileId: null };
  if (!validDiscordId(discordUserId)) {
    return { ok: false, response: errorJson("VALIDATION_ERROR", "Linked Discord user ID must be a valid Discord snowflake.", 400) };
  }
  const conflicting = await loadProfileByDiscord(env, discordUserId);
  if (!conflicting || conflicting.id === targetProfileId) return { ok: true, detachedDuplicateProfileId: null };
  if (targetProfileId && options.allowAutoDraftDetach && isAutoProvisionedDraft(conflicting)) {
    await detachAutoProvisionedDraft(env, conflicting.id);
    return { ok: true, detachedDuplicateProfileId: conflicting.id };
  }
  return {
    ok: false,
    response: errorJson(
      "DISCORD_OWNER_ALREADY_LINKED",
      `That Discord account is already linked to the professional profile "${conflicting.displayName}".`,
      409
    )
  };
}

async function resolveDiscordOwnerForLink(
  env: Env,
  discordUserId: string
): Promise<{ ok: true; user: AuthUser; roles: string[] | null; warning?: string | null } | { ok: false; response: Response }> {
  let member: DiscordGuildMember | null = null;
  try {
    member = await fetchGuildMember(env, discordUserId);
  } catch (cause) {
    const existingUser = await loadUserByDiscord(env, discordUserId);
    if (existingUser) {
      return {
        ok: true,
        user: existingUser,
        roles: null,
        warning: `Discord member lookup failed; linked to the existing portal user only. ${cause instanceof Error ? cause.message : String(cause)}`
      };
    }
    return {
      ok: false,
      response: errorJson(
        "DISCORD_MEMBER_LOOKUP_FAILED",
        "Discord member could not be verified. Check the bot token, guild ID, and Server Members Intent / GUILD_MEMBERS intent before linking this owner.",
        502
      )
    };
  }

  if (!member) return { ok: false, response: errorJson("DISCORD_MEMBER_NOT_FOUND", "That Discord user is not a member of the configured Miami Stories guild.", 400) };
  if (!member.user?.id) return { ok: false, response: errorJson("DISCORD_MEMBER_INVALID", "Discord did not return user details for that guild member.", 502) };
  const guildId = requireEnv(env, "DISCORD_GUILD_ID");
  return { ok: true, user: await upsertUserFromDiscordMember(env, guildId, member), roles: member.roles ?? [] };
}

async function upsertUserFromDiscordMember(env: Env, guildId: string, member: DiscordGuildMember): Promise<AuthUser> {
  const discordUser = member.user;
  if (!discordUser?.id || !discordUser.username) throw new Error("Discord member response was missing user identity fields.");
  const id = crypto.randomUUID();
  const displayName = cleanOptional(member.nick) ?? cleanOptional(discordUser.global_name) ?? discordUser.username;
  const userAvatarUrl = member.avatar
    ? `https://cdn.discordapp.com/guilds/${guildId}/users/${discordUser.id}/avatars/${member.avatar}.png`
    : avatarUrl(discordUser);
  await env.DB!.prepare(
    `INSERT INTO users (id, discord_id, discord_username, discord_global_name, display_name, avatar_url, email, last_login_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(discord_id) DO UPDATE SET
       discord_username = excluded.discord_username,
       discord_global_name = excluded.discord_global_name,
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       updated_at = excluded.updated_at`
  )
    .bind(id, discordUser.id, discordUser.username, discordUser.global_name ?? null, displayName, userAvatarUrl, discordUser.email ?? null)
    .run();
  const user = await loadUserByDiscord(env, discordUser.id);
  if (!user) throw new Error("Discord member portal user upsert failed.");
  return user;
}

async function refreshRoleCacheForMember(env: Env, userId: string, roleIds: string[]): Promise<void> {
  await env.DB!.prepare("DELETE FROM user_role_cache WHERE user_id = ?").bind(userId).run();
  for (const roleId of roleIds) {
    const mapping = await env.DB!.prepare("SELECT role_name as roleName FROM role_mappings WHERE discord_role_id = ?")
      .bind(roleId)
      .first<{ roleName: string | null }>();
    await env.DB!.prepare(
      `INSERT INTO user_role_cache (id, user_id, discord_role_id, role_name)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, discord_role_id) DO UPDATE SET role_name = excluded.role_name, cached_at = CURRENT_TIMESTAMP`
    )
      .bind(crypto.randomUUID(), userId, roleId, mapping?.roleName ?? null)
      .run();
  }
}

async function markProfilesInactiveForMissingEligibleMembers(env: Env, eligibleDiscordIds: Set<string>): Promise<number> {
  const result = await env.DB!.prepare(
    `SELECT id, discord_user_id as discordUserId
     FROM attorney_profiles
     WHERE deleted_at IS NULL
       AND discord_user_id IS NOT NULL
       AND status != 'inactive'`
  ).all<{ id: string; discordUserId: string }>();
  let marked = 0;
  for (const row of result.results) {
    if (eligibleDiscordIds.has(row.discordUserId)) continue;
    await env.DB!.prepare(
      "UPDATE attorney_profiles SET status = 'inactive', is_public = 0, affiliations_json = '[]', last_role_sync_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    )
      .bind(row.id)
      .run();
    marked += 1;
  }
  return marked;
}

async function loadUserByDiscord(env: Env, discordUserId: string): Promise<AuthUser | null> {
  return env.DB!.prepare(
    "SELECT id, discord_id as discordId, discord_username as discordUsername, discord_global_name as discordGlobalName, display_name as displayName, avatar_url as avatarUrl, last_login_at as lastLoginAt FROM users WHERE discord_id = ?"
  )
    .bind(discordUserId)
    .first<AuthUser>();
}

async function loadProfileByDiscord(env: Env, discordUserId: string): Promise<ProfileRow | null> {
  return env.DB!.prepare(`${adminProfileSelect()} WHERE ap.deleted_at IS NULL AND ap.discord_user_id = ? LIMIT 1`)
    .bind(discordUserId)
    .first<ProfileRow>();
}

async function detachAutoProvisionedDraft(env: Env, id: string): Promise<void> {
  await env.DB!.prepare(
    `UPDATE attorney_profiles
     SET user_id = NULL,
         discord_user_id = NULL,
         status = 'inactive',
         is_public = 0,
         affiliations_json = '[]',
         last_role_sync_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  )
    .bind(id)
    .run();
}

function isAutoProvisionedDraft(profile: ProfileRow): boolean {
  return (
    profile.status === "draft" &&
    !Boolean(profile.isPublic) &&
    !profile.title?.trim() &&
    !profile.office?.trim() &&
    !profile.barNumber &&
    !profile.contact?.trim() &&
    !profile.biographyMarkdown?.trim() &&
    safeJsonArray(profile.practiceAreasJson).length === 0 &&
    safeJsonResponsibilities(profile.responsibilitiesJson).length === 0
  );
}

function parseDiscordErrorDetails(text: string): { code?: number; message?: string } {
  try {
    const parsed = JSON.parse(text) as { code?: number; message?: string };
    return { code: parsed.code, message: parsed.message };
  } catch {
    return {};
  }
}

function cleanOptional(value: unknown): string | null {
  const cleaned = clean(value, MAX_SHORT);
  return cleaned || null;
}

function adminProfileSelect(): string {
  return `SELECT
    ap.id,
    ap.user_id as portalUserId,
    ap.discord_user_id as discordUserId,
    ap.display_name as displayName,
    ap.profile_slug as profileSlug,
    ap.title,
    ap.short_title as shortTitle,
    ap.office,
    ap.division,
    ap.branch,
    ap.affiliations_json as affiliationsJson,
    ap.status,
    ap.profile_kind as profileKind,
    ap.bar_number as barNumber,
    ap.practice_areas_json as practiceAreasJson,
    ap.biography_markdown as biographyMarkdown,
    ap.experience_markdown as experienceMarkdown,
    ap.education_markdown as educationMarkdown,
    ap.achievements_markdown as achievementsMarkdown,
    ap.professional_history_markdown as professionalHistoryMarkdown,
    ap.profile_image_url as profileImageUrl,
    ap.motto,
    ap.quote,
    ap.responsibilities_json as responsibilitiesJson,
    ap.sort_order as sortOrder,
    ap.contact,
    ap.is_public as isPublic,
    ap.created_at as createdAt,
    ap.updated_at as updatedAt,
    u.display_name as ownerDisplayName,
    u.discord_username as ownerDiscordUsername
   FROM attorney_profiles ap
   LEFT JOIN users u ON u.id = ap.user_id`;
}

async function loadProfileByOwner(env: Env, userId: string, discordId: string): Promise<ProfileRow | null> {
  return env.DB!.prepare(
    `${adminProfileSelect()}
     WHERE ap.deleted_at IS NULL AND (ap.discord_user_id = ? OR ap.user_id = ?)
     ORDER BY CASE WHEN ap.discord_user_id = ? THEN 0 ELSE 1 END
     LIMIT 1`
  )
    .bind(discordId, userId, discordId)
    .first<ProfileRow>();
}

async function loadProfileById(env: Env, id: string): Promise<ProfileRow | null> {
  return env.DB!.prepare(`${adminProfileSelect()} WHERE ap.deleted_at IS NULL AND ap.id = ? LIMIT 1`).bind(id).first<ProfileRow>();
}

async function portalUserIdForDiscord(env: Env, discordUserId: string): Promise<string | null> {
  const row = await env.DB!.prepare("SELECT id FROM users WHERE discord_id = ? LIMIT 1").bind(discordUserId).first<{ id: string }>();
  return row?.id ?? null;
}

function mapAdminProfile(row: ProfileRow): ProfessionalProfileAdminRecord {
  return {
    id: row.id,
    displayName: row.displayName,
    profileSlug: row.profileSlug,
    title: row.title,
    shortTitle: row.shortTitle,
    office: row.office,
    division: row.division,
    branch: row.branch,
    affiliations: safeJsonArray(row.affiliationsJson),
    status: row.status,
    profileKind: row.profileKind === "JUDICIAL_OFFICER" ? "JUDICIAL_OFFICER" : "ATTORNEY",
    barNumber: row.barNumber,
    practiceAreas: safeJsonArray(row.practiceAreasJson),
    biographyMarkdown: row.biographyMarkdown,
    experienceMarkdown: row.experienceMarkdown,
    educationMarkdown: row.educationMarkdown,
    achievementsMarkdown: row.achievementsMarkdown,
    professionalHistoryMarkdown: row.professionalHistoryMarkdown,
    profileImageUrl: row.profileImageUrl,
    motto: row.motto,
    quote: row.quote,
    responsibilities: safeJsonResponsibilities(row.responsibilitiesJson),
    sortOrder: row.sortOrder,
    contact: row.contact,
    discordUserId: row.discordUserId,
    portalUserId: row.portalUserId,
    ownerDisplayName: row.ownerDisplayName,
    ownerDiscordUsername: row.ownerDiscordUsername,
    isPublic: Boolean(row.isPublic),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function profileInputFromRecord(record: ProfessionalProfileAdminRecord, status: "draft" | "published" | "inactive"): ProfessionalProfileInput {
  return {
    displayName: record.displayName,
    title: record.title,
    shortTitle: record.shortTitle,
    branch: record.branch ?? "",
    office: record.office,
    division: record.division,
    status,
    profileKind: record.profileKind,
    barNumber: record.barNumber ?? "",
    practiceAreas: record.practiceAreas,
    biographyMarkdown: record.biographyMarkdown,
    experienceMarkdown: record.experienceMarkdown ?? "",
    educationMarkdown: record.educationMarkdown ?? "",
    achievementsMarkdown: record.achievementsMarkdown ?? "",
    professionalHistoryMarkdown: record.professionalHistoryMarkdown ?? "",
    profileImageUrl: record.profileImageUrl ?? "",
    motto: record.motto ?? "",
    quote: record.quote ?? "",
    responsibilities: record.responsibilities,
    sortOrder: record.sortOrder,
    contact: record.contact ?? "",
    discordUserId: record.discordUserId ?? ""
  };
}

async function uniqueProfileSlug(env: Env, displayName: string, existingId: string | null): Promise<string> {
  const base = slugify(displayName) || "professional-profile";
  for (let index = 0; index < 20; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const row = await env.DB!.prepare("SELECT id FROM attorney_profiles WHERE profile_slug = ? AND (? IS NULL OR id != ?) LIMIT 1")
      .bind(slug, existingId, existingId)
      .first<{ id: string }>();
    if (!row) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function branchAllowed(branch: string, allowed: string[]): boolean {
  return Boolean(branch && allowed.includes(branch));
}

function defaultDivision(branch: string): string {
  return BRANCH_ROLES.find((role) => role.branch === branch)?.division ?? "";
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().replaceAll(/[\u0000-\u001f]/g, "").slice(0, max) : "";
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item, MAX_SHORT)).filter(Boolean).slice(0, 20);
}

function cleanResponsibilities(value: unknown): AttorneyResponsibility[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = clean(record.title, MAX_SHORT);
      const description = clean(record.description, MAX_MEDIUM);
      return title && description ? { title, description } : null;
    })
    .filter((item): item is AttorneyResponsibility => Boolean(item))
    .slice(0, 12);
}

function containsHtml(value: string): boolean {
  return /<[^>]+>/.test(value);
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validDiscordId(value: string): boolean {
  return /^\d{17,20}$/.test(value);
}

function slugify(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "").slice(0, 80);
}

function safeJsonArray(value: string | null): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function safeJsonResponsibilities(value: string | null): AttorneyResponsibility[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is AttorneyResponsibility => Boolean(item && typeof item === "object" && typeof item.title === "string" && typeof item.description === "string"));
  } catch {
    return [];
  }
}

export class ProfilePermissionError extends Error {
  constructor() {
    super("Missing authorized DOJ branch role.");
    this.name = "ProfilePermissionError";
  }
}

interface ProfileRow {
  id: string;
  portalUserId: string | null;
  discordUserId: string | null;
  displayName: string;
  profileSlug: string;
  title: string;
  shortTitle: string;
  office: string;
  division: string;
  branch: string | null;
  affiliationsJson: string | null;
  status: string;
  profileKind: AttorneyProfileKind;
  barNumber: string | null;
  practiceAreasJson: string;
  biographyMarkdown: string;
  experienceMarkdown: string | null;
  educationMarkdown: string | null;
  achievementsMarkdown: string | null;
  professionalHistoryMarkdown: string | null;
  profileImageUrl: string | null;
  motto: string | null;
  quote: string | null;
  responsibilitiesJson: string;
  sortOrder: number;
  contact: string;
  isPublic: number | boolean;
  createdAt: string;
  updatedAt: string;
  ownerDisplayName: string | null;
  ownerDiscordUsername: string | null;
}
