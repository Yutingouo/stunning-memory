const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outDir = path.join(root, "dist-live");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const files = [
  "index.html",
  "styles.css",
  "app.js",
  "vendors-data.js",
  "vendors.json",
  "manifest.webmanifest",
  "service-worker.js",
  "icon.svg"
];

for (const file of files) {
  fs.copyFileSync(path.join(root, file), path.join(outDir, file));
}

fs.writeFileSync(
  path.join(outDir, "使用說明.txt"),
  [
    "退貨條件計算系統 - 即時更新版",
    "",
    "建議使用方式：",
    "1. 將 dist-live 內所有檔案放到公司內網主機、NAS 網頁目錄或任何 HTTPS 靜態網站空間。",
    "2. 手機用網址開啟 index.html 或根目錄網址。",
    "3. Excel 更新後，重新產生 vendors.json 並覆蓋同資料夾檔案。",
    "4. 手機下次開啟會優先抓新版 vendors.json。",
    "",
    "注意：",
    "- 若直接把檔案傳到手機點開，會使用內建資料，無法即時更新。",
    "- 若要多人共用與即時更新，請用網址開啟。",
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

function makeZip(entries, zipPath) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const body = fs.readFileSync(entry.path);
    const crc = crc32(body);
    const localHeader = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(body.length), u32(body.length), u16(name.length), u16(0), name
    ]);
    const centralHeader = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(body.length), u32(body.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name
    ]);

    localParts.push(localHeader, body);
    centralParts.push(centralHeader);
    offset += localHeader.length + body.length;
  }

  const central = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(central.length), u32(offset), u16(0)
  ]);
  fs.writeFileSync(zipPath, Buffer.concat([...localParts, central, end]));
}

const zipEntries = fs.readdirSync(outDir).map((file) => ({
  name: file,
  path: path.join(outDir, file)
}));
makeZip(zipEntries, path.join(root, "return-rule-finder-live.zip"));
console.log(path.join(root, "return-rule-finder-live.zip"));
