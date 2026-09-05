import LegalLayout, { Section, Bullets, CONTACT_EMAIL } from "./LegalLayout";

/**
 * TERMS OF SERVICE
 * ================
 * Two clauses here exist because of specific, real exposure rather than
 * boilerplate habit:
 *
 *   1. NO AFFILIATION. The product names JEE, NEET and GATE throughout. Those
 *      examinations are run by the NTA, the IITs and IISc, and their names are
 *      their marks. Describing what we prepare students for is fair; implying
 *      endorsement is not, so it is disclaimed explicitly.
 *
 *   2. AI CAN BE WRONG. Explanations come from a language model. A student who
 *      memorises a confidently-worded wrong explanation is harmed in a way that
 *      matters, so this is stated plainly rather than buried in a warranty
 *      disclaimer.
 */
const TermsOfService = () => (
  <LegalLayout
    title="Terms of Service"
    intro="These terms cover your use of StudyBuddy AI. They are written to be read, not to be skipped — the sections on AI accuracy and on our relationship to the examination bodies are the ones that actually matter to you."
  >
    <Section title="Agreeing to these terms">
      <p>
        By creating an account or using StudyBuddy AI, you agree to these terms.
        If you do not agree, please do not use the service.
      </p>
    </Section>

    <Section title="Who may use StudyBuddy AI">
      <p>
        You may use StudyBuddy AI if you are 18 or older, or if you are under 18
        and your parent or legal guardian has given permission and accepts these
        terms on your behalf. If you are a parent or guardian permitting a
        child&rsquo;s use, you are responsible for their activity on the
        service.
      </p>
    </Section>

    <Section title="No affiliation with any examination body">
      <p>
        <strong className="text-foreground">
          StudyBuddy AI is an independent study tool. We are not affiliated with,
          endorsed by, authorised by or connected to the National Testing Agency,
          the Indian Institutes of Technology, the Indian Institute of Science,
          or any other body that conducts JEE, NEET, GATE or any other
          examination.
        </strong>
      </p>
      <p>
        Examination names and syllabus structures are referred to only to
        describe what our material helps you prepare for. All such names remain
        the property of their respective owners. Always confirm syllabus,
        eligibility, dates and pattern against the official source for your
        examination — our content is a study aid, never an authority on the
        exam.
      </p>
    </Section>

    <Section title="Our content can be wrong">
      <p>
        Explanations, hints and answers to your doubts are generated in part by
        artificial intelligence. AI can be confidently and completely wrong. Our
        practice questions are written or curated by us and may contain
        mistakes.
      </p>
      <p>
        Treat everything here as study material to be checked, not as verified
        fact. Do not rely on it for anything that matters without confirming it
        against your textbook, your teacher, or the official syllabus. If you
        spot an error, please report it — it helps everyone.
      </p>
    </Section>

    <Section title="We do not promise results">
      <p>
        Your rank, score and admission outcome depend on your work and on
        factors entirely outside our control. Nothing on this site is a promise
        or guarantee of any examination result. Where we show score improvements
        from other students, those are that student&rsquo;s measured results
        shared with their permission, not a prediction of yours.
      </p>
    </Section>

    <Section title="Your account">
      <Bullets
        items={[
          "Give accurate information when you sign up, and keep it current.",
          "Keep your login details to yourself. You are responsible for activity under your account.",
          "One account per person. Do not share an account or let someone else use yours.",
          "Tell us promptly if you think someone else has accessed your account.",
        ]}
      />
    </Section>

    <Section title="Acceptable use">
      <p>While using StudyBuddy AI, please do not:</p>
      <Bullets
        items={[
          "Attempt to extract answer keys, scrape the question bank, or bypass how marking works.",
          "Interfere with the service, probe it for weaknesses, or try to access another user's data.",
          "Upload anything unlawful, abusive, or that infringes someone else's copyright.",
          "Use the service to cheat in a real examination.",
          "Resell or redistribute our content as your own.",
        ]}
      />
      <p>
        If you find a security flaw, please report it to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
          {CONTACT_EMAIL}
        </a>{" "}
        rather than exploiting it. We will not pursue action against anyone who
        reports a genuine issue responsibly and gives us reasonable time to fix
        it.
      </p>
    </Section>

    <Section title="Content and ownership">
      <p>
        The platform, its questions, explanations and design belong to us or our
        licensors. You may use them for your own study, but not republish or
        sell them.
      </p>
      <p>
        Anything you upload or write stays yours. You give us permission to
        store and process it so that we can provide the service to you — for
        example, sending your doubt to an AI model to generate an answer. We do
        not claim ownership of your work.
      </p>
    </Section>

    <Section title="Availability">
      <p>
        We aim to keep the service running but cannot guarantee it will always
        be available or uninterrupted. We may change, suspend or discontinue
        features. If we plan to discontinue something you rely on, we will give
        reasonable notice where we can. The service is provided &ldquo;as
        is&rdquo;.
      </p>
    </Section>

    <Section title="Limitation of liability">
      <p>
        To the extent permitted by law, we are not liable for indirect or
        consequential loss, or for examination outcomes, arising from your use
        of StudyBuddy AI. Nothing in these terms limits liability that cannot be
        limited by law, including liability for fraud.
      </p>
    </Section>

    <Section title="Ending your use">
      <p>
        You can stop using StudyBuddy AI and delete your account at any time. We
        may suspend or close an account that breaches these terms, and will tell
        you why unless we are prevented from doing so.
      </p>
    </Section>

    <Section title="Governing law">
      <p>
        These terms are governed by the laws of India, and the courts of India
        have jurisdiction over any dispute arising from them.
      </p>
    </Section>

    <Section title="Changes to these terms">
      <p>
        We may update these terms. The date at the top shows the last change,
        and we will notify you of significant changes rather than relying on you
        checking this page.
      </p>
    </Section>
  </LegalLayout>
);

export default TermsOfService;
