const http=require('http'),fs=require('fs'),path=require('path');
const types={'.js':'text/javascript','.html':'text/html','.png':'image/png'};
http.createServer((q,r)=>{const p=path.join(__dirname,decodeURIComponent(q.url.split('?')[0]));fs.readFile(p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.setHeader('Content-Type',types[path.extname(p)]||'application/octet-stream');r.end(d);});}).listen(4321,()=>console.log('up'));
