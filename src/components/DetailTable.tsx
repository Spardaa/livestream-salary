import { Fragment, useState } from "react";
import { useStore } from "../store/runStore";
import type { Confidence } from "../pipeline/types";

function confClass(c?: Confidence | null) {
  if (c === "high") return "conf conf-high";
  if (c === "medium") return "conf conf-medium";
  if (c === "flagged") return "conf conf-flagged";
  return "conf";
}

export function DetailTable() {
  const items = useStore((s) => s.items);
  const [open, setOpen] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const done = items
    .filter((it) => it.consensus)
    .sort(
      (a, b) =>
        a.consensus!.value.date.localeCompare(b.consensus!.value.date) ||
        a.consensus!.value.start_time.localeCompare(b.consensus!.value.start_time),
    );
  if (done.length === 0) return null;

  return (
    <div className="day-table-wrap">
      <button
        type="button"
        className="collapse-toggle"
        onClick={() => setCollapsed((c) => !c)}
      >
        <span>完整明细（{done.length} 场直播）</span>
        <span className="caret">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
      <div className="table-scroll">
        <table className="day-table">
          <thead>
            <tr>
              <th>平台</th>
              <th>日期</th>
              <th>开播</th>
              <th>GMV</th>
              <th>退款</th>
              <th>净额</th>
              <th>置信</th>
              <th>富指标</th>
            </tr>
          </thead>
          <tbody>
            {done.map((it) => {
              const v = it.consensus!.value;
              const metricKeys = Object.keys(v.metrics);
              return (
              <Fragment key={it.id}>
                <tr
                  className={it.consensus!.confidence === "flagged" ? "row-flagged" : ""}
                >
                  <td>
                    <span className={`badge platform-${v.platform}`}>
                      {v.platform === "douyin" ? "抖音" : "小红书"}
                    </span>
                  </td>
                  <td>{v.date}</td>
                  <td>{v.start_time}</td>
                  <td>{v.gmv}</td>
                  <td>{v.refund}</td>
                  <td>{Math.round((v.gmv - v.refund) * 100) / 100}</td>
                  <td>
                    <span className={confClass(it.consensus!.confidence)}>
                      {it.consensus!.confidence === "high" ? "高" : it.consensus!.confidence === "medium" ? "中" : "红"}
                    </span>
                  </td>
                  <td>
                    {metricKeys.length > 0 ? (
                      <button className="link" onClick={() => setOpen(open === it.id ? null : it.id)}>
                        {metricKeys.length} 项 {open === it.id ? "▾" : "▸"}
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
                {open === it.id && metricKeys.length > 0 && (
                  <tr className="metrics-row">
                    <td colSpan={8}>
                      <div className="metrics-grid">
                        {metricKeys.map((k) => (
                          <span key={k} className="metric-kv">
                            <b>{k}</b>: {String(v.metrics[k])}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
