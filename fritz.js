var fritz = require("fritzapi"),
    isWebUri = require('valid-url').isWebUri;
    Promise = require("bluebird");

module.exports = function(RED) {

	function FritzboxConfig(n) {
		RED.nodes.createNode(this, n);
		var node = this;
		if(!n.host) return;

		node.config = {
			host: n.host,
			user: node.credentials.username,
			password: node.credentials.password,
			port: n.port,
			ssl: n.ssl
		};

        node.init = function() {
            var accessories = [];
            var node = this;
            
            fritz.getSessionID(node.config.username || "", node.config.password, {}).then(function(sid) {
                node.log("Fritz!Box platform login successful");
                node.sid = sid;
            })
            .then(function() {
                node.log("Discovering devices");

                node.updateDeviceList().then(function(devices) {
                    var jobs = [];

                    // outlets
                    jobs.push(node.fritz("getSwitchList").then(function(ains) {
                        ains.forEach(function(ain) {
                            node.log("Outlet found: " + ain);
                        });
                    }));

                    // thermostats
                    jobs.push(node.fritz('getThermostatList').then(function(ains) {
                        ains.forEach(function(ain) {
                            node.log("Thermostat found: " + ain);
                        });

                        // add remaining non-api devices that support temperature, e.g. Fritz!DECT 100 repeater
                        var sensors = [];
                        devices.forEach(function(device) {
                            if (device.temperature) {
                                var ain = device.identifier.replace(/\s/g, '');
                                if (!accessories.find(function(accessory) {
                                    return accessory.ain && accessory.ain == ain;
                                })) {
                                    sensors.push(ain);
                                }
                            }
                        });

                        if (sensors.length) {
                            sensors.forEach(function(ain) {
                                node.log("Sensor found: " + ain);
                            });
                        }
                    }));

                    // alarm sensors
                    var alarms = [];
                    devices.forEach(function(device) {
                        if (device.alert) {
                            alarms.push(device.identifier);
                        }
                    });

                    if (alarms.length) {
                        alarms.forEach(function(ain) {
                            node.log("Alarm found: " + ain);
                        });
                    }

                    Promise.all(jobs).then(function() {
                        // TODO
                    });
                })
                .catch(function(error) {
                    node.error("Could not get devices from Fritz!Box. "
                    + "Please check if device supports the smart home API and user has sufficient privileges.");
                });
            })
            .catch(function(error) {
                node.error("Initializing Fritz!Box platform failed - wrong user credentials?");
            });
        };

        node.updateDeviceList = function() {
            return this.fritz("getDeviceList").then(function(devices) {
                // cache list of devices in options for reuse by non-API functions
                this.deviceList = devices;
                return devices;
            }.bind(this));
        };

        node.getDevice = function(ain) {
            var device = this.deviceList.find(function(device) {
                return device.identifier.replace(/\s/g, '') == ain;
            });
            return device || {}; // safeguard
        };

        node.getName = function(ain) {
            var dev = this.getDevice(ain);
            return dev.name || ain;
        };

        node.fritz = function(func) {
            var args = Array.prototype.slice.call(arguments, 1);
            var node = this;

            // api call tracking
            if (node.config.concurrent) {
                this.promise = null;
            }
            else if ((this.promise || Promise.resolve()).isPending()) {
                this.pending++;
                this.debug('%s pending api calls', this.pending);
            }

            this.promise = (this.promise || Promise.resolve()).reflect().then(function() {
                node.pending = Math.max(node.pending-1, 0);

                var fritzFunc = fritz[func];
                var funcArgs = [node.sid].concat(args).concat(node.options);

                node.debug("> %s (%s)", func, JSON.stringify(funcArgs.slice(0,-1)).slice(1,-1));

                return fritzFunc.apply(node, funcArgs).catch(function(error) {
                    if (error.response && error.response.statusCode == 403) {
                        return fritz.getSessionID(node.config.username, node.config.password, node.options).then(function(sid) {
                            node.log("Fritz!Box session renewed");
                            node.log("renewed:"+sid);
                            node.sid = sid;

                            funcArgs = [node.sid].concat(args).concat(node.options);
                            node.log("renewed, now calling:"+funcArgs.toString());
                            return fritzFunc.apply(node, funcArgs);
                        })
                        .catch(function(error) {
                            node.warn("Fritz!Box session renewal failed");
                            /* jshint laxbreak:true */
                            throw error === "0000000000000000"
                                ? "Invalid session id"
                                : error;
                        });
                    }

                    throw error;
                });
            })
            .catch(function(error) {
                node.debug(error);
                node.error("< %s failed", func);
                node.promise = null;

                return Promise.reject(func + " failed");
            });

            // debug result
            this.promise.then(function(res) {
                node.debug("< %s %s", func, JSON.stringify(res));
                return res;
            });

            return this.promise;
        };

        node.fritzApi = function(func) {
            return fritz;
        }

        node.init();
    };
	
	RED.nodes.registerType("fritzapi-config", FritzboxConfig, {
		credentials: {
			username: {type: "text"},
			password: {type: "password"}
		}
	});


	function Fritzbox(config) {
		RED.nodes.createNode(this,config);
		var node = this;
        node.log( 'Register API');

		node.on('input', function(msg) {
		});

		node.on('close', function() {
		});
	}
	RED.nodes.registerType("fritzapi", Fritzbox);
};
