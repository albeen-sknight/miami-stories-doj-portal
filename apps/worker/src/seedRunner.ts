import { discordCategoryMappingsSeed, discordChannelMappingsSeed, referenceRoleMappingsSeed, roleMappingsSeed } from "./seeds/configSeeds";
import { attorneyProfilesSeed, docketSeed, faqSeed } from "./seeds/publicSeeds";
import { resourceDocumentsSeed } from "./seeds/resources";

export async function seedFoundationData(db: D1Database): Promise<Record<string, number>> {
  let roleMappings = 0;
  for (const [roleName, discordRoleId, permissionKey] of roleMappingsSeed) {
    await db
      .prepare(
        "INSERT OR REPLACE INTO role_mappings (id, role_name, discord_role_id, permission_key, is_reference_only, updated_at) VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)"
      )
      .bind(slugId("role", roleName), roleName, discordRoleId, permissionKey)
      .run();
    roleMappings += 1;
  }
  for (const [roleName, discordRoleId] of referenceRoleMappingsSeed) {
    await db
      .prepare(
        "INSERT OR REPLACE INTO role_mappings (id, role_name, discord_role_id, permission_key, is_reference_only, updated_at) VALUES (?, ?, ?, NULL, 1, CURRENT_TIMESTAMP)"
      )
      .bind(slugId("role", roleName), roleName, discordRoleId)
      .run();
    roleMappings += 1;
  }

  let channelMappings = 0;
  for (const [mappingKey, channelId, notes] of discordChannelMappingsSeed) {
    await db
      .prepare(
        "INSERT OR REPLACE INTO discord_channel_mappings (id, mapping_key, channel_name, discord_channel_id, is_reference_only, notes, updated_at) VALUES (?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)"
      )
      .bind(slugId("channel", mappingKey), mappingKey, mappingKey.toLowerCase().replaceAll("_", "-"), channelId, notes)
      .run();
    channelMappings += 1;
  }

  for (const [mappingKey, categoryId, notes] of discordCategoryMappingsSeed) {
    await db
      .prepare(
        "INSERT OR REPLACE INTO discord_channel_mappings (id, mapping_key, channel_name, discord_channel_id, is_reference_only, notes, updated_at) VALUES (?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)"
      )
      .bind(slugId("category", mappingKey), mappingKey, mappingKey.toLowerCase().replaceAll("_", "-"), categoryId, notes)
      .run();
    channelMappings += 1;
  }

  let resources = 0;
  for (const resource of resourceDocumentsSeed) {
    await db
      .prepare(
        "INSERT OR REPLACE INTO resource_documents (id, title, category, version, url, description, is_public, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
      )
      .bind(resource.id, resource.title, resource.category, resource.version, resource.url, resource.description, resource.isPublic ? 1 : 0)
      .run();
    resources += 1;
  }

  let faq = 0;
  for (const entry of faqSeed) {
    await db
      .prepare(
        "INSERT OR REPLACE INTO faq_entries (id, category, question, answer_markdown, sort_order, is_public, updated_at) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)"
      )
      .bind(entry.id, entry.category, entry.question, entry.answerMarkdown, entry.sortOrder)
      .run();
    faq += 1;
  }

  let lawyers = 0;
  for (const lawyer of attorneyProfilesSeed) {
    await db
      .prepare(
        `INSERT OR REPLACE INTO attorney_profiles (
          id, display_name, profile_slug, title, short_title, office, division, branch, affiliations_json, profile_kind,
          bar_number, practice_areas_json, status, contact, biography_markdown, motto, quote,
          responsibilities_json, sort_order, is_public, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`
      )
      .bind(
        lawyer.id,
        lawyer.displayName,
        lawyer.profileSlug,
        lawyer.title,
        lawyer.shortTitle,
        lawyer.office,
        lawyer.division,
        lawyer.branch ?? lawyer.division,
        JSON.stringify(lawyer.affiliations ?? (lawyer.branch ? [lawyer.branch] : [])),
        lawyer.profileKind,
        lawyer.barNumber ?? null,
        JSON.stringify(lawyer.practiceAreas),
        lawyer.status,
        lawyer.contact ?? "",
        lawyer.biographyMarkdown,
        lawyer.motto ?? null,
        lawyer.quote ?? null,
        JSON.stringify(lawyer.responsibilities),
        lawyer.sortOrder
      )
      .run();
    lawyers += 1;
  }

  let docket = 0;
  for (const entry of docketSeed) {
    await db
      .prepare(
        "INSERT OR REPLACE INTO docket_entries (id, docket_number, title, entry_type, status, summary, visibility, published_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'PUBLIC', ?, CURRENT_TIMESTAMP)"
      )
      .bind(entry.id, entry.docketNumber, entry.title, entry.entryType, entry.status, entry.summary, entry.publishedAt)
      .run();
    docket += 1;
  }

  return { roleMappings, channelMappings, resources, faq, lawyers, docket };
}

function slugId(prefix: string, value: string): string {
  return `${prefix}-${value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, "")}`;
}
