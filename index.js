// Debug function
function debugLog(message) {
    console.log('[AI Lab Debug] ' + new Date().toLocaleTimeString() + ': ' + message);
}

debugLog('Script started');

// Application state
let currentMode = 'peer';
let screenNumber = null;
let ws = null;
let connectionAttempts = 0;
let maxReconnectAttempts = 5;
let connectedPeers = 0;
let registeredScreens = 0;
let connectedScreensList = new Map();
let selectedPresetId = null;
let modePanelTimeout = null;
let reconnectTimeout = null;

// Data storage
let presets = JSON.parse(localStorage.getItem('labPresets')) || getDefaultPresets();
let demos = JSON.parse(localStorage.getItem('labDemos')) || getDefaultDemos();

// DOM elements - will be set after DOM loads
let connectionIndicator, modePanel, seedBtn, peerBtn, adminBtn, navbar, seedContent, peerDisplay, adminContent;

function getDefaultPresets() {
    return {
        'healthcare': {
            name: 'Healthcare Suite',
            demos: ['patient-analysis', 'medical-imaging', 'drug-discovery']
        },
        'finance': {
            name: 'Finance Solutions',
            demos: ['fraud-detection', 'risk-assessment', 'trading-algo', 'customer-service']
        },
        'manufacturing': {
            name: 'Manufacturing AI',
            demos: ['quality-control', 'predictive-maintenance', 'supply-chain']
        },
        'retail': {
            name: 'Retail Intelligence',
            demos: ['recommendation-engine', 'inventory-forecasting', 'price-optimization', 'customer-analytics']
        }
    };
}

function getDefaultDemos() {
    return {
        'patient-analysis': {
            title: 'Patient Data Analysis',
            description: 'AI-powered analysis of patient records and treatment outcomes',
            url: 'https://example.com/healthcare-demo1'
        },
        'medical-imaging': {
            title: 'Medical Image Recognition',
            description: 'Computer vision for X-ray and MRI scan analysis',
            url: 'https://example.com/healthcare-demo2'
        },
        'drug-discovery': {
            title: 'Drug Discovery Assistant',
            description: 'AI assistance in pharmaceutical research and development',
            url: 'https://example.com/healthcare-demo3'
        },
        'fraud-detection': {
            title: 'Fraud Detection System',
            description: 'Real-time transaction monitoring and anomaly detection',
            url: 'https://example.com/finance-demo1'
        },
        'risk-assessment': {
            title: 'Risk Assessment AI',
            description: 'Automated credit scoring and risk evaluation',
            url: 'https://example.com/finance-demo2'
        },
        'trading-algo': {
            title: 'Trading Algorithm',
            description: 'AI-driven market analysis and trading recommendations',
            url: 'https://example.com/finance-demo3'
        },
        'customer-service': {
            title: 'Customer Service Bot',
            description: 'Intelligent chatbot for banking customer support',
            url: 'https://example.com/finance-demo4'
        },
        'quality-control': {
            title: 'Quality Control Vision',
            description: 'Automated defect detection in manufacturing processes',
            url: 'https://example.com/manufacturing-demo1'
        },
        'predictive-maintenance': {
            title: 'Predictive Maintenance',
            description: 'AI-powered equipment failure prediction and scheduling',
            url: 'https://example.com/manufacturing-demo2'
        },
        'supply-chain': {
            title: 'Supply Chain Optimizer',
            description: 'Intelligent logistics and inventory management',
            url: 'https://example.com/manufacturing-demo3'
        },
        'recommendation-engine': {
            title: 'Recommendation Engine',
            description: 'Personalized product recommendations for customers',
            url: 'https://example.com/retail-demo1'
        },
        'inventory-forecasting': {
            title: 'Inventory Forecasting',
            description: 'AI-driven demand prediction and stock optimization',
            url: 'https://example.com/retail-demo2'
        },
        'price-optimization': {
            title: 'Price Optimization',
            description: 'Dynamic pricing based on market conditions and demand',
            url: 'https://example.com/retail-demo3'
        },
        'customer-analytics': {
            title: 'Customer Analytics',
            description: 'Behavioral analysis and customer segmentation',
            url: 'https://example.com/retail-demo4'
        }
    };
}

