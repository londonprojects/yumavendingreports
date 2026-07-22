// Palette carried over from the HAHA mobile app so the reporting web app keeps
// the same brand identity (deep indigo accent + status colors).
export const palette = {
  accent: '#3D2EAA',
  accentDark: '#281E73',
  accentLight: '#E8E6FB',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
};

export const stockColor = severity => {
  if (severity === 'critical') return palette.danger;
  if (severity === 'warning') return palette.warning;
  return palette.success;
};
