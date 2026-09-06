# Fuwari Studio

**简体中文** | [English](README.en.md)

在本地写博客、调整外观并实时预览，再发布到自己的服务器。Fuwari Studio 是面向 Fuwari 模板的 Windows 桌面编辑器，非 Fuwari 官方项目。

## 下载与开始

在 [Releases](https://github.com/Boringchen-10/fuwari-studio/releases) 下载 Windows x64 压缩包，完整解压后运行 `Fuwari Studio.exe`。支持 Windows 10/11 x64，自带 Electron、Node 22 和模板依赖，无需另装 Node 或 Git。首次启动需要几分钟和数 GB 可用磁盘空间。

## v0.1 功能

- Markdown 文章编辑、草稿、分类、标签和封面图片。
- 本地自动保存，右侧预览真实 Fuwari 页面，支持桌面和手机预览尺寸。
- 编辑头像、个人资料、横幅、主题色、导航、关于页面和友情链接。
- 新建博客、打开兼容项目；删除的文章可从回收站恢复。
- 构建静态网站，正式页面排除草稿；生成发布包。
- 通过 SFTP/SSH 发布到自有服务器，支持密码或私钥认证、SSH 指纹确认。
- Windows 本机加密保存连接凭据；SFTP 发布保留被替换文件的远程备份，失败时尝试恢复。

首次使用先编辑博客，再配置连接，最后点击“构建并发布”。服务器需自行安装 Nginx/Apache 并配置专用网站目录，软件不负责安装 Web 服务。

## 项目与备份

默认项目在程序旁的 `Fuwari Studio Data/Projects/MyBlog`。本地内容保存时会在项目 `.local-admin/history` 保留旧文件，但目前没有一键版本恢复界面。请另行备份完整项目。分享软件时发送原始发布压缩包，不要包含自己的 `Fuwari Studio Data`。

## 限制

- 首版只支持 Windows x64 和已适配 `src/site-settings.json` 的 Fuwari 项目；不是通用 CMS。
- 界面目前为中文；本文档可选择中文或英文，不代表软件已提供英文界面。
- 不支持双向同步、云端源码备份、自动更新或代码签名。
- `public` 目录中的文件会公开发布，包括未引用的图片；不要放私人文件。
- SFTP 使用逐文件替换，整站不是原子切换；断网可能导致回滚不完整。
- 已观察到多个预览进程可能引发 Astro 缓存写入冲突。保存后关闭多余实例，必要时重启程序；尚未发布针对该问题的修复。

## 版本说明规则

`v0.1` 对应标签 `v0.1.0`。每个中版本（如 `v0.2.0`、`v0.3.0`）完整介绍当时的功能；补丁版本（如 `v0.1.1`）只介绍新增、调整、修复和已知问题。发布说明提供中文和英文独立文档与切换链接。

## 源码与致谢

`desktop/` 为 Electron 主进程及发布模块，`fuwari-main/` 为分发包的干净模板源码。初始两个标签由各自现存分发包提取运行源码，排除依赖、个人博客、凭据和缓存；不伪造此前开发提交历史。

基于 [Fuwari](https://github.com/saicaca/fuwari)、[Astro](https://astro.build/)、[Electron](https://www.electronjs.org/)、[ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client) 和 [Lucide](https://lucide.dev/)。原始许可保留在模板及发布包中，Fuwari 许可另见 [LICENSE-FUWARI](LICENSE-FUWARI)。
