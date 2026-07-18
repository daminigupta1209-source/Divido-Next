import fs from 'fs';
const content = fs.readFileSync('c:/Users/damin/OneDrive/Documents/divido-next/src/components/ActivityStudio.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('time') || line.toLowerCase().includes('member') || line.toLowerCase().includes('feed')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