// Mode panel visibility management
function showModePanel() {
    debugLog('Showing mode panel');
    modePanel.classList.add('visible');
    
    // Clear existing timeout
    if (modePanelTimeout) {
        clearTimeout(modePanelTimeout);
    }
    
    // Hide after 5 seconds
    modePanelTimeout = setTimeout(() => {
        hideModePanel();
    }, 5000);
}

function hideModePanel() {
    debugLog('Hiding mode panel');
    modePanel.classList.remove('visible');
    if (modePanelTimeout) {
        clearTimeout(modePanelTimeout);
        modePanelTimeout = null;
    }
}

// WebSocket connection management
function connectWebSocket() {
    // Clear any existing reconnect timeout
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = function() {
            debugLog('Connected to WebSocket server');
            updateConnectionStatus(true);
            connectionAttempts = 0;
            
            // Auto-register screen number if it was provided in URL
            if (window.autoScreenNumber && !screenNumber) {
                screenNumber = window.autoScreenNumber;
                debugLog('Auto-registering screen number: ' + screenNumber);
                registerScreen(screenNumber);
                hideRegistrationPanel();
            }
            
            // Send current mode and screen number to server
            sendMessage({
                type: 'setMode',
                mode: currentMode,
                screenNumber: screenNumber
            });
        };
        
        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                handleServerMessage(data);
            } catch (error) {
                console.error('Error parsing server message:', error);
            }
        };
        
        ws.onclose = function() {
            debugLog('WebSocket connection closed');
            updateConnectionStatus(false);
            
            // Attempt to reconnect
            if (connectionAttempts < maxReconnectAttempts) {
                connectionAttempts++;
                debugLog(`Reconnection attempt ${connectionAttempts}/${maxReconnectAttempts}`);
                reconnectTimeout = setTimeout(connectWebSocket, 2000);
            } else {
                debugLog('Max reconnection attempts reached');
                showReconnectButton();
            }
        };
        
        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
            updateConnectionStatus(false);
        };
        
    } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        updateConnectionStatus(false);
    }
}

function showReconnectButton() {
    // Add reconnect functionality to connection indicator
    connectionIndicator.title = 'Click to reconnect';
    connectionIndicator.style.cursor = 'pointer';
    connectionIndicator.onclick = function() {
        debugLog('Manual reconnection requested');
        connectionAttempts = 0;
        connectWebSocket();
    };
}

function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        debugLog('WebSocket not connected, message not sent: ' + JSON.stringify(message));
    }
}

function handleServerMessage(data) {
    switch (data.type) {
        case 'connected':
            debugLog('Server confirmed connection: ' + data.clientId);
            break;
            
        case 'presetSelected':
            debugLog('Preset selected by seed: ' + data.preset);
            displayPreset(data.preset, data.demos);
            break;
            
        case 'demoSent':
            debugLog('Individual demo sent: ' + data.demo.title);
            displayIndividualDemo(data.demo);
            break;
            
        case 'peersCount':
            connectedPeers = data.count;
            const peersEl = document.getElementById('connectedPeers');
            if (peersEl) peersEl.textContent = connectedPeers;
            break;
            
        case 'registeredScreens':
            registeredScreens = data.count;
            const screensEl = document.getElementById('registeredScreens');
            if (screensEl) screensEl.textContent = registeredScreens;
            break;
            
        case 'screensList':
            connectedScreensList = new Map(data.screens);
            updateScreenGrid();
            break;
            
        case 'registrationConfirmed':
            screenNumber = data.screenNumber;
            const screenInput = document.getElementById('screenNumberInput');
            if (screenInput) screenInput.value = screenNumber;
            hideRegistrationPanel();
            break;
            
        case 'registrationError':
            alert(data.message);
            break;
            
        default:
            debugLog('Unknown server message: ' + data.type);
    }
}

function updateConnectionStatus(connected) {
    if (connected) {
        connectionIndicator.classList.add('connected');
        connectionIndicator.title = 'Connected';
        connectionIndicator.onclick = null; // Remove reconnect handler
    } else {
        connectionIndicator.classList.remove('connected');
        connectionIndicator.title = 'Disconnected';
    }
}

