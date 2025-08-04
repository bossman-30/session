const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const SESSION_FOLDER = './auth_info';
if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

let sock;
let currentQR = null;
let connectedUser = null;

async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

    sock = makeWASocket({ auth: state });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            currentQR = qr;
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) {
                startWhatsApp();
            } else {
                console.log('Logged out. Delete auth_info to login again.');
            }
            connectedUser = null;
            currentQR = null;
        } else if (connection === 'open') {
            console.log('Connected to WhatsApp');
            connectedUser = sock.user;
            currentQR = null;
        }
    });
}

startWhatsApp();

// API to get QR code or session info
app.get('/api/status', (req, res) => {
    if (connectedUser) {
        res.json({ success: true, status: 'connected', sessionId: connectedUser.id });
    } else if (currentQR) {
        res.json({ success: true, status: 'waiting', qr: currentQR });
    } else {
        res.json({ success: false, status: 'initializing' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ success: true, status: connectedUser ? 'connected' : 'disconnected', user: connectedUser || null });
});

app.listen(PORT, () => {
    console.log(`WhatsApp QR Server running at http://localhost:${PORT}`);
});
