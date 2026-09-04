-- ============================================================================
-- Phase 1b — GATE CS and ECE tracks
-- ============================================================================
-- Subject and chapter NAMES only: the published structure of each paper. No
-- question content, no copyrighted material.
--
-- Proves the Phase 1 claim that a new exam is DATA, not DDL — this migration
-- adds two exams and touches no schema.
--
-- Idempotent on (exam_track_id, code), so re-running updates names in place.
-- ============================================================================

insert into public.exam_tracks (id, name, full_name, description, category, sort_order) values
  ('gate-cs', 'GATE CS', 'GATE Computer Science and Information Technology',
   'Postgraduate engineering entrance for M.Tech admission and PSU recruitment.', 'GATE', 3),
  ('gate-ec', 'GATE ECE', 'GATE Electronics and Communication Engineering',
   'Postgraduate engineering entrance for M.Tech admission and PSU recruitment.', 'GATE', 4)
on conflict (id) do update
  set name = excluded.name, full_name = excluded.full_name,
      description = excluded.description, category = excluded.category,
      sort_order = excluded.sort_order;

-- Subjects (GATE calls these sections).
insert into public.syllabus_nodes (exam_track_id, parent_id, level, name, code, position) values
  ('gate-cs', null, 'subject', 'General Aptitude',                        'gcs-ga',      1),
  ('gate-cs', null, 'subject', 'Engineering Mathematics',                 'gcs-math',    2),
  ('gate-cs', null, 'subject', 'Digital Logic',                           'gcs-digital', 3),
  ('gate-cs', null, 'subject', 'Computer Organization and Architecture',  'gcs-coa',     4),
  ('gate-cs', null, 'subject', 'Programming and Data Structures',         'gcs-pds',     5),
  ('gate-cs', null, 'subject', 'Algorithms',                              'gcs-algo',    6),
  ('gate-cs', null, 'subject', 'Theory of Computation',                   'gcs-toc',     7),
  ('gate-cs', null, 'subject', 'Compiler Design',                         'gcs-compiler',8),
  ('gate-cs', null, 'subject', 'Operating System',                        'gcs-os',      9),
  ('gate-cs', null, 'subject', 'Databases',                               'gcs-db',     10),
  ('gate-cs', null, 'subject', 'Computer Networks',                       'gcs-cn',     11),
  ('gate-ec', null, 'subject', 'General Aptitude',                        'gec-ga',      1),
  ('gate-ec', null, 'subject', 'Engineering Mathematics',                 'gec-math',    2),
  ('gate-ec', null, 'subject', 'Networks, Signals and Systems',           'gec-nss',     3),
  ('gate-ec', null, 'subject', 'Electronic Devices',                      'gec-devices', 4),
  ('gate-ec', null, 'subject', 'Analog Circuits',                         'gec-analog',  5),
  ('gate-ec', null, 'subject', 'Digital Circuits',                        'gec-digital', 6),
  ('gate-ec', null, 'subject', 'Control Systems',                         'gec-control', 7),
  ('gate-ec', null, 'subject', 'Communications',                          'gec-comm',    8),
  ('gate-ec', null, 'subject', 'Electromagnetics',                        'gec-em',      9)
on conflict (exam_track_id, code) do update
  set name = excluded.name, position = excluded.position;

