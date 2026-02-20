// -*- mode: javascript; indent-tabs-mode: nil; c-basic-offset: 8 -*-
"use strict";

// SKY-SPY-Aware: Main application script for drone detection dashboard

// Global variables
var OLMap = null;
var StaticFeatures = new ol.Collection();
var PlaneIconFeatures = new ol.Collection();
var PlaneTrailFeatures = new ol.Collection();
var PilotLineFeatures = new ol.Collection();
var Planes = {};
var PlanesOrdered = [];
var PlaneFilter = {};
var SelectedPlane = null;
var SelectedAllPlanes = false;
var HighlightedPlane = null;
var FollowSelected = false;

var CenterLat, CenterLon, ZoomLvl;
var RefreshInterval = 1000;
var PlaneRowTemplate = null;
var TrackedAircraft = 0;
var TrackedAircraftPositions = 0;
var TrackedHistorySize = 0;
var SitePosition = null;
var LastReceiverTimestamp = 0;
var StaleReceiverCount = 0;
var FetchPending = null;
var MessageRate = 0;
var NBSP = '\u00a0';
var AircraftLabels = false;

// Process incoming aircraft/drone data
function processReceiverUpdate(data) {
    var now = data.now;
    var acs = data.aircraft;

    for (var j = 0; j < acs.length; j++) {
        var ac = acs[j];
        var hex = ac.hex;
        var plane = null;

        if (Planes[hex]) {
            plane = Planes[hex];
        } else {
            plane = new PlaneObject(hex);
            plane.filter = PlaneFilter;
            plane.tr = PlaneRowTemplate.cloneNode(true);
            plane.tr.cells[0].textContent = hex;

            plane.tr.addEventListener('click', function(h, evt) {
                if (!$("#map_container").is(":visible")) {
                    showMap();
                }
                selectPlaneByHex(h, false);
                adjustSelectedInfoBlockPosition();
                evt.preventDefault();
            }.bind(undefined, hex));

            plane.tr.addEventListener('dblclick', function(h, evt) {
                if (!$("#map_container").is(":visible")) {
                    showMap();
                }
                selectPlaneByHex(h, true);
                adjustSelectedInfoBlockPosition();
                evt.preventDefault();
            }.bind(undefined, hex));

            Planes[hex] = plane;
            PlanesOrdered.push(plane);
        }

        plane.updateData(now, ac);
    }
}

function fetchData() {
    if (FetchPending !== null && FetchPending.state() == 'pending') {
        return;
    }

    FetchPending = $.ajax({
        url: 'data/aircraft.json',
        timeout: 5000,
        cache: false,
        dataType: 'json'
    });

    FetchPending.done(function(data) {
        process_aircraft_json(data);
    });

    FetchPending.fail(function(jqxhr, status, error) {
        $("#update_error_detail").text("AJAX call failed (" + status + (error ? (": " + error) : "") + "). Is the server running?");
        $("#update_error").css('display', 'block');
    });
}

function process_aircraft_json(data) {
    var now = data.now;
    processReceiverUpdate(data);

    // Update all planes
    for (var i = 0; i < PlanesOrdered.length; i++) {
        var plane = PlanesOrdered[i];
        plane.updateTick(now, LastReceiverTimestamp);
    }

    refreshTableInfo();
    refreshSelected();
    refreshHighlighted();
    updatePilotLines();

    // Check for stale data
    if (LastReceiverTimestamp === now) {
        StaleReceiverCount++;
        if (StaleReceiverCount > 5) {
            $("#update_error_detail").text("Data hasn't been updated in a while. Is the server still running?");
            $("#update_error").css('display', 'block');
        }
    } else {
        StaleReceiverCount = 0;
        LastReceiverTimestamp = now;
        $("#update_error").css('display', 'none');
    }

    // Remove stale planes (not seen for 120s)
    var toRemove = [];
    for (var i = 0; i < PlanesOrdered.length; i++) {
        var p = PlanesOrdered[i];
        if (p.seen !== null && p.seen > 120) {
            toRemove.push(i);
        }
    }
    for (var i = toRemove.length - 1; i >= 0; i--) {
        var p = PlanesOrdered[toRemove[i]];
        p.destroy();
        delete Planes[p.icao];
        PlanesOrdered.splice(toRemove[i], 1);
    }
}

