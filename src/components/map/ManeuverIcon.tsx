import {
  ArrowUp,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Undo2,
  RotateCw,
  Merge,
  Split,
  Flag,
  MapPin,
  Navigation2,
} from 'lucide-react';
import { LucideProps } from 'lucide-react';

interface ManeuverIconProps extends LucideProps {
  type: string;
  modifier?: string;
}

export function ManeuverIcon({ type, modifier, className, ...props }: ManeuverIconProps) {
  const Icon = pickIcon(type, modifier);
  return <Icon className={className} {...props} />;
}

function pickIcon(type: string, modifier?: string) {
  if (type === 'depart') return Navigation2;
  if (type === 'arrive') return Flag;
  if (type === 'roundabout' || type === 'rotary' || type === 'exit rotary') return RotateCw;
  if (type === 'merge') return Merge;
  if (type === 'fork') return Split;
  if (type === 'end of road' || type === 'continue' || type === 'new name') return ArrowUp;

  if (type === 'turn' || type === 'ramp' || type === 'on ramp' || type === 'off ramp' || type === 'exit roundabout') {
    switch (modifier) {
      case 'left':
        return CornerUpLeft;
      case 'right':
        return CornerUpRight;
      case 'sharp left':
        return ArrowLeft;
      case 'sharp right':
        return ArrowRight;
      case 'slight left':
        return ArrowUpLeft;
      case 'slight right':
        return ArrowUpRight;
      case 'uturn':
        return Undo2;
      case 'straight':
        return ArrowUp;
      default:
        return ArrowUp;
    }
  }
  return MapPin;
}
