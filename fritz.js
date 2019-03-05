var fritz = require( "fritzapi"),
    Promise = require( "bluebird");

module.exports = function(RED) {

	function Fritzbox( config) {
		RED.nodes.createNode(this, config);
		var node = this;

		node.options = {
			strictSSL: config.strictSSL
		};

        node.init = function() {
            var node = this;
            node.deviceList = [];
            
            node.login().then(function() {
                node.updateDeviceList().then(function() {

                    node.deviceList.forEach(function(device) {
                        node.log( `Found: ${device.identifier} (${device.name})`);
                    });
                })
                .catch(function(error) {
                    node.error( error);
                });
            })
            .catch(function(error) {
                node.error( error);
            });
        };

        node.updateDeviceList = function() {
            node.log( "Updating devices");
            return node.fritz("getDeviceList").then(function(devices) {
                // cache list of devices in options for reuse by non-API functions
                node.deviceList = devices;
            });
        };

        node.getDevice = function(ain) {
            var device = this.deviceList.find(function(device) {
                return device.identifier.replace(/\s/g, '') == ain;
            });
            return device || {}; // safeguard
        };

        node.fritz = function(func) {
            var args = Array.prototype.slice.call(arguments, 1);
            var node = this;

            // api call tracking
            if ((this.promise || Promise.resolve()).isPending()) {
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
                        return node.login().then(function(sid) {
                            node.log("Fritz!Box session renewed");

                            funcArgs = [node.sid].concat(args).concat(node.options);
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
                node.error("< %s failed", func);
                node.error(error);
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

        node.login = function() {
            return fritz.getSessionID(node.credentials.username || "", node.credentials.password, node.options)
            .then(function(sid) {
                node.sid = sid;
                return sid;
            });
        }

        node.init();
    };
	
	RED.nodes.registerType("fritz-api", Fritzbox, {
		credentials: {
			username: {type: "text"},
			password: {type: "password"}
		}
	});


	function Thermostat(config) {
		RED.nodes.createNode(this, config);
        var node = this;
        node.config = config;
        node.connection = RED.nodes.getNode( config.connection);

        node.init = function() {
            node.connection.login().then(function() {
                node.status({fill: "green", shape: "dot", text: "connected"});
            })
            .catch(function(error) {
                node.status({fill: "red", shape: "ring", text: "login failed"});
            });
        };

		node.on('input', function(msg) {
            const device = node.connection.getDevice( msg.topic);
            if (!device) {
                node.error( "unknown device: " + msg.topic);
                return;
            }

            switch( node.config.action) {
                case '':
                    break;
                case 'getTemperature':
                    node.connection.fritz( "getTemperature", msg.topic).then( function( t) {
                        msg.payload = +device['temperature'].offset / 10.0 + t;
                        node.send( msg);
                    });
                    break;
                case 'getTempTarget':
                case 'getTempComfort':
                case 'getTempNight':
                    node.connection.fritz( node.config.action, msg.topic).then( function( t) {
                        msg.payload = t;
                        node.send( msg);
                    });
                    break;
                case 'setTempTarget':
                    node.connection.fritz( "setTempTarget", msg.topic, msg.payload).then( function() {
                        node.send( msg);
                    });
                    break;
                case 'adjustTempTarget':
                    node.connection.fritz( "getTempTarget", msg.topic).then( function( t) {
                        msg.payload = +msg.payload + t;
                        node.connection.fritz( "setTempTarget", msg.topic, msg.payload).then( function() {
                            node.send( msg);
                        });
                    });
                    break;
                case 'setTempComfort':
                    node.connection.fritz( "getTempComfort", msg.topic).then( function( t) {
                        node.connection.fritz( "setTempTarget", msg.topic, t).then( function() {
                            msg.payload = t;
                            node.send( msg);
                        });
                    });
                    break;
                case 'setTempNight':
                    node.connection.fritz( "setTempNight", msg.topic).then( function( t) {
                        node.connection.fritz( "setTempTarget", msg.topic, t).then( function() {
                            msg.payload = t;
                            node.send( msg);
                        });
                    });
                    break;
                default:
                    node.error( "Unknown operation: " + node.config.action);
                    return;
            }
		});

        node.init();
    }

    RED.nodes.registerType( "fritz-thermostat", Thermostat);


	function Switch( config) {
		RED.nodes.createNode(this, config);
        var node = this;
        node.config = config;
        node.connection = RED.nodes.getNode( config.connection);

        node.init = function() {
            node.connection.login().then(function() {
                node.status({fill: "green", shape: "dot", text: "connected"});
            })
            .catch(function(error) {
                node.status({fill: "red", shape: "ring", text: "login failed"});
            });
        };

		node.on('input', function(msg) {
            const device = node.connection.getDevice( msg.topic);
            if (!device) {
                node.error( "unknown device: " + msg.topic);
                return;
            }

            switch( node.config.action) {
                case '':
                    break;
                case 'setSwitchState':
                    const cmd = msg.payload ? "setSwitchOn" : "setSwitchOff";
                    node.connection.fritz( cmd, msg.topic).then( function( t) {
                        msg.payload = t;
                        node.send( msg);
                    });
                    break;
                case 'getSwitchState':
                case 'getSwitchPower':
                case 'getSwitchEnergy':
                case 'getSwitchPresence':
                    node.connection.fritz( node.config.action, msg.topic).then( function( t) {
                        msg.payload = t;
                        node.send( msg);
                    });
                    break;
                default:
                    node.error( "Unknown operation: " + node.config.action);
                    return;
            }
		});

        node.init();
    }

    RED.nodes.registerType("fritz-switch", Switch);
};
