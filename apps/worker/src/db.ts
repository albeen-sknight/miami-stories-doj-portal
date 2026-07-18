import type { AttorneyProfile, AttorneyResponsibility, DocketEntry, FaqEntry, ResourceDocument } from "@shotta-doj/shared";

type Queryable = D1Database | undefined;

type AttorneyRow = {
  id: string;
  displayName: string;
  profileSlug: string;
  title: string;
  shortTitle: string;
  office: string;
  division: string;
  branch: string | null;
  affiliations: string | null;
  status: string;
  profileKind: string;
  barNumber: string | null;
  practiceAreas: string;
  biographyMarkdown: string;
  experienceMarkdown: string | null;
  educationMarkdown: string | null;
  achievementsMarkdown: string | null;
  professionalHistoryMarkdown: string | null;
  profileImageUrl: string | null;
  motto: string | null;
  quote: string | null;
  responsibilities: string;
  sortOrder: number;
  contact: string;
};

const attorneySelect = `
  id,
  display_name as displayName,
  profile_slug as profileSlug,
  title,
  short_title as shortTitle,
  office,
  division,
  branch,
  affiliations_json as affiliations,
  status,
  profile_kind as profileKind,
  bar_number as barNumber,
  practice_areas_json as practiceAreas,
  biography_markdown as biographyMarkdown,
  experience_markdown as experienceMarkdown,
  education_markdown as educationMarkdown,
  achievements_markdown as achievementsMarkdown,
  professional_history_markdown as professionalHistoryMarkdown,
  profile_image_url as profileImageUrl,
  motto,
  quote,
  responsibilities_json as responsibilities,
  sort_order as sortOrder,
  contact
`;

export async function listResources(db: Queryable): Promise<ResourceDocument[] | null> {
  if (!db) return null;
  try {
    const result = await db
      .prepare(
        "SELECT id, title, category, version, url, description, is_public as isPublic, updated_at as updatedAt FROM resource_documents WHERE is_public = 1 AND deleted_at IS NULL ORDER BY category, title"
      )
      .all<ResourceDocument>();
    return result.results.length > 0 ? result.results : null;
  } catch (cause) {
    console.warn(JSON.stringify({ event: "d1_fallback", table: "resource_documents", cause: String(cause) }));
    return null;
  }
}

export async function listFaq(db: Queryable): Promise<FaqEntry[] | null> {
  if (!db) return null;
  try {
    const result = await db
      .prepare(
        "SELECT id, category, question, answer_markdown as answerMarkdown, sort_order as sortOrder FROM faq_entries WHERE is_public = 1 AND deleted_at IS NULL ORDER BY sort_order, id"
      )
      .all<FaqEntry>();
    return result.results.length > 0 ? result.results : null;
  } catch (cause) {
    console.warn(JSON.stringify({ event: "d1_fallback", table: "faq_entries", cause: String(cause) }));
    return null;
  }
}

export async function listDocket(db: Queryable): Promise<DocketEntry[] | null> {
  if (!db) return null;
  try {
    const result = await db
      .prepare(
        "SELECT id, docket_number as docketNumber, title, entry_type as entryType, status, summary, published_at as publishedAt FROM docket_entries WHERE visibility = 'PUBLIC' AND deleted_at IS NULL ORDER BY published_at DESC"
      )
      .all<DocketEntry>();
    return result.results.length > 0 ? result.results : null;
  } catch (cause) {
    console.warn(JSON.stringify({ event: "d1_fallback", table: "docket_entries", cause: String(cause) }));
    return null;
  }
}

export async function listLawyers(db: Queryable): Promise<AttorneyProfile[] | null> {
  if (!db) return null;
  try {
    const result = await db
      .prepare(
        `SELECT ${attorneySelect} FROM attorney_profiles
         WHERE is_public = 1 AND deleted_at IS NULL AND status IN ('published', 'active')
         ORDER BY sort_order, display_name`
      )
      .all<AttorneyRow>();
    if (result.results.length === 0) return null;
    return result.results.map(mapAttorneyRow);
  } catch (cause) {
    console.warn(JSON.stringify({ event: "d1_fallback", table: "attorney_profiles", cause: String(cause) }));
    return null;
  }
}

export async function getLawyerBySlug(db: Queryable, slug: string): Promise<AttorneyProfile | null> {
  if (!db) return null;
  try {
    const row = await db
      .prepare(
        `SELECT ${attorneySelect} FROM attorney_profiles
         WHERE is_public = 1 AND deleted_at IS NULL AND status IN ('published', 'active') AND (profile_slug = ? OR id = ?)
         LIMIT 1`
      )
      .bind(slug, slug)
      .first<AttorneyRow>();
    return row ? mapAttorneyRow(row) : null;
  } catch (cause) {
    console.warn(JSON.stringify({ event: "d1_fallback", table: "attorney_profiles_detail", cause: String(cause) }));
    return null;
  }
}

export async function getLawyerOwnershipBySlug(db: Queryable, slug: string): Promise<{ id: string; userId: string | null; discordUserId: string | null } | null> {
  if (!db) return null;
  try {
    return await db
      .prepare(
        `SELECT id, user_id as userId, discord_user_id as discordUserId
         FROM attorney_profiles
         WHERE is_public = 1 AND deleted_at IS NULL AND status IN ('published', 'active') AND (profile_slug = ? OR id = ?)
         LIMIT 1`
      )
      .bind(slug, slug)
      .first<{ id: string; userId: string | null; discordUserId: string | null }>();
  } catch (cause) {
    console.warn(JSON.stringify({ event: "d1_fallback", table: "attorney_profiles_owner", cause: String(cause) }));
    return null;
  }
}

function mapAttorneyRow(row: AttorneyRow): AttorneyProfile {
  return {
    id: row.id,
    displayName: row.displayName,
    profileSlug: row.profileSlug,
    title: row.title,
    shortTitle: row.shortTitle,
    office: row.office,
    division: row.division,
    branch: row.branch,
    affiliations: safeJsonArray(row.affiliations ?? "[]"),
    status: row.status,
    profileKind: row.profileKind === "JUDICIAL_OFFICER" ? "JUDICIAL_OFFICER" : "ATTORNEY",
    barNumber: row.barNumber,
    practiceAreas: safeJsonArray(row.practiceAreas),
    biographyMarkdown: row.biographyMarkdown,
    experienceMarkdown: row.experienceMarkdown,
    educationMarkdown: row.educationMarkdown,
    achievementsMarkdown: row.achievementsMarkdown,
    professionalHistoryMarkdown: row.professionalHistoryMarkdown,
    profileImageUrl: row.profileImageUrl,
    motto: row.motto,
    quote: row.quote,
    responsibilities: safeJsonResponsibilities(row.responsibilities),
    sortOrder: row.sortOrder,
    contact: row.contact
  };
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function safeJsonResponsibilities(value: string): AttorneyResponsibility[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is AttorneyResponsibility => {
        return Boolean(item && typeof item === "object" && typeof item.title === "string" && typeof item.description === "string");
      })
      .map((item) => ({ title: item.title, description: item.description }));
  } catch {
    return [];
  }
}
