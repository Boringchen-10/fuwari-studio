const fs = require('node:fs/promises');
const path = require('node:path');
const {getAdapter} = require('./adapters/index.cjs');

const STANDARD_FILE = 'blog-studio.json';
const STANDARD_VERSION = '1.0';
const DEFAULT_DESCRIPTOR = getAdapter('fuwari').descriptor;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeRelative(value, label) {
  if (typeof value !== 'string' || !value || value.length > 240 || path.isAbsolute(value)) {
    throw new Error(`${label}必须是网站内的相对路径`);
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`${label}包含不安全的路径`);
  }
  return normalized;
}

function validateDescriptor(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('项目描述文件格式不正确');
  if (input.standardVersion !== STANDARD_VERSION) throw new Error(`暂不支持 Blog Studio Standard ${input.standardVersion || '未知版本'}`);
  const adapter = getAdapter(input.base?.id);
  if (!adapter.validateRuntime(input.runtime)) throw new Error(`当前项目基座与 ${adapter.displayName} 不匹配`);
  const paths = input.paths || {};
  const checkedPaths = {
    settings: safeRelative(paths.settings, '设置文件'),
    content: safeRelative(paths.content, '内容目录'),
    assets: safeRelative(paths.assets, '资源目录'),
    public: safeRelative(paths.public, '公开资源目录'),
    pages: {
      about: safeRelative(paths.pages?.about, '关于页面'),
      friends: safeRelative(paths.pages?.friends, '友情链接页面'),
    },
  };
  const commands = input.commands || {};
  for (const key of ['preview', 'build']) {
    if (!adapter.capabilities.has(commands[key])) throw new Error(`${key === 'preview' ? '预览' : '构建'}能力不受当前版本支持`);
  }
  const output = {directory: safeRelative(input.output?.directory, '输出目录')};
  if (!Array.isArray(input.sections) || !input.sections.length || input.sections.length > 20) throw new Error('页面区块配置不正确');
  const sections = input.sections.map(section => {
    if (!section || !['posts', 'about', 'friends'].includes(section.id) || !['collection', 'page'].includes(section.type)) throw new Error('页面区块包含不受支持的能力');
    return {id: section.id, type: section.type, label: String(section.label || '').slice(0, 40)};
  });
  return {
    standardVersion: STANDARD_VERSION,
    base: {id: adapter.id, version: String(input.base.version || '1.0').slice(0, 40)},
    runtime: {framework: input.runtime.framework, theme: input.runtime.theme},
    paths: checkedPaths,
    sections,
    commands: {preview: commands.preview, build: commands.build},
    output,
  };
}

async function exists(target) {
  try { await fs.access(target); return true; } catch { return false; }
}

async function inspectProject(candidate) {
  const root = path.resolve(String(candidate || ''));
  const missing = [];
  let packageInfo = null;
  const adapter = getAdapter('fuwari');
  for (const relative of adapter.requiredFiles) {
    if (!await exists(path.join(root, relative))) missing.push(relative);
  }
  try { packageInfo = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')); } catch {}
  if (packageInfo && !packageInfo.dependencies?.astro) missing.push('package.json 中的 Astro 依赖');
  let descriptor = null;
  let descriptorError = '';
  try { descriptor = validateDescriptor(JSON.parse(await fs.readFile(path.join(root, STANDARD_FILE), 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') descriptorError = error.message; }
  const fuwari = missing.length === 0;
  return {
    path: root,
    recognized: fuwari,
    base: fuwari ? 'Fuwari' : '',
    standard: Boolean(descriptor),
    descriptor,
    descriptorError,
    missing: [...new Set(missing)],
    canAdapt: fuwari && !descriptorError,
    message: descriptor ? '已符合 Blog Studio Standard 1.0' : fuwari ? '识别为 Fuwari，可以自动适配' : '暂时无法识别为受支持的 Fuwari 网站',
  };
}

async function createRecoveryPoint(root, reason, files = [STANDARD_FILE]) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = path.join(root, '.local-admin', 'recovery-points', `${stamp}--${reason}`);
  await fs.mkdir(directory, {recursive: true});
  const records = [];
  for (const relative of files) {
    const source = path.join(root, relative);
    const present = await exists(source);
    records.push({path: relative.replaceAll('\\', '/'), present});
    if (present) {
      const destination = path.join(directory, 'files', relative);
      await fs.mkdir(path.dirname(destination), {recursive: true});
      await fs.cp(source, destination, {recursive: true});
    }
  }
  await fs.writeFile(path.join(directory, 'recovery.json'), JSON.stringify({createdAt: new Date().toISOString(), reason, records}, null, 2));
  return directory;
}

async function ensureStandardProject(candidate, options = {}) {
  const report = await inspectProject(candidate);
  if (!report.canAdapt) throw new Error(report.descriptorError || `无法自动适配：缺少 ${report.missing.join('、')}`);
  if (report.descriptor) return {...report, migrated: false, recoveryPoint: ''};
  const recoveryPoint = options.skipRecovery ? '' : await createRecoveryPoint(report.path, 'before-standard-1.0');
  const descriptor = clone(DEFAULT_DESCRIPTOR);
  await fs.writeFile(path.join(report.path, STANDARD_FILE), JSON.stringify(descriptor, null, 2) + '\n', {flag: 'wx'});
  return {...report, standard: true, descriptor, migrated: true, recoveryPoint};
}

function resolveProjectPaths(root, descriptor) {
  const checked = validateDescriptor(descriptor);
  const resolved = {root: path.resolve(root)};
  const resolve = relative => {
    const target = path.resolve(resolved.root, relative);
    if (target !== resolved.root && !target.startsWith(resolved.root + path.sep)) throw new Error('项目路径超出网站目录');
    return target;
  };
  resolved.settings = resolve(checked.paths.settings);
  resolved.content = resolve(checked.paths.content);
  resolved.assets = resolve(checked.paths.assets);
  resolved.public = resolve(checked.paths.public);
  resolved.pages = {about: resolve(checked.paths.pages.about), friends: resolve(checked.paths.pages.friends)};
  resolved.output = resolve(checked.output.directory);
  if (!resolved.assets.startsWith(resolved.public + path.sep)) throw new Error('资源目录必须位于公开资源目录内');
  return resolved;
}

module.exports = {
  STANDARD_FILE,
  STANDARD_VERSION,
  DEFAULT_DESCRIPTOR,
  validateDescriptor,
  inspectProject,
  createRecoveryPoint,
  ensureStandardProject,
  resolveProjectPaths,
};
