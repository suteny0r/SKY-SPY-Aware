// SKY-SPY-Aware: No aircraft database needed for drone detection
"use strict";

function getAircraftData(hex) {
    // Return a resolved deferred with empty data
    var deferred = $.Deferred();
    deferred.resolve({});
    return deferred.promise();
}
