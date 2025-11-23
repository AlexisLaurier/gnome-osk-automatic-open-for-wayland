# Analyse de la détection automatique du clavier

## Vue d'ensemble

Cette extension s'inspire du projet [gjs-osk](https://github.com/Vishram1123/gjs-osk) pour détecter automatiquement quand afficher le clavier virtuel OSK natif de GNOME, particulièrement pour les applications qui n'utilisent pas le toolkit GTK natif.

## Méthodes de détection implémentées

### 1. Polling de Main.inputMethod.currentFocus

**Principe**: Surveillance continue (toutes les 300ms par défaut) du focus sur les champs de saisie

```javascript
_checkInputFocus() {
    const hasFocus = Main.inputMethod.currentFocus !== null &&
                   Main.inputMethod.currentFocus.is_focused();

    const shouldShowKeyboard = hasFocus &&
                             this._lastInputWasTouch &&
                             !this._keyboardManuallyToggled;

    if (shouldShowKeyboard && !this._currentFocusState) {
        this._showKeyboard();
    } else if (!hasFocus && this._currentFocusState && !this._keyboardManuallyToggled) {
        this._hideKeyboard();
    }
}
```

**Avantages**:
- Détecte les changements de focus dans toutes les applications
- Fonctionne avec les applications non-GTK (Electron, Qt, etc.)
- Méthode fiable et éprouvée

**Configuration**:
- Intervalle configurable de 100 à 1000ms
- Valeur par défaut: 300ms (équilibre performance/réactivité)

### 2. Détection des événements tactiles

**Principe**: Différenciation entre interactions souris et tactiles via les types d'événements Clutter et les types de périphériques

```javascript
// Détection du périphérique tactile
const device = event.get_source_device();
const isTouchscreenDevice = device &&
    device.get_device_type() === Clutter.InputDeviceType.TOUCHSCREEN_DEVICE;

// Détection des événements tactiles
const isTouchEvent =
    // Événements tactiles natifs (9-12)
    (eventType >= EventType.TOUCH_BEGIN && eventType <= EventType.TOUCH_CANCEL) ||
    // Clics provenant d'un périphérique tactile (6-7)
    (isTouchscreenDevice &&
     (eventType === EventType.BUTTON_PRESS || eventType === EventType.BUTTON_RELEASE));
```

**Types d'événements Clutter gérés**:
- `4-5`: Mouvements souris (ignorés)
- `6-7`: BUTTON_PRESS/RELEASE (acceptés si proviennent d'un écran tactile)
- `9-12`: TOUCH_BEGIN/UPDATE/END/CANCEL (événements tactiles natifs)
- `13-18`: Gestes touchpad et événements pad (détectés mais non utilisés pour le clavier)

**Avantages**:
- N'affiche le clavier que lors d'interactions tactiles (en mode "Touch Only")
- Évite l'ouverture intempestive avec la souris
- Trois modes configurables: Jamais / Tactile uniquement / Toujours

### 3. Détection directe des acteurs Clutter.Text

**Principe**: Interception des clics sur les widgets texte natifs pour une réponse immédiate

```javascript
global.stage.connect('button-press-event', (_actor, event) => {
    const targetActor = global.stage.get_event_actor(event);

    if (targetActor instanceof Clutter.Text) {
        if (this._lastInputWasTouch && !this._keyboardManuallyToggled) {
            // Déclenchement immédiat du clavier (sans attendre le polling)
            GLib.timeout_add(GLib.PRIORITY_HIGH, 50, () => {
                this._checkInputFocus();
                return GLib.SOURCE_REMOVE;
            });
        }
    }
});
```

**Avantages**:
- Détection immédiate (sans attendre le cycle de polling)
- Fonctionne avec tous les widgets texte Clutter
- Complète la méthode de polling pour une meilleure réactivité

**Limitations**:
- Nécessite que l'application utilise Clutter.Text
- Certaines applications (WebKit, Electron) utilisent leurs propres widgets

## Contrôle du clavier natif GNOME

### Méthodes utilisées

L'extension contrôle le clavier OSK natif via l'API GNOME Shell:

```javascript
// Activation de l'accessibilité (prérequis)
const A11Y_SCHEMA = 'org.gnome.desktop.a11y.applications';
const A11Y_KEYBOARD_KEY = 'screen-keyboard-enabled';
this._a11ySettings.set_boolean(A11Y_KEYBOARD_KEY, true);

// Ouverture du clavier
Main.keyboard.open(Main.layoutManager.bottomIndex);

// Fermeture du clavier
Main.keyboard.close();

// Maintien du clavier au premier plan
Main.layoutManager.uiGroup.set_child_above_sibling(
    Main.layoutManager.keyboardBox,
    null
);
```

### Différences avec gjs-osk

| Aspect | gjs-osk | Notre extension |
|--------|---------|-----------------|
| Widget clavier | Custom (propre implémentation) | OSK natif GNOME |
| Contrôle | API JavaScript sur widget custom | Main.keyboard.open/close API |
| Positionnement | Gestion manuelle | Géré par GNOME + raise to top |
| État | Variable interne `Keyboard.state` | État GNOME Shell natif |

### Fonctionnalité "Raise to Top"

Le clavier est automatiquement placé au premier plan:

1. **Lors de l'ouverture**: Après 100ms (délai pour le rendu)
2. **À chaque événement tactile**: Tant que le clavier est visible

Cela garantit que le clavier n'est jamais caché derrière d'autres fenêtres, notamment en mode plein écran.

## Logique combinée

### Flux de détection

1. **Événement utilisateur** → Capturé par le gestionnaire d'événements global
2. **Analyse du type d'entrée** → Tactile vs souris/clavier
3. **Polling du focus** → Vérification périodique de `Main.inputMethod.currentFocus`
4. **Décision** → Faut-il ouvrir/fermer le clavier?
5. **Action** → `Main.keyboard.open()` ou `Main.keyboard.close()`
6. **Raise to top** → Placement au premier plan si ouvert

### Modes de détection

- **NEVER (0)**: Désactivé
- **TOUCH_ONLY (1)**: Uniquement sur événements tactiles (recommandé)
- **ALWAYS (2)**: Sur tous les événements d'entrée

## Applications cibles

Cette extension est particulièrement utile pour:
- **Applications Electron** (VSCode, Slack, Discord, etc.)
- **Applications Qt** (non-GTK)
- **Navigateurs web** (Firefox, Chromium) avec champs de formulaire
- **Applications flatpak** avec sandbox

## Références

- [gjs-osk Repository](https://github.com/Vishram1123/gjs-osk)
- [GNOME Shell InputMethod API](https://gjs-docs.gnome.org/shell0.1~45/shell.keyboard)
- [Clutter Event Types](https://gjs-docs.gnome.org/clutter13~13/clutter.eventtype)
- [GNOME Shell Keyboard](https://gitlab.gnome.org/GNOME/gnome-shell/-/blob/main/js/ui/keyboard.js)
