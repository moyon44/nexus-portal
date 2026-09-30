import { useState } from 'react';
import type { Service } from '../types';
import { IconRenderer } from './IconRenderer';
import { dashboardIconUrl, useIconIndex } from '../lib/icons';
import { cx } from '../utils/cx';

/**
 * A link's icon, best source first:
 *  1. the app's official logo from dashboard-icons (by `di:<slug>` or name),
 *  2. the site's own icon when one was saved (custom image, usually the
 *     favicon found by the quick-add), on a light chip so dark favicons stay
 *     visible in dark mode,
 *  3. the Iconify icon.
 * Each image source falls through to the next one if it fails to load.
 */
export function LinkIcon({
  service,
  size,
  className,
}: {
  service: Pick<Service, 'icon' | 'customImage'> & { name?: string };
  size: number;
  className?: string;
}) {
  const idx = useIconIndex();
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const logo = service.name ? dashboardIconUrl({ name: service.name, icon: service.icon }, idx) : null;
  const fail = (src: string) => setFailed(prev => new Set(prev).add(src));

  if (logo && !failed.has(logo)) {
    return (
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => fail(logo)}
        className={cx('shrink-0 object-contain', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  const img = service.customImage && !failed.has(service.customImage) ? service.customImage : null;
  if (img) {
    return (
      <img
        src={img}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => fail(img)}
        className={cx('shrink-0 rounded-[4px] bg-control-indicator-background object-contain p-px', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  const name = service.icon?.startsWith('di:') ? 'lucide:link' : service.icon || 'lucide:link';
  return <IconRenderer name={name} size={size} className={cx('shrink-0', className)} />;
}
