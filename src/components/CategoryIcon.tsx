// src/components/CategoryIcon.tsx
import React from 'react';
import * as Icons from 'lucide-react';

interface CategoryIconProps {
  name: string;
  size?: number;
  color?: string;
  className?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
  name,
  size = 20,
  color = '#ffffff',
  className = ''
}) => {
  // @ts-ignore
  const IconComponent = (Icons as Record<string, any>)[name] || Icons.CircleDot;
  return <IconComponent size={size} color={color} className={className} />;
};
