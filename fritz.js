var fritz = require( "fritzapi"),
    Promise = require( "bluebird");

module.exports = function(RED) {

    /** Connection information for the FRITZ!Box */
	function Fritzbox( config) {
  		 RED.nodes.createNode( this, config);
  		 var node = this;
       
       if (! /^https?:\/\//.test( config.host)) {
            config.host = "http://" + config.host;
        }
    		node.options = {
      			strictSSL: config.strictSSL,
      			url: config.host
    		};

        /** Login to the box and retrieve device list */
        node.init = function() {
            node.deviceList = [];
            node.login().then( function() {
                node.updateDeviceList();
            })
            .catch( function(error) {
                node.error( error);
            });
        };

        /** Show a status indicator on actuator nodes */
        node.statusFlag = function( othernode) {
            node.login().then( function() {
                othernode.status({fill: "green", shape: "dot", text: "connected"});
            })
            .catch( function(error) {
                othernode.status({fill: "red", shape: "ring", text: "login failed"});
            });
        };

        /** Query smart home devices from the FRITZ!Box and log them */
        node.updateDeviceList = function() {
            node.log( "Updating devices");
            return node.fritz("getDeviceList").then( function(devices) {
                // cache list of devices in options for reuse by non-API functions
                node.deviceList = devices;
                node.ready = true;
                devices.forEach( function(device) {
                    node.log( `Found: ${device.identifier} (${device.name})`);
                });
            });
        };

        /** Is node ready to use? */
        node.isReady  = function() {
            return node.ready;
        };

        /** Check whether the AIN of a device is known */
        node.checkDevice = function( othernode, msg, flags) {
            if (!node.ready) {
                node.warn( "Device not ready");
                return;
            }

            const ain = msg.ain || msg.topic;
            const device = node.deviceList.find( function( device) {
                return device.identifier.replace(/\s/g, '') == ain;
            });
            if (device) return device;

            // Not found => log names and AINs of all devices with given feature flags
            othernode.warn( "unknown device: " + ain);

            if (node.deviceList.length > 0) {
                let res = {};
                node.deviceList.forEach( function( device) {
                    if (((+device.functionbitmask) & flags) == flags) {
                        res[ device.name] = device.identifier;
                    }
                });
                othernode.warn( { 'Valid devices' : res});
            }
        };

        /** Low-level interface to fritzapi */
        node.fritz = function(func) {
            var args = Array.prototype.slice.call(arguments, 1);
            var node = this;

            // api call tracking
            if ((this.promise || Promise.resolve()).isPending()) {
                this.pending++;
                this.debug('%s pending api calls', this.pending);
            }

            this.promise = (this.promise || Promise.resolve()).reflect().then( function() {
                node.pending = Math.max(node.pending-1, 0);

                var fritzFunc = fritz[func];
                var funcArgs = [node.sid].concat(args).concat(node.options);

                node.debug("> %s (%s)", func, JSON.stringify(funcArgs.slice(0,-1)).slice(1,-1));

                return fritzFunc.apply(node, funcArgs).catch( function(error) {
                    if (error.response && error.response.statusCode == 403) {
                        return node.login().then( function(sid) {
                            node.log( "Fritz!Box session renewed");

                            funcArgs = [node.sid].concat(args).concat(node.options);
                            return fritzFunc.apply(node, funcArgs);
                        })
                        .catch( function(error) {
                            node.error( "Fritz!Box session renewal failed");
                            /* jshint laxbreak:true */
                            throw error === "0000000000000000"
                                ? "Invalid session id"
                                : error;
                        });
                    }

                    throw error;
                });
            })
            .catch( function(error) {
                node.warn( func + " failed");
                node.error( JSON.stringify( error));
                node.promise = null;

                return Promise.reject( func + " failed");
            });

            // debug result
            this.promise.then( function( res) {
                node.debug( func, JSON.stringify( res));
                return res;
            });

            return this.promise;
        };

        /** Obtain a session ID for API calls */
        node.login = function() {
            return fritz.getSessionID(node.credentials.username || "", node.credentials.password, node.options)
            .then( function(sid) {
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


    /** Thermostats have a temperatur sensor, target temparature, and day / night presets */
	function Thermostat( config) {
		RED.nodes.createNode( this, config);
        var node = this;
        node.config = config;
        node.connection = RED.nodes.getNode( config.connection);

        /** Set the target temperature to the value of msg.payload in °C */
        node.setTemp = function( msg) {
            node.connection.fritz( "getTempTarget", msg.ain || msg.topic).then( function( t) {
                if (msg.payload && t != msg.payload) {
                    node.connection.fritz( "setTempTarget", msg.ain || msg.topic, msg.payload).then( function() {
                        node.log( `Set ${msg.ain || msg.topic} from ${t} to ${msg.payload} °C`);
                        node.send( msg);
                    });
                }
                else {
                    node.send( msg);
                }
            });
        };

        /** Set the target temperature to a predefined setting, adjusting by an offset value in °C */
        node.setTempTo = function( msg, setting, offset) {
            node.connection.fritz( setting, msg.ain || msg.topic).then( function( t) {
                msg.payload = +t + offset;
                node.setTemp( msg);
            });
        };

        /** Is this action related to a device? */
        node.isDeviceAction = function( action) {
            switch( action) {
                case 'getTemperature':
                case 'getTempTarget':
                case 'getTempComfort':
                case 'getTempNight':
                case 'getBatteryCharge':
                case 'getWindowOpen':
                case 'getDevice':
                case 'getPresence':
                case 'setTempTarget':
                case 'adjustTempTarget':
                case 'setTempComfort':
                case 'setTempNight':
                    return true;
                default:
                    return false;
            }
        };

        /** Main message handler */
		node.on( 'input', function msgHandler( msg) {
            // Get action
            const action = msg.action || node.config.action
            // Wait for node being ready
            if (!node.connection.isReady()) {
                setTimeout( function () {
                    //node.log( "Wait till node is ready for action '" + action + "'");
                    msgHandler( msg);
                }, 1000);
                return;
            }
            // Check device if it is a device action
            if (node.isDeviceAction(action)) {
                const device = node.connection.checkDevice( node, msg, fritz.FUNCTION_THERMOSTAT);
                if (!device) return;
            }
            // Handle action
            switch( action) {
                case 'getTemperature': // #2
                case 'getTempTarget':
                case 'getTempComfort':
                case 'getTempNight':
                case 'getBatteryCharge':
                case 'getWindowOpen':
                case 'getDevice':
                case 'getPresence':
                    node.connection.fritz( action, msg.ain || msg.topic).then( function( t) {
                        msg.payload = t;
                        node.send( msg);
                    });
                    break;
                case 'setTempTarget':
                    node.setTemp( msg);
                    break;
                case 'adjustTempTarget':
                    node.setTempTo( msg, "getTempTarget", +msg.payload);
                    break;
                case 'setTempComfort':
                    node.setTempTo( msg, "getTempComfort", 0);
                    break;
                case 'setTempNight':
                    node.setTempTo( msg, "getTempNight", 0);
                    break;

                case 'getDeviceListFiltered':
                    break;
    
                case 'applyTemplate':
                    break;
       
                case 'getOSVersion':
                case 'getDeviceList':
                case 'getTemplateList':
                case 'getThermostatList':
                    node.connection.fritz( action).then( function( t) {
                        msg.payload = t;
                        node.send( msg);
                    });
                    break;

                default:
                    node.error( "Unknown action: " + (action || '-undefined-'));
                    return;
            }
		    });
        
        node.connection.statusFlag( node);
    }

    RED.nodes.registerType( "fritz-thermostat", Thermostat);


    /** Swiches have on' and 'off' states, and can report technical values */
	function Outlet( config) {
		RED.nodes.createNode( this, config);
        var node = this;
        node.config = config;
        node.connection = RED.nodes.getNode( config.connection);

        /** Main message handler */
		    node.on('input', function( msg) {
            if (!node.connection.checkDevice( node, msg, fritz.FUNCTION_OUTLET)) return;

            const action = msg.action || node.config.action

            switch( action) {
                case 'setSwitchState':
                    const cmd = msg.payload ? "setSwitchOn" : "setSwitchOff";
                    node.connection.fritz( "getSwitchState", msg.ain || msg.topic).then( function( t) {
                        if (t != msg.payload) {
                            node.connection.fritz( cmd, msg.ain || msg.topic).then( function() {
                                node.log( `${msg.ain || msg.topic} switched ${msg.payload ? 'on' : 'off'}`);
                                node.send( msg);
                            });
                        }
                        else {
                            node.send( msg);
                        }
                    });
                    break;
                case 'getSwitchState':
                case 'getSwitchPower':
                case 'getSwitchEnergy':
                case 'getSwitchPresence':
                    node.connection.fritz( action, msg.ain || msg.topic).then( function( t) {
                        msg.payload = t;
                        node.send( msg);
                    });
                    break;
                default:
                    node.error( "Unknown action: " + (action || '-undefined-'));
                    return;
            }
		    });

        node.connection.statusFlag( node);
    }

    RED.nodes.registerType( "fritz-outlet", Outlet);


    /** Guest wifi can be ON or OFF.
     * FIXME: Broken with FRITZ!Box 7590 running OS 7.01
     */
	function GuestWifi( config) {
		RED.nodes.createNode( this, config);
        var node = this;
        node.config = config;
        node.connection = RED.nodes.getNode( config.connection);

		    node.on( 'input', function(msg) {
            if (!node.connection.ready) {
                node.warn( "Device not ready");
                return;
            }

            const action = msg.action || node.config.action

            switch( action) {
                case 'getGuestWlan':
                    node.connection.fritz( 'getGuestWlan').then( function( t) {
                        msg.payload = t;
                        node.send( msg);
                    });
                    break;
                case 'setGuestWlan':
                    node.connection.fritz( 'setGuestWlan', msg.payload).then( function() {
                        node.log( `${msg.payload ? 'Enabled' : 'Disabled'} guest Wifi`);
                        node.send( msg);
                    });
                    break;
                default:
                    node.error( "Unknown action: " + (action || '-undefined-'));
                    return;
            }
		    });

        node.connection.statusFlag( node);
    }

    RED.nodes.registerType( "fritz-guestwifi", GuestWifi);
};
