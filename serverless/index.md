# BabyPhone.online

> A free baby monitor that runs in your browser. Two devices you already own become the baby unit and the parent unit, with live video and sound. No app to install, no account, nothing stored.

This is the plain-text version of <https://babyphone.online/>. The real page is an interactive app that needs a browser with a camera and microphone; this file is for readers that cannot run it.

## How it works

1. On the device that stays with the baby, open <https://babyphone.online/> and choose **Baby unit**. It shows a 6-character room code and a QR code.
2. On the parent's device, open the same address and choose **Parent unit**.
3. Enter the room code or scan the QR code. The two devices connect directly, and the parent sees and hears the baby live.

Setup takes under a minute. The two devices do not need to be on the same network: Wi-Fi on one side and 4G/5G on the other works.

## What you need

- Two devices with a reasonably current browser (Chrome, Safari, Firefox or Edge) and an internet connection on both.
- A camera and microphone on the baby device.
- The page must be opened over `https://`. Browsers only release the camera and microphone on `https://` or on `localhost`.
- An old phone or tablet works well as the baby device. Keep it on a charger overnight.

## Features

Live video and audio, talk-back (the parent speaks to the baby), lullabies and an MP3 playlist, night light, cry alert with adjustable sensitivity, battery status of the baby device, sleep timer, privacy shade (hide the video, keep the sound), local recording saved to the parent's own device, automatic reconnect, and an interface in 30 languages.

## Cost and privacy

- **Free, in full.** Every feature, no paid tier, no subscription, no account. No advertising and no trackers. Optional donations keep it free.
- **Nothing is stored.** Video and audio go directly between your two devices, encrypted in transit (WebRTC). No recordings are kept on a server. The site sets no cookies; the only thing kept on your device is your language choice.
- **Who can join.** A device that scans the QR code carries a 128-bit access token. A device that types the room code by hand must be approved on the baby unit's own screen.

Pairing uses the PeerJS Cloud broker; STUN is Google's and the relay used when a direct connection is impossible is the Open Relay Project. None of them can see or hear the stream.

## Limits

- It is an aid, not a replacement for supervising a baby in person.
- Both devices need internet. It cannot work fully offline; a classic short-range radio monitor is better when there is no internet.
- No infrared night vision. The built-in night light gives a soft glow on the baby device's screen instead.
- On iPhone and iPad the system pauses the browser when the device is locked or another app is opened, and no website can prevent that. Use the in-app **Screen off** button instead of the power button.

## Pages

- [About](https://babyphone.online/about.html)
- [How it works](https://babyphone.online/how-it-works.html)
- [Guide: two phones as a free baby monitor](https://babyphone.online/blog.html)
- [Security](https://babyphone.online/security.html)
- [Privacy policy](https://babyphone.online/privacy.html)
- [Terms of service](https://babyphone.online/terms.html)
- [Accessibility statement](https://babyphone.online/accessibility.html)
- [Contact and operator information](https://babyphone.online/contact.html)
- [llms.txt](https://babyphone.online/llms.txt)

Operator: Arcana Synthetica, Harlingen, Netherlands. Contact: info@babyphone.online.
