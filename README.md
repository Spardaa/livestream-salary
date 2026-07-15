# 直播间工资结算

纯前端 Web 应用（PWA）：把抖音 / 小红书「单直播间表现」截图，自动整理成**工资日表 + 薪资汇总 + 完整明细 + 图表看板 + 月报与工作建议**，一键导出 Excel / Markdown。

浏览器直连 GLM（智谱 / Z.ai）视觉 + 文本模型，**无后端**，API Key 只存浏览器本地。

## 工作流（确定性流水线 + 3 个 LLM 节点）

```
截图 ─► [① GLM-5V 视觉抽取] ─► 结构化记录
        三抽+多数表决(Layer1) → 确定性兜底校验(Layer2)
        合并/班次/底薪[② GLM文本]/提成 ─► 日表 + 薪资表 + 明细表
        端到端三表比对(Layer3) ─► 一致才定稿，否则熔断提醒
        [③ GLM文本 月报] ─► 月报 + 图表 + 一键导出
```

**三层重复验证（涉及工资，绝不静默敲定）**
- Layer1：每张图独立三抽 + 多数表决（高/中/需人工）。
- Layer2：确定性兜底校验（退款≤GMV、日期连续、重复图、跨月等）。
- Layer3：用三次抽取各建一张薪资表逐日比对；分歧的图自动升级重抽，仍不一致则 🔴 熔断。**存在熔断项时不可导出。**

## 使用

1. `npm install`
2. `npm run dev` → 打开本地地址
3. 「设置」里填 GLM API Key（[open.bigmodel.cn](https://open.bigmodel.cn) / [z.ai](https://z.ai) 控制台获取），确认视觉/文本模型 ID
4. 选月份 → 拖入截图 → ① 开始三抽抽取
5. 填底薪规则（自然语言）→ ② 计算薪资 + 三表验证
6. ④ 生成月报 → 导出 Excel / Markdown

**底薪规则示例**：`6.1-6.7 每天100；6.8-6.14 白班140晚班180；6.15起白班140晚班180`

**提成**：`提成 = (GMV − 退款) × 提成比例`，默认 2%，设置里可调。
**班次**：白班 14:00–18:00，晚班 20:00–24:00（按开播时间判定）。

## 部署到 GitHub Pages

1. 把本目录推到 GitHub 仓库
2. 仓库 Settings → Pages → Source 选 **GitHub Actions**
3. 推送到 `main` 即自动构建部署（见 `.github/workflows/deploy.yml`）
4. 手机/pad 浏览器「添加到主屏幕」可当本地 App 使用（PWA）

> 若 PWA 在 `用户名.github.io/仓库名/` 子路径下安装异常，把 `vite.config.ts` 的 `base` 改为 `"/仓库名/"`。

## 模型与安全

- 默认视觉 `glm-5v-turbo`、文本 `glm-5.2`；若调用报模型不存在，在「设置」改为账号可用 ID（如 `glm-5`、`glm-4.5v`）。
- API Key 仅存浏览器 `localStorage`，不上传、不入仓库。请勿把含 Key 的截图/日志外发。

## 技术栈

Vite + React + TypeScript + Zustand + Zod + ECharts + SheetJS + vite-plugin-pwa。
