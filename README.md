# GNOME OSK Automatic Open for Wayland

Automatically opens the GNOME on-screen keyboard (OSK) when a text field receives focus, particularly for non-GTK applications that don't trigger the native keyboard automatically.

## 🎯 Purpose

Many applications don't use the native GTK toolkit (Electron apps, Qt apps, web browsers), which means the GNOME on-screen keyboard doesn't automatically appear when touching a text field. This extension solves that problem by detecting text field focus and touch input to automatically open/close the system OSK.

## 🔍 Detection Logic

This extension uses detection logic inspired by [gjs-osk](https://github.com/Vishram1123/gjs-osk), adapted to control the native GNOME OSK.

### Three Detection Methods

1. **Main.inputMethod.currentFocus Polling** (Primary)
   - Checks every 300ms if a text field has focus
   - Works with all applications (GTK, Qt, Electron, web browsers)
   - Most reliable method for non-native applications

2. **Touch vs Mouse Event Detection** (Secondary)
   - Distinguishes between touch events (types 6-7, 9-12) and mouse events
   - Detects touchscreen device types via Clutter.InputDeviceType
   - Prevents keyboard from opening when using mouse/keyboard
   - Three modes: Never / Touch Only / Always

3. **Clutter.Text Detection** (Optional)
   - Direct detection of native Clutter text widgets
   - Provides instant response for GNOME native apps
   - Complements the polling method

## 🎮 Target Applications

This extension is particularly useful for:

- **Electron applications**: VSCode, Slack, Discord, Microsoft Teams
- **Qt applications**: Non-GTK Linux apps
- **Web browsers**: Firefox, Chromium, Chrome (form fields)
- **Flatpak applications**: Sandboxed apps with input isolation

## ⚙️ Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/AlexisLaurier/gnome-osk-automatic-open-for-wayland.git
cd gnome-osk-automatic-open-for-wayland

# Compile GSettings schemas
glib-compile-schemas schemas/

# Copy to GNOME extensions directory
mkdir -p ~/.local/share/gnome-shell/extensions/
cp -r . ~/.local/share/gnome-shell/extensions/gnome-osk-automatic-open@alexislaurier.fr/

# Restart GNOME Shell (Wayland: logout/login, X11: Alt+F2, 'r')
# Then enable the extension
gnome-extensions enable gnome-osk-automatic-open@alexislaurier.fr
```

## 🔧 Configuration

Open the extension preferences:

```bash
gnome-extensions prefs gnome-osk-automatic-open@alexislaurier.fr
```

### Settings

- **Detection Mode**:
  - **Never**: Disables automatic keyboard
  - **Touch Only** (Recommended): Opens only on touch events
  - **Always**: Opens on any input event (mouse, touch, keyboard)

- **Polling Interval**: How often to check for text field focus (100-1000ms)
  - Default: 300ms
  - Lower = more responsive but higher CPU usage

- **Clutter.Text Detection**: Enable direct detection of native GNOME text widgets
  - Recommended: Enabled

- **Debug Mode**: Enable logging to system journal
  - View logs: `journalctl -f -o cat /usr/bin/gnome-shell`

## 🐛 Debugging

Enable debug mode in preferences, then watch the logs:

```bash
journalctl -f -o cat /usr/bin/gnome-shell | grep "OSK Auto Open"
```

## 📊 How It Works

### Architecture

```
┌─────────────────────────────────────────┐
│  Global Stage Event Listener            │
│  (Detects touch vs mouse events)        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Focus Polling (every 300ms)            │
│  Checks Main.inputMethod.currentFocus   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Decision Logic                         │
│  - Has focus?                            │
│  - Was last input touch?                │
│  - User preference mode?                │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Control Native OSK                     │
│  - Main.keyboard.open()                 │
│  - Main.keyboard.close()                │
│  - Raise keyboard to top layer          │
└─────────────────────────────────────────┘
```

### Implementation Details

The extension controls the keyboard using:
- `Main.keyboard.open()` - Opens the keyboard
- `Main.keyboard.close()` - Closes the keyboard
- `Main.layoutManager.uiGroup.set_child_above_sibling()` - Ensures keyboard stays on top

The keyboard is automatically raised to the top whenever:
- It is opened
- Any touch/button press event is received while keyboard is visible

This ensures the keyboard is never hidden behind other windows, especially important for fullscreen applications.

## 🤝 Credits

Detection logic inspired by [gjs-osk](https://github.com/Vishram1123/gjs-osk) by [@Vishram1123](https://github.com/Vishram1123)

## 📝 License

GPL-3.0 (same as GNOME Shell)

## 🐞 Issues & Contributions

Report issues or contribute at: https://github.com/AlexisLaurier/gnome-osk-automatic-open-for-wayland

## 📚 Technical Documentation

For detailed analysis of the detection logic, see [DETECTION_ANALYSIS.md](DETECTION_ANALYSIS.md).
