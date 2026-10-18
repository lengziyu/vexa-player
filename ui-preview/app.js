'use strict';

const paths = {
  wall:'M3 3h11v18H3z M18 3h3v8h-3z M18 15h3v6h-3z',
  library:'M3 5h18v15H3z M7 2v3 M17 2v3 M3 10h18 M8 10v10 M16 10v10',
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  plus:'M12 5v14 M5 12h14',
  shield:'m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3Z M9 12l2 2 4-4',
  settings:'m9 3-.5 3-2 1-2.8-1-2 4L4 12v2l-2.3 2 2 4 2.8-1 2 1 .5 3h5l.5-3 2-1 2.8 1 2-4-2.3-2v-2l2.3-2-2-4-2.8 1-2-1-.5-3H9Z M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  eye:'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  bookmark:'M6 3h12v18l-6-4-6 4V3Z',
  sparkles:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z M20 2v4 M18 4h4',
  focus:'M3 4h12v16H3z M18 4h3v6h-3z M18 14h3v6h-3z',
  grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  chevron:'m8 10 4 4 4-4',
  crop:'M3 8V3h5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5 M8 8h8v8H8z',
  expand:'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5',
  mouse:'M8 3h8a3 3 0 0 1 3 3v9a7 7 0 0 1-14 0V6a3 3 0 0 1 3-3Z M12 3v6',
  wave:'M3 10v4 M7 6v12 M11 3v18 M15 7v10 M19 10v4 M23 8v8',
  back:'M4 8V3 M4 8h5 M4 8a9 9 0 1 1-1 8 M9 11v5 M13 11h3v5h-3z',
  forward:'M20 8V3 M20 8h-5 M20 8a9 9 0 1 0 1 8 M8 11v5 M12 11h3v5h-3z',
  pause:'M8 5h2v14H8z M14 5h2v14h-2z',
  play:'m8 4 12 8-12 8V4Z',
  shuffle:'M3 5h3c5 0 7 14 12 14h3 M17 15l4 4-4 4 M3 19h3c2 0 3-2 5-6 M13 8c2-3 3-3 5-3h3 M17 1l4 4-4 4',
  repeat:'m17 2 4 4-4 4 M3 11V8a2 2 0 0 1 2-2h16 M7 22l-4-4 4-4 M21 13v3a2 2 0 0 1-2 2H3',
  'volume-off':'m11 5-6 4H2v6h3l6 4V5Z M17 9l5 6 M22 9l-5 6',
  volume:'m11 5-6 4H2v6h3l6 4V5Z M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14',
  sliders:'M4 4v16 M12 4v16 M20 4v16 M1 9h6 M9 16h6 M17 8h6',
  'arrow-right':'M4 12h16 M15 7l5 5-5 5',
  lock:'M6 10h12v11H6z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',
  unlock:'M6 10h12v11H6z M8 10V6a4 4 0 0 1 7-2 M12 14v3',
  close:'M6 6l12 12 M18 6 6 18',
  check:'m5 12 4 4L19 6',
  upload:'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',
  folder:'M3 6h7l2 3h9v12H3V6Z',
  moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z'
};
function icon(name, extra='') { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${paths[name] || paths.sparkles}"/></svg>`; }
function hydrate(root=document) { root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon)); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function time(seconds) { if(!Number.isFinite(seconds)) return '--:--'; const m=Math.floor(seconds/60); return `${String(m).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`; }

