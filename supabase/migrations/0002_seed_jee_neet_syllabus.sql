-- ============================================================================
-- 0002 — Seed: JEE Main + NEET syllabus trees   (Phase 1)
-- ============================================================================
-- Subject and chapter NAMES only — the published structure of each exam's
-- syllabus. No question content, no copyrighted material.
--
-- Idempotent: keyed on (exam_track_id, code), so re-running updates names and
-- positions in place instead of duplicating rows. Safe to re-run after edits.
--
-- Topic-level nodes (the third tier) are intentionally NOT seeded. They are
-- where per-question tagging gets precise, and they should come from the same
-- import as your question bank so the two stay consistent. Chapter-level is
-- enough for onboarding, dashboard framing, and prompt grounding today.
-- ============================================================================

insert into public.exam_tracks (id, name, full_name, description, sort_order) values
  ('jee-main', 'JEE Main', 'Joint Entrance Examination (Main)',
   'Engineering entrance exam for NITs, IIITs, CFTIs and the JEE Advanced qualifier.', 1),
  ('neet',     'NEET',     'National Eligibility cum Entrance Test (UG)',
   'Undergraduate medical entrance exam for MBBS, BDS and AYUSH courses in India.', 2)
on conflict (id) do update
  set name        = excluded.name,
      full_name   = excluded.full_name,
      description = excluded.description,
      sort_order  = excluded.sort_order;

-- ── Subjects ───────────────────────────────────────────────────────────────
insert into public.syllabus_nodes (exam_track_id, parent_id, level, name, code, position) values
  ('jee-main', null, 'subject', 'Physics',     'jee-phy',  1),
  ('jee-main', null, 'subject', 'Chemistry',   'jee-chem', 2),
  ('jee-main', null, 'subject', 'Mathematics', 'jee-math', 3),
  ('neet',     null, 'subject', 'Physics',     'neet-phy',  1),
  ('neet',     null, 'subject', 'Chemistry',   'neet-chem', 2),
  ('neet',     null, 'subject', 'Botany',      'neet-bot',  3),
  ('neet',     null, 'subject', 'Zoology',     'neet-zoo',  4)
on conflict (exam_track_id, code) do update
  set name = excluded.name, position = excluded.position;

