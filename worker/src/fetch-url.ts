export function isSocialMediaUrl(url: string): boolean {
  return /instagram\.com|instagr\.am|tiktok\.com/i.test(url);
}

function metaContent(html: string, prop: string): string | undefined {
  const re1 = new RegExp(`property=["']${prop}["'][^>]*content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`content=["']([^"']+)["'][^>]*property=["']${prop}["']`, 'i');
  const m = html.match(re1) || html.match(re2);
  return m?.[1];
}

function htmlToText(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<[^>]+>/g, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

export async function fetchRecipePage(url: string): Promise<{
  text: string;
  imageUrl?: string;
  pageTitle?: string;
}> {
  const res = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'User-Agent': 'Receptbok/1.0 (recipe import)',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Kunde inte hämta sidan (${res.status})`);
  const html = await res.text();
  const imageUrl = metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
  const pageTitle = metaContent(html, 'og:title') || metaContent(html, 'twitter:title');
  const text = htmlToText(html).slice(0, 50000);
  if (!text || text.length < 80) {
    throw new Error('Sidan gav för lite text — klistra in recepttext manuellt under Text + bild.');
  }
  return { text, imageUrl, pageTitle };
}

export async function fetchImageAsBase64(
  imageUrl: string,
  pageUrl: string
): Promise<{ data: string; mimeType: string } | null> {
  try {
    const absolute = new URL(imageUrl, pageUrl).href;
    const res = await fetch(absolute, {
      headers: { 'User-Agent': 'Receptbok/1.0 (recipe import)' },
    });
    if (!res.ok) return null;
    const mimeType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
    if (!mimeType.startsWith('image/')) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) return null;
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return { data: btoa(binary), mimeType };
  } catch {
    return null;
  }
}
