import { SignJWT } from "jose";
export async function signApiToken(user: { id: string; email: string }, secret: string, ttlSeconds = 900) {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const token = await new SignJWT({ email: user.email }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id).setIssuedAt().setExpirationTime(expiresAt).sign(new TextEncoder().encode(secret));
  return { token, expiresAt };
}
