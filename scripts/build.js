import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const manifestPath = path.join(rootDir, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version || '3.1.2';

const distDir = path.join(rootDir, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const zip = new AdmZip();

// Add root files
zip.addLocalFile(path.join(rootDir, 'manifest.json'));
if (fs.existsSync(path.join(rootDir, 'LICENSE'))) {
  zip.addLocalFile(path.join(rootDir, 'LICENSE'));
}
if (fs.existsSync(path.join(rootDir, 'README.md'))) {
  zip.addLocalFile(path.join(rootDir, 'README.md'));
}

// Helper to add directory recursively with forward slashes and excluding tests
function addDirectory(dirPath, zipPrefix) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addDirectory(fullPath, zipPath);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.test.js') || entry.name.endsWith('.spec.js')) {
        continue;
      }
      const fileBuffer = fs.readFileSync(fullPath);
      zip.addFile(zipPath, fileBuffer);
    }
  }
}

// Add src/ and icons/
addDirectory(path.join(rootDir, 'src'), 'src');
addDirectory(path.join(rootDir, 'icons'), 'icons');

const primaryZipName = `github-date-of-creation-v${version}.zip`;
const primaryZipPath = path.join(distDir, primaryZipName);
zip.writeZip(primaryZipPath);

// Also save short alias gdc-vX.X.X.zip
const aliasZipName = `gdc-v${version}.zip`;
const aliasZipPath = path.join(distDir, aliasZipName);
fs.copyFileSync(primaryZipPath, aliasZipPath);

console.log(`Successfully built extension packages:`);
console.log(` - dist/${primaryZipName} (${(fs.statSync(primaryZipPath).size / 1024).toFixed(2)} KB)`);
console.log(` - dist/${aliasZipName}`);
