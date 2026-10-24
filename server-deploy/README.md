# MegaZacx 24/7 Cloud Server

This directory contains the production-ready signaling and multi-channel chat server for **MegaZacx**.
Deploying this server allows you and all your friends across different locations and networks to automatically connect to the same voice and text channels without needing to share local IPs or port-forward routers.

---

## ?? Free 2-Minute Deployment (Render.com)

**Render.com** provides a free Node.js hosting tier that runs 24/7 with zero credit card required.

### Step 1: Push or Upload `server-deploy` to GitHub
1. Create a free GitHub repository (e.g. `megazacx-server`).
2. Upload or push the files from this `server-deploy` folder:
   - `server.js`
   - `package.json`
   - `render.yaml`
   - `Procfile`

### Step 2: Deploy on Render
1. Go to [https://dashboard.render.com](https://dashboard.render.com) and sign in.
2. Click **New +** (top right) and choose **Web Service**.
3. Select your GitHub repository.
4. Render will automatically detect the settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free
5. Click **Create Web Service**.

### Step 3: Copy Your Public URL
Once deployed (takes ~30-60 seconds), Render will provide you with a permanent public URL, for example:
```
https://megazacx-server-xxxx.onrender.com
```

---

## ?? Connecting MegaZacx to Your Cloud Server

Once you have your Render URL:
1. In MegaZacx, click the **Settings ??** icon (bottom-left next to your nickname).
2. Scroll to the **Server & Network** section.
3. Paste your Render URL into the **Server Connection URL** box and click **Save & Reconnect**.
4. To make it the default for all friends downloading the app, set `cloudServerUrl` in `config.json` or `DEFAULT_CLOUD_SERVER_URL` in `app.js`.