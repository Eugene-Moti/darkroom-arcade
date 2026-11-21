// One-off: vectorises the D + A emblem from public/logo.jpeg into SVG paths.
// Run: node scripts/trace-logo.mjs && node scripts/generate-icons.mjs
import sharp from 'sharp';
import potrace from 'potrace';
import { promisify } from 'node:util';
import fs from 'node:fs';
const trace = promisify(potrace.trace);
const L=163,T=153,W=345,H=327, S=1024;
// upscale emblem to a square SxS canvas (stretches the slight ellipse to a true circle)
const up = await sharp('public/logo.jpeg').extract({left:L,top:T,width:W,height:H}).resize(S,S,{fit:'fill',kernel:'lanczos3'}).raw().toBuffer({resolveWithObject:true});
const {data,info}=up; const c=info.channels;
const yellow=Buffer.alloc(S*S*3,255), white=Buffer.alloc(S*S*3,255);
const R=S/2;
for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=(y*S+x)*c;const r=data[i],g=data[i+1],b=data[i+2];
 const inside=((x-R+.5)**2+(y-R+.5)**2) < (R-6)**2;
 const o=(y*S+x)*3;
 if(r>150&&g>150&&b<110){yellow[o]=yellow[o+1]=yellow[o+2]=0;}
 if(inside && r>170&&g>170&&b>150){white[o]=white[o+1]=white[o+2]=0;}
}
const toPng = buf => sharp(buf,{raw:{width:S,height:S,channels:3}}).png().toBuffer();
const opts={turdSize:40, optTolerance:0.4, alphaMax:1, threshold:128};
const ySvg = await trace(await toPng(yellow),opts);
const wSvg = await trace(await toPng(white),opts);
const d = s => s.match(/ d="([^"]+)"/)[1];
fs.writeFileSync('scripts/.logo-paths.json', JSON.stringify({yellow:d(ySvg), white:d(wSvg)}));
console.log('yellow len', d(ySvg).length, 'white len', d(wSvg).length);
