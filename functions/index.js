import { onRequest } from "firebase-functions/v2/https";
import fetch from "node-fetch";
import prism from 'prism-media';

const rapidapi_api_keys = ["YOUR API KEY HERE"];

export const ipod = onRequest({ memory: "512MiB", maxInstances: 3 }, (req, res) => {

    return new Promise(function (resolve, reject) {

        if (req.query.id) {

            // Download youtube video and convert to dfpwm
    
            makeAPIRequestWithRetries('https://yt-api.p.rapidapi.com/dl?id='+req.query.id+'&cgeo=US').then(function (json) {
                return new Promise(function (resolve, reject) {
                    let url = json?.formats?.[0]?.url;
                    if (url) {
                        resolve(url);
                    } else {
                        reject(res.status(500).send("Error 500"));
                    }
                })
            }).then(function (url) {
    
                fetch(url, { method: 'GET' }).then(function (response) {
                    if (response.ok) {
                        const transcoder = new prism.FFmpeg({
                            args: [
                                '-analyzeduration', '0',
                                '-loglevel', '0',
                                '-f', 'dfpwm',
                                '-ar', '48000',
                                '-ac', '1'
                            ]
                        });
    
                        response.body
                            .pipe(transcoder)
                            .pipe(res);
    
                        transcoder.on('end', function() {
                            resolve();
                        });
    
                        transcoder.on('error', function(err) {
                            console.error('Transcoder error:', err);
                            reject(res.status(500).send("Error 500"));
                        });
                    } else {
                        console.log(response.status);
                        reject(res.status(500).send("Error 500"));
                    }
                }).catch(function (error) {
                    console.error(error);
                    reject(res.status(500).send("Error 500"));
                });
    
            }).catch(function (error) {
                console.error(error);
                reject(res.status(500).send("Error 500"));
            });
    
        } else if (req.query.search) {
    
            // If you paste in a youtube link into the search box, get the video id and look it up directly
    
            let youtube_id_match = req.query.search.match(/((?:https?:)?\/\/)?((?:www|m|music)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/)?.[5];
            if (youtube_id_match?.length == 11) {
    
                makeAPIRequestWithRetries('https://yt-api.p.rapidapi.com/video/info?id='+youtube_id_match).then(function (item) {
    
                    res.setHeader('Content-Type', 'application/json; charset=latin1');
                    resolve(res.status(200).send(Buffer.from(JSON.stringify(!item.title ? [] :[{
                        id: item.id,
                        name: replaceNonExtendedASCII(item.title),
                        artist: toHMS(Number(item.lengthSeconds)) + " · " + replaceNonExtendedASCII(item.channelTitle.split(" - Topic")[0])
                    }]), 'latin1')));
    
                }).catch(function (error) {
                    console.error(error);
                    reject(res.status(500).send("Error 500"));
                })
    
            } else {

                // If you paste in a youtube playlist link into the search box, get the playlist id and look it up directly

                let youtube_playlist_match = req.query.search.match(/((?:https?:)?\/\/)?((?:www|m|music)\.)?((?:youtube\.com|youtu.be))\/playlist(\S+)list=([\w\-]+)(\S+)?$/)?.[5];
                if (youtube_playlist_match?.length == 34 && Number(req.query.v || 0) >= 2) {

                    makeAPIRequestWithRetries('https://yt-api.p.rapidapi.com/playlist?id='+youtube_playlist_match).then(function (item) {

                        res.setHeader('Content-Type', 'application/json; charset=latin1');
                        resolve(res.status(200).send(Buffer.from(JSON.stringify((item.error || item.data?.length === 0) ? [] :[{
                            id: item.meta.playlistId,
                            name: replaceNonExtendedASCII(item.meta.title),
                            artist: "Playlist · " + item.meta.videoCount + " videos · " + replaceNonExtendedASCII(item.meta.channelTitle),
                            type: "playlist",
                            playlist_items: item.data.map(function (item) {
                                return {
                                    id: item.videoId,
                                    name: replaceNonExtendedASCII(item.title),
                                    artist: item.lengthText + " · " + replaceNonExtendedASCII(item.channelTitle.split(" - Topic")[0])
                                }
                            })
                        }]), 'latin1')));

                    }).catch(function (error) {
                        console.error(error);
                        reject(res.status(500).send("Error 500"));
                    })

                } else {

                    // Otherwise, search for the song
        
                    makeAPIRequestWithRetries('https://yt-api.p.rapidapi.com/search?query='+encodeURIComponent(req.query.search.split("+").join(" "))+'&type=video').then(function (json) {
        
                        res.setHeader('Content-Type', 'application/json; charset=latin1');
                        resolve(res.status(200).send(
                            Buffer.from(JSON.stringify(
                                json.data
                                .filter(item => ["video"].includes(item.type))
                                .map(function (item) {
                                    return {
                                        id: item.videoId,
                                        name: replaceNonExtendedASCII(item.title),
                                        artist: item.lengthText + " · " + replaceNonExtendedASCII(item.channelTitle.split(" - Topic")[0])
                                    }
                                })
                            ), 'latin1')
                        ))
        
                    }).catch(function (error) {
                        console.error(error);
                        reject(res.status(500).send("Error 500"));
                    })

                }
    
            }
    
        } else {
            resolve(res.status(400).send("Bad request"));
        }

    })

});

function makeAPIRequestWithRetries(url) {
    let max_attempts = 3;
    let which_key = Math.floor(Math.random() * rapidapi_api_keys.length);

    return new Promise(function (resolve, reject) {
        function attempt(att) {
            fetch(url, {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': rapidapi_api_keys[(which_key + att - 1) % rapidapi_api_keys.length],
                    'x-rapidapi-host': 'yt-api.p.rapidapi.com'
                }
            })
                .then(response => response.json())
                .then(resolve).catch(function (error) {
                    console.error(error);
                    failed(error);
                });

            function failed(error) {
                if (att < max_attempts) {
                    setTimeout(function () {
                        attempt(att + 1);
                    }, 1000 * att);
                } else {
                    reject(error);
                }
            }
        }
        attempt(1);
    });
}

function replaceNonExtendedASCII(str) {
    return str
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/‘/g, "'")
    .replace(/’/g, "'")
    .replace(/“/g, '"')
    .replace(/”/g, '"')
    .replace(/…/g, '...')
    .replace(/•/g, '·')
    .replace(/[^\x00-\xFF]/g, '?');
}

function toHMS(totalSeconds) {
	const hrs = Math.floor(totalSeconds / 3600);
	const mins = Math.floor((totalSeconds % 3600) / 60);
	const secs = totalSeconds % 60;
	
	const formattedMinutes = (hrs > 0 && mins < 10) ? `0${mins}` : mins;
	const formattedSeconds = secs < 10 ? `0${secs}` : secs;
	
	return hrs > 0 
		? `${hrs}:${formattedMinutes}:${formattedSeconds}`
		: `${formattedMinutes}:${formattedSeconds}`;
}