function switchMode(mode) {
    debugLog('Switching to mode: ' + mode);
    currentMode = mode;
    document.body.className = mode + '-mode';
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    navbar.classList.remove('active');
    seedContent.classList.remove('active');
    peerDisplay.classList.remove('active');
    adminContent.classList.remove('active');
    adminContent.style.display = 'none';
    const screenInput = document.getElementById('screenInput');
    if (mode === 'seed') {
        seedBtn.classList.add('active');
        navbar.classList.add('active');
        seedContent.classList.add('active');
        // Default to presets tab
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        document.querySelector('.nav-tab[data-tab="presets"]').classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById('presetsTab').classList.add('active');
        populatePresets();
        screenInput.style.display = 'none';
        hideRegistrationPanel();
    } else if (mode === 'peer') {
        peerBtn.classList.add('active');
        peerDisplay.classList.add('active');
        screenInput.style.display = 'flex';
        if (!screenNumber) {
            showRegistrationPanel();
        } else {
            hideRegistrationPanel();
        }
    } else if (mode === 'admin') {
        // "Admin mode" is a full mode switch, not just a tab
        adminBtn.classList.add('active');
        navbar.classList.add('active');
        adminContent.classList.add('active');
        adminContent.style.display = 'block';
        populateAdminPanel();
        screenInput.style.display = 'none';
        hideRegistrationPanel();
    }
    hideModePanel();
    sendMessage({
        type: 'setMode',
        mode: mode,
        screenNumber: screenNumber
    });
}

function showRegistrationPanel() {
    const overlay = document.getElementById('registrationOverlay');
    const panel = document.getElementById('registrationPanel');
    if (overlay) overlay.classList.remove('hidden');
    if (panel) panel.classList.remove('hidden');
}

function hideRegistrationPanel() {
    const overlay = document.getElementById('registrationOverlay');
    const panel = document.getElementById('registrationPanel');
    if (overlay) overlay.classList.add('hidden');
    if (panel) panel.classList.add('hidden');
}

function selectPreset(presetId) {
    const preset = presets[presetId];
    if (!preset) return;
    
    debugLog('Selecting preset: ' + preset.name);
    selectedPresetId = presetId;
    
    // Handle both old format (array of strings) and new format (array of objects)
    const preparedDemos = preset.demos.map(demo => {
        if (typeof demo === 'string') {
            // Old format: just demo ID
            return demos[demo];
        } else {
            // New format: object with demoId and screenNumber
            const demoData = demos[demo.demoId];
            if (!demoData) return null;
            return {
                ...demoData,
                screenNumber: demo.screenNumber
            };
        }
    }).filter(Boolean);

    // Send to server
    sendMessage({
        type: 'selectPreset',
        preset: preset.name,
        demos: preparedDemos
    });
    
    // Update UI
    populatePresets();
}

function displayPreset(presetName, demosList) {
    if (!screenNumber) return;
    
    const assignedDemo = demosList.find(demo => 
        !demo.screenNumber || demo.screenNumber === screenNumber
    );
    
    if (!assignedDemo) return;
    
    const demoContent = document.getElementById('demoContent');
    if (!demoContent) return;
    
    // Remove waiting state
    demoContent.classList.remove('waiting-state');
    
    // Update content
    const demoTitle = document.getElementById('demoTitle');
    const demoDescription = document.getElementById('demoDescription');
    const demoCard = document.getElementById('demoCard');
    
    if (demoTitle) demoTitle.textContent = assignedDemo.title;
    if (demoDescription) demoDescription.textContent = assignedDemo.description;
    
    // Remove any existing individual demo badge
    const existingBadge = demoContent.querySelector('.individual-demo-badge');
    if (existingBadge) existingBadge.remove();
    
    // Make clickable
    if (demoCard) {
        demoCard.onclick = () => {
            debugLog('Demo card clicked: ' + assignedDemo.title);
            window.open(assignedDemo.url, '_blank');
        };
    }
}

