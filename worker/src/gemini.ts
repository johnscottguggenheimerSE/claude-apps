import { normalizeRecipe, type Recipe } from './validate';

const TEXT_MODEL = 'gemini-2.5-flash';
// Kvalitet först; fall back på billigare modell vid 404/429 (gratis tier har ofta 0 bildquota på Pro/3.1)
const IMAGE_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-2.5-flash-image',
];

const QUOTA_HELP =
  'Gratis Gemini API har ofta ingen bildkvot (limit: 0). Aktivera billing i Google AI Studio → API key → projekt med betalning, eller vänta tills dagens kvot återställs. Kvoter: https://ai.google.dev/gemini-api/docs/rate-limits · Usage: https://ai.dev/rate-limit';

const PARSE_SYSTEM = `Du är receptparser för en svensk proteinfokuserad receptbok.
Returnera ENDAST ett JSON-objekt (ingen markdown).

Fält (inget emoji-fält):
- id: kebab-case engelska
- category: middag | asiatisk | sallad | bakning
- baseServings: number
- tags: array — endast från: hog-protein, snabb, laggkolhydrat, vegetarisk, meal-prep, kyckling, notkott, flask, fisk, skaldjur, ugn, airfryer, stekpanna, tillbehor
- title, source (läsbar källa: sajtnamn, «Ali Slagle, NYT Cooking», «@handle på Instagram»), sourceUrl
- sourceUrl: publik recept-URL (matblogg, NYT Cooking, etc.). Tom sträng för Instagram/TikTok — vi kan inte läsa inloggade sociala länkar; använd @handle i source istället
- badges: array med minst portioner (t.ex. «4 portioner») och tidsuppskattning (t.ex. «30 min»)
- macros: { kcal, prot, carb, fat } för HELA receptet
- groups med ingredients (name lowercase, amount number, unit: g|msk|tsk|st|pinch|näve|strimlor)
- steps: [{ title, text }]
- tips: exakt 4, första title "Seattle" (mild för Seattle Mae, 7 år)

Mått metriska, svenska. Uppskatta makros.`;

import { isSocialMediaUrl } from './fetch-url';

async function geminiJson(
  apiKey: string,
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
  system: string
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini text ${res.status}: ${err.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returnerade ingen text');
  return text;
}

async function geminiImage(
  apiKey: string,
  parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>
): Promise<{ data: string; mimeType: string }> {
  const body = JSON.stringify({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      temperature: 0.4,
    },
  });

  let lastErr = 'Gemini returnerade ingen bild';
  let sawQuota = false;

  for (const model of IMAGE_MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }
    );
    if (res.status === 404) {
      lastErr = `Modell ${model} hittades inte`;
      continue;
    }
    if (res.status === 429) {
      sawQuota = true;
      lastErr = `Kvot slut för ${model}`;
      continue;
    }
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini image ${res.status}: ${err.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { inlineData?: { data: string; mimeType: string } }[] } }[];
    };
    for (const part of data.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData?.data) return part.inlineData;
    }
    lastErr = `Modell ${model} returnerade ingen bild`;
  }

  if (sawQuota) {
    throw new Error(`Gemini bildkvot slut (${lastErr}). ${QUOTA_HELP}`);
  }
  throw new Error(lastErr);
}

export async function detectFoodPhoto(
  apiKey: string,
  imageBase64: string,
  mimeType: string
): Promise<boolean> {
  const text = await geminiJson(
    apiKey,
    [
      { inlineData: { mimeType, data: imageBase64 } },
      {
        text: 'Finns en tydlig maträtt/foto av mat i bilden (inte bara text/UI)? Svara JSON: {"hasFoodPhoto": true|false}',
      },
    ],
    'Svara endast JSON.'
  );
  try {
    return !!(JSON.parse(text) as { hasFoodPhoto?: boolean }).hasFoodPhoto;
  } catch {
    return false;
  }
}

export async function parseRecipe(
  apiKey: string,
  text: string,
  imageBase64: string | null,
  mimeType: string | null,
  sourceUrl: string
): Promise<Recipe> {
  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];
  if (imageBase64 && mimeType) {
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
  }
  const prompt = [
    text.trim() ? `Recepttext/beskrivning:\n${text.trim()}` : 'Extrahera recept från bilden.',
    sourceUrl ? `Källa-URL: ${sourceUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  parts.push({ text: prompt });

  const raw = await geminiJson(apiKey, parts, PARSE_SYSTEM);
  const recipe = normalizeRecipe(JSON.parse(raw) as Recipe);
  if (sourceUrl && !recipe.sourceUrl && !isSocialMediaUrl(sourceUrl)) {
    recipe.sourceUrl = sourceUrl;
  }
  if (recipe.sourceUrl && isSocialMediaUrl(String(recipe.sourceUrl))) {
    recipe.sourceUrl = '';
  }
  delete recipe.emoji;
  return recipe;
}

const IMAGE_CLEANUP =
  'Remove ALL overlays and non-food UI: play/pause buttons, mute/volume icons, video progress bars, Reels/TikTok/Instagram chrome, timestamps, captions, subtitles, stickers, logos, watermarks, profile avatars, like/comment/share icons, screenshot borders, phone status bar. Output must be clean food photo only — zero text or interface elements.';

export async function generateFoodImage(apiKey: string, title: string, description: string): Promise<{ data: string; mimeType: string }> {
  return geminiImage(apiKey, [
    {
      text: `Professional appetizing food photography of "${title}". ${description}. Overhead or 3/4 angle, natural light, realistic, no people, restaurant quality. ${IMAGE_CLEANUP}`,
    },
  ]);
}

export async function enhanceFoodImage(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  title: string
): Promise<{ data: string; mimeType: string }> {
  return geminiImage(apiKey, [
    { inlineData: { mimeType, data: imageBase64 } },
    {
      text: `This is a photo of "${title}". Create an improved version of THIS EXACT image — same dish, same plating, same bowl/plate, same camera angle and framing. Do not invent a different meal or change the composition. Fix and clean up: sharper focus, better natural lighting, richer appetizing colors, professional food photography. Photorealistic, no people. This may be a video screenshot — ${IMAGE_CLEANUP}`,
    },
  ]);
}
