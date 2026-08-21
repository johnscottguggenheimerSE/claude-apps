import { normalizeRecipe, type Recipe } from './validate';

/**
 * Text / JSON — endast modeller med gratis free tier (Flash / Flash-Lite).
 * Pro, Preview-Pro och bildmodeller används aldrig här.
 * @see https://ai.google.dev/gemini-api/docs/pricing
 */
const TEXT_MODELS_PARSE = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] as const;
const TEXT_MODELS_SIMPLE = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] as const;

/** Bildgenerering — kräver ofta billing; separat kvot från text. */
const IMAGE_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'gemini-2.5-flash-image',
] as const;

const QUOTA_HELP =
  'Gratis Gemini API har ofta ingen bildkvot (limit: 0). Aktivera billing i Google AI Studio → API key → projekt med betalning, eller vänta tills dagens kvot återställs. Kvoter: https://ai.google.dev/gemini-api/docs/rate-limits · Usage: https://ai.dev/rate-limit';

const PARSE_SYSTEM = `Du är receptparser för en svensk proteinfokuserad receptbok.
Returnera ENDAST ett JSON-objekt (ingen markdown).

Fält (inget emoji-fält):
- id: kebab-case engelska
- category: frukost | lunch | middag | tillbehor | fika (måltidstyp — inte kök/stil som asiatisk)
- baseServings: number
- tags: array — endast från: kyckling, notkott, flask, fisk, skaldjur, vegetarisk, vegan (proteinkälla + diet — inte tid/makro som hög protein, snabb, meal prep)
- source (läsbar källa: @handle, «Ali Slagle, NYT Cooking», sajtnamn — **utan** «på Instagram/TikTok» i texten)
- **source:** alltid **ursprunglig receptskapare** — @handle på Instagram/TikTok, blogg/sajtnamn, kock + publikation. **Aldrig** personen som vidarebefordrat receptet privat (vän/familj) om de inte själva är kreatören
- **source:** vid skärmdump/reel/caption — läs @handle, kontonamn eller vattenstämpel synligt i bilden/texten; prioritera det. Om okänt: «Okänd källa» — gissa inte vidarebefordrare
- **title:** alltid på **svenska** — översätt engelska/internationella receptnamn till naturlig svenska (behåll etablerade lånord som gochujang, teriyaki, buffalo där det passar). **Obligatoriskt** — title får aldrig vara tom
- **title:** inkludera **aldrig** ordet «protein» (eller «högprotein») — ta bort proteinkrav från namnet men behåll resten (t.ex. «Proteinbanankaka» → «Banankaka»)
- sourceUrl: publik recept-URL (matblogg, NYT Cooking, etc.). Tom sträng för Instagram/TikTok — vi kan inte läsa inloggade sociala länkar; använd @handle i source istället
- badges: array med minst portioner (t.ex. «4 portioner») och tidsuppskattning som **endast** «XX min» (t.ex. «30 min») — aldrig «ca», «under» eller intervall i badge; vid intervall i källan använd högsta minut
- macros: { kcal, prot, carb, fat } för HELA receptet
- groups: **obligatoriskt**, minst en grupp med **minst en** ingredient (name lowercase, amount number, unit: g|msk|tsk|st|pinch|näve|strimlor). Tomma groups eller ingredients=[] är ogiltigt — extrahera alla ingredienser från källan
- steps: [{ title, text }]
- tips: exakt 4, första title "För barn" (mild barnvänlig anpassning)

Kategori — måltidstyp:
- frukost: frukostmat
- lunch: lunch, wraps, sallader som huvudmål, lättare rätter
- middag: kvällsmat, huvudrätter
- tillbehor: sidor, spreads, bröd, pickles, tillbehör till annan måltid
- fika: bakverk, sötsaker, bullar till fika

Mått — kritiska regler (fel här ger 1g-mjölk o.dyl.):
- Tillåtna unit: endast g|msk|tsk|st|pinch|näve|strimlor
- tbsp/tablespoon → unit msk (samma siffra). tsp/teaspoon → unit tsk (samma siffra)
- cup/cups → räkna om till gram: vätska/mjölk/yoghurt ≈ 240 g/cup, mjöl/socker/pulver ≈ 120 g/cup, smör ≈ 227 g/cup. Skriv amount i gram, unit g
- ml → g 1:1 för vätskor; dl → amount×100 som g; oz → ×28; lb → ×454
- scoop proteinpulver ≈ 30 g; espresso shot ≈ 30 g; ägg → st
- **ALDRIG** byt bara etiketten till g utan att räkna om. 1 cup ≠ 1 g, 1 tbsp ≠ 1 g, 1 scoop ≠ 1 g, 1¼ cup mjölk ≠ 1.25 g
- Föredra msk/tsk för olja, soja, vinäger, pastasåser, honung, kryddor i små mängder — tvinga inte allt till gram
- Små äkta grammängder (salt, peppar, jäst, bakpulver) får vara några gram

Språk — ingredienser och steg (naturlig svenska, inte ord-för-ord):
- **Mejeri med fetthalt:** använd svensk butiksnomenklatur med **procent**, inte «fullfet/lågfet/light» som adjektiv.
  - full-fat / whole milk cottage cheese → «keso 4%» (inte «fullfet keso»)
  - low-fat / reduced-fat cottage cheese → «keso 1,5%»
  - fat-free / nonfat cottage cheese → «keso 0,1%»
  - full-fat Greek yogurt → «grekisk yoghurt 10%» (eller 6–10% om osäkert); nonfat → «grekisk yoghurt 0%»
  - whole milk → «helmjölk»; 2% → «mellanmjölk»; skim → «lättmjölk»
- **Vanliga matord (inte anglicismer):**
  - soy sauce / sojasås → **«soja»** (inte sojasås)
  - cubed / diced → **«tärnad»** (aldrig «kuberad»); skriv «tärnad lax», inte «lax, kuberad»
  - Persian cucumber / persisk gurka → **«gurka»** (i Sverige finns ingen «persisk gurka» i butik)
  - vanilla paste → **«vaniljextrakt»** (eller «vaniljpasta» endast om källan tydligt menar pastaprodukt — föredra vaniljextrakt)
  - spicy mayo / sriracha mayo → **«chilimajonnäs»** (inte «pikant majonnäs»)
  - avocado → **«avokado»** konsekvent (inte avocado)
  - light ketchup / lättketchup / ketchup med lågt kaloriinnehåll → **«ketchup»** (marknadsföring — räkna som vanlig ketchup)
- **Stegverb:** drizzle → «ringla» eller «droppa» — **aldrig** «dryppla». Fold gently → «vänd försiktigt».
- **Maskin-/produktlägen** (Ninja Creami m.fl.): behåll **officiellt engelskt lägesnamn** i citattecken — översätt aldrig «Lite Ice Cream» till «lite glass». Ex: «kör på "Lite Ice Cream"-läget», «kör Re-spin». Skriv «Re-spin», inte «respinna».
- Översätt instruktioner till flytande svenska men behåll varumärken, lägesnamn och etablerade lånord (gochujang, teriyaki, espresso, Creami).
- Ingrediensnamn: lowercase, svenska vardagsord (cottage cheese → keso, scallion → salladslök, cornstarch → majsstärkelse). Prep före namn när det går («tärnad gurka»).

Uppskatta makros för hela receptet.`

