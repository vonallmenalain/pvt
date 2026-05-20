# Pfahlvolleyballturnier 2026 – Spielplan

## Eckdaten

- **Turnierstart:** 12:00 Uhr
- **Letzter Spielstart:** 16:45 Uhr (Finals Plausch & Jugend); Ambitioniert-Finale: 16:30
- **Turnierende:** ca. 16:58 Uhr (plus kurzer Abschluss/Puffer)
- **3 Spielfelder:** Feld 1, Feld 2, Feld 3

### Slot-Logik

Der Turniertag besteht aus zwei Slot-Phasen, alle drei Felder bleiben jeweils synchron:

| Phase | Zeitraum | Spielzeit | Pause/Wechsel | Slot-Länge |
|-------|----------|-----------|---------------|------------|
| Vorrunde / Zwischenrunde | 12:00 – 15:48 | 10 Min | 2 Min | 12 Min |
| Finalrunde | ab 16:00 (16:00 / 16:15 / 16:30 / 16:45) | 13 Min | 2 Min | 15 Min |

Ab 16:00 starten alle drei Felder synchron. Das Ambitioniert-Finale startet um **16:30**; die Finals von Plausch und Jugend um **16:45**.

## Felder & Netzhöhe

| Feld | Belegung | Netzhöhe |
|------|----------|----------|
| Feld 1 | Erwachsene Ambitioniert (fix) | Erwachsene (durchgehend) |
| Feld 2 | Erwachsene Plausch (überwiegend) + Jugend-Blöcke | Erwachsene, mit Wechseln auf Jugend |
| Feld 3 | Jugendliche (fix) | Jugend (durchgehend) |

### Netzhöhen-Wechsel Feld 2

Vor folgenden Blöcken muss das Netz auf Feld 2 umgestellt werden:

| Block | Zeit | Netzhöhe |
|-------|------|----------|
| Plausch 1. Round-Robin | 12:00–13:00 | Erwachsene |
| 1. Juniorenblock (4 Spiele) | 13:12–13:48 | Jugend |
| Plausch 2. Round-Robin | 14:00–15:00 | Erwachsene |
| 2. Juniorenblock (4 Spiele) | 15:12–15:48 | Jugend |
| Plausch-Finalrunde (Halbfinals, Spiel um Platz 3, Finale) | 16:00–16:45 | Erwachsene |

Das ergibt genau **4 Netzhöhen-Wechsel** auf Feld 2:

1. Vor 13:12 – Erwachsene → Jugend
2. Vor 14:00 – Jugend → Erwachsene
3. Vor 15:12 – Erwachsene → Jugend
4. Vor 16:00 – Jugend → Erwachsene

## Kategorien & Modus

### Erwachsene Ambitioniert – Feld 1 (6 Teams: A1–A6)

- Gruppe: Round-Robin (15 Spiele, 12:00–14:48)
- Zwischenrunde 1 (Rang 1 vs 2) – 15:00 auf Feld 1
- Zwischenrunde 2 (Rang 3 vs 6) – 15:12 auf Feld 1
- Zwischenrunde 3 (Rang 4 vs 5) – 15:24 auf Feld 1
- Halbfinal 1: Sieger Zwischenrunde 1 vs Sieger Zwischenrunde 3
- Halbfinal 2: Verlierer Zwischenrunde 1 vs Sieger Zwischenrunde 2
- Spiel um Platz 5: Verlierer Zwischenrunde 2 vs Verlierer Zwischenrunde 3 (16:00, Feld 1)
- Spiel um Platz 3: Verlierer Halbfinal 1 vs Verlierer Halbfinal 2 (16:15, Feld 1)
- Finale: Sieger Halbfinal 1 vs Sieger Halbfinal 2 (16:30, Feld 1)
- **Total: 23 Spiele**

### Erwachsene Plausch – Feld 2 (4 Teams: P1–P4)

- 1. Round-Robin (6 Spiele): 12:00–13:00 auf Feld 2
- 2. Round-Robin (6 Spiele): 14:00–15:00 auf Feld 2
- Halbfinal 1 (Rang 1 vs Rang 4) – 16:00 auf Feld 2
- Halbfinal 2 (Rang 2 vs Rang 3) – 16:15 auf Feld 2
- Spiel um Platz 3 – 16:30 auf Feld 2
- Finale – 16:45 auf Feld 2
- **Total: 16 Spiele**

### Jugendliche – Feld 2/3 (8 Teams: J1–J8)

- Vorrunde: Volles Round-Robin (28 Spiele, 20 auf Feld 3 und 8 auf Feld 2 in zwei Blöcken: 13:12–13:48 und 15:12–15:48)
- Spiel um Platz 7: Rang 7 vs Rang 8 – 16:00 auf Feld 3
- Spiel um Platz 5: Rang 5 vs Rang 6 – 16:15 auf Feld 3
- Spiel um Platz 3: Rang 3 vs Rang 4 – 16:30 auf Feld 3
- Finale: Rang 1 vs Rang 2 – 16:45 auf Feld 3
- **Total: 32 Spiele**

## Quelle der Wahrheit

Der vollständige, ausführbare Spielplan ist als zentrale Datenstruktur in
[`tournament-schedule.js`](./tournament-schedule.js) hinterlegt
(`TOURNAMENT_SCHEDULE`). Alle Views (Spielplan, Dashboard,
Turnierorganisation, Schlussrangliste) leiten ihre Anzeige direkt daraus ab.

## Wertung

- Sieg = 2 Punkte, Unentschieden = 1, Niederlage = 0
- Tiebreaker: 1) Punkte 2) Tordifferenz 3) erzielte Punkte 4) Spielcode (deterministisch / Los)
