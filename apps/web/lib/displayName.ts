/**
 * A person's display name, derived from their email local part.
 *
 * `User` has no name column yet, so every view that names somebody does this.
 * It lives here rather than inline at each call site so that adding
 * `User.displayName` later is one edit plus a backfill, not a hunt through the
 * pages — the parent portal is what made a third copy of it unacceptable.
 *
 * Falls back to the full address: an email with an empty local part is not
 * something to render as a blank space where a child's name goes.
 *
 * The API has its own copy for a different reason — see `displayNameFromEmail`
 * in apps/api/src/socket/authenticate.ts, which exists to keep classmates'
 * addresses out of chat broadcasts. The two should move to packages/shared
 * together; that's a cross-app change and doesn't belong in this PR.
 */
export function displayName(email: string): string {
  return email.split("@")[0] || email;
}
