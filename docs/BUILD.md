# Build / 构建

## 中文

以下步骤用于当前 v0.1.1 源码，建议使用 Windows x64、Node 22 和 pnpm 9.14.4。

1. 在 `fuwari-main` 执行 `pnpm install --frozen-lockfile`。
2. 在 `desktop` 执行 `npm ci`。
3. 将环境变量 `STUDIO_NODE_PATH` 设置为本机 Node 22 的 `node.exe` 完整路径。
4. 在 `desktop` 执行 `npm run package`。打包脚本使用 Electron 40.10.6；首次需要联网下载。
5. 执行 `powershell -File archive.ps1`，生成 `release-v011` 下的可分发 ZIP 和 SHA256 文件。

打包过程中会准备 `desktop/staging-compact`，随后可在 `desktop` 执行 `npm start` 调试桌面程序。仅调试网页管理端时，在 `fuwari-main` 执行 `node admin/server.mjs`；服务器凭据与发布功能需要桌面进程。

在 `desktop` 执行 `node --test deploy.test.cjs github.test.cjs ssh.test.cjs` 验证发布模块。SSH 测试使用本地测试服务器。v0.1.0 标签是分发运行源码快照，不包含当时未存档的完整打包工具；需要使用该版本时优先下载对应 Release。

## English

For current v0.1.1 source, use Windows x64, Node 22, and pnpm 9.14.4.

1. Run `pnpm install --frozen-lockfile` in `fuwari-main`.
2. Run `npm ci` in `desktop`.
3. Set `STUDIO_NODE_PATH` to the absolute path of your Node 22 `node.exe`.
4. Run `npm run package` in `desktop`. Packaging uses Electron 40.10.6 and may download it on first use.
5. Run `powershell -File archive.ps1` to generate a distributable ZIP and SHA256 file under `release-v011`.

Packaging prepares `desktop/staging-compact`; you can then run `npm start` in `desktop` for desktop development. To inspect only the web management UI, run `node admin/server.mjs` in `fuwari-main`. Credential and deployment features require the desktop process.

Run `node --test deploy.test.cjs github.test.cjs ssh.test.cjs` in `desktop` to check deployment modules. SSH tests use a local test server. The v0.1.0 tag is a distributed runtime source snapshot, without the original unarchived packaging tooling; use its Release archive to run that version.
