import { useState, useEffect, useCallback } from 'react';

export interface SavedPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'recent' | 'favorite';
  address?: string;
  icon?: string;
  timestamp: number;
}

const STORAGE_KEY = 'directions_history';
const MAX_RECENT = 10;

export function useDirectionsHistory() {
  const [places, setPlaces] = useState<SavedPlace[]>([]);

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setPlaces(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load directions history:', error);
    }
  }, []);

  // Save to localStorage
  const savePlaces = useCallback((newPlaces: SavedPlace[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newPlaces));
      setPlaces(newPlaces);
    } catch (error) {
      console.error('Failed to save directions history:', error);
    }
  }, []);

  // Add recent search
  const addRecent = useCallback((place: Omit<SavedPlace, 'id' | 'type' | 'timestamp'>) => {
    setPlaces(prev => {
      // Remove duplicates
      const filtered = prev.filter(p => 
        !(p.lat === place.lat && p.lng === place.lng && p.type === 'recent')
      );
      
      // Add new recent at beginning
      const newPlace: SavedPlace = {
        ...place,
        id: `recent_${Date.now()}`,
        type: 'recent',
        timestamp: Date.now(),
      };
      
      // Keep only MAX_RECENT recent items
      const recents = [newPlace, ...filtered.filter(p => p.type === 'recent')].slice(0, MAX_RECENT);
      const favorites = filtered.filter(p => p.type === 'favorite');
      
      const newPlaces = [...favorites, ...recents];
      savePlaces(newPlaces);
      return newPlaces;
    });
  }, [savePlaces]);

  // Add/remove favorite
  const toggleFavorite = useCallback((place: Omit<SavedPlace, 'id' | 'type' | 'timestamp'>, icon?: string) => {
    setPlaces(prev => {
      const existingFavorite = prev.find(p => 
        p.lat === place.lat && p.lng === place.lng && p.type === 'favorite'
      );
      
      let newPlaces: SavedPlace[];
      if (existingFavorite) {
        // Remove favorite
        newPlaces = prev.filter(p => p.id !== existingFavorite.id);
      } else {
        // Add favorite
        const newFavorite: SavedPlace = {
          ...place,
          id: `fav_${Date.now()}`,
          type: 'favorite',
          icon: icon || '⭐',
          timestamp: Date.now(),
        };
        newPlaces = [newFavorite, ...prev];
      }
      
      savePlaces(newPlaces);
      return newPlaces;
    });
  }, [savePlaces]);

  // Check if place is favorite
  const isFavorite = useCallback((lat: number, lng: number) => {
    return places.some(p => p.lat === lat && p.lng === lng && p.type === 'favorite');
  }, [places]);

  // Clear all recent
  const clearRecent = useCallback(() => {
    setPlaces(prev => {
      const favorites = prev.filter(p => p.type === 'favorite');
      savePlaces(favorites);
      return favorites;
    });
  }, [savePlaces]);

  // Delete single item
  const deletePlace = useCallback((id: string) => {
    setPlaces(prev => {
      const newPlaces = prev.filter(p => p.id !== id);
      savePlaces(newPlaces);
      return newPlaces;
    });
  }, [savePlaces]);

  const recentPlaces = places.filter(p => p.type === 'recent').sort((a, b) => b.timestamp - a.timestamp);
  const favoritePlaces = places.filter(p => p.type === 'favorite').sort((a, b) => b.timestamp - a.timestamp);

  return {
    places,
    recentPlaces,
    favoritePlaces,
    addRecent,
    toggleFavorite,
    isFavorite,
    clearRecent,
    deletePlace,
  };
}
