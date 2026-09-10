const path = require('node:path');

const id = 'fuwari';
const displayName = 'Fuwari';
const capabilities = new Set(['fuwari.preview', 'fuwari.build']);
const requiredFiles = [
  'package.json',
  'astro.config.mjs',
  'src/config.ts',
  'src/site-settings.json',
  'src/content/posts',
  'src/content/spec/about.md',
  'src/content/spec/friends.md',
  'public',
];
const descriptor = Object.freeze({
  standardVersion: '1.0',
  base: {id, version: '1.0'},
  runtime: {framework: 'astro', theme: 'fuwari'},
  paths: {
    settings: 'src/site-settings.json',
    content: 'src/content/posts',
    assets: 'public/uploads',
    public: 'public',
    pages: {about: 'src/content/spec/about.md', friends: 'src/content/spec/friends.md'},
  },
  sections: [
    {id: 'posts', type: 'collection', label: '文章'},
    {id: 'about', type: 'page', label: '关于'},
    {id: 'friends', type: 'page', label: '友情链接'},
  ],
  commands: {preview: 'fuwari.preview', build: 'fuwari.build'},
  output: {directory: '.local-admin/releases'},
});

function validateRuntime(runtime) {
  return runtime?.framework === 'astro' && runtime?.theme === 'fuwari';
}

function previewArgs(root, port) {
  return [path.join(root, 'node_modules/astro/astro.js'), 'dev', '--host', '127.0.0.1', '--port', String(port)];
}

function buildSteps(root, output) {
  return [
    [path.join(root, 'node_modules/astro/astro.js'), 'build', '--outDir', output],
    [path.join(root, 'node_modules/pagefind/lib/runner/bin.cjs'), '--site', output],
  ];
}

module.exports = {id, displayName, capabilities, requiredFiles, descriptor, validateRuntime, previewArgs, buildSteps};
