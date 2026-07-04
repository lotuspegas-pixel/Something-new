'use strict';

/**
 * Babyfoon-webapp — signaling server.
 *
 * Verantwoordelijkheden:
 *  1. Statische frontend serveren (public/).
 *  2. WebRTC ICE-configuratie leveren (STUN + TURN) zodat verbindingen ook
 *     over 3G/4G/5G en achter strenge NAT/firewalls tot stand komen.
 *  3. Een QR-code genereren voor eenvoudig koppelen tussen babyunit en ouderunit.
 *  4. WebRTC-signalering (offer/answer/ICE-candidates) doorgeven tussen de twee
 *     units in dezelfde kamer. De media (audio/video) loopt daarna peer-to-peer
 *     en gaat NIET via deze server.
 */

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');

// ---------------------------------------------------------------------------
// ICE-servers (STUN/TURN)
// ---------------------------------------------------------------------------
// STUN alleen is voldoende op de meeste wifi-netwerken. Op mobiele netwerken
// (3G/4G/5G) en achter symmetrische NAT is een TURN-server nodig die het
// verkeer relayt. Standaard gebruiken we gratis publieke STUN-servers plus de
// publieke TURN-servers van Open Relay (metered.ca). Voor productie stel je
// je eigen TURN-server in via de omgevingsvariabelen hieronder.
function buildIceServers() {
  const iceServers = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  // Eigen TURN-server via omgevingsvariabelen (aanbevolen voor productie).
  if (process.env.TURN_URL) {
    iceServers.push({
      urls: process.env.TURN_URL.split(',').map((u) => u.trim()),
      username: process.env.TURN_USERNAME || undefined,
      credential: process.env.TURN_CREDENTIAL || undefined,
    });
  } else if (process.env.DISABLE_DEFAULT_TURN !== '1') {
    // Gratis publieke TURN-fallback (Open Relay). Beperkte capaciteit —
    // bedoeld om out-of-the-box ook op mobiele netwerken te werken.
    iceServers.push(
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      }
    );
  }

  return iceServers;
}

app.get('/api/config', (req, res) => {
  res.json({ iceServers: buildIceServers() });
});

// QR-code voor een koppel-URL genereren (als SVG).
app.get('/api/qr', async (req, res) => {
  const data = String(req.query.data || '');
  if (!data || data.length > 1024) {
    return res.status(400).send('Ongeldige data');
  }
  try {
    const svg = await QRCode.toString(data, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0b1020', light: '#ffffff' },
    });
    res.type('image/svg+xml');
    res.set('Cache-Control', 'no-store');
    res.send(svg);
  } catch (err) {
    res.status(500).send('QR-generatie mislukt');
  }
});

// Serverloze variant (statisch gehost — werkt ook als los bestand geopend).
app.use(
  '/serverless',
  express.static(path.join(__dirname, 'serverless'), { extensions: ['html'] })
);

// Statische bestanden.
app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    maxAge: '1h',
  })
);

// ---------------------------------------------------------------------------
// WebSocket-signalering
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws' });

/**
 * rooms: Map<roomCode, { baby: ws|null, parent: ws|null }>
 * Elke kamer heeft maximaal één babyunit en één ouderunit.
 */
const rooms = new Map();

function getRoom(code) {
  let room = rooms.get(code);
  if (!room) {
    room = { baby: null, parent: null };
    rooms.set(code, room);
  }
  return room;
}

function otherRole(role) {
  return role === 'baby' ? 'parent' : 'baby';
}

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function cleanupRoom(code) {
  const room = rooms.get(code);
  if (room && !room.baby && !room.parent) {
    rooms.delete(code);
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.roomCode = null;
  ws.role = null;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    if (msg.type === 'join') {
      const code = String(msg.room || '').trim().toUpperCase();
      const role = msg.role === 'baby' ? 'baby' : 'parent';
      if (!/^[A-Z0-9]{4,12}$/.test(code)) {
        return send(ws, { type: 'error', reason: 'invalid-room' });
      }

      const room = getRoom(code);
      if (room[role] && room[role] !== ws) {
        // Er is al een unit met deze rol in de kamer.
        return send(ws, { type: 'error', reason: 'role-taken' });
      }

      ws.roomCode = code;
      ws.role = role;
      room[role] = ws;

      const peer = room[otherRole(role)];
      const peerPresent = !!(peer && peer.readyState === peer.OPEN);

      // De ouderunit is de "polite" peer bij perfect negotiation.
      send(ws, {
        type: 'joined',
        role,
        polite: role === 'parent',
        peerPresent,
      });

      if (peerPresent) {
        // Beide aanwezig -> beide krijgen 'ready' zodat ze mogen onderhandelen.
        send(ws, { type: 'ready' });
        send(peer, { type: 'ready', peerRejoined: true });
      }
      return;
    }

    // Signalering (offer/answer/candidate) doorsturen naar de andere unit.
    if (msg.type === 'signal') {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const peer = room[otherRole(ws.role)];
      send(peer, { type: 'signal', data: msg.data });
      return;
    }

    // Optioneel: eenvoudige besturingscommando's die ook zonder mediakanaal
    // moeten aankomen, worden via WebRTC-datachannel afgehandeld in de client.
    if (msg.type === 'bye') {
      const room = rooms.get(ws.roomCode);
      if (room) {
        const peer = room[otherRole(ws.role)];
        send(peer, { type: 'peer-left' });
      }
      return;
    }
  });

  ws.on('close', () => {
    const code = ws.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    if (room[ws.role] === ws) {
      room[ws.role] = null;
    }
    const peer = room[otherRole(ws.role)];
    send(peer, { type: 'peer-left' });
    cleanupRoom(code);
  });
});

// Houd verbindingen levend en ruim dode op.
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try {
      ws.ping();
    } catch (e) {
      /* noop */
    }
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Babyfoon-server draait op http://localhost:${PORT}`);
});
