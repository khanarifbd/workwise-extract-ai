import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { LeafletContext, createLeafletContext } from "@react-leaflet/core";
import { Map as LeafletMap, type MapOptions, type LatLngBoundsExpression } from "leaflet";
import type { FitBoundsOptions } from "leaflet";

export type MapRef = LeafletMap | null;

export interface SafeMapContainerProps extends MapOptions {
  bounds?: LatLngBoundsExpression;
  boundsOptions?: FitBoundsOptions;
  className?: string;
  id?: string;
  placeholder?: React.ReactNode;
  style?: React.CSSProperties;
  whenReady?: () => void;
  center?: [number, number];
  zoom?: number;
  children?: React.ReactNode;
}

/**
 * Workaround for a React context Consumer crash observed with the upstream MapContainer.
 * This uses LeafletContext.Provider explicitly.
 */
export const SafeMapContainer = forwardRef<LeafletMap, SafeMapContainerProps>(
  (
    { bounds, boundsOptions, center, children, className, id, placeholder, style, whenReady, zoom, ...options },
    forwardedRef
  ) => {
    const [containerProps] = useState({ className, id, style });
    const [context, setContext] = useState<ReturnType<typeof createLeafletContext> | null>(null);
    const mapInstanceRef = useRef<LeafletMap>();

    useImperativeHandle(forwardedRef, () => context?.map ?? null, [context]);

    const mapRef = useCallback(
      (node: HTMLDivElement | null) => {
        if (node !== null && !mapInstanceRef.current) {
          const map = new LeafletMap(node, options);
          mapInstanceRef.current = map;

          if (center != null && zoom != null) {
            map.setView(center, zoom);
          } else if (bounds != null) {
            map.fitBounds(bounds, boundsOptions);
          }

          if (whenReady != null) {
            map.whenReady(whenReady);
          }

          setContext(createLeafletContext(map));
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    );

    useEffect(() => {
      return () => {
        context?.map.remove();
      };
    }, [context]);

    const contents = context ? (
      <LeafletContext.Provider value={context}>{children}</LeafletContext.Provider>
    ) : (
      placeholder ?? null
    );

    return (
      <div {...containerProps} ref={mapRef}>
        {contents}
      </div>
    );
  }
);

SafeMapContainer.displayName = "SafeMapContainer";
