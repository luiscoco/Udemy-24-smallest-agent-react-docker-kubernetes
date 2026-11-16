import {existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
// npm's JS entry point avoids cmd.exe and shell argument concatenation on Windows.
export function npmCommand(args) {
  const cli=process.env.npm_execpath||resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  if(!existsSync(cli))throw Error('Cannot locate npm CLI. Run this command through npm on Node.js 24.');
  return [process.execPath,[cli,...args]];
}
