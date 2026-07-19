# PetCam Plus — billing (serverless)

Eén Cloudflare Worker (`entitlement-worker.mjs`) is de complete
betaal-backend. Hij is **stateloos**: geen database, geen KV — elke
Plus-controle wordt live aan Stripe gevraagd en beantwoord met een
kortlevend ondertekend token dat alleen in de browser van de gebruiker
staat. Het factuur-vlak raakt nooit WebRTC-media aan.

## In gebruik nemen (eenmalig, ±15 minuten)

1. **Stripe**: maak een product "PetCam Plus" met een maand- en/of
   jaarprijs (bijv. €4/maand of €29/jaar — *prijs nog te bevestigen door de
   eigenaar*). Zet **Stripe Tax** aan voor EU-btw. Noteer de `price_…`-ID.
2. **Worker deployen**:
   ```sh
   npx wrangler deploy functions/entitlement-worker.mjs --name petcam-billing
   npx wrangler secret put STRIPE_SECRET_KEY   # sk_live_…
   npx wrangler secret put STRIPE_PRICE_ID     # price_…
   npx wrangler secret put TOKEN_SECRET        # lange willekeurige string
   npx wrangler secret put SITE_URL            # https://petcam.online
   ```
3. **Site configureren**: zet vóór de scripts in `serverless/index.html`
   (of in een los config-bestand):
   ```html
   <script>
     window.PETCAM_BILLING = {
       checkoutUrl: 'https://petcam-billing.<account>.workers.dev/checkout',
       verifyUrl:   'https://petcam-billing.<account>.workers.dev/verify',
       portalUrl:   'https://petcam-billing.<account>.workers.dev/portal',
       // Optioneel: dedicated TURN-relay voor Plus-gebruikers
       // turn: { urls: ['turns:relay.petcam.online:443'], username: '…', credential: '…' },
     };
   </script>
   ```
   Zonder deze configuratie toont de app de Plus-sectie als "binnenkort" en
   is er niets kapot — de gratis laag verandert niet.

## Waarom geen accounts?

De productbelofte is "geen account, geen server, geen opslag". Een klassiek
accountsysteem zou die belofte breken. In plaats daarvan: Stripe kent de
klant (e-mail + betaling), de app kent alleen een ondertekend token in
localStorage. Kwijt? Op elk apparaat opnieuw op te halen met alleen het
e-mailadres ("Restore purchase").

## Bewust NIET gebouwd

Cloud-opnames/hoogtepunten conflicteren rechtstreeks met "wij zien of
bewaren niets" en brengen zwaardere plichten mee (bewaartermijnen,
datalek-meldplicht). Als de eigenaar dit later wil: expliciete opt-in,
end-to-end versleuteld, en een eigen juridische review — buiten deze scope.
