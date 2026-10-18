const fs = require("fs");
const path = require("path");

const root = process.cwd();
const dist = path.join(root, "dist");
fs.mkdirSync(dist, { recursive: true });

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const data = fs.readFileSync(path.join(root, "vendors-data.js"), "utf8");

const inlineApp = app.replace(
  /if \("serviceWorker" in navigator && location\.protocol !== "file:"\) \{\r?\n\s*navigator\.serviceWorker\.register\("service-worker\.js"\);\r?\n\}\r?\n?/, ""
);

const output = html
  .replace(/<link rel="manifest" href="manifest\.webmanifest">\s*/, "")
  .replace(/<link rel="stylesheet" href="styles\.css(?:\?[^"\s]*)?">/, () => '<style>\n' + css + '\n</style>')
  .replace(/<script src="vendors-data\.js(?:\?[^"\s]*)?"><\/script>\s*<script src="app\.js(?:\?[^"\s]*)?"><\/script>/, () => '<script>\n' + data + '\n' + inlineApp + '\n</script>');

if (/<script\b[^>]*\bsrc\s*=|<link\b[^>]*\brel="(?:stylesheet|manifest)"/i.test(output)) {
  throw new Error("Offline build still contains external scripts or styles.");
}
if (!output.includes(css) || !output.includes(data) || !output.includes(inlineApp)) {
  throw new Error("Offline build is missing inline assets.");
}

fs.writeFileSync(path.join(dist, "return-rule-finder.html"), output, "utf8");
fs.writeFileSync(path.join(dist, "iphone-open-this.html"), output, "utf8");
fs.copyFileSync(path.join(root, "vendors.json"), path.join(dist, "vendors.json"));
fs.writeFileSync(
  path.join(dist, "使用說明.txt"),
  [
    "退貨條件計算系統 - 手機單檔版",
    "",
    "使用方式：",
    "1. 把 return-rule-finder-mobile.zip 傳到手機。",
    "2. 在手機「檔案」App 解壓縮。",
    "3. 打開 iphone-open-this.html 或 return-rule-finder.html。",
    "4. 如果只是預覽畫面，請按分享，選 Safari 或 Chrome 開啟。",
    "5. 輸入廠商代碼或名稱與到期年月即可查詢。",
    "",
    "iPhone / iPad 注意：",
    "- 不要開 127.0.0.1 的網址，那只會指向手機自己。",
    "- 請先解壓縮 zip，再打開 iphone-open-this.html。",
    "- 不要在 LINE、郵件、檔案預覽裡直接使用；請按分享，選 Safari 或 Chrome 開啟。",
    "- 如果 Safari 仍無法執行，代表 iOS 擋住本機 HTML。最穩做法是請資訊人員把 dist-live 放到公司內網網址。",
    "",
    "備註：",
    "- 這是離線單檔版，不需要網路。",
    "- 資料已包在 HTML 裡。",
    "- vendors.json 是資料備份，手機使用時不一定需要。",
    ""
  ].join("\r\n"),
  "utf8"
);

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function u16(value) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function makeZip(files, zipPath) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const body = fs.readFileSync(file.path);
    const crc = crc32(body);

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(body.length),
      u32(body.length),
      u16(name.length),
      u16(0),
      name
    ]);

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(body.length),
      u32(body.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name
    ]);

    localParts.push(localHeader, body);
    centralParts.push(centralHeader);
    offset += localHeader.length + body.length;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0)
  ]);

  fs.writeFileSync(zipPath, Buffer.concat([...localParts, central, end]));
}

makeZip(
  [
    { name: "return-rule-finder.html", path: path.join(dist, "return-rule-finder.html") },
    { name: "iphone-open-this.html", path: path.join(dist, "iphone-open-this.html") },
    { name: "vendors.json", path: path.join(dist, "vendors.json") },
    { name: "使用說明.txt", path: path.join(dist, "使用說明.txt") }
  ],
  path.join(root, "return-rule-finder-mobile.zip")
);

console.log(path.join(dist, "return-rule-finder.html"));
