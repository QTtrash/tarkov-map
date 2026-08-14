# Privacy policy

Raid Signal is local-first. It does not include telemetry, advertising, account
integration, or cloud storage for screenshots, logs, quest state, or custom
pins.

## Desktop data

The Windows application reads only user-selected Escape from Tarkov screenshot
and log directories. Parsed position, raid, quest, and waypoint state remains on
the local device unless the user explicitly starts a sharing session.

## Sharing data

Internet and LAN sharing sends encrypted map ID, coordinates, heading, callsign,
sequence, and timestamp. AES-256-GCM encryption happens on the publishing device.
The invitation key remains in the URL fragment and is not sent to the HTTP or
WebSocket relay.

The public relay forwards ciphertext without parsing it and stores no message or
position history. The VPS and hosting provider can still observe connection IP
addresses, timing, and room activity. Anyone who possesses an invitation can
view the room, and a modified client holding the key can forge a position.

Raid Signal does not transfer information to networked systems unless the user
explicitly starts an Internet sharing session or opens an external link. LAN
sharing remains on the user's selected local network.

## Retention and control

The relay has no database or history. Internet invitation identifiers expire
after three hours. Local settings and progress can be removed by clearing the
application data or uninstalling the application.

Report suspected privacy or security defects through GitHub's private
vulnerability reporting flow described in [SECURITY.md](SECURITY.md).
