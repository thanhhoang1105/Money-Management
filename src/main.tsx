import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.tsx';

// Đăng ký Service Worker cho PWA (Offline-First 100%)
registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] Phiên bản mới đã sẵn sàng. Tự động cập nhật...');
  },
  onOfflineReady() {
    console.log('[PWA] Ứng dụng đã sẵn sàng chạy Offline 100%.');
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
