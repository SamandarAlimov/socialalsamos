import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Navigation, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function LocationPermissionDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;

    // Check if we already asked
    const asked = localStorage.getItem(`location_asked_${user.id}`);
    if (asked) return;

    // Check current permission state
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'prompt') {
          // Not yet decided - show dialog
          setOpen(true);
        } else if (result.state === 'granted') {
          // Already granted - just update country silently
          localStorage.setItem(`location_asked_${user.id}`, 'true');
          updateCountryFromLocation();
        } else {
          localStorage.setItem(`location_asked_${user.id}`, 'true');
        }
      }).catch(() => {
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  }, [user?.id]);

  const updateCountryFromLocation = async () => {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
        });
      });

      const { latitude, longitude } = position.coords;

      // Reverse geocode to get country
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=3&addressdetails=1`,
        { headers: { 'Accept-Language': 'uz,ru,en' } }
      );

      if (response.ok) {
        const data = await response.json();
        const country = data.address?.country;
        if (country && user?.id) {
          await supabase
            .from('profiles')
            .update({ country })
            .eq('id', user.id);
        }
      }
    } catch (err) {
      console.error('Failed to update country from location:', err);
    }
  };

  const handleAllow = async () => {
    setLoading(true);
    localStorage.setItem(`location_asked_${user?.id}`, 'true');

    try {
      await updateCountryFromLocation();
    } catch {
      // Permission denied or error
    }

    setLoading(false);
    setOpen(false);
  };

  const handleDeny = () => {
    localStorage.setItem(`location_asked_${user?.id}`, 'true');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <MapPin className="h-8 w-8 text-primary" />
          </div>
          <DialogTitle className="text-center text-xl">
            Joylashuvingizni yoqing
          </DialogTitle>
          <DialogDescription className="text-center">
            Platformadan to'liq foydalanish uchun joylashuvingizni yoqishni tavsiya qilamiz
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Navigation className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Yaqindagi odamlarni toping</p>
              <p className="text-xs text-muted-foreground">Atrofingizdagi do'stlaringiz va odamlarni ko'ring</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <MapPin className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Xarita va navigatsiya</p>
              <p className="text-xs text-muted-foreground">Yo'nalishlar va joylashuvni ulashish imkoniyati</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-sm">Xavfsiz va maxfiy</p>
              <p className="text-xs text-muted-foreground">Joylashuvingiz faqat siz xohlagan paytda ulashiladi</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={handleAllow} disabled={loading} className="w-full">
            {loading ? 'Tekshirilmoqda...' : 'Joylashuvni yoqish'}
          </Button>
          <Button variant="ghost" onClick={handleDeny} className="w-full text-muted-foreground">
            Keyinroq
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
