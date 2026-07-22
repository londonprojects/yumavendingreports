import React, {useEffect, useRef} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icon references image files by a relative URL that
// doesn't survive bundling — point them at the same CDN copies the package's
// own version ships, keyed to the installed version so it can't drift.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: `https://unpkg.com/leaflet@${L.version}/dist/images/marker-icon-2x.png`,
  iconUrl: `https://unpkg.com/leaflet@${L.version}/dist/images/marker-icon.png`,
  shadowUrl: `https://unpkg.com/leaflet@${L.version}/dist/images/marker-shadow.png`,
});

const escapeHtml = s =>
  String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

// A small numbered circle, used instead of the default pin icon in route mode
// so a visiting order reads at a glance without needing to open each popup.
const numberedIcon = n =>
  L.divIcon({
    className: '',
    html: `<div style="background:#3D2EAA;color:#fff;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });

// Thin wrapper around a plain Leaflet map (no react-leaflet dependency) —
// takes already-geocoded pins and renders them over OpenStreetMap tiles, no
// API key required. Pins sharing identical coordinates (multiple machines at
// the same site) are nudged apart slightly so every marker stays clickable.
// In `showRoute` mode, pins are treated as an ordered stop list: numbered
// markers instead of default pins, plus a connecting line in that order.
export const MachinesMap = ({pins, onSelectDevice, showRoute = false, height = 360}) => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {scrollWheelZoom: false});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    if (pins.length === 0) return;

    // Deterministic tiny offset for exact coordinate collisions, so two
    // machines at the same site don't render as one invisible-behind-another pin.
    const seen = new Map();
    const jittered = pins.map(p => {
      const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
      const n = seen.get(key) || 0;
      seen.set(key, n + 1);
      const angle = (n * 137.5 * Math.PI) / 180; // golden-angle spiral
      const r = n === 0 ? 0 : 0.0006 * Math.sqrt(n);
      return {...p, lat: p.lat + r * Math.sin(angle), lng: p.lng + r * Math.cos(angle)};
    });

    if (showRoute && jittered.length > 1) {
      const line = L.polyline(
        jittered.map(p => [p.lat, p.lng]),
        {color: '#3D2EAA', weight: 3, opacity: 0.6, dashArray: '6,8'},
      ).addTo(map);
      markersRef.current.push(line);
    }

    jittered.forEach((p, i) => {
      const marker = L.marker([p.lat, p.lng], showRoute ? {icon: numberedIcon(i + 1)} : undefined)
        .addTo(map)
        .bindPopup(
          `<strong>${showRoute ? `${i + 1}. ` : ''}${escapeHtml(p.name)}</strong><br/>${
            p.status === 'online' ? '🟢 Online' : '🔴 Offline'
          }${p.subtitle ? `<br/><span style="color:#64748b">${escapeHtml(p.subtitle)}</span>` : ''}`,
        );
      if (onSelectDevice) marker.on('click', () => onSelectDevice(p.deviceId));
      markersRef.current.push(marker);
    });

    const bounds = L.latLngBounds(jittered.map(p => [p.lat, p.lng]));
    map.fitBounds(bounds, {padding: [30, 30], maxZoom: 14});
    // The container may not have had a final layout size when the map first
    // initialized (e.g. it was rendered before data arrived); nudge Leaflet to
    // recheck once we actually have pins to show.
    requestAnimationFrame(() => map.invalidateSize());
  }, [pins, onSelectDevice, showRoute]);

  return <div ref={containerRef} style={{height, borderRadius: 12, overflow: 'hidden'}} />;
};
