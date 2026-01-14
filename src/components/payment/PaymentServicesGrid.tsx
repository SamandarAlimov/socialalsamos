import { 
  Smartphone, 
  Lightbulb, 
  Wifi, 
  Building2, 
  Banknote,
  Tv,
  Receipt,
  GraduationCap,
  Heart,
  Shield,
  Server,
  Globe,
  Bus,
  Phone,
  MoreHorizontal,
  Plane,
  Car,
  Stethoscope,
  Dumbbell,
  Scale
} from 'lucide-react';
import { PaymentServiceCard } from './PaymentServiceCard';
import { PaymentSectionHeader } from './PaymentSectionHeader';

const services = [
  { icon: Smartphone, label: "Mobil operatorlar", key: "mobile" },
  { icon: Lightbulb, label: "Kommunal", key: "utilities" },
  { icon: Wifi, label: "Internet", key: "internet" },
  { icon: Building2, label: "Davlat xizmatlari", key: "government" },
  { icon: Banknote, label: "Kreditlar", key: "loan_payment" },
  { icon: Tv, label: "TV va media", key: "tv_media" },
  { icon: Receipt, label: "Rekvizitlar", key: "requisites" },
  { icon: GraduationCap, label: "Ta'lim", key: "education" },
  { icon: Heart, label: "Xayriya", key: "charity" },
  { icon: Shield, label: "Sug'urta", key: "insurance" },
  { icon: Server, label: "Hosting", key: "hosting" },
  { icon: Globe, label: "Onlayn xizmatlar", key: "online_services" },
  { icon: Bus, label: "Transport", key: "transport" },
  { icon: Phone, label: "Statsionar tel", key: "landline" },
  { icon: Plane, label: "Sayohat", key: "travel" },
  { icon: Car, label: "Avto maktab", key: "driving_school" },
  { icon: Stethoscope, label: "Tibbiyot", key: "medicine" },
  { icon: Dumbbell, label: "Sport", key: "sports" },
  { icon: Scale, label: "Yuridik", key: "legal" },
  { icon: MoreHorizontal, label: "Boshqa", key: "other" },
];

interface PaymentServicesGridProps {
  onServiceClick?: (serviceKey: string) => void;
}

export function PaymentServicesGrid({ onServiceClick }: PaymentServicesGridProps) {
  return (
    <div>
      <PaymentSectionHeader title="To'lov xizmatlari" />
      <div className="grid grid-cols-4 gap-2">
        {services.map((service) => (
          <PaymentServiceCard
            key={service.key}
            icon={service.icon}
            label={service.label}
            onClick={() => onServiceClick?.(service.key)}
          />
        ))}
      </div>
    </div>
  );
}
