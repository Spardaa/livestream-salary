import type { SalaryRow, SalaryTotals } from "../pipeline/salary";
import type { Confidence, Slot } from "../pipeline/types";

const SLOT_LABEL: Record<Slot, string> = {
  morning: "早班",
  afternoon: "下午班",
  night: "晚班",
};
const slotLabel = (slots: Slot[]) =>
  slots.length ? slots.map((s) => SLOT_LABEL[s]).join("/") : "—";

function confClass(c: Confidence) {
  return c === "high" ? "conf conf-high" : c === "medium" ? "conf conf-medium" : "conf conf-flagged";
}

export function SalaryTable({
  rows,
  totals,
}: {
  rows: SalaryRow[];
  totals?: SalaryTotals | null;
}) {
  const fmt = (n: number | null | undefined) => (n == null ? "—" : n);
  return (
    <div className="day-table-wrap">
      <h3>薪资日表（{rows.length} 天 · {rows.filter((r) => r.hasData).length} 天有直播）</h3>
      <div className="table-scroll">
        <table className="day-table salary-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>抖音GMV</th>
              <th>抖音退款</th>
              <th>小红书GMV</th>
              <th>小红书退款</th>
              <th>净GMV</th>
              <th>底薪</th>
              <th>时段</th>
              <th>提成</th>
              <th>日工资</th>
              <th>置信</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = !r.hasData;
              const dash = e ? "—" : null;
              return (
                <tr
                  key={r.date}
                  className={
                    e ? "row-empty" : r.confidence === "flagged" ? "row-flagged" : ""
                  }
                >
                  <td>{r.date.slice(5)}</td>
                  <td>{dash ?? r.douyinGmv}</td>
                  <td>{dash ?? r.douyinRefund}</td>
                  <td>{dash ?? r.xhsGmv}</td>
                  <td>{dash ?? r.xhsRefund}</td>
                  <td>{dash ?? r.netGmv}</td>
                  <td>{fmt(r.baseSalary)}</td>
                  <td>{e ? "—" : slotLabel(r.slots)}</td>
                  <td>{dash ?? r.commission}</td>
                  <td className="pay-cell">{fmt(r.dailyPay)}</td>
                  <td>
                    {e ? (
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
          {totals && (
            <tfoot>
              <tr>
                <td>合计</td>
                <td>{totals.douyinGmv}</td>
                <td>{totals.douyinRefund}</td>
                <td>{totals.xhsGmv}</td>
                <td>{totals.xhsRefund}</td>
                <td>{totals.netGmv}</td>
                <td>{totals.baseSalary}</td>
                <td />
                <td>{totals.commission}</td>
                <td className="pay-cell">{totals.dailyPay}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
