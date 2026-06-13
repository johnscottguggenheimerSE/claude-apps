import {
  clearSessionCookie,
  isAuthed,
  makeSessionCookie,
  requireAuth,
  verifyPassword,
} from './auth';
import {
  detectFoodPhoto,
  enhanceFoodImage,
  generateFoodImage,
  parseRecipe,
} from './gemini';
import { getRecipe, idExists, insertRecipe, listRecipes, updateRecipe } from './db';
import { slugify, validateRecipe, type Recipe } from './validate';

export interface Env {
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
  AUTH_PASSWORD?: string;
  DB: D1Database;
  IMAGES: R2Bucket;
}

const PUBLIC_PATHS = new Set(['/login.html', '/favicon.ico']);

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return Response.json(data, { status, headers: extraHeaders });
}

function extFromMime(mime: string): string {
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('png')) return 'png';
  return 'jpg';
}

async function storeRecipeImage(
  env: Env,
  recipeId: string,
  image: { data: string; mimeType: string }
): Promise<string> {
  const ext = extFromMime(image.mimeType);
  const key = `recipes/${recipeId}.${ext}`;
  const bytes = Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0));
  await env.IMAGES.put(key, bytes, {
    httpMetadata: { contentType: image.mimeType, cacheControl: 'public, max-age=31536000' },
  });
  return `/api/images/${key}`;
}

async function resolveRecipeImage(
  env: Env,
  recipe: Recipe,
  imageBase64: string | null,
  mimeType: string | null
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY saknas');

  const title = String(recipe.title || 'maträtt');
  const desc =
    (recipe.groups as { ingredients: { name: string }[] }[] | undefined)
      ?.map((g) => g.ingredients?.map((i) => i.name).join(', '))
      .filter(Boolean)
      .join('; ') || title;

  let image: { data: string; mimeType: string };

  if (imageBase64 && mimeType) {
    const hasFood = await detectFoodPhoto(apiKey, imageBase64, mimeType);
    image = hasFood
      ? await enhanceFoodImage(apiKey, imageBase64, mimeType, title)
      : await generateFoodImage(apiKey, title, desc);
  } else {
    image = await generateFoodImage(apiKey, title, desc);
  }

  return storeRecipeImage(env, String(recipe.id), image);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: { password?: string };
  try {
    body = (await request.json()) as { password?: string };
  } catch {
    return json({ error: 'Ogiltig JSON' }, 400);
  }
  if (!(await verifyPassword(body.password || '', env.AUTH_PASSWORD || ''))) {
    return json({ error: 'Fel lösenord' }, 401);
  }
  const cookie = await makeSessionCookie(env.AUTH_PASSWORD || '');
  return json({ ok: true }, 200, { 'Set-Cookie': cookie });
}

