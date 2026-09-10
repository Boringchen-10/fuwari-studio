# Blog Studio

[简体中文](README.md) | **English**

A Windows personal website workspace for non-technical users. Create, edit, preview, and publish locally without requiring Node.js, Git, or a terminal. Fuwari is the first official base; Blog Studio remains an independent project.

## Download and Start

Download the Windows x64 archive from [Releases](https://github.com/Boringchen-10/fuwari-studio/releases), extract the entire folder, and run `Blog Studio v0.2.0.exe`. Supports Windows 10/11 x64. Electron, Node 22, and template dependencies are bundled; users do not need to install Node or Git. First launch may take several minutes and requires several GB of free space.

## v0.2 Features

Current version: **v0.2.0**, introducing the personal website workspace and Blog Studio Standard 1.0. [Full release notes](docs/releases/v0.2.0.en.md) · [Standard specification](docs/BLOG-STUDIO-STANDARD-1.0.md).

- A first screen for creating a site or inspecting and importing an existing one.
- Seven primary pages: Overview, Content, Appearance, Publish, History, Site management, and Software settings.
- Markdown posts, drafts, categories, tags, standalone pages, and cover images.
- Local autosave and live Fuwari preview with desktop and mobile viewport options.
- Avatar, profile, banner, theme color, navigation, About page, and friend links.
- Create sites, import supported Fuwari projects, switch sites, and restore deleted posts from the recycle bin.
- Build static output and release packages; draft pages are excluded from production.
- Keep a timestamped release package and editable source snapshot for every build, and create a new project copy from a snapshot.
- Save multiple named SFTP/SSH servers with password or private key authentication and host fingerprint confirmation.
- Select one or several SFTP servers and GitHub Pages for each publish operation.
- Windows encryption for saved credentials; remote backups of replaced SFTP files and attempted recovery on failure.

Create a site, enter basic details, then edit with a real preview. Add a publishing location only when you are ready to go online. Configure Nginx/Apache and a dedicated website directory yourself; the app does not install a web server.

## Sites, Versions, and Data

Application settings, recent sites, and encrypted credentials are stored under `%APPDATA%\Blog Studio`; new sites are created in its `Projects` directory. Upgrading from v0.1.3 preserves the original site path, settings, history, and connections. Blog Studio creates a recovery point before adding `blog-studio.json` to a legacy Fuwari site.

Each site stores timestamped editable snapshots in `.local-admin/versions` and matching output packages in `.local-admin/releases`. Site management switches between sites, while History can create an independent project copy from an editable snapshot. Older static-only packages are clearly labeled as output-only. Continue to back up complete project directories regularly.

## Limitations

- v0.2.0 supports Windows x64 and the fully adapted Fuwari base only. It does not claim support for arbitrary Astro projects.
- The application UI is currently Chinese. Documentation language links do not imply an English UI.
- No reverse synchronization from a live website, cloud source backup, automatic updates, or code signing.
- All files under `public`, including unused uploads, become public. Keep private files elsewhere.
- SFTP replaces individual files rather than switching the whole site atomically. Network loss can prevent complete recovery.

## Release Documentation

The initial v0.1 release uses tag `v0.1.0`. Minor releases such as `v0.2.0` and `v0.3.0` provide a complete feature overview. Patch releases such as `v0.1.1` describe only additions, changes, fixes, and known issues. Release notes have separate Chinese and English documents with language links.

## Source and Credits

See [build instructions](docs/BUILD.md) for development and packaging.

`desktop/` contains the Electron application and deployment modules. `fuwari-main/` contains the clean distribution template. The first two tags recover runtime source from their existing distributions, excluding dependencies, personal content, credentials, and caches; they do not reconstruct earlier development history.

Built on [Fuwari](https://github.com/saicaca/fuwari), [Astro](https://astro.build/), [Electron](https://www.electronjs.org/), [ssh2-sftp-client](https://github.com/theophilusx/ssh2-sftp-client), and [Lucide](https://lucide.dev/). Original licenses remain in the template and distribution; see also [LICENSE-FUWARI](LICENSE-FUWARI).
