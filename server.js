const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(__dirname));

// Add support for Azure's port configuration
const port = process.env.PORT || 3000;

// Create WebSocket server with path for Azure routing
const wss = new WebSocket.Server({ 
    server: server,
    path: '/ws' // Add explicit path for Azure routing
});

// Track connected clients with screen numbers
const clients = new Map();
const registeredScreens = new Map(); // screenNumber -> Set of clientIds
let seedClient = null;
let currentPreset = null;

console.log('AI Lab WebSocket Server Starting...');

wss.on('connection', (ws, req) => {
    const clientId = generateClientId();
    console.log(`New client connected: ${clientId}`);
    
    // Store client info
    clients.set(clientId, {
        ws: ws,
        mode: 'peer', // default to peer mode
        screenNumber: null,
        ip: req.socket.remoteAddress,
        connected: Date.now()
    });

    // Send welcome message with current state
    ws.send(JSON.stringify({
        type: 'connected',
        clientId: clientId,
        currentPreset: currentPreset,
        peersCount: Array.from(clients.values()).filter(c => c.mode === 'peer').length,
        registeredScreens: registeredScreens.size
    }));

    // Handle incoming messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(clientId, data);
        } catch (error) {
            console.error('Invalid JSON received:', error);
        }
    });

    // Handle client disconnect
    ws.on('close', () => {
        console.log(`Client disconnected: ${clientId}`);
        
        const client = clients.get(clientId);
        if (client && client.screenNumber) {
            const screenClients = registeredScreens.get(client.screenNumber);
            if (screenClients) {
                screenClients.delete(clientId);
                if (screenClients.size === 0) {
                    registeredScreens.delete(client.screenNumber);
                }
            }
            console.log(`Client removed from Screen ${client.screenNumber}`);
        }
        
        // If this was the seed client, clear it
        if (seedClient && seedClient.clientId === clientId) {
            seedClient = null;
            console.log('Seed client disconnected');
        }
        
        clients.delete(clientId);
        
        // Update counts for remaining clients
        broadcastCounts();
        broadcastScreensList();
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
    });
});

function handleMessage(clientId, data) {
    const client = clients.get(clientId);
    if (!client) return;

    switch (data.type) {
        case 'setMode':
            handleSetMode(clientId, data.mode, data.screenNumber);
            break;
            
        case 'registerScreen':
            handleRegisterScreen(clientId, data.screenNumber);
            break;
            
        case 'selectPreset':
            handleSelectPreset(clientId, data.preset, data.demos);
            break;
            
        case 'sendIndividualDemo':
            handleSendIndividualDemo(clientId, data.screenNumber, data.demo);
            break;
            
        case 'ping':
            // Respond to ping with pong
            client.ws.send(JSON.stringify({ type: 'pong' }));
            break;
            
        default:
            console.log(`Unknown message type: ${data.type}`);
    }
}

function handleSetMode(clientId, mode, screenNumber) {
    const client = clients.get(clientId);
    if (!client) return;

    const oldMode = client.mode;
    client.mode = mode;
    
    // Update screen number if provided
    if (screenNumber) {
        client.screenNumber = screenNumber;
    }
    
    console.log(`Client ${clientId} switched from ${oldMode} to ${mode}${screenNumber ? ` (Screen ${screenNumber})` : ''}`);

    if (mode === 'seed') {
        // If there's already a seed, notify the old one
        if (seedClient && seedClient.clientId !== clientId) {
            const oldSeed = clients.get(seedClient.clientId);
            if (oldSeed) {
                oldSeed.ws.send(JSON.stringify({
                    type: 'seedTakenOver',
                    message: 'Another device has become the seed controller'
                }));
            }
        }
        
        // Set new seed
        seedClient = { clientId: clientId };
        
        // Send current counts and screen list to new seed
        broadcastToSeed();
        
    } else if (mode === 'peer') {
        // If this client was the seed, clear it
        if (seedClient && seedClient.clientId === clientId) {
            seedClient = null;
        }
        
        // Send current preset to new peer
        if (currentPreset) {
            client.ws.send(JSON.stringify({
                type: 'presetSelected',
                preset: currentPreset.name,
                demos: currentPreset.demos
            }));
        }
    }
    
    // Update counts for all clients
    broadcastCounts();
}

function handleRegisterScreen(clientId, screenNumber) {
    const client = clients.get(clientId);
    if (!client) return;
    
    // Remove client from previous screen if any
    if (client.screenNumber) {
        const oldScreenClients = registeredScreens.get(client.screenNumber);
        if (oldScreenClients) {
            oldScreenClients.delete(clientId);
            if (oldScreenClients.size === 0) {
                registeredScreens.delete(client.screenNumber);
            }
        }
    }
    
    // Initialize screen's client set if it doesn't exist
    if (!registeredScreens.has(screenNumber)) {
        registeredScreens.set(screenNumber, new Set());
    }
    
    // Register new screen number
    client.screenNumber = screenNumber;
    registeredScreens.get(screenNumber).add(clientId);
    
    console.log(`Client ${clientId} registered as Screen ${screenNumber}`);
    
    // Confirm registration
    client.ws.send(JSON.stringify({
        type: 'registrationConfirmed',
        screenNumber: screenNumber
    }));
    
    // Update counts and screen list
    broadcastCounts();
    broadcastScreensList();
}

