import React, { forwardRef } from "react";
import { MapContainer as RLMapContainer, type MapContainerProps } from "react-leaflet";
import type { Map as LeafletMap } from "leaflet";

/**
 * Thin wrapper around react-leaflet's MapContainer.
 * Keeps our app code stable while ensuring we use the library's own context wiring.
 */
export const SafeMapContainer = forwardRef<LeafletMap, MapContainerProps>((props, ref) => {
  return <RLMapContainer {...props} ref={ref} />;
});

SafeMapContainer.displayName = "SafeMapContainer";
