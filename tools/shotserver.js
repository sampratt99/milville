/* Tiny receiver for canvas captures: POST /shot?name=foo with a data-URL body -> shots/foo.png */
const http=require('http'),fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'..','shots');
http.createServer((req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS'){res.end();return;}
  if(req.method!=='POST'){res.statusCode=404;res.end('nope');return;}
  const u=new URL(req.url,'http://x');const name=(u.searchParams.get('name')||'shot').replace(/[^a-z0-9_-]/gi,'_');
  let body='';req.on('data',c=>body+=c);req.on('end',()=>{
    const jpg=/^data:image\/jpeg/.test(body);
    const b64=body.replace(/^data:image\/(png|jpeg);base64,/,'');
    const sub=u.searchParams.get('dir');const d=sub?path.join(dir,sub.replace(/[^a-z0-9_-]/gi,'_')):dir;if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true});
    fs.writeFileSync(path.join(d,name+(jpg?'.jpg':'.png')),Buffer.from(b64,'base64'));
    res.end(JSON.stringify({ok:true,bytes:b64.length}));
  });
}).listen(8788,'127.0.0.1',()=>console.log('shot server on 8788'));
