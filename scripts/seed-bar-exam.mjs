import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const DATABASE_NAME = "miami-stories-doj-db";
const LEGACY_SOURCE = "apps/worker/src/seeds/legacyBarExamAppsScript.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const useLocal = args.has("--local");
const useRemote = args.has("--remote");
const dryRun = args.has("--dry-run");
const printSql = args.has("--print-sql");
const includePrivateSql = args.has("--include-private-sql");
const activate = args.has("--activate") || (!args.has("--inactive") && !dryRun && !printSql);

if ((useLocal && useRemote) || (!useLocal && !useRemote && !dryRun && !printSql)) {
  console.error("Usage: pnpm seed:bar-exam -- --local | --remote | --dry-run | --print-sql [--activate|--inactive]");
  process.exit(1);
}

const sourcePath = path.join(repoRoot, LEGACY_SOURCE);
if (!existsSync(sourcePath)) {
  console.error(`Missing private legacy source: ${LEGACY_SOURCE}`);
  console.error("This file is intentionally gitignored and must be present locally to import real Bar Exam versions.");
  process.exit(1);
}

const source = await readFile(sourcePath, "utf8");
const exams = loadLegacyExams(source);
const versions = exams.map(transformExam);
const sql = buildSql(versions, activate);

const answerKeyCount = versions.reduce((count, version) => count + version.answerKeyEntries, 0);
const activeVersions = activate ? versions : [];

console.log(`Parsed ${versions.length} Bar Exam version(s) from ${LEGACY_SOURCE}.`);
console.log(`Candidate-safe questions: ${versions.reduce((count, version) => count + version.questions.length, 0)}.`);
console.log(`Server-only answer key entries: ${answerKeyCount}.`);
console.log(`Activation mode: ${activate ? "active/published" : "imported inactive"}.`);
if (activeVersions.length > 0) {
  console.log(`Active version labels: ${activeVersions.map((version) => `${version.versionLabel} (${version.id})`).join(", ")}.`);
}
if (answerKeyCount === 0) {
  console.warn("WARNING: No answer keys were imported from the legacy source.");
}

if (dryRun) {
  for (const version of versions) {
    console.log(`${version.versionLabel}: ${version.questions.length} candidate question(s), ${version.answerKeyEntries} server-only key entr${version.answerKeyEntries === 1 ? "y" : "ies"}.`);
  }
  process.exit(0);
}

if (printSql) {
  if (!includePrivateSql) {
    console.error("Refusing to print private Bar Exam SQL because it may contain server-only answer keys.");
    console.error("Use --include-private-sql only in a private local terminal when you intentionally need the full SQL.");
    process.exit(1);
  }
  process.stdout.write(sql);
  process.exit(0);
}

const tempDir = mkdtempSync(path.join(tmpdir(), "miami-stories-doj-bar-exam-"));
const sqlPath = path.join(tempDir, "bar-exam-seed.sql");

