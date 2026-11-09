-- ============================================================================
-- 0019 — Telangana and Andhra Pradesh state government exam tracks
-- ============================================================================
-- Adds four tracks as DATA ONLY (no schema change), in the same shape as the
-- GATE seed in 0009:
--
--   tgpsc-group1   TGPSC Group 1, Mains papers
--   tgpsc-group2   TGPSC Group 2, Papers I to IV
--   tgpsc-group3   TGPSC Group 3, Papers I to III
--   appsc-group2   APPSC Group 2, Screening Test and Mains Papers I and II
--
-- Subject and chapter NAMES only, following the published paper structure.
-- No question content and no copyrighted material.
--
-- SOURCES (paper structure as published by the commissions and summarised by
-- exam-prep sites; re-check against the current official notification before
-- relying on it, because commissions revise patterns between cycles):
--   TGPSC Group 2 / Group 3: General Studies and General Abilities; History,
--     Polity and Society; Economy and Development; Telangana Movement and
--     State Formation (Group 2 only).
--   TGPSC Group 1 Mains: General English (qualifying) plus Papers I to VI.
--     The Group 1 PRELIMS paper is NOT seeded here.
--   APPSC Group 2: Screening Test (five sections) and two Mains papers.
--
-- ONBOARDING: these tracks use the existing GENERAL onboarding flow (see
-- flowTypeForExamTrack), so no new flow type and no CHECK-constraint change is
-- needed. They appear in the onboarding picker automatically because it reads
-- exam_tracks and groups by category.
--
-- NOT APPLIED to production by this commit. Review, then apply with the same
-- process as the other migrations (see MIGRATIONS.md).
--
-- Idempotent on (exam_track_id, code), so re-running updates names in place.
-- ============================================================================

insert into public.exam_tracks (id, name, full_name, description, category, sort_order) values
  ('tgpsc-group1', 'TGPSC Group 1', 'Telangana Public Service Commission, Group 1 Services (Mains)',
   'State civil services Mains: General Essay, History, Society, Economy, Science and the Telangana movement.', 'Government Exams', 10),
  ('tgpsc-group2', 'TGPSC Group 2', 'Telangana Public Service Commission, Group 2 Services',
   'State administrative services written exam in four objective papers.', 'Government Exams', 11),
  ('tgpsc-group3', 'TGPSC Group 3', 'Telangana Public Service Commission, Group 3 Services',
   'State services written exam in three objective papers.', 'Government Exams', 12),
  ('appsc-group2', 'APPSC Group 2', 'Andhra Pradesh Public Service Commission, Group 2 Services',
   'Andhra Pradesh services: a Screening Test followed by two Mains papers.', 'Government Exams', 13)
on conflict (id) do update
  set name = excluded.name, full_name = excluded.full_name,
      description = excluded.description, category = excluded.category,
      sort_order = excluded.sort_order;

-- Subjects (papers, or Screening Test sections).
insert into public.syllabus_nodes (exam_track_id, parent_id, level, name, code, position) values
  -- TGPSC Group 1 Mains
  ('tgpsc-group1', null, 'subject', 'General English (Qualifying)',                    'tg1-english',  1),
  ('tgpsc-group1', null, 'subject', 'Paper I: General Essay',                          'tg1-p1',       2),
  ('tgpsc-group1', null, 'subject', 'Paper II: History, Culture and Geography',        'tg1-p2',       3),
  ('tgpsc-group1', null, 'subject', 'Paper III: Indian Society, Constitution and Governance', 'tg1-p3', 4),
  ('tgpsc-group1', null, 'subject', 'Paper IV: Economy and Development',               'tg1-p4',       5),
  ('tgpsc-group1', null, 'subject', 'Paper V: Science and Technology and Data Interpretation', 'tg1-p5', 6),
  ('tgpsc-group1', null, 'subject', 'Paper VI: Telangana Movement and State Formation','tg1-p6',       7),
  -- TGPSC Group 2
  ('tgpsc-group2', null, 'subject', 'Paper I: General Studies and General Abilities',  'tg2-p1',       1),
  ('tgpsc-group2', null, 'subject', 'Paper II: History, Polity and Society',           'tg2-p2',       2),
  ('tgpsc-group2', null, 'subject', 'Paper III: Economy and Development',              'tg2-p3',       3),
  ('tgpsc-group2', null, 'subject', 'Paper IV: Telangana Movement and State Formation','tg2-p4',       4),
  -- TGPSC Group 3
  ('tgpsc-group3', null, 'subject', 'Paper I: General Studies and General Abilities',  'tg3-p1',       1),
  ('tgpsc-group3', null, 'subject', 'Paper II: History, Polity and Society',           'tg3-p2',       2),
  ('tgpsc-group3', null, 'subject', 'Paper III: Economy and Development',              'tg3-p3',       3),
  -- APPSC Group 2
  ('appsc-group2', null, 'subject', 'Screening Test',                                  'ap2-screen',   1),
  ('appsc-group2', null, 'subject', 'Mains Paper I: Andhra Pradesh History and Indian Constitution', 'ap2-p1', 2),
  ('appsc-group2', null, 'subject', 'Mains Paper II: Economy, Science and Technology', 'ap2-p2',       3)
