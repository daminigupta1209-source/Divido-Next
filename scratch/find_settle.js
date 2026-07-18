import fs from 'fs';
const file = 'c:/Users/damin/OneDrive/Documents/divido-next/src/components/GroupDetail.tsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('settle')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
