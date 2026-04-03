# Linfamily

這個 repo 是一個純前端靜態網站，用來顯示林氏族譜。
目前已經可以直接編輯，不需要額外安裝套件或執行建置流程。

## 專案結構

- `index.html`: 頁面骨架與按鈕、搜尋欄等 UI
- `styles.css`: 全站樣式
- `app.js`: 畫布互動、縮放、搜尋、聚焦邏輯
- `familyData.js`: 族譜資料本體
- `.nojekyll`: GitHub Pages 用設定

## 如何本機預覽

在 repo 根目錄執行：

```powershell
py -m http.server 8080
```

然後打開：

`http://localhost:8080`

## 常見修改位置

- 想改頁面標題或側邊說明：編輯 `index.html`
- 想改配色、字型、版面：編輯 `styles.css`
- 想改節點互動、縮放、搜尋行為：編輯 `app.js`
- 想改族譜人物資料：編輯 `familyData.js`

## 目前狀態

- repo 已經從 `https://github.com/aichan0002/Linfamily.git` 抓到本機
- 本機工作資料夾：`C:\Codex\LinFamily`
- Git remote 已設定完成，可繼續修改後 commit / push
