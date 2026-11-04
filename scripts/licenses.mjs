import { readFile,readdir,writeFile } from 'node:fs/promises';
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
let text='Burrow Raid — third-party runtime notices\n\nOriginal procedural game geometry and synthesized sound are part of this project. No paid assets are used. The following notices cover the runtime libraries and bundled fonts.\n';
for(const [path,pkg]of Object.entries(lock.packages)){
  if(!path||pkg.dev||!path.includes('node_modules/'))continue;
  const metadata=JSON.parse(await readFile(path+'/package.json','utf8'));
  text+=`\n\n=== ${metadata.name} ${metadata.version} (${metadata.license||'see notice'}) ===\n`;
  const notices=(await readdir(path)).filter(name=>/^(licen[cs]e|ofl|copying)(\.|$)/i.test(name));
  if(!notices.length)throw new Error('No runtime license found for '+path);
  for(const notice of notices)text+='\n'+await readFile(path+'/'+notice,'utf8')+'\n';
}
await writeFile('public/licenses.txt',text);console.log('Wrote complete runtime dependency and font notices to public/licenses.txt.');
