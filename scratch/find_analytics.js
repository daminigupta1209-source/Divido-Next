import fs from 'fs';
const content = fs.readFileSync('c:/Users/damin/OneDrive/Documents/divido-next/src/App.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('Analytics') || line.includes('analytics')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
