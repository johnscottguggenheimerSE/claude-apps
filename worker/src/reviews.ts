const VISITOR_COOKIE = 'recept_visitor';
const VISITOR_MAX_AGE = 365 * 24 * 60 * 60;

export interface ReviewSummary {
  average: number;
  count: number;
}

export interface ReviewRow {
  rating: number;
  comment: string;
  updated_at: string;
}

function parseCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  const parts = header.split(';');
  for (const part of parts) {
    const s = part.trim();
    if (s.startsWith(name + '=')) {
      return decodeURIComponent(s.slice(name.length + 1));
    }
  }
  return null;
}

export function ensureVisitor(request: Request): { visitorId: string; setCookie?: string } {
  const existing = parseCookie(request, VISITOR_COOKIE);
  if (existing && /^[a-f0-9-]{36}$/i.test(existing)) {
    return { visitorId: existing };
  }
  const id = crypto.randomUUID();
  const secure = request.url.startsWith('https:') ? '; Secure' : '';
  return {
    visitorId: id,
    setCookie: `${VISITOR_COOKIE}=${id}; Path=/; Max-Age=${VISITOR_MAX_AGE}; SameSite=Lax${secure}`,
  };
}

export async function listReviewSummaries(db: D1Database): Promise<Record<string, ReviewSummary>> {
  const { results } = await db
    .prepare(
      `SELECT recipe_id, AVG(rating) AS avg, COUNT(*) AS count
       FROM recipe_reviews GROUP BY recipe_id`
    )
    .all<{ recipe_id: string; avg: number; count: number }>();
  const out: Record<string, ReviewSummary> = {};
  for (const row of results || []) {
    out[row.recipe_id] = {
      average: Math.round(row.avg * 10) / 10,
      count: row.count,
    };
  }
  return out;
}

export async function getRecipeReviewData(
  db: D1Database,
  recipeId: string,
  visitorId: string
): Promise<{
  summary: ReviewSummary | null;
  mine: ReviewRow | null;
  recent: ReviewRow[];
}> {
  const summaryRow = await db
    .prepare(
      `SELECT AVG(rating) AS avg, COUNT(*) AS count FROM recipe_reviews WHERE recipe_id = ?`
    )
    .bind(recipeId)
    .first<{ avg: number | null; count: number }>();

  const summary =
    summaryRow && summaryRow.count > 0
      ? { average: Math.round(Number(summaryRow.avg) * 10) / 10, count: summaryRow.count }
      : null;

  const mine = await db
    .prepare(
      `SELECT rating, comment, updated_at FROM recipe_reviews
       WHERE recipe_id = ? AND visitor_id = ?`
    )
    .bind(recipeId, visitorId)
    .first<ReviewRow>();

  const { results: recent } = await db
    .prepare(
      `SELECT rating, comment, updated_at FROM recipe_reviews
       WHERE recipe_id = ? AND comment != ''
       ORDER BY updated_at DESC LIMIT 6`
    )
    .bind(recipeId)
    .all<ReviewRow>();

  return { summary, mine: mine || null, recent: recent || [] };
}

export async function upsertReview(
  db: D1Database,
  recipeId: string,
  visitorId: string,
  rating: number,
  comment: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO recipe_reviews (recipe_id, visitor_id, rating, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(recipe_id, visitor_id) DO UPDATE SET
         rating = excluded.rating,
         comment = excluded.comment,
         updated_at = excluded.updated_at`
    )
    .bind(recipeId, visitorId, rating, comment, now, now)
    .run();
}