-- ── Chapters ───────────────────────────────────────────────────────────────
-- Parent resolved by code so this block is order-independent and re-runnable.
with chapters(track, parent_code, code, name, position) as (values
  -- JEE Physics
  ('jee-main','jee-phy','jee-phy-units','Units and Measurements',1),
  ('jee-main','jee-phy','jee-phy-kinematics','Kinematics',2),
  ('jee-main','jee-phy','jee-phy-laws-motion','Laws of Motion',3),
  ('jee-main','jee-phy','jee-phy-work-energy','Work, Energy and Power',4),
  ('jee-main','jee-phy','jee-phy-rotational','Rotational Motion',5),
  ('jee-main','jee-phy','jee-phy-gravitation','Gravitation',6),
  ('jee-main','jee-phy','jee-phy-solids-fluids','Properties of Solids and Liquids',7),
  ('jee-main','jee-phy','jee-phy-thermodynamics','Thermodynamics',8),
  ('jee-main','jee-phy','jee-phy-kinetic-theory','Kinetic Theory of Gases',9),
  ('jee-main','jee-phy','jee-phy-oscillations','Oscillations and Waves',10),
  ('jee-main','jee-phy','jee-phy-electrostatics','Electrostatics',11),
  ('jee-main','jee-phy','jee-phy-current','Current Electricity',12),
  ('jee-main','jee-phy','jee-phy-magnetic','Magnetic Effects of Current and Magnetism',13),
  ('jee-main','jee-phy','jee-phy-emi','Electromagnetic Induction and Alternating Currents',14),
  ('jee-main','jee-phy','jee-phy-em-waves','Electromagnetic Waves',15),
  ('jee-main','jee-phy','jee-phy-optics','Optics',16),
  ('jee-main','jee-phy','jee-phy-dual-nature','Dual Nature of Matter and Radiation',17),
  ('jee-main','jee-phy','jee-phy-atoms-nuclei','Atoms and Nuclei',18),
  ('jee-main','jee-phy','jee-phy-devices','Electronic Devices',19),
  ('jee-main','jee-phy','jee-phy-experimental','Experimental Skills',20),
  -- JEE Chemistry
  ('jee-main','jee-chem','jee-chem-basic','Some Basic Concepts in Chemistry',1),
  ('jee-main','jee-chem','jee-chem-atomic','Atomic Structure',2),
  ('jee-main','jee-chem','jee-chem-bonding','Chemical Bonding and Molecular Structure',3),
  ('jee-main','jee-chem','jee-chem-thermo','Chemical Thermodynamics',4),
  ('jee-main','jee-chem','jee-chem-solutions','Solutions',5),
  ('jee-main','jee-chem','jee-chem-equilibrium','Equilibrium',6),
  ('jee-main','jee-chem','jee-chem-redox','Redox Reactions and Electrochemistry',7),
  ('jee-main','jee-chem','jee-chem-kinetics','Chemical Kinetics',8),
  ('jee-main','jee-chem','jee-chem-periodic','Classification of Elements and Periodicity',9),
  ('jee-main','jee-chem','jee-chem-p-block','p-Block Elements',10),
  ('jee-main','jee-chem','jee-chem-d-f-block','d- and f-Block Elements',11),
  ('jee-main','jee-chem','jee-chem-coordination','Coordination Compounds',12),
  ('jee-main','jee-chem','jee-chem-organic-basics','Basic Principles of Organic Chemistry',13),
  ('jee-main','jee-chem','jee-chem-hydrocarbons','Hydrocarbons',14),
  ('jee-main','jee-chem','jee-chem-halides','Organic Compounds Containing Halogens',15),
  ('jee-main','jee-chem','jee-chem-oxygen','Organic Compounds Containing Oxygen',16),
  ('jee-main','jee-chem','jee-chem-nitrogen','Organic Compounds Containing Nitrogen',17),
  ('jee-main','jee-chem','jee-chem-biomolecules','Biomolecules',18),
  ('jee-main','jee-chem','jee-chem-practical','Principles of Practical Chemistry',19),
  -- JEE Mathematics
  ('jee-main','jee-math','jee-math-sets','Sets, Relations and Functions',1),
  ('jee-main','jee-math','jee-math-complex','Complex Numbers and Quadratic Equations',2),
  ('jee-main','jee-math','jee-math-matrices','Matrices and Determinants',3),
  ('jee-main','jee-math','jee-math-permutations','Permutations and Combinations',4),
  ('jee-main','jee-math','jee-math-binomial','Binomial Theorem',5),
  ('jee-main','jee-math','jee-math-sequences','Sequences and Series',6),
  ('jee-main','jee-math','jee-math-limits','Limits, Continuity and Differentiability',7),
  ('jee-main','jee-math','jee-math-integral','Integral Calculus',8),
  ('jee-main','jee-math','jee-math-differential-eq','Differential Equations',9),
  ('jee-main','jee-math','jee-math-coordinate','Coordinate Geometry',10),
  ('jee-main','jee-math','jee-math-3d','Three Dimensional Geometry',11),
  ('jee-main','jee-math','jee-math-vectors','Vector Algebra',12),
  ('jee-main','jee-math','jee-math-statistics','Statistics and Probability',13),
  ('jee-main','jee-math','jee-math-trigonometry','Trigonometry',14),
  -- NEET Physics
  ('neet','neet-phy','neet-phy-units','Physical World and Measurement',1),
  ('neet','neet-phy','neet-phy-kinematics','Kinematics',2),
  ('neet','neet-phy','neet-phy-laws-motion','Laws of Motion',3),
  ('neet','neet-phy','neet-phy-work-energy','Work, Energy and Power',4),
  ('neet','neet-phy','neet-phy-rotational','Motion of System of Particles and Rigid Body',5),
  ('neet','neet-phy','neet-phy-gravitation','Gravitation',6),
  ('neet','neet-phy','neet-phy-bulk-matter','Properties of Bulk Matter',7),
  ('neet','neet-phy','neet-phy-thermodynamics','Thermodynamics',8),
  ('neet','neet-phy','neet-phy-kinetic-theory','Behaviour of Perfect Gas and Kinetic Theory',9),
  ('neet','neet-phy','neet-phy-oscillations','Oscillations and Waves',10),
  ('neet','neet-phy','neet-phy-electrostatics','Electrostatics',11),
  ('neet','neet-phy','neet-phy-current','Current Electricity',12),
  ('neet','neet-phy','neet-phy-magnetic','Magnetic Effects of Current and Magnetism',13),
  ('neet','neet-phy','neet-phy-emi','Electromagnetic Induction and Alternating Currents',14),
  ('neet','neet-phy','neet-phy-em-waves','Electromagnetic Waves',15),
  ('neet','neet-phy','neet-phy-optics','Optics',16),
  ('neet','neet-phy','neet-phy-dual-nature','Dual Nature of Matter and Radiation',17),
  ('neet','neet-phy','neet-phy-atoms-nuclei','Atoms and Nuclei',18),
  ('neet','neet-phy','neet-phy-devices','Electronic Devices',19),
  -- NEET Chemistry
  ('neet','neet-chem','neet-chem-basic','Some Basic Concepts of Chemistry',1),
  ('neet','neet-chem','neet-chem-atomic','Structure of Atom',2),
  ('neet','neet-chem','neet-chem-periodic','Classification of Elements and Periodicity',3),
  ('neet','neet-chem','neet-chem-bonding','Chemical Bonding and Molecular Structure',4),
  ('neet','neet-chem','neet-chem-thermo','Thermodynamics',5),
  ('neet','neet-chem','neet-chem-equilibrium','Equilibrium',6),
  ('neet','neet-chem','neet-chem-redox','Redox Reactions',7),
  ('neet','neet-chem','neet-chem-solutions','Solutions',8),
  ('neet','neet-chem','neet-chem-electrochemistry','Electrochemistry',9),
  ('neet','neet-chem','neet-chem-kinetics','Chemical Kinetics',10),
  ('neet','neet-chem','neet-chem-p-block','p-Block Elements',11),
  ('neet','neet-chem','neet-chem-d-f-block','d- and f-Block Elements',12),
  ('neet','neet-chem','neet-chem-coordination','Coordination Compounds',13),
  ('neet','neet-chem','neet-chem-organic-basics','Basic Principles of Organic Chemistry',14),
  ('neet','neet-chem','neet-chem-hydrocarbons','Hydrocarbons',15),
  ('neet','neet-chem','neet-chem-halides','Haloalkanes and Haloarenes',16),
  ('neet','neet-chem','neet-chem-alcohols','Alcohols, Phenols and Ethers',17),
  ('neet','neet-chem','neet-chem-aldehydes','Aldehydes, Ketones and Carboxylic Acids',18),
  ('neet','neet-chem','neet-chem-amines','Organic Compounds Containing Nitrogen',19),
  ('neet','neet-chem','neet-chem-biomolecules','Biomolecules',20),
  -- NEET Botany
  ('neet','neet-bot','neet-bot-living-world','The Living World and Diversity',1),
  ('neet','neet-bot','neet-bot-plant-kingdom','Plant Kingdom',2),
  ('neet','neet-bot','neet-bot-morphology','Morphology of Flowering Plants',3),
  ('neet','neet-bot','neet-bot-anatomy','Anatomy of Flowering Plants',4),
  ('neet','neet-bot','neet-bot-cell','Cell: Structure and Function',5),
  ('neet','neet-bot','neet-bot-photosynthesis','Photosynthesis in Higher Plants',6),
  ('neet','neet-bot','neet-bot-respiration','Respiration in Plants',7),
  ('neet','neet-bot','neet-bot-growth','Plant Growth and Development',8),
  ('neet','neet-bot','neet-bot-reproduction','Sexual Reproduction in Flowering Plants',9),
  ('neet','neet-bot','neet-bot-genetics','Principles of Inheritance and Variation',10),
  ('neet','neet-bot','neet-bot-molecular','Molecular Basis of Inheritance',11),
  ('neet','neet-bot','neet-bot-evolution','Evolution',12),
  ('neet','neet-bot','neet-bot-ecology','Ecology and Environment',13),
  ('neet','neet-bot','neet-bot-biotech','Biotechnology and its Applications',14),
  -- NEET Zoology
  ('neet','neet-zoo','neet-zoo-animal-kingdom','Animal Kingdom',1),
  ('neet','neet-zoo','neet-zoo-structural','Structural Organisation in Animals',2),
  ('neet','neet-zoo','neet-zoo-digestion','Digestion and Absorption',3),
  ('neet','neet-zoo','neet-zoo-breathing','Breathing and Exchange of Gases',4),
  ('neet','neet-zoo','neet-zoo-circulation','Body Fluids and Circulation',5),
  ('neet','neet-zoo','neet-zoo-excretion','Excretory Products and their Elimination',6),
  ('neet','neet-zoo','neet-zoo-locomotion','Locomotion and Movement',7),
  ('neet','neet-zoo','neet-zoo-neural','Neural Control and Coordination',8),
  ('neet','neet-zoo','neet-zoo-chemical','Chemical Coordination and Integration',9),
  ('neet','neet-zoo','neet-zoo-human-repro','Human Reproduction',10),
  ('neet','neet-zoo','neet-zoo-repro-health','Reproductive Health',11),
  ('neet','neet-zoo','neet-zoo-health','Human Health and Disease',12),
  ('neet','neet-zoo','neet-zoo-biomolecules','Biomolecules',13),
  ('neet','neet-zoo','neet-zoo-animal-husbandry','Microbes and Human Welfare',14)
)
insert into public.syllabus_nodes (exam_track_id, parent_id, level, name, code, position)
select
  c.track,
  p.id,
  'chapter',
  c.name,
  c.code,
  c.position
from chapters c
join public.syllabus_nodes p
  on p.exam_track_id = c.track and p.code = c.parent_code
on conflict (exam_track_id, code) do update
  set name      = excluded.name,
      position  = excluded.position,
      parent_id = excluded.parent_id;
