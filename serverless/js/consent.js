'use strict';

/**
 * BabyPhone.online — toestemming voor advertentiecookies.
 *
 * De advertentiecode van Google stond eerder onvoorwaardelijk in de <head> van
 * elke pagina. Die zet identifiers op het apparaat van de bezoeker, en dat mag
 * volgens artikel 11.7a Telecommunicatiewet pas ná toestemming. Daarom laadt
 * dat script nu nergens meer vanzelf: het wordt hieronder pas ingevoegd als de
 * bezoeker "Accepteren" kiest. Weigert die (of kiest die niets), dan gaat er
 * geen enkel verzoek naar Google.
 *
 * De babyfoon zelf werkt in beide gevallen volledig — geen cookiemuur.
 *
 * De keuze zelf staat in localStorage onder `bpo.consent`. Dat is strikt
 * noodzakelijk (het legt een wettelijke keuze vast) en vraagt dus zelf geen
 * toestemming.
 */
(function () {
  var KEY = 'bpo.consent';
  var VERSION = 1;
  var MAX_AGE = 365 * 24 * 60 * 60 * 1000; // keuze na een jaar opnieuw vragen
  var PUB = 'ca-pub-2692421969904984';
  var adsLoaded = false;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function write(ok) {
    try { localStorage.setItem(KEY, JSON.stringify({ ads: !!ok, ts: Date.now(), v: VERSION })); } catch (e) {}
  }

  function loadAds() {
    if (adsLoaded) return;
    adsLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + PUB;
    document.head.appendChild(s);
  }

  // Vertalingen: de app heeft een eigen i18n-tabel, de bijpagina's niet. Een
  // toestemmingsvraag moet in een begrijpelijke taal staan, dus houden we hier
  // een kleine eigen set aan met Engels als terugval.
  var TXT = {
    en: {
      body: 'We would like to show ads from Google to keep BabyPhone.online free. Google then stores cookies and identifiers on your device. The baby monitor works exactly the same either way.',
      accept: 'Accept ads', refuse: 'Refuse', more: 'Privacy policy', settings: 'Cookie settings',
    },
    nl: {
      body: 'We laten graag advertenties van Google zien om BabyPhone.online gratis te houden. Google plaatst daarvoor cookies en herkenningsgegevens op je apparaat. De babyfoon werkt hoe dan ook precies hetzelfde.',
      accept: 'Advertenties accepteren', refuse: 'Weigeren', more: 'Privacyverklaring', settings: 'Cookie-instellingen',
    },
    de: {
      body: 'Wir möchten Anzeigen von Google zeigen, damit BabyPhone.online kostenlos bleibt. Google speichert dafür Cookies und Kennungen auf Ihrem Gerät. Das Babyfon funktioniert in beiden Fällen genau gleich.',
      accept: 'Anzeigen akzeptieren', refuse: 'Ablehnen', more: 'Datenschutz', settings: 'Cookie-Einstellungen',
    },
    fr: {
      body: 'Nous aimerions afficher des annonces de Google pour que BabyPhone.online reste gratuit. Google enregistre alors des cookies et des identifiants sur votre appareil. Le babyphone fonctionne exactement pareil dans les deux cas.',
      accept: 'Accepter les annonces', refuse: 'Refuser', more: 'Confidentialité', settings: 'Cookies',
    },
    es: {
      body: 'Nos gustaría mostrar anuncios de Google para mantener BabyPhone.online gratis. Google guardará cookies e identificadores en tu dispositivo. El vigilabebés funciona exactamente igual en ambos casos.',
      accept: 'Aceptar anuncios', refuse: 'Rechazar', more: 'Privacidad', settings: 'Cookies',
    },
  };

  function lang() {
    var l = '';
    try { l = localStorage.getItem('babyfoon.lang') || ''; } catch (e) {}
    if (!l) l = (document.documentElement.lang || navigator.language || 'en').slice(0, 2);
    return TXT[l] ? l : 'en';
  }
  function t(k) { return (TXT[lang()] || TXT.en)[k] || TXT.en[k]; }

  var wrap = null;
  var lastFocus = null;

  function close() {
    if (!wrap) return;
    wrap.remove();
    wrap = null;
    document.removeEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  function choose(ok) { write(ok); close(); if (ok) loadAds(); }

  function onKey(e) {
    if (!wrap) return;
    // Escape telt als weigeren, nooit als toestemming.
    if (e.key === 'Escape') { e.preventDefault(); choose(false); return; }
    if (e.key !== 'Tab') return;
    var f = wrap.querySelectorAll('button, a[href]');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function show() {
    if (wrap) return;
    lastFocus = document.activeElement;
    wrap = document.createElement('div');
    wrap.className = 'ck-wrap';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', t('settings'));

    var box = document.createElement('div');
    box.className = 'ck-box';

    var p = document.createElement('p');
    p.className = 'ck-text';
    p.textContent = t('body');

    var row = document.createElement('div');
    row.className = 'ck-actions';

    // Weigeren en accepteren staan bewust náást elkaar, even groot en even
    // opvallend: een "weiger"-knop die minder zichtbaar is, is geen geldige
    // toestemming.
    var no = document.createElement('button');
    no.type = 'button'; no.className = 'ck-btn ck-no'; no.textContent = t('refuse');
    no.onclick = function () { choose(false); };

    var yes = document.createElement('button');
    yes.type = 'button'; yes.className = 'ck-btn ck-yes'; yes.textContent = t('accept');
    yes.onclick = function () { choose(true); };

    var link = document.createElement('a');
    link.className = 'ck-link'; link.href = 'privacy.html'; link.textContent = t('more');

    row.appendChild(no); row.appendChild(yes);
    box.appendChild(p); box.appendChild(row); box.appendChild(link);
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    document.addEventListener('keydown', onKey, true);
    no.focus();
  }

  var saved = read();
  if (saved && saved.v === VERSION && (Date.now() - (saved.ts || 0)) < MAX_AGE) {
    if (saved.ads === true) loadAds();
  } else if (document.body) {
    show();
  } else {
    document.addEventListener('DOMContentLoaded', show);
  }

  // Intrekken moet net zo makkelijk zijn als geven: de voettekstlink roept dit aan.
  window.BPOConsent = {
    get: function () { var c = read(); return !!(c && c.ads); },
    set: choose,
    open: function () { try { localStorage.removeItem(KEY); } catch (e) {} show(); },
    label: function () { return t('settings'); },
  };
})();
