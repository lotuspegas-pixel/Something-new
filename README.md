# 👶 Babyfoon — webapp met live geluid & video

Een volwaardige babyfoon die volledig in de browser draait. Eén apparaat bij
de baby (de **babyunit**) verzendt live camera en geluid; een ander apparaat
(de **ouderunit**) kijkt en luistert mee — en ziet eruit als een echte, grote
babyfoon.

Werkt op **computer en mobiel**, over **wifi én mobiele netwerken (3G/4G/5G)**.

```
npm install
npm start
# open http://localhost:3000
```

---

## Hoe het werkt

Het beeld en geluid gaan **peer-to-peer via WebRTC** (rechtstreeks tussen de
twee apparaten), met lage vertraging. De server doet alleen de *signalering*
(het aan elkaar koppelen van de twee apparaten) en genereert de QR-code; de
video/audio loopt **niet** via de server.

```
 Babyunit  ──(camera + micro)──►  ┌──────────────┐  ◄── kijkt/luistert ──  Ouderunit
 (bij baby)                       │   WebRTC P2P  │                         (monitor)
     ▲                            └──────────────┘                              │
     └───────── terugpraten / slaapliedje / nachtlamp (datakanaal) ◄────────────┘

           Signaleringsserver (Node.js + WebSocket)  — koppelt alleen, ziet geen beeld
```

### Koppelen
1. Open de app op het apparaat bij de baby en kies **Babyunit**. Er verschijnt
   een kamercode en een QR-code.
2. Open de app op je eigen telefoon/computer, kies **Ouderunit** en vul de
   kamercode in — of scan de QR-code.

---

## Functies

- 📹 **Live video en geluid** met lage vertraging (WebRTC, peer-to-peer)
- 🎙️ **Terugpraten** naar de baby (druk-om-te-praten, tweewegaudio)
- 🔊 **Geluids-LED-meter** die het geluidsniveau bij de baby toont
- 🔔 **Instelbaar geluidsalarm**: trilt, flitst en piept bij geluid — ook als
  het scherm gedimd is
