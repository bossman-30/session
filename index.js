const { default: makeWASocket, useSingleFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const QRCode = require('qrcode');

const { state, saveState } = useSingleFileAuthState('./auth_info.json');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let sock;
let wsClient;

app.use(express.static(__dirname)); // Serve index.html

wss.on('connection', async (ws) => {
    wsClient = ws;

    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false
    });

    sock.ev.on('creds.update', saveState);

    sock.ev.on('connection.update', async (update) => {
        const { connection, qr } = update;

        if (qr && wsClient && wsClient.readyState === WebSocket.OPEN) {
            const qrDataURL = await QRCode.toDataURL(qr);
            wsClient.send(JSON.stringify({ qr: qrDataURL }));
        }

        if (connection === 'open') {
            console.log('✅ WhatsApp connected');
            if (wsClient && wsClient.readyState === WebSocket.OPEN) {
                wsClient.send(JSON.stringify({ status: 'connected', user: sock.user }));
            }
        }

        if (connection === 'close') {
            console.log('🔴 WhatsApp connection closed');
        }
    });
});

server.listen(3000, () => {
    console.log('🔗 Server running at http://localhost:3000');
});