// Draw lines connecting drones to their pilots
function updatePilotLines() {
    // Clear old lines
    PilotLineFeatures.clear();

    for (var i = 0; i < PlanesOrdered.length; i++) {
        var drone = PlanesOrdered[i];
        if (drone.droneType !== 'drone') continue;
        if (!drone.position) continue;
        if (drone.pilot_lat === null || drone.pilot_lon === null) continue;
        if (drone.pilot_lat === 0 && drone.pilot_lon === 0) continue;

        var droneCoord = ol.proj.fromLonLat(drone.position);
        var pilotCoord = ol.proj.fromLonLat([drone.pilot_lon, drone.pilot_lat]);

        var lineFeature = new ol.Feature(new ol.geom.LineString([droneCoord, pilotCoord]));
        lineFeature.setStyle(new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: 'rgba(0, 206, 209, 0.6)',
                width: 2,
                lineDash: [6, 4]
            })
        }));
        PilotLineFeatures.push(lineFeature);
    }
}

function initialize() {
    document.title = PageName;
    PlaneRowTemplate = document.getElementById("plane_row_template");

    refreshClock();

    // Set up sidebar splitter
    $("#sidebar_container").resizable({
        handles: { w: '#splitter' },
        minWidth: 300
    });

    // Set up infoblock splitter
    $('#selected_infoblock').resizable({
        handles: { s: '#splitter-infoblock' },
        containment: "#sidebar_container",
        minHeight: 50
    });

    $('#close-button').on('click', function() {
        if (SelectedPlane !== null) {
            var selectedPlane = Planes[SelectedPlane];
            SelectedPlane = null;
            if (selectedPlane) {
                selectedPlane.selected = null;
                selectedPlane.clearLines();
                selectedPlane.updateMarker();
            }
            refreshSelected();
            refreshHighlighted();
            $('#selected_infoblock').hide();
        }
    });

    $('#selected_infoblock').on('resize', function() {
        $('#sidebar_canvas').css('margin-bottom', $('#selected_infoblock').height() + 'px');
    });

    $(window).on('resize', function() {
        var topCalc = ($(window).height() - $('#selected_infoblock').height() - 60);
        if (topCalc < 0) {
            topCalc = 0;
            $('#selected_infoblock').css('height', ($(window).height() - 60) + 'px');
        }
        $('#selected_infoblock').css('top', topCalc + 'px');
    });

    $("#toggle_sidebar_button").click(toggleSidebarVisibility);
    $("#expand_sidebar_button").click(expandSidebar);
    $("#show_map_button").click(showMap);

    $("#show_map_button").hide();

    initializeUnitsSelector();

    $('#settingsCog').on('click', function() {
        $('#settings_infoblock').toggle();
    });

    $('#settings_close').on('click', function() {
        $('#settings_infoblock').hide();
    });

    $('#restart_sensor').on('click', function() {
        var btn = $(this);
        if (btn.hasClass('restarting')) return;
        if (!confirm('Restart the ESP32 sensor?')) return;
        btn.addClass('restarting').text('Restarting...');
        // Clear activity pane so boot messages are visible from a clean slate
        var actContainer = document.getElementById('activity_lines');
        if (actContainer) actContainer.innerHTML = '';
        activitySeq = 0;
        $.ajax({
            url: 'api/restart-sensor',
            type: 'POST',
            timeout: 5000,
            dataType: 'json'
        }).done(function(data) {
            if (data.status === 'ok') {
                btn.text('Restarted');
                setTimeout(function() {
                    btn.removeClass('restarting').text('Restart Sensor');
                }, 5000);
            } else {
                alert(data.message || 'Restart failed');
                btn.removeClass('restarting').text('Restart Sensor');
            }
        }).fail(function() {
            alert('Could not reach server');
            btn.removeClass('restarting').text('Restart Sensor');
        });
    });

    $('#selectall_checkbox').on('click', function() {
        toggleAllPlanes(true);
    });

    $('#aircraft_label_checkbox').on('click', function() {
        toggleAircraftLabels(true);
    });

    var mapResizeTimeout;
    $("#sidebar_container").on("resize", function() {
        clearTimeout(mapResizeTimeout);
        mapResizeTimeout = setTimeout(updateMapSize, 10);
    });

    toggleAllPlanes(false);
    toggleAircraftLabels(false);

    // Fetch receiver.json then start
    $.ajax({
        url: 'data/receiver.json',
        timeout: 5000,
        cache: false,
        dataType: 'json'
    }).done(function(data) {
        if (data.lat !== undefined && data.lat !== 0) {
            SitePosition = [data.lon, data.lat];
            CenterLat = data.lat;
            CenterLon = data.lon;
        }
        initialize_map();
        start_updating();
    }).fail(function() {
        initialize_map();
        start_updating();
    });
}

