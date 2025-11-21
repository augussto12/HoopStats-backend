-- ============================================
-- SCHEMA: hoopstats
-- Contiene todas las tablas principales del sistema
-- ============================================

CREATE SCHEMA IF NOT EXISTS hoopstats;

------------------------------------------------
-- 1) Tabla USERS
-- Guarda usuarios del sistema (login)
------------------------------------------------
CREATE TABLE IF NOT EXISTS hoopstats.users (
    id SERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

------------------------------------------------
-- 2) Tabla PLAYERS
-- Jugadores NBA (si luego querés poblarla)
-- Se puede usar para fantasy, precios, etc.
------------------------------------------------
CREATE TABLE IF NOT EXISTS hoopstats.players (
    id INTEGER PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    position TEXT,
    team_id INTEGER,
    price NUMERIC(10,2),
    created_at TIMESTAMP DEFAULT NOW()
);

------------------------------------------------
-- 3) Tabla FANTASY_TEAMS
-- Un equipo fantasy por usuario
------------------------------------------------
CREATE TABLE IF NOT EXISTS hoopstats.fantasy_teams (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES hoopstats.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

------------------------------------------------
-- 4) Tabla FANTASY_PLAYERS
-- Lista de jugadores seleccionados por el equipo fantasy
------------------------------------------------
CREATE TABLE IF NOT EXISTS hoopstats.fantasy_players (
    id SERIAL PRIMARY KEY,
    fantasy_team_id INTEGER NOT NULL REFERENCES hoopstats.fantasy_teams(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES hoopstats.players(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT NOW()
);

------------------------------------------------
-- 5) Tabla FAVORITE_PLAYERS
-- Jugadores marcados como favoritos por el usuario
------------------------------------------------
CREATE TABLE IF NOT EXISTS hoopstats.favorite_players (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES hoopstats.users(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES hoopstats.players(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

------------------------------------------------
-- 6) Tabla TEAM_PRICES
-- Registro de precios por equipo (opcional para tu lógica)
------------------------------------------------
CREATE TABLE IF NOT EXISTS hoopstats.team_prices (
    id SERIAL PRIMARY KEY,
    team_name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

