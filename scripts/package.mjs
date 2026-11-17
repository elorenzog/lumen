import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const child=spawn(process.execPath,[require.resolve('@tauri-apps/cli/tauri.js'),'build',...process.argv.slice(2)],{windowsHide:true,stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