on conflict (exam_track_id, code) do update
  set name = excluded.name, position = excluded.position;

with chapters(track, parent_code, code, name, position) as (values
  -- ── TGPSC Group 1 Mains ───────────────────────────────────────────────
  ('tgpsc-group1','tg1-english','tg1-eng-grammar','Spelling, Punctuation and Sentence Correction',1),
  ('tgpsc-group1','tg1-english','tg1-eng-comprehension','Comprehension and Precis',2),
  ('tgpsc-group1','tg1-english','tg1-eng-writing','Expansion and Letter Writing',3),
  ('tgpsc-group1','tg1-p1','tg1-p1-social','Contemporary Social Issues, Economic Growth and Justice',1),
  ('tgpsc-group1','tg1-p1','tg1-p1-politics','Indian Politics and Cultural Heritage',2),
  ('tgpsc-group1','tg1-p1','tg1-p1-scitech','Science, Technology, Education and Human Resources',3),
  ('tgpsc-group1','tg1-p2','tg1-p2-india','History and Culture of India (1757 to 1947)',1),
  ('tgpsc-group1','tg1-p2','tg1-p2-telangana','History and Cultural Heritage of Telangana',2),
  ('tgpsc-group1','tg1-p2','tg1-p2-geography','Geography of India and Telangana',3),
  ('tgpsc-group1','tg1-p3','tg1-p3-society','Indian Society: Structure, Issues and Social Movements',1),
  ('tgpsc-group1','tg1-p3','tg1-p3-constitution','Constitution of India',2),
  ('tgpsc-group1','tg1-p3','tg1-p3-governance','Governance',3),
  ('tgpsc-group1','tg1-p4','tg1-p4-india','Indian Economy and Development',1),
  ('tgpsc-group1','tg1-p4','tg1-p4-telangana','Telangana Economy',2),
  ('tgpsc-group1','tg1-p4','tg1-p4-environment','Development and Environmental Problems',3),
  ('tgpsc-group1','tg1-p5','tg1-p5-impact','Role and Impact of Science and Technology',1),
  ('tgpsc-group1','tg1-p5','tg1-p5-trends','Modern Trends in Applying Scientific Knowledge',2),
  ('tgpsc-group1','tg1-p5','tg1-p5-data','Data Interpretation and Problem Solving',3),
  ('tgpsc-group1','tg1-p6','tg1-p6-idea','The Idea of Telangana (1948 to 1970)',1),
  ('tgpsc-group1','tg1-p6','tg1-p6-mobilisation','Mobilisational Phase (1971 to 1990)',2),
  ('tgpsc-group1','tg1-p6','tg1-p6-formation','Towards Formation of Telangana State (1991 to 2014)',3),

  -- ── TGPSC Group 2 ─────────────────────────────────────────────────────
  ('tgpsc-group2','tg2-p1','tg2-p1-current','Current Affairs: Regional, National and International',1),
  ('tgpsc-group2','tg2-p1','tg2-p1-ir','International Relations and Events',2),
  ('tgpsc-group2','tg2-p1','tg2-p1-science','General Science and India''s Achievements in Science and Technology',3),
  ('tgpsc-group2','tg2-p1','tg2-p1-environment','Environmental Issues and Disaster Management',4),
  ('tgpsc-group2','tg2-p1','tg2-p1-geography','World, Indian and Telangana Geography',5),
  ('tgpsc-group2','tg2-p1','tg2-p1-history','History and Cultural Heritage',6),
  ('tgpsc-group2','tg2-p1','tg2-p1-telangana-culture','Society, Culture, Heritage, Arts and Literature of Telangana',7),
  ('tgpsc-group2','tg2-p1','tg2-p1-policies','Policies of Telangana State',8),
  ('tgpsc-group2','tg2-p1','tg2-p1-inclusion','Social Exclusion, Rights Issues and Inclusive Policies',9),
  ('tgpsc-group2','tg2-p1','tg2-p1-reasoning','Logical Reasoning, Analytical Ability and Data Interpretation',10),
  ('tgpsc-group2','tg2-p1','tg2-p1-english','Basic English',11),
  ('tgpsc-group2','tg2-p2','tg2-p2-history','Socio-Cultural History of India and Telangana',1),
  ('tgpsc-group2','tg2-p2','tg2-p2-polity','Overview of the Indian Constitution and Politics',2),
  ('tgpsc-group2','tg2-p2','tg2-p2-society','Social Structure, Issues and Public Policies',3),
  ('tgpsc-group2','tg2-p3','tg2-p3-india','Indian Economy: Issues and Challenges',1),
  ('tgpsc-group2','tg2-p3','tg2-p3-telangana','Economy and Development of Telangana',2),
  ('tgpsc-group2','tg2-p3','tg2-p3-change','Issues of Development and Change',3),
  ('tgpsc-group2','tg2-p4','tg2-p4-idea','The Idea of Telangana (1948 to 1970)',1),
  ('tgpsc-group2','tg2-p4','tg2-p4-mobilisation','Mobilisational Phase (1971 to 1990)',2),
  ('tgpsc-group2','tg2-p4','tg2-p4-formation','Towards Formation of Telangana State (1991 to 2014)',3),

  -- ── TGPSC Group 3 ─────────────────────────────────────────────────────
  ('tgpsc-group3','tg3-p1','tg3-p1-current','Current Affairs: Regional, National and International',1),
  ('tgpsc-group3','tg3-p1','tg3-p1-ir','International Relations and Events',2),
  ('tgpsc-group3','tg3-p1','tg3-p1-science','General Science and India''s Achievements in Science and Technology',3),
  ('tgpsc-group3','tg3-p1','tg3-p1-environment','Environmental Issues and Disaster Management',4),
  ('tgpsc-group3','tg3-p1','tg3-p1-geography','World, Indian and Telangana Geography',5),
  ('tgpsc-group3','tg3-p1','tg3-p1-history','Indian History and Cultural Heritage',6),
  ('tgpsc-group3','tg3-p1','tg3-p1-telangana-culture','Society, Culture, Heritage, Arts and Literature of Telangana',7),
  ('tgpsc-group3','tg3-p1','tg3-p1-policies','Policies of Telangana State',8),
  ('tgpsc-group3','tg3-p1','tg3-p1-inclusion','Social Exclusion, Rights Issues and Inclusive Policies',9),
  ('tgpsc-group3','tg3-p1','tg3-p1-reasoning','Logical Reasoning, Analytical Ability and Data Interpretation',10),
  ('tgpsc-group3','tg3-p1','tg3-p1-english','Basic English',11),
  ('tgpsc-group3','tg3-p2','tg3-p2-history','Socio-Cultural History of Telangana and Formation of the State',1),
  ('tgpsc-group3','tg3-p2','tg3-p2-polity','Overview of the Indian Constitution and Politics',2),
  ('tgpsc-group3','tg3-p2','tg3-p2-society','Social Structure, Issues and Public Policies',3),
  ('tgpsc-group3','tg3-p3','tg3-p3-india','Indian Economy: Issues and Challenges',1),
  ('tgpsc-group3','tg3-p3','tg3-p3-telangana','Economy and Development of Telangana',2),
  ('tgpsc-group3','tg3-p3','tg3-p3-change','Issues of Development and Change',3),

  -- ── APPSC Group 2 ─────────────────────────────────────────────────────
  ('appsc-group2','ap2-screen','ap2-screen-history','Indian History: Ancient, Medieval and Modern',1),
  ('appsc-group2','ap2-screen','ap2-screen-geography','Geography of India and Andhra Pradesh',2),
  ('appsc-group2','ap2-screen','ap2-screen-society','Indian Society: Structure, Issues and Welfare',3),
  ('appsc-group2','ap2-screen','ap2-screen-current','Current Affairs: International, National and Andhra Pradesh',4),
  ('appsc-group2','ap2-screen','ap2-screen-mental','Mental Ability: Reasoning, Numeracy and Data Analysis',5),
  ('appsc-group2','ap2-p1','ap2-p1-history','Social and Cultural History of Andhra Pradesh',1),
  ('appsc-group2','ap2-p1','ap2-p1-constitution','Indian Constitution: Structure, Union-State Relations and Decentralisation',2),
  ('appsc-group2','ap2-p2','ap2-p2-economy','Economy of India and Andhra Pradesh',1),
  ('appsc-group2','ap2-p2','ap2-p2-scitech','Science and Technology, Environment and Health',2)
)
insert into public.syllabus_nodes (exam_track_id, parent_id, level, name, code, position)
select c.track, p.id, 'chapter', c.name, c.code, c.position
from chapters c
join public.syllabus_nodes p
  on p.exam_track_id = c.track and p.code = c.parent_code
on conflict (exam_track_id, code) do update
  set name = excluded.name, position = excluded.position, parent_id = excluded.parent_id;
