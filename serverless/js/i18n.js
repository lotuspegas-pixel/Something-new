'use strict';

/**
 * i18n — meertaligheid voor PetCam.online (30 talen in de taalkiezer).
 *
 * Standaardtaal is Engels. De gekozen taal wordt in localStorage bewaard.
 * Elementen met data-i18n / data-i18n-ph / data-i18n-title worden automatisch
 * vertaald. Ontbrekende sleutels vallen terug op Engels.
 *
 * Alleen Engels (en) en Nederlands (nl) zijn volledig herschreven met
 * pet-copy. De overige 28 taalblokken zijn tijdelijk leeg (zie de
 * TODO-comments) en vallen daardoor volledig terug op S.en tot ze
 * vertaald worden.
 */
(function () {
  // 30 meest gesproken talen (met eigen naam). rtl = rechts-naar-links.
  const LANGS = [
    { code: 'en', name: 'English' },
    { code: 'zh', name: '中文' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'ar', name: 'العربية', rtl: true },
    { code: 'bn', name: 'বাংলা' },
    { code: 'pt', name: 'Português' },
    { code: 'ru', name: 'Русский' },
    { code: 'ur', name: 'اردو', rtl: true },
    { code: 'id', name: 'Bahasa Indonesia' },
    { code: 'de', name: 'Deutsch' },
    { code: 'ja', name: '日本語' },
    { code: 'mr', name: 'मराठी' },
    { code: 'te', name: 'తెలుగు' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'ta', name: 'தமிழ்' },
    { code: 'vi', name: 'Tiếng Việt' },
    { code: 'ko', name: '한국어' },
    { code: 'it', name: 'Italiano' },
    { code: 'th', name: 'ไทย' },
    { code: 'gu', name: 'ગુજરાતી' },
    { code: 'fa', name: 'فارسی', rtl: true },
    { code: 'pl', name: 'Polski' },
    { code: 'uk', name: 'Українська' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'pa', name: 'ਪੰਜਾਬੀ' },
    { code: 'sw', name: 'Kiswahili' },
    { code: 'ha', name: 'Hausa' },
    { code: 'ro', name: 'Română' },
  ];

  // Sleutels en Engelse basisteksten (volledig — inclusief meldingen).
  const S = {
    en: {
      language: 'Language',
      tagline: 'A private pet monitor that runs entirely in your browser. On the same Wi‑Fi network no server is needed. Choose a role to begin.',
      roleBabyTitle: 'Pet Cam',
      roleBabyDesc: 'Place near your pet. Sends live camera and sound. Shows a QR code to pair.',
      roleParentTitle: 'Owner Unit',
      roleParentDesc: "The monitor. Scan the pet cam's QR code to watch and listen.",
      pairBabyTitle: 'Pair Pet Cam',
      pairBabyStep1: 'Let the owner scan this QR code (or send the pairing code).',
      pairBabyStep2: "Scan or paste the owner's answer code.",
      yourCode: '1 · Your pairing code',
      answerFromParent: "2 · Owner's answer",
      phAnswerCode: 'Paste the answer code here…',
      pairParentTitle: 'Pair Owner Unit',
      pairParentStep1: "Scan the pet cam's QR code (or paste the code).",
      pairParentStep2: 'Let the pet cam scan your answer QR (or send the code).',
      pairCodeTitle: "1 · Pet cam's pairing code",
      phPairCode: 'Paste the pairing code here…',
      yourAnswerCode: '2 · Your answer code',
      copyCode: 'Copy code',
      scanQR: 'Scan QR',
      connect: 'Connect',
      genAnswer: 'Generate answer',
      back: 'Back',
      subtitleParent: 'Owner panel',
      subtitleBaby: 'Pet cam',
      connection: 'Connection',
      room: 'Room',
      signal: 'Signal',
      latency: 'Latency',
      nightmode: 'Night mode',
      switchCamera: 'Switch camera',
      talkIdle: 'Talk to your pet',
      talkActive: 'Talking…',
      volume: 'Volume',
      brightness: 'Brightness',
      nightlight: 'Night‑light',
      sensitivity: 'Sensitivity',
      off: 'OFF',
      record: 'Record',
      sound: 'Sound',
      alarmOn: 'Alarm on',
      alarmOff: 'Alarm off',
      cryingDetected: '🔔 Sound detected',
      lullabies: 'Comfort sounds',
      camera: 'Camera',
      microphone: 'Microphone',
      stop: 'Stop',
      live: 'LIVE',
      nightModeBadge: 'NIGHT MODE',
      connecting: 'Connecting…',
      connected: 'Connected',
      connectionLost: 'Connection interrupted',
      waitingBaby: 'Waiting for pet cam…',
      connectedToParent: 'Connected to owner unit',
      startingCamera: 'Starting camera…',
      nightlightOverlay: '💡 Night‑light on (turned on by owner)',
      trackRain: 'Rain',
      trackOcean: 'Ocean',
      trackHeartbeat: 'Heartbeat',
      trackWhite: 'White noise',
      musicTitle: 'Comfort playlist',
      musicPlay: 'Play music',
      musicStop: 'Stop music',
      musicEmpty: 'No sounds yet — add MP3s to the music folder',
      qrTapZoom: '👆 Tap the QR to enlarge it for scanning',
      qrZoomHint: "Point the other phone's camera at this code",
      roomCodeShare: 'Room code (share with the owner unit)',
      roomCodeOfBaby: 'Room code of the pet cam',
      qrScanHint: 'Let the owner scan this QR — or type the code above',
      phCode: 'CODE',
      newCode: 'New code',
      heroTitle: 'Your pet, always close.',
      heroSub: 'PetCam turns two devices into a safe pet monitor. Simple, private and right in your browser.',
      ctaStartBaby: 'Start pet cam',
      ctaConnectParent: 'Connect as owner',
      navPrivacy: 'Privacy',
      lpb1t: 'No storage', lpb1: 'No cloud. No recordings.',
      lpb2t: 'Direct connection', lpb2: 'Straight between your devices.',
      lpb3t: 'Live sound', lpb3: 'Listen instantly, no delay.',
      chooseRole: 'Choose your role to begin',
      connectWithCode: 'Connect with room code',
      connectWithQR: 'Connect with QR code',
      enterCodeHint: 'Enter the code from your pet cam.',
      scanQRHint: "Scan the pet cam's QR with your camera.",
      assureDirect: 'Direct connection', assureEncrypted: 'Encrypted', assureNoStore: 'No storage',
      trustTitle2: 'Built for calm and trust',
      lpKeyT: 'You hold the key',
      trust4t: 'Privacy first',
      lpTrust1: 'Nothing is stored. No cloud, no recordings.',
      lpTrust2: 'A direct, encrypted link between your devices.',
      lpTrust3: 'Only devices with the same code can connect.',
      lpTrust4: 'No accounts, no trackers, no ads.',
      navMonitor: 'Monitor', navAlerts: 'Alerts', navLog: 'Activity log', navSettings: 'Settings',
      parentUnitSub: 'Owner Unit · Monitoring', fullscreen: 'Fullscreen',
      audioFocus: 'Audio focus', hd: 'HD', liveAudio: 'Live audio',
      talkBack: 'Talk back', cryAlert: 'Sound alert', lullaby: 'Comfort sound',
      sleepTimer: 'Rest timer', sleepSub: 'Stops comfort sound after time',
      videoPrivacy: 'Video privacy', cameraVisible: 'Camera visible', videoHidden: 'Video hidden', tapHideVideo: 'Tap to hide the video',
      battery: 'Battery', battWaiting: 'Waiting…', charging: 'Charging', onBattery: 'On battery',
      on2: 'On', off2: 'Off', autoNoise: 'Auto noise reduction',
      excellentConn: 'Excellent connection', localOnly: 'Local network only',
      pairingCode: 'Pairing & room code', shareToConnect: 'Share to connect',
      scanToConnect: 'Scan to connect', useParentScan: 'Use the owner unit to scan',
      videoStreaming: 'Video streaming', audioStreaming: 'Audio streaming',
      audioOnly: 'Audio only', audioOnlySub: 'Stream audio without video',
      privacyShade: 'Privacy shade', hideVideoKeepAudio: 'Hide video, keep audio',
      babyTip: 'Tip: keep this browser open and the phone on its charger to stay connected. Do not switch to another app — the camera can stop in the background.',
      evBabyConnected: 'Pet cam connected', evTalk: 'Talk back used', evTalkSub: 'You spoke to your pet',
      evLullaby: 'Comfort sound started', evSound: 'Sound detected', evSoundSub: 'Above your set level',
      howTitle: 'How does it work?',
      step1t: 'By your pet', step1: 'Open PetCam.online on the phone you leave near your pet.',
      step2t: 'Pair', step2: 'Start the pet cam and scan the QR code with your own phone.',
      step3t: 'Watch live', step3: 'See and hear your pet live from your owner unit.',
      trustTitle: 'Safe and private',
      trust1t: 'No app or account', trust1: 'Just open it in your browser and pair.',
      trust2t: 'Camera and microphone only with permission', trust2: 'You allow them yourself, on your own device.',
      trust3t: 'Between your own devices', trust3: 'The connection is meant for watching live between your phones.',
      disclaimer: 'PetCam.online is an aid, not a replacement for in‑person care and supervision of your pet.',
      featTitle: 'Everything you need',
      featVideo: 'Live video', featSound: 'Sound', featTalk: 'Talk back', featNight: 'Night light',
      featAlarm: 'Sound alarm', featLullaby: 'Comfort sounds',
      featDevices: 'Works on phone, tablet and computer.',
      parentUnit: 'Owner Unit', monitoring: 'Monitoring', babyUnit: 'Pet Cam',
      footPrivacy: 'Video and sound go directly between your own devices. No recordings are stored.',
      footDisclaimer: 'An aid, not a replacement for in-person care of your pet.',
      plusTitle: 'PetCam Plus',
      plusSub: 'For the moments it really has to work.',
      plusFeat1: 'Dedicated relay — guaranteed connection on any network',
      plusFeat2: 'Watch together: multiple owner devices at once',
      plusFeat3: 'Rest & sound history',
      plusFeat4: 'Premium comfort-sound library',
      plusUpgrade: 'Upgrade to Plus',
      plusManage: 'Manage subscription',
      plusRestore: 'Restore purchase',
      plusSoon: 'Coming soon',
      plusActive: 'Plus active',
      plusEmailQ: 'Your email address (for your subscription):',
      plusError: 'Something went wrong. Please try again.',
      plusNotFound: 'No active subscription found for that email.',
      or: 'or',
      tapToTalk: 'Tap to talk',
      talkViewSub: 'Your voice plays on the pet cam while this is on.',
      soundscapes: 'Calming soundscapes, played on the pet cam.',
      nightViewSub: 'A soft, warm glow on the pet cam’s screen.',
      alertsViewSub: 'A sound on this device when noise is detected.',
      zoom: 'Zoom',
      evSleepDone: 'Rest timer finished',
      reconnecting: 'Reconnecting…',
      connectFailed: 'Could not connect. Check the code and try again.',
      retry: 'Try again',
      footTerms: 'Terms',
      footRefunds: 'Refunds',
      footAccessibility: 'Accessibility',
      footGuide: 'Guide', footContact: 'Contact',
      pairBabySub: 'Show this code (or QR) to your own phone to connect.',
      pairParentSub: 'Enter the code from the pet cam, or scan its QR.',
      waitingConnection: 'Waiting for the owner unit…',
      cameraActive: 'Camera on', micActive: 'Microphone on', micOff: 'Microphone off',
      permissionNeeded: 'Please allow camera and microphone to continue',
      permissionDenied: 'Camera/microphone blocked. Allow access in your browser and try again.',
      copied: '📋 Copied',
      copyFail: 'Copy failed — select manually',
      scanFail: "Can't open camera to scan — paste the code",
      invalidAnswer: 'Invalid answer code',
      invalidPair: 'Invalid pairing code',
      pasteAnswerFirst: 'Paste or scan the answer code first',
      pastePairFirst: 'Paste or scan the pairing code first',
      noImage: 'No image yet',
      unsupportedTitle: 'This browser can\'t run PetCam.online', unsupportedBody: 'This page needs camera, microphone and video-call support that this browser doesn\'t have. Please open petcam.online in a recent version of Chrome, Safari, Firefox or Edge.', recordVideo: 'Record', recStarted: '⏺️ Recording started',
      saved: '💾 Saved',
      recNotSupported: 'Recording not supported',
      noStream: 'No image to record yet',
      cameraSwitched: 'Camera switched',
      cannotSwitch: "Can't switch camera",
      soundMuted: 'Sound muted',
      soundOn: 'Sound on',
      stopParentQ: 'Stop the owner unit?',
      stopBabyQ: 'Stop the pet cam?',
      noMic: 'No microphone access',
      mediaError: 'Camera/microphone not available. Use https, or open in Chrome/Firefox.',
    },

    zh: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    hi: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    es: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    fr: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    ar: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    bn: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    pt: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    ru: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    ur: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    id: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    de: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    ja: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    mr: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    te: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    tr: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    ta: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    vi: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    ko: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    it: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    th: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    gu: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    fa: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    pl: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    uk: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    nl: {
      language: 'Taal', tagline: 'Een privé pet-cam die volledig in je browser draait. Op hetzelfde wifi‑netwerk is geen server nodig. Kies een rol om te beginnen.',
      roleBabyTitle: 'Pet-cam', roleBabyDesc: 'Bij je huisdier. Verzendt live camera en geluid. Toont een QR‑code om te koppelen.',
      roleParentTitle: 'Eigenaarunit', roleParentDesc: 'De monitor. Scan de QR‑code van de pet-cam om mee te kijken en te luisteren.',
      pairBabyTitle: 'Pet-cam koppelen', pairBabyStep1: 'Laat de eigenaar deze QR‑code scannen (of stuur de koppelcode).', pairBabyStep2: 'Scan of plak de antwoordcode van de eigenaar.',
      yourCode: '1 · Jouw koppelcode', answerFromParent: '2 · Antwoord van de eigenaar', phAnswerCode: 'Plak hier de antwoordcode…',
      pairParentTitle: 'Eigenaarunit koppelen', pairParentStep1: 'Scan de QR‑code van de pet-cam (of plak de code).', pairParentStep2: 'Laat de pet-cam jouw antwoord‑QR scannen (of stuur de code).',
      pairCodeTitle: '1 · Koppelcode van de pet-cam', phPairCode: 'Plak hier de koppelcode…', yourAnswerCode: '2 · Jouw antwoordcode',
      copyCode: 'Kopieer code', scanQR: 'Scan QR', connect: 'Verbinden', genAnswer: 'Genereer antwoord', back: 'Terug',
      subtitleParent: 'Eigenaar‑paneel', subtitleBaby: 'Pet-cam', connection: 'Verbinding', room: 'Kamer', signal: 'Signaal', latency: 'Vertraging',
      nightmode: 'Nachtstand', switchCamera: 'Wissel camera', talkIdle: 'Praat tegen je huisdier', talkActive: 'Aan het praten…',
      volume: 'Volume', brightness: 'Helderheid', nightlight: 'Nachtlamp', sensitivity: 'Gevoeligheid', off: 'UIT',
      record: 'Opnemen', sound: 'Geluid', alarmOn: 'Alarm aan', alarmOff: 'Alarm uit', cryingDetected: '🔔 Geluid gedetecteerd', lullabies: 'Kalmerende geluiden',
      camera: 'Camera', microphone: 'Microfoon', stop: 'Stoppen', live: 'LIVE', nightModeBadge: 'NACHTSTAND',
      connecting: 'Verbinden…', connected: 'Verbonden', connectionLost: 'Verbinding onderbroken', waitingBaby: 'Wachten op pet-cam…',
      connectedToParent: 'Verbonden met eigenaarunit', startingCamera: 'Camera starten…', nightlightOverlay: '💡 Nachtlamp aan (ingeschakeld door eigenaar)',
      trackRain: 'Regen', trackOcean: 'Oceaan', trackHeartbeat: 'Hartslag', trackWhite: 'Witte ruis',
      musicTitle: 'Kalmerende afspeellijst', musicPlay: 'Muziek afspelen', musicStop: 'Muziek stoppen', musicEmpty: 'Nog geen geluiden — voeg mp3’s toe aan de map music',
      qrTapZoom: '👆 Tik op de QR om hem groot te maken voor scannen', qrZoomHint: 'Richt de camera van de andere telefoon op deze code',
      roomCodeShare: 'Kamercode (deel met de eigenaarunit)', roomCodeOfBaby: 'Kamercode van de pet-cam', qrScanHint: 'Laat de eigenaar deze QR scannen — of typ de code hierboven', phCode: 'CODE', newCode: 'Nieuwe code',
      heroTitle: 'Je huisdier. Altijd dichtbij.',
      heroSub: 'PetCam maakt van twee apparaten een veilige huisdiercamera. Eenvoudig, privé en direct in je browser.',
      ctaStartBaby: 'Start pet-cam', ctaConnectParent: 'Verbind als eigenaar',
      navPrivacy: 'Privacy',
      lpb1t: 'Geen opslag', lpb1: 'Geen cloud. Geen opnames.',
      lpb2t: 'Directe verbinding', lpb2: 'Rechtstreeks tussen je apparaten.',
      lpb3t: 'Live geluid', lpb3: 'Direct luisteren, zonder vertraging.',
      chooseRole: 'Kies je rol om te beginnen',
      connectWithCode: 'Verbind met kamercode',
      connectWithQR: 'Verbind met QR-code',
      enterCodeHint: 'Voer de code van je pet-cam in.',
      scanQRHint: 'Scan de QR-code op de pet-cam met je camera.',
      assureDirect: 'Directe verbinding', assureEncrypted: 'Versleuteld', assureNoStore: 'Geen opslag',
      trustTitle2: 'Gebouwd voor rust en vertrouwen',
      lpKeyT: 'Jij hebt de sleutel',
      trust4t: 'Privacy eerst',
      lpTrust1: 'Er wordt niets opgeslagen. Geen cloud, geen opnames.',
      lpTrust2: 'Een directe, versleutelde verbinding tussen je apparaten.',
      lpTrust3: 'Alleen apparaten met dezelfde code kunnen verbinden.',
      lpTrust4: 'Geen accounts, geen trackers, geen advertenties.',
      navMonitor: 'Monitor', navAlerts: 'Meldingen', navLog: 'Activiteitenlog', navSettings: 'Instellingen',
      parentUnitSub: 'Eigenaarunit · Meekijken', fullscreen: 'Volledig scherm',
      audioFocus: 'Audiofocus', hd: 'HD', liveAudio: 'Live geluid',
      talkBack: 'Terugpraten', cryAlert: 'Geluidsalarm', lullaby: 'Kalmerend geluid',
      sleepTimer: 'Rusttimer', sleepSub: 'Stopt kalmerend geluid na tijd',
      videoPrivacy: 'Videoprivacy', cameraVisible: 'Camera zichtbaar', videoHidden: 'Video verborgen', tapHideVideo: 'Tik om beeld te verbergen',
      battery: 'Batterij', battWaiting: 'Wachten…', charging: 'Opladen', onBattery: 'Op batterij',
      on2: 'Aan', off2: 'Uit', autoNoise: 'Automatische ruisonderdrukking',
      excellentConn: 'Uitstekende verbinding', localOnly: 'Alleen lokaal netwerk',
      pairingCode: 'Koppel- & kamercode', shareToConnect: 'Deel om te verbinden',
      scanToConnect: 'Scan om te verbinden', useParentScan: 'Gebruik de eigenaarunit om te scannen',
      videoStreaming: 'Videostream', audioStreaming: 'Audiostream',
      audioOnly: 'Alleen geluid', audioOnlySub: 'Stream geluid zonder beeld',
      privacyShade: 'Privacyscherm', hideVideoKeepAudio: 'Verberg beeld, houd geluid',
      babyTip: 'Tip: houd deze browser open en de telefoon aan de lader om verbonden te blijven. Wissel niet naar een andere app — de camera kan op de achtergrond stoppen.',
      evBabyConnected: 'Pet-cam verbonden', evTalk: 'Terugpraten gebruikt', evTalkSub: 'Je sprak tegen je huisdier',
      evLullaby: 'Kalmerend geluid gestart', evSound: 'Geluid gedetecteerd', evSoundSub: 'Boven je ingestelde niveau',
      howTitle: 'Hoe werkt het?',
      step1t: 'Bij je huisdier', step1: 'Open PetCam.online op het toestel dat bij je huisdier ligt.',
      step2t: 'Koppelen', step2: 'Start de pet-cam en scan de QR-code met je eigen telefoon.',
      step3t: 'Live meekijken', step3: 'Kijk en luister live mee vanaf je eigenaarunit.',
      trustTitle: 'Veilig en privé',
      trust1t: 'Geen app of account', trust1: 'Gewoon openen in je browser en koppelen.',
      trust2t: 'Camera en microfoon alleen na toestemming', trust2: 'Jij geeft zelf toestemming op je eigen toestel.',
      trust3t: 'Tussen je eigen apparaten', trust3: 'De verbinding is bedoeld om live mee te kijken tussen je toestellen.',
      disclaimer: 'PetCam.online is een hulpmiddel en geen vervanging voor fysieke zorg en toezicht op je huisdier.',
      featTitle: 'Alles wat je nodig hebt',
      featVideo: 'Live video', featSound: 'Geluid', featTalk: 'Terugpraten', featNight: 'Nachtlampje',
      featAlarm: 'Geluidsalarm', featLullaby: 'Kalmerende geluiden',
      featDevices: 'Werkt op telefoon, tablet en computer.',
      parentUnit: 'Eigenaarunit', monitoring: 'Meekijken', babyUnit: 'Pet-cam',
      footPrivacy: 'Beeld en geluid gaan rechtstreeks tussen je eigen apparaten. Er worden geen beelden opgeslagen.',
      footDisclaimer: 'Een hulpmiddel, geen vervanging voor fysieke zorg voor je huisdier.',
      plusTitle: 'PetCam Plus',
      plusSub: 'Voor de momenten waarin het écht moet werken.',
      plusFeat1: 'Eigen relay — gegarandeerde verbinding op elk netwerk',
      plusFeat2: 'Samen meekijken: meerdere eigenaar‑apparaten tegelijk',
      plusFeat3: 'Rust‑ en geluidsgeschiedenis',
      plusFeat4: 'Premium bibliotheek met kalmerende geluiden',
      plusUpgrade: 'Upgrade naar Plus',
      plusManage: 'Abonnement beheren',
      plusRestore: 'Aankoop herstellen',
      plusSoon: 'Binnenkort beschikbaar',
      plusActive: 'Plus actief',
      plusEmailQ: 'Je e-mailadres (van je abonnement):',
      plusError: 'Er ging iets mis. Probeer het opnieuw.',
      plusNotFound: 'Geen actief abonnement gevonden voor dat e-mailadres.',
      or: 'of',
      tapToTalk: 'Tik om te praten',
      talkViewSub: 'Je stem klinkt op de pet-cam zolang dit aanstaat.',
      soundscapes: 'Rustgevende geluiden, afgespeeld op de pet-cam.',
      nightViewSub: 'Een zachte, warme gloed op het scherm van de pet-cam.',
      alertsViewSub: 'Een geluid op dit apparaat zodra er geluid wordt gedetecteerd.',
      zoom: 'Zoom',
      evSleepDone: 'Rusttimer afgelopen',
      reconnecting: 'Opnieuw verbinden…',
      connectFailed: 'Verbinden lukt niet. Controleer de code en probeer het opnieuw.',
      retry: 'Probeer opnieuw',
      footTerms: 'Voorwaarden',
      footRefunds: 'Terugbetaling',
      footAccessibility: 'Toegankelijkheid',
      footGuide: 'Gids', footContact: 'Contact',
      pairBabySub: 'Toon deze code (of QR) aan je eigen telefoon om te koppelen.',
      pairParentSub: 'Vul de code van de pet-cam in, of scan de QR.',
      waitingConnection: 'Wachten op de eigenaarunit…',
      cameraActive: 'Camera aan', micActive: 'Microfoon aan', micOff: 'Microfoon uit',
      permissionNeeded: 'Geef camera en microfoon toegang om verder te gaan',
      permissionDenied: 'Camera/microfoon geblokkeerd. Geef toegang in je browser en probeer opnieuw.',
    },

    pa: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    sw: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    ha: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },

    ro: {
      // TODO: pet-copy vertalen. Valt voorlopig terug op Engels (S.en).
    },
  };


  // ------------------------------------------------------------------
  // Aanvullingen (P3.3): nieuwere landing-/dashboard-/Plus-teksten voor
  // alle overige talen. De basisblokken hierboven blijven onaangeroerd;
  // deze Object.assign-lagen vullen alleen ontbrekende sleutels aan.
  // ------------------------------------------------------------------
  Object.assign(S.nl, {
    copied: "📋 Gekopieerd", copyFail: "Kopiëren mislukt — selecteer handmatig", scanFail: "Camera voor scannen niet beschikbaar — plak de code", invalidAnswer: "Ongeldige antwoordcode",
    invalidPair: "Ongeldige koppelcode", pasteAnswerFirst: "Plak of scan eerst de antwoordcode", pastePairFirst: "Plak of scan eerst de koppelcode", noImage: "Nog geen beeld",
    unsupportedTitle: "Deze browser kan PetCam.online niet gebruiken", unsupportedBody: "Deze pagina heeft camera, microfoon en video-bel-ondersteuning nodig die deze browser niet heeft. Open petcam.online in een recente versie van Chrome, Safari, Firefox of Edge.", recordVideo: "Opnemen", recStarted: "⏺️ Opname gestart", saved: "💾 Opgeslagen", recNotSupported: "Opnemen niet ondersteund", noStream: "Nog geen beeld om op te nemen",
    cameraSwitched: "Camera gewisseld", cannotSwitch: "Camera wisselen lukt niet", soundMuted: "Geluid uit", soundOn: "Geluid aan",
    stopParentQ: "Eigenaarunit stoppen?", stopBabyQ: "Pet-cam stoppen?", noMic: "Geen microfoontoegang", mediaError: "Camera/microfoon niet beschikbaar. Gebruik https of open in Chrome/Firefox.",
  });

  const STORE_KEY = 'petcam.lang';
  let current = 'en';
  const listeners = [];

  function t(key) {
    const lang = S[current] || S.en;
    return (lang[key] != null ? lang[key] : (S.en[key] != null ? S.en[key] : key));
  }

  function apply(root) {
    const scope = root || document;
    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-ph]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    listeners.forEach((fn) => {
      try { fn(); } catch (e) { /* noop */ }
    });
  }

  function setLang(code) {
    if (!S[code]) code = 'en';
    current = code;
    try { localStorage.setItem(STORE_KEY, code); } catch (e) {}
    const meta = LANGS.find((l) => l.code === code);
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute('dir', meta && meta.rtl ? 'rtl' : 'ltr');
    apply();
  }

  function detect() {
    // Expliciete ?lang= in de URL wint: dat maakt /?lang=de een deelbare en
    // door zoekmachines indexeerbare taalvariant (zie hreflang in index.html).
    try {
      const q = new URLSearchParams(location.search).get('lang');
      if (q && S[q]) return q;
    } catch (e) {}
    let saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch (e) {}
    if (saved && S[saved]) return saved;
    // Standaard Engels (op verzoek). Detecteer alleen als er geen keuze is
    // gemaakt: gebruik de browsertaal als die wordt ondersteund, anders Engels.
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return S[nav] ? nav : 'en';
  }

  // Bouw een <select> taalkiezer en koppel 'm aan een container.
  function buildSelector(container) {
    if (!container) return;
    const sel = document.createElement('select');
    sel.className = 'lang-select';
    sel.setAttribute('aria-label', 'Language');
    LANGS.forEach((l) => {
      const o = document.createElement('option');
      o.value = l.code;
      o.textContent = l.name;
      if (l.code === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => setLang(sel.value));
    container.appendChild(sel);
  }

  const I18n = {
    LANGS,
    t,
    apply,
    setLang,
    get current() { return current; },
    onChange(fn) { if (typeof fn === 'function') listeners.push(fn); },
    buildSelector,
    init() {
      current = detect();
      const meta = LANGS.find((l) => l.code === current);
      document.documentElement.setAttribute('lang', current);
      document.documentElement.setAttribute('dir', meta && meta.rtl ? 'rtl' : 'ltr');
      apply();
    },
  };

  window.I18n = I18n;
})();
