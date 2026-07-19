# PetCam.online Design Rules

## Source of truth

De naam is overal **PetCam.online** — gebruik nooit "BabyPhone", "Luna Unit"
of andere oude codenamen als productnaam in user-facing copy.

De werkende app is de serverloze single-page variant in `serverless/`
(`index.html`, `luna.css`, `dash.css`, `js/app.js`, `js/i18n.js`,
`js/lullaby.js`, `vendor/`). De productie-build is één zelfstandig
`index.html` + map `music/` (zie `build.js`).

## Visuele stijl

PetCam.online moet voelen als een premium, rustige, warme petcam-webapp —
een "knus hok bij nacht"-sfeer, geen kinderachtige huisdierillustraties.
Gebruik:

- Donker houtskool/umber als basis (geen navy — dat is de babyphone-look)
- Warm amber/honing als accent
- Zacht groen voor success states
- Glasachtige donkere cards
- Grote afgeronde hoeken (16–24px)
- Subtiele borders (dunne transparante lijnen)
- Veel witruimte
- Rustige typografie (Quicksand voor koppen, Nunito voor tekst)

Vermijd:

- Standaard SaaS-template
- Te felle kleuren
- Kinderachtige cartoon-huisdiertjes of stockfoto-hond-met-bal-sfeer
- Rommelige dashboards
- Te veel gradients
- Generieke AI-landingpage-uitstraling
- Elke navy/koraal kleurwaarde uit de oude BabyPhone-look (zie tokens hieronder)

## Design tokens (dark — "Rustige Schemering")

- `--bg` zeer donker houtskool (#12110F), gradient-highlight #241E17
- `--surface` donker glasachtig bruin (#1E1A16) met subtiele border
- `--line` dunne transparante lijn (rgba(255,255,255,.07))
- `--accent` warm amber (#E8B368), gradient #E8B368 → #D6903F
- `--ok` zacht groen (#5BC98A)
- `--text` warm wit (#F2EDE6)
- `--muted` warm grijsbruin (#9C9184)
- radius groot; schaduw/glow subtiel

## Terminologie

| Concept | Term |
|---|---|
| Camera-apparaat bij het huisdier | **Pet Cam** (intern: `roleBabyTitle`/`babyUnit`-sleutels, ongewijzigd) |
| Kijkscherm bij de eigenaar | **Owner Unit** (intern: `roleParentTitle`/`parentUnit`-sleutels, ongewijzigd) |
| Geluidsdetectie-alarm | **Sound alert** (niet "cry alert"/"huilalarm") |
| Slaapliedjes-functie | **Comfort sounds** (niet "lullabies"/"slaapliedjes") |
| Slaaptimer | **Rest timer** |

## Workflow (verplicht bij UI-wijzigingen)

1. Eerst de bestaande stijl/tokens in `luna.css`/`dash.css` analyseren.
2. Dan componenten aanpassen.
3. Dan live preview openen (`npm start` of rechtstreeks `serverless/index.html`
   openen, of screenshotten via Playwright — zie `test/e2e-serverless.js` voor
   het patroon).
4. Dan visueel vergelijken op desktop én mobiel.
5. Dan pas klaar melden.

## Functionaliteit — niet breken

Breek bestaande pet-cam/eigenaar-unit/WebRTC/PeerJS/camera/microfoon/
kamercode/QR-code functionaliteit niet. Element-ID's die door `js/app.js`
gebruikt worden (bv. `screenBaby`, `screenParent`, `pickBaby`, `pickParent`)
blijven **ongewijzigd** — dit zijn interne identifiers, geen user-facing
tekst, en hernoemen ervan is puur regressierisico zonder voordeel. CSS-
classes zoals `.baby`/`.parent`/`.vcard.baby` zijn om dezelfde reden
ongewijzigd gebleven; alleen hun *kleuren* en de *zichtbare tekst eromheen*
zijn aangepast.

Ontbreekt een functie nog, gebruik dan een nette placeholder maar behoud
het ontwerp.

## i18n

Alleen **Engels (en)** en **Nederlands (nl)** zijn volledig herschreven met
pet-copy in `serverless/js/i18n.js`. De overige 28 taalblokken bevatten een
`// TODO: pet-copy vertalen`-comment en zijn verder leeg — ze vallen
automatisch terug op Engels via de bestaande `t()`-fallback. Vul een taal pas
aan zodra er een echte vertaling is; laat nooit een mix van oude
babyphone-vertaling en nieuwe Engelse fallback binnen dezelfde taal staan.

## Done betekent

Een taak is pas klaar als:

- Build werkt (single-file build zonder externe verwijzingen).
- `node -c` slaagt op alle JS-bestanden.
- Geen console/pageerrors.
- Desktop én mobiel gecontroleerd zijn.
- Geen letterlijke "baby"/"BabyPhone"/navy-koraal restanten in zichtbare
  tekst of kleuren (interne IDs/classes/bestandsnamen zijn uitgezonderd,
  zie hierboven).
