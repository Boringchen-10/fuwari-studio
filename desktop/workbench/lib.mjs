import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
const projectRequire = createRequire(path.join(process.env.BLOG_PROJECT_ROOT || process.cwd(), 'package.json'));
const matter = projectRequire('gray-matter');

export const revision = text => createHash('sha256').update(text).digest('hex');
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function safeSlug(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9/_-]{0,160}$/.test(slug) || slug.includes('//') || slug.endsWith('/')) fail('文章地址只能包含小写字母、数字、短横线和下划线');
  return slug;
}
export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('日期格式不正确');
  return new Date(`${value}T00:00:00.000Z`);
}
export function safeUrl(value, allowEmpty = false) {
  if (allowEmpty && value === '') return value;
  if (typeof value !== 'string' || /[\u0000-\u0020\\]/.test(value)) fail('链接格式不正确');
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try { if (['https:', 'http:', 'mailto:'].includes(new URL(value).protocol)) return value; } catch {}
  fail('链接需要以 /、https://、http:// 或 mailto: 开头');
}
export function imagePath(value) {
  if (typeof value !== 'string' || value.length > 500 || value.includes('..') || value.includes('\\')) fail('图片路径不正确');
  if (value === '' || /^\.\/[\w./-]+$/.test(value) || /^assets\/images\/[\w./-]+$/.test(value) || /^\/uploads\/[\w.-]+$/.test(value)) return value;
  if (/^https?:\/\//.test(value)) return safeUrl(value);
  fail('请选择本地图片或填写 HTTPS 图片地址');
}
const shortText = (value, max = 300) => {
  if (typeof value !== 'string' || value.length > max) fail('文字内容过长或格式不正确');
  return value;
};
export function validateSettings(input) {
  const out = {};
  for (const key of ['title', 'subtitle', 'name', 'bio', 'creditText']) out[key] = shortText(input[key]);
  if (!out.title.trim() || !out.name.trim()) fail('站名和昵称不能为空');
  out.avatar = imagePath(input.avatar); out.banner = imagePath(input.banner);
  out.hue = Number(input.hue);
  if (!Number.isInteger(out.hue) || out.hue < 0 || out.hue > 360) fail('主题色应在 0 到 360 之间');
  for (const key of ['bannerEnabled', 'tocEnabled']) { if (typeof input[key] !== 'boolean') fail('设置格式不正确'); out[key] = input[key]; }
  if (out.bannerEnabled && !out.banner) fail('开启横幅时需要选择封面');
  out.creditUrl = safeUrl(input.creditUrl, true);
  for (const key of ['navigation', 'links']) {
    if (!Array.isArray(input[key]) || input[key].length > 12) fail('链接最多设置 12 个');
    out[key] = input[key].map(link => {
      const result = {name: shortText(link.name, 50), url: safeUrl(link.url)};
      if (!result.name.trim()) fail('链接名称不能为空');
      if (key === 'navigation') result.external = Boolean(link.external);
      else { if (!['fa6-solid:user','fa6-solid:rss','fa6-solid:link','fa6-solid:envelope','fa6-brands:github','fa6-brands:bilibili'].includes(link.icon)) fail('不支持的图标'); result.icon = link.icon; }
      return result;
    });
  }
  return out;
}
export function parsePost(text, slug) {
  const parsed = matter(text);
  const date = parsed.data.published instanceof Date ? parsed.data.published : new Date(parsed.data.published);
  return {slug, revision: revision(text), title: parsed.data.title || '', published: Number.isFinite(+date) ? date.toISOString().slice(0,10) : '', description: parsed.data.description || '', category: parsed.data.category || '', tags: parsed.data.tags || [], image: parsed.data.image || '', draft: Boolean(parsed.data.draft), body: parsed.content.trimStart()};
}
export function serializePost(input, original = '') {
  const data = original ? matter(original).data : {};
  data.title = shortText(input.title, 200).trim();
  if (!data.title) fail('文章标题不能为空');
  data.published = validDate(input.published);
  data.description = shortText(input.description, 1000);
  data.category = shortText(input.category, 60);
  if (!Array.isArray(input.tags) || input.tags.length > 20) fail('标签最多添加 20 个');
  data.tags = [...new Set(input.tags.map(tag => shortText(tag, 60).trim()).filter(Boolean))];
  data.image = imagePath(input.image);
  if (typeof input.draft !== 'boolean') fail('草稿状态不正确');
  data.draft = input.draft;
  data.lang ||= 'zh_CN';
  return matter.stringify(shortText(input.body, 500000), data);
}
export async function atomicWrite(file, text, historyDir) {
  await fs.mkdir(path.dirname(file), {recursive:true});
  if (historyDir) {
    try {
      const old = await fs.readFile(file);
      await fs.mkdir(historyDir, {recursive:true});
      await fs.writeFile(path.join(historyDir, `${Date.now()}-${randomUUID()}.bak`), old);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, text, 'utf8');
  try { await fs.rename(temp, file); } catch (error) { await fs.rm(temp, {force:true}); throw error; }
}
export async function listMarkdown(root, prefix = '') {
  const result = [];
  for (const item of await fs.readdir(root, {withFileTypes:true})) {
    if (item.isSymbolicLink()) continue;
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) result.push(...await listMarkdown(path.join(root, item.name), relative));
    else if (item.name.endsWith('.md')) result.push(relative);
  }
  return result;
}
