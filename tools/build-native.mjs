// 打包启动器原生桥：launcher/www/src/native-boot.js -> launcher/www/native.js
import { build } from 'esbuild';

await build({
  entryPoints: ['launcher/www/src/native-boot.js'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  outfile: 'launcher/www/native.js',
});

console.log('native.js built');
