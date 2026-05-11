// Initial State for Reset
const INITIAL_STATE = {
    numProcesses: 5,
    numResources: 3,
    allocation: [
        [0, 1, 0],
        [2, 0, 0],
        [3, 0, 2],
        [2, 1, 1],
        [0, 0, 2]
    ],
    max: [
        [7, 5, 3],
        [3, 2, 2],
        [9, 0, 2],
        [2, 2, 2],
        [4, 3, 3]
    ],
    available: [3, 3, 2]
};

// Current State
let STATE = JSON.parse(JSON.stringify(INITIAL_STATE));
STATE.need = [];
STATE.request = Array.from({ length: STATE.numProcesses }, () => Array(STATE.numResources).fill(0));
STATE.deadlockedProcesses = [];
STATE.deadlockedEdges = []; // Track edges in cycle [ {from, to} ]
STATE.isDeadlocked = false;
STATE.safeSequence = [];

// Checkpoint State
let CHECKPOINT_STATE = null;

// Node Positions (for drag and drop)
let NODE_POSITIONS = { p: [], r: [] };
let positionsInitialized = false;

// DOM Elements
const allocGrid = document.getElementById('allocation-matrix');
const reqGrid = document.getElementById('request-matrix');
const availGrid = document.getElementById('available-vector');
const needGrid = document.getElementById('need-matrix');
const terminal = document.getElementById('terminal-output');
const svg = document.getElementById('rag-svg');
const statusDot = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const seqPanel = document.getElementById('safe-sequence-display');
const seqPath = document.getElementById('sequence-path');
const cyclePanel = document.getElementById('deadlock-cycle-display');
const cyclePath = document.getElementById('cycle-path');
const unsafePanel = document.getElementById('unsafe-explanation-display');
const btnRecoverAbort = document.getElementById('btn-recover-abort');
const btnRecoverVictim = document.getElementById('btn-recover-victim');
const btnRecoverPreempt = document.getElementById('btn-recover-preempt');
const btnRollback = document.getElementById('btn-rollback');

