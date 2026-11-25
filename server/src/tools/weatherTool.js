import { z } from 'zod';

export const weatherInputSchema = z.object({
  location: z.string().trim().min(2, 'Location name is required for weather verification.'),
  event_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'event_date must be in YYYY-MM-DD format.')
    .optional()
    .nullable(),
});

const WMO_CODES = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow fall',
  73: 'Moderate snow fall',
  75: 'Heavy snow fall',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

const AMBIGUOUS_LOCATIONS = new Set(['tbd', 'unknown', 'n/a', 'na', 'anywhere', 'none', 'to be decided', 'campus']);

function daysDifference(targetDateStr, nowDate = new Date()) {
  const todayUtc = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
  const [y, m, d] = targetDateStr.split('-').map(Number);
  const targetUtc = Date.UTC(y, m - 1, d);
  return Math.round((targetUtc - todayUtc) / (1000 * 60 * 60 * 24));
}

export async function runWeatherTool(rawInput, context = {}) {
  const fetchFn = context.fetchImpl || globalThis.fetch;
  const nowDate = context.nowDate || new Date();

  const parsed = weatherInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      tool: 'weather_forecast',
      errorCode: 'INVALID_INPUT',
      requiresUserInput: true,
      missingField: 'location',
      message: parsed.error.issues.map((i) => i.message).join(' '),
    };
  }

  const { location, event_date } = parsed.data;
  if (AMBIGUOUS_LOCATIONS.has(location.toLowerCase())) {
    return {
      ok: false,
      tool: 'weather_forecast',
      errorCode: 'UNCLEAR_LOCATION',
      requiresUserInput: true,
      missingField: 'location',
      message: `Location "${location}" is too vague to query weather. Please provide a specific city or venue location.`,
    };
  }

  // Validate date range before external forecast call when a date is supplied
  if (event_date) {
    const diffDays = daysDifference(event_date, nowDate);
    if (diffDays < -1) {
      return {
        ok: false,
        tool: 'weather_forecast',
        errorCode: 'DATE_IN_PAST',
        requiresUserInput: true,
        missingField: 'event_date',
        message: `Event date ${event_date} is in the past. Please confirm the upcoming event date.`,
      };
    }
    if (diffDays > 15) {
      return {
        ok: false,
        tool: 'weather_forecast',
        errorCode: 'FORECAST_OUT_OF_RANGE',
        requiresUserInput: false,
        message: `Forecast for ${event_date} (${diffDays} days ahead) is unavailable because Open-Meteo supports forecasts up to 16 days ahead. Please check again closer to the event date.`,
        data: {
          locationQuery: location,
          eventDate: event_date,
          daysAhead: diffDays,
          forecastAvailable: false,
        },
      };
    }
  }

  try {
    // Step 1: Geocode the location using Open-Meteo Geocoding API
    const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search');
    geoUrl.searchParams.set('name', location);
    geoUrl.searchParams.set('count', '1');
    geoUrl.searchParams.set('language', 'en');
    geoUrl.searchParams.set('format', 'json');

    const geoRes = await fetchFn(geoUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!geoRes.ok) {
      return {
        ok: false,
        tool: 'weather_forecast',
        errorCode: 'GEOCODING_API_ERROR',
        message: `Open-Meteo geocoding API returned HTTP ${geoRes.status}.`,
      };
    }

    const geoJson = await geoRes.json();
    const place = Array.isArray(geoJson?.results) ? geoJson.results[0] : null;
    if (!place || typeof place.latitude !== 'number' || typeof place.longitude !== 'number') {
      return {
        ok: false,
        tool: 'weather_forecast',
        errorCode: 'LOCATION_NOT_FOUND',
        requiresUserInput: true,
        missingField: 'location',
        message: `Could not find coordinates for "${location}". Please clarify the city or nearby town.`,
      };
    }

    // Step 2: Query Open-Meteo Forecast API
    const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast');
    forecastUrl.searchParams.set('latitude', String(place.latitude));
    forecastUrl.searchParams.set('longitude', String(place.longitude));
    forecastUrl.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max'
    );
    forecastUrl.searchParams.set('timezone', place.timezone || 'auto');
    if (event_date) {
      forecastUrl.searchParams.set('start_date', event_date);
      forecastUrl.searchParams.set('end_date', event_date);
    } else {
      forecastUrl.searchParams.set('forecast_days', '7');
    }

    const forecastRes = await fetchFn(forecastUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!forecastRes.ok) {
      return {
        ok: false,
        tool: 'weather_forecast',
        errorCode: 'FORECAST_API_ERROR',
        message: `Open-Meteo forecast API returned HTTP ${forecastRes.status}.`,
      };
    }

    const forecastJson = await forecastRes.json();
    const daily = forecastJson?.daily;
    if (!daily || !Array.isArray(daily.time) || daily.time.length === 0) {
      return {
        ok: false,
        tool: 'weather_forecast',
        errorCode: 'EMPTY_FORECAST',
        message: 'Open-Meteo returned no daily forecast entries for the requested parameters.',
      };
    }

    const idx = event_date ? Math.max(0, daily.time.indexOf(event_date)) : 0;
    const targetDate = daily.time[idx];
    const weatherCode = Number(daily.weather_code?.[idx] ?? -1);
    const tempMax = Number(daily.temperature_2m_max?.[idx]);
    const tempMin = Number(daily.temperature_2m_min?.[idx]);
    const precipProb = Number(daily.precipitation_probability_max?.[idx] ?? 0);
    const precipSum = Number(daily.precipitation_sum?.[idx] ?? 0);
    const windMax = Number(daily.wind_speed_10m_max?.[idx] ?? 0);
    const condition = WMO_CODES[weatherCode] || `WMO code ${weatherCode}`;

    const isRainRisk = precipProb >= 40 || precipSum >= 2 || [61, 63, 65, 80, 81, 82, 95, 96, 99].includes(weatherCode);
    const isHeatRisk = Number.isFinite(tempMax) && tempMax >= 36;
    const isWindRisk = windMax >= 35;

    let outdoorRisk = 'low';
    if (precipProb >= 60 || [65, 82, 95, 96, 99].includes(weatherCode) || windMax >= 45) {
      outdoorRisk = 'high';
    } else if (isRainRisk || isHeatRisk || isWindRisk) {
      outdoorRisk = 'moderate';
    }

    const recommendations = [];
    if (isRainRisk) {
      recommendations.push('Reserve an indoor auditorium or waterproof marquee tent as a rain contingency.');
    }
    if (isHeatRisk) {
      recommendations.push('Provide shaded seating, hydration stations, and avoid peak midday outdoor slots.');
    }
    if (isWindRisk) {
      recommendations.push('Secure stage backdrops, banners, and sound trusses against strong gusts.');
    }
    if (recommendations.length === 0) {
      recommendations.push('Forecast conditions appear favorable for outdoor setup; maintain standard sun/water prep.');
    }

    return {
      ok: true,
      tool: 'weather_forecast',
      source: 'Open-Meteo Live API',
      data: {
        resolvedLocation: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
        coordinates: { latitude: place.latitude, longitude: place.longitude },
        timezone: forecastJson.timezone || place.timezone || 'UTC',
        forecastDate: targetDate,
        condition,
        weatherCode,
        temperatureMaxC: Number.isFinite(tempMax) ? tempMax : null,
        temperatureMinC: Number.isFinite(tempMin) ? tempMin : null,
        precipitationProbabilityPct: precipProb,
        precipitationSumMm: precipSum,
        windSpeedMaxKmh: windMax,
        outdoorRisk,
        contingencyRequired: outdoorRisk !== 'low',
        recommendations,
      },
    };
  } catch (error) {
    return {
      ok: false,
      tool: 'weather_forecast',
      errorCode: 'WEATHER_NETWORK_OR_TIMEOUT',
      message: `Weather API request failed: ${error.message}`,
    };
  }
}