const catalog = [
  {id:'alpine',title:'阿尔卑斯 · 风经过的地方',english:'A MOMENT IN THE ALPS',image:'alpine',duration:1284,category:'nature',quality:'4K',color:'#8facae'},
  {id:'dunes',title:'沙丘来信',english:'LETTERS FROM THE DESERT',image:'dunes',duration:958,category:'journey',quality:'4K',color:'#bd9c7f'},
  {id:'forest',title:'走进绿色的呼吸',english:'INTO THE QUIET WOODS',image:'forest',duration:1862,category:'nature',quality:'4K',color:'#66846a'},
  {id:'coast',title:'海岸线的另一边',english:'BEYOND THE SHORE',image:'coast',duration:1456,category:'journey',quality:'4K',color:'#8bafba'},
  {id:'mountain',title:'山的回声',english:'ECHOES OF THE MOUNTAIN',image:'mountain',duration:2180,category:'nature',quality:'4K',color:'#9f9aaf'},
  {id:'mist',title:'等一场山间的雾',english:'WHERE THE MIST LINGERS',image:'mist',duration:1168,category:'nature',quality:'1080P',color:'#9da592'},
  {id:'night',title:'银河落在山顶',english:'UNDER A MILLION STARS',image:'night',duration:1640,category:'night',quality:'4K',color:'#9a9dc3'},
  {id:'city',title:'城市还没有睡着',english:'THE CITY AFTER HOURS',image:'city',duration:1260,category:'night',quality:'1080P',color:'#b19b89'},
  {id:'lake',title:'一面湖泊的独白',english:'STILL WATER, STILL MIND',image:'alpine',duration:1765,category:'nature',quality:'4K',color:'#8eaba7'},
  {id:'wild',title:'把时间交给旷野',english:'LOST IN THE WILD',image:'mist',duration:2043,category:'nature',quality:'1080P',color:'#a1b099'},
  {id:'sand',title:'日落之前的远行',english:'BEFORE THE SUN GOES DOWN',image:'dunes',duration:942,category:'journey',quality:'4K',color:'#c6a78a'},
  {id:'tide',title:'听见潮汐',english:'A CONVERSATION WITH THE SEA',image:'coast',duration:1518,category:'journey',quality:'4K',color:'#89abb2'}
];
const categoryNames={nature:'山野之间',journey:'远方来信',night:'夜色漫游',local:'本地视频'};
const state={view:'wall',layout:'focus',playing:true,muted:true,speed:1,loop:false,fit:'cover',tiles:[],focused:null,zoomed:null,hovered:null,filter:'all',search:'',selection:new Set(),favorites:new Set(['alpine','night','coast']),nextId:4,theme:'violet',reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
state.tiles=catalog.slice(0,3).map((media,i)=>({id:i+1,mediaId:media.id,progress:[.346,.562,.27][i],locked:false,paused:false}));state.focused=1;
const wall=document.getElementById('videoWall');
let dragTile=null;
let modalReturnFocus=null;
let wasPlaying=false;
const objectUrls=[];

function mediaFor(tile) { return catalog.find(m=>m.id===tile.mediaId); }
function tileMarkup(tile,index) {
  const m=mediaFor(tile);
  return `${m.url ? `<video class="tile-video" src="${m.url}" playsinline preload="metadata" muted></video>` : `<img class="tile-image" src="assets/${m.image}.jpg" alt="${escapeHtml(m.title)}" draggable="false">`}
    <div class="tile-shade"></div><div class="tile-top"><span class="tile-index">${String(index+1).padStart(2,'0')}</span><span class="tile-badge" ${index!==0||state.layout!=='focus'?'hidden':''}>${icon('sparkles')}主画面</span><span class="tile-label">${m.url?'本地视频':`示例 · ${m.quality}`}</span></div>
    <div class="tile-actions"><button data-tile-action="main" aria-label="设为主画面" title="设为主画面">${icon('focus')}</button><button data-tile-action="lock" class="${tile.locked?'locked':''}" aria-label="${tile.locked?'解锁':'锁定'}画面" title="${tile.locked?'解锁':'锁定'}画面">${icon(tile.locked?'lock':'unlock')}</button><button data-tile-action="shuffle" aria-label="随机替换此画面" title="随机换片 R">${icon('shuffle')}</button><button data-tile-action="close" aria-label="关闭此画面" title="关闭画面">${icon('close')}</button></div>
    <button class="tile-center-play" data-tile-action="play" aria-label="${tile.paused?'播放':'暂停'}此画面">${icon(tile.paused?'play':'pause')}</button>
    <div class="tile-bottom"><div class="tile-title-row"><div style="min-width:0"><div class="tile-title">${escapeHtml(m.title)}</div><div class="tile-subtitle">${escapeHtml(m.english)}</div></div><div class="tile-time">${time(tile.progress*m.duration)} <span>/ ${time(m.duration)}</span></div></div><div class="tile-progress" role="slider" aria-label="${escapeHtml(m.title)}的播放进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(tile.progress*100)}" tabindex="0"><span style="width:${tile.progress*100}%"></span></div></div>`;
}
function renderWall() {
  const existing=new Map([...wall.children].map(el=>[Number(el.dataset.id),el]));
  state.tiles.forEach((tile,index)=>{
    let el=existing.get(tile.id);
    if(!el) { el=document.createElement('article');el.className='video-tile';el.dataset.id=tile.id;el.draggable=true;el.tabIndex=0;el.setAttribute('aria-label',mediaFor(tile).title);wall.append(el); }
    if(el.dataset.media!==tile.mediaId) {
      el.innerHTML=tileMarkup(tile,index);el.dataset.media=tile.mediaId;el.setAttribute('aria-label',mediaFor(tile).title);
      el.classList.remove('is-changing');void el.offsetWidth;el.classList.add('is-changing');
      const video=el.querySelector('video');
      if(video) {video.addEventListener('loadedmetadata',()=>{const m=mediaFor(tile);if(video.duration&&Number.isFinite(video.duration))m.duration=video.duration;syncVideos();});video.addEventListener('error',()=>toast('浏览器暂不支持这个视频编码，请换一个文件试试。','folder'));}
    }
    el.classList.toggle('focused',tile.id===state.focused);el.classList.toggle('paused',tile.paused);el.classList.toggle('zoomed',tile.id===state.zoomed);
    el.querySelector('.tile-index').textContent=String(index+1).padStart(2,'0');
    el.querySelector('.tile-badge').hidden=index!==0||state.layout!=='focus';
    const lock=el.querySelector('[data-tile-action="lock"]');lock.classList.toggle('locked',tile.locked);lock.innerHTML=icon(tile.locked?'lock':'unlock');lock.setAttribute('aria-label',tile.locked?'解锁画面':'锁定画面');lock.title=tile.locked?'解锁画面':'锁定画面';
    const play=el.querySelector('[data-tile-action="play"]');play.innerHTML=icon(tile.paused?'play':'pause');play.setAttribute('aria-label',tile.paused?'播放此画面':'暂停此画面');
    existing.delete(tile.id);
  });
  existing.forEach(el=>{el.querySelector('video')?.pause();el.remove();});
  if(!state.tiles.length)wall.innerHTML=`<div class="empty-state">${icon('wall')}<h3>空出一个世界，放进你的喜欢。</h3><p>从下方挑选画面，或添加本地视频开始放映。</p><button class="button primary" data-action="import">添加视频</button></div>`;
  else wall.querySelector('.empty-state')?.remove();
  wall.classList.toggle('count-many',state.tiles.length>6);wall.classList.toggle('contain',state.fit==='contain');wall.classList.toggle('is-zoomed',state.zoomed!==null);
  document.querySelectorAll('[data-layout]').forEach(b=>b.classList.toggle('selected',b.dataset.layout===state.layout));
  document.getElementById('wallCount').textContent=state.tiles.length;
  const name={focus:'主次布局',grid:'网格布局',smart:'智能布局'}[state.layout];
  document.getElementById('playerContext').textContent=`${name} · ${state.tiles.length} 个画面`;
  const playing=state.tiles.filter(t=>!t.paused).length;
  state.playing=playing>0;
  document.getElementById('playingSummary').textContent=state.tiles.length?`${state.tiles.length} 个画面，${playing?`${playing} 个正在播放`:'已全部暂停'}`:'等待你的第一幕';
  document.getElementById('playIcon').innerHTML=icon(state.playing?'pause':'play');
  document.querySelector('[data-action="play"]').setAttribute('aria-label',state.playing?'全部暂停':'播放全部');
  document.querySelector('.player-context strong').innerHTML=`${state.tiles.length?(state.playing?'自由放映中':'放映已暂停'):'等待第一幕'}<span class="tiny-live" style="opacity:${state.playing?1:.3}"></span>`;
  layoutWall();syncVideos();
}
function arrangeRows(tiles,x,y,w,h,smart) {
  if(!tiles.length)return;
  const gap=8,n=tiles.length;let bestRows=1,bestScore=Infinity;
  for(let rows=1;rows<=n;rows++){const cols=Math.ceil(n/rows);const aspect=(w-(cols-1)*gap)/cols/((h-(rows-1)*gap)/rows);const score=Math.abs(Math.log(Math.max(.01,aspect)/1.65))+.12*(cols*rows-n);if(score<bestScore){bestRows=rows;bestScore=score;}}
  const rows=bestRows,rowH=(h-gap*(rows-1))/rows;let offset=0;
  for(let row=0;row<rows;row++) {const count=Math.ceil((n-offset)/(rows-row));const rowTiles=tiles.slice(offset,offset+count);const weights=rowTiles.map(t=>smart&&mediaFor(t).portrait?.68:1);const total=weights.reduce((a,b)=>a+b,0);let left=x;rowTiles.forEach((t,i)=>{const tw=(w-gap*(count-1))*weights[i]/total;position(t,left,y+row*(rowH+gap),tw,rowH);left+=tw+gap;});offset+=count;}
}
function position(tile,x,y,w,h) {const el=wall.querySelector(`[data-id="${tile.id}"]`);if(!el)return;Object.assign(el.style,{left:`${x}px`,top:`${y}px`,width:`${Math.max(0,w)}px`,height:`${Math.max(0,h)}px`});}
function layoutWall() {
  const {width:w,height:h}=wall.getBoundingClientRect();if(!w||!h)return;const n=state.tiles.length;
  if(state.layout==='focus'&&n>1){if(w/h<1.05){const mainH=h*(n===2?.57:.59);position(state.tiles[0],0,0,w,mainH);arrangeRows(state.tiles.slice(1),0,mainH+8,w,h-mainH-8,false);}else{const mainW=(w-8)*(n===2?.59:n<=4?.65:.57);position(state.tiles[0],0,0,mainW,h);arrangeRows(state.tiles.slice(1),mainW+8,0,w-mainW-8,h,false);}}
  else arrangeRows(state.tiles,0,0,w,h,state.layout==='smart');
}
function syncVideos() {state.tiles.forEach(tile=>{const video=wall.querySelector(`[data-id="${tile.id}"] video`);if(!video)return;video.muted=state.muted||tile.id!==state.focused;video.volume=Number(document.getElementById('masterVolume').value)/100;video.playbackRate=state.speed;video.loop=state.loop;if(tile.paused||!document.getElementById('privacyScreen').hidden)video.pause();else video.play().catch(()=>{});});}
function renderDiscovery() {
  const showing=[catalog[3],catalog[4],catalog[5],catalog[6],catalog[7]];
  document.getElementById('discoveryStrip').innerHTML=showing.map((m,i)=>`<article class="discovery-card" data-add="${m.id}" tabindex="0" role="button" aria-label="将${escapeHtml(m.title)}加入播放墙" style="animation-delay:${i*45}ms"><div class="thumb"><img src="assets/${m.image}.jpg" alt="${escapeHtml(m.title)}" loading="lazy"><span class="thumb-category">${m.quality}</span><span class="thumb-duration">${time(m.duration)}</span><span class="thumb-add">${icon('plus')}</span></div><div class="discovery-title">${escapeHtml(m.title)}</div><div class="discovery-meta"><span>${categoryNames[m.category]}</span><span>示例影片</span></div></article>`).join('');
}
function renderLibrary() {
  const list=catalog.filter(m=>(state.filter==='all'||m.category===state.filter)&&(state.view!=='favorites'||state.favorites.has(m.id))&&(!state.search||`${m.title} ${m.english}`.toLowerCase().includes(state.search.toLowerCase())));
  document.getElementById('libraryGrid').innerHTML=list.map((m,i)=>`<article class="library-card ${state.selection.has(m.id)?'selected':''}" data-select="${m.id}" tabindex="0" role="checkbox" aria-checked="${state.selection.has(m.id)}" aria-label="选择${escapeHtml(m.title)}" style="animation-delay:${Math.min(i,8)*30}ms"><div class="thumb">${m.url?`<video src="${m.url}" muted preload="metadata" style="width:100%;height:100%;object-fit:cover"></video>`:`<img src="assets/${m.image}.jpg" alt="${escapeHtml(m.title)}" loading="lazy">`}<span class="select-indicator">${icon('check')}</span><button class="library-heart ${state.favorites.has(m.id)?'is-favorite':''}" data-favorite="${m.id}" aria-label="${state.favorites.has(m.id)?'取消收藏':'收藏'}${escapeHtml(m.title)}" aria-pressed="${state.favorites.has(m.id)}">${icon('heart')}</button><span class="thumb-duration">${time(m.duration)}</span></div><div class="discovery-title">${escapeHtml(m.title)}</div><div class="discovery-meta"><span>${categoryNames[m.category]} · ${m.quality}</span><span>${m.url?'本地文件':'示例影片'}</span></div></article>`).join('')||`<div class="empty-state">${icon(state.view==='favorites'?'heart':'search')}<h3>${state.view==='favorites'?'收藏一点喜欢，留给下一次。':'还没有找到这个画面'}</h3><p>试试其他关键词，或者导入你自己的视频。</p></div>`;
  document.getElementById('librarySummary').textContent=`${list.length} 部${catalog.some(m=>m.url)?'影片':'示例影片'}`;
  document.getElementById('selectedCount').textContent=state.selection.size;document.getElementById('selectionBar').hidden=!state.selection.size;
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('selected',b.dataset.filter===state.filter));
  document.getElementById('libraryCount').textContent=catalog.length;document.getElementById('folderAllCount').textContent=catalog.length;
}
function switchView(view) {
  state.view=view;document.getElementById('wallView').hidden=view!=='wall';document.getElementById('libraryView').hidden=view==='wall';
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const title={wall:'我的视频墙',library:'我的视频库',favorites:'我的收藏'}[view];
  document.getElementById('pageTitle').innerHTML=`${title}<span class="title-dot">.</span>`;document.getElementById('breadcrumbView').textContent={wall:'播放墙',library:'视频库',favorites:'我的收藏'}[view];
  document.getElementById('pageSubtitle').textContent={wall:'把喜欢的片刻，放在同一个世界。',library:'每一次发现，都值得被好好收藏。',favorites:'反复心动，也是一种浪漫。'}[view];
  document.getElementById('selectionBar').hidden=view==='wall'||!state.selection.size;
  if(view!=='wall')renderLibrary();else requestAnimationFrame(layoutWall);
}
function toast(message,name='check') {const node=document.createElement('div');node.className='toast';node.innerHTML=`${icon(name)}<span>${escapeHtml(message)}</span>`;document.getElementById('toastRegion').replaceChildren(node);setTimeout(()=>{if(node.isConnected){node.style.opacity='0';node.style.transition='opacity .25s';setTimeout(()=>node.remove(),250);}},3000);}
function addMedia(id) {if(state.tiles.length>=16)return toast('当前已达到 16 个画面的上限。','wall');if(state.tiles.some(t=>t.mediaId===id))return toast('这个画面已经在播放墙中了。','wall');state.tiles.push({id:state.nextId++,mediaId:id,progress:0,locked:false,paused:!state.playing});if(state.focused===null)state.focused=state.tiles[0].id;renderWall();toast('已加入播放墙，其他画面继续放映。');}
function randomMedia(excluded) {const candidates=catalog.filter(m=>!excluded.has(m.id));return candidates[Math.floor(Math.random()*candidates.length)];}
function shuffleTiles(onlyId) {let changed=0;const excluded=new Set(state.tiles.map(t=>t.mediaId));state.tiles.forEach(t=>{if(t.locked||(onlyId&&t.id!==onlyId))return;const next=randomMedia(excluded);if(!next)return;excluded.add(next.id);t.mediaId=next.id;t.progress=Math.random()*.45;changed++;});renderWall();toast(changed?`新的片刻已就位 · 已替换 ${changed} 个画面`:'暂时没有可替换的画面，试试解锁或导入更多视频。',changed?'sparkles':'lock');}
function setCount(count) {const locked=state.tiles.filter(t=>t.locked);if(locked.length>count)return toast(`有 ${locked.length} 个画面已锁定，请先解锁。`,'lock');while(state.tiles.length>count){const index=state.tiles.findLastIndex(t=>!t.locked);state.tiles.splice(index,1);}const excluded=new Set(state.tiles.map(t=>t.mediaId));while(state.tiles.length<count){const m=randomMedia(excluded);if(!m)break;excluded.add(m.id);state.tiles.push({id:state.nextId++,mediaId:m.id,progress:Math.random()*.4,locked:false,paused:!state.playing});}if(!state.tiles.some(t=>t.id===state.focused))state.focused=state.tiles[0]?.id??null;state.zoomed=null;renderWall();toast(state.tiles.length<count?`示例库共 ${catalog.length} 部，已创建 ${state.tiles.length} 个不重复画面。`:`已调整为 ${count} 个画面，正在重新排列。`,'wall');}
function toggleAll(force) {const play=force??!state.playing;state.tiles.forEach(t=>t.paused=!play);renderWall();}
function seekAll(seconds) {state.tiles.forEach(t=>{const m=mediaFor(t);t.progress=Math.max(0,Math.min(.999,t.progress+seconds/m.duration));const v=wall.querySelector(`[data-id="${t.id}"] video`);if(v&&Number.isFinite(v.duration))v.currentTime=t.progress*v.duration;});updateProgress();toast(`全部${seconds>0?'前进':'后退'} ${Math.abs(seconds)} 秒`,seconds>0?'forward':'back');}
function updateProgress() {state.tiles.forEach(t=>{const el=wall.querySelector(`[data-id="${t.id}"]`);if(!el)return;const m=mediaFor(t),v=el.querySelector('video');if(v&&Number.isFinite(v.duration)&&v.duration>0)t.progress=v.currentTime/v.duration;el.querySelector('.tile-progress>span').style.width=`${t.progress*100}%`;el.querySelector('.tile-progress').setAttribute('aria-valuenow',Math.round(t.progress*100));el.querySelector('.tile-time').innerHTML=`${time(t.progress*m.duration)} <span>/ ${time(m.duration)}</span>`;});}

