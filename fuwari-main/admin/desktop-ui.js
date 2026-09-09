let serverConnection={},connectionProfiles={sftpProfiles:[],github:{}},activeSftpId='';
window.renderSites=async function(){
  const [projectData,versions]=await Promise.all([api('/api/projects'),api('/api/versions')]);
  const date=value=>new Date(value).toLocaleString('zh-CN',{hour12:false});
  $('#editor-pane').innerHTML=heading('网站与版本','每个网站拥有独立内容、发布历史和服务器连接。')+`<div class="site-toolbar"><div><strong>${escape(state.settings.title||'我的博客')}</strong><span>${escape(projectData.current)}</span></div><button class="button primary" id="open-site">${icon('folder-open')}打开已有网站</button></div><div class="form-section"><h2>最近的网站</h2><div class="site-list">${projectData.projects.map(item=>`<button class="site-row ${item.path===projectData.current?'active':''}" data-project="${escape(item.path)}" ${item.exists?'':'disabled'}><span class="site-mark">${icon(item.path===projectData.current?'circle-check':'folder')}</span><span><strong>${escape(item.name)}</strong><small>${escape(item.path)}</small></span><em>${item.path===projectData.current?'当前网站':item.exists?'切换':'位置失效'}</em></button>`).join('')}</div></div><div class="form-section"><div class="section-heading"><h2>版本时间线</h2><span class="value-label">${versions.length} 个版本</span></div><p class="section-subtitle">每次构建都会记录时间、网站和发布目标；新版本可从可编辑快照创建副本。</p><div class="version-list">${versions.length?versions.map(item=>`<article class="version-row"><span class="version-dot"></span><div><strong>${escape(item.siteName||'博客版本')}</strong><small>${escape(date(item.createdAt))} · ${escape(item.siteUrl||'尚未记录网址')}</small><small>${item.targets?.length?`发布到 ${escape(item.targets.join('、'))}`:item.legacy?'旧版发布包':'本地构建'} · ${escape(item.id)}</small></div>${item.source?`<button class="button" data-restore-version="${escape(item.id)}">${icon('copy-plus')}从此版本创建副本</button>`:'<span class="legacy-label">仅发布文件</span>'}</article>`).join(''):'<div class="empty">首次构建后，这里会出现版本记录。</div>'}</div></div>`;
  $('#open-site').onclick=async()=>{const result=await api('/api/projects/open',{method:'POST',body:{}});if(result.switching){toast('正在打开网站…');setTimeout(()=>location.reload(),1400);}};
  document.querySelectorAll('[data-project]').forEach(button=>button.onclick=async()=>{if(button.classList.contains('active'))return;await api('/api/projects/switch',{method:'POST',body:{path:button.dataset.project}});toast('正在切换网站…');setTimeout(()=>location.reload(),1400);});
  document.querySelectorAll('[data-restore-version]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api('/api/versions/restore',{method:'POST',body:{id:button.dataset.restoreVersion}});toast('已创建版本副本，正在切换…');setTimeout(()=>location.reload(),1600);}catch(error){button.disabled=false;toast(error.message,true);}});refreshIcons();
};
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
  const targets=document.createElement('div');targets.className='publish-targets';targets.innerHTML='<strong>发布目标</strong><span id="publish-target-status">读取连接配置…</span>';document.querySelector('#build-status').before(targets);
  api('/api/connections').then(profiles=>{const choices=[...(profiles.sftpProfiles||[]).map((profile,index)=>`<label><input type="checkbox" data-publish-target="sftp:${escape(profile.profileId)}" ${index===0?'checked':''}> ${escape(profile.profileName)} · ${escape(profile.siteUrl||profile.host)}</label>`),profiles.github?.configured?`<label><input type="checkbox" data-publish-target="github"> GitHub Pages · ${escape(profiles.github.siteUrl)}</label>`:''].filter(Boolean);targets.querySelector('#publish-target-status').insertAdjacentHTML('beforebegin',choices.join(''));targets.querySelector('#publish-target-status').textContent=choices.length?'可单选或多选':'请先保存服务器连接';}).catch(()=>{targets.querySelector('#publish-target-status').textContent='连接配置读取失败';});
  check.addEventListener('click',async()=>{check.disabled=true;try{const result=await api('/api/github/status');toast(result.current&&result.status==='built'?'本次 GitHub Pages 已上线':`GitHub Pages：${result.status}${result.current?'':'（尚未匹配本次提交）'}`);}catch(error){toast(error.message,true);}finally{check.disabled=false;}});
  action.addEventListener('click',async()=>{action.disabled=true;try{const selected=[...targets.querySelectorAll('[data-publish-target]:checked')].map(input=>input.dataset.publishTarget);if(!selected.length){toast('至少选择一个发布目标',true);return;}state.job=await api('/api/deploy',{method:'POST',body:{confirm:true,targets:selected}});updateBuild();}catch(error){toast(error.message,true);}finally{action.disabled=state.job.status==='running';}});
  refreshIcons();
};
async function renderServer(forceSftp=false){
  const desktop=await api('/api/desktop');
  if(!desktop.enabled){$('#editor-pane').innerHTML=heading('服务器连接','Blog Studio v0.1.3')+'<p class="section-subtitle">请打开桌面程序配置服务器连接。浏览器开发版不保存服务器凭据。</p>';return;}
  if(!forceSftp)connectionProfiles=await api('/api/connections');
  const profiles=connectionProfiles.sftpProfiles||[];serverConnection=profiles.find(item=>item.profileId===activeSftpId)||profiles[0]||{};activeSftpId=serverConnection.profileId||'';
  if(serverConnection.provider==='github')return renderGithub(serverConnection);
  const c=serverConnection;
  $('#editor-pane').innerHTML=heading('服务器连接','SFTP / SSH · 服务器资料仅保存在当前 Windows 用户下')+`
  <div class="server-profile-toolbar"><label>服务器配置<select id="sftp-profile-select"><option value="">新服务器</option>${profiles.map(item=>`<option value="${escape(item.profileId)}" ${item.profileId===activeSftpId?'selected':''}>${escape(item.profileName)}</option>`).join('')}</select></label><button class="button" id="new-server">${icon('plus')}新建</button><button class="icon-button danger-icon" id="delete-server" title="删除当前服务器" aria-label="删除当前服务器" ${c.profileId?'':'disabled'}>${icon('trash-2')}</button></div>
  <form id="server-form">
  <label>配置名称<input name="profileName" required maxlength="40" placeholder="例如：阿里云博客" value="${escape(c.profileName||'')}"></label><input name="profileId" type="hidden" value="${escape(c.profileId||'')}">
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
  const collect=()=>({provider:'sftp',...Object.fromEntries(new FormData(form)),fingerprint:serverConnection.fingerprint||''});
  form.addEventListener('input',()=>{for(const key of ['host','port','username','authType'])if(String(form.elements[key].value)!==String(serverConnection[key]||'')){serverConnection.fingerprint='';$('#fingerprint-display').hidden=true;break;}});
  async function action(saveConnection){
    if(!form.reportValidity())return;const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);$('#connection-result').textContent='正在连接服务器…';
    try{
      const input=collect();const result=await api(saveConnection?'/api/connection':'/api/connection/test',{method:saveConnection?'PUT':'POST',body:input});
      serverConnection={...serverConnection,...input,...result};activeSftpId=serverConnection.profileId;const index=connectionProfiles.sftpProfiles.findIndex(item=>item.profileId===serverConnection.profileId);if(index>=0)connectionProfiles.sftpProfiles[index]={...serverConnection};else connectionProfiles.sftpProfiles.push({...serverConnection});$('#fingerprint-display').hidden=false;$('#fingerprint-display').textContent=serverConnection.fingerprint;
      $('#connection-result').textContent=saveConnection?'连接配置已加密保存。':result.message||'连接测试通过';
      if(saveConnection){form.elements.password.value='';form.elements.privateKey.value='';form.elements.passphrase.value='';toast('服务器配置已保存');}
    }catch(error){$('#connection-result').textContent=error.message;toast(error.message,true);}finally{buttons.forEach(b=>b.disabled=false);}
  }
  $('#test-connection').addEventListener('click',()=>action(false));form.addEventListener('submit',event=>{event.preventDefault();action(true);});refreshIcons();
  $('#sftp-profile-select').onchange=()=>{activeSftpId=$('#sftp-profile-select').value;renderServer(true);};$('#new-server').onclick=()=>{activeSftpId='';serverConnection={};renderServer(true);};$('#delete-server').onclick=async()=>{try{await api('/api/connection',{method:'DELETE',body:{profileId:c.profileId}});connectionProfiles.sftpProfiles=profiles.filter(item=>item.profileId!==c.profileId);activeSftpId='';toast('服务器配置已删除');renderServer(true);}catch(error){if(error.message!=='已取消删除')toast(error.message,true);}};
  providerPicker('sftp');
}
function providerPicker(selected){
  const label=document.createElement('label');label.textContent='发布方式';
  const select=document.createElement('select');select.innerHTML='<option value="sftp">自有服务器 SFTP / SSH</option><option value="github">GitHub Pages</option>';select.value=selected;label.append(select);$('#editor-pane').prepend(label);
  select.addEventListener('change',()=>{if(select.value==='github')renderGithub(connectionProfiles.github||{});else renderSftpFromGithub();});
}
async function renderSftpFromGithub(){await renderServer(true);}
function renderGithub(c){
  $('#editor-pane').innerHTML=heading('GitHub Pages','GitHub.com')+`<form id="github-form"><label>GitHub 用户名<input name="owner" required value="${escape(c.owner||'')}" autocomplete="off"></label><label>主页仓库<input name="repo" required value="${escape(c.repo||'')}" placeholder="用户名.github.io"></label><label>访问令牌<input name="token" type="password" autocomplete="new-password" placeholder="${c.hasToken?'留空保留已保存令牌':'Fine-grained personal access token'}"></label><p><a href="https://github.com/new" target="_blank" rel="noreferrer">创建公开仓库</a> · <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">创建访问令牌</a></p><div class="dialog-actions"><button type="button" class="button" id="github-test">${icon('plug-zap')}测试连接</button><button class="button primary" type="submit">${icon('lock-keyhole')}保存连接</button></div><p id="github-result" role="status"></p></form>`;
  providerPicker('github');const form=$('#github-form');
  form.elements.owner.addEventListener('change',()=>{if(!form.elements.repo.value)form.elements.repo.value=form.elements.owner.value.trim()+'.github.io';});
  async function submit(save){if(!form.reportValidity())return;const buttons=form.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);$('#github-result').textContent='正在连接 GitHub…';try{const result=await api(save?'/api/connection':'/api/connection/test',{method:save?'PUT':'POST',body:{provider:'github',...Object.fromEntries(new FormData(form))}});$('#github-result').textContent=save?'GitHub 连接已加密保存':result.message;if(save){connectionProfiles.github={...connectionProfiles.github,...result};serverConnection=connectionProfiles.github;form.elements.token.value='';form.elements.token.placeholder='留空保留已保存令牌';}}catch(error){$('#github-result').textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}}
  $('#github-test').addEventListener('click',()=>submit(false));form.addEventListener('submit',event=>{event.preventDefault();submit(true);});refreshIcons();
}
