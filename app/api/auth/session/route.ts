import { getSessionUser } from "../../../lib/auth";

export async function GET(request: Request) {
  const user = getSessionUser(request);
  return Response.json({ authenticated: Boolean(user), user });
}
