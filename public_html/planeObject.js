"use strict";

function PlaneObject(icao) {
    this.icao      = icao;
    this.icaorange = findICAORange(icao);
    this.flight    = null;
    this.selected  = false;
    this.category  = null;

    // Position
    this.altitude       = null;
    this.alt_baro       = null;
    this.alt_geom       = null;
    this.speed          = null;
    this.gs             = null;
    this.track          = null;
    this.baro_rate      = null;
    this.geom_rate      = null;
    this.vert_rate      = null;

    this.prev_position = null;
    this.prev_position_time = null;
    this.position  = null;
    this.position_from_mlat = false;
    this.sitedist  = null;

    // Data packet numbers
    this.messages  = null;
    this.rssi      = null;

    // Track history
    this.elastic_feature = null;
    this.track_linesegs = [];
    this.history_size = 0;

    // Timestamps
    this.last_message_time = null;
    this.last_position_time = null;
    this.seen = null;
    this.seen_pos = null;

    // Display
    this.visible = true;
    this.marker = null;
    this.markerStyle = null;
    this.markerIcon = null;
    this.markerStaticStyle = null;
    this.markerStaticIcon = null;
    this.markerStyleKey = null;
    this.markerSvgKey = null;
    this.filter = {};

    // Drone-specific fields
    this.droneType = null;    // 'drone' or 'pilot'
    this.mac = null;
    this.manufacturer = null;
    this.basic_id = null;
    this.pilot_lat = null;
    this.pilot_lon = null;
    this.altitude_m = null;
    this.drone_hex = null;    // For pilot entries: hex of parent drone

    // Unused but kept for compatibility with SkyAware code paths
    this.registration = null;
    this.icaotype = null;
    this.typeDescription = null;
    this.wtc = null;
    this.squawk = null;
    this.nav_altitude = null;
    this.nav_heading = null;
    this.nav_modes = null;
    this.nav_qnh = null;
    this.ias = null;
    this.tas = null;
    this.mach = null;
    this.roll = null;
    this.track_rate = null;
    this.mag_heading = null;
    this.true_heading = null;
    this.rc = null;
    this.nac_p = null;
    this.nac_v = null;
    this.nic_baro = null;
    this.sil_type = null;
    this.sil = null;
    this.version = null;
    this.uat_version = null;
}

PlaneObject.prototype.isFiltered = function() {
    if (this.filter.minAltitude !== undefined && this.filter.maxAltitude !== undefined) {
        if (this.altitude === null) return true;
        var dominated_alt = this.altitude;
        if (typeof dominated_alt === 'string' && dominated_alt === 'ground') {
            dominated_alt = 0;
        }
        if (dominated_alt < this.filter.minAltitude || dominated_alt > this.filter.maxAltitude) {
            return true;
        }
    }
    return false;
};

PlaneObject.prototype.updateData = function(now, data) {
    this.messages = data.messages;
    this.rssi = data.rssi;
    this.last_message_time = now;
    this.seen = data.seen;
    this.seen_pos = data.seen_pos;

    // Drone-specific fields
    if ('type' in data) this.droneType = data.type;
    if ('mac' in data) this.mac = data.mac;
    if ('manufacturer' in data) this.manufacturer = data.manufacturer;
    if ('altitude_m' in data) this.altitude_m = data.altitude_m;
    if ('pilot_lat' in data) this.pilot_lat = data.pilot_lat;
    if ('pilot_long' in data) this.pilot_lon = data.pilot_long;
    if ('drone_hex' in data) this.drone_hex = data.drone_hex;

    if ('flight' in data) this.flight = data.flight;
    if ('squawk' in data) this.squawk = data.squawk;
    if ('category' in data) this.category = data.category;

    if ('alt_baro' in data) {
        this.alt_baro = data.alt_baro;
    }
    if ('alt_geom' in data) {
        this.alt_geom = data.alt_geom;
    }

    this.altitude = this.alt_baro !== null ? this.alt_baro : this.alt_geom;

    if ('gs' in data) this.gs = data.gs;
    if ('track' in data) this.track = data.track;
    if ('baro_rate' in data) this.baro_rate = data.baro_rate;
    if ('geom_rate' in data) this.geom_rate = data.geom_rate;

    this.speed = this.gs;
    this.vert_rate = this.baro_rate !== null ? this.baro_rate : this.geom_rate;

    if ('lat' in data && 'lon' in data) {
        this.position = [data.lon, data.lat];
        this.last_position_time = now;

        if (SitePosition !== null) {
            var dlat = this.position[1] - SitePosition[1];
            var dlon = this.position[0] - SitePosition[0];
            this.sitedist = Math.sqrt(dlat*dlat + dlon*dlon) * 111195;
        }
    }
};

