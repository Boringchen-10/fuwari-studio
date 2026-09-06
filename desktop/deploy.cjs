const SftpClient = require('ssh2-sftp-client');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash,randomUUID} = require('node:crypto');

function validate(input) {
  const value={...input,port:Number(input.port||22)};
  if(typeof value.host!=='string'||!/^[a-zA-Z0-9.:-]+$/.test(value.host))throw new Error('请填写服务器域名或 IP');
  if(!Number.isInteger(value.port)||value.port<1||value.port>65535)throw new Error('SSH 端口不正确');
  if(typeof value.username!=='string'||!value.username.trim()||value.username.length>128)throw new Error('请填写 SSH 用户名');
  if(!['password','privateKey'].includes(value.authType))throw new Error('登录方式不正确');
  if(typeof value.remoteRoot!=='string'||!value.remoteRoot.startsWith('/')||value.remoteRoot.length<5||value.remoteRoot.includes('..')||/[\\\0\r\n]/.test(value.remoteRoot))throw new Error('网站目录必须是具体的绝对路径，例如 /var/www/my-blog');
  value.remoteRoot=path.posix.normalize(value.remoteRoot).replace(/\/$/,'');
  if(['/','/var','/var/www','/home','/root','/etc','/usr','/opt','/srv','/tmp'].includes(value.remoteRoot))throw new Error('请选择博客专用目录，不能使用系统目录');
  const site=new URL(value.siteUrl);
  if(!['https:','http:'].includes(site.protocol)||site.username||site.password||site.search||site.hash||site.pathname!=='/')throw new Error('v0.1 需要独立域名根路径，例如 https://blog.example.com/');
  value.siteUrl=site.href;
  if(value.fingerprint&&!/^SHA256:[A-Za-z0-9+/]{43}$/.test(value.fingerprint))throw new Error('服务器指纹格式不正确');
  if(value.authType==='privateKey'&&!value.privateKey?.includes('PRIVATE KEY'))throw new Error('请粘贴有效的 SSH 私钥');
  if(value.authType==='password'&&!value.password)throw new Error('请填写 SSH 密码');
  return value;
}
async function connect(config) {
  const client=new SftpClient();let observed;
  try {
    await client.connect({host:config.host,port:config.port,username:config.username,readyTimeout:20000,retries:0,
      ...(config.authType==='privateKey'?{privateKey:config.privateKey,passphrase:config.passphrase||undefined}:{password:config.password}),
      hostVerifier:key=>{observed='SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,'');return observed===config.fingerprint;}
    });
    return {client,observed};
  }catch(error){await client.end().catch(()=>{});if(observed&&observed!==config.fingerprint)return {observed,needsTrust:true};throw new Error('连接失败：'+error.message);}
}
async function test(config) {
  config=validate(config);const result=await connect(config);if(result.needsTrust)return {needsTrust:true,fingerprint:result.observed};
  try {
    if(!await result.client.exists(config.remoteRoot))throw new Error('网站目录不存在，请先在服务器创建专用目录');
    const stat=await result.client.lstat(config.remoteRoot);if(!stat.isDirectory||stat.isSymbolicLink)throw new Error('网站目录必须是实际文件夹，不能是符号链接');
    await result.client.list(config.remoteRoot);return {ok:true,fingerprint:result.observed,message:'连接成功，网站目录可读取。发布时会验证写入权限。'};
  }finally{await result.client.end();}
}
async function files(directory,prefix='') {
  const result=[];
  for(const entry of await fs.readdir(path.join(directory,prefix),{withFileTypes:true})){
    const relative=prefix?prefix+'/'+entry.name:entry.name;
    if(entry.isSymbolicLink())throw new Error('发布包不能包含符号链接');
    if(entry.isDirectory())result.push(...await files(directory,relative));else if(entry.isFile())result.push(relative);
  }return result;
}
function safeRelative(file){return typeof file==='string'&&file.length>0&&!file.startsWith('/')&&!file.split('/').some(p=>!p||p==='.'||p==='..')&&!/[\\\0\r\n]/.test(file);}
async function publish(config,directory,connector=connect) {
  config=validate(config);if(!config.fingerprint)throw new Error('请先核对并保存服务器指纹');
  const list=await files(directory);if(!list.includes('index.html'))throw new Error('发布包缺少首页');
  const result=await connector(config);if(result.needsTrust)throw new Error('服务器指纹发生变化，已停止发布。请重新测试并核对服务器身份。');
  const client=result.client, remote=config.remoteRoot, id=Date.now()+'-'+randomUUID().slice(0,8),backup=remote+'.studio-backups/'+id;
  const journal=[];let temp;
  async function ensureParents(relative){
    let current=remote;
    for(const segment of relative.split('/').slice(0,-1)){
      current=path.posix.join(current,segment);const type=await client.exists(current);
      if(type){const stat=await client.lstat(current);if(!stat.isDirectory||stat.isSymbolicLink)throw new Error('远程目录包含链接或非目录项：'+current);}else await client.mkdir(current);
    }
  }
  async function backupFile(relative) {
    const target=path.posix.join(remote,relative),type=await client.exists(target);
    if(type){const stat=await client.lstat(target);if(!stat.isFile||stat.isSymbolicLink)throw new Error('远程文件不是普通文件：'+relative);const dest=path.posix.join(backup,relative);await client.mkdir(path.posix.dirname(dest),true);await client.rcopy(target,dest);}
    journal.push({relative,existed:Boolean(type)});
  }
  try {
    const rootStat=await client.lstat(remote);if(!rootStat.isDirectory||rootStat.isSymbolicLink)throw new Error('网站目录必须是实际文件夹');
    const backupRoot=remote+'.studio-backups';
    if(await client.exists(backupRoot)){const stat=await client.lstat(backupRoot);if(!stat.isDirectory||stat.isSymbolicLink)throw new Error('备份目录必须是实际文件夹');}
    let previous=[];const manifest='.fuwari-studio-manifest.json';
    if(await client.exists(remote+'/'+manifest)){const data=JSON.parse((await client.get(remote+'/'+manifest)).toString());if(data.version!==1||!Array.isArray(data.files)||!data.files.every(safeRelative))throw new Error('远程发布清单不正确');previous=data.files;}
    // Upload assets first; HTML pages are replaced after their dependencies exist.
    list.sort((a,b)=>Number(a.endsWith('.html'))-Number(b.endsWith('.html'))||a.localeCompare(b));
    for(const relative of list){
      if(!safeRelative(relative))throw new Error('发布包路径不正确');await ensureParents(relative);await backupFile(relative);
      const target=remote+'/'+relative;temp=target+'.studio-'+id;await client.put(path.join(directory,relative),temp);
      try{await client.posixRename(temp,target);}catch(error){if(await client.exists(target))throw new Error('服务器不支持原子文件替换，请启用 OpenSSH SFTP：'+error.message);await client.rename(temp,target);}temp=null;
    }
    for(const relative of previous.filter(file=>!list.includes(file))){await ensureParents(relative);if(await client.exists(remote+'/'+relative)){await backupFile(relative);await client.delete(remote+'/'+relative);}}
    await backupFile(manifest);temp=remote+'/'+manifest+'.studio-'+id;await client.put(Buffer.from(JSON.stringify({version:1,files:list,publishedAt:new Date().toISOString()})),temp);
    try{await client.posixRename(temp,remote+'/'+manifest);}catch(error){if(await client.exists(remote+'/'+manifest))throw error;await client.rename(temp,remote+'/'+manifest);}temp=null;
    return {message:`发布成功：${list.length} 个文件。\n网站：${config.siteUrl}\n远程备份：${backup}\n`};
  }catch(error){
    if(temp)await client.delete(temp).catch(()=>{});
    const failures=[];
    for(const item of journal.reverse()){
      try{const target=remote+'/'+item.relative;if(item.existed){const restore=target+'.restore-'+id;await client.rcopy(backup+'/'+item.relative,restore);await client.posixRename(restore,target);}else if(await client.exists(target))await client.delete(target);}catch{failures.push(item.relative);}
    }
    throw new Error(error.message+(failures.length?`\n部分文件恢复失败，请从 ${backup} 恢复：${failures.join(', ')}`:'\n本次已替换文件已回退；线上未完成发布。'));
  }finally{await client.end().catch(()=>{});}
}
module.exports={validate,test,publish,safeRelative};
