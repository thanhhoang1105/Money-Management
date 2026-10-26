// src/services/themeService.ts
import { useState, useEffect } from 'react';

export type ThemeMode = 'DARK' | 'LIGHT' | 'AUTO';
export type EffectiveTheme = 'DARK' | 'LIGHT';

const THEME_STORAGE_KEY = 'app_theme_mode';

/**
 * Đọc chế độ giao diện đã lưu từ localStorage (Mặc định: 'AUTO')
 */
export function getStoredThemeMode(): ThemeMode {
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === 'DARK' || val === 'LIGHT' || val === 'AUTO') {
      return val;
    }
  } catch {
    // ignore
  }
  return 'AUTO';
}

/**
 * Tính toán giao diện hiệu lực thực tế:
 * - 'DARK': Luôn là Tối
 * - 'LIGHT': Luôn là Sáng
 * - 'AUTO': Tự động theo giờ thực tế của máy (06:00 - 18:00 là Sáng, 18:00 - 06:00 là Tối)
 */
export function calculateEffectiveTheme(mode: ThemeMode = getStoredThemeMode()): EffectiveTheme {
  if (mode === 'DARK') return 'DARK';
  if (mode === 'LIGHT') return 'LIGHT';

  // Chế độ AUTO: Lấy theo giờ máy
  const currentHour = new Date().getHours();
  const isDaytime = currentHour >= 6 && currentHour < 18;
  return isDaytime ? 'LIGHT' : 'DARK';
}

/**
 * Trả về chuỗi mô tả thân thiện giải thích trạng thái hiện tại
 */
export function getThemeDescription(mode: ThemeMode): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const timeStr = `${hours}:${minutes}`;

  if (mode === 'DARK') {
    return 'Giao diện Tối cố định (Bảo vệ mắt ban đêm, tiết kiệm pin)';
  }
  if (mode === 'LIGHT') {
    return 'Giao diện Sáng cố định (Sáng rõ, dễ nhìn khi làm việc ban ngày)';
  }

  const isDaytime = now.getHours() >= 6 && now.getHours() < 18;
  if (isDaytime) {
    return `Tự động theo giờ máy: Hiện tại là ${timeStr} ➔ Áp dụng Sáng (06:00 - 18:00)`;
  } else {
    return `Tự động theo giờ máy: Hiện tại là ${timeStr} ➔ Áp dụng Tối (18:00 - 06:00)`;
  }
}

/**
 * Áp dụng theme lên document root
 */
export function applyTheme(mode: ThemeMode = getStoredThemeMode()): EffectiveTheme {
  if (typeof document === 'undefined') return 'DARK';

  const effective = calculateEffectiveTheme(mode);
  const root = document.documentElement;

  if (effective === 'LIGHT') {
    root.classList.add('theme-light');
    root.classList.remove('theme-dark');
    root.setAttribute('data-theme', 'light');
    root.style.colorScheme = 'light';
  } else {
    root.classList.add('theme-dark');
    root.classList.remove('theme-light');
    root.setAttribute('data-theme', 'dark');
    root.style.colorScheme = 'dark';
  }

  // Cập nhật thẻ meta theme-color cho status bar trên iOS/Android PWA
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', effective === 'LIGHT' ? '#f8fafc' : '#090d16');
  }

  return effective;
}

/**
 * Lưu tùy chọn người dùng và kích hoạt áp dụng ngay lập tức
 */
export function setThemeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
  applyTheme(mode);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-theme-changed', { detail: { mode } }));
  }
}

/**
 * React hook tiện ích cho các UI components theo dõi & thay đổi giao diện
 */
export function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>(getStoredThemeMode);
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>(() => calculateEffectiveTheme(getStoredThemeMode()));

  useEffect(() => {
    const handleThemeChange = () => {
      const curMode = getStoredThemeMode();
      setModeState(curMode);
      setEffectiveTheme(calculateEffectiveTheme(curMode));
    };

    window.addEventListener('app-theme-changed', handleThemeChange);

    // Kiểm tra định kỳ mỗi 60 giây nếu đang ở chế độ AUTO (tự chuyển đổi khi qua mốc 06:00 hoặc 18:00)
    const interval = setInterval(() => {
      const curMode = getStoredThemeMode();
      if (curMode === 'AUTO') {
        const eff = applyTheme('AUTO');
        setEffectiveTheme(eff);
      }
    }, 60000);

    return () => {
      window.removeEventListener('app-theme-changed', handleThemeChange);
      clearInterval(interval);
    };
  }, []);

  const changeMode = (newMode: ThemeMode) => {
    setThemeMode(newMode);
    setModeState(newMode);
    setEffectiveTheme(calculateEffectiveTheme(newMode));
  };

  return {
    mode,
    effectiveTheme,
    setMode: changeMode,
    description: getThemeDescription(mode)
  };
}
