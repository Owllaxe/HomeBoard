# Setting up the Pi

From the box to the board on the wall. Allow about an hour, most of it waiting for downloads. These steps have been run on a Raspberry Pi 5 with Raspberry Pi OS.

## What you need

- **Raspberry Pi 5, 8GB**
- **The official 27W USB-C power supply.** A phone charger can't supply enough current, and the Pi limits its USB ports or slows down.
- **The Active Cooler, or a case with a fan.** The AI runs on the processor, and without cooling it slows itself down within minutes.
- **A microSD card, 32 GB or more, marked A2.** An NVMe drive on an M.2 HAT is faster but optional.
- **A micro-HDMI to HDMI cable** for the screen. The Pi 5 has micro-HDMI ports, not full-size ones.
- **The screen's USB cable** for touch.
- **A USB keyboard and mouse** for the first setup, unless you do it all from your laptop over SSH.

## 1. Prepare the card on your laptop

1. Install **Raspberry Pi Imager** from raspberrypi.com/software.
2. Choose **Raspberry Pi 5**, then **Raspberry Pi OS (64-bit)**, the one with the desktop, then your card.
3. When it asks about OS customisation, choose **Edit settings**:
   - **Hostname:** `homeboard`. Phones will then reach it at `homeboard.local`.
   - **Username and password:** pick your own and write them down.
   - **Wi-Fi:** your network's name and password. The Pi has to be on the same Wi-Fi as your phone and laptop.
   - **Locale:** time zone `America/New_York`, keyboard `us`.
   - **Services:** turn on **SSH** with password login.
4. Write the card. It takes about 5 to 10 minutes.

## 2. Put it together

1. Fit the cooler on the Pi.
2. Put the card in.
3. Connect the screen to the HDMI port **nearest the power socket** (HDMI 0), and the screen's touch cable to a USB port.
4. Plug in the power last.

The first start takes a few minutes and may restart once. You should end up at the desktop.

## 3. Connect from your laptop

In PowerShell on your laptop, replacing `you` with the username from step 1:

```bash
ssh you@homeboard.local
```

Answer `yes` to the first question, then enter the password. Every command from here on is typed into this window. You can also type them on the Pi itself with a keyboard.

Bring everything up to date, then restart:

```bash
sudo apt update && sudo apt full-upgrade -y
```

```bash
sudo reboot
```

Wait a minute, then connect with `ssh` again.

## 4. Copy the board over

If the board has been running on your laptop, stop it first with Ctrl+C, so its saved data is final. Then, in a **new** terminal on the laptop, not the SSH one, copy the project folder across. Use your own folder's path:

```bash
scp -r "C:\path\to\homeboard" you@homeboard.local:~/home-board
```

If you cloned it from GitHub instead, you can clone it straight onto the Pi in the SSH window: `git clone <repository address> ~/home-board`.

This copies your settings, stations, tasks and calendar links along with the code. It goes straight from your laptop to the Pi over your home network. Once the Pi is running, use only the Pi's copy, so the two never get out of step.

## 5. Install the AI

Back in the SSH window:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

```bash
ollama pull qwen3.5:4b
```

The model is a 3.3 GB download. Skip this step if you don't want the AI. The rest of the board works without it.

## 6. Install the board

```bash
cd ~/home-board && sh deploy/install-pi.sh
```

This installs Node 22, starts the board's server, sets it to start at every power-on, turns off the Pi's own screen blanking, and sets the screen to open the board full screen. Then:

```bash
sudo reboot
```

After the restart, the board should fill the screen by itself within a minute or so.

## 7. Check it works

- **Touch:** swipe right for the menu, left for the week, up for tasks.
- **Laptop and phone:** on the board, open **Menu > Phone and laptop** for the 6-digit code. On your laptop, open `http://homeboard.local:4173` for the whole board and enter the code. On your phone, `http://homeboard.local:4173/send` is the quick page for sending assignments. Each device needs the code once. Bookmark the address.
- **AI:** send "What do I have tomorrow?" from the phone. Expect it to take a while.

## 8. Measure the AI on the real Pi

This runs the 30 test messages on a throwaway board, so your real one isn't touched. It takes about 15 to 30 minutes:

```bash
cd ~/home-board && node tools/test-ai.mjs qwen3.5:4b
```

The last two lines it prints give the score and the typical and slowest request times on your Pi.

## If something goes wrong

| What you see | What to do |
|---|---|
| `homeboard.local` isn't found | Find the Pi's address on its desktop (hover over the Wi-Fi icon) and use that instead, like `ssh you@192.168.1.23` |
| The board doesn't open after a restart | Run `systemctl status home-board` and `journalctl -u home-board -n 50` to see why |
| A lightning bolt in the corner of the screen | The power supply isn't strong enough. Use the official 27W one |
| Touch is in the wrong place, or the screen is sideways | Open **Screen Configuration** from the Pi's menu and set the rotation and touch screen |
| The screen goes black on its own during the day | Run `sudo raspi-config`, then **Display Options > Screen Blanking > No** |
| The AI never answers | Run `systemctl status ollama`. If it isn't running, run `sudo systemctl start ollama` |
