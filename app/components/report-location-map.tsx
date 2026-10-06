"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";

type ReportLocationMapProps = {
  latitude: number;
  longitude: number;
  title: string;
};

export function ReportLocationMap({ latitude, longitude, title }: ReportLocationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let marker: MapLibreMarker | null = null;

    setError("");
    import("maplibre-gl").then((maplibregl) => {
      if (cancelled || !containerRef.current) return;
      try {
        map = new maplibregl.Map({
          container: containerRef.current,
          style: {
            version: 8,
            sources: {
              openStreetMap: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                maxzoom: 19,
                attribution: "© OpenStreetMap contributors",
              },
            },
            layers: [{ id: "openStreetMap", type: "raster", source: "openStreetMap" }],
          },
          center: [longitude, latitude],
          zoom: 17,
          minZoom: 7,
          maxZoom: 19,
          attributionControl: {},
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        marker = new maplibregl.Marker({ color: "#ff6558" })
          .setLngLat([longitude, latitude])
          .setPopup(new maplibregl.Popup({ offset: 24 }).setText(title))
          .addTo(map);
        map.on("load", () => map?.resize());
      } catch {
        setError("지도를 불러오지 못했습니다.");
      }
    }).catch(() => setError("지도를 불러오지 못했습니다."));

    return () => {
      cancelled = true;
      marker?.remove();
      map?.remove();
    };
  }, [latitude, longitude, title]);

  return (
    <section className="admin-location-map" aria-label={`${title} 제보 위치 지도`}>
      <div ref={containerRef} />
      {error && <p role="status">{error}</p>}
    </section>
  );
}