function initialize_map() {
    CenterLat = CenterLat || DefaultCenterLat;
    CenterLon = CenterLon || DefaultCenterLon;
    ZoomLvl = DefaultZoomLvl;

    var layers = createBaseLayers();
    var defaultLayer = layers[0];

    var iconLayer = new ol.layer.Vector({
        source: new ol.source.Vector({ features: PlaneIconFeatures }),
        zIndex: 200
    });

    var trailLayer = new ol.layer.Vector({
        source: new ol.source.Vector({ features: PlaneTrailFeatures }),
        zIndex: 150
    });

    var pilotLineLayer = new ol.layer.Vector({
        source: new ol.source.Vector({ features: PilotLineFeatures }),
        zIndex: 100
    });

    OLMap = new ol.Map({
        target: 'map_canvas',
        layers: [defaultLayer, pilotLineLayer, trailLayer, iconLayer],
        view: new ol.View({
            center: ol.proj.fromLonLat([CenterLon, CenterLat]),
            zoom: ZoomLvl
        }),
        controls: ol.control.defaults({
            attributionOptions: { collapsible: true }
        }).extend([
            new ol.control.LayerSwitcher()
        ]),
    });

    // Click on map to select drone
    OLMap.on('click', function(evt) {
        var found = false;
        OLMap.forEachFeatureAtPixel(evt.pixel, function(feature) {
            if (feature.hex) {
                selectPlaneByHex(feature.hex, false);
                adjustSelectedInfoBlockPosition();
                found = true;
            }
        });
        if (!found) {
            deselectAllPlanes();
        }
    });

    // Hover highlight
    OLMap.on('pointermove', function(evt) {
        var foundHex = null;
        OLMap.forEachFeatureAtPixel(evt.pixel, function(feature) {
            if (feature.hex) foundHex = feature.hex;
        });
        highlightPlaneByHex(foundHex);
    });
}

var activitySeq = 0;
var ActivityMaxLines = 80;
var ActivityFetchPending = false;

function start_updating() {
    fetchData();
    fetchActivity();
    window.setInterval(fetchData, RefreshInterval);
    window.setInterval(fetchActivity, RefreshInterval);
    window.setInterval(refreshClock, 500);
}

function fetchActivity() {
    if (ActivityFetchPending) return;
    ActivityFetchPending = true;

    var url = 'data/activity.json?since=' + activitySeq + '&_=' + Date.now();

    $.ajax({
        url: url,
        timeout: 3000,
        cache: false,
        dataType: 'json'
    }).done(function(data) {
        var container = document.getElementById('activity_lines');
        if (!container) { ActivityFetchPending = false; return; }
        if (!data || !data.lines || data.lines.length === 0) { ActivityFetchPending = false; return; }

        var wasScrolledToBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 20;

        for (var i = 0; i < data.lines.length; i++) {
            var entry = data.lines[i];
            if (entry.seq) activitySeq = entry.seq;

            var div = document.createElement('div');
            div.className = 'activity_line';
            div.textContent = entry.text || entry;
            container.appendChild(div);
        }

        // Trim old lines from top if buffer too large
        while (container.childNodes.length > ActivityMaxLines) {
            container.removeChild(container.firstChild);
        }

        // Auto-scroll only if user was already at the bottom
        if (wasScrolledToBottom) {
            container.scrollTop = container.scrollHeight;
        }
        ActivityFetchPending = false;
    }).fail(function() {
        ActivityFetchPending = false;
    });
}

