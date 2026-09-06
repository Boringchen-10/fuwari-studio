let serverConnection={};
const originalUpdateBuild=updateBuild;
updateBuild=function(){
  originalUpdateBuild();
  if(view!=='publish')return;
  const deploy=document.querySelector('#deploy-button');
  if(deploy)deploy.disabled=state.job.status==='running';
  const check=document.querySelector('#github-status-button');if(check)check.hidden=!state.job.commit;
  const title=document.querySelector('#build-status h2');
  if(title)title.textContent=state.job.pending?'已提交，等待 GitHub Pages 部署':state.job.deployed?'已发布到服务器':({running:'正在构建或发布',success:'发布包已生成',failed:'操作未完成'}[state.job.status]||'');
};
const originalRenderPublish=renderPublish;
renderPublish=function(){
  originalRenderPublish();
  const details=document.querySelectorAll('.publish-step');
  if(details[2])details[2].innerHTML='<span class="step-dot">3</span><div><h3>发布到 SFTP 或 GitHub Pages</h3><p>使用已保存的连接配置，构建完成后确认发布目标。</p></div>';
  const action=document.createElement('button');action.className='button primary';action.id='deploy-button';action.style.marginLeft='8px';action.innerHTML=icon('cloud-upload')+'构建并发布';
  document.querySelector('#build-button').after(action);
  const check=document.createElement('button');check.id='github-status-button';check.hidden=!state.job.commit;check.className='button';check.innerHTML=icon('refresh-cw')+'检查上线状态';action.after(check);
  check.addEventListener('click',async()=>{check.disabled=true;try{const result=await api('/api/github/status');toast(result.current&&result.status==='built'?'本次 GitHub Pages 已上线':`GitHub Pages：${result.status}${result.current?'':'（尚未匹配本次提交）'}`);}catch(error){toast(error.message,true);}finally{check.disabled=false;}});
  action.addEventListener('click',async()=>{action.disabled=true;try{state.job=await api('/api/deploy',{method:'POST',body:{confirm:true}});updateBuild();}catch(error){toast(error.message,true);}finally{action.disabled=state.job.status==='running';}});
  refreshIcons();
};
async function renderServer(forceSftp=false){
  const desktop=await api('/api/desktop');
  if(!desktop.enabled){$('#editor-pane').innerHTML=heading('服务器连接','Fuwari Studio v0.1')+'<p class="section-subtitle">请打开桌面程序配置服务器连接。浏览器开发版不保存服务器凭据。</p>';return;}
  serverConnection=forceSftp?{}:await api('/api/connection');
  if(serverConnection.provider==='github')return renderGithub(serverConnection);
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
  providerPicker('sftp');
}
function providerPicker(selected){
  const label=document.createElement('label');label.textContent='发布方式';
  const select=document.createElement('select');select.innerHTML='<option value="sftp">自有服务器 SFTP / SSH</option><option value="github">GitHub Pages</option>';select.value=selected;label.append(select);$('#editor-pane').prepend(label);
  select.addEventListener('change',()=>{if(select.value==='github')renderGithub({});else renderSftpFromGithub();});
}
async function renderSftpFromGithub(){await renderServer(true);}
function renderGithub(c){
  $('#editor-pane').innerHTML=heading('GitHub Pages','GitHub.com')+`<form id="github-form"><label>GitHub 用户名<input name="owner" required value="${escape(c.owner||'')}" autocomplete="off"></label><label>主页仓库<input name="repo" required value="${escape(c.repo||'')}" placeholder="用户名.github.io"></label><label>访问令牌<input name="token" type="password" autocomplete="new-password" placeholder="${c.hasToken?'留空保留已保存令牌':'Fine-grained personal access token'}"></label><p><a href="https://github.com/new" target="_blank" rel="noreferrer">创建公开仓库</a> · <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">创建访问令牌</a></p><div class="dialog-actions"><button type="button" class="button" id="github-test">${icon('plug-zap')}测试连接</button><button class="button primary" type="submit">${icon('lock-keyhole')}保存连接</button></div><p id="github-result" role="status"></p></form>`;
  providerPicker('github');const form=$('#github-form');
  form.elements.owner.addEventListener('change',()=>{if(!form.elements.repo.value)form.elements.repo.value=form.elements.owner.value.trim()+'.github.io';});
  async function submit(save){if(!form.reportValidity())return;const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);$('#github-result').textContent='正在连接 GitHub…';try{const result=await api(save?'/api/connection':'/api/connection/test',{method:save?'PUT':'POST',body:{provider:'github',...Object.fromEntries(new FormData(form))}});$('#github-result').textContent=save?'GitHub 连接已加密保存':result.message;if(save){serverConnection=result;form.elements.token.value='';form.elements.token.placeholder='留空保留已保存令牌';}}catch(error){$('#github-result').textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}}
  $('#github-test').addEventListener('click',()=>submit(false));form.addEventListener('submit',event=>{event.preventDefault();submit(true);});refreshIcons();
}
