/** Turns Auth.js's `?error=` code into a plain sentence for the sign-in page. Unknown codes get a generic message. */
const MESSAGES: Record<string, string> = {
  OAuthAccountNotLinked: "That email is already linked to another sign-in method. Use the method you used before.",
  AccessDenied: "Sign-in was cancelled or not allowed.",
  Verification: "That sign-in link has expired or was already used. Ask for a new one.",
  Configuration: "Sign-in is not configured correctly on the server. Try again later.",
  CredentialsSignin: "Those details did not work. Try again."
};

export function signinErrorMessage(code: string | string[] | undefined): string | null {
  const c = Array.isArray(code) ? code[0] : code;
  if (!c) return null;
  return MESSAGES[c] ?? "Sign-in did not work. Try again.";
}
