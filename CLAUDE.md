# claude-apps

## Receptprojekt — instruktioner

När användaren skickar en Instagram-URL eller annan recept-URL:

1. Hämta sidan och läs receptet (ingredients, steps, tips)
2. Bygg ett receptobjekt i samma format som befintliga recept i `recept/index.html`
3. Lägg till objektet i RECIPES-arrayen i `recept/index.html`
4. Kör: `git add recept/index.html && git commit -m "Add [receptnamn]" && git push`

## Receptformat

Varje recept i RECIPES-arrayen har följande struktur:

```js
{
  id: 'kebab-case-id',
  emoji: '🍕',
  title: 'Receptnamn',
  source: '@kontoanamn på Instagram',
  sourceUrl: 'https://www.instagram.com/p/...',
  badges: ['X portioner', 'temp/tid', 'kategori'],
  macros: { kcal: 0, prot: 0, carb: 0, fat: 0 }, // för hela receptet
  groups: [
    {
      name: 'Sektionsnamn', // t.ex. Botten, Sås, Toppings, Finish
      ingredients: [
        { name: 'ingrediensnamn med lowercase', amount: 100, unit: 'g' }
      ]
    }
  ],
  steps: [
    { title: 'Stegnamn', text: 'Beskrivning.' }
  ],
  tips: [
    { title: 'Seattle', text: 'Barnvänlig anpassning för Seattle Mae (7 år).' },
    { title: 'Variationer', text: '...' },
    { title: 'Tips-rubrik', text: '...' },
    { title: 'Tips-rubrik', text: '...' }
  ]
}
```

## Måttformat
- Gram: använd `unit: 'g'`
- Matsked: använd `unit: 'msk'`
- Tesked: använd `unit: 'tsk'`
- Styck: använd `unit: 'st'`
- Övrigt: använd `unit: 'pinch'`, `unit: 'näve'`, `unit: 'strimlor'` etc.
- Använd alltid lowercase på ingrediensnamn
- Skriv aldrig gram/tbsp/tsp — alltid g/msk/tsk

## Makros
- Makros gäller för hela receptet (inte per portion)
- Beräkna så noggrant som möjligt utifrån ingredienserna
- Leucin och DIAAS är relevanta för proteinkvalitet (se projekt-instruktioner)

## Familjen
- **John Scott Guggenheimer** — avancerad hemmakock, tränar styrka/olympisk lyftning
- **Antonia** — CrossFit, fokus på protein och återhämtning
- **Seattle Mae** — 7 år, ska alltid ha en mild anpassning i tips

## Tips-sektionen
- Alltid 4 tips per recept
- Första tipset är alltid **Seattle** — mild/barnvänlig anpassning
- Övriga tips: relevanta variationer, teknik, substitut, förberedelse

## GitHub Pages
Appen är live på: https://johnscottguggenheimerse.github.io/claude-apps/recept/
Repot: https://github.com/johnscottguggenheimerSE/claude-apps
