export { discordCategoryMappingsSeed, discordChannelMappingsSeed, referenceDiscordChannelsSeed, roleMappingsSeed } from "./configSeeds";
export { docketSeed, attorneyProfilesSeed, faqSeed } from "./publicSeeds";
export { resourceDocumentsSeed } from "./resources";

export const barExamSeedPlaceholder = {
  versionKey: "stage-1-placeholder",
  title: "Stage 1 Native Bar Exam Placeholder",
  status: "DRAFT",
  timeLimitMinutes: 1440,
  passingScore: 80,
  publicInstructionsMarkdown:
    "Native Bar Exam versions, candidate attempts, scoring, and review workflows will be implemented in a later stage. Legacy answer keys remain server-only migration material."
};
