export const colors = {
  canvas: '#F4F6F3',
  surface: '#FFFFFF',
  surfaceMuted: '#E9EEEA',
  ink: '#17201D',
  inkMuted: '#5E6B65',
  line: '#D8E0DA',
  brand: '#167A5A',
  brandPressed: '#0F6046',
  brandSoft: '#E3F1EB',
  accent: '#E86F51',
  accentSoft: '#FCE9E3',
  gold: '#A86F12',
  goldSoft: '#FAEFD8',
  danger: '#B53D37',
  dangerSoft: '#FBE9E7',
  info: '#256A8A',
  infoSoft: '#E4F0F5',
  white: '#FFFFFF',
} as const;

export const radii = {
  small: 4,
  medium: 8,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const shadow = {
  shadowColor: '#17201D',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.08,
  shadowRadius: 10,
  elevation: 2,
} as const;
