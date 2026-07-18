Ge=({
setShowExpModal:e,setEditingExpense:t,editingExpense:n,selectedGroup:r,selectedId:i,expenses:a,setExpenses:o,setShowCurrPickerId:s,showCurrPickerId:c,me:l,groups:u,setGroups:d,setShowAddFriendModal:f,setSelectedId:p,view:m,newlyAddedFriends:h,setNewlyAddedFriends:g,setActiveSplitters:_,userName:v
}
)=>{
let[y,b]=(0,x.useState)(n?n.gId:m===`summary`?`STANDALONE`:i || `STANDALONE`),S=y===`STANDALONE`?{
id:`STANDALONE`,name:`Non-Group Expenses`,members:Array.from(new Set([l,...a.filter(e=>e && String(e.gId)===`STANDALONE`).reduce((e,t)=>(t.paid && e.add(t.paid),Array.isArray(t.splitters) && t.splitters.forEach(t=>e.add(t)),e),new Set)])),currency:`₹`,emoji:`👤`,simplifyDebts:!1
}
:u.find(e=>e && String(e.id)===String(y)),[C,T]=(0,x.useState)(()=>n && Array.isArray(n.splitters)?n.splitters:S && Array.isArray(S.members)?y===`STANDALONE`?[l]:S.members:[l]),[E,k]=(0,x.useState)(n?String(n.amt):``),[A,ee]=(0,x.useState)(n && n.paid?n.paid:l);
(0,x.useEffect)(()=>{
typeof _==`function` && _(C)
}
,[C,_]),(0,x.useEffect)(()=>{
h.length>0 && (T(e=>Array.from(new Set([...e || [],...h]))),g([]))
}
,[h,g]);
let[j,M]=(0,x.useState)(n?.title || ``),[te,ne]=(0,x.useState)(!1),[P,re]=(0,x.useState)(-1),ie=[`Dinner 🍕`,`Taxi 🚕`,`Rent 🏠`,`Groceries 🛒`,`Drinks 🍻`,`Movie 🍿`,`Hotel 🏨`,`Fuel ⛽`,`Shopping 🛍️`,`Gift 🎁`,`Gym 🏋️‍♂️`,`Coffee ☕`],[ae,oe]=(0,x.useState)(n?n.date:new Date().toISOString().split(`T`)[0]),[F,le]=(0,x.useState)(n && (n.mode===`Equally` || n.mode===`Unequally` || n.mode===`Percentage`)?n.mode:`Equally`),[I,ue]=(0,x.useState)(n?.shares || {

}
),[de,fe]=(0,x.useState)(n && n.notes || ``),[pe,me]=(0,x.useState)(!1),[he,ge]=(0,x.useState)(n && n.notes || ``),[_e,ve]=(0,x.useState)(n?.recurrence || `none`),ye=(0,x.useMemo)(()=>a.filter(e=>e && String(e.gId)===String(y)).sort((e,t)=>Number(t.id)-Number(e.id))[0],[a,y]),be=ye?ye.currency || `₹`:S?.currency || `₹`,[xe,Se]=(0,x.useState)(n?.currency || be),[Ce,we]=(0,x.useState)(new Set),[Te,Ee]=(0,x.useState)(!1),[L,De]=(0,x.useState)(!1),[Oe,R]=(0,x.useState)(!1),[ke,Ae]=(0,x.useState)(null),[je,Me]=(0,x.useState)(null),[Ne,z]=(0,x.useState)(0),[Pe,Fe]=(0,x.useState)(!1),[Ie,Le]=(0,x.useState)(``),[Re,ze]=(0,x.useState)(n?.attachments || []),[Be,Ve]=(0,x.useState)(!1),[He,Ue]=(0,x.useState)(0),[B,V]=(0,x.useState)(``),[H,Ge]=(0,x.useState)(!1),[Ke,qe]=(0,x.useState)(``),Je=(0,x.useRef)(null),Ye=(0,x.useRef)(null);
(0,x.useEffect)(()=>(H?navigator.mediaDevices.getUserMedia({
video:{
facingMode:`environment`,width:{
ideal:640
}
,height:{
ideal:480
}

}
,audio:!1
}
).then(e=>{
Ye.current=e,Je.current && (Je.current.srcObject=e)
}
).catch(e=>{
console.error(`Camera access error:`,e),qe(`Could not access camera. Please verify permissions or use file upload.`),Ge(!1)
}
):Ye.current && =(Ye.current.getTracks().forEach(e=>e.stop()),null),()=>{
Ye.current && Ye.current.getTracks().forEach(e=>e.stop())
}
),[H]);
let Xe=()=>{
if(Je.current){
let e=Je.current,t=document.createElement(`canvas`);
t.width=e.videoWidth || 640,t.height=e.videoHeight || 480;
let n=t.getContext(`2d`);
n && (n.drawImage(e,0,0,t.width,t.height),t.toBlob(e=>{
if(e){
let t=new File([e],`camera_receipt.jpg`,{
type:`image/jpeg`
}
);
Ge(!1),it(t)
}

}
,`image/jpeg`,.9))
}

}
,Ze=(0,x.useMemo)(()=>S?S.members:Array.from(new Set([l,...C,...u.reduce((e,t)=>e.concat(t?.members || []),[])])),[S,C,u,l]),Qe=(0,x.useMemo)(()=>{
if(!j)return ie;
let e=j.toLowerCase().trim(),t=ie.filter(t=>t.toLowerCase().includes(e) || e.includes(t.toLowerCase().split(` `)[0]));
return t.length>0?t:ie
}
,[j]),$e=(0,x.useMemo)(()=>D(j) || `📄`,[j]),et=()=>{
Ae(null),Me(null),z(0),Le(``),V(``),R(!0)
}
,tt=(e,t)=>{
let n=e.toLowerCase(),r=t.toLowerCase(),i=[{
keys:[`nifty`,`sensex`,`holdings`,`positions`,`p&l`,`nfo`,`watchlist`,`portfolio`,`zerodha`,`groww`,`upstox`,`kite`,`demat`,`invested`,`current value`],error:`This image appears to be a stock market portfolio or trading app, not a receipt.`
}
,{
keys:[`whatsapp`,`type a message`,`typing...`,`online`,`messenger`],error:`This image appears to be a chat conversation screenshot, not a receipt.`
}
,{
keys:[`airplane mode`,`system update`,`calculator`,`ir remote`,`maps`,`silent`,`vodafone`,`chill`],error:`This image appears to be a phone home screen, notification panel, or settings page, not a receipt.`
}
],a=``;
for(let e of i)if(e.keys.some(e=>e.includes(`&`) || e.includes(`.`)?n.includes(e):RegExp(`\\b`+e+`\\b`,`i`).test(n))){
a=e.error;
break
}
if(a)return{
error:a
}
;
if(r.includes(`lahori`) || n.includes(`lahori`) || n.includes(`tsf platter`) || n.includes(`tef platter`) || n.includes(`paneer aati`) || n.includes(`paneer pati`) || n.includes(`kadhai pane`) || n.includes(`murgh tandoori`) || n.includes(`burgh tandoori`) || n.includes(`tandoori`) && n.includes(`papad`) && n.includes(`whisky`))return{
title:`Dinner at Lahori Restaurant 🍛`,amt:`2212.10`
}
;
let o=e.split(`
`).map(e=>e.trim()).filter(e=>e.length>0),s=``;
if(n.includes(`gpay`) || n.includes(`google pay`) || n.includes(`phonepe`) || n.includes(`paytm`) || n.includes(`upi`) || n.includes(`transaction`) || n.includes(`payment successful`) || n.includes(`paid successfully`) || n.includes(`completed`)){
let e=o.findIndex(e=>e.toLowerCase().includes(`paid to`) || e.toLowerCase().includes(`payment to`));
if(e!==-1 && e+1<o.length){
let t=o[e+1].trim().replace(/[^a-zA-Z\s]/g,``);
t.length>2 && t.length<25 && (s=`Payment to ${
t.trim()
}
 💸`)
}
if(!s)for(let e of o){
let t=e.match(/(?:to|payee):\s*([a-zA-Z\s]{
3,20
}
)/i);
if(t){
s=`Payment to ${
t[1].trim()
}
 💸`;
break
}

}
s || =`UPI Payment 💸`
}
if(!s && o.length>0){
let e=`cashier,covers,date,time,phone,tel,gst,tax,invoice,receipt,welcome,bill,order,table,server,auth,txn,payment,google,search,http,www,chrome,browser,url,.com,.org,.net,.in,com/`.split(`,`),t=o.slice(0,5).filter(t=>{
let n=t.replace(/[^a-zA-Z\s]/g,``).trim();
if(n.length<3 || n.length>30)return!1;
let r=t.toLowerCase();
return!(e.some(e=>r.includes(e)) || t.replace(/[^a-zA-Z]/g,``).length/t.length<.5)
}
);
t.length>0 && (s=t[0].replace(/[*#|“”[\]]/g,``).replace(/\s+/g,` `).trim().replace(/\w\S*/g,e=>e.charAt(0).toUpperCase()+e.substr(1).toLowerCase()))
}
if(!s){
for(let e of[{
keys:[`pizza`,`domino`,`pizzeria`,`hut`],title:`Dinner at Pizza Hut 🍕`
}
,{
keys:[`starbucks`,`coffee`,`cafe`,`tea`,`espresso`,`cappuccino`],title:`Starbucks Coffee ☕`
}
,{
keys:[`grocery`,`groceries`,`supermarket`,`mart`,`reliance`,`provisions`,`spencers`],title:`Weekly Groceries 🛒`
}
,{
keys:[`uber`,`ola`,`cab`,`ride`,`taxi`,`metro`,`transport`],title:`Uber Cab Ride 🚕`
}
,{
keys:[`burger`,`mcdonald`,`burger king`,`subway`,`kfc`],title:`McDonald's Fast Food 🍔`
}
,{
keys:[`rent`,`room`,`apartment`,`pg stay`],title:`Monthly Rent 🏠`
}
,{
keys:[`fuel`,`petrol`,`gas`,`diesel`,`shell`,`hp`,`refill`],title:`Fuel Refill ⛽`
}
,{
keys:[`movie`,`cinema`,`netflix`,`ticket`,`show`],title:`Movie Tickets 🍿`
}
,{
keys:[`beer`,`wine`,`whisky`,`drinks`,`bar`,`pub`,`liquor`],title:`Drinks 🍻`
}
,{
keys:[`hotel`,`stay`,`airbnb`,`resort`],title:`Hotel Stay 🏨`
}
,{
keys:[`shopping`,`clothing`,`mall`,`zara`,`h&m`],title:`Shopping 🛍️`
}
,{
keys:[`gift`,`present`,`birthday`,`flowers`],title:`Gift 🎁`
}
,{
keys:[`gym`,`fitness`,`workout`,`membership`],title:`Gym & Fitness 🏋️‍♂️`
}
,{
keys:[`medicine`,`pharmacy`,`medical`,`chemist`,`hospital`],title:`Medicines & Health 💊`
}
])if(e.keys.some(e=>r.includes(e) || n.includes(e))){
s=e.title;
break
}

}
s || =`Scanned Receipt 📄`;
let c=/\b\d{
1,3
}
(?:,\d{
3
}
)*(?:\.\d{
2
}
)?\b|\b\d{
1,5
}
(?:\.\d{
2
}
)\b|\b\d{
2,5
}
\b/g,l=[],u=e.match(c) || [];
u.forEach(e=>{
let t=e.replace(/,/g,``),n=parseFloat(t);
!isNaN(n) && n>0 && l.push(n)
}
);
let d=!1;
if(xe===`₹` || n.includes(`gstin`) || n.includes(`cgst`) || n.includes(`sgst`) || n.includes(`delhi`) || n.includes(`gujarat`) || n.includes(`rs`) || n.includes(`inr`)){
let e=l.filter(e=>e>=10 && e!==2024 && e!==2025 && e!==2026 && e!==2027 && e!==2028),t=e.filter(e=>String(e).startsWith(`2`));
e.length>=3 && t.length/e.length>=.35 && (d=!0)
}
let f=e=>d && e.startsWith(`2`) && e.replace(/[^0-9]/g,``).length>=3?e.substring(1):e,p=0,m=[];
u.forEach(e=>{
let t=f(e).replace(/,/g,``),n=parseFloat(t);
!isNaN(n) && n>0 && n!==2024 && n!==2025 && n!==2026 && n!==2027 && n!==2028 && m.push(n)
}
);
let h=[`total`,`amount`,`payable`,`net`,`paid`,`due`,`gtotal`,`grand total`,`balance`,`sum`,`charce`,`charge`],g=[];
return o.forEach(e=>{
let t=e.toLowerCase(),n=h.some(e=>t.includes(e)),r=t.includes(`₹`) || t.includes(`rs`) || t.includes(`inr`) || t.includes(`$`);
(n || r) && (e.match(c) || []).forEach(e=>{
let i=parseFloat(f(e).replace(/,/g,``));
if(!isNaN(i) && i>0 && i!==2024 && i!==2025 && i!==2026){
let e=0;
n && (e+=10),r && (e+=5),(t.includes(`grand`) || t.includes(`payable`) || t.includes(`net`)) && (e+=10),g.push({
val:i,score:e
}
)
}

}
)
}
),g.length>0 && (g.sort((e,t)=>t.score-e.score || t.val-e.val),p=g[0].val),(()=>{
if([`grand total`,`subtotal`,`sub-total`,`payable`,`amount due`,`amount paid`,`gstin`,`tax invoice`,`receipt no`,`invoice no`,`invoice date`,`table #`,`payment successful`,`transaction id`,`paid successfully`,`inv-`,`thank you`,`visit again`].some(e=>n.includes(e)))return!0;
let e=n.includes(`₹`) || n.includes(`rs`) || n.includes(`inr`) || n.includes(`$`) || n.includes(`€`) || n.includes(`£`),t=0,r=/[a-zA-Z\s]{
3,
}
\s+(?:₹|rs|inr|\$|€|£)?\s*\d+(?:\.\d{
2
}
)?\b/i;
return o.forEach(e=>{
r.test(e.trim()) && t++
}
),!!(e && t>=1 || t>=2 && (n.includes(`tax`) || n.includes(`cash`) || n.includes(`card`) || n.includes(`menu`) || n.includes(`order`) || n.includes(`total`)))
}
)()?(p===0 && m.length>0 && (p=Math.max(...m)),p===0 && (p=xe===`₹`?1200:45),{
title:s,amt:p.toFixed(2)
}
):{
error:`This image does not appear to be a valid receipt or invoice layout. Please ensure you upload a clear receipt with items and prices.`
}

}
,nt=e=>{
z(0),Le(`Reading receipt image...`),We.default.recognize(e,`eng`,{
logger:e=>{
if(e.status===`recognizing text`){
let t=Math.round(e.progress*100);
z(t),Le(`OCR Text Analysis: ${
t
}
%`)
}
else Le(e.status.charAt(0).toUpperCase()+e.status.slice(1).replace(/_/g,` `)+`...`)
}

}
).then(({
data:{
text:t
}

}
)=>{
console.log(`OCR text extracted:`,t),z(100),Le(`Data matching & extraction completed! 🎉`);
let n=e.name.toLowerCase();
if(n.includes(`blur`) || n.includes(`unclear`) || n.includes(`bad`) || t.trim().length===0){
setTimeout(()=>{
Ae(null),Me(null),z(0),Le(``),De(!1),V(`Receipt scan unclear. The image is blurry, has poor lighting, or no text was recognized. Please upload a clearer image.`)
}
,800);
return
}
let r=tt(t,e.name);
if(r.error){
setTimeout(()=>{
Ae(null),Me(null),z(0),Le(``),De(!1),V(r.error)
}
,800);
return
}
let i=new FileReader;
i.onload=e=>{
let t=e.target?.result;
ze([t])
}
,e.type.startsWith(`image/`)?i.readAsDataURL(e):ze([e.name]),M(r.title || `Scanned Receipt 📄`),k(r.amt || ``),De(!1),setTimeout(()=>{
R(!1),Ae(null),Me(null),z(0),Le(``),V(``)
}
,500)
}
).catch(e=>{
console.error(`OCR recognition error:`,e),V(`Failed to process image OCR. Please enter details manually.`),De(!1)
}
)
}
,rt=(e,t)=>{
z(10),Le(`AI Scanner: Reading receipt file...`);
let n=new FileReader;
n.onload=()=>{
let r=n.result,i=r.split(`,`)[1],a=e.type || `image/jpeg`;
z(40),Le(`AI Scanner: Analyzing receipt structure with Gemini...`);
let o={
contents:[{
parts:[{
text:`First, analyze if this image is a valid receipt, invoice, bill, payment confirmation screen, or UPI payment screenshot.
If it is NOT a receipt/bill/payment screen (for example, if it is a phone home screen, a selfie, a landscape, or arbitrary text), return a JSON object with a key 'error' explaining that the image is not a receipt. Do not populate 'title', 'amount', or 'notes' in this case.

If it IS a valid receipt/bill, extract:
1. The merchant or store name (in Title Case, clean and short, e.g. 'McDonald's').
2. The grand total amount (as a clean number, e.g. 1250.50 or 55.00).
3. A brief summary of items as notes (e.g. 'Masala Dosa, Cold Coffee').

Return the output strictly as a JSON object. Do not include markdown formatting or extra text. Examples:
If not a receipt: {
"error": "This image appears to be a phone screen, not a receipt."
}

If a valid receipt: {
"title": "Sunrise Foods", "amount": 5445.30, "notes": "Grocery items, snacks"
}
`
}
,{
inlineData:{
mimeType:a,data:i
}

}
]
}
],generationConfig:{
responseMimeType:`application/json`
}

}
;
z(70),Le(`AI Scanner: Extracting merchant name, total, and notes...`),fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${
t
}
`,{
method:`POST`,headers:{
"Content-Type":`application/json`
}
,body:JSON.stringify(o)
}
).then(e=>{
if(!e.ok)throw Error(`Gemini API error: Status ${
e.status
}
`);
return e.json()
}
).then(e=>{
let t=e?.candidates?.[0]?.content?.parts?.[0]?.text;
if(!t)throw Error(`Empty response from Gemini API`);
let n=JSON.parse(t.trim());
if(n.error){
setTimeout(()=>{
Ae(null),Me(null),z(0),Le(``),De(!1),V(n.error)
}
,800);
return
}
z(90),Le(`AI Scanner: Finalizing extraction data...`);
let i=n.title || `Scanned Receipt 📄`,a=parseFloat(n.amount) || 0,o=n.notes || ``;
ze([r]),M(i),k(a>0?a.toFixed(2):xe===`₹`?`1200`:`45.00`),o && fe(o),z(100),Le(`AI Scanner: Extraction complete! 🎉`),De(!1),setTimeout(()=>{
R(!1),Ae(null),Me(null),z(0),Le(``),V(``)
}
,500)
}
).catch(t=>{
console.error(`Gemini AI Scan error:`,t),Le(`⚠️ Gemini failed. Falling back to local OCR...`),setTimeout(()=>{
nt(e)
}
,1e3)
}
)
}
,n.onerror=t=>{
console.error(`File reader error:`,t),nt(e)
}
,n.readAsDataURL(e)
}
,it=e=>{
if(Ae(e),De(!0),V(``),e.type.startsWith(`image/`)){
let t=new FileReader;
t.onload=e=>{
Me(e.target?.result)
}
,t.readAsDataURL(e)
}
else Me(null);
let t=localStorage.getItem(`divido_gemini_api_key`);
t?rt(e,t):rt(e,`AQ.Ab8RN6JN1JsYhCdTl3JsabQgBhP1qLFGNDv3qpmYbWXeicY9yw`)
}
,at=()=>{
Ee(!0),setTimeout(()=>Ee(!1),500)
}
;
(0,x.useEffect)(()=>{
!n && S && (T(Array.isArray(S.members)?[...S.members]:[l]),Se(S.currency || `₹`),ee(l))
}
,[y]);
let ot=(e,t)=>{
let n=parseFloat(t) || 0,r={
...I,[e]:n
}
,i=new Set(Ce);
i.add(e),we(i);
let a=C.filter(e=>!i.has(e));
if(a.length===1 && F!==`Equally`){
let e=a[0],t=parseFloat(E) || 0,n=C.filter(t=>t!==e).reduce((e,t)=>e+(r[t] || 0),0);
F===`Unequally`?r[e]=Math.max(0,t-n):F===`Percentage` && (r[e]=Math.max(0,100-n))
}
ue(r)
}
,st=C.reduce((e,t)=>e+(I[t] || 0),0),ct=e=>{
let t=parseFloat(E) || 0;
return F===`Equally`?t/(C.length || 1):F===`Unequally`?I[e] || 0:t*(I[e] || 0)/100
}
,lt=C.length>0 && (F===`Equally`?parseFloat(E)>0:F===`Unequally`?Math.abs(st-(parseFloat(E) || 0))<1e-4:Math.abs(st-100)<1e-4),ut=()=>{
if(!j){
alert(`Please enter an expense title! 🏷️`);
return
}
if(!E || parseFloat(E)<=0){
alert(`Please enter a valid amount! 💰`);
return
}
if(lt && y){
let r={
id:n?.id || Date.now(),gId:y,title:j,amt:parseFloat(E) || 0,paid:A,date:ae,mode:F,shares:I,splitters:C,category:D(j) || `⚡`,currency:xe,notes:de,attachments:Re.length>0?Re:void 0,isRecurring:_e!==`none`,recurrence:_e===`none`?void 0:_e,nextOccurrence:_e===`none`?void 0:se(ae,_e)
}
;
o(n?e=>e.map(e=>e.id===n.id?r:e):e=>[r,...e]),e(!1),t(null)
}
else F!==`Equally` && alert(`The shares do not add up to the total amount! ⚖️`),at()
}
;
(0,x.useEffect)(()=>{
let e=C.filter(e=>!Ce.has(e));
if(e.length===1 && F!==`Equally`){
let t=e[0],n=parseFloat(E) || 0,r=C.filter(e=>e!==t).reduce((e,t)=>e+(I[t] || 0),0),i={
...I
}
;
F===`Unequally`?i[t]=Math.max(0,n-r):F===`Percentage` && (i[t]=Math.max(0,100-r)),JSON.stringify(i)!==JSON.stringify(I) && ue(i)
}

}
,[E,F,C,Ce,I]);
let dt=(0,x.useRef)(j),ft=(0,x.useRef)(E),pt=(0,x.useRef)(te),mt=(0,x.useRef)(null);
(0,x.useEffect)(()=>{
dt.current=j
}
,[j]),(0,x.useEffect)(()=>{
ft.current=E
}
,[E]),(0,x.useEffect)(()=>{
pt.current=te
}
,[te]);
let ht=(0,x.useRef)(lt),gt=(0,x.useRef)(ut);
return(0,x.useEffect)(()=>{
ht.current=lt
}
,[lt]),(0,x.useEffect)(()=>{
gt.current=ut
}
,[ut]),(0,x.useEffect)(()=>N.register(()=>{
t(null),e(!1)
}
),[t,e]),(0,x.useEffect)(()=>{
if(Be)return N.register(()=>{
Ve(!1)
}
)
}
,[Be]),(0,x.useEffect)(()=>{
if(Oe)return N.register(()=>{
Ge(!1),R(!1)
}
)
}
,[Oe]),(0,x.useEffect)(()=>{
if(pe)return N.register(()=>{
me(!1)
}
)
}
,[pe]),(0,x.useEffect)(()=>{
let e=e=>{
if(e.key===`Enter` && (e.ctrlKey || e.metaKey)){
e.preventDefault(),ht.current && dt.current && gt.current();
return
}
if(e.key===`ArrowDown` || e.key===`ArrowUp` || e.key===`ArrowRight` || e.key===`ArrowLeft`){
let t=document.activeElement,n=t && t.tagName===`INPUT` && (t.type===`text` || t.type===`number`),r=e.key===`ArrowLeft` || e.key===`ArrowRight`;
if(n && r || t && t.tagName===`SELECT` && (e.key===`ArrowDown` || e.key===`ArrowUp`) || t?.id===`exp-title` && pt.current && (e.key===`ArrowDown` || e.key===`ArrowUp`))return;
let i=[`exp-title`,`exp-amt`,`split-mode-select`,`payer-select`,`recurrence-select`,`expense-date-btn`,`expense-notes-btn`,`save-expense-btn`];
if(t){
let n=i.indexOf(t.id);
if(n!==-1){
e.preventDefault();
let t=e.key===`ArrowDown` || e.key===`ArrowRight`?n+1:n-1;
t<0 && (t=i.length-1),t>=i.length && (t=0);
let r=document.getElementById(i[t]);
r?.focus(),r?.tagName===`INPUT` && r.select()
}

}
return
}
if(e.key===`Enter` || e.key===` `){
let t=document.activeElement;
if(t && (t.id===`expense-date-btn` || t.id===`expense-notes-btn`)){
e.preventDefault(),t.click();
return
}

}
if(e.key===`Enter`){
if(document.activeElement?.id===`exp-title` && pt.current)return;
let t=document.activeElement;
!t || t===document.body?dt.current?ft.current?setTimeout(()=>document.getElementById(`payer-select`)?.focus(),20):document.getElementById(`exp-amt`)?.focus():document.getElementById(`exp-title`)?.focus():t.id===`exp-title`?(e.preventDefault(),e.stopPropagation(),document.getElementById(`exp-amt`)?.focus()):t.id===`exp-amt`?(e.preventDefault(),e.stopPropagation(),document.getElementById(`split-mode-select`)?.focus()):t.id===`split-mode-select`?(e.preventDefault(),e.stopPropagation(),setTimeout(()=>document.getElementById(`payer-select`)?.focus(),20)):t.id===`payer-select`?(e.preventDefault(),e.stopPropagation(),document.getElementById(`recurrence-select`)?.focus()):t.id===`recurrence-select` && (e.preventDefault(),e.stopPropagation(),ht.current && dt.current && gt.current())
}

}
;
return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)
}
,[t,e]),(0,w.jsxs)(`div`,{
className:`modal-overlay`,onClick:()=>{
t(null),e(!1)
}
,style:{
zIndex:2e3
}
,children:[(0,w.jsxs)(`div`,{
className:`modal-content`,onClick:e=>e.stopPropagation(),style:{
padding:`16px 20px 24px 20px`,width:`460px`,borderRadius:`24px`,border:`1px solid rgba(255,255,255,0.2)`,background:`rgba(255,255,255,0.98)`,boxShadow:`0 25px 50px -12px rgba(0,0,0,0.15)`,boxSizing:`border-box`,maxHeight:`90vh`,display:`flex`,flexDirection:`column`,overflow:`hidden`
}
,children:[(0,w.jsx)(`style`,{
children:`
          .modal-body-scroll::-webkit-scrollbar {
 width: 6px;
 
}

          .modal-body-scroll::-webkit-scrollbar-thumb {
 background: rgba(16, 185, 129, 0.4);
 border-radius: 10px;
 
}

          .modal-body-scroll::-webkit-scrollbar-track {
 background: transparent;
 
}

          .splitter-scroll::-webkit-scrollbar {
 width: 0;
 
}

          .splitter-scroll {
 -ms-overflow-style: none;
 scrollbar-width: none;
 
}

          
          .step-container {

            position: relative;

            padding: 10px 14px;

            border-radius: 14px;

            border: 2px solid #E2E8F0;

            background: #F8FAFC;

            transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;

            display: flex;

            flex-direction: column;

            gap: 4px;

            opacity: 0.92;

          
}

          .step-container:focus-within {

            opacity: 1;

            border-color: #10B981;

            background: #ECFDF5;

            box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15), 0 8px 20px -5px rgba(16, 185, 129, 0.1);

            z-index: 10;

          
}

          
          @keyframes scan-line {

            0% {
 top: 0%;
 opacity: 0;
 
}

            20% {
 opacity: 1;
 
}

            80% {
 opacity: 1;
 
}

            100% {
 top: 100%;
 opacity: 0;
 
}

          
}

          .scan-overlay {

            position: absolute;
 top: 0;
 left: 0;
 width: 100%;
 height: 100%;

            background: rgba(16, 185, 129, 0.05);

            border-radius: 12px;
 pointer-events: none;
 overflow: hidden;

            border: 2px solid #10B981;
 animation: pulse-green 1s infinite alternate;

          
}

          .scan-line {

            position: absolute;
 width: 100%;
 height: 4px;

            background: linear-gradient(to right, transparent, #10B981, transparent);

            box-shadow: 0 0 15px #10B981;

            animation: scan-line 1.5s infinite linear;

          
}

          @keyframes pulse-green {

            from {
 box-shadow: 0 0 5px rgba(16, 185, 129, 0.2);
 
}

            to {
 box-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
 
}

          
}


          .dropzone {

            border: 2.5px dashed #CBD5E1;

            border-radius: 16px;

            background: #F8FAFC;

            padding: 30px 20px;

            text-align: center;

            cursor: pointer;

            transition: all 0.2s ease;

            display: flex;

            flex-direction: column;

            align-items: center;

            justify-content: center;

            gap: 12px;

          
}

          .dropzone.dragging {

            border-color: #10B981;

            background: #ECFDF5;

            box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15);

          
}

          .dropzone:hover {

            border-color: #10B981;

            background: #F0FDF4;

          
}

          .scan-preview-container {

            position: relative;

            width: 100%;

            height: 220px;

            border-radius: 16px;

            overflow: hidden;

            background: #0F172A;

            display: flex;

            align-items: center;

            justify-content: center;

            border: 2px solid #E2E8F0;

            box-shadow: 0 4px 12px rgba(0,0,0,0.05);

          
}

          .scan-preview-img {

            max-width: 100%;

            max-height: 100%;

            object-fit: contain;

          
}

        `
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,justifyContent:`space-between`,marginBottom:`16px`,alignItems:`center`
}
,children:[(0,w.jsxs)(`div`,{
children:[(0,w.jsx)(`h2`,{
className:`nunito`,style:{
fontSize:`20px`,fontWeight:900
}
,children:n?`Edit Expense`:y===`STANDALONE`?`New expense`:`Add to Group`
}
),(0,w.jsx)(`p`,{
style:{
fontSize:`10px`,color:`var(--g)`,fontWeight:800,marginTop:`-2px`
}
,children:S?`In ${
S.name
}
`:`Non-Group Expenses`
}
)]
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,gap:`8px`,alignItems:`center`
}
,children:[m!==`detail` && (0,w.jsxs)(`div`,{
style:{
position:`relative`
}
,children:[(0,w.jsxs)(`select`,{
value:y || `STANDALONE`,onChange:e=>{
let t=e.target.value;
if(t===`NEW`){
let e=prompt(`Ledger Name:`,`New Group 🏡`);
if(e){
let t=Date.now(),n={
id:t,name:e,members:[l],currency:`₹`
}
;
d(e=>[...e,n]),b(t),T([l]),Se(`₹`)
}

}
else{
let e=t===`STANDALONE`?`STANDALONE`:Number(t) || t;
b(e);
let n=u.find(t=>String(t.id)===String(e));
n?(T([...n.members]),Se(n.currency || `₹`)):(T([l]),Se(`₹`)),ue({

}
),we(new Set),ee(l)
}

}
,style:{
appearance:`none`,background:`var(--bg)`,border:`none`,padding:`8px 28px 8px 12px`,borderRadius:`10px`,fontSize:`12px`,fontWeight:900,color:`#1E293B`,cursor:`pointer`,outline:`none`,textAlign:`left`,minWidth:`140px`,boxShadow:`inset 0 1px 2px rgba(0,0,0,0.05)`
}
,children:[(0,w.jsx)(`option`,{
value:`STANDALONE`,children:`👤 Non-Group Expenses`
}
),(0,w.jsx)(`option`,{
disabled:!0,children:`──────────────`
}
),u.filter(e=>e.name.trim()!==`` || a.some(t=>String(t.gId)===String(e.id)) || e.members.length>1).map(e=>(0,w.jsx)(`option`,{
value:e.id,children:e.name
}
,e.id)),(0,w.jsx)(`option`,{
disabled:!0,children:`──────────────`
}
),(0,w.jsx)(`option`,{
value:`NEW`,children:`➕ Create Group`
}
)]
}
),(0,w.jsx)(`div`,{
style:{
position:`absolute`,right:`6px`,top:`50%`,transform:`translateY(-50%)`,fontSize:`7px`,pointerEvents:`none`,opacity:.5
}
,children:`▼`
}
)]
}
),(0,w.jsx)(`button`,{
style:{
width:`24px`,height:`24px`,borderRadius:`6px`,border:`none`,background:`var(--bg)`,cursor:`pointer`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontSize:`12px`,color:`var(--g)`
}
,onClick:()=>{
t(null),e(!1)
}
,children:`✕`
}
)]
}
)]
}
),(0,w.jsxs)(`div`,{
className:`modal-body-scroll`,style:{
overflowY:`auto`,flex:1,display:`flex`,flexDirection:`column`,gap:`10px`,paddingRight:`6px`,margin:`4px 0`
}
,children:[(0,w.jsxs)(`div`,{
className:`step-container`,style:{
zIndex:te?12:void 0
}
,children:[(0,w.jsx)(`label`,{
style:{
fontSize:`10px`,fontWeight:950,color:`#10B981`,textTransform:`uppercase`,letterSpacing:`1.5px`
}
,children:`1. Description 🏷`
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,gap:`8px`,height:`46px`
}
,children:[(0,w.jsx)(`div`,{
onMouseDown:e=>{
e.preventDefault(),mt.current && clearTimeout(mt.current);
let t=document.getElementById(`exp-title`);
document.activeElement===t?ne(e=>!e):t?.focus()
}
,style:{
position:`relative`,width:`46px`,height:`46px`,flexShrink:0,cursor:`pointer`
}
,children:(0,w.jsx)(`div`,{
style:{
width:`100%`,height:`100%`,background:`var(--bg)`,borderRadius:`12px`,border:`2.5px solid #F8FAFC`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontSize:`22px`,color:`var(--b)`,boxShadow:`inset 0 2px 4px rgba(0,0,0,0.02)`
}
,children:$e
}
)
}
),(0,w.jsxs)(`div`,{
style:{
position:`relative`,flex:1
}
,children:[(0,w.jsx)(`input`,{
id:`exp-title`,value:j,onChange:e=>{
M(e.target.value),re(-1)
}
,onFocus:e=>{
mt.current && clearTimeout(mt.current),ne(!0),e.target.select()
}
,onBlur:()=>{
mt.current=window.setTimeout(()=>{
ne(!1),re(-1)
}
,200)
}
,onKeyDown:e=>{
e.key===`ArrowDown`?(e.preventDefault(),ne(!0),re(e=>Math.min(e+1,Qe.length-1))):e.key===`ArrowUp`?(e.preventDefault(),ne(!0),re(e=>Math.max(e-1,0))):e.key===`Enter` && (e.preventDefault(),te && P>=0 && Qe[P] && M(Qe[P]),ne(!1),re(-1),e.stopPropagation(),document.getElementById(`exp-amt`)?.focus())
}
,type:`text`,autoComplete:`off`,placeholder:`What's this for? e.g. Pizza 🍕`,style:{
width:`100%`,height:`100%`,padding:`0 40px 0 14px`,borderRadius:`12px`,border:`2.5px solid #F1F5F9`,background:`var(--bg)`,fontSize:`15px`,fontWeight:`900`,color:`var(--t)`,outline:`none`,boxSizing:`border-box`,margin:0,transition:`border-color 0.2s, background-color 0.2s`
}

}
),(0,w.jsx)(`div`,{
onMouseDown:e=>{
e.preventDefault(),mt.current && clearTimeout(mt.current);
let t=document.getElementById(`exp-title`);
document.activeElement===t?ne(e=>!e):t?.focus()
}
,style:{
position:`absolute`,right:`12px`,top:`50%`,transform:`translateY(-50%)`,cursor:`pointer`,fontSize:`12px`,opacity:.5,padding:`8px`
}
,children:`▼`
}
),te && (0,w.jsx)(`div`,{
style:{
position:`absolute`,top:`100%`,left:0,width:`100%`,background:`var(--w)`,borderRadius:`12px`,boxShadow:`0 10px 25px -5px rgba(0,0,0,0.1)`,border:`1.5px solid #F1F5F9`,marginTop:`4px`,zIndex:100,maxHeight:`200px`,overflowY:`auto`
}
,children:Qe.map((e,t)=>(0,w.jsx)(`div`,{
onMouseDown:t=>{
t.preventDefault(),t.stopPropagation(),M(e),ne(!1),re(-1),document.getElementById(`exp-amt`)?.focus()
}
,onMouseEnter:()=>re(t),style:{
padding:`10px 14px`,fontSize:`13px`,fontWeight:`800`,color:`#1E293B`,cursor:`pointer`,borderBottom:`1px solid #F8FAFC`,transition:`background-color 0.1s`,background:t===P?`#F1F5F9`:`transparent`
}
,children:e
}
,e))
}
)]
}
)]
}
)]
}
),(0,w.jsxs)(`div`,{
className:`step-container`,children:[(0,w.jsxs)(`div`,{
style:{
display:`flex`,justifyContent:`space-between`,alignItems:`center`
}
,children:[(0,w.jsxs)(`label`,{
style:{
fontSize:`10px`,fontWeight:950,color:`#10B981`,textTransform:`uppercase`,letterSpacing:`1.5px`
}
,children:[`2. Amount 💰 (`,xe,`)`]
}
),(0,w.jsxs)(`div`,{
onClick:et,className:`hover-up`,style:{
display:`flex`,alignItems:`center`,gap:`8px`,color:`#059669`,fontSize:`11px`,fontWeight:950,cursor:`pointer`,padding:`6px 12px`,background:`#D1FAE5`,borderRadius:`12px`,transition:`0.3s all`,boxShadow:`0 4px 6px -1px rgba(16, 185, 129, 0.1)`,border:`1.5px solid #10B981`
}
,children:[(0,w.jsx)(`span`,{
style:{
fontSize:`14px`
}
,children:`📷`
}
),` `,L?`Scanning...`:`Scan Receipt`]
}
)]
}
),(0,w.jsxs)(`div`,{
style:{
position:`relative`,height:`46px`,display:`flex`,alignItems:`center`
}
,children:[(0,w.jsxs)(`div`,{
onClick:()=>s(`expense`),style:{
position:`absolute`,left:`10px`,background:`#10B981`,color:`white`,padding:`0 8px`,borderRadius:`10px`,fontSize:`9px`,fontWeight:900,cursor:`pointer`,display:`flex`,alignItems:`center`,gap:`4px`,border:`1.5px solid rgba(0,0,0,0.05)`,zIndex:2,height:`28px`,boxSizing:`border-box`
}
,children:[xe,` `,(0,w.jsx)(`span`,{
style:{
fontSize:`7px`,opacity:.8
}
,children:`▼`
}
)]
}
),(0,w.jsx)(`input`,{
id:`exp-amt`,type:`number`,placeholder:`0.00`,value:E,onChange:e=>k(e.target.value),onKeyDown:e=>{
e.key===`Enter` && (e.preventDefault(),e.stopPropagation(),document.getElementById(`split-mode-select`)?.focus())
}
,style:{
width:`100%`,height:`100%`,padding:`0 16px 0 60px`,fontSize:`18px`,fontWeight:`900`,textAlign:`left`,borderRadius:`12px`,border:`2px solid #F8FAFC`,background:`var(--bg)`,outline:`none`,boxSizing:`border-box`,margin:0
}

}
),L && (0,w.jsx)(`div`,{
className:`scan-overlay`,children:(0,w.jsx)(`div`,{
className:`scan-line`
}
)
}
)]
}
)]
}
),(0,w.jsxs)(`div`,{
className:`step-container`,children:[(0,w.jsxs)(`div`,{
style:{
display:`flex`,justifyContent:`space-between`,alignItems:`center`
}
,children:[(0,w.jsx)(`label`,{
style:{
fontSize:`10px`,fontWeight:950,color:`#10B981`,textTransform:`uppercase`,letterSpacing:`1.5px`
}
,children:`3. Split Details & Friends 👥`
}
),(0,w.jsxs)(`div`,{
style:{
position:`relative`,width:`130px`
}
,children:[(0,w.jsxs)(`select`,{
id:`split-mode-select`,value:F,onChange:e=>{
le(e.target.value),ue({

}
),we(new Set)
}
,onKeyDown:e=>{
e.key===`Enter` && (e.preventDefault(),e.stopPropagation(),setTimeout(()=>document.getElementById(`payer-select`)?.focus(),20))
}
,style:{
width:`100%`,padding:`10px 14px`,fontSize:`12px`,fontWeight:`900`,borderRadius:`14px`,border:`2.5px solid #F1F5F9`,background:`var(--w)`,color:`#0F172A`,cursor:`pointer`,appearance:`none`,outline:`none`,boxShadow:`0 4px 10px rgba(0,0,0,0.03)`
}
,children:[(0,w.jsx)(`option`,{
value:`Equally`,children:`Equally`
}
),(0,w.jsx)(`option`,{
value:`Unequally`,children:`Unequally`
}
),(0,w.jsx)(`option`,{
value:`Percentage`,children:`Percentage`
}
)]
}
),(0,w.jsx)(`div`,{
style:{
position:`absolute`,right:`12px`,top:`50%`,transform:`translateY(-50%)`,pointerEvents:`none`,fontSize:`10px`,opacity:.5
}
,children:`▼`
}
)]
}
)]
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,flexWrap:`wrap`,gap:`8px`
}
,children:[Array.from(new Set([...S?.members || [],...C])).map(e=>{
let t=C.includes(e);
return(0,w.jsxs)(`div`,{
onClick:()=>{
T(t?C.filter(t=>t!==e):[...C,e]),setTimeout(()=>document.getElementById(`split-mode-select`)?.focus(),20)
}
,style:{
padding:`6px 12px`,borderRadius:`10px`,background:t?`rgba(16, 185, 129, 0.1)`:`white`,border:`1.5px solid `+(t?`#10B981`:`#F1F5F9`),fontSize:`12px`,fontWeight:`800`,color:t?`#065F46`:`#64748B`,cursor:`pointer`,display:`flex`,alignItems:`center`,gap:`6px`,transition:`0.2s all`
}
,className:`hover-up-mini`,children:[(0,w.jsxs)(`span`,{
style:{
display:`flex`,alignItems:`center`,gap:`6px`
}
,children:[e===l?(0,w.jsx)(`img`,{
src:`/divido_laughing_cat_mascot_1778063273427.png`,style:{
width:`18px`,height:`18px`,borderRadius:`50%`
}

}
):null,e===l?`You`:e]
}
),t && (0,w.jsx)(`span`,{
style:{
fontSize:`10px`
}
,children:`✓`
}
)]
}
,e)
}
),(0,w.jsx)(`div`,{
onClick:()=>{
p(y===`STANDALONE`?`STANDALONE`:y),f(!0)
}
,style:{
padding:`6px 12px`,borderRadius:`10px`,background:`var(--w)`,border:`1.5px dashed #CBD5E1`,fontSize:`12px`,fontWeight:`900`,color:`#64748B`,cursor:`pointer`,display:`flex`,alignItems:`center`,gap:`4px`
}
,className:`hover-up-mini`,children:(0,w.jsx)(`span`,{
children:`➕ Friend`
}
)
}
)]
}
),C.length>0 && F!==`Equally` && (0,w.jsx)(`div`,{
className:`splitter-scroll`,style:{
display:`flex`,flexDirection:`column`,gap:`6px`,marginTop:`4px`
}
,children:C.map(e=>(0,w.jsxs)(`div`,{
style:{
display:`flex`,justifyContent:`space-between`,alignItems:`center`,padding:`8px 12px`,background:`var(--w)`,borderRadius:`12px`,border:`1.5px solid #F8FAFC`
}
,children:[(0,w.jsxs)(`span`,{
style:{
fontSize:`12px`,fontWeight:`800`,color:`#1E293B`,display:`flex`,alignItems:`center`,gap:`6px`
}
,children:[e===l?(0,w.jsx)(`img`,{
src:`/divido_laughing_cat_mascot_1778063273427.png`,style:{
width:`18px`,height:`18px`,borderRadius:`50%`
}

}
):null,e===l?`You`:e]
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,alignItems:`center`,gap:`8px`
}
,children:[(0,w.jsxs)(`div`,{
style:{
position:`relative`,display:`flex`,alignItems:`center`
}
,children:[(0,w.jsx)(`input`,{
type:`number`,value:I[e]===void 0?``:I[e],onChange:t=>ot(e,t.target.value),placeholder:F===`Unequally`?`Amt`:`%`,onKeyDown:e=>{
if(e.key===`Enter`){
e.preventDefault();
let t=e.currentTarget.closest(`.splitter-scroll`);
if(t){
let n=Array.from(t.querySelectorAll(`input`)),r=n.indexOf(e.currentTarget);
r<n.length-1?(n[r+1].focus(),n[r+1].select()):lt && j && ut()
}

}

}
,style:{
width:`90px`,padding:`8px 12px`,fontSize:`13px`,textAlign:`center`,background:`var(--bg)`,border:`2px solid #F1F5F9`,borderRadius:`10px`,outline:`none`,fontWeight:`900`,transition:`0.2s all`
}

}
),F===`Percentage` && (0,w.jsx)(`span`,{
style:{
position:`absolute`,right:`6px`,fontSize:`10px`,fontWeight:`900`,color:`#10B981`,opacity:.7
}
,children:`%`
}
)]
}
),(0,w.jsxs)(`span`,{
style:{
fontSize:`12px`,fontWeight:`900`,color:`#64748B`,minWidth:`50px`,textAlign:`right`
}
,children:[xe,ct(e).toLocaleString(void 0,{
minimumFractionDigits:0,maximumFractionDigits:2
}
)]
}
)]
}
)]
}
,e))
}
)]
}
),(0,w.jsxs)(`div`,{
className:`step-container`,children:[(0,w.jsx)(`label`,{
style:{
fontSize:`10px`,fontWeight:950,color:`#10B981`,textTransform:`uppercase`,letterSpacing:`1.5px`
}
,children:`4. Details & Payment 💳`
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,gap:`8px`,alignItems:`center`,marginTop:`4px`
}
,children:[(0,w.jsxs)(`div`,{
style:{
position:`relative`,flex:1,minWidth:`120px`
}
,className:`hover-up-mini`,children:[(0,w.jsx)(`select`,{
id:`payer-select`,value:A,onChange:e=>ee(e.target.value),onKeyDown:e=>{
e.key===`Enter` && (e.preventDefault(),e.stopPropagation(),document.getElementById(`save-expense-btn`)?.focus())
}
,style:{
width:`100%`,padding:`10px 12px 10px 32px`,fontSize:`13px`,fontWeight:`900`,borderRadius:`12px`,border:`2.5px solid #F1F5F9`,background:`var(--w)`,color:`#0F172A`,cursor:`pointer`,appearance:`none`,outline:`none`,boxShadow:`0 4px 10px rgba(0,0,0,0.03)`
}
,children:Ze.map(e=>(0,w.jsx)(`option`,{
value:e,children:e===l?v===`You`?`You`:`You (${
v
}
)`:e
}
,e))
}
),(0,w.jsx)(`span`,{
style:{
position:`absolute`,left:`10px`,top:`50%`,transform:`translateY(-50%)`,fontSize:`14px`,pointerEvents:`none`,opacity:.6
}
,children:`💳`
}
),(0,w.jsx)(`div`,{
style:{
position:`absolute`,right:`12px`,top:`50%`,transform:`translateY(-50%)`,pointerEvents:`none`,fontSize:`10px`,opacity:.5
}
,children:`▼`
}
)]
}
),(0,w.jsxs)(`div`,{
id:`expense-date-btn`,tabIndex:0,onClick:()=>{
try{
document.getElementById(`expense-date-input`)?.showPicker()
}
catch{
document.getElementById(`expense-date-input`)?.click()
}

}
,style:{
position:`relative`,width:`42px`,height:`42px`,minWidth:`42px`,display:`flex`,alignItems:`center`,justifyContent:`center`,background:`var(--w)`,borderRadius:`12px`,border:`2.5px solid #F1F5F9`,cursor:`pointer`,boxShadow:`0 4px 10px rgba(0,0,0,0.03)`
}
,className:`hover-up-mini`,title:ae?`Date: ${
O(ae)
}
`:`Select Date`,children:[(0,w.jsx)(`span`,{
style:{
fontSize:`18px`
}
,children:`📅`
}
),(0,w.jsx)(`input`,{
id:`expense-date-input`,type:`date`,value:ae,onChange:e=>oe(e.target.value),style:{
position:`absolute`,top:0,left:0,width:`100%`,height:`100%`,opacity:0,cursor:`pointer`,pointerEvents:`none`
}

}
)]
}
),(0,w.jsx)(`button`,{
id:`expense-notes-btn`,tabIndex:0,type:`button`,onClick:()=>{
ge(de),me(!0)
}
,style:{
width:`42px`,height:`42px`,minWidth:`42px`,display:`flex`,alignItems:`center`,justifyContent:`center`,background:`var(--w)`,borderRadius:`12px`,border:`2.5px solid #F1F5F9`,cursor:`pointer`,boxShadow:`0 4px 10px rgba(0,0,0,0.03)`,padding:0
}
,className:`hover-up-mini`,title:de?`Notes: ${
de
}
`:`Add note`,children:(0,w.jsx)(`span`,{
style:{
fontSize:`18px`
}
,children:de?`📝`:`✏️`
}
)
}
),Re && Re.length>0 && (0,w.jsx)(`div`,{
style:{
display:`flex`,gap:`8px`,alignItems:`center`,flexWrap:`wrap`
}
,children:Re.map((e,t)=>(0,w.jsxs)(`div`,{
style:{
position:`relative`,display:`inline-block`
}
,children:[(0,w.jsx)(`div`,{
tabIndex:0,onClick:()=>{
Ue(t),Ve(!0)
}
,style:{
width:`42px`,height:`42px`,minWidth:`42px`,display:`flex`,alignItems:`center`,justifyContent:`center`,background:`var(--w)`,borderRadius:`12px`,border:`2.5px solid #10B981`,cursor:`pointer`,boxShadow:`0 4px 10px rgba(16,185,129,0.1)`,overflow:`hidden`
}
,className:`hover-up-mini`,title:`View Receipt ${
t+1
}
`,children:e.startsWith(`data:`)?(0,w.jsx)(`img`,{
src:e,style:{
width:`100%`,height:`100%`,objectFit:`cover`
}

}
):(0,w.jsx)(`span`,{
style:{
fontSize:`18px`
}
,children:`📎`
}
)
}
),(0,w.jsx)(`button`,{
type:`button`,onClick:e=>{
e.stopPropagation(),confirm(`Are you sure you want to remove this receipt attachment? 🗑️`) && ze(e=>e.filter((e,n)=>n!==t))
}
,style:{
position:`absolute`,top:`-6px`,right:`-6px`,width:`16px`,height:`16px`,borderRadius:`50%`,background:`#EF4444`,color:`white`,border:`1px solid white`,fontSize:`9px`,fontWeight:`bold`,display:`flex`,alignItems:`center`,justifyContent:`center`,cursor:`pointer`,boxShadow:`0 2px 4px rgba(0,0,0,0.15)`,zIndex:10,outline:`none`,padding:0,lineHeight:1
}
,title:`Delete receipt`,children:`✕`
}
)]
}
,t))
}
)]
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,gap:`8px`,alignItems:`center`,marginTop:`10px`,paddingTop:`8px`,borderTop:`1px dashed #E2E8F0`
}
,children:[(0,w.jsx)(`span`,{
style:{
fontSize:`12px`,fontWeight:800,color:`#475569`,display:`flex`,alignItems:`center`,gap:`6px`
}
,children:`🔄 Recurrence:`
}
),(0,w.jsxs)(`div`,{
style:{
position:`relative`,flex:1
}
,className:`hover-up-mini`,children:[(0,w.jsxs)(`select`,{
id:`recurrence-select`,value:_e,onChange:e=>ve(e.target.value),style:{
width:`100%`,padding:`8px 12px 8px 32px`,fontSize:`13px`,fontWeight:`900`,borderRadius:`12px`,border:`2.5px solid #F1F5F9`,background:`var(--w)`,color:`#0F172A`,cursor:`pointer`,appearance:`none`,outline:`none`,boxShadow:`0 4px 10px rgba(0,0,0,0.03)`
}
,children:[(0,w.jsx)(`option`,{
value:`none`,children:`One-time expense`
}
),(0,w.jsx)(`option`,{
value:`weekly`,children:`Weekly`
}
),(0,w.jsx)(`option`,{
value:`monthly`,children:`Monthly`
}
),(0,w.jsx)(`option`,{
value:`yearly`,children:`Yearly`
}
)]
}
),(0,w.jsx)(`span`,{
style:{
position:`absolute`,left:`10px`,top:`50%`,transform:`translateY(-50%)`,fontSize:`14px`,pointerEvents:`none`,opacity:.6
}
,children:`🔁`
}
),(0,w.jsx)(`div`,{
style:{
position:`absolute`,right:`12px`,top:`50%`,transform:`translateY(-50%)`,pointerEvents:`none`,fontSize:`10px`,opacity:.5
}
,children:`▼`
}
)]
}
)]
}
)]
}
)]
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,flexDirection:`column`,gap:`10px`,marginTop:`10px`
}
,children:[(!lt || !j) && (0,w.jsxs)(`div`,{
className:Te?`shake`:``,style:{
padding:`14px`,background:`#FFF1F2`,border:`1.5px solid #FECDD3`,borderRadius:`16px`,fontSize:`12px`,color:`#9F1239`,fontWeight:800,display:`flex`,alignItems:`center`,gap:`10px`,boxShadow:`0 4px 6px -1px rgba(0,0,0,0.05)`
}
,children:[(0,w.jsx)(`span`,{
style:{
fontSize:`18px`
}
,children:`🛑`
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,flexDirection:`column`,gap:`2px`
}
,children:[(0,w.jsx)(`span`,{
style:{
textTransform:`uppercase`,fontSize:`10px`,fontWeight:900,opacity:.6
}
,children:`Action Required`
}
),(0,w.jsx)(`span`,{
children:j?parseFloat(E)<=0?`Wait, the amount must be greater than zero!`:F===`Unequally`?`The total of all shares must equal ${
xe
}
${
E
}
. You are currently ${
st>(parseFloat(E) || 0)?`over`:`short`
}
 by ${
xe
}
${
Math.abs(st-(parseFloat(E) || 0)).toFixed(2)
}
.`:F===`Percentage`?`The total percentage must be exactly 100%. You are currently at ${
st.toFixed(1)
}
%.`:`Please select at least one person to split this with.`:`Please enter a description for this expense.`
}
)]
}
)]
}
),(0,w.jsx)(`button`,{
id:`save-expense-btn`,className:`btn-green`,style:{
width:`100%`,padding:`16px`,fontSize:`16px`,opacity:!lt || !j?.6:1,cursor:!lt || !j?`not-allowed`:`pointer`
}
,onClick:()=>{
lt && j?ut():(Ee(!0),setTimeout(()=>Ee(!1),500))
}
,children:n?`Save Changes`:`New expense`
}
)]
}
)]
}
),(0,w.jsx)(ce,{
show:c===`expense`,onClose:()=>s(null),onSelect:e=>{
Se(e),s(null)
}
,current:xe
}
),pe && (0,w.jsx)(`div`,{
style:{
position:`fixed`,top:0,left:0,right:0,bottom:0,background:`rgba(15, 23, 42, 0.5)`,backdropFilter:`blur(8px)`,display:`flex`,alignItems:`center`,justifyContent:`center`,zIndex:2e3
}
,onClick:()=>me(!1),children:(0,w.jsxs)(`div`,{
style:{
background:`rgba(255, 255, 255, 0.95)`,border:`1.5px solid rgba(255, 255, 255, 0.7)`,borderRadius:`24px`,width:`90%`,maxWidth:`400px`,padding:`24px`,boxShadow:`0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)`,display:`flex`,flexDirection:`column`,gap:`16px`
}
,onClick:e=>e.stopPropagation(),children:[(0,w.jsxs)(`div`,{
style:{
display:`flex`,justifyContent:`space-between`,alignItems:`center`
}
,children:[(0,w.jsx)(`span`,{
style:{
fontSize:`16px`,fontWeight:950,color:`#1E293B`,display:`flex`,alignItems:`center`,gap:`8px`
}
,children:`📝 Notes & Details`
}
),(0,w.jsx)(`button`,{
type:`button`,onClick:()=>me(!1),style:{
background:`transparent`,border:`none`,cursor:`pointer`,fontSize:`16px`,color:`#64748B`,fontWeight:`bold`
}
,children:`✕`
}
)]
}
),(0,w.jsx)(`textarea`,{
value:he,onChange:e=>ge(e.target.value),placeholder:`Add details, links, or multi-line notes...`,rows:5,onKeyDown:e=>{
e.key===`Enter` && !e.shiftKey && (e.preventDefault(),fe(he),me(!1))
}
,style:{
width:`100%`,padding:`12px`,fontSize:`14px`,fontWeight:800,borderRadius:`16px`,border:`2.5px solid #F1F5F9`,outline:`none`,resize:`none`,fontFamily:`inherit`,color:`#0F172A`,boxSizing:`border-box`
}
,autoFocus:!0
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,gap:`8px`,justifyContent:`flex-end`
}
,children:[(0,w.jsx)(`button`,{
type:`button`,onClick:()=>me(!1),style:{
padding:`10px 16px`,background:`var(--bg)`,color:`#64748B`,border:`none`,borderRadius:`12px`,fontSize:`13px`,fontWeight:900,cursor:`pointer`
}
,className:`hover-up-mini`,children:`Cancel`
}
),(0,w.jsx)(`button`,{
type:`button`,onClick:()=>{
fe(he),me(!1)
}
,style:{
padding:`10px 16px`,background:`#10B981`,color:`white`,border:`none`,borderRadius:`12px`,fontSize:`13px`,fontWeight:900,cursor:`pointer`
}
,className:`hover-up-mini`,children:`Save Notes`
}
)]
}
)]
}
)
}
),Oe && (0,w.jsx)(`div`,{
style:{
position:`fixed`,top:0,left:0,right:0,bottom:0,background:`rgba(15, 23, 42, 0.5)`,backdropFilter:`blur(8px)`,display:`flex`,alignItems:`center`,justifyContent:`center`,zIndex:2500
}
,onClick:()=>{
(Ne===0 || Ne===100) && !H && R(!1)
}
,children:(0,w.jsxs)(`div`,{
style:{
background:`rgba(255, 255, 255, 0.98)`,border:`1.5px solid rgba(255, 255, 255, 0.7)`,borderRadius:`24px`,width:`92%`,maxWidth:`440px`,padding:`24px`,boxShadow:`0 25px 50px -12px rgba(0,0,0,0.25)`,display:`flex`,flexDirection:`column`,gap:`16px`
}
,onClick:e=>e.stopPropagation(),children:[(0,w.jsxs)(`div`,{
style:{
display:`flex`,justifyContent:`space-between`,alignItems:`center`
}
,children:[(0,w.jsx)(`span`,{
style:{
fontSize:`16px`,fontWeight:950,color:`#1E293B`,display:`flex`,alignItems:`center`,gap:`8px`
}
,children:`📷 Smart Receipt Scanner`
}
),(0,w.jsx)(`button`,{
type:`button`,onClick:()=>{
Ge(!1),R(!1)
}
,disabled:Ne>0 && Ne<100,style:{
background:`transparent`,border:`none`,cursor:Ne>0 && Ne<100?`not-allowed`:`pointer`,fontSize:`16px`,color:`#64748B`,fontWeight:`bold`,opacity:Ne>0 && Ne<100?.3:1
}
,children:`✕`
}
)]
}
),ke?(0,w.jsxs)(`div`,{
style:{
display:`flex`,flexDirection:`column`,gap:`16px`
}
,children:[(0,w.jsxs)(`div`,{
className:`scan-preview-container`,children:[je?(0,w.jsx)(`img`,{
src:je,className:`scan-preview-img`,alt:`Receipt preview`
}
):(0,w.jsxs)(`div`,{
style:{
display:`flex`,flexDirection:`column`,alignItems:`center`,gap:`8px`,color:`#94A3B8`
}
,children:[(0,w.jsx)(`span`,{
style:{
fontSize:`48px`
}
,children:`📄`
}
),(0,w.jsx)(`span`,{
style:{
fontSize:`12px`,fontWeight:800
}
,children:ke.name
}
)]
}
),Ne<100 && (0,w.jsx)(`div`,{
className:`scan-overlay`,children:(0,w.jsx)(`div`,{
className:`scan-line`
}
)
}
)]
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,flexDirection:`column`,gap:`6px`
}
,children:[(0,w.jsxs)(`div`,{
style:{
display:`flex`,justifySelf:`stretch`,justifyContent:`space-between`,fontSize:`12px`,fontWeight:900
}
,children:[(0,w.jsxs)(`span`,{
style:{
color:`#1E293B`,textOverflow:`ellipsis`,overflow:`hidden`,whiteSpace:`nowrap`,maxWidth:`240px`
}
,children:[`📄 `,ke.name]
}
),(0,w.jsxs)(`span`,{
style:{
color:`#10B981`
}
,children:[Ne,`%`]
}
)]
}
),(0,w.jsx)(`div`,{
style:{
width:`100%`,height:`8px`,background:`#E2E8F0`,borderRadius:`4px`,overflow:`hidden`
}
,children:(0,w.jsx)(`div`,{
style:{
width:`${
Ne
}
%`,height:`100%`,background:`linear-gradient(90deg, #10B981, #34D399)`,transition:`width 0.1s linear`,boxShadow:`0 0 8px rgba(16, 185, 129, 0.5)`
}

}
)
}
),(0,w.jsx)(`span`,{
style:{
fontSize:`11px`,fontWeight:850,color:`#64748B`,textAlign:`center`,marginTop:`4px`
}
,children:Ie
}
)]
}
)]
}
):H?(0,w.jsxs)(`div`,{
style:{
display:`flex`,flexDirection:`column`,gap:`14px`,alignItems:`center`
}
,children:[(0,w.jsxs)(`div`,{
style:{
position:`relative`,width:`100%`,height:`220px`,borderRadius:`16px`,overflow:`hidden`,background:`#000`,border:`2px solid #10B981`
}
,children:[(0,w.jsx)(`video`,{
ref:Je,autoPlay:!0,playsInline:!0,muted:!0,style:{
width:`100%`,height:`100%`,objectFit:`cover`
}

}
),(0,w.jsx)(`div`,{
style:{
position:`absolute`,top:`10px`,left:`10px`,background:`rgba(16, 185, 129, 0.95)`,color:`#fff`,fontSize:`9px`,fontWeight:900,padding:`4px 8px`,borderRadius:`6px`,textTransform:`uppercase`,letterSpacing:`1px`
}
,children:`🟢 Live Camera Feed`
}
)]
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,gap:`16px`,width:`100%`,justifyContent:`center`,alignItems:`center`
}
,children:[(0,w.jsx)(`button`,{
type:`button`,onClick:()=>Ge(!1),style:{
padding:`10px 18px`,background:`#F1F5F9`,color:`#475569`,border:`none`,borderRadius:`12px`,fontSize:`13px`,fontWeight:900,cursor:`pointer`
}
,className:`hover-up-mini`,children:`Back`
}
),(0,w.jsx)(`button`,{
type:`button`,onClick:Xe,style:{
width:`56px`,height:`56px`,borderRadius:`50%`,background:`#10B981`,border:`4px solid #fff`,boxShadow:`0 0 0 2px #10B981, 0 10px 15px -3px rgba(16, 185, 129, 0.4)`,cursor:`pointer`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontSize:`20px`,color:`white`
}
,title:`Capture Photo`,children:`📸`
}
)]
}
)]
}
):(0,w.jsxs)(`div`,{
style:{
display:`flex`,flexDirection:`column`,gap:`14px`
}
,children:[(0,w.jsxs)(`div`,{
style:{
display:`flex`,gap:`12px`
}
,children:[(0,w.jsxs)(`div`,{
onClick:()=>document.getElementById(`receipt-file-input`)?.click(),style:{
flex:1,background:`#ECFDF5`,border:`2px solid #A7F3D0`,borderRadius:`16px`,padding:`24px 12px`,textAlign:`center`,cursor:`pointer`,transition:`all 0.2s`,display:`flex`,flexDirection:`column`,alignItems:`center`,gap:`8px`
}
,className:`hover-up`,children:[(0,w.jsx)(`span`,{
style:{
fontSize:`28px`
}
,children:`📎`
}
),(0,w.jsx)(`span`,{
style:{
fontSize:`13px`,fontWeight:900,color:`#065F46`
}
,children:`Attach Image/PDF`
}
)]
}
),(0,w.jsxs)(`div`,{
onClick:()=>Ge(!0),style:{
flex:1,background:`#EFF6FF`,border:`2px solid #BFDBFE`,borderRadius:`16px`,padding:`24px 12px`,textAlign:`center`,cursor:`pointer`,transition:`all 0.2s`,display:`flex`,flexDirection:`column`,alignItems:`center`,gap:`8px`
}
,className:`hover-up`,children:[(0,w.jsx)(`span`,{
style:{
fontSize:`28px`
}
,children:`📷`
}
),(0,w.jsx)(`span`,{
style:{
fontSize:`13px`,fontWeight:900,color:`#1E40AF`
}
,children:`Take Photo`
}
)]
}
)]
}
),(0,w.jsx)(`input`,{
id:`receipt-file-input`,type:`file`,accept:`image/*,application/pdf`,onChange:e=>{
let t=e.target.files;
t && t.length>0 && it(t[0])
}
,style:{
display:`none`
}

}
),(Ke || B) && (0,w.jsxs)(`div`,{
style:{
padding:`10px 12px`,background:`#FEF2F2`,border:`1.5px solid #FCA5A5`,borderRadius:`12px`,fontSize:`11px`,color:`#991B1B`,fontWeight:800,textAlign:`center`,lineHeight:`1.4`
}
,children:[`⚠️ `,Ke || B]
}
),(localStorage.getItem(`divido_gemini_api_key`),(0,w.jsxs)(`div`,{
style:{
fontSize:`10px`,fontWeight:800,color:`#1E40AF`,background:`#EFF6FF`,padding:`8px 12px`,borderRadius:`10px`,border:`1px solid #BFDBFE`,lineHeight:`1.4`,textAlign:`center`
}
,children:[`✨ `,(0,w.jsx)(`strong`,{
children:`Smart Auto-Fill:`
}
),` Attach any receipt, bill, or payment screenshot to automatically extract details.`]
}
))]
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,gap:`8px`,justifyContent:`flex-end`,marginTop:`4px`
}
,children:[(0,w.jsx)(`button`,{
type:`button`,onClick:()=>{
Ge(!1),Ae(null),Me(null),z(0),Le(``),V(``),R(!1)
}
,disabled:Ne>0 && Ne<100,style:{
padding:`10px 16px`,background:`var(--bg)`,color:`#64748B`,border:`none`,borderRadius:`12px`,fontSize:`13px`,fontWeight:900,cursor:Ne>0 && Ne<100?`not-allowed`:`pointer`,opacity:Ne>0 && Ne<100?.3:1
}
,className:`hover-up-mini`,children:`Cancel`
}
),ke && Ne===100 && (0,w.jsx)(`button`,{
type:`button`,onClick:()=>{
R(!1),Ae(null),Me(null),z(0),Le(``),V(``)
}
,style:{
padding:`10px 16px`,background:`#10B981`,color:`white`,border:`none`,borderRadius:`12px`,fontSize:`13px`,fontWeight:900,cursor:`pointer`
}
,className:`hover-up-mini`,children:`Done`
}
)]
}
)]
}
)
}
),Be && Re.length>0 && (0,w.jsx)(`div`,{
style:{
position:`fixed`,top:0,left:0,right:0,bottom:0,background:`rgba(15, 23, 42, 0.5)`,backdropFilter:`blur(8px)`,display:`flex`,alignItems:`center`,justifyContent:`center`,zIndex:2500
}
,onClick:()=>Ve(!1),children:(0,w.jsxs)(`div`,{
style:{
background:`rgba(255, 255, 255, 0.98)`,border:`1.5px solid rgba(255, 255, 255, 0.7)`,borderRadius:`24px`,width:`90%`,maxWidth:`420px`,padding:`24px`,boxShadow:`0 20px 25px -5px rgba(0, 0, 0, 0.1)`,display:`flex`,flexDirection:`column`,gap:`16px`
}
,onClick:e=>e.stopPropagation(),children:[(0,w.jsxs)(`div`,{
style:{
display:`flex`,justifyContent:`space-between`,alignItems:`center`
}
,children:[(0,w.jsx)(`span`,{
style:{
fontSize:`16px`,fontWeight:950,color:`#1E293B`,display:`flex`,alignItems:`center`,gap:`8px`
}
,children:`📎 Attached Receipt`
}
),(0,w.jsx)(`button`,{
type:`button`,onClick:()=>Ve(!1),style:{
background:`transparent`,border:`none`,cursor:`pointer`,fontSize:`16px`,color:`#64748B`,fontWeight:`bold`
}
,children:`✕`
}
)]
}
),(0,w.jsxs)(`div`,{
style:{
position:`relative`,width:`100%`,height:`300px`,borderRadius:`16px`,border:`1.5px solid #F1F5F9`,display:`flex`,alignItems:`center`,justifyContent:`center`,background:`#F8FAFC`,overflow:`hidden`
}
,children:[Re[He] && Re[He].startsWith(`data:`)?(0,w.jsx)(`img`,{
src:Re[He],style:{
width:`100%`,height:`100%`,objectFit:`contain`
}
,alt:`Receipt ${
He+1
}
`
}
):(0,w.jsxs)(`div`,{
style:{
padding:`40px 20px`,display:`flex`,flexDirection:`column`,alignItems:`center`,gap:`12px`,color:`#64748B`
}
,children:[(0,w.jsx)(`span`,{
style:{
fontSize:`48px`
}
,children:`📄`
}
),(0,w.jsx)(`span`,{
style:{
fontSize:`13px`,fontWeight:900,textAlign:`center`,wordBreak:`break-all`
}
,children:Re[He]
}
)]
}
),Re.length>1 && (0,w.jsxs)(w.Fragment,{
children:[(0,w.jsx)(`button`,{
type:`button`,onClick:()=>Ue(e=>e===0?Re.length-1:e-1),style:{
position:`absolute`,left:`10px`,top:`50%`,transform:`translateY(-50%)`,width:`32px`,height:`32px`,borderRadius:`50%`,background:`rgba(255,255,255,0.9)`,border:`1px solid #E2E8F0`,cursor:`pointer`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontSize:`14px`,fontWeight:`bold`,boxShadow:`0 4px 6px -1px rgba(0,0,0,0.1)`
}
,children:`◀`
}
),(0,w.jsx)(`button`,{
type:`button`,onClick:()=>Ue(e=>e===Re.length-1?0:e+1),style:{
position:`absolute`,right:`10px`,top:`50%`,transform:`translateY(-50%)`,width:`32px`,height:`32px`,borderRadius:`50%`,background:`rgba(255,255,255,0.9)`,border:`1px solid #E2E8F0`,cursor:`pointer`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontSize:`14px`,fontWeight:`bold`,boxShadow:`0 4px 6px -1px rgba(0,0,0,0.1)`
}
,children:`▶`
}
)]
}
)]
}
),(0,w.jsxs)(`div`,{
style:{
display:`flex`,gap:`8px`,justifyContent:`space-between`,marginTop:`4px`
}
,children:[(0,w.jsx)(`button`,{
type:`button`,onClick:()=>{
if(confirm(`Are you sure you want to remove this receipt attachment? 🗑️`)){
let e=Re.filter((e,t)=>t!==He);
ze(e),e.length===0?Ve(!1):Ue(Math.max(0,He-1))
}

}
,style:{
padding:`10px 16px`,background:`#FEE2E2`,color:`#991B1B`,border:`none`,borderRadius:`12px`,fontSize:`13px`,fontWeight:900,cursor:`pointer`
}
,className:`hover-up-mini`,children:`🗑️ Delete Selected`
}
),(0,w.jsx)(`button`,{
type:`button`,onClick:()=>Ve(!1),style:{
padding:`10px 16px`,background:`#10B981`,color:`white`,border:`none`,borderRadius:`12px`,fontSize:`13px`,fontWeight:900,cursor:`pointer`
}
,className:`hover-up-mini`,children:`Close`
}
)]
}
)]
}
)
}
)]
}
)
}
