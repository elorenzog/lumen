import { build as bundle } from 'esbuild';
import { build } from 'vite';
import path from 'node:path';
await bundle({ entryPoints:['electron/main.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist-electron/main.cjs',external:['electron','electron-updater','ffmpeg-static','ffprobe-static'],target:'node22' });
await bundle({ entryPoints:['electron/preload.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist-electron/preload.cjs',external:['electron'],target:'node22' });
await build();
await build({configFile:false,root:path.resolve('src/remote'),base:'/',publicDir:false,build:{outDir:path.resolve('dist/remote'),emptyOutDir:true,target:'es2023',cssCodeSplit:false,rollupOptions:{output:{entryFileNames:'remote.js',assetFileNames:'remote.[ext]'}}}});
