-- ============================================================================
-- 40 NEET sample questions (10 Physics + 10 Chemistry + 10 Botany + 10 Zoology)
-- ============================================================================
-- NEET was the one track shipping with ZERO questions. A student who picked it
-- signed up, finished onboarding, and found an empty diagnostic and an empty
-- practice list — worse than not offering the track, because they had already
-- invested the signup.
--
-- ORIGINAL questions authored for this repo at NCERT level, in NEET style on
-- standard syllabus topics. NOT past papers: is_pyq=false with no year or
-- session, so nothing here can be mistaken for licensed NTA content.
--
-- The 10/10/10/10 split mirrors the real paper's weighting — NEET is 25%
-- Physics, 25% Chemistry, 50% Biology, and Biology is split across the Botany
-- and Zoology subject nodes. Each question sits on a different chapter, so the
-- diagnostic samples across 40 distinct chapters rather than drilling a few.
--
-- Difficulty is easy/medium only. A 40-question bank is a floor, not a finished
-- product: DIAGNOSTIC_LENGTH is 20, so a student doing two diagnostics has seen
-- the whole bank. Treat this as unblocking the track, not completing it.
--
-- Idempotent: the batch is deleted and reinserted, scoped by import_batch so
-- the JEE 'sample-v1' and GATE 'gate-sample-v1' batches are untouched.
--
-- NOTE ON RE-RUNNING: reinsertion generates new question ids, which would
-- orphan any question_responses rows pointing at the old ones. That is safe
-- while no one has attempted these; check before re-running later.
-- ============================================================================

delete from public.question_answers
 where question_id in (select id from public.questions where import_batch = 'neet-sample-v1');
delete from public.questions where import_batch = 'neet-sample-v1';

