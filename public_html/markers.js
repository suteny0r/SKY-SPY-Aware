// -*- mode: javascript; indent-tabs-mode: nil; c-basic-offset: 8 -*-
"use strict";

// SKY-SPY-Aware: Drone and pilot marker icons

var shapes = {
    'drone': {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36px" height="36px">' +
             // Four arms extending from center
             '<line x1="8" y1="8" x2="18" y2="18" stroke="aircraft_color_stroke" stroke-linecap="round" stroke-width="2.5"/>' +
             '<line x1="28" y1="8" x2="18" y2="18" stroke="aircraft_color_stroke" stroke-linecap="round" stroke-width="2.5"/>' +
             '<line x1="8" y1="28" x2="18" y2="18" stroke="aircraft_color_stroke" stroke-linecap="round" stroke-width="2.5"/>' +
             '<line x1="28" y1="28" x2="18" y2="18" stroke="aircraft_color_stroke" stroke-linecap="round" stroke-width="2.5"/>' +
             // Four rotors (circles at arm ends)
             '<circle cx="8" cy="8" r="5" fill="aircraft_color_fill" stroke="aircraft_color_stroke" stroke-width="1.2" fill-opacity="0.7"/>' +
             '<circle cx="28" cy="8" r="5" fill="aircraft_color_fill" stroke="aircraft_color_stroke" stroke-width="1.2" fill-opacity="0.7"/>' +
             '<circle cx="8" cy="28" r="5" fill="aircraft_color_fill" stroke="aircraft_color_stroke" stroke-width="1.2" fill-opacity="0.7"/>' +
             '<circle cx="28" cy="28" r="5" fill="aircraft_color_fill" stroke="aircraft_color_stroke" stroke-width="1.2" fill-opacity="0.7"/>' +
             // Center body
             '<circle cx="18" cy="18" r="4" fill="aircraft_color_fill" stroke="aircraft_color_stroke" stroke-width="1.5"/>' +
             // Direction indicator (nose)
             '<circle cx="18" cy="12" r="2" fill="aircraft_color_stroke"/>' +
             '</svg>',
        size: [36, 36],
        noRotate: true,
    },
    'pilot': {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24px" height="36px">' +
             // Location pin shape
             '<path d="M12,2 C6.5,2 2,6.5 2,12 C2,20 12,34 12,34 C12,34 22,20 22,12 C22,6.5 17.5,2 12,2 Z" fill="#00CED1" stroke="#005555" stroke-width="1.5"/>' +
             // Person icon inside pin
             '<circle cx="12" cy="10" r="3.5" fill="#005555"/>' +
             '<path d="M7,18 Q7,14 12,14 Q17,14 17,18" fill="#005555"/>' +
             '</svg>',
        size: [24, 36],
        noRotate: true,
    },
    'unknown': {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20px" height="20px">' +
             '<circle cx="10" cy="10" r="8" fill="aircraft_color_fill" stroke="aircraft_color_stroke" stroke-width="1.5"/>' +
             '<text x="10" y="14" text-anchor="middle" fill="aircraft_color_stroke" font-size="12" font-weight="bold">?</text>' +
             '</svg>',
        size: [20, 20],
        noRotate: true,
    }
};

// No aircraft type designator icons needed for drones
var TypeDesignatorIcons = {};
var TypeDescriptionIcons = {};
var CategoryIcons = {};

function getBaseMarker(category, icaotype, typeDescription, wtc, droneType) {
    if (droneType === 'pilot') {
        return shapes['pilot'];
    }
    if (droneType === 'drone') {
        return shapes['drone'];
    }
    return shapes['unknown'];
}

function svgPathToURI(svg, fillColor, strokeColor, rotation) {
    svg = svg.replace(/aircraft_color_fill/g, fillColor);
    svg = svg.replace(/aircraft_color_stroke/g, strokeColor);

    if (rotation !== undefined && rotation !== null && rotation !== 0) {
        // Add rotation transform to root SVG element
        var viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
        if (viewBoxMatch) {
            var parts = viewBoxMatch[1].split(/\s+/);
            var cx = (parseFloat(parts[0]) + parseFloat(parts[2])) / 2;
            var cy = (parseFloat(parts[1]) + parseFloat(parts[3])) / 2;
            svg = svg.replace(/<svg([^>]*)>/, '<svg$1><g transform="rotate(' + rotation + ' ' + cx + ' ' + cy + ')">');
            svg = svg.replace(/<\/svg>/, '</g></svg>');
        }
    }

    return "data:image/svg+xml;base64," + btoa(svg);
}
