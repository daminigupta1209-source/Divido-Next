import fs from 'fs';
const content = fs.readFileSync('c:/Users/damin/OneDrive/Documents/divido-next/src/index.css', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('b-nav-btn') || line.includes('bottom-nav')) {
    console.log(`${idx + 1}: ${line}`);
  }
});
