# 跨平台使用方式

這個專案採用「一份 Web 核心，多平台包裝」的方式。查詢邏輯、畫面與廠商資料都在同一套檔案中，不需要為 Android、iOS、網頁各寫一份。

## 共同核心

這些檔案是所有平台共用的核心：

- `index.html`
- `styles.css`
- `app.js`
- `vendors-data.js`
- `vendors.json`
- `manifest.webmanifest`
- `service-worker.js`
- `icon.svg`

## 平台選項

### 1. Web / 內網網站

把核心檔案放到任何靜態網站空間即可，例如公司內網主機、NAS、GitHub Pages、Cloudflare Pages。

適合：多人共用、網址開啟、更新資料方便。

### 2. PWA

用 HTTPS 網址開啟後，手機瀏覽器可加入主畫面。`service-worker.js` 會快取 app 與廠商資料，開過一次後可離線使用。

適合：不用上架、不想安裝 APK，但希望像 App 一樣使用。

### 3. Android APK

使用 Capacitor 把同一份 Web 核心包成 Android App。

基本流程：

```bash
npm install
npm run cap:add:android
npm run cap:sync
npx cap open android
```

在 Android Studio 裡 Build APK 後，就能把 APK 安裝到手機。

適合：不公開資料、離線使用、用 APK 發給內部人員。

### 4. iOS App

使用 Capacitor 包成 iOS App。

基本流程：

```bash
npm install
npm run cap:add:ios
npm run cap:sync
npx cap open ios
```

需要 macOS 與 Xcode 才能打包。

## 資料更新策略

如果是 Web / PWA：更新 `vendors-data.js` 後重新部署即可。

如果是 APK / iOS 離線版：更新 `vendors-data.js` 後需要重新打包 App。

如果未來想做到「App 不重包、資料可更新」，可以改成讓 app 從公司內網下載 `vendors.json`，失敗時再使用內建資料。

目前 app 已採用這個方向：啟動時會優先讀取同資料夾的 `vendors.json`，讀不到才使用內建的 `vendors-data.js`。所以 Web、內網與 PWA 只要更新 `vendors.json`，手機端下次開啟就能取得新版資料。

完全離線的單檔 HTML 版本例外，因為資料已包進 HTML，需要重新打包單檔。

## 建議採用方案

最適合目前需求的是「內網 / 靜態網站 + PWA」：

1. 將 `dist-live` 內的檔案放到公司內網、NAS 網頁服務或固定主機。
2. 手機用網址開啟後加入主畫面。
3. 後續 Excel 改版時，在電腦端重新產生 `vendors.json` 並覆蓋主機上的同名檔案。
4. 手機下次開啟就抓新版資料；離線時則使用上次成功抓到的資料。

這個方案不需要上架、不需要每次重包 APK，也不必把廠商資料放到公開 GitHub Pages。
