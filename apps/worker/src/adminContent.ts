import { RESOURCE_CATEGORIES, type ResourceCategory } from "@shotta-doj/shared";
import { audit } from "./audit";
import { requireAuth } from "./auth";
import { errorJson, json } from "./http";
import { requireAnyPermission, requirePermission } from "./permissions";
import type { Env } from "./types";

const RESOURCE_CATEGORY_SET = new Set<string>(RESOURCE_CATEGORIES);

export async function adminResources(request: Request, env: Env): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_RESOURCES");
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for resource management.", 503);
  const url = new URL(request.url);
  const filters: string[] = ["deleted_at IS NULL"];
  const params: string[] = [];
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q");
  if (category) {
    filters.push("category = ?");
    params.push(category);
  }
  if (status === "published") filters.push("is_public = 1");
  if (status === "hidden") filters.push("is_public = 0");
  if (q) {
    filters.push("(title LIKE ? OR description LIKE ? OR url LIKE ? OR category LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await env.DB.prepare(`${resourceSelect()} ${where} ORDER BY is_public DESC, category, sort_order, title LIMIT 200`)
    .bind(...params)
    .all<ResourceRow>();
  await audit(env, "RESOURCE_ADMIN_LIST_VIEWED", { count: result.results.length }, ctx.user.id);
  return json({ data: result.results.map(resourceRow) });
}

export async function adminResourceDetail(request: Request, env: Env, id: string): Promise<Response> {
  requirePermission(await requireAuth(request, env), "MANAGE_RESOURCES");
  const row = await loadResource(env, id);
  if (!row) return errorJson("NOT_FOUND", "Resource not found.", 404);
  return json({ data: resourceRow(row) });
}

export async function createResource(request: Request, env: Env): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_RESOURCES");
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for resource management.", 503);
  const input = await parseResourceInput(request);
  if (!input.ok) return errorJson("VALIDATION_ERROR", input.message, 400);
  const id = input.value.id || slugId("resource", input.value.title);
  await env.DB.prepare(
    `INSERT INTO resource_documents (id, title, category, version, url, description, is_public, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  )
    .bind(id, input.value.title, input.value.category, input.value.version, input.value.url, input.value.description, input.value.isPublic ? 1 : 0, input.value.sortOrder)
    .run();
  await audit(env, "RESOURCE_CREATED", { resource_id: id, title: input.value.title }, ctx.user.id);
  return json({ data: resourceRow((await loadResource(env, id))!) }, { status: 201 });
}

export async function updateResource(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_RESOURCES");
  const existing = await loadResource(env, id);
  if (!existing) return errorJson("NOT_FOUND", "Resource not found.", 404);
  const input = await parseResourceInput(request);
  if (!input.ok) return errorJson("VALIDATION_ERROR", input.message, 400);
  await env.DB!.prepare(
    `UPDATE resource_documents SET title = ?, category = ?, version = ?, url = ?, description = ?, is_public = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  )
    .bind(input.value.title, input.value.category, input.value.version, input.value.url, input.value.description, input.value.isPublic ? 1 : 0, input.value.sortOrder, id)
    .run();
  await audit(env, "RESOURCE_UPDATED", { resource_id: id }, ctx.user.id);
  return json({ data: resourceRow((await loadResource(env, id))!) });
}

export async function setResourcePublication(request: Request, env: Env, id: string, isPublic: boolean, action = isPublic ? "RESOURCE_PUBLISHED" : "RESOURCE_UNPUBLISHED"): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_RESOURCES");
  const existing = await loadResource(env, id);
  if (!existing) return errorJson("NOT_FOUND", "Resource not found.", 404);
  await env.DB!.prepare("UPDATE resource_documents SET is_public = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(isPublic ? 1 : 0, id).run();
  await audit(env, action, { resource_id: id }, ctx.user.id);
  return json({ data: resourceRow((await loadResource(env, id))!) });
}

