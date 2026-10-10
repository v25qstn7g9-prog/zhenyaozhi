# 針藥誌

GLP-1 注射與體重紀錄的個人網頁 App（純前端，沒有後端）。

- 正式網址：https://zhenyaozhi-tracker.vercel.app
- Vercel 專案：`zhenyaozhi-tracker`（帳號範圍 `johnny576707`）
- 上線的檔案就是 `src/` 裡的四個檔：`index.html`、`style.css`、`i18n.js`（介面文字，中／英）、`app.js`。
- 部署方式：把 `src/` 內的檔案放在部署的根目錄上傳到 Vercel（目前沒有連 Git 自動部署）。

## 資料

- 全部存在使用者手機瀏覽器的 localStorage，key 是 `zhenyaozhi.records.v1`，格式 `{profile, weights, injections}`。
- 改版時不要改這個 key 或欄位，否則手機裡的舊紀錄會讀不到。要改格式前先請使用者在「設定 → 下載備份檔」匯出備份。

## 歷史

- 第一個 commit 是 2026-09 部署在 Vercel 的原始版本（單一 index.html）。
- 2026-10-10 改版：暖橘紅色系、首頁大卡片與注射倒數、圖表標籤、月份分組紀錄、月曆在上的注射頁；並修正 0.25 mg 被顯示成 0.3 的問題。資料格式沒變。
