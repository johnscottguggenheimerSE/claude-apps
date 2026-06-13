import {
  clearSessionCookie,
  isAuthed,
  makeSessionCookie,
  requireAuth,
  verifyPassword,
} from './auth';
import {
  enhanceFoodImage,
  generateFoodImage,
  parseRecipe,
} from './gemini';
import { fetchImageAsBase64, fetchRecipePage, isSocialMediaUrl } from './fetch-url';
import { getRecipe, idExists, insertRecipe, listRecipes, updateRecipe } from './db';
import { slugify, normalizeRecipe, validateRecipe, type Recipe } from './validate';

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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(binary);
}

async function loadRecipeImageFromStorage(
  env: Env,
  imageRef: string | undefined | null
): Promise<{ data: string; mimeType: string } | null> {
  if (!imageRef || typeof imageRef !== 'string') return null;
  let key: string;
  if (imageRef.startsWith('/api/images/')) {
    key = imageRef.slice('/api/images/'.length);
  } else if (imageRef.startsWith('recipes/')) {
    key = imageRef;
  } else {
    return null;
  }
  const obj = await env.IMAGES.get(key);
  if (!obj) return null;
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const mimeType = obj.httpMetadata?.contentType || 'image/jpeg';
  return { data: bytesToBase64(bytes), mimeType };
}

async function storeUploadedImage(
  env: Env,
  recipeId: string,
  imageBase64: string,
  mimeType: string
): Promise<string> {
  const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
  return storeRecipeImage(env, recipeId, { data: imageBase64, mimeType }, bytes);
}

async function storeRecipeImage(
  env: Env,
  recipeId: string,
  image: { data: string; mimeType: string },
  bytes?: Uint8Array
): Promise<string> {
  const ext = extFromMime(image.mimeType);
  const key = `recipes/${recipeId}.${ext}`;
  const data = bytes ?? Uint8Array.from(atob(image.data), (c) => c.charCodeAt(0));
  await env.IMAGES.put(key, data, {
    httpMetadata: { contentType: image.mimeType, cacheControl: 'public, max-age=31536000' },
  });
  return `/api/images/${key}`;
}

async function resolveRecipeImage(
  env: Env,
  recipe: Recipe,
  imageBase64: string | null,
  mimeType: string | null,
  existingImageRef?: string | null
): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY saknas');

  const title = String(recipe.title || 'maträtt');
  const desc =
    (recipe.groups as { ingredients: { name: string }[] }[] | undefined)
      ?.map((g) => g.ingredients?.map((i) => i.name).join(', '))
      .filter(Boolean)
      .join('; ') || title;

  if (!imageBase64) {
    const imageRef =
      existingImageRef ?? (typeof recipe.image === 'string' ? recipe.image : null);
    const loaded = await loadRecipeImageFromStorage(env, imageRef);
    if (loaded) {
      imageBase64 = loaded.data;
      mimeType = loaded.mimeType;
    }
  }

  const image =
    imageBase64 && mimeType
      ? await enhanceFoodImage(apiKey, imageBase64, mimeType, title)
      : await generateFoodImage(apiKey, title, desc);

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

async function handleParseUrl(request: Request, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY saknas' }, 503);

  let body: { url?: string };
  try {
    body = (await request.json()) as { url?: string };
  } catch {
    return json({ error: 'Ogiltig JSON' }, 400);
  }

  const url = (body.url || '').trim();
  if (!url || !/^https?:\/\//i.test(url)) return json({ error: 'Ogiltig URL' }, 400);
  if (isSocialMediaUrl(url)) {
    return json({
      error: 'Instagram/TikTok fungerar inte här — använd Text + bild och klistra in caption.',
    }, 400);
  }

  try {
    const page = await fetchRecipePage(url);
    let imageBase64: string | null = null;
    let mimeType: string | null = null;
    if (page.imageUrl) {
      const img = await fetchImageAsBase64(page.imageUrl, url);
      if (img) {
        imageBase64 = img.data;
        mimeType = img.mimeType;
      }
    }
    const recipe = await parseRecipe(
      env.GEMINI_API_KEY,
      page.text,
      null,
      null,
      url
    );
    if (page.pageTitle && (!recipe.source || recipe.source === 'Okänd källa')) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        recipe.source = page.pageTitle.includes(host) ? page.pageTitle : `${page.pageTitle} (${host})`;
      } catch {
        /* ignore */
      }
    }
    delete recipe.emoji;
    if (!recipe.id) recipe.id = slugify(String(recipe.title || 'recept'));
    return json({
      recipe,
      imageBase64,
      mimeType,
      imageFromUrl: !!imageBase64,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'URL-tolkning misslyckades' }, 502);
  }
}

async function handleCreateRecipe(request: Request, env: Env): Promise<Response> {
  let body: {
    recipe?: Recipe;
    imageBase64?: string;
    mimeType?: string;
    featuredNew?: boolean;
    skipImageGeneration?: boolean;
    uploadImage?: boolean;
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
  normalizeRecipe(recipe);

  const skipAiImage = !!body.skipImageGeneration;
  const errors = validateRecipe(recipe, {}, { allowMissingImage: skipAiImage });
  if (errors.length) return json({ error: 'Validering', details: errors }, 400);

  if (await idExists(env.DB, String(recipe.id))) {
    return json({ error: 'Recept-id finns redan', id: recipe.id }, 409);
  }

  try {
    if (body.uploadImage && body.imageBase64 && body.mimeType) {
      recipe.image = await storeUploadedImage(
        env,
        String(recipe.id),
        body.imageBase64,
        body.mimeType
      );
    } else if (!skipAiImage && (!recipe.image || String(recipe.image).startsWith('blob:'))) {
      recipe.image = await resolveRecipeImage(
        env,
        recipe,
        body.imageBase64 || null,
        body.mimeType || null
      );
    } else if (!recipe.image) {
      delete recipe.image;
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
    uploadImage?: boolean;
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
  normalizeRecipe(recipe);

  const errors = validateRecipe(recipe, {});
  if (errors.length) return json({ error: 'Validering', details: errors }, 400);

  const existing = await getRecipe(env.DB, id);
  if (!existing) return json({ error: 'Hittades inte' }, 404);

  try {
    if (body.regenerateImage) {
      recipe.image = await resolveRecipeImage(
        env,
        recipe,
        body.imageBase64 || null,
        body.mimeType || null,
        existing.image as string | undefined
      );
    } else if (body.uploadImage && body.imageBase64 && body.mimeType) {
      recipe.image = await storeUploadedImage(env, id, body.imageBase64, body.mimeType);
    } else if (!recipe.image && existing.image) {
      recipe.image = existing.image as string;
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
  if (path === '/api/parse-url' && request.method === 'POST') {
    return handleParseUrl(request, env);
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
