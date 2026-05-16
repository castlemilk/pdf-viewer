import React, {memo, useMemo} from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {SvgXml} from 'react-native-svg';

export const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M5 12.5 9.5 17 19 7"/>',
  chevron_left: '<path d="m15 18-6-6 6-6"/>',
  chevron_right: '<path d="m9 18 6-6-6-6"/>',
  chevron_down: '<path d="m6 9 6 6 6-6"/>',
  chevron_up: '<path d="m18 15-6-6-6 6"/>',
  arrow_left: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  arrow_right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  arrow_up_right: '<path d="M7 17 17 7M8 7h9v9"/>',
  more_h: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  more_v: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
  library: '<path d="M4 19V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13"/><path d="M4 19a2 2 0 0 1 2-2h14"/><path d="M8 7v8M12 7v8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.7 5.7 6.3.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.3-.9L12 3Z"/>',
  share: '<path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4M16 6l-4-4-4 4M12 2v13"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  inbox: '<path d="M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M4 13 6 5h12l2 8"/><path d="M4 13h4l1 2h6l1-2h4"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  tag: '<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z"/><circle cx="7.5" cy="7.5" r="1.1" fill="currentColor"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/>',
  doc_lines: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  rows: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/>',
  columns: '<rect x="3" y="3" width="8" height="18" rx="1"/><rect x="13" y="3" width="8" height="18" rx="1"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  sidebar_right: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  panel_bottom: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18"/>',
  filter: '<path d="M3 5h18l-7 9v5l-4-2v-3L3 5Z"/>',
  sort: '<path d="M7 4v16m0 0-3-3m3 3 3-3M17 20V4m0 0-3 3m3-3 3 3"/>',
  compare: '<path d="M3 4h7v16H3z"/><path d="M14 4h7v16h-7z"/><path d="M10 12h4"/>',
  sparkles: '<path d="M12 3v3M12 18v3M5 12H2M22 12h-3M6 6 4 4M20 20l-2-2M6 18l-2 2M20 4l-2 2"/><path d="M12 8.5 13.5 12 17 13.5 13.5 15 12 18.5 10.5 15 7 13.5 10.5 12 12 8.5Z" stroke-linejoin="round"/>',
  command: '<path d="M9 6a3 3 0 1 0 0 6h6a3 3 0 1 0 0-6 3 3 0 0 0-3 3v6a3 3 0 1 0 3-3H9a3 3 0 1 0-3 3 3 3 0 0 0 3-3V9a3 3 0 0 0-3-3Z"/>',
  return: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v6"/>',
  bookmark: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4V4Z"/>',
  bookmark_filled: '<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4V4Z" fill="currentColor"/>',
  pencil: '<path d="M16 3 21 8 8 21H3v-5L16 3Z"/><path d="m14 5 5 5"/>',
  highlighter: '<path d="m9 11 9-9 4 4-9 9H9v-4Z"/><path d="M9 11v4H5v4l-2 2h7l2-2v-3"/>',
  pen: '<path d="m12 19 8-8a2.5 2.5 0 0 0-3.5-3.5l-8 8L7 19l5 0Z"/><path d="m14 9 3 3"/>',
  signature: '<path d="M3 18s3-9 7-9 3 8 7 8 4-4 4-4"/>',
  comment: '<path d="M21 12a8 8 0 0 1-12 7l-5 2 2-5A8 8 0 1 1 21 12Z"/>',
  hand: '<path d="M8 12V6a2 2 0 0 1 4 0v6M12 11V4a2 2 0 0 1 4 0v8M16 11V7a2 2 0 0 1 4 0v10a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5 4 4 0 0 1 4-4"/>',
  zoom_in: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6M11 8v6"/>',
  zoom_out: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
  fit_page: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 9v6h6V9z"/>',
  page_two_up: '<rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/>',
  page_single: '<rect x="6" y="4" width="12" height="16" rx="1"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 4h14"/>',
  trash: '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1.5 14a1 1 0 0 1-1 .9H7.5a1 1 0 0 1-1-.9L5 6"/>',
  link: '<path d="M10 13a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7L11 6"/><path d="M14 11a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7L13 18"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  text: '<path d="M4 7V5h16v2M9 5v14M15 19h-12"/>',
  table_of_contents: '<path d="M3 6h6M3 12h6M3 18h6M13 6h8M13 12h8M13 18h8"/><circle cx="11" cy="6" r=".6" fill="currentColor"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 1 4 3 3 0 0 0 4 3 3 3 0 0 0 3 1 3 3 0 0 0 3-1 3 3 0 0 0 4-3 3 3 0 0 0 1-4 3 3 0 0 0-2-5 3 3 0 0 0-3-3 3 3 0 0 0-3-1 3 3 0 0 0-3 1Z"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/>',
} as const;

export type IconName = keyof typeof ICON_PATHS;

type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
  style?: StyleProp<ViewStyle>;
};

function createIconXml(path: string, size: number, color: string, stroke: number) {
  const coloredPath = path.replace(/currentColor/g, color);

  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${coloredPath}</svg>`;
}

function IconComponent({
  name,
  size = 16,
  color = '#111110',
  stroke = 1.5,
  style,
}: IconProps) {
  const path = ICON_PATHS[name];
  const xml = useMemo(
    () => (path ? createIconXml(path, size, color, stroke) : undefined),
    [color, path, size, stroke],
  );

  if (!xml) {
    return (
      <View
        testID={`icon-missing-${String(name)}`}
        accessibilityLabel={`Missing icon ${String(name)}`}
        style={[styles.missing, {width: size, height: size}, style]}
      />
    );
  }

  return (
    <SvgXml
      testID={`icon-${name}`}
      accessibilityLabel={`${name} icon`}
      xml={xml}
      width={size}
      height={size}
      style={style}
    />
  );
}

export const Icon = memo(IconComponent);

const styles = StyleSheet.create({
  missing: {
    backgroundColor: '#FF00FF',
    flexShrink: 0,
  },
});
