import type { DayRow } from "../pipeline/aggregate";
import { sumDayRows, isEmptyDay } from "../pipeline/aggregate";
import type { Confidence, Slot } from "../pipeline/types";

const SLOT_LABEL: Record<Slot, string> = {
  morning: "早",
  afternoon: "下午",
  night: "晚",
};
const slotsLabel = (slots: Slot[]) =>
  slots.length ? slots.map((s) => SLOT_LABEL[s]).join("/") : "—";

function confClass(c: Confidence) {
  return c === "high" ? "conf conf-high" : c === "medium" ? "conf conf-medium" : "conf conf-flagged";
}

export function DayTable({ rows }: { rows: DayRow[] }) {
  const totals = sumDayRows(rows);
  const cell = (n: number | undefined) => (n == null ? "" : n);
  return (
    <div className="day-table-wrap">
      <h3>日表预览（{rows.length} 天 · {rows.filter((r) => !isEmptyDay(r)).length} 天有直播）</h3>
      <div className="table-scroll">
        <table className="day-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>抖音GMV</th>
              <th>抖音退款</th>
              <th>小红书GMV</th>
              <th>小红书退款</th>
              <th>时段</th>
              <th>置信</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const empty = isEmptyDay(r);
              return (
                <tr
                  key={r.date}
                  className={
                    empty ? "row-empty" : r.confidence === "flagged" ? "row-flagged" : ""
                  }
                >
                  <td>{r.date.slice(5)}</td>
                  <td>{cell(r.douyin?.gmv)}</td>
                  <td>{cell(r.douyin?.refund)}</td>
                  <td>{cell(r.xiaohongshu?.gmv)}</td>
                  <td>{cell(r.xiaohongshu?.refund)}</td>
                  <td>{empty ? "—" : slotsLabel(r.slots)}</td>
                  <td>
                    {empty ? (
                      "—"
                    ) : (
                      <span className={confClass(r.confidence)}>
                        {r.confidence === "high" ? "高" : r.confidence === "medium" ? "中" : "红"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>合计</td>
              <td>{totals.douyinGmv}</td>
              <td>{totals.douyinRefund}</td>
              <td>{totals.xhsGmv}</td>
              <td>{totals.xhsRefund}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
