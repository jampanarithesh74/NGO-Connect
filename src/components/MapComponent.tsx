import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in Leaflet with React
// @ts-ignore
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

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
}

function LocationPicker({ onLocationSelect }: { onLocationSelect: (lat: number, lng: number) => void }) {
  const [position, setPosition] = useState<L.LatLng | null>(null);
  
  useMapEvents({
    click(e) {
      setPosition(e.latlng);
      onLocationSelect(e.latlng.lat, e.latlng.lng);
    },
  });

  return position === null ? null : (
    <Marker position={position}>
      <Popup>Selected Location</Popup>
    </Marker>
  );
}

function ChangeView({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

const MapComponent: React.FC<MapComponentProps> = ({ 
  center = [20.5937, 78.9629], // Default to India center
  zoom = 5,
  markers = [],
  onLocationSelect,
  isPicker = false
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
          <LocationPicker onLocationSelect={onLocationSelect} />
        )}
      </MapContainer>
    </div>
  );
};

export default MapComponent;
