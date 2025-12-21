// Re-export MapContainer from react-leaflet v4 which is compatible with React 18
// The v5 version requires React 19's use() hook which is not available
export { MapContainer as SafeMapContainer } from 'react-leaflet';
