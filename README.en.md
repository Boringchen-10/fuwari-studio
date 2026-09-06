# Fuwari Studio

[简体中文](README.md) | **English**

A Windows desktop editor for Fuwari blogs. Write locally, customize your site, preview the actual website, and publish to your server. This is an independent project, not an official Fuwari application.

## Download and Start

Download the Windows x64 archive from [Releases](https://github.com/Boringchen-10/fuwari-studio/releases), extract the entire folder, and run `Fuwari Studio.exe`. Supports Windows 10/11 x64. Electron, Node 22, and template dependencies are bundled; users do not need to install Node or Git. First launch may take several minutes and requires several GB of free space.

## v0.1 Features

- Markdown posts, drafts, categories, tags, and cover images.
- Local autosave and live Fuwari preview with desktop and mobile viewport options.
- Avatar, profile, banner, theme color, navigation, About page, and friend links.
- Create blogs, open compatible projects, and restore deleted posts from the recycle bin.
- Build static output and release packages; draft pages are excluded from production.
- SFTP/SSH publishing with password or private key authentication and host fingerprint confirmation.
- Windows encryption for saved credentials; remote backups of replaced SFTP files and attempted recovery on failure.

Edit your blog, configure a connection, then choose Build and Publish. Configure Nginx/Apache and a dedicated website directory yourself; the app does not install a web server.

## Projects and Backups

The default project is `Fuwari Studio Data/Projects/MyBlog` beside the application. Local saves retain previous file contents in `.local-admin/history`; there is no one-click history restoration UI yet. Back up the complete project separately. Distribute the original release archive, not your personal `Fuwari Studio Data` folder.

## Limitations

- Windows x64 and Fuwari projects adapted with `src/site-settings.json` only; not a general-purpose CMS.
- The application UI is currently Chinese. Documentation language links do not imply an English UI.
- No bidirectional sync, cloud source backup, automatic updates, or code signing.
- All files under `public`, including unused uploads, become public. Keep private files elsewhere.
- SFTP replaces individual files rather than switching the whole site atomically. Network loss can prevent complete recovery.
- Concurrent preview processes have been observed to cause Astro cache write conflicts. Save and close extra instances, then restart if needed. A dedicated fix has not been released.

## Release Documentation

The initial v0.1 release uses tag `v0.1.0`. Minor releases such as `v0.2.0` and `v0.3.0` provide a complete feature overview. Patch releases such as `v0.1.1` describe only additions, changes, fixes, and known issues. Release notes have separate Chinese and English documents with language links.

## Source and Credits

`desktop/` contains the Electron application and deployment modules. `fuwari-main/` contains the clean distribution template. The first two tags recover runtime source from their existing distributions, excluding dependencies, personal content, credentials, and caches; they do not reconstruct earlier development history.

Built on [Fuwari](https://github.com/saicaca/fuwari), [Astro](https://astro.build/), [Electron](https://www.electronjs.org/), [ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client), and [Lucide](https://lucide.dev/). Original licenses remain in the template and distribution; see also [LICENSE-FUWARI](LICENSE-FUWARI).
