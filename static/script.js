let playlistData = [];
let lastTrackId = "";
let offset = 0;
const limit = 25;
let loadingMore = false;

let seenAirdates = new Set();

const audio = document.getElementById('audio-player');
const container = document.getElementById('playlist');

function showToast(message, duration = 2000){
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(()=>{toast.style.display='none';}, duration);
}

async function loadInitialPlaylist() { await loadMoreTracks(); }

async function loadMoreTracks(){
    if(loadingMore) return;
    loadingMore=true;
    try{
        const res = await fetch(`/playlist?limit=${limit}&offset=${offset}`);
        const data = await res.json();
        if(!data || data.length===0) return;

        data.forEach(track => {
            if(track.airdate && !seenAirdates.has(track.airdate)){
                seenAirdates.add(track.airdate);
                playlistData.push(track);
            }
        });

        offset += data.length;

        if(offset === data.length && data.length>0){
            const first = data[0];
            lastTrackId = first.airdate;
            if(first.airdate) seenAirdates.add(first.airdate);
            updateMediaSession(first);
        }

        renderPlaylist();
    } catch(err){console.error(err);}
    finally{loadingMore=false;}
}

async function updateCurrentTrack(){
    try{
        const res = await fetch('/current');
        const data = await res.json();
        if(!data || data.length===0) return;

        const current = data[0];
        const trackId = current.airdate;

        if(trackId !== lastTrackId){
            lastTrackId = trackId;
            if(trackId && !seenAirdates.has(trackId)){
                seenAirdates.add(trackId);
                playlistData.unshift(current);
            }
            updateMediaSession(current);
            renderPlaylist();
        }
    } catch(err){console.error(err);}
}

function renderPlaylist(){
    container.innerHTML="";
    playlistData.forEach((song,index)=>{
        const isCurrent = index === 0;
        const div = document.createElement('div');
        div.className='song';
        if(isCurrent) div.classList.add('current');

        const encodedTrack = encodeURIComponent(JSON.stringify(song));

        div.innerHTML = `
            ${isCurrent?`<img class="song-art current-art" src="${song.image}" onerror="this.style.display='none'">`:``}
            <div class="song-info">
                <div class="title">${song.track}</div>
                <div class="title artist">${song.artist}</div>
                <div class="title album">${song.album}${song.release_year? ' ('+song.release_year+')':''}</div>
                <div class="time">${song.time}</div>
            </div>
            <div style="display:flex;gap:5px;">
                <a class="search-btn" href="https://monochrome.tf/search/${encodeURIComponent(song.artist+' '+song.track)}" target="_blank">
                    <span class="material-icons">search</span>
                </a>
                <button class="search-btn save-btn" data-track="${encodedTrack}" style="border:none;outline:none;">
                    <span class="material-icons">add</span>
                </button>
            </div>
        `;
        container.appendChild(div);
    });

    document.querySelectorAll('.save-btn').forEach(btn=>{
        btn.addEventListener('click', (e)=>{
            const trackJson = decodeURIComponent(e.currentTarget.dataset.track);
            const track = JSON.parse(trackJson);
            saveTrack(track);
        });
    });
}

function updateMediaSession(current){
    if('mediaSession' in navigator){
        navigator.mediaSession.metadata = new MediaMetadata({
            title: current.track,
            artist: current.artist,
            album: current.album,
            artwork:[{src:current.image,sizes:'96x96',type:'image/jpeg'},{src:current.image,sizes:'512x512',type:'image/jpeg'}]
        });
        navigator.mediaSession.setActionHandler('play',()=>audio.play());
        navigator.mediaSession.setActionHandler('pause',()=>audio.pause());
        navigator.mediaSession.setActionHandler('stop',()=>audio.pause());
    }
}

async function saveTrack(track){
    try{
        const res = await fetch("/save_track", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(track)});
        const data = await res.json();
        if(data.status==="ok"){showToast(`Saved: ${track.song} by ${track.artist}`);}
        else{showToast(`Error: ${data.message}`);}
    } catch(err){console.error(err); showToast("Error saving track.");}
}

// Scroll and background updates
container.addEventListener('scroll',()=>{
    if(container.scrollTop+container.clientHeight >= container.scrollHeight-50){loadMoreTracks();}
});

// Periodic updates
setInterval(updateCurrentTrack,10000);
document.addEventListener('visibilitychange', ()=>{
    if(!document.hidden) updateCurrentTrack();
});

loadInitialPlaylist();
