const { WebSocketServer } = require('ws');

const PORT = 8083;
const wss = new WebSocketServer({ port: PORT });

// Store all connected clients and their current game state
const clients = new Map();

function broadcastDirectory() {
    const directory = [];
    
    // Build the list of online, non-incognito users
    for (const [ws, data] of clients.entries()) {
        if (!data.incognito && data.username && data.id) {
            directory.push({
                id: data.id,
                username: data.username,
                ign: data.ign || 'Unknown',
                tank: data.tank || 'Basic',
                score: data.score || 0,
                x: data.x || 0,
                y: data.y || 0,
                serverHash: data.serverHash || 'None'
            });
        }
    }

    const msg = JSON.stringify({ type: 'DIRECTORY', data: directory });

    // Send the updated directory to EVERYONE
    for (const ws of clients.keys()) {
        if (ws.readyState === 1) { // WebSocket.OPEN
            ws.send(msg);
        }
    }
}

wss.on('connection', (ws, req) => {
    console.log(`[+] New connection from ${req.socket.remoteAddress}`);
    
    // Initialize empty client data
    clients.set(ws, { incognito: false });

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message);
            const data = clients.get(ws);

            switch (parsed.type) {
                case 'INIT':
                    // Client connects and authenticates
                    data.id = parsed.id;
                    data.username = parsed.username;
                    console.log(`[i] ${data.username} joined the network.`);
                    broadcastDirectory();
                    break;

                case 'UPDATE':
                    // Client sends live game stats
                    Object.assign(data, parsed.data);
                    broadcastDirectory();
                    break;

                case 'INCOGNITO':
                    // Client toggles incognito mode
                    data.incognito = parsed.state;
                    console.log(`[i] ${data.username} incognito: ${data.incognito}`);
                    broadcastDirectory();
                    break;

                case 'CHAT':
                case 'GRANT':
                case 'REVOKE':
                case 'CONTROL':
                    // Route 1-to-1 packets (Chat, Bot Delegation, Bot Controls)
                    for (const [targetWs, targetData] of clients.entries()) {
                        if (targetData.id === parsed.targetId && targetWs.readyState === 1) {
                            // Attach the sender's info so the receiver knows who it's from
                            parsed.fromId = data.id;
                            parsed.fromUsername = data.username;
                            targetWs.send(JSON.stringify(parsed));
                            break;
                        }
                    }
                    break;
            }
        } catch (e) {
            console.error("[-] Failed to parse message:", e.message);
        }
    });

    ws.on('close', () => {
        const data = clients.get(ws);
        if (data && data.username) {
            console.log(`[-] ${data.username} left the network.`);
        }
        clients.delete(ws);
        broadcastDirectory(); // Update list for everyone else
    });
});

console.log(`[✓] Arras Central Network Server running on port ${PORT}`);