function getTimestamp() {
    const now = new Date();
    return `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
}

function triggerSuccessGlow() {
    const sweep = document.getElementById('glow-sweep');
    if(sweep) {
        sweep.classList.remove('sweep-active');
        void sweep.offsetWidth; // Force reflow
        sweep.classList.add('sweep-active');
    }
}

function log(msg, type = 'sys-msg') {
    const p = document.createElement('p');
    p.className = type;
    p.innerHTML = `<span style="color:var(--text-muted); font-size:0.75rem;">${getTimestamp()}</span> > ${msg}`;
    terminal.appendChild(p);
    terminal.scrollTop = terminal.scrollHeight;
}

// Initialization & Rendering Data
function calculateNeed() {
    STATE.need = [];
    for (let i = 0; i < STATE.numProcesses; i++) {
        let row = [];
        for (let j = 0; j < STATE.numResources; j++) {
            row.push(STATE.max[i][j] - STATE.allocation[i][j]);
        }
        STATE.need.push(row);
    }
}

function renderMatrices() {
    calculateNeed();
    allocGrid.innerHTML = '';
    reqGrid.innerHTML = '';
    const reqGridActive = document.getElementById('request-matrix-active');
    reqGridActive.innerHTML = '';
    availGrid.innerHTML = '';
    needGrid.innerHTML = '';

    // Render Allocation & Max
    for (let i = 0; i < STATE.numProcesses; i++) {
        let rAlloc = document.createElement('div'); rAlloc.className = 'matrix-row';
        let rMax = document.createElement('div'); rMax.className = 'matrix-row';
        let rNeed = document.createElement('div'); rNeed.className = 'matrix-row';

        let lbl1 = document.createElement('span'); lbl1.className = 'row-label'; lbl1.innerText = `P${i}`;
        let lbl2 = document.createElement('span'); lbl2.className = 'row-label'; lbl2.innerText = `P${i}`;
        let lbl3 = document.createElement('span'); lbl3.className = 'row-label'; lbl3.innerText = `P${i}`;
        rAlloc.appendChild(lbl1);
        rMax.appendChild(lbl2);
        rNeed.appendChild(lbl3);

        for (let j = 0; j < STATE.numResources; j++) {
            // Alloc Input
            let aInp = document.createElement('input');
            aInp.type = 'number'; aInp.min = 0; aInp.className = 'matrix-input';
            aInp.value = STATE.allocation[i][j];
            aInp.onchange = (e) => { 
                let val = parseInt(e.target.value) || 0;
                if (val > STATE.max[i][j]) {
                    log(`Input Rejected: Allocation (${val}) cannot exceed Max claim (${STATE.max[i][j]}) for P${i}, R${String.fromCharCode(65+j)}`, 'error-msg');
                    e.target.value = STATE.allocation[i][j]; // Revert
                    return;
                }
                STATE.allocation[i][j] = val; 
                log(`Updated Allocation P${i}, R${String.fromCharCode(65+j)} to ${val}`, 'sys-msg');
                updateSystem(); 
            };
            rAlloc.appendChild(aInp);

            // Max Input
            let mInp = document.createElement('input');
            mInp.type = 'number'; mInp.min = 0; mInp.className = 'matrix-input';
            mInp.value = STATE.max[i][j];
            mInp.onchange = (e) => { 
                let val = parseInt(e.target.value) || 0;
                if (val < STATE.allocation[i][j]) {
                    log(`Input Rejected: Max claim (${val}) cannot be less than current Allocation (${STATE.allocation[i][j]}) for P${i}, R${String.fromCharCode(65+j)}`, 'error-msg');
                    e.target.value = STATE.max[i][j]; // Revert
                    return;
                }
                STATE.max[i][j] = val; 
                log(`Updated Max P${i}, R${String.fromCharCode(65+j)} to ${val}`, 'sys-msg');
                updateSystem(); 
            };
            rMax.appendChild(mInp);

            // Need Display
            let nInp = document.createElement('input');
            nInp.type = 'number'; nInp.className = 'matrix-input'; nInp.readOnly = true;
            nInp.value = STATE.need[i][j];
            rNeed.appendChild(nInp);

            // Active Request Display
            let arInp = document.createElement('input');
            arInp.type = 'number'; arInp.min = 0; arInp.className = 'matrix-input';
            arInp.value = STATE.request[i][j];
            arInp.style.borderColor = 'var(--accent-red)';
            arInp.onchange = (e) => {
                let val = parseInt(e.target.value) || 0;
                if (val > STATE.need[i][j]) {
                    log(`Warning: Request (${val}) exceeds remaining Need (${STATE.need[i][j]}) for P${i}`, 'warn-msg');
                }
                STATE.request[i][j] = val;
                updateSystem();
            };
            if (j === 0) {
                let rActive = document.createElement('div'); rActive.className = 'matrix-row';
                let lbl = document.createElement('span'); lbl.className = 'row-label'; lbl.innerText = `P${i}`;
                rActive.appendChild(lbl);
                reqGridActive.appendChild(rActive);
            }
            reqGridActive.children[i].appendChild(arInp);
        }
        allocGrid.appendChild(rAlloc);
        reqGrid.appendChild(rMax);
        needGrid.appendChild(rNeed);
    }

    // Render Available
    let rAvail = document.createElement('div'); rAvail.className = 'matrix-row';
    let aLbl = document.createElement('span'); aLbl.className = 'row-label'; aLbl.innerText = 'R';
    rAvail.appendChild(aLbl);
    for (let j = 0; j < STATE.numResources; j++) {
        let vInp = document.createElement('input');
        vInp.type = 'number'; vInp.min = 0; vInp.className = 'matrix-input';
        vInp.value = STATE.available[j];
        vInp.onchange = (e) => { 
            let val = parseInt(e.target.value) || 0;
            STATE.available[j] = val; 
            log(`Updated Available R${String.fromCharCode(65+j)} to ${val}`, 'sys-msg');
            updateSystem(); 
        };
        rAvail.appendChild(vInp);
    }
    availGrid.appendChild(rAvail);
}

function initNodePositions() {
    const svgRect = svg.parentElement.getBoundingClientRect();
    const w = svgRect.width;
    const h = svgRect.height;
    
    NODE_POSITIONS.p = [];
    NODE_POSITIONS.r = [];
    
    for(let i=0; i<STATE.numProcesses; i++) {
        NODE_POSITIONS.p.push({ x: w * 0.3, y: h * (i + 1) / (STATE.numProcesses + 1), id: `P${i}`, type: 'p', idx: i });
    }
    for(let j=0; j<STATE.numResources; j++) {
        NODE_POSITIONS.r.push({ x: w * 0.7, y: h * (j + 1) / (STATE.numResources + 1), id: `R${String.fromCharCode(65+j)}`, type: 'r', idx: j });
    }
    positionsInitialized = true;
}

function drawRAG() {
    if(!positionsInitialized) initNodePositions();

    svg.innerHTML = `
        <defs>
            <marker id="arrowhead-alloc" markerWidth="8" markerHeight="6" refX="24" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#10b981" />
            </marker>
            <marker id="arrowhead-req" markerWidth="8" markerHeight="6" refX="24" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#f43f5e" />
            </marker>
            <filter id="glow">
                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
        </defs>
    `;
    
    // Draw Edges
    for(let i=0; i<STATE.numProcesses; i++) {
        for(let j=0; j<STATE.numResources; j++) {
            // Allocation Edge (Resource -> Process)
            if(STATE.allocation[i][j] > 0) {
                drawLine(NODE_POSITIONS.r[j], NODE_POSITIONS.p[i], '#10b981', 'arrowhead-alloc', -4, STATE.allocation[i][j], false);
            }
            // Request Edge (Process -> Resource) based on ACTIVE request matrix
            if(STATE.request[i][j] > 0) {
                const isHighlighted = STATE.deadlockedEdges.some(e => e.from === `P${i}` && e.to === `R${j}`);
                drawLine(NODE_POSITIONS.p[i], NODE_POSITIONS.r[j], '#f43f5e', 'arrowhead-req', 4, STATE.request[i][j], isHighlighted);
            }
        }
    }

    // Update Resource Labels to show Instances (Used / Total)
    NODE_POSITIONS.r.forEach((n, j) => {
        const used = STATE.allocation.reduce((sum, row) => sum + row[j], 0);
        const total = used + STATE.available[j];
        n.id = `R${j} (${used}/${total})`;
    });

    // Draw Nodes
    NODE_POSITIONS.p.forEach(n => drawDraggableNode(n, true, STATE.deadlockedProcesses.includes(parseInt(n.id.substring(1)))));
    NODE_POSITIONS.r.forEach(n => drawDraggableNode(n, false, false));
}

function drawLine(n1, n2, color, marker, offset, weight, isHighlighted) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    if (isHighlighted) line.classList.add('edge-highlight');
    
    line.setAttribute("x1", n1.x);
    line.setAttribute("y1", n1.y + offset);
    line.setAttribute("x2", n2.x);
    line.setAttribute("y2", n2.y + offset);
    
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", Math.min(2 + weight*0.3, 4));
    line.setAttribute("marker-end", `url(#${marker})`);
    line.setAttribute("opacity", "0.85");
    
    svg.appendChild(line);
}

// Drag and Drop Logic
let draggedNode = null;

svg.addEventListener('mousedown', (e) => {
    if(e.target.classList.contains('drag-handle')) {
        let type = e.target.getAttribute('data-type');
        let idx = parseInt(e.target.getAttribute('data-idx'));
        draggedNode = type === 'p' ? NODE_POSITIONS.p[idx] : NODE_POSITIONS.r[idx];
    }
});

svg.addEventListener('mousemove', (e) => {
    if(draggedNode) {
        const rect = svg.getBoundingClientRect();
        draggedNode.x = e.clientX - rect.left;
        draggedNode.y = e.clientY - rect.top;
        drawRAG();
    }
});

svg.addEventListener('mouseup', () => { draggedNode = null; });
svg.addEventListener('mouseleave', () => { draggedNode = null; });

function drawDraggableNode(node, isProcess, isDeadlocked) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.style.cursor = "grab";
    
    let shape;
    if(isProcess) {
        shape = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        shape.setAttribute("cx", node.x);
        shape.setAttribute("cy", node.y);
        shape.setAttribute("r", 20);
        shape.setAttribute("stroke", isDeadlocked ? "#f43f5e" : "#0ea5e9");
    } else {
        shape = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        shape.setAttribute("x", node.x - 20);
        shape.setAttribute("y", node.y - 20);
        shape.setAttribute("width", 40);
        shape.setAttribute("height", 40);
        shape.setAttribute("stroke", "#f59e0b");
    }
    
    shape.setAttribute("fill", "#0f172a");
    shape.setAttribute("stroke-width", "3");
    if(isDeadlocked) shape.setAttribute("filter", "url(#glow)");
    
    shape.classList.add("drag-handle", "node-shape");
    shape.setAttribute("data-type", node.type);
    shape.setAttribute("data-idx", node.idx);

    const tooltip = document.createElementNS("http://www.w3.org/2000/svg", "title");
    if(!isProcess) {
        const used = STATE.allocation.reduce((sum, row) => sum + row[node.idx], 0);
        tooltip.textContent = `RESOURCE R${node.idx}\nTotal: ${used + STATE.available[node.idx]}\nAllocated: ${used}\nAvailable: ${STATE.available[node.idx]}`;
    } else {
        tooltip.textContent = `PROCESS P${node.idx}\nStatus: ${isDeadlocked ? 'BLOCKED' : 'RUNNING'}`;
    }
    g.appendChild(tooltip);
    
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", node.x);
    text.setAttribute("y", node.y + 5);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("fill", "#f8fafc");
    text.setAttribute("font-weight", "bold");
    text.setAttribute("font-size", "14px");
    text.setAttribute("font-family", "Outfit");
    text.style.pointerEvents = "none";
    text.textContent = node.id;

    const subText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    subText.setAttribute("x", node.x);
    subText.setAttribute("y", node.y + 22);
    subText.setAttribute("text-anchor", "middle");
    subText.setAttribute("fill", isDeadlocked ? "#f43f5e" : "#64748b");
    subText.setAttribute("font-size", "10px");
    subText.setAttribute("font-weight", "800");
    subText.style.pointerEvents = "none";
    
    if(isProcess) {
        subText.textContent = isDeadlocked ? "BLOCKED" : "RUNNING";
    }

    g.appendChild(shape);
    g.appendChild(text);
    g.appendChild(subText);
    svg.appendChild(g);
}

