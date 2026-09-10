import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePost,serializePost,safeSlug,safeUrl,validDate,validateSettings} from './lib.mjs';
import fs from 'node:fs';

test('Markdown round trip preserves dates, unknown metadata and special characters',()=>{
  const original='---\ntitle: Before\npublished: 2026-09-06\ncustom: keep-me\n---\nOld body';
  const input={title:'中文: "标题"',published:'2026-09-06',description:'line one\nline two',tags:['日常'],category:'日常',draft:true,image:'./cover.jpg',body:'# 标题\n\n正文'};
  const text=serializePost(input,original);const parsed=parsePost(text,'test');
  assert.equal(parsed.title,input.title);assert.equal(parsed.published,input.published);assert.equal(parsed.draft,true);assert.match(text,/custom: keep-me/);assert.match(parsed.body,/正文/);
});
test('rejects traversal, executable URLs and invalid dates',()=>{
  for(const slug of ['../test','/test','a/../../b','a\\b','a//b'])assert.throws(()=>safeSlug(slug));
  for(const url of ['javascript:alert(1)','//example.com','/\\example.com','data:text/html,test'])assert.throws(()=>safeUrl(url));
  assert.throws(()=>validDate('2026-02-30'));assert.equal(safeSlug('hello-world'),'hello-world');assert.equal(safeUrl('/about/'),'/about/');
});
test('settings reject invalid image paths and unbounded hue',()=>{
  const settings=JSON.parse(fs.readFileSync(new URL('../../fuwari-main/src/site-settings.json',import.meta.url),'utf8'));
  assert.equal(validateSettings(settings).title,settings.title);
  assert.throws(()=>validateSettings({...settings,avatar:'../../private.png'}));
  assert.throws(()=>validateSettings({...settings,hue:999}));
});
