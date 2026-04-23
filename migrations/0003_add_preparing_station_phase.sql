PRAGMA foreign_keys = OFF;

CREATE TABLE stations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_name TEXT NOT NULL,
  not_first INTEGER NOT NULL DEFAULT 0 CHECK (not_first IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'preparing', 'occupied', 'done')),
  current_team_id INTEGER,
  FOREIGN KEY (current_team_id) REFERENCES teams(id) ON DELETE SET NULL
);

INSERT INTO stations_new (id, station_name, not_first, status, current_team_id)
SELECT
  id,
  station_name,
  not_first,
  CASE
    WHEN status IN ('free', 'occupied', 'done') THEN status
    ELSE 'free'
  END,
  current_team_id
FROM stations;

DROP TABLE stations;
ALTER TABLE stations_new RENAME TO stations;

CREATE INDEX idx_stations_current_team_id ON stations(current_team_id);

CREATE TABLE events_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id INTEGER NOT NULL,
  team_id INTEGER NOT NULL,
  start_time TEXT,
  end_time TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed')),
  started_by_user_id INTEGER,
  ended_by_user_id INTEGER,
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (started_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (ended_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO events_new (id, station_id, team_id, start_time, end_time, status, started_by_user_id, ended_by_user_id)
SELECT
  id,
  station_id,
  team_id,
  start_time,
  end_time,
  status,
  started_by_user_id,
  ended_by_user_id
FROM events;

DROP TABLE events;
ALTER TABLE events_new RENAME TO events;

CREATE INDEX idx_events_station_id ON events(station_id);
CREATE INDEX idx_events_team_id ON events(team_id);
CREATE INDEX idx_events_status ON events(status);

PRAGMA foreign_keys = ON;