function updateSystem() {
    renderMatrices();
    drawRAG();
    updateResourceBars();
    statusText.innerText = 'STATE UPDATED - RUN CHECK';
    seqPanel.style.display = 'none';
    cyclePanel.style.display = 'none';
    unsafePanel.style.display = 'none';
    btnRecoverAbort.disabled = true;
    btnRecoverVictim.disabled = true;
    btnRecoverPreempt.disabled = true;
}

function updateResourceBars() {
    const container = document.getElementById('resource-bars');
    if (!container) return;
    container.innerHTML = '';

    for (let j = 0; j < STATE.numResources; j++) {
        const allocated = STATE.allocation.reduce((sum, row) => sum + row[j], 0);
        const total = allocated + STATE.available[j];
        const percent = total > 0 ? Math.round((allocated / total) * 100) : 0;
        
        let statusClass = '';
        if (percent >= 90) statusClass = 'danger';
        else if (percent >= 70) statusClass = 'warning';

        const barHtml = `
            <div class="bar-group">
                <div class="bar-info">
                    <span class="bar-label">RESOURCE R${String.fromCharCode(65 + j)}</span>
                    <span class="bar-percent">${allocated} / ${total} (${percent}%)</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill ${statusClass}" style="width: ${percent}%"></div>
                </div>
            </div>
        `;
        container.innerHTML += barHtml;
    }
}

function saveCheckpoint() {
    CHECKPOINT_STATE = JSON.parse(JSON.stringify(STATE));
    log('State Checkpoint Saved.', 'success-msg');
    btnRollback.disabled = false;
}

function rollbackSystem() {
    if(CHECKPOINT_STATE) {
        STATE = JSON.parse(JSON.stringify(CHECKPOINT_STATE));
        log('Rollback successful! Reverted to last checkpoint.', 'warn-msg');
        updateSystem();
        detectDeadlock();
    }
}

function resetSystem() {
    STATE = JSON.parse(JSON.stringify(INITIAL_STATE));
    STATE.need = [];
    STATE.request = Array.from({ length: STATE.numProcesses }, () => Array(STATE.numResources).fill(0));
    STATE.deadlockedProcesses = [];
    STATE.deadlockedEdges = [];
    STATE.isDeadlocked = false;
    STATE.safeSequence = [];
    STATE.currentCycleStr = "";

    log('System has been completely reset to initial default state.', 'warn-msg');
    
    // Hide all analysis panels
    document.getElementById('safe-sequence-display').style.display = 'none';
    document.getElementById('deadlock-cycle-display').style.display = 'none';
    document.getElementById('unsafe-explanation-display').style.display = 'none';
    
    statusDot.className = 'status-indicator';
    statusText.innerText = 'SYSTEM IDLE';
    
    updateSystem();
}

// MODULE 2: Banker's Algorithm
function runBankersAlgorithm() {
    log("Running Banker's Algorithm...");
    let work = [...STATE.available];
    let finish = new Array(STATE.numProcesses).fill(false);
    let safeSeq = [];
    
    let count = 0;
    while(count < STATE.numProcesses) {
        let found = false;
        for(let i=0; i<STATE.numProcesses; i++) {
            if(!finish[i]) {
                let canAllocate = true;
                for(let j=0; j<STATE.numResources; j++) {
                    if(STATE.need[i][j] > work[j]) {
                        canAllocate = false;
                        break;
                    }
                }
                if(canAllocate) {
                    for(let j=0; j<STATE.numResources; j++) work[j] += STATE.allocation[i][j];
                    safeSeq.push(`P${i}`);
                    finish[i] = true;
                    found = true;
                    count++;
                }
            }
        }
        if(!found) break; // unsafe
    }

    if(count === STATE.numProcesses) {
        log(`System is SAFE — Safe Sequence: ${safeSeq.join(' → ')}`, 'success-msg');
        statusDot.className = 'status-indicator safe';
        statusText.innerText = 'SYSTEM IS SAFE';
        seqPanel.style.display = 'block';
        seqPath.innerText = safeSeq.join(' → ');
        cyclePanel.style.display = 'none';
        unsafePanel.style.display = 'none';
        STATE.isDeadlocked = false;
        STATE.deadlockedProcesses = [];
        STATE.deadlockedEdges = [];
        triggerSuccessGlow();
    } else {
        log("System is UNSAFE! No safe sequence exists.", 'error-msg');
        statusDot.className = 'status-indicator unsafe';
        statusText.innerText = 'SYSTEM UNSAFE';
        seqPanel.style.display = 'none';
        unsafePanel.style.display = 'block';
    }
    drawRAG();
}

// MODULE 2 Extension: Resource Request Algorithm
function submitResourceRequest() {
    let p = parseInt(document.getElementById('req-process').value);
    let r0 = parseInt(document.getElementById('req-r0').value) || 0;
    let r1 = parseInt(document.getElementById('req-r1').value) || 0;
    let r2 = parseInt(document.getElementById('req-r2').value) || 0;
    let req = [r0, r1, r2];

    log(`Resource Request Algorithm triggered for P${p}: [${req.join(', ')}]`, 'sys-msg');

    for(let j=0; j<STATE.numResources; j++) {
        if(req[j] > STATE.need[p][j]) {
            log(`Error: P${p} has exceeded its maximum claim! Request Denied.`, 'error-msg');
            return;
        }
    }

    for(let j=0; j<STATE.numResources; j++) {
        if(req[j] > STATE.available[j]) {
            log(`P${p} must wait. Resources are not currently available.`, 'warn-msg');
            return;
        }
    }

    let oldAlloc = JSON.parse(JSON.stringify(STATE.allocation));
    let oldAvail = JSON.parse(JSON.stringify(STATE.available));
    let oldNeed = JSON.parse(JSON.stringify(STATE.need));

    for(let j=0; j<STATE.numResources; j++) {
        STATE.available[j] -= req[j];
        STATE.allocation[p][j] += req[j];
        STATE.need[p][j] -= req[j];
    }

    let work = [...STATE.available];
    let finish = new Array(STATE.numProcesses).fill(false);
    let count = 0;
    while(count < STATE.numProcesses) {
        let found = false;
        for(let i=0; i<STATE.numProcesses; i++) {
            if(!finish[i]) {
                let canAlloc = true;
                for(let j=0; j<STATE.numResources; j++) {
                    if(STATE.need[i][j] > work[j]) { canAlloc = false; break; }
                }
                if(canAlloc) {
                    for(let j=0; j<STATE.numResources; j++) work[j] += STATE.allocation[i][j];
                    finish[i] = true; found = true; count++;
                }
            }
        }
        if(!found) break;
    }

    if(count === STATE.numProcesses) {
        log(`Request granted safely for P${p}. Applying changes.`, 'success-msg');
        updateSystem();
        runBankersAlgorithm();
    } else {
        log(`Request DENIED. Granting would lead to unsafe state. Rolling back...`, 'error-msg');
        STATE.allocation = oldAlloc;
        STATE.available = oldAvail;
        STATE.need = oldNeed;
        updateSystem();
    }
}

