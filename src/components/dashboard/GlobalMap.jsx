import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { getDamageTypeLabel, getPriorityLabel, getWorkflowStatusLabel } from '../../lib/roadDamage';
import { MAP_STATUS_COLORS } from './mapLegend';

function markerIcon(status) {
  const color = MAP_STATUS_COLORS[status] || '#6b7280';
  const flag = status === 'verified' ? '<span class="gm-flag" aria-hidden="true">&#9873;</span>' : '';
  return L.divIcon({
    className: 'gm-marker-wrap',
    html: '<span class="gm-pin" style="--pin:' + color + '">' + flag + '<span class="gm-dot"></span></span>',
    iconSize: [30, 38],
    iconAnchor: [15, 36],
    popupAnchor: [0, -34],
  });
}

function popupHtml(damage) {
  const lat = Number(damage.latitude).toFixed(5);
  const lng = Number(damage.longitude).toFixed(5);
  return '<div class="gm-popup"><strong>' + getDamageTypeLabel(damage.damage_type) + '</strong>'
    + '<span>' + getWorkflowStatusLabel(damage.workflow_status) + ' - ' + getPriorityLabel(damage.priority) + '</span>'
    + '<span class="gm-coords">' + lat + ', ' + lng + '</span>'
    + '<a href="/damage/' + damage.id + '">Buka detail</a></div>';
}

export function ClusterLayer({ damages }) {
  const map = useMap();
  useEffect(() => {
    const group = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true });
    damages.forEach((damage) => {
      const lat = Number(damage.latitude);
      const lng = Number(damage.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const marker = L.marker([lat, lng], { icon: markerIcon(damage.workflow_status) });
      marker.bindPopup(popupHtml(damage));
      group.addLayer(marker);
    });
    map.addLayer(group);
    if (group.getLayers().length > 0) {
      try { map.fitBounds(group.getBounds().pad(0.15)); } catch { /* biarkan view default */ }
    }
    return () => { map.removeLayer(group); };
  }, [map, damages]);
  return null;
}
