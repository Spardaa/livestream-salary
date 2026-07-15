import { useState } from "react";
import { useStore } from "../store/runStore";

export function SettingsPanel() {
  const { apiKey, settings, setApiKey, setSettings } = useStore();
  const [open, setOpen] = useState(!apiKey);
  const [showKey, setShowKey] = useState(false);

  return (
    <section className="card settings">
      <button className="collapse-head" onClick={() => setOpen((o) => !o)}>
        <span>⚙️ 设置 {apiKey ? "✓ 已配置" : "（未填 API Key）"}</span>
        <span className="caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="settings-body">
          <label className="field">
            <span>GLM API Key</span>
            <div className="key-row">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
              />
              <button className="mini" onClick={() => setShowKey((s) => !s)}>
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
            <small>仅存浏览器本地 localStorage，不会上传。获取：open.bigmodel.cn / z.ai 控制台。</small>
          </label>

          <div className="row2">
            <label className="field">
              <span>视觉模型</span>
              <input
                value={settings.visionModel}
                onChange={(e) => setSettings({ visionModel: e.target.value })}
                placeholder="glm-5v-turbo"
              />
              <small>节点①读图。若 404 可改 glm-4.5v</small>
            </label>
            <label className="field">
              <span>文本模型</span>
              <input
                value={settings.textModel}
                onChange={(e) => setSettings({ textModel: e.target.value })}
                placeholder="glm-5.2"
              />
              <small>节点②底薪 / ③月报。若 404 可改 glm-5</small>
            </label>
          </div>

          <label className="field">
            <span>每图抽取次数（默认 3）</span>
            <input
              type="number"
              min={1}
              max={9}
              step={1}
              value={settings.consensusDraws}
              onChange={(e) =>
                setSettings({
                  consensusDraws: Math.max(
                    1,
                    Math.min(9, Math.round(Number(e.target.value) || 1)),
                  ),
                })
              }
            />
            <small>Layer1 多数表决次数，建议 ≥3；越多越准但越慢。提成比例改为每人单独填（见②排班）。</small>
          </label>
        </div>
      )}
    </section>
  );
}