function refreshClock() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');
    $('#clock_div').text(h + ':' + m + ':' + s);
}

function refreshTableInfo() {
    if (!PlaneRowTemplate) return;

    TrackedAircraft = 0;
    TrackedAircraftPositions = 0;
    TrackedHistorySize = 0;

    var validPlanes = [];

    for (var i = 0; i < PlanesOrdered.length; i++) {
        var plane = PlanesOrdered[i];

        // Skip pilot entries in table (they're shown as part of drone entries)
        if (plane.droneType === 'pilot') {
            plane.visible = true;
            plane.updateTrack(plane.last_message_time, LastReceiverTimestamp);
            plane.updateMarker(true);
            if (plane.tr && plane.tr.parentNode) {
                plane.tr.parentNode.removeChild(plane.tr);
            }
            continue;
        }

        TrackedAircraft++;
        if (plane.position) TrackedAircraftPositions++;
        TrackedHistorySize += plane.messages || 0;

        plane.visible = true;
        plane.updateTrack(plane.last_message_time, LastReceiverTimestamp);
        plane.updateMarker(true);

        if (plane.visible) {
            validPlanes.push(plane);
        }
    }

    // Update summary
    $('#dump1090_total_ac').text(TrackedAircraft);
    $('#dump1090_total_ac_positions').text(TrackedAircraftPositions);
    $('#dump1090_total_history').text(TrackedHistorySize);

    // Update page title
    if (PlaneCountInTitle) {
        document.title = TrackedAircraft + ' drone' + (TrackedAircraft !== 1 ? 's' : '') + ' - ' + PageName;
    }

    // Sort table
    var tbody = $('#tableinfo > tbody');

    // Detach all rows
    for (var i = 0; i < validPlanes.length; i++) {
        if (validPlanes[i].tr && validPlanes[i].tr.parentNode) {
            validPlanes[i].tr.parentNode.removeChild(validPlanes[i].tr);
        }
    }

    // Update row data and reattach
    for (var i = 0; i < validPlanes.length; i++) {
        var plane = validPlanes[i];
        var r = plane.tr;
        if (!r) continue;

        r.cells[0].textContent = plane.icao;
        r.cells[1].textContent = plane.flight || '';
        r.cells[2].textContent = plane.manufacturer || '';
        r.cells[3].textContent = plane.altitude_m !== null ? plane.altitude_m + ' m' : '';
        r.cells[4].textContent = plane.rssi !== null ? plane.rssi + ' dBm' : '';
        r.cells[5].textContent = plane.seen !== null ? plane.seen.toFixed(0) + 's' : '';
        r.cells[6].textContent = plane.position ? plane.position[1].toFixed(6) : '';
        r.cells[7].textContent = plane.position ? plane.position[0].toFixed(6) : '';
        r.cells[8].textContent = plane.droneType || '';

        r.className = 'plane_table_row';
        if (plane.icao === SelectedPlane) {
            r.className += ' selected';
        }

        tbody.append(r);
    }

    // Auto-center on first drone if map hasn't been positioned yet
    if (TrackedAircraftPositions > 0 && !mapPositioned) {
        for (var i = 0; i < PlanesOrdered.length; i++) {
            if (PlanesOrdered[i].position && PlanesOrdered[i].droneType === 'drone') {
                OLMap.getView().setCenter(ol.proj.fromLonLat(PlanesOrdered[i].position));
                mapPositioned = true;
                break;
            }
        }
    }
}

var mapPositioned = false;

