const COOKIE = 'recept_session';
const MAX_AGE = 60 * 60 * 24 * 30;

async function sessionToken(password: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`receptbok-v1:${password}`)
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(password: string, envPassword: string): Promise<boolean> {
  if (!envPassword) return false;
  return password === envPassword;
}

export async function makeSessionCookie(password: string): Promise<string> {
  const token = await sessionToken(password);
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function isAuthed(request: Request, envPassword: string): Promise<boolean> {
  if (!envPassword) return false;
  const expected = await sessionToken(envPassword);
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(new RegExp(`${COOKIE}=([^;]+)`));
  return match?.[1] === expected;
}

export async function requireAuth(request: Request, envPassword: string): Promise<Response | null> {
  if (await isAuthed(request, envPassword)) return null;
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
