// -*- mode: javascript; indent-tabs-mode: nil; c-basic-offset: 8 -*-
"use strict";

// SKY-SPY-Aware: Simplified base layers (no geojson overlays needed)

function createBaseLayers() {
    var layers = [];
    var world = [];

    world.push(new ol.layer.Tile({
        source: new ol.source.OSM(),
        name: 'osm',
        title: 'OpenStreetMap',
        type: 'base',
    }));

    world.push(new ol.layer.Tile({
        source: new ol.source.XYZ({
            "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            "attributions": "Tiles \u00a9 Esri",
        }),
        name: 'esri_satellite',
        title: 'ESRI Satellite',
        type: 'base',
    }));

    world.push(new ol.layer.Tile({
        source: new ol.source.XYZ({
            "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
            "attributions": "Tiles \u00a9 Esri",
        }),
        name: 'esri_street',
        title: 'ESRI Street',
        type: 'base',
    }));

    world.push(new ol.layer.Tile({
        source: new ol.source.OSM({
            "url": "https://{a-z}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            "attributions": 'Courtesy of <a href="https://carto.com">CARTO.com</a>',
        }),
        name: 'carto_dark_all',
        title: 'CARTO Dark',
        type: 'base',
    }));

    world.push(new ol.layer.Tile({
        source: new ol.source.OSM({
            "url": "https://{a-z}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
            "attributions": 'Courtesy of <a href="https://carto.com">CARTO.com</a>',
        }),
        name: 'carto_light_all',
        title: 'CARTO Light',
        type: 'base',
    }));

    if (BingMapsAPIKey) {
        world.push(new ol.layer.Tile({
            source: new ol.source.BingMaps({
                key: BingMapsAPIKey,
                imagerySet: 'Aerial'
            }),
            name: 'bing_aerial',
            title: 'Bing Aerial',
            type: 'base',
        }));
    }

    if (world.length > 0) {
        layers.push(new ol.layer.Group({
            name: 'world',
            title: 'Base Maps',
            layers: world
        }));
    }

    return layers;
}
