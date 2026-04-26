const fs = require('fs');
const path = require('path');

const root = 'D:/Desktop/obsidian-sample-plugin-master';
const langFiles = [
  path.join(root, 'src/lang/en.ts'),
  path.join(root, 'src/lang/zh-cn.ts'),
];

const targetFiles = [
  path.join(root, 'src/lang/en.ts'),
  path.join(root, 'src/lang/zh-cn.ts'),
  path.join(root, 'src/lang/index.ts'),
  path.join(root, 'src/main.ts'),
  path.join(root, 'src/settings.ts'),
  path.join(root, 'src/data/transfer.ts'),
  path.join(root, 'src/services/plugin-context.ts'),
  path.join(root, 'src/util/copy-format.ts'),
  path.join(root, 'src/data/password-library-service.ts'),
  path.join(root, 'src/data/normalize.ts'),
  path.join(root, 'src/data/defaults.ts'),
  path.join(root, 'src/services/encryption-service.ts'),
  path.join(root, 'src/ui/password-prompt-modal.ts'),
  path.join(root, 'src/util/file-name.ts'),
  path.join(root, 'src/util/duplicate-title.ts'),
  path.join(root, 'src/services/transfer-service.ts'),
  path.join(root, 'src/ui/password-manager-modal.ts'),
];

function toSnakeUpper(key) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase();
}

const enContent = fs.readFileSync(langFiles[0], 'utf8');
const keys = [...enContent.matchAll(/^\s*([A-Za-z0-9_]+):\s*['"]/gm)].map((m) => m[1]);
const mapping = Object.fromEntries(keys.map((key) => [key, toSnakeUpper(key)]));

for (const file of langFiles) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [from, to] of Object.entries(mapping)) {
    const pattern = new RegExp(`(^\\s*)${from}(:\\s*['"])`, 'gm');
    content = content.replace(pattern, `$1${to}$2`);
  }
  fs.writeFileSync(file, content, 'utf8');
}

for (const file of targetFiles) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [from, to] of Object.entries(mapping)) {
    const pattern = new RegExp(`PWM_TEXT\\.${from}\\b`, 'g');
    content = content.replace(pattern, `PWM_TEXT.${to}`);
  }
  fs.writeFileSync(file, content, 'utf8');
}

console.log(`Updated ${Object.keys(mapping).length} i18n keys across ${targetFiles.length} files.`);