async function handleLogout(): Promise<Response> {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

async function handleAuthCheck(request: Request, env: Env): Promise<Response> {
  return json({ ok: await isAuthed(request, env.AUTH_PASSWORD || '') });
}

async function handleListRecipes(env: Env): Promise<Response> {
  const data = await listRecipes(env.DB);
  return json(data);
}

async function handleGetRecipe(env: Env, id: string): Promise<Response> {
  const recipe = await getRecipe(env.DB, id);
  if (!recipe) return json({ error: 'Hittades inte' }, 404);
  return json({ recipe });
}

async function handleParse(request: Request, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY saknas' }, 503);

  let body: {
    text?: string;
    sourceUrl?: string;
    imageBase64?: string;
    mimeType?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Ogiltig JSON' }, 400);
  }

  const text = body.text || '';
  const sourceUrl = body.sourceUrl || '';
  if (!text.trim() && !body.imageBase64) {
    return json({ error: 'Ange text eller bild' }, 400);
  }

  try {
    const recipe = await parseRecipe(
      env.GEMINI_API_KEY,
      text,
      body.imageBase64 || null,
      body.mimeType || null,
      sourceUrl
    );
    delete recipe.emoji;
    if (!recipe.id) recipe.id = slugify(String(recipe.title || 'recept'));
    return json({ recipe });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Parse misslyckades' }, 502);
  }
}

async function handleCreateRecipe(request: Request, env: Env): Promise<Response> {
  let body: {
    recipe?: Recipe;
    imageBase64?: string;
    mimeType?: string;
    featuredNew?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Ogiltig JSON' }, 400);
  }

  const recipe = body.recipe;
  if (!recipe) return json({ error: 'Saknar recipe' }, 400);

  delete recipe.emoji;
  if (!recipe.id) recipe.id = slugify(String(recipe.title || 'recept'));

  const errors = validateRecipe(recipe, {});
  if (errors.length) return json({ error: 'Validering', details: errors }, 400);

  if (await idExists(env.DB, String(recipe.id))) {
    return json({ error: 'Recept-id finns redan', id: recipe.id }, 409);
  }

  try {
    if (!recipe.image || String(recipe.image).startsWith('blob:')) {
      recipe.image = await resolveRecipeImage(
        env,
        recipe,
        body.imageBase64 || null,
        body.mimeType || null
      );
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Bild misslyckades' }, 502);
  }

  await insertRecipe(env.DB, recipe, { featuredNew: !!body.featuredNew });
  return json({ ok: true, recipe }, 201);
}

async function handleUpdateRecipe(request: Request, env: Env, id: string): Promise<Response> {
  let body: {
    recipe?: Recipe;
    imageBase64?: string;
    mimeType?: string;
    featuredNew?: boolean;
    regenerateImage?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: 'Ogiltig JSON' }, 400);
  }

  const recipe = body.recipe;
  if (!recipe) return json({ error: 'Saknar recipe' }, 400);
  recipe.id = id;
  delete recipe.emoji;

  const errors = validateRecipe(recipe, {});
  if (errors.length) return json({ error: 'Validering', details: errors }, 400);

  const existing = await getRecipe(env.DB, id);
  if (!existing) return json({ error: 'Hittades inte' }, 404);

  try {
    if (body.regenerateImage || body.imageBase64 || !recipe.image) {
      recipe.image = await resolveRecipeImage(
        env,
        recipe,
        body.imageBase64 || null,
        body.mimeType || null
      );
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Bild misslyckades' }, 502);
  }

  await updateRecipe(env.DB, recipe, body.featuredNew);
  return json({ ok: true, recipe });
}

async function handleImage(env: Env, key: string): Promise<Response> {
  const obj = await env.IMAGES.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000');
  return new Response(obj.body, { headers });
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response | null> {
  const path = url.pathname;

  if (path === '/api/health') {
    return json({ ok: true, service: 'receptbok' });
  }

  if (path === '/api/auth/login' && request.method === 'POST') {
    return handleLogin(request, env);
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    return handleLogout();
  }
  if (path === '/api/auth/check' && request.method === 'GET') {
    return handleAuthCheck(request, env);
  }

  if (path.startsWith('/api/images/')) {
    const key = path.slice('/api/images/'.length);
    if (!key || key.includes('..')) return new Response('Bad request', { status: 400 });
    const authErr = await requireAuth(request, env.AUTH_PASSWORD || '');
    if (authErr) return authErr;
    return handleImage(env, key);
  }

  const authErr = await requireAuth(request, env.AUTH_PASSWORD || '');
  if (authErr) return authErr;

  if (path === '/api/recipes' && request.method === 'GET') {
    return handleListRecipes(env);
  }
  if (path === '/api/recipes' && request.method === 'POST') {
    return handleCreateRecipe(request, env);
  }
  if (path === '/api/parse' && request.method === 'POST') {
    return handleParse(request, env);
  }

  const recipeMatch = path.match(/^\/api\/recipes\/([^/]+)$/);
  if (recipeMatch) {
    const id = decodeURIComponent(recipeMatch[1]);
    if (request.method === 'GET') return handleGetRecipe(env, id);
    if (request.method === 'PUT') return handleUpdateRecipe(request, env, id);
  }

  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const apiResponse = await handleApi(request, env, url);
    if (apiResponse) return apiResponse;

    const path = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!PUBLIC_PATHS.has(path) && path !== '/api/health') {
      const authed = await isAuthed(request, env.AUTH_PASSWORD || '');
      if (!authed) {
        if (path.endsWith('.html') || path === '/index.html' || !path.includes('.')) {
          return Response.redirect(new URL('/login.html', url.origin), 302);
        }
        return new Response('Unauthorized', { status: 401 });
      }
    }

    if (path === '/add' || path === '/recept/add') {
      return env.ASSETS.fetch(new Request(new URL('/add.html', url.origin), request));
    }

    return env.ASSETS.fetch(request);
  },
};
