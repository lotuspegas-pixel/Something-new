# Aanpassingen aan de vendor-bestanden

Deze map bevat bibliotheken van derden. Ze zijn op een paar punten
aangepast omdat de originelen op Safari (en dus op iPhone en iPad) niet
werken. Haal je hier een nieuwe versie binnen, voer dan onderstaande
wijzigingen opnieuw door — anders komen de fouten terug die ze oplossen.

## peerjs.min.js

### 1. Optional chaining weggehaald (`?.`)

Twee keer `close(e){if(e?.flush)` vervangen door `close(e){if(e&&e.flush)`.

Safari 12 (iOS 12, o.a. de iPad mini uit 2013) kent `?.` niet. Eén zo'n
teken maakt het hele bestand onleesbaar voor die browser, waarna er niets
meer laadt — niet alleen PeerJS. `build.js` controleert dit: alle
JS-bestanden worden met acorn als ES2018 geparseerd en de build faalt als
er nieuwere syntaxis in staat.

### 2. Standaard ICE-lijst uitgesplitst

    // was
    {urls:["turn:eu-0.turn.peerjs.com:3478","turn:us-0.turn.peerjs.com:3478"], ...}
    // nu
    {urls:"turn:eu-0.turn.peerjs.com:3478", ...},{urls:"turn:us-0.turn.peerjs.com:3478", ...}

WebKit gaat niet betrouwbaar om met één ICE-ingang die meerdere URL's
bevat. PeerJS gebruikt deze lijst bij het laden voor zijn eigen
functietest (`util.supports`), nog vóór de app ook maar iets doet. Loopt
die test stuk, dan concludeert PeerJS dat de browser geen WebRTC kan — en
werkt de babyfoon helemaal niet meer, zonder bruikbare foutmelding.

De app geeft zelf een eigen ICE-lijst mee (zie `ICE` in `js/app.js`), die
om dezelfde reden ook één URL per ingang heeft. `test/e2e-webkit.js`
bewaakt beide: scenario C laat het opzetten van een verbinding mislukken
zodra er érgens nog een ingang met meerdere URL's opduikt.
