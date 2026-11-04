#!/bin/sh
# Shows the board full screen. Waits for the server first, because a browser that opens too
# early would sit on an error page, and opens it again if the browser ever closes.
BOARD="http://127.0.0.1:4173/#wall"
BROWSER=$(command -v chromium || command -v chromium-browser)

until curl -sf -o /dev/null http://127.0.0.1:4173/; do
  sleep 2
done

while true; do
  "$BROWSER" --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
    --disable-features=TranslateUI --no-first-run --password-store=basic "$BOARD"
  sleep 3
done
