# Percent-Circle
Eine benutzerdefinierte Lovelace-Card für Home Assistant, die einen **runden Fortschritts-Ring (0–100 %)** darstellt.

## ✨ Features

- Prozentwert aus:
  - `percent_entity` (z. B. Sensor mit 0–100)
  - `percent_template` (Jinja-Template, Admin-User erforderlich)
  - `entity` (Fallback)
- Dynamische **Ringfarben** mit `thresholds`
- Optionales **Bild mittig im Kreis**
  - statisch (`image`)
  - aus Entity (`image_entity`)
  - aus Template (`image_template`)
- Transparenter Hintergrund & `no_card`-Modus für `picture-elements`
- Animierte Übergänge für Ring & Farbe

---

## 🚀 Installation

### Via HACS (Custom Repository)

1. Öffne **HACS → Frontend → Benutzerdefinierte Repositories**.
2. Füge das Repository hinzu:  
   **URL**: `(https://github.com/kubakuhn/Percent-Circle/)`  
   **Typ**: `Lovelace`
3. Installiere die Card.
4. Prüfe die Ressource in den Einstellungen, sie sollte eingetragen sein als:
   ```yaml
   url: /hacsfiles/percent-circle/percent-circle.js
   type: module

### Manuelle Installation

Kopiere percent-circle.js nach:
/config/www/percent-circle.js

Ergänze in den Ressourcendefinitionen:

url: /local/percent-circle.js?v=1
type: module


Lade das Frontend neu (Cache leeren, Strg+F5 oder in der App → Profil → Cache leeren).

### ⚙️ Optionen

| Name            | Typ     | Pflicht | Standard  | Beschreibung |
| --------------- | ------- | ------- | --------- | ------------ |
| percent_entity  | string  | nein    | –         | Entity, die einen Wert 0–100 liefert |
| percent_template| string  | nein    | –         | Jinja-Template, das 0–100 liefert (Admin-User nötig) |
| entity          | string  | nein    | –         | Fallback-Entity für Prozent |
| image           | string  | nein    | –         | Statische Bild-URL |
| image_entity    | string  | nein    | –         | Entity, deren State eine Bild-URL ist |
| image_template  | string  | nein    | –         | Template für Bild-URL |
| size            | number  | nein    | 120       | Größe des Kreises in px (Designgröße bei `fit: container`) |
| stroke          | number  | nein    | 10        | Linienbreite des Rings |
| image_scale     | number  | nein    | 0.8       | 0–1, Verhältnis des Bilddurchmessers |
| color           | string  | nein    | #000      | Textfarbe |
| ring_color      | string  | nein    | #03a9f4   | Ringfarbe (Fallback, wenn keine thresholds) |
| track_color     | string  | nein    | #e0e0e0   | Hintergrundringfarbe |
| thresholds      | list    | nein    | –         | Schwellenwerte für Ringfarbe (siehe Beispiele) |
| no_card         | bool    | nein    | false     | Rendert ohne `<ha-card>` (ideal für picture-elements) |
| fit             | string  | nein    | –         | `"container"` → SVG füllt den Container (`style: width/height` in % steuerbar) |


### 📚 Beispiele
1) Einfach: Prozent aus Entity
```yaml
type: custom:percent-circle
percent_entity: sensor.battery_level
size: 180
stroke: 14
ring_color: "#03a9f4"
track_color: "#e0e0e0"
```
2) Mit Schwellenwerten (z. B. Batterie)
```yaml
type: custom:percent-circle
percent_entity: sensor.battery_level
size: 160
stroke: 12
thresholds:
  - value: 20
    color: "#f44336"
  - value: 50
    color: "#ff9800"
  - value: 80
    color: "#ffc107"
  - value: 100
    color: "#4caf50"
```
3) Mit Bild aus Entity
```yaml
type: custom:percent-circle
percent_entity: sensor.cpu_usage
image_entity: sensor.user_avatar_url
size: 200
stroke: 16
image_scale: 0.9
```
4) Bild & Prozentwert per Template
⚠️ erfordert Admin-Benutzer im Frontend.
```yaml
type: custom:percent-circle
percent_template: >-
  {% set v = states('sensor.battery_level') | float(0) %}
  {{ [0, [v, 100] | min] | max }}
image_template: >-
  {% if is_state('binary_sensor.charge','off') %}
    /local/pics/charge.png
  {% else %}
    /local/pics/discharge.png
  {% endif %}
size: 150
stroke: 12
```
5) Overlay in picture-elements
```yaml
type: picture-elements
image: /local/Background.png
elements:
  - type: custom:percent_circle
    no_card: true
    percent_entity: sensor.battery_level
    image: /local/pics/battery.png
    size: 50
    stroke: 5
    image_scale: 0.8
    track_color: transparent
    color: transparent
    thresholds:
      - value: 20
        color: "#f44336"
      - value: 100
        color: "#4caf50"
    style:
      left: 50%
      top: 50%
      transform: translate(-50%, -50%)
```
ℹ️ Hinweise

Caching: Wenn du die JS-Datei updatest, erhöhe ?v= an der Ressource, um Cache-Probleme zu vermeiden.

Templates: Für percent_template & image_template brauchst du Adminrechte. Für zuverlässige Nutzung → besser einen Template-Sensor im Backend anlegen und als percent_entity/image_entity verwenden.

Bilder: /local/... verweist auf /config/www/....

💡 Tipps
```yaml
color: transparent blendet die Prozentzahl aus.

track_color: transparent blendet den Hintergrundring aus.
```
Für perfekte Zentrierung in picture-elements:
```yaml
style:
  left: 50%
  top: 50%
  transform: translate(-50%, -50%)
