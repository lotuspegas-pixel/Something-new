/**
 * BabyPhone Plus — entitlement-functie (Cloudflare Worker).
 *
 * Bewust STATELOOS: er is geen database en geen KV. Elke vraag "is dit
 * e-mailadres Plus?" wordt live aan Stripe gesteld en beantwoord met een
 * kortlevend ondertekend token. Zo slaat het factuur-vlak zelf niets op,
 * in lijn met de privacybelofte van het product. Dit vlak raakt nooit
 * WebRTC-media aan.
 *
 * Endpoints (alle JSON):
 *   POST /checkout { email }              → { url }    Stripe Checkout-sessie
 *   POST /verify   { email | session_id } → { token }  JWT (30 dagen, plan:plus)
 *   POST /portal   { email }              → { url }    Stripe-klantportaal
 *
 * Vereiste variabelen (wrangler secret put …):
 *   STRIPE_SECRET_KEY   sk_live_…  (of sk_test_…)
 *   STRIPE_PRICE_ID     price_…    (het Plus-abonnement; maak aan met Stripe Tax!)
 *   TOKEN_SECRET        lange willekeurige string (HMAC voor het token)
 *   SITE_URL            https://babyphone.online
 *
 * Deploy: npx wrangler deploy functions/entitlement-worker.js --name babyphone-billing
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, CORS),
  });
}

async function stripe(env, path, params) {
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const r = await fetch('https://api.stripe.com/v1' + path, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ? d.error.message : 'stripe error');
  return d;
}

async function stripeGet(env, path) {
  const r = await fetch('https://api.stripe.com/v1' + path, {
    headers: { Authorization: 'Bearer ' + env.STRIPE_SECRET_KEY },
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error ? d.error.message : 'stripe error');
  return d;
}

// ------------------------------------------------------------------ JWT (HS256)
const b64u = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uStr = (s) => b64u(new TextEncoder().encode(s));

async function signToken(env, payload) {
  const header = b64uStr(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64uStr(JSON.stringify(payload));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(env.TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(header + '.' + body));
  return header + '.' + body + '.' + b64u(sig);
}

// ------------------------------------------------------- Stripe-opzoekingen
async function findActiveSubByEmail(env, email) {
  const customers = await stripeGet(env, '/customers?email=' + encodeURIComponent(email) + '&limit=10');
  for (const c of customers.data || []) {
    const subs = await stripeGet(env, '/subscriptions?customer=' + c.id + '&status=active&limit=1');
    if (subs.data && subs.data.length) return subs.data[0];
    const trial = await stripeGet(env, '/subscriptions?customer=' + c.id + '&status=trialing&limit=1');
    if (trial.data && trial.data.length) return trial.data[0];
  }
  return null;
}

async function issueToken(env, email) {
  const now = Math.floor(Date.now() / 1000);
  return signToken(env, {
    sub: email,
    plan: 'plus',
    iat: now,
    exp: now + 30 * 24 * 3600, // 30 dagen; de app haalt daarna gewoon een vers token op
  });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    const url = new URL(req.url);
    let body = {};
    try { body = await req.json(); } catch (e) {}

    try {
      // ---- Checkout: start een Stripe-betaling voor Plus -------------------
      if (url.pathname === '/checkout') {
        if (!body.email) return json({ error: 'email required' }, 400);
        const session = await stripe(env, '/checkout/sessions', {
          mode: 'subscription',
          'line_items[0][price]': env.STRIPE_PRICE_ID,
          'line_items[0][quantity]': '1',
          customer_email: body.email,
          'automatic_tax[enabled]': 'true', // EU-btw via Stripe Tax
          allow_promotion_codes: 'true',
          success_url: env.SITE_URL + '/?plus_session={CHECKOUT_SESSION_ID}',
          cancel_url: env.SITE_URL + '/',
        });
        return json({ url: session.url });
      }

      // ---- Verify: e-mail of checkout-sessie → ondertekend token ----------
      if (url.pathname === '/verify') {
        let email = (body.email || '').trim().toLowerCase();
        if (body.session_id) {
          const s = await stripeGet(env, '/checkout/sessions/' + encodeURIComponent(body.session_id));
          if (s.status === 'complete' && s.customer_details && s.customer_details.email) {
            email = s.customer_details.email.toLowerCase();
          }
        }
        if (!email) return json({ error: 'email or session_id required' }, 400);
        const sub = await findActiveSubByEmail(env, email);
        if (!sub) return json({ error: 'no active subscription' }, 404);
        return json({ token: await issueToken(env, email) });
      }

      // ---- Portal: opzeggen net zo makkelijk als afsluiten -----------------
      if (url.pathname === '/portal') {
        const email = (body.email || '').trim().toLowerCase();
        if (!email) return json({ error: 'email required' }, 400);
        const customers = await stripeGet(env, '/customers?email=' + encodeURIComponent(email) + '&limit=1');
        if (!customers.data || !customers.data.length) return json({ error: 'unknown customer' }, 404);
        const portal = await stripe(env, '/billing_portal/sessions', {
          customer: customers.data[0].id,
          return_url: env.SITE_URL + '/',
        });
        return json({ url: portal.url });
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  },
};
