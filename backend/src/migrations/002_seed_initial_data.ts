import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export async function up(knex: Knex): Promise<void> {
  // Create default theme config
  await knex('theme_config').insert({
    id: uuidv4(),
    mode: 'auto',
    primary_color: '#3b82f6',
    background_type: 'solid',
    background_value: '#ffffff',
    density: 'normal',
    show_clock: true,
    show_weather: true,
    show_descriptions: true,
  });

  // Create default categories
  const categories = [
    { id: uuidv4(), name: 'Infrastructure', color: 'bg-red-500', icon: 'lucide:server', order: 0 },
    { id: uuidv4(), name: 'Development', color: 'bg-blue-500', icon: 'lucide:code', order: 1 },
    { id: uuidv4(), name: 'Media', color: 'bg-purple-500', icon: 'lucide:play', order: 2 },
    { id: uuidv4(), name: 'Home Lab', color: 'bg-green-500', icon: 'lucide:home', order: 3 },
  ];

  await knex('categories').insert(categories);

  // Create default services
  const infrastuctureId = categories.find(c => c.name === 'Infrastructure')?.id;
  const developmentId = categories.find(c => c.name === 'Development')?.id;
  const mediaId = categories.find(c => c.name === 'Media')?.id;
  const homeLabId = categories.find(c => c.name === 'Home Lab')?.id;

  const services = [
    {
      id: uuidv4(),
      name: 'Router',
      description: 'Network router admin panel',
      url: 'http://192.168.1.1',
      category_id: infrastuctureId,
      tags: JSON.stringify(['network', 'admin']),
      icon: 'lucide:router',
      open_in_new_tab: true,
      is_visible: true,
      order: 0,
      status: 'unknown',
    },
    {
      id: uuidv4(),
      name: 'Proxmox',
      description: 'Virtualization platform',
      url: 'https://proxmox.local:8006',
      category_id: infrastuctureId,
      tags: JSON.stringify(['virtualization', 'infrastructure']),
      icon: 'lucide:box',
      open_in_new_tab: true,
      is_visible: true,
      order: 1,
      status: 'unknown',
    },
    {
      id: uuidv4(),
      name: 'Plex',
      description: 'Media server',
      url: 'http://plex.local:32400',
      category_id: mediaId,
      tags: JSON.stringify(['media', 'streaming']),
      icon: 'lucide:play-square',
      open_in_new_tab: true,
      is_visible: true,
      order: 0,
      status: 'unknown',
    },
    {
      id: uuidv4(),
      name: 'GitLab',
      description: 'Git repository and CI/CD',
      url: 'https://gitlab.local',
      category_id: developmentId,
      tags: JSON.stringify(['git', 'ci/cd', 'development']),
      icon: 'lucide:git-branch',
      open_in_new_tab: true,
      is_visible: true,
      order: 0,
      status: 'unknown',
    },
    {
      id: uuidv4(),
      name: 'Home Assistant',
      description: 'Home automation hub',
      url: 'http://homeassistant.local:8123',
      category_id: homeLabId,
      tags: JSON.stringify(['automation', 'iot']),
      icon: 'lucide:home',
      open_in_new_tab: true,
      is_visible: true,
      order: 0,
      status: 'unknown',
    },
  ];

  await knex('services').insert(services);
}

export async function down(knex: Knex): Promise<void> {
  // Clear data
  await knex('services').del();
  await knex('categories').del();
  await knex('theme_config').del();
}