function displayIndividualDemo(demo) {
    const demoContent = document.getElementById('demoContent');
    const demoCard = document.getElementById('demoCard');
    const demoTitle = document.getElementById('demoTitle');
    const demoDescription = document.getElementById('demoDescription');
    
    if (demoContent && demoCard && demoTitle && demoDescription) {
        // Remove waiting state
        demoContent.classList.remove('waiting-state');
        
        // Add individual demo badge
        let badge = demoContent.querySelector('.individual-demo-badge');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'individual-demo-badge';
            demoContent.insertBefore(badge, demoCard);
        }
        badge.textContent = '⚡ Individual Demo';
        
        // Update content
        demoTitle.textContent = demo.title;
        demoDescription.textContent = demo.description;
        
        // Make clickable
        demoCard.onclick = function() {
            debugLog('Individual demo card clicked: ' + demo.title);
            window.open(demo.url, '_blank');
        };
    }
}

function populatePresets() {
    // Clean up any existing overlays first
    cleanupOverlays();
    
    const presetGrid = document.getElementById('presetGrid');
    if (!presetGrid) return;
    
    presetGrid.innerHTML = '';
    
    Object.entries(presets).forEach(([id, preset]) => {
        const card = document.createElement('div');
        card.className = `preset-card ${selectedPresetId === id ? 'selected' : ''}`;
        card.innerHTML = `
            <h3>${preset.name}</h3>
            <div class="demo-count">${preset.demos.length} demos</div>
            <button class="preset-edit-btn">Edit</button>
        `;
        
        // Click on card selects preset
        card.addEventListener('click', function(e) {
            if (!e.target.matches('.preset-edit-btn')) {
                debugLog('Preset card clicked: ' + preset.name);
                selectPreset(id);
            }
        });
        
        // Edit button opens edit panel
        const editBtn = card.querySelector('.preset-edit-btn');
        editBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            openPresetEditor(id);
        });
        
        presetGrid.appendChild(card);
    });
}

function openPresetEditor(presetId) {
    const preset = presets[presetId];
    if (!preset) return;
    
    // Clean up any existing panels first
    cleanupOverlays();
    
    // Create edit panel
    const panel = document.createElement('div');
    panel.className = 'preset-edit-panel';
    panel.innerHTML = `
        <h3>Edit Preset: ${preset.name}</h3>
        <div class="form-group">
            <label>Preset Name:</label>
            <input type="text" id="editPresetName" value="${preset.name}">
        </div>
        <div class="form-group">
            <label>Assigned Demos:</label>
            <div class="demo-selector" id="editDemoSelector"></div>
        </div>
        <button class="btn btn-primary" id="savePresetBtn">Save Changes</button>
        <button class="btn btn-danger" id="deletePresetBtn">Delete Preset</button>
        <button class="btn btn-secondary" id="cancelEditBtn">Cancel</button>
    `;
    
    // Add overlay
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'presetEditOverlay';
    
    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    
    // Populate demo selector
    const demoSelector = panel.querySelector('#editDemoSelector');
    Object.entries(demos).forEach(([demoId, demo]) => {
        const isAssigned = preset.demos.some(d => 
            (typeof d === 'string' && d === demoId) || 
            (typeof d === 'object' && d.demoId === demoId)
        );
        const assignedScreen = preset.demos.find(d => 
            typeof d === 'object' && d.demoId === demoId
        )?.screenNumber || '';
        
        const div = document.createElement('div');
        div.className = 'demo-checkbox';
        div.innerHTML = `
            <input type="checkbox" value="${demoId}" id="edit-demo-${demoId}" ${isAssigned ? 'checked' : ''}>
            <label for="edit-demo-${demoId}">${demo.title}</label>
            <input type="number" class="screen-assignment" placeholder="Screen #" min="1" max="99" value="${assignedScreen}">
        `;
        demoSelector.appendChild(div);
    });
    
    // Add event listeners
    panel.querySelector('#savePresetBtn').addEventListener('click', () => {
        savePresetChanges(presetId, panel);
    });
    
    panel.querySelector('#deletePresetBtn').addEventListener('click', () => {
        if (confirm(`Are you sure you want to delete the preset "${preset.name}"?`)) {
            delete presets[presetId];
            saveData();
            populatePresets();
            closeEditor(panel, overlay);
        }
    });
    
    panel.querySelector('#cancelEditBtn').addEventListener('click', () => {
        closeEditor(panel, overlay);
    });
    
    // Close on overlay click
    overlay.addEventListener('click', () => {
        closeEditor(panel, overlay);
    });
}

