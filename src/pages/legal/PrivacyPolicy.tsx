import LegalLayout, { Section, Bullets, CONTACT_EMAIL } from "./LegalLayout";

/**
 * PRIVACY POLICY
 * ==============
 * Written against the actual schema and the actual outbound requests, not from
 * a template. Every category below maps to real columns (`profiles`,
 * `user_preferences`, `question_responses`, `mock_test_attempts`,
 * `doubt_sessions`, `testimonials`) and every recipient is a service the code
 * genuinely calls.
 *
 * See LegalLayout for the standing caveat: this needs review by an Indian
 * lawyer, especially on children's data under the DPDP Act 2023.
 */
const PrivacyPolicy = () => (
  <LegalLayout
    title="Privacy Policy"
    intro="This policy explains what StudyBuddy AI collects, why, who it is shared with, and what you can ask us to do with it. It describes how the product actually works rather than reserving every right we could imagine needing."
  >
    <Section title="Who we are">
      <p>
        StudyBuddy AI is an exam-preparation platform for Indian competitive
        examinations. We are the data fiduciary for the personal data described
        below. You can reach us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </Section>

    <Section title="Students under 18">
      <p>
        Most candidates preparing for JEE and NEET are between 16 and 18 years
        old, so we assume many of our users are minors. Under India&rsquo;s
        Digital Personal Data Protection Act 2023, processing the personal data
        of anyone under 18 requires verifiable consent from a parent or legal
        guardian.
      </p>
      <p>
        <strong className="text-foreground">
          If you are under 18, please use StudyBuddy AI only with your parent or
          guardian&rsquo;s knowledge and permission.
        </strong>{" "}
        A parent or guardian may contact us at any time to see what we hold
        about their child, correct it, or have it deleted, using the address
        above.
      </p>
      <p>
        We do not serve behavioural or targeted advertising to any user, and we
        do not track users across other websites.
      </p>
    </Section>

    <Section title="What we collect">
      <p>We collect only what the product needs to function:</p>
      <Bullets
        items={[
          <>
            <strong className="text-foreground">Account details</strong> — your
            name, email address and profile picture. If you sign in with Google,
            we receive these from Google; we never see your Google password.
          </>,
          <>
            <strong className="text-foreground">Profile details you enter</strong>{" "}
            — such as your class or grade level, stream, institution, age,
            location and a short bio. These are optional beyond what onboarding
            asks for.
          </>,
          <>
            <strong className="text-foreground">Exam preparation details</strong>{" "}
            — the exam you are preparing for, your target exam date, and your
            answers to the onboarding questions (for example your attempt
            number, target score, weak subjects and study hours).
          </>,
          <>
            <strong className="text-foreground">Your study activity</strong> —
            the questions you answer and whether you got them right, how long
            each answer took, diagnostic and mock test results, review
            schedules, and progress over time. This is what makes the weak-topic
            analysis and the spaced revision schedule work.
          </>,
          <>
            <strong className="text-foreground">Doubts and uploads</strong> —
            questions you ask the AI tutor, and any documents or images you
            upload for help.
          </>,
          <>
            <strong className="text-foreground">Technical data</strong> — error
            reports when something breaks, so we can fix it.
          </>,
        ]}
      />
    </Section>

    <Section title="How we use it">
      <Bullets
        items={[
          "To run your account and sign you in.",
          "To pick which questions to show you, and to schedule revision based on what you got wrong and how quickly you answered.",
          "To produce your diagnostic breakdown, mock test scores and progress charts.",
          "To answer your doubts using AI, grounded in the syllabus for your exam.",
          "To send you a weekly progress email, if you have not turned it off.",
          "To find and fix faults in the product.",
        ]}
      />
      <p>
        We do not sell your personal data, and we do not share it with
        advertisers.
      </p>
    </Section>

    <Section title="Who else processes your data">
      <p>
        We use a small number of service providers. They process data on our
        instructions, for the purposes below and nothing else:
      </p>
      <Bullets
        items={[
          <>
            <strong className="text-foreground">Supabase</strong> — database,
            authentication and file storage. Your account and study data live
            here.
          </>,
          <>
            <strong className="text-foreground">Vercel</strong> — application
            hosting and delivery.
          </>,
          <>
            <strong className="text-foreground">Groq</strong> — AI processing.
            When you ask a doubt or request an explanation, the text of your
            question and the relevant syllabus context are sent to Groq to
            generate a reply. Do not include personal or sensitive information
            in a question that does not need to be there.
          </>,
          <>
            <strong className="text-foreground">Google</strong> — sign-in, if
            you choose Google sign-in, and video metadata when you use the video
            features.
          </>,
          <>
            <strong className="text-foreground">Resend</strong> — sending
            transactional and progress emails.
          </>,
          <>
            <strong className="text-foreground">Supadata</strong> — retrieving
            transcripts for study videos.
          </>,
        ]}
      />
      <p>
        Some of these providers operate servers outside India, so your data may
        be processed abroad.
      </p>
    </Section>

    <Section title="What is public, and only with your permission">
      <p>
        Nothing about you is published by default. Two features can make
        information visible to others, and both are strictly opt-in:
      </p>
      <Bullets
        items={[
          <>
            <strong className="text-foreground">The public leaderboard</strong> —
            you appear only if you switch it on, and you choose the display name
            shown.
          </>,
          <>
            <strong className="text-foreground">Improvement stories</strong> —
            we ask separately for permission to share your quote and score
            change, and again before using your name. You can decline either and
            still use every part of the product.
          </>,
        ]}
      />
      <p>You can withdraw both permissions at any time.</p>
    </Section>

    <Section title="Storage on your device">
      <p>
        We store a small amount of data in your browser. The most important is
        your progress during a mock test: your answers are saved locally so that
        refreshing the page or losing your connection does not lose your work.
        This stays on your device. We do not use advertising or cross-site
        tracking cookies.
      </p>
    </Section>

    <Section title="How your data is protected">
      <p>
        Data is encrypted in transit. Access is enforced at the database level
        by row-level security, so one student&rsquo;s records cannot be read by
        another even if the application had a fault. Answer keys are held in a
        separate table that the browser cannot read at all — marking happens on
        our servers, which is both an anti-cheating measure and a limit on what
        any client-side flaw could expose.
      </p>
      <p>
        No system is perfectly secure, and we will not pretend otherwise. If we
        discover a breach affecting your data, we will notify you and the Data
        Protection Board as required.
      </p>
    </Section>

    <Section title="How long we keep it">
      <p>
        We keep your account and study history while your account is open,
        because progress tracking is only meaningful over time. When you delete
        your account, we delete your personal data within 30 days, except where
        we are required to keep something by law. Aggregate statistics that
        cannot identify you may be retained.
      </p>
    </Section>

    <Section title="Your rights">
      <p>Under the DPDP Act 2023 you can ask us to:</p>
      <Bullets
        items={[
          "Show you the personal data we hold about you.",
          "Correct anything inaccurate or incomplete.",
          "Delete your data and close your account.",
          "Withdraw a consent you previously gave, such as leaderboard visibility.",
          "Nominate someone to exercise these rights if you are unable to.",
        ]}
      />
      <p>
        Write to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
          {CONTACT_EMAIL}
        </a>{" "}
        and we will respond within 30 days. If you are not satisfied with our
        response, you may complain to the Data Protection Board of India.
      </p>
    </Section>

    <Section title="Changes to this policy">
      <p>
        If we change how we handle your data, we will update this page and the
        date at the top. For significant changes affecting your rights, we will
        tell you directly rather than relying on you noticing.
      </p>
    </Section>
  </LegalLayout>
);

export default PrivacyPolicy;
