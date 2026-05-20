# Receptapp — projektinstruktion

## Vad projektet är

En receptapp hostad på GitHub Pages som samlar recept från Instagram och receptsajter. Appen är en fristående HTML-fil med inbyggd data — inga externa beroenden, ingen backend.

**Live:** https://johnscottguggenheimerse.github.io/claude-apps/recept/  
**Repo:** https://github.com/johnscottguggenheimerSE/claude-apps  
**Fil:** `recept/index.html`

**Deploy (GitHub Pages, annat konto än övriga projekt):** se **[DEPLOY.md](./DEPLOY.md)** — aktivera Pages i repot en gång, sedan `git push origin main`.

### I Cursor (denna workspace)

Så här använder du samma flöde **här i Cursor** utan separat app:

1. Öppna **`recept/index.html`** i editorn (rekommenderat — då ingår projektregeln **recept-add-from-url**). Om filen inte är öppen: nämn `@CLAUDE.md` eller `@recept-add-from-url` i chatten.
2. Klistra in en **Instagram-post/reel** eller **receptsajt-URL** och skriv t.ex. *Lägg till detta recept* eller *Importera till receptappen*.
3. Agenten hämtar sidan om möjligt (Instagram kan kräva att du klistrar in caption manuellt), bygger ett objekt enligt formatet nedan och infogar det i `RECIPES` i `recept/index.html`.

---

## Hur recept läggs till

1. Användaren skickar en Instagram-URL (eller annan recept-URL)
2. Hämta sidan och extrahera receptet från captionen eller receptsidan
3. Bygg ett receptobjekt i samma format som befintliga recept i `recept/index.html`
4. Lägg till objektet i `RECIPES`-arrayen i `recept/index.html`
5. **Nytt!-märke:** Lägg receptets `id` först i arrayen `FEATURED_NEW_IDS` i samma fil (sök i `<script>`) så det visas överst med "Nytt!" tills användaren öppnat receptet (sparad i cookie).
6. `git add recept/index.html && git commit -m "Add [receptnamn]" && git push` (eller `git add .` om fler filer ska med)
7. GitHub Pages uppdateras automatiskt efter ~30 sekunder

---

## Receptformat

```js
{
  id: 'kebab-case-id',
  category: 'middag', // en av: middag | asiatisk | sallad | bakning
  tags: ['hog-protein', 'snabb', 'kyckling'], // flera filter-taggar; id:n som i TAG_FILTER_ORDER i index.html
  image: 'images/recept.png', // valfritt; annars emoji-bakgrund
  emoji: '🍕',
  title: 'Receptnamn',
  source: '@kontonamn på Instagram',
  sourceUrl: 'https://www.instagram.com/p/...',
  badges: ['X portioner', 'temp/tid', 'kategori'],
  macros: { kcal: 0, prot: 0, carb: 0, fat: 0 }, // hela receptet
  groups: [
    {
      name: 'Sektionsnamn', // Botten, Sås, Toppings, Finish etc.
      ingredients: [
        { name: 'ingrediensnamn (lowercase)', amount: 100, unit: 'g' }
      ]
    }
  ],
  steps: [
    { title: 'Stegnamn', text: 'Beskrivning.' }
  ],
  tips: [
    { title: 'Seattle', text: 'Mild/barnvänlig anpassning för Seattle Mae (7 år).' },
    { title: 'Rubrik', text: '...' },
    { title: 'Rubrik', text: '...' },
    { title: 'Rubrik', text: '...' }
  ]
}
```

**Listvy:** Första raden filtrerar på **kategori** (en i taget). Andra raden är **taggar** — flera kan vara valda samtidigt; då visas bara recept som har **alla** valda taggar (i kombination med vald kategori). Nya tagg-id läggs i `TAG_FILTER_ORDER` och `TAG_LABELS` i samma fil.

---

## Måttregler

- Alltid `g`, `msk`, `tsk`, `st` — aldrig gram/tbsp/tsp i fältet `unit`
- Övriga enheter som förekommer i appen: `pinch`, `näve`, `strimlor` m.m.
- Lowercase på alla ingrediensnamn
- Makros gäller hela receptet, inte per portion

## Makros

- Beräkna så noggrant som möjligt utifrån ingredienserna
- Leucin och DIAAS är relevanta för proteinkvalitet (vid behov)

---

## Familjen

- **John Scott** — avancerad hemmakock, styrketräning/olympisk lyftning, Malmö
- **Antonia** — CrossFit, fokuserar på protein och återhämtning
- **Seattle Mae** — 7 år, alltid en mild anpassning i tips-sektionen

### Tips-sektionen

- Alltid **4 tips** per recept
- Första tipset är alltid **Seattle** — mild/barnvänlig anpassning
- Övriga tips: variationer, teknik, substitut, förberedelse

---

## Appen — funktioner

- Receptlista med emoji, namn och badges
- Detaljvy per recept med ingredienser grupperade i sektioner
- Serveringskalkyl (+ / −) som skalar alla ingredienser och makros
- Makros visas för hela receptet
- Källa och länk till original
- Tips & variationer med fyra rutor
- Mörkt/ljust läge via CSS

---

## Tekniskt

- Ren HTML/CSS/JS — inga ramverk, inga beroenden
- All data hårdkodad i `RECIPES`-arrayen i `index.html`
- GitHub Pages hostas från `main`-branchen, rot `/`
- **CSP-kompatibel kod:** inga template literals i `innerHTML`; använd DOM-metoder (`createElement`, `textContent`, etc.)
