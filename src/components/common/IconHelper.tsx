import React from 'react';
import {
  Layers,
  Cpu,
  BookOpen,
  Compass,
  Sparkles,
  Feather,
  Bookmark,
  Briefcase,
  FileText,
  Heart,
  Code,
  Globe,
  Folder,
  Calendar,
  Flame,
  Award,
  CheckSquare,
  Tag,
  Shield,
  ShieldCheck,
  Sun,
  Star,
  Zap,
  Sparkle,
  Crown,
  Trophy,
  Navigation,
  Film,
  LucideIcon,
} from 'lucide-react';

const ICON_REGISTRY: Record<string, LucideIcon> = {
  Layers,
  Cpu,
  BookOpen,
  Compass,
  Sparkles,
  Sparkle,
  Feather,
  Bookmark,
  Briefcase,
  FileText,
  Heart,
  Code,
  Globe,
  Folder,
  Calendar,
  Flame,
  Award,
  CheckSquare,
  Tag,
  Shield,
  ShieldCheck,
  Sun,
  Star,
  Zap,
  Crown,
  Trophy,
  Navigation,
  Film,
  Repeat: Calendar,
  Activity: Zap,
  Target: Compass,
};

interface IconHelperProps {
  name: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
}

export const IconHelper: React.FC<IconHelperProps> = ({
  name,
  className = 'w-4 h-4',
  size = 16,
  strokeWidth = 1.5,
}) => {
  const IconComponent = ICON_REGISTRY[name] || Folder;
  return <IconComponent className={className} size={size} strokeWidth={strokeWidth} />;
};
