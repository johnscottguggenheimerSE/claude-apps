import type { Recipe } from './validate';

const TEXT_MODEL = 'gemini-2.5-flash';
// Nano Banana 2 → Nano Banana Pro (sällan använd, kvalitet först)
const IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-3-pro-image'];

const PARSE_SYSTEM = `Du är receptparser för en svensk proteinfokuserad receptbok.
Returnera ENDAST ett JSON-objekt (ingen markdown).

Fält (inget emoji-fält):
- id: kebab-case engelska
- category: middag | asiatisk | sallad | bakning
- baseServings: number
- tags: array — endast från: hog-protein, snabb, laggkolhydrat, vegetarisk, meal-prep, kyckling, notkott, flask, fisk, skaldjur, ugn, airfryer, stekpanna, tillbehor
- title, source, sourceUrl (tom sträng om okänd)
- badges: array
- macros: { kcal, prot, carb, fat } för HELA receptet
- groups med ingredients (name lowercase, amount number, unit: g|msk|tsk|st|pinch|näve|strimlor)
- steps: [{ title, text }]
- tips: exakt 4, första title "Seattle" (mild för Seattle Mae, 7 år)

Mått metriska, svenska. Uppskatta makros.`;

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
  const recipe = JSON.parse(raw) as Recipe;
  if (sourceUrl && !recipe.sourceUrl) recipe.sourceUrl = sourceUrl;
  delete recipe.emoji;
  return recipe;
}

export async function generateFoodImage(apiKey: string, title: string, description: string): Promise<{ data: string; mimeType: string }> {
  return geminiImage(apiKey, [
    {
      text: `Professional appetizing food photography of "${title}". ${description}. Overhead or 3/4 angle, natural light, realistic, no text, no watermark, no people, restaurant quality.`,
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
      text: `Improve this food photo of "${title}": sharper, better lighting, more appetizing, clean composition, photorealistic. Keep the same dish. Remove UI overlays, text, and screenshot chrome if present. No text in output.`,
    },
  ]);
}
