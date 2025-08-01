const express = require('express');
const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { unlinkSync, existsSync, readFileSync } = require('fs');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/generate', async (req, res) => {
  const sessionPath = './auth_info.json';
  const { state, saveState } = useSingleFileAuthState(sessionPath);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, qr } = update;

    if (qr) {
      const qrImage = await QRCode.toDataURL(qr);
      res.json({ qr: qrImage });
    }

    if (connection === 'open') {
      const sessionRaw = readFileSync(sessionPath, 'utf-8');
      res.json({ session: sessionRaw });

      sock.end();
      if (existsSync(sessionPath)) unlinkSync(sessionPath);
    }

    if (connection === 'close') {
      if ((update.lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut) {
        makeWASocket({ auth: state });
      }
    }
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
