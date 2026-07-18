const fs = require('fs');
const path = require('path');

const srcPath = 'C:\\Users\\damin\\.gemini\\antigravity\\brain\\d7c77501-3a36-4a70-b77e-a874a371f881\\scratch\\isolated_ge_utf8.js';
const destPath = 'C:\\Users\\damin\\OneDrive\\Documents\\divido-next\\scratch\\formatted_ge.js';

if (!fs.existsSync(path.dirname(destPath))) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
}

let content = fs.readFileSync(srcPath, 'utf8');

// A simple regex-based formatter to add linebreaks after semicolons, braces, and commas in arrays
// so it is highly readable and doesn't get truncated by line-length limits.
let formatted = content
  .replace(/;/g, ';\n')
  .replace(/\{/g, '{\n')
  .replace(/\}/g, '\n}\n')
  .replace(/&&/g, ' && ')
  .replace(/\|\|/g, ' || ')
  .replace(/=>/g, ' => ');

fs.writeFileSync(destPath, formatted, 'utf8');
console.log('Formatted file written to:', destPath);
