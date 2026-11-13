# BabyPhone.online Design Rules

## Source of truth

De designscreenshots in `/design-reference` zijn leidend. De app mag niet
afwijken naar een generieke template-look. De naam is overal
**BabyPhone.online** — gebruik NOOIT "Luna Unit" als productnaam (het
maan/baby/nacht-gevoel mag blijven, de naam niet).

De werkende app is de serverloze single-page variant in `serverless/`
(`index.html`, `luna.css`, `js/app.js`, `js/i18n.js`, `js/lullaby.js`,
`vendor/`). De productie-build (`npm run build`, `build.js`) is een kleine
`index.html` die verwijst naar `assets/site.<hash>.css` en
`assets/<naam>.<hash>.js`, plus `fonts/` en `music/`. Voorheen was het één zelfstandig
`index.html` met alles inline (1,7 miljoen tekens); dat is op verzoek van de
eigenaar losgelaten omdat een AI-assistent die de pagina leest voor elk teken
betaalt. De hash in de bestandsnaam maakt een jaar bewaren veilig.

## Visuele stijl

BabyPhone.online moet voelen als een premium, rustige, nachtelijke
baby-tech webapp. Gebruik:

- Donker nachtblauw/zwart als basis
- Warm coral/oranje als accent
- Zacht groen voor success states
- Glasachtige donkere cards
- Grote afgeronde hoeken (16–24px)
- Subtiele borders (dunne transparante lijnen)
- Veel witruimte
- Rustige typografie (Quicksand voor koppen, Nunito voor tekst)

Vermijd:

- Standaard SaaS-template
- Te felle kleuren
- Kinderachtige pastels
- Rommelige dashboards
- Te veel gradients
- Generieke AI-landingpage uitstraling

## Design tokens (dark)

- `--bg` zeer donker blauw/zwart (#0A101B / #0D1524)
- `--surface` donker glasachtig blauw (#151E30) met subtiele border
- `--line` dunne transparante lijn (rgba(255,255,255,.07))
- `--accent` warm coral (#E8825E), gradient #EC8A63 → #E0714B
- `--ok` zacht groen (#4ED08A)
- `--text` warm wit (#EDEFF4)
- `--muted` grijsblauw (#8C95A8)
- radius groot; schaduw/glow subtiel

## Workflow (verplicht bij UI-wijzigingen)

1. Eerst de referentie-screenshot analyseren.
2. Dan componenten aanpassen.
3. Dan live preview openen.
4. Dan screenshot maken.
5. Dan visueel vergelijken met de referentie.
6. Dan pas klaar melden.

## Functionaliteit — niet breken

Breek bestaande babyunit/ouderunit/WebRTC/PeerJS/camera/microfoon/
kamercode/QR-code functionaliteit niet. Element-ID's die door `js/app.js`
gebruikt worden blijven behouden of worden meegemigreerd. Ontbreekt een
functie nog, gebruik dan een nette placeholder maar behoud het ontwerp.

## Done betekent

Een taak is pas klaar als:

- Build werkt (`npm run build`: elke verwijzing in `index.html` wijst naar een bestand dat er is, geen externe host, JS leesbaar voor Safari 12, `index.html` onder de 160 KB).
- Lint werkt indien aanwezig (minimaal `node -c` op de JS-bestanden).
- Geen console/pageerrors.
- Desktop én mobiel gecontroleerd zijn.
- De live UI visueel lijkt op de referentie-screenshots.
