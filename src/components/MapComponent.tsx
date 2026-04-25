import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

// Fix for default marker icons in Leaflet with React using CDN URLs
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  tooltipAnchor: [16, -28],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapComponentProps {
  center?: [number, number];
  zoom?: number;
  markers?: Array<{
    id: string;
    position: [number, number];
    title: string;
    description?: string;
    onClick?: () => void;
    onAcceptTask?: (taskId: string) => void;
    onNavigate?: (lat: number, lng: number) => void;
  }>;
  onLocationSelect?: (lat: number, lng: number) => void;
  isPicker?: boolean;
  pickerValue?: [number, number] | null;
}

function LocationPicker({ 
  onLocationSelect, 
  initialPosition 
}: { 
  onLocationSelect: (lat: number, lng: number) => void,
  initialPosition?: [number, number] | null
}) {
  const [position, setPosition] = useState<L.LatLng | [number, number] | null>(initialPosition || null);
  
  useEffect(() => {
    setPosition(initialPosition || null);
  }, [initialPosition]);

  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      setPosition(e.latlng);
      onLocationSelect(lat, lng);
    },
  });

  return position === null ? null : (
    <Marker position={position as L.LatLngExpression}>
      <Popup>Selected Location</Popup>
    </Marker>
  );
}

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  const [lat, lng] = center;
  
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], zoom, {
        animate: true,
        duration: 1.5
      });
    }
  }, [lat, lng, zoom, map]);
  return null;
}

const MapComponent: React.FC<MapComponentProps> = ({ 
  center = [20.5937, 78.9629], // Default to India center
  zoom = 5,
  markers = [],
  onLocationSelect,
  isPicker = false,
  pickerValue = null
}) => {
  return (
    <div className="h-full w-full rounded-xl overflow-hidden shadow-inner border border-slate-200">
      <MapContainer 
        center={center} 
        zoom={zoom} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ChangeView center={center as [number, number]} zoom={zoom} />
        
        {markers.map((marker) => (
          <Marker 
            key={marker.id} 
            position={marker.position as [number, number]}
            eventHandlers={{
              click: () => {
                if (marker.onClick) marker.onClick();
              },
            }}
          >
            <Popup>
              <div className="p-1 min-w-[150px]">
                <h3 className="font-bold text-slate-900">{marker.title}</h3>
                {marker.description && <p className="text-xs text-slate-500 mt-1 mb-2">{marker.description}</p>}
                {marker.onAcceptTask && (
                  <button 
                    onClick={() => marker.onAcceptTask!(marker.id)}
                    className="w-full bg-primary text-white text-[10px] font-bold py-1.5 rounded hover:bg-primary/90 transition-colors mb-1"
                  >
                    Accept Task
                  </button>
                )}
                {marker.onNavigate && (
                  <button 
                    onClick={() => marker.onNavigate!(marker.position[0], marker.position[1])}
                    className="w-full bg-slate-800 text-white text-[10px] font-bold py-1.5 rounded hover:bg-slate-700 transition-colors"
                  >
                    Navigate
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {isPicker && onLocationSelect && (
          <LocationPicker 
            onLocationSelect={onLocationSelect} 
            initialPosition={pickerValue}
          />
        )}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
