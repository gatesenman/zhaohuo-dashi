const { contextBridge, ipcRenderer, webUtils } = require('electron');
const inv = (c, ...a) => ipcRenderer.invoke(c, ...a);
const iconv = require('iconv-lite');
contextBridge.exposeInMainWorld('ww', {
  win: a => ipcRenderer.send('win', a), onWinState: cb => ipcRenderer.on('win:state', (_e, m) => cb(m)),
  getData: () => inv('data:get'), setData: d => inv('data:set', d),
  getSettings: () => inv('settings:get'), setSettings: s => inv('settings:set', s),
  getPlatforms: () => inv('platforms:get'), setPlatforms: l => inv('platforms:set', l), resetPlatforms: () => inv('platforms:reset'),
  exportPlatforms: () => inv('platforms:export'), importPlatforms: () => inv('platforms:import'),
  loginStatus: () => inv('login:status'), logout: id => inv('login:clear', id),
  pickImage: () => inv('image:pick'), saveImage: (b, e) => inv('image:saveBuffer', b, e), clipboardImage: () => inv('image:clipboard'),
  uploadImage: (w, f, id) => inv('image:upload', w, f, id), copy: t => inv('clipboard:write', t),
  extract: j => inv('extract', j), extractImage: j => inv('extract:image', j), setConcurrency: n => inv('extract:concurrency', n),
  imageFromUrl: (u, part) => inv('image:fromUrl', u, part), warm: j => inv('extract:warm', j), resolveLink: j => inv('extract:resolve', j),
  openLogin: o => inv('open:login', o), openDetail: o => inv('open:detail', o), saveFile: (n, c) => inv('file:save', n, c),
  encode: (q, enc) => enc === 'py' ? encodeURIComponent(require('pinyin-pro').pinyin(q, { toneType: 'none', type: 'array', nonZh: 'consecutive' }).join('').replace(/[^a-z0-9]/gi, '').toLowerCase()) : enc && enc.toLowerCase() !== 'utf8' && enc.toLowerCase() !== 'utf-8' ? [...iconv.encode(q, enc)].map(b => '%' + b.toString(16).toUpperCase().padStart(2, '0')).join('') : encodeURIComponent(q),
  version: ipcRenderer.sendSync('app:version'), openExternal: u => inv('open:external', u), fetchFavicon: h => inv('favicon:fetch', h), pickLogo: () => inv('logo:pick'), ua: () => inv('ua'), emulate: (w, m) => inv('emulate', w, m),
  filePath: f => webUtils.getPathForFile(f), platform: process.platform,
});
