const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

// Serve static files from the current directory
app.use(express.static(__dirname));

// Send index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 Deadlock Simulator: http://localhost:${PORT}`);
    console.log(`🔄 Auto-restart enabled. Changes will sync!`);
    console.log(`=================================================`);
});

// Handle server errors (like port already in use)
server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Please close the other terminal or process running the simulator.`);
        process.exit(1);
    } else {
        console.error(`❌ Server error:`, e);
    }
});
