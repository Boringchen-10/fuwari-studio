let serverConnection={},connectionProfiles={sftpProfiles:[],github:{}},activeSftpId='';
window.renderCreateFlow=function(container=$('#editor-pane')){
  container.innerHTML=`<div class="create-flow"><div class="flow-step"><span>1</span><div><strong>选择样式</strong><small>本版提供一个经过完整适配的官方基座</small></div></div><label class="style-choice selected"><input type="radio" name="style" value="fuwari" checked><span class="style-preview"><i data-lucide="feather"></i></span><span><strong>Fuwari</strong><small>适合文章、生活记录和个人主页</small></span><em>官方支持</em></label><div class="flow-step"><span>2</span><div><strong>填写基本资料</strong><small>以后可以随时在“外观”中修改</small></div></div><form id="create-site-form"><label>网站名称<input name="title" required maxlength="100" placeholder="例如：小陈的日常"></label><label>一句话介绍<input name="subtitle" maxlength="200" placeholder="记录生活，分享热爱"></label><label>你的昵称<input name="name" required maxlength="100" placeholder="访客看到的名字"></label><div class="dialog-actions"><button class="button primary" type="submit">${icon('sparkles')}创建并打开预览</button></div><p id="create-result" class="section-subtitle"></p></form></div>`;
  const form=container.querySelector('#create-site-form');form.onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;container.querySelector('#create-result').textContent='正在准备你的网站，第一次可能需要一点时间…';try{const result=await api('/api/projects/create',{method:'POST',body:{style:'fuwari',...Object.fromEntries(new FormData(form))}});if(result.switching){toast('网站已经创建，正在打开预览…');setTimeout(()=>location.href='#overview',1200);setTimeout(()=>location.reload(),1800);}}catch(error){container.querySelector('#create-result').textContent=error.message;button.disabled=false;}};refreshIcons();
};
window.inspectImport=async function(container=$('#editor-pane')){
  container.innerHTML='<div class="recognition-card loading-card"><i data-lucide="loader-circle"></i><p>请选择网站文件夹，Blog Studio 会先检查，不会立即修改。</p></div>';refreshIcons();
  try{
    const report=await api('/api/projects/inspect',{method:'POST',body:{}});if(report.canceled){container.innerHTML='<div class="empty">已取消选择</div>';return;}
    container.innerHTML=`<div class="recognition-card ${report.canAdapt?'success':'warning'}"><span class="recognition-icon">${icon(report.canAdapt?'badge-check':'circle-alert')}</span><div><p class="eyebrow">识别结果</p><h2>${escape(report.message)}</h2><p class="path-line">${escape(report.path)}</p><dl><div><dt>网站类型</dt><dd>${escape(report.base||'未识别')}</dd></div><div><dt>项目标准</dt><dd>${report.standard?'已具备 Standard 1.0':'尚未添加'}</dd></div><div><dt>自动适配</dt><dd>${report.canAdapt?'可以':'暂不支持'}</dd></div></dl>${report.missing?.length?`<div class="missing-list"><strong>缺少的内容</strong><ul>${report.missing.map(item=>`<li>${escape(item)}</li>`).join('')}</ul></div>`:''}${report.descriptorError?`<p class="inline-error">${escape(report.descriptorError)}</p>`:''}<div class="dialog-actions"><button class="button" id="inspect-again">重新选择</button>${report.canAdapt?`<button class="button primary" id="confirm-import">${icon('folder-check')}导入这个网站</button>`:''}</div><p class="section-subtitle">导入前会自动创建恢复点；不会移动或重写原有目录结构。</p></div></div>`;
    container.querySelector('#inspect-again').onclick=()=>window.inspectImport(container);container.querySelector('#confirm-import')?.addEventListener('click',async event=>{event.currentTarget.disabled=true;try{await api('/api/projects/import',{method:'POST',body:{path:report.path}});toast(report.standard?'正在打开网站…':'已创建恢复点并完成适配');setTimeout(()=>location.reload(),1700);}catch(error){toast(error.message,true);event.currentTarget.disabled=false;}});refreshIcons();
  }catch(error){container.innerHTML=`<div class="empty">${escape(error.message)}<p><button class="button" id="inspect-retry">重新选择</button></p></div>`;container.querySelector('#inspect-retry').onclick=()=>window.inspectImport(container);}
};
window.renderSites=async function(options={}){
  const projectData=await api('/api/projects');
  $('#editor-pane').innerHTML=heading('网站管理','创建、导入和切换你自己的个人网站。')+`<div class="site-actions"><button class="button primary" id="create-site">${icon('plus')}创建新网站</button><button class="button" id="import-site">${icon('folder-input')}导入已有网站</button><button class="button" id="open-folder">${icon('folder-open')}打开当前文件夹</button></div><div id="site-flow"></div><div class="form-section" id="recent-sites"><div class="section-heading compact"><h2>我的网站</h2><span class="value-label">${projectData.projects.length} 个</span></div><div class="site-list">${projectData.projects.map(item=>`<button class="site-row ${item.path===projectData.current?'active':''}" data-project="${escape(item.path)}" ${item.exists?'':'disabled'}><span class="site-mark">${icon(item.path===projectData.current?'circle-check':'folder')}</span><span><strong>${escape(item.name)}</strong><small>${escape(item.subtitle||item.path)}</small></span><em>${item.path===projectData.current?'当前网站':item.exists?item.standard?'Standard 1.0':'可适配':'位置失效'}</em></button>`).join('')}</div></div>`;
  const flow=$('#site-flow');$('#create-site').onclick=()=>{window.renderCreateFlow(flow);$('#recent-sites').hidden=true;};$('#import-site').onclick=()=>{window.inspectImport(flow);$('#recent-sites').hidden=true;};$('#open-folder').onclick=()=>api('/api/project/folder',{method:'POST',body:{}}).catch(error=>toast(error.message,true));
  if(options.showCreate){window.renderCreateFlow(flow);$('#recent-sites').hidden=true;}
  document.querySelectorAll('[data-project]').forEach(button=>button.onclick=async()=>{if(button.classList.contains('active'))return;button.disabled=true;try{await api('/api/projects/switch',{method:'POST',body:{path:button.dataset.project}});toast('正在切换网站…');setTimeout(()=>location.reload(),1500);}catch(error){toast(error.message,true);button.disabled=false;}});refreshIcons();
};
window.renderHistory=async function(){
  const versions=await api('/api/versions');
  const date=value=>new Date(value).toLocaleString('zh-CN',{hour12:false});
  $('#editor-pane').innerHTML=heading('历史版本','每次生成网站都会留下带时间的发布包和可编辑快照。')+`<div class="history-summary"><span>${icon('shield-check')}</span><div><strong>${versions.length} 个本地版本</strong><p>恢复时会创建新的网站副本，当前网站不会被覆盖。</p></div></div><div class="version-list">${versions.length?versions.map(item=>`<article class="version-row"><span class="version-dot"></span><div><strong>${escape(item.siteName||'网站版本')}</strong><small>${escape(date(item.createdAt))} · ${escape(item.siteUrl||'保存在本机')}</small><small>${item.targets?.length?`发布到 ${escape(item.targets.join('、'))}`:item.legacy?'旧版发布文件':'本地版本'}</small></div>${item.source?`<button class="button" data-restore-version="${escape(item.id)}">${icon('copy-plus')}从此版本创建副本</button>`:'<span class="legacy-label">仅发布文件</span>'}</article>`).join(''):'<div class="empty">第一次生成或发布网站后，这里会出现历史版本。</div>'}</div>`;
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
  if(details[2])details[2].innerHTML='<span class="step-dot">3</span><div><h3>更新一个或多个线上位置</h3><p>使用已保存的发布位置，准备完成后由你确认上线。</p></div>';
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
  if(!desktop.enabled){$('#editor-pane').innerHTML=heading('发布位置','Blog Studio v0.2.0')+'<p class="section-subtitle">请打开桌面程序配置发布位置。浏览器开发版不保存连接资料。</p>';return;}
  if(!forceSftp)connectionProfiles=await api('/api/connections');
  const profiles=connectionProfiles.sftpProfiles||[];serverConnection=profiles.find(item=>item.profileId===activeSftpId)||profiles[0]||{};activeSftpId=serverConnection.profileId||'';
  if(serverConnection.provider==='github')return renderGithub(serverConnection);
  const c=serverConnection;
  $('#editor-pane').innerHTML=heading('发布位置','连接资料使用 Windows 本机加密，并且只属于当前网站。')+`<a class="editor-back" href="#publish">${icon('arrow-left')}返回发布</a>
  <div class="server-profile-toolbar"><label>已保存的位置<select id="sftp-profile-select"><option value="">添加新位置</option>${profiles.map(item=>`<option value="${escape(item.profileId)}" ${item.profileId===activeSftpId?'selected':''}>${escape(item.profileName)}</option>`).join('')}</select></label><button class="button" id="new-server">${icon('plus')}添加</button><button class="icon-button danger-icon" id="delete-server" title="删除当前位置" aria-label="删除当前位置" ${c.profileId?'':'disabled'}>${icon('trash-2')}</button></div>
  <form id="server-form">
  <label>位置名称<input name="profileName" required maxlength="40" placeholder="例如：阿里云主站" value="${escape(c.profileName||'')}"></label><input name="profileId" type="hidden" value="${escape(c.profileId||'')}">
  <label>正式网站地址<input name="siteUrl" type="url" required placeholder="https://blog.example.com/" value="${escape(c.siteUrl||'')}"></label><label>网站文件夹<input name="remoteRoot" required placeholder="/var/www/my-blog" value="${escape(c.remoteRoot||'')}"></label>
  <details class="advanced-settings" ${c.host?'open':''}><summary>服务器连接详情</summary><div class="field-row"><label>服务器地址<input name="host" required placeholder="203.0.113.10 或 server.example.com" value="${escape(c.host||'')}"></label><label>连接端口<input name="port" type="number" min="1" max="65535" value="${c.port||22}" required></label></div><label>登录用户名<input name="username" required autocomplete="off" value="${escape(c.username||'')}"></label><label>登录方式<select name="authType"><option value="password" ${c.authType!=='privateKey'?'selected':''}>密码</option><option value="privateKey" ${c.authType==='privateKey'?'selected':''}>私钥文件内容</option></select></label><label id="password-field">登录密码<input name="password" type="password" autocomplete="new-password" placeholder="${c.hasPassword?'留空保留已保存密码':'输入服务器密码'}"></label><label id="key-field">私钥内容<textarea name="privateKey" rows="5" autocomplete="off" spellcheck="false" placeholder="${c.hasPrivateKey?'留空保留已保存私钥':'粘贴私钥内容'}"></textarea></label><label id="passphrase-field">私钥口令（可选）<input name="passphrase" type="password" autocomplete="new-password"></label><p class="section-subtitle">网站文件夹需要由这个用户拥有写入权限。发布时会在旁边保留可恢复的远程备份。</p></details>
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
  const select=document.createElement('select');select.innerHTML='<option value="sftp">自己的服务器</option><option value="github">GitHub Pages</option>';select.value=selected;label.append(select);$('#editor-pane').prepend(label);
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
