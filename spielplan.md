# Pfahlvolleyballturnier 2026 – Spielplan

## Eckdaten

- **Spielzeit pro Match:** 10 Minuten
- **Wechsel-/Pausenzeit:** 2 Minuten
- **Slot-Länge:** 12 Minuten
- **Turnierstart:** 12:00 Uhr
- **Letzter Spielstart:** 16:24 Uhr
- **Turnierende:** ca. 16:34 Uhr
- **3 Spielfelder:** Feld 1, Feld 2, Feld 3

## Felder & Netzhöhe

| Feld | Belegung | Netzhöhe |
|------|----------|----------|
| Feld 1 | Erwachsene Ambitioniert (fix) | Erwachsene (durchgehend) |
| Feld 2 | Erwachsene Plausch (überwiegend) + Jugend-Blöcke | Erwachsene, mit Wechseln auf Jugend |
| Feld 3 | Jugendliche (fix) | Jugend (durchgehend) |

### Netzhöhen-Wechsel Feld 2

Vor folgenden Slots muss das Netz auf Feld 2 umgestellt werden:

| Block | Zeit | Netzhöhe |
|-------|------|----------|
| Plausch | 12:00–12:48 | Erwachsene |
| Jugend (3 Spiele) | 13:00–13:24 | Jugend |
| Plausch | 13:36–14:48 | Erwachsene |
| Jugend (4 Spiele) | 15:00–15:36 | Jugend |
| Plausch (inkl. Halbfinals, Spiel um Platz 3, Finale) | 15:48–16:24 | Erwachsene |

Das ergibt genau **4 Netzhöhen-Wechsel** auf Feld 2:

1. Vor 13:00 – Erwachsene → Jugend
2. Vor 13:36 – Jugend → Erwachsene
3. Vor 15:00 – Erwachsene → Jugend
4. Vor 15:48 – Jugend → Erwachsene

## Kategorien & Modus

### Erwachsene Ambitioniert – Feld 1 (6 Teams: A1–A6)

- Vorrunde: Round-Robin (15 Spiele)
- Zwischenrunde Q1 (Rang 3 vs 6), Q2 (Rang 4 vs 5), Top (Rang 1 vs 2)
- Quali 1: Sieger Top vs Sieger Q2
- Quali 2: Verlierer Top vs Sieger Q1
- Spiel um Platz 5: Verlierer Q1 vs Verlierer Q2
- Spiel um Platz 3: Verlierer Quali 1 vs Verlierer Quali 2
- Finale: Sieger Quali 1 vs Sieger Quali 2 (Start 16:24 auf Feld 1)
- **Total: 23 Spiele**

### Erwachsene Plausch – Feld 2 (4 Teams: P1–P4)

- Vorrunde: Doppel-Round-Robin (12 Spiele)
- Halbfinal 1 (Rang 1 vs Rang 4), Halbfinal 2 (Rang 2 vs Rang 3)
- Spiel um Platz 3 (16:12 auf Feld 2)
- Finale (Start 16:24 auf Feld 2)
- **Total: 16 Spiele**

### Jugendliche – Feld 2/3 (8 Teams: J1–J8)

- Vorrunde: Volles Round-Robin (28 Spiele, 21 auf Feld 3 und 7 auf Feld 2)
- Spiel um Platz 3: 16:12 auf Feld 3
- Finale: 16:24 auf Feld 3
- **Total: 30 Spiele**

## Quelle der Wahrheit

Der vollständige, ausführbare Spielplan ist als zentrale Datenstruktur in
[`tournament-schedule.js`](./tournament-schedule.js) hinterlegt
(`TOURNAMENT_SCHEDULE`). Alle Views (Spielplan, Dashboard,
Turnierorganisation, Schlussrangliste) leiten ihre Anzeige direkt daraus ab.

## Wertung

- Sieg = 2 Punkte, Unentschieden = 1, Niederlage = 0
- Tiebreaker: 1) Punkte 2) Tordifferenz 3) erzielte Punkte 4) Spielcode (deterministisch / Los)
