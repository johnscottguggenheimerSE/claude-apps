/**
 * Diet conversion variants (pescetarian / vegetarian) for meat recipes.
 * AI proposes substitutions; macros resolved via nutrition catalog.
 */
import type { Recipe } from './validate';
import { normalizeRecipe } from './validate';
import { resolveAndApplyRecipe } from './nutrition/resolve';
import type { NutritionCatalog } from './nutrition/types';

export type DietVariantKey = 'pescetarian' | 'vegetarian';

export type DietVariant = {
  available: boolean;
  title?: string;
  reason?: string;
  groups?: Recipe['groups'];
  macros?: { kcal: number; prot: number; carb: number; fat: number };
};

export type DietVariantsMap = Partial<Record<DietVariantKey, DietVariant>>;

const MEAT_TAGS = new Set(['kyckling', 'notkott', 'flask']);

export function recipeNeedsDietConversion(recipe: Recipe): boolean {
  const tags = Array.isArray(recipe.tags) ? (recipe.tags as string[]) : [];
  if (tags.some((t) => MEAT_TAGS.has(t))) return true;
  // Heuristic: animal meat in ingredients
  const text = JSON.stringify(recipe.groups || []).toLowerCase();
  return /kyckling|nötfärs|nötkött|fläsk|bacon|hamburgare|köttfärs|lamm|hjort|gris/.test(text);
}

const DIET_VARIANTS_SYSTEM = `Du skapar dietvarianter av svenska recept för en receptapp.
Returnera ENDAST JSON (ingen markdown):

{
  "pescetarian": {
    "available": boolean,
    "title": "svensk titel för fisk/skaldjursvarianten (om available)",
    "reason": "kort varför ej available, eller kort om bytet",
    "groups": [ { "name": "...", "ingredients": [ { "name": "lowercase", "amount": number, "unit": "g|msk|tsk|st|pinch|näve|strimlor" } ] } ]
  },
  "vegetarian": {
    "available": boolean,
    "title": "...",
    "reason": "...",
    "groups": [ ... ]
  }
}

Regler:
- **pescetarian:** byt kött/fågel mot fisk eller skaldjur som är *rimligt lika* i rollen (kycklinglår → laxfilé, kycklingfärs → fiskfärs/torsk, bacon → rökt lax). Om det inte går att få en trovärdig fiskversion (t.ex. chili con carne, kycklingvingar, hamburgare där fisk blir konstigt): available=false och ingen groups.
- **vegetarian:** byt kött/fågel mot vegetariskt protein så *snarlikt som möjligt* (nötfärs → sojafärs/quornfärs, hamburgare → vegeburgare, kyckling → halloumi/tofu/tempeh, bacon → vegetariskt bacon). Nästan alltid available=true för köttrecept.
- Behåll samma groups-struktur och övriga ingredienser (såser, grönsaker, kryddor) så långt det går — byt bara det som måste.
- Samma antal portioner / ungefär samma mängder (gram).
- Inga macros-fält.
- Titlar på svenska, utan ordet «protein».
- Om originalet redan är fisk/vegetariskt: available=false för irrelevant variant.`;

type GeminiPart = { text?: string; inlineData?: { mimeType: string; data: string } };

async function geminiJsonSimple(
  apiKey: string,
  parts: GeminiPart[],
  system: string
): Promise<string> {
  const models = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] as const;
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  let lastErr = 'Gemini returnerade ingen text';
  for (const model of models) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    );
    if (res.status === 404 || res.status === 429) {
      lastErr = `${model}: ${res.status}`;
      continue;
    }
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini ${res.status}: ${err.slice(0, 280)}`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;
  }
  throw new Error(lastErr);
}

function compactRecipeForPrompt(recipe: Recipe): object {
  return {
    id: recipe.id,
    title: recipe.title,
    tags: recipe.tags,
    baseServings: recipe.baseServings,
    groups: recipe.groups,
  };
}

function normalizeVariantGroups(raw: unknown): { name: string; ingredients: { name: string; amount: number; unit: string }[] }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => {
      const group = g as { name?: string; ingredients?: unknown[] };
      const ingredients = Array.isArray(group.ingredients)
        ? group.ingredients
            .map((ing) => {
              const row = ing as { name?: string; amount?: number; unit?: string };
              const name = String(row.name || '')
                .toLowerCase()
                .trim();
              if (!name) return null;
              return {
                name,
                amount: Number(row.amount) || 0,
                unit: String(row.unit || 'g'),
              };
            })
            .filter(Boolean) as { name: string; amount: number; unit: string }[]
        : [];
      return { name: String(group.name || 'Ingredienser'), ingredients };
    })
    .filter((g) => g.ingredients.length > 0);
}

export async function proposeDietVariants(
  apiKey: string,
  recipe: Recipe
): Promise<DietVariantsMap> {
  const raw = await geminiJsonSimple(
    apiKey,
    [
      {
        text: `Skapa dietvarianter för detta recept:\n${JSON.stringify(compactRecipeForPrompt(recipe))}`,
      },
    ],
    DIET_VARIANTS_SYSTEM
  );
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error('Kunde inte tolka dietvarianter från AI');
  }

  const out: DietVariantsMap = {};
  for (const key of ['pescetarian', 'vegetarian'] as DietVariantKey[]) {
    const block = parsed[key] as Record<string, unknown> | undefined;
    if (!block || typeof block !== 'object') {
      out[key] = { available: false, reason: 'Saknas i AI-svar' };
      continue;
    }
    const available = !!block.available;
    if (!available) {
      out[key] = {
        available: false,
        reason: String(block.reason || 'Inte rimlig variant'),
      };
      continue;
    }
    const groups = normalizeVariantGroups(block.groups);
    if (!groups.length) {
      out[key] = { available: false, reason: 'Tom ingredienslista' };
      continue;
    }
    out[key] = {
      available: true,
      title: String(block.title || recipe.title || ''),
      reason: block.reason ? String(block.reason) : undefined,
      groups,
    };
  }
  return out;
}

/** Resolve macros for each available variant; mutate/return map. */
export function resolveDietVariantsMacros(
  catalog: NutritionCatalog,
  baseRecipe: Recipe,
  variants: DietVariantsMap
): DietVariantsMap {
  const resolved: DietVariantsMap = {};
  for (const key of Object.keys(variants) as DietVariantKey[]) {
    const v = variants[key];
    if (!v) continue;
    if (!v.available || !v.groups) {
      resolved[key] = { available: false, reason: v.reason };
      continue;
    }
    const draft: Recipe = {
      ...baseRecipe,
      title: v.title || baseRecipe.title,
      groups: v.groups,
    };
    delete draft.macros;
    delete draft.dietVariants;
    normalizeRecipe(draft);
    const { recipe: applied } = resolveAndApplyRecipe(catalog, draft);
    resolved[key] = {
      available: true,
      title: String(v.title || applied.title || baseRecipe.title),
      reason: v.reason,
      groups: applied.groups,
      macros: applied.macros as DietVariant['macros'],
    };
  }
  return resolved;
}

export async function buildDietVariantsForRecipe(
  apiKey: string,
  catalog: NutritionCatalog,
  recipe: Recipe
): Promise<DietVariantsMap | null> {
  if (!recipeNeedsDietConversion(recipe)) return null;
  const proposed = await proposeDietVariants(apiKey, recipe);
  return resolveDietVariantsMacros(catalog, recipe, proposed);
}
