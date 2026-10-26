// src/components/MotorcycleIcon.tsx
import React from 'react';

export interface MotorcycleIconProps {
  size?: number;
  color?: string;
  className?: string;
  strokeWidth?: number;
}

export const MotorcycleIcon: React.FC<MotorcycleIconProps> = ({
  size = 20,
  color = 'currentColor',
  className = '',
  strokeWidth = 2
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Bánh xe sau */}
      <circle cx="5" cy="16" r="3" />
      {/* Bánh xe trước */}
      <circle cx="19" cy="16" r="3" />
      {/* Yên xe */}
      <path d="M6 11h4.5" />
      {/* Khung sườn xe máy */}
      <path d="M5 16l3-5h5l3 5" />
      {/* Cọc đỡ máy */}
      <path d="M10 16l2.5-5" />
      {/* Đầu xe máy, ghi đông tay lái & phuộc trước */}
      <path d="M13 6h2.5l2 4l1.5 6" />
    </svg>
  );
};

export default MotorcycleIcon;