function savePresetChanges(presetId, panel) {
    const newName = panel.querySelector('#editPresetName').value.trim();
    if (!newName) {
        alert('Please enter a preset name');
        return;
    }
    
    // Collect demos with their assigned screens
    const demoAssignments = [];
    panel.querySelectorAll('#editDemoSelector input[type="checkbox"]:checked').forEach(cb => {
        const demoId = cb.value;
        const screenInput = cb.parentElement.querySelector('.screen-assignment');
        const screenNumber = screenInput && screenInput.value ? parseInt(screenInput.value) : null;
        
        demoAssignments.push({
            demoId: demoId,
            screenNumber: screenNumber
        });
    });
    
    if (demoAssignments.length === 0) {
        alert('Please select at least one demo');
        return;
    }
    
    // Update preset
    presets[presetId] = {
        name: newName,
        demos: demoAssignments
    };
    
    saveData();
    populatePresets();
    closeEditor(panel, document.querySelector('#presetEditOverlay'));
}

function closeEditor(panel, overlay) {
    if (panel && panel.parentNode) {
        panel.remove();
    }
    if (overlay && overlay.parentNode) {
        overlay.remove();
    }
}

function cleanupOverlays() {
    // Remove any orphaned overlays and edit panels
    document.querySelectorAll('.overlay, .preset-edit-panel').forEach(el => {
        if (el && el.parentNode) {
            el.remove();
        }
    });
}

function updateScreenGrid() {
    const screenGrid = document.getElementById('screenGrid');
    if (!screenGrid) return;
    
    screenGrid.innerHTML = '';
    
    // Group clients by screen number
    const screenGroups = new Map();
    connectedScreensList.forEach((screenInfo, screenNumber) => {
        if (!screenGroups.has(screenNumber)) {
            screenGroups.set(screenNumber, { online: false, clients: [] });
        }
        screenGroups.get(screenNumber).clients.push(screenInfo);
        if (screenInfo.online) {
            screenGroups.get(screenNumber).online = true;
        }
    });
    
    // Create cards for each screen
    screenGroups.forEach((screenData, screenNumber) => {
        const card = document.createElement('div');
        card.className = `screen-card ${screenData.online ? 'online' : 'offline'}`;
        
        const select = document.createElement('select');
        select.className = 'demo-select';
        select.innerHTML = '<option value="">Select Demo...</option>';
        Object.entries(demos).forEach(([id, demo]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = demo.title;
            select.appendChild(option);
        });
        
        const sendBtn = document.createElement('button');
        sendBtn.className = 'send-btn';
        sendBtn.textContent = 'Send Demo';
        sendBtn.disabled = !screenData.online;
        sendBtn.addEventListener('click', function() {
            const selectedDemo = select.value;
            if (selectedDemo) {
                debugLog('Sending demo to screen ' + screenNumber + ': ' + selectedDemo);
                sendIndividualDemo(screenNumber, selectedDemo);
            }
        });
        
        card.innerHTML = `
            <div class="screen-header">
                <div class="screen-number">Screen ${screenNumber}</div>
                <div class="screen-status ${screenData.online ? 'online' : 'offline'}">
                    ${screenData.online ? 'Online' : 'Offline'}
                    ${screenData.clients.length > 1 ? ` (${screenData.clients.length} clients)` : ''}
                </div>
            </div>
        `;
        card.appendChild(select);
        card.appendChild(sendBtn);
        
        screenGrid.appendChild(card);
    });
}

function sendIndividualDemo(screenNumber, demoId) {
    const demo = demos[demoId];
    if (!demo) return;
    
    sendMessage({
        type: 'sendIndividualDemo',
        screenNumber: screenNumber,
        demo: demo
    });
}

