/**
 * GNOME OSK Automatic Open Extension
 *
 * Automatically opens the GNOME on-screen keyboard when a text field receives focus,
 * particularly for non-GTK applications that don't trigger the native keyboard.
 *
 * Detection logic inspired by: https://github.com/Vishram1123/gjs-osk
 */

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// Accessibility settings schema for controlling the OSK
const A11Y_SCHEMA = 'org.gnome.desktop.a11y.applications';
const A11Y_KEYBOARD_KEY = 'screen-keyboard-enabled';

// Detection modes
const DetectionMode = {
    NEVER: 0,        // Never auto-open keyboard
    TOUCH_ONLY: 1,   // Only open on touch events
    ALWAYS: 2        // Always open when text field focused
};

// Clutter event types
// Reference: https://gjs-docs.gnome.org/clutter13~13/clutter.eventtype
const EventType = {
    MOTION: 4,              // Mouse motion (pointer movement)
    ENTER: 5,               // Mouse enter (pointer enters actor)
    BUTTON_PRESS: 6,        // Mouse/touchpad button press
    BUTTON_RELEASE: 7,      // Mouse/touchpad button release
    KEY_PRESS: 8,           // Keyboard key press
    TOUCH_BEGIN: 9,         // Touch screen contact start
    TOUCH_UPDATE: 10,       // Touch screen contact move
    TOUCH_END: 11,          // Touch screen contact end
    TOUCH_CANCEL: 12,       // Touch screen contact cancelled
    TOUCHPAD_SWIPE: 13,     // Touchpad swipe gesture
    TOUCHPAD_PINCH: 14,     // Touchpad pinch gesture
    PAD_BUTTON_PRESS: 15,   // Pad button press
    PAD_BUTTON_RELEASE: 16, // Pad button release
    PAD_STRIP: 17,          // Pad strip
    PAD_RING: 18            // Pad ring
};