export async function adminFaq(request: Request, env: Env): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_FAQ");
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for FAQ management.", 503);
  const url = new URL(request.url);
  const filters: string[] = ["deleted_at IS NULL"];
  const params: string[] = [];
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status");
  const q = url.searchParams.get("q");
  if (category) {
    filters.push("category = ?");
    params.push(category);
  }
  if (status === "published") filters.push("is_public = 1");
  if (status === "hidden") filters.push("is_public = 0");
  if (q) {
    filters.push("(question LIKE ? OR answer_markdown LIKE ? OR category LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await env.DB.prepare(`${faqSelect()} ${where} ORDER BY is_public DESC, sort_order, category, question LIMIT 300`)
    .bind(...params)
    .all<FaqRow>();
  await audit(env, "FAQ_ADMIN_LIST_VIEWED", { count: result.results.length }, ctx.user.id);
  return json({ data: result.results.map(faqRow) });
}

export async function adminFaqDetail(request: Request, env: Env, id: string): Promise<Response> {
  requirePermission(await requireAuth(request, env), "MANAGE_FAQ");
  const row = await loadFaq(env, id);
  if (!row) return errorJson("NOT_FOUND", "FAQ entry not found.", 404);
  return json({ data: faqRow(row) });
}

export async function createFaq(request: Request, env: Env): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_FAQ");
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for FAQ management.", 503);
  const input = await parseFaqInput(request);
  if (!input.ok) return errorJson("VALIDATION_ERROR", input.message, 400);
  const id = input.value.id || slugId("faq", `${input.value.category}-${input.value.question}`);
  await env.DB.prepare(
    `INSERT INTO faq_entries (id, category, question, answer_markdown, sort_order, is_public, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  )
    .bind(id, input.value.category, input.value.question, input.value.answerMarkdown, input.value.sortOrder, input.value.isPublic ? 1 : 0)
    .run();
  await audit(env, "FAQ_CREATED", { faq_id: id, category: input.value.category }, ctx.user.id);
  return json({ data: faqRow((await loadFaq(env, id))!) }, { status: 201 });
}

export async function updateFaq(request: Request, env: Env, id: string): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_FAQ");
  const existing = await loadFaq(env, id);
  if (!existing) return errorJson("NOT_FOUND", "FAQ entry not found.", 404);
  const input = await parseFaqInput(request);
  if (!input.ok) return errorJson("VALIDATION_ERROR", input.message, 400);
  await env.DB!.prepare(
    "UPDATE faq_entries SET category = ?, question = ?, answer_markdown = ?, sort_order = ?, is_public = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  )
    .bind(input.value.category, input.value.question, input.value.answerMarkdown, input.value.sortOrder, input.value.isPublic ? 1 : 0, id)
    .run();
  await audit(env, "FAQ_UPDATED", { faq_id: id }, ctx.user.id);
  return json({ data: faqRow((await loadFaq(env, id))!) });
}

export async function setFaqPublication(request: Request, env: Env, id: string, isPublic: boolean, action = isPublic ? "FAQ_PUBLISHED" : "FAQ_UNPUBLISHED"): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_FAQ");
  const existing = await loadFaq(env, id);
  if (!existing) return errorJson("NOT_FOUND", "FAQ entry not found.", 404);
  await env.DB!.prepare("UPDATE faq_entries SET is_public = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(isPublic ? 1 : 0, id).run();
  await audit(env, action, { faq_id: id }, ctx.user.id);
  return json({ data: faqRow((await loadFaq(env, id))!) });
}

export async function faqImportGuidance(request: Request, env: Env): Promise<Response> {
  const ctx = requirePermission(await requireAuth(request, env), "MANAGE_FAQ");
  await audit(env, "FAQ_IMPORT_GUIDANCE_VIEWED", { source: "apps/worker/src/seeds/faqSeed.md" }, ctx.user.id);
  return json({
    ok: true,
    command: "corepack pnpm seed:faq -- --remote",
    message: "FAQ markdown import runs from the private operator CLI so Cloudflare D1 receives the parsed apps/worker/src/seeds/faqSeed.md content without bundling seed files into the Worker."
  });
}

export async function adminBarSummary(request: Request, env: Env): Promise<Response> {
  requireAnyPermission(await requireAuth(request, env), ["REVIEW_BAR_EXAMS", "MANAGE_ATTORNEY_REGISTRY", "ADMIN"]);
  if (!env.DB) return errorJson("D1_UNAVAILABLE", "D1 is required for Bar Association management.", 503);
  const [versions, attempts, attorneys] = await Promise.all([
    env.DB.prepare(`SELECT id, version_label as versionLabel, title, exam_track as examTrack,
      is_active as isActive, status, json_array_length(candidate_payload_json, '$.questions') as questionCount,
      CASE WHEN version_key LIKE 'legacy:%' OR reviewer_payload_json LIKE '%legacyBarExamAppsScript.js%' THEN 1 ELSE 0 END as isImported,
      CASE WHEN description LIKE '%placeholder%' OR title LIKE '%placeholder%' OR reviewer_payload_json LIKE '%No committed rubric%' THEN 1 ELSE 0 END as isPlaceholder
      FROM bar_exam_versions
      WHERE deleted_at IS NULL
      ORDER BY is_active DESC,
        CASE WHEN version_key LIKE 'legacy:%' OR reviewer_payload_json LIKE '%legacyBarExamAppsScript.js%' THEN 0 ELSE 1 END,
        exam_track, version_code`).all(),
    env.DB.prepare(`SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END) as submitted,
      SUM(CASE WHEN status = 'UNDER_REVIEW' THEN 1 ELSE 0 END) as pendingReview,
      SUM(CASE WHEN status = 'PASSED' THEN 1 ELSE 0 END) as passed,
      SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'REFERRED_FOR_INTERVIEW' THEN 1 ELSE 0 END) as referred
      FROM bar_exam_attempts WHERE deleted_at IS NULL`).first(),
    env.DB.prepare("SELECT COUNT(*) as publicCount, SUM(CASE WHEN status IN ('published', 'active') THEN 1 ELSE 0 END) as activeCount FROM attorney_profiles WHERE is_public = 1 AND deleted_at IS NULL").first()
  ]);
  return json({
    data: {
      versions: versions.results,
      activeVersion: versions.results.find((version: Record<string, unknown>) => Boolean(version.isActive)) ?? null,
      attempts,
      attorneys
    }
  });
}

function resourceSelect() {
  return `SELECT id, title, category, version, url, description, is_public as isPublic,
    COALESCE(sort_order, 0) as sortOrder, deleted_at as deletedAt, deleted_by_user_id as deletedByUserId,
    deleted_by_display_name as deletedByDisplayName, delete_reason as deleteReason,
    created_at as createdAt, updated_at as updatedAt FROM resource_documents`;
}

function faqSelect() {
  return `SELECT id, category, question, answer_markdown as answerMarkdown, sort_order as sortOrder,
    is_public as isPublic, deleted_at as deletedAt, deleted_by_user_id as deletedByUserId,
    deleted_by_display_name as deletedByDisplayName, delete_reason as deleteReason,
    created_at as createdAt, updated_at as updatedAt FROM faq_entries`;
}

async function loadResource(env: Env, id: string): Promise<ResourceRow | null> {
  return env.DB!.prepare(`${resourceSelect()} WHERE id = ?`).bind(id).first<ResourceRow>();
}

async function loadFaq(env: Env, id: string): Promise<FaqRow | null> {
  return env.DB!.prepare(`${faqSelect()} WHERE id = ?`).bind(id).first<FaqRow>();
}

async function parseResourceInput(request: Request): Promise<Result<ResourceInput>> {
  const body = (await request.json()) as Partial<ResourceInput>;
  const title = clean(body.title);
  const description = clean(body.description);
  const category = clean(body.category) as ResourceCategory;
  const url = clean(body.url);
  const version = clean(body.version) || "v1.0";
  const sortOrder = Number(body.sortOrder ?? 0);
  if (!title) return { ok: false, message: "Title is required." };
  if (!description) return { ok: false, message: "Description is required." };
  if (!RESOURCE_CATEGORY_SET.has(category)) return { ok: false, message: "Resource category is invalid." };
  if (!validUrl(url)) return { ok: false, message: "A valid http(s) resource URL is required." };
  if (!Number.isFinite(sortOrder)) return { ok: false, message: "Sort order must be a number." };
  return { ok: true, value: { id: clean(body.id), title, description, category, url, version, sortOrder, isPublic: Boolean(body.isPublic) } };
}

async function parseFaqInput(request: Request): Promise<Result<FaqInput>> {
  const body = (await request.json()) as Partial<FaqInput>;
  const category = clean(body.category);
  const question = clean(body.question);
  const answerMarkdown = clean(body.answerMarkdown);
  const sortOrder = Number(body.sortOrder ?? 0);
  if (!category) return { ok: false, message: "Category is required." };
  if (!question) return { ok: false, message: "Question is required." };
  if (!answerMarkdown) return { ok: false, message: "Answer is required." };
  if (!Number.isFinite(sortOrder)) return { ok: false, message: "Sort order must be a number." };
  return { ok: true, value: { id: clean(body.id), category, question, answerMarkdown, sortOrder, isPublic: Boolean(body.isPublic) } };
}

function resourceRow(row: ResourceRow) {
  return { ...row, isPublic: Boolean(row.isPublic), status: row.isPublic ? "published" : "hidden" };
}

function faqRow(row: FaqRow) {
  return { ...row, isPublic: Boolean(row.isPublic), status: row.isPublic ? "published" : "hidden" };
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function slugId(prefix: string, value: string): string {
  return `${prefix}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || crypto.randomUUID()}`;
}

type Result<T> = { ok: true; value: T } | { ok: false; message: string };

interface ResourceInput {
  id?: string;
  title: string;
  category: ResourceCategory;
  version: string;
  url: string;
  description: string;
  sortOrder: number;
  isPublic: boolean;
}

interface FaqInput {
  id?: string;
  category: string;
  question: string;
  answerMarkdown: string;
  sortOrder: number;
  isPublic: boolean;
}

interface ResourceRow extends Omit<ResourceInput, "isPublic"> {
  id: string;
  isPublic: number | boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deletedByDisplayName: string | null;
  deleteReason: string | null;
}

interface FaqRow extends Omit<FaqInput, "isPublic"> {
  id: string;
  isPublic: number | boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deletedByUserId: string | null;
  deletedByDisplayName: string | null;
  deleteReason: string | null;
}