function refreshSelected() {
    if (SelectedPlane === null || !Planes[SelectedPlane]) {
        $('#selected_infoblock').hide();
        return;
    }

    var sel = Planes[SelectedPlane];
    $('#selected_infoblock').show();

    $('#selected_callsign').text(sel.flight || 'Unknown');
    $('#selected_icao').text(sel.icao);
    $('#selected_registration').text(sel.flight || 'n/a');
    $('#selected_mac').text(sel.mac || sel.icao);
    $('#selected_manufacturer').text(sel.manufacturer || 'Unknown');
    $('#selected_source').text(sel.droneType === 'drone' ? 'Drone (Open Drone ID)' : sel.droneType === 'pilot' ? 'Pilot' : 'Unknown');
    $('#selected_rssi').text(sel.rssi !== null ? sel.rssi + ' dBm' : 'n/a');
    $('#selected_message_count').text(sel.messages || 0);
    $('#selected_seen').text(sel.seen !== null ? sel.seen.toFixed(1) + 's ago' : 'n/a');

    if (sel.position) {
        $('#selected_position').text(sel.position[1].toFixed(6) + ', ' + sel.position[0].toFixed(6));
    } else {
        $('#selected_position').text('n/a');
    }

    if (sel.altitude_m !== null && sel.altitude_m !== undefined) {
        $('#selected_altitude').text(sel.altitude_m + ' m');
    } else if (sel.altitude !== null) {
        $('#selected_altitude').text(format_altitude_long(sel.altitude, sel.vert_rate, DisplayUnits));
    } else {
        $('#selected_altitude').text('n/a');
    }

    // Pilot info
    if (sel.pilot_lat !== null && sel.pilot_lon !== null && (sel.pilot_lat !== 0 || sel.pilot_lon !== 0)) {
        $('#selected_pilot_position').text(sel.pilot_lat.toFixed(6) + ', ' + sel.pilot_lon.toFixed(6));
        var dist = sel.getPilotDistance();
        if (dist !== null) {
            $('#selected_pilot_distance').text(Math.round(dist) + ' m');
        } else {
            $('#selected_pilot_distance').text('n/a');
        }
    } else {
        $('#selected_pilot_position').text('n/a');
        $('#selected_pilot_distance').text('n/a');
    }

    // Show trail
    sel.updateLines();
}

function refreshHighlighted() {
    if (HighlightedPlane === null || !Planes[HighlightedPlane]) {
        $('#highlighted_infoblock').hide();
        return;
    }

    var h = Planes[HighlightedPlane];
    if (h.icao === SelectedPlane) {
        $('#highlighted_infoblock').hide();
        return;
    }

    $('#highlighted_infoblock').show();
    $('#highlighted_callsign').text(h.flight || 'Unknown');
    $('#highlighted_icao').text(h.icao);
    $('#highlighted_registration').text(h.flight || 'n/a');
    $('#highlighted_manufacturer').text(h.manufacturer || 'Unknown');
    $('#higlighted_icaotype').text(h.droneType || 'n/a');

    if (h.altitude_m !== null && h.altitude_m !== undefined) {
        $('#highlighted_altitude').text(h.altitude_m + ' m');
    } else {
        $('#highlighted_altitude').text('n/a');
    }

    $('#highlighted_speed').text(h.rssi !== null ? h.rssi + ' dBm' : 'n/a');
    $('#highlighted_source').text(h.droneType === 'drone' ? 'Open Drone ID' : h.droneType || 'n/a');
}

function selectPlaneByHex(hex, follow) {
    // Deselect previous
    if (SelectedPlane !== null && Planes[SelectedPlane]) {
        Planes[SelectedPlane].selected = false;
        Planes[SelectedPlane].clearLines();
        Planes[SelectedPlane].updateMarker(false);
    }

    SelectedPlane = hex;
    FollowSelected = follow;

    if (Planes[hex]) {
        Planes[hex].selected = true;
        Planes[hex].updateMarker(false);

        if (follow && Planes[hex].position) {
            OLMap.getView().setCenter(ol.proj.fromLonLat(Planes[hex].position));
        }
    }

    refreshSelected();
    refreshTableInfo();
}

function highlightPlaneByHex(hex) {
    if (hex === HighlightedPlane) return;
    HighlightedPlane = hex;
    refreshHighlighted();
}

function selectAllPlanes() {
    SelectedAllPlanes = true;
    for (var i = 0; i < PlanesOrdered.length; i++) {
        PlanesOrdered[i].selected = true;
        PlanesOrdered[i].updateLines();
    }
}

