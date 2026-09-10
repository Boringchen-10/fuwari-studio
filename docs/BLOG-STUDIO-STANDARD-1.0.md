# Blog Studio Standard 1.0

Blog Studio Standard 1.0 使用网站根目录的 `blog-studio.json` 描述客户端可以安全使用的项目能力。v0.2.0 只完整支持 `fuwari` 基座。

## 字段

- `standardVersion`：协议版本，当前固定为 `1.0`。
- `base`：基座标识和适配版本，当前 `id` 只允许 `fuwari`。
- `runtime`：框架和主题标识，当前为 `astro` 与 `fuwari`。
- `paths`：设置、内容、资源、公开文件和独立页面的项目内相对路径。
- `sections`：客户端可以展示的受控页面区块。
- `commands`：预览和构建能力 ID。
- `output.directory`：网站发布包的项目内相对目录。

## 安全规则

描述文件不能包含或执行 shell 命令。v0.2.0 只接受 `fuwari.preview` 和 `fuwari.build`，由 Blog Studio 内置适配器转换为固定参数的 Node 子进程。所有路径必须是网站目录内的相对路径，不允许绝对路径、空路径、`.` 或 `..` 路径段；上传资源目录还必须位于公开资源目录内。

客户端在修改旧项目以补充描述文件前，先于 `.local-admin/recovery-points` 创建恢复点。已有项目目录结构保持不变。

## 扩展边界

未来接入第二个主题时，应增加新的基座适配器及对应的受控能力 ID，再扩展协议校验白名单。项目文件不能通过描述文件向客户端注入任意命令。
