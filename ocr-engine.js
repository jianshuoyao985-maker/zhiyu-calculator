/* OCR layout parsing shared by the browser and sample verification. */
(function(root){
const clean=s=>s.replace(/[\s。，“”"'：:|]/g,'');
function lines(data){return (data.blocks||[]).flatMap(b=>(b.paragraphs||[]).flatMap(p=>p.lines||[]));}
function span(line,label){let text='',chars=[];for(const w of line.words||[]){const t=clean(w.text);text+=t;for(const c of t)chars.push(w.bbox);}const i=text.indexOf(label);if(i<0)return null;const boxes=chars.slice(i,i+label.length);return {label,x0:Math.min(...boxes.map(b=>b.x0)),x1:Math.max(...boxes.map(b=>b.x1))};}
function layout(data,width,height){
 const all=lines(data);const header=all.find(l=>span(l,'学分')&&['初考成绩','最终成绩','总评成绩','成绩'].some(s=>span(l,s)));
 if(!header)throw Error('未找到“学分”和成绩表头。请上传包含完整表头、文字清晰的横向成绩单截图。');
 const score=['初考成绩','最终成绩','总评成绩','成绩'].map(s=>span(header,s)).find(Boolean),credit=span(header,'学分'),name=span(header,'课程名称')||span(header,'课程名');
 if(!name)throw Error('未找到课程名称列，请保留完整表头后重新上传。');
 const labels=['学年学期','学期','课程代码','课程序号','课程名称','课程名','课程类别','学分','考勤成绩','考勤成顷','平时成绩','平时成胜','期末成绩','总评成绩','总评成顷','初考成绩','最终成绩','最终成绩等级','绩点','顷点'];
 const cols=labels.map(s=>span(header,s)).filter(Boolean);function bounds(col){const center=(col.x0+col.x1)/2;const others=cols.filter(c=>c.x1<col.x0||c.x0>col.x1).map(c=>(c.x0+c.x1)/2);const left=Math.max(0,...others.filter(x=>x<center));const right=Math.min(width,...others.filter(x=>x>center));return {left:Math.round((left+center)/2),right:Math.round((right+center)/2)};}
 const nc=bounds(name);let rows=all.filter(l=>l.bbox.y0>header.bbox.y1-5).map(l=>{const words=(l.words||[]).filter(w=>(w.bbox.x0+w.bbox.x1)/2>nc.left&&(w.bbox.x0+w.bbox.x1)/2<nc.right);return {name:words.map(w=>w.text).join('').trim(),y:(l.bbox.y0+l.bbox.y1)/2,box:l.bbox,text:l.text};}).filter(r=>r.name&&!/^(合计|平均|总计|备注)/.test(r.name));
 if(!rows.length)throw Error('找到表头，但未识别到课程行。请换用更清晰的截图。');
 if(rows.length>120)throw Error('单张图片课程过多，请分学期或分段上传。');
 const yearCounts={};for(const r of rows){const m=r.text.match(/(20\d{2})[-—.](20\d{2})\s+([12])/);if(m&&+m[2]===+m[1]+1){const key=m[1]+'-'+m[2]+'|'+m[3];yearCounts[key]=(yearCounts[key]||0)+1;}}
 const period=Object.entries(yearCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]?.split('|');
 return {rows,score:{...score,...bounds(score)},credit:{...credit,...bounds(credit)},top:Math.min(...rows.map(r=>r.box.y0))-5,bottom:Math.min(height,Math.max(...rows.map(r=>r.box.y1))+5),year:period?.[0]||'',semester:period?Number(period[1])-1:null};
}
function numericRows(data,top,rows,max,scale=1){const ls=lines(data).map(l=>({text:l.words.map(w=>w.text).join('').trim(),y:(l.bbox.y0+l.bbox.y1)/2/scale+top}));return rows.map((row,i)=>{const spacing=Math.min(i?row.y-rows[i-1].y:Infinity,i<rows.length-1?rows[i+1].y-row.y:Infinity);const tolerance=Math.min(spacing*.43,Math.max(15,(row.box.y1-row.box.y0)*.7));const near=ls.filter(l=>Math.abs(l.y-row.y)<tolerance);if(near.length!==1||!/^\d{1,3}(?:\.\d+)?$/.test(near[0].text))return '';const n=Number(near[0].text);return n>=0&&n<=max?String(n):'';});}
const api={layout,numericRows,lines};if(typeof module!=='undefined')module.exports=api;else root.ScoreOCR=api;
})(typeof window==='undefined'?globalThis:window);
