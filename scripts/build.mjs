import { build } from 'vite';
import path from 'node:path';
await build();
await build({configFile:false,root:path.resolve('src/remote'),base:'/',publicDir:false,build:{outDir:path.resolve('dist/remote'),emptyOutDir:true,target:'es2023',cssCodeSplit:false,rollupOptions:{output:{entryFileNames:'remote.js',assetFileNames:'remote.[ext]'}}}});
