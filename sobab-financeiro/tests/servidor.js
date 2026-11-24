// Servidor local para testar o sistema com o emulador do Firebase (npm run local).
// Serve a pasta site/ e troca js/config.js por um projeto "demo-", que só existe no emulador.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.join(__dirname, "..", "site");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".json": "application/json" };
const CONFIG_DEMO = 'window.FIREBASE_CONFIG = { apiKey: "demo-chave", authDomain: "demo-sobab.firebaseapp.com", projectId: "demo-sobab", appId: "demo" };\n';

function iniciar(porta = Number(process.env.PORT) || 5055) {
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (url === "/js/config.js") { res.writeHead(200, { "content-type": TIPOS[".js"] }); res.end(CONFIG_DEMO); return; }
    const arq = path.normalize(path.join(RAIZ, url === "/" ? "index.html" : url));
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); res.end("não encontrado"); return; }
    res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] || "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  });
  return new Promise(ok => srv.listen(porta, "127.0.0.1", () => ok(srv)));
}

if (require.main === module) {
  iniciar().then(() => {
    console.log("Sistema local em http://localhost:" + (process.env.PORT || 5055) + " (Ctrl+C para parar)");
  });
  // mantém o processo vivo enquanto o emulador roda
  setInterval(() => {}, 1 << 30);
}
module.exports = { iniciar };
