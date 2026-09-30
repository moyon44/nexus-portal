import React from 'react';
import { Icon } from '@iconify/react';
import { IconName } from '../types';

interface IconRendererProps {
  name: IconName;
  size?: number;
  className?: string;
}

export const IconRenderer: React.FC<IconRendererProps> = ({ name, size = 24, className }) => {
  // Check if it's a legacy Lucide name (Capitalized, no colon) and prefix it if necessary
  // or just pass it through. Iconify handles 'Home' as 'mdi:home' sometimes depending on config, 
  // but it's safer to assume the user provides a valid iconify string or we map legacy ones.
  // For this update, we assume the inputs will be valid Iconify strings (e.g. 'lucide:home', 'tabler:alien').
  // If a simple name like "Box" is passed, Iconify might not render anything unless we prefix.
  // However, we updated the initial data to be explicit.
  
  return <Icon icon={name} width={size} height={size} className={className} />;
};
