const {app,BrowserWindow,dialog,shell,safeStorage,Menu} = require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {fork,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execFileAsync=promisify(execFile);
const {createHash}=require('node:crypto');
const deployment=require('./deploy.cjs');
const github=require('./github.cjs');
const dataArg=process.argv.find(arg=>arg.startsWith('--data-dir='));
if(dataArg)app.setPath('userData',path.resolve(dataArg.slice(11)));
else if(app.isPackaged)app.setPath('userData',path.join(path.dirname(process.execPath),'Fuwari Studio Data'));
let window,child,project,closing=false,publishing=false;
const resources=app.isPackaged?process.resourcesPath:path.resolve(__dirname,'staging-compact');
let template=path.join(resources,'template');
const nodePath=path.join(resources,'runtime/node.exe');
const single=app.requestSingleInstanceLock();if(!single)app.quit();
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
const configFile=()=>path.join(app.getPath('userData'),'studio.json');
async function readAppConfig(){try{return JSON.parse(await fs.readFile(configFile(),'utf8'));}catch{return {};}}
async function writeAppConfig(data){await fs.mkdir(app.getPath('userData'),{recursive:true});const temp=configFile()+'.tmp';await fs.writeFile(temp,JSON.stringify(data,null,2));await fs.rename(temp,configFile());}
const credentialFile=()=>path.join(app.getPath('userData'),'connections',createHash('sha256').update(project.toLowerCase()).digest('hex')+'.bin');
async function readConnection(provider){
  try{const raw=JSON.parse(safeStorage.decryptString(await fs.readFile(credentialFile())));return provider&&raw?.[provider]?raw[provider]:raw;}catch(error){if(error.code==='ENOENT')return {};throw new Error('无法解密服务器资料，请在当前 Windows 用户下重新配置。');}
}
async function readConnections(){
  const raw=await readConnection();
  if(raw&&typeof raw==='object'&&(raw.sftp||raw.github))return raw;
  if(raw?.provider==='github')return {github:raw};
  if(raw?.provider==='sftp'||raw?.host)return {sftp:raw};
  return {};
}
async function writeConnections(connections){const file=credentialFile();await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,safeStorage.encryptString(JSON.stringify(connections)));}
function publicConnection(connection){const {password,privateKey,passphrase,token,...data}=connection;return {...data,configured:connection.provider==='github'?Boolean(token):Boolean(connection.fingerprint),hasToken:Boolean(token),hasPassword:Boolean(password),hasPrivateKey:Boolean(privateKey)};}
async function mergedConnection(input){
  const old=await readConnection(input.provider==='github'?'github':'sftp');const same=old.host===input.host&&Number(old.port)===Number(input.port)&&old.username===input.username&&old.authType===input.authType;
  if(input.provider==='github')return github.validate({...input,token:input.token||(old.provider==='github'&&old.owner===input.owner&&old.repo===input.repo?old.token:'')});
  return deployment.validate({...input,password:input.password||(same?old.password:''),privateKey:input.privateKey||(same?old.privateKey:''),passphrase:input.passphrase||(same?old.passphrase:'')});
}
async function handle(action,data){
  if(action==='studio-settings-get'){const saved=await readAppConfig();return {...(saved.studio||{}),cacheDir:saved.studio?.cacheDir||app.getPath('userData')};}
  if(action==='studio-settings-choose'){const picked=await dialog.showOpenDialog(window,{title:'选择本地缓存目录',properties:['openDirectory','createDirectory']});return picked.canceled?{canceled:true}:{canceled:false,cacheDir:picked.filePaths[0]};}
  if(action==='studio-settings-save'){const saved=await readAppConfig();const studio={...(saved.studio||{}),hue:Math.max(0,Math.min(360,Number(data.hue)||150)),accent:/^#[0-9a-f]{6}$/i.test(String(data.accent||''))?data.accent:'#287d65',theme:['system','light','dark'].includes(data.theme)?data.theme:'system',device:['desktop','mobile'].includes(data.device)?data.device:'desktop',autosaveDelay:Math.max(300,Math.min(5000,Number(data.autosaveDelay)||700)),cacheDir:String(data.cacheDir||'').trim()};await writeAppConfig({...saved,studio});return studio;}
  if(action==='connections-get'){const all=await readConnections();return {sftp:publicConnection(all.sftp||{}),github:publicConnection(all.github||{})};}
  if(action==='connection-get')return publicConnection(await readConnection(data?.provider));
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
    const all=await readConnections();all[config.provider==='github'?'github':'sftp']=config;await writeConnections(all);return publicConnection(config);
  }
  if(action==='deploy'){
    if(publishing)throw new Error('已有发布正在执行');
    const directory=await fs.realpath(data.directory);const allowed=path.join(project,'.local-admin','releases')+path.sep;
    if(!directory.startsWith(allowed))throw new Error('只能发布当前博客生成的发布包');
    const all=await readConnections();const targets=Array.isArray(data?.targets)&&data.targets.length?data.targets:['sftp'];const selected=targets.filter(target=>target==='sftp'||target==='github').filter(target=>all[target]);
    if(!selected.length)throw new Error('请先保存至少一个发布连接');
    publishing=true;
    try{
      const approval=await dialog.showMessageBox(window,{type:'question',title:'确认发布',message:'确认发布到已选择的目标？',detail:selected.map(target=>target==='github'?`GitHub Pages：${all.github.owner}/${all.github.repo}`:`SFTP：${all.sftp.siteUrl}\n目录：${all.sftp.remoteRoot}`).join('\n\n')+'\n\n将上传构建后的网站，历史版本会保留。',buttons:['取消','发布'],defaultId:0,cancelId:0,noLink:true});
      if(approval.response!==1)throw new Error('已取消发布');
      const results=[];
      for(const target of selected){
        try{const result=target==='github'?await github.publish(all.github,directory):await deployment.publish(all.sftp,directory);results.push({target,ok:true,result});}
        catch(error){results.push({target,ok:false,error:error.message});}
      }
      const failed=results.filter(item=>!item.ok);if(failed.length===results.length)throw new Error(results.map(item=>`${item.target==='github'?'GitHub Pages':'SFTP'}：${item.error}`).join('\n'));
      return {pending:results.some(item=>item.result?.pending),commit:results.find(item=>item.result?.commit)?.result.commit,message:results.map(item=>`${item.target==='github'?'GitHub Pages':'SFTP'}：${item.ok?(item.result.message||'发布成功'):item.error}`).join('\n')};
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
  if(action==='project-folder'){await shell.openPath(project);return {ok:true};}
  if(action==='project-open'){
    throw new Error('请从程序菜单“项目 → 打开已有博客”切换项目。');
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
  const logicalTarget=path.join(cacheRoot,'Runtime','0.1.2');
  await fs.mkdir(logicalTarget,{recursive:true});
  const target=await fs.realpath(logicalTarget);
  const marker=path.join(target,'ready.json');
  try{await fs.access(marker);const result=await execFileAsync(nodePath,[path.join(__dirname,'runtime.cjs'),'prepare',resources,target],{windowsHide:true});template=result.stdout.trim();return;}catch{}
  await fs.mkdir(target,{recursive:true});
  await fs.cp(path.join(resources,'template'),path.join(target,'template'),{recursive:true,force:false});
  const result=await execFileAsync(nodePath,[path.join(__dirname,'runtime.cjs'),'prepare',resources,target],{windowsHide:true});
  await fs.writeFile(marker,JSON.stringify({version:'0.1.2'}));template=result.stdout.trim();
}
async function chooseProject(create=false){
  if(publishing)return;
  const pick=await dialog.showOpenDialog(window,{title:create?'选择空文件夹，新建 Fuwari 博客':'打开 Fuwari Studio 博客',properties:['openDirectory','createDirectory']});
  if(pick.canceled)return;
  try{
    const target=create?await createProject(pick.filePaths[0]):await ensureProject(pick.filePaths[0]);
    const approval=await dialog.showMessageBox(window,{message:'切换博客前，请确认当前修改已保存。',buttons:['取消','切换'],defaultId:0,cancelId:0});if(approval.response!==1)return;
    await stopServer();project=target;await writeAppConfig({project});await startServer();
  }catch(error){dialog.showErrorBox('无法打开项目',error.message);}
}
async function stopServer(){if(!child)return;const old=child;child=null;await new Promise(resolve=>{old.once('exit',resolve);old.send({type:'shutdown'});setTimeout(()=>{old.kill();resolve();},4000).unref();});}
async function startServer(){
  window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<body style="font-family:Segoe UI, sans-serif;background:#f7f8fa;color:#287d65;display:grid;place-items:center;height:90vh"><div><h2>Blog Studio v0.1.2</h2><p>正在打开本地博客…</p></div></body>'));
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
  window=new BrowserWindow({width:1450,height:950,minWidth:900,minHeight:650,title:'Blog Studio v0.1.2',backgroundColor:'#f7f8fa',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
  window.once('ready-to-show',()=>window.show());
  window.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url);return {action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{if(!/^http:\/\/127\.0\.0\.1:\d+(\/|$)/.test(url)&&!url.startsWith('data:')){event.preventDefault();if(/^https?:\/\//.test(url))shell.openExternal(url);}});
  window.webContents.session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  window.on('close',async event=>{if(closing)return;event.preventDefault();const result=await dialog.showMessageBox(window,{type:'question',message:publishing?'正在发布，请等待完成后退出。':'退出本地工作台？',detail:'请确认顶部状态已显示保存完成。',buttons:publishing?['继续等待']:['取消','退出'],defaultId:0,cancelId:0});if(result.response===1){closing=true;await stopServer();window.destroy();app.quit();}});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'项目',submenu:[{label:'新建博客',click:()=>chooseProject(true)},{label:'打开已有博客',click:()=>chooseProject(false)},{label:'打开项目文件夹',click:()=>shell.openPath(project)},{type:'separator'},{role:'quit',label:'退出'}]},{label:'设置',submenu:[{label:'打开设置面板',click:()=>window.loadURL(`http://127.0.0.1:${process.env.BLOG_ADMIN_PORT||4310}/#settings`)}]},{label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},{label:'视图',submenu:[{role:'reload',label:'刷新'},{role:'resetZoom',label:'重置缩放'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'}]},{label:'帮助',submenu:[{label:'关于 Blog Studio',click:()=>dialog.showMessageBox(window,{title:'Blog Studio',message:'Blog Studio v0.1.2',detail:'Windows x64 · Fuwari 本地编辑、预览和发布\n项目与服务器凭据保存在当前 Windows 用户的数据目录。'})}]}]));
  try {
    window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<body style="font-family:Segoe UI,sans-serif;background:#f7f8fa;color:#287d65;padding:80px"><h2>Fuwari Studio v0.1</h2><p>首次启动正在准备本地环境，请稍候…</p></body>'));
    await prepareRuntime();
    const saved=await readAppConfig();
    if(saved.project)project=await ensureProject(saved.project);
    else {project=await createProject(path.join(app.getPath('userData'),'Projects','MyBlog'));await writeAppConfig({project});}
    await startServer();
  }catch(error){dialog.showErrorBox('初始化失败',error.message+'\n请通过项目菜单选择一个兼容博客。');}
});
app.on('window-all-closed',()=>app.quit());
