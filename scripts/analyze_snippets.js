const fs = require('fs');
const html = fs.readFileSync('lumiere_dump.html', 'utf8');

// Let's inspect nav, hero, services, etc.
function extractSnippet(selector, str) {
  const reg = new RegExp(`<${selector}[^>]*>[\\s\\S]*?<\\/${selector}>`, 'gi');
  const m = str.match(reg);
  return m ? m[0] : '';
}

// Nav snippet
console.log('=== NAV ===\n', extractSnippet('nav', html).slice(0, 1000));

// Services snippet
const services = html.match(/<section class=\"services[^\"]*\"[^>]*>[\s\S]*?<\/section>/i);
if (services) {
  console.log('=== SERVICES ===\n', services[0].slice(0, 1500));
}