function openModal(html) {const backdrop=document.getElementById('modalBackdrop');modalReturnFocus=document.activeElement;document.getElementById('modal').innerHTML=`<button class="icon-button modal-close" data-action="close-modal" aria-label="关闭">${icon('close')}</button>${html}`;backdrop.hidden=false;document.getElementById('modal').querySelector('button,input,[tabindex="0"]')?.focus();}
function closeModal() {document.getElementById('modalBackdrop').hidden=true;modalReturnFocus?.focus?.();}
function importModal() {openModal(`<div class="modal-eyebrow">MAKE ROOM FOR YOUR FAVORITES</div><h2 id="modalTitle">把喜欢的，带进来<span class="title-dot">.</span></h2><p>选择本地视频，让你的私人放映室开始运转。</p><div class="drop-zone" id="dropZone" role="button" tabindex="0" data-action="choose-files"><span>${icon('upload')}</span><strong>拖入视频，或点击选择</strong><p>支持多选 · 文件始终留在你的设备</p></div><div class="modal-note">这版原型可临时播放浏览器支持的本地视频。文件不会上传；关闭页面后需重新选择。</div><div class="modal-actions"><button class="button secondary" data-action="close-modal">先逛一逛</button><button class="button primary" data-action="choose-files">${icon('folder')}选择视频</button></div>`);}
function settingsModal() {openModal(`<div class="modal-eyebrow">A LITTLE MORE YOU</div><h2 id="modalTitle">调成你喜欢的样子<span class="title-dot">.</span></h2><p>让放映室的氛围，刚好合你的心意。</p><div class="setting-row"><div><strong>一点颜色</strong><p>雾紫、鼠尾草、暖沙金</p></div><div class="swatches">${[['violet','#b8a0ed'],['sage','#a3c6b3'],['sand','#d7b993']].map(([name,color])=>`<button class="swatch ${state.theme===name?'selected':''}" style="--swatch:${color}" data-theme="${name}" aria-label="${name==='violet'?'雾紫':name==='sage'?'鼠尾草':'暖沙金'}主题"></button>`).join('')}</div></div><div class="setting-row"><div><strong>减少动态效果</strong><p>更安静的过渡，也能很舒服</p></div><button class="toggle" data-action="motion" aria-label="减少动态效果" aria-pressed="${state.reducedMotion}"></button></div><div class="setting-row"><div><strong>完整显示画面</strong><p>不裁切内容，允许保留黑边</p></div><button class="toggle" data-action="contain" aria-label="完整显示画面" aria-pressed="${state.fit==='contain'}"></button></div><p class="modal-note">当前为本地设计预览。示例视频使用静态画面与演示进度，本地导入的视频可真实播放。</p><div class="modal-actions"><button class="button primary" data-action="close-modal">刚刚好</button></div>`);}
function detailsModal() {const tile=state.tiles.find(t=>t.id===state.focused)||state.tiles[0];if(!tile)return toast('先添加一个画面吧。');const m=mediaFor(tile);openModal(`<div class="modal-eyebrow">A CLOSER LOOK</div><h2 id="modalTitle">画面里的细节<span class="title-dot">.</span></h2>${!m.url?`<img class="detail-preview" src="assets/${m.image}.jpg" alt="${escapeHtml(m.title)}">`:''}<p>${escapeHtml(m.title)}</p><div class="detail-list"><div><label>素材类型</label><span>${m.url?'本地视频':'设计示例画面'}</span></div><div><label>时长${m.url?'':'（演示）'}</label><span>${time(m.duration)}</span></div><div><label>当前倍速</label><span>${state.speed.toFixed(2)}×</span></div><div><label>画面适配</label><span>${state.fit==='cover'?'铺满画面':'完整显示'}</span></div></div><div class="modal-actions"><button class="button primary" data-action="close-modal">继续放映</button></div>`);}
function applyTheme(theme) {state.theme=theme;const colors={violet:['#b8a0ed','#ad8de9','#ae8aef16'],sage:['#a3c6b3','#8fb9a1','#a3c6b316'],sand:['#d7b993','#c9a574','#d7b99316']}[theme];['--accent','--accent-strong','--accent-wash'].forEach((v,i)=>document.documentElement.style.setProperty(v,colors[i]));document.querySelectorAll('[data-theme]').forEach(b=>b.classList.toggle('selected',b.dataset.theme===theme));}
async function handleFiles(files) {const videoFiles=[...files].filter(f=>f.type.startsWith('video/')||/\.(mp4|mkv|avi|wmv|mov|webm|m4v)$/i.test(f.name));if(!videoFiles.length)return toast('请选择一个本地视频文件。','folder');let added=0;const shouldPlay=state.playing;videoFiles.forEach(file=>{const id=`local-${Date.now()}-${catalog.length}`;const url=URL.createObjectURL(file);objectUrls.push(url);catalog.push({id,title:file.name,english:'LOCAL VIDEO · ONLY ON YOUR DEVICE',url,duration:0,category:'local',quality:'本地',portrait:false});if(state.tiles.length<16){state.tiles.push({id:state.nextId++,mediaId:id,progress:0,locked:false,paused:!shouldPlay});added++;}});closeModal();switchView('wall');renderWall();document.getElementById('libraryCount').textContent=catalog.length;document.getElementById('folderAllCount').textContent=catalog.length;toast(`已导入 ${videoFiles.length} 个本地视频${added?`，${added} 个加入播放墙`:''}。`);}

