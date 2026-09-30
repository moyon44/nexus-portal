import { Router, Request, Response } from 'express';
import db from '../db.js';

const router = Router();

// Cache for weather data to avoid excessive API calls
interface CachedWeather {
  data: any;
  timestamp: number;
}

// OpenWeatherMap API response type
interface WeatherResponse {
  main: {
    temp: number;
    humidity: number;
  };
  weather: Array<{
    main: string;
    description: string;
    icon: string;
  }>;
  name: string;
  sys: {
    country: string;
  };
  wind: {
    speed: number;
  };
}

const weatherCache: Map<string, CachedWeather> = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Get weather for configured city
router.get('/', async (req: Request, res: Response) => {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      console.error('OPENWEATHER_API_KEY not configured');
      return res.status(500).json({ error: 'Weather API key not configured' });
    }

    // Get weather city and unit from theme config
    let config = await db('theme_config').first();
    if (!config) {
      return res.status(500).json({ error: 'Theme config not found' });
    }

    const city = config.weather_city || 'Paris';
    const unit = config.weather_unit || 'metric';

    // Check cache
    const cacheKey = `${city}-${unit}`;
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    // Fetch from OpenWeatherMap API
    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.searchParams.append('q', city);
    url.searchParams.append('appid', apiKey);
    url.searchParams.append('units', unit);
    url.searchParams.append('lang', 'fr');

    const response = await fetch(url.toString());

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`Weather city not found: ${city}`);
        return res.status(404).json({ error: `City not found: ${city}` });
      }
      console.error(`OpenWeatherMap API error: ${response.status}`);
      return res.status(response.status).json({ error: 'Failed to fetch weather data' });
    }

    const data = await response.json() as WeatherResponse;

    // Format response
    const formatted = {
      temp: Math.round(data.main.temp),
      description: data.weather[0].main,
      descriptionFr: data.weather[0].description,
      icon: data.weather[0].icon,
      city: data.name,
      country: data.sys.country,
      humidity: data.main.humidity,
      windSpeed: Math.round(data.wind.speed * 10) / 10,
      unit: unit === 'metric' ? '°C' : '°F',
    };

    // Cache the result
    weatherCache.set(cacheKey, {
      data: formatted,
      timestamp: Date.now(),
    });

    res.json(formatted);
  } catch (error) {
    console.error('Weather API error:', error);
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

export default router;
