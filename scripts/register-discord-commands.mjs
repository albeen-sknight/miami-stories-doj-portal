import { existsSync, readFileSync } from "node:fs";

loadDotDevVars();

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("Missing DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID.");
  process.exit(1);
}

const serviceChoices = [
  ["Criminal Trial", "CRIMINAL_TRIAL"],
  ["Civil Case", "CIVIL_CASE"],
  ["Subpoena", "SUBPOENA"],
  ["Arrest Warrant", "WARRANT"],
  ["Search / Seizure Warrant", "SEARCH_SEIZURE"],
  ["Expungement", "EXPUNGEMENT"],
  ["Marriage", "MARRIAGE"],
  ["Divorce", "DIVORCE"]
].map(([name, value]) => ({ name, value }));

const entityChoices = [
  ["Docket", "docket"],
  ["Request", "request"],
  ["FAQ", "faq"],
  ["Resource", "resource"],
  ["Bar Exam Attempt", "bar_exam_attempt"],
  ["Bar Exam Version", "bar_exam_version"],
  ["Judicial Record", "judicial_record"]
].map(([name, value]) => ({ name, value }));

const commands = [
  { name: "help", description: "Show public DOJ Portal help." },
  { name: "hcommand", description: "Show DOJ staff slash command help." },
  {
    name: "request-lawyer",
    description: "Request a lawyer from Discord.",
    options: [
      stringOption("in_city_name", "Your in-city character name.", true),
      stringOption("phone_or_contact", "Phone or best contact method.", true),
      stringOption("reason", "Why you need a lawyer.", true),
      choiceOption("urgency", "Request urgency.", [["Emergency / currently detained", "Emergency / currently detained"], ["Same day", "Same day"], ["Normal", "Normal"]], true),
      stringOption("notes", "Optional extra notes.", false)
    ]
  },
  {
    name: "request-service",
    description: "Create a DOJ service request from Discord.",
    options: [
      choiceOption("service_type", "Service request type.", serviceChoices.map((choice) => [choice.name, choice.value]), true),
      stringOption("in_city_name", "Primary party or character name.", true),
      stringOption("summary", "Short safe request summary.", true),
      stringOption("document_url", "Google Doc/template URL if required.", false),
      stringOption("contact", "Best contact method.", false),
      choiceOption("urgency", "Request urgency.", [["Emergency / currently detained", "Emergency / currently detained"], ["Same day", "Same day"], ["Normal", "Normal"]], false)
    ]
  },
  {
    name: "create-docket",
    description: "Create a docket entry as authorized judicial staff.",
    options: [
      stringOption("title", "Docket title.", true),
      choiceOption("case_type", "Case type.", ["CRIMINAL", "CIVIL", "ADMINISTRATIVE", "WARRANT", "SUBPOENA", "EXPUNGEMENT", "MARRIAGE", "DIVORCE", "OTHER"].map((value) => [value, value]), true),
      stringOption("summary", "Docket summary.", true),
      stringOption("scheduled_at", "Scheduled ISO/time text.", false),
      choiceOption("status", "Docket status.", ["DRAFT", "SCHEDULED", "PENDING", "IN_REVIEW", "CLOSED"].map((value) => [value, value]), false),
      stringOption("linked_request", "Request number or ID.", false),
      stringOption("location", "Location/public note.", false),
      boolOption("publish", "Publish to public docket immediately.", false)
    ]
  },
  lookupCommand("lookup-request", "Lookup a DOJ service request."),
  lookupCommand("lookup-docket", "Lookup a docket entry."),
  lookupCommand("lookup-bar-attempt", "Lookup a Bar Exam attempt. Reviewer/admin only."),
  ticketCommand("close", "Confirm, transcript, close, and delete a DOJ service request ticket.", false),
  ticketCommand("close-ticket", "Confirm, transcript, close, and delete a DOJ service request ticket.", true),
  ticketCommand("transcript-ticket", "Generate and store a private DOJ ticket transcript.", false),
  ticketCommand("delete-ticket", "Transcript then delete a private DOJ ticket channel.", true),
  recordCommand("delete-record", "Soft-delete a DOJ Portal record."),
  recordCommand("restore-record", "Restore a soft-deleted DOJ Portal record. Justice/Chief only."),
  { name: "post-faq", description: "Post one public FAQ item to the configured FAQ channel.", options: [stringOption("query", "FAQ ID or question search text.", true)] },
  { name: "post-faq-category", description: "Post public FAQ entries from a category.", options: [stringOption("category", "FAQ category.", true)] },
  { name: "post-resources", description: "Post public resources/templates to the configured resource channel.", options: [stringOption("category", "Optional resource category.", false)] },
  { name: "bar-help", description: "Show candidate/reviewer Bar Exam help." }
];

const response = await fetch(`https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`, {
  method: "PUT",
  headers: {
    authorization: `Bot ${token}`,
    "content-type": "application/json"
  },
  body: JSON.stringify(commands)
});

const body = await response.text();
if (!response.ok) {
  console.error(`Discord command registration failed with ${response.status}: ${body}`);
  process.exit(1);
}

const registered = JSON.parse(body);
console.log(`Registered ${registered.length} guild slash commands for guild ${guildId}.`);

function stringOption(name, description, required) {
  return { type: 3, name, description, required };
}

function boolOption(name, description, required) {
  return { type: 5, name, description, required };
}

function choiceOption(name, description, choices, required) {
  return { type: 3, name, description, required, choices: choices.map(([choiceName, value]) => ({ name: choiceName, value })) };
}

function lookupCommand(name, description) {
  return { name, description, options: [stringOption("id_or_number", "Record number or internal ID.", true)] };
}

function ticketCommand(name, description, reasonRequired) {
  const options = reasonRequired
    ? [stringOption("reason", "Required reason.", true), stringOption("id_or_number", "Request number, Bar attempt number, or ID. Omit inside the ticket channel.", false)]
    : [stringOption("id_or_number", "Request number, Bar attempt number, or ID. Omit inside the ticket channel.", false)];
  return {
    name,
    description,
    options
  };
}

function recordCommand(name, description) {
  return {
    name,
    description,
    options: [
      choiceOption("entity_type", "Record type.", entityChoices.map((choice) => [choice.name, choice.value]), true),
      stringOption("id_or_number", "Record number or ID.", true),
      stringOption("reason", "Required audit reason.", true)
    ]
  };
}

function loadDotDevVars() {
  if (!existsSync(".dev.vars")) return;
  const text = readFileSync(".dev.vars", "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^"|"$/g, "");
  }
}
