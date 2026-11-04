const fs = require('fs');
const html = fs.readFileSync('lumiere_dump.html', 'utf8');

// Find all class names in lumiere_dump
const classSet = new Set();
const matches = html.matchAll(/class=\"([^\"]+)\"/g);
for (const m of matches) {
  m[1].split(/\s+/).forEach(c => classSet.add(c));
}

console.log('Total unique classes:', classSet.size);
console.log('Sample classes:');
console.log([...classSet].filter(c => /card|table|btn|badge|tag|pill|nav|hero|text|item|grid|service|bento|list/i.test(c)).slice(0, 50).join(', '));

