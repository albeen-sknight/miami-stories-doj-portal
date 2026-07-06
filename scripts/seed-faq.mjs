import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DATABASE_NAME = "miami-stories-doj-db";
const FAQ_SOURCE = "apps/worker/src/seeds/faqSeed.md";

const CATEGORIES = {
  general: "General DOJ Information",
  structure: "DOJ Structure and Leadership",
  attorneys: "Attorneys, Counsel, and Bar Licensing",
  arrests: "Arrests, Pleas, and Criminal Trials",
  civil: "Civil Cases and Protective Orders",
  subpoenas: "Subpoenas",
  warrants: "Warrants",
  evidence: "Evidence, Bodycams, and CCTV",
  services: "Expungements, Marriage, and Other Services",
  accountability: "Judicial Review and Accountability"
};

const LEGACY_FAQ_IDS = [
  "faq-general-roleplay",
  "faq-resources",
  "faq-leadership",
  "faq-bar",
  "faq-lawyer",
  "faq-criminal-trials",
  "faq-civil",
  "faq-subpoena",
  "faq-warrants",
  "faq-evidence",
  "faq-services",
  "faq-accountability"
];

const CHANNEL_REPLACEMENTS = [
  ["resource-compendium", "[/resources](/resources)"],
  ["request-a-lawyer", "[/services/lawyer](/services/lawyer)"],
  ["doj-bar-exam", "[/bar-exam](/bar-exam)"],
  ["request-criminal-trial", "[/services/criminal-trial](/services/criminal-trial)"],
  ["request-civil-case", "[/services/civil-case](/services/civil-case)"],
  ["request-subpoena", "[/services/subpoena](/services/subpoena)"],
  ["request-search-seizure-warrant", "[/services/warrant](/services/warrant)"],
  ["request-search-seizure-warran", "[/services/warrant](/services/warrant)"],
  ["request-warrant", "[/services/warrant](/services/warrant)"],
  ["request-expungment", "[/services/expungement](/services/expungement)"],
  ["request-expungement", "[/services/expungement](/services/expungement)"],
  ["request-marriage-certificate", "[/services/marriage](/services/marriage)"],
  ["request-divorce", "[/services/divorce](/services/divorce)"]
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const args = new Set(process.argv.slice(2));
const useLocal = args.has("--local");
const useRemote = args.has("--remote");
const printSql = args.has("--print-sql");
const dryRun = args.has("--dry-run");

if ((useLocal && useRemote) || (!useLocal && !useRemote && !printSql && !dryRun)) {
  console.error("Usage: pnpm seed:faq -- --local | --remote | --dry-run | --print-sql");
  process.exit(1);
}

const markdown = await readFile(path.join(repoRoot, FAQ_SOURCE), "utf8");
const entries = parseFaqMarkdown(markdown);
const sql = buildSql(entries);

console.log(`Parsed ${entries.length} FAQ entries from ${FAQ_SOURCE}.`);

if (dryRun) {
  for (const entry of entries) {
    console.log(`${entry.sortOrder}. [${entry.category}] ${entry.id} - ${entry.question}`);
  }
  process.exit(0);
}

if (printSql) {
  process.stdout.write(sql);
  process.exit(0);
}

const tempDir = mkdtempSync(path.join(tmpdir(), "miami-stories-doj-faq-"));
const sqlPath = path.join(tempDir, "faq-seed.sql");

try {
  writeFileSync(sqlPath, sql, "utf8");
  const wranglerArgs = [
    "pnpm",
    "exec",
    "wrangler",
    "d1",
    "execute",
    DATABASE_NAME,
    useRemote ? "--remote" : "--local",
    "--file",
    sqlPath
  ];
  const result = spawnSync("corepack", wranglerArgs, {
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

function parseFaqMarkdown(markdownText) {
  const lines = markdownText.split(/\r?\n/).map(cleanLine);
  const startIndex = lines.findIndex((line) => line.includes("Frequently Asked Questions"));
  if (startIndex === -1) {
    throw new Error("Could not find the FAQ content heading in faqSeed.md.");
  }

  const entries = [];
  const seenIds = new Set();
  let currentCategory = CATEGORIES.general;
  let currentQuestion = "";
  let currentAnswer = [];
  let sortOrder = 1;

  const pushEntry = () => {
    const answerMarkdown = compactAnswer(currentAnswer);
    if (!currentQuestion || !answerMarkdown) {
      currentQuestion = "";
      currentAnswer = [];
      return;
    }
    const id = uniqueId(`faq-${slugify(currentCategory)}-${slugify(currentQuestion)}`, seenIds);
    entries.push({
      id,
      category: currentCategory,
      question: currentQuestion,
      answerMarkdown,
      sortOrder
    });
    sortOrder += 1;
    currentQuestion = "";
    currentAnswer = [];
  };

  const introLines = [];
  let index = startIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (categoryForLine(line)) break;
    if (line === "FAQ Categories") break;
    if (!isSkippableLine(line)) introLines.push(line);
    index += 1;
  }

  const intro = compactAnswer(introLines);
  if (intro) {
    const question = "What does the DOJ FAQ cover?";
    entries.push({
      id: uniqueId(`faq-${slugify(CATEGORIES.general)}-${slugify(question)}`, seenIds),
      category: CATEGORIES.general,
      question,
      answerMarkdown: intro,
      sortOrder
    });
    sortOrder += 1;
  }

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    const category = categoryForLine(line);
    if (category) {
      pushEntry();
      currentCategory = category;
      continue;
    }
    if (isSkippableLine(line)) {
      if (line.startsWith("Official DOJ Guidance") || line === "Office of the Chief Justice") {
        pushEntry();
      }
      continue;
    }
    if (isQuestionLine(line)) {
      pushEntry();
      currentQuestion = line;
      currentAnswer = [];
      continue;
    }
    if (currentQuestion) {
      currentAnswer.push(line);
    }
  }
  pushEntry();

  return entries;
}

function buildSql(entries) {
  const ids = entries.map((entry) => sqlString(entry.id)).join(", ");
  const legacyIds = LEGACY_FAQ_IDS.map(sqlString).join(", ");
  const statements = [
    `UPDATE faq_entries SET is_public = 0, updated_at = CURRENT_TIMESTAMP WHERE id IN (${legacyIds}) AND id NOT IN (${ids});`
  ];

  for (const entry of entries) {
    statements.push(`INSERT INTO faq_entries (id, category, question, answer_markdown, sort_order, is_public, created_at, updated_at)
VALUES (${sqlString(entry.id)}, ${sqlString(entry.category)}, ${sqlString(entry.question)}, ${sqlString(entry.answerMarkdown)}, ${entry.sortOrder}, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  category = excluded.category,
  question = excluded.question,
  answer_markdown = excluded.answer_markdown,
  sort_order = excluded.sort_order,
  is_public = 1,
  updated_at = CURRENT_TIMESTAMP;`);
  }

  return `${statements.join("\n\n")}\n`;
}

function cleanLine(line) {
  return line
    .replace(/^\\(#{1,6})/, "$1")
    .replace(/^\\([*_-])/, "$1")
    .replace(/^\\---$/, "---")
    .replace(/\\_/g, "_")
    .trim();
}

function compactAnswer(lines) {
  const output = [];
  let previousBlank = true;
  for (const rawLine of lines.map(rewritePortalReferences)) {
    const line = rawLine.trim();
    if (!line) {
      if (!previousBlank) output.push("");
      previousBlank = true;
      continue;
    }
    output.push(line);
    previousBlank = false;
  }
  while (output.length > 0 && output[output.length - 1] === "") output.pop();
  return output.join("\n");
}

function rewritePortalReferences(line) {
  let rewritten = line;
  for (const [needle, replacement] of CHANNEL_REPLACEMENTS) {
    if (rewritten.includes(needle)) {
      rewritten = replacement;
    }
  }
  return rewritten;
}

function categoryForLine(line) {
  const normalized = normalize(line);
  if (normalized.includes("structure and leadership")) return CATEGORIES.structure;
  if (normalized.includes("lawyers and representation") || normalized.includes("requesting counsel") || normalized.includes("licensing and certification")) {
    return CATEGORIES.attorneys;
  }
  if (normalized.includes("arrests rights and pleas") || normalized.includes("not guilty pleas and criminal trials")) return CATEGORIES.arrests;
  if (normalized.includes("civil cases and protective orders")) return CATEGORIES.civil;
  if (normalized.includes("subpoenas and evidence requests")) return CATEGORIES.subpoenas;
  if (normalized.includes("arrest and search warrants")) return CATEGORIES.warrants;
  if (normalized.includes("evidence bodycams and cctv")) return CATEGORIES.evidence;
  if (normalized.includes("expungements marriage and other services")) return CATEGORIES.services;
  if (normalized.includes("judicial review and accountability")) return CATEGORIES.accountability;
  return null;
}

function isQuestionLine(line) {
  return line.endsWith("?") && line.length <= 140;
}

function isSkippableLine(line) {
  if (!line) return false;
  if (line === "---") return true;
  if (line === "FAQ Categories") return true;
  if (line === "Miami Stories DOJ Bot") return true;
  if (line === "APP") return true;
  if (line === "Office of the Chief Justice") return true;
  if (line.startsWith("Official DOJ Guidance")) return true;
  if (line.startsWith("This is the start of")) return true;
  if (line.includes("â€” 6/18/2026")) return true;
  return Object.values(CATEGORIES).includes(line);
}

function normalize(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueId(base, seenIds) {
  let id = base || "faq-entry";
  let suffix = 2;
  while (seenIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  seenIds.add(id);
  return id;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
