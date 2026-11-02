// Builds public/ directory for Vercel deployment
const fs = require('fs');
const path = require('path');

// 1. Build index.html from source parts
require('./build.js');

// 2. Prepare public/
const pub = path.join(__dirname, 'public');
fs.mkdirSync(pub, { recursive: true });

// 3. Copy root HTML files
fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(pub, 'index.html'));
fs.copyFileSync(path.join(__dirname, 'admin.html'), path.join(pub, 'admin.html'));

if (fs.existsSync(path.join(__dirname, 'pitch.html'))) {
  fs.copyFileSync(path.join(__dirname, 'pitch.html'), path.join(pub, 'pitch.html'));
}
if (fs.existsSync(path.join(__dirname, 'logo.svg'))) {
  fs.copyFileSync(path.join(__dirname, 'logo.svg'), path.join(pub, 'logo.svg'));
}

// 4. Copy pitch-assets folder
const pitchSrc = path.join(__dirname, 'pitch-assets');
const pitchDest = path.join(pub, 'pitch-assets');
if (fs.existsSync(pitchSrc)) {
  fs.cpSync(pitchSrc, pitchDest, { recursive: true });
}

console.log('Vercel public directory prepared:');
console.log(fs.readdirSync(pub));
