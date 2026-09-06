const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {publish,validate,safeRelative}=require('./deploy.cjs');
const config={host:'127.0.0.1',port:22,username:'blog',authType:'password',password:'test-only',remoteRoot:'/var/www/my-blog',siteUrl:'https://blog.example.com/',fingerprint:'SHA256:'+'a'.repeat(43)};
class FakeSftp{
  constructor(failAt){this.tree=new Map([['/var/www/my-blog',null],['/var/www/my-blog/index.html',Buffer.from('old home')],['/var/www/my-blog/old.html',Buffer.from('old article')],['/var/www/my-blog/unmanaged.txt',Buffer.from('leave alone')],['/var/www/my-blog/.fuwari-studio-manifest.json',Buffer.from(JSON.stringify({version:1,files:['index.html','old.html']}))]]);this.failAt=failAt;this.failed=false;}
  async exists(p){return this.tree.has(p)?this.tree.get(p)===null?'d':'-':false;}
  async lstat(p){if(!this.tree.has(p))throw new Error('missing');return {isDirectory:this.tree.get(p)===null,isFile:this.tree.get(p)!==null,isSymbolicLink:false};}
  async mkdir(p){this.tree.set(p,null);}
  async get(p){return this.tree.get(p);}
  async put(source,p){this.tree.set(p,Buffer.isBuffer(source)?source:await fs.readFile(source));}
  async rcopy(a,b){if(this.tree.has(b))throw new Error('destination exists');this.tree.set(b,Buffer.from(this.tree.get(a)));}
  async posixRename(a,b){if(b===this.failAt&&!this.failed){this.failed=true;throw new Error('simulated write failure');}this.tree.set(b,this.tree.get(a));this.tree.delete(a);}
  async rename(a,b){if(this.tree.has(b))throw new Error('exists');return this.posixRename(a,b);}
  async delete(p){this.tree.delete(p);}
  async end(){}
}
async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'fuwari-deploy-test-'));try{await fs.writeFile(path.join(dir,'index.html'),'new home');await fs.writeFile(path.join(dir,'asset.css'),'new style');await fn(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}}
test('target validation rejects unsafe directories and non-root URLs',()=>{for(const remoteRoot of ['/','/var/www','/var/www/../etc'])assert.throws(()=>validate({...config,remoteRoot}));assert.throws(()=>validate({...config,siteUrl:'https://example.com/sub/'}));assert.equal(safeRelative('../escape'),false);assert.equal(safeRelative('posts/hello/index.html'),true);});
test('publishes new files, removes only previously managed stale files and retains backup',()=>fixture(async directory=>{const client=new FakeSftp();await publish(config,directory,async()=>({client}));assert.equal(client.tree.get(config.remoteRoot+'/index.html').toString(),'new home');assert.equal(client.tree.has(config.remoteRoot+'/old.html'),false);assert.equal(client.tree.get(config.remoteRoot+'/unmanaged.txt').toString(),'leave alone');assert.ok([...client.tree.keys()].some(key=>key.includes('.studio-backups/')&&key.endsWith('/index.html')));}));
test('upload failure restores original files and removes newly created assets',()=>fixture(async directory=>{const client=new FakeSftp(config.remoteRoot+'/index.html');await assert.rejects(publish(config,directory,async()=>({client})),/回退/);assert.equal(client.tree.get(config.remoteRoot+'/index.html').toString(),'old home');assert.equal(client.tree.has(config.remoteRoot+'/asset.css'),false);assert.equal(client.tree.get(config.remoteRoot+'/old.html').toString(),'old article');}));
test('changed fingerprint stops before remote operations',()=>fixture(async directory=>{await assert.rejects(publish(config,directory,async()=>({needsTrust:true})),/指纹发生变化/);}));
