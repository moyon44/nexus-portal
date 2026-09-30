import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const router = Router();

// Get theme config
router.get('/', async (req: Request, res: Response) => {
  try {
    let config = await db('theme_config').first();
    if (!config) {
      // Create default config if none exists
      const id = uuidv4();
      const defaultConfig = {
        id,
        mode: 'auto',
        primary_color: '#3b82f6',
        background_type: 'solid',
        background_value: '#ffffff',
        density: 'normal',
        show_clock: true,
        show_weather: true,
        show_descriptions: true,
        show_system_stats: true,
        system_stats_position: 'top-right',
        weather_city: 'Paris',
        weather_unit: 'metric',
      };
      await db('theme_config').insert(defaultConfig);
      config = defaultConfig;
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch theme config' });
  }
});

/** Must match theme/skins.ts in the frontend. */
const SKINS = ['default', 'paper', 'terminal', 'glass', 'blueprint', 'brutal', 'synthwave', 'win98', 'clay'];

// Update theme config
router.put('/', async (req: Request, res: Response) => {
  try {
    const { mode, primary_color, background_type, background_value, density, show_clock, show_weather, show_descriptions, show_system_stats, system_stats_position, system_stats_custom_position, weather_city, weather_unit, user_name, ssh_target, skin } = req.body;

    let config = await db('theme_config').first();
    if (!config) {
      const id = uuidv4();
      config = {
        id,
        mode: 'auto',
        primary_color: '#3b82f6',
        background_type: 'solid',
        background_value: '#ffffff',
        density: 'normal',
        show_clock: true,
        show_weather: true,
        show_descriptions: true,
        show_system_stats: true,
        system_stats_position: 'top-right',
        weather_city: 'Paris',
        weather_unit: 'metric',
      };
      await db('theme_config').insert(config);
    }

    const oldConfig = { ...config };

    const updateData = {
      mode,
      primary_color,
      background_type,
      background_value,
      density,
      show_clock,
      show_weather,
      show_descriptions,
      show_system_stats,
      system_stats_position,
      system_stats_custom_position: system_stats_custom_position ? JSON.stringify(system_stats_custom_position) : null,
      weather_city,
      weather_unit,
      user_name: typeof user_name === 'string' ? user_name.trim().slice(0, 64) : undefined,
      ssh_target: typeof ssh_target === 'string' ? ssh_target.trim().slice(0, 255) : undefined,
      skin: typeof skin === 'string' && (SKINS.includes(skin) || /^custom:[0-9a-f-]{36}$/.test(skin)) ? skin : undefined,
      updated_at: new Date(),
    };

    Object.keys(updateData).forEach(key => updateData[key as keyof typeof updateData] === undefined && delete updateData[key as keyof typeof updateData]);

    await db('theme_config').update(updateData);

    // Log audit
    await db('audit_logs').insert({
      id: uuidv4(),
      action: 'UPDATE',
      entity_type: 'THEME_CONFIG',
      entity_id: config.id,
      old_values: oldConfig,
      new_values: updateData,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json(updateData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update theme config' });
  }
});

export default router;
