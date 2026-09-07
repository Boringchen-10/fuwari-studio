# GitHub Pages 发布

1. 在 GitHub 创建公开仓库，名称必须为 `你的用户名.github.io`，勾选添加 README，完成初始化。
2. 创建 Fine-grained personal access token：Resource owner 选择自己，Repository access 仅选择上述仓库。Repository permissions 中授予 Contents: Read and write、Pages: Read and write；Metadata 保持默认读取。设置合理有效期。
3. 打开桌面程序的“服务器连接”，发布方式选择 GitHub Pages。填写用户名、仓库和令牌，测试并保存。令牌仅使用 Windows 加密保存，不会上传到仓库。
4. 在发布中心点击“构建并发布”，核对公开目标后确认。程序上传生产构建输出到专用 `fuwari-pages` 分支，并开启 GitHub Pages。主分支保持不变。
5. 提交完成不代表网站已上线。点击“检查上线状态”，确认本次部署成功后访问 `https://你的用户名.github.io/`。

首次使用应选择尚未开启 Pages 的仓库。已有 Pages 的仓库需设置为 Deploy from a branch、fuwari-pages、/(root)。目前不支持项目子路径仓库、自定义域名、私有仓库或 GitHub Enterprise。

生产构建排除草稿 Markdown，但 public 目录中的文件都会公开上传，包括未引用的上传图片；请勿把私人文件放入 public。此功能发布静态网站，不是 Markdown 源码备份。令牌过期后需要重新填写。网络失败时不会强制覆盖他人的分支更新，可检查提交记录后重试。
