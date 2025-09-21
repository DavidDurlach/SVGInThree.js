// Main Entry Point
// Last edit date: 2025-09-11

import { SVG3DApp } from './app.js';

// Initialize application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

function initApp() {
    // Create and start the application
    const app = new SVG3DApp();
    
    // Make app available globally for debugging
    window.svg3dApp = app;
    
    console.log('SVG to 3D application started');
}