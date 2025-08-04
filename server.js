// Install dependencies first: // npm install express @whiskeysockets/baileys qrcode-terminal cors

const express = require('express'); const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys'); const qrcode = require('qrcode-terminal'); const cors = require('cors'); const fs = require('fs'); const path = require('path');

const app = express(); const PORT = process.env.PORT || 3000;

app.use(cors()); app.use(express.json()); app.use(express.static(path.join(__dirname, 'public')));

// Session folder const SESSION_FOLDER = './auth_info';

// Ensure session folder exists if (!fs.existsSync(SESSION_FOLDER)) fs.mkdirSync(SESSION_FOLDER);

let sock; let currentQR = null; let connectedUser = null;

async function startWhatsApp() { const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

sock = makeWASocket({
    auth: state,
    printQRInTerminal: true // We'll also return it via API
});

sock.ev.on('creds.update', saveCreds);

sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
        console.log('Scan QR below to login:');
        qrcode.generate(qr, { small: true });
        currentQR = qr;
    }

    if (connection === 'close') {
        const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('connection closed due to', lastDisconnect.error, ', reconnecting', shouldReconnect);
        if (shouldReconnect) {
            startWhatsApp();
        } else {
            console.log('Logged out. Delete auth_info to re-login.');
        }
    } else if (connection === 'open') {
        console.log('Connected to WhatsApp');
        connectedUser = sock.user;
        currentQR = null;
    }
});

}

startWhatsApp();

// API to get current QR code or session info app.get('/api/status', (req, res) => { if (connectedUser) { res.json({ success: true, status: 'connected', sessionId: connectedUser.id }); } else if (currentQR) { res.json({ success: true, status: 'waiting', qr: currentQR }); } else { res.json({ success: false, status: 'initializing' }); } });

// API to send a message app.post('/api/send', async (req, res) => { const { number, message } = req.body; if (!number || !message) { return res.status(400).json({ success: false, error: 'number and message required' }); }

try {
    const jid = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
    await sock.sendMessage(jid, { text: message });
    res.json({ success: true, message: 'Message sent successfully' });
} catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ success: false, error: 'Failed to send message' });
}

});

// Health Check app.get('/api/health', (req, res) => { res.json({ success: true, status: connectedUser ? 'connected' : 'disconnected', user: connectedUser || null }); });

app.listen(PORT, () => { console.log(WhatsApp API Server running on http://localhost:${PORT}); });