// MODULE 3: Deadlock Detection (Strict RAG Cycle Detection via DFS)
function detectDeadlock() {
    log("Running RAG Cycle Detection (DFS)...", "sys-msg");
    
    // 1. Build the Adjacency List for the directed RAG
    // Nodes are P0...P4 and R0...R2 (mapped to unique keys)
    let adj = {};
    for(let i=0; i<STATE.numProcesses; i++) adj[`P${i}`] = [];
    for(let j=0; j<STATE.numResources; j++) adj[`R${j}`] = [];
    
    for(let i=0; i<STATE.numProcesses; i++) {
        for(let j=0; j<STATE.numResources; j++) {
            // Assignment Edge: Resource -> Process
            if(STATE.allocation[i][j] > 0) {
                adj[`R${j}`].push(`P${i}`);
            }
            // Request Edge: Process -> Resource based on ACTIVE request
            if(STATE.request[i][j] > 0) {
                adj[`P${i}`].push(`R${j}`);
            }
        }
    }

    // 2. DFS to find ALL nodes and EDGES involved in ANY cycle
    let visited = new Set();
    let recStack = new Set();
    let deadlockedNodes = new Set();
    STATE.deadlockedEdges = [];

    function findCycles(u, path) {
        visited.add(u);
        recStack.add(u);
        path.push(u);

        for(let v of adj[u]) {
            if(!visited.has(v)) {
                findCycles(v, path);
            } else if(recStack.has(v)) {
                // Cycle detected! Mark nodes and collect edges
                let inCycle = false;
                let cycleNodesTemp = [];
                for(let node of path) {
                    if(node === v) inCycle = true;
                    if(inCycle) {
                        deadlockedNodes.add(node);
                        cycleNodesTemp.push(node);
                    }
                }
                // Add edges for highlighting
                for(let k=0; k<cycleNodesTemp.length; k++) {
                    let from = cycleNodesTemp[k];
                    let to = (k === cycleNodesTemp.length - 1) ? v : cycleNodesTemp[k+1];
                    STATE.deadlockedEdges.push({ from, to });
                }
                STATE.currentCycleStr = cycleNodesTemp.join(' → ') + ' → ' + v;
            }
        }

        path.pop();
        recStack.delete(u);
    }

    // Run DFS from every node to ensure we catch all disconnected components
    for(let i=0; i<STATE.numProcesses; i++) {
        if(!visited.has(`P${i}`)) findCycles(`P${i}`, []);
    }
    for(let j=0; j<STATE.numResources; j++) {
        if(!visited.has(`R${j}`)) findCycles(`R${j}`, []);
    }

    // 3. Extract only Processes from the deadlocked nodes
    STATE.deadlockedProcesses = [];
    deadlockedNodes.forEach(node => {
        if(node.startsWith('P')) {
            STATE.deadlockedProcesses.push(parseInt(node.substring(1)));
        }
    });
    STATE.deadlockedProcesses.sort();

    if(STATE.deadlockedProcesses.length > 0) {
        let ps = STATE.deadlockedProcesses.map(p => `P${p}`).join(', ');
        log(`DEADLOCK DETECTED! Cycle found involving processes: {${ps}}`, 'error-msg');
        statusDot.className = 'status-indicator unsafe';
        statusText.innerText = 'DEADLOCK DETECTED';
        seqPanel.style.display = 'none';
        unsafePanel.style.display = 'none';
        cyclePanel.style.display = 'block';
        cyclePath.innerText = STATE.currentCycleStr;
        STATE.isDeadlocked = true;
        btnRecoverAbort.disabled = false;
        btnRecoverVictim.disabled = false;
        btnRecoverPreempt.disabled = false;
    } else {
        log(`No cycles detected. System is operational.`, 'success-msg');
        statusDot.className = 'status-indicator safe';
        statusText.innerText = 'NO DEADLOCK';
        cyclePanel.style.display = 'none';
        STATE.deadlockedEdges = [];
        btnRecoverAbort.disabled = true;
        btnRecoverVictim.disabled = true;
        btnRecoverPreempt.disabled = true;
    }
    drawRAG();
}

// MODULE 4: Recovery Module
function runRecovery(strategy) {
    if(!STATE.isDeadlocked) return;
    
    if(strategy === 'terminate') {
        // Strategy A: Abort ALL deadlocked processes to restore safety immediately
        log(`[Strategy A] ABORTING ALL deadlocked processes...`, 'error-msg');
        
        let aborted = [...STATE.deadlockedProcesses];
        for(let p of aborted) {
            for(let j=0; j<STATE.numResources; j++) {
                STATE.available[j] += STATE.allocation[p][j];
                STATE.allocation[p][j] = 0;
                STATE.max[p][j] = 0; 
                STATE.need[p][j] = 0; 
            }
        }
        log(`Aborted processes: {${aborted.map(p=>`P${p}`).join(', ')}}. System is now safe.`, 'success-msg');
        
    } else if(strategy === 'victim') {
        // Strategy C: Abort the process with LEAST priority (highest index)
        let victim = Math.max(...STATE.deadlockedProcesses);
        log(`[Strategy C] TERMINATING least priority victim: P${victim}`, 'error-msg');
        
        for(let j=0; j<STATE.numResources; j++) {
            STATE.available[j] += STATE.allocation[victim][j];
            STATE.allocation[victim][j] = 0;
            STATE.max[victim][j] = 0;
            STATE.need[victim][j] = 0;
        }
        log(`Process P${victim} terminated. Resources released.`, 'success-msg');

    } else if(strategy === 'preempt') {
        // Strategy B: Preempt resources from the process holding the most (Rollback)
        let maxHold = -1;
        let targetProcess = -1;
        for(let p of STATE.deadlockedProcesses) {
            let hold = STATE.allocation[p].reduce((a,b)=>a+b,0);
            if(hold > maxHold) { maxHold = hold; targetProcess = p; }
        }
        
        log(`[Strategy B] PREEMPTING ALL resources from P${targetProcess} (Resource Rollback)`, 'warn-msg');
        
        for(let j=0; j<STATE.numResources; j++) {
            let amount = STATE.allocation[targetProcess][j];
            if(amount > 0) {
                STATE.available[j] += amount;
                STATE.allocation[targetProcess][j] = 0;
                // Update need because it still wants its Max
                STATE.need[targetProcess][j] = STATE.max[targetProcess][j];
                log(`Recovered ${amount} units of R${String.fromCharCode(65+j)} from P${targetProcess}.`, 'sys-msg');
                
                // Visual Flash for resource recovery
                const resNode = document.querySelector(`g[data-id="R${j}"] .node-shape`);
                if(resNode) {
                    resNode.classList.add('flash-green');
                    setTimeout(() => resNode.classList.remove('flash-green'), 800);
                }
            }
        }
        log(`P${targetProcess} has been rolled back to initial state.`, 'success-msg');
    }
    
    updateSystem();
    setTimeout(detectDeadlock, 300); // Check if deadlock was resolved
}

// Theme Toggle Logic
const themeToggle = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    themeIcon.innerText = isLight ? '☀️' : '🌙';
    localStorage.setItem('deadlock-theme', isLight ? 'light' : 'dark');
}

// Load saved theme
if (localStorage.getItem('deadlock-theme') === 'light') {
    document.body.classList.add('light-mode');
    themeIcon.innerText = '☀️';
}

themeToggle.addEventListener('click', toggleTheme);

// Welcome Modal Logic
const welcomeModal = document.getElementById('welcome-modal');
const btnStart = document.getElementById('btn-start');

btnStart.addEventListener('click', () => {
    welcomeModal.style.display = 'none';
    log("Welcome! User has accepted terms and entered the simulator.", "success-msg");
});

// About Modal Logic
const aboutModal = document.getElementById('about-modal');
const btnAbout = document.getElementById('btn-about');
const btnCloseAbout = document.getElementById('btn-close-about');