PlaneObject.prototype.updateTick = function(now, last_timestamp) {
    // nothing needed for simple drone display
};

PlaneObject.prototype.updateTrack = function(now, last_timestamp) {
    if (!this.position) return;
    if (this.prev_position && this.position[0] == this.prev_position[0] && this.position[1] == this.prev_position[1]) {
        return;
    }

    var dominated_alt = this.altitude;
    if (typeof dominated_alt === 'string') dominated_alt = 0;
    if (dominated_alt === null) dominated_alt = 0;

    if (this.track_linesegs.length === 0) {
        this.track_linesegs.push({
            fixed: new ol.geom.LineString([
                ol.proj.fromLonLat(this.position)
            ]),
            feature: null,
            altitude: dominated_alt,
            estimated: false,
        });
    } else {
        var last_seg = this.track_linesegs[this.track_linesegs.length - 1];
        last_seg.fixed.appendCoordinate(ol.proj.fromLonLat(this.position));
        last_seg.altitude = dominated_alt;
    }

    this.prev_position = this.position;
    this.prev_position_time = now;
    this.history_size++;

    return true;
};

PlaneObject.prototype.getMarkerColor = function() {
    var dominated_alt = this.altitude;
    if (typeof dominated_alt === 'string') dominated_alt = 0;

    var colorArr = ColorByAlt;

    if (this.droneType === 'pilot') {
        return 'hsl(180, 70%, 45%)';  // Teal for pilots
    }

    if (dominated_alt === null) {
        return 'hsl(' + colorArr.unknown.h + ',' + colorArr.unknown.s + '%,' + colorArr.unknown.l + '%)';
    }

    var hue, sat, lit;

    if (dominated_alt === 'ground' || dominated_alt <= 0) {
        hue = colorArr.ground.h;
        sat = colorArr.ground.s;
        lit = colorArr.ground.l;
    } else {
        var h_map = colorArr.air.h;
        if (dominated_alt <= h_map[0].alt) {
            hue = h_map[0].val;
        } else if (dominated_alt >= h_map[h_map.length-1].alt) {
            hue = h_map[h_map.length-1].val;
        } else {
            for (var i = 0; i < h_map.length-1; i++) {
                if (dominated_alt >= h_map[i].alt && dominated_alt <= h_map[i+1].alt) {
                    var frac = (dominated_alt - h_map[i].alt) / (h_map[i+1].alt - h_map[i].alt);
                    hue = h_map[i].val + frac * (h_map[i+1].val - h_map[i].val);
                    break;
                }
            }
        }
        sat = colorArr.air.s;
        lit = colorArr.air.l;
    }

    if (this.selected) {
        sat += colorArr.selected.s;
        lit += colorArr.selected.l;
    }

    if (this.seen_pos > 30) {
        sat += colorArr.stale.s;
        lit += colorArr.stale.l;
    }

    if (sat < 0) sat = 0;
    if (sat > 100) sat = 100;
    if (lit < 0) lit = 0;
    if (lit > 100) lit = 100;

    return 'hsl(' + Math.round(hue) + ',' + Math.round(sat) + '%,' + Math.round(lit) + '%)';
};

