/**
 * ONBOARDING FLOW CLIENT
 * ======================
 * Fetches a flow's question definitions from the API and derives a Zod schema
 * from them at runtime.
 *
 * Deriving the schema rather than hand-writing a second copy is deliberate. The
 * server already owns the authoritative schema; a duplicate maintained here
 * would drift, and when it drifts the client accepts data the server rejects —
 * which a student experiences as a form that refuses to submit with no
 * explanation. One definition, two consumers.
 */

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type {
  FlowType, OnboardingQuestion,
} from "../../api/_onboardingSchemas";

// Re-exported so components import flow types from one place. This is a
// TYPE-ONLY re-export: erased at compile time, so nothing crosses the ESM
// boundary at runtime.
export type { FlowType, OnboardingQuestion };

export interface OnboardingFlow {
  flowType: FlowType;
  title: string;
  description: string;
  questions: OnboardingQuestion[];
}

export const FLOW_LABELS: Record<FlowType, string> = {
  NEET: "NEET",
  GENERAL: "General",
};

export async function fetchOnboardingFlow(flowType: FlowType): Promise<OnboardingFlow> {
  const res = await fetch(`/api/onboarding-questions/${encodeURIComponent(flowType)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as any));
    throw new Error(body.error || `Could not load the ${flowType} questions (${res.status})`);
  }
  return (await res.json()) as OnboardingFlow;
}

/** React Query hook. Definitions are static, so they cache hard. */
export function useOnboardingFlow(flowType: FlowType | null) {
  return useQuery({
    queryKey: ["onboarding-flow", flowType],
    queryFn: () => fetchOnboardingFlow(flowType as FlowType),
    enabled: !!flowType,
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Build a Zod schema from question definitions.
 *
 * Mirrors the server's rules field-for-field. Where the two could disagree the
 * SERVER wins — this exists for fast feedback, not as a security boundary.
 */
export function buildSchemaForQuestions(questions: OnboardingQuestion[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const q of questions) {
    let field: z.ZodTypeAny;

    switch (q.type) {
      case "single_select":
        field = q.options?.length
          ? z.enum(q.options as [string, ...string[]])
          : z.string();
        if (q.required) field = (field as z.ZodString).refine?.(Boolean) ?? field;
        break;

      case "multi_select": {
        const item = q.options?.length
          ? z.enum(q.options as [string, ...string[]])
          : z.string();
        let arr = z.array(item);
        if (q.required || q.minSelected) arr = arr.min(q.minSelected ?? 1, "Select at least one option");
        field = arr;
        break;
      }

      case "number": {
        let num = z.number({ invalid_type_error: "Enter a number" }).int();
        if (typeof q.min === "number") num = num.min(q.min, `Must be at least ${q.min}`);
        if (typeof q.max === "number") num = num.max(q.max, `Must be at most ${q.max}`);
        // An untouched optional number posts null, not undefined.
        field = q.required ? num : num.nullable().optional();
        break;
      }

      case "text":
      case "textarea":
      default: {
        let str = z.string();
        if (typeof q.maxLength === "number") str = str.max(q.maxLength);
        field = q.required ? str.min(1, "This field is required") : str.nullable().optional();
        break;
      }
    }

    shape[q.id] = field;
  }

  return z.object(shape);
}

/** Blank answers for a flow — used to reset state on a flow switch. */
export function emptyAnswersFor(questions: OnboardingQuestion[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const q of questions) {
    out[q.id] = q.type === "multi_select" ? [] : q.type === "number" ? null : "";
  }
  return out;
}

export interface SubmitResult {
  ok: boolean;
  issues?: { path: string; message: string }[];
  error?: string;
}

export async function submitOnboarding(
  flowType: FlowType,
  answers: Record<string, unknown>,
  authHeaders: Record<string, string>
): Promise<SubmitResult> {
  const res = await fetch("/api/onboarding/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ flowType, answers }),
  });

  const body = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    return { ok: false, error: body.error || `Submit failed (${res.status})`, issues: body.issues };
  }
  return { ok: true };
}