const projectModal = document.getElementById('project-modal');
const btnProject = document.getElementById('btn-project');
const btnCloseProject = document.getElementById('btn-close-project');
const langSelect = document.getElementById('lang-select');
const algoSelect = document.getElementById('algo-select');
const codeDisplay = document.getElementById('code-display');
const presetSelect = document.getElementById('preset-select');

btnAbout.addEventListener('click', () => { aboutModal.style.display = 'flex'; });
btnCloseAbout.addEventListener('click', () => { aboutModal.style.display = 'none'; });

btnProject.addEventListener('click', () => { 
    projectModal.style.display = 'flex'; 
    updateCodeViewer(); // Initial load
});
btnCloseProject.addEventListener('click', () => { projectModal.style.display = 'none'; });

// Close modals when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === aboutModal) aboutModal.style.display = 'none';
    if (e.target === projectModal) projectModal.style.display = 'none';
});

const CODE_SNIPPETS = {
    bankers: {
        c: `// Banker's Safety in C
bool isSafe(int avail[], int max[][R], int alloc[][R]) {
    int need[P][R]; calculateNeed(need, max, alloc);
    bool finish[P] = {0}; int work[R];
    for (int i=0; i<R; i++) work[i] = avail[i];
    int count = 0;
    while (count < P) {
        bool found = false;
        for (int p=0; p<P; p++) {
            if (!finish[p]) {
                int j;
                for (j=0; j<R; j++) if (need[p][j] > work[j]) break;
                if (j == R) {
                    for (int k=0; k<R; k++) work[k] += alloc[p][k];
                    finish[p] = true; found = true; count++;
                }
            }
        }
        if (!found) return false;
    }
    return true;
}`,
        cpp: `// Banker's Safety in C++
bool isSafe(vector<int> avail, vector<vector<int>> max, vector<vector<int>> alloc) {
    int P = alloc.size(), R = avail.size();
    vector<vector<int>> need(P, vector<int>(R));
    for(int i=0; i<P; i++) for(int j=0; j<R; j++) need[i][j] = max[i][j] - alloc[i][j];
    vector<bool> finish(P, false); vector<int> work = avail;
    int count = 0;
    while(count < P) {
        bool found = false;
        for(int p=0; p<P; p++) {
            if(!finish[p]) {
                bool canFinish = true;
                for(int j=0; j<R; j++) if(need[p][j] > work[j]) { canFinish = false; break; }
                if(canFinish) {
                    for(int k=0; k<R; k++) work[k] += alloc[p][k];
                    finish[p] = true; found = true; count++;
                }
            }
        }
        if(!found) return false;
    }
    return true;
}`,
        java: `// Banker's Safety in Java
public boolean isSafe(int[] avail, int[][] max, int[][] alloc) {
    int P = alloc.length, R = avail.length;
    int[][] need = new int[P][R];
    for(int i=0; i<P; i++) for(int j=0; j<R; j++) need[i][j] = max[i][j] - alloc[i][j];
    boolean[] finish = new boolean[P]; int[] work = avail.clone();
    int count = 0;
    while(count < P) {
        boolean found = false;
        for(int p=0; p<P; p++) {
            if(!finish[p]) {
                int j;
                for(j=0; j<R; j++) if(need[p][j] > work[j]) break;
                if(j == R) {
                    for(int k=0; k<R; k++) work[k] += alloc[p][k];
                    finish[p] = true; found = true; count++;
                }
            }
        }
        if(!found) return false;
    }
    return true;
}`,
        python: `# Banker's Safety in Python
def is_safe(avail, max_m, alloc):
    P, R = len(alloc), len(avail)
    need = [[max_m[i][j] - alloc[i][j] for j in range(R)] for i in range(P)]
    finish, work = [False] * P, avail[:]
    count = 0
    while count < P:
        found = False
        for p in range(P):
            if not finish[p] and all(need[p][j] <= work[j] for j in range(R)):
                for k in range(R): work[k] += alloc[p][k]
                finish[p], found, count = True, True, count + 1
        if not found: return False
    return True`,
        js: `// Banker's Safety in JavaScript
function isSafe(avail, max, alloc) {
    const P = alloc.length, R = avail.length;
    const need = alloc.map((row, i) => row.map((val, j) => max[i][j] - val));
    let finish = new Array(P).fill(false), work = [...avail], count = 0;
    while (count < P) {
        let found = false;
        for (let p = 0; p < P; p++) {
            if (!finish[p] && need[p].every((val, j) => val <= work[j])) {
                work = work.map((w, j) => w + alloc[p][j]);
                finish[p] = true; found = true; count++;
            }
        }
        if (!found) return false;
    }
    return true;
}`,
        csharp: `// Banker's Safety in C#
public bool IsSafe(int[] avail, int[,] max, int[,] alloc) {
    int P = alloc.GetLength(0), R = avail.Length;
    int[,] need = new int[P, R];
    for(int i=0; i<P; i++) for(int j=0; j<R; j++) need[i,j] = max[i,j] - alloc[i,j];
    bool[] finish = new bool[P]; int[] work = (int[])avail.Clone();
    int count = 0;
    while(count < P) {
        bool found = false;
        for(int p=0; p<P; p++) {
            if(!finish[p]) {
                int j;
                for(j=0; j<R; j++) if(need[p,j] > work[j]) break;
                if(j == R) {
                    for(int k=0; k<R; k++) work[k] += alloc[p,k];
                    finish[p] = true; found = true; count++;
                }
            }
        }
        if(!found) return false;
    }
    return true;
}`,
        ruby: `# Banker's Safety in Ruby
def is_safe(avail, max_m, alloc)
  p_size, r_size = alloc.length, avail.length
  need = Array.new(p_size) { |i| Array.new(r_size) { |j| max_m[i][j] - alloc[i][j] } }
  finish, work, count = Array.new(p_size, false), avail.dup, 0
  while count < p_size
    found = false
    p_size.times do |p|
      if !finish[p] && (0...r_size).all? { |j| need[p][j] <= work[j] }
        (0...r_size).each { |k| work[k] += alloc[p][k] }
        finish[p], found, count = true, true, count + 1
      end
    end
    return false unless found
  end
  true
end`,
        go: `// Banker's Safety in Go
func isSafe(avail []int, max [][]int, alloc [][]int) bool {
    P, R := len(alloc), len(avail)
    need := make([][]int, P); finish := make([]bool, P); work := append([]int(nil), avail...)
    for i := range need {
        need[i] = make([]int, R)
        for j := range need[i] { need[i][j] = max[i][j] - alloc[i][j] }
    }
    count := 0
    for count < P {
        found := false
        for p := 0; p < P; p++ {
            if !finish[p] {
                canFinish := true
                for j := 0; j < R; j++ { if need[p][j] > work[j] { canFinish = false; break } }
                if canFinish {
                    for k := 0; k < R; k++ { work[k] += alloc[p][k] }
                    finish[p] = true; found = true; count++
                }
            }
        }
        if !found { return false }
    }
    return true
}`,
        rust: `// Banker's Safety in Rust
fn is_safe(avail: &Vec<i32>, max: &Vec<Vec<i32>>, alloc: &Vec<Vec<i32>>) -> bool {
    let (p_len, r_len) = (alloc.len(), avail.len());
    let mut need = vec![vec![0; r_len]; p_len];
    for i in 0..p_len { for j in 0..r_len { need[i][j] = max[i][j] - alloc[i][j]; } }
    let (mut finish, mut work, mut count) = (vec![false; p_len], avail.clone(), 0);
    while count < p_len {
        let mut found = false;
        for p in 0..p_len {
            if !finish[p] && (0..r_len).all(|j| need[p][j] <= work[j]) {
                for k in 0..r_len { work[k] += alloc[p][k]; }
                finish[p] = true; found = true; count += 1;
            }
        }
        if !found { return false; }
    }
    true
}`,
        php: `// Banker's Safety in PHP
function isSafe($avail, $max, $alloc) {
    $P = count($alloc); $R = count($avail); $need = [];
    for($i=0; $i<$P; $i++) for($j=0; $j<$R; $j++) $need[$i][$j] = $max[$i][$j] - $alloc[$i][$j];
    $finish = array_fill(0, $P, false); $work = $avail; $count = 0;
    while($count < $P) {
        $found = false;
        for($p=0; $p<$P; $p++) {
            if(!$finish[$p]) {
                $canGrant = true;
                for($j=0; $j<$R; $j++) if($need[$p][$j] > $work[$j]) { $canGrant = false; break; }
                if($canGrant) {
                    for($k=0; $k<$R; $k++) $work[$k] += $alloc[$p][$k];
                    $finish[$p] = true; $found = true; $count++;
                }
            }
        }
        if(!$found) return false;
    }
    return true;
}`
    },
    request: {
        c: `// Resource Request Algorithm in C
void requestResource(int p, int request[], int avail[], int need[][R], int alloc[][R]) {
    for (int j=0; j<R; j++) {
        if (request[j] > need[p][j] || request[j] > avail[j]) return error;
    }
    for (int j=0; j<R; j++) {
        avail[j] -= request[j];
        alloc[p][j] += request[j];
        need[p][j] -= request[j];
    }
    if (!isSafe(avail, need, alloc)) {
        // Rollback...
    }
}`,
        python: `# Resource Request Algorithm in Python
def request_resource(p, request, avail, need, alloc):
    if any(request[j] > need[p][j] or request[j] > avail[j] for j in range(R)):
        return False # Error
    for j in range(R):
        avail[j] -= request[j]
        alloc[p][j] += request[j]
        need[p][j] -= request[j]
    if not is_safe(avail, need, alloc):
        # Rollback...
        return False
    return True`,
        js: `// Resource Request in JS
function requestResources(p, request, state) {
    if (request.some((r, j) => r > state.need[p][j] || r > state.available[j])) return false;
    request.forEach((r, j) => {
        state.available[j] -= r;
        state.allocation[p][j] += r;
        state.need[p][j] -= r;
    });
    return isSafe(state);
}`,
        cpp: `// Resource Request in C++
bool requestResource(int p, vector<int> req, vector<int>& avail, vector<vector<int>>& need, vector<vector<int>>& alloc) {
    for(int j=0; j<avail.size(); j++) if(req[j] > need[p][j] || req[j] > avail[j]) return false;
    for(int j=0; j<avail.size(); j++) {
        avail[j] -= req[j]; alloc[p][j] += req[j]; need[p][j] -= req[j];
    }
    return isSafe(avail, need, alloc);
}`,
        java: `// Resource Request in Java
public boolean requestResource(int p, int[] req, int[] avail, int[][] need, int[][] alloc) {
    for(int j=0; j<avail.length; j++) if(req[j] > need[p][j] || req[j] > avail[j]) return false;
    for(int j=0; j<avail.length; j++) {
        avail[j] -= req[j]; alloc[p][j] += req[j]; need[p][j] -= req[j];
    }
    return isSafe(avail, need, alloc);
}`,
        csharp: `// Resource Request in C#
public bool RequestResource(int p, int[] req, int[] avail, int[,] need, int[,] alloc) {
    for(int j=0; j<avail.Length; j++) if(req[j] > need[p,j] || req[j] > avail[j]) return false;
    for(int j=0; j<avail.Length; j++) {
        avail[j] -= req[j]; alloc[p,j] += req[j]; need[p,j] -= req[j];
    }
    return IsSafe(avail, need, alloc);
}`,
        ruby: `# Resource Request in Ruby
def request_resource(p, req, avail, need, alloc)
  return false if (0...req.length).any? { |j| req[j] > need[p][j] || req[j] > avail[j] }
  (0...req.length).each do |j|
    avail[j] -= req[j]; alloc[p][j] += req[j]; need[p][j] -= req[j]
  end
  is_safe(avail, need, alloc)
end`,
        go: `// Resource Request in Go
func requestResource(p int, req []int, avail []int, need [][]int, alloc [][]int) bool {
    for j := range avail { if req[j] > need[p][j] || req[j] > avail[j] { return false } }
    for j := range avail {
        avail[j] -= req[j]; alloc[p][j] += req[j]; need[p][j] -= req[j]
    }
    return isSafe(avail, need, alloc)
}`,
        rust: `// Resource Request in Rust
fn request_resource(p: usize, req: &Vec<i32>, avail: &mut Vec<i32>, need: &mut Vec<Vec<i32>>, alloc: &mut Vec<Vec<i32>>) -> bool {
    for j in 0..avail.len() { if req[j] > need[p][j] || req[j] > avail[j] { return false; } }
    for j in 0..avail.len() {
        avail[j] -= req[j]; alloc[p][j] += req[j]; need[p][j] -= req[j];
    }
    is_safe(avail, need, alloc)
}`,
        php: `// Resource Request in PHP
function requestResource($p, $req, &$avail, &$need, &$alloc) {
    for($j=0; $j<count($avail); $j++) if($req[$j] > $need[$p][$j] || $req[$j] > $avail[$j]) return false;
    for($j=0; $j<count($avail); $j++) {
        $avail[$j] -= $req[$j]; $alloc[$p][$j] += $req[$j]; $need[$p][$j] -= $req[$j];
    }
    return isSafe($avail, $need, $alloc);
}`
    },
    detect: {
        c: `// Cycle Detection (DFS) in C
bool isCyclic(int u, int visited[], int recStack[]) {
    visited[u] = 1; recStack[u] = 1;
    for(int v=0; v<nodes; v++) {
        if(adj[u][v]) {
            if(!visited[v] && isCyclic(v, visited, recStack)) return true;
            else if(recStack[v]) return true;
        }
    }
    recStack[u] = 0; return false;
}`,
        python: `# Cycle Detection (DFS) in Python
def has_cycle(u, visited, rec_stack):
    visited[u] = rec_stack[u] = True
    for v in adj[u]:
        if not visited[v]:
            if has_cycle(v, visited, rec_stack): return True
        elif rec_stack[v]: return True
    rec_stack[u] = False
    return False`,
        js: `// Cycle Detection in JS
function hasCycle(u, visited, recStack) {
    visited.add(u); recStack.add(u);
    for (let v of adj[u]) {
        if (!visited.has(v)) {
            if (hasCycle(v, visited, recStack)) return true;
        } else if (recStack.has(v)) return true;
    }
    recStack.delete(u); return false;
}`,
        cpp: `// Cycle Detection in C++
bool hasCycle(int u, vector<bool>& visited, vector<bool>& recStack) {
    visited[u] = recStack[u] = true;
    for(int v : adj[u]) {
        if(!visited[v] && hasCycle(v, visited, recStack)) return true;
        else if(recStack[v]) return true;
    }
    recStack[u] = false; return false;
}`,
        java: `// Cycle Detection in Java
boolean hasCycle(int u, boolean[] visited, boolean[] recStack) {
    visited[u] = recStack[u] = true;
    for(int v : adj.get(u)) {
        if(!visited[v] && hasCycle(v, visited, recStack)) return true;
        else if(recStack[v]) return true;
    }
    recStack[u] = false; return false;
}`,
        csharp: `// Cycle Detection in C#
bool HasCycle(int u, bool[] visited, bool[] recStack) {
    visited[u] = recStack[u] = true;
    foreach(int v in adj[u]) {
        if(!visited[v] && HasCycle(v, visited, recStack)) return true;
        else if(recStack[v]) return true;
    }
    recStack[u] = false; return false;
}`,
        ruby: `# Cycle Detection in Ruby
def has_cycle(u, visited, rec_stack)
  visited[u] = rec_stack[u] = true
  adj[u].each do |v|
    return true if !visited[v] && has_cycle(v, visited, rec_stack)
    return true if rec_stack[v]
  end
  rec_stack[u] = false; false
end`,
        go: `// Cycle Detection in Go
func hasCycle(u int, visited []bool, recStack []bool) bool {
    visited[u] = true; recStack[u] = true
    for _, v := range adj[u] {
        if !visited[v] && hasCycle(v, visited, recStack) { return true }
        if recStack[v] { return true }
    }
    recStack[u] = false; return false
}`,
        rust: `// Cycle Detection in Rust
fn has_cycle(u: usize, visited: &mut Vec<bool>, rec_stack: &mut Vec<bool>, adj: &Vec<Vec<usize>>) -> bool {
    visited[u] = true; rec_stack[u] = true;
    for &v in &adj[u] {
        if !visited[v] && has_cycle(v, visited, rec_stack, adj) { return true; }
        else if rec_stack[v] { return true; }
    }
    rec_stack[u] = false; false
}`,
        php: `// Cycle Detection in PHP
function hasCycle($u, &$visited, &$recStack, $adj) {
    $visited[$u] = true; $recStack[$u] = true;
    foreach($adj[$u] as $v) {
        if(!$visited[$v] && hasCycle($v, $visited, $recStack, $adj)) return true;
        else if($recStack[$v]) return true;
    }
    $recStack[$u] = false; return false;
}`
    },
    recovery: {
        c: `// Recovery Strategies in C
void recover(int strategy) {
    if(strategy == ABORT) {
        int victim = findLeastPriority();
        releaseResources(victim);
    } else if(strategy == PREEMPT) {
        int victim = findMostHolding();
        rollback(victim);
    }
}`,
        python: `# Recovery Strategies in Python
def recover(strategy):
    if strategy == 'ABORT':
        victim = min_priority_process()
        terminate(victim)
    elif strategy == 'PREEMPT':
        victim = max_resource_holder()
        rollback(victim)`,
        js: `// Recovery Strategies in JS
function recover(strategy) {
    const victim = strategy === 'abort' ? getLeastPriority() : getMostHolding();
    if (strategy === 'abort') terminate(victim);
    else rollback(victim);
}`,
        cpp: `// Recovery Strategies in C++
void recover(string strategy) {
    int victim = (strategy == "abort") ? getLeastPriority() : getMostHolding();
    if(strategy == "abort") terminate(victim);
    else rollback(victim);
}`,
        java: `// Recovery Strategies in Java
void recover(String strategy) {
    int victim = strategy.equals("abort") ? getLeastPriority() : getMostHolding();
    if(strategy.equals("abort")) terminate(victim);
    else rollback(victim);
}`,
        csharp: `// Recovery Strategies in C#
void Recover(string strategy) {
    int victim = (strategy == "abort") ? GetLeastPriority() : GetMostHolding();
    if(strategy == "abort") Terminate(victim);
    else Rollback(victim);
}`,
        ruby: `# Recovery Strategies in Ruby
def recover(strategy)
  victim = strategy == 'abort' ? get_least_priority : get_most_holding
  strategy == 'abort' ? terminate(victim) : rollback(victim)
end`,
        go: `// Recovery Strategies in Go
func recover(strategy string) {
    victim := 0
    if strategy == "abort" { victim = getLeastPriority() } else { victim = getMostHolding() }
    if strategy == "abort" { terminate(victim) } else { rollback(victim) }
}`,
        rust: `// Recovery Strategies in Rust
fn recover(strategy: &str) {
    let victim = if strategy == "abort" { get_least_priority() } else { get_most_holding() };
    if strategy == "abort" { terminate(victim); } else { rollback(victim); }
}`,
        php: `// Recovery Strategies in PHP
function recover($strategy) {
    $victim = ($strategy == 'abort') ? getLeastPriority() : getMostHolding();
    if($strategy == 'abort') terminate($victim);
    else rollback($victim);
}`
    }
};

