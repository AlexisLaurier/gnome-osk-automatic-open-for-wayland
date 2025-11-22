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
const EventType = {
    MOTION: 4,           // Mouse motion
    ENTER: 5,            // Mouse enter
    TOUCH_BEGIN: 9,      // Touch start
    TOUCH_UPDATE: 10,    // Touch move
    TOUCH_END: 11,       // Touch end
    TOUCH_CANCEL: 12     // Touch cancel
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
    }

    enable() {
        console.log('[OSK Auto Open] Enabling extension');

        // Load extension settings
        this._settings = this.getSettings();

        // Load accessibility settings to control OSK
        this._a11ySettings = new Gio.Settings({schema: A11Y_SCHEMA});

        // Connect to stage events to detect touch vs mouse input
        this._connectStageEvents();

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

            // Ignore mouse motion and enter events (types 4-5)
            if (eventType === EventType.MOTION || eventType === EventType.ENTER) {
                return Clutter.EVENT_PROPAGATE;
            }

            // Determine if this is a touch event (types 9-12)
            const isTouchEvent = eventType >= EventType.TOUCH_BEGIN &&
                               eventType <= EventType.TOUCH_CANCEL;

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
                    this._lastInputWasTouch = true;
                    break;
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

            // Update keyboard state if needed
            if (shouldShowKeyboard && !this._currentFocusState) {
                this._showKeyboard();
            } else if (!hasFocus && this._currentFocusState && !this._keyboardManuallyToggled) {
                this._hideKeyboard();
            }

            this._currentFocusState = hasFocus;

        } catch (error) {
            // Silently handle errors (can happen during shell transitions)
            if (this._settings.get_boolean('debug-mode')) {
                console.error('[OSK Auto Open] Focus check error:', error);
            }
        }
    }

    /**
     * Show the on-screen keyboard
     */
    _showKeyboard() {
        if (!this._a11ySettings.get_boolean(A11Y_KEYBOARD_KEY)) {
            this._a11ySettings.set_boolean(A11Y_KEYBOARD_KEY, true);

            if (this._settings.get_boolean('debug-mode')) {
                console.log('[OSK Auto Open] Keyboard opened');
            }
        }
    }

    /**
     * Hide the on-screen keyboard
     */
    _hideKeyboard() {
        if (this._a11ySettings.get_boolean(A11Y_KEYBOARD_KEY)) {
            this._a11ySettings.set_boolean(A11Y_KEYBOARD_KEY, false);

            if (this._settings.get_boolean('debug-mode')) {
                console.log('[OSK Auto Open] Keyboard closed');
            }
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
