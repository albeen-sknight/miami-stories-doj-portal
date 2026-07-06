-- Seed the full public FAQ set from apps/worker/src/seeds/publicSeeds.ts.
-- This is forward-only because earlier migrations may already be applied to remote D1.

INSERT INTO faq_entries (id, category, question, answer_markdown, sort_order, is_public, created_at, updated_at) VALUES
('faq-general-roleplay', 'General DOJ Information', 'What is the Miami Stories Department of Justice?', 'The Miami Stories DOJ is a fictional roleplay legal institution that supports courts, attorneys, public legal resources, and documented justice workflows inside the server.

It is not a real government body, legal service, court system, or source of real-world legal advice.', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('faq-resources', 'General DOJ Information', 'Where can I find official DOJ resources?', 'Published legal resources, templates, and guidance are available in the portal at [/resources](/resources).

Use those materials for roleplay procedure only.', 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('faq-leadership', 'DOJ Structure and Leadership', 'Who oversees the DOJ?', 'The DOJ structure includes judicial leadership, prosecutors, public defense, licensed private practitioners, and Bar Association functions. Stage 2 will connect Discord roles to portal permissions.', 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('faq-bar', 'Attorneys, Counsel, and Bar Licensing', 'How do I become licensed to practice law?', '- Review official resources.
- Take the written Bar Examination.
- Receive Bar Eligible status.
- Complete any competency check.
- Receive Bar Active status.

The native Bar Exam flow arrives in a later stage.', 4, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('faq-lawyer', 'Attorneys, Counsel, and Bar Licensing', 'How do I request a lawyer?', 'Use the lawyer service route at [/services/lawyer](/services/lawyer). Include your character name, Citizen ID, custody status, charges or reason for detention, urgency, and contact details.', 5, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('faq-criminal-trials', 'Arrests, Pleas, and Criminal Trials', 'How are criminal trial requests started?', 'Criminal trial requests should include the defendant, Citizen ID, arrest report number, alleged charges, arresting agency or officer, discovery notes, and scheduling notes.', 6, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('faq-civil', 'Civil Cases and Protective Orders', 'What should a civil case request include?', 'Civil requests should identify the plaintiff, defendant, claim type, facts, date of harm, legal claims, requested relief, and available witnesses or exhibits.', 7, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('faq-subpoena', 'Subpoenas', 'What information is needed for a subpoena?', 'A subpoena request should explain the person, entity, records, testimony, or items requested, along with relevance, necessity, legal basis, and supporting facts.', 8, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('faq-warrants', 'Warrants', 'Who reviews warrant requests?', 'Warrant review is a judicial/prosecutorial workflow prepared for later RBAC. Stage 1 collects the structure and placeholders without implementing authorization.', 9, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('faq-evidence', 'Evidence, Bodycams, and CCTV', 'Should private evidence be posted publicly?', 'No. Do not include confidential case information, private evidence, attorney-client communications, or active investigative details in public portal fields.', 10, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('faq-services', 'Expungements, Marriage, and Other Services', 'What public services are available?', 'Stage 1 includes request forms for lawyers, criminal trials, civil cases, subpoenas, warrants, expungements, marriage certificates, divorce requests, and Bar Exam intake preparation.', 11, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('faq-accountability', 'Judicial Review and Accountability', 'How does the portal support accountability?', 'The portal foundation includes public resources, a docket placeholder, audit log schema, and future dashboard routes so later stages can publish actions with better traceability.', 12, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET
  category = excluded.category,
  question = excluded.question,
  answer_markdown = excluded.answer_markdown,
  sort_order = excluded.sort_order,
  is_public = excluded.is_public,
  updated_at = CURRENT_TIMESTAMP;
