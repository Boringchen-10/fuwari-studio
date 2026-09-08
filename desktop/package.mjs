import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import packager from '@electron/packager';
import {createHash} from 'node:crypto';
const base=fileURLToPath(new URL('./',import.meta.url));
const project=path.resolve(base,'../fuwari-main');
const staging=path.join(base,'staging-compact');
const template=path.join(staging,'template');
await fs.mkdir(template,{recursive:true});
// Only template-owned source is included. Personal content, credentials and history are excluded.
for(const name of ['src','public','admin','scripts','package.json','pnpm-lock.yaml','astro.config.mjs','tailwind.config.cjs','postcss.config.mjs','svelte.config.js','tsconfig.json','LICENSE']){
  await fs.cp(path.join(project,name),path.join(template,name),{recursive:true,filter:source=>{
    const rel=path.relative(project,source).replaceAll('\\','/');
    return !rel.startsWith('src/content/posts/')&&!rel.startsWith('public/uploads/')&&!rel.startsWith('src/site-settings.json')&&!rel.startsWith('src/content/spec/')&&!rel.endsWith('.test.mjs')&&!rel.endsWith('verify-api.mjs')&&!rel.endsWith('import-prototype.mjs');
  }});
}
const defaults={title:'我的博客',subtitle:'记录生活，分享热爱',name:'博主',bio:'欢迎来到我的小小空间。',avatar:'assets/images/avatar.jpg',banner:'assets/images/banner.jpg',hue:340,bannerEnabled:true,creditText:'Unsplash',creditUrl:'https://unsplash.com/',tocEnabled:true,navigation:[{name:'主页',url:'/',external:false},{name:'归档',url:'/archive/',external:false},{name:'关于',url:'/about/',external:false},{name:'友邻',url:'/friends/',external:false}],links:[{name:'RSS 订阅',url:'/rss.xml',icon:'fa6-solid:rss'}]};
await fs.writeFile(path.join(template,'src/site-settings.json'),JSON.stringify(defaults,null,2));
await fs.mkdir(path.join(template,'src/content/posts/welcome'),{recursive:true});
await fs.writeFile(path.join(template,'src/content/posts/welcome/index.md'),'---\ntitle: 欢迎来到我的博客\npublished: 2026-09-06\ndescription: 从今天开始，记录属于自己的故事。\ntags: [日常]\ncategory: 生活\ndraft: false\n---\n\n## 你好，世界\n\n这是我的第一篇文章。\n\n## 新的开始\n\n生活中值得记录的事情还有很多，慢慢写下来吧。\n');
await fs.mkdir(path.join(template,'src/content/spec'),{recursive:true});
await fs.writeFile(path.join(template,'src/content/spec/about.md'),'# 关于我\n\n欢迎来到我的博客。这里记录生活、学习和喜欢的事物。\n');
await fs.writeFile(path.join(template,'src/content/spec/friends.md'),'# 友情链接\n\n## [Fuwari](https://github.com/saicaca/fuwari)\n\n本站使用的开源博客模板。\n');
const modules=path.join(project,'node_modules'),target=path.join(template,'node_modules'),links=[];
function compact(relative){const parts=relative.split(path.sep);if(parts[0]==='.pnpm'&&parts[1]&&parts[1]!=='node_modules')parts[1]=createHash('sha256').update(parts[1]).digest('hex').slice(0,12);return parts.join(path.sep);}
let copied=0;
async function copyModules(relative=''){
  await fs.mkdir(path.join(target,compact(relative)),{recursive:true});
  for(const item of await fs.readdir(path.join(modules,relative),{withFileTypes:true})){
    if(['.vite','.astro','.cache','.bin','.modules.yaml'].includes(item.name))continue;
    const rel=path.join(relative,item.name),source=path.join(modules,rel),destination=path.join(target,compact(rel));
    if(item.isSymbolicLink()){
      const real=await fs.realpath(source);if(!real.startsWith(modules+path.sep))throw new Error('External dependency link: '+rel);
      const stat=await fs.stat(real);
      if(stat.isDirectory())links.push({path:compact(rel),target:compact(path.relative(modules,real))});else await fs.copyFile(real,destination);
    }else if(item.isDirectory())await copyModules(rel);
    else{await fs.copyFile(source,destination);copied++;}
  }
}
console.log('Bundling Fuwari runtime dependencies…');await copyModules();
await fs.writeFile(path.join(staging,'module-links.json'),JSON.stringify(links));
await fs.mkdir(path.join(staging,'runtime'),{recursive:true});
const runtime=process.env.STUDIO_NODE_PATH;
if(!runtime)throw new Error('Set STUDIO_NODE_PATH to Node 22 node.exe');
await fs.copyFile(runtime,path.join(staging,'runtime/node.exe'));
await fs.copyFile(path.join(base,'NODE-LICENSE.txt'),path.join(staging,'runtime/NODE-LICENSE.txt'));
await fs.copyFile(path.join(base,'README.md'),path.join(staging,'使用说明.txt'));
const output=await packager({dir:base,out:path.resolve(base,'../release-v012'),name:'Blog Studio',appVersion:'0.1.2',platform:'win32',arch:'x64',overwrite:true,asar:false,prune:false,electronVersion:'40.10.6',electronZipDir:process.env.ELECTRON_ZIP_DIR,ignore:[/^\/(?!node_modules(?:\/|$)|main\.cjs$|runtime\.cjs$|deploy\.cjs$|github\.cjs$|GITHUB\.md$|package\.json$|README\.md$|NODE-LICENSE\.txt$).+/,/^\/node_modules\/(?:@electron|electron|electron-packager)(\/|$)/],extraResource:[template,path.join(staging,'runtime'),path.join(staging,'module-links.json'),path.join(staging,'使用说明.txt')],win32metadata:{CompanyName:'Blog Studio',FileDescription:'Blog Studio v0.1.2',ProductName:'Blog Studio',InternalName:'BlogStudio'}});
console.log(JSON.stringify({output,dependencyFiles:copied,portableLinks:links.length},null,2));
