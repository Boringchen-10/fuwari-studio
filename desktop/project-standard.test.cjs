const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const standard = require('./project-standard.cjs');
const adapters = require('./adapters/index.cjs');

async function fixture(task) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-studio-standard-'));
  try {
    for (const item of ['src/content/posts', 'src/content/spec', 'public']) await fs.mkdir(path.join(root, item), {recursive: true});
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({dependencies: {astro: '5.13.10'}}));
    for (const file of ['astro.config.mjs', 'src/config.ts', 'src/site-settings.json', 'src/content/spec/about.md', 'src/content/spec/friends.md']) await fs.writeFile(path.join(root, file), '{}');
    return await task(root);
  } finally { await fs.rm(root, {recursive: true, force: true}); }
}

test('validates only controlled Fuwari capabilities and confined paths', () => {
  assert.equal(standard.validateDescriptor(standard.DEFAULT_DESCRIPTOR).commands.preview, 'fuwari.preview');
  assert.throws(() => standard.validateDescriptor({...standard.DEFAULT_DESCRIPTOR, commands: {preview: 'cmd /c calc', build: 'fuwari.build'}}), /不受当前版本支持/);
  const unsafe = JSON.parse(JSON.stringify(standard.DEFAULT_DESCRIPTOR));
  unsafe.paths.content = '../outside';
  assert.throws(() => standard.validateDescriptor(unsafe), /不安全/);
  const privateAssets = JSON.parse(JSON.stringify(standard.DEFAULT_DESCRIPTOR));
  privateAssets.paths.assets = 'src/private-assets';
  assert.throws(() => standard.resolveProjectPaths(process.cwd(), privateAssets), /公开资源目录内/);
});

test('registers Fuwari as the only official base and resolves mapped paths inside the site', () => fixture(async root => {
  assert.deepEqual(adapters.listAdapters().map(adapter => adapter.id), ['fuwari']);
  assert.throws(() => adapters.getAdapter('unknown'), /还不支持/);
  const paths = standard.resolveProjectPaths(root, standard.DEFAULT_DESCRIPTOR);
  assert.equal(paths.content, path.join(root, 'src/content/posts'));
  assert.equal(paths.pages.about, path.join(root, 'src/content/spec/about.md'));
  assert.equal(paths.output, path.join(root, '.local-admin/releases'));
  for (const target of [paths.settings, paths.content, paths.assets, paths.public, paths.pages.about, paths.pages.friends, paths.output]) {
    assert.ok(target.startsWith(root + path.sep));
  }
}));

test('recognizes a legacy Fuwari site, creates a recovery point, and adds the standard once', () => fixture(async root => {
  const settingsFile = path.join(root, 'src/site-settings.json');
  await fs.writeFile(settingsFile, '{"title":"原网站"}');
  const before = await standard.inspectProject(root);
  assert.equal(before.canAdapt, true);
  assert.equal(before.standard, false);
  const result = await standard.ensureStandardProject(root);
  assert.equal(result.migrated, true);
  assert.equal((await standard.inspectProject(root)).standard, true);
  assert.equal(JSON.parse(await fs.readFile(path.join(result.recoveryPoint, 'recovery.json'))).records[0].present, false);
  assert.equal(await fs.readFile(settingsFile, 'utf8'), '{"title":"原网站"}');
  assert.equal((await standard.ensureStandardProject(root)).migrated, false);
}));

test('reports missing files without modifying unsupported projects', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blog-studio-unsupported-'));
  try {
    const report = await standard.inspectProject(root);
    assert.equal(report.canAdapt, false);
    assert.ok(report.missing.includes('src/site-settings.json'));
    assert.equal(await fs.readdir(root).then(items => items.length), 0);
  } finally { await fs.rm(root, {recursive: true, force: true}); }
});
