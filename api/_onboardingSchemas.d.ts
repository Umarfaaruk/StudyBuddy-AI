/**
 * Types for _onboardingSchemas.js.
 *
 * Safe to import from `src/` as a TYPE-ONLY import: type imports are erased at
 * compile time, so nothing crosses the ESM boundary at runtime (which is what
 * broke when api/grade.ts tried to import a .ts file from src/).
 */

export type FlowType = "NEET" | "GENERAL";

export type QuestionFieldType =
  | "single_select"
  | "multi_select"
  | "number"
  | "text"
  | "textarea";

export interface OnboardingQuestion {
  id: string;
  label: string;
  type: QuestionFieldType;
  required: boolean;
  options?: string[];
  /** multi_select only. */
  minSelected?: number;
  /** number only. */
  min?: number;
  max?: number;
  /** text / textarea only. */
  maxLength?: number;
  help?: string;
}

export interface OnboardingFlowDefinition {
  flowType: FlowType;
  title: string;
  description: string;
  questions: OnboardingQuestion[];
  /** Zod schema. Typed loosely here so the client never depends on zod internals. */
  schema: unknown;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  issues: ValidationIssue[];
}

export declare const FLOW_TYPES: FlowType[];
export declare const ONBOARDING_REGISTRY: Record<FlowType, OnboardingFlowDefinition>;
export declare function isValidFlowType(value: unknown): boolean;
export declare function getFlow(flowType: string): OnboardingFlowDefinition | null;
export declare function validateSubmission(
  flowType: string,
  payload: Record<string, unknown>
): ValidationResult;
