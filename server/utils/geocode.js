// Address matching via the Google Geocoding API. Verifies a resident's
// typed address actually resolves to a real place, and flags whether that
// place falls within the barangay of the Purok they selected. This is a
// review aid for the admin during manual verification, not a hard gate —
// geocoding a free-text Philippine address is imprecise enough that a
// mismatch should prompt closer scrutiny, not an automatic rejection.

function normalize(str) {
  return String(str).toLowerCase().replace(/^barangay\s+/i, '').trim();
}

async function geocodeAddress(addressLine, barangay) {
  const key = process.env.GOOGLE_MAP_API;
  if (!key) {
    console.log('[Geocode] GOOGLE_MAP_API not set — skipping address verification');
    return { status: 'Unchecked', lat: null, lng: null };
  }

  const query = barangay ? `${addressLine}, ${barangay}, Philippines` : `${addressLine}, Philippines`;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${key}`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    if (data.status !== 'OK' || !data.results?.length) {
      return { status: 'Unmatched', lat: null, lng: null };
    }

    const result = data.results[0];
    const { lat, lng } = result.geometry.location;

    const matched = !barangay || (result.address_components || []).some(c => {
      const name = normalize(c.long_name);
      const target = normalize(barangay);
      return name === target || name.includes(target) || target.includes(name);
    });

    return { status: matched ? 'Matched' : 'Unmatched', lat, lng };
  } catch (err) {
    console.error('[Geocode] Lookup failed:', err.message);
    return { status: 'Unchecked', lat: null, lng: null };
  }
}

module.exports = { geocodeAddress };
