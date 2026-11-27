# Start the app on Raspberry Pi boot

The `parking-camera.service` unit waits for `network-online.target`, then
starts `app.py` as user `tungtee888`. It uses the project's virtual
environment and restarts the app if it exits with an error. The app loads MQTT
credentials and settings from the project's `.env`.

Install and enable the service from the project directory:

```sh
sudo cp parking-camera.service /etc/systemd/system/parking-camera.service
sudo systemctl daemon-reload
```

`network-online.target` needs the wait-online service for the Pi's network
manager. On Raspberry Pi OS using NetworkManager, enable its wait service:

```sh
sudo systemctl enable NetworkManager-wait-online.service
```

If the Pi uses `systemd-networkd` instead, enable
`systemd-networkd-wait-online.service` instead.

Then enable and start the app:

```sh
sudo systemctl enable --now parking-camera.service
```

After future unit-file changes, copy the unit again, run
`sudo systemctl daemon-reload`, and restart `parking-camera.service`.

Check the service and its logs:

```sh
systemctl status parking-camera.service
journalctl -u parking-camera.service -f
```

To stop it, or prevent it starting on the next boot:

```sh
sudo systemctl disable --now parking-camera.service
```

The unit assumes the project stays at `/home/tungtee888/activities/project`
and that `.venv/bin/python` exists there. If either path changes, update
`User`, `WorkingDirectory`, and `ExecStart` in the unit before installing it.