function populateAdminPanel() {
    populateDemoSelector();
    populateDemoList();
}

function populateDemoSelector() {
    const selector = document.getElementById('demoSelector');
    if (!selector) return;
    
    selector.innerHTML = '';
    
    Object.entries(demos).forEach(([id, demo]) => {
        const div = document.createElement('div');
        div.className = 'demo-checkbox';
        div.innerHTML = `
            <input type="checkbox" value="${id}" id="demo-${id}">
            <label for="demo-${id}">${demo.title}</label>
            <input type="number" class="screen-assignment" placeholder="Screen #" min="1" max="99">
        `;
        selector.appendChild(div);
    });
}

function populateDemoList() {
    const list = document.getElementById('demoList');
    if (!list) return;
    
    list.innerHTML = '';
    
    Object.entries(demos).forEach(([id, demo]) => {
        const item = document.createElement('div');
        item.className = 'list-item';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-danger btn-small';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', function() {
            debugLog('Delete demo clicked: ' + demo.title);
            deleteDemo(id);
        });
        
        item.innerHTML = `
            <div class="list-item-info">
                <h4>${demo.title}</h4>
                <p>${demo.description}</p>
                <small style="color: #999;">${demo.url}</small>
            </div>
            <div class="list-item-actions"></div>
        `;
        
        item.querySelector('.list-item-actions').appendChild(deleteBtn);
        list.appendChild(item);
    });
}

function saveData() {
    localStorage.setItem('labPresets', JSON.stringify(presets));
    localStorage.setItem('labDemos', JSON.stringify(demos));
}

function createPreset() {
    const nameInput = document.getElementById('newPresetName');
    if (!nameInput) return;
    
    const name = nameInput.value.trim();
    if (!name) {
        alert('Please enter a preset name');
        return;
    }
    
    // Collect demos with their assigned screens
    const demoAssignments = [];
    const checkboxes = document.querySelectorAll('#demoSelector input:checked');
    
    checkboxes.forEach(cb => {
        const demoId = cb.value;
        const screenInput = cb.parentElement.querySelector('.screen-assignment');
        const screenNumber = screenInput && screenInput.value ? parseInt(screenInput.value) : null;
        
        demoAssignments.push({
            demoId: demoId,
            screenNumber: screenNumber
        });
    });
    
    if (demoAssignments.length === 0) {
        alert('Please select at least one demo');
        return;
    }
    
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    presets[id] = {
        name: name,
        demos: demoAssignments
    };
    
    saveData();
    nameInput.value = '';
    document.querySelectorAll('#demoSelector input').forEach(cb => {
        cb.checked = false;
        const screenInput = cb.parentElement.querySelector('.screen-assignment');
        if (screenInput) screenInput.value = '';
    });
    
    debugLog('Created preset: ' + name);
    alert(`Preset "${name}" created successfully!`);
}

function createDemo() {
    const titleInput = document.getElementById('newDemoTitle');
    const descriptionInput = document.getElementById('newDemoDescription');
    const urlInput = document.getElementById('newDemoUrl');
    
    if (!titleInput || !descriptionInput || !urlInput) return;
    
    const title = titleInput.value.trim();
    const description = descriptionInput.value.trim();
    const url = urlInput.value.trim();
    
    if (!title || !description || !url) {
        alert('Please fill in all fields');
        return;
    }
    
    // Basic URL validation
    try {
        new URL(url);
    } catch (e) {
        alert('Please enter a valid URL');
        return;
    }
    
    const id = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    
    // Check if demo already exists
    if (demos[id]) {
        alert('A demo with this title already exists. Please choose a different title.');
        return;
    }
    
    demos[id] = {
        title: title,
        description: description,
        url: url
    };
    
    saveData();
    populateAdminPanel();
    titleInput.value = '';
    descriptionInput.value = '';
    urlInput.value = '';
    
    debugLog('Created demo: ' + title);
    alert(`Demo "${title}" created successfully!`);
}

