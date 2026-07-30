import { existsSync, readFileSync } from "node:fs";

loadDotDevVars();
loadWranglerVars();

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

const missingEnv = [
  ["DISCORD_BOT_TOKEN", token],
  ["DISCORD_CLIENT_ID", clientId],
  ["DISCORD_GUILD_ID", guildId]
].filter(([, value]) => !value).map(([key]) => key);

if (missingEnv.length) {
  console.error(`Missing required Discord env value(s): ${missingEnv.join(", ")}.`);
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

const categoryVisibilityChoices = [
  ["Public", "public"],
  ["Staff only", "staff_only"],
  ["Private roles", "private_roles"],
  ["Private users and roles", "private_users_and_roles"]
];

const mentionChoices = [
  ["None", "none"],
  ["Everyone", "everyone"],
  ["Here", "here"],
  ["Role", "role"]
];

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
  {
    name: "create-channel",
    description: "Create a DOJ Discord text channel.",
    options: [
      stringOption("name", "Channel name.", true),
      channelOption("category", "Optional parent category.", false, [4]),
      stringOption("topic", "Optional channel topic.", false),
      stringOption("reason", "Optional audit reason.", false),
      stringOption("allowed_roles", "Comma-separated role IDs or mentions to allow.", false),
      stringOption("denied_roles", "Comma-separated role IDs or mentions to deny.", false),
      boolOption("staff_only", "Deny everyone and allow configured staff roles.", false)
    ]
  },
  {
    name: "create-private-channel",
    description: "Create a private DOJ Discord text channel.",
    options: [
      stringOption("name", "Channel name.", true),
      channelOption("category", "Optional parent category.", false, [4]),
      stringOption("users", "Comma-separated user IDs or mentions to allow.", false),
      stringOption("roles", "Comma-separated role IDs or mentions to allow.", false),
      stringOption("topic", "Optional channel topic.", false),
      stringOption("reason", "Optional audit reason.", false)
    ]
  },
  {
    name: "create-category",
    description: "Create a DOJ Discord category.",
    options: [
      stringOption("name", "Category name.", true),
      choiceOption("visibility", "Default category visibility.", categoryVisibilityChoices, true),
      stringOption("roles", "Comma-separated role IDs or mentions to allow.", false),
      stringOption("users", "Comma-separated user IDs or mentions to allow.", false),
      stringOption("purpose", "Optional category purpose for audit logs.", false),
      stringOption("reason", "Optional audit reason.", false)
    ]
  },
  {
    name: "create-category-layout",
    description: "Create a category and several text channels.",
    options: [
      stringOption("category_name", "Category name.", true),
      choiceOption("visibility", "Default category visibility.", categoryVisibilityChoices, true),
      stringOption("channels", "Channel names separated by lines, commas, or numbers.", true),
      stringOption("purpose", "Purpose posted in each created channel.", true),
      stringOption("roles", "Comma-separated role IDs or mentions to allow.", false),
      stringOption("users", "Comma-separated user IDs or mentions to allow.", false),
      stringOption("reason", "Optional audit reason.", false)
    ]
  },
  {
    name: "delete-category-layout",
    description: "Delete a category and optionally its child channels.",
    options: [
      channelOption("category", "Category to delete.", true, [4]),
      boolOption("delete_channels", "Delete child channels before deleting category.", true),
      stringOption("confirm", "DELETE CATEGORY or DELETE CATEGORY AND CHANNELS.", true),
      stringOption("reason", "Optional audit reason.", false)
    ]
  },
  {
    name: "bulk-delete-channels",
    description: "Delete up to 20 text channels by ID or mention.",
    options: [
      stringOption("channels", "Comma-separated channel IDs or mentions.", true),
      stringOption("confirm", "Must equal DELETE CHANNELS.", true),
      stringOption("reason", "Optional audit reason.", false)
    ]
  },
  {
    name: "kick",
    description: "Kick a Discord member as authorized staff.",
    options: [
      userOption("user", "Member to kick.", true),
      stringOption("reason", "Required moderation reason.", true)
    ]
  },
  {
    name: "ban",
    description: "Ban a Discord user as authorized staff.",
    options: [
      userOption("user", "User to ban.", true),
      stringOption("reason", "Required moderation reason.", true),
      integerOption("delete_message_days", "Prior message days to delete, 0 through 7.", false, 0, 7)
    ]
  },
  {
    name: "unban",
    description: "Unban a Discord user by ID.",
    options: [
      stringOption("user_id", "Discord user ID to unban.", true),
      stringOption("reason", "Required moderation reason.", true)
    ]
  },
  {
    name: "timeout",
    description: "Apply a Discord timeout to a member.",
    options: [
      userOption("user", "Member to time out.", true),
      stringOption("duration", "Duration like 10m, 1h, 24h, 3d, or 7d.", true),
      stringOption("reason", "Required moderation reason.", true)
    ]
  },
  {
    name: "untimeout",
    description: "Remove a Discord timeout from a member.",
    options: [
      userOption("user", "Member to remove timeout from.", true),
      stringOption("reason", "Required moderation reason.", true)
    ]
  },
  {
    name: "mute",
    description: "Mute a member using the mute role or Discord timeout.",
    options: [
      userOption("user", "Member to mute.", true),
      stringOption("reason", "Required moderation reason.", true),
      stringOption("duration", "Optional duration like 10m, 1h, 24h, 3d, or 7d.", false)
    ]
  },
  {
    name: "unmute",
    description: "Remove the mute role or timeout from a member.",
    options: [
      userOption("user", "Member to unmute.", true),
      stringOption("reason", "Required moderation reason.", true)
    ]
  },
  {
    name: "warn",
    description: "Record and DM a moderation warning.",
    options: [
      userOption("user", "User to warn.", true),
      stringOption("reason", "Required warning reason.", true),
      boolOption("public", "Also post a brief staff-safe notice here.", false)
    ]
  },
  {
    name: "mod-note",
    description: "Record an internal moderation note.",
    options: [
      userOption("user", "User the note concerns.", true),
      stringOption("note", "Internal moderation note.", true)
    ]
  },
  {
    name: "announce",
    description: "Post a controlled announcement to a channel.",
    options: [
      channelOption("channel", "Text or announcement channel to post in.", true, [0, 5]),
      stringOption("message", "Announcement message.", true),
      stringOption("title", "Optional embed title.", false),
      choiceOption("mention", "Optional controlled mention.", mentionChoices, false),
      roleOption("role", "Role to mention when mention is role.", false),
      boolOption("pin", "Pin the announcement after posting.", false),
      stringOption("reason", "Optional audit reason.", false)
    ]
  },
  lookupCommand("lookup-request", "Lookup a DOJ service request."),
  lookupCommand("lookup-docket", "Lookup a docket entry."),
  lookupCommand("lookup-bar-attempt", "Lookup a Bar Exam attempt. Reviewer/admin only."),
  ticketCommand("close", "Confirm, transcript, close, and delete a DOJ service request ticket.", false),
  ticketCommand("close-ticket", "Confirm, transcript, close, and delete a DOJ service request ticket.", true),
  ticketCommand("transcript-ticket", "Generate and store a private DOJ ticket transcript.", false),
  ticketCommand("delete-ticket", "Transcript then delete a private DOJ ticket channel.", true),
  {
    name: "add-user",
    description: "Add a Discord user to the current ticket or attorney response space.",
    options: [
      userOption("user", "User to add to this ticket or attorney response space.", true),
      stringOption("reason", "Optional reason for the ticket event log.", false)
    ]
  },
  {
    name: "add-role",
    description: "Add a Discord role to the current private ticket or response channel.",
    options: [
      roleOption("role", "Role to add to this private ticket or response channel.", true),
      stringOption("reason", "Optional reason for the ticket event log.", false)
    ]
  },
  {
    name: "rename-ticket",
    description: "Rename the current private DOJ service ticket channel.",
    options: [
      stringOption("name", "New ticket channel name.", true),
      stringOption("reason", "Optional reason for the ticket event log.", false)
    ]
  },
  {
    name: "claim-ticket",
    description: "Claim the current private DOJ service ticket.",
    options: [stringOption("note", "Optional claim note.", false)]
  },
  {
    name: "unclaim-ticket",
    description: "Clear the current private DOJ service ticket claim.",
    options: [stringOption("note", "Optional unclaim note.", false)]
  },
  {
    name: "claim-lawyer-request",
    description: "Claim/respond to a public lawyer request and open the private response space.",
    options: [stringOption("request_number", "LAW request number or internal request ID.", true)]
  },
  {
    name: "lawyer-thread",
    description: "Create or reopen a private attorney response space for a lawyer request.",
    options: [
      stringOption("request_number", "LAW request number or internal request ID.", true),
      userOption("attorney", "Primary attorney to add to the response space.", true),
      userOption("secondary_counsel", "Optional secondary counsel to add.", false),
      userOption("judge", "Optional judge or court oversight user to add.", false),
      userOption("add_user", "Optional additional authorized participant to add.", false),
      stringOption("participant_purpose", "Purpose for the optional additional participant.", false),
      stringOption("reason", "Optional reason for the request event log.", false)
    ]
  },
  recordCommand("delete-record", "Soft-delete a DOJ Portal record."),
  recordCommand("restore-record", "Restore a soft-deleted DOJ Portal record. Justice/Chief only."),
  { name: "post-faq", description: "Post one public FAQ item to the configured FAQ channel.", options: [stringOption("query", "FAQ ID or question search text.", true)] },
  { name: "post-faq-category", description: "Post public FAQ entries from a category.", options: [stringOption("category", "FAQ category.", true)] },
  { name: "post-resources", description: "Post public resources/templates to the configured resource channel.", options: [stringOption("category", "Optional resource category.", false)] },
  { name: "post-lawyer-sticky", description: "Repost the lawyer request portal instruction in request-a-lawyer." },
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

function userOption(name, description, required) {
  return { type: 6, name, description, required };
}

function roleOption(name, description, required) {
  return { type: 8, name, description, required };
}

function channelOption(name, description, required, channelTypes) {
  return { type: 7, name, description, required, channel_types: channelTypes };
}

function integerOption(name, description, required, minValue, maxValue) {
  return {
    type: 4,
    name,
    description,
    required,
    ...(Number.isInteger(minValue) ? { min_value: minValue } : {}),
    ...(Number.isInteger(maxValue) ? { max_value: maxValue } : {})
  };
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
    process.env[key] = stripQuotes(rawValue);
  }
}

function loadWranglerVars() {
  if (!existsSync("wrangler.toml")) return;
  const text = readFileSync("wrangler.toml", "utf8");
  let inVars = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (/^\[/.test(trimmed)) {
      inVars = trimmed === "[vars]";
      continue;
    }
    if (!inVars) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = stripQuotes(rawValue);
  }
}

function stripQuotes(value) {
  return value.trim().replace(/^"|"$/g, "");
}
