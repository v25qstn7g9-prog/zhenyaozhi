# 針藥誌

GLP-1 注射與體重紀錄的個人網頁 App（純前端，沒有後端）。

- 正式網址：https://zhenyaozhi-tracker.vercel.app
- Vercel 專案：`zhenyaozhi-tracker`（帳號範圍 `johnny576707`）
- 前端上線檔案位於 `src/`：`index.html`、`style.css`、`i18n.js`（中／英文字）、`records.js`（資料驗證）、`app.js`，以及圖示與圖片。
- 部署方式：已連 Git，推到 `main` 會自動部署到正式網址。Vercel 專案的 Root Directory 必須是 `src`，否則網站會 404。

## 飲食頁的 AI 估算

- `src/api/food.js` 是唯一的後端（Vercel Function，路徑 `/api/food`）：收照片或文字，交給 Gemini 估算每樣食物的熱量與蛋白質／碳水／脂肪／纖維。
- 需要在 Vercel 專案設定環境變數 `GEMINI_API_KEY`（可選 `GEMINI_MODEL`，預設 `gemini-3.6-flash`）。沒設時頁面會提示改用手動輸入。
- 只接受同網域呼叫，每個 IP 每小時 30 次（單一伺服器實例內計算）。照片不會存起來，只存估算出的文字和數字。

## 資料

- 全部存在使用者手機瀏覽器的 localStorage，key 是 `zhenyaozhi.records.v1`，格式 `{profile, weights, injections, meals, purchases}`。`meals` 是 2026-10 新增的，舊資料沒有這欄會當成空清單；`profile.kcalTarget` 是每日熱量目標（預設 1500）。
- 改版時不要改這個 key 或欄位，否則手機裡的舊紀錄會讀不到。要改格式前先請使用者在「設定 → 備份與還原 → 備份」匯出備份檔。

- 2026-10 第二批新增欄位（都是選填，舊資料照常讀）：`purchases`（帳本：`{date, medication, items:[{doseMg, qty}], price, place}`）；注射加 `medication`（`mounjaro`／`wegovy`）、`time`，部位多了 `c-abd-u`、`r-abd-m`、`l-abd-m`、`c-abd-l`；體重加 `time`、`musclePercent`、`waistCm`、`leanKg`、`custom:[{name, value}]`。有帳本紀錄時，累計花費以帳本為準。

- 存檔失敗（例如手機儲存空間滿了、瀏覽器不允許儲存）時，頂端標題列一直顯示提醒，可「再試一次」或「下載備份」，下一次存成功才消失；有沒存到的變更時，關掉或重新整理前瀏覽器會先問。
- 還原前會驗證日期、必要欄位與數值，失敗不改現有資料。舊備份未提供 `meals`／`purchases` 時，保留瀏覽器現有的對應紀錄。讀到損毀的既存資料時，先提供「下載原始資料」與還原／確認清除入口，不自動覆寫成示範資料。

## 回歸檢查

- 無額外套件的資料驗證測試（CI 也執行）：`node --test tests/*.test.js`。
- 瀏覽器回歸需可用的 Playwright 與 Chromium。先在另一個終端執行 `python3 -m http.server 8202 --directory src`，再執行 `node --test tests/browser.browser.js`。可用 `ZY_TEST_URL` 與 `CHROMIUM_PATH` 指定本機服務及瀏覽器。測試只用隔離示範資料，阻擋 AI 請求；估算編修測試使用攔截的固定回應。

## 歷史

- 第一個 commit 是 2026-09 部署在 Vercel 的原始版本（單一 index.html）。
- 2026-10-10 改版：暖橘紅色系、首頁大卡片與注射倒數、圖表標籤、月份分組紀錄、月曆在上的注射頁；並修正 0.25 mg 被顯示成 0.3 的問題。資料格式沒變。
