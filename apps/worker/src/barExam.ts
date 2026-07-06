/* ============================================================================
 * Miami Stories DOJ Portal
 * Section: Native Bar Exam API
 * Owner: albeen-sknight
 * Repository: https://github.com/albeen-sknight
 * Copyright: (c) 2026 albeen-sknight. All rights reserved.
 * Last reviewed: 2026-06-23
 * ========================================================================== */

import type {
  BarExamAnswerDraft,
  BarExamAttemptStatus,
  BarExamQuestion,
  BarExamTrack,
  SaveBarExamDraftInput,
  StartBarExamInput
} from "@shotta-doj/shared";
import { BAR_EXAM_ATTEMPT_STATUSES, BAR_EXAM_TRACKS } from "@shotta-doj/shared";
import { audit } from "./audit";
import { requireAuth } from "./auth";
import { discordApi, MissingEnvironmentError, assignMemberRole, fetchBotUser, requireEnv } from "./discord";
import { buildPermissionOverwrites } from "./serviceDiscord";
import { errorJson, json } from "./http";
import { hasActionPermission, requirePermission } from "./permissions";
import { barExamVersionSeeds } from "./seeds/barExamVersions.server";
import type { AuthContext, Env } from "./types";

const INTEGRITY_TEXT =
  "I confirm that I will answer in my own words, will not use AI to write, rewrite, generate, or complete answers for me, will not copy another candidate's answers, will not share my assigned version, and will submit only once.";
const INTEGRITY_TEXT_VERSION = "2026-06-21";
const ANSWER_LIMIT = 80_000;

export async function barExamStatus(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAuth(request, env);
  const eligible = canStartExam(ctx);
  const reviewer = canReviewExam(ctx);
  const eligibleTracks = eligible ? eligibleExamTracks(ctx) : [];
  if (!env.DB) {
    return json({
      eligible: false,
      reviewer,
      availability: "no_exam_available",
      eligibilityMessage: "The native Bar Exam is not available because D1 is not configured.",
      tracks: BAR_EXAM_TRACKS,
      eligibleTracks: [],
      availableTracks: [],
      activeVersionCount: 0,
      activeImportedVersionCount: 0,
      activeAttempts: [],
      hasActiveExamGlobally: false,
      activeImportedPrivateCount: 0,
      activePlaceholderCount: 0,
      candidateEligible: false,
      eligibleTrack: null,
      blockingRoles: []
    });
  }

  let attempts: AttemptRow[] = [];
  let availableTracks: BarExamTrack[] = [];
  let activeVersionCounts = { total: 0, imported: 0, placeholder: 0 };
  const blockingRoles: string[] = [];
  if (isPrivilegedBarUser(ctx)) {
    if (ctx.permissions.includes("BAR_ACTIVE")) blockingRoles.push("BAR_ACTIVE");
    if (ctx.permissions.includes("BAR_ASSOCIATION_MEMBER")) blockingRoles.push("BAR_ASSOCIATION_MEMBER");
    if (hasActionPermission(ctx, "REVIEW_BAR_EXAMS")) blockingRoles.push("REVIEW_BAR_EXAMS");
    if (hasActionPermission(ctx, "ADMIN")) blockingRoles.push("ADMIN");
  }

  try {
    attempts = await activeAttempts(env, ctx.user.id);
    availableTracks = await activeVersionTracks(env);
    activeVersionCounts = await activeVersionCountsByKind(env);
  } catch (cause) {
    console.warn(JSON.stringify({ event: "bar_exam_status_fallback", user_id: ctx.user.id, cause: safeError(cause) }));
    return json({
      eligible: false,
      reviewer,
      availability: "no_exam_available",
      eligibilityMessage: "No active Bar Exam is currently available. A Bar Association member must seed exam versions before candidates can begin.",
      tracks: BAR_EXAM_TRACKS,
      eligibleTracks: [],
      availableTracks: [],
      activeVersionCount: 0,
      activeImportedVersionCount: 0,
      activeAttempts: [],
      hasActiveExamGlobally: false,
      activeImportedPrivateCount: 0,
      activePlaceholderCount: 0,
      candidateEligible: false,
      eligibleTrack: null,
      blockingRoles: []
    });
  }

  const hasTrackAvailable = eligibleTracks.some((track) => availableTracks.includes(track));
  const availability = !eligible
    ? "not_eligible"
    : activeVersionCounts.total === 0
      ? "no_exam_available"
      : !hasTrackAvailable
        ? "no_track_available"
      : attempts.length > 0
        ? "active_attempt"
        : "not_started";
  return json({
    eligible,
    reviewer,
    availability,
    eligibilityMessage: statusMessage(ctx, availability, activeVersionCounts.total),
    tracks: BAR_EXAM_TRACKS,
    eligibleTracks,
    availableTracks,
    activeVersionCount: activeVersionCounts.total,
    activeImportedVersionCount: activeVersionCounts.imported,
    activeAttempts: attempts.map(rowToCandidateSummary),
    hasActiveExamGlobally: activeVersionCounts.total > 0,
    activeImportedPrivateCount: activeVersionCounts.imported,
    activePlaceholderCount: activeVersionCounts.placeholder,
    candidateEligible: eligible,
    eligibleTrack: attempts.length > 0
      ? (attempts[0].examTrack as BarExamTrack)
      : (eligibleTracks.length > 0 ? eligibleTracks[0] : null),
    blockingRoles
  });
}

export async function barExamResources(_request: Request, env: Env): Promise<Response> {
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for Bar Exam resources.", 503);
  const result = await env.DB.prepare(
    `SELECT title, category, url, description FROM resource_documents
     WHERE is_public = 1 AND deleted_at IS NULL AND category IN ('LEGAL_AUTHORITY', 'DOJ_PROCEDURE', 'ATTORNEY_TRAINING')
     ORDER BY category, title`
  ).all<{ title: string; category: string; url: string; description: string }>();
  return json({ data: result.results });
}

