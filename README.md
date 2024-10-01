# Streaming music in Minecraft (ComputerCraft CC: Tweaked mod)

**Install:** `pastebin get manTdeiG music`

**Run:** `music`

## How to use

1. Install the [CC: Tweaked](https://tweaked.cc/) mod to your world/server.
2. Craft an Advanced Computer and connect it to a speaker, or craft an Advanced Noisy Pocket Computer.
3. Open the computer and then drag and drop the `music.lua` script on top of the Minecraft window to transfer the file over.
4. Run the `music` command and enjoy your music!

## How to self-host

The ComputerCraft program connects to a web server to download the music files. This server is hosted with Firebase Cloud Functions.

1. Download this repository to your computer into a folder.
2. Sign up for Firebase and make a new project at [https://firebase.google.com/](https://firebase.google.com/). A billing account is required even for the free plan. The limits of the free plan should be plenty for most people.
3. Install Node.js version 20 from [https://nodejs.org/en/download/](https://nodejs.org/en/download/).
4. In your terminal, run `npm install -g firebase-tools` to install Firebase.
5. In your terminal, navigate inside the project folder. Run `firebase login` and follow the steps.
6. Run `firebase init functions` and follow the steps. Choose JavaScript. Don't choose to overwrite the `functions/index.js` or `functions/package.json` files when it asks you. Install the dependencies when prompted.
7. Run `cd functions` to go inside the `functions` directory and then run `npm install` to install more dependencies.
8. Run `cd ..` to go back and then run `firebase deploy` to deploy your new Cloud Function.
9. After the deployment is complete it will give you the Function URL. Copy that URL into the first line of `music.lua`.
