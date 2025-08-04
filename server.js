// server.js - WhatsApp Web QR Login Backend
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files

// In-memory session storage (use Redis or database in production)
const sessions = new Map();
const connectedSessions = new Map();

// Session model
class WhatsAppSession {
    constructor() {
        this.id = 'WA_' + crypto.randomBytes(8).toString('hex') + '_' + Date.now();
        this.status = 'waiting'; // waiting, connected, expired, error
        this.created = new Date();
        this.qrToken = crypto.randomBytes(16).toString('hex');
        this.qrData = `whatsapp://qr/${this.id}?token=${this.qrToken}`;
        this.scanned = false;
        this.deviceInfo = null;
        this.connectedAt = null;
        this.lastActivity = new Date();
        this.expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    }

    isExpired() {
        return new Date() > this.expiresAt;
    }

    markAsScanned(deviceInfo = null) {
        this.status = 'connected';
        this.scanned = true;
        this.connectedAt = new Date();
        this.deviceInfo = deviceInfo || 'Unknown Device';
        this.lastActivity = new Date();
    }

    updateActivity() {
        this.lastActivity = new Date();
    }

    toJSON() {
        return {
            id: this.id,
            status: this.status,
            created: this.created,
            qrData: this.qrData,
            scanned: this.scanned,
            deviceInfo: this.deviceInfo,
            connectedAt: this.connectedAt,
            lastActivity: this.lastActivity,
            expiresAt: this.expiresAt
        };
    }
}

// Utility functions
function cleanupExpiredSessions() {
    const now = new Date();
    for (const [sessionId, session] of sessions.entries()) {
        if (session.isExpired() && session.status !== 'connected') {
            sessions.delete(sessionId);
            console.log(`Cleaned up expired session: ${sessionId}`);
        }
    }
}

// Run cleanup every minute
setInterval(cleanupExpiredSessions, 60000);

// API Routes

// Create new session and generate QR code
app.post('/api/session/create', (req, res) => {
    try {
        const session = new WhatsAppSession();
        sessions.set(session.id, session);
        
        console.log(`New session created: ${session.id}`);
        
        res.json({
            success: true,
            session: session.toJSON()
        });
    } catch (error) {
        console.error('Error creating session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create session'
        });
    }
});

// Get session status
app.get('/api/session/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = sessions.get(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        if (session.isExpired() && session.status !== 'connected') {
            session.status = 'expired';
            sessions.delete(sessionId);
            return res.json({
                success: true,
                session: { ...session.toJSON(), status: 'expired' }
            });
        }
        
        res.json({
            success: true,
            session: session.toJSON()
        });
    } catch (error) {
        console.error('Error getting session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get session'
        });
    }
});

// Simulate QR code scan (for testing)
app.post('/api/session/:sessionId/scan', (req, res) => {
    try {
        const { sessionId } = req.params;
        const { deviceInfo } = req.body;
        
        const session = sessions.get(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        if (session.isExpired()) {
            return res.status(400).json({
                success: false,
                error: 'Session expired'
            });
        }
        
        if (session.status === 'connected') {
            return res.status(400).json({
                success: false,
                error: 'Session already connected'
            });
        }
        
        session.markAsScanned(deviceInfo);
        connectedSessions.set(sessionId, session);
        
        console.log(`Session scanned: ${sessionId}`);
        
        res.json({
            success: true,
            session: session.toJSON()
        });
    } catch (error) {
        console.error('Error scanning session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to scan session'
        });
    }
});

// WhatsApp webhook simulation (this would be replaced with actual WhatsApp Business API webhook)
app.post('/api/whatsapp/webhook', (req, res) => {
    try {
        const { sessionId, action, deviceInfo } = req.body;
        
        if (action === 'qr_scanned') {
            const session = sessions.get(sessionId);
            if (session && session.status === 'waiting') {
                session.markAsScanned(deviceInfo);
                connectedSessions.set(sessionId, session);
                console.log(`WhatsApp QR scanned for session: ${sessionId}`);
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ success: false });
    }
});

// Get all active sessions (admin endpoint)
app.get('/api/admin/sessions', (req, res) => {
    try {
        const activeSessions = Array.from(sessions.values())
            .filter(session => !session.isExpired())
            .map(session => session.toJSON());
        
        res.json({
            success: true,
            sessions: activeSessions,
            total: activeSessions.length
        });
    } catch (error) {
        console.error('Error getting sessions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get sessions'
        });
    }
});

// Delete session
app.delete('/api/session/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const deleted = sessions.delete(sessionId);
        connectedSessions.delete(sessionId);
        
        if (deleted) {
            console.log(`Session deleted: ${sessionId}`);
            res.json({ success: true, message: 'Session deleted' });
        } else {
            res.status(404).json({ success: false, error: 'Session not found' });
        }
    } catch (error) {
        console.error('Error deleting session:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete session'
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date(),
        sessions: {
            total: sessions.size,
            connected: connectedSessions.size
        }
    });
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`WhatsApp QR Login Server running on port ${PORT}`);
    console.log(`API endpoints available at http://localhost:${PORT}/api`);
    console.log(`Frontend available at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

module.exports = app;
