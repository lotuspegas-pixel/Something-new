# Bronbestanden voor `serverless/security.html`

De veiligheidspagina is één groot bestand van ruim 300 KB, waarvan het
leeuwendeel de vertaaltabel in 30 talen is. Dat handmatig bijwerken is
vragen om fouten, dus wordt de pagina hier samengesteld.

## Bijwerken

1. Pas aan wat nodig is:
   - `tr_en.py` — het Engelse origineel en meteen de lijst met sleutels.
   - `tr_02.py` t/m `tr_08.py` — de overige 29 talen, een paar per bestand.
   - `security-body.html` — de opbouw van het artikel (de `data-b`-sleutels).
   - `security-extra.css` — de opmaak die alleen deze pagina gebruikt.
   - `blog.css` — een kopie van de stijl uit `blog.html`, zodat beide
     artikelen er hetzelfde uitzien. Wijzigt `blog.html` van stijl, ververs
     dan deze kopie.
2. Draai `python3 tools/security-page/bouw.py` vanuit de hoofdmap.
3. Draai `npm run test:securitypage`.

## Waarom een eigen vertaaltabel en niet `js/i18n.js`

`i18n.js` gaat mee in de app zelf, die op elke paginalading geladen wordt.
De 30 vertalingen van dit artikel zijn samen groter dan de hele app; die
in `i18n.js` zetten zou de babyfoon zelf trager maken voor iets dat alleen
op deze pagina nodig is. `blog.html` doet het om dezelfde reden zo.

## Voegt een taal zich bij de app?

`LANGS` wordt overgenomen uit `blog.html`, zodat de taalkiezer overal
gelijk loopt. Komt er een taal bij, voeg hem dan ook hier toe — een taal
aanbieden die daarna Engels blijkt, is erger dan hem weglaten. De test
`test:securitypage` faalt als een taal terugvalt op het Engels.
