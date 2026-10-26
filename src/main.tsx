import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.tsx';

// Đăng ký Service Worker cho PWA (Offline-First 100%, tự động làm mới khi có phiên bản mới)
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] Phiên bản mới đã sẵn sàng. Tự động tải lại...');
    updateSW(true);
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
