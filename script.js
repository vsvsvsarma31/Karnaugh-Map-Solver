const d=document,$=e=>d.getElementById(e),q=e=>d.querySelectorAll(e),c=(e,m,v)=>e.classList[m](v);
let V=[],O=[],K={rows:0,cols:0,cells:[],groups:[]},G=null,KM="SOP";
const genBtn=$("genBtn"),solveBtn=$("solveBtn"),truthTableDiv=$("truthTable"),advancedSection=$("advanced");

genBtn.addEventListener("click",gen);
solveBtn.addEventListener("click",solve);

function gen(){
  const v=$("vars").value.trim();
  if(!v)return alert("Enter variables");
  V=v.split(/\s+/);
  if(V.length<2||V.length>4)return alert("Only 2–4 variables supported");
  const r=2**V.length;
  let h=`<table class="truth-table"><thead><tr>`;
  V.forEach(v=>h+=`<th>${v}</th>`);
  h+=`<th>Output</th></tr></thead><tbody>`;
  for(let i=0;i<r;i++){
    h+="<tr>";
    for(let j=V.length-1;j>=0;j--)h+=`<td>${(i>>j)&1}</td>`;
    h+=`<td><input class="output-input" maxlength="1" placeholder="0/1/X"></td></tr>`;
  }
  truthTableDiv.innerHTML=h+"</tbody></table>";
  solveBtn.disabled=false;
  c(advancedSection,"add","hidden");
}

function solve(){
  resetKMap();
  const rows=q(".output-input");
  let m=[],dc=[];O=[];
  rows.forEach((cell,i)=>{
    const v=cell.value.trim().toUpperCase();
    if(!["0","1","X"].includes(v))return alert("Use only 0, 1, or X");
    O.push(v);
    v=="1"&&m.push(i);
    v=="X"&&dc.push(i);
  });
  const imps=qm(m,dc,V.length),expr=fmt(imps);
  $("result").textContent=`Minimized SOP Expression:\n${expr}\n\nMinterms: ${m.join(", ")}\nDon't cares: ${dc.join(", ")}`;
  drawKMap();
  drawGroups(imps);
  genVerilog(expr);
  genTestbench();
  c(advancedSection,"remove","hidden");
}

function qm(m,dc,v){
  let terms=[...m,...dc].map(m=>({bits:m.toString(2).padStart(v,"0"),used:false})),groups={},primes=[];
  terms.forEach(t=>{const o=[...t.bits].filter(b=>b=="1").length;(groups[o]??=[]).push(t);});
  for(;;){
    let ng={},comb=false,keys=Object.keys(groups).map(Number).sort((a,b)=>a-b);
    for(let i=0;i<keys.length-1;i++)groups[keys[i]].forEach(a=>{groups[keys[i+1]].forEach(b=>{
      if(diff(a.bits,b.bits)==1){const merged=merge(a.bits,b.bits),o=[...merged].filter(c=>c=="1").length;(ng[o]??=[]).push({bits:merged,used:false});a.used=b.used=true;comb=true;}
    });});
    Object.values(groups).flat().forEach(t=>{if(!t.used&&!primes.includes(t.bits))primes.push(t.bits);});
    if(!comb)break;
    groups=ng;
  }
  return primes;
}

const diff=(a,b)=>{let d=0;for(let i=0;i<a.length;i++)a[i]!=b[i]&&d++;return d};
const merge=(a,b)=>a.split("").map((v,i)=>v==b[i]?v:"-").join("");
const fmt=imps=>imps.map(bits=>bits.split("").map((b,i)=>b=="-"?"":b=="1"?V[i]:V[i]+"'").join("")).join(" + ");

function drawKMap(){
  const v=V.length;let r,cl;
  v==2&&(r=cl=2);v==3&&(r=2,cl=4);v==4&&(r=cl=4);
  initKMap(v);
  const map=d.createElement("div");
  map.id="kmap";map.className="kmap";map.style.display="grid";
  map.style.gridTemplateColumns=`80px repeat(${cl}, 50px)`;
  map.style.gridTemplateRows=`40px repeat(${r}, 50px)`;
  map.style.position="relative";
  const rb=Math.floor(v/2),cb=v-rb,rowLabels=grayLabels(rb),colLabels=grayLabels(cb);
  map.appendChild(d.createElement("div"));
  colLabels.forEach(l=>{const div=d.createElement("div");div.className="kmap-label";div.textContent=V.slice(rb).join("")+" = "+l;map.appendChild(div);});
  for(let R=0;R<r;R++){
    const rowHeader=d.createElement("div");
    rowHeader.className="kmap-label";
    rowHeader.textContent=V.slice(0,rb).join("")+" = "+rowLabels[R];
    map.appendChild(rowHeader);
    for(let C=0;C<cl;C++){
      const cell=K.cells.find(x=>x.row===R&&x.col===C),div=d.createElement("div");
      div.className="kmap-cell";div.dataset.row=R;div.dataset.col=C;div.textContent=cell?.value??"0";
      cell?.value=="1"&&div.classList.add("one");
      cell?.value=="X"&&div.classList.add("dc");
      cell.el=div;map.appendChild(div);
    }
  }
  const old=$("kmap");
  old?old.replaceWith(map):$("advanced").appendChild(map);
}

