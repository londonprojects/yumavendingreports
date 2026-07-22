import React from 'react';

// Minimal dependency-free bar chart. Each datum needs {key, label, sales, units, revenue};
// bars are plain flexed divs (no SVG/canvas) sized as a percentage of the tallest value.
export const BarChart = ({
  data,
  metric = 'revenue',
  formatValue = v => v,
  color = 'var(--accent)',
  height = 180,
  labelEvery = 1,
}) => {
  const max = Math.max(1, ...data.map(d => d[metric] || 0));
  return (
    <div className="bar-chart" style={{height}}>
      {data.map((d, i) => {
        const value = d[metric] || 0;
        const pct = value > 0 ? Math.max((value / max) * 100, 3) : 0;
        return (
          <div className="bar-chart-col" key={d.key}>
            <div className="bar-chart-track">
              <div
                className="bar-chart-bar"
                style={{height: `${pct}%`, background: color}}
                title={`${d.fullLabel || d.label}\nSales: ${d.sales}\nUnits: ${d.units}\nRevenue: ${formatValue(d.revenue)}`}
              />
            </div>
            <div className="bar-chart-label">{i % labelEvery === 0 ? d.label : ''}</div>
          </div>
        );
      })}
    </div>
  );
};
