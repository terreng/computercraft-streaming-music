import { onRequest } from "firebase-functions/v2/https";
import YTMusic from "ytmusic-api"
import fetch from "node-fetch";
import os from "os";
import path from "path";
import fs from "fs";
import prism from "prism-media";
import dfpwm from "dfpwm";

const ytmusic = new YTMusic()
await ytmusic.initialize()

const rapidapi_api_keys = ["YOUR API KEY HERE"];

export const ipod = onRequest({ memory: "512MiB", maxInstances: 3 }, (req, res) => {

    if (req.query.id) {

        // Download youtube video and convert to dfpwm

        return new Promise(function (resolve, reject) {

            getYoutubeDownloadUrl(req.query.id).then(function (url) {

                // Transcode the audio from opus to s8. This reduces the file size and gets it ready for the dfpwm encoder.
                const transcoder = new prism.FFmpeg({
                    args: [
                        '-analyzeduration', '0',
                        '-loglevel', '0',
                        '-f', 's8',
                        '-ar', '48000',
                        '-ac', '1'
                    ]
                })

                const randomId = Date.now() + '-' + Math.random().toString(36).substring(2, 15);
                const filepath = path.join(os.tmpdir(), 'output-' + randomId + '.dfpwm');

                fetch(url, { method: 'GET' }).then(function (response) {
                    if (response.ok) {
                        response.body
                            .pipe(transcoder)
                            .pipe(new dfpwm.Encoder())
                            .pipe(fs.createWriteStream(filepath))
                            .on('finish', function () {
                                resolve(res.status(200).send(fs.readFileSync(filepath)));
                                fs.unlink(filepath, () => {});
                            })
                            .on('error', function (error) {
                                console.error(error)
                                fs.unlink(filepath, () => {});
                                reject(res.status(500).send("Error 500"));
                            })
                    } else {
                        console.log(response.status)
                        fs.unlink(filepath, () => {});
                        reject(res.status(500).send("Error 500"));
                    }
                }).catch(function (error) {
                    console.error(error)
                    fs.unlink(filepath, () => {});
                    reject(res.status(500).send("Error 500"));
                });

            }).catch(function (error) {
                console.error(error);
                reject(res.status(500).send("Error 500"));
            });

        })

    } else if (req.query.search) {

        // Search for songs on youtube

        return new Promise(function (resolve, reject) {

            // If you paste in a youtube link into the search box, get the video id and look it up directly

            let youtube_url_match = req.query.search.match(/((?:https?:)?\/\/)?((?:www|m|music)\.)?((?:youtube\.com|youtu.be))(\/(?:[\w\-]+\?v=|embed\/|v\/)?)([\w\-]+)(\S+)?$/);
            if (youtube_url_match?.[5]?.length == 11) {

                ytmusic.getVideo(youtube_url_match[5]).then(function (result) {
                    resolve(res.status(200).send(JSON.stringify([{
                        id: result.videoId,
                        name: result.name,
                        artist: result.artist.name,
                        album: result.artist.name,
                        duration: result.duration
                    }])));
                }).catch(function (error) {
                    console.error(error);
                    reject(res.status(500).send("Error 500"));
                })

            } else {

                // Otherwise, search for the song

                ytmusic.search(req.query.search).then(function (result) {
                    resolve(res.status(200).send(JSON.stringify(
                        result
                            .filter(a => ["SONG", "VIDEO"].includes(a.type))
                            .map(function (a) {
                                return {
                                    id: a.videoId,
                                    name: a.name,
                                    artist: a.artist.name,
                                    album: a.album?.name || a.artist.name,
                                    duration: a.duration
                                }
                            }))));
                }).catch(function (error) {
                    console.error(error);
                    reject(res.status(500).send("Error 500"));
                })

            }

        })

    } else {
        res.status(400).send("Bad request");
    }
});

function getYoutubeDownloadUrl(id) {
    let max_attempts = 3;
    let which_key = Math.floor(Math.random() * rapidapi_api_keys.length);

    return new Promise(function (resolve, reject) {
        function attempt(att) {
            fetch('https://yt-api.p.rapidapi.com/dl?id='+id+'&cgeo=US', {
                method: 'GET',
                headers: {
                    'x-rapidapi-key': rapidapi_api_keys[(which_key + att - 1) % rapidapi_api_keys.length],
                    'x-rapidapi-host': 'yt-api.p.rapidapi.com'
                }
            })
                .then(response => response.json())
                .then(function (json) {
                    let audio_url = json?.adaptiveFormats?.find(f => f.mimeType.includes("audio/mp4"))?.url;
  
                    if (audio_url) {
                        resolve(audio_url);
                    } else {
                        failed("Failed to get download url");
                    }
                }).catch(function (error) {
                    console.error(error);
                    failed(error);
                });

            function failed(error) {
                if (att < max_attempts) {
                    attempt(att + 1);
                } else {
                    reject(error);
                }
            }
        }
        attempt(1);
    });
}
