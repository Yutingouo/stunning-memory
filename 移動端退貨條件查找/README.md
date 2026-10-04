# 退貨條件查找（作品展示版）

於藥局工讀期間，依現場需求透過 AI 輔助建立初版，再持續改進的手機優先查詢工具。
公開版本包含 348 筆完全虛構的示範資料。廠商名稱、代碼、聯絡資料、退貨條件及備註皆不對應真實廠商，不能用於實際退貨作業。

## 使用方式

1. 執行 `npm run preview`，開啟 `http://127.0.0.1:4173/`；或開啟 `index.html` 使用內建示範資料。
2. 輸入代碼 `001`、`1` 或名稱 `示範廠商001`。
3. 輸入效期年月，例如 `2027/05`、`2027-05`、`202705`。
4. 確認計算基準年月並按「查詢」。

## 功能

- 廠商代碼與名稱查詢。
- 剩餘效期月數計算及月份門檻比對。
- 禁退提示與需人工確認的條件。
- JSON 匯入、CSV 匯出及手機優先介面。
- PWA 離線快取、單檔 HTML 和靜態網站打包。

## 資料更新

`source.xlsx`、`vendors.json`、`vendors-data.js` 均為虛構資料。
請只使用虛構資料更新公開展示版本。

Windows 可執行 `更新廠商資料.bat`。需要 Python 與 openpyxl。
也可以執行：

```bash
python tools/import-vendors-xlsx.py --input source.xlsx --json vendors.json --js vendors-data.js
npm run check
npm run build:single
npm run build:live
```

Excel 匯入會重新整理備註文字，保留示範規則。重新打包才能讓離線 HTML 同步資料。
`dist/` 為離線單檔版本，`dist-live/` 為網站部署版本。兩份 ZIP 亦使用同一組示範資料。

## 判斷方式

剩餘月數 =（效期年 − 基準年）× 12 +（效期月 − 基準月）。
禁退規則優先顯示禁退；未設定月份門檻時提示人工確認；有門檻時比較剩餘月數是否達標。

## 平台

提供 Web / PWA 檔案與 Capacitor 設定。Android、iOS 仍需各自的開發環境建置與驗證，本展示包不含 APK 或 iOS 安裝檔。
詳見 [PLATFORM.md](./PLATFORM.md)。
