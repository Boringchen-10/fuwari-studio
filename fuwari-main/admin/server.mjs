import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { atomicWrite, fail, listMarkdown, parsePost, revision, safeSlug, serializePost, validateSettings } from './lib.mjs';

const root = process.env.BLOG_PROJECT_ROOT || fileURLToPath(new URL('../', import.meta.url));
const adminRoot = fileURLToPath(new URL('./', import.meta.url));
const postsRoot = path.join(root, 'src/content/posts');
const localRoot = path.join(root, '.local-admin');
const historyRoot = path.join(localRoot, 'history');
const trashRoot = path.join(localRoot, 'trash');
const settingsFile = path.join(root, 'src/site-settings.json');
const csrf = randomBytes(32).toString('hex');
let queue = Promise.resolve();
let previewReady = false;
let previewError = '';
let job = {status:'idle', logs:[], output:'', finishedAt:null};
let buildChild;
const rpcPending = new Map();
process.on('message', message => {
  const pending = rpcPending.get(message?.reply);
  if (pending) { rpcPending.delete(message.reply); message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.result); }
  if (message?.type === 'shutdown') shutdown();
});
function desktopCall(action, data = {}) {
  if (!process.send) fail('此功能需要在 Fuwari Studio 桌面程序中使用', 400);
  return new Promise((resolve, reject) => { const id = randomUUID(); rpcPending.set(id, {resolve,reject}); process.send({id,action,data}); });
}
const lock = task => { const next = queue.then(task); queue = next.catch(() => {}); return next; };
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };
const confined = (base, relative) => { const full = path.resolve(base, relative); if (!full.startsWith(path.resolve(base) + path.sep)) fail('路径不在允许范围内'); return full; };
const freePort = preferred => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', error => error.code === 'EADDRINUSE' ? freePort(0).then(resolve,reject) : reject(error));
  probe.listen(preferred,'127.0.0.1',() => {const port=probe.address().port;probe.close(()=>resolve(port));});
});
const port = await freePort(Number(process.env.BLOG_ADMIN_PORT) || 4310);
const previewPort = await freePort(Number(process.env.BLOG_PREVIEW_PORT) || 4322);
const origin = `http://127.0.0.1:${port}`;
const previewOrigin = `http://127.0.0.1:${previewPort}`;
await fs.mkdir(localRoot,{recursive:true});

