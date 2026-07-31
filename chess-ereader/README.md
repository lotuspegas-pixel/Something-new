# Schaak voor E-readers

Een volledig, foutloos schaakspel dat werkt op de trage, verouderde browsers
van e-readers (Kindle, Kobo, PocketBook, Boox, reMarkable, ...) en op elke
gewone desktop- of mobiele browser.

Geen build-stap, geen dependencies, geen internetverbinding nodig. Drie
platte bestanden: `index.html`, `style.css`, `chess-engine.js` + `app.js`.

## Waarom dit anders is dan een gewone webapp

E-reader-browsers zijn een lastige doelgroep: oude WebKit-versies, trage
ARM-processors, e-inkschermen die animaties niet aankunnen (ghosting), en
input via touch **of** fysieke knoppen/d-pad in plaats van een muis. Daarom:

- **Pure ES5 JavaScript.** Geen classes, arrow functions, `let`/`const`,
  template literals of `Array.prototype.includes`/`find`. Alleen taal­
  features die al sinds ~2010 overal werken.
- **Geen animaties of transities.** E-inkschermen "spoken"/ghosten bij
  herhaald hertekenen; de UI update in één keer, statisch.
- **Zwart/wit/grijs only**, geen kleurafhankelijke informatie — stukken zijn
  te onderscheiden aan hun vorm (gevulde vs. omlijnde Unicode-schaaksymbolen),
  niet aan kleur.
- **Tafel-layout voor het bord** (HTML `<table>`) — de meest universeel
  ondersteunde layout-methode, werkt ook op browsers zonder degelijke
  flexbox/grid-ondersteuning.
- **Twee onafhankelijke invoermethodes**: tikken/klikken op een veld, én
  pijltjestoetsen + Enter/Spatie voor e-readers met alleen fysieke knoppen.
- **Alles inline/lokaal** — geen CDN's, geen fonts, geen externe requests.
  Werkt volledig offline zodra de bestanden op het toestel staan.

## Gebruiken

Zet de map `chess-ereader/` op een webserver (bijv. GitHub Pages) en open
`index.html` in de browser van de e-reader. Sideloaden en lokaal openen via
`file://` werkt in de meeste browsers ook, omdat alle bestanden relatief
naar elkaar verwijzen en er geen externe afhankelijkheden zijn.

## Functies

- Volledig legale zetgeneratie: rokade (kort/lang), en passant, promotie
  (met keuzemenu voor dame/toren/loper/paard)
- Schaak-, mat- en patdetectie
- Remise-detectie: 50-zettenregel, drievoudige zetherhaling, onvoldoende
  materiaal
- Zetlijst in standaardnotatie (SAN), met zetnummers
- FEN importeren/exporteren (positie delen of laden)
- Zet terugnemen (undo), bord draaien, opgeven, remise aanbieden
- Ingebouwde computertegenstander (minimax met alpha-bèta-snoei, 3
  sterkteniveaus) voor solo spelen — optioneel, standaard uit
- Toetsenbord-/knopnavigatie als alternatief voor aanraken

## Techniek

`chess-engine.js` is de losse regelengine (UMD-module, ook bruikbaar vanuit
Node.js) en is los getest met perft-tellingen tegen bekende referentie­
posities (startpositie t/m diepte 4, plus de "Kiwipete"-testpositie voor
rokade/en passant/promotiehoeken) — allemaal exact overeenkomend met de
bekende waarden. `app.js` bevat alleen de DOM/UI-laag.
