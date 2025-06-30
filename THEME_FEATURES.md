# ProTrack Theme System

## Overview
ProTrack now includes a comprehensive light/dark theme system that allows users to toggle between light and dark modes for improved accessibility and user preference.

## Features

### 🌙 Automatic Theme Detection
- Detects system preference for dark/light mode on first visit
- Saves user preference in localStorage for future sessions
- Smooth transitions between theme changes

### 🎨 Theme Toggle Component
- Elegant sun/moon icon toggle button
- Available in multiple sizes (sm, md, lg)
- Smooth animations and transitions
- Accessible with proper ARIA labels

### 🎯 Strategic Placement
The theme toggle is conveniently placed in:
- **Desktop Sidebar**: Bottom section near user info and logout
- **Mobile Header**: Top right corner for easy access
- **Mobile Sidebar**: Bottom section in slide-out menu

### 🌈 Comprehensive Dark Mode Support

#### Layout & Navigation
- Sidebar background adapts to theme
- Navigation items with proper contrast
- Active states with theme-appropriate colors
- Border colors that adjust automatically

#### Dashboard Cards
- Financial metric cards with dark backgrounds
- Proper text contrast for readability
- Icon colors that adapt to theme
- Smooth hover effects in both themes

#### User Interface Elements
- User cards with role badges
- Invitation cards with status indicators
- Loading states and error messages
- Form elements and inputs

#### Logo & Branding
- Logo text adapts to theme colors
- Chart elements maintain visibility
- Connecting lines adjust for contrast

## Technical Implementation

### Context System
```tsx
// ThemeContext provides theme state management
const { theme, setTheme, toggleTheme } = useTheme()
```

### CSS Variables
The system uses CSS custom properties for seamless theme switching:
- `--background`, `--foreground` for base colors
- `--card`, `--border` for component styling
- Smooth transitions with `transition-theme` class

### Tailwind Configuration
- Class-based dark mode strategy
- Extended color palette with theme variables
- Custom transition properties for smooth changes

## Usage

### For Users
1. Look for the sun/moon toggle button in the sidebar or header
2. Click to switch between light and dark themes
3. Your preference is automatically saved

### For Developers
```tsx
// Use the theme toggle component
import ThemeToggle from '@/components/ui/ThemeToggle'

<ThemeToggle size="md" className="custom-class" />
```

```tsx
// Access theme state in components
import { useTheme } from '@/contexts/ThemeContext'

function MyComponent() {
  const { theme, toggleTheme } = useTheme()
  // Component logic here
}
```

## Browser Support
- Modern browsers with CSS custom property support
- Graceful fallback for older browsers
- Mobile-optimized touch targets

## Accessibility
- Proper contrast ratios in both themes
- ARIA labels for screen readers
- Keyboard navigation support
- High contrast mode compatibility

## Future Enhancements
- System theme change detection
- Custom theme colors
- Theme-specific component variants
- Advanced accessibility options 