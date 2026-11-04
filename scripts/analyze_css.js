const fs = require('fs');
const css = fs.readFileSync('lumiere.css', 'utf8');

// Search for font-family, heading styles, container, buttons, etc.
console.log('--- Font families in CSS ---');
const fonts = [...css.matchAll(/font-family:[^;}]+/g)].map(m => m[0]);
console.log([...new Set(fonts)].join('\n'));

console.log('\n--- Heading classes ---');
const headings = css.match(/\.(h[1-6]|heading[^\s{,]+|text-big)[^{]*\{[^}]+\}/g);
console.log(headings ? headings.slice(0, 10).join('\n') : 'none');

console.log('\n--- Button classes ---');
const buttons = css.match(/\.btn[^{]*\{[^}]+\}/g);
console.log(buttons ? buttons.slice(0, 10).join('\n') : 'none');

console.log('\n--- Container classes ---');
const containers = css.match(/\.(container|u-section)[^{]*\{[^}]+\}/g);
console.log(containers ? containers.join('\n') : 'none');