with payload(track, chapter_code, qtext, opts, ans, diff, expl) as (values

-- ── PHYSICS ────────────────────────────────────────────────────────────────
('neet','neet-phy-laws-motion',
 'A constant force of 10 N acts on a 2 kg body for 3 s. The impulse imparted to the body is:',
 '[{"id":"a","text":"15 N s"},{"id":"b","text":"30 N s"},{"id":"c","text":"60 N s"},{"id":"d","text":"5 N s"}]','b','easy',
 'Impulse = F x t = 10 x 3 = 30 N s. The mass is not needed; it only matters if you are asked for the resulting change in velocity.'),

('neet','neet-phy-work-energy',
 'If the momentum of a body is doubled while its mass stays the same, its kinetic energy becomes:',
 '[{"id":"a","text":"half"},{"id":"b","text":"double"},{"id":"c","text":"four times"},{"id":"d","text":"unchanged"}]','c','medium',
 'KE = p^2 / 2m. Kinetic energy goes as the square of momentum, so doubling p multiplies KE by 4.'),

('neet','neet-phy-gravitation',
 'The escape velocity from the surface of the Earth is approximately:',
 '[{"id":"a","text":"7.9 km/s"},{"id":"b","text":"11.2 km/s"},{"id":"c","text":"2.4 km/s"},{"id":"d","text":"16.5 km/s"}]','b','easy',
 'Escape velocity = sqrt(2GM/R) = 11.2 km/s. 7.9 km/s is the orbital speed for a low Earth orbit, and 2.4 km/s is escape velocity from the Moon.'),

('neet','neet-phy-electrostatics',
 'Under electrostatic equilibrium, the electric field at any point inside the material of a charged conductor is:',
 '[{"id":"a","text":"zero"},{"id":"b","text":"uniform and non-zero"},{"id":"c","text":"maximum at the centre"},{"id":"d","text":"proportional to the charge on the conductor"}]','a','medium',
 'If the field inside were non-zero, free electrons would keep moving and it would not be equilibrium. Charge resides entirely on the outer surface.'),

('neet','neet-phy-current',
 'Two resistors of 3 ohm and 6 ohm are connected in parallel. The equivalent resistance is:',
 '[{"id":"a","text":"9 ohm"},{"id":"b","text":"2 ohm"},{"id":"c","text":"4.5 ohm"},{"id":"d","text":"18 ohm"}]','b','easy',
 'For parallel resistors R = (R1 x R2)/(R1 + R2) = (3 x 6)/9 = 2 ohm. Note the result is always smaller than the smallest individual resistance.'),

('neet','neet-phy-optics',
 'The power of a converging lens of focal length 25 cm is:',
 '[{"id":"a","text":"+4 D"},{"id":"b","text":"+0.25 D"},{"id":"c","text":"+25 D"},{"id":"d","text":"+2.5 D"}]','a','easy',
 'Power P = 1/f with f in metres. f = 0.25 m, so P = 1/0.25 = +4 dioptre. Converting cm to m is the step most often missed.'),

('neet','neet-phy-oscillations',
 'The time period of a simple pendulum of length L is proportional to:',
 '[{"id":"a","text":"L"},{"id":"b","text":"square root of L"},{"id":"c","text":"1/L"},{"id":"d","text":"L squared"}]','b','easy',
 'T = 2 pi sqrt(L/g), so T varies as the square root of the length. Quadrupling the length only doubles the period.'),

('neet','neet-phy-dual-nature',
 'In the photoelectric effect, the maximum kinetic energy of the emitted electrons depends on:',
 '[{"id":"a","text":"the intensity of the incident light"},{"id":"b","text":"the frequency of the incident light"},{"id":"c","text":"the angle of incidence"},{"id":"d","text":"the surface area of the metal"}]','b','medium',
 'Einstein photoelectric equation: KEmax = h x nu - work function. Intensity changes how many electrons are emitted, not how energetic each one is.'),

('neet','neet-phy-atoms-nuclei',
 'After three half-lives, the fraction of a radioactive sample that remains undecayed is:',
 '[{"id":"a","text":"1/3"},{"id":"b","text":"1/6"},{"id":"c","text":"1/8"},{"id":"d","text":"1/9"}]','c','easy',
 'Each half-life halves the remaining amount, so after n half-lives the fraction left is (1/2)^n = (1/2)^3 = 1/8.'),

('neet','neet-phy-thermodynamics',
 'For an isothermal process involving an ideal gas, the change in internal energy is:',
 '[{"id":"a","text":"positive"},{"id":"b","text":"negative"},{"id":"c","text":"zero"},{"id":"d","text":"equal to the heat supplied"}]','c','medium',
 'Internal energy of an ideal gas depends only on temperature. Isothermal means constant temperature, so delta U = 0 and all heat supplied is converted to work.'),

-- ── CHEMISTRY ──────────────────────────────────────────────────────────────
('neet','neet-chem-basic',
 'The number of particles present in one mole of any substance is:',
 '[{"id":"a","text":"6.022 x 10^22"},{"id":"b","text":"6.022 x 10^23"},{"id":"c","text":"3.011 x 10^23"},{"id":"d","text":"1.602 x 10^19"}]','b','easy',
 'This is the Avogadro constant, 6.022 x 10^23 per mole. Option d is the elementary charge in coulombs, a common distractor.'),

('neet','neet-chem-atomic',
 'The maximum number of electrons that can be accommodated in the M shell (n = 3) is:',
 '[{"id":"a","text":"8"},{"id":"b","text":"18"},{"id":"c","text":"32"},{"id":"d","text":"2"}]','b','easy',
 'Capacity of a shell is 2n^2. For n = 3 this gives 2 x 9 = 18. The answer 8 is the octet limit for the outermost shell, which is a different rule.'),

('neet','neet-chem-bonding',
 'The hybridisation of the carbon atom in methane (CH4) is:',
 '[{"id":"a","text":"sp"},{"id":"b","text":"sp2"},{"id":"c","text":"sp3"},{"id":"d","text":"sp3d"}]','c','easy',
 'Four sigma bonds and no lone pairs give four electron domains, so sp3 hybridisation and a tetrahedral shape with bond angles of 109.5 degrees.'),

('neet','neet-chem-periodic',
 'On moving from left to right across a period, the atomic radius generally:',
 '[{"id":"a","text":"increases"},{"id":"b","text":"decreases"},{"id":"c","text":"remains constant"},{"id":"d","text":"first increases then decreases"}]','b','easy',
 'Nuclear charge rises while electrons enter the same shell, so the increased effective nuclear charge pulls the electron cloud inward and the radius shrinks.'),

('neet','neet-chem-equilibrium',
 'For the exothermic reaction N2 + 3H2 in equilibrium with 2NH3, raising the temperature will:',
 '[{"id":"a","text":"shift the equilibrium to the right"},{"id":"b","text":"shift the equilibrium to the left"},{"id":"c","text":"have no effect on the equilibrium"},{"id":"d","text":"stop the reaction entirely"}]','b','medium',
 'By Le Chatelier principle the system opposes the added heat by favouring the endothermic direction, which for an exothermic forward reaction is the reverse direction.'),

('neet','neet-chem-redox',
 'The oxidation number of sulfur in H2SO4 is:',
 '[{"id":"a","text":"+2"},{"id":"b","text":"+4"},{"id":"c","text":"+6"},{"id":"d","text":"-2"}]','c','medium',
 'Taking H as +1 and O as -2: 2(+1) + S + 4(-2) = 0, so S = +6. Sulfur is in its highest oxidation state here.'),

('neet','neet-chem-thermo',
 'At constant temperature and pressure, a process is spontaneous when:',
 '[{"id":"a","text":"delta G is greater than zero"},{"id":"b","text":"delta G equals zero"},{"id":"c","text":"delta G is less than zero"},{"id":"d","text":"delta H is less than zero in every case"}]','c','medium',
 'Spontaneity is governed by the Gibbs free energy, delta G = delta H - T delta S. A negative delta G means spontaneous; delta G = 0 means equilibrium.'),

('neet','neet-chem-hydrocarbons',
 'The general molecular formula of an alkyne is:',
 '[{"id":"a","text":"CnH2n+2"},{"id":"b","text":"CnH2n"},{"id":"c","text":"CnH2n-2"},{"id":"d","text":"CnH2n-6"}]','c','easy',
 'Each degree of unsaturation removes two hydrogens. Alkanes are CnH2n+2, alkenes CnH2n, and alkynes with one triple bond are CnH2n-2.'),

('neet','neet-chem-alcohols',
 'Which of the following is the most acidic?',
 '[{"id":"a","text":"Ethanol"},{"id":"b","text":"Phenol"},{"id":"c","text":"Methanol"},{"id":"d","text":"Propan-2-ol"}]','b','medium',
 'The phenoxide ion is stabilised by resonance delocalisation into the benzene ring, which alkoxide ions from simple alcohols cannot do.'),

('neet','neet-chem-coordination',
 'The oxidation state of iron in K4[Fe(CN)6] is:',
 '[{"id":"a","text":"+2"},{"id":"b","text":"+3"},{"id":"c","text":"0"},{"id":"d","text":"+6"}]','a','medium',
 'Four K at +1 and six CN at -1 give 4 + Fe - 6 = 0, so Fe = +2. The +3 answer corresponds to K3[Fe(CN)6] instead.'),

-- ── BOTANY ─────────────────────────────────────────────────────────────────
('neet','neet-bot-cell',
 'Which organelle is referred to as the powerhouse of the cell?',
 '[{"id":"a","text":"Ribosome"},{"id":"b","text":"Mitochondrion"},{"id":"c","text":"Golgi apparatus"},{"id":"d","text":"Lysosome"}]','b','easy',
 'Mitochondria carry out oxidative phosphorylation and generate most of the cell ATP. Ribosomes synthesise proteins and lysosomes handle intracellular digestion.'),

('neet','neet-bot-photosynthesis',
 'In C3 plants, the primary acceptor of carbon dioxide is:',
 '[{"id":"a","text":"Phosphoenolpyruvate (PEP)"},{"id":"b","text":"Ribulose-1,5-bisphosphate (RuBP)"},{"id":"c","text":"Oxaloacetic acid (OAA)"},{"id":"d","text":"Pyruvate"}]','b','medium',
 'RuBisCO fixes CO2 onto the 5-carbon RuBP to give two molecules of 3-PGA. PEP is the primary acceptor in C4 plants, which is the usual confusion here.'),

('neet','neet-bot-plant-kingdom',
 'Which group of plants is commonly called the amphibians of the plant kingdom?',
 '[{"id":"a","text":"Algae"},{"id":"b","text":"Bryophytes"},{"id":"c","text":"Pteridophytes"},{"id":"d","text":"Gymnosperms"}]','b','easy',
 'Bryophytes live on land but still need water for the motile male gametes to swim to the egg, so they are not fully independent of water.'),

('neet','neet-bot-morphology',
 'Aestivation refers to the arrangement of:',
 '[{"id":"a","text":"leaves on the stem"},{"id":"b","text":"sepals or petals in a floral bud"},{"id":"c","text":"ovules within the ovary"},{"id":"d","text":"roots in the soil"}]','b','medium',
 'Arrangement of leaves on a stem is phyllotaxy and arrangement of ovules in the ovary is placentation. Aestivation applies specifically to the floral bud.'),

('neet','neet-bot-anatomy',
 'In a typical dicot stem, the vascular bundles are:',
 '[{"id":"a","text":"scattered and closed"},{"id":"b","text":"arranged in a ring and open"},{"id":"c","text":"scattered and open"},{"id":"d","text":"entirely absent"}]','b','medium',
 'Dicot stems have bundles in a ring with cambium between xylem and phloem, making them open and capable of secondary growth. Monocot bundles are scattered and closed.'),

('neet','neet-bot-genetics',
 'The phenotypic ratio obtained in the F2 generation of a monohybrid cross is:',
 '[{"id":"a","text":"9:3:3:1"},{"id":"b","text":"3:1"},{"id":"c","text":"1:2:1"},{"id":"d","text":"1:1"}]','b','easy',
 'A monohybrid F2 gives 3 dominant to 1 recessive phenotype. The 1:2:1 ratio is the genotypic ratio, and 9:3:3:1 belongs to a dihybrid cross.'),

('neet','neet-bot-molecular',
 'In a DNA double helix, adenine pairs with:',
 '[{"id":"a","text":"guanine"},{"id":"b","text":"cytosine"},{"id":"c","text":"thymine"},{"id":"d","text":"uracil"}]','c','easy',
 'Adenine pairs with thymine through two hydrogen bonds. Uracil replaces thymine only in RNA, so it is incorrect for a DNA molecule.'),

('neet','neet-bot-respiration',
 'Glycolysis takes place in the:',
 '[{"id":"a","text":"mitochondrial matrix"},{"id":"b","text":"cytoplasm"},{"id":"c","text":"chloroplast stroma"},{"id":"d","text":"nucleus"}]','b','easy',
 'Glycolysis is cytoplasmic and does not require oxygen. The Krebs cycle that follows occurs in the mitochondrial matrix.'),

('neet','neet-bot-growth',
 'Which plant hormone promotes cell elongation and maintains apical dominance?',
 '[{"id":"a","text":"Auxin"},{"id":"b","text":"Abscisic acid"},{"id":"c","text":"Ethylene"},{"id":"d","text":"Cytokinin"}]','a','medium',
 'Auxin produced at the shoot apex drives elongation and suppresses lateral buds. Removing the apex releases this suppression and the plant becomes bushy.'),

('neet','neet-bot-ecology',
 'The ten per cent law of energy transfer across trophic levels was proposed by:',
 '[{"id":"a","text":"Odum"},{"id":"b","text":"Lindeman"},{"id":"c","text":"Tansley"},{"id":"d","text":"Darwin"}]','b','medium',
 'Raymond Lindeman proposed that roughly ten per cent of energy passes to the next trophic level. Tansley coined the term ecosystem.'),

-- ── ZOOLOGY ────────────────────────────────────────────────────────────────
('neet','neet-zoo-digestion',
 'The enzyme that begins the digestion of starch in the mouth is:',
 '[{"id":"a","text":"Pepsin"},{"id":"b","text":"Salivary amylase"},{"id":"c","text":"Trypsin"},{"id":"d","text":"Lipase"}]','b','easy',
 'Salivary amylase (ptyalin) hydrolyses starch to maltose at the slightly alkaline pH of saliva. Pepsin and trypsin act on proteins, lipase on fats.'),

('neet','neet-zoo-breathing',
 'The largest fraction of carbon dioxide is transported in the blood as:',
 '[{"id":"a","text":"dissolved carbon dioxide in plasma"},{"id":"b","text":"carbaminohaemoglobin"},{"id":"c","text":"bicarbonate ions"},{"id":"d","text":"carbon monoxide"}]','c','medium',
 'About 70 per cent travels as bicarbonate formed via carbonic anhydrase in the red blood cells. Roughly 20 to 25 per cent binds haemoglobin and only about 7 per cent dissolves directly.'),

('neet','neet-zoo-circulation',
 'The pacemaker of the human heart is the:',
 '[{"id":"a","text":"atrioventricular node"},{"id":"b","text":"sinoatrial node"},{"id":"c","text":"Purkinje fibres"},{"id":"d","text":"bundle of His"}]','b','easy',
 'The sinoatrial node in the right atrium has the fastest intrinsic rate and therefore sets the rhythm. The AV node acts as a backup pacemaker at a slower rate.'),

('neet','neet-zoo-excretion',
 'The structural and functional unit of the kidney is the:',
 '[{"id":"a","text":"Neuron"},{"id":"b","text":"Nephron"},{"id":"c","text":"Alveolus"},{"id":"d","text":"Hepatocyte"}]','b','easy',
 'Each human kidney contains roughly a million nephrons, each consisting of a renal corpuscle and a tubule. Neuron is the nerve cell, a frequent slip of the eye.'),

('neet','neet-zoo-neural',
 'The junction between two adjacent neurons is called the:',
 '[{"id":"a","text":"Synapse"},{"id":"b","text":"Node of Ranvier"},{"id":"c","text":"Axon hillock"},{"id":"d","text":"Dendrite"}]','a','easy',
 'A synapse transmits the signal chemically or electrically between neurons. Nodes of Ranvier are gaps in the myelin sheath along a single axon.'),

('neet','neet-zoo-chemical',
 'Insulin is secreted by which cells of the islets of Langerhans?',
 '[{"id":"a","text":"Alpha cells"},{"id":"b","text":"Beta cells"},{"id":"c","text":"Delta cells"},{"id":"d","text":"Acinar cells"}]','b','medium',
 'Beta cells secrete insulin, which lowers blood glucose. Alpha cells secrete glucagon, which raises it, and acinar cells produce digestive enzymes instead of hormones.'),

('neet','neet-zoo-human-repro',
 'In humans, fertilisation normally takes place in the:',
 '[{"id":"a","text":"Uterus"},{"id":"b","text":"Ampullary region of the fallopian tube"},{"id":"c","text":"Cervix"},{"id":"d","text":"Ovary"}]','b','medium',
 'Fusion of sperm and ovum occurs at the ampullary-isthmic junction of the oviduct. The zygote then travels to the uterus, where implantation occurs several days later.'),

('neet','neet-zoo-animal-kingdom',
 'Which phylum is characterised by the presence of a water vascular system?',
 '[{"id":"a","text":"Arthropoda"},{"id":"b","text":"Mollusca"},{"id":"c","text":"Echinodermata"},{"id":"d","text":"Annelida"}]','c','medium',
 'Echinoderms such as starfish use a water vascular system with tube feet for locomotion, feeding and gas exchange. It is unique to this phylum.'),

('neet','neet-zoo-health',
 'Malaria in humans is caused by:',
 '[{"id":"a","text":"a bacterium"},{"id":"b","text":"a virus"},{"id":"c","text":"a protozoan"},{"id":"d","text":"a fungus"}]','c','easy',
 'Malaria is caused by the protozoan parasite Plasmodium, transmitted by the bite of an infected female Anopheles mosquito. The mosquito is the vector, not the causative agent.'),

('neet','neet-zoo-animal-husbandry',
 'Which bacterium is used to convert milk into curd?',
 '[{"id":"a","text":"Lactobacillus"},{"id":"b","text":"Clostridium"},{"id":"c","text":"Rhizobium"},{"id":"d","text":"Aspergillus"}]','a','easy',
 'Lactic acid bacteria such as Lactobacillus ferment lactose to lactic acid, which coagulates milk protein. Rhizobium fixes nitrogen and Aspergillus is a fungus, not a bacterium.')
),
ins as (
  insert into public.questions (
    exam_track_id, syllabus_node_id, question_text, question_type, options,
    difficulty, status, is_pyq, source, import_batch, tags, language)
  select p.track, n.id, p.qtext, 'mcq', p.opts::jsonb,
         p.diff, 'published', false,
         'StudyBuddy AI original - NEET-style NCERT-level sample', 'neet-sample-v1', '[]'::jsonb, 'en'
  from payload p
  join public.syllabus_nodes n
    on n.exam_track_id = p.track and n.code = p.chapter_code
  returning id, question_text
)
insert into public.question_answers (question_id, correct_answer, explanation)
select ins.id, p.ans, p.expl
from ins join payload p on p.qtext = ins.question_text;
