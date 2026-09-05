export declare const MINOR_AGE: number;
export declare const POLICY_VERSION: string;

export declare function ageOn(
  dateOfBirth: string | Date,
  asOf?: string | Date
): number | null;

export declare function isMinor(
  dateOfBirth: string | Date | null | undefined,
  asOf?: string | Date
): boolean;

export declare function dateOfBirthIssue(
  dateOfBirth: string | Date | null | undefined,
  asOf?: string | Date
): string | null;

export interface GuardianDetails {
  guardianName: string;
  guardianEmail: string;
  guardianRelationship: "Mother" | "Father" | "Legal guardian";
  guardianConsentConfirmed: true;
}

export interface ConsentValidationResult {
  ok: boolean;
  data?: {
    dateOfBirth: string;
    minor: boolean;
    guardian: GuardianDetails | null;
  };
  issues?: { path: string; message: string }[];
}

export declare function validateConsentBlock(
  input: {
    dateOfBirth?: string | null;
    guardian?: Partial<GuardianDetails> | null;
  } | null | undefined,
  asOf?: string | Date
): ConsentValidationResult;
