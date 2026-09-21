import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
await mkdir('work',{recursive:true});
const tests=['core','job-research','job-proof','recommendations','recommendations-api','wanted-url'];
await Promise.all(tests.map(name=>build({entryPoints:[`tests/${name}.test.ts`],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:`work/${name}.test.cjs`})));
const result=spawnSync(process.execPath,['--test',...tests.map(name=>`work/${name}.test.cjs`)],{stdio:'inherit'});
process.exit(result.status??1);
