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

export const ipod = onRequest({ memory: "512MiB", maxInstances: 3 }, (req, res) => {

    if (req.query.id) {

        // Download youtube video and convert to dfpwm

        return new Promise(function (resolve, reject) {

            // Download the audio using the cobalt.tools API. Documentation: https://github.com/imputnet/cobalt/blob/current/docs/api.md
            fetch('https://c.blahaj.ca/', {
                method: 'POST',
                body: JSON.stringify({
                    url: 'https://www.youtube.com/watch?v=' + req.query.id,
                    downloadMode: 'audio',
                    audioFormat: 'opus'
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            })
                .then(response => response.json())
                .then(function (json) {
                    if (json.url) {

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

                        const filepath = path.join(os.tmpdir(), 'output.dfpwm');

                        fetch(json.url, { method: 'GET' }).then(function (response) {
                            if (response.ok) {
                                response.body
                                    .pipe(transcoder)
                                    .pipe(new dfpwm.Encoder())
                                    .pipe(fs.createWriteStream(filepath))
                                    .on('finish', function () {
                                        resolve(res.status(200).send(fs.readFileSync(filepath)));
                                    })
                                    .on('error', function (error) {
                                        console.error(error)
                                        reject(res.status(500).send("Error 500"));
                                    })
                            } else {
                                console.log(response.status)
                                reject(res.status(500).send("Error 500"));
                            }
                        }).catch(function (error) {
                            console.error(error)
                            reject(res.status(500).send("Error 500"));
                        });

                    } else {
                        console.log(json);
                        reject(res.status(500).send("Error 500"));
                    }
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
