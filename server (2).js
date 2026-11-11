import express from 'express';import crypto from 'crypto';import pg from 'pg';import {Readable} from 'stream';
const E=process.env,T=E.BOT_TOKEN,OW=(E.ADMIN_IDS||'1424001997').split(',').map(Number),CH=E.CHANNEL||'@KlepaUp',BOT=E.BOT_USERNAME||'',PER=1000,URL_=(E.PUBLIC_URL||E.RENDER_EXTERNAL_URL||'').replace(/\/$/,''),SEC=crypto.createHash('sha256').update(T||'x').digest('hex').slice(0,24);
const PERMS=['users','stars','nft','promo','ban','roles','support','reviews'],MD=['google/gemini-2.5-flash','openai/gpt-4o-mini','openrouter/auto'];
const db=new pg.Pool({connectionString:E.DATABASE_URL,ssl:/localhost|127\.0/.test(E.DATABASE_URL||'')?false:{rejectUnauthorized:false}});
await db.query('create table if not exists d(c text,id text,j jsonb,t bigint,primary key(c,id))');
const get=async(c,i)=>(await db.query('select j from d where c=$1 and id=$2',[c,''+i])).rows[0]?.j;
const put=(c,i,j)=>db.query('insert into d values($1,$2,$3,$4) on conflict(c,id) do update set j=$3,t=$4',[c,''+i,j,Date.now()]);
const all=async(c,n=300)=>(await db.query('select j from d where c=$1 order by t desc limit $2',[c,n])).rows.map(r=>r.j);
const tg=(m,b)=>fetch(`https://api.telegram.org/bot${T}/${m}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.json()).catch(()=>({}));
const say=(id,t,x={})=>tg('sendMessage',{chat_id:id,text:t,parse_mode:'HTML',...x});
const esc=s=>String(s??'').replace(/[<&>]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])).slice(0,2000);
const pub=u=>({id:u.id,name:u.name,un:u.un,v:!!u.v,title:u.title||'',role:u.role||'user',num:u.num||'',inv:u.inv||[],banned:!!u.ban});
const perms=u=>OW.includes(u.id)?['*']:u.role==='admin'?u.perms||[]:[];
const can=(u,p)=>{const x=perms(u);return x.includes('*')||x.includes(p)};
function auth(init){try{const p=new URLSearchParams(init),h=p.get('hash');p.delete('hash');const s=[...p].map(([k,v])=>k+'='+v).sort().join('\n'),k=crypto.createHmac('sha256','WebAppData').update(T).digest();
 if(crypto.createHmac('sha256',k).update(s).digest('hex')!==h||Date.now()/1e3-p.get('auth_date')>6048e2)return null;const u=JSON.parse(p.get('user'));u.sp=p.get('start_param');return u}catch{return null}}
async function touch(f,sp){let u=await get('u',f.id);const n=[f.first_name,f.last_name].filter(Boolean).join(' ')||'User',w=!u;
 if(w){u={id:f.id,name:n,bal:100,inv:[],pend:{s:0,n:[]},refs:0,ru:0,recent:[],promos:[],joined:Date.now()};const m=/^ref_(\d+)$/.exec(sp||'');if(m&&+m[1]!==f.id&&await get('u',m[1]))u.by=+m[1]}
 if(w||Date.now()-(u.seen||0)>3e4||u.name!==n){u.name=n;u.un=f.username||'';u.seen=Date.now();await put('u',u.id,u)}return u}
async function chk(u){if(!u.by||u.ok)return;const r=await tg('getChatMember',{chat_id:CH,user_id:u.id});if(!['member','administrator','creator'].includes(r.result?.status))return false;
 u.ok=1;await put('u',u.id,u);const p=await get('u',u.by);if(p){p.refs=(p.refs||0)+1;p.ru=(p.ru||0)+1;p.recent=[{name:u.name,t:Date.now()},...(p.recent||[])].slice(0,10);await put('u',p.id,p);say(p.id,`🎉 <b>${esc(u.name)}</b> подписался на канал — вам +${PER} ⭐`)}return true}
async function supAdd(u,t){const s=(await get('s',u.id))||{uid:u.id,m:[]};s.name=u.name;s.m=[...s.m,{f:'u',t:String(t).slice(0,800),ts:Date.now()}].slice(-100);await put('s',u.id,s);OW.forEach(i=>say(i,`💬 <b>${esc(u.name)}</b> (<code>${u.id}</code>): ${esc(t)}`))}
const revAdd=(u,t,s)=>put('r',u.id,{uid:u.id,name:u.name,v:!!u.v,rate:Math.min(5,Math.max(1,+s||5)),text:String(t).trim().slice(0,600),ts:Date.now()});
const app=express();app.use(express.json({limit:'200kb'}));
app.get('/config.js',(q,r)=>r.type('js').send('window.KCFG='+JSON.stringify({bot:BOT,app:E.APP_SHORT||''})));
const rl=new Map();
const authz=async(q,r,n)=>{try{const f=auth(q.body?.initData||q.get('x-init')||'');if(!f)return r.status(401).json({e:'auth'});const now=Date.now(),a=(rl.get(f.id)||[]).filter(t=>now-t<1e4);if(a.length>40)return r.status(429).json({e:'Слишком часто'});a.push(now);rl.set(f.id,a);q.u=await touch(f,f.sp);n()}catch(e){console.error(e);r.status(500).json({e:'server'})}};
app.post('/api/ai',authz,async(q,r)=>{const b=q.body,up=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+E.OPENROUTER_KEY,'x-title':'Klepa Up'},body:JSON.stringify({model:MD.includes(b.model)?b.model:MD[0],messages:(b.messages||[]).slice(-30),stream:!!b.stream,max_tokens:Math.min(b.max_tokens||800,1200),temperature:b.temperature})}).catch(()=>null);
 if(!up)return r.status(502).end();r.status(up.status).type(up.headers.get('content-type')||'application/json');Readable.fromWeb(up.body).pipe(r)});
app.post('/api/:a',authz,async(q,r)=>{const u=q.u,b=q.body,ok=o=>r.json(o||{ok:1}),no=e=>r.status(400).json({e});
try{switch(q.params.a){
case 'me':return ok({u:pub(u),perms:perms(u),ch:CH,need:!!(u.by&&!u.ok)});
case 'sync':await chk(u);return ok({count:u.refs||0,recent:u.recent||[],unclaimed:u.ru||0,need:!!(u.by&&!u.ok)});
case 'claim':{const n=u.ru||0;u.ru=0;await put('u',u.id,u);return ok({claimed:n})}
case 'snap':u.bal=+b.bal||0;u.inv=(b.inv||[]).slice(0,300).map(x=>({k:String(x.k).slice(0,20),n:String(x.n).slice(0,40),nft:!!x.nft}));u.num=String(b.num||'').slice(0,30);await put('u',u.id,u);return ok();
case 'inbox':{const p=u.pend||{s:0,n:[]};u.pend={s:0,n:[]};if(p.s||p.n.length)await put('u',u.id,u);return ok(p)}
case 'promo':{const c=String(b.code||'').trim().toLowerCase(),p=await get('p',c);if(!p||(p.max&&p.used>=p.max))return no('Промокод не найден');if((u.promos||[]).includes(c))return no('Промокод уже использован');
 p.used=(p.used||0)+1;u.promos=[...(u.promos||[]),c];u.pend=u.pend||{s:0,n:[]};u.pend.s+=p.s||0;u.pend.n.push(...(p.n||[]));await put('p',c,p);await put('u',u.id,u);return ok()}
case 'chatget':return ok({m:(await all('c',60)).reverse()});
case 'chatsend':{if(u.ban)return no('Вы заблокированы');const t=String(b.text||'').trim().slice(0,500);if(!t)return no('');const ts=Date.now();await put('c',ts+'-'+u.id,{ts,uid:u.id,name:u.name,v:!!u.v,title:u.title||'',num:u.num||'',text:t});return ok()}
case 'profile':{const p=await get('u',b.id);return p?ok({p:pub(p),mod:can(u,'ban')}):no('Не найден')}
case 'supget':return ok({m:(await get('s',u.id))?.m||[]});
case 'supsend':if(u.ban)return no('Вы заблокированы');if(!String(b.text||'').trim())return no('');await supAdd(u,b.text);return ok();
case 'revget':return ok({r:await all('r',50)});
case 'revadd':if(u.ban)return no('Вы заблокированы');if(!String(b.text||'').trim())return no('Напишите отзыв');await revAdd(u,b.text,b.rate);return ok();
case 'a_users':{if(!can(u,'users'))return no('Нет прав');const s=String(b.q||'').toLowerCase();let L=await all('u',2000);if(s)L=L.filter(x=>(x.name+(x.un||'')+x.id).toLowerCase().includes(s));return ok({n:L.length,l:L.slice(0,100).map(x=>({...pub(x),bal:x.bal||0,refs:x.refs||0,seen:x.seen,perms:x.perms||[]}))})}
case 'a_give':{const t=await get('u',b.id);if(!t)return no('Не найден');const s=+b.stars|0,k=b.nft;if(s&&!can(u,'stars'))return no('Нет прав');if(k&&!can(u,'nft'))return no('Нет прав');t.pend=t.pend||{s:0,n:[]};if(s)t.pend.s+=s;if(k)t.pend.n.push(String(k));await put('u',t.id,t);say(t.id,`🎁 Администратор выдал вам ${s?s+' ⭐ ':''}${k?'NFT-подарок':''}. Откройте приложение!`);return ok()}
case 'a_role':{if(!can(u,'roles'))return no('Нет прав');const t=await get('u',b.id);if(!t||OW.includes(t.id))return no('Нельзя');if('v' in b)t.v=!!b.v;if('title' in b)t.title=String(b.title).slice(0,30);if('role' in b)t.role=b.role==='admin'?'admin':'user';if(b.perms)t.perms=b.perms.filter(x=>PERMS.includes(x));await put('u',t.id,t);return ok()}
case 'a_ban':{if(!can(u,'ban'))return no('Нет прав');const t=await get('u',b.id);if(!t||OW.includes(t.id))return no('Нельзя');t.ban=!!b.on;await put('u',t.id,t);say(t.id,b.on?'⛔ Вы заблокированы.':'✅ Блокировка снята.');return ok()}
case 'a_promoadd':{if(!can(u,'promo'))return no('Нет прав');const c=String(b.code||'').trim().toLowerCase().slice(0,30);if(!c)return no('Введите код');await put('p',c,{code:c,s:+b.stars|0,n:b.nft?[b.nft]:[],max:+b.max|0,used:0});return ok()}
case 'a_promos':if(!can(u,'promo'))return no('Нет прав');return ok({l:await all('p',100)});
case 'a_sup':if(!can(u,'support'))return no('Нет прав');return ok({l:await all('s',100)});
case 'a_supreply':{if(!can(u,'support'))return no('Нет прав');const s=await get('s',b.id);if(!s)return no('Нет диалога');s.m.push({f:'a',t:String(b.text||'').slice(0,800),ts:Date.now()});await put('s',s.uid,s);say(s.uid,`💬 <b>Поддержка:</b> ${esc(b.text)}`);return ok()}
case 'a_revdel':{if(!can(u,'reviews'))return no('Нет прав');await db.query("delete from d where c='r' and id=$1",[''+b.id]);return ok()}
default:return no('unknown')}}catch(e){console.error(e);r.status(500).json({e:'server'})}});
app.post('/tg/'+SEC,async(q,r)=>{r.sendStatus(200);const x=q.body;try{
 if(x.callback_query){const c=x.callback_query,u=await touch(c.from),s=await chk(u);return tg('answerCallbackQuery',{callback_query_id:c.id,text:s===false?'Сначала подпишитесь на канал':'Готово ✅',show_alert:true})}
 const m=x.message;if(!m?.text)return;const [cmd,...rs]=m.text.split(' '),arg=rs.join(' ').trim(),st=/^\/start/.test(cmd),u=await touch(m.from,st?arg:''),web={text:'🎮 Открыть Klepa Up',web_app:{url:URL_}},id=m.chat.id;
 if(st){await say(id,`Привет, <b>${esc(u.name)}</b>! Открывай кейсы, собирай NFT-подарки и приглашай друзей: ${PER} ⭐ за каждого.`+(u.by&&!u.ok?`\n\n⚠️ Подпишитесь на ${CH}, иначе пригласивший не получит награду.`:''),{reply_markup:{inline_keyboard:[[web],[{text:'📢 Канал',url:'https://t.me/'+CH.slice(1)}],[{text:'✅ Проверить подписку',callback_data:'chk'}]]}});await chk(u)}
 else if(cmd==='/review'&&arg){if(u.ban)return;await revAdd(u,arg,5);say(id,'Спасибо за отзыв! ⭐')}
 else if(cmd==='/reviews'){const L=await all('r',5);say(id,L.map(x=>`${'★'.repeat(x.rate)} <b>${esc(x.name)}</b>\n${esc(x.text)}`).join('\n\n')||'Отзывов пока нет. Напишите: /review ваш текст')}
 else if(cmd==='/support'&&arg){if(u.ban)return;await supAdd(u,arg);say(id,'Отправлено. Ответ придёт сюда.')}
 else if(cmd==='/admin'&&perms(u).length)say(id,'Админ-панель: в приложении Профиль → Админ-панель',{reply_markup:{inline_keyboard:[[web]]}});
 else say(id,'Команды: /review текст, /reviews, /support текст',{reply_markup:{inline_keyboard:[[web]]}})}catch(e){console.error(e)}});
app.use(express.static('public',{maxAge:'1h'}));
app.listen(E.PORT||3000,async()=>{console.log('up');if(!T||!URL_)return console.log('Нужны BOT_TOKEN и PUBLIC_URL');
 await tg('setWebhook',{url:URL_+'/tg/'+SEC,allowed_updates:['message','callback_query']});await tg('setChatMenuButton',{menu_button:{type:'web_app',text:'Играть',web_app:{url:URL_}}});
 await tg('setMyCommands',{commands:[{command:'start',description:'Запуск'},{command:'reviews',description:'Отзывы'},{command:'review',description:'Оставить отзыв'},{command:'support',description:'Поддержка'}]})});
