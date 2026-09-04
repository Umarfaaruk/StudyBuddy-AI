/**
 * GET /api/onboarding-questions/:type
 * ===================================
 * Returns the question structure for a flow ("NEET" or "GENERAL").
 *
 * Public and unauthenticated on purpose: these are form definitions, not user
 * data, and the flow picker renders before a student has necessarily finished
 * signing in. Nothing here is sensitive.
 *
 * The Zod schema itself is NOT serialised — it cannot be, and shipping it would
 * be pointless anyway. Instead each question carries the constraints (required,
 * min, max, options, minSelected) the client needs to rebuild an equivalent
 * schema for form-level validation. The server's schema remains the only
 * authority at submit time.
 */
import { getFlow, FLOW_TYPES } from "../_onboardingSchemas.js";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Vercel supplies [type] on req.query; the dev middleware now does the same.
  const raw = req.query?.type;
  const type = Array.isArray(raw) ? raw[0] : raw;

  if (!type) {
    return res.status(400).json({
      error: "Missing flow type.",
      validTypes: FLOW_TYPES,
    });
  }

  const flow = getFlow(type);
  if (!flow) {
    // 404 rather than 400: the client asked for a resource that does not exist,
    // and listing the valid types makes the failure self-explaining.
    return res.status(404).json({
      error: `Unknown onboarding flow "${type}".`,
      validTypes: FLOW_TYPES,
    });
  }

  // Form definitions change rarely; let the CDN absorb repeat loads while
  // keeping a short window so an edit is not stuck behind a long cache.
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

  return res.status(200).json({
    flowType: flow.flowType,
    title: flow.title,
    description: flow.description,
    questions: flow.questions,
  });
}
