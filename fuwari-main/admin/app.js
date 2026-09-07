const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = name => `<i data-lucide="${name}"></i>`;
const refreshIcons = () => window.lucide?.createIcons();
let state, current, view='posts', version=0, savedVersion=0, timer, saving, blocked=false, loadSequence=0;
let previewPath='/', device='desktop', previewDark=false, previewTimer, uploadTarget, toastTimer;
const titles={posts:'全部文章',drafts:'草稿箱',profile:'个人资料',appearance:'外观与导航',about:'关于页面',friends:'友情链接',publish:'发布中心',trash:'回收站',post:'编辑文章',server:'服务器连接'};
function toast(message,error=false){$('#toast').textContent=message;$('#toast').className=error?'error':'';$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6000);}
async function api(url, options={}) {
  const response=await fetch(url,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':state?.csrf || '',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error || '操作失败'),{status:response.status});return data;
}
function status(text,error=false){$('#save-status').innerHTML=icon(error?'circle-alert':text.includes('保存中')?'loader-circle':'check')+escape(text);$('#save-status').classList.toggle('error',error);refreshIcons();}
function markDirty(){version++;blocked=false;status('等待保存');clearTimeout(timer);timer=setTimeout(()=>save().catch(()=>{}),700);}
function media(src,slug=''){if(!src)return '';if(/^https?:/.test(src))return src;return `/media?path=${encodeURIComponent(src)}&slug=${encodeURIComponent(slug)}`;}
function stats(){ $('#nav-count').textContent=state.posts.length;$('#draft-count').textContent=state.posts.filter(post=>post.draft).length;$('#sidebar-name').textContent=state.settings.name;$('#sidebar-avatar').src=media(state.settings.avatar); }
function afterSavePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(()=>setPreview(previewPath,true),700);}
async function save(){
  clearTimeout(timer);
  if(saving){await saving;return version>savedVersion?save():true;}
  if(version===savedVersion||!current)return true;
  const captured=version;const data=structuredClone(current);status('保存中…');
  saving=(async()=>{
    try {
      let result;
      if(view==='post') {
        result=await api(`/api/posts/${encodeURIComponent(data.slug)}`,{method:'PUT',body:data});current.revision=result.revision;
        const index=state.posts.findIndex(post=>post.slug===data.slug);state.posts[index]={...result};
      } else if(['profile','appearance'].includes(view)) {
        result=await api('/api/settings',{method:'PUT',body:{settings:data,revision:state.settingsRevision}});state.settingsRevision=result.revision;state.settings=structuredClone(current);
      } else if(['about','friends'].includes(view)) {
        result=await api(`/api/pages/${view}`,{method:'PUT',body:data});current.revision=result.revision;
      }
      savedVersion=captured;blocked=false;stats();status(version===savedVersion?'已保存到本地':'等待保存');afterSavePreview();return true;
    } catch(error) {blocked=true;status(error.message,true);toast(error.message,true);throw error;}
    finally{saving=null;}
  })();
  const result=await saving;if(version>savedVersion&&!blocked)return save();return result;
}
function setPreview(nextPath='/',force=false){
  previewPath=nextPath;const frame=$('#preview-frame');const address=state.previewOrigin+nextPath;
  $('#preview-open').href=address;$('#preview-location').textContent=address;
  if(state.previewReady&&(force||frame.dataset.path!==nextPath)){frame.src=address;frame.dataset.path=nextPath;$('#preview-status').textContent='正在更新预览';}
  resizePreview();
}
function resizePreview(){
  const stage=$('#preview-stage');const available=Math.max(180,stage.clientWidth-32);const width=device==='desktop'?1280:390;const scale=Math.min(available/width,device==='mobile'?1:2);
  const frame=$('#preview-frame');$('#frame-wrap').style.width=`${width*scale}px`;frame.style.width=`${width}px`;frame.style.height=`${Math.max(600,(stage.clientHeight-32)/scale)}px`;frame.style.transform=`scale(${scale})`;
}
function sendPreviewSettings(){if(!state)return;$('#preview-frame').contentWindow?.postMessage({type:'blog-studio-appearance',hue:Number(current&&['profile','appearance'].includes(view)?current.hue:state.settings.hue),dark:previewDark},state.previewOrigin);}
$('#preview-frame').addEventListener('load',()=>{if(!state?.previewReady)return;$('#preview-loading').hidden=true;$('#preview-status').textContent='与本地内容同步';sendPreviewSettings();});
window.addEventListener('resize',resizePreview);
document.querySelectorAll('[data-device]').forEach(button=>button.addEventListener('click',()=>{device=button.dataset.device;document.querySelectorAll('[data-device]').forEach(item=>item.classList.toggle('active',item===button));resizePreview();}));
$('#preview-refresh').addEventListener('click',()=>setPreview(previewPath,true));
$('#preview-theme').addEventListener('click',()=>{previewDark=!previewDark;sendPreviewSettings();});
$('#save-button').addEventListener('click',()=>save().then(()=>toast('已保存到本地')).catch(()=>{}));
window.addEventListener('beforeunload',event=>{if(version!==savedVersion){event.preventDefault();event.returnValue='';}});
function routeHash(){const hash=location.hash.slice(1)||'posts';return hash.startsWith('post/')?{view:'post',slug:decodeURIComponent(hash.slice(5))}:{view:titles[hash]?hash:'posts'};}
async function route(){
  const next=routeHash();const oldHash=view==='post'?`post/${current?.slug}`:view;
  try{await save();}catch{history.replaceState(null,'',`#${oldHash}`);return;}
  const sequence=++loadSequence;view=next.view;current=null;version=0;savedVersion=0;blocked=false;status('已保存到本地');
  $('#page-title').textContent=titles[view];document.querySelectorAll('[data-nav]').forEach(link=>link.classList.toggle('active',link.dataset.nav===(view==='post'?'posts':view)));
  $('#save-button').disabled=!['post','profile','appearance','about','friends'].includes(view);
  $('#editor-pane').innerHTML='<div class="loading">正在载入…</div>';
  try {
    if(view==='post') {const data=await api(`/api/posts/${encodeURIComponent(next.slug)}`);if(sequence!==loadSequence)return;current=data;renderPost();setPreview(`/posts/${data.slug}/`);}
    else if(['profile','appearance'].includes(view)){current=structuredClone(state.settings);view==='profile'?renderProfile():renderAppearance();setPreview('/');}
    else if(['about','friends'].includes(view)){const data=await api(`/api/pages/${view}`);if(sequence!==loadSequence)return;current=data;renderPage();setPreview(`/${view}/`);}
    else if(view==='publish'){renderPublish();setPreview('/');}
    else if(view==='server'){await renderServer();setPreview('/');}
    else if(view==='trash'){state.trash=await api('/api/trash');if(sequence!==loadSequence)return;renderTrash();setPreview('/');}
    else {state.posts=await api('/api/posts');if(sequence!==loadSequence)return;renderList();setPreview('/');}
    stats();refreshIcons();$('#editor-pane').scrollTop=0;
  } catch(error){$('#editor-pane').innerHTML=`<div class="empty">${escape(error.message)}<p><a href="#posts">返回文章列表</a></p></div>`;}
}
function heading(title,subtitle){return `<div class="section-heading"><h1>${title}</h1></div><p class="section-subtitle">${subtitle}</p>`;}
function renderList(){
  $('#editor-pane').innerHTML=heading(titles[view],`${state.posts.filter(post=>view!=='drafts'||post.draft).length} 篇记录 · 每一篇都是生活的一个切片`)+`<div class="list-controls"><div class="search-field">${icon('search')}<input id="post-search" placeholder="搜索文章标题…" aria-label="搜索文章标题"></div><select id="post-filter" aria-label="文章状态"><option value="all">全部状态</option><option value="ready">待发布</option><option value="draft">草稿</option></select></div><div id="post-list"></div>`;
  const update=()=>{
    const query=$('#post-search').value.toLocaleLowerCase();const filter=$('#post-filter').value;
    const posts=state.posts.filter(post=>(view!=='drafts'||post.draft)&&post.title.toLocaleLowerCase().includes(query)&&(filter==='all'||(filter==='draft'?post.draft:!post.draft)));
    $('#post-list').innerHTML=posts.length?posts.map(post=>`<article class="post-row">${post.image?`<img class="post-thumb" src="${escape(media(post.image,post.slug))}" alt="${escape(post.title)}的封面">`:`<div class="post-thumb post-placeholder">${icon('file-text')}</div>`}<div class="post-row-copy"><h2><a href="#post/${encodeURIComponent(post.slug)}">${escape(post.title)}</a></h2><p><span>${escape(post.published)}</span><span>${escape(post.category||'未分类')}</span><span class="badge ${post.draft?'draft':''}">${post.draft?'草稿':'待发布'}</span></p></div><div class="post-actions"><a class="icon-button" href="#post/${encodeURIComponent(post.slug)}" title="编辑文章" aria-label="编辑 ${escape(post.title)}">${icon('square-pen')}</a><button class="icon-button" data-delete="${escape(post.slug)}" title="移入回收站" aria-label="删除 ${escape(post.title)}">${icon('trash-2')}</button></div></article>`).join(''):`<div class="empty">${icon('file-pen-line')}<p>这里还没有文章</p><button class="button" id="empty-new">${icon('plus')}写一篇新记录</button></div>`;
    refreshIcons();$('#empty-new')?.addEventListener('click',openNew);document.querySelectorAll('[data-delete]').forEach(button=>button.addEventListener('click',()=>deletePost(button.dataset.delete)));
  };$('#post-search').addEventListener('input',update);$('#post-filter').addEventListener('change',update);update();
}
function toolbar(){return `<div class="editor-toolbar"><button class="icon-button" data-format="bold" title="加粗" aria-label="加粗">${icon('bold')}</button><button class="icon-button" data-format="italic" title="斜体" aria-label="斜体">${icon('italic')}</button><button class="icon-button" data-format="heading" title="小标题" aria-label="小标题">${icon('heading-2')}</button><span class="toolbar-divider"></span><button class="icon-button" data-format="list" title="列表" aria-label="列表">${icon('list')}</button><button class="icon-button" data-format="quote" title="引用" aria-label="引用">${icon('quote')}</button><button class="icon-button" data-format="link" title="链接" aria-label="链接">${icon('link')}</button><button class="icon-button" id="insert-image" title="插入图片" aria-label="插入图片">${icon('image-plus')}</button><button class="icon-button" data-format="code" title="代码块" aria-label="代码块">${icon('code-2')}</button></div>`;}
function bindBody(){
  $('#body-editor').addEventListener('input',event=>{current.body=event.target.value;$('#word-count').textContent=`${current.body.length} 字符`;markDirty();});
  document.querySelectorAll('[data-format]').forEach(button=>button.addEventListener('click',()=>{
    const formats={bold:['**','**','加粗文字'],italic:['*','*','斜体文字'],heading:['\n## ','\n','小标题'],list:['\n- ','\n','列表内容'],quote:['\n> ','\n','引用内容'],link:['[','](https://example.com)','链接文字'],code:['\n```\n','\n```\n','代码']};insertText(...formats[button.dataset.format]);
  }));$('#insert-image').addEventListener('click',()=>chooseImage('body'));
}
function insertText(before,after='',placeholder='') {const editor=$('#body-editor');const start=editor.selectionStart,end=editor.selectionEnd;const selection=editor.value.slice(start,end)||placeholder;editor.setRangeText(before+selection+after,start,end,'end');current.body=editor.value;editor.focus();markDirty();$('#word-count').textContent=`${current.body.length} 字符`;}
function renderPost(){
  $('#editor-pane').innerHTML=`<a href="#posts" class="editor-back">${icon('arrow-left')}全部文章</a><input class="editor-title" id="post-title" aria-label="文章标题" value="${escape(current.title)}" maxlength="200"><div class="editor-meta"><label>发布日期<input type="date" id="published" value="${escape(current.published)}"></label><label>分类<input id="category" list="category-list" value="${escape(current.category)}" placeholder="选择或新建分类"><datalist id="category-list">${[...new Set(state.posts.map(post=>post.category).filter(Boolean))].map(name=>`<option value="${escape(name)}">`).join('')}</datalist></label></div><label>摘要<textarea id="description" rows="2" maxlength="1000" placeholder="记录一下这篇文章的主要内容…">${escape(current.description)}</textarea></label><label>标签<input id="tags" value="${escape(current.tags.join('，'))}" placeholder="日常，随想"></label><div class="editor-cover" id="cover-preview"></div><div class="editor-status-row"><label class="checkbox-label"><input type="checkbox" id="draft" ${current.draft?'checked':''}>保存为草稿</label><span>/${escape(current.slug)}/</span></div>${toolbar()}<textarea class="body-editor" id="body-editor" aria-label="文章正文" placeholder="从这里开始记录…">${escape(current.body)}</textarea><div class="editor-footnote"><span>Markdown</span><span id="word-count">${current.body.length} 字符</span></div>`;
  for(const [id,key] of [['post-title','title'],['published','published'],['category','category'],['description','description']])$('#'+id).addEventListener('input',event=>{current[key]=event.target.value;markDirty();});
  $('#tags').addEventListener('input',event=>{current.tags=event.target.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean);markDirty();});$('#draft').addEventListener('change',event=>{current.draft=event.target.checked;markDirty();});renderCover();bindBody();
}
function renderCover(){const container=$('#cover-preview');if(!container)return;container.innerHTML=`${current.image?`<img src="${escape(media(current.image,current.slug))}" alt="文章封面">`:''}<div class="cover-action"><button class="button" id="cover-upload">${icon('image-plus')}${current.image?'更换封面':'添加封面'}</button>${current.image?`<button class="icon-button cover-remove" id="cover-remove" aria-label="移除封面" title="移除封面">${icon('x')}</button>`:''}</div>`;$('#cover-upload').addEventListener('click',()=>chooseImage('image'));$('#cover-remove')?.addEventListener('click',()=>{current.image='';markDirty();renderCover();});refreshIcons();}
function textField(label,key,placeholder=''){return `<label>${label}<input data-setting="${key}" value="${escape(current[key])}" placeholder="${placeholder}" maxlength="300"></label>`;}
function bindSettings(){document.querySelectorAll('[data-setting]').forEach(input=>input.addEventListener('input',()=>{current[input.dataset.setting]=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;if(input.dataset.setting==='hue'){$('#hue-value').textContent=input.value;sendPreviewSettings();}markDirty();}));}
function renderProfile(){
  $('#editor-pane').innerHTML=heading('个人资料','你的名字、介绍，以及这个小小空间的模样。')+`<div class="profile-photo-row"><img id="profile-avatar" src="${escape(media(current.avatar))}" alt="个人头像"><div><div class="photo-label">博客头像</div><button class="button" id="avatar-upload">${icon('upload')}选择图片</button></div></div>${textField('昵称','name')}${textField('个人简介','bio')}<div class="form-section"><h2>博客信息</h2>${textField('博客名称','title')}${textField('一句话介绍','subtitle')}</div><div class="form-section"><h2>个人链接</h2><div id="social-links"></div><button class="button" id="add-social">${icon('plus')}添加链接</button></div>`;
  $('#avatar-upload').addEventListener('click',()=>chooseImage('avatar'));bindSettings();renderLinks('links');$('#add-social').addEventListener('click',()=>{current.links.push({name:'新链接',url:'/',icon:'fa6-solid:link'});markDirty();renderLinks('links');});
}
function renderAppearance(){
  $('#editor-pane').innerHTML=heading('外观与导航','属于你的配色，和沿途看到的风景。')+`<label>首页横幅</label><img class="banner-picker" id="banner-image" src="${escape(media(current.banner))}" alt="博客横幅"><button class="button" id="banner-upload">${icon('image-plus')}更换封面</button><label class="toggle-row"><span>显示首页横幅</span><input type="checkbox" data-setting="bannerEnabled" ${current.bannerEnabled?'checked':''}></label><div class="field-row">${textField('图片来源名称','creditText')}${textField('图片来源链接','creditUrl')}</div><div class="form-section"><h2>主题色 <span class="value-label" id="hue-value">${current.hue}</span></h2><div class="hue-track"></div><input type="range" min="0" max="360" data-setting="hue" value="${current.hue}" aria-label="博客主题色"><label class="toggle-row"><span>显示文章目录</span><input type="checkbox" data-setting="tocEnabled" ${current.tocEnabled?'checked':''}></label></div><div class="form-section"><h2>顶部导航</h2><div id="navigation-links"></div><button class="button" id="add-nav">${icon('plus')}添加导航</button></div>`;
  $('#banner-upload').addEventListener('click',()=>chooseImage('banner'));bindSettings();renderLinks('navigation');$('#add-nav').addEventListener('click',()=>{current.navigation.push({name:'新页面',url:'/',external:false});markDirty();renderLinks('navigation');});
}
function renderLinks(key){
  const element=$(key==='links'?'#social-links':'#navigation-links');const choices={'fa6-solid:user':'个人','fa6-solid:rss':'订阅','fa6-solid:link':'链接','fa6-solid:envelope':'邮件','fa6-brands:github':'GitHub','fa6-brands:bilibili':'哔哩哔哩'};
  element.innerHTML=current[key].map((link,index)=>`<div class="nav-editor-row ${key==='links'?'social':''}"><input aria-label="链接名称 ${index+1}" data-link-index="${index}" data-link-field="name" value="${escape(link.name)}"><input aria-label="链接地址 ${index+1}" data-link-index="${index}" data-link-field="url" value="${escape(link.url)}">${key==='links'?`<select aria-label="链接图标 ${index+1}" data-link-index="${index}" data-link-field="icon">${Object.entries(choices).map(([value,label])=>`<option value="${value}" ${link.icon===value?'selected':''}>${label}</option>`).join('')}</select>`:''}<button class="icon-button" data-remove-link="${index}" aria-label="删除链接 ${index+1}" title="删除链接">${icon('x')}</button></div>`).join('');
  element.querySelectorAll('[data-link-field]').forEach(input=>input.addEventListener('input',()=>{const link=current[key][Number(input.dataset.linkIndex)];link[input.dataset.linkField]=input.value;if(key==='navigation')link.external=/^https?:/.test(link.url);markDirty();}));element.querySelectorAll('[data-remove-link]').forEach(button=>button.addEventListener('click',()=>{current[key].splice(Number(button.dataset.removeLink),1);markDirty();renderLinks(key);}));refreshIcons();
}
function renderPage(){$('#editor-pane').innerHTML=heading(titles[view],view==='about'?'写下你的故事，让路过的人认识你。':'记录那些值得常去看看的地方。')+toolbar()+`<textarea class="body-editor" id="body-editor" aria-label="页面正文">${escape(current.body)}</textarea><div class="editor-footnote"><span>Markdown</span><span id="word-count">${current.body.length} 字符</span></div>`;bindBody();}
function chooseImage(target){uploadTarget={target,view,current};$('#image-input').value='';$('#image-input').click();}
$('#image-input').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;const destination=uploadTarget;if(file.size>12*1024*1024)return toast('图片不能超过 12 MB',true);
  status('图片上传中…');
  try{
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
    const result=await api('/api/upload',{method:'POST',body:{data}});
    if(current!==destination.current||view!==destination.view)return toast('图片已保存，请在原页面重新选择');
    if(destination.target==='body')insertText(`\n![${file.name.replace(/[\[\]]/g,'')}](${result.path})\n`);
    else {current[destination.target]=result.path;markDirty();if(destination.target==='image')renderCover();if(destination.target==='avatar')$('#profile-avatar').src=media(result.path);if(destination.target==='banner')$('#banner-image').src=media(result.path);}
    toast('图片已保存到本地');
  }catch(error){toast(error.message,true);status('图片保存失败',true);}
});
async function openNew(){try{await save();$('#new-form').reset();$('#new-dialog').showModal();}catch{}}
$('#new-post').addEventListener('click',openNew);
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>$('#new-dialog').close()));
$('#new-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const data=new FormData(event.target);const post=await api('/api/posts',{method:'POST',body:{title:data.get('title'),slug:data.get('slug')}});state.posts.unshift(post);$('#new-dialog').close();location.hash=`post/${post.slug}`;toast('草稿已创建');}catch(error){toast(error.message,true);}finally{button.disabled=false;}});
function confirmDelete(title){return new Promise(resolve=>{const dialog=$('#confirm-dialog');$('#confirm-message').textContent=`将「${title}」移入回收站？之后可以恢复。`;const done=value=>{dialog.close();$('#confirm-ok').onclick=null;$('#confirm-cancel').onclick=null;resolve(value);};$('#confirm-ok').onclick=()=>done(true);$('#confirm-cancel').onclick=()=>done(false);dialog.oncancel=()=>done(false);dialog.showModal();});}
async function deletePost(slug){const post=state.posts.find(post=>post.slug===slug);if(!await confirmDelete(post.title))return;try{await api(`/api/posts/${encodeURIComponent(slug)}`,{method:'DELETE',body:{revision:post.revision}});state.posts=state.posts.filter(post=>post.slug!==slug);stats();renderList();afterSavePreview();toast('已移入回收站');}catch(error){toast(error.message,true);}}
function renderTrash(){$('#editor-pane').innerHTML=heading('回收站',`${state.trash.length} 篇文章 · 可恢复到原来的位置`)+(state.trash.length?state.trash.map(item=>`<article class="post-row"><div class="post-thumb post-placeholder">${icon('file-text')}</div><div class="post-row-copy"><h2>${escape(item.title)}</h2><p>${escape(new Date(item.deletedAt).toLocaleString())}</p></div><button class="button" data-restore="${item.id}">${icon('undo-2')}恢复</button></article>`).join(''):'<div class="empty">回收站是空的</div>');document.querySelectorAll('[data-restore]').forEach(button=>button.addEventListener('click',async()=>{try{await api('/api/restore',{method:'POST',body:{id:button.dataset.restore}});state.posts=await api('/api/posts');state.trash=await api('/api/trash');stats();renderTrash();refreshIcons();afterSavePreview();toast('文章已恢复');}catch(error){toast(error.message,true);}}));}
function renderPublish(){const ready=state.posts.filter(post=>!post.draft).length;$('#editor-pane').innerHTML=heading('发布中心','先确认本地内容，再将新的故事带到线上。')+`<div class="publish-hero"><span class="publish-icon">${icon('package-check')}</span><div><h2>准备你的下一次发布</h2><p>本地构建 · 文章与图片 · 搜索索引</p></div></div><div class="publish-stats"><div><strong>${ready}</strong><span>待发布文章</span></div><div><strong>${state.posts.length-ready}</strong><span>草稿（不发布）</span></div><div><strong>2</strong><span>独立页面</span></div></div><div class="publish-step"><span class="step-dot">1</span><div><h3>保存并构建</h3><p>检查文章与图片，生成完整网站和搜索索引。</p></div></div><div class="publish-step"><span class="step-dot">2</span><div><h3>生成本地发布包</h3><p>每次成功构建单独保存，不覆盖上一次的发布包。</p></div></div><div class="publish-step"><span class="step-dot">3</span><div><h3>连接线上站点</h3><p>尚未连接 GitHub 或服务器。当前构建不会上传或发布到互联网。</p></div></div><button class="button primary" id="build-button">${icon('package')}生成发布包</button><div id="build-status"></div><div class="source-links">开源内容管理方案：<a href="https://github.com/Thinkmill/keystatic" target="_blank" rel="noreferrer">Keystatic</a> · <a href="https://github.com/decaporg/decap-cms" target="_blank" rel="noreferrer">Decap CMS</a></div>`;$('#build-button').addEventListener('click',async()=>{try{state.job=await api('/api/build',{method:'POST',body:{}});updateBuild();}catch(error){toast(error.message,true);}});updateBuild();}
function updateBuild(){if(view!=='publish')return;const job=state.job;$('#build-button').disabled=job.status==='running';$('#build-button').innerHTML=icon(job.status==='running'?'loader-circle':'package')+(job.status==='running'?'正在生成…':'生成发布包');$('#build-status').innerHTML=job.status==='idle'?'':`<div class="form-section"><h2>${{running:'正在构建',success:'发布包已生成',failed:'构建未完成'}[job.status]}</h2>${job.output?`<p class="build-output">${escape(job.output)}</p>`:''}<pre class="build-log">${escape(job.logs.join(''))}</pre></div>`;const log=$('.build-log');if(log)log.scrollTop=log.scrollHeight;refreshIcons();}
window.addEventListener('hashchange',()=>route());
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();save().then(()=>toast('已保存到本地')).catch(()=>{});}});
async function poll(){try{const data=await api('/api/status');const wasReady=state.previewReady;const previous=state.job.status;Object.assign(state,data);$('#connection-label').textContent='仅在本机运行';if(state.previewReady&&!wasReady)setPreview(previewPath,true);if(state.previewError){$('#preview-loading').hidden=false;$('#preview-loading').textContent=state.previewError;}if(previous!==state.job.status||state.job.status==='running')updateBuild();}catch{$('#connection-label').textContent='本地连接已断开';}finally{setTimeout(poll,2000);}}
(async()=>{try{state=await api('/api/bootstrap');stats();await route();if(state.previewReady)setPreview(previewPath,true);poll();}catch(error){$('#editor-pane').innerHTML=`<div class="empty">${escape(error.message)}<p>请刷新页面重试</p></div>`;}refreshIcons();})();
