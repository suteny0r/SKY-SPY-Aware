// --------------------------------------------------------
// SKY-SPY-Aware Configuration
// --------------------------------------------------------

// -- Title Settings --------------------------------------
PlaneCountInTitle = true;
MessageRateInTitle = false;

// -- Output Settings -------------------------------------
// Use metric for drones (meters, km, km/h)
DisplayUnits = "metric";

// -- Map settings ----------------------------------------
// Default center: Miami area (from sample drone detection data)
DefaultCenterLat = 25.78;
DefaultCenterLon = -80.155;
// Zoom level 15 = neighborhood level, good for drone-scale distances
DefaultZoomLvl = 15;

// No receiver site marker for mobile scanner
SiteShow = false;
SiteLat = 0;
SiteLon = 0;
SiteName = "";

// -- Marker settings (drone altitude coloring) -----------
// Drones fly much lower than aircraft: 0-400m range
// All color values are Hue (0-359) / Saturation (0-100) / Lightness (0-100)
ColorByAlt = {
    // Unknown altitude
    unknown: { h: 0, s: 0, l: 40 },

    // On the ground
    ground: { h: 120, s: 80, l: 35 },

    air: {
        // Altitude-to-hue for drones (in feet, converted from meters)
        // 0m (0ft) = green, 50m (164ft) = yellow, 150m (492ft) = orange, 400m (1312ft) = red
        h: [
            { alt: 0,    val: 120 },   // green (ground level)
            { alt: 164,  val: 60 },    // yellow (~50m)
            { alt: 492,  val: 30 },    // orange (~150m)
            { alt: 1312, val: 0 },     // red (~400m)
        ],
        s: 85,
        l: 50,
    },

    selected: { h: 0, s: -10, l: +20 },
    stale:    { h: 0, s: -10, l: +30 },
    mlat:     { h: 0, s: 0,   l: 0 },
};

// Outline color for drone icons
OutlineADSBColor = '#000000';
OutlineMlatColor = '#000000';

// No site circles for mobile scanner
SiteCircles = false;
DefaultSiteCirclesCount = 0;
DefaultSiteCirclesBaseDistance = 0;
DefaultSiteCirclesInterval = 0;

// Page title
PageName = "SKY-SPY-Aware";

// No country flags for drones
ShowFlags = false;
FlagPath = "";

// Disable FAA layers
FAALayers = false;

BingMapsAPIKey = null;

ExtendedData = false;

// Drone altitude filters (in feet, matching the ColorByAlt scale)
DefaultMaxAltitudeFilter = 2000;
DefaultMinAltitudeFilter = -200;
DefaultMaxSpeedFilter = 200;
DefaultMinSpeedFilter = 0;
