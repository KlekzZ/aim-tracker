// Turns src/renderer/assets/logo.svg into PNG icons for the window and installer.
// Run with: npm run icon   (only needed when the logo changes)
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'src', 'renderer', 'assets', 'logo.svg'), 'utf8');
const SIZE = 512;

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: SIZE, height: SIZE, show: false, transparent: true, frame: false,
    useContentSize: true, webPreferences: { offscreen: true },
  });
  const html = `<html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${SIZE}" height="${SIZE}">
  </body></html>`;
  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  await new Promise((resolve) => setTimeout(resolve, 500));
  const png = (await win.webContents.capturePage()).resize({ width: SIZE, height: SIZE }).toPNG();

  // build/icon.png is picked up by electron-builder for the installer and .exe.
  fs.mkdirSync(path.join(root, 'build'), { recursive: true });
  fs.writeFileSync(path.join(root, 'build', 'icon.png'), png);
  fs.writeFileSync(path.join(root, 'src', 'renderer', 'assets', 'icon.png'), png);
  console.log('Wrote build/icon.png and src/renderer/assets/icon.png');
  app.quit();
});
