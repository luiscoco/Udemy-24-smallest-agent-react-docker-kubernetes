import {copyFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {npmCommand} from './npm-tool.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
for(const project of ['backend','frontend']){const [command,args]=npmCommand(['--prefix',project,'ci']);const r=spawnSync(command,args,{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status??1);}
if(!existsSync('backend/.env')){copyFileSync('backend/.env.example','backend/.env');console.log('Created backend/.env with a placeholder key; existing files are preserved.');}
const r=spawnSync(process.execPath,['scripts/generate-lesson.mjs'],{stdio:'inherit'});process.exit(r.status??1);
