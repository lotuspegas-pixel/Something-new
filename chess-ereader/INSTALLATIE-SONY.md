# Installeren op de Sony Reader (PRS-T1 / PRS-T2)

Deze handleiding is geschreven voor de Sony PRS-T1 — te herkennen aan
*Instellingen → Informatie apparaat* met versienummer `1.0.00.xxxxx` en
ongeveer 1,35 GB intern geheugen. De stappen zijn gelijk voor de PRS-T2
(versienummer `2.x`); alleen de menunamen kunnen een klein beetje afwijken.

Goed nieuws: dit model heeft een webbrowser, en daarmee kan het de app
draaien. De app is 35 KB, dus ruimte is geen probleem.

## Wat je nodig hebt

De reader, de USB-kabel en een computer. Een internetverbinding op de reader
is **niet** nodig — de app draait volledig van het geheugen van het apparaat.

## Stap 1 — Pak het zip-bestand uit

Je krijgt een map `schaak` met daarin `index.html` en zeven andere bestanden.
Houd ze bij elkaar in die ene map; ze verwijzen naar elkaar.

## Stap 2 — Sluit de reader aan

Verbind de reader met de USB-kabel met je computer. Op het scherm van de
reader verschijnt een melding — bevestig die om de USB-verbinding te maken.

Op je computer verschijnt een schijf met de naam **READER**. Heb je een
microSD-kaart in de reader zitten, dan zie je er twee.

## Stap 3 — Kopieer de map

Sleep de hele map `schaak` naar de schijf **READER**, in de hoofdmap (dus
niet in `Books`, `Digital Editions` of een andere submap). Zo blijft het pad
straks kort en voorspelbaar.

## Stap 4 — Koppel netjes los

Gebruik *hardware veilig verwijderen* (Windows) of sleep de schijf naar de
prullenbak (Mac), en trek daarna pas de kabel eruit. De reader werkt het
geheugen dan even bij.

## Stap 5 — Open de app in de browser

Ga op de reader naar het beginscherm en open **Toepassingen** (het icoon met
de vier blokjes). Kies daar **Browser** — afhankelijk van je firmware heet
dit *Browser*, *Webbrowser* of *Internet*.

> Vraagt de reader om verbinding te maken met wifi? Dat mag je gerust
> annuleren. Voor een bestand op het apparaat zelf is geen internet nodig.

Tik in de browser op de adresbalk en typ precies dit:

```
file:///mnt/sdcard/schaak/index.html
```

Tik op Enter of *Ga*. Het schaakbord verschijnt.

### Als dat pad niet werkt

Sony gebruikt niet op elke firmware dezelfde naam voor het interne geheugen.
Probeer deze op volgorde:

```
file:///mnt/sdcard/schaak/index.html
file:///sdcard/schaak/index.html
file:///mnt/extsd/schaak/index.html
file:///mnt/media/schaak/index.html
```

Zet je de map op een microSD-kaart in plaats van in het interne geheugen, dan
is het vrijwel altijd `file:///mnt/extsd/schaak/index.html`.

**Wil je niet gokken?** Typ alleen dit in de adresbalk:

```
file:///mnt/
```

De browser toont dan een lijst met mappen. Tik jezelf door naar `schaak` en
vervolgens naar `index.html`. Zo vind je het juiste pad zonder te raden, en
je ziet meteen of de bestanden goed zijn overgekomen.

## Stap 6 — Maak er een bladwijzer van

Nu de app open staat: open het browsermenu en kies *Bladwijzer toevoegen*
(*Bookmark this page*). De volgende keer open je het schaakspel met twee
tikken in plaats van het hele pad te typen.

## Instellingen die op dit toestel het prettigst werken

Tik op **Instellingen** onder het bord.

- **Kleurenthema: Grafiet.** De PRS-T1 heeft een zwart-witscherm. Grafiet is
  precies daarvoor gemaakt en geeft het scherpste onderscheid tussen de
  velden. De kleurenthema's werken wel, maar worden op dit scherm allemaal
  als grijstinten getoond.
- **Stukken.** De browser van dit toestel kan geen SVG-tekeningen tonen. De
  app merkt dat zelf en schakelt automatisch over op de tekststukken; je
  hoeft niets te doen. In de lijst zie je dat terug als *Tekst (oude
  e-readers)*.
- **Sterkte: Beginner tot Gemiddeld.** Dit toestel heeft een trage
  processor. De app rekent binnen een tijdslimiet en wordt vanzelf wat
  zwakker in plaats van vast te lopen, maar bij *Sterk* en *Expert* zit je
  wel echt te wachten op elke zet.

## Spelen

- Tik op een stuk en daarna op het veld waar het heen moet. De stippen laten
  zien waar dat stuk naartoe mag.
- Rokeren: tik op je koning en daarna op je eigen toren.
- Elke zet ververst het e-inkscherm; dat duurt even. Dat hoort erbij en
  betekent niet dat de app vastloopt.

## Problemen oplossen

**Wit scherm, geen bord.** Vrijwel altijd een verkeerd pad. Ga terug naar
stap 5 en blader via `file:///mnt/` naar het bestand toe.

**Het bord staat er, maar de velden zijn allemaal wit.** Dan is het
stylesheet niet meegekomen. Controleer of `style.css` naast `index.html`
staat, in dezelfde map.

**Ik zie het bord maar geen stukken.** Open *Instellingen → Stukken* en kies
*Tekst (oude e-readers)*. Normaal schakelt de app hier zelf naartoe.

**Er gebeurt niets als ik tik.** Controleer in het browsermenu onder
*Instellingen* of *JavaScript inschakelen* aan staat.

**Mijn instellingen zijn na afsluiten weer weg.** Sommige firmware wist de
browseropslag bij het afsluiten. De app blijft gewoon werken; je stelt thema
en sterkte dan opnieuw in.

**Alles is heel klein of juist te groot.** De app meet het scherm zelf op bij
het laden. Ververs de pagina als je het toestel gedraaid hebt.
