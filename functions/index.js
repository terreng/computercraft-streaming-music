import { onRequest } from "firebase-functions/v2/https";
import fetch from "node-fetch";
import prism from 'prism-media';
import { createHash } from 'crypto';

// This project uses two different RapidAPI APIs (see the README for setup):
//   - "YT-API" (yt-api) for searching and looking up videos/playlists
//   - "YouTube MP3" (youtube-mp36) for downloading the audio
// A single RapidAPI key works for both once you've subscribed to each one's free tier.
const rapidapi_api_keys = ["YOUR API KEY HERE"];

// The YouTube MP3 download links require an "x-run" header set to the md5 hash of
// your RapidAPI username. Put your RapidAPI username here.
const rapidapi_username = "YOUR RAPIDAPI USERNAME HERE";

export const ipod = onRequest({ memory: "512MiB", maxInstances: 3 }, (req, res) => {

    return new Promise(function (resolve, reject) {

        if (req.query.id) {

            // Ask the YouTube MP3 API to prepare the audio download. This API may need a
            // few tries while it converts the video, so we poll until the status is "ok".

            function getDownloadUrl(attempt) {
                makeAPIRequestWithRetries('https://youtube-mp36.p.rapidapi.com/dl?id='+req.query.id).then(function (json) {
                    if (json.status == "processing" && attempt <= 5) {
                        setTimeout(function () {
                            getDownloadUrl(attempt + 1);
                        }, 1500 * attempt);
                    } else if (json.status == "ok" && json.link) {
                        downloadAndTranscode(json.link, 1);
                    } else {
                        console.error("No download URL found. Status: " + json.status);
                        reject(res.status(500).send("Error 500"));
                    }
                }).catch(function (error) {
                    console.error(error);
                    reject(res.status(500).send("Error 500"));
                });
            }

            // Download the prepared mp3 and convert it to dfpwm on the fly

            function downloadAndTranscode(url, attempt) {
                fetch(url, {
                    method: 'GET',
                    headers: {
                        'x-run': createHash('md5').update(rapidapi_username).digest('hex')
                    }
                }).then(function (response) {
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
                    } else if (response.status == 404 && attempt <= 4) {
                        // The download link can take a moment to become available, so retry
                        setTimeout(function () {
                            downloadAndTranscode(url, attempt + 1);
                        }, 1500 * attempt);
                    } else {
                        console.log(response.status);
                        reject(res.status(500).send("Error 500"));
                    }
                }).catch(function (error) {
                    console.error(error);
                    reject(res.status(500).send("Error 500"));
                });
            }

            getDownloadUrl(1);
    
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
                if (youtube_playlist_match.length > 5 && Number(req.query.v || 0) >= 2) {

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
                    'x-rapidapi-host': url.includes('youtube-mp36') ? 'youtube-mp36.p.rapidapi.com' : 'yt-api.p.rapidapi.com'
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
