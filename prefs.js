/**
 * Preferences UI for GNOME OSK Automatic Open Extension
 */

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class OSKAutoOpenPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        // Create preferences page
        const page = new Adw.PreferencesPage({
            title: 'General',
            icon_name: 'input-keyboard-symbolic',
        });

        // Detection mode group
        const detectionGroup = new Adw.PreferencesGroup({
            title: 'Detection Mode',
            description: 'Configure when the on-screen keyboard should automatically appear',
        });

        // Detection mode dropdown
        const detectionModeRow = new Adw.ComboRow({
            title: 'Automatic Opening',
            subtitle: 'Choose when to automatically display the keyboard',
            model: new Gtk.StringList({
                strings: [
                    'Never (Disabled)',
                    'Touch Events Only (Recommended)',
                    'Always (Any Input)',
                ],
            }),
        });

        detectionModeRow.set_selected(settings.get_int('detection-mode'));
        detectionModeRow.connect('notify::selected', (widget) => {
            settings.set_int('detection-mode', widget.selected);
        });

        detectionGroup.add(detectionModeRow);

        // Advanced settings group
        const advancedGroup = new Adw.PreferencesGroup({
            title: 'Advanced Settings',
            description: 'Fine-tune detection behavior',
        });

        // Poll interval adjustment
        const pollIntervalRow = new Adw.ActionRow({
            title: 'Polling Interval',
            subtitle: 'How often to check for text field focus (milliseconds)',
        });

        const pollIntervalSpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 100,
                upper: 1000,
                step_increment: 50,
            }),
            value: settings.get_int('poll-interval'),
            valign: Gtk.Align.CENTER,
        });

        pollIntervalSpinButton.connect('value-changed', (widget) => {
            settings.set_int('poll-interval', widget.get_value());
        });

        pollIntervalRow.add_suffix(pollIntervalSpinButton);
        pollIntervalRow.activatable_widget = pollIntervalSpinButton;
        advancedGroup.add(pollIntervalRow);

        // Clutter detection toggle
        const clutterDetectionRow = new Adw.ActionRow({
            title: 'Enable Clutter.Text Detection',
            subtitle: 'Faster response for native GNOME applications',
        });

        const clutterDetectionSwitch = new Gtk.Switch({
            active: settings.get_boolean('enable-clutter-detection'),
            valign: Gtk.Align.CENTER,
        });

        settings.bind(
            'enable-clutter-detection',
            clutterDetectionSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        clutterDetectionRow.add_suffix(clutterDetectionSwitch);
        clutterDetectionRow.activatable_widget = clutterDetectionSwitch;
        advancedGroup.add(clutterDetectionRow);

        // Close delay adjustment
        const closeDelayRow = new Adw.ActionRow({
            title: 'Close Delay',
            subtitle: 'Delay before closing keyboard when focus lost (milliseconds)',
        });

        const closeDelaySpinButton = new Gtk.SpinButton({
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 2000,
                step_increment: 100,
            }),
            value: settings.get_int('close-delay-ms'),
            valign: Gtk.Align.CENTER,
        });

        closeDelaySpinButton.connect('value-changed', (widget) => {
            settings.set_int('close-delay-ms', widget.get_value());
        });

        closeDelayRow.add_suffix(closeDelaySpinButton);
        closeDelayRow.activatable_widget = closeDelaySpinButton;
        advancedGroup.add(closeDelayRow);

        // Debug mode toggle
        const debugModeRow = new Adw.ActionRow({
            title: 'Debug Mode',
            subtitle: 'Enable logging to system journal (journalctl -f)',
        });

        const debugModeSwitch = new Gtk.Switch({
            active: settings.get_boolean('debug-mode'),
            valign: Gtk.Align.CENTER,
        });

        settings.bind(
            'debug-mode',
            debugModeSwitch,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        debugModeRow.add_suffix(debugModeSwitch);
        debugModeRow.activatable_widget = debugModeSwitch;
        advancedGroup.add(debugModeRow);

        // Information group
        const infoGroup = new Adw.PreferencesGroup({
            title: 'About',
        });

        const aboutRow = new Adw.ActionRow({
            title: 'Detection Logic',
            subtitle: 'Based on gjs-osk by Vishram1123',
        });

        infoGroup.add(aboutRow);

        const targetAppsRow = new Adw.ActionRow({
            title: 'Target Applications',
            subtitle: 'Electron apps (VSCode, Slack), Qt apps, web browsers',
        });

        infoGroup.add(targetAppsRow);

        // Add all groups to page
        page.add(detectionGroup);
        page.add(advancedGroup);
        page.add(infoGroup);

        // Add page to window
        window.add(page);
    }
}
