# Installeren op een Sony e-reader

## Eerst: werkt het op jouw model?

Dit is een webapp. Hij draait in de **browser** van je e-reader. Sony heeft
lang niet in al zijn readers een browser gezet, dus dat bepaalt of het werkt.

| Model | Werkt het? |
|---|---|
| **PRS-T1, PRS-T2, PRS-T3, PRS-T3S** | **Ja.** Deze zijn op Android gebaseerd en hebben een browser onder *Applications → Browser* (op de T1 heet het *Internet Browser*). |
| PRS-350, PRS-650, PRS-950, PRS-600, PRS-505, PRS-300 | **Nee.** Deze hebben geen browser en kunnen alleen EPUB/PDF openen. Er is geen manier om hier een app op te draaien. |
| DPT-S1, DPT-RP1, DPT-CP1 (Digital Paper) | **Nee.** Alleen PDF, geen algemene browser. |

Staat je model in de tweede of derde rij, dan houdt het helaas op — die
toestellen kunnen geen JavaScript draaien. Lees dan het kopje *Als je model
geen browser heeft* onderaan.

De browser van de PRS-T-serie is oud (Android 2.x). Deze app is daar
specifiek op voorbereid: hij gebruikt geen moderne JavaScript-taalfeatures,
zet alle kleuren om naar waarden die die browser begrijpt, en schakelt
automatisch over op tekststukken als de browser geen SVG kan tonen. Je hoeft
daar zelf niets voor in te stellen.

## Installeren (PRS-T1 / T2 / T3)

Je hebt nodig: de e-reader, de meegeleverde USB-kabel en een computer.

**1. Pak het zip-bestand uit**

Je krijgt een map `schaak/` met daarin `index.html` en een handvol andere
bestanden. Houd die bestanden bij elkaar in één map — ze verwijzen naar
elkaar.

**2. Sluit de reader met USB op je computer aan**

De reader meldt zich als een USB-schijf. Op de T1/T2 moet je op het scherm
soms nog op *Ja* / *USB verbinden* tikken voordat de schijf verschijnt.

Je ziet één of twee schijven: het interne geheugen (`READER`) en, als je er
een hebt, de microSD-kaart (`SETTING` of de kaartnaam).

**3. Kopieer de map**

Sleep de hele map `schaak` naar het interne geheugen van de reader. Zet hem
in de hoofdmap (dus niet in een submap), dan is het pad straks het kortst.

**4. Koppel de reader netjes los**

Gebruik *hardware veilig verwijderen* (Windows) of sleep het schijfje naar de
prullenbak (Mac). Trek de kabel er niet zomaar uit — dan kunnen de bestanden
half geschreven achterblijven.

**5. Open de app in de browser**

Op de reader: *Applications* → *Browser*. Tik op de adresbalk en typ:

```
file:///mnt/sdcard/schaak/index.html
```

Druk op Enter/Ga. Het schaakbord verschijnt.

**Werkt dat pad niet?** Sony gebruikt niet op elk model dezelfde naam voor
het interne geheugen. Probeer deze op volgorde:

```
file:///mnt/sdcard/schaak/index.html
file:///mnt/extsd/schaak/index.html
file:///sdcard/schaak/index.html
file:///mnt/media/schaak/index.html
```

Kwam de map op een microSD-kaart terecht, dan is het bijna altijd
`file:///mnt/extsd/schaak/index.html`.

Kom je er niet uit, typ dan alleen `file:///mnt/` in de adresbalk. De browser
toont dan een mappenlijst en kun je jezelf naar `schaak/index.html`
doorklikken. Zo vind je het juiste pad zonder gokken.

**6. Maak een bladwijzer**

Nu de app open is: menu → *Bookmark this page* (Bladwijzer toevoegen). De
volgende keer open je hem in twee tikken in plaats van het pad te typen.

## Gebruiken

- Tik op een stuk en daarna op het veld waar het heen moet.
- Rokeren: tik op je koning en dan op je eigen toren.
- *Instellingen* opent de keuze voor tegenstander, sterkte, variant, thema en
  stukken. Je keuzes worden onthouden.

**Tips voor een e-inkscherm**

- Op een trage reader kun je beter niveau *Beginner* tot *Gemiddeld* nemen.
  De hogere niveaus denken langer na; de app rekent binnen een tijdslimiet en
  wordt dan gewoon wat zwakker in plaats van vast te lopen, maar je zit wel
  te wachten.
- Het thema *Grafiet* is gemaakt voor zwart-witschermen. De PRS-T-serie heeft
  een zwart-witscherm, dus dat thema zal daar het scherpst zijn.
- Ziet het bord er te groot of te klein uit, draai het toestel dan of ververs
  de pagina — de app meet het scherm opnieuw op.

## Als je model geen browser heeft

Op een PRS-505, PRS-650 en soortgelijke modellen kun je deze app niet
draaien; die toestellen voeren geen programma's uit. Wat wel kan:

- De app op een telefoon, tablet of computer gebruiken — hij werkt in elke
  browser.
- Een schaakboek als EPUB of PDF op de reader zetten. Dat is wat die
  toestellen wél kunnen.

## Problemen oplossen

**Wit scherm, geen bord.** Bijna altijd een verkeerd pad. Ga terug naar stap
5 en blader via `file:///mnt/` naar het bestand toe.

**Het bord staat er, maar de stukken zijn onzichtbaar.** Open *Instellingen*
→ *Stukken* en kies *Tekst (oude e-readers)*. Normaal schakelt de app hier
zelf naartoe, maar zo dwing je het af.

**JavaScript staat uit.** In het browsermenu onder *Settings* moet
*Enable JavaScript* aangevinkt staan.

**De instellingen worden niet onthouden.** Sommige readers wissen
browseropslag bij het afsluiten. Vervelend, maar de app zelf blijft gewoon
werken; je stelt je thema en niveau dan opnieuw in.

**Alles is heel klein.** De browser van de reader heeft een zoomfunctie in
het menu. De app zelf schaalt met de schermgrootte mee.
