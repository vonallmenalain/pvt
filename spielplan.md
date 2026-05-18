# Pfahlvolleyballturnier 2026 – Spielplan

## Eckdaten

- **Spielzeit pro Match:** 13 Minuten
- **Wechsel-/Pausenzeit:** 2 Minuten
- **Slot-Länge:** 15 Minuten
- **Turnierstart:** 11:30 Uhr
- **Letzter Spielstart:** 17:00 Uhr
- **3 Spielfelder:** Feld 1, Feld 2, Feld 3

## Felder & Netzhöhe

| Feld | Belegung | Netzhöhe |
|------|----------|----------|
| Feld 1 | Erwachsene Ambitioniert (fix) | Erwachsene (durchgehend) |
| Feld 2 | Erwachsene Plausch (überwiegend) + Jugend-Blöcke | Erwachsene, mit Wechseln auf Jugend |
| Feld 3 | Jugendliche (fix) | Jugend (durchgehend) |

### Netzhöhen-Wechsel Feld 2

Vor folgenden Slots muss das Netz auf Feld 2 umgestellt werden:

| Wechsel | Block | Netzhöhe |
|---------|-------|----------|
| Start 11:30 | 11:30–12:30 (Plausch-Block) | Erwachsene |
| Vor 12:45 | 12:45–13:15 (3 Jugendspiele) | Jugend |
| Vor 13:30 | 13:30–14:30 (Plausch-Block) | Erwachsene |
| Vor 14:45 | 14:45–15:45 (5 Jugendspiele) | Jugend |
| Vor 16:00 | 16:00–17:00 (Plausch-Block inkl. Halbfinals & Finale) | Erwachsene |

## Kategorien & Modus

### Erwachsene Ambitioniert – Feld 1 (6 Teams: A1–A6)

- Vorrunde: Round-Robin (15 Spiele)
- Zwischenrunde: Q1 (Rang 3 vs 6), Q2 (Rang 4 vs 5)
- Halbfinals: HF1 (Rang 1 vs Sieger Q2), HF2 (Rang 2 vs Sieger Q1)
- Spiel um Platz 5: Verlierer Q1 vs Verlierer Q2
- Spiel um Platz 3: Verlierer HF1 vs Verlierer HF2
- Finale: Sieger HF1 vs Sieger HF2

### Erwachsene Plausch – Feld 2 (4 Teams: P1–P4)

- Vorrunde: Doppel-Round-Robin (12 Spiele)
- Halbfinals: HF1 (Rang 1 vs Rang 4), HF2 (Rang 2 vs Rang 3)
- Spiel um Platz 3 (17:00 auf **Feld 1**, parallel zum Plausch-Finale)
- Finale (17:00 auf Feld 2)

### Jugendliche – Feld 2/3 (8 Teams: J1–J8)

- Vorrunde: Volles Round-Robin (28 Spiele, 20 auf Feld 3 und 8 auf Feld 2)
- Spiel um Platz 3: 16:30 auf Feld 3
- Finale: 16:45 auf Feld 3
- Kein Jugend-Spielstart nach 16:45; Feld 3 ab 17:00 frei für Siegerehrung / Abbau

## Quelle der Wahrheit

Der vollständige, ausführbare Spielplan ist als zentrale Datenstruktur in
[`tournament-schedule.js`](./tournament-schedule.js) hinterlegt
(`TOURNAMENT_SCHEDULE`). Alle Views (Spielplan, Dashboard,
Turnierorganisation, Schlussrangliste) leiten ihre Anzeige direkt daraus ab.

## Wertung

- Sieg = 2 Punkte, Unentschieden = 1, Niederlage = 0
- Tiebreaker: 1) Punkte 2) Tordifferenz 3) erzielte Punkte 4) Spielcode (deterministisch / Los)
