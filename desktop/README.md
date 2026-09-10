# Blog Studio v0.2.0

Windows 10/11 x64 个人网站工作台。Blog Studio Standard 1.0 的第一个官方基座是 Fuwari。

解压整个文件夹到自己有写入权限的位置（如桌面），双击 `Blog Studio v0.2.0.exe`。不要单独复制 EXE。程序附带 Electron、Node 22 和 Fuwari 依赖，无需另外安装 Node、Git 或包管理器。首次启动会准备环境，可能需要数分钟和约数 GB 可用空间。

程序数据位于 `%APPDATA%\Blog Studio`。首屏可以创建新网站或导入已有网站；之后通过“网站管理”切换。v0.1.3 的网站、工作台设置、历史版本和加密连接资料保持兼容。旧 Fuwari 网站会先创建恢复点，再自动补充 `blog-studio.json`。

“内容”管理文章、草稿、关于、友情链接和回收站；“外观”调整头像、封面、个人资料和导航。文章编辑和外观设置右侧显示真实网站预览。停止输入后自动保存；正式发布不包含草稿。

## 连接自有服务器

1. 准备独立博客域名、SSH 账号和专用网站目录，如 /var/www/my-blog。
2. 配置 Nginx/Apache 让域名指向该目录。本程序不安装或修改服务器 Web 服务。
3. 在“发布 → 管理发布位置”添加自己的服务器，填写网站地址、网站目录和连接详情。可以为同一网站保存多台服务器。
4. 点击“测试连接”，与管理员提供的 SSH SHA256 指纹核对，再保存。服务器凭据使用 Windows 本机加密，不放入博客目录或分发包。
5. 在“发布”中勾选一个或多个位置，也可同时选择 GitHub Pages，再点击“构建并发布”。

支持域名根路径、OpenSSH SFTP、密码或私钥认证。要求网站目录及其同级备份目录可写。采用逐文件原子替换，先资源后页面；整站切换不是原子操作。仅清理由本程序上次发布清单记录、此次已经移除的旧文件。首次发布会替换同名文件，因此务必使用博客专用目录。

备份保存在“网站目录.studio-backups/时间编号”。失败时自动尝试恢复本次替换的文件；网络中断可能导致恢复不完整，日志会列出需要手动恢复的文件。管理员应把同级备份目录放在 Web 根目录之外或禁止访问，并定期管理备份空间。

GitHub Pages 配置步骤见 `resources/app/GITHUB.md`。每次生成会在当前网站 `.local-admin` 目录下保留按时间和网站名称标记的发布包及源码快照，可从“历史版本”页面创建独立副本。

本地项目是内容来源，请自行备份项目目录。服务器上的静态 HTML 不能还原全部 Markdown 源文档。

## 开源组件

Fuwari: https://github.com/saicaca/fuwari (MIT)
Astro: https://github.com/withastro/astro (MIT)
Electron: https://github.com/electron/electron (MIT)
ssh2-sftp-client: https://github.com/theophilusx/ssh2-sftp-client (MIT)
Lucide: https://lucide.dev (ISC)

各依赖原始 LICENSE 随程序保留。Electron 的 LICENSE 和 LICENSES.chromium.html 位于程序目录。未使用任何商业代码签名证书，Windows 可能显示未知发布者。
