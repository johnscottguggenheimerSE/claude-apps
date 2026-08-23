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
- **Engelska skafferitermer** — hitta inte på svenska kalques för ord som svenskar säger på engelska:
  - chocolate chips → **«chocolate chips»** (aldrig «chokladchips» / «choklad chips»)
  - PB2 → **«pb2»** (produktnamn; gärna «pb2 (pulver)» om källan menar pulver)
  - monk fruit → **«monk fruit»** (aldrig «munkfrukt»)
- Översätt instruktioner till flytande svenska men behåll varumärken, lägesnamn och etablerade lånord (gochujang, teriyaki, espresso, Creami).
- Ingrediensnamn: lowercase, svenska vardagsord (cottage cheese → keso, scallion → salladslök, cornstarch → majsstärkelse) — utom listan ovan. Prep före namn när det går («tärnad gurka»).

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

const MERGE_SYSTEM = `${PARSE_SYSTEM}

MERGE-LÄGE (gäller alltid här):
- Du får ett **befintligt recept** (JSON) plus tillägg (text och/eller bild: caption, anteckningar, fler ingredienser/steg, skärmdump).
- Returnera ett **uppdaterat** recept som **slår ihop** tilläggen med det befintliga — ersätt **inte** receptet wholesale.
- **Behåll** id, title, source, sourceUrl, image, category och övrigt befintligt innehåll om tillägget inte tydligt ersätter dem.
- Nya ingredienser: lägg i befintliga groups när det passar, annars skapa nya groups. Ta inte bort ingredienser som fortfarande gäller.
- Nya steg: integrera/lägg till utan att radera steg som fortfarande gäller. Om tillägget förtydligar ett steg, uppdatera det steget.
- tips: fortfarande exakt 4; uppdatera vid behov (första title "För barn").
- badges: uppdatera portioner/tid om tillägget ändrar det.
- Räkna om macros för **hela** det sammanslagna receptet.
- Samma språk-, mått- och fältregler som ovan.`;