export async function startBarExam(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAuth(request, env);
  if (!canStartExam(ctx)) return errorJson("FORBIDDEN", "You are not eligible to start the Bar Exam.", 403);
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for Bar Exam attempts.", 503);
  const input = (await request.json()) as StartBarExamInput;
  if (!input.integrityAccepted) return errorJson("VALIDATION_ERROR", "Integrity declaration must be accepted before starting.", 400);
  if (!BAR_EXAM_TRACKS.includes(input.examTrack)) return errorJson("VALIDATION_ERROR", "Invalid exam track.", 400);
  const lockKey = identityLock(ctx.user.discordId, input.examTrack);
  const existing = await loadAttemptByLock(env, lockKey);
  if (existing && editableStatuses().includes(existing.status as BarExamAttemptStatus)) {
    return json({ data: await candidateAttempt(env, existing.id) });
  }
  if (existing && !["VOIDED", "EXPIRED"].includes(existing.status)) {
    return json({ data: await candidateAttempt(env, existing.id) });
  }
  const version = await assignVersion(env, input.examTrack);
  if (!version) return errorJson("NO_ACTIVE_VERSION", "No active Bar Exam is currently available for this track.", 409);
  const now = new Date();
  const id = crypto.randomUUID();
  const attemptNumber = await nextAttemptNumber(env, input.examTrack);
  const deadline = new Date(now.getTime() + version.timeLimitMinutes * 60_000);
  await env.DB.prepare(
    `INSERT INTO bar_exam_attempts (
      id, attempt_number, identity_lock_key, user_id, discord_user_id, discord_username, character_name, candidate_name,
      candidate_phone, candidate_email, exam_track, version_id, version_label, status, opened_at, started_at, deadline_at,
      integrity_acknowledged_at, integrity_text_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  )
    .bind(
      id,
      attemptNumber,
      lockKey,
      ctx.user.id,
      ctx.user.discordId,
      ctx.user.discordGlobalName ?? ctx.user.discordUsername,
      clean(input.candidateName) || ctx.user.displayName,
      clean(input.candidateName),
      clean(input.candidatePhone),
      clean(input.candidateEmail),
      input.examTrack,
      version.id,
      version.versionLabel,
      now.toISOString(),
      now.toISOString(),
      deadline.toISOString(),
      now.toISOString(),
      INTEGRITY_TEXT_VERSION
    )
    .run();
  await addBarExamEvent(env, id, ctx.user.id, "BAR_EXAM_STARTED", "Native Bar Exam attempt started.", { exam_track: input.examTrack, version_label: version.versionLabel });
  await audit(env, "BAR_EXAM_STARTED", { attempt_id: id, exam_track: input.examTrack, version_label: version.versionLabel }, ctx.user.id);

  let roleAssigned = false;
  let roleAssignmentError: string | null = null;
  let barCandidateRoleId: string | null = null;
  try {
    barCandidateRoleId = await roleIdByName(env, "Bar Candidate");
    if (!barCandidateRoleId) {
      roleAssignmentError = "Bar Candidate role mapping not found in database.";
    } else {
      const assignResult = await assignMemberRole(env, ctx.user.discordId, barCandidateRoleId);
      if (assignResult.ok) {
        roleAssigned = true;
      } else {
        roleAssignmentError = assignResult.error || `HTTP ${assignResult.status}`;
      }
    }
  } catch (cause) {
    roleAssignmentError = cause instanceof Error ? cause.message : "Unknown error";
  }

  if (roleAssigned) {
    await addBarExamEvent(env, id, ctx.user.id, "DISCORD_ROLE_ASSIGNED", "Discord role 'Bar Candidate' assigned automatically.", { role_name: "Bar Candidate", role_id: barCandidateRoleId });
  } else {
    await addBarExamEvent(env, id, ctx.user.id, "DISCORD_ROLE_ASSIGNMENT_FAILED", `Failed to assign Discord role 'Bar Candidate': ${roleAssignmentError}`, { role_name: "Bar Candidate", role_id: barCandidateRoleId });
  }

  return json({
    data: await candidateAttempt(env, id),
    warning: roleAssigned ? undefined : "We started your exam, but could not automatically assign the Bar Candidate role on Discord. Staff will set it manually."
  }, { status: 201 });
}

export async function getCandidateAttempt(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAuth(request, env);
  if (!canStartExam(ctx)) return errorJson("FORBIDDEN", "You are not eligible to view Bar Exam questions.", 403);
  const track = new URL(request.url).searchParams.get("track") as BarExamTrack | null;
  const attempts = await activeAttempts(env, ctx.user.id, track && BAR_EXAM_TRACKS.includes(track) ? track : undefined);
  const attempt = attempts[0];
  if (!attempt) return errorJson("NOT_FOUND", "No active Bar Exam attempt exists yet.", 404);
  await expireIfNeeded(env, attempt);
  return json({ data: await candidateAttempt(env, attempt.id) });
}

export async function saveBarExamDraft(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAuth(request, env);
  const attempt = await candidateOwnedAttempt(request, env, ctx);
  if (!attempt) return errorJson("NOT_FOUND", "No active Bar Exam attempt exists.", 404);
  if (!(await canCandidateEdit(env, attempt))) return errorJson("LOCKED_ATTEMPT", "This attempt can no longer be edited.", 409);
  const input = (await request.json()) as SaveBarExamDraftInput;
  const version = await loadVersion(env, attempt.versionId);
  if (!version) return errorJson("NOT_FOUND", "Assigned Bar Exam version not found.", 404);
  const answers = validateAnswers(input.answers, version.questions);
  if (!answers.ok) return errorJson("VALIDATION_ERROR", answers.message, 400);
  await writeAnswers(env, attempt.id, answers.value, false);
  await env.DB!.prepare("UPDATE bar_exam_attempts SET status = 'IN_PROGRESS', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(attempt.id).run();
  await addBarExamEvent(env, attempt.id, ctx.user.id, "BAR_EXAM_DRAFT_SAVED", "Candidate draft answers saved.", { answer_count: answers.value.length });
  await audit(env, "BAR_EXAM_DRAFT_SAVED", { attempt_id: attempt.id, answer_count: answers.value.length }, ctx.user.id);
  return json({ data: await candidateAttempt(env, attempt.id) });
}

export async function submitBarExam(request: Request, env: Env): Promise<Response> {
  const ctx = await requireAuth(request, env);
  const attempt = await candidateOwnedAttempt(request, env, ctx);
  if (!attempt) return errorJson("NOT_FOUND", "No active Bar Exam attempt exists.", 404);
  if (!(await canCandidateEdit(env, attempt))) return errorJson("LOCKED_ATTEMPT", "This attempt can no longer be submitted.", 409);
  const input = (await request.json()) as SaveBarExamDraftInput;
  const version = await loadVersion(env, attempt.versionId);
  if (!version) return errorJson("NOT_FOUND", "Assigned Bar Exam version not found.", 404);
  const answers = validateAnswers(input.answers, version.questions);
  if (!answers.ok) return errorJson("VALIDATION_ERROR", answers.message, 400);
  await writeAnswers(env, attempt.id, answers.value, true);
  await env.DB!.prepare("UPDATE bar_exam_attempts SET status = 'SUBMITTED', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(attempt.id)
    .run();
  await addBarExamEvent(env, attempt.id, ctx.user.id, "BAR_EXAM_SUBMITTED", "Candidate submitted the native Bar Exam.", { answer_count: answers.value.length });
  await audit(env, "BAR_EXAM_SUBMITTED", { attempt_id: attempt.id, answer_count: answers.value.length }, ctx.user.id);
  await notifyReviewers(env, attempt.id, ctx.user.id);
  return json({ data: await candidateAttempt(env, attempt.id) });
}

export async function adminBarExamAttempts(request: Request, env: Env): Promise<Response> {
  requireReviewer(await requireAuth(request, env));
  const url = new URL(request.url);
  const filters: string[] = ["bea.deleted_at IS NULL"];
  const params: string[] = [];
  for (const [key, column] of [
    ["status", "bea.status"],
    ["track", "bea.exam_track"],
    ["version", "bea.version_label"]
  ] as const) {
    const value = url.searchParams.get(key);
    if (value) {
      filters.push(`${column} = ?`);
      params.push(value);
    }
  }
  const search = url.searchParams.get("q");
  if (search) {
    filters.push("(bea.attempt_number LIKE ? OR bea.discord_username LIKE ? OR bea.discord_user_id LIKE ? OR bea.candidate_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await env.DB!.prepare(`${selectAttempts()} ${where} ORDER BY bea.updated_at DESC LIMIT 150`).bind(...params).all<AttemptRow>();
  return json({ data: result.results.map(rowToAdminSummary) });
}

export async function adminBarExamAttemptDetail(request: Request, env: Env, id: string): Promise<Response> {
  requireReviewer(await requireAuth(request, env));
  const detail = await reviewerAttempt(env, id);
  if (!detail) return errorJson("NOT_FOUND", "Bar Exam attempt not found.", 404);
  return json({ data: detail });
}

export async function scoreBarExamAttempt(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireReviewer(await requireAuth(request, env));
  const body = (await request.json()) as { scores?: Array<{ questionKey: string; pointsAwarded: number; reviewerNotes?: string }> };
  const attempt = await loadAttempt(env, id);
  if (!attempt) return errorJson("NOT_FOUND", "Bar Exam attempt not found.", 404);
  const version = await loadVersion(env, attempt.versionId);
  if (!version) return errorJson("NOT_FOUND", "Assigned Bar Exam version not found.", 404);
  const maxByKey = new Map(version.questions.map((question) => [question.key, question.points]));
  let total = 0;
  for (const score of body.scores ?? []) {
    const max = maxByKey.get(score.questionKey);
    if (max === undefined) return errorJson("VALIDATION_ERROR", "Score references a question outside the assigned version.", 400);
    const awarded = Math.max(0, Math.min(Number(score.pointsAwarded) || 0, max));
    total += awarded;
    await env.DB!.prepare(
      "UPDATE bar_exam_answers SET points_awarded = ?, max_points = ?, reviewer_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE attempt_id = ? AND question_key = ?"
    )
      .bind(awarded, max, clean(score.reviewerNotes), id, score.questionKey)
      .run();
  }
  await env.DB!.prepare("UPDATE bar_exam_attempts SET final_score = ?, status = CASE WHEN status = 'SUBMITTED' THEN 'UNDER_REVIEW' ELSE status END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(total, id)
    .run();
  await addBarExamEvent(env, id, ctx.user.id, "BAR_EXAM_SCORE_UPDATED", "Reviewer score updated.", { total_score: total });
  await audit(env, "BAR_EXAM_SCORE_UPDATED", { attempt_id: id, total_score: total }, ctx.user.id);
  return json({ data: await reviewerAttempt(env, id) });
}

export async function markBarExamAttempt(request: Request, env: Env, id: string, action: string): Promise<Response> {
  const ctx = requireReviewer(await requireAuth(request, env));
  const statusByAction: Record<string, BarExamAttemptStatus> = {
    "mark-under-review": "UNDER_REVIEW",
    pass: "PASSED",
    fail: "FAILED",
    refer: "REFERRED_FOR_INTERVIEW",
    void: "VOIDED",
    reopen: "REOPENED"
  };
  const status = statusByAction[action];
  if (!status) return errorJson("NOT_FOUND", "Unknown Bar Exam action.", 404);
  const body = await safeJson(request) as { message?: string; deadlineAt?: string };
  const updateDeadline = status === "REOPENED" && body.deadlineAt;
  await env.DB!.prepare(
    `UPDATE bar_exam_attempts SET status = ?, decision = ?, reviewer_user_id = ?, reviewer_name = ?,
      reviewed_at = CURRENT_TIMESTAMP, graded_at = CURRENT_TIMESTAMP, deadline_at = CASE WHEN ? IS NOT NULL THEN ? ELSE deadline_at END,
      updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(status, status, ctx.user.id, ctx.user.displayName, updateDeadline ? body.deadlineAt : null, updateDeadline ? body.deadlineAt : null, id)
    .run();

  let roleAssigned = false;
  let roleError: string | null = null;
  let followupChannelId: string | null = null;
  let followupChannelError: string | null = null;

  const attempt = await loadAttempt(env, id);
  if (status === "PASSED" && attempt) {
    // A. Assign Bar Eligible role
    const roleId = await getBarEligibleRoleId(env);
    if (roleId) {
      try {
        const assignResult = await assignMemberRole(env, attempt.discordUserId, roleId);
        if (assignResult.ok) {
          roleAssigned = true;
        } else {
          roleError = assignResult.error || `HTTP ${assignResult.status}`;
        }
      } catch (cause) {
        roleError = cause instanceof Error ? cause.message : "Unknown error";
      }
    } else {
      roleError = "Bar Eligible role mapping not found in database.";
    }

    // B. Create private follow-up channel
    try {
      const channelResult = await createBarExamFollowupChannel(env, attempt);
      followupChannelId = channelResult.id;
      
      // Update D1
      await env.DB!.prepare("UPDATE bar_exam_attempts SET followup_channel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(followupChannelId, id)
        .run();

      // C. Post ping/embed in followup channel
      await postBarExamFollowupEmbed(env, followupChannelId, attempt.discordUserId, attempt.attemptNumber);
    } catch (cause) {
      followupChannelError = cause instanceof Error ? cause.message : "Unknown error";
    }
  }

  const eventType = eventForStatus(status);
  const eventMetadata: Record<string, unknown> = {};
  if (status === "PASSED") {
    eventMetadata.role_assigned = roleAssigned;
    if (roleError) eventMetadata.role_assignment_error = roleError;
    if (followupChannelId) eventMetadata.followup_channel_id = followupChannelId;
    if (followupChannelError) eventMetadata.followup_channel_error = followupChannelError;
  }

  await addBarExamEvent(env, id, ctx.user.id, eventType, clean(body.message) || `Attempt marked ${status}.`, eventMetadata);
  await audit(env, eventType, { attempt_id: id, status, ...eventMetadata }, ctx.user.id);
  if (["PASSED", "FAILED", "REFERRED_FOR_INTERVIEW", "NEEDS_CANDIDATE_FOLLOW_UP", "VOIDED"].includes(status)) {
    await notifyCandidate(env, id, status, ctx.user.id);
  }
  return json({ data: await reviewerAttempt(env, id) });
}

export async function getBarExamEvents(request: Request, env: Env, id: string): Promise<Response> {
  requireReviewer(await requireAuth(request, env));
  return json({ data: await barExamEvents(env, id) });
}

export async function addBarExamEventNote(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireReviewer(await requireAuth(request, env));
  const body = (await request.json()) as { message?: string };
  const message = clean(body.message);
  if (!message) return errorJson("VALIDATION_ERROR", "Message is required.", 400);
  await addBarExamEvent(env, id, ctx.user.id, "BAR_EXAM_REVIEW_NOTE", message, {});
  return json({ data: await barExamEvents(env, id) }, { status: 201 });
}

export async function adminBarExamVersions(request: Request, env: Env): Promise<Response> {
  requireReviewer(await requireAuth(request, env));
  const result = await env.DB!.prepare(
    `SELECT id, exam_track as examTrack, version_code as versionCode, version_label as versionLabel, title, description,
      status, total_points as totalPoints, passing_score as passingScore, time_limit_minutes as timeLimitMinutes,
      is_active as isActive, COALESCE(json_array_length(candidate_payload_json, '$.questions'), 0) as questionCount,
      CASE WHEN answer_key_json IS NOT NULL AND answer_key_json != '{}' THEN 1 ELSE 0 END as hasServerAnswerKey,
      CASE WHEN version_key LIKE 'legacy:%' OR reviewer_payload_json LIKE '%legacyBarExamAppsScript.js%' THEN 1 ELSE 0 END as isImported,
      CASE WHEN description LIKE '%placeholder%' OR title LIKE '%placeholder%' OR reviewer_payload_json LIKE '%No committed rubric%' THEN 1 ELSE 0 END as isPlaceholder,
      updated_at as updatedAt
     FROM bar_exam_versions
     WHERE deleted_at IS NULL
     ORDER BY is_active DESC,
      CASE WHEN version_key LIKE 'legacy:%' OR reviewer_payload_json LIKE '%legacyBarExamAppsScript.js%' THEN 0 ELSE 1 END,
      exam_track, version_code`
  ).all();
  return json({ data: result.results });
}

export async function updateBarExamVersionPublication(request: Request, env: Env, id: string, isActive: boolean): Promise<Response> {
  const ctx = requireReviewer(await requireAuth(request, env));
  const existing = await env.DB!.prepare(
    "SELECT id, version_label as versionLabel FROM bar_exam_versions WHERE (id = ? OR version_label = ?) AND deleted_at IS NULL"
  ).bind(id, id).first<{ id: string; versionLabel: string }>();
  if (!existing) return errorJson("NOT_FOUND", "Bar Exam version not found.", 404);
  await env.DB!.prepare(
    "UPDATE bar_exam_versions SET is_active = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(isActive ? 1 : 0, isActive ? "ACTIVE" : "INACTIVE", existing.id).run();
  await audit(env, isActive ? "BAR_EXAM_VERSION_ACTIVATED" : "BAR_EXAM_VERSION_DEACTIVATED", {
    version_id: existing.id,
    version_label: existing.versionLabel
  }, ctx.user.id);
  return json({ ok: true, id: existing.id, isActive });
}

export async function seedBarExamVersions(request: Request, env: Env): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "REVIEW_BAR_EXAMS");
  for (const seed of barExamVersionSeeds) {
    await env.DB!.prepare(
      `INSERT INTO bar_exam_versions (
        id, version_key, exam_track, version_code, version_label, title, description, status, total_points,
        passing_score, time_limit_minutes, is_active, public_instructions_markdown, candidate_payload_json,
        reviewer_payload_json, answer_key_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, 1, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description,
        candidate_payload_json = excluded.candidate_payload_json, reviewer_payload_json = excluded.reviewer_payload_json,
        updated_at = CURRENT_TIMESTAMP`
    )
      .bind(
        seed.id,
        seed.versionLabel,
        seed.examTrack,
        seed.versionCode,
        seed.versionLabel,
        seed.title,
        seed.description,
        seed.totalPoints,
        seed.passingScore,
        seed.timeLimitMinutes,
        seed.candidateInstructionsMarkdown,
        JSON.stringify({ instructionsMarkdown: seed.candidateInstructionsMarkdown, questions: seed.questions }),
        JSON.stringify(seed.reviewerPayload),
        seed.answerKey ? JSON.stringify(seed.answerKey) : null
      )
      .run();
  }
  await audit(env, "BAR_EXAM_VERSION_SEEDED", { count: barExamVersionSeeds.length }, ctx.user.id);
  return json({ ok: true, count: barExamVersionSeeds.length });
}

function canStartExam(ctx: AuthContext): boolean {
  return ctx.permissions.includes("CIVILIAN") || hasActionPermission(ctx, "START_BAR_EXAM");
}

function canReviewExam(ctx: AuthContext): boolean {
  return hasActionPermission(ctx, "REVIEW_BAR_EXAMS") || hasActionPermission(ctx, "ADMIN");
}

function requireReviewer(ctx: AuthContext): AuthContext {
  return requirePermission(ctx, "REVIEW_BAR_EXAMS");
}

function statusMessage(
  ctx: AuthContext,
  availability: "not_eligible" | "no_exam_available" | "no_track_available" | "not_started" | "active_attempt",
  activeVersionCount: number
): string {
  if (availability === "not_eligible") {
    return "You need the Civilian role to begin the Bar Exam.";
  }
  if (availability === "no_exam_available") {
    return "No active Bar Exam is currently available. A Bar Association member must seed exam versions before candidates can begin.";
  }
  if (availability === "no_track_available") {
    return "No active exam is available for your current eligibility track.";
  }
  if (availability === "active_attempt") {
    return "You have an active or recently submitted Bar Exam attempt.";
  }
  return "You are eligible for the native Bar Exam.";
}

function isPrivilegedBarUser(ctx: AuthContext): boolean {
  return ctx.permissions.includes("BAR_ACTIVE") || ctx.permissions.includes("BAR_ASSOCIATION_MEMBER") || hasActionPermission(ctx, "REVIEW_BAR_EXAMS") || hasActionPermission(ctx, "ADMIN");
}

function eligibleExamTracks(_ctx: AuthContext): BarExamTrack[] {
  return [...BAR_EXAM_TRACKS];
}

async function activeVersionTracks(env: Env): Promise<BarExamTrack[]> {
  const result = await env.DB!.prepare(
    "SELECT DISTINCT exam_track as examTrack FROM bar_exam_versions WHERE is_active = 1 AND deleted_at IS NULL ORDER BY exam_track"
  ).all<{ examTrack: string }>();
  return result.results
    .map((row) => row.examTrack)
    .filter((track): track is BarExamTrack => BAR_EXAM_TRACKS.includes(track as BarExamTrack));
}

async function activeVersionCountsByKind(env: Env): Promise<{ total: number; imported: number; placeholder: number }> {
  const row = await env.DB!.prepare(
    `SELECT COUNT(*) as total,
      SUM(CASE WHEN version_key LIKE 'legacy:%' OR reviewer_payload_json LIKE '%legacyBarExamAppsScript.js%' THEN 1 ELSE 0 END) as imported,
      SUM(CASE WHEN description LIKE '%placeholder%' OR title LIKE '%placeholder%' OR reviewer_payload_json LIKE '%No committed rubric%' THEN 1 ELSE 0 END) as placeholder
     FROM bar_exam_versions WHERE is_active = 1 AND deleted_at IS NULL`
  ).first<{ total: number; imported: number | null; placeholder: number | null }>();
  return {
    total: Number(row?.total ?? 0),
    imported: Number(row?.imported ?? 0),
    placeholder: Number(row?.placeholder ?? 0)
  };
}

async function activeAttempts(env: Env, userId: string, track?: BarExamTrack) {
  const params = track ? [userId, track] : [userId];
  const where = track ? "WHERE bea.user_id = ? AND bea.exam_track = ? AND bea.deleted_at IS NULL" : "WHERE bea.user_id = ? AND bea.deleted_at IS NULL";
  const result = await env.DB!.prepare(`${selectAttempts()} ${where} ORDER BY bea.updated_at DESC`).bind(...params).all<AttemptRow>();
  return result.results;
}

async function candidateOwnedAttempt(request: Request, env: Env, ctx: AuthContext): Promise<AttemptRow | null> {
  const track = new URL(request.url).searchParams.get("track") as BarExamTrack | null;
  const attempts = await activeAttempts(env, ctx.user.id, track && BAR_EXAM_TRACKS.includes(track) ? track : undefined);
  return attempts[0] ?? null;
}

async function canCandidateEdit(env: Env, attempt: AttemptRow): Promise<boolean> {
  await expireIfNeeded(env, attempt);
  return editableStatuses().includes(attempt.status as BarExamAttemptStatus) && new Date(attempt.deadlineAt).getTime() > Date.now();
}

function editableStatuses(): BarExamAttemptStatus[] {
  return ["OPENED", "IN_PROGRESS", "REOPENED"];
}

async function expireIfNeeded(env: Env, attempt: AttemptRow): Promise<void> {
  if (editableStatuses().includes(attempt.status as BarExamAttemptStatus) && new Date(attempt.deadlineAt).getTime() <= Date.now()) {
    await env.DB!.prepare("UPDATE bar_exam_attempts SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(attempt.id).run();
    await addBarExamEvent(env, attempt.id, null, "BAR_EXAM_EXPIRED", "Bar Exam deadline expired before submission.", {});
    await audit(env, "BAR_EXAM_EXPIRED", { attempt_id: attempt.id });
  }
}

async function assignVersion(env: Env, track: BarExamTrack): Promise<VersionData | null> {
  const result = await env.DB!.prepare(
    `${selectVersion()} WHERE bev.exam_track = ? AND bev.is_active = 1 AND bev.deleted_at IS NULL
     ORDER BY
       (CASE WHEN bev.version_key LIKE 'legacy:%' OR bev.reviewer_payload_json LIKE '%legacyBarExamAppsScript.js%' THEN 1 ELSE 0 END) DESC,
       (CASE WHEN bev.description LIKE '%placeholder%' OR bev.title LIKE '%placeholder%' OR bev.reviewer_payload_json LIKE '%No committed rubric%' THEN 1 ELSE 0 END) ASC,
       (SELECT COUNT(*) FROM bar_exam_attempts bea WHERE bea.version_id = bev.id AND bea.deleted_at IS NULL) ASC,
       bev.version_code ASC
     LIMIT 1`
  )
    .bind(track)
    .all<VersionRow>();
  return result.results[0] ? rowToVersion(result.results[0]) : null;
}

async function loadVersion(env: Env, id: string): Promise<VersionData | null> {
  const row = await env.DB!.prepare(`${selectVersion()} WHERE bev.id = ? AND bev.deleted_at IS NULL`).bind(id).first<VersionRow>();
  return row ? rowToVersion(row) : null;
}

async function loadAttemptByLock(env: Env, lockKey: string): Promise<AttemptRow | null> {
  return env.DB!.prepare(`${selectAttempts()} WHERE bea.identity_lock_key = ? AND bea.deleted_at IS NULL ORDER BY bea.updated_at DESC LIMIT 1`).bind(lockKey).first<AttemptRow>();
}

async function loadAttempt(env: Env, id: string): Promise<AttemptRow | null> {
  return env.DB!.prepare(`${selectAttempts()} WHERE bea.id = ? OR bea.attempt_number = ?`).bind(id, id).first<AttemptRow>();
}

async function candidateAttempt(env: Env, id: string) {
  const attempt = await loadAttempt(env, id);
  if (!attempt) return null;
  const version = await loadVersion(env, attempt.versionId);
  if (!version) return null;
  return {
    ...rowToCandidateSummary(attempt),
    title: version.title,
    candidateInstructionsMarkdown: version.instructionsMarkdown,
    integrityText: INTEGRITY_TEXT,
    questions: version.questions,
    answers: await answerDrafts(env, attempt.id),
    resources: (await (await barExamResources(new Request("http://local/api/bar-exam/resources"), env)).json() as { data: unknown[] }).data
  };
}

async function reviewerAttempt(env: Env, id: string) {
  const attempt = await loadAttempt(env, id);
  if (!attempt) return null;
  const version = await loadVersion(env, attempt.versionId);
  if (!version) return null;
  return {
    ...rowToAdminSummary(attempt),
    title: version.title,
    passingScore: version.passingScore,
    totalPoints: version.totalPoints,
    questions: version.questions,
    answers: await adminAnswers(env, attempt.id, version.questions),
    reviewerPayload: version.reviewerPayload,
    answerKey: version.answerKey,
    events: await barExamEvents(env, attempt.id)
  };
}

function validateAnswers(input: BarExamAnswerDraft[] | undefined, questions: BarExamQuestion[]) {
  if (!Array.isArray(input)) return { ok: false as const, message: "Answers are required." };
  const questionMap = new Map(questions.map((question) => [question.key, question]));
  const cleaned: BarExamAnswerDraft[] = [];
  const serialized = JSON.stringify(input);
  if (serialized.length > ANSWER_LIMIT) return { ok: false as const, message: "Answer payload is too large." };
  if (/<[^>]+>/.test(serialized)) return { ok: false as const, message: "HTML is not allowed in exam answers." };
  for (const answer of input) {
    const question = questionMap.get(answer.questionKey);
    if (!question) return { ok: false as const, message: "Answer references a question outside the assigned version." };
    const answerText = clean(answer.answerText);
    const selectedChoice = clean(answer.selectedChoice);
    if (question.kind === "MULTIPLE_CHOICE" && selectedChoice && !question.choices?.some((choice) => choice.value === selectedChoice)) {
      return { ok: false as const, message: "Selected choice is not valid for this question." };
    }
    cleaned.push({ questionKey: answer.questionKey, answerText: answerText ?? "", selectedChoice: selectedChoice ?? "" });
  }
  return { ok: true as const, value: cleaned };
}

async function writeAnswers(env: Env, attemptId: string, answers: BarExamAnswerDraft[], submitted: boolean) {
  const now = new Date().toISOString();
  for (const answer of answers) {
    await env.DB!.prepare(
      `INSERT INTO bar_exam_answers (id, attempt_id, question_key, answer_markdown, answer_text, selected_choice, draft_saved_at, submitted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(attempt_id, question_key) DO UPDATE SET answer_markdown = excluded.answer_markdown,
       answer_text = excluded.answer_text, selected_choice = excluded.selected_choice, draft_saved_at = excluded.draft_saved_at,
       submitted_at = COALESCE(excluded.submitted_at, bar_exam_answers.submitted_at), updated_at = CURRENT_TIMESTAMP`
    )
      .bind(crypto.randomUUID(), attemptId, answer.questionKey, answer.answerText ?? "", answer.answerText ?? "", answer.selectedChoice ?? "", now, submitted ? now : null)
      .run();
  }
}

async function answerDrafts(env: Env, attemptId: string): Promise<BarExamAnswerDraft[]> {
  const result = await env.DB!.prepare(
    "SELECT question_key as questionKey, answer_text as answerText, selected_choice as selectedChoice, draft_saved_at as draftSavedAt FROM bar_exam_answers WHERE attempt_id = ? ORDER BY question_key"
  )
    .bind(attemptId)
    .all<BarExamAnswerDraft>();
  return result.results;
}

async function adminAnswers(env: Env, attemptId: string, questions: BarExamQuestion[]) {
  const maxByKey = new Map(questions.map((question) => [question.key, question.points]));
  const result = await env.DB!.prepare(
    `SELECT question_key as questionKey, answer_text as answerText, selected_choice as selectedChoice, draft_saved_at as draftSavedAt,
      points_awarded as pointsAwarded, max_points as maxPoints, reviewer_notes as reviewerNotes
      FROM bar_exam_answers WHERE attempt_id = ? ORDER BY question_key`
  )
    .bind(attemptId)
    .all<{ questionKey: string; answerText: string | null; selectedChoice: string | null; draftSavedAt: string | null; pointsAwarded: number | null; maxPoints: number | null; reviewerNotes: string | null }>();
  return result.results.map((answer) => ({ ...answer, maxPoints: answer.maxPoints ?? maxByKey.get(answer.questionKey) ?? 0 }));
}

async function nextAttemptNumber(env: Env, track: BarExamTrack): Promise<string> {
  const year = new Date().getUTCFullYear();
  const row = await env.DB!.prepare(
    `INSERT INTO bar_exam_attempt_counters (id, exam_track, year, last_number, updated_at)
     VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
     ON CONFLICT(exam_track, year) DO UPDATE SET last_number = last_number + 1, updated_at = CURRENT_TIMESTAMP
     RETURNING last_number as lastNumber`
  )
    .bind(`${track}-${year}`, track, year)
    .first<{ lastNumber: number }>();
  const prefix = track === "DEFENSE" ? "DEF-BAR" : "DOJ-BAR";
  return `${prefix}-${year}-${String(row?.lastNumber ?? 1).padStart(4, "0")}`;
}

async function notifyReviewers(env: Env, attemptId: string, actorUserId: string | null) {
  const attempt = await loadAttempt(env, attemptId);
  if (!attempt) return;
  try {
    const channelId = await mappingId(env, "BAR_EXAM_SUBMISSIONS");
    if (!channelId) throw new Error("BAR_EXAM_SUBMISSIONS mapping is not configured.");
    const roleId = await roleIdByName(env, "Bar Association Member");
    const appUrl = (env.PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    const response = await discordApi(env, `/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: roleId ? `<@&${roleId}>` : undefined,
        embeds: [{
          title: "New Miami Stories Bar Exam Submission",
          color: 0xff2fae,
          fields: [
            { name: "Attempt", value: attempt.attemptNumber, inline: true },
            { name: "Track", value: attempt.examTrack, inline: true },
            { name: "Assigned Version", value: attempt.versionLabel || "Unknown", inline: true },
            { name: "Candidate", value: attempt.candidateName || attempt.discordUsername || "Unknown", inline: false },
            { name: "Discord", value: attempt.discordUsername || "Unknown", inline: true },
            { name: "Submitted", value: attempt.submittedAt ? `<t:${Math.floor(new Date(attempt.submittedAt).getTime() / 1000)}:F>` : "Just now", inline: true },
            { name: "Reviewer Dashboard", value: appUrl ? `${appUrl}/dashboard/bar-exam/${attempt.id}` : `/dashboard/bar-exam/${attempt.id}`, inline: false }
          ]
        }]
      })
    });
    if (!response.ok) throw new Error(`Discord notification failed with ${response.status}`);
    const message = await response.json() as { id: string; channel_id?: string };
    await env.DB!.prepare("UPDATE bar_exam_attempts SET discord_notification_channel_id = ?, discord_notification_message_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(message.channel_id || channelId, message.id, attemptId)
      .run();
    await addBarExamEvent(env, attemptId, actorUserId, "BAR_EXAM_REVIEWER_NOTIFICATION_POSTED", "Safe reviewer notification posted to Discord.", {});
    await audit(env, "BAR_EXAM_REVIEWER_NOTIFICATION_POSTED", { attempt_id: attemptId }, actorUserId);
  } catch (cause) {
    await addBarExamEvent(env, attemptId, actorUserId, "BAR_EXAM_REVIEWER_NOTIFICATION_FAILED", "Discord reviewer notification failed; submission remains stored.", { reason: safeError(cause) });
    await audit(env, "BAR_EXAM_REVIEWER_NOTIFICATION_FAILED", { attempt_id: attemptId, reason: safeError(cause) }, actorUserId);
  }
}

async function notifyCandidate(env: Env, attemptId: string, status: string, actorUserId: string | null) {
  const attempt = await loadAttempt(env, attemptId);
  if (!attempt?.discordUserId) return;
  const message = status === "PASSED"
    ? "Your Miami Stories DOJ Bar Exam submission has been reviewed. Result: Passed. Please check the DOJ Portal or wait for a Bar Association member for next steps."
    : status === "FAILED"
      ? "Your Miami Stories DOJ Bar Exam submission has been reviewed. Result: Not passed. Please open a DOJ Bar Exam support ticket so a Bar Association member can explain next steps."
      : status === "VOIDED"
        ? "Your Miami Stories DOJ Bar Exam attempt has been administratively voided. Please open a DOJ Bar Exam support ticket so a Bar Association member can explain next steps."
        : "Your Miami Stories DOJ Bar Exam submission requires follow-up. Please open a DOJ Bar Exam support ticket so a Bar Association member can review feedback with you.";
  try {
    const dm = await discordApi(env, "/users/@me/channels", { method: "POST", body: JSON.stringify({ recipient_id: attempt.discordUserId }) });
    if (!dm.ok) throw new Error(`Discord DM channel failed with ${dm.status}`);
    const channel = await dm.json() as { id: string };
    const sent = await discordApi(env, `/channels/${channel.id}/messages`, { method: "POST", body: JSON.stringify({ content: message }) });
    if (!sent.ok) throw new Error(`Discord DM failed with ${sent.status}`);
    await addBarExamEvent(env, attemptId, actorUserId, "BAR_EXAM_CANDIDATE_DM_SENT", "Candidate decision DM sent.", { status });
    await audit(env, "BAR_EXAM_CANDIDATE_DM_SENT", { attempt_id: attemptId, status }, actorUserId);
  } catch (cause) {
    if (cause instanceof MissingEnvironmentError) {
      await addBarExamEvent(env, attemptId, actorUserId, "BAR_EXAM_CANDIDATE_DM_FAILED", "Candidate DM could not be sent because Discord bot env is missing.", {});
    } else {
      await addBarExamEvent(env, attemptId, actorUserId, "BAR_EXAM_CANDIDATE_DM_FAILED", "Candidate DM failed. Staff should follow up manually.", { reason: safeError(cause) });
    }
    await audit(env, "BAR_EXAM_CANDIDATE_DM_FAILED", { attempt_id: attemptId, status, reason: safeError(cause) }, actorUserId);
    await postPublicFollowupFallback(env, attempt, status, actorUserId);
  }
}

async function postPublicFollowupFallback(env: Env, attempt: AttemptRow, status: string, actorUserId: string | null) {
  try {
    const channel = await fallbackFollowupChannel(env);
    if (!channel) {
      await addBarExamEvent(env, attempt.id, actorUserId, "BAR_EXAM_PUBLIC_FOLLOWUP_FAILED", "No safe public follow-up channel mapping is configured. Manual staff follow-up required.", {});
      await audit(env, "BAR_EXAM_PUBLIC_FOLLOWUP_FAILED", { attempt_id: attempt.id, reason: "missing_mapping" }, actorUserId);
      return;
    }
    const content = `<@${attempt.discordUserId}> Your DOJ Bar Exam review requires follow-up. Please open a DOJ Bar Exam or general support ticket so a Bar Association member can speak with you.`;
    const response = await discordApi(env, `/channels/${channel.id}/messages`, {
      method: "POST",
      body: JSON.stringify({ content })
    });
    if (!response.ok) throw new Error(`Discord fallback follow-up failed with ${response.status}`);
    await addBarExamEvent(env, attempt.id, actorUserId, "BAR_EXAM_PUBLIC_FOLLOWUP_POSTED", "Safe public fallback follow-up mention posted.", { status, mapping_key: channel.key });
    await audit(env, "BAR_EXAM_PUBLIC_FOLLOWUP_POSTED", { attempt_id: attempt.id, status, mapping_key: channel.key }, actorUserId);
  } catch (cause) {
    await addBarExamEvent(env, attempt.id, actorUserId, "BAR_EXAM_PUBLIC_FOLLOWUP_FAILED", "Safe public fallback follow-up failed. Manual staff follow-up required.", {
      reason: safeError(cause)
    });
    await audit(env, "BAR_EXAM_PUBLIC_FOLLOWUP_FAILED", { attempt_id: attempt.id, status, reason: safeError(cause) }, actorUserId);
  }
}

async function fallbackFollowupChannel(env: Env): Promise<{ id: string; key: string } | null> {
  for (const key of ["GENERAL_CHAT", "BAR_EXAM_FOLLOWUP_PUBLIC"]) {
    const id = await mappingId(env, key);
    if (id) return { id, key };
  }
  return null;
}

async function mappingId(env: Env, key: string): Promise<string | null> {
  const row = await env.DB!.prepare("SELECT discord_channel_id as id FROM discord_channel_mappings WHERE mapping_key = ?").bind(key).first<{ id: string }>();
  return row?.id || null;
}

async function roleIdByName(env: Env, roleName: string): Promise<string | null> {
  const row = await env.DB!.prepare("SELECT discord_role_id as id FROM role_mappings WHERE role_name = ?").bind(roleName).first<{ id: string }>();
  return row?.id ?? null;
}

async function barExamEvents(env: Env, attemptId: string) {
  const result = await env.DB!.prepare(
    "SELECT id, event_type as eventType, message, metadata_json as metadataJson, created_at as createdAt FROM bar_exam_events WHERE attempt_id = ? ORDER BY created_at ASC"
  )
    .bind(attemptId)
    .all<{ id: string; eventType: string; message: string | null; metadataJson: string; createdAt: string }>();
  return result.results.map((event) => ({ ...event, metadata: parseObject(event.metadataJson) }));
}

async function addBarExamEvent(env: Env, attemptId: string | null, actorUserId: string | null, eventType: string, message: string, metadata: Record<string, unknown>) {
  await env.DB!.prepare("INSERT INTO bar_exam_events (id, attempt_id, actor_user_id, event_type, message, metadata_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), attemptId, actorUserId, eventType, message, JSON.stringify(metadata))
    .run();
}

function selectAttempts(): string {
  return `SELECT bea.id, bea.attempt_number as attemptNumber, bea.identity_lock_key as identityLockKey, bea.user_id as userId,
    bea.discord_user_id as discordUserId, bea.discord_username as discordUsername, bea.candidate_name as candidateName,
    bea.candidate_phone as candidatePhone, bea.candidate_email as candidateEmail, bea.exam_track as examTrack,
    bea.version_id as versionId, bea.version_label as versionLabel, bea.status, COALESCE(bea.started_at, bea.opened_at) as startedAt,
    bea.deadline_at as deadlineAt, bea.submitted_at as submittedAt, bea.final_score as finalScore, bea.decision,
    bea.reviewer_user_id as reviewerUserId, bea.reviewer_name as reviewerName, bea.followup_channel_id as followupChannelId,
    bea.deleted_at as deletedAt, bea.deleted_by_user_id as deletedByUserId, bea.deleted_by_display_name as deletedByDisplayName,
    bea.delete_reason as deleteReason, bea.created_at as createdAt, bea.updated_at as updatedAt
    FROM bar_exam_attempts bea`;
}

function selectVersion(): string {
  return `SELECT bev.id, bev.exam_track as examTrack, bev.version_code as versionCode, bev.version_label as versionLabel, bev.title,
    bev.total_points as totalPoints, bev.passing_score as passingScore, bev.time_limit_minutes as timeLimitMinutes,
    bev.candidate_payload_json as candidatePayloadJson, bev.reviewer_payload_json as reviewerPayloadJson, bev.answer_key_json as answerKeyJson
    FROM bar_exam_versions bev`;
}

function rowToCandidateSummary(row: AttemptRow) {
  return {
    id: row.id,
    attemptNumber: row.attemptNumber,
    examTrack: row.examTrack as BarExamTrack,
    versionLabel: row.versionLabel,
    status: normalizeStatus(row.status),
    startedAt: row.startedAt,
    deadlineAt: row.deadlineAt,
    submittedAt: row.submittedAt,
    finalScore: row.finalScore,
    decision: row.decision,
    followupChannelId: row.followupChannelId,
    deletedAt: row.deletedAt,
    deletedByUserId: row.deletedByUserId,
    deletedByDisplayName: row.deletedByDisplayName,
    deleteReason: row.deleteReason
  };
}

function rowToAdminSummary(row: AttemptRow) {
  return {
    ...rowToCandidateSummary(row),
    discordUserId: row.discordUserId,
    discordUsername: row.discordUsername,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    candidateEmail: row.candidateEmail,
    reviewerName: row.reviewerName
  };
}

function rowToVersion(row: VersionRow): VersionData {
  const payload = parseObject(row.candidatePayloadJson) as { instructionsMarkdown?: string; questions?: BarExamQuestion[] };
  return {
    id: row.id,
    examTrack: row.examTrack as BarExamTrack,
    versionLabel: row.versionLabel,
    title: row.title,
    totalPoints: row.totalPoints,
    passingScore: row.passingScore,
    timeLimitMinutes: row.timeLimitMinutes,
    instructionsMarkdown: typeof payload.instructionsMarkdown === "string" ? payload.instructionsMarkdown : "",
    questions: Array.isArray(payload.questions) ? payload.questions : [],
    reviewerPayload: parseObject(row.reviewerPayloadJson || "{}"),
    answerKey: row.answerKeyJson ? parseObject(row.answerKeyJson) : null
  };
}

function eventForStatus(status: BarExamAttemptStatus): string {
  const events: Record<BarExamAttemptStatus, string> = {
    OPENED: "BAR_EXAM_REOPENED",
    IN_PROGRESS: "BAR_EXAM_REOPENED",
    SUBMITTED: "BAR_EXAM_SUBMITTED",
    UNDER_REVIEW: "BAR_EXAM_REVIEW_STARTED",
    PASSED: "BAR_EXAM_PASSED",
    FAILED: "BAR_EXAM_FAILED",
    REFERRED_FOR_INTERVIEW: "BAR_EXAM_REFERRED",
    VOIDED: "BAR_EXAM_VOIDED",
    EXPIRED: "BAR_EXAM_EXPIRED",
    REOPENED: "BAR_EXAM_REOPENED",
    NEEDS_CANDIDATE_FOLLOW_UP: "BAR_EXAM_NEEDS_CANDIDATE_FOLLOW_UP"
  };
  return events[status];
}

function identityLock(discordId: string, track: BarExamTrack): string {
  return `${discordId}:${track}:2026`;
}

function normalizeStatus(value: string): BarExamAttemptStatus {
  return BAR_EXAM_ATTEMPT_STATUSES.includes(value as BarExamAttemptStatus) ? (value as BarExamAttemptStatus) : "OPENED";
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().replaceAll(/[\u0000-\u001f]/g, "").slice(0, 5000) : null;
}

function parseObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function safeError(cause: unknown): string {
  return cause instanceof Error ? cause.message.slice(0, 180) : "Unknown error";
}

interface AttemptRow {
  id: string;
  attemptNumber: string;
  identityLockKey: string;
  userId: string;
  discordUserId: string;
  discordUsername: string | null;
  candidateName: string | null;
  candidatePhone: string | null;
  candidateEmail: string | null;
  examTrack: string;
  versionId: string;
  versionLabel: string;
  status: string;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  finalScore: number | null;
  decision: string | null;
  reviewerUserId: string | null;
  reviewerName: string | null;
  followupChannelId: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deletedByDisplayName: string | null;
  deleteReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VersionRow {
  id: string;
  examTrack: string;
  versionCode: string;
  versionLabel: string;
  title: string;
  totalPoints: number;
  passingScore: number;
  timeLimitMinutes: number;
  candidatePayloadJson: string;
  reviewerPayloadJson: string | null;
  answerKeyJson: string | null;
}

interface VersionData {
  id: string;
  examTrack: BarExamTrack;
  versionLabel: string;
  title: string;
  totalPoints: number;
  passingScore: number;
  timeLimitMinutes: number;
  instructionsMarkdown: string;
  questions: BarExamQuestion[];
  reviewerPayload: Record<string, unknown>;
  answerKey: Record<string, unknown> | null;
}

async function getBarEligibleRoleId(env: Env): Promise<string | null> {
  const row = await env.DB!.prepare(
    "SELECT discord_role_id as id FROM role_mappings WHERE permission_key = 'BAR_ELIGIBLE' OR role_name = 'Bar Eligible'"
  ).first<{ id: string }>();
  return row?.id ?? null;
}

async function getReviewerAndAdminRoleIds(env: Env): Promise<string[]> {
  const result = await env.DB!.prepare(
    "SELECT discord_role_id as id FROM role_mappings WHERE permission_key IN ('BAR_ASSOCIATION_MEMBER', 'ADMIN', 'CHIEF_JUSTICE', 'REVIEW_BAR_EXAMS')"
  ).all<{ id: string }>();
  return result.results.map((row) => row.id).filter(Boolean);
}

export async function createBarExamFollowupChannel(env: Env, attempt: { id: string; attemptNumber: string; discordUserId: string }): Promise<{ id: string; name: string }> {
  const guildId = requireEnv(env, "DISCORD_GUILD_ID");
  const categoryId = await barExamFollowupCategoryId(env);
  const shortId = attempt.attemptNumber.toLowerCase();
  const channelNameStr = `bar-eligible-${shortId}`.slice(0, 100);
  
  const botUser = await fetchBotUser(env);
  
  const channelsResponse = await discordApi(env, `/guilds/${guildId}/channels`);
  if (!channelsResponse.ok) throw new Error(`Failed to list guild channels (status ${channelsResponse.status})`);
  const channels = await channelsResponse.json() as any[];
  
  const existing = channels.find(c => c.name === channelNameStr && c.parent_id === categoryId && c.type === 0);
  if (existing) return { id: existing.id, name: existing.name };
  
  const rolesResponse = await discordApi(env, `/guilds/${guildId}/roles`);
  if (!rolesResponse.ok) throw new Error(`Failed to list guild roles (status ${rolesResponse.status})`);
  const roles = await rolesResponse.json() as any[];
  
  const botMemberResponse = await discordApi(env, `/guilds/${guildId}/members/${botUser.id}`);
  if (!botMemberResponse.ok) throw new Error(`Failed to fetch bot member (status ${botMemberResponse.status})`);
  const botMember = await botMemberResponse.json() as any;
  
  const requesterMemberResponse = await discordApi(env, `/guilds/${guildId}/members/${attempt.discordUserId}`);
  const requesterMember = requesterMemberResponse.ok ? await requesterMemberResponse.json() as any : null;
  
  const roleIds = await getReviewerAndAdminRoleIds(env);
  
  const VIEW_CHANNEL = 1024n;
  const SEND_MESSAGES = 2048n;
  const EMBED_LINKS = 16384n;
  const READ_HISTORY = 65536n;
  const MANAGE_CHANNELS = 16n;
  const MANAGE_ROLES = 268435456n;

  const allow = (VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | READ_HISTORY).toString();
  const botAllow = (VIEW_CHANNEL | SEND_MESSAGES | EMBED_LINKS | READ_HISTORY | MANAGE_CHANNELS | MANAGE_ROLES).toString();
  
  const overwriteBuild = buildPermissionOverwrites({
    guildId,
    botUserId: botUser.id,
    requesterDiscordId: attempt.discordUserId,
    roleIds,
    roles,
    botMember,
    requesterMember,
    allow,
    botAllow
  });
  
  const endpoint = `/guilds/${guildId}/channels`;
  const response = await discordApi(env, endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: channelNameStr,
      type: 0,
      parent_id: categoryId,
      topic: `Bar Exam oral interview & follow-up for ${attempt.attemptNumber}.`,
      permission_overwrites: overwriteBuild.overwrites
    })
  });
  
  if (response.ok) return await response.json() as { id: string; name: string };
  
  if (response.status === 403) {
    const fallbackResponse = await discordApi(env, endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: channelNameStr,
        type: 0,
        parent_id: categoryId,
        topic: `Bar Exam oral interview & follow-up for ${attempt.attemptNumber}.`,
        permission_overwrites: overwriteBuild.minimalOverwrites
      })
    });
    if (fallbackResponse.ok) return await fallbackResponse.json() as { id: string; name: string };
  }
  
  throw new Error(`Discord channel creation failed with status ${response.status}`);
}

async function barExamFollowupCategoryId(env: Env): Promise<string> {
  if (!env.DB) throw new Error("D1 is required to load the Bar Exam follow-up category mapping.");
  const row = await env.DB.prepare(
    "SELECT discord_channel_id as id FROM discord_channel_mappings WHERE mapping_key = 'BAR_EXAM_FOLLOWUP_CATEGORY' AND discord_channel_id != ''"
  ).first<{ id: string }>();
  if (!row?.id) throw new Error("BAR_EXAM_FOLLOWUP_CATEGORY channel mapping is not configured.");
  return row.id;
}

export async function postBarExamFollowupEmbed(env: Env, channelId: string, applicantDiscordUserId: string, attemptNumber: string): Promise<void> {
  const content = `<@${applicantDiscordUserId}>, your bar license will be with you shortly.`;
  const endpoint = `/channels/${channelId}/messages`;
  const response = await discordApi(env, endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content,
      embeds: [{
        title: `Bar Exam Oral Interview & Coordination - ${attemptNumber}`,
        color: 0xff2fae,
        description: "Bar Exam follow-up / oral interview coordination channel.\n\nReviewers may use this channel to coordinate final licensing steps, oral questions, or allow the applicant to clarify/re-explain answers."
      }]
    })
  });
  if (!response.ok) {
    throw new Error(`Discord message posting failed with status ${response.status}`);
  }
}

export async function createFollowupChannelRoute(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requireReviewer(await requireAuth(request, env));
  const attempt = await loadAttempt(env, id);
  if (!attempt) return errorJson("NOT_FOUND", "Bar Exam attempt not found.", 404);
  if (attempt.status !== "PASSED") {
    return errorJson("VALIDATION_ERROR", "The attempt must be marked PASSED before creating a follow-up channel.", 400);
  }
  if (attempt.followupChannelId) {
    return json({ data: await reviewerAttempt(env, id), warning: "Follow-up channel already exists." });
  }
  try {
    const channelResult = await createBarExamFollowupChannel(env, attempt);
    const channelId = channelResult.id;
    await env.DB!.prepare("UPDATE bar_exam_attempts SET followup_channel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(channelId, id)
      .run();
    await postBarExamFollowupEmbed(env, channelId, attempt.discordUserId, attempt.attemptNumber);
    
    await addBarExamEvent(env, id, ctx.user.id, "BAR_EXAM_FOLLOWUP_CHANNEL_CREATED", "Private follow-up coordination channel created manually.", { followup_channel_id: channelId });
    await audit(env, "BAR_EXAM_FOLLOWUP_CHANNEL_CREATED", { attempt_id: id, followup_channel_id: channelId }, ctx.user.id);
    
    return json({ data: await reviewerAttempt(env, id) });
  } catch (cause) {
    const errorStr = cause instanceof Error ? cause.message : "Unknown error";
    await addBarExamEvent(env, id, ctx.user.id, "BAR_EXAM_FOLLOWUP_CHANNEL_FAILED", `Failed to create follow-up channel: ${errorStr}`, {});
    await audit(env, "BAR_EXAM_FOLLOWUP_CHANNEL_FAILED", { attempt_id: id, error: errorStr }, ctx.user.id);
    return errorJson("DISCORD_CHANNEL_FAILED", `Failed to create Discord channel: ${errorStr}`, 500);
  }
}
