import React, {useMemo, useState} from 'react';

// Minimal dependency-free multi-line chart: one SVG polyline per series, a
// hover crosshair snapped to the nearest x, and a tooltip listing every
// series' value at that point. No axis library — just enough to show a
// profit trend with min/max context.
export const LineChart = ({series, labels, formatValue = v => v, height = 220}) => {
  const [hoverIdx, setHoverIdx] = useState(null);
  const n = labels.length;
  const W = 600;
  const padL = 44;
  const padR = 10;
  const padT = 14;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = height - padT - padB;

  const {min, max} = useMemo(() => {
    let lo = 0;
    let hi = 0;
    series.forEach(s => s.points.forEach(v => {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }));
    if (lo === hi) hi = lo + 1;
    const pad = (hi - lo) * 0.08;
    return {min: lo - pad, max: hi + pad};
  }, [series]);

  const xAt = i => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yAt = v => padT + plotH - ((v - min) / (max - min)) * plotH;
  const zeroY = yAt(0);

  const paths = useMemo(
    () =>
      series.map(s => ({
        ...s,
        d: s.points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(v).toFixed(2)}`).join(' '),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, min, max],
  );

  const handleMove = e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    setHoverIdx(Math.max(0, Math.min(n - 1, Math.round(pct * (n - 1)))));
  };

  const tooltipPct = hoverIdx != null ? Math.max(6, Math.min(94, (hoverIdx / (n - 1 || 1)) * 100)) : 0;

  if (!series.length) return null;

  return (
    <div style={{position: 'relative'}}>
      <div style={{position: 'absolute', top: padT - 5, left: 0, fontSize: 10, color: 'var(--text-3)'}}>
        {formatValue(max)}
      </div>
      <div style={{position: 'absolute', bottom: padB - 5, left: 0, fontSize: 10, color: 'var(--text-3)'}}>
        {formatValue(min)}
      </div>

      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
        style={{display: 'block', overflow: 'visible', cursor: 'crosshair'}}>
        {min < 0 && max > 0 && (
          <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--border)" strokeDasharray="3,3" />
        )}
        {paths.map(s => (
          <path key={s.deviceId} d={s.d} fill="none" stroke={s.color} strokeWidth={2} />
        ))}
        {hoverIdx != null && (
          <>
            <line
              x1={xAt(hoverIdx)}
              y1={padT}
              x2={xAt(hoverIdx)}
              y2={padT + plotH}
              stroke="var(--border)"
              strokeWidth={1}
            />
            {paths.map(s => (
              <circle key={s.deviceId} cx={xAt(hoverIdx)} cy={yAt(s.points[hoverIdx])} r={3.5} fill={s.color} />
            ))}
          </>
        )}
      </svg>

      <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginTop: 2, paddingLeft: padL, paddingRight: padR}}>
        <span>{labels[0]}</span>
        <span>{labels[n - 1]}</span>
      </div>

      {hoverIdx != null && (
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
            minWidth: 150,
            pointerEvents: 'none',
            zIndex: 5,
          }}>
          <div style={{fontWeight: 700, marginBottom: 4}}>{labels[hoverIdx]}</div>
          {paths.map(s => (
            <div key={s.deviceId} style={{display: 'flex', justifyContent: 'space-between', gap: 10}}>
              <span style={{display: 'flex', alignItems: 'center', gap: 5, minWidth: 0}}>
                <span
                  style={{width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0, display: 'inline-block'}}
                />
                <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{s.deviceName}</span>
              </span>
              <strong style={{flexShrink: 0}}>{formatValue(s.points[hoverIdx])}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
