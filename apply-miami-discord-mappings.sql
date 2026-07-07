INSERT OR REPLACE INTO role_mappings (id, role_name, discord_role_id, permission_key, is_reference_only)
VALUES
('role-doj-portal-admin','DOJ Portal Admin','1523772553456386079','ADMIN',0),
('role-chief-justice','Chief Justice','1457659514474991818','CHIEF_JUSTICE',0),
('role-supreme-court-justice','Supreme Court Justice','1395614223920267285','JUSTICE',0),
('role-judge','Judge','1395614223861678162','JUDGE',0),
('role-attorney-general','Attorney General','1395614223920267286','PROSECUTOR',0),
('role-assistant-attorney-general','Assistant Attorney General','1395614223882780729','PROSECUTOR',0),
('role-district-attorney','District Attorney','1523779187867914453','PROSECUTOR',0),
('role-assistant-district-attorney','Assistant District Attorney','1523779265760333914','PROSECUTOR',0),
('role-bar-association-member','Bar Association Member','1523782462088675398','BAR_ASSOCIATION_MEMBER',0),
('role-bar-licensed','Bar Licensed','1523782508716490854','BAR_ACTIVE',0),
('role-private-practitioner','Private Practitioner','1395614223861678159','BAR_ACTIVE',0),
('role-defense-attorney','Defense Attorney','1523782301702553620','DEFENSE_ATTORNEY',0),
('role-public-defender','Public Defender','1395614223861678160','PUBLIC_DEFENDER_CERTIFIED',0),
('role-chief-public-defender','Chief Public Defender','1457662900192809054','PUBLIC_DEFENDER_CERTIFIED',0),
('role-bar-candidate','Bar Candidate','1523782559966953562','BAR_CANDIDATE',0),
('role-bar-eligible','Bar Eligible','1523782597820551358','BAR_ELIGIBLE',0),
('role-civilian','Miami Citizen','1395614223366754397','CIVILIAN',0);

UPDATE discord_channel_mappings SET discord_channel_id='1523805114630930724', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='BAR_EXAM_SUBMISSIONS';
UPDATE discord_channel_mappings SET discord_channel_id='1523805013749666019', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='BAR_EXAM_FOLLOWUP_CATEGORY';
UPDATE discord_channel_mappings SET discord_channel_id='1505603404125307062', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='GENERAL_CHAT';
UPDATE discord_channel_mappings SET discord_channel_id='1523789891601960980', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='DOJ_DOCKET';
UPDATE discord_channel_mappings SET discord_channel_id='1523789863382679592', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='JUDICIAL_RECORDS';
UPDATE discord_channel_mappings SET discord_channel_id='1523800735928811661', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='REQUEST_LAWYER';
UPDATE discord_channel_mappings SET discord_channel_id='1523800758154297586', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='REQUEST_CRIMINAL_TRIAL';
UPDATE discord_channel_mappings SET discord_channel_id='1523800778182234152', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='REQUEST_CIVIL_CASE';
UPDATE discord_channel_mappings SET discord_channel_id='1523800804291645656', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='REQUEST_SUBPOENA';
UPDATE discord_channel_mappings SET discord_channel_id='1523800818711531580', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='REQUEST_WARRANT';
UPDATE discord_channel_mappings SET discord_channel_id='1523800836755558410', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='REQUEST_SEARCH_SEIZURE';
UPDATE discord_channel_mappings SET discord_channel_id='1523800942733033552', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='REQUEST_EXPUNGEMENT';
UPDATE discord_channel_mappings SET discord_channel_id='1523800960663818362', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='REQUEST_MARRIAGE';
UPDATE discord_channel_mappings SET discord_channel_id='1523800978384752742', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='REQUEST_DIVORCE';
UPDATE discord_channel_mappings SET discord_channel_id='1523813307058880533', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='ADMIN_LOG';

UPDATE discord_channel_mappings SET discord_channel_id='1523803878171344957', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='CRIMINAL_TRIALS_CATEGORY';
UPDATE discord_channel_mappings SET discord_channel_id='1504220541102330059', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='CIVIL_CASES_CATEGORY';
UPDATE discord_channel_mappings SET discord_channel_id='1523804034056716460', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='SUBPOENAS_CATEGORY';
UPDATE discord_channel_mappings SET discord_channel_id='1523804674896036023', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='WARRANTS_CATEGORY';
UPDATE discord_channel_mappings SET discord_channel_id='1523804820996231260', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='EXPUNGEMENTS_CATEGORY';
UPDATE discord_channel_mappings SET discord_channel_id='1523804898628731124', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='MARRIAGE_DIVORCE_CATEGORY';

UPDATE discord_channel_mappings SET discord_channel_id='1523812752877945015', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='criminal-trials-transcripts';
UPDATE discord_channel_mappings SET discord_channel_id='1523812773023449098', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='civil-cases-transcripts';
UPDATE discord_channel_mappings SET discord_channel_id='1523812793688789144', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='subpoena-transcripts';
UPDATE discord_channel_mappings SET discord_channel_id='1523812813133578310', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='warrants-executed-transcripts';
UPDATE discord_channel_mappings SET discord_channel_id='1523812832406143076', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='expungement-records';
UPDATE discord_channel_mappings SET discord_channel_id='1523812853948350587', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='certificates-issued-transcripts';
UPDATE discord_channel_mappings SET discord_channel_id='1523812874169090078', updated_at=CURRENT_TIMESTAMP WHERE mapping_key='bar-exam-transcripts';
