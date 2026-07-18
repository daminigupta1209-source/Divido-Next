import fs from 'fs';
import path from 'path';

const dirs = [
  'c:/Users/damin/OneDrive/Documents/divido-next/src/components',
  'c:/Users/damin/OneDrive/Documents/divido-next/src/components/group-detail'
];

dirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isFile() && (file.endsWith('.tsx') || file.endsWith('.ts'))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes('Any Time') || line.includes('All Members')) {
            console.log(`${file}:${idx + 1}: ${line.trim()}`);
          }
        });
      }
    });
  }
});
