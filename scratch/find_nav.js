import fs from 'fs';
const file = 'c:/Users/damin/OneDrive/Documents/divido-next/src/App.tsx';
const lines = fs.readFileSync(file, 'utf8').split('\n');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('nav') || line.toLowerCase().includes('button') && idx > 2000) {
    if (line.trim().length > 0) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  }
});