export default class OSKAutoOpenExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settings = null;
        this._a11ySettings = null;
        this._focusCheckInterval = null;
        this._stageEventConnection = null;
        this._lastInputWasTouch = false;
        this._keyboardManuallyToggled = false;
        this._currentFocusState = false;

        // Direct text actor detection
        this._textActorConnection = null;
    }

    enable() {
        console.log('[OSK Auto Open] Enabling extension');

        // Load extension settings
        this._settings = this.getSettings();

        // Load accessibility settings to control OSK
        this._a11ySettings = new Gio.Settings({schema: A11Y_SCHEMA});

        // Connect to stage events to detect touch vs mouse input
        this._connectStageEvents();

        // Connect direct text actor detection (for immediate response)
        this._connectTextActorDetection();

        // Start polling for text field focus
        this._startFocusMonitoring();

        console.log('[OSK Auto Open] Extension enabled successfully');
    }

    disable() {
        console.log('[OSK Auto Open] Disabling extension');

        // Stop focus monitoring
        this._stopFocusMonitoring();

        // Disconnect stage events
        this._disconnectStageEvents();

        // Disconnect text actor detection
        this._disconnectTextActorDetection();

        // Clean up settings
        if (this._settings) {
            this._settings = null;
        }

        if (this._a11ySettings) {
            this._a11ySettings = null;
        }

        this._lastInputWasTouch = false;
        this._keyboardManuallyToggled = false;
        this._currentFocusState = false;

        console.log('[OSK Auto Open] Extension disabled');
    }

    /**
     * Connect to global stage events to detect input method (touch vs mouse)
     * Based on gjs-osk event detection logic
     */
    _connectStageEvents() {
        if (this._stageEventConnection) {
            return;
        }

        this._stageEventConnection = global.stage.connect('event', (_actor, event) => {
            const eventType = event.type();

            // Ignore mouse motion and enter events (types 4-5) - these don't indicate intent to type
            if (eventType === EventType.MOTION || eventType === EventType.ENTER) {
                return Clutter.EVENT_PROPAGATE;
            }

            // Get the input device to determine if it's a touchscreen
            const device = event.get_source_device();
            const isTouchscreenDevice = device &&
                device.get_device_type() === Clutter.InputDeviceType.TOUCHSCREEN_DEVICE;

            // Determine if this is a touch-related event
            // Include both native touch events (9-12) AND button presses from touchscreen devices
            const isTouchEvent =
                // Native touch events
                (eventType >= EventType.TOUCH_BEGIN && eventType <= EventType.TOUCH_CANCEL) ||
                // Button press/release from touchscreen device
                (isTouchscreenDevice &&
                 (eventType === EventType.BUTTON_PRESS || eventType === EventType.BUTTON_RELEASE));

            // Update last input method based on detection mode
            const detectionMode = this._settings.get_int('detection-mode');

            switch (detectionMode) {
                case DetectionMode.NEVER:
                    this._lastInputWasTouch = false;
                    break;
                case DetectionMode.TOUCH_ONLY:
                    this._lastInputWasTouch = isTouchEvent;
                    break;
                case DetectionMode.ALWAYS:
                    // In ALWAYS mode, accept any interaction (touch, mouse, button)
                    // but still exclude pure motion/enter events
                    this._lastInputWasTouch = true;
                    break;
            }

            // Debug logging
            if (this._settings && this._settings.get_boolean('debug-mode')) {
                if (isTouchEvent || eventType === EventType.BUTTON_PRESS) {
                    const deviceType = device ? device.get_device_type() : 'unknown';
                    const deviceName = device ? device.get_device_name() : 'unknown';
                    console.log(`[OSK Auto Open] Event: type=${eventType}, ` +
                              `device=${deviceName} (type=${deviceType}), ` +
                              `isTouchEvent=${isTouchEvent}, ` +
                              `mode=${detectionMode}, ` +
                              `willTrigger=${this._lastInputWasTouch}`);
                }
            }

            return Clutter.EVENT_PROPAGATE;
        });

        console.log('[OSK Auto Open] Stage event monitoring started');
    }

    /**
     * Disconnect stage event handler
     */
    _disconnectStageEvents() {
        if (this._stageEventConnection) {
            global.stage.disconnect(this._stageEventConnection);
            this._stageEventConnection = null;
            console.log('[OSK Auto Open] Stage event monitoring stopped');
        }
    }

    /**
     * Connect direct detection of Clutter.Text actors
     * This provides immediate keyboard opening when clicking on text fields
     * Based on gjs-osk's maybeHandleEvent override
     */
    _connectTextActorDetection() {
        if (this._textActorConnection) {
            return;
        }

        // Check if Clutter detection is enabled
        if (!this._settings.get_boolean('enable-clutter-detection')) {
            return;
        }

        // Monitor button press events on the stage to detect text actor clicks
        this._textActorConnection = global.stage.connect('button-press-event', (_actor, event) => {
            // Get the actor that received the event
            const targetActor = global.stage.get_event_actor(event);

            // Check if it's a text input actor
            if (targetActor instanceof Clutter.Text) {
                // Check if we should trigger (based on last input method)
                if (this._lastInputWasTouch && !this._keyboardManuallyToggled) {
                    // Force immediate keyboard opening
                    this._lastInputWasTouch = true;
                    this._currentFocusState = false; // Reset to trigger show on next poll

                    if (this._settings.get_boolean('debug-mode')) {
                        console.log(`[OSK Auto Open] Direct text actor click detected: ${targetActor.constructor.name}`);
                    }

                    // Trigger an immediate focus check instead of waiting for polling
                    GLib.timeout_add(GLib.PRIORITY_HIGH, 50, () => {
                        this._checkInputFocus();
                        return GLib.SOURCE_REMOVE;
                    });
                }
            }

            return Clutter.EVENT_PROPAGATE;
        });

        console.log('[OSK Auto Open] Text actor detection started');
    }

    /**
     * Disconnect text actor detection
     */
    _disconnectTextActorDetection() {
        if (this._textActorConnection) {
            global.stage.disconnect(this._textActorConnection);
            this._textActorConnection = null;
            console.log('[OSK Auto Open] Text actor detection stopped');
        }
    }

    /**
     * Start monitoring text field focus
     * Uses polling approach from gjs-osk (every 300ms)
     */
    _startFocusMonitoring() {
        if (this._focusCheckInterval) {
            return;
        }

        const pollInterval = this._settings.get_int('poll-interval');

        this._focusCheckInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, pollInterval, () => {
            this._checkInputFocus();
            return GLib.SOURCE_CONTINUE;
        });

        console.log(`[OSK Auto Open] Focus monitoring started (interval: ${pollInterval}ms)`);
    }

    /**
     * Stop monitoring text field focus
     */
    _stopFocusMonitoring() {
        if (this._focusCheckInterval) {
            GLib.source_remove(this._focusCheckInterval);
            this._focusCheckInterval = null;
            console.log('[OSK Auto Open] Focus monitoring stopped');
        }
    }

    /**
     * Check if a text input field currently has focus
     * Based on gjs-osk polling logic using Main.inputMethod.currentFocus
     */
    _checkInputFocus() {
        try {
            // Check if we have an active input method and focused input
            const hasFocus = Main.inputMethod.currentFocus !== null &&
                           Main.inputMethod.currentFocus.is_focused();

            // Determine if we should show keyboard based on:
            // 1. Text field has focus
            // 2. Last input was touch (or detection mode is ALWAYS)
            // 3. Keyboard wasn't manually closed by user
            const shouldShowKeyboard = hasFocus &&
                                     this._lastInputWasTouch &&
                                     !this._keyboardManuallyToggled;

            // Debug logging for focus state changes
            if (this._settings && this._settings.get_boolean('debug-mode')) {
                if (hasFocus !== this._currentFocusState) {
                    const focusInfo = Main.inputMethod.currentFocus ?
                        Main.inputMethod.currentFocus.constructor.name : 'null';
                    console.log(`[OSK Auto Open] Focus changed: ${this._currentFocusState} → ${hasFocus}, ` +
                              `widget=${focusInfo}, ` +
                              `lastInputTouch=${this._lastInputWasTouch}, ` +
                              `manualToggle=${this._keyboardManuallyToggled}, ` +
                              `shouldShow=${shouldShowKeyboard}`);
                }
            }

            // Update keyboard state if needed
            if (shouldShowKeyboard && !this._currentFocusState) {
                this._showKeyboard();
            }
            // Note: No need to hide keyboard - it closes automatically when focus is lost

            this._currentFocusState = hasFocus;

        } catch (error) {
            // Silently handle errors (can happen during shell transitions)
            if (this._settings && this._settings.get_boolean('debug-mode')) {
                console.error('[OSK Auto Open] Focus check error:', error);
            }
        }
    }

    /**
     * Show the on-screen keyboard by enabling accessibility and triggering cursor location
     */
    _showKeyboard() {
        // First enable the accessibility setting if not already enabled
        if (!this._a11ySettings.get_boolean(A11Y_KEYBOARD_KEY)) {
            this._a11ySettings.set_boolean(A11Y_KEYBOARD_KEY, true);

            if (this._settings && this._settings.get_boolean('debug-mode')) {
                console.log('[OSK Auto Open] Keyboard accessibility enabled');
            }
        }

        // Trigger keyboard by re-notifying the input method about current focus
        // This simulates the natural focus change that GNOME uses to show the keyboard
        if (Main.inputMethod && Main.inputMethod.currentFocus) {
            const focus = Main.inputMethod.currentFocus;

            GLib.timeout_add(GLib.PRIORITY_HIGH, 50, () => {
                try {
                    if (focus && focus.is_focused && focus.is_focused()) {
                        // Try to get cursor position if available
                        let x = 0, y = 0, w = 1, h = 1;

                        // Check various methods that might exist on the focused widget
                        if (typeof focus.get_cursor_rect === 'function') {
                            const rect = focus.get_cursor_rect();
                            x = rect.x; y = rect.y; w = rect.width; h = rect.height;
                        } else if (typeof focus.cursor_position !== 'undefined') {
                            // Some widgets have cursor_position property
                            const pos = focus.cursor_position;
                            if (pos && typeof pos.get_position === 'function') {
                                [x, y] = pos.get_position();
                            }
                        }

                        // Call setCursorLocation to trigger keyboard opening
                        // Even with default coordinates, this signals the input method
                        if (Main.inputMethod.setCursorLocation) {
                            Main.inputMethod.setCursorLocation(focus, x, y, w, h);

                            if (this._settings && this._settings.get_boolean('debug-mode')) {
                                console.log(`[OSK Auto Open] Cursor location signaled: x=${x}, y=${y}, w=${w}, h=${h}`);
                            }
                        }
                    }
                } catch (error) {
                    if (this._settings && this._settings.get_boolean('debug-mode')) {
                        console.error('[OSK Auto Open] Failed to signal cursor location:', error);
                    }
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    /**
     * Mark that user manually toggled keyboard
     * (prevents auto-close until next focus change)
     */
    _setManualToggle(toggled) {
        this._keyboardManuallyToggled = toggled;
    }
}
