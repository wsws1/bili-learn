// 同步网页前端到内嵌后端目录：public -> launcher/www/nodejs/app
import { mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = 'public';
const DST = 'launcher/www/nodejs/app';

rmSync(DST, { recursive: true, force: true });
mkdirSync(DST, { recursive: true });

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const s = join(from, name);
    const d = join(to, name);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

copyDir(SRC, DST);
console.log('web app synced -> ' + DST);
