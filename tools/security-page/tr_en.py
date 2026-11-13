# -*- coding: utf-8 -*-
# Engels origineel voor security.html. Alle andere talen volgen dezelfde sleutels.
T = {}

T['en'] = {
  "title": "How is your baby monitor secured? | BabyPhone.online",
  "desc": "How BabyPhone.online works and how live video and sound between your devices are protected by modern browser technology and WebRTC.",
  "kicker": "SECURITY & PRIVACY",
  "h1": "How BabyPhone.online works — and how your connection stays private",
  "lede": "BabyPhone.online turns two devices you already own into a baby monitor. One stays with your baby, the other comes with you. Here is how the connection is made, and how modern browser security protects your live video and sound — in plain language, without jargon.",
  "readTime": "5 min read",
  "updated": "Updated August 2026",
  "cardH": "Privacy starts with the design",
  "cardP": "The goal is simple: only the two devices you paired yourself take part in the live session.",
  "cardList": [
    "Your browser asks for camera and microphone permission itself.",
    "WebRTC encrypts live video and sound while it travels.",
    "Pairing by QR code means no long codes to type over."
  ],
  "introP": "A traditional baby monitor is a pair of short-range radios you have to buy, charge and pack. BabyPhone.online takes another route: your own devices become the camera and the monitor, straight in the browser. That raises a fair question — if it runs over the internet, who else can see along?",
  "stepsH": "From two devices to a baby monitor in four steps",
  "stepsP": "No special baby-monitor hardware is needed. A phone, tablet or laptop with a modern browser is enough.",
  "steps": [
    "Open the website on the device you want to place near your baby.",
    "Your browser asks permission for the camera and microphone. Without your permission the website cannot reach them.",
    "Use the QR code to connect your second device to the same session.",
    "The two browsers build a direct, real-time link for video and sound."
  ],
  "flowH": "Your live picture is not sent as ordinary, unprotected video",
  "flowP": "BabyPhone.online uses WebRTC: the browser technology built for real-time audio and video — the same kind your browser uses for video calls.",
  "flowBaby": "Baby device",
  "flowBabySub": "camera + microphone",
  "flowLink": "WebRTC",
  "flowLinkSub": "encrypted media link",
  "flowParent": "Parent device",
  "flowParentSub": "live monitor",
  "flowNote": "Depending on the network, WebRTC connects the two devices directly, or passes the encrypted traffic through a relay (TURN) server when a direct path is blocked.",
  "layersH": "Four layers of protection, explained simply",
  "layers": [
    {"n": "1. HTTPS protects the website connection",
     "d": "Your browser reaches BabyPhone.online over HTTPS. That helps prevent others on the network from reading along or altering the page on its way to you."},
    {"n": "2. WebRTC protects live video and sound",
     "d": "WebRTC uses secure transport for real-time media, so the stream does not travel across the internet as readable, unprotected data."},
    {"n": "3. You grant camera and microphone access",
     "d": "The website cannot quietly switch on your camera. Your browser shows its own permission prompt, and you can withdraw that permission later."},
    {"n": "4. The QR code links the right session",
     "d": "Scanning removes typing mistakes, and the scanning device carries a one-time token. Anyone who typed the code by hand still has to be approved on the baby device's own screen."}
  ],
  "honestH": "What does “encrypted” actually mean?",
  "honestP": "Encryption matters, but real safety is more than a padlock icon. So here is what the technology does — and what it does not do.",
  "doesH": "What WebRTC does",
  "does": [
    "Encrypts live video and sound while it travels.",
    "Connects your devices directly whenever the network allows it.",
    "Passes encrypted media through a relay when a direct connection is not possible."
  ],
  "youH": "What you should do as well",
  "you": [
    "Do not share your QR code. Anyone who sees an active pairing code may try to join that session.",
    "Lock your devices. An unlocked phone is a bigger risk than the internet connection itself.",
    "Keep your browser current. Security updates for iOS, Android and your browser stay important."
  ],
  "noticeLead": "Worth knowing:",
  "notice": " “encrypted” does not automatically mean every app uses the same security model. WhatsApp has its own end-to-end protocol with identity keys. BabyPhone.online uses the security built into WebRTC for live browser media. The goal — never sending unprotected audio or video across the internet — is comparable, but the architecture is different, and we would rather say that plainly than borrow someone else's claim.",
  "designH": "A baby monitor should need to know as little as possible about your family",
  "designP": "That is the principle behind BabyPhone.online: as few steps as possible, no unnecessary access to your device, no account, no ads, no tracking, and a temporary live link between the two devices you paired yourself. Nothing is recorded and no server watches along.",
  "faqH": "Security in short",
  "faq": [
    {"n": "Can someone simply switch on my camera?",
     "d": "Not without camera permission from your browser. On top of that, joining a live session requires the right pairing, and a second viewer has to be approved on the baby device's own screen. So never share an active QR code or room code publicly."},
    {"n": "Can BabyPhone.online watch my video on the way?",
     "d": "WebRTC encrypts live media while it travels. When a relay server is needed because your network blocks a direct path, it only passes the protected media through — it cannot see or hear the stream."},
    {"n": "Is this the same as WhatsApp?",
     "d": "Not literally. WhatsApp uses its own end-to-end protocol with identity keys; BabyPhone.online uses WebRTC for secure real-time browser media. The purpose is comparable, the technical architecture is not the same."},
    {"n": "What can I do myself for maximum safety?",
     "d": "Use an up-to-date device and browser, keep your room code and QR private, switch on a screen lock, close the session when you are done, and open BabyPhone.online only through its official HTTPS address."}
  ],
  "ctaH": "Ready to try it?",
  "ctaP": "Two devices, no installation, no account. Open the site on both and pair them.",
  "ctaBtn": "Open BabyPhone.online",
  "toBlog": "Read the full guide: everything BabyPhone.online can do →",
  "backToApp": "← Back to the app",
}
