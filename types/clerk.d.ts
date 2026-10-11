export {};

declare global {
  interface UserPublicMetadata {
    role?: string;
  }

  interface CustomJwtSessionClaims {
    metadata?: UserPublicMetadata;
  }
}