function deleteDemo(id) {
    if (demos[id] && confirm(`Are you sure you want to delete the demo "${demos[id].title}"?`)) {
        delete demos[id];
        
        // Remove from presets and clean up
        Object.keys(presets).forEach(presetId => {
            presets[presetId].demos = presets[presetId].demos.filter(demo => {
                if (typeof demo === 'string') {
                    return demo !== id;
                } else {
                    return demo.demoId !== id;
                }
            });
        });
        
        saveData();
        populateAdminPanel();
        debugLog('Deleted demo: ' + id);
    }
}

function exportConfiguration() {
    const config = {
        presets: presets,
        demos: demos,
        exportDate: new Date().toISOString(),
        version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-lab-config-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    debugLog('Configuration exported');
}

function importConfiguration() {
    const fileInput = document.getElementById('importFile');
    if (fileInput) fileInput.click();
}

function resetAllData() {
    if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
        if (confirm('This will delete all your custom presets and demos. Are you absolutely sure?')) {
            localStorage.removeItem('labPresets');
            localStorage.removeItem('labDemos');
            presets = getDefaultPresets();
            demos = getDefaultDemos();
            populateAdminPanel();
            debugLog('Data reset to defaults');
            alert('All data has been reset to defaults.');
        }
    }
}

function registerScreen(number) {
    screenNumber = number;
    sendMessage({
        type: 'registerScreen',
        screenNumber: number
    });
    debugLog('Registering screen: ' + number);
}

// Set up all event listeners after DOM is loaded
function setupEventListeners() {
    debugLog('Setting up event listeners');
    
    // Connection indicator
    connectionIndicator.addEventListener('click', function(e) {
        e.stopPropagation();
        debugLog('Connection indicator clicked');
        if (!connectionIndicator.classList.contains('connected')) {
            // Try to reconnect if disconnected
            debugLog('Attempting manual reconnection');
            connectionAttempts = 0;
            connectWebSocket();
        } else if (modePanel.classList.contains('visible')) {
            hideModePanel();
        } else {
            showModePanel();
        }
    });
    
    // Hide mode panel when clicking outside
    document.addEventListener('click', function(e) {
        if (!modePanel.contains(e.target) && !connectionIndicator.contains(e.target)) {
            hideModePanel();
        }
    });
    
    // Keep panel visible when interacting with it
    modePanel.addEventListener('click', function(e) {
        e.stopPropagation();
        // Reset the timeout when user interacts with panel
        if (modePanelTimeout) {
            clearTimeout(modePanelTimeout);
            modePanelTimeout = setTimeout(() => {
                hideModePanel();
            }, 5000);
        }
    });
    
    // Tab switching functionality
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('data-tab');
            // Remove active class from all tabs
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            // Hide all tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            // Hide admin content by default
            adminContent.classList.remove('active');
            adminContent.style.display = 'none';
            // Show selected tab content or admin content
            if (tabId === 'admin') {
                adminContent.classList.add('active');
                adminContent.style.display = 'block';
                populateAdminPanel();
            } else {
                const selectedContent = document.getElementById(tabId + 'Tab');
                if (selectedContent) {
                    selectedContent.classList.add('active');
                }
                if (tabId === 'screens') {
                    updateScreenGrid();
                }
                if (tabId === 'presets') {
                    populatePresets();
                }
            }
        });
    });
    
    // Mode buttons (these still call switchMode)
    seedBtn.addEventListener('click', function(e) {
        e.preventDefault();
        debugLog('Seed button clicked');
        switchMode('seed');
    });
    peerBtn.addEventListener('click', function(e) {
        e.preventDefault();
        debugLog('Peer button clicked');
        switchMode('peer');
    });
    adminBtn.addEventListener('click', function(e) {
        e.preventDefault();
        debugLog('Admin button clicked');
        switchMode('admin');
    });
    
    // Registration buttons
    const registerBtn = document.getElementById('registerBtn');
    const modalRegisterBtn = document.getElementById('modalRegisterBtn');
    const skipRegistrationBtn = document.getElementById('skipRegistration');
    
    if (registerBtn) {
        registerBtn.addEventListener('click', function() {
            const input = document.getElementById('screenNumberInput');
            if (input && input.value) {
                const num = parseInt(input.value);
                if (num > 0 && num <= 99) {
                    registerScreen(num);
                } else {
                    alert('Please enter a screen number between 1 and 99');
                }
            }
        });
    }
    
    if (modalRegisterBtn) {
        modalRegisterBtn.addEventListener('click', function() {
            const input = document.getElementById('modalScreenInput');
            if (input && input.value) {
                const num = parseInt(input.value);
                if (num > 0 && num <= 99) {
                    registerScreen(num);
                } else {
                    alert('Please enter a screen number between 1 and 99');
                }
            }
        });
    }
    
    if (skipRegistrationBtn) {
        skipRegistrationBtn.addEventListener('click', function() {
            hideRegistrationPanel();
        });
    }
    
    // Admin panel buttons (Create Demo/Preset, Export/Import/Reset)
    const createPresetBtn = document.getElementById('createPresetBtn');
    const createDemoBtn = document.getElementById('createDemoBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const resetBtn = document.getElementById('resetBtn');
    const importFile = document.getElementById('importFile');
    
    if (createPresetBtn) {
        createPresetBtn.addEventListener('click', createPreset);
    }
    if (createDemoBtn) {
        createDemoBtn.addEventListener('click', createDemo);
    }
    if (exportBtn) {
        exportBtn.addEventListener('click', exportConfiguration);
    }
    if (importBtn) {
        importBtn.addEventListener('click', importConfiguration);
    }
    if (resetBtn) {
        resetBtn.addEventListener('click', resetAllData);
    }
    if (importFile) {
        importFile.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const config = JSON.parse(e.target.result);
                        if (config.presets && config.demos) {
                            if (validateImportedData(config)) {
                                presets = config.presets;
                                demos = config.demos;
                                saveData();
                                populateAdminPanel();
                                populatePresets();
                                alert('Configuration imported successfully!');
                                debugLog('Configuration imported');
                            } else {
                                throw new Error('Invalid data structure');
                            }
                        } else {
                            throw new Error('Missing presets or demos');
                        }
                    } catch (error) {
                        console.error('Import error:', error);
                        alert('Failed to import configuration: ' + error.message);
                    }
                };
                reader.readAsText(file);
            }
        });
    }
}

