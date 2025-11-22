# Analyse de la détection automatique du clavier (gjs-osk)

## Vue d'ensemble

Cette extension s'inspire du projet [gjs-osk](https://github.com/Vishram1123/gjs-osk) pour détecter automatiquement quand afficher le clavier virtuel OSK natif de GNOME, particulièrement pour les applications qui n'utilisent pas le toolkit GTK natif.

## Méthodes de détection identifiées

### 1. Polling de Main.inputMethod.currentFocus

**Principe**: Surveillance continue (toutes les 300ms) du focus sur les champs de saisie

```javascript
this.openInterval = setInterval(() => {
    if (Main.inputMethod.currentFocus != null &&
        Main.inputMethod.currentFocus.is_focused()) {
        // Afficher le clavier
    } else {
        // Masquer le clavier
    }
}, 300);
```

**Avantages**:
- Détecte les changements de focus dans toutes les applications
- Fonctionne avec les applications non-GTK (Electron, Qt, etc.)
- Méthode fiable et éprouvée

**Inconvénients**:
- Consommation CPU légère (vérification toutes les 300ms)

### 2. Détection des événements tactiles

**Principe**: Différenciation entre interactions souris et tactiles

```javascript
global.stage.connect("event", (_actor, event) => {
    if (event.type() !== 4 && event.type() !== 5) {  // Ignorer mouvement souris
        this.lastInputMethod = [
            false,                              // Mode: Jamais
            event.type() >= 9 && event.type() <= 12,  // Mode: Tactile uniquement
            true                                // Mode: Toujours
        ][this.settings.get_int("enable-tap-gesture")]
    }
})
```

**Types d'événements Clutter**:
- `4-5`: Événements de mouvement de souris
- `9-12`: Événements tactiles (touch)
- Autres: Clics, touches clavier, etc.

**Avantages**:
- N'affiche le clavier que lors d'interactions tactiles (configurable)
- Évite l'ouverture intempestive avec la souris
- Trois modes: Jamais / Tactile uniquement / Toujours

### 3. Détection directe des acteurs Clutter.Text

**Principe**: Interception des événements système pour détecter les champs texte

```javascript
Main.keyboard.maybeHandleEvent = (e) => {
    let ac = global.stage.get_event_actor(e)
    if (ac instanceof Clutter.Text && lastInputMethod && !this.opened) {
        this.open();
    }
}
```

**Avantages**:
- Détection immédiate (sans attendre le polling)
- Fonctionne avec tous les widgets texte Clutter
- Complète la méthode de polling

**Limitations**:
- Nécessite que l'application utilise Clutter.Text
- Certaines applications (WebKit, Electron) peuvent utiliser leurs propres widgets

## Adaptation pour OSK natif GNOME

### Différences clés

| Aspect | gjs-osk | Notre extension |
|--------|---------|-----------------|
| Widget clavier | Custom (propre implémentation) | OSK natif GNOME |
| Contrôle | API JavaScript directe | GSettings (org.gnome.desktop.a11y.applications) |
| État | Variable interne `Keyboard.state` | Propriété GSettings `screen-keyboard-enabled` |

### Méthode de contrôle

Au lieu d'ouvrir/fermer un widget personnalisé, nous basculons le paramètre système :

```javascript
const A11Y_SCHEMA = 'org.gnome.desktop.a11y.applications';
const A11Y_KEYBOARD_KEY = 'screen-keyboard-enabled';

let a11ySettings = new Gio.Settings({ schema: A11Y_SCHEMA });

// Afficher le clavier
a11ySettings.set_boolean(A11Y_KEYBOARD_KEY, true);

// Masquer le clavier
a11ySettings.set_boolean(A11Y_KEYBOARD_KEY, false);
```

### Logique combinée retenue

1. **Polling de currentFocus** (principale)
   - Détection fiable pour toutes les applications
   - Intervalle de 300ms (équilibre performance/réactivité)

2. **Filtrage par type d'événement** (secondaire)
   - Mode "Tactile uniquement" par défaut
   - Configurable via les préférences

3. **Détection Clutter.Text** (optionnelle)
   - Pour une réactivité immédiate sur les applications natives
   - Complément du polling

## Applications cibles

Cette extension est particulièrement utile pour :
- **Applications Electron** (VSCode, Slack, Discord, etc.)
- **Applications Qt** (non-GTK)
- **Navigateurs web** (Firefox, Chromium) avec champs de formulaire
- **Applications flatpak** avec sandbox

## Références

- [gjs-osk Repository](https://github.com/Vishram1123/gjs-osk)
- [GNOME Shell InputMethod API](https://gjs-docs.gnome.org/shell0.1~45/shell.keyboard)
- [Clutter Event Types](https://gjs-docs.gnome.org/clutter13~13/clutter.eventtype)
