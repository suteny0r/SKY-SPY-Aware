// -*- mode: javascript; indent-tabs-mode: nil; c-basic-offset: 8 -*-
"use strict";

// SKY-SPY-Aware: Formatting helpers for drone data

var NBSP = '\u00a0';
var DEGREES = '\u00b0';

var UnitLabels = {
    'altitude': { metric: "m", imperial: "ft", nautical: "ft" },
    'speed': { metric: "km/h", imperial: "mph", nautical: "kt" },
    'distance': { metric: "km", imperial: "mi", nautical: "NM" },
    'verticalRate': { metric: "m/s", imperial: "ft/min", nautical: "ft/min" },
    'distanceShort': { metric: "m", imperial: "ft", nautical: "m" }
};

function get_unit_label(quantity, systemOfMeasurement) {
    var labels = UnitLabels[quantity];
    if (labels !== undefined && labels[systemOfMeasurement] !== undefined) {
        return labels[systemOfMeasurement];
    }
    return "";
}

// alt in feet
function format_altitude_brief(alt, vr, displayUnits) {
    if (alt === null) return "";
    if (alt === "ground") return "ground";
    return Math.round(convert_altitude(alt, displayUnits)).toLocaleString() + NBSP;
}

function format_altitude_long(alt, vr, displayUnits) {
    if (alt === null) return "n/a";
    if (alt === "ground") return "on ground";
    return Math.round(convert_altitude(alt, displayUnits)).toLocaleString() + NBSP + get_unit_label("altitude", displayUnits);
}

function format_onground(alt) {
    if (alt === null) return "n/a";
    if (alt === "ground") return "on ground";
    return "airborne";
}

// alt in feet to display units
function convert_altitude(alt, displayUnits) {
    if (displayUnits === "metric") {
        return alt / 3.2808;  // feet to meters
    }
    return alt;
}

function format_speed_brief(speed, displayUnits) {
    if (speed === null) return "";
    return Math.round(convert_speed(speed, displayUnits));
}

function format_speed_long(speed, displayUnits) {
    if (speed === null) return "n/a";
    return Math.round(convert_speed(speed, displayUnits)) + NBSP + get_unit_label("speed", displayUnits);
}

function convert_speed(speed, displayUnits) {
    if (displayUnits === "metric") return speed * 1.852;
    if (displayUnits === "imperial") return speed * 1.151;
    return speed;
}

function format_distance_brief(dist, displayUnits) {
    if (dist === null) return "";
    return convert_distance(dist, displayUnits).toFixed(1);
}

function format_distance_long(dist, displayUnits, fixed) {
    if (dist === null) return "n/a";
    if (typeof fixed === 'undefined') fixed = 1;
    return convert_distance(dist, displayUnits).toFixed(fixed) + NBSP + get_unit_label("distance", displayUnits);
}

function format_distance_short(dist, displayUnits) {
    if (dist === null) return "n/a";
    return Math.round(convert_distance_short(dist, displayUnits)) + NBSP + get_unit_label("distanceShort", displayUnits);
}

function convert_distance(dist, displayUnits) {
    if (displayUnits === "metric") return (dist / 1000);
    if (displayUnits === "imperial") return (dist / 1609);
    return (dist / 1852);
}

function convert_distance_short(dist, displayUnits) {
    if (displayUnits === "imperial") return (dist / 0.3048);
    return dist;
}

function format_vert_rate_brief(rate, displayUnits) {
    if (rate === null || rate === undefined) return "";
    return convert_vert_rate(rate, displayUnits).toFixed(displayUnits === "metric" ? 1 : 0);
}

function format_vert_rate_long(rate, displayUnits) {
    if (rate === null || rate === undefined) return "n/a";
    return convert_vert_rate(rate, displayUnits).toFixed(displayUnits === "metric" ? 1 : 0) + NBSP + get_unit_label("verticalRate", displayUnits);
}

function convert_vert_rate(rate, displayUnits) {
    if (displayUnits === "metric") return (rate / 196.85);
    return rate;
}

function format_latlng(p) {
    return p[1].toFixed(6) + DEGREES + "," + NBSP + p[0].toFixed(6) + DEGREES;
}

function format_track_brief(track) {
    if (track === null) return "";
    return Math.round(track) + DEGREES;
}

function format_track_long(track) {
    if (track === null) return "n/a";
    var dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    var idx = Math.floor((360 + track % 360 + 22.5) / 45) % 8;
    return Math.round(track) + DEGREES + NBSP + "(" + dirs[idx] + ")";
}

function format_data_source(source) {
    switch (source) {
        case 'drone': return "Open Drone ID";
        case 'pilot': return "Pilot Position";
        default: return "";
    }
}

function format_nac_p(value) { return "n/a"; }
function format_nac_v(value) { return "n/a"; }
