import {spawn} from 'node:child_process';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {npmCommand} from './npm-tool.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const children=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children){if(process.platform==='win32')spawn('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});else child.kill('SIGTERM');}setTimeout(()=>process.exit(code),700);}
function launch(args){const [cmd,values]=npmCommand(args);const child=spawn(cmd,values,{cwd:root,stdio:'inherit'});children.push(child);child.on('error',e=>{console.error(e.message);stop(1)});child.on('exit',c=>{if(!stopping)stop(c??1)});}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
launch(['--prefix','backend','run','dev']);
let ready=false;for(let i=0;i<180&&!stopping;i++){try{if((await fetch('http://127.0.0.1:9900/api/health')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
if(!ready){console.error('Backend did not become ready on port9900. Run npm run setup and check configuration.');stop(1);}else if(!stopping)launch(['--prefix','frontend','run','dev']);
