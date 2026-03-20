import { NextResponse } from "next/server";
import {
  createWakeupSong,
  deleteWakeupSong,
  listWakeupSongs,
} from "@/lib/wakeupSongsStore";

export const runtime = "nodejs";

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(input) {
  const raw = safeTrim(input);
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    const iso = parsed.toISOString().slice(0, 10);
    return iso === raw ? raw : null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function getConfiguredUsername() {
  return safeTrim(process.env.SONGS_API_USERNAME);
}

function getConfiguredPassword() {
  return safeTrim(process.env.SONGS_API_PASSWORD);
}

function validateSongFields({ title, artist, date }) {
  if (!title) return "Song title is required.";
  if (!artist) return "Artist is required.";
  if (!date) return "Date is required.";
  if (title.length > 200) return "Song title must be 200 characters or fewer.";
  if (artist.length > 200) return "Artist must be 200 characters or fewer.";
  return "";
}

function normalizeOptionalId(value, maxLen = 120) {
  const trimmed = safeTrim(value);
  if (!trimmed) return null;
  return trimmed.length <= maxLen ? trimmed : null;
}

function parseSongId(input) {
  const value = Number(input);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

export async function GET() {
  try {
    const items = await listWakeupSongs();

    return NextResponse.json(
      { items },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to load songs.", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const username = safeTrim(body.username);
    const password = safeTrim(body.password);
    const title = safeTrim(body.title ?? body.songTitle);
    const artist = safeTrim(body.artist);
    const date = normalizeDate(body.date ?? body.songDate);
    const spotifyTrackId = normalizeOptionalId(
      body.spotifyTrackId ?? body.spotify_song_id,
    );
    const spotifyArtistId = normalizeOptionalId(
      body.spotifyArtistId ?? body.spotify_artist_id,
    );

    const fieldError = validateSongFields({ title, artist, date });
    if (fieldError) {
      return NextResponse.json({ error: fieldError }, { status: 400 });
    }

    const configuredUsername = getConfiguredUsername();
    const configuredPassword = getConfiguredPassword();
    if (!configuredUsername || !configuredPassword) {
      return NextResponse.json(
        {
          error:
            "Songs credentials are not configured. Set SONGS_API_USERNAME and SONGS_API_PASSWORD.",
        },
        { status: 500 },
      );
    }

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 401 },
      );
    }

    if (username !== configuredUsername || password !== configuredPassword) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const item = await createWakeupSong({
      title,
      artist,
      date,
      spotifyTrackId,
      spotifyArtistId,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to save song.", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}

export async function DELETE(req) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const id = parseSongId(body.id);
    const username = safeTrim(body.username);
    const password = safeTrim(body.password);

    if (!id) {
      return NextResponse.json({ error: "Valid song id is required." }, { status: 400 });
    }

    const apiUsername = safeTrim(process.env.SONGS_API_USERNAME);
    const apiPassword = safeTrim(process.env.SONGS_API_PASSWORD);
    if (!apiUsername || !apiPassword) {
      return NextResponse.json(
        {
          error:
            "Delete credentials are not configured. Set SONGS_API_USERNAME and SONGS_API_PASSWORD.",
        },
        { status: 500 },
      );
    }

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 401 },
      );
    }

    if (username !== apiUsername || password !== apiPassword) {
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }

    const deleted = await deleteWakeupSong(id);
    if (!deleted) {
      return NextResponse.json({ error: "Song not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to delete song.", detail: err?.message || String(err) },
      { status: 500 },
    );
  }
}
