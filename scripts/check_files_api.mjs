import fs from 'fs';

const env = fs.readFileSync('D:/GAURAV-TEMP/Github/gaurav-personal-notes/pc-app/.env.local', 'utf-8');
const key = env.match(/VITE_GPHOST_API_KEY\s*=\s*"([^"]+)"/)?.[1];

const res = await fetch('https://gphost.eu.cc/api/v1/files', {
  headers: { Authorization: `Bearer ${key}` },
});

const data = await res.json();
const files = data.files || data.data || data;

console.log(`Live files count in GPHost: ${Array.isArray(files) ? files.length : 0}`);
for (const f of files || []) {
  console.log(` - ${f.name} (${(f.size / (1024 * 1024)).toFixed(2)} MB, ID: ${f.id})`);
}