function updateCodeViewer() {
    const algo = algoSelect.value;
    const lang = langSelect.value;
    codeDisplay.innerText = CODE_SNIPPETS[algo][lang];
}

langSelect.addEventListener('change', updateCodeViewer);
algoSelect.addEventListener('change', updateCodeViewer);

// Scenario Presets Logic
const SCENARIOS = {
    safe: {
        allocation: [[0,1,0], [2,0,0], [3,0,2], [2,1,1], [0,0,2]],
        max: [[7,5,3], [3,2,2], [9,0,2], [2,2,2], [4,3,3]],
        available: [3,3,2]
    },
    deadlock: {
        allocation: [[1,0,0], [0,1,0], [0,0,0], [0,0,0], [0,0,0]],
        max: [[1,1,0], [1,1,0], [0,0,0], [0,0,0], [0,0,0]],
        request: [[0,1,0], [1,0,0], [0,0,0], [0,0,0], [0,0,0]],
        available: [0,0,10]
    },
    unsafe: {
        allocation: [[1,0,0], [0,1,0], [3,0,2], [2,1,1], [0,0,2]],
        max: [[5,5,5], [3,3,3], [9,0,2], [2,2,2], [4,3,3]],
        request: [[0,0,0], [0,0,0], [0,0,0], [0,0,0], [0,0,0]],
        available: [0,0,1]
    }
};