function handleSelectPreset(clientId, presetName, demos) {
    const client = clients.get(clientId);
    if (!client || client.mode !== 'seed') {
        console.log(`Non-seed client ${clientId} tried to select preset`);
        return;
    }

    console.log(`Seed client ${clientId} selected preset: ${presetName}`);
    currentPreset = { name: presetName, demos: demos };
    
    // Send demos to all peer clients
    clients.forEach((clientInfo, peerId) => {
        if (clientInfo.mode === 'peer' && 
            clientInfo.screenNumber && 
            clientInfo.ws.readyState === WebSocket.OPEN) {
            
            // Find demo assigned to this screen
            const assignedDemo = demos.find(d => d.screenNumber === clientInfo.screenNumber) || demos[0];
            if (assignedDemo) {
                clientInfo.ws.send(JSON.stringify({
                    type: 'presetSelected',
                    preset: presetName,
                    demos: [assignedDemo],
                    screenNumber: clientInfo.screenNumber
                }));
            }
        }
    });
}

function handleSendIndividualDemo(clientId, targetScreenNumber, demo) {
    const client = clients.get(clientId);
    if (!client || client.mode !== 'seed') {
        console.log(`Non-seed client ${clientId} tried to send individual demo`);
        return;
    }
    
    // Get the Set of clients for the target screen
    const targetClients = registeredScreens.get(targetScreenNumber);
    console.log(`Attempting to send demo to screen ${targetScreenNumber}. Found ${targetClients ? targetClients.size : 0} clients`);

    if (!targetClients || targetClients.size === 0) {
        console.log(`No clients found for Screen ${targetScreenNumber}`);
        return;
    }
    
    let sentCount = 0;
    // Send to all clients registered to this screen
    for (const targetClientId of targetClients) {
        const targetClient = clients.get(targetClientId);
        console.log(`Checking client ${targetClientId} for screen ${targetScreenNumber}: ${targetClient ? 'found' : 'not found'}`);
        
        if (targetClient && targetClient.ws && targetClient.ws.readyState === WebSocket.OPEN) {
            targetClient.ws.send(JSON.stringify({
                type: 'demoSent',
                demo: demo,
                screenNumber: targetScreenNumber
            }));
            sentCount++;
            console.log(`Successfully sent demo to client ${targetClientId} on Screen ${targetScreenNumber}`);
        } else {
            console.log(`Client ${targetClientId} not available or connection not open`);
        }
    }
    
    console.log(`Demo "${demo.title}" sent to ${sentCount}/${targetClients.size} client(s) on Screen ${targetScreenNumber}`);
}

function broadcastCounts() {
    const peersCount = Array.from(clients.values()).filter(c => c.mode === 'peer').length;
    const screensCount = registeredScreens.size;
    
    // Send to seed client if exists
    if (seedClient) {
        const seed = clients.get(seedClient.clientId);
        if (seed && seed.ws.readyState === WebSocket.OPEN) {
            seed.ws.send(JSON.stringify({
                type: 'peersCount',
                count: peersCount
            }));
            seed.ws.send(JSON.stringify({
                type: 'registeredScreens',
                count: screensCount
            }));
        }
    }
}

function broadcastScreensList() {
    if (!seedClient) return;
    
    const seed = clients.get(seedClient.clientId);
    if (!seed || seed.ws.readyState !== WebSocket.OPEN) return;
    
    const screensList = [];
    registeredScreens.forEach((clientIds, screenNumber) => {
        clientIds.forEach(clientId => {
            const client = clients.get(clientId);
            screensList.push([screenNumber, {
                online: client && client.ws.readyState === WebSocket.OPEN,
                clientId: clientId
            }]);
        });
    });
    
    seed.ws.send(JSON.stringify({
        type: 'screensList',
        screens: screensList
    }));
}

function broadcastToSeed() {
    broadcastCounts();
    broadcastScreensList();
}

function generateClientId() {
    return Math.random().toString(36).substr(2, 9);
}

// Add route handler for screen numbers before starting server
app.get('/:number(\\d+)', (req, res) => {
    const screenNumber = parseInt(req.params.number);
    
    fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error loading index.html');
            return;
        }
        
        // Inject both the screen number and WebSocket configuration
        const modifiedHtml = data.replace(
            '</head>',
            `<script>
                window.autoScreenNumber = ${screenNumber};
                // Allow WebSocket path to be configured via environment
                window.WEBSOCKET_PATH = '${process.env.WEBSOCKET_PATH || '/ws'}';
            </script></head>`
        );
        
        res.send(modifiedHtml);
    });
});

// Start server
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`WebSocket server ready for connections`);
    console.log('\nUsage:');
    console.log('1. Open http://localhost:3000 in multiple browser windows/tabs');
    console.log('2. Set one window to "Seed Mode" (your controller)');
    console.log('3. Keep others in "Peer Mode" (your demo screens)');
    console.log('4. Select industry presets from the seed to control all peers\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    wss.clients.forEach((ws) => {
        ws.close();
    });
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});