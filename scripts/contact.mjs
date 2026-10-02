import sharp from 'sharp'; import fs from 'fs';
const dir='material-cliente/ig/'; const fl=fs.readdirSync(dir).filter(f=>f.endsWith('.jpg')&&f!=='precios.jpg');
const W=300,H=375,cols=5; const rows=Math.ceil(fl.length/cols);
const comps=[];for(let i=0;i<fl.length;i++){const b=await sharp(dir+fl[i]).resize(W,H,{fit:'cover'}).toBuffer();comps.push({input:b,left:(i%cols)*W,top:Math.floor(i/cols)*H});
const m=await sharp(dir+fl[i]).metadata();console.log(i,fl[i],m.width+'x'+m.height)}
await sharp({create:{width:W*cols,height:H*rows,channels:3,background:'#fff'}}).composite(comps).jpeg({quality:70}).toFile('material-cliente/hoja-contacto.jpg');
