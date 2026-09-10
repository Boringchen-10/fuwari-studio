const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = name => `<i data-lucide="${name}"></i>`;
const refreshIcons = () => window.lucide?.createIcons();
let state, current, view='overview', version=0, savedVersion=0, timer, saving, blocked=false, loadSequence=0;
let previewPath='/', device='desktop', previewDark=false, previewTimer, previewLoadTimer, uploadTarget, toastTimer;
let studioSettings={theme:'system',hue:150,device:'desktop',autosaveDelay:700};
const titles={welcome:'开始使用',overview:'网站概览',posts:'内容',drafts:'内容',profile:'外观',appearance:'外观',about:'内容',friends:'内容',publish:'发布',history:'历史版本',sites:'网站管理',siteCreate:'创建新网站',trash:'内容',post:'编辑文章',server:'发布位置',settings:'软件设置'};
const navFor=view=>['posts','drafts','about','friends','trash','post'].includes(view)?'content':['profile','appearance'].includes(view)?'appearance':view==='server'?'publish':view==='siteCreate'?'sites':view;
function toast(message,error=false){$('#toast').textContent=message;$('#toast').className=error?'error':'';$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,6000);}
async function api(url, options={}) {
  const response=await fetch(url,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':state?.csrf || '',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body)});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error || '操作失败'),{status:response.status});return data;
}
function status(text,error=false){$('#save-status').innerHTML=icon(error?'circle-alert':text.includes('保存中')?'loader-circle':'check')+escape(text);$('#save-status').classList.toggle('error',error);refreshIcons();}
function markDirty(){version++;blocked=false;status('等待保存');clearTimeout(timer);timer=setTimeout(()=>save().catch(()=>{}),Math.max(300,Math.min(5000,Number(studioSettings.autosaveDelay)||700)));}
function media(src,slug=''){if(!src)return '';if(/^https?:/.test(src))return src;return `/media?path=${encodeURIComponent(src)}&slug=${encodeURIComponent(slug)}`;}
function stats(){ $('#nav-count').textContent=state.posts.length;$('#sidebar-name').textContent=state.settings.name;const avatar=media(state.settings.avatar);if(avatar)$('#sidebar-avatar').src=avatar; }
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
  if(state.previewReady&&(force||frame.dataset.path!==nextPath)){const loading=$('#preview-loading');const separator=address.includes('?')?'&':'?';loading.hidden=false;loading.innerHTML=icon('loader-circle')+'<p>网站预览正在更新</p>';frame.dataset.path=nextPath;frame.src=force?`${address}${separator}studio-refresh=${Date.now()}`:address;$('#preview-status').textContent='正在更新预览';clearTimeout(previewLoadTimer);previewLoadTimer=setTimeout(finishPreviewLoad,2000);refreshIcons();}
  resizePreview();
}
function resizePreview(){
  const stage=$('#preview-stage');const available=Math.max(180,stage.clientWidth-32);const width=device==='desktop'?1280:390;const scale=Math.min(available/width,device==='mobile'?1:2);
  const frame=$('#preview-frame');$('#frame-wrap').style.width=`${width*scale}px`;frame.style.width=`${width}px`;frame.style.height=`${Math.max(600,(stage.clientHeight-32)/scale)}px`;frame.style.transform=`scale(${scale})`;
}
function sendPreviewSettings(){if(!state)return;$('#preview-frame').contentWindow?.postMessage({type:'blog-studio-appearance',hue:Number(current&&['profile','appearance'].includes(view)?current.hue:state.settings.hue),dark:previewDark},state.previewOrigin);}
function finishPreviewLoad(){clearTimeout(previewLoadTimer);if(!$('#preview-frame').dataset.path)return;$('#preview-loading').hidden=true;$('#preview-status').textContent='与本地内容同步';sendPreviewSettings();}
function applyStudioTheme(settings=studioSettings){studioSettings={...studioSettings,...settings};const dark=studioSettings.theme==='dark'||(studioSettings.theme==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);const parsedHue=Number(studioSettings.hue);const hue=Number.isFinite(parsedHue)?Math.max(0,Math.min(360,parsedHue)):150;document.documentElement.style.setProperty('--hue',String(hue));document.documentElement.dataset.theme=dark?'dark':'light';}
const systemThemeMedia=window.matchMedia('(prefers-color-scheme: dark)');systemThemeMedia.addEventListener?.('change',()=>{if(studioSettings.theme==='system')applyStudioTheme();});
$('#preview-frame').addEventListener('load',finishPreviewLoad);
window.addEventListener('resize',resizePreview);
document.querySelectorAll('[data-device]').forEach(button=>button.addEventListener('click',()=>{device=button.dataset.device;document.querySelectorAll('[data-device]').forEach(item=>item.classList.toggle('active',item===button));resizePreview();}));
$('#preview-refresh').addEventListener('click',()=>setPreview(previewPath,true));
$('#preview-theme').addEventListener('click',()=>{previewDark=!previewDark;sendPreviewSettings();});
$('#save-button').addEventListener('click',()=>save().then(()=>toast('已保存到本地')).catch(()=>{}));
window.addEventListener('beforeunload',event=>{if(version!==savedVersion){event.preventDefault();event.returnValue='';}});
function routeHash(){
  if(state?.welcome)return {view:'welcome'};
  const hash=location.hash.slice(1)||'overview';
  if(hash.startsWith('post/'))return {view:'post',slug:decodeURIComponent(hash.slice(5))};
  const aliases={content:'posts','content/drafts':'drafts','content/about':'about','content/friends':'friends','content/trash':'trash','appearance/profile':'profile','publish/connections':'server','sites/new':'siteCreate'};
  const resolved=aliases[hash]||hash;return {view:titles[resolved]?resolved:'overview'};
}
async function route(){
  const next=routeHash();const oldHash=view==='post'?`post/${current?.slug}`:view;
  try{await save();}catch{history.replaceState(null,'',`#${oldHash}`);return;}
  const sequence=++loadSequence;view=next.view;current=null;version=0;savedVersion=0;blocked=false;status('已保存到本地');
  const primary=navFor(view);document.body.classList.toggle('preview-enabled',['post','profile','appearance'].includes(view));
  $('#page-title').textContent=titles[view];document.querySelectorAll('[data-nav]').forEach(link=>link.classList.toggle('active',link.dataset.nav===primary));
  $('#save-button').disabled=!['post','profile','appearance','about','friends'].includes(view);
  $('#editor-pane').innerHTML='<div class="loading">正在载入…</div>';
  try {
    if(view==='welcome'){renderWelcome();}
    else if(view==='overview'){await renderOverview();}
    else if(view==='post') {const data=await api(`/api/posts/${encodeURIComponent(next.slug)}`);if(sequence!==loadSequence)return;current=data;renderPost();setPreview(`/posts/${data.slug}/`);}
    else if(['profile','appearance'].includes(view)){current=structuredClone(state.settings);view==='profile'?renderProfile():renderAppearance();setPreview('/');}
    else if(['about','friends'].includes(view)){const data=await api(`/api/pages/${view}`);if(sequence!==loadSequence)return;current=data;renderPage();setPreview(`/${view}/`);}
    else if(view==='history'){await window.renderHistory();}
    else if(view==='sites'){await window.renderSites();}
    else if(view==='siteCreate'){await window.renderSites({showCreate:true});}
    else if(view==='publish'){renderPublish();setPreview('/');}
    else if(view==='server'){await renderServer();setPreview('/');}
    else if(view==='settings'){await renderStudioSettings();setPreview('/');}
    else if(view==='trash'){state.trash=await api('/api/trash');if(sequence!==loadSequence)return;renderTrash();setPreview('/');}
    else {state.posts=await api('/api/posts');if(sequence!==loadSequence)return;renderList();}
    stats();refreshIcons();$('#editor-pane').scrollTop=0;
  } catch(error){$('#editor-pane').innerHTML=`<div class="empty">${escape(error.message)}<p><a href="#overview">返回网站概览</a></p></div>`;}
}
function contentTabs(active=view){return `<div class="subnav" role="navigation" aria-label="内容分类"><a href="#content" class="${active==='posts'?'active':''}">文章</a><a href="#content/drafts" class="${active==='drafts'?'active':''}">草稿</a><a href="#content/about" class="${active==='about'?'active':''}">关于</a><a href="#content/friends" class="${active==='friends'?'active':''}">友情链接</a><a href="#content/trash" class="${active==='trash'?'active':''}">回收站</a></div>`;}
function appearanceTabs(active=view){return `<div class="subnav" role="navigation" aria-label="外观分类"><a href="#appearance" class="${active==='appearance'?'active':''}">页面样式</a><a href="#appearance/profile" class="${active==='profile'?'active':''}">个人资料</a></div>`;}
function renderWelcome(){document.body.classList.add('welcome-mode');$('#editor-pane').innerHTML=`<section class="welcome"><span class="welcome-mark">${icon('panels-top-left')}</span><p class="eyebrow">BLOG STUDIO 0.2</p><h1>建立属于你的网上空间</h1><p class="welcome-copy">不需要终端或开发工具。选择一个样式，填写基本资料，Blog Studio 会准备好网站并打开真实预览。</p><div class="welcome-actions"><button class="button primary" id="welcome-create">${icon('sparkles')}创建新网站</button><button class="button" id="welcome-import">${icon('folder-input')}导入已有网站</button></div><div id="welcome-flow"></div></section>`;$('#welcome-create').onclick=()=>window.renderCreateFlow($('#welcome-flow'));$('#welcome-import').onclick=()=>window.inspectImport($('#welcome-flow'));refreshIcons();}
async function renderOverview(){
  const [versions,connections]=await Promise.all([api('/api/versions'),api('/api/connections')]);const published=versions.find(item=>['published','pending'].includes(item.status));const ready=state.posts.filter(post=>!post.draft).length;
  $('#editor-pane').innerHTML=heading('网站概览','今天想为自己的空间做些什么？')+`<div class="overview-hero"><div><span class="eyebrow">${escape(state.descriptor?.base?.id==='fuwari'?'FUWARI 官方基座':'个人网站')}</span><h2>${escape(state.settings.title)}</h2><p>${escape(state.settings.subtitle||'你的个人网站正在本机保存。')}</p></div><a class="button primary" href="#content">${icon('square-pen')}管理内容</a></div><div class="overview-grid"><article><span>${icon('files')}</span><strong>${state.posts.length}</strong><p>篇文章，其中 ${ready} 篇会发布</p></article><article><span>${icon('history')}</span><strong>${versions.length}</strong><p>个本地历史版本</p></article><article><span>${icon('cloud')}</span><strong>${(connections.sftpProfiles||[]).length+(connections.github?.configured?1:0)}</strong><p>个已保存发布位置</p></article></div><div class="overview-columns"><section class="form-section"><div class="section-heading compact"><h2>常用操作</h2></div><div class="quick-actions"><button class="quick-action" id="overview-new">${icon('file-plus-2')}<span><strong>写一篇文章</strong><small>新建草稿并实时预览</small></span></button><a class="quick-action" href="#appearance">${icon('palette')}<span><strong>调整网站外观</strong><small>头像、横幅、颜色和导航</small></span></a><a class="quick-action" href="#publish">${icon('send')}<span><strong>发布网站</strong><small>选择位置后更新线上内容</small></span></a></div></section><section class="form-section"><div class="section-heading compact"><h2>最近状态</h2></div>${published?`<div class="status-card"><span class="status-dot good"></span><div><strong>${published.status==='pending'?'正在上线':'最近已发布'}</strong><p>${escape(new Date(published.publishedAt||published.createdAt).toLocaleString('zh-CN',{hour12:false}))}</p><small>${escape(published.siteUrl||'已保存为本地版本')}</small></div></div>`:'<div class="empty compact-empty">还没有发布记录</div>'}<p class="standard-note">Blog Studio Standard ${escape(state.descriptor?.standardVersion||'1.0')} · ${escape(state.descriptor?.base?.id==='fuwari'?'Fuwari':'受支持网站')}</p></section></div>`;$('#overview-new').onclick=openNew;refreshIcons();
}
async function renderStudioSettings(){
  const s=await api('/api/desktop/settings');
  const hue=Number.isFinite(Number(s.hue))?Number(s.hue):150;
  $('#editor-pane').innerHTML=heading('工作台设置','像调整 Fuwari 外观一样，实时改变 Blog Studio 的工作台。')+`<div class="settings-card settings-hero"><div><span class="settings-eyebrow">BLOG STUDIO</span><h2>让工作台更像你的空间</h2><p>颜色和明暗会立即应用到当前窗口。</p></div><span class="settings-orb" id="studio-color-orb"></span></div><div class="settings-card"><div class="settings-card-heading"><div><h2>主题色</h2><p>拖动色相滑条，整个工作台的背景、面板、文字和交互状态都会即时更新。</p></div><output id="studio-hue-value">${hue}°</output></div><div class="studio-hue-track"></div><input id="studio-hue" class="studio-hue-range" type="range" min="0" max="360" value="${hue}" aria-label="工作台主题色"><div class="studio-color-swatches"><button type="button" data-hue="150" style="--swatch:hsl(150 48% 34%)" aria-label="绿色主题"></button><button type="button" data-hue="205" style="--swatch:hsl(205 66% 42%)" aria-label="蓝色主题"></button><button type="button" data-hue="265" style="--swatch:hsl(265 55% 50%)" aria-label="紫色主题"></button><button type="button" data-hue="340" style="--swatch:hsl(340 62% 46%)" aria-label="玫红主题"></button><button type="button" data-hue="28" style="--swatch:hsl(28 78% 48%)" aria-label="橙色主题"></button></div></div><div class="settings-card"><div class="settings-card-heading"><div><h2>明暗模式</h2><p>选择固定模式，或跟随 Windows 的系统主题。</p></div></div><div class="mode-segmented" role="group" aria-label="明暗模式"><button type="button" data-theme="light">${icon('sun')}浅色</button><button type="button" data-theme="dark">${icon('moon')}深色</button><button type="button" data-theme="system">${icon('monitor')}跟随系统</button></div></div><div class="settings-card"><div class="settings-card-heading"><div><h2>本地缓存目录</h2><p>用于保存运行文件和本地缓存。选择后立即保存，下次启动时使用新位置。</p></div></div><div class="folder-picker"><input id="studio-cache" value="${escape(s.cacheDir||'')}" placeholder="默认位置"><button class="button" id="studio-choose-folder">${icon('folder-open')}选择文件夹</button></div><div class="settings-inline"><label>自动保存延迟（毫秒）<input id="studio-delay" type="number" min="300" max="5000" step="100" value="${Number(s.autosaveDelay||700)}"></label><label>默认预览设备<select id="studio-device"><option value="desktop">桌面</option><option value="mobile">手机</option></select></label></div><div class="dialog-actions"><button class="button" id="studio-reset">恢复默认</button><button class="button primary" id="studio-save">${icon('save')}保存设置</button></div><p id="studio-result" class="section-subtitle"></p></div>`;
  $('#studio-device').value=s.device||'desktop';
  let current={...s,hue};
  const systemDark=()=>window.matchMedia('(prefers-color-scheme: dark)').matches;
  const apply=()=>{applyStudioTheme({theme:current.theme,hue:current.hue});$('#studio-color-orb').style.background='var(--accent)';$('#studio-hue-value').value=`${current.hue}°`;$('#studio-hue-value').textContent=`${current.hue}°`;document.querySelectorAll('.mode-segmented [data-theme]').forEach(b=>b.classList.toggle('active',b.dataset.theme===current.theme));};
  const save=async()=>{await api('/api/desktop/settings',{method:'PUT',body:{hue:current.hue,theme:current.theme,device:$('#studio-device').value,autosaveDelay:Math.max(300,Math.min(5000,Number($('#studio-delay').value)||700)),cacheDir:$('#studio-cache').value.trim()}});};
  const saveQuiet=()=>save().catch(error=>toast(error.message,true));
  $('#studio-hue').addEventListener('input',()=>{current.hue=Number($('#studio-hue').value);apply();saveQuiet();});
  document.querySelectorAll('[data-hue]').forEach(b=>b.addEventListener('click',()=>{$('#studio-hue').value=b.dataset.hue;current.hue=Number(b.dataset.hue);apply();saveQuiet();}));
  document.querySelectorAll('.mode-segmented [data-theme]').forEach(b=>b.addEventListener('click',()=>{current.theme=b.dataset.theme;apply();saveQuiet();}));
  const mediaQuery=window.matchMedia('(prefers-color-scheme: dark)');mediaQuery.addEventListener?.('change',()=>{if(current.theme==='system')apply();});
  $('#studio-choose-folder').onclick=async()=>{try{const picked=await api('/api/desktop/settings/choose',{method:'POST'});if(!picked.canceled){$('#studio-cache').value=picked.cacheDir;current.cacheDir=picked.cacheDir;await save();$('#studio-result').textContent='缓存目录已保存。';}}catch(e){toast(e.message,true);}};
  $('#studio-save').onclick=async()=>{try{await save();$('#studio-result').textContent='设置已保存，当前窗口已立即应用。';toast('工作台设置已保存');}catch(e){toast(e.message,true);}};
  $('#studio-reset').onclick=async()=>{current={...current,hue:150,theme:'system',device:'desktop',autosaveDelay:700,cacheDir:''};$('#studio-hue').value=150;$('#studio-device').value='desktop';$('#studio-delay').value=700;$('#studio-cache').value='';apply();await saveQuiet();};apply();refreshIcons();
}
function heading(title,subtitle){return `<div class="section-heading"><h1>${title}</h1></div><p class="section-subtitle">${subtitle}</p>`;}
function renderList(){
  $('#editor-pane').innerHTML=heading('内容',`${state.posts.filter(post=>view!=='drafts'||post.draft).length} 篇记录 · 文章和独立页面都保存在当前网站中`)+contentTabs()+`<div class="list-controls"><div class="search-field">${icon('search')}<input id="post-search" placeholder="搜索文章标题…" aria-label="搜索文章标题"></div><select id="post-filter" aria-label="文章状态"><option value="all">全部状态</option><option value="ready">待发布</option><option value="draft">草稿</option></select></div><div id="post-list"></div>`;
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
  $('#editor-pane').innerHTML=`<a href="#content" class="editor-back">${icon('arrow-left')}返回内容</a><input class="editor-title" id="post-title" aria-label="文章标题" value="${escape(current.title)}" maxlength="200"><div class="editor-meta"><label>发布日期<input type="date" id="published" value="${escape(current.published)}"></label><label>分类<input id="category" list="category-list" value="${escape(current.category)}" placeholder="选择或新建分类"><datalist id="category-list">${[...new Set(state.posts.map(post=>post.category).filter(Boolean))].map(name=>`<option value="${escape(name)}">`).join('')}</datalist></label></div><label>摘要<textarea id="description" rows="2" maxlength="1000" placeholder="记录一下这篇文章的主要内容…">${escape(current.description)}</textarea></label><label>标签<input id="tags" value="${escape(current.tags.join('，'))}" placeholder="日常，随想"></label><div class="editor-cover" id="cover-preview"></div><div class="editor-status-row"><label class="checkbox-label"><input type="checkbox" id="draft" ${current.draft?'checked':''}>保存为草稿</label><span>/${escape(current.slug)}/</span></div>${toolbar()}<textarea class="body-editor" id="body-editor" aria-label="文章正文" placeholder="从这里开始记录…">${escape(current.body)}</textarea><div class="editor-footnote"><span>Markdown</span><span id="word-count">${current.body.length} 字符</span></div>`;
  for(const [id,key] of [['post-title','title'],['published','published'],['category','category'],['description','description']])$('#'+id).addEventListener('input',event=>{current[key]=event.target.value;markDirty();});
  $('#tags').addEventListener('input',event=>{current.tags=event.target.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean);markDirty();});$('#draft').addEventListener('change',event=>{current.draft=event.target.checked;markDirty();});renderCover();bindBody();
}
function renderCover(){const container=$('#cover-preview');if(!container)return;container.innerHTML=`${current.image?`<img src="${escape(media(current.image,current.slug))}" alt="文章封面">`:''}<div class="cover-action"><button class="button" id="cover-upload">${icon('image-plus')}${current.image?'更换封面':'添加封面'}</button>${current.image?`<button class="icon-button cover-remove" id="cover-remove" aria-label="移除封面" title="移除封面">${icon('x')}</button>`:''}</div>`;$('#cover-upload').addEventListener('click',()=>chooseImage('image'));$('#cover-remove')?.addEventListener('click',()=>{current.image='';markDirty();renderCover();});refreshIcons();}
function textField(label,key,placeholder=''){return `<label>${label}<input data-setting="${key}" value="${escape(current[key])}" placeholder="${placeholder}" maxlength="300"></label>`;}
function bindSettings(){document.querySelectorAll('[data-setting]').forEach(input=>input.addEventListener('input',()=>{current[input.dataset.setting]=input.type==='checkbox'?input.checked:input.type==='range'?Number(input.value):input.value;if(input.dataset.setting==='hue'){$('#hue-value').textContent=input.value;sendPreviewSettings();}markDirty();}));}
function renderProfile(){
  $('#editor-pane').innerHTML=heading('外观','让网站呈现出你的名字和个性。')+appearanceTabs()+`<div class="profile-photo-row"><img id="profile-avatar" src="${escape(media(current.avatar))}" alt="个人头像"><div><div class="photo-label">网站头像</div><button class="button" id="avatar-upload">${icon('upload')}选择图片</button></div></div>${textField('昵称','name')}${textField('个人简介','bio')}<div class="form-section"><h2>网站信息</h2>${textField('网站名称','title')}${textField('一句话介绍','subtitle')}</div><div class="form-section"><h2>个人链接</h2><div id="social-links"></div><button class="button" id="add-social">${icon('plus')}添加链接</button></div>`;
  $('#avatar-upload').addEventListener('click',()=>chooseImage('avatar'));bindSettings();renderLinks('links');$('#add-social').addEventListener('click',()=>{current.links.push({name:'新链接',url:'/',icon:'fa6-solid:link'});markDirty();renderLinks('links');});
}
function renderAppearance(){
  $('#editor-pane').innerHTML=heading('外观','一边调整，一边查看真实网站效果。')+appearanceTabs()+`<label>首页横幅</label><img class="banner-picker" id="banner-image" src="${escape(media(current.banner))}" alt="网站横幅"><button class="button" id="banner-upload">${icon('image-plus')}更换封面</button><label class="toggle-row"><span>显示首页横幅</span><input type="checkbox" data-setting="bannerEnabled" ${current.bannerEnabled?'checked':''}></label><div class="field-row">${textField('图片来源名称','creditText')}${textField('图片来源链接','creditUrl')}</div><div class="form-section"><h2>主题色 <span class="value-label" id="hue-value">${current.hue}</span></h2><div class="hue-track"></div><input type="range" min="0" max="360" data-setting="hue" value="${current.hue}" aria-label="网站主题色"><label class="toggle-row"><span>显示文章目录</span><input type="checkbox" data-setting="tocEnabled" ${current.tocEnabled?'checked':''}></label></div><div class="form-section"><h2>顶部导航</h2><div id="navigation-links"></div><button class="button" id="add-nav">${icon('plus')}添加导航</button></div>`;
  $('#banner-upload').addEventListener('click',()=>chooseImage('banner'));bindSettings();renderLinks('navigation');$('#add-nav').addEventListener('click',()=>{current.navigation.push({name:'新页面',url:'/',external:false});markDirty();renderLinks('navigation');});
}
function renderLinks(key){
  const element=$(key==='links'?'#social-links':'#navigation-links');const choices={'fa6-solid:user':'个人','fa6-solid:rss':'订阅','fa6-solid:link':'链接','fa6-solid:envelope':'邮件','fa6-brands:github':'GitHub','fa6-brands:bilibili':'哔哩哔哩'};
  element.innerHTML=current[key].map((link,index)=>`<div class="nav-editor-row ${key==='links'?'social':''}"><input aria-label="链接名称 ${index+1}" data-link-index="${index}" data-link-field="name" value="${escape(link.name)}"><input aria-label="链接地址 ${index+1}" data-link-index="${index}" data-link-field="url" value="${escape(link.url)}">${key==='links'?`<select aria-label="链接图标 ${index+1}" data-link-index="${index}" data-link-field="icon">${Object.entries(choices).map(([value,label])=>`<option value="${value}" ${link.icon===value?'selected':''}>${label}</option>`).join('')}</select>`:''}<button class="icon-button" data-remove-link="${index}" aria-label="删除链接 ${index+1}" title="删除链接">${icon('x')}</button></div>`).join('');
  element.querySelectorAll('[data-link-field]').forEach(input=>input.addEventListener('input',()=>{const link=current[key][Number(input.dataset.linkIndex)];link[input.dataset.linkField]=input.value;if(key==='navigation')link.external=/^https?:/.test(link.url);markDirty();}));element.querySelectorAll('[data-remove-link]').forEach(button=>button.addEventListener('click',()=>{current[key].splice(Number(button.dataset.removeLink),1);markDirty();renderLinks(key);}));refreshIcons();
}
function renderPage(){$('#editor-pane').innerHTML=heading('内容',view==='about'?'写下你的故事，让路过的人认识你。':'记录那些值得常去看看的地方。')+contentTabs()+toolbar()+`<textarea class="body-editor" id="body-editor" aria-label="页面正文">${escape(current.body)}</textarea><div class="editor-footnote"><span>Markdown</span><span id="word-count">${current.body.length} 字符</span></div>`;bindBody();}
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
function renderTrash(){$('#editor-pane').innerHTML=heading('内容',`${state.trash.length} 篇文章可以恢复`)+contentTabs()+(state.trash.length?state.trash.map(item=>`<article class="post-row"><div class="post-thumb post-placeholder">${icon('file-text')}</div><div class="post-row-copy"><h2>${escape(item.title)}</h2><p>${escape(new Date(item.deletedAt).toLocaleString())}</p></div><button class="button" data-restore="${item.id}">${icon('undo-2')}恢复</button></article>`).join(''):'<div class="empty">回收站是空的</div>');document.querySelectorAll('[data-restore]').forEach(button=>button.addEventListener('click',async()=>{try{await api('/api/restore',{method:'POST',body:{id:button.dataset.restore}});state.posts=await api('/api/posts');state.trash=await api('/api/trash');stats();renderTrash();refreshIcons();afterSavePreview();toast('文章已恢复');}catch(error){toast(error.message,true);}}));}
function renderPublish(){const ready=state.posts.filter(post=>!post.draft).length;$('#editor-pane').innerHTML=heading('发布','把当前网站更新到你选择的位置。')+`<div class="publish-hero"><span class="publish-icon">${icon('send')}</span><div><h2>准备发布 ${escape(state.settings.title)}</h2><p>${ready} 篇文章会发布，${state.posts.length-ready} 篇草稿只保存在本机</p></div></div><div class="publish-stats"><div><strong>${ready}</strong><span>本次公开文章</span></div><div><strong>${state.posts.length-ready}</strong><span>本机草稿</span></div><div><strong>2</strong><span>独立页面</span></div></div><div class="publish-step"><span class="step-dot">1</span><div><h3>检查网站内容</h3><p>保存文章和图片，准备完整的网站文件。</p></div></div><div class="publish-step"><span class="step-dot">2</span><div><h3>保存一个历史版本</h3><p>每次生成都会保留可恢复的本地版本。</p></div></div><div class="publish-step"><span class="step-dot">3</span><div><h3>更新线上网站</h3><p>选择一个或多个发布位置后再确认上线。</p></div></div><button class="button primary" id="build-button">${icon('package')}只生成本地版本</button><a class="button" href="#publish/connections">${icon('settings-2')}管理发布位置</a><div id="build-status"></div>`;$('#build-button').addEventListener('click',async()=>{try{state.job=await api('/api/build',{method:'POST',body:{}});updateBuild();}catch(error){toast(error.message,true);}});updateBuild();}
function updateBuild(){if(view!=='publish')return;const job=state.job;$('#build-button').disabled=job.status==='running';$('#build-button').innerHTML=icon(job.status==='running'?'loader-circle':'package')+(job.status==='running'?'正在准备网站…':'只生成本地版本');$('#build-status').innerHTML=job.status==='idle'?'':`<div class="form-section"><h2>${{running:'正在准备网站',success:'本地版本已生成',failed:'这次没有完成'}[job.status]}</h2>${job.output?'<p class="section-subtitle">网站文件和可恢复版本已经保存在本机。</p>':''}<details class="technical-log"><summary>查看技术日志</summary>${job.output?`<p class="build-output">${escape(job.output)}</p>`:''}<pre class="build-log">${escape(job.logs.join(''))}</pre></details></div>`;const log=$('.build-log');if(log)log.scrollTop=log.scrollHeight;refreshIcons();}
window.addEventListener('hashchange',()=>route());
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();save().then(()=>toast('已保存到本地')).catch(()=>{});}});
async function poll(){try{const data=await api('/api/status');const wasReady=state.previewReady;const previous=state.job.status;Object.assign(state,data);$('#connection-label').textContent='仅在本机运行';if(state.previewReady&&!wasReady)setPreview(previewPath,true);if(state.previewError){$('#preview-loading').hidden=false;$('#preview-loading').textContent=state.previewError;}if(previous!==state.job.status||state.job.status==='running')updateBuild();}catch{$('#connection-label').textContent='本地连接已断开';}finally{setTimeout(poll,2000);}}
(async()=>{try{studioSettings=await api('/api/desktop/settings');applyStudioTheme(studioSettings);device=studioSettings.device==='mobile'?'mobile':'desktop';document.querySelectorAll('[data-device]').forEach(item=>item.classList.toggle('active',item.dataset.device===device));state=await api('/api/bootstrap');$('#current-site-name').textContent=state.welcome?'欢迎':state.settings.title||'我的网站';if(state.welcome){$('#new-post').disabled=true;document.body.classList.add('welcome-mode');}stats();await route();poll();}catch(error){$('#editor-pane').innerHTML=`<div class="empty">${escape(error.message)}<p>请刷新页面重试</p></div>`;}refreshIcons();})();
