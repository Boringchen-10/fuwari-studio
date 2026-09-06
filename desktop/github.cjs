const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const branch='fuwari-pages';
function validate(input){
  const owner=String(input.owner||'').trim();
  if(!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner))throw new Error('GitHub 用户名不正确');
  const repo=String(input.repo||`${owner}.github.io`).trim();
  if(repo.toLowerCase()!==`${owner}.github.io`.toLowerCase())throw new Error('当前支持 用户名.github.io 主页仓库');
  if(typeof input.token!=='string'||!input.token.trim())throw new Error('请填写 GitHub 访问令牌');
  return {provider:'github',owner,repo,token:input.token.trim(),siteUrl:`https://${owner.toLowerCase()}.github.io/`};
}
function api(config,fetcher=fetch){
  let lastWrite=0;
  return async(method,route,body)=>{
    if(method!=='GET'&&fetcher===fetch){const delay=Math.max(0,800-(Date.now()-lastWrite));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));lastWrite=Date.now();}
    let response;
    try{response=await fetcher(`https://api.github.com${route}`,{method,redirect:'error',signal:AbortSignal.timeout(60000),headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${config.token}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'Fuwari-Studio','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
    catch{throw new Error('无法连接 GitHub，请检查网络后重试');}
    const data=response.status===204?{}:await response.json();
    if(!response.ok){const error=new Error(`GitHub ${response.status}：${({401:'令牌无效或已过期',403:'权限不足或请求额度受限',404:'仓库不存在、未授权或 Pages 尚未开启',409:'仓库尚未初始化，请在 GitHub 添加 README',422:'配置冲突或分支已更新，请检查仓库后重试'})[response.status]||'请求失败'}`);error.status=response.status;throw error;}
    return data;
  };
}
async function optional(call,route){try{return await call('GET',route);}catch(error){if(error.status===404)return null;throw error;}}
async function inspect(config,call){
  const root=`/repos/${config.owner}/${config.repo}`;
  const repo=await call('GET',root);
  if(repo.private||repo.archived||repo.disabled)throw new Error('请选择公开且可写的个人主页仓库');
  if(!repo.permissions?.push)throw new Error('当前账号没有仓库写入权限');
  const head=await call('GET',`${root}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`);
  const pages=await optional(call,`${root}/pages`);
  if(pages?.cname)throw new Error('此仓库已绑定自定义域名；当前版本仅支持默认 github.io 地址');
  if(pages&&(pages.build_type!=='legacy'||pages.source?.branch!==branch||pages.source?.path!=='/'))throw new Error(`请在仓库 Settings → Pages 中选择 Deploy from a branch，分支 ${branch}，目录 / (root)；或先停用已有 Pages 配置`);
  return {root,head,pages};
}
async function test(input,fetcher){const config=validate(input);await inspect(config,api(config,fetcher));return {ok:true,message:'仓库连接通过。首次发布将创建 fuwari-pages 分支并开启 Pages。'};}
async function collect(directory,relative=''){
  const entries=[];
  for(const entry of await fs.readdir(path.join(directory,relative),{withFileTypes:true})){
    const name=relative?`${relative}/${entry.name}`:entry.name;
    if(entry.isSymbolicLink())throw new Error('发布目录不能包含链接');
    if(entry.isDirectory()){if(['.git','.github','.local-admin','node_modules'].includes(entry.name))throw new Error('发布包包含非网站目录');entries.push(...await collect(directory,name));}
    else if(entry.isFile()){const content=await fs.readFile(path.join(directory,name));if(content.length>50*1024*1024)throw new Error('单个网站文件不能超过 50 MB');entries.push({path:name,content});}
  }
  return entries;
}
function blobSha(content){return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');}
async function publish(input,directory,fetcher){
  const config=validate(input),call=api(config,fetcher),{root,head,pages}=await inspect(config,call);
  const entries=await collect(directory);
  if(!entries.some(e=>e.path==='index.html'))throw new Error('发布包缺少首页');
  if(entries.some(e=>e.path==='CNAME'))throw new Error('当前版本不支持发布包中的 CNAME');
  if(entries.length>20000||entries.reduce((n,e)=>n+e.content.length,0)>500*1024*1024)throw new Error('网站超出当前发布限制（20000 文件 / 500 MB）');
  if(!entries.some(e=>e.path==='.nojekyll'))entries.push({path:'.nojekyll',content:Buffer.alloc(0)});
  const ref=await optional(call,`${root}/git/ref/heads/${branch}`);
  const parent=ref?.object.sha||head.object.sha;
  const commit=await call('GET',`${root}/git/commits/${parent}`);
  const old=await call('GET',`${root}/git/trees/${commit.tree.sha}?recursive=1`);
  if(old.truncated)throw new Error('远程文件清单过大，已停止发布');
  const known=new Set(old.tree.filter(e=>e.type==='blob').map(e=>e.sha));
  const tree=[];
  for(const entry of entries){let sha=blobSha(entry.content);if(!known.has(sha)){sha=(await call('POST',`${root}/git/blobs`,{content:entry.content.toString('base64'),encoding:'base64'})).sha;known.add(sha);}tree.push({path:entry.path,mode:'100644',type:'blob',sha});}
  // A complete new tree removes stale output without touching the source branch.
  const createdTree=await call('POST',`${root}/git/trees`,{tree});
  const created=await call('POST',`${root}/git/commits`,{message:`Publish Fuwari ${new Date().toISOString()}`,tree:createdTree.sha,parents:[parent]});
  if(ref)await call('PATCH',`${root}/git/refs/heads/${branch}`,{sha:created.sha,force:false});
  else await call('POST',`${root}/git/refs`,{ref:`refs/heads/${branch}`,sha:created.sha});
  try{
    if(!pages)await call('POST',`${root}/pages`,{build_type:'legacy',source:{branch,path:'/'}});
    await call('POST',`${root}/pages/builds`);
  }catch(error){throw new Error(`网站文件已提交（${created.sha.slice(0,7)}），但 Pages 启动失败：${error.message}。请检查 Pages 权限与仓库设置；修复后可重新发布。`);}
  return {pending:true,commit:created.sha,message:`已提交到 GitHub，等待 Pages 部署。\n网站：${config.siteUrl}\n提交：${created.sha}\n可点击“检查上线状态”查询结果。\n`};
}
async function status(input,expectedCommit,fetcher){const config=validate(input);const call=api(config,fetcher);const latest=await optional(call,`/repos/${config.owner}/${config.repo}/pages/builds/latest`);return {status:latest?.status||'not_started',current:Boolean(expectedCommit&&latest?.commit===expectedCommit),commit:latest?.commit||'',siteUrl:config.siteUrl};}
module.exports={validate,test,publish,status,blobSha};
