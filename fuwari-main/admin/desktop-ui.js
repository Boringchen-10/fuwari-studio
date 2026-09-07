let serverConnection={};
const originalUpdateBuild=updateBuild;
updateBuild=function(){
  originalUpdateBuild();
  if(view!=='publish')return;
  const deploy=document.querySelector('#deploy-button');
  if(deploy)deploy.disabled=state.job.status==='running';
  const title=document.querySelector('#build-status h2');
  if(title)title.textContent=state.job.deployed?'已发布到服务器':({running:'正在构建或发布',success:'发布包已生成',failed:'操作未完成'}[state.job.status]||'');
};
const originalRenderPublish=renderPublish;
renderPublish=function(){
  originalRenderPublish();
  const details=document.querySelectorAll('.publish-step');
  if(details[2])details[2].innerHTML='<span class="step-dot">3</span><div><h3>发布到自己的服务器</h3><p>配置 SFTP 后，一键重新构建并发布。发布前会再次确认域名和网站目录。</p></div>';
  const action=document.createElement('button');action.className='button primary';action.id='deploy-button';action.style.marginLeft='8px';action.innerHTML=icon('cloud-upload')+'构建并发布';
  document.querySelector('#build-button').after(action);
  action.addEventListener('click',async()=>{action.disabled=true;try{state.job=await api('/api/deploy',{method:'POST',body:{confirm:true}});updateBuild();}catch(error){toast(error.message,true);}finally{action.disabled=state.job.status==='running';}});
  refreshIcons();
};
async function renderServer(){
  const desktop=await api('/api/desktop');
  if(!desktop.enabled){$('#editor-pane').innerHTML=heading('服务器连接','Fuwari Studio v0.1')+'<p class="section-subtitle">请打开桌面程序配置服务器连接。浏览器开发版不保存服务器凭据。</p>';return;}
  serverConnection=await api('/api/connection');
  const c=serverConnection;
  $('#editor-pane').innerHTML=heading('服务器连接','SFTP / SSH · 服务器资料仅保存在当前 Windows 用户下')+`
  <form id="server-form">
  <div class="field-row"><label>服务器地址<input name="host" required placeholder="203.0.113.10 或 server.example.com" value="${escape(c.host||'')}"></label><label>SSH 端口<input name="port" type="number" min="1" max="65535" value="${c.port||22}" required></label></div>
  <label>SSH 用户名<input name="username" required autocomplete="off" value="${escape(c.username||'')}"></label>
  <label>认证方式<select name="authType"><option value="password" ${c.authType!=='privateKey'?'selected':''}>密码</option><option value="privateKey" ${c.authType==='privateKey'?'selected':''}>SSH 私钥</option></select></label>
  <label id="password-field">SSH 密码<input name="password" type="password" autocomplete="new-password" placeholder="${c.hasPassword?'留空保留已保存密码':'输入服务器密码'}"></label>
  <label id="key-field">SSH 私钥<textarea name="privateKey" rows="5" autocomplete="off" spellcheck="false" placeholder="${c.hasPrivateKey?'留空保留已保存私钥':'-----BEGIN OPENSSH PRIVATE KEY-----'}"></textarea></label>
  <label id="passphrase-field">私钥口令（可选）<input name="passphrase" type="password" autocomplete="new-password"></label>
  <div class="form-section"><h2>网站目标</h2><label>正式网站地址<input name="siteUrl" type="url" required placeholder="https://blog.example.com/" value="${escape(c.siteUrl||'')}"></label><label>服务器上的博客专用目录<input name="remoteRoot" required placeholder="/var/www/my-blog" value="${escape(c.remoteRoot||'')}"></label></div>
  <p class="section-subtitle">目录需要事先创建，并由 SSH 用户拥有写入权限。v0.1 支持独立域名根目录；服务器需要 OpenSSH SFTP 原子重命名支持。发布备份放在网站目录的同级 .studio-backups 目录。</p>
  <p id="fingerprint-display" class="build-output" ${c.fingerprint?'':'hidden'}>${escape(c.fingerprint||'')}</p>
  <div style="display:flex;gap:8px"><button type="button" class="button" id="test-connection">${icon('plug-zap')}测试连接</button><button type="submit" class="button primary">${icon('lock-keyhole')}保存连接</button></div>
  <p id="connection-result" role="status" class="section-subtitle"></p>
  </form>`;
  const form=$('#server-form');const auth=form.elements.authType;
  const toggle=()=>{$('#password-field').hidden=auth.value!=='password';$('#key-field').hidden=auth.value!=='privateKey';$('#passphrase-field').hidden=auth.value!=='privateKey';};auth.addEventListener('change',toggle);toggle();
  const collect=()=>({...Object.fromEntries(new FormData(form)),fingerprint:serverConnection.fingerprint||''});
  form.addEventListener('input',()=>{for(const key of ['host','port','username','authType'])if(String(form.elements[key].value)!==String(serverConnection[key]||'')){serverConnection.fingerprint='';$('#fingerprint-display').hidden=true;break;}});
  async function action(saveConnection){
    if(!form.reportValidity())return;const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);$('#connection-result').textContent='正在连接服务器…';
    try{
      const input=collect();const result=await api(saveConnection?'/api/connection':'/api/connection/test',{method:saveConnection?'PUT':'POST',body:input});
      serverConnection={...serverConnection,...input,...result};$('#fingerprint-display').hidden=false;$('#fingerprint-display').textContent=serverConnection.fingerprint;
      $('#connection-result').textContent=saveConnection?'连接配置已加密保存。':result.message||'连接测试通过';
      if(saveConnection){form.elements.password.value='';form.elements.privateKey.value='';form.elements.passphrase.value='';toast('服务器配置已保存');}
    }catch(error){$('#connection-result').textContent=error.message;toast(error.message,true);}finally{buttons.forEach(b=>b.disabled=false);}
  }
  $('#test-connection').addEventListener('click',()=>action(false));form.addEventListener('submit',event=>{event.preventDefault();action(true);});refreshIcons();
}
