// Icônes de nav — même style que ThemeSwitcher.jsx/NotificationBell.jsx (trait simple 24x24,
// currentColor) pour rester cohérent sans ajouter de librairie d'icônes.
function Svg({ children }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function IconDashboard() {
  return <Svg><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></Svg>;
}
export function IconCart() {
  return <Svg><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2.5 3h2.6l2.6 12.2a2 2 0 0 0 2 1.6h8.1a2 2 0 0 0 2-1.6L21.5 7H6.2" /></Svg>;
}
export function IconChart() {
  return <Svg><path d="M4 20V10M11 20V4M18 20v-7" /><path d="M2 20h20" /></Svg>;
}
export function IconBox() {
  return <Svg><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></Svg>;
}
export function IconTag() {
  return <Svg><path d="M12 2 3 11a2 2 0 0 0 0 2.8l7.2 7.2a2 2 0 0 0 2.8 0L22 12V2h-10Z" /><circle cx="17.5" cy="6.5" r="1.2" /></Svg>;
}
export function IconBook() {
  return <Svg><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5v-17Z" /><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /></Svg>;
}
export function IconUsers() {
  return <Svg><circle cx="9" cy="7" r="3.2" /><path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2S15.5 16.4 15.5 20" /><path d="M16.5 4.2a3.2 3.2 0 0 1 0 6.3" /><path d="M18.5 13.9c2.6.7 3.9 2.9 3.9 6.1" /></Svg>;
}
export function IconWorkflow() {
  return <Svg><circle cx="5" cy="6" r="2.3" /><circle cx="5" cy="18" r="2.3" /><circle cx="19" cy="12" r="2.3" /><path d="M7.3 6h4.2a3 3 0 0 1 3 3v0M7.3 18h4.2a3 3 0 0 0 3-3v0" /></Svg>;
}
export function IconDatabase() {
  return <Svg><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></Svg>;
}
export function IconSettings() {
  return <Svg><circle cx="12" cy="12" r="3" /><path d="M19.4 13a7.9 7.9 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-6l-.3 2.6a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.4L4.6 11a7.9 7.9 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7.6 7.6 0 0 0 1.7 1L9 21h6l.3-2.6a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.4L19.4 13Z" /></Svg>;
}
export function IconChevron() {
  return <Svg><path d="m9 18 6-6-6-6" /></Svg>;
}
export function IconLogout() {
  return <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></Svg>;
}
export function IconEmployees() {
  return <Svg><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h6M9 12h6M9 16h3" /></Svg>;
}
