// Type declarations for the plain-JS _verifyToken.js helper, so the .ts
// endpoints get a typed contract when importing "./_verifyToken.js".
export interface VerifiedUser {
  uid: string;
  email?: string;
  unverified?: boolean;
}

export function verifyAuthToken(req: any): Promise<VerifiedUser>;
export function requireAuth(req: any, res: any): Promise<VerifiedUser | null>;