/** Merge additions into an existing recipe without wholesale replacement. */
export async function mergeRecipe(
  apiKey: string,
  existing: Recipe,
  text: string,
  imageBase64: string | null,
  mimeType: string | null
): Promise<Recipe> {
  const parts: GeminiPart[] = [];
  if (imageBase64 && mimeType) {
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
  }
  const prompt = [
    `Befintligt recept (JSON) — behåll struktur och innehåll, slå bara ihop tilläggen:\n${JSON.stringify(existing)}`,
    text.trim()
      ? `Tillägg att slå ihop med receptet:\n${text.trim()}`
      : 'Extrahera tillägg från bilden och slå ihop med receptet ovan.',
    imageBase64 && mimeType
      ? 'Bilden kan vara skärmdump/caption med extra info — extrahera bara det som ska läggas till eller korrigeras.'
      : '',
    'Returnera det uppdaterade receptet som JSON. Behåll id, title, source, sourceUrl och image från det befintliga receptet om tillägget inte tydligt ersätter dem.',
  ]
    .filter(Boolean)
    .join('\n\n');
  parts.push({ text: prompt });

  const raw = await geminiJson(apiKey, parts, MERGE_SYSTEM, TEXT_MODELS_PARSE);
  const recipe = normalizeRecipe(JSON.parse(raw) as Recipe);

  // Hard-preserve identity / media unless AI returned clear replacements
  if (existing.id) recipe.id = existing.id;
  if ((!recipe.title || !String(recipe.title).trim()) && existing.title) {
    recipe.title = existing.title;
  }
  if ((!recipe.source || recipe.source === 'Okänd källa') && existing.source) {
    recipe.source = existing.source;
  }
  if (!recipe.sourceUrl && existing.sourceUrl) recipe.sourceUrl = existing.sourceUrl;
  if (recipe.sourceUrl && isSocialMediaUrl(String(recipe.sourceUrl))) {
    recipe.sourceUrl = '';
  }
  if (!recipe.image && existing.image) recipe.image = existing.image;
  if (!recipe.category && existing.category) recipe.category = existing.category;
  if (
    (!Array.isArray(recipe.badges) || !(recipe.badges as unknown[]).length) &&
    Array.isArray(existing.badges)
  ) {
    recipe.badges = existing.badges;
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
  'tärnad|tärnade|kuberad|kuberade|hackad|hackade|finhackad|finhackade|grovhackad|grovhackade|skivad|skivade|smashad|smashade|juliennad|juliennade|riven|rivna|persisk|persiska|färsk|färska|benfri|benfria|boneless|skinless';

/** Näringsvärden per 100 g (ätlig del, Livsmedelsverket/USDA-ordning). Speglar recept/app.js. Specifika före generiska. */
const PER_100G: Array<{ re: RegExp; m: MacroTotals }> = [
  { re: /kycklingfärs|malet kyckling(?!bröst|filé)|ground chicken(?!\s*breast)/i, m: { kcal: 143, prot: 17.4, carb: 0, fat: 8.1 } },
  { re: /kycklingving|chicken\s*wing|\bwings?\b/i, m: { kcal: 191, prot: 17.5, carb: 0, fat: 12.8 } },
  { re: /kycklinglår|lårfilé|benfria?\s*lår|kycklingben|drumstick|chicken\s*thigh|\bthighs?\b/i, m: { kcal: 161, prot: 19.7, carb: 0, fat: 9 } },
  { re: /kycklingbröst|kycklingfilé|chicken\s*breast/i, m: { kcal: 107, prot: 23.1, carb: 0, fat: 1.2 } },
  { re: /hel\s*kyckling|whole\s*chicken/i, m: { kcal: 178, prot: 19.5, carb: 0, fat: 11.1 } },
  { re: /kycklinglever|chicken\s*liver/i, m: { kcal: 119, prot: 16.9, carb: 0.7, fat: 4.8 } },
  { re: /kyckling|chicken/i, m: { kcal: 120, prot: 21, carb: 0, fat: 3.5 } },
  { re: /kalkonfärs|malet kalkon|ground turkey/i, m: { kcal: 148, prot: 20, carb: 0, fat: 7.5 } },
  { re: /kalkonbröst|turkey\s*breast/i, m: { kcal: 104, prot: 23.5, carb: 0, fat: 0.7 } },
  { re: /kalkon|turkey/i, m: { kcal: 111, prot: 22, carb: 0, fat: 2 } },
  { re: /extra\s*mager\s*nöt|nötfärs\s*(5|≤\s*5)|lean\s*ground\s*beef/i, m: { kcal: 137, prot: 20.5, carb: 0, fat: 5.5 } },
  { re: /nötfärs|malet nötkött|ground\s*beef/i, m: { kcal: 215, prot: 18.5, carb: 0, fat: 15 } },
  { re: /oxfilé|innerfilé|fil[eé]\s*de\s*boeuf|tenderloin/i, m: { kcal: 137, prot: 21.5, carb: 0, fat: 5.5 } },
  { re: /ryggbiff|entrecôte|biff|higherib|sirloin|ribeye/i, m: { kcal: 180, prot: 21, carb: 0, fat: 10.5 } },
  { re: /högrev|bringa|brisket|chuck/i, m: { kcal: 210, prot: 19, carb: 0, fat: 15 } },
  { re: /nötkött|beef/i, m: { kcal: 170, prot: 22, carb: 0, fat: 8.5 } },
  { re: /bacon/i, m: { kcal: 393, prot: 13.7, carb: 0.7, fat: 37 } },
  { re: /pancetta|guanciale/i, m: { kcal: 450, prot: 12, carb: 0.5, fat: 45 } },
  { re: /skinka|ham(?!\s*burger)/i, m: { kcal: 120, prot: 19, carb: 1.5, fat: 4.5 } },
  { re: /fläskfilé|pork\s*tenderloin|pork\s*fillet/i, m: { kcal: 116, prot: 21.5, carb: 0, fat: 3.2 } },
  { re: /fläskfärs|malet fläsk|ground\s*pork/i, m: { kcal: 242, prot: 16.5, carb: 0, fat: 19 } },
  { re: /karr[eé]|kotlett|fläskkarr|pork\s*chop|pork\s*shoulder/i, m: { kcal: 196, prot: 19, carb: 0, fat: 13 } },
  { re: /revbensspjäll|spare\s*ribs|pork\s*ribs/i, m: { kcal: 277, prot: 16, carb: 0, fat: 23 } },
  { re: /fläsk|pork/i, m: { kcal: 200, prot: 18, carb: 0, fat: 14 } },
  { re: /lammfärs|ground\s*lamb/i, m: { kcal: 230, prot: 17, carb: 0, fat: 18 } },
  { re: /lamm|lamb/i, m: { kcal: 200, prot: 19, carb: 0, fat: 14 } },
  { re: /anka|duck/i, m: { kcal: 220, prot: 18, carb: 0, fat: 16 } },
  { re: /korv|sausage|chorizo|salami|pepperoni/i, m: { kcal: 300, prot: 14, carb: 2, fat: 26 } },
  { re: /köttbull/i, m: { kcal: 230, prot: 14, carb: 8, fat: 16 } },
  { re: /rökt\s*lax|smoked\s*salmon|gravad\s*lax/i, m: { kcal: 170, prot: 22, carb: 0, fat: 9 } },
  { re: /lax|salmon/i, m: { kcal: 179, prot: 19.9, carb: 0, fat: 10.9 } },
  { re: /makrill|mackerel/i, m: { kcal: 205, prot: 19, carb: 0, fat: 14 } },
  { re: /sill|strömming|herring/i, m: { kcal: 160, prot: 18, carb: 0, fat: 10 } },
  { re: /torsk|sej|kolja|hoki|vitfisk|cod|haddock|white\s*fish/i, m: { kcal: 82, prot: 18.1, carb: 0, fat: 0.7 } },
  { re: /tonfisk.*olja|tuna.*oil|ventresca/i, m: { kcal: 198, prot: 25, carb: 0, fat: 10.5 } },
  { re: /tonfisk|tuna/i, m: { kcal: 116, prot: 25.5, carb: 0, fat: 1 } },
  { re: /ansjovis|anchovy/i, m: { kcal: 210, prot: 29, carb: 0, fat: 10 } },
  { re: /räk|shrimp|prawn/i, m: { kcal: 85, prot: 18.1, carb: 0.9, fat: 0.9 } },
  { re: /krabba|kräft|lobster|crab|crayfish/i, m: { kcal: 90, prot: 18, carb: 1, fat: 1.2 } },
  { re: /mussla|blåmussla|scallop|kamussla|mussel|oyster|ostron(?!sås)/i, m: { kcal: 86, prot: 12, carb: 3.7, fat: 2.2 } },
  { re: /fisk|fish/i, m: { kcal: 110, prot: 20, carb: 0, fat: 3 } },
  { re: /äggvita|egg\s*white/i, m: { kcal: 52, prot: 10.9, carb: 0.7, fat: 0.2 } },
  { re: /äggula|egg\s*yolk/i, m: { kcal: 322, prot: 15.9, carb: 3.6, fat: 26.5 } },
  /* Undvik \\b före ä — JS word-boundary är ASCII-only */
  { re: /ägg(?!ula|vita)|(?<![a-z])eggs?(?![a-z])/i, m: { kcal: 143, prot: 12.6, carb: 0.7, fat: 9.5 } },
  { re: /tofu/i, m: { kcal: 120, prot: 12, carb: 1.9, fat: 7.2 } },
  { re: /tempeh/i, m: { kcal: 193, prot: 19, carb: 9.4, fat: 10.8 } },
  { re: /edamame/i, m: { kcal: 121, prot: 11.9, carb: 8.9, fat: 5.2 } },
  { re: /kikärt|chickpea|garbanzo/i, m: { kcal: 164, prot: 8.9, carb: 27.4, fat: 2.6 } },
  { re: /linser|lentil/i, m: { kcal: 116, prot: 9, carb: 20.1, fat: 0.4 } },
  { re: /svarta?\s*bönor|kidney|vita\s*bönor|böna|beans?/i, m: { kcal: 127, prot: 8.7, carb: 22.8, fat: 0.5 } },
  { re: /ärt|peas?|gröna\s*ärtor/i, m: { kcal: 81, prot: 5.4, carb: 14.5, fat: 0.4 } },
  { re: /hummus|houmous/i, m: { kcal: 166, prot: 7.9, carb: 14.3, fat: 9.6 } },
  { re: /quorn|vego(?:färs|kött)|plant[- ]?based\s*mince/i, m: { kcal: 95, prot: 14.5, carb: 4.5, fat: 2 } },
  { re: /keso\s*0|cottage\s*(cheese)?\s*(fat[\s-]?free|nonfat|0)/i, m: { kcal: 72, prot: 12.5, carb: 3.4, fat: 0.4 } },
  { re: /keso\s*1[,.]?\s*5|cottage\s*(cheese)?\s*(low|reduced|1[,.]5)/i, m: { kcal: 80, prot: 12, carb: 3.3, fat: 1.5 } },
  { re: /keso\s*4|keso|cottage/i, m: { kcal: 98, prot: 11.1, carb: 3.4, fat: 4 } },
  { re: /kvarg\s*0|skyr\s*0|fat[\s-]?free\s*quark/i, m: { kcal: 60, prot: 12, carb: 3.5, fat: 0.2 } },
  { re: /kvarg|skyr|quark/i, m: { kcal: 70, prot: 12, carb: 3.5, fat: 0.5 } },
  { re: /grekisk\s*yoghurt\s*0|naturell\s*grekisk\s*yoghurt\s*0|nonfat\s*greek|0%\s*greek|tjock\s*grekisk\s*yoghurt\s*0/i, m: { kcal: 54, prot: 10, carb: 3.8, fat: 0.2 } },
  { re: /grekisk\s*yoghurt|tjock\s*grekisk|naturell\s*yoghurt|greek\s*yoghurt|greek\s*yogurt/i, m: { kcal: 97, prot: 9, carb: 3.6, fat: 5 } },
  { re: /yoghurt\s*0|yogurt\s*0|lätt\s*yoghurt/i, m: { kcal: 40, prot: 4, carb: 5.5, fat: 0.2 } },
  { re: /yoghurt|yogurt/i, m: { kcal: 62, prot: 4.5, carb: 6, fat: 2.2 } },
  { re: /labneh/i, m: { kcal: 150, prot: 8, carb: 4, fat: 10 } },
  { re: /vispgrädde|visp\s*grädde|whipping\s*cream/i, m: { kcal: 373, prot: 2, carb: 2.8, fat: 40 } },
  { re: /matlagningsgrädde|matgrädde|cooking\s*cream/i, m: { kcal: 190, prot: 2.5, carb: 3.5, fat: 18 } },
  { re: /grädde|cream(?!\s*cheese)/i, m: { kcal: 292, prot: 2.2, carb: 3, fat: 30 } },
  { re: /gräddfil|sour\s*cream/i, m: { kcal: 193, prot: 2.8, carb: 3.5, fat: 19 } },
  { re: /cr[eè]me\s*fra[iî]che|creme\s*fraiche/i, m: { kcal: 292, prot: 2.4, carb: 2.5, fat: 30 } },
  { re: /philadelphia|cream\s*cheese|färskost/i, m: { kcal: 250, prot: 5.5, carb: 3.5, fat: 24 } },
  { re: /ricotta/i, m: { kcal: 140, prot: 8, carb: 4, fat: 10 } },
  { re: /helmjölk|whole\s*milk/i, m: { kcal: 60, prot: 3.4, carb: 4.8, fat: 3.5 } },
  { re: /mellanmjölk/i, m: { kcal: 47, prot: 3.5, carb: 4.9, fat: 1.5 } },
  { re: /lättmjölk|skim\s*milk/i, m: { kcal: 36, prot: 3.5, carb: 4.9, fat: 0.5 } },
  { re: /minimjölk/i, m: { kcal: 32, prot: 3.4, carb: 4.8, fat: 0.1 } },
  { re: /kokosmjölk|coconut\s*milk/i, m: { kcal: 180, prot: 1.8, carb: 3, fat: 18 } },
  { re: /havremjölk|oat\s*milk/i, m: { kcal: 46, prot: 1, carb: 6.7, fat: 1.5 } },
  { re: /mandelmjölk|almond\s*milk/i, m: { kcal: 22, prot: 0.6, carb: 0.8, fat: 1.8 } },
  { re: /sojamjölk|soy\s*milk/i, m: { kcal: 40, prot: 3.3, carb: 2.5, fat: 1.8 } },
  { re: /\bmjölk\b|milk/i, m: { kcal: 47, prot: 3.5, carb: 4.9, fat: 1.5 } },
  { re: /pecorino|parmesan|parmigiano/i, m: { kcal: 392, prot: 33, carb: 0, fat: 28 } },
  { re: /lättost|light\s*cheese|50%\s*(cheddar|swiss|leerdamer)/i, m: { kcal: 220, prot: 28, carb: 1, fat: 12 } },
  { re: /mozzarella/i, m: { kcal: 280, prot: 18, carb: 2.2, fat: 22 } },
  { re: /feta/i, m: { kcal: 264, prot: 14, carb: 4.1, fat: 21 } },
  { re: /halloumi/i, m: { kcal: 321, prot: 21, carb: 2, fat: 25 } },
  { re: /cheddar/i, m: { kcal: 403, prot: 25, carb: 1.3, fat: 33 } },
  { re: /cotija|swiss|leerdamer|emmentaler|grevé|herrgård|präst/i, m: { kcal: 360, prot: 27, carb: 1.5, fat: 28 } },
  { re: /blåmögel|gorgonzola|roquefort|blue\s*cheese/i, m: { kcal: 353, prot: 21, carb: 2.3, fat: 29 } },
  { re: /ost\b|cheese/i, m: { kcal: 350, prot: 25, carb: 1.5, fat: 28 } },
  { re: /kokt\s+.*\bris\b|\bris\b.*kokt|cooked\s+rice/i, m: { kcal: 130, prot: 2.7, carb: 28.2, fat: 0.3 } },
  { re: /\bris\b|jasminris|råris|basmati|klibbigt\s*ris|okokat.*ris/i, m: { kcal: 356, prot: 6.7, carb: 79, fat: 0.6 } },
  { re: /kokt\s+.*pasta|pasta.*kokt|cooked\s+(pasta|noodle)/i, m: { kcal: 131, prot: 5, carb: 25, fat: 1.1 } },
  { re: /risnudlar|rice\s*noodle/i, m: { kcal: 364, prot: 3.5, carb: 84, fat: 0.5 } },
  { re: /egg\s*noodle|ägg\s*nudlar|udon|soba/i, m: { kcal: 350, prot: 12, carb: 70, fat: 2 } },
  { re: /spaghetti|pasta|nudlar|noodles|linguine|fettuccine|penne|fusilli|rigatoni/i, m: { kcal: 359, prot: 12.5, carb: 72, fat: 1.5 } },
  { re: /gnocchi/i, m: { kcal: 133, prot: 3.5, carb: 27, fat: 0.5 } },
  { re: /couscous/i, m: { kcal: 376, prot: 12.8, carb: 77, fat: 0.6 } },
  { re: /quinoa/i, m: { kcal: 368, prot: 14.1, carb: 64, fat: 6.1 } },
  { re: /bulgur/i, m: { kcal: 342, prot: 12.3, carb: 76, fat: 1.3 } },
  { re: /kokt\s+.*potatis|potatis.*kokt|cooked\s+potato/i, m: { kcal: 87, prot: 1.9, carb: 20.1, fat: 0.1 } },
  { re: /sötpotatis|sweet\s*potato/i, m: { kcal: 86, prot: 1.6, carb: 20.1, fat: 0.1 } },
  { re: /potatis|potato/i, m: { kcal: 77, prot: 2, carb: 17.5, fat: 0.1 } },
  { re: /wrapper|wonton|gyoza|dumpling.?skal|degark|gyozaskal|wontonskal/i, m: { kcal: 300, prot: 8, carb: 60, fat: 1.5 } },
  { re: /rispapper/i, m: { kcal: 333, prot: 0.5, carb: 82, fat: 0 } },
  { re: /dumpling|gyoza|wonton(?!\s*skal)/i, m: { kcal: 220, prot: 8, carb: 30, fat: 8 } },
  { re: /panko|ströbröd|brödsmul/i, m: { kcal: 395, prot: 13.4, carb: 72, fat: 5.3 } },
  { re: /brioche/i, m: { kcal: 345, prot: 9, carb: 50, fat: 12 } },
  { re: /hamburgerbröd|slider|hoagie|bulle|ciabatta|baguette|bröd|wrap|tunnbröd|tortilla|libanesisk/i, m: { kcal: 270, prot: 9, carb: 50, fat: 4 } },
  { re: /rågmjöl|rye\s*flour/i, m: { kcal: 335, prot: 9, carb: 70, fat: 1.5 } },
  { re: /grahamsmjöl|fullkornsmjöl|whole\s*wheat\s*flour/i, m: { kcal: 340, prot: 13, carb: 64, fat: 2.5 } },
  { re: /vetemjöl|self[- ]?rising|självjäsande|mjöl(?!k)/i, m: { kcal: 348, prot: 10.5, carb: 73, fat: 1 } },
  { re: /havremjöl|havregryn|havre|oat(?:meal|s)?/i, m: { kcal: 370, prot: 13.2, carb: 58.7, fat: 7 } },
  { re: /majsstärkelse|potato\s*starch|corn\s*starch|stärkelse|potatismjöl/i, m: { kcal: 357, prot: 0.3, carb: 88, fat: 0.1 } },
  { re: /majs(?!stärkelse)|corn|majskärn/i, m: { kcal: 96, prot: 3.4, carb: 19, fat: 1.5 } },
  { re: /stekspray|olivoljespray|cooking\s*spray|oil\s*spray|\bpam\b|matlagningsspray/i, m: { kcal: 884, prot: 0, carb: 0, fat: 100 } },
  { re: /lätt\s*smör|light\s*butter/i, m: { kcal: 380, prot: 0.5, carb: 0.5, fat: 42 } },
  { re: /smör|butter(?!\s*milk)/i, m: { kcal: 717, prot: 0.9, carb: 0.1, fat: 81 } },
  { re: /ghee|klarat\s*smör/i, m: { kcal: 876, prot: 0.2, carb: 0, fat: 99 } },
  { re: /sesamolja|sesame\s*oil/i, m: { kcal: 884, prot: 0, carb: 0, fat: 100 } },
  { re: /olivolja|olive\s*oil/i, m: { kcal: 884, prot: 0, carb: 0, fat: 100 } },
  { re: /kokosolja|coconut\s*oil/i, m: { kcal: 862, prot: 0, carb: 0, fat: 100 } },
  { re: /avokadoolja|rapsolja|matolja|olja|oil/i, m: { kcal: 884, prot: 0, carb: 0, fat: 100 } },
  { re: /sesamfrö|sesame\s*seed/i, m: { kcal: 573, prot: 17.7, carb: 23.4, fat: 49.7 } },
  { re: /chia|linfrö|flax/i, m: { kcal: 486, prot: 18, carb: 30, fat: 34 } },
  { re: /vallmofrö|poppy\s*seed/i, m: { kcal: 525, prot: 18, carb: 28, fat: 42 } },
  { re: /jordnötssmör|peanut\s*butter|nötbutter|mandelsmör|almond\s*butter/i, m: { kcal: 588, prot: 25, carb: 20, fat: 50 } },
  { re: /tahini|sesampasta/i, m: { kcal: 595, prot: 17, carb: 21, fat: 54 } },
  { re: /pb2|jordnöts?pulver|peanut\s*powder/i, m: { kcal: 375, prot: 40, carb: 30, fat: 10 } },
  { re: /cashew/i, m: { kcal: 553, prot: 18, carb: 30, fat: 44 } },
  { re: /mandel|almond/i, m: { kcal: 579, prot: 21, carb: 22, fat: 50 } },
  { re: /valnöt|walnut/i, m: { kcal: 654, prot: 15, carb: 14, fat: 65 } },
  { re: /pecan/i, m: { kcal: 691, prot: 9, carb: 14, fat: 72 } },
  { re: /jordnöt|peanut/i, m: { kcal: 567, prot: 26, carb: 16, fat: 49 } },
  { re: /nötter|nuts?/i, m: { kcal: 600, prot: 18, carb: 18, fat: 52 } },
  { re: /soja|soy\s*sauce|thaisoja|tamari|coconut\s*aminos|mörk\s*soja/i, m: { kcal: 53, prot: 8, carb: 4.9, fat: 0 } },
  { re: /chili\s*(crisp|crunch|olja|oil)|chiliolja/i, m: { kcal: 450, prot: 1, carb: 5, fat: 48 } },
  { re: /sriracha|chilisås|chili\s*sauce|hot\s*sauce/i, m: { kcal: 93, prot: 1.8, carb: 19, fat: 1 } },
  { re: /ketchup/i, m: { kcal: 101, prot: 1, carb: 25, fat: 0.1 } },
  { re: /lätt\s*majonnäs|light\s*mayo/i, m: { kcal: 270, prot: 0.8, carb: 8, fat: 26 } },
  { re: /majonnäs|mayo/i, m: { kcal: 680, prot: 1.1, carb: 0.6, fat: 75 } },
  { re: /ranch|blåmögelostdressing|blue\s*cheese\s*dressing/i, m: { kcal: 430, prot: 1.5, carb: 5, fat: 45 } },
  { re: /mirin/i, m: { kcal: 230, prot: 0.1, carb: 45, fat: 0 } },
  { re: /teriyaki/i, m: { kcal: 89, prot: 5.9, carb: 15.6, fat: 0 } },
  { re: /worcester|worcestershire/i, m: { kcal: 78, prot: 0, carb: 19, fat: 0 } },
  { re: /honung|honey/i, m: { kcal: 304, prot: 0.3, carb: 82, fat: 0 } },
  { re: /lönnsirap|maple/i, m: { kcal: 260, prot: 0, carb: 67, fat: 0 } },
  { re: /farinsocker|strösocker|socker|sugar/i, m: { kcal: 400, prot: 0, carb: 100, fat: 0 } },
  { re: /risvinäger|vinäger|ättika|balsamico|ättik|chinkiang|ume[- ]?pickle|umeboshi/i, m: { kcal: 18, prot: 0, carb: 0.5, fat: 0 } },
  { re: /gochujang|miso/i, m: { kcal: 200, prot: 5, carb: 35, fat: 3 } },
  { re: /ostronsås|oyster\s*sauce/i, m: { kcal: 51, prot: 1.4, carb: 11, fat: 0.2 } },
  { re: /fisksås|fish\s*sauce/i, m: { kcal: 35, prot: 5.1, carb: 3.6, fat: 0 } },
  { re: /buffalosås|buffalo/i, m: { kcal: 22, prot: 0.5, carb: 1.5, fat: 1.5 } },
  { re: /pizzasås|tomatsås|passata|krossade?\s*tomater|tomato\s*(sauce|paste|pur[eé]e)/i, m: { kcal: 30, prot: 1.3, carb: 5.5, fat: 0.2 } },
  { re: /bbq|barbecuesås/i, m: { kcal: 150, prot: 0.8, carb: 35, fat: 0.5 } },
  { re: /senap|mustard/i, m: { kcal: 66, prot: 4.4, carb: 5.3, fat: 3.3 } },
  { re: /pesto/i, m: { kcal: 420, prot: 5, carb: 6, fat: 42 } },
  { re: /harissa/i, m: { kcal: 120, prot: 2, carb: 10, fat: 8 } },
  { re: /vitlök|garlic/i, m: { kcal: 149, prot: 6.4, carb: 33, fat: 0.5 } },
  { re: /ingefära|ginger/i, m: { kcal: 80, prot: 1.8, carb: 18, fat: 0.8 } },
  { re: /vårlök|salladslök|scallion|green\s*onion|spring\s*onion/i, m: { kcal: 32, prot: 1.8, carb: 7.3, fat: 0.2 } },
  { re: /schälotten|shallot/i, m: { kcal: 72, prot: 2.5, carb: 17, fat: 0.1 } },
  { re: /lök|rödlök|gul\s*lök|onion/i, m: { kcal: 40, prot: 1.1, carb: 9.3, fat: 0.1 } },
  { re: /gurka|cucumber/i, m: { kcal: 12, prot: 0.6, carb: 2, fat: 0.1 } },
  { re: /avokado|avocado/i, m: { kcal: 160, prot: 2, carb: 8.5, fat: 14.7 } },
  { re: /morot|carrot/i, m: { kcal: 41, prot: 0.9, carb: 9.6, fat: 0.2 } },
  { re: /körsbärstomat|cherry\s*tomato|tomat|tomato/i, m: { kcal: 18, prot: 0.9, carb: 3.9, fat: 0.2 } },
  { re: /jalape[nñ]o|peperoncino|chili(?!\s*(sauce|sås|crisp|crunch|olja|oil|flakes|flingor|pulver|flakes))/i, m: { kcal: 40, prot: 1.9, carb: 9.5, fat: 0.4 } },
  { re: /paprika(?!pulver)|bell\s*pepper/i, m: { kcal: 31, prot: 1, carb: 6, fat: 0.3 } },
  { re: /grönkål|kale/i, m: { kcal: 49, prot: 4.3, carb: 8.8, fat: 0.9 } },
  { re: /spenat|spinach/i, m: { kcal: 23, prot: 2.9, carb: 3.6, fat: 0.4 } },
  { re: /ruccola|rocket/i, m: { kcal: 25, prot: 2.6, carb: 3.7, fat: 0.7 } },
  { re: /sallad|lettuce|blad|iceberg|romansallad/i, m: { kcal: 15, prot: 1.4, carb: 2.9, fat: 0.2 } },
  { re: /selleri|celery/i, m: { kcal: 14, prot: 0.7, carb: 3, fat: 0.2 } },
  { re: /broccoli/i, m: { kcal: 34, prot: 2.8, carb: 7, fat: 0.4 } },
  { re: /blomkål|cauliflower/i, m: { kcal: 25, prot: 1.9, carb: 5, fat: 0.3 } },
  { re: /zucchini|squash|courgette/i, m: { kcal: 17, prot: 1.2, carb: 3.1, fat: 0.3 } },
  { re: /aubergine|eggplant/i, m: { kcal: 25, prot: 1, carb: 6, fat: 0.2 } },
  { re: /champinjon|svamp|mushroom/i, m: { kcal: 22, prot: 3.1, carb: 3.3, fat: 0.3 } },
  { re: /vitkål|rödkål|savoy|kål|cabbage/i, m: { kcal: 25, prot: 1.3, carb: 5.8, fat: 0.1 } },
  { re: /sparris|asparagus/i, m: { kcal: 20, prot: 2.2, carb: 3.9, fat: 0.1 } },
  { re: /rödbeta|beet/i, m: { kcal: 43, prot: 1.6, carb: 10, fat: 0.2 } },
  { re: /squash|pumpa|pumpkin/i, m: { kcal: 26, prot: 1, carb: 6.5, fat: 0.1 } },
  { re: /basilika|koriander|mynta|persilja|dill|örter?|herb/i, m: { kcal: 40, prot: 3, carb: 6, fat: 0.5 } },
  { re: /pickles?\b|gurkinläggning|bananpeppar/i, m: { kcal: 16, prot: 0.7, carb: 3.2, fat: 0.2 } },
  { re: /oliver|olives?/i, m: { kcal: 115, prot: 0.8, carb: 6, fat: 11 } },
  { re: /banan|banana/i, m: { kcal: 89, prot: 1.1, carb: 23, fat: 0.3 } },
  { re: /äpple|apple/i, m: { kcal: 52, prot: 0.3, carb: 14, fat: 0.2 } },
  { re: /päron|pear/i, m: { kcal: 57, prot: 0.4, carb: 15, fat: 0.1 } },
  { re: /apelsin|orange/i, m: { kcal: 47, prot: 0.9, carb: 12, fat: 0.1 } },
  { re: /blåbär|blueberry/i, m: { kcal: 57, prot: 0.7, carb: 14, fat: 0.3 } },
  { re: /jordgubb|strawberry/i, m: { kcal: 32, prot: 0.7, carb: 8, fat: 0.3 } },
  { re: /hallon|raspberry/i, m: { kcal: 52, prot: 1.2, carb: 12, fat: 0.7 } },
  { re: /bär|berry|berries/i, m: { kcal: 50, prot: 0.8, carb: 12, fat: 0.4 } },
  { re: /mango/i, m: { kcal: 60, prot: 0.8, carb: 15, fat: 0.4 } },
  { re: /ananas|pineapple/i, m: { kcal: 50, prot: 0.5, carb: 13, fat: 0.1 } },
  { re: /druva|grape/i, m: { kcal: 69, prot: 0.7, carb: 18, fat: 0.2 } },
  { re: /russin|raisin|dadlar?|dates?/i, m: { kcal: 299, prot: 3, carb: 79, fat: 0.5 } },
  { re: /proteinpulver|whey|kasein|casein|protein\s*powder|vaniljprotein/i, m: { kcal: 380, prot: 80, carb: 5, fat: 3 } },
  { re: /kakao|cocoa/i, m: { kcal: 228, prot: 19.6, carb: 58, fat: 13.7 } },
  { re: /chocolate\s+chips?|choklad|chocolate/i, m: { kcal: 546, prot: 4.9, carb: 61, fat: 31 } },
  { re: /vetegluten|vital\s*wheat\s*gluten|\bgluten\b/i, m: { kcal: 370, prot: 75, carb: 14, fat: 1.9 } },
  { re: /näringsjäst|nutritional\s*yeast/i, m: { kcal: 325, prot: 50, carb: 36, fat: 4.5 } },
  { re: /jäst|yeast/i, m: { kcal: 325, prot: 40.4, carb: 41, fat: 5 } },
  { re: /bakpulver|bikarbonat|baking\s*(powder|soda)/i, m: { kcal: 0, prot: 0, carb: 0, fat: 0 } },
  { re: /espresso|kaffe|coffee/i, m: { kcal: 2, prot: 0.1, carb: 0, fat: 0 } },
  { re: /te\b|tea\b/i, m: { kcal: 1, prot: 0, carb: 0, fat: 0 } },
  { re: /vaniljextrakt|vanilla\s*extract/i, m: { kcal: 288, prot: 0.1, carb: 13, fat: 0.1 } },
  { re: /sötningsmedel|stevia|monk\s*fruit|sukrin|lakanto|brunt\s*stevia/i, m: { kcal: 0, prot: 0, carb: 0, fat: 0 } },
  { re: /citronsaft|limejuice|citronjuice|lemon\s*juice|lime\s*juice/i, m: { kcal: 22, prot: 0.4, carb: 6.9, fat: 0.2 } },
  { re: /lime|citron|lemon/i, m: { kcal: 29, prot: 1.1, carb: 9.3, fat: 0.3 } },
  { re: /kryddmix|spice\s*mix|seasoning|italiensk\s*krydda|italian\s*seasoning|örtkrydda/i, m: { kcal: 250, prot: 10, carb: 50, fat: 5 } },
  { re: /salt|peppar|pepper|\bmsg\b|krydda|paprikapulver|rökt\s*paprika|kummin|cayenne|oregano|kanel|gurkmeja|kardemumma|vitlökspulver|lökpulver|chilipulver|chiliflakes|chiliflingor|persiljeflakes|tajín|gochugaru|sichuan|flingsalt|vitpeppar|spiskummin/i, m: { kcal: 0, prot: 0, carb: 0, fat: 0 } },
  { re: /vatten|water|buljong|stock|broth|pocheringsvätska|pickling\s*lake/i, m: { kcal: 5, prot: 0.5, carb: 0.5, fat: 0 } },
];

/** Styckvikter (g) när unit = st. */
const PIECE_G: Array<{ re: RegExp; g: number }> = [
  { re: /wrapper|wonton|gyoza|dumpling|gyozaskal|wontonskal/i, g: 7 },
  { re: /brioche|hamburgerbröd|slider|hoagie|bulle|bröd|wrap|tunnbröd|tortilla|libanesisk/i, g: 60 },
  { re: /lime(?!\s*juice)|citron(?!saft|juice|skal|zest)|lemon(?!\s*juice)/i, g: 60 },
  { re: /körsbärstomat|cherry\s*tomato/i, g: 15 },
  { re: /tomat/i, g: 100 },
  { re: /jalape/i, g: 15 },
  { re: /paprika(?!pulver)/i, g: 150 },
  { re: /rödlök|gul\s*lök|\blök\b|shallot|schälotten/i, g: 80 },
  { re: /äggvita/i, g: 33 },
  { re: /ägg/i, g: 55 },
  { re: /avokado|avocado/i, g: 150 },
  { re: /gurka|cucumber/i, g: 300 },
  { re: /morot|carrot/i, g: 80 },
  { re: /banan|banana/i, g: 120 },
  { re: /äpple|apple/i, g: 150 },
  { re: /vårlök|salladslök|scallion/i, g: 10 },
  { re: /vitlöksklyfta|vitlök|garlic/i, g: 3 },
  { re: /ingefära|ginger/i, g: 15 },
  { re: /pickles?\b/i, g: 40 },
  { re: /potatis|potato/i, g: 150 },
  { re: /ansjovis|anchovy/i, g: 5 },
  { re: /rispapper/i, g: 10 },
];

/** Ungefärlig vikt per näve. */
const NAVE_G: Array<{ re: RegExp; g: number }> = [
  { re: /sesamfrö/i, g: 12 },
  { re: /vårlök|salladslök|scallion|green\s*onion/i, g: 20 },
  { re: /koriander|persilja|basilika|mynta|ört/i, g: 15 },
  { re: /grönkål|spenat|ruccola|blad|sallad/i, g: 30 },
  { re: /nötter|jordnöt|cashew|mandel/i, g: 30 },
  { re: /bär|berry|blåbär/i, g: 60 },
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
    .replace(/\b(utan|med)\s+skinn\b/gi, '')
    .replace(/\b(with|without)\s+skin\b/gi, '')
    .replace(/\bskinless\b/gi, '')
    .replace(/\bboneless\b/gi, '')
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

function isCitrusJuiceName(name: string): boolean {
  return /citronsaft|limejuice|citronjuice|lemon\s*juice|lime\s*juice/i.test(name);
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
    /* «0.5 st citronsaft» = juice från ½ citron ≈ 1 msk (15 g) → 30 g per hel */
    if (isCitrusJuiceName(name)) return amount * 30;
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
export function estimateMacrosFromIngredients(
  recipe: Recipe,
  opts?: { minCountCoverage?: number; minGramCoverage?: number }
): MacroTotals | null {
  const groups = (recipe.groups || []) as {
    ingredients?: { name?: string; amount?: number; unit?: string }[];
  }[];
  let total = emptyMacros();
  let counted = 0;
  let eligible = 0;
  let countedGrams = 0;
  let eligibleGrams = 0;
  const unknown: string[] = [];
  const minCountCoverage = opts?.minCountCoverage ?? 0.6;
  const minGramCoverage = opts?.minGramCoverage ?? 0.55;

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
  if (countCoverage < minCountCoverage || gramCoverage < minGramCoverage) {
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
