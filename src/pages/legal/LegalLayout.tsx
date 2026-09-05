import { useEffect, type ReactNode } from "react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

/**
 * SHARED SHELL FOR THE LEGAL PAGES
 * ================================
 * Privacy Policy and Terms of Service share a layout, a contact address and a
 * "last updated" date. Keeping them in one place means the date and the contact
 * cannot drift between the two documents — a policy that lists two different
 * grievance addresses is worse than one that lists none.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THESE DOCUMENTS DESCRIBE WHAT THE APPLICATION ACTUALLY DOES. They were
 * written against the real schema and the real outbound calls: the tables in
 * `profiles` and `user_preferences`, the AI requests to Groq, Google OAuth,
 * and the content APIs. They are NOT generic templates.
 *
 * They are ALSO NOT LEGAL ADVICE and have not been reviewed by a lawyer. Before
 * this site takes real users at scale, they need review by an Indian lawyer
 * familiar with the DPDP Act 2023 — in particular the rules on processing the
 * personal data of children under 18, which apply directly here because most
 * JEE and NEET candidates are 16 to 18 years old.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * The reachable point of contact the DPDP Act requires for data-principal
 * requests — access, correction, erasure, and withdrawal of consent.
 *
 * Currently a personal address. Move it to a role address (support@ or
 * privacy@ on the company domain) once that domain exists: a policy that
 * outlives one person's inbox needs an address that does too.
 */
export const CONTACT_EMAIL = "umarfaaruk154246@gmail.com";

/** Bump whenever either document changes materially. */
export const LAST_UPDATED = "5 September 2026";

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-xl font-bold text-foreground tracking-tight">{title}</h2>
    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
  </section>
);

export const Bullets = ({ items }: { items: ReactNode[] }) => (
  <ul className="space-y-1.5 pl-5 list-disc marker:text-muted-foreground/60">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ul>
);

interface Props {
  title: string;
  intro: string;
  children: ReactNode;
}

const LegalLayout = ({ title, intro, children }: Props) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Navbar />

      <main className="flex-grow pt-28 pb-24">
        <article className="container max-w-3xl mx-auto px-6 space-y-10">
          <header className="space-y-3">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{title}</h1>
            <p className="text-xs text-muted-foreground">Last updated: {LAST_UPDATED}</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{intro}</p>
          </header>

          {children}

          <footer className="pt-6 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Questions about this document? Contact{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </footer>
        </article>
      </main>

      <Footer />
    </div>
  );
};

export default LegalLayout;
