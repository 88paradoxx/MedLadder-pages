#!/usr/bin/env node
/**
 * Repository-wide SEO audit for MedLadder subject/topic HTML pages.
 * Dependency-free; run with: node scripts/seo-topic-audit.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const htmlFiles = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === ".git" || ent.name === "node_modules") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (ent.isFile() && ent.name.toLowerCase().endsWith(".html")) htmlFiles.push(full);
  }
}
walk(path.join(root, "subjects"));

const rel = f => path.relative(root, f).split(path.sep).join("/");
const readAttr = (html, tag, attr) => {
  const re = new RegExp("<" + tag + "\\b([^>]*)>", "i");
  const m = html.match(re); if (!m) return "";
  const a = m[1].match(new RegExp(`\\b${attr}\\s*=\\s*([\'"])(.*?)\\1`, "i"));
  return a ? a[2].trim() : "";
};
const allMeta = (html, name) => {
  const out=[]; const re=/<meta\b([^>]*)>/gi; let m;
  while ((m=re.exec(html))) {
    const n=m[1].match(/\bname\s*=\s*(['"])(.*?)\1/i);
    const c=m[1].match(/\bcontent\s*=\s*(['"])(.*?)\1/i);
    if(n && n[2].toLowerCase()===name.toLowerCase()) out.push((c?.[2]||"").trim());
  }
  return out;
};
const norm = s => (s||"").replace(/&amp;/g,"&").replace(/&#39;|&apos;/g,"'").replace(/&quot;/g,'"').replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().toLowerCase();
const tokens = s => new Set(norm(s).replace(/[^a-z0-9]+/g," ").split(" ").filter(x=>x.length>2 && !["mcq","mcqs","neet","pg","fmge","inicet","with","for","and","the"].includes(x)));
const similarity = (a,b) => { const A=tokens(a), B=tokens(b); if(!A.size||!B.size)return 0; let n=0; for(const x of A)if(B.has(x))n++; return n/(A.size+B.size-n); };
const files = htmlFiles.sort();
const topics = files.filter(f => path.dirname(path.relative(path.join(root,"subjects"),f)).includes(path.sep));
const records=[];
const localLinkIssues=[];
const schemaIssues=[];
const missingMeta=[];
for(const file of files) {
  const html=fs.readFileSync(file,"utf8"), p=rel(file);
  const title=(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.replace(/<[^>]+>/g," ").trim()||"";
  const descs=allMeta(html,"description");
  const desc=descs[0]||"";
  const canonicalMatch=html.match(/<link\b(?=[^>]*\brel\s*=\s*(['"])canonical\1)([^>]*)>/i);
  const canonical=(canonicalMatch?.[2]?.match(/\bhref\s*=\s*(['"])(.*?)\1/i)||[])[2]||"";
  const h1=(html.match(/<h1\b[^>]*>/gi)||[]).length;
  const ogTitle=readMetaProperty(html,"og:title");
  const ogDesc=readMetaProperty(html,"og:description");
  const twTitle=allMeta(html,"twitter:title")[0]||"";
  const twDesc=allMeta(html,"twitter:description")[0]||"";
  const schemas=[]; const sr=/<script\b[^>]*type\s*=\s*(['"])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi; let sm;
  while((sm=sr.exec(html))) { try { JSON.parse(sm[2].trim()); schemas.push({valid:true}); } catch(e) { schemas.push({valid:false,error:String(e.message).slice(0,120)}); schemaIssues.push({file:p,error:String(e.message).slice(0,120)}); } }
  if(!title||!desc||!canonical||h1!==1||!descs.length) missingMeta.push({file:p,title:!!title,description:!!desc,canonical:!!canonical,h1,descriptionTagCount:descs.length});
  const hrefRe=/<a\b[^>]*\bhref\s*=\s*(['"])(.*?)\1/gi; let lm;
  while((lm=hrefRe.exec(html))) {
    const href=lm[2].trim();
    if(!href||href.startsWith("#")||/^(https?:|mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    let target;
    try { const u=new URL(href,"https://audit.invalid/"+p); if(u.origin!=="https://audit.invalid") continue; let pathname=decodeURIComponent(u.pathname).replace(/^\//,""); if(!pathname) pathname="index.html"; if(pathname.endsWith("/")) pathname+="index.html"; target=path.resolve(root,pathname); if(!path.extname(target)) target=path.join(target,"index.html"); }
    catch { localLinkIssues.push({file:p,href,reason:"unparseable"}); continue; }
    if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()) localLinkIssues.push({file:p,href,reason:"target-not-found"});
  }
  records.push({file:p,title,description:desc,canonical,h1,descriptionLength:desc.length,ogTitle,ogDesc,twTitle,twDesc,schemaCount:schemas.length,schemaValid:schemas.every(x=>x.valid),internalLinkCount:(html.match(/<a\b[^>]*\bhref\s*=\s*(['"])(?!#|https?:|mailto:|tel:|javascript:|data:)[^'"]+\1/gi)||[]).length});
}
function readMetaProperty(html, prop) {
  const re=/<meta\b([^>]*)>/gi; let m;
  while ((m=re.exec(html))) {
    const p=m[1].match(/\bproperty\s*=\s*(['"])(.*?)\1/i);
    if(p && p[2].toLowerCase()===prop) {
      const c=m[1].match(/\bcontent\s*=\s*(['"])(.*?)\1/i);
      return (c?.[2]||"").trim();
    }
  }
  return "";
}
const titleGroups=new Map(), descGroups=new Map();
for(const r of records) {
  const t=norm(r.title), d=norm(r.description);
  if(t){if(!titleGroups.has(t))titleGroups.set(t,[]);titleGroups.get(t).push(r.file);}
  if(d){if(!descGroups.has(d))descGroups.set(d,[]);descGroups.get(d).push(r.file);}
}
const exactTitleDuplicates=[...titleGroups].filter(([,v])=>v.length>1).map(([title,files])=>({title,files}));
const exactDescriptionDuplicates=[...descGroups].filter(([,v])=>v.length>1).map(([description,files])=>({description,files}));
const nearTitlePairs=[], nearDescriptionPairs=[];
for(let i=0;i<records.length;i++) for(let j=i+1;j<records.length;j++) {
  const a=records[i],b=records[j];
  const ts=similarity(a.title,b.title); if(ts>=0.72 && norm(a.title)!==norm(b.title)) nearTitlePairs.push({similarity:+ts.toFixed(2),a:a.file,titleA:a.title,b:b.file,titleB:b.title});
  const ds=similarity(a.description,b.description); if(ds>=0.82 && norm(a.description)!==norm(b.description)) nearDescriptionPairs.push({similarity:+ds.toFixed(2),a:a.file,b:b.file,descriptionA:a.description,descriptionB:b.description});
}
const mismatch=records.filter(r=>(r.ogTitle&&norm(r.ogTitle)!==norm(r.title))||(r.twTitle&&norm(r.twTitle)!==norm(r.title))||(r.ogDesc&&norm(r.ogDesc)!==norm(r.description))||(r.twDesc&&norm(r.twDesc)!==norm(r.description)));
const shortLongDescriptions=records.filter(r=>r.descriptionLength<120||r.descriptionLength>170).map(r=>({file:r.file,length:r.descriptionLength,description:r.description}));
const topicKeywordClusters=new Map();
for(const r of records) {
  const base=path.basename(path.dirname(r.file));
  const slug=base.replace(/-/g," ");
  const key=[...tokens(slug)].sort().join(" ");
  if(key){if(!topicKeywordClusters.has(key))topicKeywordClusters.set(key,[]);topicKeywordClusters.get(key).push(r.file);}
}
const report={
  generatedAt:new Date().toISOString(),subjectHtmlPages:records.length,
  topicPages:topics.length,subjectLandingPages:records.length-topics.length,
  exactTitleDuplicates,nearTitlePairs:nearTitlePairs.sort((a,b)=>b.similarity-a.similarity),
  exactDescriptionDuplicates,nearDescriptionPairs:nearDescriptionPairs.sort((a,b)=>b.similarity-a.similarity),
  missingMeta,metadataSocialMismatches:mismatch,descriptionLengthOutliers:shortLongDescriptions,
  brokenInternalLinks:localLinkIssues,schemaParseErrors:schemaIssues,
  pagesWithoutValidJsonLd:records.filter(r=>!r.schemaCount||!r.schemaValid).map(r=>r.file),
  topicKeywordClusters:[...topicKeywordClusters].filter(([,v])=>v.length>1).map(([cluster,files])=>({cluster,files})),
  pageDetails:records
};
fs.mkdirSync(path.join(root,"audit-output"),{recursive:true});
fs.writeFileSync(path.join(root,"audit-output/topic-seo-audit.json"),JSON.stringify(report,null,2)+"\\n");
const md=[
"# MedLadder topic SEO audit",
"",
"Generated: "+report.generatedAt,
"",
"- Subject/topic HTML pages: "+records.length,
"- Topic pages (excluding subject landing pages): "+topics.length,
"- Subject landing pages: "+(records.length-topics.length),
"- Exact duplicate titles: "+exactTitleDuplicates.length,
"- Near-duplicate title pairs (heuristic): "+nearTitlePairs.length,
"- Exact duplicate descriptions: "+exactDescriptionDuplicates.length,
"- Near-duplicate description pairs (heuristic): "+nearDescriptionPairs.length,
"- Missing/invalid core metadata records: "+missingMeta.length,
"- Social metadata mismatches: "+mismatch.length,
"- Description length outliers (<120 or >170 chars): "+shortLongDescriptions.length,
"- Broken local internal links: "+localLinkIssues.length,
"- JSON-LD parse errors: "+schemaIssues.length,
"- Pages with no valid JSON-LD: "+report.pagesWithoutValidJsonLd.length,
"",
"## Exact duplicate titles",
...exactTitleDuplicates.map(x=>"- "+x.title+" — "+x.files.join(", ")),
"",
"## Near-duplicate title pairs",
...nearTitlePairs.map(x=>"- ["+x.similarity+"] "+x.a+" (“"+x.titleA+"”) ↔ "+x.b+" (“"+x.titleB+"”)"),
"",
"## Exact duplicate descriptions",
...exactDescriptionDuplicates.map(x=>"- "+x.files.join(", ")+": "+x.description),
"",
"## Near-duplicate descriptions",
...nearDescriptionPairs.map(x=>"- ["+x.similarity+"] "+x.a+" ↔ "+x.b),
"",
"## Metadata / social mismatch",
...mismatch.map(x=>"- "+x.file),
"",
"## Broken internal links",
...localLinkIssues.map(x=>"- "+x.file+" → "+x.href),
"",
"## Structured-data errors",
...schemaIssues.map(x=>"- "+x.file+": "+x.error),
"",
"## Interpretation limits",
"- Title/description similarity and slug clusters are automated triage signals, not proof of keyword cannibalization.",
"- Search-intent gaps and actual cannibalization require Google Search Console query-to-page data, impressions, clicks, positions, and ideally SERP review.",
"- Internal link validation checks repository-local href targets; external destinations and runtime redirects are not tested."
].join("\n");
fs.writeFileSync(path.join(root,"audit-output/topic-seo-audit.md"),md+"\n");
console.log(JSON.stringify({pages:records.length,topicPages:topics.length,subjectLandingPages:records.length-topics.length,exactTitleDuplicates:exactTitleDuplicates.length,nearTitlePairs:nearTitlePairs.length,exactDescriptionDuplicates:exactDescriptionDuplicates.length,nearDescriptionPairs:nearDescriptionPairs.length,missingMeta:missingMeta.length,socialMismatches:mismatch.length,brokenInternalLinks:localLinkIssues.length,schemaErrors:schemaIssues.length,output:"audit-output/"},null,2));
