#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const root=process.cwd(), files=[];
function walk(dir){
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const full=path.join(dir,ent.name);
    if(ent.isDirectory()) walk(full);
    else if(ent.isFile()&&ent.name.endsWith(".html")) files.push(full);
  }
}
walk(path.join(root,"subjects"));
const escapeAttr=s=>s.replace(/&(?!(?:amp|lt|gt|quot|#39|apos);)/g,"&amp;").replace(/"/g,"&quot;");
function attr(tag,name){
  const re=new RegExp("\\b"+name+"\\s*=\\s*(['\"])([\\s\\S]*?)\\1","i");
  return (tag.match(re)||[])[2]||"";
}
function updateMeta(html,selector,value){
  const re=/<meta\b[^>]*>/gi;
  return html.replace(re,tag=>{
    const key=selector.kind==="name"?"name":"property";
    if(attr(tag,key).toLowerCase()!==selector.value)return tag;
    const encoded=escapeAttr(value);
    if(/\bcontent\s*=\s*(['"])[\s\S]*?\1/i.test(tag))
      return tag.replace(/(\bcontent\s*=\s*)(['"])[\s\S]*?\2/i,(_,prefix,q)=>prefix+q+encoded+q);
    return tag.replace(/\s*\/?>$/,match=>' content="'+encoded+'">');
  });
}
let changed=0,tagsChanged=0;
for(const file of files){
  const original=fs.readFileSync(file,"utf8");
  const title=(original.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.trim();
  const descriptionTag=original.match(/<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/i);
  const description=descriptionTag?attr(descriptionTag[0],"content"):"";
  if(!title||!description)continue;
  let html=original;
  const targets=[
    [{kind:"property",value:"og:title"},title],
    [{kind:"name",value:"twitter:title"},title],
    [{kind:"property",value:"og:description"},description],
    [{kind:"name",value:"twitter:description"},description]
  ];
  for(const [selector,value] of targets){
    const before=html;
    html=updateMeta(html,selector,value);
    if(html!==before)tagsChanged++;
  }
  if(html!==original){fs.writeFileSync(file,html);changed++;}
}
console.log(JSON.stringify({scanned:files.length,filesChanged:changed,tagsChanged},null,2));
