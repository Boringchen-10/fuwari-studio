# Blog Studio

**简体中文** | [English](README.en.md)

在本地创建、编辑、预览和发布自己的个人网站。Blog Studio v0.2.0 是面向普通用户的 Windows 个人网站工作台，首个官方基座为 Fuwari，非 Fuwari 官方项目。

## 下载与开始

在 [Releases](https://github.com/Boringchen-10/fuwari-studio/releases) 下载 Windows x64 压缩包，完整解压后运行 `Blog Studio v0.2.0.exe`。支持 Windows 10/11 x64，自带 Electron、Node 22 和模板依赖，无需另装 Node 或 Git。首次启动需要几分钟和数 GB 可用磁盘空间。

## v0.2 功能

当前版本：**v0.2.0**，升级为个人网站工作台并建立 Blog Studio Standard 1.0。[查看完整更新](docs/releases/v0.2.0.zh-CN.md) · [协议说明](docs/BLOG-STUDIO-STANDARD-1.0.md)。

- 首屏创建新网站或导入已有网站；导入前显示识别结果、缺失内容和适配能力。
- 网站概览、内容、外观、发布、历史版本、网站管理和软件设置七个一级页面。
- Markdown 文章编辑、草稿、分类、标签、独立页面和封面图片。
- 本地自动保存，右侧预览真实 Fuwari 页面，支持桌面和手机预览尺寸。
- 编辑头像、个人资料、横幅、主题色、导航、关于页面和友情链接。
- 新建网站、导入 Fuwari 项目并从网站列表切换；删除的文章可从回收站恢复。
- 构建静态网站，正式页面排除草稿；生成发布包。
- 每次构建按时间和网站名称保留发布包及可编辑源码快照，可从历史版本创建副本。
- 保存多个命名 SFTP/SSH 服务器，支持密码或私钥认证、SSH 指纹确认。
- 发布时可单选或多选 SFTP 服务器与 GitHub Pages。
- Windows 本机加密保存连接凭据；SFTP 发布保留被替换文件的远程备份，失败时尝试恢复。

首次使用选择“创建新网站”，填写基本资料后即可编辑与预览；需要上线时再添加发布位置。服务器需自行安装 Nginx/Apache 并配置专用网站目录，软件不负责安装 Web 服务。

## 网站、版本与数据

程序设置、最近网站和加密连接资料保存在 `%APPDATA%\Blog Studio`，新网站位于其中的 `Projects` 目录。升级自 v0.1.3 时继续使用原网站路径、设置、历史版本和连接资料；旧 Fuwari 网站会在创建恢复点后补充 `blog-studio.json`。

每个网站在自己的 `.local-admin/versions` 中保存带时间标记的源码快照，在 `.local-admin/releases` 中保存对应发布包。“网站管理”用于切换网站，“历史版本”可以从可编辑快照创建独立副本；旧版只有静态文件的发布包会显示为“仅发布文件”。请仍定期备份完整项目目录。

## 限制

- v0.2.0 只支持 Windows x64 和完整适配的 Fuwari 基座；不承诺支持任意 Astro 项目。
- 界面目前为中文；本文档可选择中文或英文，不代表软件已提供英文界面。
- 不支持从线上网站反向同步源码、云端源码备份、自动更新或代码签名。
- `public` 目录中的文件会公开发布，包括未引用的图片；不要放私人文件。
- SFTP 使用逐文件替换，整站不是原子切换；断网可能导致回滚不完整。

## 版本说明规则

`v0.1` 对应标签 `v0.1.0`。每个中版本（如 `v0.2.0`、`v0.3.0`）完整介绍当时的功能；补丁版本（如 `v0.1.1`）只介绍新增、调整、修复和已知问题。发布说明提供中文和英文独立文档与切换链接。

## 源码与致谢

开发与打包步骤见 [构建说明](docs/BUILD.md)。

`desktop/` 为 Electron 主进程及发布模块，`fuwari-main/` 为分发包的干净模板源码。初始两个标签由各自现存分发包提取运行源码，排除依赖、个人博客、凭据和缓存；不伪造此前开发提交历史。

基于 [Fuwari](https://github.com/saicaca/fuwari)、[Astro](https://astro.build/)、[Electron](https://www.electronjs.org/)、[ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client) 和 [Lucide](https://lucide.dev/)。原始许可保留在模板及发布包中，Fuwari 许可另见 [LICENSE-FUWARI](LICENSE-FUWARI)。
