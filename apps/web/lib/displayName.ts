/** The shape every caller already has to hand: a User row, or a slice of one. */
export type Nameable = { displayName?: string | null; email: string };

/**
 * What to call somebody in the UI.
 *
 * `User.displayName` is nullable and always will be for accounts created
 * before it existed — nothing collected a name then, and there is no honest
 * way to invent one. So the email local part remains the fallback, and every
 * render goes through here rather than reaching for `.displayName` directly:
 * a page that did would print an empty space where a child's name goes.
 *
 * Blank and whitespace-only names fall back too. A user who clears the field
 * on their profile means "I don't want a name set", not "render nothing".
 *
 * The API has its own copy for a different reason — see `resolveDisplayName`
 * in apps/api/src/socket/authenticate.ts, which keeps classmates' addresses
 * out of chat broadcasts. Both should move to packages/shared together.
 */
export function displayName(user: Nameable): string {
  const set = user.displayName?.trim();
  if (set) return set;
  return user.email.split("@")[0] || user.email;
}