function validateImportedData(config) {
    // Basic validation of imported data structure
    try {
        // Check presets
        for (const [id, preset] of Object.entries(config.presets)) {
            if (!preset.name || !Array.isArray(preset.demos)) {
                return false;
            }
        }
        
        // Check demos
        for (const [id, demo] of Object.entries(config.demos)) {
            if (!demo.title || !demo.description || !demo.url) {
                return false;
            }
        }
        
        return true;
    } catch (e) {
        return false;
    }
}

// Initialize function to set up everything
function init() {
    debugLog('Initializing application');
    
    // Set up event listeners
    setupEventListeners();
    
    // Connect to WebSocket
    connectWebSocket();
    
    // Populate initial data
    populatePresets();
    populateAdminPanel();
    
    // Set up periodic connection check
    setInterval(() => {
        if (ws && ws.readyState === WebSocket.CLOSED) {
            updateConnectionStatus(false);
        }
    }, 5000);
}

// Run initialization after DOM content is loaded
document.addEventListener('DOMContentLoaded', function() {
    debugLog('DOM fully loaded and parsed');
    
    // Cache DOM elements
    connectionIndicator = document.getElementById('connectionIndicator');
    modePanel = document.getElementById('modePanel');
    seedBtn = document.getElementById('seedBtn');
    peerBtn = document.getElementById('peerBtn');
    adminBtn = document.getElementById('adminBtn');
    navbar = document.getElementById('navbar');
    seedContent = document.getElementById('seedContent');
    peerDisplay = document.getElementById('peerDisplay');
    adminContent = document.getElementById('adminContent');
    
    // Update screen number input if auto number is present
    if (window.autoScreenNumber) {
        const input = document.getElementById('screenNumberInput');
        if (input) input.value = window.autoScreenNumber;
    }
    
    // Initialize application
    init();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && ws && ws.readyState === WebSocket.CLOSED) {
        debugLog('Page became visible, checking connection');
        connectionAttempts = 0;
        connectWebSocket();
    }
});