- 🎵 **Slaapliedjes & witte ruis** op afstand afspelen op de babyunit
  (Twinkle Twinkle, Brahms' wiegelied, Frère Jacques, witte/roze ruis, hartslag)
- 💡 **Nachtlamp** op afstand aanzetten bij de baby
- 🌙 **Nachtstand** (scherm dimmen + rustige grijstinten)
- ☀️ **Helderheid** en 🔈 **volume** regelen
- 🔄 **Camera wisselen** (voor/achter) en 🔦 **zaklamp** (indien ondersteund)
- 📸 **Foto maken** van het beeld
- ⛶ **Volledig scherm**
- 📶 **Signaalsterkte-indicator** (op basis van echte verbindingsstatistieken)
- 🔋 **Batterij-indicator** van de babyunit
- 🔒 **Scherm-wakker-houden** zodat de monitor aan blijft (Wake Lock API)
- 🔁 Automatisch **herstel bij netwerkwissel** (bijv. wifi → 4G)

---

## Twee varianten

Er zijn twee manieren om de app te gebruiken:

### 1. Met signaleringsserver (`public/`) — makkelijkst koppelen
Start `npm start` en koppel via een **kamercode of QR-code**. De server doet
alleen de koppeling; beeld/geluid blijft peer-to-peer. Open `http://localhost:3000`.

### 2. Serverloos (`serverless/`) — géén server nodig
Een volledig zelfstandige versie die je **zonder enige server** gebruikt. Op
hetzelfde wifi-netwerk is er letterlijk geen server nodig; koppelen gaat door
een **QR-code te scannen** of een **koppelcode te plakken** tussen de twee
apparaten. Daarna loopt alles lokaal en peer-to-peer.

- Openen kan direct als bestand (`serverless/index.html`) in **Chrome of
  Firefox**, of via `http://localhost:3000/serverless/`.
- Extra functie: **lokaal opnemen** — video/geluid opnemen en als bestand op de
  computer opslaan (via de bestandskiezer of als download), geheel offline.
- Koppelen (handmatige WebRTC-signalering):
  1. Babyunit toont een **QR-code / koppelcode**.
  2. Ouderunit **scant** die of **plakt** de code, en toont dan een
     **antwoord-QR / -code**.
  3. Babyunit scant/plakt het antwoord → verbonden.

> Let op: puur serverloos werkt binnen **hetzelfde netwerk**. Wil je over
> internet koppelen (baby thuis, jij op 4G), dan is nog steeds een publieke
> STUN/TURN-server nodig om door routers/firewalls te komen — dat kan niet
> volledig serverloos. De serverloze versie gebruikt standaard een publieke
> STUN-server; op hetzelfde wifi wordt die niet gebruikt.

---

## Ouder-paneel — "Luna Unit"

De ouderunit (`parent.html`) gebruikt een neumorf ontwerp ("Luna Unit"). Alle
knoppen zijn volledig functioneel gekoppeld aan de echte verbinding. Overbodige
knoppen uit het oorspronkelijke ontwerp zijn weggelaten of samengevoegd:

- **Weg**: dubbele aan/uit-knop, meerdere-camera-lijst + favoriet + lock,
  aparte "nachtvisie"-knop (viel samen met Nachtstand), losse kanaal-/volume±-
  knoppen (dubbel met de volumeknop), en de dubbele transportknoppen
  (shuffle/repeat/rewind/forward/pauze).
- **Behouden en werkend**: verbindingsstatus + signaal + vertraging, camera
  wisselen, zoek-unit (toon bij de baby), live beeld met dB-meter, VU-balken,
  zoom, foto, volledig scherm, terugpraten, volumeknop, helderheid, nachtlampje,
  mic-gevoeligheid, slaapmuziek (Regen/Oceaan/Hartslag/Witte ruis) met
  vorige/afspelen/volgende/stop, opnemen, geluid dempen, alarm en
  "huilen gedetecteerd", nachtstand en batterij van de babyunit.

---

## Belangrijk: HTTPS

Browsers geven **alleen toegang tot camera en microfoon via `https://` of
`localhost`**. Voor gebruik tussen verschillende apparaten (en op mobiel) moet
de app dus via HTTPS bereikbaar zijn. Zet de app achter een reverse proxy met
TLS (bijv. Caddy, Nginx, of een hostingplatform dat automatisch HTTPS regelt).

---

## Werken op mobiele netwerken (3G/4G/5G) — TURN

WebRTC heeft op streng afgeschermde netwerken (zoals mobiele data) een
**TURN-server** nodig die het verkeer relayt. Standaard gebruikt de app gratis
publieke STUN-servers plus een publieke TURN-fallback, zodat het out-of-the-box
werkt. Voor betrouwbaar productiegebruik stel je je **eigen TURN-server** in
(bijv. [coturn](https://github.com/coturn/coturn)) via omgevingsvariabelen:

| Variabele | Betekenis |
|-----------|-----------|
| `PORT` | Poort van de server (standaard `3000`) |
| `TURN_URL` | TURN-server-URL('s), komma-gescheiden (bijv. `turn:turn.example.com:3478`) |
| `TURN_USERNAME` | TURN-gebruikersnaam |
| `TURN_CREDENTIAL` | TURN-wachtwoord |
| `DISABLE_DEFAULT_TURN` | Zet op `1` om de publieke TURN-fallback uit te schakelen |

Voorbeeld:

```bash
TURN_URL="turn:turn.example.com:3478" \
TURN_USERNAME="baby" \
TURN_CREDENTIAL="geheim" \
PORT=8080 \
npm start
```

---

## Projectstructuur

```
server.js              Node.js-server: statische bestanden, ICE-config, QR, WebSocket-signalering
public/                Variant MET server (koppelen via kamercode/QR)
  index.html           Startscherm + rolkeuze + QR-koppeling
  baby.html            Babyunit (verzendt camera + geluid)
  parent.html          Ouderunit — "Luna Unit"-paneel (neumorf ontwerp)
  css/style.css        Vormgeving babyunit + startscherm
  css/luna.css         Vormgeving ouder-paneel (Luna Unit)
  fonts/               Ingebouwde lettertypes (Nunito, Quicksand) — offline
  js/
    common.js          Hulpfuncties (kamercode, opslag, wake lock)
    rtc.js             WebRTC-verbinding (perfect negotiation)
    lullaby.js         Slaapliedjes & geluiden (Web Audio API)
    baby.js            Logica van de babyunit
    parent.js          Logica van de ouderunit
serverless/            SERVERLOZE variant — Luna Unit-ontwerp, géén server nodig
  index.html           Alles-in-één: rolkeuze, QR-koppelen, baby- en ouder-paneel
  luna.css             Vormgeving (neumorf, zelfde ontwerp als de server-variant)
  fonts/               Ingebouwde lettertypes (offline)
  js/
    codec.js           Koppelcode inpakken/uitpakken (deflate + base64)
    app.js             Alle logica (handmatige signalering, opnemen, functies)
    lullaby.js         Slaapliedjes & geluiden
  vendor/              Ingebouwde open-source libs (QR tonen + scannen), offline
test/
  e2e.js               End-to-end test — variant met server
  e2e-serverless.js    End-to-end test — serverloze variant
```

---

## Testen

De end-to-end test start twee browsers (babyunit + ouderunit) met een
nep-camera en controleert of er daadwerkelijk video stroomt en of de
besturingscommando's aankomen.

De tests gebruiken Playwright (alleen voor ontwikkeling — niet nodig om de app
te draaien). Installeer die eerst apart:

```bash
npm install -D playwright   # eenmalig, alleen voor de tests
npm start &                 # start de server
npm test                    # e2e-test (variant met server)
npm run test:serverless     # e2e-test (serverloze variant)
```

---

## Techniek

- Pure standaardwebtechnologie: **WebRTC**, **WebSocket**, **Web Audio API**,
  **Wake Lock**, **Battery Status**, **Fullscreen** en **MediaDevices**.
- Backend: **Node.js** met **Express** (statisch + API) en **ws** (signalering).
- Geen accounts, geen database — koppelen gaat via een gedeelde kamercode.

## Privacy

Beeld en geluid gaan rechtstreeks tussen de twee apparaten (peer-to-peer). De
server ziet de media niet. Kies een niet te raden kamercode en deel die alleen
met jezelf.
