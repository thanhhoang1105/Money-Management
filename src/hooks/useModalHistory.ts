// src/hooks/useModalHistory.ts
import { useEffect, useRef } from 'react';

/**
 * Hook đồng bộ trạng thái màn hình phẳng (Stack Screen / Modal) với Browser History
 * giúp hỗ trợ nút Back vật lý trên Android, cử chỉ vuốt Back trên iOS và nút Back của trình duyệt.
 *
 * @param isOpen Trạng thái màn hình đang mở hay đóng
 * @param onClose Callback đóng màn hình
 * @param screenKey Định danh duy nhất của màn hình trong history stack (vd: 'editor', 'history', 'events')
 */
export function useModalHistory(
  isOpen: boolean,
  onClose: () => void,
  screenKey: string
) {
  const onCloseRef = useRef(onClose);
  const isPoppingRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    // Đẩy trạng thái vào history khi màn hình mở
    window.history.pushState({ modalScreen: screenKey }, '');

    const handlePopState = (event: PopStateEvent) => {
      // Nếu trạng thái mới không còn là screenKey này -> đóng màn hình
      if (event.state?.modalScreen !== screenKey) {
        isPoppingRef.current = true;
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Nếu đóng chủ động qua UI/code mà history vẫn đang ở screenKey này -> pop state
      if (!isPoppingRef.current && window.history.state?.modalScreen === screenKey) {
        window.history.back();
      }
      isPoppingRef.current = false;
    };
  }, [isOpen, screenKey]);
}
