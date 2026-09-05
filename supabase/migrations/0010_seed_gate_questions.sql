-- ============================================================================
-- Phase 1b - 40 GATE sample questions (20 CS + 20 ECE)
-- ============================================================================
-- ORIGINAL questions authored for this repo, in GATE style on standard syllabus
-- topics. NOT past papers: is_pyq=false and no year/session, so nothing here can
-- be mistaken for licensed GATE content.
--
-- Split 20/20 rather than 40 on one paper so BOTH tracks are usable. A track
-- with zero questions renders an empty diagnostic and an empty practice list,
-- which is worse than not offering the track at all.
--
-- Idempotent: the batch is deleted and reinserted, scoped by import_batch so
-- the existing JEE 'sample-v1' batch is untouched.
-- ============================================================================

delete from public.question_answers
 where question_id in (select id from public.questions where import_batch = 'gate-sample-v1');
delete from public.questions where import_batch = 'gate-sample-v1';

with payload(track, chapter_code, qtext, opts, ans, diff, expl) as (values
-- GATE CS
('gate-cs','gcs-ga-quant',
 'A shop applies a 20% discount on the marked price and then a further 10% discount on the reduced price. The single equivalent discount is:',
 '[{"id":"a","text":"26%"},{"id":"b","text":"28%"},{"id":"c","text":"30%"},{"id":"d","text":"32%"}]','b','easy',
 'Successive discounts multiply, they do not add. The customer pays 0.80 x 0.90 = 0.72 of the marked price, so the discount is 1 - 0.72 = 0.28, i.e. 28%. Adding 20 + 10 to get 30% is the standard trap.'),

('gate-cs','gcs-ga-analytical',
 'Given that P implies Q and Q implies R, and that R is FALSE, what can be concluded about P?',
 '[{"id":"a","text":"P is TRUE"},{"id":"b","text":"P is FALSE"},{"id":"c","text":"P may be TRUE or FALSE"},{"id":"d","text":"Nothing can be concluded"}]','b','easy',
 'By transitivity P implies R. The contrapositive of that is: not R implies not P. Since R is false, P must be false.'),

('gate-cs','gcs-math-discrete',
 'How many reflexive relations can be defined on a set containing exactly 3 elements?',
 '[{"id":"a","text":"64"},{"id":"b","text":"128"},{"id":"c","text":"512"},{"id":"d","text":"8"}]','a','medium',
 'A relation on a 3-element set is a subset of 9 ordered pairs. Reflexivity forces the 3 diagonal pairs to be present, leaving 9 - 3 = 6 pairs free. So the count is 2^6 = 64. The 512 option is the number of ALL relations, 2^9.'),

('gate-cs','gcs-math-linear',
 'The eigenvalues of the matrix [[2, 1], [1, 2]] are:',
 '[{"id":"a","text":"1 and 2"},{"id":"b","text":"1 and 3"},{"id":"c","text":"2 and 3"},{"id":"d","text":"0 and 4"}]','b','medium',
 'The characteristic equation is (2 - L)^2 - 1 = 0, giving L^2 - 4L + 3 = 0, so L = 1 and L = 3. Check: the sum of eigenvalues 1 + 3 = 4 equals the trace, and the product 3 equals the determinant.'),

('gate-cs','gcs-math-probability',
 'Two fair six-sided dice are rolled. What is the probability that the sum of the faces is exactly 8?',
 '[{"id":"a","text":"1/6"},{"id":"b","text":"5/36"},{"id":"c","text":"1/9"},{"id":"d","text":"7/36"}]','b','medium',
 'The favourable outcomes are (2,6), (3,5), (4,4), (5,3) and (6,2), which is 5 of the 36 equally likely outcomes. So the probability is 5/36.'),

('gate-cs','gcs-digital-boolean',
 'The Boolean expression AB + AB'' + A''B simplifies to:',
 '[{"id":"a","text":"A + B"},{"id":"b","text":"AB"},{"id":"c","text":"A"},{"id":"d","text":"B"}]','a','medium',
 'Group the first two terms: AB + AB'' = A(B + B'') = A. The expression becomes A + A''B, and by the absorption identity A + A''B = A + B.'),

('gate-cs','gcs-digital-sequential',
 'What is the minimum number of flip-flops required to build a modulo-12 counter?',
 '[{"id":"a","text":"3"},{"id":"b","text":"4"},{"id":"c","text":"6"},{"id":"d","text":"12"}]','b','easy',
 'n flip-flops give 2^n distinct states. 3 flip-flops give only 8 states, which is fewer than 12, so 4 are needed (16 states, of which 12 are used).'),

('gate-cs','gcs-coa-pipeline',
 'A 5-stage pipeline has stage delays of 100, 120, 90, 110 and 80 ns. Each pipeline latch adds 10 ns. What is the minimum clock period?',
 '[{"id":"a","text":"110 ns"},{"id":"b","text":"120 ns"},{"id":"c","text":"130 ns"},{"id":"d","text":"510 ns"}]','c','medium',
 'The clock period is set by the SLOWEST stage plus the latch overhead, not by the sum. That is 120 + 10 = 130 ns. The 510 ns option is the non-pipelined total.'),

('gate-cs','gcs-coa-memory',
 'A cache has a hit ratio of 0.9 and an access time of 10 ns. On a miss the block is first fetched from main memory (100 ns) and then read from the cache (10 ns). The average memory access time is:',
 '[{"id":"a","text":"19 ns"},{"id":"b","text":"20 ns"},{"id":"c","text":"11 ns"},{"id":"d","text":"110 ns"}]','b','medium',
 'AMAT = 0.9 x 10 + 0.1 x (100 + 10) = 9 + 11 = 20 ns. The miss penalty must include the cache read that follows the fetch.'),

('gate-cs','gcs-pds-linear',
 'The values 1, 2, 3 and 4 are pushed onto an empty stack in that order. Two pop operations are performed, then 5 is pushed, then one more pop. Which value does the final pop return?',
 '[{"id":"a","text":"3"},{"id":"b","text":"4"},{"id":"c","text":"5"},{"id":"d","text":"2"}]','c','easy',
 'A stack is last-in first-out. The two pops return 4 and 3, leaving 1 and 2. Pushing 5 puts it on top, so the next pop returns 5.'),

('gate-cs','gcs-pds-trees',
 'What is the maximum number of nodes in a binary tree of height 4, where the height of a single-node tree is 0?',
 '[{"id":"a","text":"15"},{"id":"b","text":"16"},{"id":"c","text":"31"},{"id":"d","text":"32"}]','c','medium',
 'With this convention a tree of height h has at most 2^(h+1) - 1 nodes. For h = 4 that is 2^5 - 1 = 31. Answering 15 corresponds to using the other height convention, so read the definition given in the question.'),

('gate-cs','gcs-algo-complexity',
 'The recurrence T(n) = 2T(n/2) + n, with T(1) = 1, has the solution:',
 '[{"id":"a","text":"Theta(n)"},{"id":"b","text":"Theta(n log n)"},{"id":"c","text":"Theta(n^2)"},{"id":"d","text":"Theta(log n)"}]','b','medium',
 'By the master theorem, a = 2, b = 2, so n^(log_b a) = n. The driving term f(n) = n matches that, which is case 2, giving Theta(n log n). This is the merge sort recurrence.'),

('gate-cs','gcs-algo-dp',
 'The standard dynamic programming solution to the 0/1 knapsack problem with n items and integer capacity W runs in time:',
 '[{"id":"a","text":"O(n log W)"},{"id":"b","text":"O(nW)"},{"id":"c","text":"O(n^2)"},{"id":"d","text":"O(2^n)"}]','b','medium',
 'The table has n x W entries and each is filled in constant time, so the running time is O(nW). This is pseudo-polynomial, not polynomial, because W is exponential in the number of bits used to write it.'),

('gate-cs','gcs-algo-graph',
 'Using a binary min-heap as the priority queue, the worst-case running time of the Dijkstra shortest-path algorithm on a graph with V vertices and E edges is:',
 '[{"id":"a","text":"O(V^2)"},{"id":"b","text":"O((V + E) log V)"},{"id":"c","text":"O(VE)"},{"id":"d","text":"O(E + V log V)"}]','b','medium',
 'Each vertex is extracted once at O(log V), and each edge can trigger one decrease-key at O(log V), giving O((V + E) log V). O(E + V log V) is the sharper bound obtained with a Fibonacci heap, not a binary heap.'),

('gate-cs','gcs-toc-regular',
 'Which of the following languages over the alphabet {a, b} is NOT regular?',
 '[{"id":"a","text":"Strings containing an even number of a symbols"},{"id":"b","text":"Strings of the form a^n b^n for n greater than or equal to 0"},{"id":"c","text":"Strings ending in ab"},{"id":"d","text":"Strings of length exactly 5"}]','b','medium',
 'a^n b^n needs unbounded counting to match the two blocks, which a finite automaton cannot do; the pumping lemma rules it out. The other three are each recognised by a finite automaton with a fixed number of states.'),

('gate-cs','gcs-toc-turing',
 'Which of the following problems is undecidable?',
 '[{"id":"a","text":"Whether a given DFA accepts the empty language"},{"id":"b","text":"Whether a given Turing machine halts on the empty input"},{"id":"c","text":"Whether a given string is generated by a context-free grammar"},{"id":"d","text":"Whether two given DFAs are equivalent"}]','b','hard',
 'The halting problem on empty input is undecidable, a standard reduction from the general halting problem. The other three are decidable: DFA emptiness and DFA equivalence by state-space algorithms, and CFG membership by the CYK algorithm.'),

('gate-cs','gcs-comp-parsing',
 'A grammar containing left recursion cannot be parsed directly by:',
 '[{"id":"a","text":"An LR(1) parser"},{"id":"b","text":"An LALR(1) parser"},{"id":"c","text":"A top-down predictive LL(1) parser"},{"id":"d","text":"An operator precedence parser"}]','c','medium',
 'A top-down predictive parser would recurse on the same non-terminal without consuming input, so it loops forever. Left recursion must be eliminated first. Bottom-up LR family parsers handle left recursion without difficulty.'),

('gate-cs','gcs-os-scheduling',
 'Four processes arrive at time 0 with CPU bursts of 6, 8, 7 and 3 ms. Under non-preemptive shortest-job-first scheduling, the average waiting time is:',
 '[{"id":"a","text":"7 ms"},{"id":"b","text":"10.25 ms"},{"id":"c","text":"6 ms"},{"id":"d","text":"13 ms"}]','a','medium',
 'SJF runs them in the order 3, 6, 7, 8. Waiting times are 0, 3, 9 and 16 ms, so the average is 28/4 = 7 ms.'),

('gate-cs','gcs-os-deadlock',
 'Which of the following is NOT one of the four necessary conditions for deadlock?',
 '[{"id":"a","text":"Mutual exclusion"},{"id":"b","text":"Hold and wait"},{"id":"c","text":"Preemption"},{"id":"d","text":"Circular wait"}]','c','medium',
 'The four Coffman conditions are mutual exclusion, hold and wait, NO preemption, and circular wait. Preemption is the opposite of a required condition: allowing it is one way to prevent deadlock.'),

('gate-cs','gcs-db-normal',
 'A relation that is in 2NF but not in 3NF necessarily contains:',
 '[{"id":"a","text":"A partial dependency on part of a candidate key"},{"id":"b","text":"A transitive dependency of a non-prime attribute on a candidate key"},{"id":"c","text":"A multi-valued dependency"},{"id":"d","text":"No candidate key at all"}]','b','medium',
 '2NF has already removed every partial dependency. What 3NF additionally forbids is a transitive dependency, where a non-prime attribute is determined by another non-prime attribute rather than directly by a candidate key.'),

-- GATE ECE
('gate-ec','gec-ga-quant',
 'A train 150 m long travels at a uniform speed of 72 km/h. How long does it take to pass a stationary pole?',
 '[{"id":"a","text":"5.0 s"},{"id":"b","text":"7.5 s"},{"id":"c","text":"10.0 s"},{"id":"d","text":"12.5 s"}]','b','easy',
 'Convert first: 72 km/h = 72 x 1000/3600 = 20 m/s. To pass a pole the train travels its own length, so t = 150/20 = 7.5 s.'),

('gate-ec','gec-ga-analytical',
 'What is the next term in the sequence 2, 6, 12, 20, 30, ... ?',
 '[{"id":"a","text":"38"},{"id":"b","text":"40"},{"id":"c","text":"42"},{"id":"d","text":"44"}]','c','easy',
 'The differences are 4, 6, 8, 10, increasing by 2, so the next difference is 12 and the next term is 30 + 12 = 42. Equivalently the nth term is n(n+1), and 6 x 7 = 42.'),

('gate-ec','gec-math-linear',
 'The determinant of the matrix [[1, 2], [3, 4]] is:',
 '[{"id":"a","text":"-2"},{"id":"b","text":"2"},{"id":"c","text":"-10"},{"id":"d","text":"10"}]','a','easy',
 'For a 2x2 matrix the determinant is ad - bc = (1)(4) - (2)(3) = 4 - 6 = -2.'),

('gate-ec','gec-math-calculus',
 'The value of the limit of sin(3x)/x as x approaches 0 is:',
 '[{"id":"a","text":"0"},{"id":"b","text":"1"},{"id":"c","text":"3"},{"id":"d","text":"Does not exist"}]','c','medium',
 'Write sin(3x)/x = 3 x sin(3x)/(3x). As x approaches 0 the factor sin(3x)/(3x) approaches 1, leaving 3.'),

('gate-ec','gec-math-probability',
 'A fair coin is tossed three times. What is the probability of obtaining exactly two heads?',
 '[{"id":"a","text":"1/4"},{"id":"b","text":"3/8"},{"id":"c","text":"1/2"},{"id":"d","text":"1/8"}]','b','medium',
 'There are 3 choose 2 = 3 favourable sequences (HHT, HTH, THH) out of 2^3 = 8 equally likely outcomes, so the probability is 3/8.'),

('gate-ec','gec-nss-networks',
 'A 6 ohm resistor and a 3 ohm resistor are connected in parallel. The equivalent resistance is:',
 '[{"id":"a","text":"9 ohm"},{"id":"b","text":"4.5 ohm"},{"id":"c","text":"2 ohm"},{"id":"d","text":"1.5 ohm"}]','c','easy',
 'For two resistors in parallel R = R1 R2/(R1 + R2) = 18/9 = 2 ohm. Note the equivalent is always smaller than the smaller resistor, which rules out the first two options immediately.'),

('gate-ec','gec-nss-transient',
 'A series RC circuit has R = 10 kilo-ohm and C = 10 microfarad. The time constant is:',
 '[{"id":"a","text":"0.01 s"},{"id":"b","text":"0.1 s"},{"id":"c","text":"1 s"},{"id":"d","text":"100 s"}]','b','easy',
 'The time constant is RC = (10 x 10^3) x (10 x 10^-6) = 10^-1 = 0.1 s.'),

('gate-ec','gec-nss-transforms',
 'The Laplace transform of the unit step function u(t) is:',
 '[{"id":"a","text":"1"},{"id":"b","text":"1/s"},{"id":"c","text":"1/s^2"},{"id":"d","text":"s"}]','b','easy',
 'Integrating e^(-st) from 0 to infinity gives 1/s, valid for Re(s) greater than 0. The transform 1 corresponds to the impulse, and 1/s^2 to the ramp.'),

('gate-ec','gec-nss-dt',
 'A discrete-time LTI system has impulse response h[n] = (0.5)^n u[n]. The system is:',
 '[{"id":"a","text":"Causal and BIBO stable"},{"id":"b","text":"Causal but not BIBO stable"},{"id":"c","text":"Non-causal but BIBO stable"},{"id":"d","text":"Neither causal nor BIBO stable"}]','a','medium',
 'h[n] is zero for negative n, so the system is causal. BIBO stability requires the impulse response to be absolutely summable: the sum of (0.5)^n for n from 0 to infinity is 1/(1 - 0.5) = 2, which is finite. So it is stable.'),

('gate-ec','gec-dev-semiconductor',
 'In an intrinsic semiconductor at thermal equilibrium, the electron concentration n and hole concentration p satisfy:',
 '[{"id":"a","text":"n is much greater than p"},{"id":"b","text":"p is much greater than n"},{"id":"c","text":"n = p = ni"},{"id":"d","text":"n x p = 0"}]','c','easy',
 'In an intrinsic material every electron promoted to the conduction band leaves one hole behind, so the carriers are generated in pairs and n = p = ni, the intrinsic carrier concentration.'),

('gate-ec','gec-dev-diode',
 'The approximate cut-in (knee) voltage of a silicon pn junction diode at room temperature is:',
 '[{"id":"a","text":"0.2 V"},{"id":"b","text":"0.7 V"},{"id":"c","text":"1.1 V"},{"id":"d","text":"0.0 V"}]','b','easy',
 'Silicon diodes conduct appreciably from about 0.7 V. 0.2 V to 0.3 V is the germanium figure, and 1.1 eV is the silicon band gap, which is a different quantity.'),

('gate-ec','gec-dev-bjt',
 'An n-channel enhancement MOSFET operates in the saturation region when:',
 '[{"id":"a","text":"VGS is less than VT"},{"id":"b","text":"VGS is greater than VT and VDS is less than VGS - VT"},{"id":"c","text":"VGS is greater than VT and VDS is greater than or equal to VGS - VT"},{"id":"d","text":"VGS = 0 and VDS is greater than 0"}]','c','medium',
 'The channel must first be inverted, needing VGS greater than VT. Saturation then begins once the drain end of the channel pinches off, which happens when VDS reaches VGS - VT. Below that the device is in the triode region.'),

('gate-ec','gec-analog-opamp',
 'An ideal operational amplifier is used in the inverting configuration with an input resistor of 10 kilo-ohm and a feedback resistor of 100 kilo-ohm. The closed-loop voltage gain is:',
 '[{"id":"a","text":"+10"},{"id":"b","text":"-10"},{"id":"c","text":"+11"},{"id":"d","text":"-0.1"}]','b','easy',
 'For the inverting configuration the gain is -Rf/Rin = -100k/10k = -10. The sign matters: the output is inverted. +11 would be the non-inverting gain 1 + Rf/Rin.'),

('gate-ec','gec-analog-feedback',
 'Applying negative feedback to an amplifier generally:',
 '[{"id":"a","text":"Increases gain and increases bandwidth"},{"id":"b","text":"Decreases gain and decreases bandwidth"},{"id":"c","text":"Decreases gain and increases bandwidth"},{"id":"d","text":"Leaves the gain-bandwidth product unchanged but increases distortion"}]','c','medium',
 'Negative feedback trades gain for other benefits: the closed-loop gain falls by the factor (1 + A x beta) and the bandwidth rises by the same factor, so the gain-bandwidth product is roughly preserved. Distortion and sensitivity to device parameters both fall.'),

('gate-ec','gec-dig-boolean',
 'The output of a two-input XOR gate is logic HIGH when:',
 '[{"id":"a","text":"Both inputs are HIGH"},{"id":"b","text":"Both inputs are LOW"},{"id":"c","text":"The two inputs are different"},{"id":"d","text":"At least one input is HIGH"}]','c','easy',
 'XOR implements inequality: the output is 1 exactly when the inputs differ. Option d describes OR, and option a describes AND.'),

('gate-ec','gec-dig-combinational',
 'How many select lines are required for an 8-to-1 multiplexer?',
 '[{"id":"a","text":"2"},{"id":"b","text":"3"},{"id":"c","text":"4"},{"id":"d","text":"8"}]','b','easy',
 'n select lines choose among 2^n inputs. Selecting one of 8 needs 2^n = 8, so n = 3.'),

('gate-ec','gec-ctrl-stability',
 'A unity-feedback system has the characteristic equation s^3 + 2s^2 + 3s + 6 = 0. The system is:',
 '[{"id":"a","text":"Stable"},{"id":"b","text":"Marginally stable"},{"id":"c","text":"Unstable with one right-half-plane pole"},{"id":"d","text":"Unstable with two right-half-plane poles"}]','b','hard',
 'Building the Routh array gives a row of zeros in the s^1 row, which signals roots on the imaginary axis. Factorising confirms it: s^3 + 2s^2 + 3s + 6 = (s + 2)(s^2 + 3), so the roots are -2 and plus or minus j times the square root of 3. Poles on the axis and none in the right half plane means marginally stable.'),

('gate-ec','gec-ctrl-timeresponse',
 'A second-order system has a damping ratio of 0.5. Its step response is:',
 '[{"id":"a","text":"Overdamped, with no overshoot"},{"id":"b","text":"Critically damped"},{"id":"c","text":"Underdamped, with oscillatory overshoot"},{"id":"d","text":"Undamped, oscillating forever"}]','c','medium',
 'A damping ratio strictly between 0 and 1 gives complex conjugate poles and an underdamped response that overshoots and rings before settling. Zero is undamped, exactly 1 is critically damped, and greater than 1 is overdamped.'),

('gate-ec','gec-comm-analog',
 'A carrier at 100 kHz is amplitude modulated by a single tone at 5 kHz. The transmission bandwidth of the resulting AM signal is:',
 '[{"id":"a","text":"5 kHz"},{"id":"b","text":"10 kHz"},{"id":"c","text":"100 kHz"},{"id":"d","text":"105 kHz"}]','b','medium',
 'Conventional AM produces sidebands at the carrier plus and minus the modulating frequency, here 95 kHz and 105 kHz. The bandwidth is the difference, 2 x 5 = 10 kHz, and does not depend on the carrier frequency.'),

('gate-ec','gec-em-transmission',
 'A lossless transmission line of characteristic impedance 50 ohm is terminated in a 100 ohm resistive load. The voltage standing wave ratio on the line is:',
 '[{"id":"a","text":"0.5"},{"id":"b","text":"1.0"},{"id":"c","text":"2.0"},{"id":"d","text":"3.0"}]','c','medium',
 'The reflection coefficient is (100 - 50)/(100 + 50) = 1/3. Then VSWR = (1 + 1/3)/(1 - 1/3) = 2. For a purely resistive load VSWR is simply the ratio of the larger to the smaller of the load and line impedances, 100/50 = 2.')
),
ins as (
  insert into public.questions (
    exam_track_id, syllabus_node_id, question_text, question_type, options,
    difficulty, status, is_pyq, source, import_batch, tags, language)
  select p.track, n.id, p.qtext, 'mcq', p.opts::jsonb,
         p.diff, 'published', false,
         'StudyBuddy AI original - GATE-style sample', 'gate-sample-v1', '[]'::jsonb, 'en'
  from payload p
  join public.syllabus_nodes n
    on n.exam_track_id = p.track and n.code = p.chapter_code
  returning id, question_text
)
insert into public.question_answers (question_id, correct_answer, explanation)
select ins.id, p.ans, p.expl
from ins join payload p on p.qtext = ins.question_text;