function deselectAllPlanes() {
    SelectedAllPlanes = false;
    if (SelectedPlane !== null && Planes[SelectedPlane]) {
        Planes[SelectedPlane].selected = false;
        Planes[SelectedPlane].clearLines();
        Planes[SelectedPlane].updateMarker(false);
    }
    SelectedPlane = null;
    refreshSelected();
    refreshTableInfo();
    for (var i = 0; i < PlanesOrdered.length; i++) {
        PlanesOrdered[i].selected = false;
        PlanesOrdered[i].clearLines();
    }
}

function resetMap() {
    OLMap.getView().setCenter(ol.proj.fromLonLat([DefaultCenterLon, DefaultCenterLat]));
    OLMap.getView().setZoom(DefaultZoomLvl);
    mapPositioned = false;
    deselectAllPlanes();
}

function adjustSelectedInfoBlockPosition() {
    var topCalc = ($(window).height() - $('#selected_infoblock').height() - 60);
    if (topCalc < 0) topCalc = 0;
    $('#selected_infoblock').css('top', topCalc + 'px');
}

// Sidebar toggle
function toggleSidebarVisibility() {
    if ($('#sidebar_container').is(':visible')) {
        $('#sidebar_container').hide();
        $('#toggle_sidebar_button').removeClass('hide_sidebar').addClass('show_sidebar');
        updateMapSize();
    } else {
        $('#sidebar_container').show();
        $('#toggle_sidebar_button').removeClass('show_sidebar').addClass('hide_sidebar');
        updateMapSize();
    }
}

function expandSidebar() {
    if ($('#map_container').is(':visible')) {
        $('#map_container').hide();
        $('#show_map_button').show();
    }
}

function showMap() {
    $('#map_container').show();
    $('#show_map_button').hide();
    updateMapSize();
}

function updateMapSize() {
    if (OLMap) OLMap.updateSize();
}

function initializeUnitsSelector() {
    var saved = localStorage.getItem('displayUnits');
    if (saved) DisplayUnits = saved;
    $('#units_selector').val(DisplayUnits);
    $('#units_selector').on('change', function() {
        DisplayUnits = $(this).val();
        localStorage.setItem('displayUnits', DisplayUnits);
        refreshTableInfo();
        refreshSelected();
    });
}

function toggleAllPlanes(save) {
    SelectedAllPlanes = !SelectedAllPlanes;
    if (save) localStorage.setItem('allPlanes', SelectedAllPlanes);
    if (SelectedAllPlanes) {
        $('#selectall_checkbox').addClass('settingsCheckboxChecked');
    } else {
        $('#selectall_checkbox').removeClass('settingsCheckboxChecked');
    }
}

function toggleAircraftLabels(save) {
    AircraftLabels = !AircraftLabels;
    if (save) localStorage.setItem('aircraftLabels', AircraftLabels);
    if (AircraftLabels) {
        $('#aircraft_label_checkbox').addClass('settingsCheckboxChecked');
    } else {
        $('#aircraft_label_checkbox').removeClass('settingsCheckboxChecked');
    }
}

// Sort functions
var sortColumn = 'icao';
var sortAscending = true;

function sortByICAO() { sortBy('icao'); }
function sortByFlight() { sortBy('flight'); }
function sortByManufacturer() { sortBy('manufacturer'); }
function sortByAltitude() { sortBy('altitude'); }
function sortByRssi() { sortBy('rssi'); }
function sortBySeen() { sortBy('seen'); }
function sortByLatitude() { sortBy('lat'); }
function sortByLongitude() { sortBy('lon'); }
function sortByDataSource() { sortBy('data_source'); }
function sortBySquawk() { sortBy('icao'); }
function sortByRegistration() { sortBy('icao'); }
function sortByAircraftType() { sortBy('icao'); }
function sortBySpeed() { sortBy('rssi'); }
function sortByVerticalRate() { sortBy('icao'); }
function sortByDistance() { sortBy('icao'); }
function sortByTrack() { sortBy('icao'); }
function sortByMsgs() { sortBy('icao'); }
function sortByCountry() { sortBy('icao'); }

function sortBy(column) {
    if (sortColumn === column) {
        sortAscending = !sortAscending;
    } else {
        sortColumn = column;
        sortAscending = true;
    }
    refreshTableInfo();
}
