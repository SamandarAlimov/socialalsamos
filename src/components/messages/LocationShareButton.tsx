import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MapPin, Loader2, Navigation } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LocationShareButtonProps {
  onShareLocation: (location: { latitude: number; longitude: number; address?: string }) => void;
}

function LocationPicker({ 
  onSelect, 
  currentLocation 
}: { 
  onSelect: (lat: number, lng: number) => void;
  currentLocation: { lat: number; lng: number } | null;
}) {
  const [marker, setMarker] = useState<{ lat: number; lng: number } | null>(currentLocation);
  
  const MapClickHandler = () => {
    useMapEvents({
      click: (e) => {
        setMarker({ lat: e.latlng.lat, lng: e.latlng.lng });
        onSelect(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  };
  
  return (
    <>
      <MapClickHandler />
      {marker && (
        <Marker position={[marker.lat, marker.lng]} />
      )}
    </>
  );
}

export function LocationShareButton({ onShareLocation }: LocationShareButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  
  const getCurrentLocation = async () => {
    setIsLoading(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      
      const loc = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      setCurrentLocation(loc);
      setSelectedLocation(loc);
      setShowPicker(true);
    } catch (error) {
      toast.error('Could not get your location. Please enable location services.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleShareCurrent = () => {
    if (currentLocation) {
      onShareLocation({
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
      });
      setShowPicker(false);
      toast.success('Location shared');
    }
  };
  
  const handleShareSelected = () => {
    if (selectedLocation) {
      onShareLocation({
        latitude: selectedLocation.lat,
        longitude: selectedLocation.lng,
      });
      setShowPicker(false);
      toast.success('Location shared');
    }
  };
  
  return (
    <>
      <button
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-left"
        onClick={getCurrentLocation}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
        ) : (
          <MapPin className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm">Location</span>
      </button>
      
      <Dialog open={showPicker} onOpenChange={setShowPicker}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Share Location</DialogTitle>
          </DialogHeader>
          
          <div className="h-[400px] relative">
            {currentLocation && (
              <MapContainer
                center={[currentLocation.lat, currentLocation.lng]}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationPicker
                  currentLocation={currentLocation}
                  onSelect={(lat, lng) => setSelectedLocation({ lat, lng })}
                />
              </MapContainer>
            )}
          </div>
          
          <div className="p-4 space-y-2">
            <Button 
              className="w-full" 
              onClick={handleShareCurrent}
              variant="outline"
            >
              <Navigation className="h-4 w-4 mr-2" />
              Share Current Location
            </Button>
            {selectedLocation && selectedLocation !== currentLocation && (
              <Button 
                className="w-full" 
                onClick={handleShareSelected}
              >
                <MapPin className="h-4 w-4 mr-2" />
                Share Selected Location
              </Button>
            )}
            <p className="text-xs text-muted-foreground text-center">
              Tap on the map to select a different location
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}