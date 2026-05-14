/**
 * Simple HTTP Server - Demo JavaScript
 */
(function () {
    'use strict';

    console.log('Simple HTTP Server is running!');
    console.log('Server Time:', new Date().toISOString());

    // Display a message in the page
    document.addEventListener('DOMContentLoaded', function () {
        const footer = document.createElement('footer');
        footer.style.cssText = 'margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #999; font-size: 14px;';
        footer.textContent = 'Page loaded at: ' + new Date().toLocaleString();
        document.querySelector('.container').appendChild(footer);
    });
})();