with chapters(track, parent_code, code, name, position) as (values
  -- GATE CS
  ('gate-cs','gcs-ga','gcs-ga-verbal','Verbal Aptitude',1),
  ('gate-cs','gcs-ga','gcs-ga-quant','Quantitative Aptitude',2),
  ('gate-cs','gcs-ga','gcs-ga-analytical','Analytical Aptitude',3),
  ('gate-cs','gcs-ga','gcs-ga-spatial','Spatial Aptitude',4),
  ('gate-cs','gcs-math','gcs-math-discrete','Discrete Mathematics',1),
  ('gate-cs','gcs-math','gcs-math-linear','Linear Algebra',2),
  ('gate-cs','gcs-math','gcs-math-calculus','Calculus',3),
  ('gate-cs','gcs-math','gcs-math-probability','Probability and Statistics',4),
  ('gate-cs','gcs-digital','gcs-digital-boolean','Boolean Algebra and Minimisation',1),
  ('gate-cs','gcs-digital','gcs-digital-combinational','Combinational Circuits',2),
  ('gate-cs','gcs-digital','gcs-digital-sequential','Sequential Circuits',3),
  ('gate-cs','gcs-digital','gcs-digital-number','Number Representation and Arithmetic',4),
  ('gate-cs','gcs-coa','gcs-coa-instruction','Machine Instructions and Addressing Modes',1),
  ('gate-cs','gcs-coa','gcs-coa-alu','ALU, Data Path and Control Unit',2),
  ('gate-cs','gcs-coa','gcs-coa-pipeline','Instruction Pipelining',3),
  ('gate-cs','gcs-coa','gcs-coa-memory','Memory Hierarchy and Cache',4),
  ('gate-cs','gcs-coa','gcs-coa-io','I/O Interface and DMA',5),
  ('gate-cs','gcs-pds','gcs-pds-c','Programming in C',1),
  ('gate-cs','gcs-pds','gcs-pds-recursion','Recursion',2),
  ('gate-cs','gcs-pds','gcs-pds-linear','Arrays, Stacks, Queues and Linked Lists',3),
  ('gate-cs','gcs-pds','gcs-pds-trees','Trees and Binary Search Trees',4),
  ('gate-cs','gcs-pds','gcs-pds-heaps','Heaps and Graphs',5),
  ('gate-cs','gcs-algo','gcs-algo-complexity','Asymptotic Complexity Analysis',1),
  ('gate-cs','gcs-algo','gcs-algo-sorting','Searching and Sorting',2),
  ('gate-cs','gcs-algo','gcs-algo-greedy','Greedy Algorithms',3),
  ('gate-cs','gcs-algo','gcs-algo-dp','Dynamic Programming',4),
  ('gate-cs','gcs-algo','gcs-algo-divide','Divide and Conquer',5),
  ('gate-cs','gcs-algo','gcs-algo-graph','Graph Traversals and Shortest Paths',6),
  ('gate-cs','gcs-toc','gcs-toc-regular','Regular Expressions and Finite Automata',1),
  ('gate-cs','gcs-toc','gcs-toc-cfg','Context-Free Grammars and Pushdown Automata',2),
  ('gate-cs','gcs-toc','gcs-toc-turing','Turing Machines and Undecidability',3),
  ('gate-cs','gcs-compiler','gcs-comp-lexical','Lexical Analysis',1),
  ('gate-cs','gcs-compiler','gcs-comp-parsing','Parsing and Syntax-Directed Translation',2),
  ('gate-cs','gcs-compiler','gcs-comp-runtime','Runtime Environments',3),
  ('gate-cs','gcs-compiler','gcs-comp-optimisation','Intermediate Code and Optimisation',4),
  ('gate-cs','gcs-os','gcs-os-processes','Processes and Threads',1),
  ('gate-cs','gcs-os','gcs-os-scheduling','CPU Scheduling',2),
  ('gate-cs','gcs-os','gcs-os-concurrency','Concurrency and Synchronisation',3),
  ('gate-cs','gcs-os','gcs-os-deadlock','Deadlock',4),
  ('gate-cs','gcs-os','gcs-os-memory','Memory Management and Virtual Memory',5),
  ('gate-cs','gcs-os','gcs-os-filesystem','File Systems',6),
  ('gate-cs','gcs-db','gcs-db-er','ER Model and Relational Model',1),
  ('gate-cs','gcs-db','gcs-db-sql','Relational Algebra and SQL',2),
  ('gate-cs','gcs-db','gcs-db-normal','Normalisation',3),
  ('gate-cs','gcs-db','gcs-db-transactions','Transactions and Concurrency Control',4),
  ('gate-cs','gcs-db','gcs-db-indexing','File Organisation and Indexing',5),
  ('gate-cs','gcs-cn','gcs-cn-layering','Layering and Protocol Stack',1),
  ('gate-cs','gcs-cn','gcs-cn-datalink','Data Link Layer and Switching',2),
  ('gate-cs','gcs-cn','gcs-cn-network','Routing and IP Addressing',3),
  ('gate-cs','gcs-cn','gcs-cn-transport','Transport Layer: TCP and UDP',4),
  ('gate-cs','gcs-cn','gcs-cn-application','Application Layer Protocols',5),
  -- GATE ECE
  ('gate-ec','gec-ga','gec-ga-verbal','Verbal Aptitude',1),
  ('gate-ec','gec-ga','gec-ga-quant','Quantitative Aptitude',2),
  ('gate-ec','gec-ga','gec-ga-analytical','Analytical Aptitude',3),
  ('gate-ec','gec-ga','gec-ga-spatial','Spatial Aptitude',4),
  ('gate-ec','gec-math','gec-math-linear','Linear Algebra',1),
  ('gate-ec','gec-math','gec-math-calculus','Calculus',2),
  ('gate-ec','gec-math','gec-math-de','Differential Equations',3),
  ('gate-ec','gec-math','gec-math-complex','Complex Analysis',4),
  ('gate-ec','gec-math','gec-math-probability','Probability and Statistics',5),
  ('gate-ec','gec-nss','gec-nss-networks','Circuit Analysis and Network Theorems',1),
  ('gate-ec','gec-nss','gec-nss-transient','Transient and Steady-State Analysis',2),
  ('gate-ec','gec-nss','gec-nss-ct','Continuous-Time Signals and Systems',3),
  ('gate-ec','gec-nss','gec-nss-dt','Discrete-Time Signals and Systems',4),
  ('gate-ec','gec-nss','gec-nss-transforms','Fourier, Laplace and Z Transforms',5),
  ('gate-ec','gec-devices','gec-dev-semiconductor','Semiconductor Basics',1),
  ('gate-ec','gec-devices','gec-dev-diode','PN Junction and Diodes',2),
  ('gate-ec','gec-devices','gec-dev-bjt','BJT and MOSFET',3),
  ('gate-ec','gec-devices','gec-dev-fabrication','Device Fabrication',4),
  ('gate-ec','gec-analog','gec-analog-diode','Diode Circuits',1),
  ('gate-ec','gec-analog','gec-analog-amplifiers','BJT and MOSFET Amplifiers',2),
  ('gate-ec','gec-analog','gec-analog-opamp','Operational Amplifiers',3),
  ('gate-ec','gec-analog','gec-analog-feedback','Feedback and Oscillators',4),
  ('gate-ec','gec-digital','gec-dig-boolean','Boolean Algebra and Logic Gates',1),
  ('gate-ec','gec-digital','gec-dig-combinational','Combinational Circuits',2),
  ('gate-ec','gec-digital','gec-dig-sequential','Sequential Circuits',3),
  ('gate-ec','gec-digital','gec-dig-adc','Data Converters and Memory',4),
  ('gate-ec','gec-control','gec-ctrl-basics','Feedback Principles and Block Diagrams',1),
  ('gate-ec','gec-control','gec-ctrl-timeresponse','Time-Domain Response',2),
  ('gate-ec','gec-control','gec-ctrl-stability','Stability: Routh-Hurwitz and Root Locus',3),
  ('gate-ec','gec-control','gec-ctrl-frequency','Frequency Response: Bode and Nyquist',4),
  ('gate-ec','gec-control','gec-ctrl-statespace','State Variable Model',5),
  ('gate-ec','gec-comm','gec-comm-random','Random Processes and Noise',1),
  ('gate-ec','gec-comm','gec-comm-analog','Analog Modulation',2),
  ('gate-ec','gec-comm','gec-comm-digital','Digital Modulation',3),
  ('gate-ec','gec-comm','gec-comm-information','Information Theory and Coding',4),
  ('gate-ec','gec-em','gec-em-maxwell','Maxwell Equations',1),
  ('gate-ec','gec-em','gec-em-waves','Plane Waves and Propagation',2),
  ('gate-ec','gec-em','gec-em-transmission','Transmission Lines',3),
  ('gate-ec','gec-em','gec-em-waveguides','Waveguides',4),
  ('gate-ec','gec-em','gec-em-antennas','Antennas',5)
)
insert into public.syllabus_nodes (exam_track_id, parent_id, level, name, code, position)
select c.track, p.id, 'chapter', c.name, c.code, c.position
from chapters c
join public.syllabus_nodes p
  on p.exam_track_id = c.track and p.code = c.parent_code
on conflict (exam_track_id, code) do update
  set name = excluded.name, position = excluded.position, parent_id = excluded.parent_id;

-- Backfill categories on the original two so the picker can group everything.
update public.exam_tracks set category = 'Engineering Entrance' where id = 'jee-main' and category is null;
update public.exam_tracks set category = 'Medical Entrance'     where id = 'neet'     and category is null;
