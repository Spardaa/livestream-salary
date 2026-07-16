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
  } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);

  async function onPick(files: FileList | null) {
    if (files) await addFiles(files);
  }

  const counts = countBySeverity(issues);
  const pct = progress.total
    ? Math.round((progress.done / progress.total) * 100)
    : 0;
  const hasResult = dayTable.length > 0 || issues.length > 0;

  return (
    <div className="batch">
      <div className="row2">
        <label className="field">
          <span>月份（用于日期校验与补年份）</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <small>如 2026-06；留空则按 2026 补全年份</small>
        </label>
      </div>

      <div
        className="dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onPick(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onPick(e.target.files)}
        />
        <div className="drop-hint">
          📷 点击或拖入多张直播间截图（可多选）
        </div>
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
              <span className="progress-text">
                {progress.done}/{progress.total} 次抽取
              </span>
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
                <div
                  key={it.id}
                  className={`item ${c === "flagged" ? "item-flagged" : ""}`}
                >
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
                        onClick={() =>
                          setExpanded(expanded === it.id ? null : it.id)
                        }
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
                  <button
                    className="mini"
                    onClick={() => removeItem(it.id)}
                    disabled={running}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
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