PlaneObject.prototype.updateMarker = function(moved) {
    if (!this.position) return;

    if (this.marker) {
        if (moved) {
            this.marker.setGeometry(new ol.geom.Point(ol.proj.fromLonLat(this.position)));
        }
        this.updateIcon();
        return;
    }

    this.marker = new ol.Feature(new ol.geom.Point(ol.proj.fromLonLat(this.position)));
    this.marker.hex = this.icao;
    this.updateIcon();
    PlaneIconFeatures.push(this.marker);
};

PlaneObject.prototype.updateIcon = function() {
    var col = this.getMarkerColor();
    var outline = OutlineADSBColor;

    var baseMarker = getBaseMarker(this.category, this.icaotype, this.typeDescription, this.wtc, this.droneType);
    if (!baseMarker) baseMarker = shapes['unknown'];

    var svgKey = col + '!' + outline + '!' + (this.droneType || 'unknown');
    if (this.markerSvgKey === svgKey) return;

    var iconSrc = svgPathToURI(baseMarker.svg, col, outline, null);

    var iconStyle = new ol.style.Style({
        image: new ol.style.Icon({
            anchor: [0.5, 0.5],
            anchorXUnits: 'fraction',
            anchorYUnits: 'fraction',
            scale: 1.0,
            imgSize: baseMarker.size,
            src: iconSrc,
        })
    });

    this.markerSvgKey = svgKey;

    if (this.marker) {
        this.marker.setStyle(iconStyle);
    }
};

PlaneObject.prototype.getPilotDistance = function() {
    if (!this.position || this.pilot_lat === null || this.pilot_lon === null) return null;
    if (this.pilot_lat === 0 && this.pilot_lon === 0) return null;

    var lat1 = this.position[1] * Math.PI / 180;
    var lat2 = this.pilot_lat * Math.PI / 180;
    var dlat = (this.pilot_lat - this.position[1]) * Math.PI / 180;
    var dlon = (this.pilot_lon - this.position[0]) * Math.PI / 180;

    var a = Math.sin(dlat/2) * Math.sin(dlat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dlon/2) * Math.sin(dlon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return 6371000 * c;  // distance in meters
};

PlaneObject.prototype.clearMarker = function() {
    if (this.marker) {
        PlaneIconFeatures.remove(this.marker);
        this.marker = null;
        this.markerSvgKey = null;
    }
};

PlaneObject.prototype.clearLines = function() {
    for (var i = 0; i < this.track_linesegs.length; i++) {
        var seg = this.track_linesegs[i];
        if (seg.feature) {
            PlaneTrailFeatures.remove(seg.feature);
            seg.feature = null;
        }
    }
};

PlaneObject.prototype.updateLines = function() {
    if (!this.selected) return;
    for (var i = 0; i < this.track_linesegs.length; i++) {
        var seg = this.track_linesegs[i];
        if (!seg.feature) {
            seg.feature = new ol.Feature(seg.fixed);
            var color = this.getMarkerColor();
            seg.feature.setStyle(new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: color,
                    width: 2
                })
            }));
            PlaneTrailFeatures.push(seg.feature);
        }
    }

    if (this.position && this.elastic_feature === null) {
        this.elastic_feature = new ol.Feature(new ol.geom.LineString([
            ol.proj.fromLonLat(this.position),
            ol.proj.fromLonLat(this.position)
        ]));
        this.elastic_feature.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: '#808080',
                width: 1,
                lineDash: [3, 3]
            })
        }));
        PlaneTrailFeatures.push(this.elastic_feature);
    }
};

PlaneObject.prototype.destroy = function() {
    this.clearMarker();
    this.clearLines();
    if (this.elastic_feature) {
        PlaneTrailFeatures.remove(this.elastic_feature);
        this.elastic_feature = null;
    }
    if (this.tr) {
        if (this.tr.parentNode) this.tr.parentNode.removeChild(this.tr);
        this.tr = null;
    }
};
