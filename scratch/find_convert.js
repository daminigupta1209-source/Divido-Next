import fs from 'fs';
import path from 'path';

const files = [
  'c:/Users/damin/OneDrive/Documents/divido-next/src/components/GroupDetail.tsx',
  'c:/Users/damin/OneDrive/Documents/divido-next/src/App.tsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      if (line.toLowerCase().includes('convert')) {
        console.log(`${path.basename(file)}:${idx + 1}: ${line.trim()}`);
      }
    });
  }
});
