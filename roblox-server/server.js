// Roblox 2007 game server: serves the game and handles accounts. No dependencies. Node 16+.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000;
const OWNER=(process.env.OWNER_NAME||'yuoop31').toLowerCase();
const DATA_DIR=process.env.DATA_DIR||process.env.RAILWAY_VOLUME_MOUNT_PATH||path.join(__dirname,'data'); // Railway sets RAILWAY_VOLUME_MOUNT_PATH automatically when a volume is attached
const DB_FILE=path.join(DATA_DIR,'users.json');
fs.mkdirSync(DATA_DIR,{recursive:true});
let db={users:{},sessions:{}};
try{db=JSON.parse(fs.readFileSync(DB_FILE,'utf8'))}catch(e){}
db.users=db.users||{};db.sessions=db.sessions||{};
function save(){const t=DB_FILE+'.tmp';fs.writeFileSync(t,JSON.stringify(db));fs.renameSync(t,DB_FILE)}
// ---- username rules (same as the client)
const STRONG=['fuck','shit','bitch','cunt','whore','slut','nigg','fagg','retard','nazi','hitler','porn','penis','vagina','piss','bastard','asshole','dildo','blowjob','jizz','pedo','molest','kkk','rapist','suicide','kys','tits','twat','wank'];
const WEAK=['ass','sex','dick','cock','rape','damn','crap','nude','naked','hell','fag','gay','kill','die','drug','weed','gun','cum','anal','boob','boobs'];
const WEAK_NAME=['ass','sex','dick','cock','rape','nude','fag','pussy','porn','cum','anal','boob','boobs'];
const RESERVED=['admin','administrator','moderator','mod','roblox','system','server','guest','player','owner','staff','builder','builderman','robloxian','undefined','null','test'];
const leet={'0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','8':'b','@':'a','$':'s','!':'i','+':'t'};
const coll=s=>s.replace(/(.)\1+/g,'$1');
const norm=s=>s.toLowerCase().replace(/[0134578@$!+]/g,c=>leet[c]).replace(/[^a-z]/g,'');
function hasStrong(s){const n=norm(s),c=coll(n);return STRONG.some(w=>n.includes(w)||(coll(w).length>=4&&c.includes(coll(w))))}
function tokensOf(s){return s.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean)}
function hasWeakName(s){return tokensOf(s).some(t=>WEAK_NAME.includes(t))}
function skel(s){return s.toLowerCase().replace(/[il1|]/g,'l').replace(/[0o]/g,'o').replace(/[5s]/g,'s').replace(/_/g,'')}

function checkName(name){
 if(typeof name!=='string')return'Invalid username.';
 if(name.length<3||name.length>20)return'Username must be 3-20 characters.';
 if(!/^[A-Za-z0-9_]+$/.test(name))return'Only letters, numbers and underscore allowed.';
 if(name[0]==='_'||name[name.length-1]==='_')return'Username cannot start or end with an underscore.';
 if((name.match(/_/g)||[]).length>1)return'Only one underscore allowed.';
 if(/^\d+$/.test(name))return'Username cannot be only numbers.';
 const l=name.toLowerCase();
 if(l!==OWNER){
  if(skel(name)===skel(OWNER))return'That username is reserved.';
  if(RESERVED.includes(l)||/^npc\d*$/.test(l)||/^(admin|mod|roblox|staff)/.test(l))return'That username is reserved.';
  if(hasStrong(name)||hasWeakName(name))return'That username is not appropriate. Pick another one.';
 }
 const sk=skel(name);
 for(const k in db.users)if(k===l||skel(db.users[k].name)===sk)return'That username is already taken.';
 return'';
}
// ---- passwords + sessions
function hashPw(pw,salt){return crypto.scryptSync(pw,salt,64).toString('hex')}
function newSession(key){const t=crypto.randomBytes(32).toString('hex');db.sessions[t]={u:key,t:Date.now()};save();return t}
function userFromReq(req){const h=req.headers.authorization||'';const t=h.startsWith('Bearer ')?h.slice(7):'';const s=db.sessions[t];return s&&db.users[s.u]?db.users[s.u]:null}
const pub=u=>({name:u.name,owner:u.name.toLowerCase()===OWNER});
// ---- crude rate limit: 20 auth attempts / 10 min / IP
const hits={};
function limited(ip){const n=Date.now(),a=(hits[ip]=(hits[ip]||[]).filter(t=>n-t<600000));if(a.length>=20)return true;a.push(n);return false}
function body(req){return new Promise((ok,no)=>{let d='';req.on('data',c=>{d+=c;if(d.length>4096){no();req.destroy()}});req.on('end',()=>{try{ok(JSON.parse(d||'{}'))}catch(e){ok({})}})})}
function send(res,code,obj){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj))}
const GAME=['index.html','ROBLOX 2007.html'].map(f=>path.join(__dirname,f)).find(f=>fs.existsSync(f));
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://x');const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
   if(!GAME){res.writeHead(500);return res.end('Game file missing: put ROBLOX 2007.html next to server.js')}
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return fs.createReadStream(GAME).pipe(res)}
  if(url.pathname==='/api/check'&&req.method==='GET'){const e=checkName(url.searchParams.get('name')||'');return send(res,200,{ok:!e,error:e})}
  if(url.pathname==='/api/me'&&req.method==='GET'){const u=userFromReq(req);return u?send(res,200,pub(u)):send(res,401,{error:'Not logged in.'})}
  if(url.pathname==='/api/logout'&&req.method==='POST'){const h=(req.headers.authorization||'').slice(7);delete db.sessions[h];save();return send(res,200,{ok:true})}
  if(url.pathname==='/api/signup'&&req.method==='POST'){
   if(limited(ip))return send(res,429,{error:'Too many attempts. Try again later.'});
   const b=await body(req),name=String(b.name||'').trim(),pw=String(b.pw||'');
   const e=checkName(name);if(e)return send(res,400,{error:e});
   if(pw.length<6||pw.length>64)return send(res,400,{error:'Password must be 6-64 characters.'});
   if(pw.toLowerCase()===name.toLowerCase())return send(res,400,{error:'Password cannot match your username.'});
   const key=name.toLowerCase(),salt=crypto.randomBytes(16).toString('hex');
   db.users[key]={name,salt,hash:hashPw(pw,salt),created:Date.now()};
   const token=newSession(key);return send(res,200,{token,...pub(db.users[key])})}
  if(url.pathname==='/api/login'&&req.method==='POST'){
   if(limited(ip))return send(res,429,{error:'Too many attempts. Try again later.'});
   const b=await body(req),key=String(b.name||'').trim().toLowerCase(),u=db.users[key];
   const ok=u&&crypto.timingSafeEqual(Buffer.from(hashPw(String(b.pw||''),u.salt),'hex'),Buffer.from(u.hash,'hex'));
   if(!ok)return send(res,401,{error:'Wrong username or password.'});
   const token=newSession(key);return send(res,200,{token,...pub(u)})}
  res.writeHead(404);res.end('Not found');
 }catch(e){try{send(res,500,{error:'Server error.'})}catch(_){}}
}).listen(PORT,()=>console.log('Game server on http://localhost:'+PORT+'  owner='+OWNER));
