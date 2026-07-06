ALTER TABLE attorney_profiles ADD COLUMN profile_slug TEXT;
ALTER TABLE attorney_profiles ADD COLUMN title TEXT;
ALTER TABLE attorney_profiles ADD COLUMN short_title TEXT;
ALTER TABLE attorney_profiles ADD COLUMN office TEXT;
ALTER TABLE attorney_profiles ADD COLUMN division TEXT;
ALTER TABLE attorney_profiles ADD COLUMN profile_kind TEXT NOT NULL DEFAULT 'ATTORNEY';
ALTER TABLE attorney_profiles ADD COLUMN biography_markdown TEXT NOT NULL DEFAULT '';
ALTER TABLE attorney_profiles ADD COLUMN motto TEXT;
ALTER TABLE attorney_profiles ADD COLUMN quote TEXT;
ALTER TABLE attorney_profiles ADD COLUMN responsibilities_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE attorney_profiles ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 100;
ALTER TABLE attorney_profiles ADD COLUMN deleted_at TEXT;
ALTER TABLE attorney_profiles ADD COLUMN deleted_by_user_id TEXT;
ALTER TABLE attorney_profiles ADD COLUMN deleted_by_display_name TEXT;
ALTER TABLE attorney_profiles ADD COLUMN delete_reason TEXT;
ALTER TABLE attorney_profiles ADD COLUMN deleted_metadata_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_attorney_profiles_slug ON attorney_profiles(profile_slug);
CREATE INDEX IF NOT EXISTS idx_attorney_profiles_public ON attorney_profiles(is_public, deleted_at, sort_order);

DELETE FROM attorney_profiles WHERE id = 'registry-placeholder-1';

INSERT OR REPLACE INTO attorney_profiles (
  id,
  display_name,
  profile_slug,
  title,
  short_title,
  office,
  division,
  profile_kind,
  bar_number,
  practice_areas_json,
  status,
  contact,
  biography_markdown,
  motto,
  quote,
  responsibilities_json,
  sort_order,
  is_public,
  updated_at
) VALUES (
  'profile-alvaro-serrano-castro',
  'Alvaro Serrano Castro',
  'alvaro-serrano-castro',
  'Chief Justice',
  'Chief Justice',
  'Office of the Chief Justice',
  'Judicial Division',
  'JUDICIAL_OFFICER',
  NULL,
  '[]',
  'active',
  '',
  'Alvaro Serrano Castro is a legal officer committed to constitutional rights, fair procedure, and disciplined judicial administration. He currently serves as Chief Justice of the Miami Stories Department of Justice, where his work focuses on building a legal system that is functional, accountable, and sustainable beyond any single officeholder.

His background includes prior historical RP service as Chief Justice in Aspen City, Circuit Court Judge in Chicago / Section 8, Assistant Attorney General, defense counsel in Power, and approximately four years in law enforcement. That experience gives him a practical understanding of courtroom procedure, police operations, evidence review, prosecution standards, defense advocacy, and departmental decision-making.

His legal philosophy is based on due process, checks and balances, proportionality, and the separation of judicial, prosecutorial, defense, and regulatory functions. He believes law enforcement must have the authority needed to protect the public, but that authority must remain subject to constitutional safeguards, judicial review, reliable evidence, and professional accountability.',
  'Rights Before Assumptions.
Evidence Before Conviction.
Justice Without Compromise.',
  'The burden belongs to the state. Your rights belong to you.',
  '[{"title":"Judicial Administration","description":"Court coordination, judicial standards, docket oversight, and continuity of court operations."},{"title":"Due Process and Rights Protection","description":"Protection of constitutional rights, fair procedure, impartial hearings, and lawful review of government action."},{"title":"Warrant and Subpoena Review","description":"Judicial review of warrants, subpoenas, detention issues, probable cause, necessity, specificity, and proportionality."},{"title":"Bar Association Oversight","description":"Oversight of attorney licensing, Bar governance, professional standards, competency checks, and legal training."},{"title":"Evidence and Procedure","description":"Review of evidentiary reliability, procedural compliance, suppression issues, dismissal standards, and reasoned rulings."},{"title":"DOJ Continuity and Governance","description":"Development of a sustainable DOJ structure that separates judicial, prosecutorial, defense, and regulatory functions."}]',
  1,
  1,
  CURRENT_TIMESTAMP
);
