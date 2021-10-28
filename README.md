# node-red-contrib-fritzapi

Control your smart home DECT devices and guest wifi through an AVM Fritz!Box with node-RED.

These nodes are a simple Node-RED wrapper for [andig's](https://github.com/andig) ever-popular
[fritzapi](https://www.npmjs.com/package/fritzapi), see there a for feature description.

## Installation

The recommended way is to install directly from Node-RED under `Manage palette`.

## Configuration

Depending on your FRITZ!Box configuration, a user name may be needed. If your box is configured for password-only
admin access, leave the user name blank and only provide the admin password. Make sure that smart home control is
enabled on the FRITZ!Box.

## Usage

The packages contains `thermostat`, `switch`, `bulb`, `blind` and `guest wifi` nodes under the `advanced` section in the palette.

Thermostats, switches and blinds expect an actuator identification number `AIN` as `ain` or `topic` on the input message.

If both `ain` and `topic` are provided, `ain` has precedence.

Nodes have an (optional) pre-set action. It can be overriden with the `action` attribute on input messages.
See [fritzapi](https://www.npmjs.com/package/fritzapi) for a list of supported action names.

Any payload is accepted for information retrieval.

* For switch and wifi updates, send the desired boolean value
(on or off).
* For thermostat updates, send the target temperature or adjustment in degrees Celsius.
  * There are two special cases: `setTempComfort` (Set to day temperature) and `setTempNight` (Set to night temperature)
do not expect a temperature as payload, because they set the *target* temperature to the day / night preset.
  * An [example flow](examples/Fritz%20HTTP%20API%20Example%20Flow.json) demonstrates usage of the `thermostat` node.
* Bulbs can be set to a given brightness level, color or color temperature. See the node documenation for details.
* Blinds be set to a desired level, or opened or closed.
See the node documenation for details.

Adjustments are only made if the desired state differs from the actual state. All updates are logged.

All actions output the requested or updated value.

## Troubleshooting

A popular pitfall seems to be that the Fritz!Box UI shows imcomplete AINs for various [bulbs](https://github.com/dnknth/node-red-contrib-fritzapi/issues/27#issuecomment-953936018) and [blinds](https://github.com/dnknth/node-red-contrib-fritzapi/issues/26). If the device does not respond, try appending `-1` to the AIN.

## Still stuck?

Switches, bulbs and blinds were tested by contributors, as I do not own any. All feedback appreciated, but please check the [relevant issues](https://github.com/dnknth/node-red-contrib-fritzapi/issues?q=is%3Aissue+is%3Aclosed) before opening new ones.

## Credits

Kudos to [andig](https://github.com/andig) for [fritzapi](https://www.npmjs.com/package/fritzapi).
Also, substantial parts of the low-level interface were also written by [andig](https://github.com/andig) for
[homebridge-fritz](https://www.npmjs.com/package/homebridge-fritz). Thanks for the wizardry!
