import React, {useState} from 'react';

// Minimal dependency-free bar chart. Each datum needs {key, label, sales, units, revenue};
// bars are plain flexed divs (no SVG/canvas) sized as a percentage of the tallest value.
// Hovering a bar shows an instant floating tooltip (not the browser's native,
// slow-to-appear `title` tooltip) with the exact sales/units/revenue for that bar.
export const BarChart = ({
  data,
  metric = 'revenue',
  formatValue = v => v,
  color = 'var(--accent)',
  height = 180,
  labelEvery = 1,
}) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  const max = Math.max(1, ...data.map(d => d[metric] || 0));
  const n = data.length;
  const tooltipPct = hoverIdx != null ? Math.max(6, Math.min(94, ((hoverIdx + 0.5) / n) * 100)) : 0;
  const hovered = hoverIdx != null ? data[hoverIdx] : null;

  return (
    <div style={{position: 'relative'}}>
      <div className="bar-chart" style={{height}}>
        {data.map((d, i) => {
          const value = d[metric] || 0;
          const pct = value > 0 ? Math.max((value / max) * 100, 3) : 0;
          return (
            <div
              className="bar-chart-col"
              key={d.key}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(idx => (idx === i ? null : idx))}>
              <div className="bar-chart-track">
                <div
                  className="bar-chart-bar"
                  style={{
                    height: `${pct}%`,
                    background: color,
                    opacity: hoverIdx == null || hoverIdx === i ? 1 : 0.45,
                  }}
                />
              </div>
              <div className="bar-chart-label">{i % labelEvery === 0 ? d.label : ''}</div>
            </div>
          );
        })}
      </div>

      {hovered && (
        <div
          style={{
            position: 'absolute',
            left: `${tooltipPct}%`,
            top: 4,
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: 'var(--shadow)',
            padding: '8px 10px',
            fontSize: 12,
            minWidth: 140,
            pointerEvents: 'none',
            zIndex: 5,
            whiteSpace: 'nowrap',
          }}>
          <div style={{fontWeight: 700, marginBottom: 4}}>{hovered.fullLabel || hovered.label}</div>
          <div style={{display: 'flex', justifyContent: 'space-between', gap: 10}}>
            <span className="muted">Revenue</span>
            <strong>{formatValue(hovered.revenue)}</strong>
          </div>
          <div style={{display: 'flex', justifyContent: 'space-between', gap: 10}}>
            <span className="muted">Sales</span>
            <strong>{hovered.sales}</strong>
          </div>
          <div style={{display: 'flex', justifyContent: 'space-between', gap: 10}}>
            <span className="muted">Units</span>
            <strong>{hovered.units}</strong>
          </div>
        </div>
      )}
    </div>
  );
};
