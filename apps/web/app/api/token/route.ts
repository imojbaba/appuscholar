import { auth } from "@/auth";
import { signApiToken } from "@/lib/token";
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "unauthorized" }, { status: 401 });
  const secret = process.env.API_JWT_SECRET;
  if (!secret) return Response.json({ error: "server" }, { status: 500 });
  return Response.json(await signApiToken({ id: session.user.id, email: session.user.email ?? "" }, secret), { headers: { "cache-control": "no-store" } });
}
