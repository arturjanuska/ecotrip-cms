import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";

export const ADMIN_ROLE = "admin";

export type AuthState = "signed-out" | "forbidden" | "admin";

/**
 * CMS access needs `{"role": "admin"}` in the user's public metadata, set by
 * hand in the Clerk dashboard. The role is read from the session token when the
 * token carries it (Clerk dashboard -> Sessions -> Customize session token:
 * `{"metadata": "{{user.public_metadata}}"}`); otherwise one Backend API call
 * per request fetches the user.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const { isAuthenticated, sessionClaims } = await auth();
  if (!isAuthenticated) {
    return "signed-out";
  }

  const role =
    sessionClaims?.metadata?.role ??
    (await currentUser())?.publicMetadata?.role;

  return role === ADMIN_ROLE ? "admin" : "forbidden";
});

/** Call at the top of every CMS page and layout. */
export async function requireAdminPage() {
  const state = await getAuthState();

  if (state === "signed-out") {
    redirect("/login");
  }
  if (state === "forbidden") {
    redirect("/no-access");
  }
}
