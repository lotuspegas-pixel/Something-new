# Schaak voor E-readers

Een volledig schaakspel dat werkt op de trage, verouderde browsers van
e-readers (Kindle, Kobo, PocketBook, Boox, reMarkable, …) en op elke gewone
desktop- of mobiele browser. Geen build-stap, geen dependencies, geen
internetverbinding.

## Gebruiken

Zet de map `chess-ereader/` op een webserver (bijvoorbeeld GitHub Pages) en
open `index.html` in de browser van je e-reader. Sideloaden en lokaal openen
via `file://` werkt in de meeste browsers ook: alle bestanden verwijzen
relatief naar elkaar en er zijn geen externe afhankelijkheden.

## Functies

**Volledige schaakregels** — rokade (kort en lang), en passant, promotie met
keuzemenu, schaak, schaakmat en pat. Remise door de 50-zettenregel,
drievoudige zetherhaling en onvoldoende materiaal.

**Vier varianten**

| Variant | Regel |
|---|---|
| Standaard schaak | De klassieke regels |
| Chess960 | Willekeurige opstelling op de achterste rij; rokade werkt volgens de Chess960-regels |
| King of the Hill | Je wint ook door je koning veilig op d4, e4, d5 of e5 te krijgen |
| Drie schaken | Je wint zodra je drie keer schaak hebt gegeven |

**Zes computerniveaus** — van *Beginner* (speelt vaak willekeurig) tot
*Expert*. Elk niveau heeft een eigen zoekdiepte én een tijdsbudget: de
computer zoekt zo diep als hij binnen die tijd haalt, waardoor de sterkte
zich vanzelf aanpast aan hoe snel het toestel is. Of speel met z'n tweeën op
één toestel.

**Elf kleurenthema's** — Bos, Hout, Oceaan, Koraal, Lavendel, Munt,
Zonsondergang, Papier, Grafiet, Nacht en Hoog contrast.

**Drie stukkenstijlen** — Klassiek (Staunton-silhouetten), Modern (vlakker en
geometrischer) en Symbolen (Unicode-tekens, het lichtst voor trage toestellen).

**Verder** — zetlijst in standaardnotatie, geslagen materiaal met
puntenvoorsprong, zet terugnemen, bord draaien, opgeven, remise, coördinaten
langs de rand, en FEN-notatie importeren en exporteren om een stelling te
delen. Instellingen worden onthouden.

## Waarom dit anders is dan een gewone webapp

E-readers zijn een lastige doelgroep: oude browsers, trage processors,
e-inkschermen die animaties niet aankunnen, en bediening via aanraking **of**
fysieke knoppen. Daarom:

- **Pure ES5 JavaScript.** Geen `let`/`const`, arrow functions, classes of
  template literals — alleen taalfeatures die al sinds ongeveer 2010 overal
  werken. Geen frameworks, geen CDN, geen build-stap.
- **Geen animaties of transities.** E-inkschermen laten schaduwbeelden achter
  bij herhaald hertekenen, dus het scherm wordt in één keer bijgewerkt.
- **Kleuren gekozen voor kleuren-e-ink.** Kaleido-achtige schermen leggen een
  kleurfilter over een grijswaardenpaneel, wat de verzadiging fors dempt.
  Elk thema houdt daarom een duidelijk *helderheidsverschil* tussen lichte en
  donkere velden aan, zodat het bord ook op een zwart-wit e-reader klopt. Het
  thema *Grafiet* is speciaal voor zulke schermen.
- **Tabel-layout voor het bord**, de meest universeel ondersteunde
  layoutmethode — werkt ook zonder degelijke flexbox- of grid-ondersteuning.
- **Twee onafhankelijke bedieningen**: tikken op een veld, of de
  pijltjestoetsen met Enter/spatie voor e-readers met alleen knoppen.
- **Alles lokaal.** Geen externe requests, dus volledig offline bruikbaar.

## Opbouw

| Bestand | Rol |
|---|---|
| `chess-engine.js` | Spelregels: zetgeneratie, varianten, FEN, notatie |
| `ai.js` | Computertegenstander en de niveaus |
| `pieces.js` | De drie stukkenstijlen als SVG |
| `themes.js` | De elf kleurenthema's |
| `app.js` | Bediening en scherm |
| `style.css` | Vormgeving, volledig via CSS-variabelen |

`chess-engine.js` en `ai.js` zijn UMD-modules en werken ook los in Node.js.

## Correctheid

De zetgeneratie is geverifieerd met perft-tellingen tegen de bekende
referentieposities: de startstelling tot en met diepte 5 (4.865.609
stellingen), "Kiwipete" tot diepte 4, en de standaardposities 3 tot en met 6
— posities die speciaal gemaakt zijn om fouten rond rokade, en passant,
promotie en penningen bloot te leggen. Positie 5 is tot diepte 5 getest
(89.941.194 stellingen). De Chess960-rokade is apart geverifieerd tegen
Chess960-referentieposities. Alle waarden komen exact overeen.
