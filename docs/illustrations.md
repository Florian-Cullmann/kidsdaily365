# Illustrationen für die Kinderansicht

Erstellt mit dem eingebauten Imagegen-Tool (Imagegen-Skill), nicht mit einem externen CLI-Anbieter. Die Bildreferenz des Nutzers dient als visuelle Richtung; die Assets wurden neu generiert. Kein UI-Text ist in die Bilder eingebrannt.

| Datei | Verwendung |
| --- | --- |
| `public/illustrations/woodland.webp` | Waldkulisse für Profile und Tagesplan |
| `public/illustrations/buddy-fox.webp` | Fuchs, z. B. Fino |
| `public/illustrations/buddy-rabbit.webp` | Hase, z. B. Lumi |
| `public/illustrations/buddy-bear.webp` | Bären-Buddy |

Die Generierung lieferte PNGs. Für die lokale Auslieferung wurden sie proportional auf maximal 640 Pixel für Buddys bzw. 1920 Pixel für den Hintergrund verkleinert und in WebP konvertiert (Qualität 88, Alpha-Qualität 100, keine Hochskalierung). Die Buddys behalten echte Transparenz. Alle vier ausgelieferten Assets sind zusammen ungefähr 411 KB groß. Die Originale bleiben im lokalen Imagegen-Ausgabeverzeichnis; die App referenziert ausschließlich die versionierten Projektdateien.

## Prompt: Waldkulisse

```text
Use case: illustration-story. Asset type: background illustration for a children's daily routine touchscreen web app, landscape 16:9, no user interface. Create a beautiful original cozy woodland clearing in soft polished 3D children's storybook style. A warm sandy path curves into a green forest, rounded leafy trees, blue morning sky and fluffy clouds. A small charming wooden treehouse tucked into the far upper right. Foreground foliage at the far left and right edges, tiny flowers. Broad softly lit empty space in the central and lower image where opaque white interface cards will be overlaid. Keep visual detail concentrated at the edges and top, softly defocused center. Pastel sage greens, honey sunshine, warm peach and powder blue; cheerful but calm and uncluttered. No animals, characters, symbols, lettering, logos, stars, text, UI, monitor, borders, or watermark. This is only the full-bleed background environment asset.
```

## Prompts: Buddys

Für jeden der drei Buddys wurde dieser Prompt separat mit dem unten angegebenen Subjekt ausgeführt, jeweils mit `transparent_background: true`:

```text
Use case: stylized-concept. Asset type: transparent buddy character illustration for a children's daily routine touchscreen app. Create {subject}. Soft polished 3D animated storybook style, beautifully sculpted plush fur, round cuddly proportions, kind cheerful face with a small closed-mouth smile, sitting upright with one front paw gently raised in a welcoming wave, facing the viewer with a slight three-quarter turn. Full body, centered, feet and ears fully visible, generous transparent margin. Soft warm daylight. Colorful and charming, calm and friendly. The character is alone on a genuinely transparent background. No floor, no props, no scenery, no ground plane, no text, no badges, no clothes, no UI, no watermark.
```

- Fuchs: `a friendly small orange fox with cream muzzle, cream chest, big fluffy white-tipped tail and large warm brown eyes`
- Hase: `a friendly small cream-white rabbit with soft blush-pink inner ears, plump cheeks and large warm brown eyes`
- Bär: `a friendly small honey-brown bear cub with rounded ears, cream muzzle and large warm brown eyes`