function drawGroups(imps){
  const map=$("kmap"),cs=50,lr=40,lc=80;
  imps.forEach(bits=>{
    let covered=[];
    O.forEach((v,i)=>{
      if(v!="1"&&v!="X")return;
      const bin=i.toString(2).padStart(V.length,"0");
      for(let j=0;j<bits.length;j++)if(bits[j]!="-"&&bits[j]!=bin[j])return;
      covered.push(getKMapIndex(i,V.length));
    });
    if(!covered.length)return;
    const rows=covered.map(i=>Math.floor(i/K.cols)),cols=covered.map(i=>i%K.cols),rmin=Math.min(...rows),rmax=Math.max(...rows),cmin=Math.min(...cols),cmax=Math.max(...cols),wrapR=rmax-rmin===K.rows-1,wrapC=cmax-cmin===K.cols-1;
    !wrapR&&!wrapC&&box(rmin,rmax,cmin,cmax,false);
    wrapC&&(box(rmin,rmax,0,cmin,true),box(rmin,rmax,cmax,K.cols-1,true));
    wrapR&&(box(0,rmin,cmin,cmax,true),box(rmax,K.rows-1,cmin,cmax,true));
  });
  function box(r1,r2,c1,c2,dashed){
    const b=d.createElement("div");
    b.className="kmap-group";dashed&&b.classList.add("dashed");
    b.style.top=`${lr+r1*cs}px`;b.style.left=`${lc+c1*cs}px`;
    b.style.width=`${(c2-c1+1)*cs}px`;b.style.height=`${(r2-r1+1)*cs}px`;
    map.appendChild(b);
  }
}

function genVerilog(expr){
  $("verilog").textContent=`module logic_fn(\n    input ${V.join(", ")},\n    output Y\n);\nassign Y = ${expr.replace(/\+/g,"|").replace(/'/g,"~")};\nendmodule`;
}

function genTestbench(){
  $("testbench").textContent=`module tb;\nreg ${V.join(", ")};\nwire Y;\nlogic_fn uut(${V.join(", ")}, Y);\ninitial begin\n    $monitor(${V.map(v=>`"${v}=%b"`).join(", ")}, ", Y=%b", ${V.join(", ")}, Y);\n    #20 $finish;\nend\nendmodule`;
}

const gray=n=>n^(n>>1);
function getKMapIndex(i,v){
  if(v==2){const r=gray((i>>1)&1),c=gray(i&1);return r*2+c;}
  if(v==3){const r=gray((i>>2)&1),c=gray(i&3);return r*4+c;}
  if(v==4){const r=gray((i>>2)&3),c=gray(i&3);return r*4+c;}
}

function initKMap(v){
  v==2&&(K.rows=K.cols=2);v==3&&(K.rows=2,K.cols=4);v==4&&(K.rows=K.cols=4);
  K.cells=[];
  O.forEach((val,i)=>{
    const idx=getKMapIndex(i,v),r=Math.floor(idx/K.cols),c=idx%K.cols;
    K.cells.push({index:i,value:val,row:r,col:c,el:null});
  });
}

function deriveSOP(){
  return K.groups.map(g=>V.map((v,i)=>{
    const bits=g.map(c=>{const cell=K.cells.find(x=>x.row==c.row&&x.col==c.col);return (cell.index>>(V.length-1-i))&1;});
    if(bits.every(b=>b==1))return v;
    if(bits.every(b=>b==0))return v+"'";
    return "";
  }).join("")).join(" + ");
}

function derivePOS(){
  return K.groups.map(g=>"("+V.map((v,i)=>{
    const bits=g.map(c=>{const cell=K.cells.find(x=>x.row==c.row&&x.col==c.col);return (cell.index>>(V.length-1-i))&1;});
    if(bits.every(b=>b==0))return v;
    if(bits.every(b=>b==1))return v+"'";
    return "";
  }).filter(Boolean).join(" + ")+")").join("");
}

function exportKMap(){
  html2canvas($("kmap")).then(canvas=>{const link=d.createElement("a");link.download="kmap.png";link.href=canvas.toDataURL();link.click();});
}

function resetKMap(){
  const old=$("kmap");old&&old.remove();
  K={rows:0,cols:0,cells:[],groups:[]};
  G=null;
}

function grayLabels(bits){
  const count=1<<bits,labels=[];
  for(let i=0;i<count;i++)labels.push(gray(i).toString(2).padStart(bits,"0"));
  return labels;
}

const isPowerOfTwo=n=>n&&(n&(n-1))==0;
const isWrapAroundGroup=g=>{const rows=g.map(c=>c.row),cols=g.map(c=>c.col),rowWrap=Math.max(...rows)-Math.min(...rows)==K.rows-1,colWrap=Math.max(...cols)-Math.min(...cols)==K.cols-1;return rowWrap||colWrap};

function setMode(m){KM=m;updateExpressionFromGroups();}

function updateExpressionFromGroups(){
  const out=KM=="SOP"?deriveSOP():derivePOS();
  $("result").textContent=`${KM} Expression:\n${out}`;
}

d.addEventListener("mousedown",e=>{
  if(!e.target.classList.contains("kmap-cell"))return;
  G={start:e.target,cells:new Set([e.target])};
  e.target.classList.add("selected");
});

d.addEventListener("mouseover",e=>{
  if(!G||!e.target.classList.contains("kmap-cell"))return;
  G.cells.add(e.target);
  e.target.classList.add("selected");
});

d.addEventListener("mouseup",()=>{
  if(!G)return;
  const group=Array.from(G.cells).map(c=>({row:+c.dataset.row,col:+c.dataset.col}));
  if(!isPowerOfTwo(group.length)){
    alert("Invalid K-Map group: size must be power of two");
    group.forEach(c=>d.querySelector(`.kmap-cell[data-row="${c.row}"][data-col="${c.col}"]`)?.classList.remove("selected"));
    G=null;return;
  }
  K.groups.push(group);
  drawGroupOutline(group);
  updateExpressionFromGroups();
  G=null;
});
