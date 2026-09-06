const fs=require('node:fs/promises');
const path=require('node:path');
async function junction(source,destination){
  source=await fs.realpath(source);
  try{await fs.access(destination);if(await fs.readlink(destination)===source)return;}catch{}
  try{const stat=await fs.lstat(destination);if(!stat.isSymbolicLink())throw new Error('Dependency path already exists: '+destination);await fs.unlink(destination);}catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.symlink(source,destination,'junction');
  await fs.access(destination);
}
async function main(){
  const [mode,source,target]=process.argv.slice(2);
  if(mode==='link')return junction(source,target);
  const modules=path.join(await fs.realpath(target),'template/node_modules');
  const links=JSON.parse(await fs.readFile(path.join(source,'module-links.json'),'utf8'));
  for(const link of links){
    const destination=path.resolve(modules,link.path),origin=path.resolve(modules,link.target);
    if(!destination.startsWith(modules+path.sep)||!origin.startsWith(modules+path.sep))throw new Error('Dependency link outside runtime');
    await junction(origin,destination);
  }
  console.log(path.dirname(modules));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
