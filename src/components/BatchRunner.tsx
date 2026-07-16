import { useRef, useState } from "react";
import { useStore } from "../store/runStore";
import { DayTable } from "./DayTable";
import { countBySeverity } from "../pipeline/validate";
import type { Confidence } from "../pipeline/types";

function confClass(c?: Confidence | null) {
  if (c === "high") return "conf conf-high";
  if (c === "medium") return "conf conf-medium";
  if (c === "flagged") return "conf conf-flagged";
  return "conf";
}
function confLabel(c?: Confidence | null) {
  if (c === "high") return "高 3/3";
  if (c === "medium") return "中 2/3";
  if (c === "flagged") return "需人工";
  return "—";
}

export function BatchRunner() {
  const {
    apiKey,
    settings,
    month,
    setMonth,
    items,
    running,
    progress,
    rateLimited,
    dayTable,
    issues,
    addFiles,
    removeItem,
    clear,
    runExtraction,
    // 表格导入
    source,
    setSource,
    tableItems,
    addSpreadsheets,
    removeTableItem,
    importError,
  } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const tableInputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [tableCollapsed, setTableCollapsed] = useState(false);

  async function onPickImages(files: FileList | null) {
    if (files) await addFiles(files);
  }
  async function onPickTable(files: FileList | null) {
    if (files) await addSpreadsheets(files);
  }

  const counts = countBySeverity(issues);
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const hasResult = dayTable.length > 0 || issues.length > 0;

  const accounts = [...new Set(tableItems.map((t) => t.anchor))];

  return (
    <div className="batch">
      <div className="seg">
        <button
          type="button"
          className={source === "image" ? "seg-btn active" : "seg-btn"}
          onClick={() => setSource("image")}
        >
          📷 截图识图
        </button>
        <button
          type="button"
          className={source === "table" ? "seg-btn active" : "seg-btn"}
          onClick={() => setSource("table")}
        >
          📊 表格导入
        </button>
      </div>

      <div className="row2">
        <label className="field">
          <span>月份（用于日期校验与补年份）</span>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          <small>如 2026-06；留空则按 2026 补全年份</small>
        </label>
      </div>

      {source === "image" ? (
        <>
          <div
            className="dropzone"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onPickImages(e.dataTransfer.files);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => onPickImages(e.target.files)}
            />
            <div className="drop-hint">📷 点击或拖入多张直播间截图（可多选）</div>
          </div>

          {items.length > 0 && (
            <>
              <div className="actions">
                <button
                  className="primary"
                  onClick={runExtraction}
                  disabled={running || !apiKey || items.length === 0}
                >
                  {running ? `抽取中 ${pct}%` : `▶ 开始抽取（${items.length} 张 × ${settings.consensusDraws}）`}
                </button>
                <button className="mini" onClick={clear} disabled={running}>
                  清空
                </button>
                {!apiKey && <span className="err-text">请先在「设置」填 API Key</span>}
              </div>

              {running && (
                <div className="progress">
                  <div className="progress-bar" style={{ width: `${pct}%` }} />
                  <span className="progress-text">{progress.done}/{progress.total} 次抽取</span>
                </div>
              )}

              {rateLimited > 0 && (
                <div className="warn-box">
                  ⚠ 本次抽取遇到 {rateLimited} 次 429 限速（已自动退避重试，未丢数据）。频繁出现说明并发偏高，可在「设置」降低并发数。
                </div>
              )}

              <button
                type="button"
                className="collapse-toggle"
                onClick={() => setListOpen((o) => !o)}
              >
                <span>📷 图片列表（{items.length} 张）</span>
                <span className="caret">{listOpen ? "▾" : "▸"}</span>
              </button>
              {listOpen && (
                <div className="item-list">
                  {items.map((it) => {
                    const c = it.consensus?.confidence;
                    const v = it.consensus?.value;
                    return (
                      <div key={it.id} className={`item ${c === "flagged" ? "item-flagged" : ""}`}>
                        <img src={it.dataUrl} alt={it.name} className="item-thumb" />
                        <div className="item-main">
                          <div className="item-name">{it.name}</div>
                          <div className="item-meta">
                            {it.status === "done" && v ? (
                              <>
                                <span className={`badge platform-${v.platform}`}>
                                  {v.platform === "douyin" ? "抖音" : "小红书"}
                                </span>
                                <span>{v.date} {v.start_time}</span>
                                <span>GMV ¥{v.gmv}</span>
                                <span>退款 ¥{v.refund}</span>
                                <span className={confClass(c)}>{confLabel(c)}</span>
                              </>
                            ) : it.status === "error" ? (
                              <span className="err-text">❌ {it.error ?? "抽取失败"}</span>
                            ) : (
                              <span className="muted">
                                {it.status === "extracting"
                                  ? `抽取中… ${it.draws.length}/${settings.consensusDraws}`
                                  : "待抽取"}
                              </span>
                            )}
                          </div>
                          {it.status === "done" && it.consensus && (
                            <button
                              className="link"
                              onClick={() => setExpanded(expanded === it.id ? null : it.id)}
                            >
                              {expanded === it.id ? "收起" : "查看 3 次读数"}
                            </button>
                          )}
                          {expanded === it.id && it.consensus && (
                            <div className="draws">
                              {it.consensus.draws.map((d, i) => (
                                <div
                                  key={i}
                                  className={`draw ${
                                    it.consensus!.dissents.includes(d) ? "draw-dissent" : ""
                                  }`}
                                >
                                  #{i + 1} {d.platform} · {d.date} {d.start_time} · GMV {d.gmv} · 退款 {d.refund}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button className="mini" onClick={() => removeItem(it.id)} disabled={running}>
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div
            className="dropzone"
            onClick={() => tableInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onPickTable(e.dataTransfer.files);
            }}
          >
            <input
              ref={tableInputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              hidden
              onChange={(e) => onPickTable(e.target.files)}
            />
            <div className="drop-hint">📊 点击或拖入抖音 / 小红书 明细表（.xlsx，可多选）</div>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            表格数据字段更全（在线人数、转化漏斗、粉丝等），无需 API Key，解析即可用于更专业的月报。
          </p>

          {importError && <div className="warn-box">⚠ 解析失败：{importError}</div>}

          {tableItems.length > 0 && (
            <>
              <div className="actions">
                <span className="muted">已解析 {tableItems.length} 行 · {accounts.length} 个账号</span>
                <button className="mini" onClick={clear}>清空</button>
              </div>

              <p className="hint" style={{ marginTop: 6 }}>
                表格为公司账号数据，<b>不</b>按主播筛选；归属完全由「② 排班（日期 × 时段）」决定，与截图模式一致。
              </p>

              <button
                type="button"
                className="collapse-toggle"
                onClick={() => setTableCollapsed((c) => !c)}
              >
                <span>📋 已解析明细（{tableItems.length} 行）</span>
                <span className="caret">{tableCollapsed ? "▸" : "▾"}</span>
              </button>

              {!tableCollapsed && (
                <div className="table-scroll">
                  <table className="day-table">
                    <thead>
                      <tr>
                        <th>平台</th><th>账号</th><th>日期</th><th>开播</th>
                        <th>GMV</th><th>退款</th><th>观看</th><th>转化</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableItems.map((t) => {
                        const v = t.consensus.value;
                        return (
                          <tr key={t.id}>
                            <td>
                              <span className={`badge platform-${v.platform}`}>
                                {v.platform === "douyin" ? "抖音" : "小红书"}
                              </span>
                            </td>
                            <td>{t.anchor}</td>
                            <td>{v.date}</td>
                            <td>{v.start_time}</td>
                            <td>¥{v.gmv}</td>
                            <td>¥{v.refund}</td>
                            <td>{t.rich.viewers ?? "—"}</td>
                            <td>{t.rich.conversionRate != null ? `${t.rich.conversionRate}%` : "—"}</td>
                            <td>
                              <button className="mini" onClick={() => removeTableItem(t.id)}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="hint" style={{ marginTop: 6 }}>
                选好月份后，直接到「② 薪资结算」开始（无需「开始抽取」）。
              </p>
            </>
          )}
        </>
      )}

      {hasResult && (
        <div className="result-section">
          <h3>校验结果</h3>
          <div className="issue-summary">
            <span className="chip chip-err">错误 {counts.error}</span>
            <span className="chip chip-warn">警告 {counts.warn}</span>
            <span className="chip chip-info">提示 {counts.info}</span>
          </div>
          {issues.length > 0 && (
            <ul className="issues">
              {issues.map((iss, i) => (
                <li key={i} className={`issue issue-${iss.severity}`}>
                  <span className="dot" /> {iss.message}
                </li>
              ))}
            </ul>
          )}
          {dayTable.length > 0 && <DayTable rows={dayTable} />}
        </div>
      )}
    </div>
  );
}