function json(res, body, status=200) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body)); }
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail('请求格式不正确',415);
  const chunks=[]; let size=0;
  for await (const chunk of req) {size+=chunk.length;if(size>18*1024*1024) fail('文件不能超过 12 MB',413);chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));} catch {fail('无法读取请求内容');}
}
async function listPosts() {
  return (await Promise.all((await listMarkdown(postsRoot)).map(async relative => {
    const slug = relative.replace(/\/index\.md$/, '').replace(/\.md$/, '');
    const post = parsePost(await fs.readFile(path.join(postsRoot,relative),'utf8'),slug);
    return {...post, relative};
  }))).sort((a,b)=>b.published.localeCompare(a.published));
}
async function locatePost(slug) {
  safeSlug(slug);
  const post = (await listPosts()).find(post=>post.slug===slug);
  if(!post) fail('文章不存在',404);
  return {post, file:confined(postsRoot,post.relative)};
}
async function readVersioned(file) {const text=await fs.readFile(file,'utf8');return {text,revision:revision(text)};}
function ensureRevision(current, expected) {if(current!==expected) fail('文件已被其他窗口修改，请重新载入后再保存。当前编辑内容仍保留在界面中。',409);}
async function trashList() {
  await fs.mkdir(trashRoot,{recursive:true});
  const result=[];
  for(const name of await fs.readdir(trashRoot)) {
    try {result.push(JSON.parse(await fs.readFile(path.join(trashRoot,name,'record.json'),'utf8')));} catch {}
  }
  return result.sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));
}
const addLog = chunk => {job.logs.push(String(chunk).replace(/\x1b\[[0-9;]*m/g,''));if(job.logs.length>300)job.logs.shift();};
async function runBuildCommand(args) {
  await new Promise((resolve,reject)=>{
    buildChild=spawn(process.execPath,args,{cwd:root,windowsHide:true,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'}});
    buildChild.stdout.on('data',addLog);buildChild.stderr.on('data',addLog);
    buildChild.on('error',reject);buildChild.on('close',code=>code===0?resolve():reject(new Error(`构建命令退出，状态码 ${code}`)));
  });
}
async function buildRelease(forDeployment=false) {
  try {
    const id = new Date().toISOString().replace(/[:.]/g,'-');
    const out = path.join(localRoot,'releases',id);
    await runBuildCommand([path.join(root,'node_modules/astro/astro.js'),'build','--outDir',out]);
    await runBuildCommand([path.join(root,'node_modules/pagefind/lib/runner/bin.cjs'),'--site',out]);
    job={...job,status:forDeployment?'running':'success',output:out,finishedAt:forDeployment?null:new Date().toISOString()};
  } catch(error) {addLog(error.message);job={...job,status:'failed',finishedAt:new Date().toISOString()};}
  finally {buildChild=null;await fs.writeFile(path.join(localRoot,'last-build.json'),JSON.stringify(job,null,2));}
}
try {job=JSON.parse(await fs.readFile(path.join(localRoot,'last-build.json'),'utf8'));if(job.status==='running')job.status='failed';} catch {}

async function api(req,res,url) {
  const route=url.pathname;
  if(req.method!=='GET' && job.status==='running') fail('正在构建或发布，请完成后再修改内容',423);
  if (route === '/api/desktop' && req.method === 'GET') return json(res, {enabled:Boolean(process.send),version:'0.1.2',project:root});
  if (route === '/api/desktop/settings' && req.method === 'GET') return json(res, await desktopCall('studio-settings-get'));
  if (route === '/api/desktop/settings' && req.method === 'PUT') return json(res, await desktopCall('studio-settings-save', await body(req)));
  if (route === '/api/desktop/settings/choose' && req.method === 'POST') return json(res, await desktopCall('studio-settings-choose'));
  if (route === '/api/connections' && req.method === 'GET') return json(res, await desktopCall('connections-get'));
  if (route === '/api/connection' && req.method === 'GET') return json(res, await desktopCall('connection-get'));
  if (route === '/api/connection' && req.method === 'PUT') return json(res, await desktopCall('connection-save',await body(req)));
  if (route === '/api/connection/test' && req.method === 'POST') return json(res, await desktopCall('connection-test',await body(req)));
  if (route === '/api/github/status' && req.method === 'GET') return json(res, await desktopCall('github-status',{commit:job.commit}));
  if (route === '/api/project/open' && req.method === 'POST') return json(res, await desktopCall('project-open'));
  if (route === '/api/project/folder' && req.method === 'POST') return json(res, await desktopCall('project-folder'));
  if (route === '/api/deploy' && req.method === 'POST') {
    if (job.status === 'running') fail('正在构建，请稍后重试',423);
    const input = await body(req);
    if (input.confirm !== true) fail('发布前需要确认目标服务器');
    if (!process.send) fail('请使用桌面程序发布');
    job={status:'running',logs:[],output:'',finishedAt:null};
    void (async()=>{
      try {
        const connections=await desktopCall('connections-get');
        const targets=Array.isArray(input.targets)?input.targets.filter(target=>target==='sftp'||target==='github'):[];
        const selected=targets.length?targets:['sftp'];
        if (!selected.some(target=>connections[target]?.configured)) throw new Error('请先保存至少一个已选择的发布连接');
        const connection=connections[selected.find(target=>connections[target]?.configured)];
        const oldSite=process.env.SITE_URL;
        process.env.SITE_URL=connection.siteUrl;
        try { await buildRelease(true); } finally { if(oldSite)process.env.SITE_URL=oldSite;else delete process.env.SITE_URL; }
        if(job.status==='failed') return;
        job.status='running';addLog(connection.provider==='github'?'\n正在提交 GitHub Pages…\n':'\n正在通过 SFTP 发布…\n');
        const result=await desktopCall('deploy',{directory:job.output,targets:selected});
        addLog(result.message);job.status='success';job.deployed=!result.pending;job.pending=Boolean(result.pending);job.commit=result.commit;job.finishedAt=new Date().toISOString();
      }catch(error){addLog(error.message);job.status='failed';}
      finally {await fs.writeFile(path.join(localRoot,'last-build.json'),JSON.stringify(job,null,2));}
    })();
    return json(res,job,202);
  }
  if(route==='/api/bootstrap' && req.method==='GET') {
    const settings=await readVersioned(settingsFile);
    return json(res,{csrf,settings:JSON.parse(settings.text),settingsRevision:settings.revision,posts:(await listPosts()).map(({body,relative,...post})=>post),previewOrigin,previewReady,previewError,job,trash:await trashList()});
  }
  if(route==='/api/status' && req.method==='GET') return json(res,{previewReady,previewError,job});
  if(route==='/api/posts' && req.method==='GET') return json(res,(await listPosts()).map(({body,relative,...post})=>post));
  if(req.method!=='GET' && job.status==='running') fail('正在生成发布包，请完成后再修改内容',423);
  if(route==='/api/posts' && req.method==='POST') {
    const input=await body(req); const slug=safeSlug(input.slug || `post-${Date.now()}`);
    const dir=confined(postsRoot,slug);
    if(await exists(dir) || (await listPosts()).some(post=>post.slug===slug)) fail('这个文章地址已经存在',409);
    const post={title:input.title || '未命名文章',published:new Date().toISOString().slice(0,10),description:'',category:'',tags:[],image:'',draft:true,body:''};
    const text=serializePost(post);
    await atomicWrite(path.join(dir,'index.md'),text);
    return json(res,parsePost(text,slug),201);
  }
  if(route.startsWith('/api/posts/')) {
    const slug=decodeURIComponent(route.slice('/api/posts/'.length));
    const {post,file}=await locatePost(slug);
    if(req.method==='GET') return json(res,post);
    const input=await body(req);const old=await readVersioned(file);ensureRevision(old.revision,input.revision);
    if(req.method==='PUT') {
      const text=serializePost(input,old.text);await atomicWrite(file,text,historyRoot);return json(res,parsePost(text,slug));
    }
    if(req.method==='DELETE') {
      const id=randomUUID();const dir=path.join(trashRoot,id);await fs.mkdir(dir,{recursive:true});
      const record={id,title:post.title,relative:post.relative,slug,deletedAt:new Date().toISOString()};
      await fs.copyFile(file,path.join(dir,'post.md'));
      await fs.writeFile(path.join(dir,'record.json'),JSON.stringify(record));
      await fs.unlink(file);
      return json(res,record);
    }
  }
  if(route==='/api/trash' && req.method==='GET')return json(res,await trashList());
  if(route==='/api/restore' && req.method==='POST') {
    const input=await body(req);if(!/^[a-f0-9-]{36}$/.test(input.id))fail('回收记录不正确');
    const dir=path.join(trashRoot,input.id);const record=JSON.parse(await fs.readFile(path.join(dir,'record.json'),'utf8'));
    const file=confined(postsRoot,record.relative);if(await exists(file))fail('已有同名文章，无法覆盖恢复',409);
    await atomicWrite(file,await fs.readFile(path.join(dir,'post.md'),'utf8'));
    await fs.unlink(path.join(dir,'record.json'));await fs.unlink(path.join(dir,'post.md'));await fs.rmdir(dir);
    return json(res,{slug:record.slug});
  }
  if(route==='/api/settings' && req.method==='PUT') {
    const input=await body(req);const current=await readVersioned(settingsFile);ensureRevision(current.revision,input.revision);
    const settings=validateSettings(input.settings);const text=JSON.stringify(settings,null,2)+'\n';
    await atomicWrite(settingsFile,text,historyRoot);return json(res,{settings,revision:revision(text)});
  }
  if(route.startsWith('/api/pages/')) {
    const kind=route.slice('/api/pages/'.length);if(!['about','friends'].includes(kind))fail('页面不存在',404);
    const file=path.join(root,'src/content/spec',`${kind}.md`);const current=await readVersioned(file);
    if(req.method==='GET')return json(res,{body:current.text,revision:current.revision});
    if(req.method==='PUT') {
      const input=await body(req);ensureRevision(current.revision,input.revision);
      if(typeof input.body!=='string'||input.body.length>500000)fail('页面内容过长');
      await atomicWrite(file,input.body,historyRoot);return json(res,{body:input.body,revision:revision(input.body)});
    }
  }
  if(route==='/api/upload' && req.method==='POST') {
    const input=await body(req);
    if(typeof input.data!=='string'||input.data.length>17*1024*1024)fail('图片不能超过 12 MB');
    const bytes=Buffer.from(input.data,'base64');if(bytes.length>12*1024*1024)fail('图片不能超过 12 MB');
    const image=sharp(bytes,{limitInputPixels:40000000});
    const info=await image.metadata();if(!['jpeg','png','webp','gif','avif','heif'].includes(info.format))fail('请选择 JPG、PNG、WebP 或 GIF 图片');
    const filename=`${Date.now()}-${randomUUID().slice(0,8)}.webp`;
    const dest=path.join(root,'public/uploads',filename);await fs.mkdir(path.dirname(dest),{recursive:true});
    await image.rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toFile(dest);
    return json(res,{path:`/uploads/${filename}`});
  }
  if(route==='/api/build' && req.method==='POST') {
    const posts=await listPosts();if(!posts.some(post=>!post.draft))fail('至少需要一篇待发布文章');
    job={status:'running',logs:[],output:'',finishedAt:null};void buildRelease();return json(res,job,202);
  }
  fail('接口不存在',404);
}

const staticFiles = new Map([
  ['/',[path.join(adminRoot,'index.html'),'text/html; charset=utf-8']],
  ['/app.js',[path.join(adminRoot,'app.js'),'text/javascript; charset=utf-8']],
  ['/desktop-ui.js',[path.join(adminRoot,'desktop-ui.js'),'text/javascript; charset=utf-8']],
  ['/styles.css',[path.join(adminRoot,'styles.css'),'text/css; charset=utf-8']],
  ['/lucide.js',[path.join(adminRoot,'lucide.min.js'),'text/javascript; charset=utf-8']]
]);
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
  try {
    if(req.headers.host!==`127.0.0.1:${port}`)fail('只能通过本机地址访问',403);
    if(req.headers.origin && req.headers.origin!==origin)fail('不允许跨站请求',403);
    if(req.headers['sec-fetch-site']==='cross-site')fail('不允许跨站请求',403);
    const url=new URL(req.url,origin);
    if(url.pathname.startsWith('/api/')) {
      if(req.method!=='GET' && req.headers['x-csrf-token']!==csrf)fail('请刷新管理界面后重试',403);
      return await lock(()=>api(req,res,url));
    }
    if(req.method!=='GET')fail('请求方式不支持',405);
    if(url.pathname==='/media') {
      const source=url.searchParams.get('path') || '';let file;
      if(source.startsWith('/uploads/'))file=confined(path.join(root,'public/uploads'),source.slice(9));
      else if(source.startsWith('assets/images/'))file=confined(path.join(root,'src/assets/images'),source.slice(14));
      else if(source.startsWith('./')) {const {file:postFile}=await locatePost(url.searchParams.get('slug')||'');file=confined(path.dirname(postFile),source.slice(2));}
      else fail('图片不存在',404);
      const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'};
      const mime=types[path.extname(file).toLowerCase()];if(!mime)fail('不支持的图片格式',404);
      const real=await fs.realpath(file);if(real!==path.resolve(file))fail('不允许链接文件',403);
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-cache'});return res.end(await fs.readFile(file));
    }
    const entry=staticFiles.get(url.pathname);if(!entry)fail('页面不存在',404);
    res.writeHead(200,{'Content-Type':entry[1],'Cache-Control':'no-store'});res.end(await fs.readFile(entry[0]));
  } catch(error) {if(!res.headersSent)json(res,{error:error.code==='ENOENT'?'文件不存在':error.message},error.status || (error.code==='ENOENT'?404:500));else res.end();}
});

server.listen(port,'127.0.0.1',()=>console.log(`Blog Studio: ${origin}`));
const preview=spawn(process.execPath,[path.join(root,'node_modules/astro/astro.js'),'dev','--host','127.0.0.1','--port',String(previewPort)],{cwd:root,windowsHide:true,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1'}});
const previewLog=async chunk=>{const text=String(chunk);if(text.includes('Local')&&text.includes(String(previewPort)))previewReady=true;await fs.appendFile(path.join(localRoot,'preview.log'),text).catch(()=>{});};
preview.stdout.on('data',previewLog);preview.stderr.on('data',previewLog);
preview.on('error',error=>{previewError=error.message;});
preview.on('close',code=>{previewReady=false;previewError=`预览进程已退出 (${code})，请重新启动本地程序。`;});
let shuttingDown=false;
function shutdown(){if(shuttingDown)return;shuttingDown=true;preview.kill();buildChild?.kill();server.close();setTimeout(()=>process.exit(),500).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
if(process.argv.includes('--open'))spawn('explorer.exe',[origin],{windowsHide:true,stdio:'ignore'}).unref();
