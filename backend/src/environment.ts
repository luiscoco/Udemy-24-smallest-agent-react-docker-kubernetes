import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {parse} from 'dotenv';
export function loadEnvironment(){const file=fileURLToPath(new URL('../.env',import.meta.url));return {...(existsSync(file)?parse(readFileSync(file)):{}),...process.env};}
