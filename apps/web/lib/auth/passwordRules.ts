// Password rules shared by the auth forms (client) and lib/auth/actions.ts
// (server). Lives outside actions.ts because a "use server" module may only
// export async functions — a constant there would be a build error.
//
// The server Zod schemas remain the authority. Everything here that the client
// uses is a courtesy: it lets a child see "passwords don't match" under the
// field instead of after a round trip, but a request that skips it is still
// rejected server-side by the same MIN_PASSWORD_LENGTH.

export const MIN_PASSWORD_LENGTH = 8;

export type PasswordPairErrors = {
  password?: string;
  confirmPassword?: string;
};

/**
 * Field-level errors for a new-password + confirmation pair. Empty object
 * means the pair would pass the server's SetPasswordSchema.
 */
export function checkPasswordPair(password: string, confirm: string): PasswordPairErrors {
  const errors: PasswordPairErrors = {};
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (!confirm) {
    errors.confirmPassword = "Type your password again to confirm it.";
  } else if (password !== confirm) {
    errors.confirmPassword = "These passwords don't match yet.";
  }
  return errors;
}

export type PasswordStrength = {
  /** 0 = empty, 1 = below minimum, 2–4 = acceptable and rising. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
};

/**
 * Advisory strength estimate for the meter under a new-password field.
 *
 * Deliberately simple — length and character variety — and never used to
 * reject anything. A real policy (breached-password checks, zxcvbn) would
 * belong on the server; this only nudges a twelve-year-old away from
 * "password" without pulling a 400 KB dictionary into the auth bundle.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "" };
  if (password.length < MIN_PASSWORD_LENGTH) return { score: 1, label: "Too short" };

  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password)
  ).length;

  let points = classes;
  if (password.length >= 12) points += 1;
  if (password.length >= 16) points += 1;

  if (points >= 5) return { score: 4, label: "Great" };
  if (points >= 3) return { score: 3, label: "Strong" };
  return { score: 2, label: "Okay" };
}
