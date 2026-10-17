const cache = {};

export async function reverseGeocode(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return 'Lokasi tidak tersedia';
  }

  const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        'User-Agent': 'Crashless-Dashboard-Web-App'
      }
    });

    if (!response.ok) throw new Error('Permintaan geocoding gagal diproses.');
    
    const data = await response.json();
    let address = '';

    if (data.address) {
      const road = data.address.road || data.address.suburb || '';
      const city = data.address.city || data.address.municipality || data.address.county || '';
      const state = data.address.state || '';
      
      const parts = [];
      if (road) parts.push(road);
      if (city) parts.push(city);
      if (state && state !== city) parts.push(state);

      address = parts.join(', ');
    }

    if (!address) {
      address = data.display_name ||
        `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }

    cache[cacheKey] = address;
    return address;
  } catch (error) {
    console.error('Error in reverse geocoding:', error);
    return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }
}
