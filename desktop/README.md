# Fuwari Studio v0.1.0

Windows 10/11 x64 本地博客编辑程序，首版支持 Fuwari 静态博客模板。

解压整个文件夹到自己有写入权限的位置（如桌面），双击 Fuwari Studio.exe。不要单独复制 EXE。程序附带 Electron、Node 22 和 Fuwari 依赖，无需另外安装 Node、Git 或包管理器。首次启动会准备环境，可能需要数分钟和约数 GB 可用空间。

你的博客位于程序旁的 Fuwari Studio Data/Projects/MyBlog。通过“项目”菜单可以创建新博客、打开兼容的 Fuwari Studio 项目或打开项目文件夹。普通 Fuwari 项目需先适配 src/site-settings.json，不会自动改造未知项目。转发时请发送原始发布压缩包，不要附带 Fuwari Studio Data 个人数据文件夹；其中包含你的文章及本机加密的服务器配置。

左侧编辑文章、头像、封面、个人资料和导航，右侧显示实际 Fuwari 预览。停止输入后自动保存；正式发布不包含草稿。删除文章可以在回收站恢复。

## 连接自有服务器

1. 准备独立博客域名、SSH 账号和专用网站目录，如 /var/www/my-blog。
2. 配置 Nginx/Apache 让域名指向该目录。本程序不安装或修改服务器 Web 服务。
3. 在“服务器连接”中填写主机、SSH 端口、用户名、密码或私钥、网站 URL 和网站目录。
4. 点击“测试连接”，与管理员提供的 SSH SHA256 指纹核对，再保存。服务器凭据使用 Windows 本机加密，不放入博客目录或分发包。
5. 在“发布中心”点击“构建并发布”，构建完成后核对弹窗中的域名、服务器和目录，确认发布。

v0.1 支持域名根路径、OpenSSH SFTP、密码或私钥认证。要求网站目录及其同级备份目录可写。采用逐文件原子替换，先资源后页面；整站切换不是原子操作。仅清理由本程序上次发布清单记录、此次已经移除的旧文件。首次发布会替换同名文件，因此务必使用博客专用目录。

备份保存在“网站目录.studio-backups/时间编号”。失败时自动尝试恢复本次替换的文件；网络中断可能导致恢复不完整，日志会列出需要手动恢复的文件。管理员应把同级备份目录放在 Web 根目录之外或禁止访问，并定期管理备份空间。

当前不含 GitHub 发布、双向同步、从服务器下载源码、自动更新或代码签名。别人收到程序后创建自己的博客、填写自己的服务器资料。程序不含原作者的私人博客或凭据。

本地项目是内容来源，请自行备份项目目录。服务器上的静态 HTML 不能还原全部 Markdown 源文档。

## 开源组件

Fuwari: https://github.com/saicaca/fuwari (MIT)
Astro: https://github.com/withastro/astro (MIT)
Electron: https://github.com/electron/electron (MIT)
ssh2-sftp-client: https://github.com/theophilusx/ssh2-sftp-client (MIT)
Lucide: https://lucide.dev (ISC)

各依赖原始 LICENSE 随程序保留。Electron 的 LICENSE 和 LICENSES.chromium.html 位于程序目录。未使用任何商业代码签名证书，Windows 可能显示未知发布者。
