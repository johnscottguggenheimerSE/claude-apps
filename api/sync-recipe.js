/**
 * Vercel serverless: uppdaterar recept/recipes-user.json i GitHub-repot via Contents API.
 *
 * Miljövariabler (sätt i Vercel → Project → Settings → Environment Variables):
 *   GITHUB_TOKEN      — fine-grained PAT: Contents: Read/Write på repot
 *   GITHUB_OWNER      — t.ex. johnscottguggenheimerSE
 *   GITHUB_REPO       — t.ex. claude-apps
 *   SYNC_API_SECRET   — valfri sträng; måste skickas som header X-API-Key från appen
 *   GITHUB_BRANCH     — default main
 *   RECIPES_USER_PATH — default recept/recipes-user.json
 *   CORS_ORIGIN       — default https://johnscottguggenheimerse.github.io
 */

const BRANCH = process.env.GITHUB_BRANCH || 'main';
const PATH = process.env.RECIPES_USER_PATH || 'recept/recipes-user.json';

function encPath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

async function githubGet(owner, repo, token) {
  const u = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + encPath(PATH);
  const r = await fetch(u, {
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });
  if (r.status === 404) return { sha: null, arr: [] };
  if (!r.ok) {
    const t = await r.text();
    throw new Error('GitHub GET ' + r.status + ': ' + t);
  }
  const j = await r.json();
  if (!j.content) throw new Error('Expected file content');
  const text = Buffer.from(String(j.content).replace(/\n/g, ''), 'base64').toString('utf8');
  const data = JSON.parse(text);
  return { sha: j.sha, arr: Array.isArray(data) ? data : [] };
}

async function githubPut(owner, repo, token, arr, sha, message) {
  const content = Buffer.from(JSON.stringify(arr, null, 2), 'utf8').toString('base64');
  const u = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + encPath(PATH);
  const body = {
    message: message || 'recept: uppdatera recipes-user.json',
    content: content,
    branch: BRANCH
  };
  if (sha) body.sha = sha;
  const r = await fetch(u, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error('GitHub PUT ' + r.status + ': ' + t);
  }
  return r.json();
}

export default async function handler(req, res) {
  const allowOrigin = process.env.CORS_ORIGIN || 'https://johnscottguggenheimerse.github.io';
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Använd POST' });
    return;
  }

  const secret = process.env.SYNC_API_SECRET;
  if (!secret || req.headers['x-api-key'] !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) {
    res.status(500).json({ error: 'Server saknar GITHUB_OWNER / GITHUB_REPO / GITHUB_TOKEN' });
    return;
  }

  var body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ error: 'Ogiltig JSON' });
      return;
    }
  }
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Saknar JSON-body' });
    return;
  }

  try {
    if (body.action === 'remove' && body.id) {
      const { sha, arr } = await githubGet(owner, repo, token);
      const next = arr.filter(function(r) {
        return r.id !== body.id;
      });
      await githubPut(owner, repo, token, next, sha, 'recept: ta bort ' + body.id);
      res.status(200).json({ ok: true });
      return;
    }

    if (body.recipe && typeof body.recipe === 'object' && !Array.isArray(body.recipe)) {
      const rep = body.recipe;
      if (!rep.id || typeof rep.id !== 'string') {
        res.status(400).json({ error: 'recipe.id saknas' });
        return;
      }
      const { sha, arr } = await githubGet(owner, repo, token);
      const next = arr.slice();
      var i;
      var found = false;
      for (i = 0; i < next.length; i++) {
        if (next[i].id === rep.id) {
          next[i] = rep;
          found = true;
          break;
        }
      }
      if (!found) next.push(rep);
      await githubPut(owner, repo, token, next, sha, 'recept: lägg till/uppdatera ' + rep.id);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Förväntade { recipe: { ... } } eller { action: "remove", id: "..." }' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
}
