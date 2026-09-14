/* Detect ruled score tables before OCR, including wrapped mobile headers. */
(function(root){
function makeCanvas(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;}
function groups(values){const result=[];for(const v of values){const last=result[result.length-1];if(last&&v-last[last.length-1]<=2)last.push(v);else result.push([v]);}return result;}
function detect(img){
 const width=img.naturalWidth||img.width,height=img.naturalHeight||img.height,scale=Math.min(1,2200/width,4400/height),c=makeCanvas(width*scale,height*scale),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);const {data}=ctx.getImageData(0,0,c.width,c.height),w=c.width,h=c.height;
 const blue=(x,y)=>{const p=(y*w+x)*4;return data[p+2]>data[p]+35&&data[p+2]>data[p+1]+12&&data[p+1]>65;};
 const horizontal=[];for(let y=0;y<h;y++){let count=0;for(let x=0;x<w;x++)if(blue(x,y))count++;if(count>w*.68)horizontal.push({y,left:0,right:w-1,count});}
 const hg=groups(horizontal.map(l=>l.y));let bands=[];for(const g of hg){if(g.length>5){bands.push(horizontal.find(l=>l.y===g[0]),horizontal.find(l=>l.y===g[g.length-1]));}else bands.push(horizontal.find(l=>l.y===g[Math.floor(g.length/2)]));}
 // Filled mobile table headers form a tall blue band; keep both its borders.
 if(bands.length<4)return null;bands.sort((a,b)=>a.y-b.y);const top=bands[0].y,bottom=bands[bands.length-1].y,left=0,right=w-1;
 const vertical=[];for(let x=Math.max(0,left-2);x<=Math.min(w-1,right+2);x++){let count=0;for(let y=top;y<=bottom;y++)if(blue(x,y))count++;if(count/(bottom-top+1)>.68)vertical.push(x);}
 const xs=groups(vertical).filter(g=>g.length<8).map(g=>g[Math.floor(g.length/2)]).filter(x=>x>Math.max(0,w*.17)),ys=bands.map(b=>b.y).filter(y=>y>h*.1&&(y<250||y>=315));
 if(xs.length<4||ys.length<4||xs.length>32||ys.length>125)return null;
 return {xs:xs.map(x=>x/scale),ys:ys.map(y=>y/scale)};
}
function cell(img,grid,col,row){const pad=2,x0=grid.xs[col]+pad,x1=grid.xs[col+1]-pad,y0=grid.ys[row]+pad,y1=grid.ys[row+1]-pad,scale=Math.min(4,1600/(x1-x0));const c=makeCanvas((x1-x0)*scale,(y1-y0)*scale),ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.imageSmoothingQuality='high';ctx.drawImage(img,x0,y0,x1-x0,y1-y0,0,0,c.width,c.height);const p=ctx.getImageData(0,0,c.width,c.height);for(let i=0;i<p.data.length;i+=4){const d=p.data;const colored=d[i+2]>d[i]+30&&d[i+2]>d[i+1]+10;const v=!colored&&(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])<180?0:255;d[i]=d[i+1]=d[i+2]=v;}ctx.putImageData(p,0,0);return c;}
const tidy=s=>s.replace(/[\s|。:：，]/g,'');
async function recognize(worker,img,grid,progress,active){
 const read=async(c,r)=>{if(!active())throw Error('已取消识别');return (await worker.recognize(cell(img,grid,c,r))).data.text;};
 await worker.setParameters({tessedit_pageseg_mode:'6',user_defined_dpi:'150'});
 const headers=[];for(let c=0;c<grid.xs.length-1;c++){progress(`正在识别表头 ${c+1}/${grid.xs.length-1}…`);headers.push(tidy(await read(c,0)));}
 const credit=headers.findIndex(s=>/^(应得)?学分$/.test(s));const name=headers.findIndex(s=>/课程名/.test(s));let score=-1,source='';
 for(const label of ['初考','最终','总评']){const i=headers.findIndex(s=>s.includes(label)&&!s.includes('等级')&&!s.includes('级'));if(i>=0){score=i;source=label+'成绩';break;}}
 if(score<0){score=headers.findIndex(s=>s==='成绩'||s==='分数');source='成绩';}
 if(credit<0||score<0)return null;
 const periodCol=headers.findIndex(s=>s.includes('学期'));
 const rows=[];let period='';for(let r=1;r<grid.ys.length-1;r++){progress(`正在读取课程 ${r}/${grid.ys.length-2}…`);const title=name>=0?tidy(await read(name,r)):`课程 ${r}`;if(/^(合计|总计|平均|备注)/.test(title))continue;rows.push({name:title||`课程 ${r}`,gridRow:r});}
 // Read wrapped year/semester independently from the course names.
 await worker.reinitialize('eng',1);await worker.setParameters({tessedit_pageseg_mode:'6',user_defined_dpi:'150'});
 if(periodCol>=0&&rows.length)period=await read(periodCol,rows[0].gridRow);
 const m=period.match(/(20\d{2})\s*[-—.]\s*(20\d{2})\s*([12])/);
 await worker.setParameters({tessedit_pageseg_mode:'7',user_defined_dpi:'150'});
 const number=(text,max)=>{const s=tidy(text);return /^\d{1,3}(?:\.\d+)?$/.test(s)&&Number(s)<=max?s:'';};
 const sv=[],cv=[];for(let i=0;i<rows.length;i++){progress(`正在读取分数与学分 ${i+1}/${rows.length}…`);sv.push(number(await read(score,rows[i].gridRow),100));cv.push(number(await read(credit,rows[i].gridRow),999));}
 return {layout:{rows,year:m&&+m[2]===+m[1]+1?m[1]+'-'+m[2]:'',semester:m?+m[3]-1:null,score:{label:source}},sv,cv};
}
const api={detect,cell,recognize};if(typeof module!=='undefined')module.exports=api;else root.TableOCR=api;
})(typeof window==='undefined'?globalThis:window);