const actions={
  import:importModal,'choose-files':()=>document.getElementById('fileInput').click(),'close-modal':closeModal,
  library:()=>{state.filter='all';switchView('library');},settings:settingsModal,details:detailsModal,
  play:()=>toggleAll(),rewind:()=>seekAll(-10),forward:()=>seekAll(10),shuffle:()=>shuffleTiles(),
  mute:()=>{state.muted=!state.muted;document.getElementById('volumeIcon').innerHTML=icon(state.muted?'volume-off':'volume');document.querySelector('[data-action="mute"]').setAttribute('aria-pressed',state.muted);syncVideos();toast(state.muted?'所有画面已静音。':'声音已开启，仅焦点画面发声。',state.muted?'volume-off':'volume');},
  loop:()=>{state.loop=!state.loop;document.querySelector('[data-action="loop"]').setAttribute('aria-pressed',state.loop);syncVideos();toast(state.loop?'已开启单片循环。':'已关闭单片循环。','repeat');},
  speed:()=>{const options=[.5,.75,1,1.25,1.5,2];state.speed=options[(options.indexOf(state.speed)+1)%options.length];document.querySelector('.speed-button').innerHTML=`${state.speed.toFixed(state.speed%1===.25||state.speed%1===.75?2:1)}<span>×</span>`;syncVideos();toast(`播放倍速 ${state.speed}×`);},
  fit:()=>{state.fit=state.fit==='cover'?'contain':'cover';renderWall();toast(state.fit==='cover'?'铺满画面 · 允许适当裁切':'完整显示 · 保留原始画面比例','crop');},
  contain:()=>{state.fit=state.fit==='cover'?'contain':'cover';renderWall();document.querySelector('[data-action="contain"]').setAttribute('aria-pressed',state.fit==='contain');},
  fullscreen:async()=>{try{const panel=document.querySelector('.wall-panel');if(document.fullscreenElement)await document.exitFullscreen();else await panel.requestFullscreen();}catch{toast('当前预览环境不支持全屏。','expand');}},
  count:()=>{const pop=document.getElementById('countPopover'),r=document.getElementById('countButton').getBoundingClientRect();pop.hidden=!pop.hidden;pop.style.top=`${r.bottom+10}px`;pop.style.left=`${Math.max(10,Math.min(r.right-206,innerWidth-216))}px`;pop.querySelectorAll('[data-count]').forEach(b=>b.classList.toggle('selected',Number(b.dataset.count)===state.tiles.length));},
  save:()=>{try{localStorage.setItem('vexa-ui-layout',JSON.stringify({layout:state.layout,count:state.tiles.length,fit:state.fit}));toast('布局偏好已保存在这台设备，未保存视频信息。','bookmark');}catch{toast('当前浏览器未允许保存偏好。','bookmark');}},
  privacy:()=>{closeModal();document.getElementById('countPopover').hidden=true;wasPlaying=state.playing;toggleAll(false);state.muted=true;document.getElementById('volumeIcon').innerHTML=icon('volume-off');document.querySelector('[data-action="mute"]').setAttribute('aria-pressed','true');document.getElementById('privacyScreen').hidden=false;document.querySelector('[data-action="reveal"]').focus();},
  reveal:()=>{document.getElementById('privacyScreen').hidden=true;toggleAll(false);toast(wasPlaying?'画面已恢复，按空格继续。':'欢迎回来，放映室已准备好。','shield');document.querySelector('[data-action="play"]').focus();},
  motion:()=>{state.reducedMotion=!state.reducedMotion;document.body.classList.toggle('reduced-motion',state.reducedMotion);document.querySelector('[data-action="motion"]').setAttribute('aria-pressed',state.reducedMotion);},
  'clear-selection':()=>{state.selection.clear();renderLibrary();},
  'play-selected':()=>{if(state.selection.size>16)return toast('一次最多创建 16 个画面，请减少选择。','wall');if(!state.selection.size)return;state.tiles=[...state.selection].map(mediaId=>({id:state.nextId++,mediaId,progress:0,paused:false,locked:false}));state.focused=state.tiles[0].id;state.zoomed=null;state.selection.clear();switchView('wall');renderWall();toast('属于你的播放墙，准备好了。','sparkles');}
};

