const fs = require('fs');
const html = fs.readFileSync('lumiere_dump.html', 'utf8');
const links = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
console.log('Links in Lumiere:', [...new Set(links)]);