function loadScenario(type) {
    const data = SCENARIOS[type];
    if(!data) return;

    STATE.allocation = JSON.parse(JSON.stringify(data.allocation));
    STATE.max = JSON.parse(JSON.stringify(data.max));
    STATE.available = JSON.parse(JSON.stringify(data.available));
    if(data.request) {
        STATE.request = JSON.parse(JSON.stringify(data.request));
    } else {
        STATE.request = Array.from({ length: STATE.numProcesses }, () => Array(STATE.numResources).fill(0));
    }
    
    log(`Scenario Loaded: ${type.toUpperCase()}`, "success-msg");
    
    // Hide panels on new load
    document.getElementById('safe-sequence-display').style.display = 'none';
    document.getElementById('deadlock-cycle-display').style.display = 'none';
    document.getElementById('unsafe-explanation-display').style.display = 'none';

    updateSystem();
    
    // Auto-run analysis if tutorial is on
    if(tutorialToggle.checked) {
        if(type === 'deadlock') detectDeadlock();
        else runBankersAlgorithm();
    }
}

presetSelect.addEventListener('change', (e) => {
    loadScenario(e.target.value);
    e.target.value = ""; // Reset dropdown
});

// Windows 7 Aero Tutorial Logic
const win7Toast = document.getElementById('win7-toast');
const win7Title = document.getElementById('win7-title');
const win7Message = document.getElementById('win7-message');
const tutorialToggle = document.getElementById('tutorial-toggle');
let toastTimeout = null;

