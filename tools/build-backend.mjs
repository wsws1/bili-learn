// 打包内嵌后端：server.mjs -> launcher/www/nodejs/server.js（CommonJS，bridge 外部化）
import { build } from 'esbuild';

await build({
  entryPoints: ['server.mjs'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['bridge'],
  outfile: 'launcher/www/nodejs/server.js',
  banner: {
    js:
      '// 知学 Android 内嵌后端（由 server.mjs 打包，勿手改）\n' +
      'console.log("[zhixue-node] bundle loaded, android=" + (process.env.BF_ANDROID || "0") + ", publicDir=" + (process.env.BF_PUBLIC_DIR || "(unset)"));',
  },
});

console.log('server.js (CJS bundle) built');