try {
  writeFileSync(sqlPath, sql, "utf8");
  const result = spawnSync("corepack", [
    "pnpm",
    "exec",
    "wrangler",
    "d1",
    "execute",
    DATABASE_NAME,
    useRemote ? "--remote" : "--local",
    "--file",
    sqlPath
  ], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function loadLegacyExams(sourceText) {
  const sandbox = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sandbox);
  vm.runInContext(`${sourceText}\n;globalThis.__EXAMS = EXAMS;`, sandbox, {
    filename: LEGACY_SOURCE,
    timeout: 1000
  });
  if (!Array.isArray(sandbox.__EXAMS)) {
    throw new Error("Legacy source did not expose an EXAMS array.");
  }
  return sandbox.__EXAMS;
}

function transformExam(exam) {
  const track = normalizeTrack(exam.track);
  const versionCode = String(exam.version ?? "").trim().toUpperCase();
  if (!["A", "B", "C"].includes(versionCode)) {
    throw new Error(`Unsupported Bar Exam version code: ${exam.version}`);
  }
  const versionLabel = `${track}-${versionCode}`;
  const id = `legacy-${track.toLowerCase()}-${versionCode.toLowerCase()}`;
  const questions = [];
  const answerKey = {};
  for (const question of exam.questions ?? []) {
    const questionKey = `${track}-${versionCode}-q${question.number}`;
    const kind = question.type === "mc" ? "MULTIPLE_CHOICE" : "ESSAY";
    questions.push({
      key: questionKey,
      prompt: cleanText(question.prompt),
      kind,
      points: Number(question.points) || 0,
      choices: kind === "MULTIPLE_CHOICE" ? (question.choices ?? []).map((choice) => ({
        value: String(choice.letter),
        label: `${choice.letter}. ${cleanText(choice.text)}`
      })) : undefined
    });
    if (question.answer) {
      answerKey[questionKey] = {
        kind: "MULTIPLE_CHOICE",
        answer: String(question.answer),
        sourceQuestionNumber: Number(question.number)
      };
    }
  }
  const totalPoints = questions.reduce((total, question) => total + question.points, 0);
  return {
    id,
    versionKey: `legacy:${versionLabel}`,
    examTrack: track,
    versionCode,
    versionLabel,
    title: cleanText(exam.formTitle) || `${versionLabel} Bar Exam`,
    description: cleanText(exam.description),
    totalPoints,
    passingScore: 80,
    timeLimitMinutes: 1440,
    candidatePayload: {
      instructionsMarkdown: cleanText(exam.description),
      questions
    },
    reviewerPayload: {
      importedFrom: LEGACY_SOURCE,
      importedAt: new Date().toISOString(),
      legacyFormTitle: cleanText(exam.formTitle),
      sourceQuestionCount: questions.length,
      answerKeyImported: Object.keys(answerKey).length > 0,
      note: "Reviewer-only metadata imported from private legacy source. Do not expose this payload to candidates."
    },
    answerKey,
    answerKeyEntries: Object.keys(answerKey).length,
    questions
  };
}

function buildSql(versions, shouldActivate) {
  const statements = [];
  if (shouldActivate) {
    statements.push("UPDATE bar_exam_versions SET is_active = 0, status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP;");
  }
  for (const version of versions) {
    statements.push(`INSERT INTO bar_exam_versions (
  id, version_key, exam_track, version_code, version_label, title, description, status, total_points,
  passing_score, time_limit_minutes, is_active, public_instructions_markdown, candidate_payload_json,
  reviewer_payload_json, answer_key_json, created_at, updated_at
) VALUES (
  ${sqlString(version.id)}, ${sqlString(version.versionKey)}, ${sqlString(version.examTrack)}, ${sqlString(version.versionCode)}, ${sqlString(version.versionLabel)},
  ${sqlString(version.title)}, ${sqlString(version.description)}, ${sqlString(shouldActivate ? "ACTIVE" : "INACTIVE")}, ${version.totalPoints},
  ${version.passingScore}, ${version.timeLimitMinutes}, ${shouldActivate ? 1 : 0}, ${sqlString(version.candidatePayload.instructionsMarkdown)},
  ${sqlString(JSON.stringify(version.candidatePayload))}, ${sqlString(JSON.stringify(version.reviewerPayload))}, ${sqlString(JSON.stringify(version.answerKey))},
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO UPDATE SET
  version_key = excluded.version_key,
  exam_track = excluded.exam_track,
  version_code = excluded.version_code,
  version_label = excluded.version_label,
  title = excluded.title,
  description = excluded.description,
  status = excluded.status,
  total_points = excluded.total_points,
  passing_score = excluded.passing_score,
  time_limit_minutes = excluded.time_limit_minutes,
  is_active = excluded.is_active,
  public_instructions_markdown = excluded.public_instructions_markdown,
  candidate_payload_json = excluded.candidate_payload_json,
  reviewer_payload_json = excluded.reviewer_payload_json,
  answer_key_json = excluded.answer_key_json,
  updated_at = CURRENT_TIMESTAMP;`);
  }
  if (shouldActivate) {
    const importedPairs = versions.map((version) => `(${sqlString(version.examTrack)}, ${sqlString(version.versionCode)})`).join(", ");
    statements.push(`UPDATE bar_exam_versions
SET is_active = 0, status = 'INACTIVE', updated_at = CURRENT_TIMESTAMP
WHERE id NOT LIKE 'legacy-%'
  AND version_key NOT LIKE 'legacy:%'
  AND (exam_track, version_code) IN (VALUES ${importedPairs});`);
  }
  return `${statements.join("\n\n")}\n`;
}

function normalizeTrack(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "DEFENSE") return "DEFENSE";
  if (normalized === "DOJ") return "DOJ";
  throw new Error(`Unsupported Bar Exam track: ${value}`);
}

function cleanText(value) {
  return typeof value === "string" ? value.replaceAll(/\r\n/g, "\n").trim() : "";
}

function sqlString(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}
