import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('work',{recursive:true});
await build({entryPoints:['tests/core.test.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:'work/core.test.cjs'});
const result=spawnSync(process.execPath,['--test','work/core.test.cjs'],{stdio:'inherit'});
process.exit(result.status??1);
