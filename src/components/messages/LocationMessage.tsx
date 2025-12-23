import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, ExternalLink } from 'lucide-react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '@/lib/utils';

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationMessageProps {
  latitude: number;
  longitude: number;
  address?: string;
  isMine: boolean;
  senderName?: string;
}

export function LocationMessage({ 
  latitude, 
  longitude, 
  address,
  isMine,
  senderName 
}: LocationMessageProps) {
  const navigate = useNavigate();
  
  const handleOpenInApp = () => {
    navigate(`/map?destLat=${latitude}&destLng=${longitude}&destName=${encodeURIComponent(address || senderName || 'Shared Location')}`);
  };
  
  const handleOpenExternal = () => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
      '_blank'
    );
  };
  
  return (
    <div className="w-64 overflow-hidden rounded-lg">
      <div className="h-32 relative">
        <MapContainer
          center={[latitude, longitude]}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={[latitude, longitude]} />
        </MapContainer>
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
      </div>
      
      <div className={cn(
        "p-2 space-y-2",
        isMine ? "bg-primary/90" : "bg-card"
      )}>
        <div className="flex items-start gap-2">
          <MapPin className={cn(
            "h-4 w-4 flex-shrink-0 mt-0.5",
            isMine ? "text-primary-foreground" : "text-primary"
          )} />
          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-xs font-medium truncate",
              isMine ? "text-primary-foreground" : "text-foreground"
            )}>
              {address || 'Shared Location'}
            </p>
            <p className={cn(
              "text-[10px]",
              isMine ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </p>
          </div>
        </div>
        
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={isMine ? "secondary" : "default"}
            className="flex-1 h-7 text-xs"
            onClick={handleOpenInApp}
          >
            <Navigation className="h-3 w-3 mr-1" />
            Directions
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(
              "h-7",
              isMine && "border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
            )}
            onClick={handleOpenExternal}
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}