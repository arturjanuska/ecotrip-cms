import { clerkMiddleware } from "@clerk/nextjs/server";

// Auth checks live next to each resource: pages call auth() and redirect,
// write Route Handlers answer 401. The proxy only makes the Clerk session
// available to auth().
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    // Always run for Clerk-specific frontend API routes
    "/__clerk/:path*",
  ],
};
