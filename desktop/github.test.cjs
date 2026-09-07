const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const github=require('./github.cjs');
const config={owner:'alice',repo:'alice.github.io',token:'secret'};
test('validates homepage repository and derives URL',()=>{assert.equal(github.validate(config).siteUrl,'https://alice.github.io/');assert.throws(()=>github.validate({...config,repo:'other'}));assert.throws(()=>github.validate({...config,token:''}));});
test('publishes a complete output tree without force-pushing or uploading source',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'github-publish-'));const requests=[];
 const fetcher=async(url,options)=>{const route=new URL(url).pathname;const body=options.body&&JSON.parse(options.body);requests.push({route,method:options.method,body});let status=200,data={};
 if(route.endsWith('/alice.github.io'))data={permissions:{push:true},default_branch:'main'};
 else if(route.endsWith('/git/ref/heads/main'))data={object:{sha:'main'}};
 else if(route.endsWith('/git/ref/heads/fuwari-pages'))data={object:{sha:'old'}};
 else if(route.endsWith('/pages')&&options.method==='GET')data={build_type:'legacy',source:{branch:'fuwari-pages',path:'/'}};
 else if(route.endsWith('/git/commits/old'))data={tree:{sha:'tree'}};
 else if(route.endsWith('/git/trees/tree'))data={tree:[]};
 else if(route.endsWith('/git/blobs'))data={sha:github.blobSha(Buffer.from(body.content,'base64'))};
 else if(route.endsWith('/git/trees'))data={sha:'newtree'};
 else if(route.endsWith('/git/commits'))data={sha:'newcommit'};
 return {ok:true,status,json:async()=>data};};
 try{await fs.writeFile(path.join(dir,'index.html'),'Hello');const result=await github.publish(config,dir,fetcher);assert.equal(result.pending,true);assert.equal(result.commit,'newcommit');const tree=requests.find(r=>r.method==='POST'&&r.route.endsWith('/git/trees'));assert.deepEqual(tree.body.tree.map(e=>e.path),['index.html','.nojekyll']);assert.equal(tree.body.base_tree,undefined);assert.equal(requests.find(r=>r.method==='PATCH').body.force,false);assert.ok(requests.some(r=>r.route.endsWith('/pages/builds')));}finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('authentication errors never echo the token',async()=>{await assert.rejects(github.test(config,async()=>({ok:false,status:401,json:async()=>({message:'secret'})})),error=>!error.message.includes('secret')&&error.message.includes('401'));});
test('status does not mistake an older deployment for the current commit',async()=>{const result=await github.status(config,'new',async()=>({ok:true,status:200,json:async()=>({status:'built',commit:'old'})}));assert.equal(result.current,false);assert.equal(result.status,'built');});
test('rejects private repositories before any writes',async()=>{const methods=[];await assert.rejects(github.test(config,async(_url,options)=>{methods.push(options.method);return {ok:true,status:200,json:async()=>({private:true})};}),/公开/);assert.deepEqual(methods,['GET']);});
