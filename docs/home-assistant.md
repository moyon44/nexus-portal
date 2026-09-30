# Home Assistant

Once the [integration](integrations.md#home-assistant) has its token, Home
Assistant shows up in four places: a **sensors page**, the **tile**, the
**status bar** and **widgets** with controls.

## Sensors page

*Système → Home Assistant* (or « Home Assistant » in Ctrl K) lists every
entity, **grouped by room** (Home Assistant's areas), with its current value
in French units and when it last changed. Refreshed every 30 s.

- **Search** by room, name or entity id (« salon », « température »,
  « voiture »…).
- **Filter**: *Capteurs* (sensors, and weather entities), *États* (binary
  sensors: doors, motion, openings…), *Tout* (type something to also see
  lights, covers, climate…).
- *Masquer les indisponibles* hides entities that are `unavailable` /
  `unknown` (on by default).
- Each row has two buttons:
  - 📌 **pin to the tile** — the tile shows the first three pinned values, the
    others in its details;
  - ▭ **status bar** — see below (4 at most).

## The tile

Without pins: who's home (« 🏠 Alex, Sam ») and how many sensors answer. With
pins: « 21 °C · 58 % · 80 % », full names in the details.

## Status bar

Up to four entities replace the city weather in the status bar, in the order
you picked them (▭ on the sensors page; the *Barre de statut* panel on top of
that page shows and removes them):

- a **weather entity** (`weather.*`) becomes the outside: condition icon,
  temperature and « dehors » (humidity and condition on hover);
- the others follow a 🏠: « 🏠 22° · 60 % ».

Remove them all to get the city weather back. The *Météo* switch in
*Administration* hides this spot either way.

## Widgets

The *Maison* page (sidebar, or « Maison » in Ctrl K) holds your widgets; those
marked for the home page also show in a *Maison* section there (fold it with
its arrow; « Tout voir » opens the page). Everything refreshes every 30 s.

| Type | Shows | Holds |
| --- | --- | --- |
| **Valeur** | One big value and its **last 24 hours** as a curve (hover for the value at a given time; min – max below) | 1 numeric sensor |
| **Pièce** | Several sensors of a room on two columns, labelled by what they measure (*Température*, *Humidité*, *CO₂*…) | up to 16 sensors |
| **États** | Percentages as gauges (green / amber / red: a low battery, a full disk…); everything else as a coloured dot with « depuis 12 min » | sensors, binary sensors, persons, locks, covers |
| **Contrôles** | Buttons, see below | lights, switches, fans, input booleans, scripts, scenes, buttons, covers, locks, vacuums |

**Creating one**: *Nouveau widget* → pick the type → pick entities from the
list (only those that fit the type, with their value; search by room or name).
*Pièce* has *Remplir depuis une pièce*: choose a room and its temperature,
humidity, CO₂, particles, light, pressure and power sensors are added. Then a
title, a size (*Normal* or *Large*, two columns) and *Afficher aussi sur
l'accueil*.

**Arranging**: *Modifier* adds a strip on each widget: move left / right, show
on the home page or not (🏠), edit, delete (asks twice).

**Starter set**: on an empty *Maison* page, *Widgets de départ* builds a first
set from your house: a room's temperature with its curve, your best-equipped
rooms, presences and doors (plus a car battery and a disk if found), lights
and scripts. Edit or delete what you don't want.

## Controls

| Entity | Buttons |
| --- | --- |
| Light, switch, fan, input boolean | *Allumé* / *Éteint* toggle |
| Light with brightness / colour | also a round **swatch** (its current colour, glowing when on) that opens its panel |
| Script, scene, button | ▶ run |
| Cover | ▲ open · ■ stop · ▼ close, and how open it is |
| Lock | lock / unlock |
| Vacuum | ▶ start · *Base* |

**Light panel** — only what the light supports:

- *Luminosité*, 1–100 %;
- *Couleur*: eight swatches and a picker for any colour;
- *Blanc*: warm to cool, in kelvins, the track showing the actual whites.

Sliders send when you let go, so the light isn't flooded with commands.

**Safety**

- The portal only acts on entities **placed in a Contrôles widget**; any other
  command is refused by the backend.
- Locks, and entities whose id contains `portail` (gate), `garage`, `chauffe`
  (water heater), `alarm` or `alarme` ask for a second click
  (« Confirmer ? »). Change the list in `lib/ha.ts` (`sensitive`).
- Commands go through Home Assistant's own services (`light.turn_on`,
  `cover.open_cover`…), so its automations and logbook see them as usual.