import { isSocialMediaUrl } from './fetch-url';

type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string } };

function textGenerationConfig() {
  return {
    responseMimeType: 'application/json',
    temperature: 0.2,
    thinkingConfig: { thinkingBudget: 0 },
  };
}

async function geminiJson(
  apiKey: string,
  parts: GeminiPart[],
  system: string,
  models: readonly string[] = TEXT_MODELS_PARSE
): Promise<string> {
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: textGenerationConfig(),
  });

  let lastErr = 'Gemini returnerade ingen text';

  for (const model of models) {
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
      lastErr = `Kvot slut för ${model}`;
      continue;
    }
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini text ${res.status}: ${err.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;
    lastErr = `Modell ${model} returnerade ingen text`;
  }

  throw new Error(lastErr);
}

async function geminiImage(
  apiKey: string,
  parts: GeminiPart[]
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
        text:
          'Ska denna bild användas som receptfoto (färdig maträtt på tallrik/skål, serverad mat, aptitretande matfoto)? ' +
          'Svara false om bilden visar: ingredienslista, recepttext, caption, råvaror utan tillagad rätt, steg-foto av enskild ingrediens, paket/etiketter, bara text/UI, eller nästan ingen mat. ' +
          'Svara JSON: {"hasFoodPhoto": true|false}',
      },
    ],
    'Svara endast JSON.',
    TEXT_MODELS_SIMPLE
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
  const parts: GeminiPart[] = [];
  if (imageBase64 && mimeType) {
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
  }
  const prompt = [
    text.trim() ? `Recepttext/beskrivning:\n${text.trim()}` : 'Extrahera recept från bilden.',
    imageBase64 && mimeType
      ? 'Bilden kan vara skärmdump från Instagram/TikTok eller matblogg. Leta efter @handle, kontonamn eller vattenstämpel i bilden och sätt som source (t.ex. @handle på Instagram). source = receptets skapare, inte den som skickat skärmdumpen.'
      : '',
    sourceUrl ? `Källa-URL: ${sourceUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  parts.push({ text: prompt });

  const raw = await geminiJson(apiKey, parts, PARSE_SYSTEM, TEXT_MODELS_PARSE);
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

function recipeImageContext(recipe: Recipe): { ingredients: string; steps: string } {
  const groups = (recipe.groups || []) as { name?: string; ingredients?: { name: string; amount?: number; unit?: string }[] }[];
  const ingredients = groups
    .map((g) => {
      const items = (g.ingredients || [])
        .map((i) => `${i.amount ?? ''} ${i.unit ?? ''} ${i.name}`.trim())
        .filter(Boolean);
      if (!items.length) return '';
      return g.name ? `${g.name}: ${items.join(', ')}` : items.join(', ');
    })
    .filter(Boolean)
    .join('\n');
  const steps = ((recipe.steps || []) as { title?: string; text?: string }[])
    .map((s, idx) => {
      const title = (s.title || '').trim() || `Steg ${idx + 1}`;
      const text = (s.text || '').trim();
      return text ? `${title}: ${text}` : title;
    })
    .filter(Boolean)
    .join('\n');
  return { ingredients, steps };
}

export async function generateFoodImage(apiKey: string, title: string, description: string): Promise<{ data: string; mimeType: string }> {
  return geminiImage(apiKey, [
    {
      text: `Professional appetizing food photography of "${title}". ${description}. Overhead or 3/4 angle, natural light, realistic, no people, restaurant quality. ${IMAGE_CLEANUP}`,
    },
  ]);
}

/** Ny hero-bild utifrån titel, ingredienser, instruktioner och ev. referensbild — lika vikt på alla fyra. */
export async function generateFoodImageFromRecipe(
  apiKey: string,
  recipe: Recipe,
  imageBase64?: string | null,
  mimeType?: string | null,
  extraInstructions?: string | null
): Promise<{ data: string; mimeType: string }> {
  const title = String(recipe.title || 'maträtt');
  const { ingredients, steps } = recipeImageContext(recipe);
  const parts: GeminiPart[] = [];

  if (imageBase64 && mimeType) {
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
  }

  const refLine = imageBase64
    ? 'An attached inspiration photo is provided — show the SAME dish but with clearly different composition: new camera angle, different plate/board/surface, new garnish placement, and fresh styling. Do NOT copy the reference framing, layout, or props.'
    : 'No reference photo — infer appearance from the recipe text below.';

  const extra = String(extraInstructions || '').trim();
  const extraBlock = extra
    ? `\n5. ADDITIONAL USER DIRECTION (append — do not ignore the recipe above):\n${extra}\n`
    : '';

  parts.push({
    text: `Create a completely new professional appetizing food photograph (not a retouch of an existing photo).

1. DISH NAME: "${title}"
2. REFERENCE IMAGE: ${refLine}
3. INGREDIENTS:
${ingredients || '(see dish name)'}
4. INSTRUCTIONS (plating, texture, finish):
${steps || '(see dish name)'}
${extraBlock}
Vary angle (overhead OR 3/4), natural light, realistic, no people, restaurant quality. ${IMAGE_CLEANUP}`,
  });

  return geminiImage(apiKey, parts);
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

type MacroTotals = { kcal: number; prot: number; carb: number; fat: number };

const ING_PREP_RE =
  'tärnad|tärnade|kuberad|kuberade|hackad|hackade|finhackad|finhackade|grovhackad|grovhackade|skivad|skivade|smashad|smashade|juliennad|juliennade|riven|rivna|persisk|persiska|färsk|färska';

/** Näringsvärden per 100 g (typiska svenska/handelsvärden). Speglar recept/app.js. */
const PER_100G: Array<{ re: RegExp; m: MacroTotals }> = [
  { re: /kycklingfärs|malet kyckling|ground chicken/i, m: { kcal: 115, prot: 21, carb: 0, fat: 5 } },
  { re: /nötfärs|malet nötkött|extra mager nöt/i, m: { kcal: 150, prot: 20, carb: 0, fat: 8 } },
  { re: /fläsk|malet fläsk|pork/i, m: { kcal: 200, prot: 17, carb: 0, fat: 15 } },
  { re: /kycklingbröst|kycklingfilé/i, m: { kcal: 110, prot: 23, carb: 0, fat: 1.5 } },
  { re: /räk|shrimp|prawn/i, m: { kcal: 85, prot: 18, carb: 1, fat: 1 } },
  { re: /lax|salmon/i, m: { kcal: 190, prot: 20, carb: 0, fat: 12 } },
  { re: /tonfisk|tuna/i, m: { kcal: 130, prot: 25, carb: 0, fat: 3 } },
  { re: /keso\s*0|cottage\s*(cheese)?\s*(fat[\s-]?free|nonfat)/i, m: { kcal: 70, prot: 12, carb: 3, fat: 0.5 } },
  { re: /keso\s*1[,.]?\s*5|cottage\s*(cheese)?\s*(low|reduced)/i, m: { kcal: 72, prot: 12, carb: 3, fat: 1.5 } },
  { re: /keso|cottage/i, m: { kcal: 98, prot: 11, carb: 3, fat: 4 } },
  { re: /grekisk yoghurt|naturell yoghurt/i, m: { kcal: 70, prot: 7, carb: 4, fat: 3 } },
  { re: /äggvita/i, m: { kcal: 50, prot: 11, carb: 1, fat: 0 } },
  { re: /ägg/i, m: { kcal: 140, prot: 12, carb: 1, fat: 10 } },
  { re: /vetemjöl|mjöl(?!k)/i, m: { kcal: 350, prot: 10, carb: 73, fat: 1 } },
  { re: /havremjöl|havre/i, m: { kcal: 370, prot: 13, carb: 60, fat: 7 } },
  { re: /kokt\s+.*\bris\b|\bris\b.*kokt|cooked\s+rice/i, m: { kcal: 130, prot: 2.5, carb: 28, fat: 0.3 } },
  { re: /ris(?!vin|papp)|jasminris|råris|basmati|klibbigt ris/i, m: { kcal: 350, prot: 7, carb: 78, fat: 1 } },
  { re: /wrapper|wonton|gyoza|dumpling.?skal|degark/i, m: { kcal: 300, prot: 8, carb: 60, fat: 1.5 } },
  { re: /rispapper/i, m: { kcal: 330, prot: 0, carb: 82, fat: 0 } },
  { re: /panko|ströbröd/i, m: { kcal: 380, prot: 12, carb: 72, fat: 3 } },
  { re: /parmesan|mozzarella|cheddar|ost\b/i, m: { kcal: 350, prot: 25, carb: 2, fat: 27 } },
  /* Stekspray = olja (svensk logik — aldrig 0 kcal / US-etikett) */
  { re: /stekspray|olivoljespray|cooking\s*spray|oil\s*spray|\bpam\b|matlagningsspray/i, m: { kcal: 884, prot: 0, carb: 0, fat: 100 } },
  { re: /sesamolja/i, m: { kcal: 884, prot: 0, carb: 0, fat: 100 } },
  { re: /olja|oil|smör|butter/i, m: { kcal: 884, prot: 0, carb: 0, fat: 100 } },
  { re: /sesamfrö/i, m: { kcal: 570, prot: 18, carb: 12, fat: 50 } },
  { re: /soja|soy sauce|thaisoja|coconut aminos/i, m: { kcal: 55, prot: 8, carb: 5, fat: 0 } },
  { re: /sriracha|chilisås|chili\s*sauce|hot\s*sauce/i, m: { kcal: 95, prot: 1, carb: 20, fat: 1 } },
  { re: /ketchup/i, m: { kcal: 100, prot: 1, carb: 25, fat: 0 } },
  { re: /mirin/i, m: { kcal: 230, prot: 0, carb: 45, fat: 0 } },
  { re: /honung|lönnsirap|maple/i, m: { kcal: 320, prot: 0, carb: 80, fat: 0 } },
  { re: /socker|farinsocker/i, m: { kcal: 400, prot: 0, carb: 100, fat: 0 } },
  { re: /risvinäger|vinäger|ättika/i, m: { kcal: 20, prot: 0, carb: 1, fat: 0 } },
  { re: /gochujang|miso/i, m: { kcal: 200, prot: 5, carb: 35, fat: 3 } },
  { re: /ostronsås/i, m: { kcal: 50, prot: 1, carb: 10, fat: 0 } },
  { re: /fisksås/i, m: { kcal: 35, prot: 5, carb: 4, fat: 0 } },
  { re: /vitlök/i, m: { kcal: 130, prot: 6, carb: 28, fat: 0 } },
  { re: /ingefära/i, m: { kcal: 80, prot: 2, carb: 18, fat: 1 } },
  { re: /vårlök|salladslök|scallion|green\s*onion/i, m: { kcal: 32, prot: 2, carb: 7, fat: 0 } },
  { re: /lök|rödlök|gul lök/i, m: { kcal: 40, prot: 1, carb: 9, fat: 0 } },
  { re: /gurka|cucumber/i, m: { kcal: 15, prot: 1, carb: 3, fat: 0 } },
  { re: /avokado|avocado/i, m: { kcal: 160, prot: 2, carb: 9, fat: 15 } },
  { re: /morot/i, m: { kcal: 40, prot: 1, carb: 9, fat: 0 } },
  { re: /paprika(?!pulver)/i, m: { kcal: 30, prot: 1, carb: 6, fat: 0 } },
  { re: /banan/i, m: { kcal: 90, prot: 1, carb: 23, fat: 0 } },
  { re: /kakao/i, m: { kcal: 230, prot: 20, carb: 10, fat: 14 } },
  { re: /choklad/i, m: { kcal: 540, prot: 6, carb: 50, fat: 35 } },
  { re: /pb2|jordnöts?pulver/i, m: { kcal: 375, prot: 40, carb: 30, fat: 10 } },

  { re: /proteinpulver|whey|kasein|casein|protein powder/i, m: { kcal: 380, prot: 80, carb: 5, fat: 3 } },
  { re: /helmjölk|whole milk/i, m: { kcal: 60, prot: 3.4, carb: 5, fat: 3.5 } },
  { re: /mellanmjölk/i, m: { kcal: 45, prot: 3.5, carb: 5, fat: 1.5 } },
  { re: /lättmjölk|skim milk/i, m: { kcal: 35, prot: 3.5, carb: 5, fat: 0.5 } },
  { re: /\bmjölk\b|milk/i, m: { kcal: 45, prot: 3.5, carb: 5, fat: 1.5 } },
  { re: /espresso|kaffe|coffee/i, m: { kcal: 2, prot: 0.1, carb: 0, fat: 0 } },
  { re: /spaghetti|pasta|nudlar|noodles|linguine|fettuccine/i, m: { kcal: 350, prot: 12, carb: 70, fat: 1.5 } },
  { re: /gnocchi/i, m: { kcal: 160, prot: 4, carb: 33, fat: 0.5 } },
  { re: /dumpling|gyoza|wonton(?!\s*skal)/i, m: { kcal: 220, prot: 8, carb: 30, fat: 8 } },
  { re: /brioche|hamburgerbröd|hoagie|bulle|bröd|wrap|tunnbröd|tortilla/i, m: { kcal: 280, prot: 9, carb: 50, fat: 5 } },
  { re: /majs(?!stärkelse)|corn/i, m: { kcal: 90, prot: 3, carb: 19, fat: 1 } },
  { re: /edamame/i, m: { kcal: 120, prot: 12, carb: 9, fat: 5 } },
  { re: /majonnäs|mayo/i, m: { kcal: 650, prot: 1, carb: 1, fat: 70 } },
  { re: /gräddfil|sour cream/i, m: { kcal: 180, prot: 3, carb: 4, fat: 18 } },
  { re: /labneh/i, m: { kcal: 150, prot: 8, carb: 4, fat: 10 } },
  { re: /tomat/i, m: { kcal: 18, prot: 1, carb: 4, fat: 0 } },
  { re: /jalapeño|chili(?!\s*(sauce|sås|crisp|crunch|olja|oil|flakes|flingor|pulver))/i, m: { kcal: 40, prot: 2, carb: 9, fat: 0 } },
  { re: /basilika|koriander|mynta|persilja|dill/i, m: { kcal: 40, prot: 3, carb: 6, fat: 0.5 } },
  { re: /vetegluten|gluten/i, m: { kcal: 370, prot: 75, carb: 14, fat: 2 } },
  { re: /jäst|yeast/i, m: { kcal: 325, prot: 40, carb: 35, fat: 5 } },
  { re: /näringsjäst/i, m: { kcal: 325, prot: 50, carb: 35, fat: 5 } },
  { re: /bakpulver|bikarbonat|baking/i, m: { kcal: 0, prot: 0, carb: 0, fat: 0 } },
  { re: /salt|peppar|msg|krydda|paprika|kummin|cayenne|oregano|kanel|gurkmeja|kardemumma|tajín|vitlökspulver|lökpulver/i, m: { kcal: 0, prot: 0, carb: 0, fat: 0 } },
  { re: /vatten|water|buljong|stock/i, m: { kcal: 5, prot: 0.5, carb: 0.5, fat: 0 } },
  { re: /sötningsmedel|stevia|monk fruit/i, m: { kcal: 0, prot: 0, carb: 0, fat: 0 } },
  { re: /pickles?\b/i, m: { kcal: 15, prot: 1, carb: 3, fat: 0 } },
  { re: /bacon/i, m: { kcal: 400, prot: 25, carb: 1, fat: 35 } },
  { re: /buffalosås|buffalo/i, m: { kcal: 20, prot: 0, carb: 2, fat: 1 } },
  { re: /pizzasås|tomatsås/i, m: { kcal: 30, prot: 1, carb: 6, fat: 0 } },
  { re: /ansjovis|anchovy/i, m: { kcal: 200, prot: 25, carb: 0, fat: 10 } },
  { re: /pecorino|parmesan/i, m: { kcal: 400, prot: 32, carb: 0, fat: 30 } },
  { re: /lime|citron|lemon/i, m: { kcal: 30, prot: 1, carb: 10, fat: 0 } },
  { re: /jordnöt|peanut/i, m: { kcal: 580, prot: 25, carb: 15, fat: 50 } },
  { re: /self[- ]?rising flour|självjäsande/i, m: { kcal: 350, prot: 10, carb: 73, fat: 1 } },

  { re: /nötter|jordnöt|cashew|mandel/i, m: { kcal: 600, prot: 20, carb: 15, fat: 50 } },
];

/** Styckvikter (g) när unit = st. */
const PIECE_G: Array<{ re: RegExp; g: number }> = [
  { re: /wrapper|wonton|gyoza|dumpling/i, g: 7 },
  { re: /brioche|hamburgerbröd|slider|hoagie|bulle|bröd|wrap|tunnbröd|tortilla/i, g: 60 },
  { re: /lime|citron|lemon/i, g: 60 },
  { re: /tomat/i, g: 100 },
  { re: /jalapeño/i, g: 15 },
  { re: /rödlök|gul lök|\blök\b/i, g: 80 },
  { re: /äggvita/i, g: 33 },
  { re: /ägg/i, g: 55 },
  { re: /avokado|avocado/i, g: 170 },
  { re: /gurka|cucumber/i, g: 280 },
  { re: /vårlök|salladslök|scallion/i, g: 10 },
  { re: /vitlöksklyfta|vitlök/i, g: 3 },
  { re: /banan/i, g: 120 },
  { re: /rispapper/i, g: 10 },
];

/** Ungefärlig vikt per näve. */
const NAVE_G: Array<{ re: RegExp; g: number }> = [
  { re: /sesamfrö/i, g: 12 },
  { re: /vårlök|salladslök|scallion|green\s*onion/i, g: 20 },
  { re: /koriander|persilja|basilika|mynta|ört/i, g: 15 },
  { re: /grönkål|spenat|ruccola|blad/i, g: 30 },
];

function emptyMacros(): MacroTotals {
  return { kcal: 0, prot: 0, carb: 0, fat: 0 };
}

function addMacros(a: MacroTotals, b: MacroTotals, factor = 1): MacroTotals {
  return {
    kcal: a.kcal + b.kcal * factor,
    prot: a.prot + b.prot * factor,
    carb: a.carb + b.carb * factor,
    fat: a.fat + b.fat * factor,
  };
}

function roundMacros(m: MacroTotals): MacroTotals {
  return {
    kcal: Math.max(0, Math.round(m.kcal)),
    prot: Math.max(0, Math.round(m.prot)),
    carb: Math.max(0, Math.round(m.carb)),
    fat: Math.max(0, Math.round(m.fat)),
  };
}

function isCookingSprayName(name: string): boolean {
  return /stekspray|olivoljespray|cooking\s*spray|oil\s*spray|\bpam\b|matlagningsspray/i.test(name);
}

function isOilLikeName(name: string): boolean {
  return isCookingSprayName(name) || /olja|oil|smör|butter/i.test(name);
}

/** Strip prep/varianter så «lax, kuberad» / «hackad salladslök (…)» matchar baslivsmedel. */
function normalizeNameForMacros(name: string): string {
  let n = String(name || '').toLowerCase().trim();
  n = n
    .replace(/\b(lätt|light|low[\s-]?cal(?:orie)?)\s*ketchup\b/gi, 'ketchup')
    .replace(/\bketchup\s+med\s+lågt\s+kaloriinnehåll\b/gi, 'ketchup')
    .replace(/\bketchup\s*\([^)]*kalor[^)]*\)/gi, 'ketchup')
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(new RegExp(`,\\s*(?:${ING_PREP_RE})(?:\\s+(?:och|och\\s+)?[\\wåäö-]*)*$`, 'i'), '')
    .replace(new RegExp(`^(?:${ING_PREP_RE})\\s+`, 'i'), '')
    .replace(/\bpersisk(?:a)?\s+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return n;
}

function lookupPer100g(name: string): MacroTotals | null {
  const n = normalizeNameForMacros(name);
  for (const row of PER_100G) {
    if (row.re.test(n) || row.re.test(name)) return row.m;
  }
  return null;
}

function lookupPieceG(name: string): number | null {
  const n = normalizeNameForMacros(name);
  for (const row of PIECE_G) {
    if (row.re.test(n) || row.re.test(name)) return row.g;
  }
  return null;
}

function lookupNaveG(name: string): number | null {
  const n = normalizeNameForMacros(name);
  for (const row of NAVE_G) {
    if (row.re.test(n) || row.re.test(name)) return row.g;
  }
  return null;
}

function amountToGrams(amount: number, unit: string, name: string): number | null {
  const u = String(unit || '').toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (u === 'g') return amount;
  if (u === 'msk') {
    if (isOilLikeName(name)) return amount * 14;
    return amount * 15;
  }
  if (u === 'tsk') {
    if (isOilLikeName(name)) return amount * 4.5;
    return amount * 5;
  }
  if (u === 'st') {
    if (isCookingSprayName(name)) return amount * 1.5;
    const piece = lookupPieceG(name);
    if (piece != null) return amount * piece;
    return null;
  }
  if (u === 'pinch') {
    if (isCookingSprayName(name)) return amount * 1.5;
    if (/salt|peppar|pepper|\bmsg\b/i.test(name)) return 0;
    if (lookupPer100g(name)) return amount * 1;
    return 0;
  }
  if (u === 'näve') {
    if (isCookingSprayName(name)) return amount * 1.5;
    const nave = lookupNaveG(name);
    if (nave != null) return amount * nave;
    if (lookupPer100g(name)) return amount * 20;
    return 0;
  }
  if (u === 'strimlor') return 0;
  return null;
}

/** Deterministisk makrosumma från ingredienslistan — används som primär källa. */
export function estimateMacrosFromIngredients(recipe: Recipe): MacroTotals | null {
  const groups = (recipe.groups || []) as {
    ingredients?: { name?: string; amount?: number; unit?: string }[];
  }[];
  let total = emptyMacros();
  let counted = 0;
  let eligible = 0;
  let countedGrams = 0;
  let eligibleGrams = 0;
  const unknown: string[] = [];

  for (const g of groups) {
    for (const ing of g.ingredients || []) {
      const name = String(ing.name || '').trim();
      if (!name) continue;
      const amount = typeof ing.amount === 'number' ? ing.amount : Number(ing.amount);
      const grams = amountToGrams(amount, String(ing.unit || ''), name);
      if (grams == null) {
        // unknown unit/amount — skip eligibility
        continue;
      }
      if (grams <= 0) continue;
      eligible += 1;
      eligibleGrams += grams;
      const per100 = lookupPer100g(name);
      if (!per100) {
        unknown.push(name);
        continue;
      }
      total = addMacros(total, per100, grams / 100);
      counted += 1;
      countedGrams += grams;
    }
  }

  if (!counted) return null;
  // För låg täckning → behåll befintliga makros (undvik systematisk undercounting)
  const countCoverage = counted / eligible;
  const gramCoverage = eligibleGrams > 0 ? countedGrams / eligibleGrams : 0;
  if (countCoverage < 0.6 || gramCoverage < 0.55) {
    return null;
  }
  return roundMacros(total);
}

const MACRO_SYSTEM = `Du är nutritionist. Beräkna makron för HELA receptet/satsen (summan av alla ingredienser — INTE per portion).
Returnera ENDAST JSON: {"kcal":number,"prot":number,"carb":number,"fat":number}
- Avrunda till heltal; prot/carb/fat i gram
- 1 msk matolja ≈ 14 g fett / ~120 kcal — räkna ALDRIG olja som mer än det
- 400 g kycklingfärs (mager) ≈ 20 g fett / ~85 g protein / ~460 kcal
- Summera rad för rad; hitta inte på extra fett`;

export async function estimateRecipeMacros(
  apiKey: string,
  recipe: Recipe
): Promise<MacroTotals> {
  const local = estimateMacrosFromIngredients(recipe);
  if (local) return local;

  // Fallback till AI endast om lokala tabellen inte täcker ingredienserna
  const title = String(recipe.title || 'recept');
  const servings = typeof recipe.baseServings === 'number' ? recipe.baseServings : 1;
  const { ingredients } = recipeImageContext(recipe);
  if (!ingredients.trim()) {
    throw new Error('Inga ingredienser att räkna makron från');
  }

  const raw = await geminiJson(
    apiKey,
    [
      {
        text: `Recept: ${title}
baseServings: ${servings} (makron = HELA satsen)

Ingredienser:
${ingredients}

Räkna rad för rad. 2 msk olja ≈ 28 g fett. 400 g mager kycklingfärs ≈ 20 g fett.`,
      },
    ],
    MACRO_SYSTEM,
    TEXT_MODELS_SIMPLE
  );

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const macros = roundMacros({
    kcal: Number(parsed.kcal) || 0,
    prot: Number(parsed.prot) || 0,
    carb: Number(parsed.carb) || 0,
    fat: Number(parsed.fat) || 0,
  });
  if (!macros.kcal && !macros.prot && !macros.carb && !macros.fat) {
    throw new Error('Kunde inte beräkna makron');
  }
  return macros;
}