document.addEventListener('click',e=>{
  const action=e.target.closest('[data-action]');if(action){actions[action.dataset.action]?.();return;}
  const view=e.target.closest('[data-view]');if(view){state.filter='all';state.search='';document.getElementById('searchInput').value='';switchView(view.dataset.view);return;}
  const folder=e.target.closest('[data-folder]');if(folder){state.filter=folder.dataset.folder;switchView('library');return;}
  const layout=e.target.closest('[data-layout]');if(layout){state.layout=layout.dataset.layout;state.zoomed=null;renderWall();return;}
  const count=e.target.closest('[data-count]');if(count){setCount(Number(count.dataset.count));document.getElementById('countPopover').hidden=true;return;}
  const theme=e.target.closest('[data-theme]');if(theme){applyTheme(theme.dataset.theme);return;}
  const filter=e.target.closest('[data-filter]');if(filter){state.filter=filter.dataset.filter;renderLibrary();return;}
  const favorite=e.target.closest('[data-favorite]');if(favorite){const id=favorite.dataset.favorite;state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);renderLibrary();return;}
  const select=e.target.closest('[data-select]');if(select){const id=select.dataset.select;state.selection.has(id)?state.selection.delete(id):state.selection.add(id);renderLibrary();return;}
  const add=e.target.closest('[data-add]');if(add){addMedia(add.dataset.add);return;}
  if(!e.target.closest('#countPopover'))document.getElementById('countPopover').hidden=true;
});
wall.addEventListener('click',e=>{
  const el=e.target.closest('.video-tile');if(!el)return;const id=Number(el.dataset.id),tile=state.tiles.find(t=>t.id===id);if(!tile)return;
  const action=e.target.closest('[data-tile-action]')?.dataset.tileAction;
  if(action==='lock'){tile.locked=!tile.locked;renderWall();toast(tile.locked?'已锁定这个画面，随机换片会为它留步。':'画面已解锁。',tile.locked?'lock':'unlock');return;}
  if(action==='shuffle'){if(tile.locked)return toast('这个画面已锁定，先解锁再换片。','lock');shuffleTiles(id);return;}
  if(action==='close'){state.tiles=state.tiles.filter(t=>t.id!==id);if(state.focused===id)state.focused=state.tiles[0]?.id??null;if(state.zoomed===id)state.zoomed=null;renderWall();return;}
  if(action==='main'){state.tiles=[tile,...state.tiles.filter(t=>t.id!==id)];state.layout='focus';renderWall();toast('主画面已切换，播放不会中断。','focus');return;}
  if(action==='play'){tile.paused=!tile.paused;renderWall();return;}
  const progress=e.target.closest('.tile-progress');if(progress){const r=progress.getBoundingClientRect();tile.progress=Math.max(0,Math.min(.999,(e.clientX-r.left)/r.width));const v=el.querySelector('video');if(v&&Number.isFinite(v.duration))v.currentTime=tile.progress*v.duration;updateProgress();return;}
  state.focused=id;renderWall();
});
wall.addEventListener('dblclick',e=>{if(e.target.closest('button,.tile-progress'))return;const el=e.target.closest('.video-tile');if(!el)return;const id=Number(el.dataset.id);state.zoomed=state.zoomed===id?null:id;renderWall();});
wall.addEventListener('mouseover',e=>{const el=e.target.closest('.video-tile');state.hovered=el?Number(el.dataset.id):null;});wall.addEventListener('mouseleave',()=>state.hovered=null);
wall.addEventListener('dragstart',e=>{const el=e.target.closest('.video-tile');if(!el)return;dragTile=Number(el.dataset.id);e.dataTransfer.setData('text/plain',String(dragTile));e.dataTransfer.effectAllowed='move';});
wall.addEventListener('dragover',e=>{if(dragTile===null)return;e.preventDefault();const el=e.target.closest('.video-tile');wall.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));el?.classList.add('drag-over');});
wall.addEventListener('drop',e=>{if(dragTile===null)return;e.preventDefault();const el=e.target.closest('.video-tile');if(el){const a=state.tiles.findIndex(t=>t.id===dragTile),b=state.tiles.findIndex(t=>t.id===Number(el.dataset.id));if(a>=0&&b>=0){[state.tiles[a],state.tiles[b]]=[state.tiles[b],state.tiles[a]];renderWall();}}wall.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));dragTile=null;});
wall.addEventListener('dragend',()=>{dragTile=null;wall.querySelectorAll('.drag-over').forEach(n=>n.classList.remove('drag-over'));});
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();document.getElementById('dropZone')?.classList.add('drag-over');}});
document.addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();handleFiles(e.dataTransfer.files);}});
document.getElementById('fileInput').addEventListener('change',e=>{handleFiles(e.target.files);e.target.value='';});
document.getElementById('searchInput').addEventListener('input',e=>{state.search=e.target.value;if(state.view==='wall')switchView('library');else renderLibrary();});
document.getElementById('masterVolume').addEventListener('input',syncVideos);
document.getElementById('modalBackdrop').addEventListener('click',e=>{if(e.target.id==='modalBackdrop')closeModal();});
document.addEventListener('fullscreenchange',()=>{document.querySelector('.wall-panel').classList.toggle('is-fullscreen',!!document.fullscreenElement);requestAnimationFrame(layoutWall);});
document.addEventListener('keydown',e=>{
  const modalOpen=!document.getElementById('modalBackdrop').hidden;
  if(e.key==='Tab'&&modalOpen){const nodes=[...document.getElementById('modal').querySelectorAll('button,input,[tabindex="0"]')].filter(n=>!n.disabled),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}return;}
  if(!document.getElementById('privacyScreen').hidden){if(e.key==='Tab'){e.preventDefault();document.querySelector('[data-action="reveal"]').focus();}return;}
  if(e.key==='Escape'){if(modalOpen)closeModal();else if(!document.getElementById('countPopover').hidden)document.getElementById('countPopover').hidden=true;else if(state.zoomed!==null){state.zoomed=null;renderWall();}return;}
  if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='h'){e.preventDefault();actions.privacy();return;}
  if(modalOpen||e.target.matches('input,textarea,select,[contenteditable="true"]'))return;
  if(e.key==='/'){e.preventDefault();document.getElementById('searchInput').focus();return;}
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-add],[data-select],#dropZone')){e.preventDefault();e.target.click();return;}
  if(state.view!=='wall')return;
  if(e.key===' '){if(e.target.closest('button'))return;e.preventDefault();toggleAll();}
  else if(e.key.toLowerCase()==='r'&&!e.repeat&&state.hovered){const t=state.tiles.find(t=>t.id===state.hovered);if(t&&!t.locked)shuffleTiles(t.id);else if(t)toast('这个画面已锁定。','lock');}
  else if(e.key.toLowerCase()==='m')actions.mute();
  else if(e.key.toLowerCase()==='f')actions.fullscreen();
  else if(e.key.toLowerCase()==='k'){const t=state.tiles.find(t=>t.id===state.focused);if(t){t.paused=!t.paused;renderWall();}}
  else if(['ArrowLeft','ArrowRight'].includes(e.key)){if(e.target.matches('button,[role="slider"]'))return;e.preventDefault();const t=state.tiles.find(t=>t.id===state.focused);if(t){t.progress=Math.max(0,Math.min(.999,t.progress+(e.key==='ArrowRight'?10:-10)/mediaFor(t).duration));const v=wall.querySelector(`[data-id="${t.id}"] video`);if(v&&Number.isFinite(v.duration))v.currentTime=t.progress*v.duration;updateProgress();}}
});
wall.addEventListener('keydown',e=>{const slider=e.target.closest('[role="slider"]');if(!slider||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const t=state.tiles.find(t=>t.id===Number(slider.closest('.video-tile').dataset.id));t.progress=Math.max(0,Math.min(.999,t.progress+(e.key==='ArrowRight'?.02:-.02)));const v=slider.closest('.video-tile').querySelector('video');if(v&&Number.isFinite(v.duration))v.currentTime=t.progress*v.duration;updateProgress();});
new ResizeObserver(layoutWall).observe(wall);
setInterval(()=>{if(!document.getElementById('privacyScreen').hidden)return;state.tiles.forEach(t=>{if(!t.paused&&!mediaFor(t).url){t.progress+=state.speed/mediaFor(t).duration;if(t.progress>=1){t.progress=state.loop?0:.999;if(!state.loop)t.paused=true;}}});updateProgress();},1000);
window.addEventListener('beforeunload',()=>objectUrls.forEach(url=>URL.revokeObjectURL(url)));
document.body.classList.toggle('reduced-motion',state.reducedMotion);
try{const saved=JSON.parse(localStorage.getItem('vexa-ui-layout'));if(saved&&['focus','grid','smart'].includes(saved.layout)){state.layout=saved.layout;state.fit=saved.fit==='contain'?'contain':'cover';const count=Math.max(1,Math.min(catalog.length,Number(saved.count)||3));state.tiles=catalog.slice(0,count).map((m,i)=>({id:i+1,mediaId:m.id,progress:0,locked:false,paused:true}));state.focused=1;state.nextId=count+1;}}catch{}
hydrate();renderWall();renderDiscovery();
