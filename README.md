# Streaming music in Minecraft (ComputerCraft CC: Tweaked mod)

**Install:** `pastebin get manTdeiG music`

**Run:** `music`

## How to use

1. Install the [CC: Tweaked](https://tweaked.cc/) mod to your world/server. Make sure you're using version 1.100.0 of the mod (released December 2021) or newer, or it won't work.
2. Craft an Advanced Computer and connect it to a speaker, or craft an Advanced Noisy Pocket Computer.
3. Open the computer and then drag and drop the `music.lua` script on top of the Minecraft window to transfer the file over.
4. Run the `music` command and enjoy your music!

## Troubleshooting
- "No speakers attached" when using an Advanced Noisy Pocket Computer: Restart your Minecraft game. If that doesn't work, restart the server.
- "Module 'cc.audio.dfpwm' not found" error: Make sure you're using version 1.100.0 of the CC: Tweaked mod (released December 2021) or newer. New audio features were added in this version, so it won't work in 1.99.X or below.
- Freezes: There are a few bugs that might make the program freeze. Sorry about that! I will fix them when I get the chance.

## How to self-host

> [!IMPORTANT]  
> Self-hosting is not required to use this program. You can simply use the pastebin command above.

The ComputerCraft program connects to a web server to download the music files. This server is hosted with Firebase Cloud Functions. The server downloads YouTube videos using an unofficial API on RapidAPI.

1. Download this repository to your computer into a folder.
2. Create an account for RapidAPI and sign up for the free tier of "YT-API" here: [https://rapidapi.com/ytjar/api/yt-api](https://rapidapi.com/ytjar/api/yt-api)
3. Copy and paste your API key into the file `functions/index.js` where it says "YOUR API KEY HERE". Leave the quotes.
4. Sign up for Firebase and make a new project at [https://firebase.google.com/](https://firebase.google.com/). A billing account is required even for the free plan. The limits of the free plan should be plenty for most people.
5. Install Node.js version 20 from [https://nodejs.org/en/download/](https://nodejs.org/en/download/).
6. In your terminal, run `npm install -g firebase-tools` to install Firebase.
7. In your terminal, navigate inside the project folder. Run `firebase login` and follow the steps.
8. Run `firebase init functions` and follow the steps. Choose JavaScript. Don't choose to overwrite the `functions/index.js` or `functions/package.json` files when it asks you. Install the dependencies when prompted.
9. Run `cd functions` to go inside the `functions` directory and then run `npm install` to install more dependencies.
10. Run `cd ..` to go back and then run `firebase deploy` to deploy your new Cloud Function.
11. After the deployment is complete it will give you the Function URL. Copy that URL into the first line of `music.lua`.