function showTutorial(title, message) {
    if (!tutorialToggle.checked) return;
    
    // Reset existing toast
    clearTimeout(toastTimeout);
    win7Toast.style.display = 'none';
    win7Toast.classList.remove('active', 'fade-out');
    void win7Toast.offsetWidth; // Trigger reflow

    win7Title.innerText = title;
    win7Message.innerHTML = message;
    win7Toast.style.display = 'block';
    win7Toast.classList.add('active');

    toastTimeout = setTimeout(() => {
        win7Toast.classList.add('fade-out');
        setTimeout(() => {
            win7Toast.style.display = 'none';
            win7Toast.classList.remove('active', 'fade-out');
        }, 500); // Wait for exit animation
    }, 5000); // 5 seconds duration
}

const TUTORIALS = {
    bankers: {
        title: "Banker's Algorithm Guide",
        msg: "The system is checking if every process can finish. It simulates granting all requests and looks for a 'Safe Sequence'. If one is found, your system is secure!"
    },
    detect: {
        title: "Deadlock Detection Guide",
        msg: "The system is using DFS (Depth First Search) to find cycles in the Resource Allocation Graph. A cycle means processes are stuck waiting for each other indefinitely!"
    },
    terminate: {
        title: "Process Termination Guide",
        msg: "Recovery initiated! Every process involved in the deadlock cycle has been aborted. This releases all held resources and immediately restores system safety."
    },
    preempt: {
        title: "Resource Preemption Guide",
        msg: "Recovery initiated! The process holding the most resources has been 'Rolled Back'. Its resources are returned to the pool so others can break the deadlock."
    },
    victim: {
        title: "Victim Termination Guide",
        msg: "Recovery initiated! The process with the least priority (highest ID) involved in the deadlock has been terminated. This selectively breaks the cycle."
    },
    request: {
        title: "Resource Request Guide",
        msg: "A process is asking for more resources. The system will only grant this if the resulting state remains 'Safe' according to the Banker's Algorithm."
    },
    reset: {
        title: "System Reset Guide",
        msg: "Everything has been cleared! All matrices and the graph are reset to their default state. Time for a fresh start!"
    }
};

// Event Listeners
document.getElementById('btn-bankers').addEventListener('click', () => {
    runBankersAlgorithm();
    showTutorial(TUTORIALS.bankers.title, TUTORIALS.bankers.msg);
});
document.getElementById('btn-detect').addEventListener('click', () => {
    detectDeadlock();
    showTutorial(TUTORIALS.detect.title, TUTORIALS.detect.msg);
});
btnRecoverAbort.addEventListener('click', () => {
    runRecovery('terminate');
    showTutorial(TUTORIALS.terminate.title, TUTORIALS.terminate.msg);
});
btnRecoverPreempt.addEventListener('click', () => {
    runRecovery('preempt');
    showTutorial(TUTORIALS.preempt.title, TUTORIALS.preempt.msg);
});
btnRecoverVictim.addEventListener('click', () => {
    runRecovery('victim');
    showTutorial(TUTORIALS.victim.title, TUTORIALS.victim.msg);
});
document.getElementById('btn-submit-req').addEventListener('click', () => {
    submitResourceRequest();
    showTutorial(TUTORIALS.request.title, TUTORIALS.request.msg);
});
document.getElementById('btn-export').addEventListener('click', () => {
    // Populate Print Metadata
    const printDate = document.getElementById('print-date');
    const printEnv = document.getElementById('print-env');
    
    if(printDate) printDate.innerText = new Date().toLocaleString();
    if(printEnv) {
        const ua = navigator.userAgent;
        let os = "Windows NT 10.0";
        if(ua.indexOf("Mac") != -1) os = "macOS Kernel";
        if(ua.indexOf("Linux") != -1) os = "Linux x86_64";
        printEnv.innerText = `${os} | Browser: ${navigator.vendor || 'Generic'}`;
    }
    
    window.print();
});
document.getElementById('btn-reset').addEventListener('click', () => {
    resetSystem();
    showTutorial(TUTORIALS.reset.title, TUTORIALS.reset.msg);
});
document.getElementById('btn-checkpoint').addEventListener('click', saveCheckpoint);
document.getElementById('btn-rollback').addEventListener('click', rollbackSystem);

window.addEventListener('resize', () => { positionsInitialized = false; drawRAG(); });

// Diagnostics and Clock logic for Welcome Modal
function initWelcomeDiagnostics() {
    const osSpan = document.getElementById('diag-os');
    const browserSpan = document.getElementById('diag-browser');
    const clockSpan = document.getElementById('live-clock');

    // Simple OS/Browser detection
    const ua = navigator.userAgent;
    let os = "Unknown OS";
    if (ua.indexOf("Win") != -1) os = "Windows Server 2025";
    if (ua.indexOf("Mac") != -1) os = "MacOS Kernel";
    if (ua.indexOf("Linux") != -1) os = "Linux x86_64";

    let browser = "Web Client";
    if (ua.indexOf("Chrome") != -1) browser = "Google Chrome Engine";
    else if (ua.indexOf("Firefox") != -1) browser = "Mozilla Firefox Core";

    if(osSpan) osSpan.innerText = os;
    if(browserSpan) browserSpan.innerText = browser;

    setInterval(() => {
        const now = new Date();
        if(clockSpan) clockSpan.innerText = now.toTimeString().split(' ')[0];
    }, 1000);
}

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'INPUT') return;
    const key = e.key.toLowerCase();
    if (key === 'd') loadScenario('deadlock');
    if (key === 's') loadScenario('safe');
    if (key === 'u') loadScenario('unsafe');
    if (key === 'r') resetSystem();
});

// Modal Helpers
function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// Update CPU Load placeholder
setInterval(() => {
    const footerLoad = document.getElementById('footer-load');
    if (footerLoad) {
        const load = Math.floor(Math.random() * 15) + 5;
        footerLoad.innerText = `CPU LOAD: ${load}%`;
    }
}, 3000);

// Export Current Configuration to JSON
function exportConfig() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(STATE, null, 4));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "deadlock_config.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    log("System configuration exported as JSON.", "sys-msg");
}

// Trigger Import File Dialog
function importConfig() {
    document.getElementById('import-input').click();
}

// Handle Import File Selection
document.getElementById('import-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedState = JSON.parse(e.target.result);
            
            // Basic validation
            if (!importedState.allocation || !importedState.max) {
                throw new Error("Invalid Configuration File");
            }

            STATE = importedState;
            // Ensure derived state is reset
            STATE.deadlockedProcesses = [];
            STATE.deadlockedEdges = [];
            STATE.isDeadlocked = false;
            STATE.safeSequence = [];
            
            updateSystem();
            log("Configuration imported successfully.", "sys-msg");
        } catch (err) {
            log("Import Error: " + err.message, "error-msg");
        }
    };
    reader.readAsText(file);
});

// Init
updateSystem();
initWelcomeDiagnostics();
initWelcomeDiagnostics();
log("Simulator Initialized. System ready.", 'success-msg');

// Load initial scenario so the screen isn't blank on startup
setTimeout(() => {
    loadScenario('safe');
}, 500);
