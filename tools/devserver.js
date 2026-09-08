/* Static dev server with caching disabled: every hd/*.js edit is picked up on plain reload. */
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.css':'text/css','.mid':'audio/midi','.svg':'image/svg+xml','.ico':'image/x-icon'};
const port=parseInt(process.argv[2]||'8787',10);
http.createServer((req,res)=>{
  let p=decodeURIComponent(new URL(req.url,'http://x').pathname);
  if(p.endsWith('/'))p+='index.html';
  const f=path.normalize(path.join(root,p));
  if(!f.startsWith(root)){res.statusCode=403;res.end();return;}
  fs.readFile(f,(err,data)=>{
    if(err){res.statusCode=404;res.end('not found');return;}
    res.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');
    res.setHeader('Cache-Control','no-store');
    res.end(data);
  });
}).listen(port,'127.0.0.1',()=>console.log('milville-hd dev server on',port));
