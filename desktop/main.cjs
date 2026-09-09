const {app,BrowserWindow,dialog,shell,safeStorage,Menu} = require('electron');
const path=require('node:path');
const fsSync=require('node:fs');
const fs=require('node:fs/promises');
const {fork,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execFileAsync=promisify(execFile);
const {createHash,randomUUID}=require('node:crypto');
const deployment=require('./deploy.cjs');
const github=require('./github.cjs');
const dataArg=process.argv.find(arg=>arg.startsWith('--data-dir='));
if(dataArg)app.setPath('userData',path.resolve(dataArg.slice(11)));
else if(app.isPackaged)app.setPath('userData',path.join(app.getPath('appData'),'Blog Studio'));
function findLegacyDataRootsSync(){if(!app.isPackaged||dataArg)return [];const searchRoot=path.resolve(path.dirname(process.execPath),'../..'),found=[];function walk(directory,depth){if(depth>4)return;let entries;try{entries=fsSync.readdirSync(directory,{withFileTypes:true});}catch{return;}for(const entry of entries){if(!entry.isDirectory()||entry.isSymbolicLink())continue;const full=path.join(directory,entry.name);if(entry.name==='Fuwari Studio Data'){found.push(full);continue;}if(['node_modules','resources','.git','Cache','Code Cache','Runtime'].includes(entry.name))continue;walk(full,depth+1);}}walk(searchRoot,0);return found;}
function migrateLegacyEncryptionState(){if(!app.isPackaged||dataArg)return;const destination=app.getPath('userData'),marker=path.join(destination,'legacy-key-migrated.json');if(fsSync.existsSync(marker))return;const records=[];for(const root of findLegacyDataRootsSync()){try{const config=JSON.parse(fsSync.readFileSync(path.join(root,'studio.json'),'utf8')),source=path.join(root,'Local State'),mtime=fsSync.statSync(path.join(root,'studio.json')).mtimeMs;if(fsSync.existsSync(source))records.push({root,config,source,mtime});}catch{}}records.sort((a,b)=>Number(Boolean(b.config.project&&!path.resolve(b.config.project).toLowerCase().startsWith(path.resolve(b.root).toLowerCase()+path.sep)))-Number(Boolean(a.config.project&&!path.resolve(a.config.project).toLowerCase().startsWith(path.resolve(a.root).toLowerCase()+path.sep)))||b.mtime-a.mtime);if(!records.length)return;fsSync.mkdirSync(destination,{recursive:true});fsSync.copyFileSync(records[0].source,path.join(destination,'Local State'));fsSync.writeFileSync(marker,JSON.stringify({migratedAt:new Date().toISOString()}));}
migrateLegacyEncryptionState();
let window,child,project,closing=false,publishing=false;
const resources=app.isPackaged?process.resourcesPath:path.resolve(__dirname,'staging-compact');
let template=path.join(resources,'template');
const nodePath=path.join(resources,'runtime/node.exe');
const single=app.requestSingleInstanceLock();if(!single)app.quit();
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
const configFile=()=>path.join(app.getPath('userData'),'studio.json');
async function readAppConfig(){try{return JSON.parse(await fs.readFile(configFile(),'utf8'));}catch{return {};}}
async function writeAppConfig(data){await fs.mkdir(app.getPath('userData'),{recursive:true});const temp=configFile()+'.tmp';await fs.writeFile(temp,JSON.stringify(data,null,2));await fs.rename(temp,configFile());}
async function findLegacyDataRoots(){return findLegacyDataRootsSync();}
async function migrateLegacyData(){const roots=await findLegacyDataRoots();if(!roots.length)return;const saved=await readAppConfig(),records=[];for(const root of roots){try{const file=path.join(root,'studio.json'),stat=await fs.stat(file),config=JSON.parse(await fs.readFile(file,'utf8'));records.push({root,config,mtime:stat.mtimeMs});}catch{}}records.sort((a,b)=>b.mtime-a.mtime);const projectPaths=[...(saved.projects||[]).map(item=>typeof item==='string'?item:item.path),saved.project,...records.map(item=>item.config.project)].filter(Boolean);let active=saved.project;if(!active){const external=records.find(item=>item.config.project&&!path.resolve(item.config.project).toLowerCase().startsWith(path.resolve(item.root).toLowerCase()+path.sep));active=external?.config.project||records.find(item=>item.config.project)?.config.project;}const importedStudio=records.find(item=>item.config.studio)?.config.studio;const studio=saved.studio||importedStudio?{...(saved.studio||importedStudio)}:undefined;if(studio?.cacheDir&&roots.some(root=>path.resolve(studio.cacheDir).toLowerCase().startsWith(path.resolve(root).toLowerCase())))studio.cacheDir=app.getPath('userData');await writeAppConfig({...saved,...(studio?{studio}:{}),...(active?{project:active}:{}),projects:[...new Map(projectPaths.map(item=>[path.resolve(item).toLowerCase(),path.resolve(item)])).values()].slice(0,20)});const destination=path.join(app.getPath('userData'),'connections');await fs.mkdir(destination,{recursive:true});for(const item of records){const source=path.join(item.root,'connections');let files=[];try{files=await fs.readdir(source);}catch{}for(const name of files.filter(name=>name.endsWith('.bin'))){const target=path.join(destination,name);try{await fs.access(target);}catch{await fs.copyFile(path.join(source,name),target);}}}}
async function projectSummary(candidate){try{const settings=JSON.parse(await fs.readFile(path.join(candidate,'src/site-settings.json'),'utf8'));return {path:candidate,name:settings.title||path.basename(candidate),subtitle:settings.subtitle||'',exists:true};}catch{return {path:candidate,name:path.basename(candidate),subtitle:'',exists:false};}}
async function rememberProject(candidate){const saved=await readAppConfig();const real=await fs.realpath(candidate);const projects=[real,...(saved.projects||[]).map(item=>typeof item==='string'?item:item.path).filter(item=>item&&path.resolve(item).toLowerCase()!==real.toLowerCase())].slice(0,20);await writeAppConfig({...saved,project:real,projects});return real;}
async function listProjects(){const saved=await readAppConfig();const paths=[project,saved.project,...(saved.projects||[]).map(item=>typeof item==='string'?item:item.path)].filter(Boolean);const unique=[];for(const item of paths)if(!unique.some(old=>path.resolve(old).toLowerCase()===path.resolve(item).toLowerCase()))unique.push(item);return Promise.all(unique.map(projectSummary));}
const credentialFile=()=>path.join(app.getPath('userData'),'connections',createHash('sha256').update(project.toLowerCase()).digest('hex')+'.bin');
async function readConnections(){
  try{
    const raw=JSON.parse(safeStorage.decryptString(await fs.readFile(credentialFile())));
    if(Array.isArray(raw.sftpProfiles))return {sftpProfiles:raw.sftpProfiles,github:raw.github||{}};
    if(raw.sftp||raw.github)return {sftpProfiles:raw.sftp?[{...raw.sftp,profileId:raw.sftp.profileId||'default',profileName:raw.sftp.profileName||'默认服务器'}]:[],github:raw.github||{}};
    if(raw?.provider==='github')return {sftpProfiles:[],github:raw};
    if(raw?.provider==='sftp'||raw?.host)return {sftpProfiles:[{...raw,profileId:'default',profileName:'默认服务器'}],github:{}};
    return {sftpProfiles:[],github:{}};
  }catch(error){if(error.code==='ENOENT')return {sftpProfiles:[],github:{}};throw new Error('无法解密服务器资料，请在当前 Windows 用户下重新配置。');}
}
async function writeConnections(connections){const file=credentialFile();await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,safeStorage.encryptString(JSON.stringify(connections)));}
function publicConnection(connection){const {password,privateKey,passphrase,token,...data}=connection;return {...data,configured:connection.provider==='github'?Boolean(token):Boolean(connection.fingerprint),hasToken:Boolean(token),hasPassword:Boolean(password),hasPrivateKey:Boolean(privateKey)};}
async function readConnection(provider,profileId){const all=await readConnections();if(provider==='github')return all.github||{};return all.sftpProfiles.find(item=>item.profileId===profileId)||all.sftpProfiles[0]||{};}
async function mergedConnection(input){
  const old=await readConnection(input.provider==='github'?'github':'sftp',input.profileId);const same=old.host===input.host&&Number(old.port)===Number(input.port)&&old.username===input.username&&old.authType===input.authType;
  if(input.provider==='github')return github.validate({...input,token:input.token||(old.provider==='github'&&old.owner===input.owner&&old.repo===input.repo?old.token:'')});
  const profileName=String(input.profileName||old.profileName||'服务器').trim().slice(0,40);if(!profileName)throw new Error('请填写服务器名称');
  return deployment.validate({...input,provider:'sftp',profileId:input.profileId||old.profileId||randomUUID(),profileName,password:input.password||(same?old.password:''),privateKey:input.privateKey||(same?old.privateKey:''),passphrase:input.passphrase||(same?old.passphrase:'')});
}
async function handle(action,data){
  if(action==='studio-settings-get'){const saved=await readAppConfig();return {...(saved.studio||{}),cacheDir:saved.studio?.cacheDir||app.getPath('userData')};}
  if(action==='studio-settings-choose'){const picked=await dialog.showOpenDialog(window,{title:'选择本地缓存目录',properties:['openDirectory','createDirectory']});return picked.canceled?{canceled:true}:{canceled:false,cacheDir:picked.filePaths[0]};}
  if(action==='studio-settings-save'){const saved=await readAppConfig();const studio={...(saved.studio||{}),hue:Math.max(0,Math.min(360,Number(data.hue)||150)),accent:/^#[0-9a-f]{6}$/i.test(String(data.accent||''))?data.accent:'#287d65',theme:['system','light','dark'].includes(data.theme)?data.theme:'system',device:['desktop','mobile'].includes(data.device)?data.device:'desktop',autosaveDelay:Math.max(300,Math.min(5000,Number(data.autosaveDelay)||700)),cacheDir:String(data.cacheDir||'').trim()};await writeAppConfig({...saved,studio});return studio;}
  if(action==='projects-get')return {current:project,projects:await listProjects()};
  if(action==='connections-get'){const all=await readConnections();const sftpProfiles=all.sftpProfiles.map(publicConnection);return {sftpProfiles,sftp:sftpProfiles[0]||{},github:publicConnection(all.github||{})};}
  if(action==='connection-get')return publicConnection(await readConnection(data?.provider,data?.profileId));
  if(action==='github-status')return github.status(await readConnection('github'),data.commit);
  if(action==='connection-test'){
    const config=await mergedConnection(data);if(config.provider==='github')return github.test(config);let result=await deployment.test(config);
    if(result.needsTrust){
      const response=await dialog.showMessageBox(window,{type:'warning',title:'核对 SSH 服务器指纹',message:config.fingerprint?'服务器身份已改变':'首次连接这台服务器',detail:`服务器：${config.host}:${config.port}\n\nSHA256 指纹：\n${result.fingerprint}\n\n请与服务器管理员提供的指纹核对。一致后才继续认证。`,buttons:['取消','指纹一致，继续'],defaultId:0,cancelId:0,noLink:true});
      if(response.response!==1)throw new Error('已取消服务器身份确认');
      config.fingerprint=result.fingerprint;result=await deployment.test(config);
    }
    return {...result,fingerprint:config.fingerprint};
  }
  if(action==='connection-save'){
    if(publishing)throw new Error('发布中不能修改服务器');
    if(!safeStorage.isEncryptionAvailable())throw new Error('Windows 本机加密不可用，无法保存凭据');
    const config=await mergedConnection(data);
    if(config.provider==='github')await github.test(config);
    else {if(!config.fingerprint)throw new Error('请先测试连接并核对服务器指纹');const result=await deployment.test(config);if(result.needsTrust)throw new Error('服务器指纹不匹配，请重新测试连接');}
    const all=await readConnections();
    if(config.provider==='github')all.github=config;
    else {const index=all.sftpProfiles.findIndex(item=>item.profileId===config.profileId);if(index>=0)all.sftpProfiles[index]=config;else all.sftpProfiles.push(config);}
    await writeConnections(all);return publicConnection(config);
  }
  if(action==='connection-delete'){
    if(publishing)throw new Error('发布中不能删除服务器');const all=await readConnections();const profile=all.sftpProfiles.find(item=>item.profileId===data.profileId);if(!profile)throw new Error('服务器配置不存在');
    const approval=await dialog.showMessageBox(window,{type:'warning',title:'删除服务器配置',message:`删除“${profile.profileName}”？`,detail:'只删除本机保存的连接资料，不会删除服务器文件或线上网站。',buttons:['取消','删除'],defaultId:0,cancelId:0,noLink:true});if(approval.response!==1)throw new Error('已取消删除');
    all.sftpProfiles=all.sftpProfiles.filter(item=>item.profileId!==profile.profileId);await writeConnections(all);return {deleted:true};
  }
  if(action==='deploy'){
    if(publishing)throw new Error('已有发布正在执行');
    const directory=await fs.realpath(data.directory);const allowed=path.join(project,'.local-admin','releases')+path.sep;
    if(!directory.startsWith(allowed))throw new Error('只能发布当前博客生成的发布包');
    const all=await readConnections();const targets=Array.isArray(data?.targets)&&data.targets.length?data.targets:['sftp'];const selected=[];
    for(const target of targets){if(target==='github'&&all.github?.token)selected.push({key:'github',label:'GitHub Pages',config:all.github});else if(target==='sftp'&&all.sftpProfiles[0])selected.push({key:'sftp',label:all.sftpProfiles[0].profileName,config:all.sftpProfiles[0]});else if(String(target).startsWith('sftp:')){const profile=all.sftpProfiles.find(item=>item.profileId===String(target).slice(5));if(profile)selected.push({key:'sftp',label:profile.profileName,config:profile});}}
    if(!selected.length)throw new Error('请先保存至少一个发布连接');
    publishing=true;
    try{
      const approval=await dialog.showMessageBox(window,{type:'question',title:'确认发布',message:'确认发布到已选择的目标？',detail:selected.map(target=>target.key==='github'?`GitHub Pages：${target.config.owner}/${target.config.repo}`:`${target.label}：${target.config.siteUrl}\n目录：${target.config.remoteRoot}`).join('\n\n')+'\n\n将上传构建后的网站，历史版本会保留。',buttons:['取消','发布'],defaultId:0,cancelId:0,noLink:true});
      if(approval.response!==1)throw new Error('已取消发布');
      const results=[];
      for(const target of selected){
        try{const result=target.key==='github'?await github.publish(target.config,directory):await deployment.publish(target.config,directory);results.push({...target,ok:true,result});}
        catch(error){results.push({...target,ok:false,error:error.message});}
      }
      const failed=results.filter(item=>!item.ok);if(failed.length===results.length)throw new Error(results.map(item=>`${item.label}：${item.error}`).join('\n'));
      return {pending:results.some(item=>item.result?.pending),commit:results.find(item=>item.result?.commit)?.result.commit,sites:results.filter(item=>item.ok).map(item=>({target:item.label,siteUrl:item.config.siteUrl})),message:results.map(item=>`${item.label}：${item.ok?(item.result.message||'发布成功'):item.error}`).join('\n')};
    }finally{publishing=false;}
    /* legacy branch retained below for source compatibility */
    /*
    const connection=await readConnection();
    if(connection.provider==='github'){
      publishing=true;
      try{
        const approval=await dialog.showMessageBox(window,{type:'question',title:'发布到 GitHub Pages',message:'确认公开发布博客？',detail:`仓库：${connection.owner}/${connection.repo}\n网站：${connection.siteUrl}\n分支：fuwari-pages\n\n将上传构建后的公开网站，替换该发布分支的文件，并开启 Pages。历史提交保留。`,buttons:['取消','发布'],defaultId:0,cancelId:0,noLink:true});
        if(approval.response!==1)throw new Error('已取消发布');
        return await github.publish(connection,directory);
      }finally{publishing=false;}
    }
    const approval=await dialog.showMessageBox(window,{type:'question',title:'发布到服务器',message:'确认更新线上博客？',detail:`网站：${connection.siteUrl}\n服务器：${connection.username}@${connection.host}:${connection.port}\n目录：${connection.remoteRoot}\n\n将替换同名网站文件，并清理上次由本程序发布、此次已移除的文件。旧文件会保留远程备份。`,buttons:['取消','发布'],defaultId:0,cancelId:0,noLink:true});
    if(approval.response!==1)throw new Error('已取消发布，构建结果保留在本地');
    publishing=true;try{return await deployment.publish(connection,directory);}finally{publishing=false;} */
  }
  if(action==='project-switch'){
    const target=await ensureProject(String(data.path||''));
    setTimeout(async()=>{try{await stopServer();project=target;await rememberProject(project);await startServer();}catch(error){dialog.showErrorBox('无法切换网站',error.message);}},50);
    return {switching:true,project:target};
  }
  if(action==='version-restore'){
    const id=String(data.id||'');if(!/^\d{4}-\d{2}-\d{2}T[\w.-]+--[^\\/]+$/.test(id))throw new Error('版本编号不正确');
    const source=path.resolve(project,'.local-admin','versions',id,'source');const allowed=path.resolve(project,'.local-admin','versions')+path.sep;if(!source.startsWith(allowed))throw new Error('版本路径不正确');await fs.access(path.join(source,'src/site-settings.json'));
    const baseName=path.basename(project).replace(/[^\p{L}\p{N}_.-]+/gu,'-').slice(0,40)||'Blog';const stamp=new Date().toISOString().replace(/[:.]/g,'-');const destination=path.join(app.getPath('userData'),'Projects',`${baseName}-恢复-${stamp}`);
    await fs.mkdir(destination,{recursive:true});for(const name of await fs.readdir(source))await fs.cp(path.join(source,name),path.join(destination,name),{recursive:true});const target=await ensureProject(destination);
    setTimeout(async()=>{try{await stopServer();project=target;await rememberProject(project);await startServer();}catch(error){dialog.showErrorBox('无法打开恢复版本',error.message);}},50);
    return {switching:true,project:target};
  }
  if(action==='project-folder'){await shell.openPath(project);return {ok:true};}
  if(action==='project-open'){
    const pick=await dialog.showOpenDialog(window,{title:'打开已有 Fuwari 博客',properties:['openDirectory']});if(pick.canceled)return {canceled:true};const target=await ensureProject(pick.filePaths[0]);
    setTimeout(async()=>{try{await stopServer();project=target;await rememberProject(project);await startServer();}catch(error){dialog.showErrorBox('无法打开网站',error.message);}},50);return {switching:true,project:target};
  }
  throw new Error('未知桌面操作');
}
async function ensureProject(candidate){
  for(const name of ['src/config.ts','src/site-settings.json','astro.config.mjs','package.json'])await fs.access(path.join(candidate,name));
  const packageInfo=JSON.parse(await fs.readFile(path.join(candidate,'package.json'),'utf8'));if(!packageInfo.dependencies?.astro)throw new Error('这不是兼容的 Fuwari 项目');
  let moduleStat;try{moduleStat=await fs.lstat(path.join(candidate,'node_modules'));}catch{}
  if(!moduleStat||moduleStat.isSymbolicLink())await execFileAsync(nodePath,[path.join(__dirname,'runtime.cjs'),'link',path.join(template,'node_modules'),path.join(candidate,'node_modules')],{windowsHide:true});
  await fs.access(path.join(candidate,'node_modules/astro/astro.js'));
  return fs.realpath(candidate);
}
async function createProject(destination){
  await fs.mkdir(destination,{recursive:true});
  if((await fs.readdir(destination)).length)throw new Error('新博客需要一个空文件夹');
  for(const name of await fs.readdir(template))if(name!=='node_modules')await fs.cp(path.join(template,name),path.join(destination,name),{recursive:true});
  return ensureProject(destination);
}
async function prepareRuntime(){
  const saved=await readAppConfig();
  const cacheRoot=String(saved.studio?.cacheDir||'').trim()||app.getPath('userData');
  const logicalTarget=path.join(cacheRoot,'Runtime','0.1.3');
  await fs.mkdir(logicalTarget,{recursive:true});
  const target=await fs.realpath(logicalTarget);
  const marker=path.join(target,'ready.json');
  try{
    const markerData=JSON.parse(await fs.readFile(marker,'utf8'));
    if(markerData.adminRevision!=='sites-v1'){
      await fs.cp(path.join(resources,'template','admin'),path.join(target,'template','admin'),{recursive:true,force:true});
      await fs.writeFile(marker,JSON.stringify({version:'0.1.3',adminRevision:'sites-v1'}));
    }
    const result=await execFileAsync(nodePath,[path.join(__dirname,'runtime.cjs'),'prepare',resources,target],{windowsHide:true});template=result.stdout.trim();return;
  }catch{}
  await fs.mkdir(target,{recursive:true});
  await fs.cp(path.join(resources,'template'),path.join(target,'template'),{recursive:true,force:false});
  const result=await execFileAsync(nodePath,[path.join(__dirname,'runtime.cjs'),'prepare',resources,target],{windowsHide:true});
  await fs.writeFile(marker,JSON.stringify({version:'0.1.3',adminRevision:'sites-v1'}));template=result.stdout.trim();
}
async function chooseProject(create=false){
  if(publishing)return;
  const pick=await dialog.showOpenDialog(window,{title:create?'选择空文件夹，新建 Fuwari 博客':'打开 Blog Studio 博客',properties:['openDirectory','createDirectory']});
  if(pick.canceled)return;
  try{
    const target=create?await createProject(pick.filePaths[0]):await ensureProject(pick.filePaths[0]);
    const approval=await dialog.showMessageBox(window,{message:'切换博客前，请确认当前修改已保存。',buttons:['取消','切换'],defaultId:0,cancelId:0});if(approval.response!==1)return;
    await stopServer();project=target;await rememberProject(project);await startServer();
  }catch(error){dialog.showErrorBox('无法打开项目',error.message);}
}
async function stopServer(){if(!child)return;const old=child;child=null;await new Promise(resolve=>{old.once('exit',resolve);old.send({type:'shutdown'});setTimeout(()=>{old.kill();resolve();},4000).unref();});}
async function startServer(){
  window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<body style="font-family:Segoe UI, sans-serif;background:#f7f8fa;color:#287d65;display:grid;place-items:center;height:90vh"><div><h2>Blog Studio v0.1.3</h2><p>正在打开本地博客…</p></div></body>'));
  const logDir=path.join(app.getPath('userData'),'logs');await fs.mkdir(logDir,{recursive:true});
  child=fork(path.join(template,'admin/server.mjs'),[],{execPath:nodePath,cwd:project,windowsHide:true,silent:true,env:{...process.env,BLOG_PROJECT_ROOT:project,BLOG_ADMIN_PORT:'4310',BLOG_PREVIEW_PORT:'4322',ASTRO_TELEMETRY_DISABLED:'1'}});
  child.on('message',async message=>{if(!message?.id)return;const active=child;try{const result=await handle(message.action,message.data);if(active?.connected)active.send({reply:message.id,result});}catch(error){if(active?.connected)active.send({reply:message.id,error:error.message});}});
  child.stdout.on('data',data=>{const text=data.toString();fs.appendFile(path.join(logDir,'server.log'),text).catch(()=>{});const match=text.match(/Blog Studio: (http:\/\/127\.0\.0\.1:\d+)/);if(match)window.loadURL(match[1]);});
  child.stderr.on('data',data=>fs.appendFile(path.join(logDir,'server.log'),data).catch(()=>{}));
  child.on('error',error=>dialog.showErrorBox('启动失败',error.message));
  child.on('exit',code=>{if(child&&!closing&&code!==0)dialog.showErrorBox('本地服务已停止','请重新打开程序。诊断日志：'+path.join(logDir,'server.log'));});
}
app.whenReady().then(async()=>{
  if(!single)return;
  window=new BrowserWindow({width:1450,height:950,minWidth:900,minHeight:650,title:'Blog Studio v0.1.3',backgroundColor:'#f7f8fa',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window.once('ready-to-show',()=>window.show());
  window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{if(!/^http:\/\/127\.0\.0\.1:\d+(\/|$)/.test(url)&&!url.startsWith('data:')){event.preventDefault();if(/^https?:\/\//.test(url))shell.openExternal(url);}});
  window.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  window.on('close',async event=>{if(closing)return;event.preventDefault();const result=await dialog.showMessageBox(window,{type:'question',message:publishing?'正在发布，请等待完成后退出。':'退出本地工作台？',detail:'请确认顶部状态已显示保存完成。',buttons:publishing?['继续等待']:['取消','退出'],defaultId:0,cancelId:0});if(result.response===1){closing=true;await stopServer();window.destroy();app.quit();}});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'项目',submenu:[{label:'新建博客',click:()=>chooseProject(true)},{label:'打开已有博客',click:()=>chooseProject(false)},{label:'打开项目文件夹',click:()=>shell.openPath(project)},{type:'separator'},{role:'quit',label:'退出'}]},{label:'设置',submenu:[{label:'打开设置面板',click:()=>window.loadURL(`http://127.0.0.1:${process.env.BLOG_ADMIN_PORT||4310}/#settings`)}]},{label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},{label:'视图',submenu:[{role:'reload',label:'刷新'},{role:'resetZoom',label:'重置缩放'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'}]},{label:'帮助',submenu:[{label:'关于 Blog Studio',click:()=>dialog.showMessageBox(window,{title:'Blog Studio',message:'Blog Studio v0.1.3',detail:'Windows x64 · Fuwari 本地编辑、预览和发布\n项目与服务器凭据保存在当前 Windows 用户的数据目录。'})}]}]));
  try {
    window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<body style="font-family:Segoe UI,sans-serif;background:#f7f8fa;color:#287d65;padding:80px"><h2>Blog Studio v0.1.3</h2><p>首次启动正在准备本地环境，请稍候…</p></body>'));
    await migrateLegacyData();
    await prepareRuntime();
    const saved=await readAppConfig();
    if(saved.project)project=await ensureProject(saved.project);
    else {project=await createProject(path.join(app.getPath('userData'),'Projects','MyBlog'));}
    await rememberProject(project);
    await startServer();
  }catch(error){dialog.showErrorBox('初始化失败',error.message+'\n请通过项目菜单选择一个兼容博客。');}
});
app.on('window-all-closed',()=>app.quit());
