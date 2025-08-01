const { default: makeWASocket, useSingleFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const QRCode = require('qrcode');
const { Boom } = require('@hapi/boom');

const app = express();
const PORT = process.env.PORT || 3000;

// Use a single file to persist the auth state
const { state, saveState } = useSingleFileAuthState('./auth_info.json');

app.use(express.static('public'));

let sessionReady = false;
let sessionData = null;

async function startSock() {
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveState);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr, lastDisconnect } = update;

        if (qr) {
            const qrDataURL = await QRCode.toDataURL(qr);
            fs.writeFileSync('./public/qr.json', JSON.stringify({ qr: qrDataURL }));
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                startSock();
            }
        } else if (connection === 'open') {
            sessionData = state.creds;
            sessionReady = true;
            fs.writeFileSync('./public/session.json', JSON.stringify(sessionData, null, 2));
        }
    });

    return sock;
}

startSock();

// API route to get QR code
app.get('/qr', (req, res) => {
    try {
        const data = fs.readFileSync('./public/qr.json');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'QR not ready yet.' });
    }
});

// API route to get session
app.get('/session', (req, res) => {
    try {
        const data = fs.readFileSync('./public/session.json');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Session not ready yet.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
