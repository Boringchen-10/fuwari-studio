const test=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,createHash}=require('node:crypto');
const {Server,utils}=require('ssh2');
const {STATUS_CODE}=utils.sftp;
const deployment=require('./deploy.cjs');
test('real localhost SSH verifies host identity before password authentication',async()=>{
  const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
  const fingerprint='SHA256:'+createHash('sha256').update(utils.parseKey(privateKey).getPublicSSH()).digest('base64').replace(/=+$/,'');
  let authentications=0;
  const server=new Server({hostKeys:[privateKey]},client=>{
    client.on('error',()=>{});
    client.on('authentication',ctx=>{authentications++;if(ctx.method==='password'&&ctx.username==='test'&&ctx.password==='local-test')ctx.accept();else ctx.reject(['password']);});
    client.on('ready',()=>client.on('session',accept=>accept().on('sftp',acceptSftp=>{
      const stream=acceptSftp();
      for(const action of ['LSTAT','STAT'])stream.on(action,(id)=>stream.attrs(id,{mode:0o40755,uid:1,gid:1,size:0,atime:0,mtime:0}));
      stream.on('OPENDIR',id=>stream.handle(id,Buffer.from('dir')));
      stream.on('READDIR',id=>stream.status(id,STATUS_CODE.EOF));
      stream.on('CLOSE',id=>stream.status(id,STATUS_CODE.OK));
    })));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const config={host:'127.0.0.1',port:server.address().port,username:'test',password:'local-test',authType:'password',siteUrl:'https://example.com/',remoteRoot:'/var/www/test-blog'};
  try{
    const unknown=await deployment.test(config);
    assert.equal(unknown.needsTrust,true);assert.equal(unknown.fingerprint,fingerprint);assert.equal(authentications,0);
    const connected=await deployment.test({...config,fingerprint});
    assert.equal(connected.ok,true);assert.ok(authentications>0);
    const count=authentications;
    assert.equal((await deployment.test({...config,fingerprint:'SHA256:'+'x'.repeat(43)})).needsTrust,true);
    assert.equal(authentications,count);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
